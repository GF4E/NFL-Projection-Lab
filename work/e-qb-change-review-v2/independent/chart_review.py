from pathlib import Path
import pandas as pd,json,hashlib
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).parent
reg=json.loads((ROOT/'work/e-qb-change/registration.json').read_text());sp=ROOT/next(x for x in reg['files'] if '/schedules-' in x)
s=pd.read_csv(sp,keep_default_na=False).set_index('game_id');sides=pd.read_csv(OUT/'independent-starter-sides.csv',keep_default_na=False);sides=sides[(sides.game_id.str[:4]=='2025')&(sides.change==1)]
p=ROOT/'work/iron-man-v1/sources/depth_charts_2025-14f74185b3c2c48df234ced284ba3596bda3333d0b2a8df40841f68cd34539fa.parquet';d=pd.read_parquet(p);d=d[(d.pos_abb=='QB')&(d.pos_rank==1)].copy();d['at']=pd.to_datetime(d.dt,utc=True)
rows=[]
for r in sides.to_dict('records'):
 g=s.loc[r['game_id']];lock=(pd.Timestamp(g.gameday+' '+g.gametime,tz='America/New_York')-pd.Timedelta(minutes=75)).tz_convert('UTC')
 sub=d[(d.team==r['team'])&(d["at"]<lock)&(d["at"]>=lock-pd.Timedelta(days=7))];latest=sub["at"].max();same=sub[sub["at"]==latest];ids=sorted(set(same.gsis_id.dropna())-{''});selected=ids[0] if len(ids)==1 else None
 rows.append({**r,'T75':lock.isoformat(),'chart_at':None if pd.isna(latest) else latest.isoformat(),'ids':ids,'status':'UNAMBIGUOUS_LISTED_QB' if len(ids)==1 else 'AMBIGUOUS' if ids else 'MISSING','chart_matches_actual':selected==r['qb'] if selected else None})
(OUT/'2025-chart-review.json').write_text(json.dumps({'source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'rule':'rank1 QB latest team snapshot in [T75-7d,T75); chart identity not announcement or engine lock','rows':rows},indent=2)+'\n')
f=pd.DataFrame(rows);print(f.status.value_counts());print(f.chart_matches_actual.value_counts());print('games',f.game_id.nunique(),'sides',len(f));print(f[f.chart_matches_actual==False][['game_id','team','qb','ids','chart_at','T75']].to_string(index=False))
