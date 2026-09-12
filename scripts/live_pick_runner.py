"""Friday/Saturday noon PT, Sunday 07 PT, T80 captures and exact T75 locks."""
import datetime as dt
import json
import os
from pathlib import Path
import sys
import urllib.request
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.pick_store import put,read_pinned
from engine.live_picks import recompute,freeze,overwrite
from engine.pricing import timestamp
from scripts.model_pick_runner import latest
OUT=ROOT/'outputs/model-pick-v1'
PT=ZoneInfo('America/Los_Angeles')


def jobs(groups, now):
    future=[g for g in groups if timestamp(g['cutoff_at'])>now]
    if not future:return []
    week=min(future,key=lambda g:g['kickoff_at'])['week'];season=future[0]['season']
    games=[g for group in future if group['week']==week for g in group['games']]
    today=now.astimezone(PT);result=[]
    label={4:'FRIDAY',5:'SATURDAY',6:'SUNDAY'}.get(today.weekday())
    if label:
        start=today.replace(hour=7 if label=='SUNDAY' else 12,minute=0,second=0,microsecond=0).astimezone(dt.timezone.utc)
        if start<=now<start+dt.timedelta(seconds=60):result.append({'label':label,'start':start.isoformat(),'games':games,'week_key':f'{season}-W{week:02}','request_id':f'LIVE_{label}_{season}_W{week:02}'})
    # Explicit one-time Friday request; no silent catch-up of missed windows.
    override=ROOT/'work/live-lifecycle-v1/friday-now.json'
    if override.exists():
        j=json.loads(override.read_text())
        if timestamp(j['start'])<=now<timestamp(j['start'])+dt.timedelta(seconds=60):result.append({**j,'games':games,'week_key':f'{season}-W{week:02}','request_id':f'LIVE_FRIDAY_{season}_W{week:02}'})
    for g in future:
        if timestamp(g['capture_at'])<=now<timestamp(g['capture_at'])+dt.timedelta(seconds=60):
            result.append({'label':'T80','start':g['capture_at'],'games':g['games'],'week_key':f'{g["season"]}-W{g["week"]:02}','request_id':str(g['season'])+'-'+str(g['week'])+'-'+g['kickoff_at']})
    return result


def weather(game,folder):
    if game['roof'] not in ('open','outdoors'):return {'status':'INDOOR_OR_ROOF_UNKNOWN'}
    try:
        from engine.live_weather_v2 import capture
        return capture({**game,'event_id':game['game_id']},folder)
    except Exception as exc:return {'status':'UNAVAILABLE','error':type(exc).__name__,'message':str(exc)[:180]}


def notes():
    secret=os.environ.get('NOTE_SYNC_KEY')
    private=ROOT/'.cloud-private/note-access.json'
    if not secret and private.exists():secret=json.loads(private.read_text()).get('NOTE_SYNC_KEY')
    if not secret:return None
    req=urllib.request.Request('https://nfl-projection-lab-2026.psoiawesome.chatgpt.site/api/our-note/sync',headers={'Authorization':'Bearer '+secret,'User-Agent':'Mozilla/5.0 NFL-Engine/1.0'})
    try:
        with urllib.request.urlopen(req,timeout=10) as r:return {n['game_id']:n for n in json.load(r)['notes']}
    except Exception:return None


def run():
    now=dt.datetime.now(dt.timezone.utc);ref=latest('schedule-ref.json')
    if not ref:return {'state':'MISSING_SCHEDULE'}
    groups=[g for g in read_pinned(ref)['groups'] if g['week']<2];config=json.loads((ROOT/'work/model-pick-v1/runtime-config.json').read_text());shape=read_pinned(config['distribution'])
    # Gather known QB status inside the registered T90-T80 window, once per game.
    from engine.t75_shadow import pull_inactives
    for group in groups:
        for game in group['games']:
            folder=OUT/'live-context'/game['game_id']
            if timestamp(game['kickoff_at'])-dt.timedelta(minutes=90)<=now<timestamp(game['capture_at']) and not (folder/'inactives.json').exists():
                pull_inactives(game,folder,latest('depth-ref.json'))
    queue=jobs(groups,now)
    for path in (OUT/'captures').glob('*/live-job.json'):
        if (path.parent/'processed.json').exists() or not (path.parent/'capture.json').exists():continue
        pending=json.loads(path.read_text())
        if any(timestamp(g['cutoff_at'])>now for g in pending['games']):queue.append(pending)
    for job in queue:
        folder=OUT/'captures'/job['request_id'].replace(':','_');receipt_path=folder/'capture.json'
        if (folder/'processed.json').exists():continue
        if not receipt_path.exists() and (OUT/'HALT.json').exists():continue
        from engine.live_capture import capture
        from engine.quote_capture import key
        if (folder/'live-job.json').exists():job=json.loads((folder/'live-job.json').read_text())
        put(folder/'live-job.json',job)
        receipt=json.loads(receipt_path.read_text()) if receipt_path.exists() else capture(job,folder,OUT/'budget.jsonl',key())
        if receipt['status']!='CAPTURED':continue
        events=read_pinned(receipt['source'])
        def update(game):
            dest=OUT/'live'/f'{game["game_id"]}.json'
            if (OUT/'locks'/game['game_id']/'T75-picks.json').exists() or dt.datetime.now(dt.timezone.utc)>=timestamp(game['cutoff_at']):return
            previous=json.loads(dest.read_text()) if dest.exists() else None
            event=next((e for e in events if e['home_team']==game['home_team'] and e['away_team']==game['away_team']),None)
            state_ref=latest(f'state-{game["season"]}-{game["week"]}.json')
            state=read_pinned(state_ref) if state_ref else None
            ip=OUT/'live-context'/game['game_id']/'inactives.json'
            inactive=json.loads(ip.read_text()) if ip.exists() else {'status':'INACTIVES_UNAVAILABLE'}
            try:
                value=recompute(game,event,receipt,shape,config,previous,weather(game,folder/game['game_id']/'weather'),state,inactive)
                overwrite(dest,value)
            except (ValueError,KeyError,TypeError):return
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(update,job['games']))
        put(folder/'processed.json',{'processed_at':dt.datetime.now(dt.timezone.utc).isoformat(),'request_id':job['request_id']})
    due=[g for group in groups for g in group['games'] if timestamp(g['cutoff_at'])<=now and not (OUT/'locks'/g['game_id']/'T75-picks.json').exists()]
    saved_notes=notes() if due else {}
    if due and saved_notes is None:
        raise RuntimeError('Note synchronization unavailable; lock publication deferred without changing the selection')
    for g in due:
        dest=OUT/'live'/f'{g["game_id"]}.json';target=OUT/'locks'/g['game_id']/'T75-picks.json'
        if dest.exists():
            current=dt.datetime.now(dt.timezone.utc)
            value=freeze(json.loads(dest.read_text()),current.isoformat(),(saved_notes or {}).get(g['game_id']))
            value['note_sync_status']='AVAILABLE' if saved_notes is not None else 'UNAVAILABLE'
            put(target,value);overwrite(dest,value)
        else:
            put(target,{'game':g,'status':'MISSED','version':config['version'],'freeze_timestamp':now.isoformat(),'reason':'NO_LIVE_PICK','picks':[]})
    from engine.live_scorecard import write_pick_log
    write_pick_log(ROOT)
    return {'state':'OK'}


if __name__=='__main__':print(json.dumps(run()))
