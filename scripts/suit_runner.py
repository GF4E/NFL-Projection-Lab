"""Human lock worker. Label-free schedule + quotes + authenticated entries only."""
import datetime as dt,json,os,sys,urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.pick_store import put,read_pinned
from engine.live_picks import overwrite
from engine.model_pick import quotes,consensus,BOOKS
from engine.suit_numbers import price_number,resolve,cap_game
from engine.suit_publish import early_at
from engine.pricing import timestamp


def jobs(games,now):
 out=[];pt=now.astimezone(ZoneInfo('America/Los_Angeles'));weeks=sorted({g['week'] for g in games})
 for week in weeks:
  remaining=[g for g in games if g['week']==week and timestamp(g['cutoff_at'])>now]
  if not remaining:continue
  early=min(timestamp(early_at(g)) for g in remaining)
  if early<=now<early+dt.timedelta(seconds=60):out.append({'label':'EARLY','start':early.isoformat(),'games':remaining,'week_key':f'2026-W{week:02}','request_id':f'SUIT_EARLY_2026_W{week:02}'})
  if pt.weekday() in (4,5,6) and early.date()<=now.date()<early.date()+dt.timedelta(days=7):
   start=pt.replace(hour=7 if pt.weekday()==6 else 12,minute=0,second=0,microsecond=0)
   if start<=now<start+dt.timedelta(seconds=60):out.append({'label':'REFRESH','start':start.isoformat(),'games':remaining,'week_key':f'2026-W{week:02}','request_id':f'SUIT_{pt.date()}_W{week:02}'})
 for at in sorted({g['capture_at'] for g in games}):
  if timestamp(at)<=now<timestamp(at)+dt.timedelta(seconds=60):
   gs=[g for g in games if g['capture_at']==at];out.append({'label':'T80','start':at,'games':gs,'week_key':f"2026-W{gs[0]['week']:02}",'request_id':'SUIT_T80_'+at.replace(':','_')})
 return out


def entries():
 key=os.environ.get('NOTE_SYNC_KEY');private=ROOT/'.cloud-private/note-access.json'
 if not key and private.exists():key=json.loads(private.read_text()).get('NOTE_SYNC_KEY')
 if not key:return None
 req=urllib.request.Request('https://nfl-projection-lab-2026.psoiawesome.chatgpt.site/api/suit-entry/sync',headers={'Authorization':'Bearer '+key,'User-Agent':'Mozilla/5.0 NFL-Engine/1.0'})
 try:
  with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)['entries']
 except Exception:return None


def make_context(game,event,receipt,shape):
 qs=quotes(event,receipt,shape);cs={}
 for market in ('spreads','totals'):
  bs={b:q for (b,m),q in qs.items() if m==market};cs[market]={'full':consensus(bs),'leave_one_out':{b:consensus(bs,b) for b in BOOKS}}
 if any(c['full']['coverage']<2 for c in cs.values()):raise ValueError('Insufficient market coverage')
 return {'game':game,'consensus':cs,'offers':[{**o,'market':m,'book':b} for (b,m),q in qs.items() if b in BOOKS for o in q['outcomes']],'captured_at':receipt['received_at'],'capture_label':receipt['label'],'capture_source_hash':receipt['source']['sha256']}


