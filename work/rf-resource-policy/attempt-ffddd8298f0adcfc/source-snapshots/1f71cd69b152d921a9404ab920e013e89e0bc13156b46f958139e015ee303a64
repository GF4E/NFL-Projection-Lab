import json,pathlib,hashlib,struct,collections,math
W=pathlib.Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');P=W/'work/rf-comp-04/attempt-1788652424308249000';R=pathlib.Path('/private/tmp/os01-gen15-rebuild.9ny71k')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def j(p):return json.loads(p.read_bytes())
def enc(v):return (json.dumps(v,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def ptr(p):return {'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size}
q=j(P/'qualification.json');assert sha(P/'qualification.json')=='656b73683b78c39168b0a3b0f58a1144d6218aebdd12ed01719a3e959d764374';assert q['tests']=={'run':53,'passed':53}
for n,h in q['code_hashes'].items():assert sha(R/n)==h,n
for n,h in q['runtime_files'].items():assert sha(pathlib.Path(n))==h
for e in q['evidence']:
 p=pathlib.Path(e['path']);assert sha(p)==e['sha256'] and p.stat().st_size==e['bytes'],str(p)
w=j(P/'numerical-observations.json');assert len(w)==15
pairs=collections.defaultdict(dict)
for x in w:
 if x['route'] in ['original','composed']:pairs[x['year'],x['selected'],x['injected_fit_failure']][x['route']]=x
assert len(pairs)==5
fields=('assembly','resolved_laws','inner_rows','outer_rows','counts','score_calls','mass_calls','provenance','publication')
rows=0;scored=0;masses=0;arrays=0;pair_results=[]
for key,pair in pairs.items():
 a,b=pair['original'],pair['composed'];assert all(enc(a[f])==enc(b[f]) for f in fields),key
 rows+=len(a['inner_rows'])+len(a['outer_rows']);scored+=len(a['score_calls']);masses+=len(a['mass_calls'])
 for route in [a,b]:
  assert len(route['score_calls'])==route['counts']['actual_score_calls'];assert len(route['mass_calls'])==route['counts']['actual_mass_cdf_calls']
  for row in route['outer_rows']:assert len(row['metrics'])==(108 if row['family']=='E3' else 104)
  for call in route['score_calls']:assert len(call['metrics'])==(104 if call['flags']['diagnostics'] else 28)
  for law in route['resolved_laws']:
   for value in law['fields'].values():
    if 'c_bytes_hex' in value:
     import numpy as np
     ar=np.asarray(value['values'],dtype=value['dtype']).reshape(value['shape']);assert ar.tobytes().hex()==value['c_bytes_hex'];assert value['writeable'] is False;arrays+=1
  for proof in route['provenance']['rows']:
   if proof['mode']!='new_score':assert proof['score_flags'] is None and proof['source_loss'] is not None
  if route['mass_calls']:
   it=iter(route['mass_calls'])
   for row in route['outer_rows']:
    if row['family']!='E3':continue
    for target in ['home','away','margin','total']:
     high,low=next(it),next(it);assert high['target']==low['target']==target
     assert high['value']==row['metrics'][target+'_upper_80'] and low['value']==row['metrics'][target+'_lower_80']-1
     assert high['outside_score_callback'] and low['outside_score_callback'];assert high['law_sha256']==low['law_sha256']
     assert float(high['answer']-low['answer'])==row['metrics'][target+'_interval_mass_80']
   assert list(it)==[]
  fits=sum(v['kind']=='fit' and v['operation']=='fit' for v in route['callbacks']);assert route['memo_instances']==(fits if route['route']=='composed' else 0)
 pair_results.append({'year':key[0],'selected':key[1],'injected_failure':key[2],'rows_per_route':len(a['inner_rows'])+len(a['outer_rows']),'new_score_calls_per_route':len(a['score_calls'])})
assert rows==298
multi=[x for x in w if x['route']=='composed_multi_origin'];assert len(multi)==3
for i,x in enumerate(multi):
 assert [c['flags']['double_grid'] for c in x['score_calls']]==([False]*36 if i==1 else [True]*18+[False]*18)
 assert not x['outer_rows'] and len(x['inner_rows'])==54
owner=next(x for x in w if x['route']=='composed_current79_new_owner');assert owner['manifest']['code_hashes']==q['code_hashes'] and owner['manifest']['runtime_files']==q['runtime_files'];assert hashlib.sha256(enc(owner['manifest'])).hexdigest()==owner['manifest_sha256']
for f in ['publication','binding','provenance']:assert owner[f]['manifest_sha256']==owner['manifest_sha256']
assert owner['old_manifest_sha256']!=owner['manifest_sha256']
for d in ['12','24']:
 nodes={x['id']:x for x in owner['ancestry'][d]['nodes']};assert nodes['model']['body']['code_sha256']==hashlib.sha256(enc(q['code_hashes'])).hexdigest()
 assert nodes['eligible-football']['body']['admission_manifest']==owner['manifest_sha256']
boundary=next(x for x in w if x['route']=='composed_publication_boundary');assert boundary['events'][:2]==['binding','labels'] and boundary['events'].count('score')==40
unit=j(P/'unit-tests.json');assert unit['tests_run']==51 and unit['success'] and not any(unit[f] for f in ['errors','failures','skipped'])
commit=j(P/'qualification-commit.json');assert commit['within_600_seconds'] and commit['elapsed_seconds']<600
process=j(P/'process.json');assert process['stop'] is None and process['source_error'] is None and process['conservative_combined_rss_mib']<2048
findings=['All79 source/test pins, seven private runtime files and every direct qualification evidence pointer authenticated against actual retained bytes.','All five original/composed pairs match canonical bytes in every assembly, law-array, score, provenance, flags, mass-call and publication field;298 saved scientific rows per route.','Verified all stored array dtype/shape/IEEE bytes against retained values and readonly flags; no recomputation of distributions.','All outer metrics retain104 fields or108 forE3; inner diagnostics false retains28. Reproduced each saved interval-mass subtraction from its two saved CDF answers; no CDF calls.','Actual same/different diagonal, offdiagonal all variants, no-eligible and injected fit-failure routes retain matched fallback and source-copy flags. Memo-instance counts match new fit callbacks, original routes have none.','Three retained multi-origin cases preserve first-inner double-grid reset byyear; distinct current79-owner witness binds publication/provenance/ancestry without relabeling inherited source identity.','Original grade method exact AST and explicitly selected qualified scorer/EncodingAssembly were separately inspected; unchanged scientific helpers remain frozen.','51 actual tests and2 owned CLI/watchdog rejection probes passed; root constructed passed receipt only after tool exit0 and completed bounded commit. This review authenticates that retained evidence, not a new execution.']
limits=['Reviewer authored new preflight; its correctness is not claimed independently reviewed here. This is independent numerical composition/output review; preflight needs separate root/temporal review.','Five tiny paired numerical fixtures are not all historic laws or a full simultaneous277-origin scientific execution. Complete routing uses explicit artificial clock/source/model/scorer seams.','Unchanged large fixture/evaluator/bootstrap evidence is reused through authenticated recorded pins and prior accepted scope, not rerun or independently recomputed in this review.','New-owner witness is ownership/lineage fixture, not fabricated historical permission. No historical fit/recovery/scoring/bootstrap or production activity occurred in this review.','Memory remains sampled/retained high-water and qualification cost excludes interpreter startup as declared; no historical capacity or predictive/external5-percent improvement is established.']
result={'version':'rfcomp04.controller-review.v1','status':'accepted','scope':q['scope'],'role':'numerical','code_hashes':q['code_hashes'],'runtime':q['runtime'],'runtime_files':q['runtime_files'],'protocol_sha256':q['protocol_sha256'],'config_sha256':q['config_sha256'],'compute_protocol_sha256':q['compute_protocol_sha256'],'qualification_sha256':sha(P/'qualification.json'),'historical_execution':False,'tests':{'run':53,'passed':53},'test_count_basis':'Actual retained qualification51 test methods+2CLI probes; no reruns during review.','evidence':[ptr(P/'qualification.json'),ptr(P/'numerical-observations.json'),ptr(P/'qualification-commit.json'),ptr(P/'unit-tests.json'),ptr(P/'process.json'),ptr(pathlib.Path(__file__).resolve())],'blockers':[],'findings':findings,'limitations':limits,'independent_saved_checks':{'paired_cases':pair_results,'rows_per_route':rows,'new_score_calls_per_route':scored,'mass_calls_per_route':masses,'array_representations_checked_both_routes':arrays}}
out=P/'numerical-review.json';out.write_text(enc(result).decode());print(ptr(out))
