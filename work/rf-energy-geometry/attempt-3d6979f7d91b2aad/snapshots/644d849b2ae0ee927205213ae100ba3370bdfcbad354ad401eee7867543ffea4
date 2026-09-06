"""One fixed saved-law scoring qualification; no fitting or historical replay."""
import time
STARTED = time.monotonic()
import argparse
import ast
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import struct
import sys
import traceback
import warnings

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OWNER = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
WORK = Path(__file__).resolve().parent
PROFILE = OWNER/'work/rf-origin-profile/profile-685708ac9c57a623'
PREFIT = ROOT/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'
PREVIOUS = ROOT/'.planning/engine-os/research-first/RF-COMP-06-ACCEPTANCE.v1.json'
SCOPE = ROOT/'.planning/engine-os/research-first/RF-COMP-07-ENERGY-GEOMETRY-SCOPE.v1.md'
SOURCE = ROOT/'scripts/research_score_energy_geometry.py'
TESTS = ROOT/'tests/research-score-energy-geometry/test_energy_geometry.py'
FIXTURE = WORK/'SCORING-FIXTURES.v1.json'
BUILDER = WORK/'freeze_fixture.py'
WITNESS = PROFILE/'plain/scientific-witness.json'
PYTHON = '/opt/anaconda3/bin/python3.12'
PYLIB = Path('/opt/anaconda3/lib/python3.12')
NUMPY = PYLIB/'site-packages/numpy'
RUNTIME_INPUTS = (Path(PYTHON),) + tuple(PYLIB/name for name in (
    'json/__init__.py', 'json/encoder.py', 'json/decoder.py', 'json/scanner.py',
    're/__init__.py', 're/_compiler.py', 're/_parser.py', 're/_constants.py', 're/_casefix.py',
    'dataclasses.py', 'types.py', 'struct.py', 'copy.py', 'ast.py', 'warnings.py',
    'lib-dynload/_json.cpython-312-darwin.so', 'lib-dynload/math.cpython-312-darwin.so',
    'lib-dynload/_struct.cpython-312-darwin.so')) + tuple(NUMPY/name for name in (
    'core/numeric.py', 'core/fromnumeric.py', 'core/overrides.py', 'core/multiarray.py',
    'core/umath.py', 'core/_multiarray_umath.cpython-312-darwin.so',
    'fft/_pocketfft.py', 'fft/_pocketfft_internal.cpython-312-darwin.so'))
ASSESSMENTS = tuple(WORK/name for name in ('attribution-assessment.md',
    'numerical-contract-assessment.md', 'lag-distance-contract.md', 'static-fixture-review.md'))
SECONDS, MIB, RESERVE = 60., 1024., 5.
PARENT_MIB, CHILD_MIB = 128., 896.
MATERIALITY_RATIO = 0.7738077598151377
EXPECTED_CACHE = {'entries': [[256, 256], [512, 512]], 'retained_bytes': 2621440,
                  'hits': 60, 'misses': 2, 'evictions': 0}
IS_CHILD = '--child' in sys.argv
sys.dont_write_bytecode = True


class QualificationStop(BaseException):
    pass


def require(value, message):
    if not value:
        raise ValueError(message)


def check():
    if time.monotonic()-STARTED >= SECONDS-(RESERVE if IS_CHILD else 0.):
        raise QualificationStop('setup_inclusive_qualification_deadline')
    maximum = CHILD_MIB if IS_CHILD else PARENT_MIB
    if resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20 >= maximum:
        raise QualificationStop('qualification_memory_reserve')


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+'\n').encode()


def write_raw(path, raw, *, enforce=True):
    if enforce: check()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as output:
        for start in range(0, len(raw), 1024*1024):
            if enforce: check()
            output.write(raw[start:start+1024*1024])
        output.flush()
        os.fsync(output.fileno())
    if enforce: check()


def save(path, value, *, enforce=True):
    write_raw(path, encoded(value), enforce=enforce)


def fingerprint(path, *, enforce=True):
    digest, size = hashlib.sha256(), 0
    with path.open('rb') as source:
        while chunk := source.read(1024*1024):
            if enforce: check()
            digest.update(chunk)
            size += len(chunk)
    return {'sha256': digest.hexdigest(), 'bytes': size}


