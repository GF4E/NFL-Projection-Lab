import sys,json,hashlib,time,math,resource
from pathlib import Path
start=time.monotonic();root=Path('/private/tmp/os01-gen15-rebuild.9ny71k');sys.path.insert(0,str(root/'scripts'))
import numpy as np
from research_score_contract import encoded
from research_score_conditional_admission import Archive,ORDINARY,SERIES,PRIOR_COUNTS,recover_original
from research_score_conditional_replay import annual_receipt,fingerprint,canonical
from research_score_conditional_adapter import transform_distribution,distribution_fingerprint
from research_score_conditional_policy import independent_control,independent_fingerprint
from research_score_distribution import JointBase
from research_score_metrics import score_forecast
P=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02d-v1-482ec75028e1d16f');H=lambda b:hashlib.sha256(b).hexdigest();strict=lambda x:encoded(canonical(x))
def read(n):return json.loads((P/n).read_bytes())
idxraw=(P/'completion/artifact-index.json').read_bytes();index=json.loads(idxraw)['files'];byteschecked=0
for n,p in index.items():
 assert not Path(n).is_absolute() and '..' not in Path(n).parts
 digest=hashlib.sha256();size=0
 with (P/n).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):digest.update(b);size+=len(b)
 assert digest.hexdigest()==p['sha256'] and size==p['bytes'],n
 byteschecked+=size
m=read('manifest.json');assert H((P/'manifest.json').read_bytes())=='482ec75028e1d16f687a51eac6c5139a1b1db6deb3cb7884320ce767febe163d'
for n,h in m['code_hashes'].items():assert H((root/n).read_bytes())==h
assert len(m['code_hashes'])==43
for n,h in [('config/research-team-score-conditional.v1.json',m['config_sha256']),('.planning/engine-os/research-first/RF-02D-HISTORICAL-PROTOCOL.v1.md',m['protocol_sha256'])]:assert H((root/n).read_bytes())==h
started=read('started.json');ap=started['implementation_acceptance'];assert H(Path(ap['path']).read_bytes())==ap['sha256']==m['implementation_acceptance_sha256']
term=read('completion/terminal.json');evaluation=read('evaluation.json');assert term['status']==evaluation['status']=='protocol_invalid' and term['phase']=='inference'
assert 'scorecards' not in evaluation and 'inference' not in evaluation
pilot=read('pilot.json');project=pilot['elapsed_total']+2*pilot['pilot_scoring_seconds']*pilot['remaining_game_count']/pilot['pilot_game_count']+600
assert project==pilot['projected_seconds'] and project<=7200 and pilot['remaining_game_count']==3407-pilot['completed_game_count']
parent=Archive('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02c-v1-2d9c91d803f1c991')
assert parent.manifest_sha256==m['parent_manifest_sha256'] and parent.index_sha256==m['parent_index_sha256']
collection=read('case-collection.json');annual=read('annual-index.json');assert len(annual['entries'])==234 and annual['cold_starts']==18 and annual['estimated_receipts']==216
sources={f:[] for f in ('N0','E2')};cases={f:[] for f in sources};byyear={y:[] for y in range(2013,2026)};origins={};casestream=hashlib.sha256();casecount=0
for chunkref in collection['case_chunks']:
 chunk=read(chunkref['pointer']['name']);assert index[chunkref['pointer']['name']]=={k:chunkref['pointer'][k] for k in ('sha256','bytes')}
 for row in chunk['rows']:
  s,c=row['source'],row['case'];assert s['season']<=2024 and s['native_failure'] is None and fingerprint(c['case'])==s['case_fingerprint']==c['case_fingerprint']
  casestream.update(encoded({'key':[s['family'],s['variant'],s['game_id']],'source_fingerprint':s['source_fingerprint'],'case':c['case']}));casecount+=1
  if s['variant']=='full':sources[s['family']].append(s);cases[s['family']].append(c)
