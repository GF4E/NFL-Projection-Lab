import copy
import datetime as dt
import unittest
from engine.teaser_prices import apply
from engine.live_weather_v2 import common_run, qualified


class TeaserWeatherTests(unittest.TestCase):
    def record(self,price=-120,line=-8):
        return {'captured_at':'2026-09-12T19:00:01Z','offers':[{'market':'spreads','side':'Home','line':line,'book':'draftkings','price':-110}], 'teaser_prices':{'sha256':'a'*64,'books':{'draftkings':{'two_leg':price,'three_leg':140,'as_of':'2026-09-11','source_page':'https://example.com'}}}}
    def test_near_miss_is_visible(self):
        v=apply({'state':'HARD PASS'},self.record(),'spreads')
        self.assertEqual(v['state'],'HARD PASS');self.assertEqual(v['teaser_notice'],'TEASE candidate, best teaser price -120 at DraftKings')
    def test_minus110_fires_only_at_book_with_wong_leg(self):
        v=apply({'state':'HARD PASS'},self.record(-110),'spreads');self.assertEqual(v['state'],'TEASE');self.assertEqual(v['teased_line'],-2);self.assertEqual(v['key_numbers_crossed'],[3,7]);self.assertEqual(v['partner_status'],'NEEDS_PARTNER')
        self.assertEqual(apply({'state':'HARD PASS'},self.record(-110,-6),'spreads'),{'state':'HARD PASS'})
    def test_missing_price_and_other_books_price_cannot_fire(self):
        r=self.record(None);r['teaser_prices']['books']['betmgm']={'two_leg':-105,'as_of':'2026-09-11'}
        self.assertEqual(apply({'state':'HARD PASS'},r,'spreads')['state'],'HARD PASS')
    def test_play_has_priority(self):
        self.assertEqual(apply({'state':'PLAY'},self.record(-110),'spreads'),{'state':'PLAY'})
    def test_asynchronous_runs_choose_common_archive(self):
        now=dt.datetime.fromtimestamp(200000,dt.timezone.utc)
        run,at=common_run([{'last_run_initialisation_time':100000,'last_run_availability_time':130000},{'last_run_initialisation_time':121600,'last_run_availability_time':150000}],now)
        self.assertEqual(run.timestamp(),100000);self.assertEqual(at.timestamp(),150000)
    def test_replication_window_still_rejected(self):
        with self.assertRaises(ValueError):common_run([{'last_run_initialisation_time':100000,'last_run_availability_time':199500}],dt.datetime.fromtimestamp(200000,dt.timezone.utc))
    def test_saturday_forecast_evaluates_before_sunday_cutoff(self):
        g={'game_id':'TEST','kickoff_at':'2026-09-13T17:00:00Z','cutoff_at':'2026-09-13T15:45:00Z'}
        f={'event_id':'TEST','status':'FORECAST','forecast_run_initialized_at':'2026-09-12T12:00:00Z','forecast_issued_at':'2026-09-12T17:00:00Z','request_at':'2026-09-12T19:00:05Z','received_at':'2026-09-12T19:00:06Z','valid_at':'2026-09-13T17:00:00Z','wind_mph':12,'temperature_c':20,'precip_mm':0,'source_sha256':'a'*64,'requests':[{'sha256':'a'*64}]}
        self.assertTrue(qualified(f,g))
        self.assertFalse(qualified({**f,'received_at':'2026-09-13T15:46:00Z'},g))
        self.assertFalse(qualified({**f,'source_sha256':''},g))


if __name__=='__main__':unittest.main()
