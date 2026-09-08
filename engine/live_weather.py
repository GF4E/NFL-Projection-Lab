"""Prospective forecast capture and fail-closed paper wind eligibility. No odds calls."""
import datetime as dt,json,hashlib,math,urllib.request,urllib.parse
from pathlib import Path
from engine.harvest import read,digest,ROOT
from engine.qb_history import put,encoded
from engine.pricing import timestamp,EXECUTION
MANIFEST=ROOT/'work/t60-weather-v1/venues-manifest.json'
def now():return dt.datetime.now(dt.timezone.utc)
def venues():
 m=json.loads(MANIFEST.read_text());p=ROOT/m['table']
 if digest(p)!=m['sha256']:raise ValueError('Venue hash mismatch')
 return {r['event_id']:r for r in read(p)}
def get(url,folder):
 requested=now();raw=urllib.request.urlopen(url,timeout=12).read();received=now();sha=hashlib.sha256(raw).hexdigest();put(folder/'sources'/f'{sha}.json',raw)
 return json.loads(raw),dict(url=url,request_at=requested.isoformat(),received_at=received.isoformat(),sha256=sha)
def capture(v,folder):
 """Pin exact GFS run from metadata; initialization is not issuance."""
 metadata=[];receipts=[]
 for domain in ('ncep_gfs013','ncep_gfs025'):
  m,r=get(f'https://api.open-meteo.com/data/{domain}/static/meta.json',folder);metadata.append(m);receipts.append(r)
 init={m['last_run_initialisation_time'] for m in metadata}
 if len(init)!=1:raise ValueError('GFS component runs differ')
 issued=dt.datetime.fromtimestamp(max(m['last_run_availability_time'] for m in metadata),dt.timezone.utc);run=dt.datetime.fromtimestamp(init.pop(),dt.timezone.utc)
 if issued>now()-dt.timedelta(minutes=10):raise ValueError('Run still within documented replication window')
 hour=timestamp(v['kickoff_at']).replace(minute=0,second=0,microsecond=0).strftime('%Y-%m-%dT%H:00')
 params=dict(latitude=v['latitude'],longitude=v['longitude'],models='gfs_global',run=run.strftime('%Y-%m-%dT%H:%M'),hourly='wind_speed_10m,precipitation,temperature_2m',wind_speed_unit='mph',timezone='UTC',forecast_days=7)
 data,receipt=get('https://single-runs-api.open-meteo.com/v1/forecast?'+urllib.parse.urlencode(params),folder)
 units=data['hourly_units']
 if (units['wind_speed_10m'],units['precipitation'],units['temperature_2m'])!=('mp/h','mm','°C'):raise ValueError('Unexpected weather units')
 index=data['hourly']['time'].index(hour);values=[data['hourly'][k][index] for k in ('wind_speed_10m','precipitation','temperature_2m')]
 if any(x is None or not math.isfinite(x) for x in values):raise ValueError('Missing forecast')
 return dict(event_id=v['event_id'],kickoff_at=v['kickoff_at'],roof=v['roof'],status='FORECAST',model='gfs_global',forecast_run_initialized_at=run.isoformat(),forecast_issued_at=issued.isoformat(),issuance_basis='max GFS013/GFS025 API availability; exact run requested',request_at=receipt['request_at'],received_at=receipt['received_at'],valid_at=hour+'+00:00',wind_mph=values[0],precip_mm=values[1],temperature_c=values[2],source_sha256=receipt['sha256'],requests=receipts+[receipt],venue_manifest_sha256=digest(MANIFEST))
def capture_group(group,folder):
 """Only T65 window; diagnostic capture() is separate and never backfilled."""
 current=now()
 if not timestamp(group['refresh_at'])<=current<timestamp(group['refresh_at'])+dt.timedelta(seconds=60):return
 table=venues();deadline=min(current+dt.timedelta(seconds=120),timestamp(group['cutoff_at'])-dt.timedelta(seconds=60))
 for eid in group['event_ids']:
  path=folder/'weather'/f'{eid}.json'
  if path.exists():continue
  v=table.get(eid);record=dict(event_id=eid,status='VENUE_UNKNOWN')
  if v and v['roof'] not in ('open','outdoors'):record.update(status='INDOOR_OR_ROOF_UNKNOWN',roof=v['roof'])
  elif v and now()+dt.timedelta(seconds=36)>=deadline:record.update(status='UNAVAILABLE',message='Group weather time budget exhausted')
  elif v:
   try:
    record=capture(v,folder/'weather')
    if timestamp(record['received_at'])>=timestamp(group['cutoff_at']):record['status']='LATE'
   except Exception as exc:record.update(status='UNAVAILABLE',error=type(exc).__name__,message=str(exc)[:200])
  put(path,(json.dumps(record,indent=2,sort_keys=True)+'\n').encode())
def qualified(forecast,group,eid,frozen_at):
 try:
  if not forecast or forecast['status']!='FORECAST' or forecast['event_id']!=eid or forecast['roof'] not in ('open','outdoors'):return False
  cutoff=timestamp(group['cutoff_at']);start=timestamp(group['refresh_at']);request=timestamp(forecast['request_at']);received=timestamp(forecast['received_at']);issued=timestamp(forecast['forecast_issued_at']);init=timestamp(forecast['forecast_run_initialized_at'])
  if not init<=issued<=request<=received<cutoff:return False
  if not start<=request or received>frozen_at:return False
  if timestamp(forecast['kickoff_at'])!=timestamp(group['kickoff_at']):return False
  if timestamp(forecast['valid_at'])!=timestamp(group['kickoff_at']).replace(minute=0,second=0,microsecond=0):return False
  return all(math.isfinite(float(forecast[k])) for k in ('wind_mph','precip_mm','temperature_c'))
 except (KeyError,ValueError,TypeError):return False
def freeze_weather(group,folder,frozen_at):
 records={}
 for eid in group['event_ids']:
  p=folder/'weather'/f'{eid}.json'
  try:f=json.loads(p.read_text()) if p.exists() else {'event_id':eid,'status':'MISSING'}
  except (OSError,ValueError):f={'event_id':eid,'status':'INVALID'}
  valid=qualified(f,group,eid,frozen_at)
  if valid and not f.get('requests'):valid=False
  if valid:
   for receipt in f['requests']:
    raw=folder/'weather/sources'/f"{receipt['sha256']}.json"
    if not raw.exists() or digest(raw)!=receipt['sha256']:valid=False
  records[eid]={**f,'qualified_T60':valid,'wind_band':valid and 10<=float(f['wind_mph'])<15}
 put(folder/'T60-weather.json',(json.dumps(records,indent=2,sort_keys=True)+'\n').encode());return records

def rule_picks(rows,weather):
 """Select only stored qualified forecasts and exact consensus totals."""
 picks=[]
 for eid,f in weather.items():
  if not f.get('qualified_T60') or not f.get('wind_band'):continue
  candidates=[]
  for r in rows:
   if r['event_id']!=eid or r['market']!='totals' or r['side']!='Under' or r['executed_book'] not in EXECUTION:continue
   if not 1<=int(r['week'])<=4 or timestamp(r['commence_time']).year!=2026:continue
   if r['coverage_flag']!='OK' or r['consensus_fair_line']=='':continue
   if float(r['line'])==float(r['consensus_fair_line']):candidates.append(r)
  if candidates:picks.append(sorted(candidates,key=lambda r:(-float(r['decimal_price']),r['executed_book']))[0])
 return picks
