"""Replay verified deployed ridge/feature code; no activation or candidate fitting."""
import datetime as dt,gzip,hashlib,json,os,subprocess,sys,time
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
# The numerical code is extracted verbatim from the verified production commit.
SNAP=Path(os.environ['NFL_PRODUCTION_SOURCE']);sys.path.insert(0,str(SNAP))
from engine.projection_v3.model import fit,predict
from engine.projection.features import build
from engine.projection_v3.qualify import paired
OUT=ROOT/'work/projection-v2w';PT=ZoneInfo('America/Los_Angeles');ET=ZoneInfo('America/New_York')
def read(ref):
 p=ROOT/ref['path'];raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==ref['sha256'];return json.loads(raw)
def pin(name,value):
 raw=(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode();h=hashlib.sha256(raw).hexdigest();p=OUT/f'{name}-{h}.json';assert not p.exists() or p.read_bytes()==raw;p.write_bytes(raw);return {'path':str(p.relative_to(ROOT)),'sha256':h}
def kickoff(g):return dt.datetime.fromisoformat(g['gameday']+'T'+g['gametime']).replace(tzinfo=ET)
def execute():
 start=time.monotonic();host=json.loads((OUT/'host-verification-2026-09-19.json').read_text())
 for f,h in host['source_sha256'].items():assert hashlib.sha256((SNAP/f).read_bytes()).hexdigest()==h,f
 a=read(host['fit_ref']);histref=json.loads((ROOT/'work/in-season-learning-v1/historical-ref.json').read_text());rows=read(histref)
 modelref=json.loads((ROOT/'work/projection-v1/fit-ref.json').read_text());manifest=read(modelref)['source_manifest'];schedule=read(manifest['schedule']);tg=read(manifest['team_games']);stadiums=json.loads((ROOT/'config/stadiums.json').read_text())
 games={g['game_id']:g for g in schedule if g['game_type']=='REG' and 2015<=int(g['season'])<=2025};base=json.loads(next((ROOT/'work/projection-v3').glob('baseline-oof-bb7a7f0a*.json')).read_text());population={g['game_id'] for g in base}
 for r in rows:r['game']=games[r['game_id']]
 oof=[];lineage=[];repairs=[]
 for year in range(2016,2026):
  history=[r for r in rows if r['season']<year and r['actual_points'] is not None and r['features']['baseline'] is not None];current=[r for r in rows if r['season']==year];sg={r['game_id']:r['game'] for r in current};events=[]
  for week in sorted({r['week'] for r in current}):
   if week>=18:continue
   first=min(dt.date.fromisoformat(g['gameday']) for g in sg.values() if int(g['week'])==week);day=first+dt.timedelta(days=(1-first.weekday())%7 or 7);due=dt.datetime.combine(day,dt.time(6),PT)
   ready=max(kickoff(g)+dt.timedelta(hours=4) for g in sg.values() if int(g['week'])<=week)
   at=max(due,ready);at=at.replace(minute=0,second=0,microsecond=0)+dt.timedelta(hours=bool(at.minute or at.second or at==ready))
   events.append((at,week))
  fitted=fit(history,a['groups'],a['selected'][1]);cache={0:fitted};preds=[]
  for gid,g in sorted(sg.items(),key=lambda x:(kickoff(x[1]),x[0])):
   if gid not in population:continue
   issuance=kickoff(g)-dt.timedelta(minutes=75)
   available=[(at,w) for at,w in events if at<issuance];through=max((w for at,w in available),default=0)
   if through not in cache:
    training=history+[r for r in current if r['week']<=through];assert all(kickoff(r['game'])+dt.timedelta(hours=4)<issuance for r in training if r['season']==year)
    cache[through]=fit(training,a['groups'],a['selected'][1])
   pair=[r for r in current if r['game_id']==gid]
   missing=[x for x,h in sg.items() if int(h['week'])<int(g['week']) and kickoff(h)+dt.timedelta(hours=4)>=issuance]
   if missing:
    excluded=set(missing);filtered=[dict(h,home_score=None,away_score=None) if h['game_id'] in excluded else h for h in schedule if int(h['season'])<=year]
    rebuilt=build([t for t in tg if t['game_id'] not in excluded],filtered,stadiums,None,manifest['roster_source_hashes']);pair=[r for r in rebuilt if r['game_id']==gid];repairs.append({'game_id':gid,'withheld':missing})
   values=[predict(cache[through],r['features'])['points'] for r in pair];preds+=paired(pair,values)
   lineage.append({'game_id':gid,'issuance_at':issuance.isoformat(),'through_week':through,'fit_training_hash':cache[through]['training_hash'],'last_training_season':year if through else year-1})
  oof+=preds
  print(year,len(preds),len(cache),'fits',flush=True)
  if time.monotonic()-start>2700:raise TimeoutError('45 minute ceiling')
 assert len(oof)==2639 and {r['game_id'] for r in oof}==population
 ref=pin('deployed-oof',sorted(oof,key=lambda r:(r['season'],r['week'],r['game_id'])))
 receipt={'oof':ref,'source_commit':host['commit'],'production_fit':host['fit_ref'],'groups':a['groups'],'settings':a['selected'],'historical_features':histref,'lineage':lineage,'calendar_repairs':repairs,'source_sha256':host['source_sha256'],'plan_sha256':hashlib.sha256((OUT/'REPLAY-PLAN.md').read_bytes()).hexdigest(),'elapsed_seconds':time.monotonic()-start,'delivery_convention':'kickoff+4h, next hourly retry, whole-prior-week completion'}
 (OUT/'replay-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(ref,flush=True)
if __name__=='__main__':execute()
