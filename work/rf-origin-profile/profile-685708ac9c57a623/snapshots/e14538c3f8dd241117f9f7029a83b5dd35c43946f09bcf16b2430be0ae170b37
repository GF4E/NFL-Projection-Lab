"""One fixed tiny-origin attribution study. The root owns final acceptance."""
import time
STARTED = time.monotonic()
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import sys
import traceback

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path(__file__).resolve().parent
OWNER = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
PYTHON = '/opt/anaconda3/bin/python3.12'
SCOPE = ROOT/'.planning/engine-os/research-first/RF-COMP-04-ORIGIN-PROFILE-SCOPE.v1.md'
ACCEPTANCE = ROOT/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json'
QUALIFICATION = OWNER/'work/rf-comp-04/attempt-1788652424308249000/qualification.v2.json'
WITNESS = QUALIFICATION.with_name('numerical-observations.json')
DESIGN = OWNER/'work/rf-comp-04/NEXT-FULL-ORIGIN-PROFILE-DESIGN.md'
FIXED_INPUTS = {
    SCOPE: '828919db563bd1895a649f122c6d38c643fdba3c92615b9e048f11cf6a5393eb',
    ACCEPTANCE: '9aaaa23ebc2b002c70d5acef35dd0f8349c721660c54033cfb457b760acd978e',
    QUALIFICATION: '8d763bc0ef108d505b977d3f2dfda2c5a8248d7b3c7189d8186330c54dcf6731',
    WITNESS: '630b123b3df3edb804bc8054e02a4ae45c2b09eeaa37be6859b387bcca01b347',
    DESIGN: '7210de79ed5c6a10848d9bbcf5c7e9f86b7582ae9d6c962057e82aa837a6a5f3',
    ROOT/'config/research-team-score.v2.json': '422b1082361a2d0d926f639c8cf67b38615517a8269a7f05729aea0c8f264615',
}
PROFILER_INPUTS = tuple(Path('/opt/anaconda3/lib/python3.12')/p for p in (
    'cProfile.py', 'profile.py', 'pstats.py', 'lib-dynload/_lsprof.cpython-312-darwin.so'))
SECONDS, MIB, RESERVE = 60., 1024., 5.
PARENT_MIB, CHILD_MIB = 128., 896.
IS_CHILD = '--child' in sys.argv
sys.dont_write_bytecode = True
EXCLUSIONS = ['annual selection', 'StrictSelectionFeed.add', 'full historical admission',
              'large history/index behavior', 'smoke', 'bootstrap', 'complete controller', 'historical terminal']


class ProfileStop(BaseException):
    pass


def require(value, reason):
    if not value:
        raise ValueError(reason)


def check():
    if time.monotonic()-STARTED >= SECONDS-(RESERVE if IS_CHILD else 0.):
        raise ProfileStop('setup_inclusive_profile_deadline')
    if resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/2**20 >= (CHILD_MIB if IS_CHILD else PARENT_MIB):
        raise ProfileStop('profile_process_memory_reserve')


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False)+'\n').encode()


def write_raw(path, raw, *, enforce=True):
    if enforce: check()
    with path.open('xb') as out:
        for start in range(0, len(raw), 1024*1024):
            if enforce: check()
            out.write(raw[start:start+1024*1024])
        out.flush(); os.fsync(out.fileno())
    if enforce: check()


def save(path, value, *, enforce=True):
    write_raw(path, encoded(value), enforce=enforce)


def fingerprint(path, *, enforce=True):
    h = hashlib.sha256(); size = 0
    with path.open('rb') as source:
        while chunk := source.read(1024*1024):
            if enforce: check()
            h.update(chunk); size += len(chunk)
    return {'path': str(path), 'sha256': h.hexdigest(), 'bytes': size}


def copied(source, destination, *, enforce=True):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with source.open('rb') as src, destination.open('xb') as dst:
        while chunk := src.read(1024*1024):
            if enforce: check()
            dst.write(chunk)
        dst.flush(); os.fsync(dst.fileno())


