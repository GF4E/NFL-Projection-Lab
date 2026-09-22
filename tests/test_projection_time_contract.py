import datetime as dt
import unittest
from engine.forecast_system.calendar import schedule_kickoff,timestamp
from engine.forecast_system.cadence import cutoff_before,next_cutoff,plan,audit


class SourceTimeContractTests(unittest.TestCase):
    def test_eastern_source_does_not_depend_on_venue(self):
        self.assertEqual(schedule_kickoff('2026-09-20','16:25').isoformat(),'2026-09-20T20:25:00+00:00')
        self.assertEqual(schedule_kickoff('2026-10-04','09:30').isoformat(),'2026-10-04T13:30:00+00:00')
        self.assertEqual(schedule_kickoff('2026-12-20','16:25').isoformat(),'2026-12-20T21:25:00+00:00')

    def test_aware_instant_not_reinterpreted(self):
        self.assertEqual(timestamp('2026-09-20T20:25:00Z').isoformat(),'2026-09-20T20:25:00+00:00')
        with self.assertRaises(ValueError):schedule_kickoff('2026-09-20','20:25+00:00')

    def test_dst_and_strict_boundary(self):
        self.assertEqual(cutoff_before('2026-11-02T14:00:00Z').isoformat(),'2026-10-30T13:00:00+00:00')
        self.assertEqual(next_cutoff('2026-11-02T14:00:00Z').isoformat(),'2026-11-03T14:00:00+00:00')
        self.assertEqual(cutoff_before('2026-11-02T14:00:00.000001Z').isoformat(),'2026-11-02T14:00:00+00:00')

    def test_result_at_cutoff_waits_for_next_and_no_duplicate(self):
        games=[{'game_id':'rescheduled','season':2026,'issuance_at':'2026-09-18T07:45:00Z','assimilation_available_at':'2026-09-18T13:00:00Z'},
               {'game_id':'sunday','season':2026,'issuance_at':'2026-09-20T15:45:00Z','assimilation_available_at':'2026-09-20T21:00:00Z'}]
        batches=plan(games);self.assertEqual(audit(games,batches),2)
        sunday=next(b for b in batches if any(g['game_id']=='sunday' for g in b['forecasts']))
        self.assertEqual(sunday['cutoff'],'2026-09-18T13:00:00+00:00')
        self.assertNotIn('rescheduled',sunday['incorporated'])
