"""Small synthetic exactness tests; expected values come from frozen code.

No historical archive, provider, bootstrap, or large fixture is used. Test
execution is owned by the separate bounded qualification harness.
"""
from dataclasses import fields, replace
import inspect
import json
import math
from pathlib import Path
import struct
import sys
import unittest
import warnings
from unittest.mock import patch

import numpy as np
from scipy import special
from scipy.stats import poisson

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import research_score_probability_compute as candidate
import research_score_compute_distribution as frozen_compute
from research_score_contract import encoded
from research_score_distribution import JointDistribution, NumericalFailure
from research_score_successor_distribution import JointBase


RATES = (1e-9, .01, .5, 1., 16., 22., 40., 100., 1000.)
TARGETS = ('home', 'away', 'margin', 'total')


class FloatSubclass(float):
    pass


class IntSubclass(int):
    pass


class ListSubclass(list):
    pass


class ArraySubclass(np.ndarray):
    pass


def captured(function, *args, **kwargs):
    """Do not coerce successful values before testing their type or bytes."""
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        try:
            return ('returned', function(*args, **kwargs))
        except Exception as error:
            return ('raised', type(error), str(error))


def metrics_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def array_state(value):
    return (value.dtype.str, value.shape, value.strides, value.tobytes(order='C'),
            value.flags.writeable)


class ExactTestCase(unittest.TestCase):
    def assert_numeric_exact(self, actual, expected):
        self.assertIs(type(actual), type(expected))
        if isinstance(expected, np.ndarray):
            self.assertEqual(actual.dtype, expected.dtype)
            self.assertEqual(actual.shape, expected.shape)
            self.assertEqual(actual.tobytes(order='C'), expected.tobytes(order='C'))
        elif isinstance(expected, np.generic):
            self.assertEqual(actual.dtype, expected.dtype)
            self.assertEqual(actual.tobytes(), expected.tobytes())
        elif isinstance(expected, float):
            self.assertEqual(struct.pack('>d', actual), struct.pack('>d', expected))
        else:
            self.assertEqual(actual, expected)

    def assert_outcome_exact(self, function, reference, *args, **kwargs):
        expected = captured(reference, *args, **kwargs)
        actual = captured(function, *args, **kwargs)
        self.assertEqual(actual[0], expected[0])
        if expected[0] == 'raised':
            self.assertEqual(actual[1:], expected[1:])
        else:
            self.assert_numeric_exact(actual[1], expected[1])
        return expected