def body(attempt, raw):
    """Store unique exact bytes once; every occurrence retains its own pointer."""
    sha = hashlib.sha256(raw).hexdigest()
    name = 'bodies/'+sha
    path = attempt/name
    if path.exists():
        require(not path.is_symlink() and path.read_bytes() == raw, 'body_collision_or_change')
    else:
        write_raw(path, raw)
    return {'path': name, 'sha256': sha, 'bytes': len(raw)}


def index_directory(directory, *, enforce=True):
    result = {}
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink(), 'symlink_in_evidence')
        if path.is_file():
            result[str(path.relative_to(directory))] = fingerprint(path, enforce=enforce)
    return result


def authenticate(pins_path, pin_sha):
    require(fingerprint(pins_path)['sha256'] == pin_sha, 'pin_map_changed')
    pins = json.loads(pins_path.read_bytes())
    require(set(pins) == {'version', 'code_hashes', 'runtime_files', 'runtime', 'inputs', 'fixture'}
            and pins['version'] == 'rf-energy-geometry-inputs.v1', 'pin_schema')
    required = (PREFIT, PREVIOUS, SCOPE, SOURCE, TESTS, FIXTURE, BUILDER, WITNESS,
                PROFILE/'artifact-index.json', Path(__file__).resolve(), *ASSESSMENTS, *RUNTIME_INPUTS)
    require(all(str(path) in pins['inputs'] for path in required), 'required_input_missing')
    fixed = {
        PREFIT: '9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e',
        PREVIOUS: 'eb1f91b619f30374a580e3735923bc7a4a953155a1c8707b278e507628ddb384',
        SCOPE: '4170c944f5e3d02a9f176518661d6d6616141cad0f6aafc419bc8bc87b70979e',
        SOURCE: '4bc57604fe237cd407b66e59c84c6021f8ed68fe287ecb71cb6cecf5a8cdcb16',
        FIXTURE: '1b1730b099eed2dd84eeb97f65b89a162dc7c4c9fcd4f5472aeee8a5dcede3aa',
        BUILDER: '47eaf987fcd38f3a7500ae9d4989f53d64fc003c7466a6c40bbd8d947afcccf3',
        WITNESS: 'e695fcbcfc6f1c03754e1186c344cdc42bfa4cc45575ff517ecc4703f75f4db2',
        PROFILE/'artifact-index.json': 'ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b',
        ASSESSMENTS[0]: 'dccd62268c149a7719e378945a51e45a163e57c23d6c3ad253bf37e0ca942f52',
        ASSESSMENTS[1]: 'fa13c9ea7840d94b9da7f628122251a3db832e20b6c97bc0554f24336db596b8',
        ASSESSMENTS[2]: '02ef8cdc6e5850470617beb8e659f9b7b22798e47cb0d3311354bee3e69a1866',
    }
    for path, sha in fixed.items():
        require(pins['inputs'][str(path)]['sha256'] == sha, 'fixed_input_pin_changed')
    for name, pin in pins['inputs'].items():
        require(Path(name).is_absolute() and set(pin) == {'sha256', 'bytes', 'snapshot'}
                and type(pin['snapshot']) is bool, 'input_schema')
        require(fingerprint(Path(name)) == {key: pin[key] for key in ('sha256', 'bytes')}, 'input_changed:'+name)
    accepted = json.loads(PREFIT.read_bytes())
    for key in ('code_hashes', 'runtime_files', 'runtime'):
        require(pins[key] == accepted[key], 'accepted_identity_changed:'+key)
    require(len(pins['code_hashes']) == 79 and len(pins['runtime_files']) == 7, 'accepted_membership')
    for name, sha in pins['code_hashes'].items():
        require(fingerprint(ROOT/name)['sha256'] == sha, 'frozen_source_changed:'+name)
    for name, sha in pins['runtime_files'].items():
        require(fingerprint(Path(name))['sha256'] == sha, 'frozen_runtime_changed:'+name)
    require(pins['fixture'] == {'path': str(FIXTURE), **fingerprint(FIXTURE)}
            and pins['fixture']['bytes'] == 48575, 'fixture_pointer')
    previous = json.loads(PREVIOUS.read_bytes())
    for field in ('scope', 'implementation', 'pins', 'source', 'tests_source', 'driver', 'index', 'child_result'):
        pointer = previous[field]
        require(pointer['path'] in pins['inputs'] and all(
            pins['inputs'][pointer['path']][key] == pointer[key] for key in ('sha256', 'bytes')),
            'closed_snapshot_input_missing:'+field)
    return pins


