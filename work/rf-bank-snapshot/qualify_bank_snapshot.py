"""One fixed fresh bank-snapshot qualification; no model science."""
import time
STARTED = time.monotonic()
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import sys
import traceback

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OWNER = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
WORK = Path(__file__).resolve().parent
PROFILE = OWNER/'work/rf-origin-profile/profile-685708ac9c57a623'
PREFIT = ROOT/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'
PREVIOUS_ACCEPTANCE = ROOT/'.planning/engine-os/research-first/RF-COMP-05-ACCEPTANCE.v1.json'
SCOPE = ROOT/'.planning/engine-os/research-first/RF-COMP-06-BANK-SNAPSHOT-SCOPE.v1.md'
SOURCE = ROOT/'scripts/research_score_bank_snapshot.py'
TESTS = ROOT/'tests/research-score-bank-snapshot/test_bank_snapshot.py'
DESIGN = OWNER/'work/rf-strict-compute/NEXT-EFFICIENCY-DESIGN.md'
STATE = PROFILE/'plain/origin-store/state-2013-01.json'
PYTHON = '/opt/anaconda3/bin/python3.12'
RUNTIME_INPUTS = (Path(PYTHON),) + tuple(Path('/opt/anaconda3/lib/python3.12')/name for name in (
    'json/__init__.py', 'json/encoder.py', 'json/decoder.py', 'json/scanner.py',
    're/__init__.py', 're/_compiler.py', 're/_parser.py', 're/_constants.py', 're/_casefix.py',
    'dataclasses.py', 'types.py', 'lib-dynload/_json.cpython-312-darwin.so',
    'lib-dynload/math.cpython-312-darwin.so'))
CASE_NAMES = ('unchanged', 'last_rating', 'last_output_mean', 'last_origin', 'forecast_order',
              'dict_insertion_order', 'signed_zero', 'numeric_type', 'array_list', 'unicode_equivalence')
EXPECTED = (True, False, False, False, False, True, False, False, True, True)
SECONDS, MIB, RESERVE = 60., 1024., 5.
PARENT_MIB, CHILD_MIB = 128., 896.
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
    with path.open('xb') as out:
        for start in range(0, len(raw), 1024*1024):
            if enforce: check()
            out.write(raw[start:start+1024*1024])
        out.flush()
        os.fsync(out.fileno())
    if enforce: check()


def save(path, value, *, enforce=True):
    write_raw(path, encoded(value), enforce=enforce)


