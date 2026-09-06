"""Independent stdlib-only RF-02E metadata and persistence audit; no model calls."""
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter
import hashlib
import importlib.metadata
import json
import math
import os
import resource
import stat
import sys
import time

START = time.monotonic()
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
REPO = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
RUN = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02e-v1-b6a2bfb0ff2f0dd3')
MH = 'b6a2bfb0ff2f0dd300011816f2500cd94864d4ecab7db771461844b71ee3e4d8'
IH = '00f441fa3e6477cb906f7bd7da7b11edd4fe8bb49938603bb242295306303a78'
TH = '83a7fb8f0b01a7f7372df3e9fbec48e145a8ff1f8d066d7cb3b02dae0db6ee6f'
AH = '72aefcf0f0cb6ccfca7620bb2bc05902efbc092759505104a8034791c28e08f8'
LIMITS = {'total_seconds': 600, 'peak_rss_mib': 4096, 'invalid_finalization_only_grace_seconds': 30}
YEARS = list(range(2013, 2026))
YEAR_COUNTS = [256] * 8 + [272, 271, 272, 272, 272]

def check():
    assert time.monotonic() - START <= 300, 'audit_time_limit'
    assert resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2 <= 4096, 'audit_memory_limit'

def sha(raw): return hashlib.sha256(raw).hexdigest()
def enc(value): return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()
def fp(value): return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode())
def pairs(rows):
    result = {}
    for k, v in rows:
        assert k not in result, 'duplicate_json_key'
        result[k] = v
    return result

def parse(raw):
    def number(s):
        x = float(s); assert math.isfinite(x); return x
    def constant(s): raise AssertionError('nonfinite_json_constant')
    return json.loads(raw, object_pairs_hook=pairs, parse_float=number, parse_constant=constant)

def raw(path, pin=None, length=None):
    check(); path = Path(path)
    assert path.is_absolute() and '..' not in path.parts
    assert not any(p.is_symlink() for p in [path, *path.parents]), 'symlink'
    with path.open('rb') as f:
        assert stat.S_ISREG(os.fstat(f.fileno()).st_mode)
        b = f.read()
    if pin is not None: assert sha(b) == pin, str(path)
    if length is not None: assert len(b) == length, str(path)
    return b

def doc(path, pin=None, length=None): return parse(raw(path, pin, length))
def pointer(p): return doc(p['path'], p['sha256'], p.get('bytes'))
def file_pointer(p):
    b = raw(p); return {'path': str(p), 'sha256': sha(b), 'bytes': len(b)}
def ip(index, name): return {'name': name, **index['files'][name]}
def indexed(directory, index, name):
    p = index['files'][name]; return doc(directory / name, p['sha256'], p['bytes'])
def membership(directory, index):
    assert set(index) == {'files','uncommitted_artifacts','uncommitted_staging'}
    assert index['uncommitted_artifacts'] == index['uncommitted_staging'] == []
    expected = set(index['files']) | {'completion/artifact-index.json'}
    files, dirs = set(), set()
    for parent, children, names in os.walk(directory, followlinks=False):
        for name in children:
            p = Path(parent)/name; assert not p.is_symlink(); dirs.add(str(p.relative_to(directory)))
        for name in names:
            p = Path(parent)/name; assert not p.is_symlink(); files.add(str(p.relative_to(directory)))
    assert files == expected and dirs == {'completion'}
    n = 0
    for name, p in index['files'].items():
        assert not Path(name).is_absolute() and all(x not in ('','.','..') for x in name.split('/'))
        assert set(p) == {'sha256','bytes'} and type(p['bytes']) is int
        n += len(raw(directory/name, p['sha256'], p['bytes']))
    return {'files':len(index['files']), 'bytes':n, 'physical_files':len(files), 'uncommitted_artifacts':[], 'uncommitted_staging':[]}

def ts(s):
    t = datetime.fromisoformat(s); assert t.utcoffset() is not None; return t

