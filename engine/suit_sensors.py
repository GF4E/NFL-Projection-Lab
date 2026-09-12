"""As-of descriptive sensors. No odds calls, number adjustments, or promotion."""
import hashlib,json
from pathlib import Path
import numpy as np
import pandas as pd
from engine.t75_prepare import TEAMS
from engine.harvest import canonical
ROOT=Path(__file__).resolve().parents[1]
METRICS=['epa','success','yards_per_play','points_per_drive','rush_epa','rush_success','pass_epa','pass_success','cpoe','pressure_rate','explosive_rate','epa_pressured']
DEFINITION={'ridge_penalty':1.,'season_blend':'Weeks 1..5: prior season (6-week)/5, current (week-1)/5; Week 6 onward current only. Each team-season receives its declared total weight across its games. Missing current-season games use prior season only through Week 5, explicitly marked PARTIAL.','population':'REG only; completed games before as-of and prior to target week','explosive':'Rush gain >=10 or pass gain >=20 yards','success':'EPA > 0, nflverse success','pressure':'FTN was_pressure via nflverse participation, never inferred from sacks/hits','momentum':'Last four observed games versus own blended mean and standard deviation; mean of YPP z, points-for z, negative points-against z; untested descriptive only'}

def clean(x):
 if isinstance(x,dict):return {str(k):clean(v) for k,v in x.items()}
 if isinstance(x,list):return [clean(v) for v in x]
 if isinstance(x,(np.integer,np.floating)):x=x.item()
 if isinstance(x,float) and not np.isfinite(x):return None
 return x

def load_sources(manifest):
 frames={};hashes={}
 for r in manifest:
  p=ROOT/r['path'];raw=p.read_bytes()
  if hashlib.sha256(raw).hexdigest()!=r['sha256']:raise ValueError('Sensor source hash mismatch')
  frames[r['name']]=(pd.read_csv(p) if p.suffix=='.csv' else pd.read_parquet(p));hashes[r['name']]=r['sha256']
 return frames,hashes

def aggregate(frames,season,week,asof):
 allp=pd.concat([v for k,v in frames.items() if k.startswith('play_by_play_')],ignore_index=True)
 p=allp[(allp.season_type=='REG') & ((allp.season<season)|((allp.season==season)&(allp.week<week))) & (pd.to_datetime(allp.game_date,utc=True)<pd.Timestamp(asof))].copy()
 p=p[p.season.isin([season-1,season])];p['posteam']=p.posteam.map(canonical);p['defteam']=p.defteam.map(canonical)
 parts=[v.rename(columns={'nflverse_game_id':'game_id'})[['game_id','play_id','was_pressure']] for k,v in frames.items() if k.startswith('pbp_participation_')]
 if parts:p=p.merge(pd.concat(parts).drop_duplicates(['game_id','play_id']),on=['game_id','play_id'],how='left',validate='many_to_one')
 else:p['was_pressure']=np.nan
 roster=pd.concat([v for k,v in frames.items() if k.startswith('roster_')],ignore_index=True).drop_duplicates(['season','gsis_id'])
 positions={(r.season,r.gsis_id):r.position for r in roster.itertuples()}
 p['receiver_position']=[positions.get((s,q)) for s,q in zip(p.season,p.receiver_player_id)]
 rows=[]
 for (gid,team),g in p.dropna(subset=['posteam','defteam']).groupby(['game_id','posteam']):
  normal=g[(g.play_type.isin(['run','pass']))&(g.qb_kneel!=1)&(g.qb_spike!=1)]
  if normal.empty:continue
  rush=normal[normal.rush_attempt==1];passing=normal[normal.qb_dropback==1];pressure=passing[passing.was_pressure.notna()];targets=normal[normal.receiver_player_id.notna()]
  whole=p[p.game_id==gid];home=canonical(g.home_team.iloc[0]);op=g.defteam.iloc[0];hs=float(g.home_score.iloc[-1]);aws=float(g.away_score.iloc[-1]);pf=hs if team==home else aws;pa=aws if team==home else hs
  g=g.copy();g['offensive_td']=(g.touchdown.eq(1)&g.td_team.map(canonical).eq(team)).astype(int)
  drives=g.groupby('fixed_drive').agg(redzone=('yardline_100',lambda x:bool((x<=20).any())),td=('offensive_td','max'))
  def avg(f,c):return float(f[c].mean()) if len(f) else np.nan
  pts_drive=g.groupby('fixed_drive').apply(lambda x:max(0.,float(x.posteam_score_post.max()-x.posteam_score.min())))
  fumbles=whole[(whole.fumble==1)&((whole.posteam==team)|(whole.defteam==team))];rec=((fumbles.fumble_recovery_1_team.map(canonical)==team)|(fumbles.fumble_recovery_2_team.map(canonical)==team)).sum()
  r=dict(game_id=gid,team=team,opponent=op,season=int(g.season.iloc[0]),week=int(g.week.iloc[0]),date=str(g.game_date.iloc[0]),plays=len(normal),points_for=pf,points_against=pa,epa=avg(normal,'epa'),success=avg(normal,'success'),yards_per_play=avg(normal,'yards_gained'),points_per_drive=float(pts_drive.mean()),rush_epa=avg(rush,'epa'),rush_success=avg(rush,'success'),pass_epa=avg(passing,'epa'),pass_success=avg(passing,'success'),cpoe=avg(passing,'cpoe'),pressure_rate=avg(pressure,'was_pressure'),explosive_rate=float(((normal.rush_attempt.eq(1)&normal.yards_gained.ge(10))|(normal.qb_dropback.eq(1)&normal.yards_gained.ge(20))).mean()),epa_pressured=avg(pressure[pressure.was_pressure==True],'epa'),te_target_share=float(targets.receiver_position.eq('TE').mean()) if len(targets) else np.nan,rb_target_share=float(targets.receiver_position.isin(['RB','FB']).mean()) if len(targets) else np.nan,redzone_td_rate=float(drives[drives.redzone].td.mean()),fg_share=float(g.field_goal_result.eq('made').sum()*3/pf) if pf else np.nan,turnovers_lost=float(g.interception.sum()+g.fumble_lost.sum()),fumbles_in_game=len(fumbles),fumbles_recovered=int(rec),close_game=int(abs(pf-pa)<=7),close_win=int(pf>pa and abs(pf-pa)<=7))
  defensive=g[(g.return_touchdown==1)&g.td_team.map(canonical).eq(op)];r['def_st_td_points']=int(whole[(whole.return_touchdown==1)&whole.td_team.map(canonical).eq(team)].shape[0]*6)
  rows.append(r)
 data=pd.DataFrame(rows)
 if data.empty:raise ValueError('No as-of team games')
 data['turnover_margin']=[float(data[(data.game_id==r.game_id)&(data.team==r.opponent)].turnovers_lost.sum()-r.turnovers_lost) for r in data.itertuples()]
 return data,p

