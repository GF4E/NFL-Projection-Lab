"""Metadata-only review: never import candidate, tests, driver or scientific code."""
from pathlib import Path
import ast
import base64
from collections import Counter
import hashlib
import json
import math
import struct

WORK = Path(__file__).resolve().parent
ATTEMPT = WORK / 'attempt-69d40bc02f2e89df'
PROFILE = WORK.parent / 'rf-origin-profile/profile-685708ac9c57a623'
REPO = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
checks = 0
evidence = {}


def require(ok, why):
    global checks
    checks += 1
    if not ok:
        raise AssertionError(why)


def pin(raw):
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}


def raw(path):
    require(path.is_file() and not path.is_symlink(), 'regular file: ' + str(path))
    value = path.read_bytes()
    evidence[str(path)] = pin(value)
    return value


def parse(value):
    def bad(token):
        raise AssertionError('nonfinite JSON token: ' + token)
    return json.loads(value, parse_constant=bad)


completion = parse(raw(ATTEMPT / 'completion.json'))
index_raw = raw(ATTEMPT / 'artifact-index.json')
require(pin(index_raw) == completion['artifact_index'], 'completion binds index')
index = parse(index_raw)['files']


def retained(name, decode=True):
    value = raw(ATTEMPT / name)
    require(pin(value) == index[name], 'indexed bytes: ' + name)
    return parse(value) if decode else value


pins_raw = retained('INPUT-PINS.json', False)
require(pin(pins_raw)['sha256'] == '69d40bc02f2e89df7fc9182e63df862ee0d7e43303c5c882bafb07cb0647aedc', 'fixed qualification pins')
pins = parse(pins_raw)
require(retained('source-map-before.json') == pins == retained('source-map-after.json'), 'before/after maps equal')
require(len(pins['code_hashes']) == 79 and len(pins['runtime_files']) == 7, 'frozen closure counts')
fixed = {
    REPO / 'scripts/research_score_strict_compute.py': '87bfff865b0626ec05569a49e6c7935106b12f87ca222cf8ab5d7251edf97523',
    REPO / 'tests/research-score-strict-compute/test_strict_compute.py': '0ed92cbf7c902a9718e28bfb732c90a547945b8d1eddbe5850db775c6463a935',
    REPO / '.planning/engine-os/research-first/RF-COMP-05-STRICT-SCOPE.v1.md': 'e734420782264bfdf4dc80ec784c5e7cc05b2cab7a1836628cc77243fe74e344',
    WORK / 'qualify_strict.py': 'a5b746892bfac9e94e486db8379919cd4550d41754ca0437cc06b2f9ea045a86',
    WORK / 'static-numerical-review.md': 'd3560cca44dba39c5cdfbfa2ea6b2698252039eeb1690c706b15eb792bd86f75',
}
for path, digest in fixed.items():
    value = raw(path)
    require(pin(value)['sha256'] == digest == pins['inputs'][str(path)]['sha256'], 'current fixed source ' + str(path))
    require(retained('snapshots/' + digest, False) == value, 'snapshot same fixed source')
test_source = raw(REPO / 'tests/research-score-strict-compute/test_strict_compute.py')
methods = {n.name for n in ast.walk(ast.parse(test_source)) if isinstance(n, ast.FunctionDef) and n.name.startswith('test_')}
require(len(methods) == 28, '28 source methods')
result = retained('child-result.json')
process = retained('process.json')
log = retained('unittest.log', False).decode()
require(result['tests']['count'] == 28 and all(result['tests'][k] == 0 for k in ('errors', 'failures', 'skipped')), '28 actual tests passed')
require(log.count(' ... ok\n') == 28 and '\nOK\n' in log, 'actual test log passed')
require(process['exit_code'] == 0 and process['stop'] is None and process['source_error'] is None, 'process success evidence')

