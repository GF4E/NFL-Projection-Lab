"""Independent row recomputation, without diagnostic aggregate imports."""
from pathlib import Path
import json,hashlib
import pandas as pd
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).parent
reg=json.loads((ROOT/'work/e-qb-change/registration.json').read_text())
control=ROOT/reg['control'];sp=ROOT/next(x for x in reg['files'] if '/schedules-' in x)
for p in [control,sp]:assert hashlib.sha256(p.read_bytes()).hexdigest()==reg['files'][str(p.relative_to(ROOT))]
s=pd.read_csv(sp,keep_default_na=False);s=s[(s.game_type=='REG')&(s.home_score!='')&(s.away_score!='')].sort_values(['gameday','gametime','game_id'])
assert s.game_id.is_unique
long=pd.concat([s[['game_id','gameday','gametime',side+'_team',side+'_qb_id']].rename(columns={side+'_team':'team',side+'_qb_id':'qb'}).assign(side=side) for side in ['home','away']]).sort_values(['gameday','gametime','game_id'])
long['prior_qb']=long.groupby('team').qb.shift()
long['change']=np.where(long.prior_qb.notna()&(long.prior_qb!='')&(long.qb!=''),(long.qb!=long.prior_qb).astype(int),-1)
wide=long.pivot(index='game_id',columns='side',values='change')
wide['group']=np.where((wide==1).any(axis=1),'CHANGED',np.where((wide==0).all(axis=1),'STABLE','UNKNOWN'))
r=pd.read_json(control);assert r.game_id.is_unique and len(r)==2639
r=r.merge(wide[['group']],left_on='game_id',right_index=True,validate='one_to_one')
assert len(r)==2639
for side in ['home','away']:r[side+'_error']=r[side]-r['actual_'+side]
r['margin_error']=r.home_error-r.away_error

def stats(v):
 e=v[['home_error','away_error']].to_numpy().ravel()
 return {'games':len(v),'team_mae':float(np.abs(e).mean()),'team_bias':float(e.mean()),'margin_mae':float(v.margin_error.abs().mean()),'margin_bias':float(v.margin_error.mean())}
res={'control_sha256':hashlib.sha256(control.read_bytes()).hexdigest(),'groups':{g:stats(v) for g,v in r.groupby('group')},'by_season':{str(y):{g:stats(v) for g,v in yr.groupby('group')} for y,yr in r.groupby('season')},'unknown_games':r[r.group=='UNKNOWN'].game_id.tolist()}
(OUT/'independent-metrics.json').write_text(json.dumps(res,indent=2)+'\n')
r[['game_id','season','group','home_error','away_error','margin_error']].to_csv(OUT/'independent-rows.csv',index=False)
long[long.game_id.isin(r.game_id)].to_csv(OUT/'independent-starter-sides.csv',index=False)
print(json.dumps(res['groups'],indent=2))
