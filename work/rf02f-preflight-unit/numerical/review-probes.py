import ast
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import resource
import sys
import time
import unittest

START = time.monotonic()
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OUT = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02f-preflight-unit/numerical')
sys.path.insert(0, str(ROOT/'scripts'))
import research_score_split_preflight as p
spec = importlib.util.spec_from_file_location('held_preflight_tests', ROOT/'tests/research-score-split/test_preflight_unit.py')
t = importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
from research_score_split_run import strict


def digest_file(path): return hashlib.sha256(path.read_bytes()).hexdigest()


source_hashes = {name: digest_file(ROOT/name) for name in (
    'scripts/research_score_split_preflight.py', 'tests/research-score-split/test_preflight_unit.py')}
assert len(p.CODE_FILES) == 66 and len(p.FROZEN_CODE_HASHES) == 60 and len(p.CANDIDATE_FILES) == 6
assert set(p.CODE_FILES) == set(p.FROZEN_CODE_HASHES) | set(p.CANDIDATE_FILES)
assert not set(p.FROZEN_CODE_HASHES).intersection(p.CANDIDATE_FILES)
frozen = {name: digest_file(ROOT/name) for name in p.FROZEN_CODE_HASHES}
assert frozen == p.FROZEN_CODE_HASHES
observed_new = {name: digest_file(ROOT/name) for name in p.CANDIDATE_FILES}
import_edges = []
for name in p.CODE_FILES:
    for node in ast.walk(ast.parse((ROOT/name).read_text())):
        names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module] if isinstance(node, ast.ImportFrom) and node.module else []
        for module in names:
            if module.startswith('research_score_'):
                dependency = 'scripts/' + module.split('.')[0] + '.py'
                assert dependency in p.CODE_FILES, (name, dependency)
                import_edges.append([name, dependency])
assert p.actual_runtime() == p.RUNTIME
reads = {}
def check():
    assert time.monotonic()-START < 115
def read(path, callback, **expected):
    raw = p._file(path, callback, **expected)
    reads[str(path)] = {'sha256': p.digest(raw), 'bytes': len(raw)}
    return raw
stages = {}
for name, expected in p.STAGES.items():
    path = ROOT/expected['path']; raw = read(path, check, expected_sha=expected['sha256'])
    body = p.parse(raw); assert body['status'] == expected['status']
    p._stage_evidence(body, ROOT, check, read=read)
    stages[name] = {'path': expected['path'], 'sha256': p.digest(raw), 'bytes':len(raw), 'status': body['status']}
assert len(stages)==9

negative_probes = []
for kind in ('null_qualification', 'null_review', 'null_evidence_sha', 'null_evidence_size'):
    fixture = t.Fixture()
    if kind == 'null_qualification':
        fixture.acceptance['qualification'].update(sha256=None, bytes=None)
        for pointer in fixture.acceptance['independent_reviews'].values():
            fixture.mutate_document(pointer, lambda value: value.update(qualification_sha256=None))
    elif kind == 'null_review':
        fixture.acceptance['independent_reviews']['temporal'].update(sha256=None, bytes=None)
    else:
        field = 'sha256' if kind.endswith('sha') else 'bytes'
        fixture.mutate_document(fixture.acceptance['qualification'], lambda value: value['evidence'][0].update({field:None}))
        qualification_sha = fixture.acceptance['qualification']['sha256']
        for pointer in fixture.acceptance['independent_reviews'].values():
            fixture.mutate_document(pointer, lambda value: value.update(qualification_sha256=qualification_sha))
    try: fixture.run()
    except ValueError as error: negative_probes.append({'probe':kind,'rejected':True,'reason':str(error)})
    else: raise AssertionError('Unauthenticated pointer accepted: '+kind)
for pointer in ({'path':'synthetic.bin','sha256':None,'bytes':1},
                {'path':'synthetic.bin','sha256':'a'*64,'bytes':None}):
    invoked = []
    try: p._pointer(pointer,ROOT,check,read=lambda *a,**k:invoked.append(True))
    except ValueError: pass
    else: raise AssertionError('Null pointer reached injected reader')
    assert invoked == []
fixture=t.Fixture(); result=fixture.run(); assert result==fixture.run()
assert p.encoded(result['manifest'])==strict(result['manifest'])
assert result['manifest_sha256']==p.digest(strict(result['manifest']))
assert result['identity']=='rf02f-v1-'+result['manifest_sha256'][:16]
assert 'manifest_sha256' not in fixture.acceptance
for pointer in [fixture.acceptance['qualification'],*fixture.acceptance['independent_reviews'].values()]:
    body=json.loads(fixture.files[fixture.root/pointer['path']])
    assert 'implementation_acceptance_sha256' not in body and 'manifest_sha256' not in body
    assert body['code_hashes']==fixture.code
suite=unittest.defaultTestLoader.loadTestsFromModule(t)
run=unittest.TextTestRunner(verbosity=2).run(suite)
assert run.wasSuccessful()
for name,fingerprint in source_hashes.items(): assert digest_file(ROOT/name)==fingerprint
report={'status':'accepted_preflight_numerical_schema_and_binding_unit_only','source_hashes':source_hashes,
    'frozen_code_hashes':frozen,'unfrozen_registry_members_observed_hashes':observed_new,
    'actual_runtime':p.actual_runtime(),'stage_pins':stages,'authenticated_embedded_evidence':reads,
    'registered_import_edges':import_edges,'negative_probes':negative_probes,
    'tests_run':run.testsRun,'tests_failed':len(run.failures)+len(run.errors),
    'process_seconds':time.monotonic()-START,'peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2,
    'blockers':[],'closed_blocker':'Null required pointer digest/size formerly bypassed optional _file checks; final source rejects them before reading.',
    'conclusions':['Exact66 registry consists of60 fixed accepted files plus6 final candidate files; all local research_score imports are represented.',
        'Nine actual frozen stage receipts and their embedded pointers authenticate under the accepted roots.',
        'Runtime values and permission types are exact; deterministic manifest bytes equal accepted Store strict serialization including signed zero.',
        'Approval -> distinct qualification/reviews -> exact source hashes is acyclic; the new manifest binds approval and does not appear in its prerequisites.'],
    'limitations':['Six observed final candidate hashes are a review snapshot, not independent acceptance of those other implementations.',
        'The owner must create and authenticate the final approval only after complete controller qualification and distinct reviews.',
        'No final approval file, historical source admission, fit, score, bootstrap or historical invocation was created or run.']}
(OUT/'preflight-review.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'path':str(OUT/'preflight-review.json'),'sha256':digest_file(OUT/'preflight-review.json'),
    'tests':run.testsRun,'seconds':report['process_seconds'],'rss_mib':report['peak_rss_mib'],
    'authenticated_evidence_files':len(reads),'registered_import_edges':len(import_edges),'null_pointer_probes':negative_probes}),flush=True)