manifest = doc(RUN/'manifest.json', MH)
index = doc(RUN/'completion/artifact-index.json', IH)
terminal = doc(RUN/'completion/terminal.json', TH)
new_integrity = membership(RUN, index)
assert new_integrity['files'] == 6 and new_integrity['bytes'] == 38671343
assert RUN.name == 'rf02e-v1-' + MH[:16]
assert manifest['implementation_acceptance']['sha256'] == AH
implementation = pointer(manifest['implementation_acceptance'])
protocol_acceptance = pointer(manifest['protocol_acceptance'])
assert manifest['protocol_acceptance']['sha256'] == '04fe44fde901dc3a42c53038b5c9fefa93b9e8e3bfda156f9ac319083156fe23'
assert manifest['protocol']['sha256'] == '3492747a0e20cbe864be218869fe942d2e2e0ec038e1c01b4d1e909237d1b500'
raw(manifest['protocol']['path'], manifest['protocol']['sha256'], manifest['protocol']['bytes'])
assert implementation['status'] == 'accepted_for_one_bounded_derived_inference'
assert implementation['protocol_acceptance'] == manifest['protocol_acceptance']
assert implementation['protocol'] == manifest['protocol'] == protocol_acceptance['protocol']
assert protocol_acceptance['status'] == 'accepted_for_implementation_only'
assert manifest['limits'] == protocol_acceptance['limits'] == LIMITS
inputs = manifest['fixed_inputs']; assert inputs == protocol_acceptance['fixed_inputs'] and len(inputs)==15
objects = {}
for name, p in inputs.items():
    b = raw(p['path'], p['sha256'], p['bytes'])
    if Path(p['path']).suffix == '.json': objects[name] = parse(b)
code = manifest['code_hashes']; assert code == implementation['code_hashes'] and len(code)==45
assert {k:v for k,v in code.items() if k not in ('scripts/research_score_conditional_infer_archive.py','tests/research-score-conditional-margin/test_infer_archive.py')} == protocol_acceptance['accepted_source_hashes']
assert code['scripts/research_score_conditional_infer_archive.py'] == 'f464c04fb8c0173571c56589e0823aec64719d5c1e3c6bbf9deb3bbadd4a8601'
assert code['tests/research-score-conditional-margin/test_infer_archive.py'] == 'aef020dfcf0d8b8a860b05345dc3fce46d7cd615fe83d43e7bb0edc3555ac3b9'
for name, pin in code.items(): raw(REPO/name, pin)
assert implementation['qualification']['sha256'] == '15210002536f2ebedd46151b21cd37c82145b20d8ec5d2b0b5aa13d2a2e3bdca'
qualification = pointer(implementation['qualification'])
assert qualification['status']=='passed' and qualification['source_hashes']==code and qualification['protocol_sha256']==manifest['protocol']['sha256']
assert qualification['complete_wrapper_real_bootstrap'] is True
assert set(implementation['implementation_reviews'])=={'numerical','temporal'}
for p in implementation['implementation_reviews'].values():
    r=pointer(p)
    assert r['status']=='accepted' and r['blockers']==[] and r['source_hashes']==code
    assert r['scope']=='complete_archive_wrapper_and_real_bootstrap_qualification'
    assert r['protocol_sha256']==manifest['protocol']['sha256'] and r['qualification_sha256']==implementation['qualification']['sha256']
for p in protocol_acceptance['protocol_reviews'].values(): assert pointer(p)['status']=='accepted_for_implementation_only'

