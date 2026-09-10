"""Public data ingestion and weekly shadow-state preparation, NOT the lock job.

Separates schedule identities from labels before the capture/lock worker sees it.
Prior-week results and passer stats are used only here for shadow state.
"""
import csv
import gzip
import datetime as dt
import io
import json
import urllib.request
from collections import defaultdict, deque
from pathlib import Path
from zoneinfo import ZoneInfo
from engine.elo import Elo
from engine.harvest import canonical
from engine.pick_store import pin, put, sha, read_pinned
from engine.qb_history import ratio

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'work/model-pick-v1'
SCHEDULE_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
TEAMS = dict(zip('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(),
    ['Arizona Cardinals','Atlanta Falcons','Baltimore Ravens','Buffalo Bills','Carolina Panthers','Chicago Bears','Cincinnati Bengals','Cleveland Browns','Dallas Cowboys','Denver Broncos','Detroit Lions','Green Bay Packers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars','Kansas City Chiefs','Los Angeles Rams','Los Angeles Chargers','Las Vegas Raiders','Miami Dolphins','Minnesota Vikings','New England Patriots','New Orleans Saints','New York Giants','New York Jets','Philadelphia Eagles','Pittsburgh Steelers','Seattle Seahawks','San Francisco 49ers','Tampa Bay Buccaneers','Tennessee Titans','Washington Commanders']))


def fetch(url, folder, suffix='.csv'):
    requested = dt.datetime.now(dt.timezone.utc).isoformat()
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read()
    stored = gzip.compress(raw, mtime=0) if suffix=='.csv' and len(raw)>5_000_000 else raw
    ref = pin(folder, stored, suffix+('.gz' if stored is not raw else ''), True)
    ref.update(raw_sha256=sha(raw), encoding='gzip' if stored is not raw else 'identity')
    return raw, {**ref, 'url': url, 'request_at': requested, 'received_at': dt.datetime.now(dt.timezone.utc).isoformat()}


def rows(raw):
    return list(csv.DictReader(io.StringIO(raw.decode())))


