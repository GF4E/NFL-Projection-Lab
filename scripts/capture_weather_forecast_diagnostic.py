"""Capture stitched forecasts only; these cannot prove issuance before T60."""
import sys,json,hashlib,urllib.request,urllib.parse,urllib.error,time
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.harvest import read,digest
from engine.qb_history import put,encoded
from scripts.harvest_weather_capture import kickoff
B=Path('work/harvest-weather-followup-v1')
def main():
 old=json.loads(Path('work/harvest-weather-v1/protocol.json').read_text());games=[r for r in read(old['schedule']) if 2022<=int(r['season'])<=2025 and r['game_type']=='REG' and r['home_score'] and r['away_score'] and r['roof'] in ('outdoors','open')]
 venues={r['stadium_id']:r for r in read('work/harvest-weather-v1/sources/stadiums.csv')};out=[]
 for sid in sorted({r['stadium_id'] for r in games}):
  gs=[r for r in games if r['stadium_id']==sid];v=venues[sid];times=[kickoff(g) for g in gs];params=dict(latitude=v['lat'],longitude=v['lon'],start_date=min(times)[:10],end_date=max(times)[:10],hourly='wind_speed_10m',wind_speed_unit='mph',timezone='UTC',models='gfs_global')
  key=hashlib.sha256(json.dumps(params,sort_keys=True).encode()).hexdigest();rp=B/'requests'/f'{key}.json'
  if rp.exists():rec=json.loads(rp.read_text());raw=Path(rec['path']);assert digest(raw)==rec['sha256'];data=json.loads(raw.read_text())
  else:
   url='https://historical-forecast-api.open-meteo.com/v1/forecast?'+urllib.parse.urlencode(params)
   for attempt in range(10):
    try:payload=urllib.request.urlopen(url,timeout=120).read();break
    except urllib.error.HTTPError as e:
     print(sid,e.code,e.read().decode(),flush=True)
     if e.code!=429 or attempt==9:raise
     time.sleep(60)
   sha=hashlib.sha256(payload).hexdigest();raw=B/'responses'/f'{sha}.json';put(raw,payload);data=json.loads(payload);rec=dict(request=params,path=str(raw),sha256=sha,captured_at=datetime.now(timezone.utc).isoformat());put(rp,(json.dumps(rec,indent=2)+'\n').encode())
  assert data['hourly_units']['wind_speed_10m']=='mp/h';h=data['hourly'];idx={t:i for i,t in enumerate(h['time'])}
  for g in gs:
   k=kickoff(g);value=h['wind_speed_10m'][idx[k]];out.append(dict(game_id=g['game_id'],season=g['season'],week=g['week'],wind_mph=value if value is not None else '',kickoff_hour_utc=k,source_sha256=rec['sha256'],evidence='STITCHED_FORECAST_NOT_T60_ISSUANCE',actual_total=float(g['home_score'])+float(g['away_score']),market_total=g['total_line']))
  print(sid,len(gs),flush=True)
 payload=encoded(out);sha=hashlib.sha256(payload).hexdigest();path=B/f'forecast-{sha}.csv';put(path,payload);put(B/'forecast-manifest.json',(json.dumps(dict(table=str(path),sha256=sha,n=len(out),missing=sum(r['wind_mph']=='' for r in out)),indent=2)+'\n').encode())
if __name__=='__main__':main()
