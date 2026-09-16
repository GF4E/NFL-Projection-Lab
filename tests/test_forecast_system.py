import ast
import copy
from pathlib import Path
import unittest
import numpy as np
from engine.forecast_system.postprocess import fit, distribution, empirical_crps
from engine.forecast_system.verification import verify, skill, reliability


def fixture(year):
    return [dict(row_id=f'{year}:{i}', season=year, trained_through_season=year-1,
                 core_median=float(x), actual=float(2+1.5*x))
            for i,x in enumerate(np.linspace(10, 40, 40))]


class ForecastSystemTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifact = fit(2016, fixture)

    def test_compressed_synthetic_forecasts_recover_slope(self):
        self.assertGreater(self.artifact['b'], 1)
        self.assertAlmostEqual(self.artifact['b'], 1.5, places=3)
        self.assertAlmostEqual(float(np.median(distribution(self.artifact, 24))), 38, places=3)

    def test_only_prior_three_seasons_are_requested(self):
        requested = []
        def loader(y):
            requested.append(y)
            if y >= 2016:
                raise AssertionError('Current season read')
            return fixture(y)
        self.assertEqual(fit(2016, loader), self.artifact)
        self.assertEqual(requested, [2013, 2014, 2015])

    def test_training_order_changes_nothing(self):
        shuffled = fit(2016, lambda y: fixture(y)[::-1])
        self.assertEqual(shuffled, self.artifact)
        np.testing.assert_array_equal(distribution(shuffled, 28), distribution(self.artifact, 28))

    def test_unrelated_fields_cannot_enter_fit(self):
        contaminated = fit(2016, lambda y: [dict(r, odds=100000, price=-999, line=999) for r in fixture(y)])
        self.assertEqual(contaminated, self.artifact)

    def test_core_fit_is_row_order_invariant(self):
        from engine.projection_v3.model import fit as core_fit, predict
        rows=[dict(row_id=str(i),actual_points=float(i+20),features={'baseline':20.,'elo':float(i),'elo_difference':float(i*2)}) for i in range(12)]
        a=core_fit(rows,['elo'],10)
        b=core_fit(rows[::-1],['elo'],10)
        self.assertEqual(a,b)
        self.assertEqual([predict(a,r['features']) for r in rows],[predict(b,r['features']) for r in rows])

    def test_missing_history_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'Missing OOF'):
            fit(2016, lambda y: [])

    def test_in_sample_core_forecast_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Nonchronological'):
            fit(2016, lambda y: [dict(r, trained_through_season=y) for r in fixture(y)])

    def test_artifact_tampering_rejected(self):
        artifact = copy.deepcopy(self.artifact)
        artifact['b'] = 0
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            distribution(artifact, 24)

    def test_crps_and_interval_by_hand(self):
        self.assertEqual(empirical_crps([0, 2], 1), .5)
        result = verify([0, 2], 3)
        self.assertEqual(result['50']['interval_score'], 7)
        self.assertEqual(result['pit'], 1)

    def test_skill_and_reliability_by_hand(self):
        self.assertEqual(skill([1, 1], [0, 2], [2, 0]), .75)
        self.assertIsNone(skill([1], [0], [0]))
        r = reliability([.25, .75, 1], [0, 1, 1])
        self.assertAlmostEqual(r['brier'], 1/24)
        self.assertEqual(r['bins'][9]['count'], 1)

    def test_separation_import_boundary(self):
        allowed = {'hashlib', 'json', 'math', 'numpy', 'scipy', 'postprocess', 'datetime', 'collections', 'engine', 'state_space', 'calendar', 'zoneinfo'}
        for path in Path('engine/forecast_system').glob('*.py'):
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for name in node.names:
                        self.assertIn(name.name.split('.')[0], allowed)
                elif isinstance(node, ast.ImportFrom):
                    self.assertIn(node.module.split('.')[0], allowed)
                    if node.module.startswith('engine.'):
                        self.assertIn(node.module, {'engine.elo', 'engine.projection.model'})
            self.assertNotIn('open(', path.read_text())


if __name__ == '__main__':
    unittest.main()