class PoissonCdfTests(ExactTestCase):
    def test_scalar_boundaries_across_fixed_positive_rates(self):
        for rate in RATES:
            values = (-(2**53)-1, -(2**53), -100, -1, 0, 1, 16, 22, 1000, 2**53, 2**53+1,
                      -100., -1., -.5, -0., 0., .25, .9999999999999999, 1., 1.5,
                      16., 21.999999999999996, 22., 22.000000000000004,
                      40., 100., 1000., 1000.5, 1e6)
            for value in values:
                with self.subTest(rate=rate, value=value):
                    self.assert_outcome_exact(candidate.poisson_cdf, poisson.cdf, value, rate)

    def test_array_shapes_dtypes_empty_and_noncontiguous_inputs(self):
        values = np.array([-3., -.5, -0., 0., .5, 1., 16., 22., 40., 100., 1000., 1e6])
        integers = np.array([-(2**53), -2., -0., 0., 1., 16., 22., 1000., 2**53])
        cases = (np.array(1.5), values, values.reshape(3, 4), values[::2], values[::-1],
                 integers, integers[::2], integers[::-1],
                 np.array([-2, 0, 1, 16, 1000], dtype=np.int16),
                 np.array([-2., 0., .5, 16.], dtype=np.float32),
                 np.empty((0,), dtype=float), np.empty((2, 0), dtype=float))
        for rate in RATES:
            for value in cases:
                before = array_state(value)
                with self.subTest(rate=rate, shape=value.shape, dtype=value.dtype):
                    self.assert_outcome_exact(candidate.poisson_cdf, poisson.cdf, value, rate)
                    self.assertEqual(array_state(value), before)

    def test_nonfinite_values_and_unsupported_rate_types_preserve_oracle(self):
        rate_cases = (0., -1., math.nan, math.inf, -math.inf, complex(2., 0.),
                      complex(2., 1.), True, False, 1, np.float32(.5), np.float64(22.),
                      np.int64(16), [1., 22.], np.array([1., 22.]), np.array(22.),
                      np.array([[1.], [22.]]), np.array([1., 22.], dtype=object),
                      '22', None)
        for rate in rate_cases:
            for value in (1.5, np.array([0., 2.])):
                with self.subTest(rate=repr(rate), value=repr(value)):
                    self.assert_outcome_exact(candidate.poisson_cdf, poisson.cdf, value, rate)
        for value in (math.nan, math.inf, -math.inf,
                      np.array([-math.inf, -1., math.nan, 0., math.inf])):
            for rate in (.01, 22., 1000.):
                with self.subTest(value=repr(value), rate=rate):
                    self.assert_outcome_exact(candidate.poisson_cdf, poisson.cdf, value, rate)

    def test_unsupported_value_types_and_broadcast_failures_preserve_oracle(self):
        values = ([0., .5, 2.], [[0., 1.], [2., 3.]], (0., 1.), [],
                  np.array([0., 1.], dtype=object), np.array([0, 1], dtype=np.uint64),
                  np.array([1+0j, 2+1j]), complex(1., 0.), '1', None, {'value': 1},
                  10**400, -(10**400), True, False, IntSubclass(1), FloatSubclass(1.),
                  ListSubclass([0., 1.]), np.array([0., 1.]).view(ArraySubclass))
        for value in values:
            with self.subTest(value=repr(value)):
                self.assert_outcome_exact(candidate.poisson_cdf, poisson.cdf, value, 22.)
        self.assert_outcome_exact(candidate.poisson_cdf, poisson.cdf,
                                  np.ones((2, 3)), np.ones((4,)))

    def test_shared_scipy_implementation_and_inputs_are_not_mutated(self):
        method = poisson.cdf.__func__
        value = np.array([-.5, 0., 1., 20.]); rate = np.array([1., 2., 3., 4.])
        value.setflags(write=False); rate.setflags(write=False)
        before = array_state(value), array_state(rate)
        self.assert_outcome_exact(candidate.poisson_cdf, poisson.cdf, value, rate)
        self.assertIs(poisson.cdf.__func__, method)
        self.assertEqual((array_state(value), array_state(rate)), before)

    def test_unsupported_inputs_reach_the_original_generic_function(self):
        reference = poisson.cdf
        for value, rate in ((1., 22.), ([0., 1.], 22.), (np.array([.5, 1.]), 22.),
                            (1, 0.), (1, math.nan), (1, math.inf), (1, complex(2., 0.)),
                            (1, [1., 22.]), (1, np.array(22.)),
                            (10**400, 22.), (-(10**400), 22.), (True, 22.), (False, 22.),
                            (IntSubclass(1), 22.), (FloatSubclass(1.), 22.),
                            (ListSubclass([0., 1.]), 22.),
                            (np.array([0., 1.]).view(ArraySubclass), 22.),
                            (1, FloatSubclass(22.)), (1, IntSubclass(22)),
                            (1, ListSubclass([1., 22.])),
                            (1, np.array([1., 22.]).view(ArraySubclass))):
            expected = captured(reference, value, rate)
            with self.subTest(value=repr(value), rate=repr(rate)):
                with patch.object(candidate.poisson, 'cdf', wraps=reference) as fallback:
                    actual = captured(candidate.poisson_cdf, value, rate)
                    self.assertEqual(fallback.call_count, 1)
                self.assertEqual(actual[0], expected[0])
                if expected[0] == 'raised':
                    self.assertEqual(actual[1:], expected[1:])
                else:
                    self.assert_numeric_exact(actual[1], expected[1])

    def test_eligible_integer_inputs_use_fast_path_without_generic_dispatch(self):
        for value in (0, 22, np.array([-1., -0., 0., 1., 22., 100.])):
            for rate in (22., np.float64(22.)):
                expected = poisson.cdf(value, rate)
                with patch.object(candidate.poisson, 'cdf', side_effect=AssertionError('unexpected_generic_dispatch')):
                    actual = candidate.poisson_cdf(value, rate)
                self.assert_numeric_exact(actual, expected)

    def test_empty_and_below_support_arrays_never_evaluate_backend(self):
        for value in (np.array([], dtype=float), np.array([-1., -2., -(2**53)], dtype=float)):
            before = array_state(value)
            expected = poisson.cdf(value, 22.)
            with special.errstate(all='raise'):
                with patch.object(candidate, 'pdtr', side_effect=AssertionError('below_support_backend_call')):
                    actual = candidate.poisson_cdf(value, 22.)
            self.assert_numeric_exact(actual, expected)
            self.assertEqual(array_state(value), before)


