"""Controller boundary tests only; no full fixture or historical invocation."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts'))
import research_score_split_controller as c
import research_score_split_run as r
import research_score_split_watchdog as w


@contextmanager
def synthetic_clock():
    clock = [1000.]
    phases = []
    def phase(path, name):
        phases.append((name, clock[0]))
        return {'smoke_started': phases[0][1]}
    with patch.object(r.time, 'monotonic', lambda: clock[0]), \
         patch.object(r, 'rss_mib', lambda: 100.), \
         patch.object(r.signal, 'getitimer', lambda _: (0., 0.)), \
         patch.object(r.signal, 'setitimer', lambda *args: None), \
         patch.object(r.signal, 'signal', lambda *args: None), \
         patch.object(w, 'transition_phase', phase, create=True):
        env = c.ControllerEnvelope()
        try:
            yield clock, env, phases
        finally:
            env.close()


class SmokeTimingTests(unittest.TestCase):
    def test_total_smoke_includes_loading_but_pilot_T_is_evaluator_only(self):
        with synthetic_clock() as (clock, env, phases):
            with env.complete_smoke(Path('/synthetic-owned-phase')):
                clock[0] += 70
                def evaluate():
                    clock[0] += 15
                    return 'synthetic_timing_value'
                self.assertEqual(env.measure_phase('inference_smoke', evaluate), 'synthetic_timing_value')
            self.assertEqual(env.phase_measurements, [{'name': 'inference_smoke',
                'started_seconds': 70., 'finished_seconds': 85., 'seconds': 15., 'error_type': None}])
            self.assertEqual(phases, [('smoke', 1000.), ('science', 1085.)])
            self.assertIsNone(env._whole_smoke_deadline)
            with self.assertRaisesRegex(ValueError, 'complete_smoke_reuse'):
                with env.complete_smoke(Path('/synthetic-owned-phase')):
                    self.fail('second smoke entered')

    def test_loading_plus_evaluation_overrun_cannot_reset_to_evaluator_120(self):
        with synthetic_clock() as (clock, env, phases):
            with self.assertRaisesRegex(r.RuntimeStop, 'complete_smoke_deadline'):
                with env.complete_smoke(Path('/synthetic-owned-phase')):
                    clock[0] += 110
                    def evaluate():
                        clock[0] += 11
                        return 'not_delivered'
                    env.measure_phase('inference_smoke', evaluate)
            self.assertEqual(env.scientific_stop_elapsed, 120.)
            self.assertEqual(env.phase_measurements[0]['seconds'], 11.)
            self.assertEqual(phases, [('smoke', 1000.)])
            self.assertEqual(env.phase, 'stopped')

    def test_total_deadline_wins_if_shorter_and_user_interrupts_survive(self):
        with synthetic_clock() as (clock, env, phases):
            clock[0] += 7190
            with self.assertRaisesRegex(r.RuntimeStop, '7200_second_deadline'):
                with env.complete_smoke(Path('/synthetic-owned-phase')):
                    clock[0] += 11
            self.assertEqual(env.scientific_stop_elapsed, 7200.)
            self.assertEqual(len(phases), 1)
        for kind in (KeyboardInterrupt, SystemExit):
            with self.subTest(kind=kind), synthetic_clock() as (clock, env, phases):
                original = kind('explicit_stop')
                try:
                    with env.complete_smoke(Path('/synthetic-owned-phase')):
                        clock[0] += 121
                        def interrupted():
                            raise original
                        env.call(interrupted)
                except BaseException as error:
                    self.assertIs(error, original)
                else:
                    self.fail('interrupt disappeared')
                self.assertEqual(phases, [('smoke', 1000.)])

    def test_focused_suite_stops_after_swallowed_unittest_baseexception(self):
        with synthetic_clock() as (clock, env, phases):
            ran = []
            class Cases(unittest.TestCase):
                def test_bad_cache_rejected_before_any_engine_changes(self):
                    ran.append('first')
                    clock[0] += 121
                    env.check()
                def test_prior_two_seasons_sorted_aggregation_and_future_isolation(self):
                    ran.append('forbidden_second')
                def test_native_failure_threshold_boundary_and_family_fallback(self):
                    ran.append('forbidden_third')
            module = SimpleNamespace(SplitBankTests=Cases, SplitSelectionTests=Cases)
            with patch.object(c, '_load_bound_module', return_value=module):
                with self.assertRaisesRegex(r.RuntimeStop, 'complete_smoke_deadline'):
                    with env.complete_smoke(Path('/synthetic-owned-phase')):
                        c._focused_smoke(env)
            self.assertEqual(ran, ['first'])
            self.assertEqual(len(phases), 1)

    def test_real_three_focused_cases_preserve_live_archive_seal(self):
        import research_score_split_archive as archive
        original = archive._SEAL
        with synthetic_clock() as (_, env, _):
            result = c._focused_smoke(env)
        self.assertEqual(result['tests'], 3)
        self.assertTrue(result['passed'])
        self.assertIs(archive._SEAL, original)


if __name__ == '__main__':
    unittest.main(verbosity=2)
