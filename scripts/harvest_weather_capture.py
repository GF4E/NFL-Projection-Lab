"""Explicit free historical-weather ingestion; never called by model or offline replay."""
import sys,json,hashlib,urllib.request,urllib.parse,urllib.error,concurrent.futures,time
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.harvest import read,digest
from engine.qb_history import put,encoded
BASE=Path('work/harvest-weather-v1')
def kickoff(g):
 return datetime.fromisoformat(g['gameday']+'T'+g['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(timezone.utc).replace(minute=0,second=0).strftime('%Y-%m-%dT%H:00')
def main():
 protocol=json.loads((BASE/'protocol.json').read_text());assert digest(Path(protocol['schedule']))==protocol['schedule_sha256']
 games=[g for g in read(protocol['schedule']) if 2015<=int(g['season'])<=2025 and g['game_type']=='REG' and g['home_score'] and g['away_score']]
 venues={r['stadium_id']:r for r in read(BASE/'sources/stadiums.csv')};groups={}
 for g in games:
  if g['roof'] in ('open','outdoors'):groups.setdefault(g['stadium_id'],[]).append(g)
 def fetch(item):
  sid,gs=item;v=venues[sid];times=[kickoff(g) for g in gs]
  params=dict(latitude=v['lat'],longitude=v['lon'],start_date=min(times)[:10],end_date=max(times)[:10],hourly='temperature_2m,precipitation,wind_speed_10m',wind_speed_unit='mph',timezone='UTC',models='era5')
  key=hashlib.sha256(json.dumps(params,sort_keys=True).encode()).hexdigest();receipt=BASE/'requests'/f'{key}.json'
  if receipt.exists():
   rec=json.loads(receipt.read_text());raw=Path(rec['path']);assert digest(raw)==rec['sha256'];data=json.loads(raw.read_text())
  else:
   url='https://archive-api.open-meteo.com/v1/archive?'+urllib.parse.urlencode(params)

   for attempt in range(12):
    try:
     payload=urllib.request.urlopen(url,timeout=120).read();break
    except urllib.error.HTTPError as exc:
     body=exc.read().decode();print(sid,exc.code,body,flush=True)
     if exc.code!=429 or attempt==11:raise
     time.sleep(60)
   data=json.loads(payload);sha=hashlib.sha256(payload).hexdigest();raw=BASE/'responses'/f'{sha}.json';put(raw,payload)
   rec={'request':params,'sha256':sha,'path':str(raw),'captured_at':datetime.now(timezone.utc).isoformat()};put(receipt,(json.dumps(rec,indent=2)+'\n').encode())
  units=data['hourly_units'];assert units['wind_speed_10m']=='mp/h' and units['precipitation']=='mm' and units['temperature_2m']=='°C',units
  hourly=data['hourly'];indexes={t:i for i,t in enumerate(hourly['time'])};out={}
  for g in gs:
   t=kickoff(g);i=indexes[t];vals=[hourly[k][i] for k in ('wind_speed_10m','precipitation','temperature_2m')]
   if any(x is None for x in vals):raise ValueError('Missing outdoor weather '+g['game_id'])
   out[g['game_id']]=dict(wind_mph=vals[0],precip_mm=vals[1],temperature_c=vals[2],response_sha256=rec['sha256'])
  print(sid,len(gs),'cached',flush=True);return out
 weather={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  for rows in pool.map(fetch,sorted(groups.items())):weather.update(rows)
 result=[]
 for g in games:
  if g['roof'] not in ('open','outdoors','closed','dome'):raise ValueError('Unknown roof')
  dome=int(g['roof'] in ('closed','dome'));w=weather.get(g['game_id'],dict(wind_mph='',precip_mm='',temperature_c='',response_sha256=''))
  result.append(dict(game_id=g['game_id'],season=g['season'],week=g['week'],stadium_id=g['stadium_id'],roof=g['roof'],dome=dome,kickoff_hour_utc=kickoff(g),**w))
 payload=encoded(result);sha=hashlib.sha256(payload).hexdigest();table=BASE/f'weather-{sha}.csv';put(table,payload)
 put(BASE/'weather-manifest.json',(json.dumps(dict(table=str(table),sha256=sha,n=len(result),outdoor_n=len(weather),venues_sha256=digest(BASE/'sources/stadiums.csv'),protocol_sha256=digest(BASE/'protocol.json')),indent=2)+'\n').encode())
if __name__=='__main__':main()
