"""Distinct runtime temporal/atomic probes. No historical data or scientific calls."""
import time
START = time.monotonic()
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import sys
import tempfile
from unittest.mock import patch

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts'))
import research_score_split_run as r

SOURCE_SHA = 'b71ba98cb62c78c657a02dd0a95f6d2296323b43b4425ef5a5b5597ff1efc9c7'
TEST_SHA = 'a96576b22bd4c55ed8adf34d49ad78ee783605fe75a3f2f263f17a8c092bd42c'
for path, sha in ((ROOT/'scripts/research_score_split_run.py', SOURCE_SHA),
                  (ROOT/'tests/research-score-split/test_run_unit.py', TEST_SHA)):
    assert hashlib.sha256(path.read_bytes()).hexdigest() == sha
checks = []

@contextmanager
def clocked():
    clock = [1000.]
    handlers = []
    timers = []
    previous = object()
    with patch.object(r.time, 'monotonic', lambda: clock[0]), \
         patch.object(r, 'rss_mib', lambda: 100.), \
         patch.object(r.signal, 'getitimer', lambda _: (0., 0.)), \
         patch.object(r.signal, 'setitimer', lambda *args: timers.append(args)), \
         patch.object(r.signal, 'signal', lambda *args: handlers.append(args) or previous):
        envelope = r.RuntimeEnvelope()
        try:
            yield clock, envelope
        finally:
            envelope.close()
        assert handlers[-1] == (signal.SIGALRM, previous)
        assert timers[-1] == (signal.ITIMER_REAL, 0)

def stop(call, expected):
    try:
        call()
    except r.RuntimeStop as exc:
        assert str(exc) == expected, str(exc)
    else:
        raise AssertionError('RuntimeStop missing')

# A true short signal runs in this external bounded child. Only the private
# deadline is shortened; production defaults remain7200 seconds.
handler = signal.getsignal(signal.SIGALRM)
envelope = r.RuntimeEnvelope()
try:
    envelope._deadline = time.monotonic() + .035
    envelope._arm()
    def nested():
        while True:
            try:
                time.sleep(.001)
            except Exception:
                raise AssertionError('ordinary Exception caught hard-stop class')
    stop(lambda: envelope.call(nested), 'registered_7200_second_deadline')
finally:
    envelope.close()
assert signal.getsignal(signal.SIGALRM) == handler and signal.getitimer(signal.ITIMER_REAL) == (0., 0.)
checks.append('real_signal_escapes_nested_exception_handler_and_restores_process_signal')