counts = Counter()
errors = Counter()
guard_status = Counter()
observed_methods = set()
observation_names = sorted(str(f.relative_to(ATTEMPT)) for f in (ATTEMPT / 'test-observations').glob('*.json'))
require(observation_names == ['test-observations/%04d.json' % i for i in range(1, 172)], '171 ordered observations')
labels = {}
for name in observation_names:
    row = retained(name)
    observed_methods.add(row['test'].rsplit('.', 1)[-1])
    labels[row['label']] = row
    kind = row.get('kind')
    if kind == 'guard_only':
        require(type(row['actual']) is bool and row['actual'] is row['expected'], 'guard-only expectation')
        counts['guard_only'] += 1
        continue
    if kind == 'hook_counts':
        require(row['original'] == row['candidate'] == row['expected'] and len(row['expected']) == 1, 'single hook count')
        counts['hook_counts'] += 1
        continue
    if row['label'] == 'pure-guard-call-counts':
        require(all(row[k] == 0 for k in ('canonical_calls', 'compact_calls', 'encoded_calls')), 'guard invokes no conversion/encoding')
        counts['guard_call_count'] += 1
        continue
    for who in ('original', 'candidate'):
        outcome = row[who]
        if outcome['kind'] == 'bytes':
            body = outcome['ascii_body'].encode('ascii')
            require(pin(body) == {k: outcome[k] for k in ('sha256', 'bytes')}, 'actual body digest')
            require(outcome['type'] == 'bytes' and body.endswith(b'\n') and not body.endswith(b'\n\n'), 'byte type/final newline')
        else:
            require(outcome['kind'] == 'error' and all(type(outcome[k]) is str for k in ('module', 'type', 'message')), 'actual error schema')
    if row['label'].startswith('injected-'):
        require(row['label'] in ('injected-dumps', 'injected-_pretty'), 'only fixed injections')
        require(row['original']['kind'] == 'bytes' and row['candidate'] == {'kind': 'error', 'module': 'builtins', 'type': 'RuntimeError', 'message': row['injected_error']}, 'intentional propagation outcome')
        require(row['failed_calls'] == 1 and row['fallback_calls'] == 0, 'injection one call/no retry')
        counts['deliberate_injection'] += 1
    else:
        require(row['original'] == row['candidate'], 'complete original/candidate parity')
        counts['parity_' + row['original']['kind']] += 1
        if row['original']['kind'] == 'error':
            errors[row['original']['module'] + '.' + row['original']['type']] += 1
    eligibility = row.get('eligibility')
    if eligibility:
        if eligibility['expected'] is None:
            require(eligibility['actual'] is None and row['original']['kind'] == 'error', 'raw traversal failed before guard')
            guard_status['raw_canonical_failure'] += 1
        else:
            require(type(eligibility['actual']) is bool and eligibility['actual'] is eligibility['expected'], 'expected eligibility')
            guard_status['eligible' if eligibility['actual'] else 'fallback'] += 1
    if row['label'] == 'single-canonical-direct-fallback':
        require(row['canonical_calls'] == row['encoded_calls'] == 1 and row['fallback_snapshot_type'] == 'list', 'single original snapshot to fallback')
        require(row['original_hooks'] == row['candidate_hooks'] == ['tolist'], 'direct fallback hook once')
require(observed_methods == methods and sum(counts.values()) == 171, 'all methods/accounting covered')
require(counts['deliberate_injection'] == 2 and counts['hook_counts'] == 12 and counts['guard_only'] == 19, 'classification coverage')
for label in ('scalar-10', 'scalar-11'):
    require(labels[label]['original']['kind'] == 'bytes', 'signed zero output')
require(labels['scalar-10']['original']['ascii_body'] == '0.0\n' and labels['scalar-11']['original']['ascii_body'] == '-0.0\n', 'literal signed-zero preservation')

