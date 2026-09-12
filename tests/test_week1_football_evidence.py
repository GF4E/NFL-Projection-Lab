import copy
import json
from pathlib import Path
import unittest
from engine.football_evidence import forecast, compare_line

ROOT = Path(__file__).resolve().parents[1]


class FootballEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT/'config/football_weights_v1.json').read_text())
        self.game = dict(game_id='g', home_abbr='H', away_abbr='A', season=2026, week=1,
                         kickoff_at='2026-09-13T17:00:00Z')
        self.state = dict(training_max_origin=[2025, 22], teams={'H': {'elo': 1500}, 'A': {'elo': 1500}})
        self.now = '2026-09-12T20:00:00Z'
        self.fact = dict(game_id='g', mechanism_id='defender-out', category='trenches',
                         status='CONFIRMED', fact='Away defender is out.', interpretation='Home protection may benefit.',
                         source_reliability=1., margin_assessment=.5, total_assessment=0.,
                         sources=[dict(url='https://example.com/injury', sha256='a'*64,
                                       observed_at=self.now, published_at=None)])

    def predict(self, evidence=None):
        return forecast(self.game, self.state, [self.fact] if evidence is None else evidence, self.config, self.now)

    def test_market_comparison_cannot_change_forecast_and_can_pick_underdog(self):
        p = self.predict(); original = copy.deepcopy(p)
        self.assertEqual(compare_line(p, -2)['side'], 'H')
        self.assertEqual(compare_line(p, -7)['side'], 'A')
        self.assertEqual(p, original)
        self.assertEqual(p['football_home_margin'], 3.35)
        self.assertIsNone(p['cover_probability'])

    def test_deduplication_and_category_cap(self):
        p = self.predict([self.fact, self.fact])
        self.assertEqual(len(p['accepted']), 1)
        self.assertEqual(p['rejected'][0]['reason'], 'DUPLICATE_OR_MISSING_MECHANISM')
        facts = [{**self.fact, 'mechanism_id': str(i), 'margin_assessment': 1} for i in range(8)]
        self.assertEqual(self.predict(facts)['adjustment_points']['margin'], 1.5)

    def test_unknown_is_not_claimed_neutral_and_no_invented_total(self):
        p = self.predict([])
        self.assertEqual(len(p['unknown_categories']), 6)
        self.assertIsNone(p['total_projection'])
        self.state['teams'].pop('H')
        self.assertEqual(self.predict()['status'], 'UNAVAILABLE')

    def test_future_stale_and_conflicting_evidence_excluded(self):
        for field, val, expected in [('observed_at','2026-09-14T00:00:00Z','FUTURE_SOURCE'),
                                     ('observed_at','2026-09-01T00:00:00Z','STALE_SOURCE')]:
            fact = copy.deepcopy(self.fact); fact['sources'][0][field] = val
            p = self.predict([fact]); self.assertEqual(p['rejected'][0]['reason'], expected)
            self.assertEqual(p['adjustment_points']['margin'], 0)
        self.fact['status'] = 'CONFLICT'
        self.assertFalse(self.predict()['accepted'])

    def test_chronology_final_and_neutral(self):
        self.game['neutral'] = True
        self.assertEqual(self.predict([])['elo_home_margin'], 0)
        self.game['status'] = 'FINAL'
        with self.assertRaises(ValueError): self.predict()
        self.game.pop('status'); self.state['training_max_origin'] = [2026, 1]
        with self.assertRaises(ValueError): self.predict()

    def test_bad_numeric_and_market_weights_rejected(self):
        self.fact['margin_assessment'] = float('nan')
        with self.assertRaises(ValueError): self.predict()
        self.config['market_weight'] = .5
        with self.assertRaises(ValueError): self.predict([])


if __name__ == '__main__': unittest.main()
