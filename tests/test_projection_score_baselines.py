import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'work/engine-rebuild/check_score_baselines.py'
spec = importlib.util.spec_from_file_location('baselines', path)
baselines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baselines)


def game(gid, day, year, home, away, hp, ap, location='Home', clock='13:00'):
    return dict(game_id=gid, gameday=day, gametime=clock, season=year, home_team=home,
                away_team=away, home_score=hp, away_score=ap, location=location, game_type='REG')


class ScoreBaselineTests(unittest.TestCase):
    def setUp(self):
        self.schedule = [game('a', '2015-11-01', 2015, 'A', 'B', 30, 10),
                         game('b', '2015-11-08', 2015, 'B', 'A', 20, 14),
                         game('n', '2015-11-15', 2015, 'A', 'B', 40, 0, 'Neutral'),
                         game('t', '2016-09-11', 2016, 'A', 'B', 23, 21)]
        self.target = dict(game_id='t', season=2016, issuance_at='2016-09-11T15:45:00Z',
                           state_cutoff='2016-09-09T13:00:00Z')

    def run_forecast(self):
        return baselines.predictions([self.target], self.schedule)

    def test_hand_computed_values_counts_and_fractional_scores(self):
        away, home = self.run_forecast()
        self.assertEqual(home['league_prior_season'], 19)
        self.assertEqual(home['venue_prior_season'], 25)
        self.assertEqual(away['venue_prior_season'], 12)
        self.assertEqual(home['team_last_four'], 28)
        self.assertEqual(away['team_last_four'], 10)
        self.assertEqual(home['league_prior_season_observations'], 6)
        self.assertEqual(home['venue_prior_season_observations'], 2)
        self.assertEqual(home['persistence_team_games'], 3)
        self.schedule[0]['home_score'] = 31
        self.assertEqual(self.run_forecast()[1]['venue_prior_season'], 25.5)

    def test_future_and_target_labels_do_not_change_predictions(self):
        before = self.run_forecast()
        self.schedule[-1]['home_score'] = 900
        self.schedule[-1]['away_score'] = 800
        self.schedule.append(game('future', '2016-10-02', 2016, 'A', 'B', 999, 999))
        self.target['actual_home'] = 900
        self.assertEqual(before, self.run_forecast())

    def test_strict_boundary_and_actual_played_date(self):
        before = self.run_forecast()
        # Friday 09:00 UTC kickoff + 4h equals cutoff: cannot enter.
        delayed = game('late', '2016-09-09', 2016, 'A', 'B', 80, 90, clock='05:00')
        self.schedule.append(delayed)
        self.assertEqual(before, self.run_forecast())
        delayed['gametime'] = '04:59'
        after = self.run_forecast()
        self.assertNotEqual(before[0]['team_last_four'], after[0]['team_last_four'])
        self.assertEqual(before[0]['league_prior_season'], after[0]['league_prior_season'])
        delayed['gameday'] = '2016-09-10'  # Rescheduled after cutoff, week label irrelevant.
        self.assertEqual(before, self.run_forecast())

    def test_neutral_target_uses_league_mean(self):
        self.schedule[-1]['location'] = 'Neutral'
        for row in self.run_forecast():
            self.assertTrue(row['neutral_target'])
            self.assertEqual(row['venue_prior_season'], row['league_prior_season'])

    def test_franchise_alias_and_available_history(self):
        for row in self.schedule[:-1]:
            row['home_team'] = 'OAK' if row['home_team'] == 'A' else row['home_team']
            row['away_team'] = 'OAK' if row['away_team'] == 'A' else row['away_team']
        self.schedule[-1]['home_team'] = 'LV'
        row = self.run_forecast()[1]
        self.assertEqual(row['team_last_four'], 28)
        self.assertFalse(row['persistence_fallback'])

    def test_exact_last_four_not_all_history_or_single_game(self):
        for i, hp in enumerate((40, 50, 60, 70, 80), 1):
            self.schedule.append(game(str(i), f'2016-08-{i:02d}', 2016, 'A', 'B', hp, 10))
        self.assertEqual(self.run_forecast()[1]['team_last_four'], 65)
        self.assertEqual(self.run_forecast()[1]['persistence_team_games'], 4)

    def test_no_history_fallback_is_explicit(self):
        self.schedule[-1]['home_team'] = 'NEW'
        row = self.run_forecast()[1]
        self.assertTrue(row['persistence_fallback'])
        self.assertEqual(row['persistence_team_games'], 0)
        self.assertEqual(row['team_last_four'], 19)

    def test_reordering_inputs_preserves_every_number_and_hash(self):
        before = self.run_forecast()
        self.schedule.reverse()
        self.assertEqual(before, self.run_forecast())

    def test_bad_cutoff_issuance_population_and_unknown_venue_fail(self):
        for field, value in [('state_cutoff', '2016-09-06T13:00:00Z'),
                             ('issuance_at', '2016-09-11T16:45:00Z')]:
            target = dict(self.target, **{field: value})
            with self.assertRaises(ValueError):
                baselines.predictions([target], self.schedule)
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            baselines.predictions([self.target, self.target], self.schedule)
        self.schedule[-1]['location'] = 'UNKNOWN'
        with self.assertRaisesRegex(ValueError, 'venue'):
            self.run_forecast()

    def test_missing_history_does_not_drop_test_game(self):
        with self.assertRaisesRegex(ValueError, 'population cannot shrink'):
            baselines.predictions([self.target], self.schedule[-1:])

    def test_missing_final_pair_and_invalid_known_final(self):
        self.schedule[0]['away_score'] = None
        rows = self.run_forecast()
        self.assertEqual(rows[0]['league_prior_season_observations'], 4)
        self.schedule[1]['away_score'] = float('nan')
        with self.assertRaisesRegex(ValueError, 'integer final'):
            self.run_forecast()

    def test_paired_error_difference_and_incomplete_pairs(self):
        rows = self.run_forecast()
        for row, actual, forecast in zip(rows, (21, 23), (20.5, 24.5)):
            row.update(actual_points=actual, replay=forecast)
        result = baselines.comparison(rows)
        self.assertEqual(result['models']['replay']['team_mae'], 1)
        self.assertEqual(result['models']['league_prior_season']['team_mae'], 3)
        self.assertEqual(result['paired']['league_prior_season']['replay_minus_baseline_team_mae'], -2)
        with self.assertRaises(ValueError):
            baselines.comparison(rows[:1])
