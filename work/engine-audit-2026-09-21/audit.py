"""Recompute the Week 2 teardown audit without writing any production artifact."""
import copy,csv,datetime as dt,gzip,hashlib,io,json,subprocess,sys
from pathlib import Path
from collections import Counter,defaultdict
from zoneinfo import ZoneInfo
import numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
OUT=Path(__file__).resolve().parent
SNAP='9b8ad491b78530b29475baae69e7ab3ca1b106c4'
from engine.projection_v3.model import predict,fit
from engine.projection_v3.qualify import read
from engine.projection.distribution import pmf,quantile,summarize
from engine.projection.grade import grade
from scripts.elo_hfa_deployed_gate import elo_features

def frozen(path):return json.loads(subprocess.check_output(['git','show',SNAP+':'+path],cwd=ROOT))
def stamp(s):return dt.datetime.fromisoformat(s.replace('Z','+00:00'))
def canonical(t):return {'LA':'LAR','STL':'LAR','LV':'OAK','WAS':'WSH','SD':'LAC'}.get(t,t)
def wilson(k,n):
 z=1.959963984540054;p=k/n;d=1+z*z/n;center=(p+z*z/(2*n))/d;half=z*np.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
 return [float(center-half),float(center+half)]
def metric(p,y):
 p=np.asarray(p,float);y=np.asarray(y,float);e=p-y;diff=np.diff(p,axis=1).ravel();actual=np.diff(y,axis=1).ravel();valid=actual!=0;k=int(np.sum(np.sign(diff[valid])==np.sign(actual[valid])))
 return dict(games=len(p),team_mae=float(np.abs(e).mean()),median_absolute_error=float(np.median(np.abs(e))),team_rmse=float(np.sqrt(np.mean(e*e))),team_bias=float(e.mean()),away_bias=float(e[:,0].mean()),home_bias=float(e[:,1].mean()),margin_mae=float(np.abs(np.diff(e,axis=1)).mean()),margin_bias=float(np.diff(e,axis=1).mean()),total_mae=float(np.abs(e.sum(1)).mean()),total_bias=float(e.sum(1).mean()),projected_sd=float(p.std()),actual_sd=float(y.std()),slope=float(np.cov(p.ravel(),y.ravel(),ddof=0)[0,1]/p.var()) if p.var()>1e-12 else None,winner_correct=k,winner_games=int(valid.sum()),winner_wilson95=wilson(k,int(valid.sum())),predicted_ties=int(np.sum(diff==0)))
def crps(mass,y):
 x=np.array(list(mass));p=np.array(list(mass.values()));return float(np.sum(p*np.abs(x-y))-.5*np.sum(p[:,None]*p[None,:]*np.abs(x[:,None]-x[None,:])))
def interval_score(lo,hi,y,level):
 alpha=1-level/100;return hi-lo+2/alpha*max(lo-y,0)+2/alpha*max(y-hi,0)
def bootstrap(delta,seed=20260921):
 rng=np.random.default_rng(seed);delta=np.asarray(delta);values=[]
 for _ in range(100):values.extend(delta[rng.integers(0,len(delta),(100,len(delta)))].mean(1))
 return np.quantile(values,[.025,.975]).tolist()