assert casecount==56430 and casestream.hexdigest()==collection['case_inputs_sha256']
receipts={};scales=[]
for entry in annual['entries']:
 ptr=entry['pointer'];assert index[ptr['name']]=={k:ptr[k] for k in ('sha256','bytes')}
 e=read(ptr['name']);r=e['pure_receipt'];key=(entry['family'],entry['variant'],entry['target_season']);assert key not in receipts;receipts[key]=r
 assert (e['family'],e['variant'],e['target_season'])==key and e['run_manifest_sha256']==H((P/'manifest.json').read_bytes())
 assert r['sha256']==e['pure_receipt_sha256']==entry['pure_receipt_sha256']==fingerprint({k:v for k,v in r.items() if k!='sha256'})
 y=key[2];assert r['expected_count']==r['native_success_count']==PRIOR_COUNTS[y-2013] and r['failed_count']==0
 assert len(r['case_sources'])==len(r['case_keys'])==r['native_success_count'] and all(c['season']<y for c in r['case_sources'])
 expectedchunks=[x['pointer'] for x in collection['case_chunks'] if x['season']<y];assert e['case_chunks']==expectedchunks
 scales.append({'key':key,'scale':r['scale'],'status':r['status']})
assert set(receipts)=={(*k,y) for k in ORDINARY for y in range(2013,2026)}
scorecount=rawcount=0;badtypes={};fresh=[];maps={}
def recover(desc):
 ptr=desc['mapper'];key=(ptr['name'],ptr['sha256'])
 if key not in maps:
  v=parent.read(ptr);maps[key]=JointBase(np.asarray(v['atoms']),np.asarray(v['weights']),v['b'],v['epsilon'])
 return recover_original(maps[key],desc)
rawkeys=[('N0','full'),('E2','full'),('N0','availability_24h'),('E2','availability_24h'),('E1','full'),('S1','full')]
scorenames=sorted(n for n in index if n.startswith('scores-'))
for sn in scorenames:
 card=read(sn);o=card['origin'];year=o['season'];week=o['week'];first=year not in origins
 if first:origins[year]=o
 byyear[year].extend(o['targetGameIds']);pubname=f'forecasts-{year}-{week:02}.json';pub=read(pubname)
 pr=parent.read(pubname);pl=parent.read(f'outer-losses-{year}-{week:02}.json');prs={(r['family'],r['variant'],r['game_id']):r for r in pr['outer_selected_forecasts']};pls={(r['family'],r['variant'],r['game_id']):r for r in pl}
 expect=[(f+'C',v,g) for f,v in SERIES for g in o['targetGameIds']];assert [(r['family'],r['variant'],r['game_id']) for r in card['mapped']]==expect
 assert [(r['family'],r['variant'],r['game_id']) for r in pub['rows']]==expect
 for row,recipe in zip(card['mapped'],pub['rows']):
  f=row['family'][:-1];v=row['variant'];g=row['game_id'];old=pls[f,v,g];assert row['native_failure']==old['native_failure']==recipe['native_failure'];assert row['recipe_sha256']==H(strict(recipe))
  assert row['forecast_publication']=={'name':pubname,**index[pubname]}
  for target in ('home','away','margin','total'):assert row['metrics'][target+'_observed']==old['metrics'][target+'_observed']
  for name,val in row['metrics'].items():
   if name!='grid_cells' and (type(val) not in (int,float) or not math.isfinite(val)):
    k=(name,type(val).__name__,repr(val));badtypes[k]=badtypes.get(k,0)+1
  if first and year in (2014,2020,2025) and g==o['targetGameIds'][0] and v in ('full','independent_marginals'):
   orig=recover(prs[f,'full',g]['distribution']);r=receipts[f,'full',year];law,tr=transform_distribution(orig,r['scale']);op=None
   if v=='independent_marginals':law,op=independent_control(law,tr)
   lf=independent_fingerprint(law) if law.independent else distribution_fingerprint(law)
   assert lf==recipe['result_distribution_fingerprint'] and tr==recipe['provenance']['transformation'] and op==recipe['provenance']['product_operation']
   actual=score_forecast(law,[int(old['metrics']['home_observed']),int(old['metrics']['away_observed'])],g,double_grid=True,diagnostics=True)
   for target in ('home','away','margin','total'):actual[target+'_interval_mass_80']=float(law.cdf(target,actual[target+'_upper_80'])-law.cdf(target,actual[target+'_lower_80']-1))
   assert strict(actual)==strict(row['metrics']);fresh.append({'year':year,'family':f,'variant':v,'game_id':g,'metrics_sha256':H(strict(actual))})
  scorecount+=1
 assert [(r['family'],r['variant'],r['game_id']) for r in card['raw_references']]==[(f,v,g) for f,v in rawkeys for g in o['targetGameIds']]
 for row in card['raw_references']:
  old=pls[row['family'],row['variant'],row['game_id']];assert encoded(row['metrics'])==encoded(old['metrics']) and row['original_row_sha256']==H(encoded(old));rawcount+=1
