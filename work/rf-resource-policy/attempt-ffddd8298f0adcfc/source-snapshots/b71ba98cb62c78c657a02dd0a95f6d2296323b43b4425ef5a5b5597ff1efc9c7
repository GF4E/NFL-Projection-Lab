"""RF-02F controller building blocks. Historical entry point is not implemented.

Reuse the accepted strict Store, but do not call its inherited object() method:
that older method supplies bytes to a write() override accepting JSON values.
"""
from contextlib import contextmanager
from dataclasses import dataclass
import copy
import hashlib
import json
import math
import signal
import time

from research_score_conditional_run import Store, strict, rss_mib
from research_score_split_models import SPLIT_VARIANTS
from research_score_split_budget import pilot_projection as registered_pilot_projection


def put_object(store, value):
    """Write or authenticate one canonical content object without rewriting it."""
    raw = strict(value)
    digest = hashlib.sha256(raw).hexdigest()
    name = 'object-' + digest + '.json'
    if name in store.index:
        existing = read_publication(store, store.pointer(name))
        if existing != raw:
            raise ValueError('existing_content_object_mismatch')
    else:
        store.write(name, value)
    return {'name': name, 'sha256': digest}


def read_publication(store, pointer):
    """Return exact bytes of an already indexed artifact in this owning Store.

    The archive boundary separately authenticates the publication envelope,
    expected run manifest, origin and complete forecast population.
    """
    if (type(pointer) is not dict or set(pointer) != {'name', 'sha256', 'bytes'}
            or type(pointer['name']) is not str
            or type(pointer['sha256']) is not str or type(pointer['bytes']) is not int
            or pointer != store.pointer(pointer['name'])):
        raise ValueError('publication_not_bound_to_owning_store')
    raw = store.read(pointer['name'])
    if len(raw) != pointer['bytes'] or hashlib.sha256(raw).hexdigest() != pointer['sha256']:
        raise ValueError('publication_bytes_changed')
    return raw


class RuntimeStop(BaseException):
    """A scientific stop must escape ordinary Exception-catching model code."""


def require(value, reason):
    if not value:
        raise ValueError(reason)


def finite(value, *, positive=False):
    return type(value) in (int, float) and math.isfinite(value) and (value > 0 if positive else value >= 0)