class EncodingTests(unittest.TestCase):
    def assert_encoding_exact(self, value):
        expected = captured(encoded, value)
        actual = captured(candidate.encode_flat_floats, value)
        self.assertEqual(actual, expected)
        if actual[0] == 'returned':
            self.assertIs(type(actual[1]), bytes)

    def test_flat_float_canonical_bytes_and_large_fixed_list(self):
        values = [0., -0., 5e-324, -5e-324, sys.float_info.min, -sys.float_info.min,
                  sys.float_info.max, -sys.float_info.max, .1, -.1,
                  1e-7, 1e-6, 1e15, 1e16, 1e20, 1e21, math.pi,
                  float.fromhex('0x1.0000000000001p+0')]
        for value in ([], [0.], [-0.], values, [values[i % len(values)] for i in range(700)]):
            with self.subTest(length=len(value)):
                self.assert_encoding_exact(value)
        self.assertNotEqual(candidate.encode_flat_floats([0.]), candidate.encode_flat_floats([-0.]))

    def test_mixed_nested_and_nonlist_values_delegate_without_new_semantics(self):
        values = (None, True, False, 1, 1., -0., 'quotes " / newline\n and café',
                  (), (1., -0.), [1, 2., True, None, 'x'], [[1., -0.], []],
                  {'z': [-0., 1.], 'a': {'quoted': '"', 'unicode': 'λ'}},
                  [np.float64(.1)], [np.float32(.1)], [np.int64(3)],
                  np.array([0., 1.]), {1: 2, 'a': 3}, object())
        for value in values:
            with self.subTest(value=repr(value)):
                self.assert_encoding_exact(value)

    def test_nonfinite_scalar_flat_and_nested_failures_match(self):
        for number in (math.nan, math.inf, -math.inf):
            for value in (number, [number], [0., number, -0.], {'nested': [number]}):
                with self.subTest(value=repr(value)):
                    expected = captured(encoded, value)
                    self.assertEqual(expected[0], 'raised')
                    self.assert_encoding_exact(value)

    def test_encoding_does_not_mutate_or_alias_input(self):
        value = [0., -0., .1]
        before = encoded(value)
        result = candidate.encode_flat_floats(value)
        self.assertEqual(encoded(value), before)
        value[0] = 2.
        self.assertEqual(result, before)
        self.assertEqual(candidate.encode_flat_floats(value), encoded(value))

    def test_unsupported_encoding_inputs_reach_frozen_encoder(self):
        for value in ([1, 2.], [[1., 2.]], {'x': [0., -0.]}, [math.inf],
                      ListSubclass([0., -0., .1]), [FloatSubclass(.1)], [IntSubclass(1)],
                      np.array([0., 1.]).view(ArraySubclass)):
            expected = captured(encoded, value)
            with patch.object(candidate, 'encoded', wraps=encoded) as fallback:
                actual = captured(candidate.encode_flat_floats, value)
                self.assertEqual(fallback.call_count, 1)
            self.assertEqual(actual, expected)