oldmanifest=objects['RF-02D `manifest.json`'];oldindex=objects['RF-02D `completion/artifact-index.json`'];oldterminal=objects['RF-02D `completion/terminal.json`']
old=Path(inputs['RF-02D `manifest.json`']['path']).parent
old_integrity=membership(old,oldindex)
assert old_integrity['files']==904 and old_integrity['bytes']==1024286216
assert oldterminal['status']=='protocol_invalid' and oldterminal['reason']=='inference_protocol_invalid:nonfinite_or_nonnumeric_metric'
assert inputs['RF-02D `completion/terminal.json`']['sha256']=='7542e806cb2cad495470acad231c888ddbdcd316d449c3f106384c670cdee238'
prior_temporal=objects['Actual temporal terminal review'];prior_numerical=objects['Actual numerical terminal review'];retained=objects['RF-02D retained-terminal acceptance']
assert prior_temporal['status']=='accepted_temporal_integrity_of_invalid_retained_run' and prior_temporal['blockers']==[]
assert prior_numerical['status']=='accepted_invalid_terminal_evidence_only' and retained['status']=='accepted_retained_invalid_historical_evidence_only'
assert implementation['terminal_acceptance']==inputs['RF-02D retained-terminal acceptance']
assert retained['accepted_source_hashes']==oldmanifest['code_hashes']==protocol_acceptance['accepted_source_hashes']
assert oldmanifest['runtime']==implementation['runtime']==manifest['runtime']==objects['RF-02C parent manifest']['runtime']
for p in oldmanifest['acceptances'].values(): pointer(p)
for p in oldmanifest['audit_evidence'].values():
    r=pointer(p);assert r['status']=='accepted' and r['source_hashes']==oldmanifest['code_hashes']
for review, ik in [(prior_temporal,'artifact_index_sha256'),(prior_numerical,'index_sha256')]:
    assert review['manifest_sha256']==inputs['RF-02D `manifest.json`']['sha256']
    assert review[ik]==inputs['RF-02D `completion/artifact-index.json`']['sha256']
    assert review['terminal_sha256']==inputs['RF-02D `completion/terminal.json`']['sha256']
runtime=manifest['runtime'];assert sys.version.split()[0]==runtime['versions']['python'] and sys.flags.isolated==1
raw(Path(runtime['executable']),runtime['executableSha256'])
for name,pins in runtime['distributionMetadata'].items():
    dist=importlib.metadata.distribution(name);assert dist.version==runtime['versions'][name]
    # Frozen runtime_manifest hashes importlib.metadata read_text output (universal newlines).
    assert sha(dist.read_text('METADATA').encode())==pins['metadataSha256']
    assert sha(dist.read_text('RECORD').encode())==pins['recordSha256']

ledger=indexed(RUN,index,'authenticated-inputs.json');audit=indexed(RUN,index,'audit-inputs.json');evaluation=indexed(RUN,index,'evaluation.json')
config=objects['`config/research-team-score-conditional.v1.json`'];data=objects['Admitted score data v2']
assert implementation['config']==inputs['`config/research-team-score-conditional.v1.json`']
assert ledger['run_manifest_sha256']==audit['run_manifest_sha256']==terminal['run_manifest_sha256']==MH
assert audit['input_ledger_sha256']==index['files']['authenticated-inputs.json']['sha256']
assert ledger['source_manifest']==ip(oldindex,'manifest.json')
assert ledger['source_artifacts']==[[name,p['sha256'],p['bytes']] for name,p in oldindex['files'].items()]
assert terminal['original_terminal']==inputs['RF-02D `completion/terminal.json`']
for field,name in [('audit_inputs','audit-inputs.json'),('authenticated_inputs','authenticated-inputs.json'),('evaluation','evaluation.json')]:assert terminal[field]==ip(index,name)
assert audit['accepted_actual_reviews']=={name:inputs[name] for name in ('Actual temporal terminal review','Actual numerical terminal review')}
assert audit['limitations']==retained['limitations']
for field,name in [('source_runtime_checks','runtime-checks.json'),('source_case_collection','case-collection.json'),('source_annual_index','annual-index.json')]:assert audit[field]==ip(oldindex,name)
checks={'admission':True,'leakage':True,'falsification':True,'no_new_numerical_failure':True}
assert audit['checks']==terminal['audit_checks']==evaluation['audit_checks']==checks
assert all(type(v) is bool for v in audit['checks'].values())
assert manifest['scope']==terminal['scope']=='derived_retrospective_inference_from_rf02d_saved_scores'
assert terminal['status']==evaluation['status']=='reject_all' and terminal['mapping_supported'] is terminal['candidate_qualified'] is False
for k,v in evaluation.items():
    if k not in ('scorecards','inference','version'):assert terminal[k]==v,k