def directory_index(directory, *, enforce=True):
    result = {}
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink(), 'profile_symlink_forbidden')
        if path.is_file():
            item = fingerprint(path, enforce=enforce)
            result[str(path.relative_to(directory))] = {k: item[k] for k in ('sha256', 'bytes')}
    return result


def authenticate(pins_path, pin_sha):
    check()
    require(fingerprint(pins_path)['sha256'] == pin_sha, 'pin_map_changed')
    pins = json.loads(pins_path.read_bytes())
    require(set(pins) == {'version', 'code_hashes', 'runtime', 'runtime_files', 'inputs', 'scope_path'}
            and pins['version'] == 'rf-origin-profile-inputs.v1' and pins['scope_path'] == str(SCOPE), 'fixed_pin_schema')
    inputs = pins['inputs']
    require(all(str(p) in inputs for p in (*FIXED_INPUTS, *PROFILER_INPUTS, Path(__file__).resolve())), 'required_input_missing')
    for path, expected in FIXED_INPUTS.items():
        require(inputs[str(path)]['sha256'] == expected, 'fixed_input_pin_changed')
    for name, pin in inputs.items():
        require(Path(name).is_absolute() and set(pin) == {'sha256', 'bytes', 'snapshot'}
                and type(pin['bytes']) is int and pin['bytes'] > 0 and type(pin['snapshot']) is bool, 'input_pointer_schema')
        actual = fingerprint(Path(name))
        require(all(actual[k] == pin[k] for k in ('sha256', 'bytes')), 'input_changed:'+name)
    accepted = json.loads(ACCEPTANCE.read_bytes())
    require(pins['code_hashes'] == accepted['code_hashes'] and len(pins['code_hashes']) == 79
            and pins['runtime_files'] == accepted['runtime_files'] and len(pins['runtime_files']) == 7
            and pins['runtime'] == accepted['runtime'], 'accepted_source_runtime_map_changed')
    for kind in ('protocol', 'config', 'compute_protocol'):
        pointer = accepted[kind]; name = str(ROOT/pointer['path'])
        require(name in inputs and all(inputs[name][k] == pointer[k] for k in ('sha256', 'bytes')), 'protocol_input_missing')
    for name, sha in pins['code_hashes'].items():
        require(fingerprint(ROOT/name)['sha256'] == sha, 'source_changed:'+name)
    for name, sha in pins['runtime_files'].items():
        require(fingerprint(Path(name))['sha256'] == sha, 'runtime_file_changed:'+name)
    return pins


def profile_stats(profiler):
    import pstats
    stats = pstats.Stats(profiler)
    return [{'function': list(key), 'primitive_calls': value[0], 'total_calls': value[1],
             'exclusive_seconds': value[2], 'cumulative_seconds': value[3],
             'callers': [{'function': list(caller), 'raw_stats': list(data) if isinstance(data, tuple) else data}
                         for caller, data in sorted(value[4].items())]}
            for key, value in sorted(stats.stats.items())]


def stable_callbacks(rows):
    return [{k: v for k, v in row.items() if k not in ('started_seconds', 'finished_seconds', 'seconds')}
            for row in rows]