def fixture_metadata():
    """Verify source membership and lossless unique bodies, without fitting."""
    fixture = json.loads(FIXTURE.read_bytes())
    witness = json.loads(WITNESS.read_bytes())
    index = json.loads((PROFILE/'artifact-index.json').read_bytes())['files']
    require(fixture['version'] == 'rfcomp07.saved-score-fixture.v1'
            and fixture['fit_calls'] == 0 and fixture['scientific_execution'] is False, 'fixture_identity')
    require(fixture['source'] == {'path': str(WITNESS), **index['plain/scientific-witness.json']}
            and fixture['profile_index'] == {'path': str(PROFILE/'artifact-index.json'), **fingerprint(PROFILE/'artifact-index.json')}
            and fixture['builder'] == {'path': str(BUILDER), **fingerprint(BUILDER)}, 'fixture_source_binding')
    excluded = sorted(target+'_interval_mass_80' for target in ('home', 'away', 'margin', 'total'))
    require(fixture['excluded_outer_fields'] == excluded, 'metric_exclusion_changed')
    require(len(fixture['laws']) == 1 and len(fixture['expected_metrics']) == 4, 'unique_fixture_membership')
    for group in ('laws', 'expected_metrics'):
        for sha, value in fixture[group].items():
            require(hashlib.sha256(encoded(value)).hexdigest() == sha, 'fixture_body_hash')
    callbacks = [row for row in witness['callbacks'] if row['kind'] == 'score']
    rows = {('inner', row['setting'], row['game_id']): row for row in witness['inner_rows']}
    rows.update({('outer', row['variant'], row['game_id']): row for row in witness['outer_rows'] if row['family'] == 'E3'})
    laws = {tuple(row['key']): row['fields'] for row in witness['resolved_laws']}
    calls = fixture['calls']
    require(len(calls) == len(callbacks) == 40 and len({tuple(c['key']) for c in calls}) == 40, 'complete_score_population')
    for i, (call, callback) in enumerate(zip(calls, callbacks, strict=True), 1):
        key = (callback['stage'], callback['setting'] if callback['stage'] == 'inner' else callback['variant'], callback['game_id'])
        require(call['id'] == f'call-{i:02d}' and call['key'] == list(key)
                and call['callback'] == callback and callback['error_type'] is None
                and callback['operation'] == 'score', 'score_order_or_flags')
        require(call['game_id'] == callback['game_id'] and call['flags'] == {
            name: callback[name] for name in ('double_grid', 'diagnostics')}, 'score_arguments')
        expected = dict(rows[key]['metrics'])
        if key[0] == 'outer':
            for name in excluded: del expected[name]
        require(encoded(expected) == encoded(fixture['expected_metrics'][call['expected_metrics_sha256']])
                and len(expected) == call['expected_metric_count'] == (28 if key[0] == 'inner' else 104)
                and expected['grid_cells'] == [80, 80], 'saved_metric_membership')
        require(call['observed'] == [expected['home_observed'], expected['away_observed']]
                and encoded(laws[key]) == encoded(fixture['laws'][call['law_sha256']]), 'saved_law_or_target')
    require(sum(c['flags']['double_grid'] for c in calls) == 22
            and sum(c['flags']['diagnostics'] for c in calls) == 4, 'complete_flag_counts')
    return fixture


def reconstruct(fields):
    import numpy as np
    from research_score_distribution import JointDistribution
    require(set(fields) == {'atoms', 'alpha', 'beta', 'rates', 'theta', 'iterations', 'independent'}, 'law_fields')
    values = {}
    for name in ('atoms', 'alpha', 'rates', 'theta'):
        field = fields[name]
        require(field['dtype'] == '<f8' and field['writeable'] is False, 'saved_array_domain')
        value = np.frombuffer(bytes.fromhex(field['c_bytes_hex']), dtype=np.dtype(field['dtype']))
        value = value.reshape(tuple(field['shape'])).copy(order='C')
        value.setflags(write=False)
        require(value.tobytes(order='C').hex() == field['c_bytes_hex']
                and value.flags.c_contiguous and value.flags.owndata
                and encoded(value.tolist()) == encoded(field['values']), 'array_reconstruction_changed')
        values[name] = value
    beta = fields['beta']
    require(beta['type'] == 'float' and type(beta['value']) is float, 'saved_beta_type')
    values['beta'] = struct.unpack('>d', bytes.fromhex(beta['float_bits']))[0]
    require(struct.pack('>d', beta['value']).hex() == beta['float_bits'], 'saved_beta_bits')
    for name, kind in (('iterations', int), ('independent', bool)):
        require(fields[name]['type'] == kind.__name__ and type(fields[name]['value']) is kind, 'saved_scalar_type')
        values[name] = fields[name]['value']
    return JointDistribution(**values)


