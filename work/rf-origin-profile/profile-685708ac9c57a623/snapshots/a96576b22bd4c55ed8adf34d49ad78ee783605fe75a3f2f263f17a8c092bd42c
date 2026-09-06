"""Actual strict Store compatibility for RF-02F content and publication reads."""
import json
import copy
from contextlib import contextmanager, ExitStack
import hashlib
import os
from pathlib import Path
import signal
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from research_score_split_run import Store, put_object, read_publication
import research_score_split_run as unit
import research_score_conditional_run as storage
from research_score_split_budget import pilot_projection as registered_projection


class StoreBoundaryTests(unittest.TestCase):
    def test_real_store_object_dedup_and_exact_signed_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory).resolve(), 'synthetic-object')
            try:
                value = {'theta': np.array([0., -0.]), 'bound': np.float64(.125)}
                first = put_object(store, value)
                before = dict(store.index)
                second = put_object(store, value)
                self.assertEqual(first, second)
                self.assertEqual(store.index, before)
                raw = read_publication(store, store.pointer(first['name']))
                self.assertIn(b'-0.0', raw)
                self.assertTrue(np.signbit(json.loads(raw)['theta'][1]))
                self.assertEqual(json.loads(raw)['bound'], .125)
                changed = put_object(store, {'theta': [0., 0.], 'bound': .125})
                self.assertNotEqual(changed['name'], first['name'])
                self.assertEqual(len(store.index), 2)
            finally:
                store.close()

    def test_unindexed_foreign_changed_and_truthy_proofs_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory).resolve(), 'synthetic-publisher')
            foreign = Store(Path(directory).resolve(), 'synthetic-foreign')
            try:
                store.write('forecast.json', {'origin': [2013, 1]})
                foreign.write('foreign.json', {'origin': [2013, 1]})
                pointer = store.pointer('forecast.json')
                for bad in (True, {'published': True}, {**pointer, 'sha256': '0' * 64},
                            {**pointer, 'bytes': pointer['bytes'] + 1}, foreign.pointer('foreign.json')):
                    with self.subTest(bad=bad), self.assertRaises((ValueError, KeyError)):
                        read_publication(store, bad)
                (store.path / 'forecast.json').write_bytes(b'{}')
                with self.assertRaisesRegex(ValueError, 'publication_bytes_changed'):
                    read_publication(store, pointer)
            finally:
                store.close(); foreign.close()

    def test_nonfinite_content_never_creates_an_object(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory).resolve(), 'synthetic-finite')
            try:
                with self.assertRaises((ValueError, TypeError)):
                    put_object(store, {'value': np.float64('nan')})
                self.assertEqual(store.index, {})
            finally:
                store.close()


class Clock:
    def __init__(self): self.now = 100.
    def __call__(self): return self.now
    def advance(self, seconds): self.now += seconds


@contextmanager
def fake_runtime():
    clock = Clock()
    with ExitStack() as stack:
        stack.enter_context(patch.object(unit.time, 'monotonic', clock))
        stack.enter_context(patch.object(unit, 'rss_mib', return_value=80.))
        stack.enter_context(patch.object(unit.signal, 'getitimer', return_value=(0., 0.)))
        stack.enter_context(patch.object(unit.signal, 'setitimer'))
        stack.enter_context(patch.object(unit.signal, 'signal'))
        runtime = unit.RuntimeEnvelope()
        try: yield runtime, clock
        finally: runtime.close()


def original_plan():
    origins, seen = [], []
    for season in range(2010, 2026):
        weeks = 17 if season <= 2020 else 18
        count = 256 if season <= 2020 else 271 if season == 2022 else 272
        base, remainder = divmod(count - 32, weeks - 2)
        sizes = [16, 16] + [base + (i < remainder) for i in range(weeks - 2)]
        for week, size in enumerate(sizes, 1):
            games = [f'{season}-{week}-{i}' for i in range(size)]
            origins.append({'season': season, 'week': week, 'targetGameIds': games,
                            'originAt': f'{season}-{week:02d}-synthetic',
                            'windows': {'12': {'eligibleInputIds': list(seen)},
                                        '24': {'synthetic': 'also-bound'}}})
            seen.extend(games)
    return origins