class RuntimeEnvelope:
    """Create before admission; one monotonic 7200-second/4096-MiB envelope.

    Python-delivered SIGALRM samples peak RSS and deadlines every 0.1 seconds;
    guarded boundaries check again. A long C call can delay Python delivery.
    This is not instantaneous kernel wall/RSS enforcement: a future controller
    requires an external hard process watchdog and retained exit evidence.
    """
    def __init__(self):
        self.started = time.monotonic()
        self._deadline = self.started + 7200.
        self._last = self.started
        self.phase = 'science'
        self.stop_reason = None
        self.scientific_stop_elapsed = None
        self.peak_rss_mib = 0.
        self.phase_measurements = []
        self._active_measurement = None
        self._smoke_deadline = None
        self._installed = False
        require(signal.getitimer(signal.ITIMER_REAL) == (0., 0.), 'existing_process_timer')
        self._previous_handler = signal.signal(signal.SIGALRM, self._watchdog)
        self._installed = True
        try:
            self.check()
            self._arm()
        except BaseException:
            self.close()
            raise

    def _arm(self):
        deadline = self._grace_deadline if self.phase == 'metadata_finalization' else min(
            self._deadline, self._smoke_deadline if self._smoke_deadline is not None else self._deadline)
        signal.setitimer(signal.ITIMER_REAL, max(.000001, min(.1, deadline - time.monotonic())), .1)

    def _watchdog(self, _signum, _frame):
        if self.phase == 'metadata_finalization':
            self._check_finalization()
        else:
            self.check()

    def _stop(self, reason, stopped_at=None):
        if self.stop_reason is None:
            self.stop_reason = reason
            self.scientific_stop_elapsed = (time.monotonic() if stopped_at is None else stopped_at) - self.started
        self.phase = 'stopped'
        if self._installed:
            signal.setitimer(signal.ITIMER_REAL, 0)
        raise RuntimeStop(self.stop_reason)

    def check(self):
        if self.phase != 'science':
            raise RuntimeStop(self.stop_reason or 'scientific_work_outside_live_envelope')
        now = time.monotonic()
        if not math.isfinite(now) or now < self._last:
            self._stop('invalid_monotonic_clock')
        self._last = now
        usage = rss_mib()
        if not finite(usage):
            self._stop('invalid_memory_measurement')
        self.peak_rss_mib = max(self.peak_rss_mib, usage)
        if now >= self._deadline:
            deadline = min(self._deadline, self._smoke_deadline or self._deadline)
            reason = 'registered_120_second_smoke_deadline' if deadline < self._deadline else 'registered_7200_second_deadline'
            self._stop(reason, deadline)
        if self._smoke_deadline is not None and now >= self._smoke_deadline:
            self._stop('registered_120_second_smoke_deadline', self._smoke_deadline)
        if usage > 4096:
            self._stop('registered_4096_MiB_limit')

    def elapsed(self):
        return time.monotonic() - self.started

    def _after(self, error):
        try:
            self.check()
        except RuntimeStop:
            # Still perform the check and latch the budget failure, but never
            # replace a user interrupt or explicit process exit with our stop.
            if not isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise

    def call(self, callback, *args, **kwargs):
        self.check()
        error = None
        try:
            return callback(*args, **kwargs)
        except BaseException as exc:
            error = exc
            raise
        finally:
            self._after(error)

    def measure_phase(self, name, callback, *args, **kwargs):
        """Retain actual admission or full smoke-evaluator cost, including failures."""
        self.check()
        require(name in ('admission', 'inference_smoke') and self._active_measurement is None
                and all(r['name'] != name for r in self.phase_measurements), 'phase_measurement_reuse_or_overlap')
        start = self.elapsed(); self._active_measurement = name; error = None
        if name == 'inference_smoke':
            self._smoke_deadline = self.started + start + 120.
        try:
            if name == 'inference_smoke':
                self._arm()
            return self.call(callback, *args, **kwargs)
        except BaseException as exc:
            error = exc
            raise
        finally:
            finish = self.elapsed()
            self.phase_measurements.append({'name': name, 'started_seconds': start,
                'finished_seconds': finish, 'seconds': finish - start,
                'error_type': None if error is None else type(error).__name__})
            self._active_measurement = None
            self._smoke_deadline = None
            if self.phase == 'science':
                self._arm()

    def _check_finalization(self):
        if self.phase != 'metadata_finalization' or time.monotonic() >= self._grace_deadline:
            raise RuntimeStop('metadata_finalization_30_second_deadline')

    def finalize_invalid(self, store, terminal):
        """Only Store terminal metadata is executable inside the one 30-second grace."""
        require(self._installed and self.phase in ('science', 'stopped'), 'finalization_reuse_or_closed_envelope')
        require(not store.finalized, 'completion_already_committed')
        require(type(terminal) is dict and terminal.get('status') == 'protocol_invalid', 'invalid_terminal_required')
        # Latch a deadline even if delivery was delayed before the caller
        # reached its invalid handler. This never refreshes an expired grace.
        if self.phase == 'science':
            try:
                self.check()
            except RuntimeStop:
                pass
        stopped = self.elapsed()
        if self.scientific_stop_elapsed is None:
            self.scientific_stop_elapsed = stopped
        self.stop_reason = self.stop_reason or 'scientific_work_stopped_for_invalid_finalization'
        self.phase = 'metadata_finalization'
        self._grace_deadline = self.started + self.scientific_stop_elapsed + 30.
        # A prior scientific RSS violation remains an invalid result. Grace
        # only permits bounded metadata closure, never a new scientific call.
        try:
            self._check_finalization()
            self._arm()
            value = copy.deepcopy(terminal)
            value.update(scientific_stop_elapsed_seconds=self.scientific_stop_elapsed,
                         invalid_finalization_only_cap_seconds=30,
                         peak_rss_mib=max(self.peak_rss_mib, rss_mib()), automatic_restart=False)
            self._check_finalization()
            store.finish(value, self._check_finalization)
            self._check_finalization()
            return value
        finally:
            # Store sets finalized immediately after its atomic rename. An
            # exception here must never trigger a competing second terminal.
            self.close()

    def close(self):
        if self._installed:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, self._previous_handler)
            self._installed = False
        self.phase = 'closed'

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        self.close()
        return False