assert len(scorenames)==226 and scorecount==68140 and rawcount==20442 and len(fresh)==12
assert sum(map(len,byyear.values()))==3407 and len({g for gs in byyear.values() for g in gs})==3407
scalarchecks=[]
for year in (2014,2020,2025):
 for f in ('N0','E2'):
  r=annual_receipt(f,'full',year,origins[year]['originAt'],{y:g for y,g in byyear.items() if y<year},sources[f],cases[f]);assert strict(r)==strict(receipts[f,'full',year]);scalarchecks.append({'year':year,'family':f,'receipt_sha256':r['sha256'],'scale':r['scale']})
report={'status':'accepted_invalid_terminal_evidence_only','scientific_status':'protocol_invalid','manifest_sha256':H((P/'manifest.json').read_bytes()),'index_sha256':H(idxraw),'terminal_sha256':H((P/'completion/terminal.json').read_bytes()),'indexed_files_verified':len(index),'indexed_bytes_verified':byteschecked,'source_hashes':m['code_hashes'],'annual_receipts_verified':234,'prior_cases_digest_reproduced':casecount,'mapped_rows_verified':scorecount,'raw_reference_rows_verified':rawcount,'origins_verified':226,'games_verified':3407,'pilot':pilot,'scientific_stop_seconds':term['scientific_stop_elapsed_seconds'],'run_peak_rss_mib':term['peak_rss_mib'],'fresh_scalar_checks':scalarchecks,'fresh_original_uncached_metric_checks':fresh,'validator_incompatible_fields':[{'field':k[0],'type':k[1],'example':k[2],'occurrences':n} for k,n in badtypes.items()],'inference_scope':'evaluate failed in initial _validate before aggregate scorecards or bootstrap _infer; evaluation artifact contains neither scorecards nor inference. No accepted mapping/candidate decision exists.','audit_seconds':time.monotonic()-start,'audit_peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2,'limitations':['Full artifact hashes,case digest,annual metadata,score/reference membership authenticated;fresh numerical scalar/law/scoring recomputation is only predetermined6/12sample.','No modified-schema evaluation, field coercion/removal, newcandidate decision, or replacement run performed.','Scalar recomputation repeats accepted estimator on exact alreadyfitted archived bundles for independentaudit only.','All rawscore dictionaries match parent; mappedmetrics not independently rescored outside fixed12sample.']}
out=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02d-terminal-audit/numerical-terminal-review.json')
with out.open('x') as f:json.dump(report,f,indent=2,sort_keys=True,allow_nan=False);f.write('\n')
print({k:v for k,v in report.items() if k not in ['source_hashes','fresh_scalar_checks','fresh_original_uncached_metric_checks','limitations']});print('report_sha256',H(out.read_bytes()))
