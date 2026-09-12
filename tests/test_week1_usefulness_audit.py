"""Audit must remain offline, honest about missing evidence, and reproducible."""
import unittest
from unittest.mock import patch
from scripts.week1_usefulness_audit import BASE, read, run


class UsefulnessAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch('socket.socket', side_effect=AssertionError('Network forbidden in audit replay')):
            cls.result, cls.tables = run()

    def test_saved_experiment_reproduces_without_network(self):
        self.assertEqual(self.result, read(BASE/'experiment.json'))

    def test_missing_caesars_and_unknown_time_cannot_be_actionable(self):
        self.assertEqual(self.result['caesars_captured_picks'], 0)
        self.assertTrue(all(r['quote_time']=='UNKNOWN' and r['check_current_price'] for r in self.result['table']))
        self.assertTrue(all(r['verdict']=='INSUFFICIENT DATA' for r in self.result['table']))

    def test_negative_EV_does_not_become_a_betting_lean(self):
        self.assertTrue(all(r['lean']=='NO INFORMED LEAN' for r in self.result['table'] if r['EV']<=0))

    def test_historical_context_is_not_exact_live_validation(self):
        self.assertEqual(self.result['exact_live_validation']['historical_paired_n'], 0)
        self.assertIsNone(self.result['exact_live_validation']['live_CRPS'])
        self.assertTrue(all(r['max_training_season']<r['season'] for r in self.result['historical_baseline_context']['seasonal']))

    def test_week1_published_data_matches_recorded_inputs(self):
        self.assertTrue(self.result['website']['week1_games_identical'])
        self.assertTrue(all(r['replay_matches'] for r in self.result['live_trace']))


if __name__=='__main__':
    unittest.main()