def ratings(data,season,week):
 teams=sorted({canonical(t) for t in TEAMS});idx={t:i for i,t in enumerate(teams)};n=len(teams);previous=max(0.,(6-week)/5) if week<=5 else 0.;current=1-previous
 d=data.copy();d['weight']=0.
 for (t,s),g in d.groupby(['team','season']):
  w=previous if s==season-1 else current
  if s==season-1 and week<=5 and not ((d.team==t)&(d.season==season)).any():w=1.
  d.loc[g.index,'weight']=w/len(g)
 out={t:{} for t in teams}
 for metric in METRICS:
  a=d[d[metric].notna()&d.weight.gt(0)].copy()
  if a.empty:continue
  x=np.zeros((len(a),1+2*n));x[:,0]=1
  for i,r in enumerate(a.itertuples()):x[i,1+idx[r.team]]=1;x[i,1+n+idx[r.opponent]]=1
  w=a.weight.to_numpy();y=a[metric].to_numpy();pen=np.eye(1+2*n)*DEFINITION['ridge_penalty'];pen[0,0]=0
  b=np.linalg.solve(x.T@(w[:,None]*x)+pen,x.T@(w*y))
  for defense in (False,True):
   vals={t:float(b[0]+b[1+(n if defense else 0)+idx[t]]) for t in teams}
   # Defense pressure rate means pressure generated: higher is better.
   higher=(not defense) if metric != "pressure_rate" else defense
   ordered=sorted(vals,key=lambda t:((-1 if higher else 1)*vals[t],t))
   for t in teams:
    sample=a[a.opponent.eq(t) if defense else a.team.eq(t)];key=('def_' if defense else 'off_')+metric
    out[t][key]={'raw':float(np.average(sample[metric],weights=sample.weight)) if len(sample) else None,'adjusted':vals[t] if len(sample) else None,'rank':ordered.index(t)+1 if len(sample) else None,'n_games':len(sample),'n_plays':int(sample.plays.sum()),'status':'MEASURED' if len(sample) else 'UNKNOWN'}
 return out,d