for docu in (manifest,audit,ledger,terminal):assert docu['rf02d_scientific_terminal_status']=='protocol_invalid'
assert terminal['execution_counts']=={'historical_fit':0,'historical_transform':0,'historical_predict':0,'historical_score':0,'evaluate':1}
assert terminal['limits']==LIMITS and 0<terminal['seconds']<=600 and 0<terminal['peak_rss_mib']<=4096
assert terminal['independent_actual_result_acceptance'] is terminal['production_authorized'] is terminal['automatic_restart'] is False

origins=[o for o in data['origins'] if o['season'] in YEARS];records={r['gameId']:r for r in data['records']}
keys=[g for o in origins for g in o['targetGameIds']]
assert len(origins)==226 and len(keys)==len(set(keys))==3407
assert [sum(len(o['targetGameIds']) for o in origins if o['season']==y) for y in YEARS]==YEAR_COUNTS
assert [(o['season'],o['week']) for o in origins]==sorted(set((o['season'],o['week']) for o in origins))
assert sha(enc(keys))==ledger['ordered_games_sha256']==prior_temporal['population_and_provenance']['ordered_games_sha256']
metadata=[{'game_id':g,'season':o['season'],'week':o['week']} for o in origins for g in o['targetGameIds']]
assert sha(enc(metadata))==ledger['metadata_sha256']
mapped=[tuple(k) for k in config['series']];reference=[tuple(k) for k in config['raw_references']];ordinary=[(f[:-1],v) for f,v in mapped if v!='independent_marginals']
assert [(r['family'],r['variant'],r['rows']) for r in ledger['series']]==[(f,v,3407) for f,v in mapped+reference]
collection=indexed(old,oldindex,'case-collection.json');admission=indexed(old,oldindex,'admission.json');ai=indexed(old,oldindex,'annual-index.json');oldruntime=indexed(old,oldindex,'runtime-checks.json')
assert collection['unique_prior_cases']==56430 and collection['latest_case_season']==2024
assert collection['case_inputs_sha256']==admission['case_inputs_sha256']==prior_temporal['case_and_receipt_validation']['case_aggregate_sha256']
assert collection['recovered_sources_sha256']==admission['recovered_sources_sha256']==prior_temporal['case_and_receipt_validation']['original_source_fp_aggregate_sha256']
assert [(x['season'],x['pointer']['name']) for x in collection['case_chunks']]==[(o['season'],f"cases-{o['season']}-{o['week']:02}.json") for o in origins if o['season']<2025]
assert all(x['pointer']==ip(oldindex,x['pointer']['name']) for x in collection['case_chunks'])
assert [(e['target_season'],e['family'],e['variant']) for e in ai['entries']]==[(y,*k) for y in YEARS for k in ordinary]
annual={};closure=[];case_source_occurrences=0
for e in ai['entries']:
    y,f,v=e['target_season'],e['family'],e['variant'];assert e['pointer']==ip(oldindex,e['pointer']['name'])
    env=indexed(old,oldindex,e['pointer']['name']);b=env['pure_receipt'];cutoff=next(o['originAt'] for o in origins if o['season']==y)
    prior=[g for o in origins if o['season']<y for g in o['targetGameIds']]
    assert env['run_manifest_sha256']==inputs['RF-02D `manifest.json`']['sha256']
    assert (env['family'],env['variant'],env['target_season'])==(f,v,y)
    assert env['case_chunks']==[x['pointer'] for x in collection['case_chunks'] if x['season']<y]
    assert b['sha256']==env['pure_receipt_sha256']==e['pure_receipt_sha256']==fp({k:v for k,v in b.items() if k!='sha256'})
    assert (b['family'],b['variant'],b['target_season'],b['cutoff'])==(f,v,y,cutoff)
    assert b['expected_count']==b['native_success_count']==len(prior) and b['failed_count']==0 and b['failed_keys']==[]
    assert b['case_keys']==prior and len(b['case_sources'])==len(prior)
    for row,g in zip(b['case_sources'],prior):
        record=records[g]
        assert row['game_id']==g and row['season']==record['season']<y and row['season']<=2024 and row['weight']==1
        assert all(ts(record['availability'][d])<ts(cutoff) for d in ('12','24'))
        assert len(row['source_fingerprint'])==len(row['case_fingerprint'])==64
    assert type(b['scale']) in (float,int) and 0<=b['scale']<=1
    if y==2013:assert b['scale']==1 and b['status']=='identity_no_prior_outer_support' and b['estimator'] is None
    else:assert b['estimator']['s']==b['scale'] and b['estimator']['status']==b['status']
    annual[y,f,v]=(e['pointer'],b['sha256'],b['scale'])
    closure.append([y,f,v,cutoff,len(prior),sha(enc(prior)),sha(enc(b['case_sources']))]);case_source_occurrences+=len(prior)
