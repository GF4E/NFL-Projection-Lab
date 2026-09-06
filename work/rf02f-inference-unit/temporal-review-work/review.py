import hashlib,json,pathlib,sys,time,types,resource
started=time.monotonic()
root=pathlib.Path('/private/tmp/os01-gen15-rebuild.9ny71k')
workspace=pathlib.Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
sys.path.insert(0,str(root/'scripts'))
import research_score_split_inference as u
from research_score_contract import encoded
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(path,expected=None):
 raw=path.read_bytes()
 if expected: assert sha(raw)==expected,(str(path),sha(raw))
 return json.loads(raw),sha(raw)
q,qsha=load(workspace/'work/rf02f-inference-unit/full-943105d923d2043d/qualification.json','19f64845ee65da9631049a218aa19c3379dae873e164bd193a8bde2c874d2eeb')
for name,h in q['source_hashes'].items(): assert sha((root/name).read_bytes())==h
config,configsha=load(root/'config/research-team-score-split.v1.json','0fe90bbc966e8eb92e6d345b145fc297547b1f4b922d095a0eabbf5e97c60519')
assert sha((root/'.planning/engine-os/research-first/RF-02F-HISTORICAL-PROTOCOL.v1.md').read_bytes())=='d7b921cb2e9a8376b912363a5fff9f27168a2467411c45e144927c7a5d506d16'
r,rsha=load(workspace/'work/rf02f-inference-unit/root-review/result.json')
n,nsha=load(workspace/'work/rf02f-inference-unit/numerical-integration-review.json')
p,psha=load(workspace/'work/rf02f-inference-unit/full-943105d923d2043d-process.json','be3ae98089a18df6c5f907fa86c96a8d9be29f6209b5245d940318bcf88037d9')
assert all(report['qualification_sha256']==qsha and report['source_hashes']==q['source_hashes'] for report in [r,n])
assert p['exit_code']==0 and p['source_hashes_unchanged'] and p['limit_failure'] is None
assert p['external_wall_seconds_including_setup']<=600 and p['peak_rss_mib']<=4096
folder=workspace/'work/rf02f-inference-unit/full-943105d923d2043d'
f,fsha=load(folder/q['fixture_pointer']['name'],q['fixture_pointer']['sha256'])
assert f['synthetic_only'] and f['source_hashes']==q['source_hashes']
assert len(f['metadata'])==3407 and sum(x['season']<=2024 for x in f['metadata'])==3135
assert len(f['files'])==226
assert f['counts']==q['counts'] and f['audit_scope'].startswith('Synthetic ')
# Independently exercise the real evaluate body with private local call seams;
# no source globals, scorer, calibration or bootstrap are executed.
class Stop(BaseException): pass
metadata=[{'game_id':'prior','season':2024,'week':1},{'game_id':'exposed','season':2025,'week':1}]
rows={('E3','full'):[{'sentinel':'prior'},{'sentinel':'never-in-inference'}]}
captured={}
def infer(meta,metrics,*rest):
 captured.update(metadata=meta,metrics={':'.join(k):v for k,v in metrics.items()})
 raise Stop('private temporal seam')
g=dict(u.evaluate.__globals__)
g.update(validate=lambda *_:(tuple(rows),[],[],rows,{('E3','full'):[None,None]}),scorecards=lambda *_:{},_infer=infer)
cloned=types.FunctionType(u.evaluate.__code__,g,u.evaluate.__name__)
try: cloned(config,metadata,{},dict.fromkeys(u.AUDITS,True))
except Stop: pass
else: raise AssertionError('BaseException swallowed')
assert captured=={'metadata':[metadata[0]],'metrics':{'E3:full':[rows['E3','full'][0]]}}
assert u.evaluate.__globals__['_infer'] is not infer
invalid=u.evaluate(config,[],{},dict.fromkeys(u.AUDITS,True))
assert invalid['status']=='protocol_invalid' and invalid['reason']=='production_common_population_required'
report={
 'status':'accepted','scope':'synthetic_inference_unit_temporal_persistence_review_only',
 'source_hashes':q['source_hashes'],'protocol_sha256':'d7b921cb2e9a8376b912363a5fff9f27168a2467411c45e144927c7a5d506d16',
 'config_sha256':configsha,'qualification_sha256':qsha,'fixture_manifest_sha256':fsha,
 'evaluation_sha256':q['evaluation_pointer']['sha256'],'root_review_sha256':rsha,
 'numerical_integration_review_sha256':nsha,'process_report_sha256':psha,'blockers':[],
 'independent_checks':{
  'exact_three_source_files_and_frozen_registry_authenticated':True,
  'source_review_scorer_to_exclusive_write_flush_fsync_then_bound_reload_before_public_evaluate':True,
  'source_review_full_real_10000_member_three_block_call_no_monkeypatch_or_reduced_gate':True,
  'source_review_cache_law_game_observation_effective_flags_source_runtime_key_and_deep_copy':True,
  'source_review_actual_game_PIT_provenance_loader_and_all_row_digests':True,
  'saved_full_population':q['counts'],'development_games':3135,'exposed_games':272,
  'all_issued_failure_population_reviewed':3407,
  'private_real_evaluate_body_cutoff_and_BaseException_probe':captured,
  'malformed_population_public_evaluate_is_invalid':True,
  'same_directory_existing_identity_refused_by_qualifier_mkdir':True,
  'active_600_second_signal_post_evaluator_budget_check_and_invalid_return_failure_reviewed':True,
  'external_confirmed_process_exit':0,'full_external_seconds':p['external_wall_seconds_including_setup'],
  'full_peak_rss_mib':p['peak_rss_mib'],
  'root_authenticated_artifact_evidence_reused':{'artifacts':r['authenticated_artifacts'],'bytes':r['authenticated_bytes']},
 },
 'limitations':[
  'No full suite, scorer, fits, bootstrap or historical inference invoked by this review. The private evaluate-body probe uses synthetic dependency seams only and does not claim public qualification.',
  'Complete persisted artifact/digest coverage relies on the separately authenticated root and numerical reports; this review reauthenticates their bindings and examines the actual source call order and population receipt.',
  'fsync/source order and process receipts support actual synthetic persistence; filesystem timestamps do not prove historical pregame issuance. All fixture game IDs and observations are synthetic.',
  'The public evaluator validates shape and supplied audit booleans, not actual archive membership, original game order, genuine native reasons or retrospective timing. The archive/controller must substantiate these.',
  'The qualifier is a synthetic entry point, not the historical atomic controller. Its final metadata write follows signal cancellation; the separately observed full process completed within 600 seconds. Complete historical deadline/finalization/no-resume qualification is still required.',
  'No predictive acceptance, historical invocation authority, model promotion, production, prospective or external-five-percent claim.'
 ],'new_fit_calls':0,'new_score_calls':0,'new_bootstrap_calls':0,
 'review_seconds':time.monotonic()-started,'review_peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20}
out=workspace/'work/rf02f-inference-unit/temporal-review.json'
with out.open('xb') as stream: stream.write(encoded(report))
print(json.dumps({'path':str(out),'sha256':sha(out.read_bytes()),'status':report['status'],'seconds':report['review_seconds'],'rss':report['review_peak_rss_mib']}))
