"""Deterministic season-origin training from sanitized football-only files."""
import csv,gzip,hashlib,json,math
from pathlib import Path
import numpy as np
from .features import build,SLOTS
from .model import fit,hash_value,Fit
from .distribution import residual_distribution,summarize
from .grade import grade,score

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'work/projection-v1'

def read(ref):
 p=ROOT/ref['path'];raw=p.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=ref['sha256']:raise ValueError('Source hash changed')
 return json.loads(raw)
def write(name,value):
 raw=(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode();h=hashlib.sha256(raw).hexdigest();p=OUT/(name+'-'+h+'.json');p.write_bytes(raw);return {'path':str(p.relative_to(ROOT)),'sha256':h}
def paired(rows):
 d={}
 for r in rows:d.setdefault(r['game_id'],{})['home' if r['home'] else 'away']=r
 return {k:v for k,v in d.items() if len(v)==2}
def main():
 manifest=json.loads((OUT/'source-manifest.json').read_text());data=read(manifest['team_games']);schedule=read(manifest['schedule']);wind={r['game_id']:float(r['wind_mph']) for r in read(manifest['wind'])};stadiums=json.loads((ROOT/'config/stadiums.json').read_text());prepared={}
 for decay in (None,8):
  key='none' if decay is None else str(decay);cache_key=hash_value({'sources':manifest,'stadiums':stadiums,'feature_code':hashlib.sha256((ROOT/'engine/projection/features.py').read_bytes()).hexdigest()});cache=OUT/f'features-{key}-{cache_key[:12]}.json.gz'
  if cache.exists():rows=json.loads(gzip.decompress(cache.read_bytes()))
  else:
   rows=build(data,schedule,stadiums,decay,manifest['roster_source_hashes']);cache.write_bytes(gzip.compress(json.dumps(rows,sort_keys=True,separators=(',',':'),allow_nan=False).encode(),mtime=0))
  prepared[key]=rows;print('features',key,len(rows),flush=True)
 names=tuple(sorted(prepared['none'][0]['features']));histories={};outputs=[];decisions=[];candidate_losses={};wind_oof=[]
 for year in range(2016,2026):
  fits={};year_predictions={}
  eligible=[]
  for key,rows in prepared.items():
   training=[r for r in rows if r['season']<year and r['actual_points'] is not None and r['features']['baseline'] is not None];test=[r for r in rows if r['season']==year and r['actual_points'] is not None and r['features']['baseline'] is not None]
   for alpha in (1,10,100):
    setting=(key,alpha);f=fit(training,names,alpha);fits[setting]=f;pred=[dict(r,predicted=f.predict(r['features'])['points']) for r in test];year_predictions[setting]=pred
    loss=candidate_losses.get(setting,[])
    if loss:eligible.append((sum(loss)/len(loss),alpha,key!='none',setting))
  selected=min(eligible)[-1] if eligible else ('none',10);pred=year_predictions[selected]
  # The wind correction is trained on earlier seasons' OOF residuals only.
  prior=[r for r in wind_oof if 2022<=r['season']<year];den=sum(r['wind']**2 for r in prior);wc=sum(r['wind']*r['error'] for r in prior)/(den+10) if prior else 0.
  for r in pred:
   g=r['game'];w=wind.get(r['game_id']) if str(g.get('roof','')).lower() in ('outdoors','open') and 2022<=year<=2025 else None
   correction=wc*w if w is not None and prior else 0.;outputs.append({k:r[k] for k in ['row_id','game_id','team','home','season','week','actual_points']}|{'core_points':r['predicted'],'projected_points':r['predicted']+correction,'wind':w,'wind_contribution':correction,'wind_status':'PARTIAL_HISTORY' if w is not None and prior else 'INACTIVE'})
   if w is not None:wind_oof.append({'season':year,'wind':w,'error':r['actual_points']-r['predicted']})
  decisions.append({'season':year,'training_last_season':year-1,'selection':{'decay':selected[0],'penalty':selected[1]},'selection_evaluation_through':year-1 if eligible else None,'fit_hash':fits[selected].fit_hash,'wind_weight':wc,'wind_training_n':len(prior)})
  for setting,rr in year_predictions.items():candidate_losses.setdefault(setting,[]).extend(abs(r['actual_points']-r['predicted']) for r in rr)
  print('scored',year,len(pred),selected,flush=True)
 pair=paired(outputs);residuals={'team_points':[r['actual_points']-r['projected_points'] for r in outputs],'margin':[],'total':[]}
 for p in pair.values():
  h,a=p['home'],p['away'];residuals['margin'].append((h['actual_points']-a['actual_points'])-(h['projected_points']-a['projected_points']));residuals['total'].append(h['actual_points']+a['actual_points']-h['projected_points']-a['projected_points'])
 oof_ref=write('oof-predictions',outputs);shapes={k:residual_distribution(v,oof_ref['sha256']) for k,v in residuals.items()};shape_ref=write('residuals',shapes)
 reports=[]
 for year in range(2016,2026):
  grades=[]
  for p in pair.values():
   h,a=p['home'],p['away']
   if h['season']==year:grades.append(grade(summarize(a['projected_points'],h['projected_points'],shapes),a['actual_points'],h['actual_points']))
  reports.append({'season':year,**score(grades)})
 selected=min((sum(v)/len(v),s[1],s[0]!='none',s) for s,v in candidate_losses.items())[-1];rows=prepared[selected[0]];training=[r for r in rows if r['season']<=2025 and r['actual_points'] is not None and r['features']['baseline'] is not None];final_fit=fit(training,names,selected[1]);den=sum(r['wind']**2 for r in wind_oof);wc=sum(r['wind']*r['error'] for r in wind_oof)/(den+10) if wind_oof else 0.
 feature_hash=hash_value({'names':names,'selection':selected,'source_manifest':manifest,'code':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'engine/projection').glob('*.py'))}})
 combined_fit_hash=hash_value({'core':final_fit.fit_hash,'wind_weight':wc,'wind_training_n':len(wind_oof)})
 artifact={'fit':final_fit.__dict__,'wind_weight':wc,'wind_training_n':len(wind_oof),'wind_status':'PARTIAL_HISTORY','shapes':shape_ref,'feature_hash':feature_hash,'fit_hash':combined_fit_hash,'version':'projection-v1-'+feature_hash[:8]+'-'+combined_fit_hash[:8],'selected':selected,'source_manifest':manifest,'inactive':[{'input':n,'status':'INACTIVE','weight':0,'reason':SLOTS.get(n,'No qualifying training observations')} for n,c in zip(names,final_fit.coefficients) if all(r['features'][n] is None for r in training) and n!='wind'],'selection_history':decisions}
 fit_ref=write('fit',artifact);write('season-scorecard',reports);(OUT/'fit-ref.json').write_text(json.dumps(fit_ref,indent=2)+'\n');(OUT/'season-scorecard.json').write_text(json.dumps(reports,indent=2)+'\n');(OUT/'selection-history.json').write_text(json.dumps(decisions,indent=2)+'\n')
 # Mutable current preparation is not an issued forecast.
 future=[r for r in rows if r['season']==2026];cache=OUT/'current-features.json.gz';cache.write_bytes(gzip.compress(json.dumps(future,sort_keys=True,separators=(',',':')).encode(),mtime=0));print('fit',artifact['version'],flush=True)
 return artifact
if __name__=='__main__':main()