def fingerprint(path, *, enforce=True):
    digest = hashlib.sha256()
    size = 0
    with path.open('rb') as src:
        while chunk := src.read(1024*1024):
            if enforce: check()
            digest.update(chunk)
            size += len(chunk)
    return {'sha256': digest.hexdigest(), 'bytes': size}


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
    require(set(pins) == {'version', 'code_hashes', 'runtime_files', 'runtime', 'inputs', 'state'}
            and pins['version'] == 'rf-bank-snapshot-inputs.v1', 'pin_schema')
    required = (PREFIT, PREVIOUS_ACCEPTANCE, SCOPE, SOURCE, TESTS, DESIGN, STATE,
                PROFILE/'artifact-index.json', Path(__file__).resolve(), *RUNTIME_INPUTS,
                WORK/'static-fixture-review.md')
    require(all(str(path) in pins['inputs'] for path in required), 'required_input_missing')
    fixed = {
        PREFIT: '9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e',
        PREVIOUS_ACCEPTANCE: '285949c06378799e01a95292708a6d16da371f16666bb92e82dc476bfe6d89cb',
        DESIGN: 'd1b535773196fb5c5162134d67f72334cdd9a646effb9050b7bb45cd4de6a1f9',
        STATE: '0be4fb5801dc501d6ebb0a15c764eac82a45edb81dc640db77c6ae2c626bbda1',
        PROFILE/'artifact-index.json': 'ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b',
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
    state_pin = json.loads((PROFILE/'artifact-index.json').read_bytes())['files']['plain/origin-store/state-2013-01.json']
    require(pins['state'] == {'path': str(STATE), **state_pin} and fingerprint(STATE) == state_pin, 'saved_state_changed')
    previous = json.loads(PREVIOUS_ACCEPTANCE.read_bytes())
    for field in ('scope', 'implementation', 'pins', 'source', 'tests_source', 'driver', 'index', 'child_result'):
        pointer = previous[field]
        require(pointer['path'] in pins['inputs'] and
                all(pins['inputs'][pointer['path']][key] == pointer[key] for key in ('sha256', 'bytes')),
                'closed_strict_input_missing:'+field)
    return pins


def make_fixture(raw, name):
    import copy
    import numpy as np
    from types import SimpleNamespace
    state = json.loads(raw)
    require(state['version'] == 'rf02f.origin-state.v1' and state['origin']['season'] == 2013
            and state['origin']['week'] == 1, 'fixed_state_origin')
    rows = state['trajectory_state']
    require(type(rows) is list and len(rows) == 297, 'fixture_output_population')
    engines, outputs = {}, {}
    keys = []
    targets = sorted(state['origin']['targetGameIds'])
    for row in rows:
        key = tuple(row['key'])
        require(key not in outputs, 'duplicate_fixture_key')
        keys.append(key)
        outputs[key] = copy.deepcopy(row['output'])
        require([f['game_id'] for f in outputs[key]['forecasts']] == targets, 'fixture_forecast_order')
        if 'own_state' in row:
            own = row['own_state']
            require(set(own) == {'ratings', 'offense', 'defense'}, 'fixture_state_fields')
            require(all(type(v) is list and len(v) == 32 and all(type(x) is float and math.isfinite(x) for x in v)
                        for v in own.values()), 'fixture_vector_type_or_values')
            engines[key] = SimpleNamespace(last_origin=(2013, 1),
                **{field: np.asarray(own[field], dtype=np.float64) for field in ('ratings', 'offense', 'defense')})
    require(keys == sorted(keys) and len(engines) == 216, 'fixture_owned_population')
    last_engine, last_output = sorted(engines)[-1], sorted(outputs)[-1]
    if name == 'signed_zero': engines[last_engine].ratings[-1] = 0.0
    if name == 'numeric_type': outputs[last_output]['forecasts'][-1]['mean'][-1] = 1.0
    if name == 'unicode_equivalence': outputs[last_output]['diagnostic'] = chr(0x1f600)
    return SimpleNamespace(engines=engines), outputs


def mutate(bank, outputs, name):
    last_engine, last_output = sorted(bank.engines)[-1], sorted(outputs)[-1]
    if name == 'unchanged': return
    if name == 'last_rating': bank.engines[last_engine].ratings[-1] += 1.0
    elif name == 'last_output_mean': outputs[last_output]['forecasts'][-1]['mean'][-1] += 1.0
    elif name == 'last_origin': bank.engines[last_engine].last_origin = (2013, 2)
    elif name == 'forecast_order': outputs[last_output]['forecasts'].reverse()
    elif name == 'dict_insertion_order': outputs[last_output] = dict(reversed(list(outputs[last_output].items())))
    elif name == 'signed_zero': bank.engines[last_engine].ratings[-1] = -0.0
    elif name == 'numeric_type': outputs[last_output]['forecasts'][-1]['mean'][-1] = 1
    elif name == 'array_list':
        for engine in bank.engines.values():
            for field in ('ratings', 'offense', 'defense'):
                setattr(engine, field, getattr(engine, field).tolist())
    elif name == 'unicode_equivalence': outputs[last_output]['diagnostic'] = chr(0xd83d)+chr(0xde00)
    else: raise ValueError('unknown_pair')


def image_value(value):
    """Lossless typed fixture witness; no original/candidate serialization calls."""
    import numpy as np
    kind = type(value)
    if kind is dict:
        return ['dict', [[image_value(key), image_value(child)] for key, child in value.items()]]
    if kind in (list, tuple):
        return [kind.__name__, [image_value(child) for child in value]]
    if kind is np.ndarray:
        return ['ndarray', value.dtype.str, list(value.shape), list(value.strides), value.flags.writeable,
                value.tobytes().hex()]
    if kind is str: return ['str_utf8_surrogatepass_hex', value.encode('utf-8', 'surrogatepass').hex()]
    if kind is float: return ['float_hex', value.hex()]
    if kind is int: return ['int', str(value)]
    require(value is None or kind is bool, 'unexpected_fixture_image_type')
    return [kind.__name__, value]


def image_fixture(bank, outputs):
    return image_value({'outputs': outputs, 'engines': {key: {'last_origin': engine.last_origin,
        **{field: getattr(engine, field) for field in ('ratings', 'offense', 'defense')}}
        for key, engine in bank.engines.items()}})


def pair(route, bank, outputs, name):
    from research_score_split_controller import _bank_state_digest
    from research_score_bank_snapshot import capture, same
    result = {'route': route, 'name': name, 'events': []}
    try:
        result['events'].append('before_capture_started')
        before = _bank_state_digest(bank, outputs) if route == 'original' else capture(bank, outputs)
        result['before'] = {'sha256': before} if route == 'original' else {'mode': before.mode}
        result['events'].append('before_capture_finished')
        mutate(bank, outputs, name)
        result['events'].append('mutation_finished')
        after = _bank_state_digest(bank, outputs) if route == 'original' else capture(bank, outputs)
        result['after'] = {'sha256': after} if route == 'original' else {'mode': after.mode}
        result['events'].append('after_capture_finished')
        answer = before == after if route == 'original' else same(before, after)
        result['outcome'] = {'kind': 'comparison', 'type': type(answer).__name__, 'equal': answer}
        result['events'].append('comparison_finished')
    except BaseException as error:
        result['outcome'] = {'kind': 'error', 'module': type(error).__module__, 'type': type(error).__qualname__,
                             'message': str(error)}
    return result


def child(pins_path, pin_sha, attempt):
    result = {'status': 'failed_or_interrupted', 'timings': [], 'test_observation_count': 0}
    try:
        pins = authenticate(pins_path, pin_sha)
        require(attempt == WORK/('attempt-'+pin_sha[:16]), 'child_identity_changed')
        sys.path.insert(0, str(ROOT/'scripts'))
        sys.path.insert(0, str(TESTS.parent))
        from research_score_split_preflight import actual_runtime
        require(actual_runtime() == pins['runtime'], 'unqualified_runtime')
        import unittest
        import test_bank_snapshot as tests
        # Import both boundaries before measured work; their startup remains in command setup.
        import research_score_split_controller
        import research_score_bank_snapshot

        def observe(row):
            result['test_observation_count'] += 1
            save(attempt/'test-observations'/f'{result["test_observation_count"]:04d}.json', row)

        tests.set_observation_writer(observe)
        tests_started = time.monotonic()
        with (attempt/'unittest.log').open('x') as log:
            run = unittest.TextTestRunner(stream=log, verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(tests))
            log.flush()
            os.fsync(log.fileno())
        result['tests'] = {'count': run.testsRun, 'failures': len(run.failures), 'errors': len(run.errors),
                           'skipped': len(run.skipped), 'seconds': time.monotonic()-tests_started}
        require(run.wasSuccessful() and run.testsRun > 0 and not run.skipped, 'focused_exactness_failed')
        check()
        raw = STATE.read_bytes()
        save(attempt/'pair-definitions.json', [{'name': name, 'expected_equal': expected}
            for name, expected in zip(CASE_NAMES, EXPECTED, strict=True)])
        expected_images = {}
        parity = []
        for name, expected in zip(CASE_NAMES, EXPECTED, strict=True):
            observed = {}
            for route in ('original', 'candidate'):
                bank, outputs = make_fixture(raw, name)
                before = image_fixture(bank, outputs)
                save(attempt/'parity'/name/route/'before-input.json', before)
                actual = pair(route, bank, outputs, name)
                save(attempt/'parity'/name/route/'outcome.json', actual)
                after = image_fixture(bank, outputs)
                save(attempt/'parity'/name/route/'after-input.json', after)
                observed[route] = actual
                require(actual['outcome'] == {'kind': 'comparison', 'type': 'bool', 'equal': expected}, 'pair_outcome:'+route+':'+name)
                if route == 'candidate':
                    expected_mode = 'fallback' if name == 'unicode_equivalence' else 'supported'
                    require(actual['before'] == actual['after'] == {'mode': expected_mode}, 'pair_mode:'+name)
                if route == 'original': expected_images[name] = (before, after)
                else: require((before, after) == expected_images[name], 'candidate_mutated_fixture:'+name)
            parity.append({'name': name, 'original': observed['original'], 'candidate': observed['candidate'],
                           'input_images_equal': True})
        save(attempt/'parity-results.json', parity)
        result['setup_seconds_before_timing'] = time.monotonic()-STARTED
        result['fixed_timing_order'] = ['original', 'candidate']
        for route in ('original', 'candidate'):
            for name, expected in zip(CASE_NAMES, EXPECTED, strict=True):
                check()
                bank, outputs = make_fixture(raw, name)
                before = image_fixture(bank, outputs)
                save(attempt/'timed'/route/name/'before-input.json', before)
                started = time.monotonic()
                actual = pair(route, bank, outputs, name)
                finished = time.monotonic()
                row = {'route': route, 'name': name, 'started_monotonic': started, 'finished_monotonic': finished,
                       'seconds': finished-started, 'actual': actual}
                result['timings'].append(row)
                save(attempt/'timed'/route/name/'outcome.json', row)
                after = image_fixture(bank, outputs)
                save(attempt/'timed'/route/name/'after-input.json', after)
                require(actual['outcome'] == {'kind': 'comparison', 'type': 'bool', 'equal': expected}, 'timed_pair_outcome:'+route+':'+name)
                if route == 'candidate':
                    expected_mode = 'fallback' if name == 'unicode_equivalence' else 'supported'
                    require(actual['before'] == actual['after'] == {'mode': expected_mode}, 'timed_pair_mode:'+name)
                require((before, after) == expected_images[name], 'timed_input_image_changed:'+route+':'+name)
        result['aggregate_seconds'] = {route: sum(row['seconds'] for row in result['timings'] if row['route'] == route)
                                       for route in ('original', 'candidate')}
        result['candidate_original_ratio'] = result['aggregate_seconds']['candidate']/result['aggregate_seconds']['original']
        result['candidate_observed_faster'] = result['candidate_original_ratio'] < 1
        result['pair_count_per_route'] = len(CASE_NAMES)
        result['parity_pairs'] = len(parity)
        result['complete_input_images_unchanged_except_declared_mutations'] = True
        result['fixture_scope'] = {'outputs': 297, 'owned_engines': 216, 'own_state_vectors': 648,
            'own_state_float_values': 20736, 'last_origin': [2013,1],
            'limitations': 'Derived contiguous float64 vectors and last_origin from accepted publication validation; no engine.stored/history or runnable trajectory bank reconstructed.'}
        require(authenticate(pins_path, pin_sha) == pins, 'child_after_pins_changed')
        result['status'] = 'pending_root_actual_exit_and_independent_review'
        result['historical_execution'] = False
        result['integration_accepted'] = False
        result['timing_limitations'] = 'One fixed original-then-candidate ten-pair pass after required equivalence; includes mutations and helper dispatch; fixture construction and lossless evidence outside pair timers but inside command. Order/cache/OS effects; isolated partial cost only.'
    except BaseException as error:
        result['primary_error'] = type(error).__name__+':'+str(error)
        result['traceback'] = ''.join(traceback.format_exception(error))
        raise
    finally:
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
        write_raw(attempt/'saved-inputs'/'state-2013-01.json', STATE.read_bytes())
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
                                    'artifact_index': fingerprint(attempt/'artifact-index.json', enforce=okay),
                                    'final_acceptance': False}, enforce=okay)
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
