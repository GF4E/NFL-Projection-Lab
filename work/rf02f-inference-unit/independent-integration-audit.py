import pathlib,sys,json,hashlib,time,resource,signal
START=time.monotonic();signal.signal(signal.SIGALRM,lambda *_: (_ for _ in ()).throw(TimeoutError('120s')));signal.alarm(120)
R=pathlib.Path('/private/tmp/os01-gen15-rebuild.9ny71k');W=pathlib.Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');D=W/'work/rf02f-inference-unit/full-943105d923d2043d'
sys.path[:0]=[str(R/'scripts'),str(R/'tests/research-score-split')]
import numpy as np
import qualify_inference_unit as f
import research_score_split_inference as u
from research_score_metrics import score_forecast
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p,pin=None):
 b=p.read_bytes()
 if pin: assert sha(b)==pin
 return json.loads(b)
q=read(D/'qualification.json','19f64845ee65da9631049a218aa19c3379dae873e164bd193a8bde2c874d2eeb');m=read(D/'fixture-manifest.json','22bd22dcb3b08218385fab0ddb52471d178f31e9ca84bf9fa202d09c96d9354d');e=read(D/'evaluation.json','caeda7fa5f04c1fbfc2bedd8fcb8a8bc4bfec6631222f4ee0665ddee9e081352')
for p,h in q['source_hashes'].items():assert sha((R/p).read_bytes())==h
config=f.config();series,comparisons,cells=u.registered(config);metadata=m['metadata'];ids=[g['game_id'] for g in metadata]
assert len(set(ids))==3407 and len(m['files'])==226
rows={k:[] for k in series};rd={k:hashlib.sha256() for k in series};md={k:hashlib.sha256() for k in series};seen={};samples={};total=0;negativezero=0
for pointer in m['files']:
 raw=(D/pointer['name']).read_bytes();assert len(raw)==pointer['bytes'] and sha(raw)==pointer['sha256'];records=json.loads(raw)
 for x in records:
  k=x['family'],x['variant'];v=x['metrics'];p=x['provenance'];inp=p['inputs'];base={a:b for a,b in v.items() if not a.endswith('_interval_mass_80')}
  assert p['key_sha256']==sha(f.encoded(inp)) and p['metric_sha256']==sha(f.encoded(v)) and p['scorer_metric_sha256']==sha(f.encoded(base))
  assert inp['game_id']==x['game_id'] and inp['observed']==[v['home_observed'],v['away_observed']]
  assert inp['diagnostics'] is True and inp['double_grid'] is True
  assert inp['scorer_sha256']==sha(f.encoded(m['scorer_hashes'])) and inp['runtime_sha256']==sha(f.encoded(m['runtime']))
  assert inp['law_sha256'] in m['laws']
  expected='product' if k==('E3','independent_marginals') else 'new' if k[0]=='E3' else 'reference'
  assert inp['law_sha256']==sha(f.encoded(f.law_record(f.toy_laws()[expected])))
  kh=p['key_sha256']; bh=p['scorer_metric_sha256'];assert seen.get(kh,bh)==bh;seen[kh]=bh
  samples.setdefault(inp['law_sha256'],x)
  rd[k].update(f.encoded(x));md[k].update(f.encoded({'game_id':x['game_id'],'metrics':v}));rows[k].append({'game_id':x['game_id'],'metrics':v,'native_failure':x['native_failure']});total+=1
  negativezero+=sum(type(z)is float and z==0 and bool(np.signbit(z)) for z in v.values())
for k in series:
 assert [r['game_id'] for r in rows[k]]==ids
 assert m['series_digests'][':'.join(k)]=={'rows_sha256':rd[k].hexdigest(),'metrics_sha256':md[k].hexdigest()}
assert total==64733 and len(seen)==10221 and total-len(seen)==54512 and negativezero==8075
fresh=[]
for lp,x in samples.items():
 law=f.law_from_record(m['laws'][lp]);v=score_forecast(law,x['provenance']['inputs']['observed'],x['game_id'],True,True)
 assert sha(f.encoded(v))==x['provenance']['scorer_metric_sha256']
 if x['family']=='E3':v=f.with_mass(law,v)
 assert f.encoded(v)==f.encoded(x['metrics']);fresh.append({'game_id':x['game_id'],'law_sha256':lp,'complete_metric_bytes_equal':True})
