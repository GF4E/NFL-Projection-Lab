"""Sanitize pinned football sources into a separate allowlisted training corpus."""
import csv,hashlib,json,sys,datetime
from pathlib import Path
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
OUT=ROOT/'work/projection-v1/data'
COLS='game_id season season_type week game_date posteam defteam play_type qtr wp qb_kneel qb_spike rush_attempt qb_dropback yards_gained epa success cpoe fixed_drive posteam_score posteam_score_post touchdown td_team return_touchdown yardline_100 field_goal_result kick_distance kicker_player_id interception fumble_lost fumble fumble_recovery_1_team fumble_recovery_2_team receiver_player_id passer_player_id pass_attempt sack passing_yards pass_touchdown two_point_attempt'.split()
def canonical(t):return {'LA':'LAR','STL':'LAR','LV':'OAK','WAS':'WSH','SD':'LAC'}.get(t,t)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def clean(x):
 if isinstance(x,dict):return {str(k):clean(v) for k,v in x.items()}
 if isinstance(x,(list,tuple)):return [clean(v) for v in x]
 if isinstance(x,(np.integer,np.floating)):x=x.item()
 return None if isinstance(x,float) and not np.isfinite(x) else x

def save(name,data):
 OUT.mkdir(parents=True,exist_ok=True);raw=(json.dumps(clean(data),sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode();h=hashlib.sha256(raw).hexdigest();p=OUT/(name+'-'+h+'.json')
 if not p.exists():p.write_bytes(raw)
 return {'path':str(p.relative_to(ROOT)),'sha256':h}

def aggregate(source,positions):
 path=ROOT/source['path'];assert sha(path)==source['sha256'];schema=pq.ParquetFile(path).schema.names
 p=pq.read_table(path,columns=[c for c in COLS if c in schema]).to_pandas();p=p[p.season_type.eq('REG')];p=p[~(p.qtr.eq(4)&(p.wp.lt(.05)|p.wp.gt(.95)))].copy()
 for c in ['posteam','defteam','td_team','fumble_recovery_1_team','fumble_recovery_2_team']:p[c]=p[c].map(canonical)
 whole={k:v for k,v in p.groupby('game_id')};rows=[];qbs=[]
 for (gid,team),g in p.dropna(subset=['posteam','defteam']).groupby(['game_id','posteam'],sort=True):
  normal=g[g.play_type.isin(['run','pass']) & g.qb_kneel.ne(1)&g.qb_spike.ne(1)]
  if normal.empty:continue
  rush=normal[normal.rush_attempt.eq(1)];pas=normal[normal.qb_dropback.eq(1)];full=whole[gid];drives=g[g.fixed_drive.isin(normal.fixed_drive.unique())].groupby('fixed_drive')
  dp=drives.apply(lambda z:max(0,float(z.posteam_score_post.max()-z.posteam_score.min())))
  rz=drives.apply(lambda z:bool(z.yardline_100.le(20).any()));td=drives.apply(lambda z:bool((z.touchdown.eq(1)&z.td_team.eq(team)).any()))
  def avg(frame,col):return float(frame[col].mean()) if len(frame) else None
  row={'game_id':gid,'team':team,'opponent':g.defteam.iloc[0],'season':int(g.season.iloc[0]),'week':int(g.week.iloc[0]),'date':str(g.game_date.iloc[0]),'source_hash':source['sha256'],'off_ppd':float(dp.mean()),'off_ypp':avg(normal,'yards_gained'),'drives':len(dp),'plays_per_drive':len(normal)/len(dp),'rush_epa':avg(rush,'epa'),'rush_success':avg(rush,'success'),'pass_epa':avg(pas,'epa'),'cpoe':avg(pas,'cpoe'),'explosive':float(((normal.rush_attempt.eq(1)&normal.yards_gained.ge(10))|(normal.qb_dropback.eq(1)&normal.yards_gained.ge(20))).mean()),'redzone_td':float(td[rz].mean()) if rz.any() else None,'fg_points':int(g.field_goal_result.eq('made').sum()*3),'return_points':int((full.return_touchdown.eq(1)&full.td_team.eq(team)).sum()*6),'turnovers_lost':float(g.interception.fillna(0).sum()+g.fumble_lost.fillna(0).sum())}
  fum=full[full.fumble.eq(1)&(full.posteam.eq(team)|full.defteam.eq(team))];row['fumble_recovery']=float((fum.fumble_recovery_1_team.eq(team)|fum.fumble_recovery_2_team.eq(team)).mean()) if len(fum) else None
  targets=normal[normal.receiver_player_id.notna()];poss=[positions.get((row['season'],q)) for q in targets.receiver_player_id];valid=[x for x in poss if x]
  row['te_share']=sum(x=='TE' for x in valid)/len(valid) if valid else None;row['rb_share']=sum(x in ('RB','FB') for x in valid)/len(valid) if valid else None
  for lo,hi,name in [(0,39,'short'),(40,49,'medium'),(50,100,'long')]:
   kicks=g[g.kick_distance.between(lo,hi)&g.field_goal_result.isin(['made','missed','blocked'])];row['fg_'+name+'_made']=int(kicks.field_goal_result.eq('made').sum());row['fg_'+name+'_attempts']=len(kicks)
  rows.append(row)
  for q,z in pas.dropna(subset=['passer_player_id']).groupby('passer_player_id'):
   attempts=int((z.pass_attempt.eq(1)&z.sack.ne(1)).sum());sacks=int(z.sack.eq(1).sum());num=float(z.passing_yards.fillna(0).sum()+20*z.pass_touchdown.fillna(0).sum()-45*z.interception.fillna(0).sum()+z.loc[z.sack.eq(1),'yards_gained'].fillna(0).sum())
   qbs.append({'game_id':gid,'team':team,'season':row['season'],'week':row['week'],'qb':q,'attempts':attempts,'denominator':attempts+sacks,'numerator':num,'epa':avg(z,'epa'),'cpoe':avg(z,'cpoe'),'dropbacks':len(z),'source_hash':source['sha256']})
 return rows,qbs

def run():
 sources=json.loads((ROOT/'work/harvest-elo-v2/sources/manifest.json').read_text())['records'];current=json.loads((ROOT/'outputs/iron-man-v1/source-manifest.json').read_text())
 sources += [r for r in current if r['name']=='play_by_play_2026.parquet'];positions={};roster_hashes=[]
 for r in current:
  if r['name'].startswith('roster_'):
   p=ROOT/r['path'];assert sha(p)==r['sha256'];f=pd.read_parquet(p,columns=['season','gsis_id','position']);positions.update({(int(x.season),x.gsis_id):x.position for x in f.itertuples()});roster_hashes.append(r['sha256'])
 games=[];qbs=[];refs=[]
 for source in sources:
  year=int(Path(source['path']).name.split('_')[3].split('-')[0])
  if not 2014<=year<=2026:continue
  cache_key=hashlib.sha256(json.dumps([source['sha256'],sorted(roster_hashes),sha(__file__)]).encode()).hexdigest();cache=OUT/f'aggregate-{cache_key}.json'
  if cache.exists():d=json.loads(cache.read_text())
  else:
   a,b=aggregate(source,positions);d={'rows':a,'qbs':b};OUT.mkdir(parents=True,exist_ok=True);cache.write_text(json.dumps(clean(d),sort_keys=True,allow_nan=False))
  games+=d['rows'];qbs+=d['qbs'];refs.append({'kind':'pbp','sha256':source['sha256']});print('prepared',year,len(d['rows']),flush=True)
 # Results refresh is an nflverse schedule source. Explicit column selection is the trust boundary.
 refs_sched=sorted((ROOT/'outputs/model-pick-v1/result-refreshes').glob('*.json'))
 refs_sched+=sorted((ROOT/'outputs/model-pick-v1/daily').glob('*/results-ref.json'))
 ref=max((json.loads(p.read_text()) for p in refs_sched),key=lambda x:x.get('received_at',''));sp=Path(ref['path']);assert sha(sp)==ref['sha256']
 allowed='game_id season game_type week gameday gametime away_team home_team away_score home_score location roof stadium_id home_qb_id away_qb_id referee'.split();schedule=[]
 for r in csv.DictReader(sp.open()):
  if 2014<=int(r['season'])<=2026:
   x={k:r.get(k) for k in allowed};x['home_team']=canonical(x['home_team']);x['away_team']=canonical(x['away_team']);x['source_hash']=ref['sha256'];schedule.append(x)
 wref=json.loads((ROOT/'work/harvest-weather-followup-v1/forecast-manifest.json').read_text());wp=ROOT/wref['table'];assert sha(wp)==wref['sha256'];wind=[]
 for r in csv.DictReader(wp.open()):wind.append({k:r[k] for k in ['game_id','season','week','wind_mph','source_sha256','evidence']})
 manifest={'team_games':save('team-games',games),'qb_games':save('qb-games',qbs),'schedule':save('schedule',schedule),'wind':save('forecast-history',wind),'roster_source_hashes':roster_hashes,'raw_source_hashes':refs+[{'kind':'schedule','sha256':ref['sha256']},{'kind':'forecast','sha256':wref['sha256']}],'prepared_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 (ROOT/'work/projection-v1/source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');return manifest
if __name__=='__main__':run()