def run():
 for path in ['engine/projection_v3/model.py','engine/projection/features.py','engine/projection/distribution.py','engine/projection/grade.py','scripts/elo_hfa_deployed_gate.py']:
  assert (ROOT/path).read_bytes()==subprocess.check_output(['git','show',SNAP+':'+path],cwd=ROOT), 'Source drift requires a new audit: '+path
 board=frozen('outputs/projection-v3/board.json');feed=frozen('outputs/projection-v3/final-feed.json');cat=frozen('work/series-registry/catalog.json');ref=frozen('work/in-season-learning-v1/active-fit-ref.json');a=read(ref);shapes=read(a['shapes'])
 control=cat['authoritative_control'];sha=next(x['sha256'] for x in cat['series'] if x['path']==control and x.get('authoritative'));hist=read({'path':control,'sha256':sha})
 raw=(ROOT/'outputs/projection-v3/final-sources'/f"{feed['source_sha256']}.csv").read_bytes();assert hashlib.sha256(raw).hexdigest()==feed['source_sha256']
 schedule={}
 for r in csv.DictReader(io.StringIO(raw.decode())):
  if int(r['season'])<2015 or r['game_type']!='REG' or not r['home_score'] or not r['away_score']:continue
  r={k:r[k] for k in ['game_id','season','week','gameday','gametime','home_team','away_team','home_score','away_score','location']}
  r['season']=int(r['season']);r['home_team']=canonical(r['home_team']);r['away_team']=canonical(r['away_team']);r['home_score']=float(r['home_score']);r['away_score']=float(r['away_score'])
  r['kickoff']=dt.datetime.fromisoformat(r['gameday']+'T'+r['gametime']).replace(tzinfo=ZoneInfo('America/New_York'));schedule[r['game_id']]=r
 def baselines(gid,issuance=None):
  g=schedule[gid];t=stamp(issuance) if issuance else g['kickoff']-dt.timedelta(minutes=75);prior=[r for r in schedule.values() if r['season']==g['season']-1 and r['kickoff']+dt.timedelta(hours=4)<t];z=np.array([[r['away_score'],r['home_score']] for r in prior]);d={'league_mean':[float(z.mean())]*2,'league_median':[float(np.median(z))]*2,'venue_mean':z.mean(0).tolist(),'team_prior_season':[],'team_last4':[]}
  for s in ['away','home']:
   team=g[s+'_team'];vals=[r['home_score'] if r['home_team']==team else r['away_score'] for r in prior if team in (r['home_team'],r['away_team'])];d['team_prior_season'].append(float(np.mean(vals)))
   last=sorted([r for r in schedule.values() if team in (r['home_team'],r['away_team']) and r['kickoff']+dt.timedelta(hours=4)<t],key=lambda r:r['kickoff'])[-4:];d['team_last4'].append(float(np.mean([r['home_score'] if r['home_team']==team else r['away_score'] for r in last])))
  return d
 def compare(rows,issued=False):
  y=np.array([[r['actual_away'],r['actual_home']] for r in rows]);p=np.array([[r['away'],r['home']] for r in rows]);base=[baselines(r['game_id'],r.get('issued_at') if issued else None) for r in rows];out={'engine':metric(p,y)}
  for name in base[0]:
   b=np.array([r[name] for r in base]);v=metric(b,y);delta=np.abs(p-y).mean(1)-np.abs(b-y).mean(1);v['engine_minus_baseline_mae']=float(delta.mean());v['engine_minus_baseline_game_bootstrap95']=bootstrap(delta);out[name]=v
  return out
 result={'source_commit':SNAP,'board_published_at':board['published_at'],'board_sha256':board['content_sha256'],'authoritative_control':control,'control_sha256':sha,'control_generated_at':next(x['date_added'] for x in cat['series'] if x['path']==control and x.get('authoritative')),'fit_ref':ref,'version':a['version'],'pending_week2':[g['game_id'] for g in board['games'] if g['week']==2 and not g.get('final')],'definitions':{'bias':'projection minus actual','bootstrap':'10,000 paired-game draws; seed 20260921; descriptive, not a gate','baseline':'completed prior-season REG scores or prior four completed games, no market input','historical':'authoritative algorithmic rolling-origin, not archived historical live issuances'}}
 gs=[g for g in board['games'] if g['week']==2 and g.get('final') and g.get('projection') and g['evidence']=='AS_ISSUED'];rows=[];checks=[];intervals=defaultdict(list);scores=[];other_scores=defaultdict(list);pwin=[];outcomes=[]
 fits={}
 for folder in ['work/in-season-learning-v1','work/projection-v3','work/projection-v2','work/projection-v1']:
  for path in (ROOT/folder).glob('fit-*.json'):
   if path.name=='fit-ref.json':continue
   obj=json.loads(path.read_text());key=hashlib.sha256(json.dumps(obj['fit'],sort_keys=True,separators=(',',':')).encode()).hexdigest();fits[(obj.get('version'),key)]=(obj,path)
 for g in gs:
  gid=g['game_id'];p=g['projection'];final=g['final'];art,fp=fits[(g['version'],g['fit_sha256'])];assert hashlib.sha256(fp.read_bytes()).hexdigest()==fp.stem.rsplit('-',1)[-1];shape=read(art['shapes']);lock=frozen('outputs/projection-v3/locks/'+gid+'.json');gr=frozen('outputs/projection-v3/grades/'+gid+'.json')
  assert lock['projection']==gr['projection']==p;assert gr['grades']['PROJECTION']==grade(p,final['away_points'],final['home_points']);assert stamp(g['issued_at'])<stamp(g['cutoff_at'])<stamp(g['kickoff_at']);assert g['freeze_time']==g['cutoff_at'];assert not g.get('ours')
  assert all(final[s+'_points']==feed['games'][gid][s+'_score']==schedule[gid][s+'_score'] for s in ['away','home'])
  maxdiff=0.
  for s in ['away','home']:
   f=copy.deepcopy(lock['learning_features'][s]['features']);f['wind']=lock['forecast']['wind_mph'] if lock.get('forecast') and 'wind' in art['groups'] else None
   pred=predict(art['fit'],f)['points'];maxdiff=max(maxdiff,abs(pred-p[s+'_points']));assert abs(sum(c['points'] for c in g['contributions'][s])-pred)<1e-9
   assert lock['learning_features'][s]['actual_points'] is None
   mass=pmf(shape['team_points'],p[s+'_points']);scores.append(crps(mass,final[s+'_points']))
   for level in [50,80]:
    lo,hi=quantile(mass,(1-level/100)/2),quantile(mass,1-(1-level/100)/2);intervals[('team',level)].append((lo<=final[s+'_points']<=hi,hi-lo,interval_score(lo,hi,final[s+'_points'],level)))
  assert maxdiff<1e-9
  for target in ['margin','total']:
   other_scores[target].append(crps(pmf(shape[target],p[target]),final[target]))
   for level in [50,80]:
    lo,hi=p['intervals'][target][str(level)];intervals[(target,level)].append((lo<=final[target]<=hi,hi-lo,interval_score(lo,hi,final[target],level)))
  pwin.append(p['home_win_probability']);outcomes.append(float(final['margin']>0) if final['margin'] else .5)
  checks.append({'game_id':gid,'version':g['version'],'max_reproduction_difference':maxdiff,'lock_grade_final_match':True,'issued_at':g['issued_at'],'hours_before_cutoff':(stamp(g['cutoff_at'])-stamp(g['issued_at'])).total_seconds()/3600,'fit_hash_matches':g['fit_sha256']==hashlib.sha256(json.dumps(art['fit'],sort_keys=True,separators=(',',':')).encode()).hexdigest()})
  rows.append(dict(game_id=gid,season=g['season'],week=g['week'],away=p['away_points'],home=p['home_points'],actual_away=final['away_points'],actual_home=final['home_points'],issued_at=g['issued_at'],version=g['version']))
 result['week2']=compare(rows,True);result['current_hfa_week2']=compare([r for r in rows if r['version']==a['version']],True);result['checks']=checks;result['week2_rows']=rows
 result['probabilities']={'brier':float(np.mean((np.array(pwin)-outcomes)**2)),'coin_brier':.25,'brier_difference_bootstrap95':bootstrap((np.array(pwin)-outcomes)**2-.25),'winner_correct':sum((p>.5)==(y>.5) for p,y in zip(pwin,outcomes)),'games':len(gs),'team_crps':float(np.mean(scores)),'margin_crps':float(np.mean(other_scores['margin'])),'total_crps':float(np.mean(other_scores['total'])),'reliability':[]}
 for lo,hi in [(0,.4),(.4,.5),(.5,.6),(.6,.7),(.7,1.01)]:
  ix=[i for i,p in enumerate(pwin) if lo<=p<hi]
  if ix:result['probabilities']['reliability'].append({'band':[lo,hi],'n':len(ix),'mean_p_home':float(np.mean(np.array(pwin)[ix])),'actual_home_share':float(np.mean(np.array(outcomes)[ix]))})
 result['intervals']={f'{k[0]}_{k[1]}':{'n':len(v),'hits':sum(x[0] for x in v),'coverage':float(np.mean([x[0] for x in v])),'paired_game_bootstrap95':bootstrap(np.array([x[0] for x in v],float).reshape(-1,2).mean(1) if k[0]=='team' else [x[0] for x in v]),'mean_width':float(np.mean([x[1] for x in v])),'winkler':float(np.mean([x[2] for x in v]))} for k,v in intervals.items()}
 result['historical']=compare(hist);result['historical_by_season']={str(y):compare([r for r in hist if r['season']==y]) for y in range(2016,2026)}
 weekly=[]
 for y,w in sorted({(r['season'],r['week']) for r in hist}):
  rr=[r for r in hist if r['season']==y and r['week']==w];m=metric([[r['away'],r['home']] for r in rr],[[r['actual_away'],r['actual_home']] for r in rr]);weekly.append({'season':y,'week':w,**m})
 wm=result['week2']['engine']['team_mae'];result['weekly_context']={'historical_weeks':len(weekly),'weeks_with_at_least_this_mae':sum(r['team_mae']>=wm for r in weekly),'historical_week2': [r for r in weekly if r['week']==2],'week2s_with_at_least_this_mae':sum(r['team_mae']>=wm for r in weekly if r['week']==2)}
 through_sunday=[]
 for y in range(2016,2026):
  rr=[r for r in hist if r['season']==y and r['week']==2]
  sunday=max(schedule[r['game_id']]['kickoff'].astimezone(ZoneInfo('America/Los_Angeles')).date() for r in rr if schedule[r['game_id']]['kickoff'].weekday()==6)
  cutoff=dt.datetime.combine(sunday+dt.timedelta(days=1),dt.time(6),tzinfo=ZoneInfo('America/Los_Angeles'))
  rr=[r for r in rr if schedule[r['game_id']]['kickoff']+dt.timedelta(hours=4)<cutoff]
  through_sunday.append({'season':y,'cutoff':cutoff.isoformat(),**metric([[r['away'],r['home']] for r in rr],[[r['actual_away'],r['actual_home']] for r in rr])})
 result['weekly_context']['historical_week2_through_monday06']=through_sunday
 # An equal-season block bootstrap preserves arbitrary dependence inside each season.
 annual=[result['historical_by_season'][str(y)]['league_mean']['engine_minus_baseline_mae'] for y in range(2016,2026)]
 result['season_block_baseline_check']={'estimand':'equal-season mean team MAE difference, engine minus prior-season league mean','difference':float(np.mean(annual)),'bootstrap95':bootstrap(annual),'seasons_engine_better':sum(v<0 for v in annual)}
 histrows=read(a['historical_features']);current=json.loads(gzip.decompress((ROOT/'work/e-elo-hfa-release/parent-week1-features.json.gz').read_bytes()));manifest=json.loads((ROOT/'work/e-elo-hfa-release/parent-source-manifest.json').read_text());mod=elo_features(read(manifest['schedule']),{int(k):v for k,v in a['elo_hfa'].items()})
 for r in current:r['features'].update(mod[r['game_id'],r['team']])
 train=histrows+[r for r in current if r['week']<=a['through_week'] and r.get('actual_points') is not None and r['features'].get('baseline') is not None];f=fit(train,a['groups'],a['selected'][1]);assert f==a['fit'];result['fit_reproduction']={'training_rows':len(train),'current_season_rows':len(current),'exact_match':True,'training_hash':f['training_hash'],'groups':a['groups'],'features':a['fit']['names'],'coefficients':a['fit']}
 # Independent augmented least-squares computation, without the engine normal-equation solver.
 ordered=sorted(train,key=lambda r:r['row_id']);x=np.array([[r['features'][n] for n in f['names']] for r in ordered],float);measured=np.isfinite(x);means=np.array([x[measured[:,j],j].mean() for j in range(x.shape[1])]);scales=np.array([x[measured[:,j],j].std() for j in range(x.shape[1])]);z=np.where(measured,(x-means)/scales,0.);y=np.array([r['actual_points']-r['features']['baseline'] for r in ordered]);aug=np.vstack([z,np.sqrt(f['penalty'])*np.eye(z.shape[1])]);beta=np.linalg.lstsq(aug,np.r_[y-y.mean(),np.zeros(z.shape[1])],rcond=None)[0]
 assert np.allclose(beta,f['coefficients'],rtol=0,atol=1e-12)
 result['fit_reproduction']['independent_augmented_least_squares_max_coefficient_delta']=float(np.max(np.abs(beta-f['coefficients'])))
 result['fit_reproduction']['raw_point_formula']={'intercept':float(f['intercept']-np.sum(np.array(f['coefficients'])*np.array(f['means'])/np.array(f['scales']))),'coefficients':{n:float(b/sc+(1 if n=='baseline' else 0)) for n,b,sc in zip(f['names'],f['coefficients'],f['scales'])}}
 sample=copy.deepcopy(gs[1]['learning_features']['home']['features']);base=predict(a['fit'],sample)['points'];perturbed=copy.deepcopy(sample);perturbed.update(home_divisional=1.,home_nondivisional=1.,neutral=1.,qb_epa=2.,qb_cpoe=100.,wind=60.,rest_days=30.)
 result['inactive_sensitivity']={'original':base,'changed_venue_qb_wind_rest':predict(a['fit'],perturbed)['points'],'point_change':predict(a['fit'],perturbed)['points']-base,'scope':'Hold retained baseline/Elo fixed; these direct features are absent from the fit.'}
 residual_means={k:sum(int(x)*n for x,n in d['counts'].items())/d['n'] for k,d in shapes.items()};z=summarize(24.,24.,shapes);result['distribution_lineage']={'shape_ref':a['shapes'],'residual_means':residual_means,'equal24_home_probability':z['home_win_probability'],'equal24_distribution_expected_margin':residual_means['margin'],'equal24_distribution_expected_total':48+residual_means['total'],'point_total':48,'historical_hfa_actual_minus_projection':{'team_points':-result['historical']['engine']['team_bias'],'margin':-result['historical']['engine']['margin_bias'],'total':-result['historical']['engine']['total_bias']}}
 oldref=frozen('work/in-season-learning-v1/reference.json');result['trend_reference']={'reference_path':oldref['oof']['path'],'reference_mae':oldref['metrics']['team_points_mae'],'authoritative_mae':result['historical']['engine']['team_mae'],'match':oldref['oof']['path']==control}
 result['largest_misses']=sorted([{'game_id':g['game_id'],'team':g[s],'prediction':g['projection'][s+'_points'],'actual':g['final'][s+'_points'],'error':g['projection'][s+'_points']-g['final'][s+'_points'],'contributions':g['contributions'][s]} for g in gs for s in ['away','home']],key=lambda r:-abs(r['error']))[:10]
 result['source_files']={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['engine/projection/features.py','engine/projection_v3/model.py','engine/projection/distribution.py','scripts/projection_v3_prepare.py','scripts/projection_v3_publish.py']}
 (OUT/'results.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n');print(json.dumps({k:result[k] for k in ['week2','fit_reproduction','inactive_sensitivity','distribution_lineage','weekly_context']},indent=2))
if __name__=='__main__':run()
