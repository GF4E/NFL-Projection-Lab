"""Controller boundary tests only; no full fixture or historical invocation."""
from contextlib import contextmanager
from pathlib import Path
import sys
import copy
import hashlib
import importlib.util
import tempfile
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
        return None
    with patch.object(r.time, 'monotonic', lambda: clock[0]), \
         patch.object(r, 'rss_mib', lambda: 100.), \
         patch.object(r.signal, 'getitimer', lambda _: (0., 0.)), \
         patch.object(r.signal, 'setitimer', lambda *args: None), \
         patch.object(r.signal, 'signal', lambda *args: None), \
         patch.object(w, 'transition_phase', phase), \
         patch.object(w, '_read_phase', lambda path: ({'phase': 'smoke', 'smoke_started': phases[0][1]}, b'')):
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
                        def interrupted():
                            clock[0] += 121
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




def archive_fixtures():
    spec = importlib.util.spec_from_file_location('controller_archive_fixtures', ROOT/'tests/research-score-split/test_archive_unit.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PublicationTests(unittest.TestCase):
    def setUp(self):
        import research_score_split_archive as archive
        from research_score_split_replay import SplitTrajectoryBank
        from research_score_conditional_run import Store
        t = archive_fixtures()
        self.source = t.TinyArchive()
        self.addCleanup(self.source.close)
        x = self.source
        self.context = archive.SourceContext(x.directory, t.encoded({'files': x.archive.index}),
            (x.directory/'manifest.json').read_bytes(), t.encoded(x.records), (t.encoded(x.origin),),
            t.CONFIG_RAW, (), t.encoded(x.mapper_pointers), (), t.encoded({}), archive._SEAL)
        self.view = archive.forecast_inputs(self.context, x.origin, lambda: None)
        self.bank = SplitTrajectoryBank(tuple(f'T{i:02}' for i in range(32)))
        # Establish each own original expectation before delivering its result.
        old = self.view['bank_prepared'][12]['history'][0].context
        for engine in self.bank.engines.values():
            engine.forecast_origin(old.season, old.week, [], [old])
        self.outputs = self.bank.advance(2011, 1, self.view['bank_prepared'], self.view['diagonal_outputs'])
        self.manifest = {'parent_manifest_sha256': c.PARENT_MANIFEST, 'parent_index_sha256': c.PARENT_INDEX,
            'bound_hashes': {'config': c.CONFIG_SHA}, 'code_hashes': {'synthetic': 'b'*64}}
        self.manifest_sha = hashlib.sha256(c.strict(self.manifest)).hexdigest()
        # Explicit publication-schema fixture. No claim these descriptors were
        # numerically assembled; law/scorer integration has separate real tests.
        pub = t.publication_fixture(x.origin, self.manifest_sha)
        self.assembly = {k: pub[k] for k in ('full_setting_forecasts', 'outer_selected_forecasts')}
        self.assembly['grading_plan'] = {'inner': [], 'outer': []}
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name), 'synthetic-publication')
        self.addCleanup(self.store.close)
        self.env = SimpleNamespace(check=lambda: None)

    def publish(self):
        return c.publish_origin(self.store, self.manifest, self.manifest_sha, self.view,
                                self.bank, self.outputs, self.assembly, self.env)

    def validate(self, pointer):
        return c.validate_publication_binding(self.store, self.manifest, self.manifest_sha,
                                             self.view, self.assembly, pointer, self.env)

    def test_real_store_state_ancestry_publication_then_actual_archive_grader(self):
        from functools import partial
        import research_score_split_archive as archive
        pointer = self.publish()
        self.assertEqual(list(self.store.index), ['state-2011-01.json', 'ancestry-2011-01.json',
                         'publication-binding-2011-01.json', 'forecasts-2011-01.json'])
        publication, binding = self.validate(pointer)
        state = self.store.read_bound(binding['state'])
        self.assertEqual(len(state['trajectory_state']), 297)
        self.assertEqual(sum('source_state' in row for row in state['trajectory_state']), 81)
        self.assertEqual(sum('own_state' in row for row in state['trajectory_state']), 216)
        self.assertNotIn('labels', publication)
        grade = archive.grade_inputs(self.context, self.view['origin'], pointer, self.env.check,
            read_publication=partial(c.read_publication, self.store), expected_manifest_sha256=self.manifest_sha)
        self.assertEqual(grade['labels'], {'z-target': [21, 17], 'a-target': [21, 17]})
        self.assertEqual(len(grade['diagonal_inner_rows']), 18)
        self.assertEqual(grade['grading_receipt'].publication_sha256, pointer['sha256'])
        with self.assertRaises(ValueError): self.publish()

    def test_incomplete_or_changed_borrowed_state_prevents_publication(self):
        for change in ('missing', 'changed'):
            original = copy.deepcopy(self.outputs)
            with self.subTest(change=change):
                if change == 'missing': self.outputs.pop(('E3', 26, 'full'))
                else: self.outputs['E3', 0, 'full']['league_mean'] += 1
                with self.assertRaisesRegex(ValueError, 'native_state|borrowed_native'):
                    self.publish()
                self.assertEqual(self.store.index, {})
            self.outputs = original

    def test_wrong_manifest_or_parent_rejected_before_writes(self):
        self.manifest['parent_index_sha256'] = 'e'*64
        with self.assertRaisesRegex(ValueError, 'manifest_bytes_changed'): self.publish()
        self.manifest_sha = hashlib.sha256(c.strict(self.manifest)).hexdigest()
        with self.assertRaisesRegex(ValueError, 'manifest_parent_or_config'): self.publish()
        self.assertEqual(self.store.index, {})

    def test_ancestry_failure_preserves_state_but_no_publication(self):
        with patch.object(c, 'validate_lineage', side_effect=ValueError('injected_ancestry_fault')):
            with self.assertRaisesRegex(ValueError, 'injected_ancestry_fault'): self.publish()
        self.assertEqual(list(self.store.index), ['state-2011-01.json'])

    def test_write_failure_has_no_readable_complete_forecast(self):
        original = self.store.write
        def fail(name, value):
            if name.startswith('forecasts-'): raise OSError('injected_forecast_write_fault')
            return original(name, value)
        with patch.object(self.store, 'write', side_effect=fail):
            with self.assertRaisesRegex(OSError, 'injected_forecast_write_fault'): self.publish()
        self.assertEqual(len(self.store.index), 3)
        with self.assertRaises(ValueError): self.store.pointer('forecasts-2011-01.json')

    def test_saved_bytes_and_in_memory_assembly_cannot_change_before_grading(self):
        pointer = self.publish()
        self.assembly['full_setting_forecasts'][0]['native_failure'] = 'changed'
        with self.assertRaisesRegex(ValueError, 'saved_forecasts_differ'): self.validate(pointer)
        self.assembly['full_setting_forecasts'][0]['native_failure'] = None
        path = self.store.path / pointer['name']
        raw = path.read_bytes(); path.write_bytes(raw + b' ')
        with self.assertRaises(ValueError): self.validate(pointer)

    def test_pointer_and_plan_must_belong_to_exact_saved_publication(self):
        pointer = self.publish()
        bad = dict(pointer, bytes=True)
        with self.assertRaises(ValueError): self.validate(bad)
        self.assembly['grading_plan']['inner'].append({'invented': 'plan'})
        with self.assertRaisesRegex(ValueError, 'publication_binding_changed'): self.validate(pointer)


if __name__ == '__main__':
    unittest.main(verbosity=2)
