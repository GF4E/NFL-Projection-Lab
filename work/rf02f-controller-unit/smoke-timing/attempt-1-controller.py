"""RF-02F controller assembly, still under qualification; no historical CLI yet.

Accepted runtime, archive, model and inference modules remain unchanged.
The complete-smoke boundary below includes preparation while pilot T measures
only the unchanged public evaluator. No production admission runs on import.
"""
from contextlib import contextmanager
import hashlib
import importlib.util
import io
from pathlib import Path
import signal
import time
import unittest

from research_score_conditional_admission import bound, parse
from research_score_split_run import RuntimeEnvelope, RuntimeStop, require
from research_score_split_inference import evaluate


ROOT = Path(__file__).resolve().parents[1]
INFERENCE_ACCEPTANCE = '.planning/engine-os/research-first/RF-02F-INFERENCE-UNIT-ACCEPTANCE.v1.json'
INFERENCE_ACCEPTANCE_SHA = 'd56e355af3fff1cedb5fc3f2a30ae6ba1cd1f0616a817a801b46cbbb14c83db6'
CONFIG = 'config/research-team-score-split.v1.json'
CONFIG_SHA = '0fe90bbc966e8eb92e6d345b145fc297547b1f4b922d095a0eabbf5e97c60519'
QUALIFIER = 'tests/research-score-split/qualify_inference_unit.py'
QUALIFIER_SHA = 'bdc7016088a8e094e1c4c023e962b0be4935065d5f63df0c9c11e1bf6ef824d3'
BANK_TESTS = 'tests/research-score-split/test_bank_unit.py'
BANK_TESTS_SHA = '326837b37b50c1045b9ba830359a863b48db13c01c48d4b8a782d663184c8973'


class ControllerEnvelope(RuntimeEnvelope):
    """Add the entire120-second smoke cap without changing evaluator timing."""
    def __init__(self):
        self._whole_smoke_deadline = None
        self._whole_smoke_used = False
        super().__init__()

    def check(self):
        # Prefer the earliest actual deadline even if a long native call caused
        # delivery after both the whole smoke and evaluator-only clocks expired.
        if self.phase == 'science' and self._whole_smoke_deadline is not None:
            now = time.monotonic()
            if now >= self._whole_smoke_deadline and self._whole_smoke_deadline <= self._deadline:
                self._stop('registered_120_second_complete_smoke_deadline', self._whole_smoke_deadline)
        return super().check()

    def _arm(self):
        if self.phase != 'metadata_finalization' and self._whole_smoke_deadline is not None:
            deadline = min(self._deadline, self._whole_smoke_deadline,
                           self._smoke_deadline if self._smoke_deadline is not None else self._deadline)
            signal.setitimer(signal.ITIMER_REAL, max(.000001, min(.1, deadline - time.monotonic())), .1)
        else:
            super()._arm()

    @contextmanager
    def complete_smoke(self, phase_path):
        """One owned parent phase transition brackets all preparation and science.

        The external watchdog helper validates this file and retains both smoke
        timestamps. This is a production contract, not a truthy audit flag.
        """
        from research_score_split_watchdog import transition_phase
        self.check()
        require(not self._whole_smoke_used, 'complete_smoke_reuse_forbidden')
        self._whole_smoke_used = True
        phase = transition_phase(phase_path, 'smoke')
        self._whole_smoke_deadline = phase['smoke_started'] + 120.
        error = None
        try:
            self.check()
            self._arm()
            yield
            self.check()
            transition_phase(phase_path, 'science')
            self.check()
        except BaseException as exc:
            error = exc
            raise
        finally:
            # Failure preserves the external smoke marker; it cannot erase an
            # overrun or claim the parent may forget the shorter hard deadline.
            self._whole_smoke_deadline = None
            self._after(error)
            if self.phase == 'science':
                self._arm()


def _load_bound_module(relative, fingerprint, name):
    path = ROOT / relative
    bound(path, fingerprint)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _focused_smoke(envelope):
    """Run three unchanged boundary/selection checks without archive reloads."""
    module = _load_bound_module(BANK_TESTS, BANK_TESTS_SHA, 'rf02f_smoke_bank_tests')
    cases = (
        module.SplitBankTests('test_bad_cache_rejected_before_any_engine_changes'),
        module.SplitSelectionTests('test_prior_two_seasons_sorted_aggregation_and_future_isolation'),
        module.SplitSelectionTests('test_native_failure_threshold_boundary_and_family_fallback'),
    )
    log = io.StringIO()
    result = envelope.call(unittest.TextTestRunner(stream=log, verbosity=1, failfast=True).run, unittest.TestSuite(cases))
    require(result.testsRun == 3 and result.wasSuccessful(), 'focused_smoke_boundary_or_selection_failure')
    return {'tests': result.testsRun, 'passed': True, 'output': log.getvalue()}


def run_smoke(envelope, phase_path):
    """Reload the accepted real fixture and run the complete public evaluator.

    Invocation belongs only to the sole fully accepted historical controller.
    Tests may exercise its orchestration seams without asserting model evidence.
    """
    with envelope.complete_smoke(phase_path):
        start = time.monotonic()
        acceptance = parse(bound(ROOT / INFERENCE_ACCEPTANCE, INFERENCE_ACCEPTANCE_SHA))
        require(acceptance['status'] == 'accepted_full_synthetic_inference_integration_only',
                'full_synthetic_acceptance_required')
        config = parse(bound(ROOT / CONFIG, CONFIG_SHA))
        focused = _focused_smoke(envelope)
        qualifier = _load_bound_module(QUALIFIER, QUALIFIER_SHA, 'rf02f_retained_inference_fixture')
        pointer = acceptance['retainedSyntheticFixture']
        fixture_path = Path(pointer['path'])
        bound(fixture_path, pointer['sha256'], pointer['bytes'])
        load_started = time.monotonic()
        fixture, rows, validation = envelope.call(qualifier.load_fixture, fixture_path.parent,
            {'name': fixture_path.name, 'sha256': pointer['sha256'], 'bytes': pointer['bytes']}, envelope.check)
        load_seconds = time.monotonic() - load_started
        result = envelope.measure_phase('inference_smoke', evaluate, config,
                                        fixture['metadata'], rows, fixture['audit_checks'])
        require(result['status'] != 'protocol_invalid', 'real_public_smoke_invalid')
        evaluator_seconds = envelope.phase_measurements[-1]['seconds']
        evidence = {'status': 'passed_synthetic_capacity_only', 'fixture': pointer,
            'full_inference_acceptance_sha256': INFERENCE_ACCEPTANCE_SHA,
            'focused': focused, 'fixture_load_validation_seconds': load_seconds,
            'public_evaluator_seconds': evaluator_seconds,
            'complete_smoke_seconds': time.monotonic() - start,
            'fixture_counts': fixture['counts'], 'fixture_validation': validation,
            'synthetic_decision': result['status'], 'peak_rss_mib': envelope.peak_rss_mib,
            'historical_forecast_evidence': False}
        envelope.check()
        # Synthetic rows and heavy inference structures are not retained beside
        # the historical bank. Only compact capacity evidence survives.
        del rows, result, fixture
    return evidence
