"""Fixed per-drive baseline plus qualified, additive ridge corrections."""
import math
import numpy as np
from engine.projection.model import hash_value

GROUPS = {
 'quarterback':['qb_epa','qb_cpoe','qb_career_starts','qb_backup'],
 'pressure':['pressure_generated','pressure_allowed'],
 'career_kicking':['career_fg_short','career_fg_medium','career_fg_long'],
 'calibration':['baseline'],
 'venue':['home_divisional','home_nondivisional','divisional','neutral'],
 'efficiency':['off_off_ppd','def_off_ppd','off_off_ypp','def_off_ypp'],
 'pace':['drives','opponent_drives','plays_per_drive'],
 'passing':['off_pass_epa','def_pass_epa','off_cpoe','def_cpoe'],
 'rushing':['off_rush_epa','def_rush_epa','off_rush_success','def_rush_success'],
 'explosiveness':['off_explosive','def_explosive'],
 'kicking':['season_fg_short','season_fg_medium','season_fg_long'],
 'target_shares':['te_share','rb_share'],
 'momentum':['momentum'],
 'scoring_composition':['redzone_td','return_points','fg_share'],
 'turnovers_luck':['turnover_margin','fumble_recovery','close_win_rate','luck_index'],
 'elo':['elo','elo_difference'],
 'schedule_strength':['schedule_strength'],
 'pythagorean':['pythagorean'],
 'rest_travel':['rest_days','travel_miles'],
 'wind':['wind'],
}

def fit(rows,groups,penalty):
 rows=sorted(rows,key=lambda r:r['row_id']);groups=sorted(groups);names=sorted({n for g in groups for n in GROUPS[g]})
 if len({r['row_id'] for r in rows})!=len(rows) or not rows:raise ValueError('Unique nonempty training rows required')
 y=np.asarray([r['actual_points']-r['features']['baseline'] for r in rows]);x=np.asarray([[r['features'][n] for n in names] for r in rows],dtype=float).reshape(len(rows),len(names))
 if not np.isfinite(y).all():raise ValueError('Finite scores and baseline required')
 measured=np.isfinite(x);means=np.array([x[measured[:,j],j].mean() if measured[:,j].any() else 0. for j in range(len(names))]);scales=np.array([x[measured[:,j],j].std() if measured[:,j].any() else 1. for j in range(len(names))]);scales=np.where(scales>0,scales,1.);z=np.zeros_like(x)
 for j in range(len(names)):z[measured[:,j],j]=(x[measured[:,j],j]-means[j])/scales[j]
 intercept=float(y.mean()) if 'calibration' in groups else 0.
 b=np.linalg.solve(z.T@z+np.eye(len(names))*penalty,z.T@(y-intercept)) if names else np.array([])
 return {'groups':groups,'names':names,'means':means.tolist(),'scales':scales.tolist(),'coefficients':b.tolist(),'intercept':intercept,'penalty':penalty,'training_hash':hash_value([[r['row_id'],r['actual_points'],r['features']['baseline'],[r['features'][n] for n in names]] for r in rows])}

def predict(f,features):
 base=features.get('baseline')
 if base is None or not math.isfinite(base):raise ValueError('Measured football baseline required')
 terms=[{'input':'football_baseline','group':'baseline','points':base,'value':base,'status':'ACTIVE','weight':1.}]
 for n,m,s,b in zip(f['names'],f['means'],f['scales'],f['coefficients']):
  v=features.get(n);active=v is not None and math.isfinite(v);g=next(g for g in f['groups'] if n in GROUPS[g])
  terms.append({'input':n,'group':g,'value':v,'points':(v-m)/s*b if active else 0.,'status':'ACTIVE' if active else 'INACTIVE','weight':b if active else 0.})
 if 'calibration' in f['groups']:terms.append({'input':'calibration_intercept','group':'calibration','value':1.,'points':f['intercept'],'status':'ACTIVE','weight':f['intercept']})
 return {'points':math.fsum(t['points'] for t in terms),'contributions':terms}
