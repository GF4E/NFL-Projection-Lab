import copy
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from engine.live_picks import recompute,freeze,overwrite
from engine.pick_store import read_pinned
from engine.live_scorecard import write_pick_log
from scripts.live_pick_runner import jobs
from engine.live_capture import capture

ROOT=Path(__file__).resolve().parents[1]
class LiveTests(unittest.TestCase):
 def setUp(self):
  self.f=json.loads((ROOT/'work/model-pick-v1/synthetic-v1/inputs.json').read_text());self.c=json.loads((ROOT/'work/model-pick-v1/runtime-config.json').read_text());self.shape=read_pinned(self.c['distribution']);self.receipt={**self.f['receipt'],'label':'FRIDAY'}
 def live(self,**kwargs):return recompute(self.f['game'],self.f['event'],self.receipt,self.shape,self.c,**kwargs)
 def test_two_mutable_picks_no_history(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'game.json';a=self.live();overwrite(p,a);b=self.live(previous=a);overwrite(p,b)
   self.assertEqual(len(json.loads(p.read_text())['picks']),2);self.assertEqual(list(Path(tmp).glob('*.json')),[p]);self.assertIn('moved +0',b['analysis']['sentences'][0])
 def test_live_not_in_log(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'outputs/model-pick-v1/live/game.json';overwrite(p,self.live());write_pick_log(tmp)
   self.assertEqual(len((Path(tmp)/'outputs/model-pick-v1/pick_log.csv').read_text().splitlines()),1)
 def test_lock_preserves_choice_and_freezes_note(self):
  r=self.live();n={'author':'Jarrett','text':'Lean home','market':'spreads','side':'Home','updated_at':'2026-09-13T15:44:59Z'}
  v=freeze(r,'2026-09-13T15:45:00Z',n);self.assertEqual(v['picks'],r['picks']);self.assertEqual(v['human_lean']['source'],'human_lean');self.assertEqual(v['our_note'],n)
  with self.assertRaises(ValueError):self.live(previous=v)
 def test_human_lean_enters_scorecard_only_after_lock(self):
  from engine.live_scorecard import run
  from engine.pick_store import put, pin
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);out=root/'outputs/model-pick-v1'
   note={'author':'Gabe','text':'Home lean','market':'spreads','side':'Home','updated_at':'2026-09-13T15:44:59Z'}
   value=freeze(self.live(),'2026-09-13T15:45:00Z',note)
   put(root/'work/model-pick-v1/runtime-config.json',self.c)
   put(out/'locks/TEST/T75-picks.json',value)
   data=b'game_id,home_score,away_score,spread_line,total_line,result,total\nTEST_01_A_H,24,20,5,46,4,44\n'
   ref=pin(out/'final-sources',data,'.csv',True);ref['received_at']='2026-09-13T22:00:00Z';put(out/'result-refreshes/test.json',ref)
   result=run(root)
   self.assertEqual(len(result['human_grades']),1)
   rows=[r for r in result['rows'] if r['source']=='human_lean' and r['week']==1 and r['market']=='spreads']
   self.assertEqual(sum(rows[0][k] for k in ['wins','losses','pushes']),1)
   self.assertIn('human_lean',(root/'outputs/scorecard.csv').read_text())
 def test_note_at_deadline_rejected(self):
  for at in ['2026-09-13T15:45:00Z','2026-09-13T15:45:01Z']:
   with self.assertRaises(ValueError):freeze(self.live(),'2026-09-13T15:45:00Z',{'updated_at':at})
 def test_cannot_lock_early(self):
  with self.assertRaises(ValueError):freeze(self.live(),'2026-09-13T15:44:59Z')
 def test_missing_weather_qb_buy_price_explicit(self):
  lines=' '.join(self.live()['analysis']['sentences']);self.assertIn('inactives unknown until T-90',lines);self.assertIn('no captured buy-half price',lines);self.assertIn('WIND RULE cannot apply',lines);self.assertIn('diagnostic only',lines)
 def test_weekly_schedule_pt_with_dst(self):
  g={**self.f['game'],'games':[self.f['game']]}
  for at,label in [('2026-09-11T19:00:00+00:00','FRIDAY'),('2026-09-12T19:00:00+00:00','SATURDAY'),('2026-09-13T14:00:00+00:00','SUNDAY'),('2026-09-13T15:40:00+00:00','T80')]:
   self.assertIn(label,[j['label'] for j in jobs([g],dt.datetime.fromisoformat(at))])
  self.assertFalse(jobs([g],dt.datetime.fromisoformat('2026-09-11T19:01:01+00:00')))
 def test_daily_yields_for_weekly_capture(self):
  from scripts.cloud_scheduler import weekly_capture_window
  for at in ['2026-09-11T19:00:00+00:00','2026-09-12T19:00:15+00:00','2026-09-13T14:00:00+00:00']:
   self.assertTrue(weekly_capture_window(dt.datetime.fromisoformat(at)))
  self.assertFalse(weekly_capture_window(dt.datetime.fromisoformat('2026-09-11T20:00:00+00:00')))
 def test_transport_outside_window_no_dispatch(self):
  with patch('engine.live_capture.urllib.request.urlopen') as http:
   with self.assertRaises(ValueError):capture({'start':'2026-09-11T19:00:00Z'},Path('/unused'),Path('/unused'),'test',dt.datetime.fromisoformat('2026-09-11T19:02:00+00:00'))
   http.assert_not_called()
 def test_wind_rule_requires_t80(self):
  weather={'status':'FORECAST','forecast_run_initialized_at':'2026-09-13T12:00:00Z','valid_at':'2026-09-13T17:00:00Z','wind_mph':12,'request_at':'2026-09-13T15:40:00Z','received_at':'2026-09-13T15:40:05Z','forecast_issued_at':'2026-09-13T14:00:00Z'}
  self.assertFalse(self.live(weather=weather)['analysis']['measured']['wind_rule']);self.receipt['label']='T80';self.assertTrue(self.live(weather=weather)['analysis']['measured']['wind_rule'])
if __name__=='__main__':unittest.main()
