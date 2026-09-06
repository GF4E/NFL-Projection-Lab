from pathlib import Path
import json,hashlib,math,time
import numpy as np
W=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');D=W/'work/rf02e-mean-diagnostic/result-v1';started=time.monotonic()
sha=lambda b:hashlib.sha256(b).hexdigest();enc=lambda x:(json.dumps(x,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
b=(D/'result.json').read_bytes();assert sha(b)=='126399b55ddfa374d0ee9ff050b8698c7deab4b1864edf780aed4b56f21f15d0';r=json.loads(b);co=json.loads((D/'completion.json').read_bytes());assert co['result_sha256']==sha(b) and not (D/'failure.json').exists();assert {p.name for p in D.iterdir()}=={'result.json','completion.json'}
assert sha((W/'work/rf02e-mean-diagnostic/diagnose.py').read_bytes())==r['script_sha256']=='50342db78ff332c9584b993d955a6bc9e8f0b836ee44ed7ab2aa92173005c50b'
for path,pin in r['read_files'].items():
 p=Path(path);assert not p.is_symlink();raw=p.read_bytes();assert sha(raw)==pin['sha256'] and len(raw)==pin['bytes']
for path,h in r['source_hashes'].items():assert sha((Path('/private/tmp/os01-gen15-rebuild.9ny71k')/path).read_bytes())==h
files=list(r['read_files']);data=json.loads(Path(next(x for x in files if x.endswith('admitted-score-data.v2.json'))).read_bytes());origins=[o for o in data['origins'] if 2013<=o['season']<=2025];keys=[g for o in origins for g in o['targetGameIds']];assert sha(enc(keys))==r['ordered_games_sha256'];records={x['gameId']:x for x in data['records']};series=[('N0','full'),('N0','availability_24h'),('E2','full'),('E2','availability_24h')];rows={s:[] for s in series};mh={s:hashlib.sha256() for s in series};nh={s:hashlib.sha256() for s in series};native={s:0 for s in series};sq=0
for o in origins:
 suffix=f"{o['season']}-{o['week']:02}.json";loss=json.loads(Path(next(x for x in files if x.endswith('outer-losses-'+suffix))).read_bytes());fore=json.loads(Path(next(x for x in files if x.endswith('forecasts-'+suffix))).read_bytes());lookup={(x['family'],x['variant'],x['game_id']):x for x in fore['outer_selected_forecasts']};selected=[x for x in loss if (x['family'],x['variant']) in series]
 assert [(x['family'],x['variant'],x['game_id']) for x in selected]==[(*s,g) for s in series for g in o['targetGameIds']]
 for x in selected:
  s=x['family'],x['variant'];g=x['game_id'];m=x['metrics'];assert x['native_failure']==lookup[*s,g]['native_failure'];native[s]+=x['native_failure'] is not None;mh[s].update(enc({'game_id':g,'metrics':m}));nh[s].update(enc({'game_id':g,'native_failure':x['native_failure']}))
  for t in ['margin','total']:
   assert m[t+'_observed']==(records[g]['homeScore']-records[g]['awayScore'] if t=='margin' else records[g]['homeScore']+records[g]['awayScore']);assert (m[t+'_observed']-m[t+'_mean'])**2==m[t+'_squared_error'];sq+=1
  rows[s].append(m)
for s in series:assert mh[s].hexdigest()==r['complete_metric_digests'][':'.join(s)] and nh[s].hexdigest()==r['native_reason_digests'][':'.join(s)] and native[s]==r['native_failure_counts'][':'.join(s)]
years=np.array([records[g]['season'] for g in keys]);parts={'development':np.flatnonzero(years<=2024),'exposed_2025':np.flatnonzero(years==2025)}|{str(y):np.flatnonzero(years==y) for y in range(2013,2025)};assert {k:len(v) for k,v in parts.items()}==r['partition_counts'];maxerr=0.;checks=0
for s in series:
 for t in ['margin','total']:
  ps=np.array([x[t+'_mean'] for x in rows[s]]);ys=np.array([x[t+'_observed'] for x in rows[s]])
  for part,idx in parts.items():
   p,y=ps[idx],ys[idx];mp,my=p.mean(),y.mean();cov=np.mean((p-mp)*(y-my));stats=dict(n=len(idx),mean_prediction=mp,mean_observation=my,observed_minus_predicted_bias=np.mean(y-p),mean_squared_error=np.mean((y-p)**2),prediction_variance=np.var(p),prediction_observation_covariance=cov)
   for k,v in stats.items():
    reported=r['cells'][':'.join((*s,t))][part][k];maxerr=max(maxerr,abs(v-reported));assert math.isclose(v,reported,rel_tol=1e-12,abs_tol=1e-9);checks+=1
for var in ['full','availability_24h']:
 for t in ['margin','total']:
  errors={f:np.array([(x[t+'_observed']-x[t+'_mean'])**2 for x in rows[f,var]]) for f in ['N0','E2']}
  for part,idx in parts.items():
   v=np.mean((errors['E2']-errors['N0'])[idx]);reported=r['paired_differences'][var+':'+t][part];assert reported['n']==len(idx) and math.isclose(v,reported['E2_minus_N0_mean_squared_error'],rel_tol=1e-12,abs_tol=1e-9)
patterns={}
for name,v in r['paired_differences'].items():
 vals={str(y):v[str(y)]['E2_minus_N0_mean_squared_error'] for y in range(2013,2025)};patterns[name]={'development_difference':v['development']['E2_minus_N0_mean_squared_error'],'negative_development_seasons':[y for y,x in vals.items() if x<0],'positive_development_seasons':[y for y,x in vals.items() if x>0],'all_development_season_differences':vals,'exposed_2025_difference':v['exposed_2025']['E2_minus_N0_mean_squared_error']}
review={'status':'accepted_descriptive_evidence_only','result_sha256':sha(b),'completion_sha256':sha((D/'completion.json').read_bytes()),'script_sha256':r['script_sha256'],'scope_sha256':r['scope_sha256'],'blockers':[],'checks':{'authenticated_logged_input_files':len(files),'source_hashes_verified':len(r['source_hashes']),'ordered_games':len(keys),'origins':len(origins),'selected_rows':sum(len(x) for x in rows.values()),'saved_squared_errors_exact':sq,'cell_summaries_independently_recomputed':112,'cell_values_compared':checks,'paired_differences_independently_recomputed':56,'maximum_cell_absolute_difference':float(maxerr),'all_four_metric_and_native_reason_digests_match':True,'failure_file_absent':True,'completion_result_binding_verified':True},'patterns':patterns,'recommendation':'Evidence warrants a NEW narrowly scoped tied-versus-split strength/scoring-level update hypothesis; it does not authorize the deferred27-setting search or determine optimal rates.','interpretation':['Margin MSE improves in all12full development seasons and11of12 at24h;2022 at24h is the explicit counterexample. Both exposed2025margin differences also favorE2.','Total MSE worsens in8of12full and7of12at24h development seasons, with pooled increases1.5211 and1.5978. Both exposed2025total differences favorE2, so poorer total performance is not universal or prospective confirmation.','Existing development E2 calibration slopes about1.054/1.048 for margin versus0.671/0.664 for total describe the saved forecast scaling. They are not causal update-rate estimates or significance evidence.','The asymmetric complete-season pattern gives a falsifiable reason to test the tied-rate constraint while preserving means/scoring mechanisms and control evidence in a new protocol. It does not prove splitting rates will improve joint energy or satisfy distribution/NLL gates.'],'limitations':['Independent NumPy reductions checked original math.fsum outputs within declared1e-12relative/1e-9absolute tolerance; no new regression, model fit, transform, scorer, bootstrap or update-gain estimation.','Existing aggregate calibration coefficients are inherited from acceptedRF02E arithmetic audit; this audit does not refit them.','All examined history remains exposed. Any new hypothesis needs separate preregistration, exact tied-case equivalence, bounded capacity, controls and independent review; no27-setting automaticauthorization.'],'resource_observation':co,'audit_seconds':time.monotonic()-started}
(W/'work/rf02e-mean-diagnostic/actual-review.json').write_text(json.dumps(review,indent=2,sort_keys=True)+'\n');print(json.dumps(review['checks']));print(sha((W/'work/rf02e-mean-diagnostic/actual-review.json').read_bytes()))