profile_index_raw = raw(PROFILE / 'artifact-index.json')
require(pin(profile_index_raw)['sha256'] == 'ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b', 'accepted profile index')
profile_index = parse(profile_index_raw)['files']
corpus = {k: v for k, v in profile_index.items() if k.startswith('plain/origin-store/') and k.endswith('.json')}
require(corpus == pins['corpus'] and len(corpus) == 10 and sum(v['bytes'] for v in corpus.values()) == 1188475, 'complete exact corpus')
expected = {}
for source, digest in sorted(corpus.items()):
    body = raw(PROFILE / source)
    require(pin(body) == digest, 'profile saved source body')
    name = Path(source).name
    require(retained('saved-inputs/' + name, False) == body, 'saved input copy')
    expected[name] = body
expected['numpy-state.json'] = expected['state-2013-01.json']
coverage = retained('corpus-coverage.json')
require([r['name'] for r in coverage] == list(sorted(corpus)) + ['numpy-state.json'], 'coverage exact ordered names')
require(all(r['saved_original_canonical'] is True and r['equal'] is True and r['eligible'] is True for r in coverage), '11 exact eligible coverage')
for name, body in expected.items():
    for kind in ('corpus-equality', 'timed-outputs'):
        for route in ('original', 'candidate'):
            require(retained(kind + '/' + route + '/' + name, False) == body, 'full saved byte parity ' + kind + '/' + route + '/' + name)

arrays = retained('numpy-state-arrays.json')
derived = []
def state_arrays(value, path=()):
    if type(value) is dict:
        for key, child in value.items():
            state_arrays(child, path + (key,))
    elif type(value) is list:
        if value and all(type(child) is float for child in value):
            derived.append({'path': list(path), 'dtype': '<f8', 'shape': [len(value)],
                            'bytes_base64': base64.b64encode(struct.pack('<' + 'd' * len(value), *value)).decode('ascii')})
        else:
            for i, child in enumerate(value):
                state_arrays(child, path + (i,))
state_arrays(parse(expected['state-2013-01.json']))
require(arrays == derived and len(arrays) == coverage[-1]['array_count'] == 1242, 'all deterministic NumPy paths/dtype/shape/C bytes via independent struct packing')
array_bytes = sum(len(base64.b64decode(r['bytes_base64'], validate=True)) for r in arrays)

timings = result['timings']
require(len(timings) == 22 and [(r['route'], r['name']) for r in timings] == [(route, name) for route in ('original', 'candidate') for name in expected], '22 fixed-order actual calls')
previous_end = -math.inf
for row in timings:
    require(all(type(row[k]) is float and math.isfinite(row[k]) for k in ('seconds', 'started_monotonic', 'finished_monotonic')), 'finite timing')
    require(row['seconds'] > 0 and row['finished_monotonic'] - row['started_monotonic'] == row['seconds'], 'exact measured subtraction')
    require(row['started_monotonic'] >= previous_end, 'sequential nondoublecounted timing')
    previous_end = row['finished_monotonic']
    require({k: row[k] for k in ('sha256', 'bytes')} == pin(expected[row['name']]), 'timing binds whole saved body')
sums = {route: sum(r['seconds'] for r in timings if r['route'] == route) for route in ('original', 'candidate')}
stable_sums = {route: math.fsum(r['seconds'] for r in timings if r['route'] == route) for route in ('original', 'candidate')}
require(sums == result['aggregate_seconds'] and sums == stable_sums, 'independent all22 sums')
ratio = sums['candidate'] / sums['original']
require(ratio == result['candidate_original_ratio'] and ratio > 1 and result['candidate_observed_faster'] is False, 'slower aggregate decision')
require(result['corpus_items'] == result['eligible_items'] == 11 and result['test_observation_count'] == 171 and result['saved_corpus_bytes'] == 1188475, 'reported counts')
require(result['corpus_inputs_unchanged'] is True and result['historical_execution'] is False and result['integration_accepted'] is False, 'bounded result claims')

