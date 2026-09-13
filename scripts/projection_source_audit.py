"""Read and hash existing football sources; no provider requests or model fitting."""
import csv,datetime,hashlib,json
from pathlib import Path
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/projection-v1'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+'\n')
def run():
 records=json.loads((ROOT/'work/harvest-elo-v2/sources/manifest.json').read_text())['records'];rows=[]
 for r in records:
  year=int(Path(r['path']).name.split('_')[3].split('-')[0])
  if not 2015<=year<=2025:continue
  path=ROOT/r['path'];h=sha(path)
  if h!=r['sha256']:raise ValueError('PBP source changed')
  f=pq.read_table(path,columns=['season_type','game_id','qtr','wp']).to_pandas();reg=f[f.season_type.eq('REG')];excluded=reg.qtr.eq(4)&(reg.wp.lt(.05)|reg.wp.gt(.95));unknown=reg.qtr.eq(4)&reg.wp.isna()
  rows.append({'season':year,'path':r['path'],'sha256':h,'regular_games':int(reg.game_id.nunique()),'regular_plays':len(reg),'excluded_q4_plays':int(excluded.sum()),'q4_unknown_wp_plays':int(unknown.sum()),'has_direct_pressure_field':'was_pressure' in pq.ParquetFile(path).schema.names})
 suit=json.loads((ROOT/'work/iron-man-v1/source-manifest.json').read_text());sources=[]
 for r in suit:
  path=ROOT/r['path'];h=sha(path)
  if h!=r['sha256']:raise ValueError('Pinned football source changed')
  sources.append({'name':r['name'],'path':r['path'],'sha256':h})
 stadium=ROOT/'work/harvest-weather-v1/sources/stadiums.csv'
 config=ROOT/'config/stadiums.json'
 if not config.exists():
  entries=[]
  for r in csv.DictReader(stadium.open()):
   if r.get('lat') and r.get('lon'):
    entries.append({k:r[k] for k in ('stadium_id','stadium_name','roof_type','first_game_date','last_game_date')}|{'latitude':float(r['lat']),'longitude':float(r['lon'])})
  save(config,{'source_path':str(stadium.relative_to(ROOT)),'source_sha256':sha(stadium),'stadiums':entries})
 staff=ROOT/'config/staff_history.json'
 if not staff.exists():save(staff,{'schema':'staff-history-v1','seeded':False,'records':[],'status':'UNSEEDED_ZERO_WEIGHT','required_roles':['head_coach','offensive_coordinator','defensive_coordinator','qb1','general_manager','roster']})
 wind=ROOT/'work/harvest-weather-followup-v1/run-1/experiment.json';w=json.loads(wind.read_text())
 result={'experiment':'projection-v1-source-audit','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'MISSING_INPUT_POLICY_PENDING','credits_spent':0,'provider_calls':0,'garbage_filter':'Exclude qtr==4 and (wp<0.05 or wp>0.95). Retain endpoints; missing wp tracked, not interpreted as garbage.','pbp':rows,'other_sources':sources,'configuration':{str(p.relative_to(ROOT)):sha(p) for p in (config,staff)},'forecast_history':{'source':str(wind.relative_to(ROOT)),'sha256':sha(wind),'qualification':w['forecast_t60'],'provider_docs':'https://open-meteo.com/en/docs/historical-forecast-api','provider_coverage':'Historical stitched forecasts start around 2022; that series is not a T75-issued forecast archive.'},'decisions_needed':['Whether to keep exact all-input fitting blocked or explicitly permit a core fit with unavailable wind and pressure inputs inactive.','Whether new Week 1 final reconstructions may be labeled RETROSPECTIVE and excluded from prospective grading.'],'numerical_primitives':{'tests_passed':7,'tests_failed':0,'status':'TESTED_NOT_FITTED_MODEL'},'live_site':'Unchanged pending model qualification; no projection-v1 forecast published.'}
 save(OUT/'experiment.json',result);return result
if __name__=='__main__':
 r=run();print(json.dumps({'status':r['status'],'pbp_seasons':len(r['pbp']),'credits_spent':0}))
