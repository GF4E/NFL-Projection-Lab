"""One fixed exact-byte serializer qualification; never invokes model science."""
import time
STARTED = time.monotonic()
import argparse
import base64
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
PROFILE_ACCEPTANCE = ROOT/'.planning/engine-os/research-first/RF-COMP-04-ORIGIN-PROFILE-ACCEPTANCE.v1.json'
SCOPE = ROOT/'.planning/engine-os/research-first/RF-COMP-05-STRICT-SCOPE.v1.md'
SOURCE = ROOT/'scripts/research_score_strict_compute.py'
TESTS = ROOT/'tests/research-score-strict-compute/test_strict_compute.py'
DESIGN = OWNER/'work/rf-origin-profile/NEXT-SERIALIZER-DESIGN.md'
PYTHON = '/opt/anaconda3/bin/python3.12'
RUNTIME_INPUTS = (Path(PYTHON),) + tuple(Path('/opt/anaconda3/lib/python3.12')/name for name in (
    'json/__init__.py', 'json/encoder.py', 'json/decoder.py', 'json/scanner.py',
    're/__init__.py', 're/_compiler.py', 're/_parser.py', 're/_constants.py', 're/_casefix.py',
    'lib-dynload/_json.cpython-312-darwin.so', 'lib-dynload/math.cpython-312-darwin.so'))
