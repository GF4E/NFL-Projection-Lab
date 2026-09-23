"""Source-preparation boundaries; no model candidate fitting."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest

BASE = Path(__file__).resolve().parents[1] / 'work/engine-rebuild'
sys.path.insert(0, str(BASE))
spec = importlib.util.spec_from_file_location('early_inputs', BASE / 'prepare_early_inputs.py')
early = importlib.util.module_from_spec(spec)
spec.loader.exec_module(early)


def game(year, suffix='', **kwargs):
    return dict(game_id=f'{year}_01_BAL_BUF{suffix}', season=year, week=1,
                game_type='REG', location='Home', home_score=24, away_score=20,
                home_team='BUF', away_team='BAL', **kwargs)


class EarlyInputsTests(unittest.TestCase):
    def test_hfa_uses_only_three_prior_non_neutral_regular_seasons(self):
        rows = [game(y) for y in range(2008, 2014)]
        neutral = game(2010, '_neutral'); neutral.update(location='Neutral', home_score=99)
        playoff = game(2010, '_post'); playoff.update(game_type='POST', home_score=99)
        rows.extend([neutral, playoff])
        out = early.hfa_history(rows, [2011])['2011']
        self.assertEqual(out['value'], 100.)
        self.assertEqual(out['training_games'], [f'{y}_01_BAL_BUF' for y in range(2008, 2011)])
        changed = copy.deepcopy(rows)
        for r in changed:
            if r['season'] >= 2011 or r['season'] < 2008:
                r['home_score'] = 99
        self.assertEqual(early.hfa_history(changed, [2011]), {'2011': out})
        self.assertEqual(early.hfa_history(list(reversed(rows)), [2011]), {'2011': out})

    def test_hfa_missing_window_or_duplicate_is_rejected(self):
        rows = [game(y) for y in range(2008, 2011)]
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            early.hfa_history(rows[1:], [2011])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            early.hfa_history(rows + [rows[0]], [2011])
        rows[0]['home_score'] = float('nan')
        with self.assertRaisesRegex(ValueError, 'Invalid'):
            early.hfa_history(rows, [2011])

    def test_pairs_cannot_drop_duplicate_or_swap_an_opponent(self):
        g = game(2011)
        rows = [dict(game_id=g['game_id'], team=t, opponent=o, season=2011, week=1)
                for t, o in [('BUF', 'BAL'), ('BAL', 'BUF')]]
        early.paired([g], rows)
        for broken in (rows[:1], rows + [rows[0]], [rows[0], dict(rows[1], opponent='MIA')],
                       [rows[0], dict(rows[1], season=2012)]):
            with self.assertRaises(ValueError):
                early.paired([g], broken)

    def test_comparison_keeps_missing_distinct_from_zero_and_fails_drift(self):
        self.assertEqual(early.compare({'x': None, 'y': 1.}, {'x': None, 'y': 1.}), 0.)
        for left, right in [({'x': None}, {'x': 0}), ({'x': 1.}, {'x': 1.01}),
                            ({'x': float('nan')}, {'x': 1.}), ({'x': 1.}, {'x': float('inf')}),
                            ({'x': 1.}, {'x': True})]:
            with self.assertRaises(ValueError):
                early.compare(left, right)


if __name__ == '__main__':
    unittest.main()