assert e['inference']['comparison_order']==[a[0] for a in comparisons] and e['inference']['calibration_cell_order']==[list(c) for c in cells]
assert e['inference']['games']==3135 and e['inference']['population']=='2013-2024_development_only'
for b in e['inference']['blocks'].values():assert b['members']==10000 and len(b['coverage'])==228 and len(b['pit_simultaneous_bands'])==76
metrics={k:[r['metrics'] for r in v] for k,v in rows.items()};failures={k:[r['native_failure'] for r in v] for k,v in rows.items()}
decision=u.decision(config,metadata,metrics,failures,e['inference'])
assert all(e[k]==v for k,v in decision.items())
checks=0;maxerr=0
subsets={'development':[i for i,g in enumerate(metadata) if g['season']<=2024],'all_issued':list(range(3407)),'exposed_2025':[i for i,g in enumerate(metadata) if g['season']==2025]}
subsets.update({str(y):[i for i,g in enumerate(metadata) if g['season']==y] for y in u.YEARS})
for k in series:
 card=e['scorecards'][':'.join(k)]
 for name,ii in subsets.items():
  c=card['seasons'][name] if name.isdigit() else card[name];assert c['games']==len(ii)
  native=card['native_success_only']['seasons'][name] if name.isdigit() else card['native_success_only'][name];assert native==c
  for metric,stats in c['metrics'].items():
   if metric.endswith('_rmse'):
    val=float(np.sqrt(np.mean([metrics[k][i][metric[:-5]+'_squared_error'] for i in ii])));err=abs(val-stats);maxerr=max(err,maxerr);assert err<=1e-12;checks+=1;continue
   ar=np.array([metrics[k][i][metric] for i in ii]);
   for field,val in [('mean',float(ar.mean())),('median',float(np.median(ar)))]:
    err=abs(val-stats[field]);maxerr=max(err,maxerr);assert err<=1e-12;checks+=1
report={'status':'accepted','scope':'complete_synthetic_scorer_json_public_evaluator_and_real_bootstrap_qualification','source_hashes':q['source_hashes'],'protocol_sha256':sha((R/'.planning/engine-os/research-first/RF-02F-HISTORICAL-PROTOCOL.v1.md').read_bytes()),'config_sha256':sha((R/'config/research-team-score-split.v1.json').read_bytes()),'qualification_sha256':sha((D/'qualification.json').read_bytes()),'fixture_manifest_sha256':sha((D/'fixture-manifest.json').read_bytes()),'evaluation_sha256':sha((D/'evaluation.json').read_bytes()),'blockers':[],'reviewer_attempt_note':'First audit attempt completed ledger, three fresh metrics and decision checks then stopped on reviewer-only KeyError treating derived away_rmse as a raw metric. Corrected audit handles sqrt(mean squared error); no scientific source/artifact changed.','independent_checks':{'all_origin_files':226,'all_rows':total,'all_series_digests':19,'unique_complete_score_keys':len(seen),'reuses':total-len(seen),'signed_zero_metric_values':negativezero,'fresh_original_uncached_scorer_checks':fresh,'all_cohort_mean_median_checks':checks,'max_summary_error':maxerr,'decision_exact_using_retained_intervals':True,'comparison_count':18,'actual_mass_cells':8,'development_games':3135,'exposed_games':272,'reported_bootstrap_members_per_block':10000,'nominal_cells_per_block':228,'pit_bands_per_block':76},'limits':['No bootstrap endpoints regenerated; inspected retained three complete real bootstrap outputs and reviewed unchanged call path.','Independent fresh scoring covers three first-game laws only, not all 10221 calls. Author loader separately verified 40884 actual-ID PIT equations; complete independent ledger and cache key checks bind all rows.','Toy laws keep target means constant; actual numerical calibration regression is structurally unavailable by design and validated. Small real mean/mapper/fallback bridge and focused gate tests supplement synthetic integration; this is not historical mean-state proof.','No historical input, fits, scores, candidate evaluation or historical invocation authorization. No production, prospective or external-five-percent claim.','Root separately owns full timing/persistence/source-binding audit.'], 'seconds':time.monotonic()-START,'peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20}
out=W/'work/rf02f-inference-unit/numerical-integration-review.json';out.write_text(json.dumps(report,indent=2)+'\n');print(out);print(sha(out.read_bytes()));print(report['seconds'],report['peak_rss_mib'],checks)
