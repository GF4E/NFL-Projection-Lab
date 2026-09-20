"""Audit-only fixtures; these tests never load a projection fit."""
import copy
import unittest
from scripts.reference_metric_preflight import interval, score, power


class ReferenceMetricPreflightTests(unittest.TestCase):
    def test_correct_side_signs_and_actual_push_exclusion(self):
        rows = [dict(game_id='g', season=2025, week=1, home=24., away=20.,
                     actual_home=27., actual_away=20.)]
        schedule = {'g': {'spread_line': '3', 'total_line': '47'}}
        result = score(rows, schedule)
        self.assertEqual(result['spread']['pooled']['wins'], 1)
        self.assertEqual(result['total']['pushes'], ['g'])
        self.assertEqual(result['total']['pooled']['n'], 0)

    def test_projection_on_line_is_no_lean_not_a_loss(self):
        rows = [dict(game_id='g', season=2025, week=1, home=24., away=20.,
                     actual_home=27., actual_away=20.)]
        result = score(rows, {'g': {'spread_line': '4', 'total_line': ''}})
        self.assertEqual(result['spread']['no_lean'], ['g'])
        self.assertEqual(result['total']['missing_line'], ['g'])
        self.assertIsNone(result['spread']['pooled']['rate'])

    def test_full_precision_bucket_and_input_preservation(self):
        rows = [dict(game_id='g', season=2025, week=1, home=24.999, away=20.,
                     actual_home=27., actual_away=20.)]
        before = copy.deepcopy(rows)
        result = score(rows, {'g': {'spread_line': '0', 'total_line': '45'}})
        self.assertIn('4', result['spread']['buckets'])
        self.assertEqual(rows, before)

    def test_report_counts_reproduce_requested_wald_interval(self):
        result = interval(86, 152)
        self.assertEqual([round(x * 100, 1) for x in result['wald95_reproduction']], [48.7, 64.5])
        self.assertAlmostEqual(interval(1302, 2574)['rate'] * 100, 50.58275058275058)

    def test_wilson_is_bounded_for_small_samples(self):
        for wins in [0, 1]:
            lo, hi = interval(wins, 1)['wilson95']
            self.assertGreaterEqual(lo, -1e-15)
            self.assertLessEqual(hi, 1. + 1e-15)

    def test_power_distinguishes_directional_from_price_break_even(self):
        result = power(2574)
        directional = result['tests']['directional_50pct']
        priced = result['tests']['illustrative_minus110_break_even']
        self.assertLessEqual(directional['actual_size'], .05)
        self.assertGreater(directional['power_55pct'], .99)
        self.assertLess(priced['power_55pct'], .80)
        self.assertAlmostEqual(result['independent_game_standard_error_at_50pct'] * 100, .98552065998)


if __name__ == '__main__':
    unittest.main()