assert ai['cold_starts']==18 and ai['estimated_receipts']==216 and len(annual)==234
counts=Counter();native=Counter();parentindex=objects['RF-02C parent index'];recipe_digest=hashlib.sha256()
for origin,entry in zip(origins,ledger['origins']):
    suffix=f"{origin['season']}-{origin['week']:02}.json";sn='scores-'+suffix;pn='forecasts-'+suffix
    assert entry=={'origin':origin,'scores':ip(oldindex,sn),'publication':ip(oldindex,pn)}
    scores=indexed(old,oldindex,sn);publication=indexed(old,oldindex,pn)
    assert scores['origin']==publication['origin']==origin
    assert scores['run_manifest_sha256']==publication['run_manifest_sha256']==inputs['RF-02D `manifest.json`']['sha256']
    key=lambda row:(row['family'],row['variant'],row['game_id'])
    expected=[(*k,g) for k in mapped for g in origin['targetGameIds']]
    assert list(map(key,scores['mapped']))==list(map(key,publication['rows']))==expected
    assert list(map(key,scores['raw_references']))==[(*k,g) for k in reference for g in origin['targetGameIds']]
    fulls={(r['family'][:-1],r['game_id']):r for r in publication['rows'] if r['variant']=='full'}
    for row,recipe in zip(scores['mapped'],publication['rows']):
        f,v,g=key(row);p=recipe['provenance'];counts['mapped_rows']+=1;native[f,v]+=int(row['native_failure'] is not None)
        assert row['native_failure'] is recipe['native_failure'] is p['native_failure'] is None
        assert row['forecast_publication']==ip(oldindex,pn) and row['recipe_sha256']==sha(enc(recipe))
        assert recipe['parent_forecast']==ip(parentindex,pn)
        assert (recipe['season'],recipe['week'],recipe['origin_at'])==(origin['season'],origin['week'],origin['originAt'])
        assert p['sha256']==fp({k:v for k,v in p.items() if k!='sha256'})
        assert (p['family'],p['variant'],p['target_season'],p['game_id'],p['origin_at'])==(f[:-1],v,origin['season'],g,origin['originAt'])
        chosen=(f[:-1],'full' if v=='independent_marginals' else v);arp,arsha,scale=annual[origin['season'],*chosen]
        assert recipe['annual_envelope']==arp and p['annual_receipt_sha256']==arsha and p['transformation']['s']==scale
        assert p['chosen_source']=={'family':chosen[0],'variant':chosen[1],'game_id':g,'source_fingerprint':p['requested_source_fingerprint']}
        assert p['transformation']['original_distribution_fingerprint']==p['requested_source_fingerprint']
        if v=='independent_marginals':
            assert p['transformation']==fulls[f[:-1],g]['provenance']['transformation']
            assert p['product_operation']['joint_transformation']==p['transformation']
            assert p['product_operation']['resulting_distribution_fingerprint']==recipe['result_distribution_fingerprint']
        else:assert p['product_operation'] is None and p['transformation']['resulting_distribution_fingerprint']==recipe['result_distribution_fingerprint']
        recipe_digest.update(enc([f,v,g,row['recipe_sha256'],row['native_failure'],arp]))
    for row in scores['raw_references']:
        f,v,g=key(row);counts['raw_rows']+=1;native[f,v]+=int(row['native_failure'] is not None)
        assert row['native_failure'] is None and row['parent_loss']==ip(parentindex,'outer-losses-'+suffix)
        assert len(row['original_row_sha256'])==64
    for g in origin['targetGameIds']:
        record=records[g];assert (record['season'],record['week'])==(origin['season'],origin['week']) and ts(origin['originAt'])<ts(record['kickoffAt'])
    counts['origins']+=1
