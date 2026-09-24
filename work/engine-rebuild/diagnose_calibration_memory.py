"""Local full-size synthetic allocation diagnosis; not Linux qualification."""
import argparse
import contextlib
import functools
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
LABEL = 'SYNTHETIC_ONLY_NOT_AN_EXPERIMENT'


def current_rss():
    return int(subprocess.check_output(['ps', '-o', 'rss=', '-p', str(os.getpid())]))*1024


def worker(output):
    sys.path[:0] = [str(ROOT), str(ROOT/'tests')]
    os.environ['TMPDIR'] = str(output)
    spec = importlib.util.spec_from_file_location('scale', ROOT/'work/engine-rebuild/profile_calibration_scale.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from test_projection_calibration_admission import AdmissionTests
    from engine.projection import calibration_admission as admission, calibration_history as history
    from engine.projection import calibration_execute as execution, calibration_evaluate as evaluator
    from engine.projection import calibration_report as report, research_ledger as ledger, storage
    from engine.projection import calibration_json as retained_json
    from engine import projection_experiments as experiments
    fixture = AdmissionTests()
    fixture.setUp()
    fixture.temp._finalizer.detach()
    assert fixture.root.is_relative_to(output)
    host = json.loads((ROOT/'work/engine-rebuild/calibration-scale/retained-attempt1.json').read_text())
    raw = (ROOT/'.cloud-private/calibration-memory/linux-inputs.json').read_bytes()
    assert hashlib.sha256(raw).hexdigest() == host['identity']['input_ref']['sha256']
    captured = json.loads(raw)
    roles, folds = captured['roles'], captured['folds']
    control = [{k: g[k] for k in ('game_id', 'season', 'home', 'away', 'actual_home', 'actual_away')}
               for g in roles['own']['history'] if g['season'] >= 2016]
    weeks = {g['game_id']: int(g['game_id'].split('_')[2]) for g in control}
    fixture.control = control
    fixture.inputs.update(roles=roles, folds=folds, evaluation_game_ids=sorted(weeks))
    fixture.inputs['sources']['schedule'] = fixture.save('work/schedule.json',
        [{'game_id': gid, 'week': week} for gid, week in sorted(weeks.items())])
    ref = fixture.save(fixture.control_ref['path'], control)
    fixture.catalog['series'][0]['sha256'] = ref['sha256']
    fixture.save('work/series-registry/catalog.json', fixture.catalog)
    fixture.r.update(baseline_hash=ref['sha256'], population_game_ids=sorted(weeks), seasons=list(range(2016, 2026)))
    fixture.save_inputs()
    registration = fixture.registration()
    assert fixture.r['inputs']['sha256'] == host['identity']['input_ref']['sha256']
    identity = {'scope': LABEL, 'fixture_root': str(fixture.root), 'registration': registration,
        'input_ref': fixture.r['inputs'], 'same_input_hash_as_failed_linux_run': True,
        'environment': admission.environment(), 'code': fixture.r['evaluation_code']}
    (output/'identity.json').write_text(json.dumps(identity, indent=2)+'\n')
    started = time.monotonic()
    stream = (output/'stages.jsonl').open('a', buffering=1)
    def note(stage, event, **extra):
        stream.write(json.dumps({'scope': LABEL, 'stage': stage, 'event': event,
            'elapsed': time.monotonic()-started, 'rss': current_rss(),
            'peak_rss': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            **extra})+'\n')
    def wrap(name, fn, condition=lambda *a, **k: True):
        @functools.wraps(fn)
        def call(*args, **kwargs):
            if not condition(*args, **kwargs):
                return fn(*args, **kwargs)
            note(name, 'ENTER')
            try:
                result = fn(*args, **kwargs)
            except BaseException as exc:
                note(name, 'FAILED', error_type=type(exc).__name__)
                raise
            note(name, 'RETURN')
            return result
        return call
    def large(value, *args, **kwargs):
        return isinstance(value, dict) and value.get('schema') == 'calibration-numerics-v1'
    with contextlib.ExitStack() as stack:
        for obj, name in [(admission, 'preflight'), (history, 'build'), (evaluator, 'numerical'),
                          (execution, 'verify_result'), (execution, 'read'),
                          (ledger, 'sync_calibration'), (report, 'publish')]:
            stack.enter_context(patch.object(obj, name, wrap(obj.__name__+'.'+name, getattr(obj, name))))
        # Patch each imported alias to expose whole-result canonical hashing.
        for obj in (evaluator, execution, experiments):
            stack.enter_context(patch.object(obj, 'digest', wrap(obj.__name__+'.large_digest', obj.digest, large)))
        stack.enter_context(patch.object(storage, 'save', wrap('storage.save', storage.save,
            lambda p, value, *a, **k: large(value))))
        stack.enter_context(patch.object(retained_json, 'save', wrap('retained_json.save', retained_json.save,
            lambda p, value, *a, **k: large(value))))
        note('execution_and_ledger', 'ENTER')
        saved = ledger.run_calibration(fixture.root, registration)
        note('execution_and_ledger', 'RETURN')
        assert len(saved['attempts']) == 1
        assert saved['attempts'][0]['receipt']['state'] == 'COMPUTED_NOT_RELEASED'
        # Discard caller's copy before retry/report, as a fresh CLI would.
        key = saved['key']
        del saved
        note('exact_retry', 'ENTER')
        retry = ledger.run_calibration(fixture.root, registration)
        assert len(retry['attempts']) == 1
        del retry
        note('exact_retry', 'RETURN')
        published = report.publish(fixture.root, key)
        note('completed', 'PASS', report_ref=published['report_ref'])
    stream.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    parser.add_argument('--worker', action='store_true')
    args = parser.parse_args()
    output = args.output.resolve()
    if args.worker:
        return worker(output)
    output.mkdir(parents=True, exist_ok=False)
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', OPENBLAS_NUM_THREADS='1',
        OMP_NUM_THREADS='1', MKL_NUM_THREADS='1', NUMEXPR_NUM_THREADS='1')
    started = time.monotonic()
    peak = samples = 0
    reason = None
    with (output/'worker.log').open('wb') as log:
        process = subprocess.Popen([sys.executable, '-B', str(Path(__file__).resolve()), str(output), '--worker'],
            env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        while process.poll() is None:
            found = subprocess.run(['ps', '-o', 'rss=', '-p', str(process.pid)], capture_output=True, text=True)
            if found.returncode == 0 and found.stdout.strip():
                rss = int(found.stdout)*1024
                peak = max(peak, rss)
                samples += 1
                if rss > 1024**3:
                    reason = 'OBSERVED_RSS_EXCEEDS_1_GIB'
            if time.monotonic()-started >= 570:
                reason = 'DIAGNOSTIC_570_SECOND_DEADLINE'
            if reason:
                os.killpg(process.pid, signal.SIGKILL)
                break
            time.sleep(.25)
        code = process.wait()
    result = {'scope': LABEL, 'purpose': 'MAC_DIAGNOSIS_NOT_LINUX_QUALIFICATION',
        'exit_code': code, 'stop_reason': reason, 'elapsed_seconds': time.monotonic()-started,
        'sampled_peak_rss_bytes': peak, 'samples': samples,
        'memory_guard': '1 GiB RSS observer; sampled, not a hard address-space/cgroup bound',
        'deadline_seconds': 570, 'real_experiment': False, 'activates_method': False}
    (output/'supervision.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result))
    return code


if __name__ == '__main__':
    sys.exit(main())