@dataclass(frozen=True)
class CallbackResult:
    value: object
    native_failure: str | None = None
    used_fallback: bool = False


def origin_plan(origins):
    """Copy exact admitted origin bodies and derive counts; no count-only plan.

    SourceContext admission and ancestry authentication remain the controller's
    responsibility. This boundary binds every supplied original body and ID.
    """
    require(type(origins) is list and len(origins) == 277, 'complete_original_origins_required')
    bodies = tuple(strict(o) for o in origins)
    copied = [json.loads(body) for body in bodies]
    expected = [(y, w) for y in range(2010, 2026) for w in range(1, (17 if y <= 2020 else 18) + 1)]
    require([(o['season'], o['week']) for o in copied] == expected, 'original_origin_order_mismatch')
    seen, by_year, last_history = set(), {}, set()
    for o in copied:
        require(type(o['season']) is int and type(o['week']) is int, 'invalid_original_origin_type')
        ids = o['targetGameIds']; history = o['windows']['12']['eligibleInputIds']
        require(type(ids) is list and ids and all(type(g) is str and g for g in ids)
                and len(set(ids)) == len(ids) and not seen.intersection(ids), 'original_game_population_mismatch')
        require(type(history) is list and all(type(g) is str for g in history)
                and len(set(history)) == len(history) and set(history) <= seen
                and last_history <= set(history), 'original_history_closure_mismatch')
        seen.update(ids); last_history = set(history)
        by_year[o['season']] = by_year.get(o['season'], 0) + len(ids)
    require(list(by_year.values()) == [256] * 11 + [272, 271, 272, 272, 272]
            and len(seen) == 4175, 'original_year_population_mismatch')
    return bodies


class OriginAccounting:
    """Every measured fit/score call is directly nested in one complete origin."""
    def __init__(self, envelope, origins):
        envelope.check()
        self.envelope = envelope
        self._plan = origin_plan(origins)
        self._origins = []
        self._active_origin = None
        self._active_callback = None

    @contextmanager
    def origin(self, original):
        self.envelope.check()
        require(self._active_origin is None and len(self._origins) < len(self._plan)
                and strict(original) == self._plan[len(self._origins)], 'nonchronological_or_nested_origin')
        start = self.envelope.elapsed()
        record = {'origin_sha256': hashlib.sha256(strict(original)).hexdigest(),
                  'season': original['season'], 'week': original['week'],
                  'game_ids': list(original['targetGameIds']),
                  'history_count': len(original['windows']['12']['eligibleInputIds']),
                  'started_seconds': start, 'callbacks': []}
        self._active_origin = record; error = None
        try:
            yield self
        except BaseException as exc:
            error = exc
            raise
        finally:
            finish = self.envelope.elapsed()
            record.update(finished_seconds=finish, seconds=finish - start,
                          complete=error is None, error_type=None if error is None else type(error).__name__)
            self._origins.append(record); self._active_origin = None
            try:
                self.envelope._after(error)
            except RuntimeStop as exc:
                record.update(complete=False, error_type=type(exc).__name__, budget_stop=str(exc))
                raise

    def callback(self, kind, callback, *, game_id, setting, variant, stage, operation,
                 double_grid=None, diagnostics=None):
        self.envelope.check()
        require(self._active_origin is not None and self._active_callback is None, 'callback_outside_origin_or_nested')
        require(kind in ('fit', 'score') and variant in SPLIT_VARIANTS and stage in ('inner', 'outer')
                and game_id in self._active_origin['game_ids']
                and (setting is None or type(setting) is int and 0 <= setting < 27), 'invalid_callback_membership')
        require((kind == 'fit' and operation in ('fit', 'recovery') and double_grid is diagnostics is None)
                or (kind == 'score' and operation == 'score' and type(double_grid) is bool and type(diagnostics) is bool),
                'invalid_callback_operation')
        if kind == 'score' and stage == 'outer':
            require(double_grid is True and diagnostics is True, 'incomplete_outer_score_timing')
        row = {'kind': kind, 'operation': operation, 'game_id': game_id, 'setting': setting,
               'variant': variant, 'stage': stage, 'double_grid': double_grid, 'diagnostics': diagnostics,
               'started_seconds': self.envelope.elapsed(), 'native_failure': None, 'used_fallback': None}
        self._active_callback = row; error = None
        try:
            result = callback()
            require(type(result) is CallbackResult and type(result.used_fallback) is bool
                    and (result.native_failure is None or type(result.native_failure) is str and result.native_failure)
                    and result.used_fallback == (result.native_failure is not None), 'invalid_callback_native_outcome')
            row.update(native_failure=result.native_failure, used_fallback=result.used_fallback)
            return result.value
        except BaseException as exc:
            error = exc
            raise
        finally:
            finish = self.envelope.elapsed()
            row.update(finished_seconds=finish, seconds=finish - row['started_seconds'],
                       error_type=None if error is None else type(error).__name__,
                       error_reason=None if error is None else str(error))
            self._active_origin['callbacks'].append(row); self._active_callback = None
            try:
                self.envelope._after(error)
            except RuntimeStop as exc:
                row['budget_stop'] = str(exc)
                raise

    def snapshot(self):
        require(self._active_origin is None and self._active_callback is None, 'incomplete_active_accounting')
        return copy.deepcopy({'origins': self._origins, 'phase_measurements': self.envelope.phase_measurements,
                              'elapsed_seconds': self.envelope.elapsed(), 'peak_rss_mib': max(self.envelope.peak_rss_mib, rss_mib())})


