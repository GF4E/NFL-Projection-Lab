"""Nested season-origin feature qualification and strictly prior-error calibration."""
import copy,gzip,hashlib,json,math
from collections import defaultdict
from pathlib import Path
import numpy as np
from engine.projection.model import hash_value
from engine.projection.features import build
from engine.projection.distribution import residual_distribution,summarize
from engine.projection.grade import grade,score
from .model import GROUPS,fit,predict
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'work/projection-v2'

def read(ref):
 raw=(ROOT/ref['path']).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=ref['sha256']:raise ValueError('Pinned hash mismatch')
 return json.loads(raw)

def save(name,value):
 raw=(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode();sha=hashlib.sha256(raw).hexdigest();p=OUT/(name+'-'+sha+'.json');p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists() and p.read_bytes()!=raw:raise ValueError('Immutable record differs')
 p.write_bytes(raw);return {'path':str(p.relative_to(ROOT)),'sha256':sha}

def paired(rows,predictions):
 by=defaultdict(dict)
 for r,p in zip(rows,predictions):by[r['game_id']]['home' if r['home'] else 'away']=(r,p)
 result=[]
 for gid,v in sorted(by.items()):
  if len(v)!=2:raise ValueError('Unpaired population')
  h,hp=v['home'];a,ap=v['away'];ha,aa=h['actual_points'],a['actual_points']
  result.append({'game_id':gid,'season':h['season'],'week':h['week'],'home':hp,'away':ap,'actual_home':ha,'actual_away':aa,'loss':[.5*(abs(ha-hp)+abs(aa-ap)),abs((ha-aa)-(hp-ap)),abs((ha+aa)-(hp+ap))]})
 return result

def block_interval(rows,values,seed=9132026,reps=10000):
 """Resample contiguous three-week blocks within each season, paired game rows."""
 values=np.asarray(values,dtype=float);rng=np.random.default_rng(seed);num=np.zeros(reps);den=np.zeros(reps)
 for year in sorted({r['season'] for r in rows}):
  weeks=sorted({r['week'] for r in rows if r['season']==year});weekly=[]
  for w in weeks:
   idx=[i for i,r in enumerate(rows) if r['season']==year and r['week']==w];weekly.append((float(values[idx].sum()),len(idx)))
  a=np.asarray(weekly);n=len(a);length=min(3,n);starts=rng.integers(0,n-length+1,size=(reps,math.ceil(n/length)));idx=(starts[:,:,None]+np.arange(length)).reshape(reps,-1)[:,:n];num+=a[idx,0].sum(axis=1);den+=a[idx,1].sum(axis=1)
 samples=num/den
 return {'lower95':float(np.quantile(samples,.025)),'upper95':float(np.quantile(samples,.975)),'one_sided95_lower':float(np.quantile(samples,.05)),'method':'paired within-season moving blocks, length 3 weeks','replicates':reps}

def gate(candidate,control,eligible_years,interval=False):
 c={r['game_id']:r for r in control};a=[r for r in candidate if r['season'] in eligible_years];b=[c[r['game_id']] for r in a]
 if not a:return {'pass':False,'reason':'INSUFFICIENT_OOF_HISTORY','eligible_seasons':[],'paired_n':0}
 if any(x['season']!=y['season'] or x['actual_home']!=y['actual_home'] or x['actual_away']!=y['actual_away'] for x,y in zip(a,b)):raise ValueError('Unequal paired outcomes')
 losses=np.asarray([r['loss'] for r in a]);base=np.asarray([r['loss'] for r in b]);gains=base-losses;mean=gains.mean(axis=0);den=base[:,0].mean();byyear={str(y):float(gains[[r['season']==y for r in a],0].mean()) for y in sorted(eligible_years)};positive=sum(x>0 for x in byyear.values());ok=len(eligible_years)>=3 and mean[0]/den>=.005 and min(mean[1:])>=0 and positive>=math.ceil(.6*len(eligible_years))
 out={'pass':bool(ok),'reason':'QUALIFIED' if ok else ('INSUFFICIENT_OOF_HISTORY' if len(eligible_years)<3 else 'FAILED_USEFULNESS_GATE'),'paired_n':len(a),'eligible_seasons':sorted(eligible_years),'positive_seasons':positive,'candidate_mae':dict(zip(['team_points','margin','total'],losses.mean(axis=0).tolist())),'control_mae':dict(zip(['team_points','margin','total'],base.mean(axis=0).tolist())),'mae_improvement':dict(zip(['team_points','margin','total'],mean.tolist())),'relative_team_improvement':float(mean[0]/den),'season_team_improvement':byyear}
 if interval:out['team_improvement_interval']=block_interval(a,gains[:,0])
 return out

def residuals(predictions):
 result={'team_points':[],'margin':[],'total':[]}
 for r in predictions:
  he=r['actual_home']-r['home'];ae=r['actual_away']-r['away'];result['team_points'] += [he,ae];result['margin'].append(he-ae);result['total'].append(he+ae)
 source=hash_value(predictions)
 return {k:residual_distribution(v,source) for k,v in result.items()}

def prior_shapes(predictions,year):
 prior=[r for r in predictions if r['season']<year]
 return residuals(prior) if prior else None

class Study:
 def __init__(self,prepared):
  self.prepared=prepared;self.cache={};self.availability={};self.raw=[]
  for year in range(2016,2026):
   test=self.test_rows('none',year);self.raw+=paired(test,[r['features']['baseline'] for r in test])
  for group,names in GROUPS.items():
   self.availability[group]={}
   for year in range(2016,2026):
    train=self.train_rows('none',year);test=self.test_rows('none',year);trained=any(any(r['features'].get(n) is not None for n in names) for r in train);games={r['game_id'] for r in test if any(r['features'].get(n) is not None for n in names)}
    self.availability[group][str(year)]={'prior_training_observed':trained,'observed_test_games':len(games),'eligible':trained and len(games)>=100}
 def train_rows(self,key,year):return [r for r in self.prepared[key] if r['season']<year and r['actual_points'] is not None and r['features']['baseline'] is not None]
 def test_rows(self,key,year):return [r for r in self.prepared[key] if r['season']==year and r['actual_points'] is not None and r['features']['baseline'] is not None]
 def eligible(self,group,before):return {int(y) for y,d in self.availability[group].items() if int(y)<before and d['eligible']}
 def evaluate(self,groups):
  groups=tuple(sorted(groups))
  if groups in self.cache:return self.cache[groups]
  if not groups:
   result={'predictions':self.raw,'settings':{str(y):{'decay':'none','penalty':10} for y in range(2016,2027)}};self.cache[groups]=result;return result
  histories={};out=[];settings={}
  for year in range(2016,2026):
   options={}
   for key in ['none','8']:
    tr=self.train_rows(key,year);te=self.test_rows(key,year)
    for alpha in [1,10,100]:
     f=fit(tr,groups,alpha);pp=paired(te,[predict(f,r['features'])['points'] for r in te]);options[(key,alpha)]=pp
   eligible=[(np.mean(loss),a,k!='none',(k,a)) for (k,a),loss in histories.items()]
   selected=min(eligible)[-1] if eligible else ('none',10);out+=options[selected];settings[str(year)]={'decay':selected[0],'penalty':selected[1]}
   for key,pp in options.items():histories.setdefault(key,[]).extend(r['loss'][0] for r in pp)
  selected=min((np.mean(loss),a,k!='none',(k,a)) for (k,a),loss in histories.items())[-1];settings['2026']={'decay':selected[0],'penalty':selected[1]};result={'predictions':out,'settings':settings};self.cache[groups]=result
  print('evaluated',','.join(groups),flush=True);return result
 def qualify(self,before,interval=False):
  marginal={};accepted=[]
  for group in GROUPS:
   years=self.eligible(group,before)
   if len(years)<3:marginal[group]={'pass':False,'reason':'INSUFFICIENT_OOF_HISTORY','eligible_seasons':sorted(years),'paired_n':0};continue
   result=gate(self.evaluate([group])['predictions'],self.raw,years,interval);marginal[group]=result
   if result['pass']:accepted.append(group)
  rounds=[]
  while accepted:
   failures=[];checks={};full=self.evaluate(accepted)['predictions']
   for group in accepted:
    other=[g for g in accepted if g!=group];check=gate(full,self.evaluate(other)['predictions'],self.eligible(group,before),interval);checks[group]=check
    if not check['pass']:failures.append(group)
   rounds.append({'groups':accepted[:],'checks':checks,'removed':failures})
   if not failures:break
   accepted=[g for g in accepted if g not in failures]
  return {'before_season':before,'selected_groups':accepted,'marginal':marginal,'conditional_rounds':rounds}

def load_prepared():
 ref=json.loads((ROOT/'work/projection-v1/fit-ref.json').read_text());v1=read(ref);m=v1['source_manifest'];prepared={};stadiums=json.loads((ROOT/'config/stadiums.json').read_text())
 for key in ['none','8']:
  cachekey=hash_value({'sources':m,'stadiums':stadiums,'feature_code':hashlib.sha256((ROOT/'engine/projection/features.py').read_bytes()).hexdigest()});p=ROOT/'work/projection-v1'/f'features-{key}-{cachekey[:12]}.json.gz'
  rr=json.loads(gzip.decompress(p.read_bytes())) if p.exists() else build(read(m['team_games']),read(m['schedule']),stadiums,None if key=='none' else 8,m['roster_source_hashes'])
  wind={r['game_id']:float(r['wind_mph']) for r in read(m['wind'])}
  for r in rr:r['features']['wind']=wind.get(r['game_id']) if 2022<=r['season']<=2025 and r['game'].get('roof','').lower() in ('outdoors','open') else None
  prepared[key]=rr
 return prepared,ref,m

def main():
 OUT.mkdir(parents=True,exist_ok=True);prepared,v1_ref,manifest=load_prepared();study=Study(prepared);adaptive=[];decisions=[];annual=[]
 for year in range(2016,2027):
  q=study.qualify(year,interval=year==2026);decisions.append(q);print('QUALIFIED',year,q['selected_groups'],flush=True)
  if year==2026:break
  pp=[r for r in study.evaluate(q['selected_groups'])['predictions'] if r['season']==year];shapes=prior_shapes(adaptive,year);calibration=save(f'calibration-{year}',shapes) if shapes else None
  graded=[grade(summarize(r['away'],r['home'],shapes),r['actual_away'],r['actual_home']) for r in pp] if shapes else []
  baseline=[r for r in study.raw if r['season']==year];metric={'season':year,'paired_n':len(pp),'selected_groups':q['selected_groups'],'settings':study.evaluate(q['selected_groups'])['settings'][str(year)],'calibration_last_season':year-1 if shapes else None,'calibration':calibration,'coverage_status':'PRIOR_SEASONS_ONLY' if shapes else 'UNAVAILABLE_NO_PRIOR_OOF','point_metrics':{},'interval_score':score(graded)}
  for target,i in [('team_points',0),('margin',1),('total',2)]:metric['point_metrics'][target]={'v2_mae':float(np.mean([r['loss'][i] for r in pp])),'baseline_mae':float(np.mean([r['loss'][i] for r in baseline]))}
  if not shapes:
   # Point MAE/sigma still measured; interval results stay unavailable.
   errors=residuals(pp)
  annual.append(metric);adaptive+=pp
 release=gate(adaptive,study.raw,set(range(2016,2026)),True);release_ok=release['mae_improvement']['team_points']>0 and min(release['mae_improvement'][k] for k in ['margin','total'])>=0 and release['team_improvement_interval']['one_sided95_lower']>0
 groups=decisions[-1]['selected_groups'] if release_ok else [];selected=study.evaluate(groups)['settings']['2026'];f=fit(study.train_rows(selected['decay'],2026),groups,selected['penalty']);final_shapes=residuals(adaptive if release_ok else study.raw);shape_ref=save('residuals',final_shapes);pred_ref=save('adaptive-oof',adaptive);raw_ref=save('baseline-oof',study.raw);decision_ref=save('qualification',decisions);availability_ref=save('availability',study.availability)
 code_hash=hash_value({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'engine/projection_v2').glob('*.py'))});version='projection-v2-'+code_hash[:8]+'-'+hash_value(f)[:8]
 allnames=prepared['none'][0]['features'];active={n for g in groups for n in GROUPS[g]}|{'baseline'};inactive=[{'input':n,'status':'INACTIVE','weight':0,'reason':('Not qualified by v2 prior-season group gate' if any(n in v for v in GROUPS.values()) else 'No qualifying history; preserved v1 inactive slot')} for n in sorted(allnames) if n not in active]
 artifact={'version':version,'fit':f,'selected':[selected['decay'],selected['penalty']],'groups':groups,'shapes':shape_ref,'source_manifest':manifest,'v1_source_fit':v1_ref,'inactive':inactive,'wind_status':'PARTIAL_HISTORY' if 'wind' in groups else 'INACTIVE','qualification':decision_ref,'protocol_sha256':hashlib.sha256((OUT/'PLAN.md').read_bytes()).hexdigest()};fit_ref=save('fit',artifact)
 record={'experiment':version,'protocol':{'path':'work/projection-v2/PLAN.md','sha256':artifact['protocol_sha256']},'source_manifest':manifest,'feature_hashes':{k:hash_value(v) for k,v in prepared.items()},'fit':fit_ref,'availability':availability_ref,'qualification':decision_ref,'oof':pred_ref,'baseline_oof':raw_ref,'annual':annual,'release_gate':release,'release_pass':bool(release_ok),'released_groups':groups,'final_subset_development':gate(study.evaluate(groups)['predictions'],study.raw,set(range(2016,2026)),True),'evidence':'RECONSTRUCTED_HISTORICAL_DEVELOPMENT','credits_spent':0,'limitations':['No untouched historical holdout; v1 results were previously viewed.','Feature admission and its intervals are development evidence, not multiplicity-adjusted superiority claims.','Historical stitched wind lacks exact pregame issuance.','2016 intervals unavailable because no prior OOF errors exist.']}
 record_ref=save('experiment',record);(OUT/'experiment.json').write_text(json.dumps(record,indent=2)+'\n');(OUT/'fit-ref.json').write_text(json.dumps(fit_ref,indent=2)+'\n');(OUT/'record-ref.json').write_text(json.dumps(record_ref,indent=2)+'\n');print(json.dumps({'version':version,'groups':groups,'release_pass':bool(release_ok),'release':release}),flush=True)
 return record
if __name__=='__main__':main()