def run_route(label, output, reference):
    """No scientific substitutions: fresh fixture, Store, bank and grader."""
    import cProfile
    from functools import partial
    from test_grade_unit import Case
    from test_forecast_unit import TEAMS, choice, measured, native
    from test_integration import law_fields, global_bindings
    import research_score_split_archive as archive
    import research_score_split_controller as controller
    import research_score_split_forecast as forecast
    import research_score_split_compute_integration as composed
    from research_score_models import MeanTrajectory
    from research_score_split_replay import SplitTrajectoryBank
    from research_score_split_run import Store, put_object, read_publication, strict

    output.mkdir()
    case = Case.__new__(Case)
    store = None; profiler = cProfile.Profile() if label == 'profiled' else None
    begin_setup = time.monotonic(); stages = []; report = None; acc = grader = None
    profiler_started = False; primary_error = None; primary_trace = None; cleanup_errors = []
    bindings = global_bindings()
    try:
        check(); Case.__init__(case, 2013, 0, 1); check()
        source_before = directory_index(case.archive.directory)
        source_copy = output/'source-fixture'; source_copy.mkdir()
        for name in source_before:
            copied(case.archive.directory/name, source_copy/name)
        save(output/'source-fixture-index.json', source_before)
        bank = SplitTrajectoryBank(TEAMS)
        old = case.view['bank_prepared'][12]['history'][0].context
        initial = {delay: {'targets': [old], 'history': []} for delay in (12, 24)}
        diagonals = {(i, variant): MeanTrajectory('E2', {'k': setting['ks'], 'retention': setting['retention']}, TEAMS, variant)
                     .forecast_origin(old.season, old.week, [], [old])
                     for i, setting in enumerate(forecast.split_setting_grid()[:9]) for variant in forecast.STATE_VARIANTS}
        bank.advance(old.season, old.week, initial, diagonals)
        store = Store(output, 'origin-store')
        store.write('manifest.json', case.manifest)
        grader = composed.PublishedOriginGrader()
        selected = choice(2013, 0)
        origin = case.archive.origin
        # A separate immutable fixture view supplies the before-image without
        # adding witness hashing to the measured source-preparation stage.
        source_laws_before = strict({k: list(v.values()) for k, v in case.view['source_laws'].items()})
        def mapper_image(view):
            return {d: (m.atoms.dtype.str, m.atoms.shape, m.atoms.tobytes(), m.atoms.flags.writeable,
                        m.weights.dtype.str, m.weights.shape, m.weights.tobytes(), m.weights.flags.writeable,
                        strict([m.b, m.epsilon])) for d, m in view['mappers'].items()}
        mappers_before = mapper_image(case.view)
        setup_seconds = time.monotonic()-begin_setup
        check()

        def stage(name, function):
            check(); started = time.monotonic(); error = None
            try: return function()
            except BaseException as exc:
                error = type(exc).__name__+':'+str(exc); raise
            finally:
                finished = time.monotonic()
                stages.append({'name': name, 'started_monotonic': started, 'finished_monotonic': finished,
                               'seconds': finished-started, 'error': error})

        with measured(origin) as acc:
            if profiler is not None:
                profiler.enable(); profiler_started = True
            try:
                def prepare():
                    view = archive.forecast_inputs(case.context, origin, acc.envelope.check)
                    pointers = {delay: put_object(store, view['mapper_sources'][delay]['payload']) for delay in (12, 24)}
                    require(all(pointers[d] == view['mapper_sources'][d]['pointer'] for d in pointers), 'mapper_pointer_changed')
                    return view, pointers
                view, pointers = stage('source_and_mapper_preparation', prepare)
                def advance():
                    outputs = bank.advance(2013, 1, view['bank_prepared'], view['diagonal_outputs'])
                    return outputs, controller._bank_state_digest(bank, outputs)
                outputs, state_before = stage('native_advance_and_digest', advance)
                def assemble():
                    value = composed.assemble_forecasts(view, bank, outputs, selected, local_mapper_pointers=pointers,
                        parent_binding={'parent_manifest_sha256': archive.PARENT_MANIFEST, 'parent_index_sha256': archive.PARENT_INDEX},
                        accounting=acc)
                    require(controller._bank_state_digest(bank, outputs) == state_before, 'assembly_mutated_native_state')
                    return value
                assembly = stage('assembly_and_after_digest', assemble)
                publication = stage('durable_publication', lambda: controller.publish_origin(store, case.manifest,
                    case.manifest_sha, view, bank, outputs, assembly, acc.envelope))
                validate = partial(controller.validate_publication_binding, store, case.manifest, case.manifest_sha,
                                   view, assembly, publication, acc.envelope)
                graded = stage('grade_and_saved_reload', lambda: grader.grade(store, case.manifest, case.manifest_sha,
                    view, assembly, publication, case.context, acc, validate_binding=validate))
                def origin_evidence():
                    value = {'version': 'rf-origin-profile.single-origin-evidence.v1', 'historical_execution': False,
                        'manifest_sha256': case.manifest_sha, 'origin': origin, 'forecast': publication,
                        'publication_binding': store.pointer('publication-binding-2013-01.json'),
                        'score_artifacts': graded['artifacts'], 'counts': graded['counts'],
                        'native_states': {'borrowed': 81, 'own': 216},
                        'source_pointers': view['source_pointers'], 'callback_records': copy.deepcopy(acc._active_origin['callbacks'])}
                    store.write('profile-origin-evidence.json', value)
                    require(strict(store.read_bound(store.pointer('profile-origin-evidence.json'))) == strict(value), 'evidence_readback_changed')
                    os.fsync(store.fd); acc.envelope.check()
                stage('single_origin_evidence_persistence', origin_evidence)
            finally:
                if profiler is not None: profiler.disable()

        # All witness formatting/validation below is outside cProfile and B.
        check()
        ledger = acc.snapshot(); record = ledger['origins'][0]
        witness = native({'assembly': {k: assembly[k] for k in ('full_setting_forecasts', 'outer_selected_forecasts', 'grading_plan')},
            'resolved_laws': [{'key': list(k), 'fields': law_fields(v)} for k, v in assembly['resolved_laws'].items()],
            'inner_rows': graded['inner_rows'], 'outer_rows': graded['outer_rows'], 'counts': graded['counts'],
            'publication': archive.parse(read_publication(store, publication)),
            'provenance': store.read_bound(graded['artifacts']['grading_provenance']),
            'callbacks': stable_callbacks(record['callbacks'])})
        save(output/'scientific-witness.json', witness)
        save(output/'accounting.json', ledger)
        save(output/'stages.json', stages)
        require(len(assembly['resolved_laws']) == 62 and len(record['callbacks']) == 88, 'complete_law_callback_population')
        for key, value in witness.items():
            expected = stable_callbacks(reference[key]) if key == 'callbacks' else reference[key]
            require(strict(value) == strict(expected), 'accepted_witness_mismatch:'+key)
        # The real grader already called the original closure validator while
        # its envelope was live. Read-only metadata checks below do not reopen it.
        for stage_name in ('inner', 'outer'):
            require(store.read(graded['artifacts'][stage_name+'_losses']['name']) == strict(witness[stage_name+'_rows']), 'saved_score_bytes_changed')
        require(directory_index(case.archive.directory) == source_before, 'source_fixture_changed')
        require(strict({k: list(v.values()) for k, v in view['source_laws'].items()}) == source_laws_before
                and mapper_image(view) == mappers_before, 'in_memory_source_or_mapper_changed')
        require(all(a is b for a, b in zip(bindings, global_bindings())), 'global_binding_changed')
        files = directory_index(store.path)
        require(files == store.index and not store.uncommitted_artifacts and not store.uncommitted_staging, 'origin_store_membership_or_pending_write')
        save(output/'origin-store-index.json', files)
        fit = math.fsum(row['seconds'] for row in record['callbacks'] if row['kind'] == 'fit')
        score = math.fsum(row['seconds'] for row in record['callbacks'] if row['kind'] == 'score')
        stage_seconds = math.fsum(row['seconds'] for row in stages)
        require(record['complete'] and record['error_type'] is None and all(row['error_type'] is None for row in record['callbacks']), 'unexpected_scientific_failure')
        require(record['seconds'] >= fit+score and record['seconds'] >= stage_seconds, 'overlapping_or_negative_accounting')
        report = {'status': 'exact_declared_path_only', 'route': label, 'setup_seconds': setup_seconds,
            'source_scorer_calls_during_setup': case.source_scorer_calls,
            'B': record['seconds'], 'F_total': fit, 'S_total': score, 'remainder': record['seconds']-fit-score,
            'stage_seconds': {row['name']: row['seconds'] for row in stages},
            'unallocated_seconds': record['seconds']-stage_seconds, 'counts': graded['counts'],
            'callbacks': len(record['callbacks']), 'resolved_laws': len(assembly['resolved_laws']),
            'nondeterministic_closure': ['new state actual_computation_at', 'state hash/bytes', 'publication-binding hash/bytes'],
            'excluded_work': EXCLUSIONS, 'historical_capacity_claim': False}
    except BaseException as error:
        primary_error = error; primary_trace = error.__traceback__
    finally:
        # Keep each metadata/cleanup failure separate and preserve the first
        # scientific exception. No callback or distribution operation occurs here.
        def cleanup(name, function):
            try: function()
            except BaseException as error:
                cleanup_errors.append({'operation': name, 'error': type(error).__name__+':'+str(error)})
        if profiler is not None:
            cleanup('disable_profiler', profiler.disable)
            if profiler_started:
                def export_profile():
                    if primary_error is None: check()
                    raw_path = output/'origin.pstats'
                    require(not raw_path.exists(), 'profile_output_already_exists')
                    profiler.dump_stats(raw_path)
                    with raw_path.open('rb') as stream: os.fsync(stream.fileno())
                    save(output/'pstats-records.json', profile_stats(profiler), enforce=primary_error is None)
                cleanup('export_profile', export_profile)
        if primary_error is not None or cleanup_errors:
            def retain_failure():
                if hasattr(case, 'archive'):
                    retained = output/'failed-source-fixture'; retained.mkdir()
                    for path in sorted(case.archive.directory.rglob('*')):
                        if path.is_file(): copied(path, retained/path.relative_to(case.archive.directory), enforce=False)
                save(output/'failed-route.json', {'status': 'failed_or_interrupted', 'stages': stages,
                    'original_error': None if primary_error is None else ''.join(traceback.format_exception(primary_error)),
                    'cleanup_errors': cleanup_errors, 'elapsed_seconds': time.monotonic()-STARTED,
                    'recorded_origins': [] if acc is None else copy.deepcopy(acc._origins),
                    'active_origin': None if acc is None else copy.deepcopy(acc._active_origin),
                    'grader_attempt_counts': None if grader is None else grader.last_attempt_counts,
                    'partial_store_index': {} if store is None else directory_index(store.path, enforce=False)}, enforce=False)
            cleanup('retain_failure', retain_failure)
        if store is not None: cleanup('close_origin_store', store.close)
        if hasattr(case, 'store'): cleanup('close_auxiliary_fixture_store', case.store.close)
        if hasattr(case, 'parent'): cleanup('remove_auxiliary_fixture_store', case.parent.cleanup)
        if hasattr(case, 'archive'): cleanup('close_source_fixture', case.archive.close)
    if cleanup_errors:
        save(output/'cleanup-errors.json', cleanup_errors, enforce=False)
    if primary_error is not None:
        raise primary_error.with_traceback(primary_trace)
    require(not cleanup_errors, 'route_metadata_or_cleanup_failed')
    save(output/'route-result.json', report)
    return report