report = {
    'version': 'rfcomp05.saved-numerical-review.v1',
    'status': 'accepted_saved_byte_error_parity_and_negative_timing_result',
    'scope': 'Read-only saved numerical observations, corpus bodies and fixed call timings. No candidate, test, driver or scientific imports/calls; no timing rerun.',
    'reviewer_role': 'numerical',
    'authorship_disclosure': 'Reviewer authored the 28 independent tests and previously reviewed candidate statically; candidate and qualification driver have other authors. This is not independent authorship of the tests.',
    'attempt': str(ATTEMPT), 'input_pins_sha256': pin(pins_raw)['sha256'],
    'source_scope_pins': {str(k): v for k, v in fixed.items()},
    'runtime': pins['runtime'], 'runtime_files': pins['runtime_files'],
    'checks_passed': checks,
    'tests': {'run': 28, 'passed': 28, 'errors': 0, 'failures': 0, 'skipped': 0, 'observed_methods': sorted(methods)},
    'observations': {'total': 171, 'classifications': dict(counts), 'parity_error_types': dict(errors), 'parity_and_injection_eligibility': dict(guard_status),
                     'class_identity_limit': 'Serialized errors establish exact module/type/message; actual exception class identity was asserted by the passing frozen tests and cannot be reconstructed from JSON alone.',
                     'declared_guard_rows': 'Four mutable-array rows label known canonical eligibility; they are byte parity evidence, not additional measured eligible() calls. Separate NumPy/guard tests actually call eligible().'},
    'corpus': {'saved_indexed_files': 10, 'saved_bytes': 1188475, 'total_items_including_numpy_state': 11, 'all_eligible': True,
               'complete_original_and_candidate_equality_and_timed_outputs': 44, 'numpy_arrays': len(arrays), 'numpy_array_bytes': array_bytes,
               'numpy_reconstruction_check': 'Independent stdlib struct.pack of every qualifying saved float list matched all paths, little-endian float64 dtype, shapes and C-order bytes; no NumPy import or distribution reconstruction.'},
    'timing': {'call_count': 22, 'fixed_route_order': ['original', 'candidate'], 'input_order': list(expected),
               'aggregate_seconds': sums, 'math_fsum_seconds': stable_sums, 'candidate_original_ratio': ratio,
               'candidate_minus_original_seconds': sums['candidate'] - sums['original'], 'candidate_increase_percent': (ratio - 1) * 100,
               'whole_pass_wall_span_seconds': timings[-1]['finished_monotonic'] - timings[0]['started_monotonic'],
               'per_item': [{'name': name, 'original_seconds': timings[i]['seconds'], 'candidate_seconds': timings[i+11]['seconds']} for i, name in enumerate(expected)]},
    'decision': {'remove_from_immediate_integration_consideration': True, 'reason': 'The frozen decision requires the complete eleven-item candidate aggregate to be lower. It is 1.917723340563306 times original (91.7723340563306 percent more elapsed serializer-call time).',
                 'no_integration_or_historical_authority': True, 'no_new_optimization_selected': True},
    'blockers': [],
    'limits': ['One original-then-candidate pass after equality checks; cache, order and OS effects prevent a reliable speedup estimate or broad performance ranking.',
               'No whole-origin/controller integration or historical capacity measurement; original 7200-second pilot and all scientific criteria remain unchanged.',
               'Finite synthetic/adversarial evidence under the pinned runtime does not prove universal serialization equivalence.',
               'Input immutability in process is supported by the pinned driver before/after image assertion and retained successful result; live objects are unavailable to this saved-data review.',
               'Full archive/source/runtime integrity and process ownership/resource acceptance are separately reviewed by root and operational reviewer; this report authenticates each artifact it actually uses.'],
    'evidence': [{'path': path, **digest} for path, digest in sorted(evidence.items())],
}
output = WORK / 'actual-numerical-review.json'
with output.open('x') as stream:
    json.dump(report, stream, sort_keys=True, indent=2, allow_nan=False)
    stream.write('\n')
print(json.dumps({'report': str(output), **pin(output.read_bytes()), 'checks': checks, 'classifications': dict(counts), 'errors': dict(errors), 'sums': sums, 'ratio': ratio, 'array_bytes': array_bytes}, sort_keys=True))
