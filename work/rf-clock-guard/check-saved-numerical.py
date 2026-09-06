"""Saved-data qualification audit only; no project imports or scientific calls."""
import json,math,hashlib,struct,pathlib,collections
W=pathlib.Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf-clock-guard');A=W/'attempt-e2b761c09e6fddaa';Q=pathlib.Path('/private/tmp/os01-gen15-rebuild.9ny71k')
def enc(x):return (json.dumps(x,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def digest(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_bytes(),parse_constant=lambda x:(_ for _ in ()).throw(ValueError(x)))
pins=load(A/'INPUT-PINS.json');assert digest((A/'INPUT-PINS.json').read_bytes())=='e2b761c09e6fddaa265ac62ca312a9a429945fce3cb679947d559cf5747bccbb'
assert (A/'INPUT-PINS.json').read_bytes()==(A/'source-map-before.json').read_bytes()==(A/'source-map-after.json').read_bytes()
assert len(pins['code_hashes'])==91 and len(pins['runtime_files'])==7
for path,h in {**pins['code_hashes'],**pins['runtime_files']}.items():assert digest((Q/path).read_bytes())==h,path
artifact_map={p['path']:p for p in load(A/'qualification-artifacts.json')['files']}
for name in ('numerical-observations.json','controller-test-evidence.json','unit-tests.json','cli-probes.json','process.log'):
 p=A/name;b=p.read_bytes();assert digest(b)==artifact_map[str(p)]['sha256'] and len(b)==artifact_map[str(p)]['bytes']
obs=load(A/'numerical-observations.json');evidence=load(A/'controller-test-evidence.json');assert len(obs)==64
pairs=[v for v in obs if v.get('kind')=='real_science_pair'];assert [p['route'] for p in pairs]==['accepted_resource','guarded']
assert enc(pairs[0]['science'])==enc(pairs[1]['science'])
assert all(digest(enc(p['science']))==p['sha256']=='cc9bd72c9cb9da3302c49e1d1d84ce4f3a7dfbdc5532532b0e0fedc8a666f411' for p in pairs)
assert pairs[0]['callback_contract']==pairs[1]['callback_contract']
assert all(p['source_before']==p['source_after']==pairs[0]['source_before'] and p['source_globals_unchanged'] and p['deadline_seconds']==9000. for p in pairs)
shapes=collections.Counter();arrays=0;scalarbits=0;callback_modes=collections.Counter()
def flatten(v):
 if isinstance(v,list):return [x for z in v for x in flatten(z)]
 return [v]
for p in pairs:
 science=p['science'];assert len(science['laws'])==62 and len(science['inner_rows'])==54 and len(science['outer_rows'])==38
 for law in science['laws']:
  for field in law['fields'].values():
   if 'c_bytes_hex' in field:
    assert field['dtype']=='<f8' and field['writeable'] is False
    raw=bytes.fromhex(field['c_bytes_hex']);values=flatten(field['values']);assert math.prod(field['shape'])==len(values) and len(raw)==8*len(values)
    assert b''.join(struct.pack('<d',v) for v in values)==raw;arrays+=1
   elif 'float_bits' in field:assert struct.pack('>d',field['value']).hex()==field['float_bits'];scalarbits+=1
  for field in law['fields'].values():
   for v in flatten(field.get('values',field.get('value'))):
    if type(v) in (int,float):assert math.isfinite(v)
 rows=science['inner_rows']+science['outer_rows'];pr=science['provenance']['rows'];assert len(pr)==len(rows)==92
 expectedinner=[['E3',i,g] for g in ('z-target','a-target') for i in range(27)]
 assert [r['key'] for r in pr[:54]]==expectedinner
 for row,pv in zip(rows,pr):
  metrics=row['metrics'];assert digest(enc(metrics))==pv['metrics_sha256'] and row['native_failure']==pv['native_failure'] is None
  assert [row['family'],row['setting'] if pv['stage']=='inner' else row['variant'],row['game_id']]==pv['key']
  fields=28 if pv['stage']=='inner' else 108 if row['family']=='E3' else 104
  assert len(metrics)==fields;shapes[fields]+=1
  for k,v in metrics.items():
   if k=='grid_cells':assert type(v) is list and len(v)==2 and all(type(x)is int and x>0 for x in v)
   else:assert type(v) in (int,float) and math.isfinite(v)
  if pv['mode']=='new_score':assert pv['score_flags']['diagnostics']==(pv['stage']=='outer')
 for key,name in [('inner_rows','inner_losses'),('outer_rows','outer_losses')]:
  pointer=science['provenance']['score_artifacts'][name];raw=enc(science[key]);assert digest(raw)==pointer['sha256'] and len(raw)==pointer['bytes']
 callbacks=p['callbacks'];assert len(callbacks)==88
 assert [{k:v for k,v in c.items() if k not in ('started_seconds','finished_seconds','seconds')} for c in callbacks]==p['callback_contract']
 end=0.
 for c in callbacks:
  assert c['started_seconds']>=end and c['finished_seconds']-c['started_seconds']==c['seconds']>0;end=c['finished_seconds']
  assert c['error_reason'] is c['error_type'] is c['native_failure'] is None and c['used_fallback'] is False
  callback_modes[(c['kind'],c['stage'],c['double_grid'],c['diagnostics'])]+=1
 assert sum(c['kind']=='score' for c in callbacks)==40 and sum(c['kind']=='fit' for c in callbacks)==48
 route=next(v for v in evidence if v.get('route')==p['route']);assert route['scientific_sha256']==p['sha256'] and route['counts']==science['counts']
 assert digest(enc(science['provenance']))==route['grading_artifacts']['grading_provenance']['sha256']
negative=[r for r in obs if r.get('kind')=='synthetic_preflight_rejection'];assert len(negative)==28 and len({r['case'] for r in negative})==28
assert all(r['error']['type']=='ValueError' and r['returned_identity'] is None for r in negative)
positive=next(v for v in obs if v.get('kind')=='synthetic_guard_preflight');assert positive['identity']=='rfcomp09-v1-'+digest(enc(positive['manifest']))[:16]
assert positive['manifest']['budget']=={'seconds':9000,'projected_seconds':9000,'rss_mib':4096,'complete_smoke_seconds':120,'invalid_metadata_seconds':30,'external_worker_grace_seconds':0,'model_workers':1}
astrow=next(v for v in obs if v.get('kind')=='controller_ast_applicability');assert astrow['exact_chronology_object'] and astrow['unchanged_worker_main'] and astrow['unchanged_watchdog_import']
unit=load(A/'unit-tests.json');cli=load(A/'cli-probes.json');assert unit['success'] and unit['tests_run']==25 and not unit['failures'] and not unit['errors'] and not unit['skipped'];assert cli['passed'] and len(cli['probes'])==2
process=load(A/'process.json');commit=load(A/'qualification-commit.json');assert process['exit_code']==0 and process['stop'] is process['source_error'] is None and commit['elapsed_seconds']<600 and process['conservative_combined_rss_mib']<2048
report={'status':'passed_saved_numerical_checks','source_files':91,'runtime_files':7,'observations':64,'test_methods':25,'cli_probes':2,'real_routes':2,'paired_science_sha256':pairs[0]['sha256'],'scientific_rows_across_two_routes':184,'metric_field_counts_across_two_routes':dict(shapes),'complete_laws_across_two_routes':124,'readonly_float64_array_images_verified':arrays,'scalar_float_bit_images_verified':scalarbits,'callbacks_across_two_routes':176,'callback_modes':[{'kind':k[0],'stage':k[1],'double_grid':k[2],'diagnostics':k[3],'count':v} for k,v in callback_modes.items()],'preflight_negative_cases':negative,'positive_manifest_sha256':digest(enc(positive['manifest'])),'source_and_mapper_images_unchanged':True,'process_elapsed_seconds':process['wall_seconds'],'through_checked_commit_seconds':commit['elapsed_seconds'],'peak_combined_rss_mib':process['conservative_combined_rss_mib'],'no_scientific_execution_in_this_audit':True}
p=W/'numerical-saved-checks.v1.json';p.write_bytes(enc(report));print(json.dumps({k:v for k,v in report.items() if k!='preflight_negative_cases'},sort_keys=True));print('saved',digest(p.read_bytes()),p.stat().st_size)