def child(pins_path, pin_sha, attempt):
    pins = authenticate(pins_path, pin_sha)
    require(attempt == WORK/('profile-'+pin_sha[:16]), 'child_output_identity_changed')
    sys.path.insert(0, str(ROOT/'scripts'))
    sys.path.insert(0, str(ROOT/'tests/research-score-split'))
    sys.path.insert(0, str(ROOT/'tests/research-score-split-compute'))
    from research_score_split_preflight import actual_runtime
    require(actual_runtime() == pins['runtime'], 'unqualified_runtime')
    observations = json.loads(WITNESS.read_bytes())
    matches = [v for v in observations if v.get('route') == 'composed' and v.get('year') == 2013
               and v.get('selected') == 0 and v.get('injected_fit_failure') is None]
    require(len(matches) == 1, 'fixed_reference_witness_not_unique')
    reference = matches[0]; del observations, matches
    plain = run_route('plain', attempt/'plain', reference)
    profiled = run_route('profiled', attempt/'profiled', reference)
    ratios = {name: profiled['stage_seconds'][name]/value for name, value in plain['stage_seconds'].items()}
    ratio = profiled['B']/plain['B']
    save(attempt/'child-result.json', {'status': 'pending_actual_process_completion', 'historical_execution': False,
        'plain': plain, 'profiled': profiled, 'profiled_plain_B_ratio': ratio, 'stage_ratios': ratios,
        'qualitative_only': abs(ratio-1) > .25 or any(abs(v-1) > .5 for v in ratios.values()),
        'timing_limitation': 'Fixed order confounds instrumentation, cache and OS effects. Cumulative profiles overlap; no speedup or capacity estimate.',
        'optimization_selected': None, 'independent_attribution_review_required': True})
    require(authenticate(pins_path, pin_sha) == pins, 'child_after_pins_changed')
    check()