def build(manifest,season,week,asof):
 frames,hashes=load_sources(manifest);data,p=aggregate(frames,season,week,asof);rated,weighted=ratings(data,season,week)
 teams={}
 for team,metrics in rated.items():
  g=weighted[weighted.team==team].sort_values(['season','week']);eligible=g[g.weight.gt(0)];components={}
  for field,sign in [('yards_per_play',1),('points_for',1),('points_against',-1)]:
   if eligible.empty:components[field]=None;continue
   mean=np.average(eligible[field],weights=eligible.weight);sd=np.sqrt(np.average((eligible[field]-mean)**2,weights=eligible.weight));components[field]=float(sign*(g.tail(4)[field].mean()-mean)/sd) if sd>0 else None
  roll=float(np.mean(list(components.values()))) if all(v is not None for v in components.values()) else None
  composition={k:{'value':float(np.average(eligible[k].dropna(),weights=eligible.loc[eligible[k].notna(),'weight'])) if eligible[k].notna().any() else None,'n_games':int(eligible[k].notna().sum())} for k in ['redzone_td_rate','fg_share','turnover_margin','def_st_td_points','te_target_share','rb_target_share']}
  composition.update(fumble_recovery={'value':float(eligible.fumbles_recovered.sum()/eligible.fumbles_in_game.sum()) if eligible.fumbles_in_game.sum() else None,'n_fumbles':int(eligible.fumbles_in_game.sum())},close_games={'wins':int(g.close_win.sum()),'n':int(g.close_game.sum())},luck_index={'value':None,'status':'MEASURE','reason':'No year-to-year stability study registered as positive'})
  depth=frames.get(f'depth_charts_{season}.parquet',pd.DataFrame());qb={}
  if not depth.empty:
   z=depth[(depth.team.map(canonical)==team)&(depth.pos_abb=='QB')&(depth.pos_rank==1)&(pd.to_datetime(depth.dt,utc=True)<=pd.Timestamp(asof))].sort_values('dt')
   if len(z):qb={'name':str(z.iloc[-1].player_name),'gsis_id':str(z.iloc[-1].gsis_id),'depth_at':str(z.iloc[-1]['dt']),'identity_status':'DEPTH_CHART_NOT_INACTIVES'}
  q=p[p.passer_player_id==qb.get('gsis_id')];q=q[(q.qb_dropback==1)&(q.play_type=="pass")]
  weights=q.season.map(lambda s: max(0.,(6-week)/5) if s==season-1 and week<=5 else ((week-1)/5 if week<=5 else 1.) if s==season else 0.)
  if week<=5 and not q.season.eq(season).any():weights=q.season.eq(season-1).astype(float)
  def qmean(col):
   mask=q[col].notna() & weights.gt(0);return float(np.average(q.loc[mask,col],weights=weights[mask])) if mask.any() else None
  qb.update(epa_per_dropback=qmean('epa') if len(q) else None,cpoe=qmean('cpoe'),n_dropbacks=len(q),backup_flag=None,career_starts=None,career_starts_status='UNKNOWN: most-attempts games are not official career starts',status='inactives unknown until T-90')
  schedules=frames.get('schedules.csv',pd.DataFrame())
  if not schedules.empty and qb.get('gsis_id'):
   sched=schedules[(schedules.game_type=='REG') & (pd.to_datetime(schedules.gameday,utc=True)<pd.Timestamp(asof)) & ((schedules.season<season)|((schedules.season==season)&(schedules.week<week))) & schedules.home_score.notna()]
   qb['career_starts']=int((sched.home_qb_id.eq(qb['gsis_id'])|sched.away_qb_id.eq(qb['gsis_id'])).sum());qb['career_starts_status']='nflverse listed REG starters, 1999 onward, through prior week'
  ngs=frames['ngs_passing.parquet'];ngs=ngs[(ngs.player_gsis_id==qb.get('gsis_id'))&(ngs.week>0)&((ngs.season==season-1)|((ngs.season==season)&(ngs.week<week)))].copy()
  ngs['weight']=ngs.season.map(lambda s:max(0.,(6-week)/5) if s==season-1 and week<=5 else ((week-1)/5 if week<=5 else 1.) if s==season else 0.)
  if week<=5 and not ngs.season.eq(season).any():ngs['weight']=ngs.season.eq(season-1).astype(float)
  valid=ngs.completion_percentage_above_expectation.notna() & ngs.weight.gt(0) & ngs.attempts.gt(0);ngs=ngs[valid]
  qb['ngs_cpoe']=float(np.average(ngs.completion_percentage_above_expectation,weights=ngs.attempts*ngs.weight)) if len(ngs) else None;qb['ngs_n_games']=len(ngs)
  teams[team]={'metrics':metrics,'composition':composition,'qb':qb,'momentum':{'value':roll,'components':components,'n_games':min(4,len(g)),'status':'UNMEASURED predictive value','base_rates':None,'eliminated_status':'NOT_APPLICABLE' if week<12 else 'UNKNOWN'},'support':{'te_run_block_snap_share':None,'status':'UNKNOWN: participation identifies presence, not run-block responsibility'},'current_games':int(g.season.eq(season).sum()),'prior_games':int(g.season.eq(season-1).sum()),'source_hashes':hashes}
 return clean({'schema':'suit-sensors-v1','season':season,'week':week,'as_of':asof,'definitions':DEFINITION,'data_window':f'{season-1} REG through {season} Week {week-1}','source_hashes':hashes,'teams':teams,'status':'PARTIAL' if any(t['current_games']<week-1 for t in teams.values()) else 'CURRENT','evidence':'Descriptive only; no harvested adjustment is promoted'})
