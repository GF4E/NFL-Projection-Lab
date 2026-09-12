"""Public sensor preparation only; must not be imported by lock/scoring jobs."""
import datetime,hashlib,json,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.live_picks import overwrite
from engine.suit_sensors import build
from engine.suit_publish import publish
from engine.pick_store import read_pinned
from scripts.model_pick_runner import latest

def sheet_week(games,now):
 from zoneinfo import ZoneInfo
 future=[g for g in games if datetime.datetime.fromisoformat(g['kickoff_at'])>now]
 week=min((g['week'] for g in future),default=2);pt=now.astimezone(ZoneInfo('America/Los_Angeles'))
 # Keep next week's Sunday-evening sheet through Monday while the prior MNF remains pending.
 rollout=(pt.weekday()==6 and pt.hour>=20) or pt.weekday()==0
 if rollout and any(g['week']==week and datetime.datetime.fromisoformat(g['kickoff_at'])<now for g in games):week=min(18,week+1)
 return week

def run(refresh=False):
 now=datetime.datetime.now(datetime.timezone.utc);out=ROOT/'outputs/iron-man-v1';manifest=json.loads((ROOT/'work/iron-man-v1/source-manifest.json').read_text())
 if refresh:
  for r in manifest:
   if not r.get('url'):continue
   try:
    raw=urllib.request.urlopen(r['url'],timeout=40).read();h=hashlib.sha256(raw).hexdigest();p=out/'sources'/(r['name'].replace('.parquet','')+'-'+h+'.parquet');p.parent.mkdir(parents=True,exist_ok=True)
    if not p.exists():p.write_bytes(raw)
    r.update(path=str(p.relative_to(ROOT)),sha256=h,received_at=now.isoformat())
   except Exception as e:r['refresh_error']=type(e).__name__
  overwrite(out/'source-manifest.json',manifest)
 ref=latest('schedule-ref.json');groups=read_pinned(ref)['groups'];games=[g for group in groups for g in group['games'] if g['week']>=2]
 week=sheet_week(games,now)
 overwrite(out/'schedule.json',{'games':games,'prepared_at':now.isoformat(),'source':ref,'label_free':True})
 sensors=build(manifest,2026,week,now.isoformat());overwrite(out/'sensors.json',sensors);publish(ROOT)
 return {'week':week,'status':sensors['status'],'teams':len(sensors['teams'])}
if __name__=='__main__':print(json.dumps(run('--refresh' in sys.argv)))