with tempfile.TemporaryDirectory() as tmp:
    parent = Path(tmp).resolve()
    with clocked() as (clock, env):
        store = r.Store(parent, 'delayed-within-grace')
        try:
            clock[0] = env.started + 7205
            stop(env.check, 'registered_7200_second_deadline')
            assert env.scientific_stop_elapsed == 7200
            clock[0] = env.started + 7226
            value = env.finalize_invalid(store, {'status': 'protocol_invalid', 'reason': 'synthetic'})
            assert value['scientific_stop_elapsed_seconds'] == 7200 and store.finalized
            assert json.loads((store.path/'completion/terminal.json').read_bytes()) == value
            assert env.phase == 'closed'
        finally:
            store.close()
    checks.append('delayed_stop_retains_original_deadline_and_only_remaining_grace_commits_metadata')

    with clocked() as (clock, env):
        store = r.Store(parent, 'expired-grace')
        try:
            clock[0] = env.started + 7231
            stop(lambda: env.finalize_invalid(store, {'status': 'protocol_invalid'}),
                 'metadata_finalization_30_second_deadline')
            assert env.scientific_stop_elapsed == 7200 and env.phase == 'closed'
            assert not store.finalized and list(store.path.iterdir()) == []
        finally:
            store.close()
    checks.append('already_expired_grace_writes_nothing_and_cleans_up_signal')

    with clocked() as (clock, env):
        store = r.Store(parent, 'post-rename-error')
        store.write('prefix.json', {'saved': True})
        prefix = (store.path/'prefix.json').read_bytes()
        original_fsync = os.fsync
        seen = []
        def fsync(fd):
            if fd == store.fd and store.finalized:
                seen.append('after_committed_rename')
                raise OSError('synthetic_parent_directory_fsync')
            return original_fsync(fd)
        try:
            with patch.object(os, 'fsync', fsync):
                try:
                    env.finalize_invalid(store, {'status': 'protocol_invalid'})
                except OSError as exc:
                    assert str(exc) == 'synthetic_parent_directory_fsync'
                else:
                    raise AssertionError('expected directory fsync failure')
            assert seen == ['after_committed_rename'] and store.finalized and env.phase == 'closed'
            assert (store.path/'prefix.json').read_bytes() == prefix
            assert set(p.name for p in store.path.iterdir()) == {'prefix.json', 'completion'}
            terminal = (store.path/'completion/terminal.json').read_bytes()
            with clocked() as (_, retry):
                try:
                    retry.finalize_invalid(store, {'status': 'protocol_invalid', 'reason': 'contradictory'})
                except ValueError:
                    pass
                else:
                    raise AssertionError('second committed terminal accepted')
            assert (store.path/'completion/terminal.json').read_bytes() == terminal
        finally:
            store.close()
    checks.append('post_rename_fsync_error_preserves_one_completion_and_saved_prefix')

for cls in (KeyboardInterrupt, SystemExit):
    with clocked() as (clock, env):
        original = cls('explicit-stop')
        def interrupt():
            clock[0] = env.started + 7201
            raise original
        try:
            env.call(interrupt)
        except BaseException as exc:
            assert exc is original
        else:
            raise AssertionError('explicit interrupt swallowed')
        assert env.stop_reason == 'registered_7200_second_deadline' and env.scientific_stop_elapsed == 7200
    checks.append(cls.__name__ + '_preserved_while_post_call_deadline_is_latched')

with clocked() as (clock, env):
    clock[0] += 10
    def overdue():
        clock[0] += 121
        return 'must_not_return'
    stop(lambda: env.measure_phase('inference_smoke', overdue), 'registered_120_second_smoke_deadline')
    assert env.scientific_stop_elapsed == 130
    assert env.phase_measurements == [{'name': 'inference_smoke', 'started_seconds': 10.,
        'finished_seconds': 131., 'seconds': 121., 'error_type': 'RuntimeStop'}]
    assert env.phase == 'stopped' and env._smoke_deadline is None
    touched = []
    stop(lambda: env.call(lambda: touched.append(True)), 'registered_120_second_smoke_deadline')
    assert not touched
checks.append('smoke_timeout_retains_actual_cost_and_latches_stop_before_any_further_guarded_work')

for path, sha in ((ROOT/'scripts/research_score_split_run.py', SOURCE_SHA),
                  (ROOT/'tests/research-score-split/test_run_unit.py', TEST_SHA)):
    assert hashlib.sha256(path.read_bytes()).hexdigest() == sha
report = {'status': 'accepted_scoped_runtime_temporal_and_atomic_behavior', 'checks': checks,
    'source_sha256': SOURCE_SHA, 'test_sha256': TEST_SHA,
    'seconds_including_imports': time.monotonic() - START,
    'peak_rss_mib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2,
    'historical_fit_calls': 0, 'historical_score_calls': 0, 'historical_admission_calls': 0, 'bootstrap_calls': 0,
    'limits': ['Explicit synthetic clocks and a35millisecond real signal exercise stop paths, not historical7200second feasibility.',
        'Python-delivered signals and peak-RSS sampling require a separate future external hard watchdog for native-code delays.',
        'No full controller, production source admission or model/inference invocation. Post-rename fsync failure is uncertain durability, not a successful run.']}
(OUT/'root-temporal.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
