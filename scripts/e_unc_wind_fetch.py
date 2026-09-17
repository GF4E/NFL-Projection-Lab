"""Fetch fixed-lead historical wind only for the non-gated secondary study."""
import csv,datetime as dt,gzip,hashlib,json,sys
from pathlib import Path
from collections import defaultdict
import requests
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'work/e-unc';CACHE=OUT/'forecast-sources';CACHE.mkdir(exist_ok=True)
ref=json.loads((ROOT/'work/projection-v2/phase-a/features-ref.json').read_text())['schedule_ref']
schedule={r['game_id']:r for r in csv.DictReader(open(ref['path']))}
calendar={g['game_id']:g for g in json.loads((ROOT/'work/projection-governance-v2/e1-calendar-corrected/calendar-games.json').read_text())}
stadiums={s['stadium_id']:s for s in json.loads((ROOT/'config/stadiums.json').read_text())['stadiums']}
ids={r['game_id'] for r in json.loads((ROOT/'work/projection-governance-v2/e1-calendar-corrected/oof.json').read_text())['linear'] if r['season'] in (2024,2025)}
groups=defaultdict(list);rows=[];sources=[]
for gid in sorted(ids):
 g=schedule[gid]
 if g['stadium_id'] not in stadiums:rows.append({'game_id':gid,'status':'UNKNOWN_COORDINATES'});continue
 groups[(g['season'],g['stadium_id'])].append(gid)
for i,((season,sid),gids) in enumerate(sorted(groups.items())):
 s=stadiums[sid];dates=[calendar[g]['kickoff_at'][:10] for g in gids]
 params={'latitude':s['latitude'],'longitude':s['longitude'],'start_date':min(dates),'end_date':max(dates),'hourly':'wind_speed_10m_previous_day1','wind_speed_unit':'mph','timezone':'UTC','models':'gfs_seamless'}
 key=hashlib.sha256(json.dumps(params,sort_keys=True).encode()).hexdigest();path=CACHE/(key+'.json.gz')
 if path.exists():body=gzip.decompress(path.read_bytes());data=json.loads(body)
 else:
  response=requests.get('https://previous-runs-api.open-meteo.com/v1/forecast',params=params,timeout=40)
  if response.status_code!=200:
   for gid in gids:rows.append({'game_id':gid,'status':'HTTP_'+str(response.status_code)})
   print(i+1,len(groups),'HTTP',response.status_code,flush=True);continue
  body=response.content;data=response.json();path.write_bytes(gzip.compress(body,mtime=0))
 sources.append({'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'parameters':params,'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat(),'url':'https://previous-runs-api.open-meteo.com/v1/forecast'})
 hourly=data.get('hourly',{});values=dict(zip(hourly.get('time',[]),hourly.get('wind_speed_10m_previous_day1',[])))
 for gid in gids:
  valid=dt.datetime.fromisoformat(calendar[gid]['kickoff_at']).replace(minute=0,second=0,microsecond=0);value=values.get(valid.strftime('%Y-%m-%dT%H:%M'));issued=valid-dt.timedelta(hours=24);issuance=dt.datetime.fromisoformat(calendar[gid]['issuance_at']);assert issued<issuance
  rows.append({'game_id':gid,'season':int(season),'status':'QUALIFIED_PREVIOUS_DAY1' if value is not None else 'UNKNOWN_VALUE','wind_mph':value,'effective_wind_mph':None if value is None else value if schedule[gid]['roof'] in ('open','outdoors') else 0,'forecast_asof_utc':issued.isoformat(),'valid_utc':valid.isoformat(),'source':str(path.relative_to(ROOT))})
 print(i+1,len(groups),season,sid,flush=True)
(OUT/'qualified-wind.json').write_text(json.dumps({'rows':rows,'sources':sources},indent=2)+'\n')
print('Qualified',sum(r['status']=='QUALIFIED_PREVIOUS_DAY1' for r in rows),'of',len(ids))
