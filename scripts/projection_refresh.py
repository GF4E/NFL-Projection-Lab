"""Refresh measured football state using a frozen fit; never retrain at publication."""
import concurrent.futures,datetime as dt,gzip,json,sys
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts.projection_publish import OUT,WORK,read,save,stamp

def forecasts():
 from engine.live_weather_v2 import capture
 manifest=json.loads((WORK/'source-manifest.json').read_text());schedule=read(manifest['schedule']);venues={r['stadium_id']:r for r in json.loads((ROOT/'config/stadiums.json').read_text())['stadiums']};now=dt.datetime.now(dt.timezone.utc);path=OUT/'forecast.json';values=json.loads(path.read_text()) if path.exists() else {};jobs=[]
 for g in schedule:
  if int(g['season'])!=2026 or int(g['week'])>2 or g['roof'].lower() not in ('outdoors','open'):continue
  k=dt.datetime.fromisoformat(g['gameday']+'T'+g['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc);cut=k-dt.timedelta(minutes=75);old=values.get(g['game_id']);venue=venues.get(g['stadium_id'])
  if now>=cut or not venue or (old and (now-stamp(old['received_at'])).total_seconds()<3600):continue
  jobs.append({**g,**{key:venue[key] for key in ['latitude','longitude']},'kickoff_at':k.isoformat(),'cutoff_at':cut.isoformat()})
 def fetch(g):
  try:return g['game_id'],capture(g,OUT/'weather-sources'/g['game_id']),None
  except Exception as e:return g['game_id'],None,type(e).__name__
 errors=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for gid,value,error in pool.map(fetch,jobs):
   if value:values[gid]=value
   else:errors.append({'game_id':gid,'status':'INACTIVE','reason':error})
 save(path,values);save(OUT/'weather-refresh.json',{'at':now.isoformat(),'attempted_games':len(jobs),'unavailable':errors,'credits_spent':0});return values

def prepare():
 from scripts.projection_prepare import run
 from engine.projection.features import build
 m=run();artifact=read(json.loads((WORK/'fit-ref.json').read_text()));decay=artifact['selected'][0];rows=build(read(m['team_games']),read(m['schedule']),json.loads((ROOT/'config/stadiums.json').read_text()),None if decay=='none' else int(decay),m['roster_source_hashes']);rows=[r for r in rows if r['season']==2026];(WORK/'current-features.json.gz').write_bytes(gzip.compress(json.dumps(rows,sort_keys=True,separators=(',',':')).encode(),mtime=0))
if __name__=='__main__':
 if '--prepare' in sys.argv:prepare()
 forecasts()
