"""Short owned synthetic processes only; retain every process evidence directory."""
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'scripts'))
import research_score_split_watchdog as unit

EVIDENCE = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02f-watchdog-unit')
PYTHON = '/opt/anaconda3/bin/python3.12'
PHASE_HEADER = "import sys,time;sys.path.insert(0," + repr(str(REPO / 'scripts')) + ");from research_score_split_watchdog import transition_phase;p=sys.argv[sys.argv.index('--watchdog-phase-file')+1];"


class WatchdogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        cls.parent = EVIDENCE / ('children-' + str(time.time_ns()))
        cls.parent.mkdir()
        cls.sequence = 0
        print('Retained synthetic watchdog evidence:', cls.parent, flush=True)

    def run_child(self, code, *, limits=(2., 256., 1., .01), phase=False, smoke=.1):
        type(self).sequence += 1
        identity = 'synthetic-' + str(self.sequence)
        report = unit._supervise([PYTHON, '-I', '-c', code], cwd=REPO,
            output_parent=self.parent, identity=identity, limits=limits,
            phase_status=phase, _smoke_seconds=smoke)
        folder = self.parent / identity
        self.assertEqual(json.loads((folder / 'process-report.json').read_bytes()), report)
        for name, pointer in report['artifacts'].items():
            raw = (folder / name).read_bytes()
            self.assertEqual(pointer, {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)})
            self.assertEqual(stat.S_IMODE((folder / name).stat().st_mode), 0o600)
        self.assertFalse(report['scientific_terminal_verified'])
        self.assertFalse(report['historical_invocation_authorized'])
        self.assertFalse(report['automatic_restart'])
        self.assertEqual(report['worker_grace_seconds'], 0)
        self.assertEqual(signal.getitimer(signal.ITIMER_REAL), (0., 0.))
        return report, folder

    def assert_reaped(self, report):
        self.assertIsNotNone(report['exit_code'])
        with self.assertRaises(ChildProcessError): os.waitpid(report['pid'], os.WNOHANG)

    def test_normal_exit_retains_real_peak_and_exact_output_bytes(self):
        report, folder = self.run_child("import sys,time;print('stdout');print('stderr',file=sys.stderr);time.sleep(.06)")
        self.assertEqual(report['status'], 'completed_process')
        self.assertEqual(report['exit_code'], 0)
        self.assertEqual(report['kill_requests'], [])
        self.assertGreater(report['sampled_worker_peak_rss_mib'], 0)
        self.assertGreater(report['waited_worker_peak_rss_mib'], 0)
        self.assertEqual((folder / 'stdout.log').read_bytes(), b'stdout\n')
        self.assertEqual((folder / 'stderr.log').read_bytes(), b'stderr\n')
        self.assert_reaped(report)

    def test_failed_and_signaled_child_are_distinct_from_completed_process(self):
        for code, expected in (("raise SystemExit(7)", 7),
                               ("import os,signal;os.kill(os.getpid(),signal.SIGTERM)", -signal.SIGTERM)):
            with self.subTest(expected=expected):
                report, _ = self.run_child(code)
                self.assertEqual(report['status'], 'failed_process')
                self.assertEqual(report['exit_code'], expected)
                self.assert_reaped(report)

    def test_native_signal_suppression_is_killed_without_worker_grace(self):
        code = "import hashlib,signal;signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGALRM,signal.SIG_IGN);hashlib.pbkdf2_hmac('sha256',b'x',b'y',1000000000)"
        report, _ = self.run_child(code, limits=(.22, 256., .5, .01))
        self.assertEqual(report['stop_reason'], 'scientific_wall_deadline')
        self.assertEqual(report['exit_code'], -signal.SIGKILL)
        self.assertAlmostEqual(report['scientific_stop_elapsed_seconds'], .22)
        self.assertLess(report['kill_requests'][0]['elapsed_seconds'], .5)
        self.assertLess(report['elapsed_seconds'], .7)
        self.assert_reaped(report)

    def test_real_worker_rss_limit_and_current_group_sum_are_measured(self):
        code = "import time;x=bytearray(80*1024**2);time.sleep(3)"
        report, _ = self.run_child(code, limits=(2., 48., .5, .01))
        self.assertEqual(report['stop_reason'], 'sampled_group_rss_limit')
        self.assertGreater(report['sampled_group_peak_rss_mib'], 48.)
        self.assertEqual(report['exit_code'], -signal.SIGKILL)
        self.assert_reaped(report)

    def test_group_rss_includes_owned_descendant_and_kill_stays_in_group(self):
        payload = "import time;x=bytearray(32*1024**2);time.sleep(3)"
        code = "import subprocess,time;x=bytearray(32*1024**2);subprocess.Popen([" + repr(PYTHON) + ",' -I'.strip(),'-c'," + repr(payload) + "]);time.sleep(3)"
        report, folder = self.run_child(code, limits=(2., 65., .5, .01))
        self.assertEqual(report['stop_reason'], 'sampled_group_rss_limit')
        samples = [json.loads(line) for line in (folder / 'observations.jsonl').read_bytes().splitlines()]
        self.assertTrue(any(len(row['members']) >= 2 for row in samples))
        self.assertTrue(all(member['pgid'] == report['pid'] for row in samples for member in row['members']))
        self.assertEqual(report['kill_requests'][0]['pgid'], report['pid'])
        self.assert_reaped(report)

    def test_peak_violation_at_exit_cannot_be_promoted_by_low_final_rss(self):
        # Real short-lived allocation; waited high-water remains authoritative
        # even if the live sampler misses the allocation between observations.
        code = "x=bytearray(80*1024**2);del x"
        report, _ = self.run_child(code, limits=(2., 48., .5, .1))
        self.assertIn(report['stop_reason'], ('sampled_group_rss_limit', 'waited_worker_peak_rss_limit'))
        self.assertGreater(report['waited_worker_peak_rss_mib'], 48.)
        self.assertNotEqual(report['status'], 'completed_process')

    def test_missing_malformed_and_failed_observations_fail_closed(self):
        real = unit._observe
        for kind in ('missing', 'exception', 'malformed'):
            def observe(pgid, timeout):
                if kind == 'missing': return []
                if kind == 'exception': raise unit.ObservationFailure('synthetic observer failure')
                with patch.object(unit.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, 'foreign fields\n', '')):
                    return real(pgid, timeout)
            with self.subTest(kind=kind), patch.object(unit, '_observe', side_effect=observe):
                report, _ = self.run_child('import time;time.sleep(3)')
            self.assertEqual(report['status'], 'observation_or_setup_failure')
            self.assertTrue(report['observation_errors'])
            self.assertEqual(report['exit_code'], -signal.SIGKILL)
            self.assert_reaped(report)

    def test_delayed_observer_cannot_extend_absolute_scientific_deadline(self):
        def delayed(_pgid, _timeout): time.sleep(.5)
        with patch.object(unit, '_observe', side_effect=delayed):
            report, _ = self.run_child('import time;time.sleep(3)', limits=(.15, 256., .5, .01))
        self.assertEqual(report['stop_reason'], 'scientific_wall_deadline')
        self.assertLess(report['kill_requests'][0]['elapsed_seconds'], .4)
        self.assertAlmostEqual(report['parent_metadata_deadline_elapsed_seconds'], .65)

    def test_keyboard_interrupt_and_system_exit_cleanup_and_reraise(self):
        for exception in (KeyboardInterrupt, SystemExit):
            before = set(self.parent.iterdir())
            with self.subTest(exception=exception), patch.object(unit, '_observe', side_effect=exception('preserved')):
                with self.assertRaisesRegex(exception, 'preserved'):
                    self.run_child('import time;time.sleep(3)')
            folder = (set(self.parent.iterdir()) - before).pop()
            report = json.loads((folder / 'process-report.json').read_bytes())
            self.assertEqual(report['status'], 'interrupted_parent')
            self.assertEqual(report['exit_code'], -signal.SIGKILL)
            self.assert_reaped(report)
            self.assertEqual(signal.getitimer(signal.ITIMER_REAL), (0., 0.))

    def test_existing_identity_is_refused_without_mutation_or_child(self):
        path = self.parent / 'already-present'; path.mkdir(); (path / 'sentinel').write_bytes(b'unchanged')
        with patch.object(unit.subprocess, 'Popen', side_effect=AssertionError('must not spawn')):
            with self.assertRaises(FileExistsError):
                unit.supervise([PYTHON, '-I', '-c', 'pass'], cwd=REPO, output_parent=self.parent, identity=path.name)
        self.assertEqual(list(path.iterdir()), [path / 'sentinel'])
        self.assertEqual((path / 'sentinel').read_bytes(), b'unchanged')

    def test_parent_deadline_includes_setup_before_spawn(self):
        real_mkdir = Path.mkdir
        def slow_mkdir(path, *args, **kwargs):
            time.sleep(.2)
            return real_mkdir(path, *args, **kwargs)
        with patch.object(Path, 'mkdir', slow_mkdir), patch.object(unit.subprocess, 'Popen', side_effect=AssertionError('late spawn')):
            report = unit._supervise([PYTHON, '-I', '-c', 'pass'], cwd=REPO, output_parent=self.parent,
                identity='setup-expired', limits=(.08, 256., .5, .01))
        self.assertEqual(report['status'], 'externally_stopped_process')
        self.assertIsNone(report['pid'])
        self.assertEqual(report['kill_requests'], [])

    def test_parent_finalization_timeout_preserves_prefix_without_report(self):
        real_fsync = unit.os.fsync
        def slow_fsync(fd):
            time.sleep(.2)
            return real_fsync(fd)
        before = set(self.parent.iterdir())
        prior = signal.getsignal(signal.SIGALRM)
        with patch.object(unit.os, 'fsync', side_effect=slow_fsync):
            with self.assertRaisesRegex(unit._Halt, 'parent_metadata_deadline'):
                self.run_child('pass', limits=(2., 256., .08, .01))
        folder = (set(self.parent.iterdir()) - before).pop()
        self.assertTrue((folder / 'stdout.log').exists())
        self.assertFalse((folder / 'process-report.json').exists())
        self.assertEqual(signal.getsignal(signal.SIGALRM), prior)

    def test_full_public_phase_handshake_and_fixed_production_limits(self):
        identity = 'public-fixed-handshake'
        report = unit.supervise([PYTHON, '-I', '-c', PHASE_HEADER + "transition_phase(p,'smoke');time.sleep(.03);transition_phase(p,'science')"],
                               cwd=REPO, output_parent=self.parent, identity=identity)
        self.assertEqual(report['status'], 'completed_process')
        self.assertEqual(report['limits'], {'scientific_seconds': 7200., 'rss_mib': 4096.,
            'parent_metadata_seconds': 30., 'rss_sample_interval_seconds': .05, 'complete_smoke_seconds': 120.})
        self.assertEqual(report['phase_progression'][0]['phase'], 'starting')
        self.assertEqual(report['phase_progression'][-1]['phase'], 'science')
        self.assertTrue(all('owner' not in row for row in report['phase_progression']))
        self.assert_reaped(report)

    def test_external_smoke_deadline_kills_native_signal_suppression(self):
        code = PHASE_HEADER + "transition_phase(p,'smoke');import hashlib,signal;signal.signal(signal.SIGALRM,signal.SIG_IGN);hashlib.pbkdf2_hmac('sha256',b'x',b'y',1000000000)"
        report, _ = self.run_child(code, phase=True, smoke=.12)
        self.assertEqual(report['stop_reason'], 'complete_smoke_deadline')
        self.assertEqual(report['exit_code'], -signal.SIGKILL)
        self.assertLess(report['scientific_stop_elapsed_seconds'], .7)

    def test_missed_transient_smoke_is_validated_from_immutable_timestamps(self):
        code = PHASE_HEADER + "transition_phase(p,'smoke');time.sleep(.04);transition_phase(p,'science')"
        report, _ = self.run_child(code, phase=True, smoke=.1, limits=(2., 256., .5, .1))
        self.assertEqual(report['status'], 'completed_process')
        code = PHASE_HEADER + "transition_phase(p,'smoke');time.sleep(.06);transition_phase(p,'science')"
        report, _ = self.run_child(code, phase=True, smoke=.03, limits=(2., 256., .5, .1))
        self.assertIn(report['stop_reason'], ('complete_smoke_deadline', 'complete_smoke_elapsed_limit'))
        self.assertNotEqual(report['status'], 'completed_process')

    def test_phase_owner_future_clock_reset_missing_and_incomplete_rejected(self):
        for mutation in ('owner', 'future', 'reset', 'missing', 'incomplete'):
            if mutation == 'incomplete': code = PHASE_HEADER + 'pass'
            elif mutation == 'missing': code = PHASE_HEADER + "import os;os.unlink(p);time.sleep(.1)"
            elif mutation == 'reset': code = PHASE_HEADER + "transition_phase(p,'smoke');time.sleep(.06);import json;v=json.load(open(p));v['smoke_started']=time.monotonic();from research_score_split_watchdog import _write_phase;from pathlib import Path;_write_phase(Path(p),v);time.sleep(.1)"
            else:
                edit = "v['owner']='0'*32" if mutation == 'owner' else "v['phase']='smoke';v['smoke_started']=time.monotonic()+100"
                code = PHASE_HEADER + "import json;from pathlib import Path;from research_score_split_watchdog import _write_phase;v=json.load(open(p));" + edit + ";_write_phase(Path(p),v);time.sleep(.1)"
            with self.subTest(mutation=mutation):
                report, _ = self.run_child(code, phase=True, smoke=.5)
                self.assertNotEqual(report['status'], 'completed_process')
                self.assertTrue(report['stop_reason'])

    def test_worker_transition_helper_rejects_reentry_and_preserves_owner_and_mode(self):
        path = self.parent / 'standalone-phase.json'
        original = {'version': 'rf02f.owned-phase.v1', 'owner': '1'*32, 'phase': 'starting', 'smoke_started': None, 'smoke_finished': None}
        unit._write_phase(path, original, initial=True)
        with self.assertRaises(ValueError): unit.transition_phase(path, 'science')
        unit.transition_phase(path, 'smoke')
        smoke, _ = unit._read_phase(path)
        with self.assertRaises(ValueError): unit.transition_phase(path, 'smoke')
        unit.transition_phase(path, 'science')
        science, _ = unit._read_phase(path)
        self.assertEqual(science['owner'], original['owner'])
        self.assertEqual(science['smoke_started'], smoke['smoke_started'])
        with self.assertRaises(ValueError): unit.transition_phase(path, 'smoke')

    def test_wait_return_signal_cannot_target_a_released_process_group(self):
        original_wait = unit.os.wait4
        for delivery in ('direct', 'queued_alarm', 'queued_interrupt'):
            released = []
            def wait(pid, options):
                result = original_wait(pid, options)
                if result[0]:
                    released.append(pid)
                    if delivery == 'direct': signal.getsignal(signal.SIGALRM)(signal.SIGALRM, None)
                    else: os.kill(os.getpid(), signal.SIGINT if delivery == 'queued_interrupt' else signal.SIGALRM)
                return result
            before = set(self.parent.iterdir())
            with self.subTest(delivery=delivery), patch.object(unit.os, 'wait4', side_effect=wait), \
                    patch.object(unit.os, 'killpg', side_effect=AssertionError('released PGID must never be signaled')):
                if delivery == 'queued_interrupt':
                    with self.assertRaises(KeyboardInterrupt): self.run_child('pass')
                else:
                    report, _ = self.run_child('pass')
                    self.assertEqual(report['exit_code'], 0)
                    self.assertEqual(report['kill_requests'], [])
            self.assertEqual(len(released), 1)
            folder = (set(self.parent.iterdir()) - before).pop()
            report = json.loads((folder / 'process-report.json').read_bytes())
            self.assertEqual(report['pid'], released[0])
            self.assertEqual(report['exit_code'], 0)

    def test_lost_wait_ownership_is_reported_without_signaling_reused_id(self):
        original_wait = unit.os.wait4
        def lost_wait(pid, options):
            result = original_wait(pid, options)
            if result[0]: raise ChildProcessError('synthetic competing reap')
            return result
        with patch.object(unit.os, 'wait4', side_effect=lost_wait), \
                patch.object(unit.os, 'killpg', side_effect=AssertionError('ownership already lost')):
            report, _ = self.run_child('pass')
        self.assertTrue(report['process_ownership_lost'])
        self.assertIsNone(report['exit_code'])
        self.assertEqual(report['kill_requests'], [])
        self.assertEqual(report['status'], 'observation_or_setup_failure')

    def test_post_publication_fsync_failure_never_overwrites_existing_report(self):
        original = unit.os.fsync
        before = set(self.parent.iterdir())
        def failure(fd):
            if stat.S_ISDIR(os.fstat(fd).st_mode): raise OSError('post-publication durability uncertain')
            return original(fd)
        with patch.object(unit.os, 'fsync', side_effect=failure), self.assertRaisesRegex(OSError, 'durability uncertain'):
            self.run_child('pass')
        folder = (set(self.parent.iterdir()) - before).pop()
        raw = (folder / 'process-report.json').read_bytes()
        with self.assertRaises(FileExistsError):
            unit.supervise([PYTHON, '-I', '-c', 'pass'], cwd=REPO, output_parent=self.parent, identity=folder.name)
        self.assertEqual((folder / 'process-report.json').read_bytes(), raw)


if __name__ == '__main__':
    unittest.main(verbosity=2)