def parent(pins_path, pin_sha):
    attempt = WORK/('profile-'+pin_sha[:16]); attempt.mkdir()
    before = watched = None; stop = source_error = None
    command = [PYTHON, '-I', str(Path(__file__).resolve()), '--child', str(attempt),
        '--pins', str(pins_path), '--pins-sha256', pin_sha, '--started', repr(STARTED)]
    try:
        before = authenticate(pins_path, pin_sha)
        save(attempt/'source-map-before.json', before)
        copied(pins_path, attempt/'INPUT-PINS.json')
        snapshots = attempt/'snapshots'; snapshots.mkdir()
        paths = {str(ROOT/p): sha for p, sha in before['code_hashes'].items()}
        paths.update({p: value['sha256'] for p, value in before['inputs'].items() if value['snapshot']})
        for path, sha in paths.items():
            if not (snapshots/sha).exists(): copied(Path(path), snapshots/sha)
        sys.path.insert(0, str(ROOT/'scripts'))
        from research_score_split_watchdog import _supervise
        remaining = SECONDS-RESERVE-(time.monotonic()-STARTED)
        require(remaining > 0, 'no_child_allowance')
        watched = _supervise(command, cwd=ROOT, output_parent=WORK,
            identity='observer-'+pin_sha[:16], limits=(remaining, CHILD_MIB, 2., .05), phase_status=False)
        save(attempt/'watchdog.json', watched)
        for name in ('stdout.log', 'stderr.log'):
            copied(WORK/('observer-'+pin_sha[:16])/name, attempt/name)
        require(watched['status'] == 'completed_process' and watched['exit_code'] == 0, 'profile_child_failed')
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
    preliminary_ok = stop is source_error is None and watched is not None and own+child_peak < MIB
    process = {'status': 'provisional_profile_evidence' if preliminary_ok else 'failed_profile', 'command': command,
        'stop': stop, 'source_error': source_error, 'exit_code': None if watched is None else watched['exit_code'],
        'elapsed_seconds_before_final_index': time.monotonic()-STARTED, 'parent_peak_rss_mib': own,
        'child_group_peak_rss_mib': child_peak, 'conservative_combined_rss_mib': own+child_peak,
        'limits': {'seconds': SECONDS, 'mib': MIB, 'evidence_reserve_seconds': RESERVE,
                   'parent_mib': PARENT_MIB, 'child_mib': CHILD_MIB},
        'clock_scope': 'First script clock through final checked evidence publication; initial parent interpreter startup excluded.',
        'memory_scope': 'Parent high-water plus maximum sampled/waited child-group RSS; not an instantaneous kernel bound.',
        'historical_execution': False, 'automatic_retry': False, 'final_acceptance': False}
    save(attempt/'process.json', process, enforce=False)
    if not preliminary_ok:
        print(json.dumps(process, sort_keys=True)); return 1
    check()
    index = directory_index(attempt)
    save(attempt/'artifact-index.json', {'files': index, 'excluded_self': 'artifact-index.json',
                                      'later_completion_record': 'completion.json'})
    fd = os.open(attempt, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)
    check()
    save(attempt/'completion.json', {'status': 'pending_root_exit_and_integrity_review',
        'elapsed_seconds_before_completion': time.monotonic()-STARTED,
        'artifact_index': fingerprint(attempt/'artifact-index.json'), 'final_acceptance': False})
    fd = os.open(attempt, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)
    check()
    print(json.dumps({'status': 'provisional_complete', 'attempt': str(attempt),
                      'elapsed_seconds': time.monotonic()-STARTED, 'root_actual_exit_review_required': True}, sort_keys=True))
    return 0


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
        require(args.started is not None and math.isfinite(args.started) and 0 <= args.started <= STARTED, 'invalid_parent_start')
        STARTED = args.started
        child(args.pins.resolve(), args.pins_sha256, args.child.resolve())
        return 0
    require(args.started is None, 'parent_clock_override_forbidden')
    return parent(args.pins.resolve(), args.pins_sha256)


if __name__ == '__main__':
    raise SystemExit(main())
