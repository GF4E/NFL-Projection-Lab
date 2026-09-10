"""Mac/cloud-portable T80 scheduler; quote-only lock worker, no final feeds.

Preparation and daily scoring run as separate processes/launchd jobs. Existing
T60 archives are never opened or rewritten. No provider calls outside T80.
"""
import datetime as dt
import fcntl
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.pick_store import put, read_pinned, sha
from engine.model_pick import lock, quotes, probabilities
from engine.t75_shadow import build_shadow, pull_inactives
from engine.pricing import timestamp, decimal_odds, price_edge

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'work/model-pick-v1'
OUT=ROOT/'outputs/model-pick-v1'


def now():return dt.datetime.now(dt.timezone.utc)


def latest(name):
    current=now()
    for folder in sorted((BASE/'daily').glob('*'), reverse=True):
        path=folder/name
        if path.exists() and (current.date()-dt.date.fromisoformat(folder.name)).days<=1:
            return json.loads(path.read_text())
    return None


def forecast_game(game, folder):
    from engine.live_weather import capture
    record={'status':'INDOOR_OR_ROOF_UNKNOWN','roof':game['roof'],'qualified_T75':False}
    if game['roof'] in ('outdoors','open') and game.get('latitude') and game.get('longitude'):
        try:
            v={**game,'event_id':game['game_id']}
            record=capture(v,folder/'weather')
            record['venue_source_sha256']=game['venue_source_sha256']
            record.pop('venue_manifest_sha256',None)
            record['qualified_T75']=forecast_qualified(record,game)
        except Exception as exc:record={'status':'UNAVAILABLE','error':type(exc).__name__,'qualified_T75':False}
    put(folder/'forecast.json',record)
    return record


def forecast_qualified(record, game):
    try:
        return (record['status']=='FORECAST' and
            timestamp(record['forecast_run_initialized_at'])<=timestamp(record['forecast_issued_at'])<=timestamp(record['request_at'])<=timestamp(record['received_at'])<=timestamp(game['cutoff_at']) and
            timestamp(game['capture_at'])<=timestamp(record['request_at'])<timestamp(game['capture_at'])+dt.timedelta(minutes=1) and
            timestamp(record['valid_at'])==timestamp(game['kickoff_at']).replace(minute=0,second=0,microsecond=0))
    except (KeyError,TypeError,ValueError):return False


def paper_pick(record, shape, event, receipt):
    game=record['game'];weather=record['shadows']['weather']
    if game['week']>4 or not weather.get('qualified_T75') or not 10<=weather['wind_mph']<15:return []
    c=record['consensus']['totals']['full']
    # Registered rule requires independent retail coverage and exact fair total.
    if c['coverage']<2 or c['center'] is None:return []
    qs=quotes(event,receipt,shape);candidates=[]
    for (book,market),q in qs.items():
        if book=='pinnacle' or market!='totals':continue
        for offer in q['outcomes']:
            if offer['side']!='Under' or offer['line']!=c['center']:continue
            pr=probabilities(shape,market,c['center'],offer,game['home_team']);p=pr['conditional_win']
            if p is None or not 0<p<1:continue
            candidates.append({**offer,**pr,'market':market,'book':book,'fair_probability':p,'EV':pr['win']*(decimal_odds(offer['price'])-1)-pr['loss'],
                'paper_rule':'WIND-UNDER-10-15-V1-T75','edge_source':'paper_rule','filtered_subset':False,
                'price_edge_cents':price_edge(p,offer['price'])})
    return sorted(candidates,key=lambda p:(-decimal_odds(p['price']),p['book']))[:1]