def pilot_projection(original_origins, ledger, remaining_origins):
    """Pure audit of raw measured intervals and the exact complete remaining suffix."""
    plan = origin_plan(original_origins)
    require(type(ledger) is dict and set(ledger) == {'origins', 'phase_measurements', 'elapsed_seconds', 'peak_rss_mib'},
            'invalid_accounting_ledger')
    records = ledger['origins']; pilot_indices = [i for i, body in enumerate(plan)
                                                if (json.loads(body)['season'], json.loads(body)['week']) in ((2013, 1), (2013, 2))]
    require(type(records) is list and len(records) == pilot_indices[-1] + 1, 'pilot_requires_complete_retained_prefix')
    require(type(remaining_origins) is list and tuple(strict(o) for o in remaining_origins) == plan[len(records):],
            'remaining_original_origin_membership')
    require(finite(ledger['elapsed_seconds']) and finite(ledger['peak_rss_mib']), 'invalid_runtime_measurement')
    last = 0.; pilot = []; all_callbacks = []
    for i, (record, body) in enumerate(zip(records, plan)):
        original = json.loads(body)
        require(record['origin_sha256'] == hashlib.sha256(body).hexdigest()
                and (record['season'], record['week']) == (original['season'], original['week'])
                and record['game_ids'] == original['targetGameIds']
                and record['history_count'] == len(original['windows']['12']['eligibleInputIds'])
                and record['complete'] is True and record['error_type'] is None, 'origin_accounting_binding')
        start, finish, duration = record['started_seconds'], record['finished_seconds'], record['seconds']
        require(all(finite(v) for v in (start, finish, duration)) and start >= last
                and finish - start == duration and finish <= ledger['elapsed_seconds'], 'invalid_origin_duration')
        last = finish; end = start; calls = {'fit': [], 'score': []}
        for call in record['callbacks']:
            require(call['kind'] in calls and call['game_id'] in record['game_ids']
                    and call['variant'] in SPLIT_VARIANTS and call['stage'] in ('inner', 'outer')
                    and (call['setting'] is None or type(call['setting']) is int and 0 <= call['setting'] < 27), 'invalid_measured_callback')
            a, b, t = call['started_seconds'], call['finished_seconds'], call['seconds']
            require(all(finite(v) for v in (a, b)) and finite(t, positive=True)
                    and a >= end and b <= finish and b - a == t,
                    'callback_overlap_or_invalid_duration')
            require(call['error_type'] is None or type(call['error_type']) is str, 'invalid_callback_failure')
            require('budget_stop' not in call and (call['native_failure'] is None
                    or type(call['native_failure']) is str and call['native_failure']), 'invalid_native_failure_or_stopped_callback')
            require(call['error_type'] is not None or (type(call['used_fallback']) is bool
                    and call['used_fallback'] == (call['native_failure'] is not None)), 'invalid_measured_native_outcome')
            if call['kind'] == 'fit':
                require(call['operation'] in ('fit', 'recovery') and call['double_grid'] is call['diagnostics'] is None,
                        'invalid_measured_fit')
            else:
                require(call['operation'] == 'score' and type(call['double_grid']) is bool
                        and type(call['diagnostics']) is bool, 'invalid_measured_score')
                if call['stage'] == 'outer':
                    require(call['double_grid'] is True and call['diagnostics'] is True, 'incomplete_measured_outer_score')
            calls[call['kind']].append({'seconds': t,
                'native_success': call['error_type'] is None and call['native_failure'] is None and call['used_fallback'] is False,
                'full': call['variant'] == 'full' if call['kind'] == 'fit' else call['double_grid'] and call['diagnostics'],
                'off_diagonal': call['setting'] is not None and call['setting'] >= 9,
                'outer': call['stage'] == 'outer'})
            end = b
        total = math.fsum(c['seconds'] for rows in calls.values() for c in rows)
        require(duration >= total, 'negative_origin_remainder')
        if i in pilot_indices:
            require(record['history_count'] > 0, 'missing_pilot_history')
            pilot.append({'season': record['season'], 'week': record['week'], 'seconds': duration,
                          'games': len(record['game_ids']), 'history_games': record['history_count'],
                          'fit_calls': calls['fit'], 'score_calls': calls['score']})
            all_callbacks.extend(record['callbacks'])
    require(sum(p['games'] for p in pilot) == 32, 'retained_pilot_game_population')
    anchors = {'offdiagonal_full_fit': [], 'new_full_outer_score': []}
    for i, call in enumerate(all_callbacks):
        native = call['error_type'] is None and call['native_failure'] is None and call['used_fallback'] is False and call['seconds'] > 0
        if native and call['kind'] == 'fit' and call['operation'] == 'fit' and call['variant'] == 'full' and call['setting'] is not None and call['setting'] >= 9:
            anchors['offdiagonal_full_fit'].append(i)
        if native and call['kind'] == 'score' and call['stage'] == 'outer' and call['double_grid'] and call['diagnostics']:
            anchors['new_full_outer_score'].append(i)
    require(all(anchors.values()), 'missing_successful_native_pilot_anchors')
    phases = ledger['phase_measurements']
    require(type(phases) is list and len(phases) == 2 and {p['name'] for p in phases} == {'admission', 'inference_smoke'},
            'missing_measured_admission_or_inference')
    costs = {}; phase_end = 0.
    for phase in phases:
        a, b, t = phase['started_seconds'], phase['finished_seconds'], phase['seconds']
        require(all(finite(v) for v in (a, b, t)) and a >= phase_end and b - a == t and phase['error_type'] is None
                and b <= records[0]['started_seconds'], 'invalid_or_overlapping_phase_cost')
        costs[phase['name']] = t; phase_end = b
    require(0 < costs['inference_smoke'] < 120, 'invalid_public_evaluator_cost')
    remaining = [{'season': o['season'], 'week': o['week'], 'games': len(o['targetGameIds']),
                  'history_games': len(o['windows']['12']['eligibleInputIds'])} for o in remaining_origins]
    registered = registered_pilot_projection(pilot, remaining, ledger['elapsed_seconds'],
                                            costs['inference_smoke'], costs['admission'])
    return {**registered, 'passed': registered['within_time_screen'] and ledger['peak_rss_mib'] <= 4096,
            'remaining_origins': len(remaining_origins),
            'remaining_games': sum(len(o['targetGameIds']) for o in remaining_origins),
            'pilot': pilot,
            'callback_counts': {k: sum(c['kind'] == k for c in all_callbacks) for k in ('fit', 'score')},
            'callback_totals': {k: math.fsum(c['seconds'] for c in all_callbacks if c['kind'] == k) for k in ('fit', 'score')},
            'failed_callback_count': sum(c['error_type'] is not None for c in all_callbacks), 'required_anchor_indices': anchors,
            'admission_seconds': costs['admission'], 'public_evaluator_seconds': costs['inference_smoke'],
            'elapsed_seconds': ledger['elapsed_seconds'], 'peak_rss_mib': ledger['peak_rss_mib'],
            'original_origins_sha256': hashlib.sha256(strict(original_origins)).hexdigest(),
            'accounting_sha256': hashlib.sha256(strict(ledger)).hexdigest(), 'automatic_restart': False}
