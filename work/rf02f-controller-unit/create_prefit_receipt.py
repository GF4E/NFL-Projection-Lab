"""Root receipt assembly after completed, distinct final reviews. No history."""
import importlib.util
import json
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('fixed_preflight', ROOT/'scripts/research_score_split_preflight.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

def pointer(path, relative=False):
    raw = p._file(path, lambda: None)
    return {'path': str(path.relative_to(ROOT)) if relative else str(path),
            'sha256': p.digest(raw), 'bytes': len(raw)}

qualification = pointer(HERE/'complete-controller-qualification.v1.json')
assert qualification['sha256'] == 'b2e6978fafff32f95d6305c962c4d5baeef7a016a3e27aeefab1987caae9690e'
q = p.parse((HERE/'complete-controller-qualification.v1.json').read_bytes())
reviews = {role: pointer(HERE/('final-'+role+'-review.v1.json')) for role in ('numerical','temporal')}
value = {'version': p.VERSION, 'status': 'accepted_for_one_historical_invocation',
    'code_hashes': q['code_hashes'],
    'protocol': pointer(ROOT/p.PROTOCOL_PATH, True), 'config': pointer(ROOT/p.CONFIG_PATH, True),
    'stage_acceptances': {name: pointer(ROOT/stage['path'], True) for name, stage in p.STAGES.items()},
    'qualification': qualification, 'independent_reviews': reviews,
    'runtime': p.RUNTIME, 'permissions': p.PERMISSIONS}
raw = p.encoded(value)
sha = p.digest(raw)
# Production validation constants, actual runtime and actual files; no synthetic reader.
ready = p._validate(ROOT, value, sha, p.actual_runtime(), lambda: None,
    read=p._file, frozen=p.FROZEN_CODE_HASHES, candidates=p.CANDIDATE_FILES, stages=p.STAGES)
parent = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data')
assert not list(parent.glob('rf02f-v1-*')), 'existing_RF02F_model_namespace_no_restart'
assert not (ROOT/'work'/('rf02f-observer-'+sha[:16])).exists(), 'observer_already_exists'
out = ROOT/'.planning/engine-os/research-first/RF-02F-PREFIT-ACCEPTANCE.v1.json'
with out.open('xb') as f:
    f.write(raw)
with (HERE/'accepted-manifest-preview.v1.json').open('xb') as f:
    f.write(p.encoded(ready['manifest']))
with (HERE/'root-prefit-validation.v1.json').open('xb') as f:
    f.write(p.encoded({'status':'passed_read_only_prefit_validation',
        'acceptance': pointer(out), 'manifest_sha256': ready['manifest_sha256'],
        'identity': ready['identity'], 'planned_run_directory': str(parent/ready['identity']),
        'observer_directory': str(ROOT/'work'/('rf02f-observer-'+sha[:16])),
        'historical_execution':False, 'source_files':len(q['code_hashes']),
        'distinct_reviews':reviews, 'qualification':qualification}))
print(json.dumps({'acceptance': pointer(out), 'manifest_sha256':ready['manifest_sha256'],
    'identity':ready['identity'], 'run_directory':str(parent/ready['identity']),
    'historical_execution':False}))