def lock(game,context,submitted,phase,now,root=ROOT):
 out=Path(root)/'outputs/iron-man-v1';config=json.loads((Path(root)/'config/confidence_map.json').read_text());shape=read_pinned(json.loads((Path(root)/'work/model-pick-v1/runtime-config.json').read_text())['distribution'])
 cutoff=timestamp(early_at(game)) if phase=='EARLY' else timestamp(game['cutoff_at'])
 valid=[e for e in submitted if e['game_id']==game['game_id'] and timestamp(e['submitted_at'])<cutoff]
 if phase=='EARLY' and len(valid)!=2:return
 if phase=='LATE' and now>cutoff+dt.timedelta(seconds=60):context=None
 if phase=='LATE' and (context is None or context['capture_label']!='T80' or not timestamp(game['capture_at'])<=timestamp(context['captured_at'])<=cutoff):context=None
 results=[];all_leans={}
 for market in ('spreads','totals'):
  path=out/'locks'/(game['game_id']+'-'+market+'.json')
  if path.exists():continue
  leans=[]
  if context and len(valid)==2 and len({e['person'] for e in valid})==2:
   for e in valid:
    cf={'provisional':config['people'][e['person']]['provisional'],'version':config['version']}
    # A calibrated map is frozen in each submitted entry by the authenticated service.
    if e.get('confidence_map'):cf={'provisional':e['confidence_map'],'version':e['confidence_version']}
    p=price_number(e,market,context,shape,cf);leans.append({**p,'game_id':game['game_id'],'season':game['season'],'week':game['week'],'population':game.get('population','REGULAR'),'phase':phase,'source':'human_lean'})
  verdict=resolve(leans,market)
  if not context:verdict={'verdict':'MISSED','reason':'NO_QUALIFYING_CAPTURE','stake_dollars':0}
  if phase=='EARLY' and verdict['verdict']!='BET':continue
  results.append({'market':market,'path':path,'verdict':verdict});all_leans[market]=leans
 existing=[json.loads(p.read_text()) for p in (out/'locks').glob('*.json')];weekly=sum(r.get('verdict',{}).get('stake_dollars',0) for r in existing if r['week']==game['week']);game_stake=sum(r.get('verdict',{}).get('stake_dollars',0) for r in existing if r['game_id']==game['game_id'])
 capped=cap_game([r['verdict'] for r in results],min(1000-weekly,100-game_stake))
 for r,v in zip(results,capped):
  put(r['path'],{'schema':'suit-lock-v1','game_id':game['game_id'],'week':game['week'],'season':game['season'],'market':r['market'],'phase':phase,'locked_at':now.isoformat(),'scheduled_cutoff':cutoff.isoformat(),'verdict':v,'leans':all_leans[r['market']],'capture_hash':context.get('capture_source_hash') if context else None,'no_executed_wager':True})


def run():
 out=ROOT/'outputs/iron-man-v1';schedule=out/'schedule.json'
 if not schedule.exists():return {'state':'NO_SUIT_SCHEDULE'}
 now=dt.datetime.now(dt.timezone.utc);games=json.loads(schedule.read_text())['games'];queue=jobs(games,now);shape=read_pinned(json.loads((ROOT/'work/model-pick-v1/runtime-config.json').read_text())['distribution'])
 # Recover stored captures without re-dispatching provider calls.
 for pending in (out/'captures').glob('*/job.json'):
  if not (pending.parent/'processed.json').exists():
   prior=json.loads(pending.read_text())
   if prior['request_id'] not in {j['request_id'] for j in queue}:queue.append(prior)
 for job in queue:
  folder=out/'captures'/job['request_id'];done=folder/'processed.json'
  if done.exists():continue
  from engine.live_capture import capture
  from engine.quote_capture import key
  if not (folder/'job.json').exists():put(folder/'job.json',job)
  if (folder/'capture.json').exists():receipt=json.loads((folder/'capture.json').read_text())
  elif timestamp(job['start'])<=now<timestamp(job['start'])+dt.timedelta(seconds=60):receipt=capture(job,folder,ROOT/'outputs/model-pick-v1/budget.jsonl',key())
  else:continue
  if receipt.get('status')!='CAPTURED':continue
  data=read_pinned(receipt['source']);submitted=entries() if job['label']=='EARLY' else []
  for game in job['games']:
   event=next((e for e in data if e['home_team']==game['home_team'] and e['away_team']==game['away_team']),None)
   if not event:continue
   try:ctx=make_context(game,event,receipt,shape)
   except (ValueError,KeyError):continue
   overwrite(out/'markets'/(game['game_id']+'.json'),ctx)
   if job['label']=='EARLY' and submitted is not None:lock(game,ctx,submitted,'EARLY',dt.datetime.now(dt.timezone.utc))
  if job['label']=='EARLY' and submitted is None:continue
  put(done,{'processed_at':dt.datetime.now(dt.timezone.utc).isoformat()})
 # Closed windows become explicit MISSED; never fetch late or retroactively choose.
 due=[g for g in games if timestamp(g['cutoff_at'])<=now and not all((out/'locks'/(g['game_id']+'-'+m+'.json')).exists() for m in ('spreads','totals'))]
 if due:
  submitted=entries()
  if submitted is None:return {'state':'ENTRY_SYNC_UNAVAILABLE_LOCK_DEFERRED'}
  for g in due:
   p=out/'markets'/(g['game_id']+'.json');ctx=json.loads(p.read_text()) if p.exists() else None;lock(g,ctx,submitted,'LATE',now)
 return {'state':'OK','jobs':len(queue)}
if __name__=='__main__':print(json.dumps(run()))