class ProbabilityDistributionTests(ExactTestCase):
    @classmethod
    def setUpClass(cls):
        # Small deterministic synthetic training support; no historical values.
        mapper = JointBase.from_scores([[0, 0], [3, 7], [8, 4], [14, 20], [27, 16], [22, 28]],
                                       [1, 2, 1, 3, 1, 2])
        cls.laws = [mapper.fit((12., 15.)), mapper.fit((24., 11.))]

    def test_signature_and_only_cdf_computation_changes(self):
        self.assertEqual(inspect.signature(candidate.score_forecast),
                         inspect.signature(frozen_compute.score_forecast))
        self.assertTrue(issubclass(candidate.ProbabilityDistribution, frozen_compute.MemoizedDistribution))
        for name in ('grid', 'tail_bounds', 'moments', 'log_probability', 'quantile', '_marginal_atoms'):
            self.assertIs(getattr(candidate.ProbabilityDistribution, name),
                          getattr(frozen_compute.MemoizedDistribution, name), name)

    def test_fields_copy_types_bytes_and_source_isolation(self):
        original = replace(self.laws[0], theta=np.array([-0., 0.]))
        wrapped = candidate.ProbabilityDistribution(original)
        for field in fields(JointDistribution):
            left, right = getattr(original, field.name), getattr(wrapped, field.name)
            self.assert_numeric_exact(right, left)
            if isinstance(left, np.ndarray):
                self.assertFalse(np.shares_memory(left, right))
                self.assertFalse(right.flags.writeable)
        before = {name: array_state(getattr(original, name)) for name in ('atoms', 'alpha', 'rates', 'theta')}
        wrapped.cdf('home', 10.)
        self.assertEqual({name: array_state(getattr(original, name)) for name in before}, before)
        self.assertFalse(hasattr(original, '_cdf_cache'))

    def test_cdf_and_quantiles_match_for_correlated_and_independent_laws(self):
        for original in self.laws:
            for independent in (False, True):
                law = replace(original, independent=independent)
                actual, expected = candidate.ProbabilityDistribution(law), frozen_compute.MemoizedDistribution(law)
                for target in TARGETS:
                    for value in (-100., -1., -.01, -0., 0., .99, 1., 12., 21.9, 22., 50., 200.):
                        with self.subTest(independent=independent, target=target, value=value):
                            self.assert_outcome_exact(actual.cdf, expected.cdf, target, value)
                    for probability in (.025, .1, .25, .75, .9, .975):
                        with self.subTest(independent=independent, target=target, probability=probability):
                            self.assertEqual(captured(actual.quantile, target, probability),
                                             captured(expected.quantile, target, probability))

    def test_actual_primary_and_doubled_grids_match_probability_bytes_and_bounds(self):
        for original in self.laws:
            for independent in (False, True):
                law = replace(original, independent=independent)
                actual = candidate.ProbabilityDistribution(law)
                expected = frozen_compute.MemoizedDistribution(law)
                primary = expected.grid()
                requests = ({}, {'cells': np.asarray(primary.probability.shape) * 2,
                                 'maximum_cells': 1024})
                for request in requests:
                    with self.subTest(independent=independent, doubled=bool(request)):
                        reference_grid = primary if not request else expected.grid(**request)
                        candidate_grid = actual.grid(**request)
                        self.assertIs(type(candidate_grid), type(reference_grid))
                        self.assert_numeric_exact(candidate_grid.probability, reference_grid.probability)
                        self.assert_numeric_exact(candidate_grid.omitted_probability_bound,
                                                  reference_grid.omitted_probability_bound)
                        self.assert_numeric_exact(candidate_grid.score_error_bound,
                                                  reference_grid.score_error_bound)
                        self.assertFalse(np.shares_memory(candidate_grid.probability, reference_grid.probability))

    def test_cache_stays_instance_local_and_preserves_floor_boundaries(self):
        first = candidate.ProbabilityDistribution(self.laws[0])
        other = candidate.ProbabilityDistribution(self.laws[1])
        self.assertIsNot(first._cdf_cache, other._cdf_cache)
        answer = first.cdf('home', 7.)
        self.assert_numeric_exact(first.cdf('home', 7.999), answer)
        self.assertEqual(other._cdf_cache, {})
        oracle = frozen_compute.MemoizedDistribution(self.laws[1])
        self.assert_numeric_exact(other.cdf('home', 7.), oracle.cdf('home', 7.))

    def test_invalid_targets_values_and_quantile_failures_preserved(self):
        actual, expected = candidate.ProbabilityDistribution(self.laws[0]), frozen_compute.MemoizedDistribution(self.laws[0])
        for target, value in (('bogus', 0), ([], 0), ({}, 0), ('home', math.nan),
                              ('home', math.inf), ('home', -math.inf), ('home', '1')):
            with self.subTest(target=target, value=value):
                self.assert_outcome_exact(actual.cdf, expected.cdf, target, value)
        for probability in (0., 1., -.1, 1.1, math.nan):
            self.assertEqual(captured(actual.quantile, 'home', probability),
                             captured(expected.quantile, 'home', probability))
        ambiguous = JointDistribution(np.array([[0., 0.], [2., 2.]]), np.array([.5, .5]),
                                      0., np.array([1., 1.]), np.zeros(2), 0)
        left, right = candidate.ProbabilityDistribution(ambiguous), frozen_compute.MemoizedDistribution(ambiguous)
        oracle = captured(right.quantile, 'home', .5)
        self.assertEqual(oracle, ('raised', NumericalFailure, 'quantile_boundary_ambiguous'))
        self.assertEqual(captured(left.quantile, 'home', .5), oracle)

    def test_complete_scores_and_all_flag_combinations_have_exact_bytes(self):
        method = poisson.cdf.__func__
        for original in self.laws:
            for independent in (False, True):
                law = replace(original, independent=independent)
                before = {field.name: array_state(getattr(law, field.name))
                          for field in fields(law) if isinstance(getattr(law, field.name), np.ndarray)}
                for double_grid in (False, True):
                    for diagnostics in (False, True):
                        with self.subTest(independent=independent, double_grid=double_grid, diagnostics=diagnostics):
                            args = (law, [13, 17], 'synthetic-probability-compute')
                            expected = frozen_compute.score_forecast(*args, double_grid=double_grid, diagnostics=diagnostics)
                            with patch.object(JointBase, 'fit', side_effect=AssertionError('scorer_must_not_fit')):
                                actual = candidate.score_forecast(*args, double_grid=double_grid, diagnostics=diagnostics)
                            self.assertEqual(metrics_bytes(actual), metrics_bytes(expected))
                            self.assertEqual(set(actual), set(expected))
                self.assertEqual({name: array_state(getattr(law, name)) for name in before}, before)
        self.assertIs(poisson.cdf.__func__, method)

    def test_invalid_observations_and_grid_failure_keep_exact_exceptions(self):
        for observed in ([1], [-1, 0], [1.5, 3], [math.nan, 0], [math.inf, 0], [[1, 2]]):
            args = (self.laws[0], observed, 'synthetic-invalid-observation')
            expected = captured(frozen_compute.score_forecast, *args)
            self.assertEqual(expected, ('raised', NumericalFailure, 'invalid_target_pair'))
            self.assertEqual(captured(candidate.score_forecast, *args), expected)
        huge = JointDistribution(np.array([[0., 0.]]), np.array([0.]), 1.,
                                 np.array([1e6, 1e6]), np.zeros(2), 0)
        args = (huge, [1, 2], 'synthetic-grid-failure')
        expected = captured(frozen_compute.score_forecast, *args)
        self.assertEqual(expected, ('raised', NumericalFailure, 'grid_tail_budget_exceeded'))
        self.assertEqual(captured(candidate.score_forecast, *args), expected)


if __name__ == '__main__':
    unittest.main()
