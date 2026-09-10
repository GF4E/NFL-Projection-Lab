"""Shadow-only public inactives and prior-week state. Never supplies live EV."""
import csv
import datetime as dt
import io
import json
import urllib.request
from pathlib import Path
from engine.pick_store import put, sha, read_pinned
from engine.pricing import timestamp
from engine.harvest import canonical
from engine.model_pick import evaluate, quotes


def inactive_teams(payload, game, depth_rows, fetched_at):
    result = {}
    for abbr in (game['home_abbr'],game['away_abbr']):
        entries = [r for r in depth_rows if r['team'] == abbr and timestamp(r['dt']) <= timestamp(fetched_at)]
        latest = max((r['dt'] for r in entries),default=None)
        # Stale offseason depth charts do not establish current starters.
        if latest and (timestamp(fetched_at)-timestamp(latest)).total_seconds()>7*86400:
            entries=[]
        entries = [r for r in entries if r['dt']==latest and r['pos_rank']=='1']
        starters={r['espn_id']:r for r in entries}
        qb=[r for r in entries if r['pos_abb']=='QB']
        qbids={r['espn_id'] for r in qb}
        team=next((t for t in payload if canonical(t.get('team',{}).get('abbreviation',''))==canonical(abbr)),None)
        athletes=team.get('athletes') if team else None
        # A list is considered complete only when ESPN's dedicated inactives
        # collection exists; an injury report's Out status is never substituted.
        known=isinstance(athletes,list) and bool(athletes)
        ids={str(a.get('id',a.get('athlete',{}).get('id',''))) for a in athletes} if known else set()
        valid=known and all(ids) and bool(starters)
        result[abbr]={'starting_qb_inactive':('yes' if qbids & ids else 'no') if valid and len(qbids)==1 else 'unknown',
                      'listed_starters_inactive':len(set(starters)&ids) if valid else None,
                      'starting_qb_gsis':qb[0]['gsis_id'] if len(qbids)==1 else None,
                      'depth_timestamp':latest,'depth_status':'AVAILABLE' if starters else 'UNAVAILABLE_OR_STALE',
                      'fetch_status':'AVAILABLE' if known else 'INACTIVES_UNAVAILABLE'}
    return result


def pull_inactives(game, folder, depth_ref=None):
    current=dt.datetime.now(dt.timezone.utc)
    start=timestamp(game['kickoff_at'])-dt.timedelta(minutes=90)
    if not start<=current<=timestamp(game['capture_at']):
        raise ValueError('Inactives fetch outside T90-T80')
    url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+game['espn_id']
    record={'source':url,'fetch_time':current.isoformat(),'status':'INACTIVES_UNAVAILABLE','raw_list':None}
    payload=[];depth=[]
    try:
        raw=urllib.request.urlopen(url,timeout=12).read();data=json.loads(raw)
        dedicated=data.get('inactives')
        if isinstance(dedicated,list):
            payload=dedicated;record.update(raw_list=dedicated,status='AVAILABLE' if dedicated else 'INACTIVES_UNAVAILABLE')
        record.update(response_sha256=sha(raw),received_at=dt.datetime.now(dt.timezone.utc).isoformat(),
                      source_note='Only dedicated inactives collection accepted; summary injuries and missing names do not establish active status')
    except Exception as exc:record['error']=type(exc).__name__
    if depth_ref:
        raw=Path(depth_ref['path']).read_bytes()
        if sha(raw)!=depth_ref['sha256']:raise ValueError('Depth hash mismatch')
        depth=list(csv.DictReader(io.StringIO(raw.decode())));record['depth_source']=depth_ref
    record['teams']=inactive_teams(payload,game,depth,record['fetch_time'])
    put(Path(folder)/'inactives.json',record)
    return record


def build_shadow(game, event, receipt, shape, config, centers, state_ref, inactive, weather):
    """Return provenance and frozen counterfactual choices, never mutate actuals."""
    import copy
    book_quotes=quotes(event,receipt,shape)
    shadow={'coefficients_sha256':config['coefficients_sha256'],'elo_state_sha256':state_ref['sha256'] if state_ref else None,
            'inactives':inactive,'weather':weather,'adjustments':{}}
    coefficients=config['coefficients']
    c=coefficients['elo_c'];home=game['home_abbr'];away=game['away_abbr']
    elo_margin=None
    if state_ref:
        state=read_pinned(state_ref)
        origin=(state['season'],state['week'])
        if origin!=(game['season'],game['week']) or (state['training_max_origin'] and tuple(state['training_max_origin'])>=origin):
            raise ValueError('Shadow chronology violation')
        t=inactive.get('teams',{});adjustments=[]
        for team in (home,away):
            entry=t.get(team,{})
            starter=entry.get('starting_qb_gsis')
            qb=state['qb_anya'].get(starter);team_value=state['team_anya'].get(canonical(team))
            data_current=game['week']==1 or (state.get('passer_data_max_origin') and tuple(state['passer_data_max_origin'])>=(game['season'],game['week']-1))
            if not starter or entry.get('starting_qb_inactive')=='yes' or not data_current or team_value is None:
                adjustments.append(None)
            else:
                # Untuned rookie prior carried from harvest two's ANY/A proxy.
                value=qb if qb is not None else state['league_anya']
                adjustments.append(25*(value-team_value) if value is not None else None)
        if all(a is not None for a in adjustments) and all(canonical(t) in state['teams'] for t in (home,away)):
            elo_margin=(state['teams'][canonical(home)]['elo']-state['teams'][canonical(away)]['elo']+(0 if game['neutral'] else 65)+adjustments[0]-adjustments[1])/25
    shadow['adjustments']['elo_anya']={'status':'AVAILABLE' if elo_margin is not None else 'UNAVAILABLE_QB_INPUT','raw_margin':elo_margin,'coefficient':c}
    wind_delta=None
    if game['roof'] in ('dome','closed'):
        wind_delta=coefficients['dome']
    elif weather.get('qualified_T75'):
        wind_delta=coefficients['wind']*weather['wind_mph']
    shadow['adjustments']['wind_dome']={'status':'AVAILABLE' if wind_delta is not None else 'UNAVAILABLE_FORECAST_OR_ROOF','delta':wind_delta}
    for name,info in shadow['adjustments'].items():
        if info['status']!='AVAILABLE':continue
        counter=copy.deepcopy(centers)
        target='spreads' if name=='elo_anya' else 'totals'
        for value in counter[target]['leave_one_out'].values():
            if value['center'] is not None:
                value['center'] += c*(elo_margin-value['center']) if target=='spreads' else wind_delta
        info['counterfactual_pick']=evaluate(shape,game,book_quotes,counter,config['version'])[target]
        info['counterfactual_pick']['shadow']=name
    return shadow