def schedule(games):
    venues_ref = json.loads((ROOT/'work/t60-weather-v1/venues-manifest.json').read_text())
    raw = (ROOT/venues_ref['table']).read_bytes()
    if sha(raw) != venues_ref['sha256']:
        raise ValueError('Venue source changed')
    overrides = {v['game_id']:v for v in rows(raw)}
    coords = {r['stadium_id']:r for r in rows((ROOT/venues_ref['coordinate_source']).read_bytes())}
    groups = {}
    for r in games:
        if r['season'] != '2026' or r['game_type'] != 'REG' or not r['gametime']:
            continue
        kickoff = dt.datetime.fromisoformat(r['gameday']+'T'+r['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc)
        capture = kickoff-dt.timedelta(minutes=80); cutoff=kickoff-dt.timedelta(minutes=75)
        identity = kickoff.strftime('%Y%m%dT%H%MZ')
        group = groups.setdefault(identity, {'id':identity,'season':2026,'week':int(r['week']),
             'kickoff_at':kickoff.isoformat(),'capture_at':capture.isoformat(),'cutoff_at':cutoff.isoformat(),'games':[]})
        c = coords.get(r['stadium_id'], {})
        v = overrides.get(r['game_id'], {})
        group['games'].append({'game_id':r['game_id'],'season':2026,'week':int(r['week']),
             'home_team':TEAMS[r['home_team']],'away_team':TEAMS[r['away_team']],
             'home_abbr':r['home_team'],'away_abbr':r['away_team'], 'espn_id':r['espn'],
             'neutral':r['location']=='Neutral','stadium_id':r['stadium_id'],
             'roof':v.get('roof',r['roof']), 'latitude':v.get('latitude',c.get('lat')),
             'longitude':v.get('longitude',c.get('lon')), 'venue_source_sha256':venues_ref['sha256'],
             'kickoff_at':kickoff.isoformat(),'capture_at':capture.isoformat(),'cutoff_at':cutoff.isoformat()})
    return {'groups': sorted(groups.values(), key=lambda g:g['kickoff_at']), 'venue_reference':venues_ref}


def elo_state(games, season, week, stats):
    initial=rows((ROOT/'work/harvest-elo-v1/sources/538-initial_elos.csv').read_bytes())
    model=Elo({r['team']:float(r['elo']) for r in initial})
    for r in rows((ROOT/'work/harvest-elo-v1/sources/538-nfl_games.csv').read_bytes()):
        year=int(r['season'])
        if year>=2015:continue
        h,a=r['team1'],r['team2'];model.prepare(h,year);model.prepare(a,year)
        p=model.forecast(h,a,r['neutral']=='1',0.,0.);model.update(h,a,float(r['score1']),float(r['score2']),p)
    groups=defaultdict(list)
    for r in games:
        origin=(int(r['season']),int(r['week']))
        if (2015,1)<=origin<(season,week) and r['home_score'] and r['away_score']:
            groups[origin].append(r)
    for (year,w),batch in sorted(groups.items()):
        pending=[]
        for r in sorted(batch,key=lambda g:g['game_id']):
            h,a=canonical(r['home_team']),canonical(r['away_team'])
            model.prepare(h,year);model.prepare(a,year)
            pending.append((r,h,a,model.forecast(h,a,r['location']=='Neutral',0.,0.)))
        for r,h,a,p in pending:
            model.update(h,a,float(r['home_score']),float(r['away_score']),p)
    for team in list(model.teams): model.prepare(team,season)
    qb=defaultdict(lambda:deque(maxlen=10));team=defaultdict(lambda:deque(maxlen=10));league=deque(maxlen=256)
    by_game=defaultdict(list)
    last_stats=None
    for r in sorted(stats,key=lambda r:(int(r['season']),int(r['week']),r['game_id'],r['qb_id'])):
        origin=(int(r['season']),int(r['week']))
        if origin>=(season,week):continue
        last_stats=max(origin,last_stats or origin)
        num,den=float(r['numerator']),float(r['denominator'])
        qb[r['qb_id']].append((num,den));by_game[(origin,r['game_id'],canonical(r['posteam']))].append((num,den))
    for (_,_,t),values in sorted(by_game.items()):
        pair=(sum(x[0] for x in values),sum(x[1] for x in values));team[t].append(pair);league.append(pair)
    return {'season':season,'week':week,'training_max_origin':list(max(groups)) if groups else None,
            'teams':model.teams,'qb_anya':{k:ratio(v) for k,v in qb.items()},
            'team_anya':{k:ratio(v) for k,v in team.items()},'league_anya':ratio(league),
            'passer_data_max_origin':list(last_stats) if last_stats else None,
            'method':'538 defaults; weekly batch updates; ANY/A proxy 25 Elo/unit; prior weeks only'}


def prepare():
    current=dt.datetime.now(dt.timezone.utc)
    day=BASE/'daily'/current.date().isoformat()
    if (day/'complete.json').exists():return json.loads((day/'complete.json').read_text())
    raw,source=fetch(SCHEDULE_URL,BASE/'sources')
    games=rows(raw);plan=schedule(games)
    ref=pin(BASE/'schedules',plan)
    day=BASE/'daily'/current.date().isoformat()
    put(day/'schedule-ref.json',ref)
    put(day/'schedule-source.json',source)
    stats=rows((ROOT/'work/harvest-elo-v2/qb/passer-game-stats.csv').read_bytes())
    # Refresh season PBP only in preparation, never from lock/capture/scoring.
    pbp_status={'status':'NOT_NEEDED_WEEK1'}
    completed=[r for r in games if r['season']=='2026' and r['game_type']=='REG' and r['home_score'] and r['away_score']]
    if completed:
        try:
            import pyarrow.parquet as pq
            from engine.qb_history import aggregate,COLUMNS
            body,pbp_ref=fetch('https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.parquet',BASE/'sources','.parquet')
            fresh,missing=aggregate(pq.read_table(io.BytesIO(body),columns=COLUMNS).to_pandas());stats.extend(fresh)
            pbp_status={'status':'AVAILABLE','source':pbp_ref,'unknown_passer_plays':missing}
        except Exception as exc:pbp_status={'status':'UNAVAILABLE','error':type(exc).__name__}
    future=[g for g in plan['groups'] if g['kickoff_at']>current.isoformat()]
    origins=sorted({(g['season'],g['week']) for g in future})[:2]
    for season,week in origins:
        state=elo_state(games,season,week,stats);state['pbp_status']=pbp_status
        state['schedule_source']=source;state['historical_passer_sha256']=sha((ROOT/'work/harvest-elo-v2/qb/passer-game-stats.csv').read_bytes())
        put(day/f'state-{season}-{week}.json',pin(BASE/'states',state))
    try:
        body,depthref=fetch('https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_2026.csv',BASE/'sources')
        depthrows=rows(body)
        latest_dt={}
        for r in depthrows:latest_dt[r['team']]=max(latest_dt.get(r['team'],''),r['dt'])
        selected=[r for r in depthrows if r['dt']==latest_dt[r['team']]]
        stream=io.StringIO();writer=csv.DictWriter(stream,fieldnames=list(selected[0]));writer.writeheader();writer.writerows(selected)
        trimmed=pin(BASE/'depth',stream.getvalue().encode(),'.csv',True)
        put(day/'depth-ref.json',{**trimmed,'source':depthref})
    except Exception as exc:put(day/'depth-unavailable.json',{'error':type(exc).__name__})
    result={'schedule':ref,'groups':len(plan['groups']),'date':current.date().isoformat()}
    put(day/'complete.json',result)
    return result

if __name__=='__main__':
    print(json.dumps(prepare()))