counts['native_reason_matches']=counts['mapped_rows']+counts['raw_rows']
assert dict(counts)==ledger['counts']=={'mapped_rows':68140,'raw_rows':20442,'origins':226,'native_reason_matches':88582}
assert sum(native.values())==0
assert set(oldruntime['checks'])=={'admission_passed','all_original_sources','all_prior_cases','annual_population','original_game_order','all_scored_series_order','complete_publications','all_mapped_laws_and_scores','all_native_reasons_matched'}
assert all(type(v) is bool and v for v in oldruntime['checks'].values()) and oldruntime['audit_checks']==checks

stamps={name:{'mtime_ns':(RUN/name).stat().st_mtime_ns,'ctime_ns':(RUN/name).stat().st_ctime_ns,'birthtime':(RUN/name).stat().st_birthtime} for name in ['started.json','authenticated-inputs.json','audit-inputs.json','evaluation.json','completion/terminal.json','completion/artifact-index.json','completion']}
assert stamps['authenticated-inputs.json']['mtime_ns']<=stamps['evaluation.json']['mtime_ns'] and stamps['audit-inputs.json']['mtime_ns']<=stamps['evaluation.json']['mtime_ns']
assert stamps['evaluation.json']['mtime_ns']<=stamps['completion/terminal.json']['mtime_ns']
assert stamps['completion/terminal.json']['mtime_ns']<=stamps['completion/artifact-index.json']['mtime_ns']
assert stamps['completion/artifact-index.json']['mtime_ns']<=stamps['completion']['ctime_ns']
rootpath=WORK/'work/rf02e-terminal-audit/root-integrity.json';rootobs=doc(rootpath)
assert rootobs['observed_session']==91512 and rootobs['observed_exit_code']==0
assert rootobs['manifest_sha256']==MH and rootobs['index_sha256']==IH and rootobs['terminal_sha256']==TH
assert rootobs['reported_run_return_seconds']>=terminal['seconds'] and rootobs['reported_run_return_seconds']<=600
for name,pin in code.items():raw(REPO/name,pin)
raw(RUN/'manifest.json',MH);raw(RUN/'completion/artifact-index.json',IH);raw(RUN/'completion/terminal.json',TH)
report={
 'version':'rf02e-actual-temporal-terminal-review.v1','status':'accepted_temporal_integrity_of_derived_retrospective_result','scope':'actual_temporal_provenance_and_persistence_only','blockers':[],
 'run_directory':str(RUN),'manifest_sha256':MH,'index_sha256':IH,'terminal_sha256':TH,'implementation_acceptance_sha256':AH,'protocol_sha256':manifest['protocol']['sha256'],
 'source_hashes':code,'all45_source_pins_reauthenticated_before_after':True,'runtime_pins_verified':True,'scientific_status':'reject_all','model_accepted':False,'mapping_supported':False,
 'original_rf02d_status':'protocol_invalid','original_rf02d_terminal_sha256':inputs['RF-02D `completion/terminal.json`']['sha256'],'original_rf02d_bytes_unchanged':True,
 'archive_integrity':new_integrity,'original_rf02d_integrity':old_integrity,
 'temporal_validation':{'origins':226,'games':3407,'development_games':3135,'exposed2025_games':272,'ordered_games_sha256':sha(enc(keys)),'metadata_sha256':sha(enc(metadata)),
  'counts':dict(counts),'all_native_reasons_zero_and_preserved':True,'all_original_origin_and_target_order_exact':True,'recipe_receipt_chain_sha256':recipe_digest.hexdigest(),
  'annual_receipts':234,'cold_starts':18,'estimated_receipts':216,'unique_prior_cases_bound':56430,'latest_case_year':2024,'both12_and24_hour_availability_before_original_cutoff':True,
  'annual_case_source_occurrences_verified':case_source_occurrences,'annual_closure_ledger_sha256':sha(enc(closure)),'all_predecessor_and_annual_recipe_pointers_exact':True,
  'metric_and_raw_row_digests':'Separate numerical reviewer owns exact metric/row digests and arithmetic. This audit verifies complete immutable input bytes, temporal row membership, native reasons and references and retains prior full RF-02D review scope.'},
 'acceptance_bindings':{'protocol_acceptance':manifest['protocol_acceptance'],'implementation_acceptance':manifest['implementation_acceptance'],'implementation_reviews':implementation['implementation_reviews'],
  'qualification':implementation['qualification'],'prior_temporal_review':inputs['Actual temporal terminal review'],'prior_numerical_review':inputs['Actual numerical terminal review'],'prior_terminal_acceptance':inputs['RF-02D retained-terminal acceptance']},
 'persistence':{'authoritative_terminal':'completion/terminal.json','atomic_terminal_index_pair_complete':True,'partial_or_staged_prefixes':False,'input_and_audit_ledgers_precede_evaluation_by_mtime':True,'timestamps':stamps},
 'resources':{'registered_total_seconds':600,'terminal_reported_seconds':terminal['seconds'],'return_seconds_reported_by_root':rootobs['reported_run_return_seconds'],'peak_rss_mib':terminal['peak_rss_mib'],'registered_rss_mib':4096,'reported_limits_passed':True,'invalid_only_grace_seconds':30,'invalid_grace_used':False},
 'execution_counts':terminal['execution_counts'],'process_observation':{'source':file_pointer(rootpath),'session_reported_by_root':91512,'exit_code_reported_by_root':0,'independently_observed_live_handle':False},
 'limitations':['This accepts temporal/provenance/persistence of the completed retrospective reject_all result, not model performance, mapping support, external5percent achievement or production. Independent numerical arithmetic/decision review is separate.',
 'All904 RF-02D indexed bytes were rehashed unchanged; prior full temporal and sampled numerical review scopes are reused. No distribution reconstruction, scalar re-estimation, case construction or scoring was repeated.',
 'This audit verified original target/series order, annual cutoffs/native reasons and recipe/reference chains; separate numerical review owns per-series metric digests and scorecard/bootstrap arithmetic.',
 'Root observed actual session91512 exit0. This audit authenticates the resulting bytes and root observation, not the original live handle or absence of unrelated executions.',
 'Mutable filesystem timestamps support ledger-before-evaluation and complete atomic publication under accepted source, but are not an independent monotonic execution trace, exact final-fsync duration, or historical forecast issuance log.',
 'Original RF-02D remains protocol_invalid and was not restarted/resumed or rewritten. All history remains exposed retrospective research; original historical publication and prospective validation remain unverified.'],
 'audit_operations':{'historical_evaluate_calls':0,'fit_calls':0,'transform_calls':0,'predict_calls':0,'score_calls':0,'archive_edits':0,'new_data_acquisition':0},
 'audit_resources':{'seconds':time.monotonic()-START,'peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2,'maximum_seconds':300,'maximum_rss_mib':4096},
 'audit_script_sha256':sha(raw(Path(__file__))), 'created_at':datetime.now(timezone.utc).isoformat()}
check();out=WORK/'work/rf02e-terminal-audit/temporal-terminal-review.json'
with out.open('xb') as f:f.write(enc(report))
print(json.dumps({'path':str(out),'sha256':sha(raw(out)),'bytes':out.stat().st_size,'status':report['status'],'audit_resources':report['audit_resources']}))