def measured_pilot(origins):
    with fake_runtime() as (runtime, clock):
        runtime.measure_phase('admission', lambda: clock.advance(2.))
        runtime.measure_phase('inference_smoke', lambda: clock.advance(3.))
        accounting = unit.OriginAccounting(runtime, origins)
        for original in origins[:53]:
            with accounting.origin(original):
                if original['season'] == 2013:
                    game = original['targetGameIds'][0]
                    def attempt(kind, duration, *, operation=None, variant='full', failure=False, fallback=False):
                        def work():
                            clock.advance(duration)
                            if failure: raise ValueError('synthetic_fit_failure')
                            return unit.CallbackResult('value', 'native_failure' if fallback else None, fallback)
                        return accounting.callback(kind, work, game_id=game, setting=9,
                            variant=variant, stage='outer', operation=operation or kind,
                            **({'double_grid': True, 'diagnostics': True} if kind == 'score' else {}))
                    attempt('fit', .001)
                    with unittest.TestCase().assertRaisesRegex(ValueError, 'synthetic_fit_failure'):
                        attempt('fit', .008, failure=True)
                    attempt('fit', .004, operation='recovery', fallback=True)
                    # Complete scoring of another variant is a full scorer call.
                    attempt('score', .002, variant='no_defense')
                clock.advance(.01)  # Persistence, mass and other origin work.
        return accounting.snapshot()


class RuntimeTests(unittest.TestCase):
    def test_fixed_total_clock_and_no_six_hundred_second_admission_limit(self):
        with fake_runtime() as (runtime, clock):
            self.assertEqual(runtime._deadline - runtime.started, 7200.)
            runtime.measure_phase('admission', lambda: clock.advance(601.))
            self.assertEqual(runtime.phase_measurements[0]['seconds'], 601.)
            clock.now = runtime.started + 7199.999
            runtime.check()
            clock.now = runtime.started + 7200.
            with self.assertRaisesRegex(unit.RuntimeStop, '7200'): runtime.check()
            self.assertEqual(runtime.scientific_stop_elapsed, 7200.)
            with self.assertRaises(unit.RuntimeStop): runtime.call(lambda: self.fail('science after stop'))

    def test_smoke_watchdog_and_post_callback_failures_preserve_duration(self):
        with fake_runtime() as (runtime, clock):
            def late_smoke():
                clock.advance(122.)
                runtime._watchdog(None, None)
            with self.assertRaisesRegex(unit.RuntimeStop, '120_second_smoke'):
                runtime.measure_phase('inference_smoke', late_smoke)
            self.assertEqual(runtime.scientific_stop_elapsed, 120.)
            self.assertEqual(runtime.phase_measurements[0]['seconds'], 122.)
            self.assertEqual(runtime.phase_measurements[0]['error_type'], 'RuntimeStop')
        with fake_runtime() as (runtime, clock):
            def failed_smoke():
                clock.advance(121.)
                raise ValueError('ordinary_scientific_catch')
            with self.assertRaisesRegex(unit.RuntimeStop, '120_second_smoke'):
                runtime.measure_phase('inference_smoke', failed_smoke)

    def test_peak_memory_check_and_post_callback_interrupts(self):
        with fake_runtime() as (runtime, _):
            with patch.object(unit, 'rss_mib', return_value=4096.): runtime.check()
            with patch.object(unit, 'rss_mib', return_value=4096.001):
                with self.assertRaisesRegex(unit.RuntimeStop, '4096'): runtime.check()
        for exception in (KeyboardInterrupt, SystemExit):
            with self.subTest(exception=exception), fake_runtime() as (runtime, clock):
                def interrupted():
                    clock.advance(7201.)
                    raise exception('preserved')
                with self.assertRaisesRegex(exception, 'preserved'): runtime.call(interrupted)
                self.assertEqual(runtime.stop_reason, 'registered_7200_second_deadline')

    def test_actual_signal_escapes_nested_exception_handler_and_restores_handler(self):
        prior = signal.getsignal(signal.SIGALRM)
        with unit.RuntimeEnvelope() as runtime:
            runtime._deadline = time.monotonic() + .025
            runtime._arm()
            with self.assertRaisesRegex(unit.RuntimeStop, '7200'):
                try:
                    time.sleep(.15)
                except Exception:
                    self.fail('ordinary Exception swallowed deadline')
        self.assertEqual(signal.getsignal(signal.SIGALRM), prior)
        self.assertEqual(signal.getitimer(signal.ITIMER_REAL), (0., 0.))

    def test_existing_timer_is_preserved(self):
        signal.setitimer(signal.ITIMER_REAL, 10.)
        try:
            with self.assertRaisesRegex(ValueError, 'existing_process_timer'): unit.RuntimeEnvelope()
            self.assertGreater(signal.getitimer(signal.ITIMER_REAL)[0], 9.)
        finally: signal.setitimer(signal.ITIMER_REAL, 0)

    def test_delayed_deadline_never_refreshes_metadata_grace(self):
        for delay in (29., 30.):
            with self.subTest(delay=delay), tempfile.TemporaryDirectory() as folder, fake_runtime() as (runtime, clock):
                store = Store(Path(folder).resolve(), 'synthetic-grace')
                try:
                    clock.now = runtime.started + 7200. + delay
                    if delay == 29.:
                        result = runtime.finalize_invalid(store, {'status': 'protocol_invalid'})
                        self.assertEqual(result['scientific_stop_elapsed_seconds'], 7200.)
                        self.assertEqual(runtime._grace_deadline, runtime.started + 7230.)
                        self.assertTrue(store.finalized)
                    else:
                        with self.assertRaisesRegex(unit.RuntimeStop, 'finalization_30'):
                            runtime.finalize_invalid(store, {'status': 'protocol_invalid'})
                        self.assertFalse(store.finalized)
                        self.assertFalse((store.path / 'completion').exists())
                finally: store.close()

    def test_grace_is_metadata_only_and_user_interrupt_is_never_swallowed(self):
        for exception in (KeyboardInterrupt, SystemExit, unit.RuntimeStop):
            with self.subTest(exception=exception), tempfile.TemporaryDirectory() as folder, fake_runtime() as (runtime, _):
                store = Store(Path(folder).resolve(), 'synthetic-closed-science')
                calls = []
                def attempted_finish(*_args):
                    if exception is unit.RuntimeStop:
                        runtime.call(lambda: calls.append('science'))
                    else: raise exception('preserved')
                try:
                    with patch.object(store, 'finish', side_effect=attempted_finish):
                        with self.assertRaises(exception): runtime.finalize_invalid(store, {'status': 'protocol_invalid'})
                    self.assertEqual(calls, [])
                    self.assertEqual(runtime.phase, 'closed')
                    self.assertFalse(store.finalized)
                finally: store.close()


class AccountingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.origins = original_plan()
        cls.ledger = measured_pilot(cls.origins)

    def project(self, ledger=None, remaining=None):
        return unit.pilot_projection(self.origins, self.ledger if ledger is None else ledger,
                                     self.origins[53:] if remaining is None else remaining)

    def test_measured_calls_match_frozen_formula_with_failed_calls_and_correct_score_anchor(self):
        result = self.project()
        remaining = [{'season': o['season'], 'week': o['week'], 'games': len(o['targetGameIds']),
                      'history_games': len(o['windows']['12']['eligibleInputIds'])} for o in self.origins[53:]]
        expected = registered_projection(result['pilot'], remaining, self.ledger['elapsed_seconds'], 3., 2.)
        for key, value in expected.items(): self.assertEqual(result[key], value)
        self.assertEqual(result['remaining_origins'], 224)
        self.assertEqual(result['remaining_games'], 3375)
        self.assertEqual(result['failed_callback_count'], 2)
        self.assertEqual(result['callback_counts'], {'fit': 6, 'score': 2})
        self.assertAlmostEqual(result['maximum_fit_seconds'], .008)
        self.assertAlmostEqual(result['maximum_score_seconds'], .002)
        self.assertTrue(result['passed'])
        for pilot in result['pilot']:
            self.assertEqual(pilot['games'], 16)
            self.assertAlmostEqual(pilot['seconds'] - sum(c['seconds'] for c in pilot['fit_calls'] + pilot['score_calls']), .01)
        self.assertEqual(result['original_origins_sha256'], hashlib.sha256(unit.strict(self.origins)).hexdigest())

    def test_remaining_membership_and_complete_origin_body_are_required(self):
        variants = [self.origins[54:], self.origins[53:-1],
                    [self.origins[54], self.origins[53], *self.origins[55:]],
                    [self.origins[53], *self.origins[53:-1]]]
        changed = copy.deepcopy(self.origins[53:])
        changed[0]['windows']['24']['synthetic'] = 'changed'
        variants.append(changed)
        for rows in variants:
            with self.subTest(first=rows[0]['week'], length=len(rows)), self.assertRaises(ValueError): self.project(remaining=rows)
        for mutate in ('game', 'history', 'order', 'year'):
            originals = copy.deepcopy(self.origins)
            if mutate == 'game': originals[-1]['targetGameIds'][0] = originals[0]['targetGameIds'][0]
            if mutate == 'history': originals[0]['windows']['12']['eligibleInputIds'] = [originals[0]['targetGameIds'][0]]
            if mutate == 'order': originals[0], originals[1] = originals[1], originals[0]
            if mutate == 'year': originals[-1]['targetGameIds'].pop()
            with self.subTest(mutate=mutate), self.assertRaises(ValueError): unit.origin_plan(originals)

    def test_intervals_native_anchors_and_smoke_measurements_fail_closed(self):
        for mutation in ('overlap', 'duration', 'origin', 'recovery_anchor', 'diagonal_anchor',
                         'failed_anchor', 'incomplete_score', 'missing_smoke', 'smoke_timeout', 'zero_call'):
            ledger = copy.deepcopy(self.ledger)
            if mutation == 'missing_smoke': ledger['phase_measurements'].pop()
            elif mutation == 'smoke_timeout':
                ledger['phase_measurements'][1]['seconds'] = 121.
                ledger['phase_measurements'][1]['finished_seconds'] = 123.
            elif mutation == 'origin': ledger['origins'][-1]['history_count'] -= 1
            else:
                for record in ledger['origins'][-2:]:
                    calls = record['callbacks']
                    if mutation == 'overlap':
                        calls[1]['started_seconds'] = calls[0]['started_seconds']
                        calls[1]['finished_seconds'] = calls[1]['started_seconds'] + calls[1]['seconds']
                    elif mutation == 'duration': record['seconds'] += 1.
                    elif mutation == 'recovery_anchor': calls[0]['operation'] = 'recovery'
                    elif mutation == 'diagonal_anchor': calls[0]['setting'] = 0
                    elif mutation == 'failed_anchor': calls[0]['native_failure'] = 'failed'; calls[0]['used_fallback'] = True
                    elif mutation == 'incomplete_score': calls[-1]['diagnostics'] = False
                    elif mutation == 'zero_call': calls[0]['seconds'] = 0.; calls[0]['finished_seconds'] = calls[0]['started_seconds']
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): self.project(ledger=ledger)

    def test_each_pilot_requires_sixteen_games_not_just_total_thirty_two(self):
        originals = copy.deepcopy(self.origins)
        moved = originals[51]['targetGameIds'].pop()
        originals[52]['targetGameIds'].insert(0, moved)
        originals[52]['windows']['12']['eligibleInputIds'].remove(moved)
        ledger = copy.deepcopy(self.ledger)
        for index in (51, 52):
            ledger['origins'][index]['origin_sha256'] = hashlib.sha256(unit.strict(originals[index])).hexdigest()
            ledger['origins'][index]['game_ids'] = originals[index]['targetGameIds']
            ledger['origins'][index]['history_count'] = len(originals[index]['windows']['12']['eligibleInputIds'])
        with self.assertRaisesRegex(ValueError, 'invalid_retained_pilot'):
            unit.pilot_projection(originals, ledger, originals[53:])

    def test_original_and_snapshot_mutations_do_not_change_bound_accounting(self):
        originals = copy.deepcopy(self.origins)
        with fake_runtime() as (runtime, clock):
            accounting = unit.OriginAccounting(runtime, originals)
            originals[0]['windows']['24']['synthetic'] = 'mutated'
            with self.assertRaises(ValueError):
                with accounting.origin(originals[0]): self.fail('mutated source accepted')
            with accounting.origin(self.origins[0]): clock.advance(.01)
            snapshot = accounting.snapshot(); snapshot['origins'][0]['game_ids'][0] = 'foreign'
            self.assertNotEqual(accounting.snapshot()['origins'][0]['game_ids'][0], 'foreign')

    def test_nested_calls_incomplete_flags_and_false_cache_timing_are_rejected(self):
        with fake_runtime() as (runtime, clock):
            accounting = unit.OriginAccounting(runtime, self.origins)
            game = self.origins[0]['targetGameIds'][0]
            kwargs = dict(game_id=game, setting=9, variant='full', stage='outer', operation='fit')
            with accounting.origin(self.origins[0]):
                def nested():
                    clock.advance(.01)
                    return accounting.callback('fit', lambda: self.fail('nested invoked'), **kwargs)
                with self.assertRaisesRegex(ValueError, 'nested'): accounting.callback('fit', nested, **kwargs)
                with self.assertRaises(ValueError):
                    accounting.callback('fit', lambda: self.fail('cache invoked'), **{**kwargs, 'operation': 'cached'})
                with self.assertRaises(ValueError):
                    accounting.callback('score', lambda: self.fail('incomplete score invoked'),
                        **{**kwargs, 'operation': 'score'}, double_grid=False, diagnostics=True)
                with self.assertRaises(ValueError):
                    accounting.callback('fit', lambda: unit.CallbackResult('x', 'failure', False), **kwargs)
                clock.advance(.01)
            rows = accounting.snapshot()['origins'][0]['callbacks']
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]['error_type'], 'ValueError')
            self.assertAlmostEqual(rows[0]['seconds'], .01)

    def test_failed_callback_and_incomplete_origin_survive_budget_stop(self):
        for exception in (ValueError, KeyboardInterrupt, SystemExit):
            with self.subTest(exception=exception), fake_runtime() as (runtime, clock):
                accounting = unit.OriginAccounting(runtime, self.origins)
                expected = unit.RuntimeStop if exception is ValueError else exception
                def late():
                    clock.advance(7201.)
                    raise exception('original_failure')
                with self.assertRaises(expected):
                    with accounting.origin(self.origins[0]):
                        accounting.callback('fit', late, game_id=self.origins[0]['targetGameIds'][0],
                                            setting=9, variant='full', stage='inner', operation='fit')
                record = accounting.snapshot()['origins'][0]
                self.assertFalse(record['complete'])
                self.assertEqual(record['callbacks'][0]['error_type'], exception.__name__)
                self.assertEqual(record['callbacks'][0]['seconds'], 7201.)
                self.assertEqual(record['callbacks'][0]['error_reason'], 'original_failure')


