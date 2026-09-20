import copy,datetime as dt,unittest
from unittest.mock import patch
from engine.board_v9 import build,percentile
class ContextTests(unittest.TestCase):
 def fixture(self):
  schedule=[];finals={};cards=[]
  for i in range(1,7):
   gid=f'g{i}';schedule.append(dict(game_id=gid,season=2026,game_type='REG',gameday=f'2026-09-{i:02}',gametime='12:00',home_team='BAL',away_team='NO'));finals[gid]={'home_score':i*7,'away_score':10};cards.append(dict(game_id=gid,version='v1',season=2026,evidence='AS_ISSUED',freeze_time='yes'))
  for i in range(2):
   gid=f'old{i}';schedule.append(dict(game_id=gid,season=2025,game_type='REG',gameday=f'2025-09-0{i+1}',gametime='12:00',home_team='BAL',away_team='NO'));finals[gid]={'home_score':20+i*10,'away_score':10+i*10}
  p={'home_points':25,'away_points':15,'total':40,'intervals':{'total':{'50':[30,50]}}};target=dict(game_id='target',home='BAL',away='NO',season=2026,version='v1',issued_at='2026-09-05T19:00:00+00:00',cutoff_at='2026-09-05T20:00:00+00:00',projection=p)
  return {'games':cards+[target],'content_sha256':'x','published_at':'now'},schedule,finals
 @patch('engine.board_v9.metadata',return_value={'teams':{s:{'intervals':{'50':[1,2],'80':[0,3]}} for s in ('home','away')}})
 def test_prior_only_exact_version_and_four_game_switch(self,_):
  b,s,f=self.fixture();o=build(b,s,f,lambda _:{});c=o['games']['target'];self.assertEqual(c['teams']['home']['game_ids'],['g1','g2','g3','g4']);self.assertFalse(c['teams']['home']['prior_season']);self.assertEqual(c['total']['n'],4)
  b['games'][0]['version']='different';c=build(b,s,f,lambda _:{})['games']['target'];self.assertTrue(c['teams']['home']['prior_season']);self.assertEqual(c['teams']['home']['game_ids'],['old0','old1']);self.assertEqual(c['teams']['home']['current_version_n'],3);self.assertEqual(c['teams']['home']['percentile'],50)
 @patch('engine.board_v9.metadata',return_value={'teams':{s:{'intervals':{'50':[1,2],'80':[0,3]}} for s in ('home','away')}})
 def test_completion_at_issuance_excluded_future_scores_invariant(self,_):
  b,s,f=self.fixture();b['games'][-1]['issued_at']='2026-09-04T20:00:00+00:00';first=build(b,s,f,lambda _:{})['games']['target'];self.assertEqual(first['total']['game_ids'],['g1','g2','g3']);f['g4']['home_score']=999;f['g6']['home_score']=999;self.assertEqual(build(b,s,f,lambda _:{})['games']['target'],first)
 @patch('engine.board_v9.metadata',return_value={'teams':{s:{'intervals':{'50':[1,2],'80':[0,3]}} for s in ('home','away')}})
 def test_retro_bound_missing_time_and_order_invariance(self,_):
  b,s,f=self.fixture();b['games'][-1]['issued_at']='2026-12-01T20:00:00+00:00';a=build(b,s,f,lambda _:{})['games']['target'];self.assertNotIn('g5',a['total']['game_ids']);self.assertEqual(a,build(b,list(reversed(s)),f,lambda _:{})['games']['target']);b['games'][-1]['issued_at']=None;c=build(b,s,f,lambda _:{})['games']['target'];self.assertIsNone(c['teams']['home']['percentile']);self.assertEqual(c['total']['n'],0)
 def test_full_precision_midrank(self):
  self.assertEqual(percentile(20,[{'p':10},{'p':20},{'p':20},{'p':30}],'p'),50);self.assertEqual(percentile(19.9,[{'p':20}],'p'),0)
if __name__=='__main__':unittest.main()