PROFILE_REVIEWS = tuple(OWNER/'work/rf-origin-profile'/name for name in (
    'actual-numerical-review.json', 'actual-root-review.json', 'actual-attribution-review.md'))
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
    require(set(pins) == {'version', 'code_hashes', 'runtime_files', 'runtime', 'inputs', 'corpus'}
            and pins['version'] == 'rf-strict-compute-inputs.v1', 'pin_schema')
    required = (PREFIT, PROFILE_ACCEPTANCE, SCOPE, SOURCE, TESTS, DESIGN,
                PROFILE/'artifact-index.json', Path(__file__).resolve(), *RUNTIME_INPUTS, *PROFILE_REVIEWS)
    require(all(str(path) in pins['inputs'] for path in required), 'required_input_missing')
    fixed = {
        PREFIT: '9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e',
        PROFILE_ACCEPTANCE: '93553c563f064232a58215e8e5f96831a80f7573133d1116be4fe26a9322b6a6',
        DESIGN: '5d791b4e3aeea1bb001087b6185d9f0769ddaabec28fdbbe0829e16b1b6d329b',
        PROFILE/'artifact-index.json': 'ffd0946f89948226066ef95e56d5dc76a5ee85ce739fbfbddf5e004f24720e5b',
        PROFILE_REVIEWS[0]: '155efff2c4225ac36c89f84580d68bb6fd982a74f8a9a18c30560840afdbd68e',
        PROFILE_REVIEWS[1]: '776edb025b4502fc603ea843ade4af42845b17286785c18043ee83863df2a989',
        PROFILE_REVIEWS[2]: '148b131b8e2e2a46ea1759edcb1aada48daf299d38040153a48148564d16831a',
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
    full_index = json.loads((PROFILE/'artifact-index.json').read_bytes())['files']
    corpus = {name: pin for name, pin in full_index.items()
              if name.startswith('plain/origin-store/') and name.endswith('.json')}
    require(pins['corpus'] == corpus and len(corpus) == 10, 'fixed_corpus_membership')
    actual = {str(path.relative_to(PROFILE)) for path in (PROFILE/'plain/origin-store').rglob('*.json')}
    require(actual == set(corpus), 'saved_corpus_physical_membership')
    for name, pin in corpus.items():
        require(fingerprint(PROFILE/name) == pin, 'saved_corpus_changed:'+name)
    return pins


def numpy_state(value, arrays, path=()):
    import numpy as np
    if type(value) is dict:
        return {key: numpy_state(child, arrays, path+(key,)) for key, child in value.items()}
    if type(value) is list:
        if value and all(type(child) is float for child in value):
            array = np.asarray(value, dtype=np.float64)
            arrays.append({'path': list(path), 'dtype': array.dtype.str, 'shape': list(array.shape),
                           'bytes_base64': base64.b64encode(array.tobytes()).decode('ascii')})
            return array
        return [numpy_state(child, arrays, path+(i,)) for i, child in enumerate(value)]
    return value


def input_snapshot(value):
    """Lossless immutable image of the known JSON/NumPy corpus, without strict."""
    import numpy as np
    kind = type(value)
    if kind is dict:
        return ('dict', tuple((key, input_snapshot(child)) for key, child in value.items()))
    if kind is list:
        return ('list', tuple(input_snapshot(child) for child in value))
    if kind is np.ndarray:
        return ('ndarray', value.dtype.str, value.shape, value.strides, value.flags.writeable, value.tobytes())
    if kind is float:
        return ('float', value.hex())
    require(value is None or kind in (str, int, bool), 'unexpected_corpus_snapshot_type')
    return (kind.__name__, value)


def retain_call(function, value, path):
    """Retain actual corpus output/error before any equality decision."""
    try:
        raw = function(value)
    except BaseException as error:
        save(path.with_suffix('.error.json'), {'module': type(error).__module__, 'type': type(error).__name__,
                                             'message': str(error)}, enforce=False)
        raise
    if type(raw) is not bytes:
        save(path.with_suffix('.type-error.json'), {'type': type(raw).__qualname__, 'repr': repr(raw)}, enforce=False)
        raise ValueError('nonbyte_serializer_output:'+str(path))
    write_raw(path, raw)
    return raw


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
        import test_strict_compute as tests
        from research_score_conditional_run import strict as original
        from research_score_conditional_replay import canonical
        from research_score_strict_compute import strict as candidate, eligible

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
        require(run.wasSuccessful() and run.testsRun > 0 and not run.skipped, 'adversarial_exactness_failed')
        check()
        corpus = []
        coverage = []
        for name in sorted(pins['corpus']):
            raw = (PROFILE/name).read_bytes()
            value = json.loads(raw)
            save_name = Path(name).name
            original_raw = retain_call(original, value, attempt/'corpus-equality'/'original'/save_name)
            candidate_raw = retain_call(candidate, value, attempt/'corpus-equality'/'candidate'/save_name)
            coverage.append({'name': name, 'saved_original_canonical': original_raw == raw,
                             'equal': type(candidate_raw) is bytes and candidate_raw == original_raw,
                             'eligible': eligible(canonical(value))})
            save(attempt/'corpus-coverage'/save_name, coverage[-1])
            require(original_raw == raw, 'noncanonical_saved_corpus:'+name)
            require(type(candidate_raw) is bytes and candidate_raw == raw, 'corpus_byte_mismatch:'+name)
            corpus.append((save_name, value, raw))
        raw = (PROFILE/'plain/origin-store/state-2013-01.json').read_bytes()
        arrays = []
        state = numpy_state(json.loads(raw), arrays)
        save(attempt/'numpy-state-arrays.json', arrays)
        require(bool(arrays), 'missing_state_numpy_arrays')
        for label, function in (('original', original), ('candidate', candidate)):
            actual = retain_call(function, state, attempt/'corpus-equality'/label/'numpy-state.json')
            require(type(actual) is bytes and actual == raw, 'numpy_state_byte_mismatch:'+label)
        coverage.append({'name': 'numpy-state.json', 'saved_original_canonical': True, 'equal': True,
                         'eligible': eligible(canonical(state)), 'array_count': len(arrays)})
        corpus.append(('numpy-state.json', state, raw))
        save(attempt/'corpus-coverage.json', coverage)
        before_inputs = [input_snapshot(value) for name, value, expected in corpus]
        result['setup_seconds_before_timing'] = time.monotonic()-STARTED
        result['fixed_timing_order'] = ['original', 'candidate']
        for label, function in (('original', original), ('candidate', candidate)):
            for name, value, expected in corpus:
                check()
                started = time.monotonic()
                try:
                    actual = function(value)
                except BaseException as error:
                    finished = time.monotonic()
                    error_record = {'route': label, 'name': name, 'seconds': finished-started,
                                    'started_monotonic': started, 'finished_monotonic': finished,
                                    'exception_module': type(error).__module__, 'exception_type': type(error).__name__,
                                    'exception_message': str(error)}
                    result['timings'].append(error_record)
                    save(attempt/'timed-outputs'/label/(name+'.error.json'), error_record, enforce=False)
                    raise
                finished = time.monotonic()
                if type(actual) is not bytes:
                    save(attempt/'timed-outputs'/label/(name+'.type-error.json'),
                         {'type': type(actual).__qualname__, 'repr': repr(actual)}, enforce=False)
                    raise ValueError('nonbyte_timed_output:'+label+':'+name)
                result['timings'].append({'route': label, 'name': name, 'seconds': finished-started,
                                          'started_monotonic': started, 'finished_monotonic': finished,
                                          'bytes': len(actual), 'sha256': hashlib.sha256(actual).hexdigest()})
                write_raw(attempt/'timed-outputs'/label/name, actual)
                require(actual == expected, 'timed_byte_mismatch:'+label+':'+name)
        result['aggregate_seconds'] = {label: sum(row['seconds'] for row in result['timings'] if row['route'] == label)
                                       for label in ('original', 'candidate')}
        result['candidate_original_ratio'] = result['aggregate_seconds']['candidate']/result['aggregate_seconds']['original']
        result['candidate_observed_faster'] = result['candidate_original_ratio'] < 1
        result['eligible_items'] = sum(row['eligible'] for row in coverage)
        result['corpus_items'] = len(corpus)
        result['saved_corpus_bytes'] = sum(pin['bytes'] for pin in pins['corpus'].values())
        for before, (name, value, expected) in zip(before_inputs, corpus, strict=True):
            require(input_snapshot(value) == before, 'corpus_input_mutated:'+name)
        result['corpus_inputs_unchanged'] = True
        require(authenticate(pins_path, pin_sha) == pins, 'child_after_pins_changed')
        result['status'] = 'pending_root_actual_exit_and_independent_review'
        result['historical_execution'] = False
        result['integration_accepted'] = False
        result['timing_limitations'] = 'One fixed original-then-candidate pass after required equality checks; order/cache/OS effects, no whole-path or historical capacity claim.'
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
        for name in before['corpus']:
            write_raw(attempt/'saved-inputs'/Path(name).name, (PROFILE/name).read_bytes())
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
