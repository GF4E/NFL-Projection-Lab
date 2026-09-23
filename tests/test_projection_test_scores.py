import copy
import csv
import importlib.util
import io
import math
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'work/engine-rebuild/check_test_scores.py'
spec = importlib.util.spec_from_file_location('test_scores', path)
scores = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scores)


class TestScoreExportTests(unittest.TestCase):
    def setUp(self):
        self.schedule = [
            {'game_id': 'train', 'season': 2015, 'gameday': '2015-12-20', 'gametime': '13:00',
             'home_team': 'A', 'away_team': 'B', 'home_score': 24, 'away_score': 21},
            {'game_id': 'test', 'season': 2016, 'gameday': '2016-09-11', 'gametime': '13:00',
             'home_team': 'A', 'away_team': 'B', 'home_score': 27, 'away_score': 10},
        ]
        fit = {'training_hash': 'example'}
        sha = scores.membership.digest(fit)
        self.replay = {'authoritative': False, 'fits': [
            {'fit': fit, 'fit_sha256': sha, 'available_at': '2016-09-06T14:00:00Z',
             'at': '2016-09-06T13:00:00Z', 'training_games': ['train'],
             'season': 2016, 'kind': 'OUTER_SEASON_INITIAL_FIT'}],
            'games': [{'game_id': 'test', 'season': 2016, 'fit_sha256': sha,
                       'fit_at': '2016-09-06T14:00:00Z', 'issuance_at': '2016-09-11T15:45:00Z',
                       'training_hash': 'example', 'home': 24.6, 'away': 14.2,
                       'actual_home': 27, 'actual_away': 10}]}

    def test_hand_calculated_unrounded_regression_errors(self):
        rows, audit = scores.score_table(self.replay, self.schedule)
        result = scores.metrics(rows)
        self.assertEqual(audit['test_team_targets'], 2)
        self.assertAlmostEqual(result['team_mae'], 3.3)
        self.assertAlmostEqual(result['team_rmse'], math.sqrt((2.4**2 + 4.2**2)/2))
        self.assertAlmostEqual(result['team_bias'], .9)
        self.assertAlmostEqual(result['margin_mae'], 6.6)
        self.assertAlmostEqual(result['total_mae'], 1.8)
        self.assertAlmostEqual(result['projected_team_sd'], 5.2)
        self.assertEqual(result['actual_team_sd'], 8.5)
        self.assertTrue(all(r['interval_50_low'] is None for r in rows))
        self.assertEqual(rows[1]['predicted_points'], 24.6)

    def test_csv_roundtrip_and_row_order(self):
        rows, _ = scores.score_table(self.replay, self.schedule)
        saved = list(csv.DictReader(io.StringIO(scores.csv_bytes(rows).decode())))
        self.assertEqual(float(saved[1]['predicted_points']), 24.6)
        self.assertEqual(saved[1]['team'], 'A')
        self.assertEqual(scores.metrics(rows), scores.metrics(list(reversed(rows))))

    def test_future_or_target_training_fails_before_export(self):
        self.replay['fits'][0]['training_games'].append('test')
        with self.assertRaisesRegex(ValueError, 'not complete'):
            scores.score_table(self.replay, self.schedule)

    def test_missing_or_duplicate_team_fails(self):
        rows, _ = scores.score_table(self.replay, self.schedule)
        for invalid in (rows[:1], rows + rows):
            with self.assertRaises(ValueError):
                scores.metrics(invalid)

    def test_nonfinite_prediction_rejected(self):
        for invalid in (float('nan'), float('inf'), True):
            replay = copy.deepcopy(self.replay)
            replay['games'][0]['home'] = invalid
            with self.assertRaisesRegex(ValueError, 'test prediction'):
                scores.score_table(replay, self.schedule)