def typed_image(value):
    import numpy as np
    kind = type(value)
    if kind is dict:
        return ['dict', [[typed_image(k), typed_image(v)] for k, v in value.items()]]
    if kind in (list, tuple):
        return [kind.__name__, [typed_image(v) for v in value]]
    if kind is np.ndarray:
        return ['ndarray', value.dtype.str, list(value.shape), list(value.strides),
                bool(value.flags.writeable), bool(value.flags.owndata),
                bool(value.flags.c_contiguous), value.tobytes(order='C').hex()]
    if isinstance(value, np.generic):
        return ['numpy', kind.__name__, value.dtype.str, value.tobytes().hex()]
    if kind is float:
        return ['float', struct.pack('>d', value).hex()]
    require(value is None or kind in (str, int, bool), 'unexpected_typed_image')
    return [kind.__name__, value]


def input_image(law, observed, call):
    from dataclasses import fields
    return typed_image({'law': {f.name: getattr(law, f.name) for f in fields(law)},
        'observed': observed, 'game_id': call['game_id'], 'flags': call['flags']})


class FFTCalls:
    """Parity-only Python call-event observer; no performance attribution."""
    def __init__(self):
        import numpy as np
        self.events, self.current = [], None
        self.codes, self.identities = {}, []
        path = NUMPY/'fft/_pocketfft.py'
        tree = ast.parse(path.read_bytes())
        for name in ('rfft2', 'irfft2'):
            function = getattr(np.fft, name).__wrapped__
            code = function.__code__
            node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
            first = min([node.lineno]+[n.lineno for n in node.decorator_list])
            require(Path(code.co_filename).resolve() == path and code.co_name == name
                    and code.co_firstlineno == first, 'unqualified_fft_code')
            self.codes[code] = name
            self.identities.append({'name': name, 'path': str(path), 'first_line': first})

    def observe(self, frame, event, arg):
        if event == 'call' and frame.f_code in self.codes:
            local = frame.f_locals
            a = local['a']
            self.events.append({'call_id': self.current, 'operation': self.codes[frame.f_code],
                'input_shape': list(a.shape), 'input_dtype': a.dtype.str,
                's': list(local['s']), 'axes': list(local['axes']), 'norm': local['norm']})

    def validate(self, calls):
        expected = []
        for call in calls:
            for cells in ([80, 160] if call['flags']['double_grid'] else [80]):
                n = 1 << (2*cells-2).bit_length()
                expected.extend([
                    {'call_id': call['id'], 'operation': 'rfft2', 'input_shape': [cells, cells],
                     'input_dtype': '<f8', 's': [n, n], 'axes': [-2, -1], 'norm': None},
                    {'call_id': call['id'], 'operation': 'irfft2', 'input_shape': [n, n//2+1],
                     'input_dtype': '<c16', 's': [n, n], 'axes': [-2, -1], 'norm': None}])
        require(self.events == expected and len(expected) == 124, 'actual_fft_calls_or_shapes_changed')


def binding_image(candidate):
    import numpy as np
    from research_score_skellam_compute import SkellamDistribution, score_forecast
    return {'rfft2': np.fft.rfft2, 'irfft2': np.fft.irfft2, 'hypot': np.hypot,
            'indices': np.indices, 'original_score': score_forecast,
            'candidate_rfft2': candidate._rfft2, 'candidate_irfft2': candidate._irfft2,
            'builder': candidate._build_distance, 'legacy_energy': candidate._original_energy_score,
            'skellam': candidate.SkellamDistribution, 'expected_skellam': SkellamDistribution,
            'score_body': candidate._score_forecast, 'owner': candidate.LagGeometry}


def run_pass(phase, route, fixture, attempt, result, parity_reference):
    from research_score_conditional_run import strict
    from research_score_skellam_compute import score_forecast as original_score
    from research_score_energy_geometry import LagGeometry
    record = {'phase': phase, 'route': route, 'status': 'started', 'calls': [],
              'owner_seconds': 0., 'event_observer': phase == 'parity',
              'callback_timing_eligible': phase == 'timed'}
    result['passes'].append(record)
    owner = trace = None
    prior_profile = sys.getprofile()
    require(prior_profile is None, 'unexpected_active_profiler')
    primary = None
    try:
        if route == 'candidate':
            started = time.monotonic()
            owner = LagGeometry()
            record['owner_seconds'] = time.monotonic()-started
            require(owner.cache_info() == {'entries': [], 'retained_bytes': 0,
                    'hits': 0, 'misses': 0, 'evictions': 0}, 'owner_not_empty')
        function = original_score if route == 'original' else owner.score_forecast
        if phase == 'parity':
            trace = FFTCalls()
            sys.setprofile(trace.observe)
        for call in fixture['calls']:
            check()
            law = reconstruct(fixture['laws'][call['law_sha256']])
            observed = list(call['observed'])
            before = body(attempt, encoded(input_image(law, observed, call)))
            row = {'id': call['id'], 'key': call['key'], 'law_sha256': call['law_sha256'],
                   'expected_metrics_sha256': call['expected_metrics_sha256'],
                   'before_input': before, 'flags': dict(call['flags']), 'outcome': 'started'}
            record['calls'].append(row)
            prefix = attempt/phase/route/call['id']
            save(prefix.with_name(prefix.name+'-started.json'), row)
            if trace is not None: trace.current = call['id']
            else: require(sys.getprofile() is None, 'timed_trace_forbidden')
            error = metrics = None
            # Warning context setup/teardown is outside the callback timer, but
            # inside the command clock. Both routes use the same capture policy.
            with warnings.catch_warnings(record=True) as caught_warnings:
                warnings.simplefilter('always')
                started = time.monotonic()
                try:
                    metrics = function(law, observed, call['game_id'], **call['flags'])
                except BaseException as caught:
                    error = caught
                finished = time.monotonic()
            row.update(started_monotonic=started, finished_monotonic=finished, seconds=finished-started)
            row['warnings'] = [{'category': warning.category.__module__+'.'+warning.category.__qualname__,
                                'message': str(warning.message)} for warning in caught_warnings]
            row['warning_policy'] = 'always_per_callback'
            if error is not None:
                row.update(outcome='error', error={'module': type(error).__module__,
                    'type': type(error).__qualname__, 'message': str(error)})
            else:
                row.update(outcome='returned', return_type=type(metrics).__module__+'.'+type(metrics).__qualname__)
            # Retain the callback itself before input imaging, strict encoding,
            # or a post-call budget check can fail. This is metadata only.
            try:
                save(prefix.with_name(prefix.name+'-callback.json'), row, enforce=False)
            except BaseException as evidence_error:
                row['callback_record_error'] = type(evidence_error).__name__+':'+str(evidence_error)
                if error is not None: raise error from evidence_error
                raise
            post_error = None
            try:
                if error is None:
                    row['typed_return'] = body(attempt, encoded(typed_image(metrics)))
                    save(prefix.with_name(prefix.name+'-typed-return.json'), row)
                row['after_input'] = body(attempt, encoded(input_image(law, observed, call)))
                row['inputs_unchanged'] = row['before_input'] == row['after_input']
                if error is None:
                    metric_raw = strict(metrics)
                    row.update(metric_count=len(metrics), metrics=body(attempt, metric_raw))
            except BaseException as caught:
                post_error = caught
                row['postprocessing_error'] = {'module': type(caught).__module__,
                    'type': type(caught).__qualname__, 'message': str(caught)}
            try:
                save(prefix.with_name(prefix.name+'-outcome.json'), row,
                     enforce=error is None and post_error is None)
            except BaseException as evidence_error:
                row['outcome_record_error'] = type(evidence_error).__name__+':'+str(evidence_error)
                if error is not None: raise error from evidence_error
                if post_error is not None: raise post_error from evidence_error
                raise
            if error is not None:
                if post_error is not None: raise error from post_error
                raise error
            if post_error is not None: raise post_error
            # Full actual bodies and both input images precede every assertion.
            require(row['inputs_unchanged'], 'scoring_mutated_inputs:'+call['id'])
            require(math.isfinite(row['seconds']) and row['seconds'] > 0, 'invalid_callback_clock')
            require(type(metrics) is dict and len(metrics) == call['expected_metric_count']
                    and metric_raw == encoded(fixture['expected_metrics'][call['expected_metrics_sha256']]),
                    'saved_metrics_mismatch:'+phase+':'+route+':'+call['id'])
            reference = {'before_input': before, 'metrics': row['metrics'], 'typed_return': row['typed_return'],
                         'warnings': row['warnings']}
            if phase == 'parity' and route == 'original':
                parity_reference[call['id']] = reference
            else:
                require(reference == parity_reference[call['id']], 'typed_result_or_input_mismatch:'+call['id'])
            check()
        if trace is not None:
            sys.setprofile(prior_profile)
            save(attempt/phase/route/'fft-events.json', {'kind': 'function_call_observation_only',
                'performance_attribution': False, 'function_codes': trace.identities, 'events': trace.events})
            trace.validate(fixture['calls'])
            record['actual_fft_pairs'] = 62
            record['actual_probability_grid_shapes'] = {'80x80': 40, '160x160': 22}
        if owner is not None:
            record['cache_info'] = owner.cache_info()
            require(record['cache_info'] == EXPECTED_CACHE, 'cache_population_changed')
        record['callback_seconds'] = sum(row['seconds'] for row in record['calls'])
        record['aggregate_seconds_including_owner'] = record['callback_seconds']+record['owner_seconds']
        record['maximum_callback_seconds'] = max(row['seconds'] for row in record['calls'])
        record['status'] = 'complete_exact'
    except BaseException as error:
        primary = error
        record['status'] = 'failed_or_interrupted'
        record['error'] = type(error).__name__+':'+str(error)
        raise
    finally:
        sys.setprofile(prior_profile)
        record['profile_restored'] = sys.getprofile() is prior_profile
        if owner is not None: record['cache_info_after_attempt'] = owner.cache_info()
        try:
            if trace is not None and record['status'] != 'complete_exact':
                save(attempt/phase/route/'partial-fft-events.json', {'events': trace.events,
                    'function_codes': trace.identities, 'performance_attribution': False}, enforce=False)
            save(attempt/phase/route/'pass-result.json', record, enforce=primary is None)
        except BaseException as evidence_error:
            record['evidence_error'] = type(evidence_error).__name__+':'+str(evidence_error)
            if primary is None: raise
    return record


def child(pins_path, pin_sha, attempt):
    result = {'status': 'failed_or_interrupted', 'passes': [], 'test_observation_count': 0,
              'historical_execution': False, 'fit_calls': 0, 'integration_accepted': False}
    tests = None
    try:
        pins = authenticate(pins_path, pin_sha)
        require(attempt == WORK/('attempt-'+pin_sha[:16]), 'child_identity_changed')
        sys.path.insert(0, str(ROOT/'scripts'))
        sys.path.insert(0, str(TESTS.parent))
        from research_score_split_preflight import actual_runtime
        require(actual_runtime() == pins['runtime'], 'unqualified_runtime')
        import unittest
        import research_score_energy_geometry as candidate
        import test_energy_geometry as tests
        bindings = binding_image(candidate)
        require(bindings['rfft2'] is bindings['candidate_rfft2']
                and bindings['irfft2'] is bindings['candidate_irfft2']
                and bindings['skellam'] is bindings['expected_skellam']
                and sys.getprofile() is None, 'initial_dependency_binding')

        def observe(row):
            result['test_observation_count'] += 1
            pointer = body(attempt, encoded(row))
            save(attempt/'test-observations'/f'{result["test_observation_count"]:04d}.json', pointer)

        class CheckedResult(unittest.TextTestResult):
            def startTest(self, test):
                check()
                super().startTest(test)

        tests.set_observation_writer(observe)
        tests_started = time.monotonic()
        suite = unittest.defaultTestLoader.loadTestsFromModule(tests)
        require(suite.countTestCases() == 25, 'focused_test_population')
        with (attempt/'unittest.log').open('x') as log:
            run = unittest.TextTestRunner(stream=log, verbosity=2, resultclass=CheckedResult).run(suite)
            log.flush()
            os.fsync(log.fileno())
        result['tests'] = {'count': run.testsRun, 'failures': len(run.failures), 'errors': len(run.errors),
            'skipped': len(run.skipped), 'expected_failures': len(run.expectedFailures),
            'unexpected_successes': len(run.unexpectedSuccesses), 'seconds': time.monotonic()-tests_started}
        require(run.wasSuccessful() and run.testsRun == 25 and not run.skipped
                and not run.expectedFailures and not run.unexpectedSuccesses, 'focused_exactness_failed')
        tests.set_observation_writer(None)
        after_bindings = binding_image(candidate)
        result['bindings_restored_after_tests'] = all(after_bindings[k] is v for k, v in bindings.items())
        require(result['bindings_restored_after_tests'] and sys.getprofile() is None, 'unit_dependency_not_restored')
        fixture = fixture_metadata()
        result['fixture_scope'] = {'calls': 40, 'unique_laws': 1, 'unique_expected_metrics': 4,
            'law_reconstruction': fixture['law_reconstruction'], 'source': fixture['source'],
            'excluded_outer_fields': fixture['excluded_outer_fields'], 'no_fits_or_new_predictions': True}
        save(attempt/'fixture-references.json', {
            'fixture': body(attempt, FIXTURE.read_bytes()),
            'laws': {sha: body(attempt, encoded(value)) for sha, value in fixture['laws'].items()},
            'expected_metrics': {sha: body(attempt, encoded(value)) for sha, value in fixture['expected_metrics'].items()},
            'calls': fixture['calls']})
        parity_reference = {}
        for route in ('original', 'candidate'):
            run_pass('parity', route, fixture, attempt, result, parity_reference)
        result['complete_parity_passes'] = 2
        result['setup_seconds_before_timing'] = time.monotonic()-STARTED
        result['fixed_timing_order'] = ['original', 'candidate']
        timed = {}
        for route in ('original', 'candidate'):
            require(sys.getprofile() is None, 'timed_trace_forbidden')
            timed[route] = run_pass('timed', route, fixture, attempt, result, parity_reference)
        aggregate_ratio = timed['candidate']['aggregate_seconds_including_owner']/timed['original']['aggregate_seconds_including_owner']
        maximum_ratio = timed['candidate']['maximum_callback_seconds']/timed['original']['maximum_callback_seconds']
        result['materiality'] = {'aggregate_candidate_original_ratio': aggregate_ratio,
            'maximum_callback_candidate_original_ratio': maximum_ratio, 'threshold_lte': MATERIALITY_RATIO,
            'aggregate_passed': aggregate_ratio <= MATERIALITY_RATIO,
            'maximum_passed': maximum_ratio <= MATERIALITY_RATIO,
            'passed': aggregate_ratio <= MATERIALITY_RATIO and maximum_ratio <= MATERIALITY_RATIO}
        result['decision'] = ('isolated_scoring_integration_lead_only' if result['materiality']['passed']
                              else 'defer_immediate_integration_materiality_not_met')
        final_bindings = binding_image(candidate)
        result['bindings_restored_after_all_passes'] = all(final_bindings[k] is v for k, v in bindings.items())
        require(result['bindings_restored_after_all_passes'] and sys.getprofile() is None, 'final_dependency_or_trace_changed')
        require(authenticate(pins_path, pin_sha) == pins, 'child_after_pins_changed')
        result['status'] = 'completed_experiment_pending_root_exit_and_independent_review'
        result['complete_saved_callback_invocations'] = 160
        result['timing_limitations'] = ('One original-then-candidate40-call timing pass after required original/candidate parity. '
            'Parity has call-event observation, not performance attribution; timing has no trace. Callback timers include '
            'Skellam wrapping/full scoring/cache work; candidate aggregate includes owner creation. Reconstruction, input/output '
            'validation and persistence outside callback timers remain inside the60-second command. No fit timing or historical capacity claim.')
    except BaseException as error:
        result['primary_error'] = type(error).__name__+':'+str(error)
        result['traceback'] = ''.join(traceback.format_exception(error))
        raise
    finally:
        if tests is not None: tests.set_observation_writer(None)
        result['elapsed_seconds_before_result'] = time.monotonic()-STARTED
        result['worker_peak_rss_mib'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20
        save(attempt/'child-result.json', result, enforce=False)
    check()


def parent(pins_path, pin_sha):
    attempt = WORK/('attempt-'+pin_sha[:16])
    attempt.mkdir()
    before = watched = None
    stop = source_error = None
    command = [PYTHON, '-I', str(Path(__file__).resolve()), '--child', str(attempt),
               '--pins', str(pins_path), '--pins-sha256', pin_sha, '--started', repr(STARTED)]
    try:
        before = authenticate(pins_path, pin_sha)
        save(attempt/'source-map-before.json', before)
        write_raw(attempt/'INPUT-PINS.json', pins_path.read_bytes())
        paths = {str(ROOT/name): sha for name, sha in before['code_hashes'].items()}
        paths.update({name: pin['sha256'] for name, pin in before['inputs'].items() if pin['snapshot']})
        for name, sha in paths.items():
            destination = attempt/'snapshots'/sha
            if not destination.exists(): write_raw(destination, Path(name).read_bytes())
        write_raw(attempt/'saved-inputs'/'SCORING-FIXTURES.v1.json', FIXTURE.read_bytes())
        sys.path.insert(0, str(ROOT/'scripts'))
        from research_score_split_watchdog import _supervise
        allowance = SECONDS-RESERVE-(time.monotonic()-STARTED)
        require(allowance > 0, 'no_child_allowance')
        watched = _supervise(command, cwd=ROOT, output_parent=WORK, identity='observer-'+pin_sha[:16],
                             limits=(allowance, CHILD_MIB, 2., .05), phase_status=False)
        save(attempt/'watchdog.json', watched)
        for name in ('stdout.log', 'stderr.log'):
            write_raw(attempt/name, (WORK/('observer-'+pin_sha[:16])/name).read_bytes())
        require(watched['status'] == 'completed_process' and watched['exit_code'] == 0, 'qualification_child_failed')
    except BaseException as error:
        stop = type(error).__name__+':'+str(error)
    try:
        after = authenticate(pins_path, pin_sha)
        save(attempt/'source-map-after.json', after)
        require(before == after, 'after_pin_map_changed')
    except BaseException as error:
        source_error = type(error).__name__+':'+str(error)
    own = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20
    child_peak = 0. if watched is None else max(watched['sampled_group_peak_rss_mib'], watched['waited_worker_peak_rss_mib'] or 0.)
    okay = stop is source_error is None and watched is not None and own+child_peak < MIB
    process = {'status': 'provisional_qualification_evidence' if okay else 'failed_qualification',
        'stop': stop, 'source_error': source_error, 'command': command,
        'exit_code': None if watched is None else watched['exit_code'],
        'elapsed_seconds_before_final_index': time.monotonic()-STARTED,
        'parent_peak_rss_mib': own, 'child_group_peak_rss_mib': child_peak,
        'conservative_combined_rss_mib': own+child_peak,
        'limits': {'seconds': SECONDS, 'mib': MIB, 'evidence_reserve_seconds': RESERVE,
                   'parent_mib': PARENT_MIB, 'child_mib': CHILD_MIB},
        'clock_scope': 'First script clock through final checked evidence publication; initial parent interpreter startup excluded.',
        'memory_scope': 'Parent high-water plus maximum sampled/waited child-group RSS; not an instantaneous kernel bound.',
        'historical_execution': False, 'automatic_retry': False, 'final_acceptance': False}
    save(attempt/'process.json', process, enforce=False)
    index = index_directory(attempt, enforce=okay)
    save(attempt/'artifact-index.json', {'files': index, 'excluded_self': 'artifact-index.json',
        'later_completion_record': 'completion.json'}, enforce=okay)
    save(attempt/'completion.json', {'status': 'pending_root_exit_and_integrity_review' if okay else 'failed_retained',
        'elapsed_seconds_before_completion': time.monotonic()-STARTED,
        'artifact_index': fingerprint(attempt/'artifact-index.json', enforce=okay), 'final_acceptance': False}, enforce=okay)
    fd = os.open(attempt, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)
    if okay: check()
    print(json.dumps({'status': process['status'], 'attempt': str(attempt), 'elapsed_seconds': time.monotonic()-STARTED,
        'root_actual_exit_review_required': True}, sort_keys=True))
    return 0 if okay else 1


def main():
    global STARTED
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pins', type=Path, required=True)
    parser.add_argument('--pins-sha256', required=True)
    parser.add_argument('--child', type=Path)
    parser.add_argument('--started', type=float)
    args = parser.parse_args()
    require(len(args.pins_sha256) == 64 and all(c in '0123456789abcdef' for c in args.pins_sha256), 'invalid_pin_digest')
    if args.child is not None:
        require(args.started is not None and math.isfinite(args.started) and 0 <= args.started <= STARTED, 'invalid_parent_clock')
        STARTED = args.started
        child(args.pins.resolve(), args.pins_sha256, args.child.resolve())
        return 0
    require(args.started is None, 'parent_clock_override_forbidden')
    return parent(args.pins.resolve(), args.pins_sha256)


if __name__ == '__main__':
    raise SystemExit(main())
