import json,unittest,datetime as dt
from pathlib import Path
from scripts.elo_qb_value_data import mean_value
from scripts.elo_qb_value_evaluate import replay,fit_scale
from scripts.elo_hfa_deployed_gate import read
ROOT=Path(__file__).resolve().parents[1];O=ROOT/'work/e-elo-qb-value-v2'
class QBValueTests(unittest.TestCase):
 def test_attempt_weighting_and_percentage_units(self):
  rows=[{'attempts':10,'epa':2,'cpoe':10},{'attempts':30,'epa':0,'cpoe':-10}]
  self.assertAlmostEqual(mean_value(rows,False),.05);self.assertAlmostEqual(mean_value(rows,True),0)
  rows[0]['cpoe']=None;self.assertIsNone(mean_value(rows,True));self.assertEqual(mean_value(rows,False),.05)
 def test_every_window_precedes_lock_and_matches_shrinkage(self):
  ref=json.loads((O/'value-data-ref.json').read_text());rows=read(ref['values']);perf=read(ref['performance']);index={(r['game_id'],r['id']):r for r in perf}
  for r in rows:
   cut=dt.datetime.fromisoformat(r['T75_utc'])
   if r['latest_source_completion']:self.assertLess(dt.datetime.fromisoformat(r['latest_source_completion']),cut)
   self.assertLessEqual(len(r['team_game_ids']),16)
   for label in ['rule','oracle']:
    q=r['selected_qb'] if label=='rule' else r['oracle_qb'];v=r['values'][label];self.assertLessEqual(v['qualifying_games'],16);self.assertEqual(v['weight'],min(1,v['qualifying_games']/8))
    for gid in v['game_ids']:
     p=index[gid,q];self.assertGreaterEqual(p['attempts'],5);self.assertLess(dt.datetime.fromisoformat(p['completed_at']),cut)
    for component in ['epa','combined']:
     x=v[component]
     if x['starter'] is not None:
      if v['weight']==1:self.assertEqual(x['starter'],x['own'])
      elif v['qualifying_games']==0:self.assertEqual(x['starter'],x['league']);self.assertTrue(v['ROOKIE_PRIOR'])
      else:self.assertAlmostEqual(x['starter'],v['weight']*x['own']+(1-v['weight'])*x['league'])
 def test_qualified_original_selector_is_unchanged(self):
  old=json.loads(next((ROOT/'work/e-elo-qb-hfa-v1').glob('starter-table-*.json')).read_text());new=read(json.loads((O/'starter-reproduction.json').read_text())['table']);idx={(r['game_id'],r['team']):r for r in new}
  for r in old:
   for k in ['selected_qb','reason','UNTIMESTAMPED','injury_exclusions']:self.assertEqual(r[k],idx[r['game_id'],r['team']][k])
 def test_oracle_cannot_enter_rule_path(self):
  g={'game_id':'2015_01_BAL_BUF','season':2015,'week':1,'game_type':'REG','home_team':'BUF','away_team':'BAL','home_score':20,'away_score':10};v={('2015_01_BAL_BUF','BUF'):{'values':{'rule':{'epa':{'difference':.2}},'oracle':{'epa':{'difference':999}}}}}
  a,_=replay([g],v,10,identity='rule',through=2015);self.assertAlmostEqual(a[g['game_id'],'BUF']['elo'],6.6)
  v[g['game_id'],'BUF']['values']['oracle']['epa']['difference']=-999;b,_=replay([g],v,10,identity='rule',through=2015);self.assertEqual(a,b)
if __name__=='__main__':unittest.main()