class FinalizationTests(unittest.TestCase):
    def test_partial_artifact_is_accounted_in_invalid_completion(self):
        with tempfile.TemporaryDirectory() as folder, fake_runtime() as (runtime, _):
            store = Store(Path(folder).resolve(), 'synthetic-prefix')
            try:
                real_fsync = storage.os.fsync
                def fail_file(fd):
                    if fd != store.fd: raise OSError('synthetic file fsync failure')
                    return real_fsync(fd)
                with patch.object(storage.os, 'fsync', side_effect=fail_file), self.assertRaises(OSError):
                    store.write('attempted.json', {'retained': 'bytes'})
                retained = (store.path / 'attempted.json').read_bytes()
                self.assertNotIn('attempted.json', store.index)
                runtime.finalize_invalid(store, {'status': 'protocol_invalid'})
                index = json.loads((store.path / 'completion/artifact-index.json').read_bytes())
                self.assertIn('attempted.json', index['uncommitted_artifacts'])
                self.assertEqual(index['files']['attempted.json'], {'sha256': hashlib.sha256(retained).hexdigest(), 'bytes': len(retained)})
            finally: store.close()

    def test_timeout_before_rename_preserves_staging_without_committed_terminal(self):
        with tempfile.TemporaryDirectory() as folder, fake_runtime() as (runtime, clock):
            store = Store(Path(folder).resolve(), 'synthetic-staging')
            real_fsync = storage.os.fsync
            try:
                def late_fsync(fd):
                    result = real_fsync(fd)
                    clock.advance(31.)
                    return result
                with patch.object(storage.os, 'fsync', side_effect=late_fsync):
                    with self.assertRaisesRegex(unit.RuntimeStop, 'finalization_30'):
                        runtime.finalize_invalid(store, {'status': 'protocol_invalid'})
                self.assertFalse(store.finalized)
                self.assertFalse((store.path / 'completion').exists())
                self.assertTrue(store.uncommitted_staging)
                self.assertTrue((store.path / store.uncommitted_staging[0] / 'terminal.json').exists())
                with self.assertRaises(ValueError): runtime.finalize_invalid(store, {'status': 'protocol_invalid'})
            finally: store.close()

    def test_post_rename_fsync_failure_or_timeout_never_creates_second_completion(self):
        for failure in ('fsync_error', 'deadline'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder, fake_runtime() as (runtime, clock):
                store = Store(Path(folder).resolve(), 'synthetic-renamed')
                real_fsync = storage.os.fsync
                try:
                    def after_rename(fd):
                        if store.finalized and fd == store.fd:
                            if failure == 'fsync_error': raise OSError('uncertain directory durability')
                            clock.advance(31.)
                        return real_fsync(fd)
                    with patch.object(storage.os, 'fsync', side_effect=after_rename):
                        with self.assertRaises(OSError if failure == 'fsync_error' else unit.RuntimeStop):
                            runtime.finalize_invalid(store, {'status': 'protocol_invalid'})
                    self.assertTrue(store.finalized)
                    terminal = (store.path / 'completion/terminal.json').read_bytes()
                    with self.assertRaises(ValueError): runtime.finalize_invalid(store, {'status': 'protocol_invalid'})
                    self.assertEqual((store.path / 'completion/terminal.json').read_bytes(), terminal)
                    self.assertEqual([p.name for p in store.path.iterdir() if p.is_dir()], ['completion'])
                finally: store.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