def freeze_game(game, folder, shape, config, event, receipt, state_ref=None, current=None):
    destination=folder/'T75-picks.json'
    if destination.exists():return json.loads(destination.read_text())
    frozen=(current or now()).isoformat()
    record=lock(game,event,receipt,shape,config,frozen)
    record['config_sha256']=sha((BASE/'runtime-config.json').read_bytes())
    if record['status']=='LOCKED':
        inactive=json.loads((folder/'inactives.json').read_text()) if (folder/'inactives.json').exists() else {'status':'INACTIVES_UNAVAILABLE','teams':{}}
        weather=json.loads((folder/'forecast.json').read_text()) if (folder/'forecast.json').exists() else {'status':'UNAVAILABLE','qualified_T75':False}
        if weather.get('qualified_T75'):
            weather['qualified_T75']=forecast_qualified(weather,game) and timestamp(weather['received_at'])<=timestamp(frozen)
            for r in weather.get('requests',[]):
                path=folder/'weather/sources'/(r['sha256']+'.json')
                if not path.exists() or sha(path.read_bytes())!=r['sha256']:weather['qualified_T75']=False
        try:
            record['shadows']=build_shadow(game,event,receipt,shape,config,record['consensus'],state_ref,inactive,weather)
        except Exception as exc:
            record['shadows']={'status':'UNAVAILABLE','error':type(exc).__name__,'weather':weather,'inactives':inactive,'adjustments':{}}
        record['coefficients_sha256']=config['coefficients_sha256']
        record['elo_state_sha256']=state_ref['sha256'] if state_ref else None
        record['paper_picks']=paper_pick(record,shape,event,receipt)
    # Real wall clock is checked after all work; never stamp an early time after
    # a slow calculation. Test clock is explicit and never used by the scheduler.
    actual=current or now()
    if actual>timestamp(game['cutoff_at']) and record['status']=='LOCKED':
        record=lock(game,event,receipt,shape,config,actual.isoformat())
    else:record['freeze_timestamp']=actual.isoformat()
    put(destination,record)
    return record


def run():
    OUT.mkdir(parents=True,exist_ok=True)
    with (OUT/'scheduler.lock').open('a+') as f:
        try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'state':'LOCAL_LOCK_HELD'}
        current=now();heartbeat=OUT/'heartbeat.json';hour=current.strftime('%Y-%m-%dT%H')
        last=json.loads(heartbeat.read_text()) if heartbeat.exists() else {}
        if last.get('hour')!=hour:
            print(current.isoformat(),'HEARTBEAT T80 scheduler host='+os.uname().nodename,flush=True)
            heartbeat.write_text(json.dumps({'hour':hour}))
        config=json.loads((BASE/'runtime-config.json').read_text());shape=read_pinned(config['distribution'])
        # A manifest mismatch must stop calls, never run a changed v1 silently.
        for path,digest in config['code_hashes'].items():
            if sha((ROOT/path).read_bytes())!=digest:raise ValueError('Frozen code changed: '+path)
        ref=latest('schedule-ref.json')
        if not ref:return {'state':'STALE_OR_MISSING_SCHEDULE'}
        schedule=read_pinned(ref)
        for group in schedule['groups']:
            start=timestamp(group['capture_at']);cutoff=timestamp(group['cutoff_at'])
            if current<start-dt.timedelta(minutes=10):continue
            # Do not invent earlier-season records prior to this version's season.
            if group['week']<1:continue
            groupfolder=OUT/'captures'/group['id']
            games=group['games']
            if all((OUT/'locks'/g['game_id']/'T75-picks.json').exists() for g in games):continue
            if start-dt.timedelta(minutes=5)<=current<start:
                depth=latest('depth-ref.json')
                jobs=[g for g in games if not (OUT/'locks'/g['game_id']/'inactives.json').exists()]
                with ThreadPoolExecutor(max_workers=4) as pool:
                    list(pool.map(lambda g:pull_inactives(g,OUT/'locks'/g['game_id'],depth),jobs))
            if start<=current<start+dt.timedelta(seconds=60) and not (groupfolder/'capture.json').exists() and not (OUT/'HALT.json').exists():
                from engine.t75_capture import capture
                from engine.quote_capture import key
                capture(group,groupfolder,OUT/'budget.jsonl',key())
                jobs=[g for g in games if not (OUT/'locks'/g['game_id']/'forecast.json').exists()]
                with ThreadPoolExecutor(max_workers=len(jobs) or 1) as pool:
                    list(pool.map(lambda g:forecast_game(g,OUT/'locks'/g['game_id']),jobs))
            if now()<cutoff-dt.timedelta(seconds=60):continue
            receipt=json.loads((groupfolder/'capture.json').read_text()) if (groupfolder/'capture.json').exists() else None
            events=read_pinned(receipt['source']) if receipt and 'source' in receipt else []
            for game in games:
                event=next((e for e in events if e['home_team']==game['home_team'] and e['away_team']==game['away_team']),None)
                freeze_game(game,OUT/'locks'/game['game_id'],shape,config,event,receipt,latest(f"state-{game['season']}-{game['week']}.json"))
        return {'state':'OK'}

if __name__=='__main__':
    result=run()
    if result['state']!='OK':print(json.dumps(result),flush=True)
