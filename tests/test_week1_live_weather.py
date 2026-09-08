import unittest,datetime as dt,json,uuid
from pathlib import Path
from unittest.mock import patch
from engine import live_weather as w
from engine.qb_history import put
G=dict(refresh_at='2026-09-09T23:15:00+00:00',cutoff_at='2026-09-09T23:20:00+00:00',kickoff_at='2026-09-10T00:20:00+00:00',event_ids=['x'])
F=dict(event_id='x',status='FORECAST',roof='outdoors',forecast_run_initialized_at='2026-09-09T12:00:00+00:00',forecast_issued_at='2026-09-09T19:00:00+00:00',request_at='2026-09-09T23:15:05+00:00',received_at='2026-09-09T23:15:06+00:00',kickoff_at=G['kickoff_at'],valid_at='2026-09-10T00:00:00+00:00',wind_mph=12,precip_mm=0,temperature_c=20)
class LiveWeatherTests(unittest.TestCase):
 def test_no_forecast_cannot_trigger(self):
  self.assertFalse(w.qualified(None,G,'x',w.timestamp(G['cutoff_at'])))
  self.assertEqual(w.rule_picks([],{'x':{'status':'MISSING'}}),[])
 def test_pre_cutoff_forecast(self):
  self.assertTrue(w.qualified(F,G,'x',w.timestamp(G['cutoff_at'])))
  for key in ('forecast_issued_at','request_at','received_at'):
   self.assertFalse(w.qualified({**F,key:G['cutoff_at']},G,'x',w.timestamp(G['cutoff_at'])))
 def test_no_backfill_or_observed_weather(self):
  self.assertFalse(w.qualified({**F,'request_at':'2026-09-08T23:15:00+00:00'},G,'x',w.timestamp(G['cutoff_at'])))
  self.assertFalse(w.qualified({**F,'status':'OBSERVED'},G,'x',w.timestamp(G['cutoff_at'])))
 def test_wrong_hour_and_event_rejected(self):
  self.assertFalse(w.qualified(F,G,'wrong',w.timestamp(G['cutoff_at'])))
  self.assertFalse(w.qualified({**F,'valid_at':G['cutoff_at']},G,'x',w.timestamp(G['cutoff_at'])))
 def test_no_network_outside_window(self):
  with patch.object(w,'now',return_value=w.timestamp(G['cutoff_at'])),patch.object(w,'get') as get:
   w.capture_group(G,Path('unused'));get.assert_not_called()
 def test_rule_best_price_at_exact_consensus(self):
  row=dict(event_id='x',market='totals',side='Under',executed_book='betmgm',week=1,commence_time=G['kickoff_at'],coverage_flag='OK',consensus_fair_line=44.5,line=44.5,decimal_price=1.9)
  rows=[row,{**row,'executed_book':'fanduel','decimal_price':2.0},{**row,'line':45,'decimal_price':2.2}]
  f={'x':dict(qualified_T60=True,wind_band=True)}
  self.assertEqual(w.rule_picks(rows,f)[0]['executed_book'],'fanduel')
  self.assertEqual(w.rule_picks(rows,{'x':dict(qualified_T60=False,wind_band=True)}),[])
 def test_stored_forecast_with_hash_can_trigger(self):
  import hashlib
  folder=Path('work/live-weather-tests')/uuid.uuid4().hex
  raw=b'{"fixture":"forecast"}';sha=hashlib.sha256(raw).hexdigest()
  put(folder/'weather/sources'/f'{sha}.json',raw)
  f={**F,'requests':[{'sha256':sha}]}
  put(folder/'weather/x.json',json.dumps(f).encode())
  result=w.freeze_weather(G,folder,w.timestamp(G['cutoff_at']))
  self.assertTrue(result['x']['qualified_T60']);self.assertTrue(result['x']['wind_band'])
 def test_freeze_missing_forecast_false(self):
  folder=Path('work/live-weather-tests')/uuid.uuid4().hex
  r=w.freeze_weather(G,folder,w.timestamp(G['cutoff_at']))
  self.assertFalse(r['x']['qualified_T60']);self.assertFalse(r['x']['wind_band'])
if __name__=='__main__':unittest.main()
