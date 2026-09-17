import unittest
from engine.uncertainty import crps,interval_score,coverage,brier,pit,joint_targets,quantile_dots,predictive_variance
class Uncertainty(unittest.TestCase):
 def test_hand_scores(self):
  self.assertAlmostEqual(crps([0,2],1),.5)
  self.assertEqual(interval_score(0,2,3,.5),6)
  self.assertAlmostEqual(interval_score(0,2,3,.8),12)
  self.assertEqual(coverage(0,2,2),1)
  self.assertEqual(coverage(0,2,3),0)
  self.assertAlmostEqual(brier(.75,1),.0625)
  self.assertEqual(pit([0,2],0),.25)
 def test_joint_dependence_and_probability(self):
  paired=joint_targets([(10,10),(30,30)])
  independent=joint_targets([(10,10),(10,30),(30,10),(30,30)])
  self.assertEqual(paired['margin'],[0,0]);self.assertNotEqual(paired['margin'],independent['margin'])
  self.assertEqual(paired['home_win_probability'],.5)
  self.assertEqual(joint_targets([(20,10),(0,5),(8,8)])['home_win_probability'],.5)
 def test_both_variance_components(self):
  self.assertEqual(predictive_variance([-2,2],9),{'parameter':4,'residual':9,'predictive':13})
 def test_equal_mass_strata(self):
  dots=quantile_dots(range(100));self.assertEqual(len(dots),10)
  self.assertEqual([d['value'] for d in dots],[4,14,24,34,44,54,64,74,84,94])
  self.assertAlmostEqual(sum(d['mass'] for d in dots),1)
  for a,b in zip(dots,dots[1:]):self.assertEqual(a['probability_hi'],b['probability_lo'])
if __name__=='__main__':unittest.main()

class FullReplayContract(unittest.TestCase):
 def test_every_candidate_preserves_every_point_and_population(self):
  import gzip,json
  from pathlib import Path
  p=Path('work/e-unc/scored-games.json.gz')
  self.assertTrue(p.exists(),'Run registered replay before contract test')
  data=json.loads(gzip.decompress(p.read_bytes()))
  key=lambda r:(r['game_id'],r['target'],r['side'])
  control={key(r):r for r in data['control']}
  for name,rows in data.items():
   self.assertEqual(set(control),{key(r) for r in rows})
   for r in rows:self.assertAlmostEqual(r['point'],control[key(r)]['point'],places=12)
   self.assertEqual(sum(abs(r['actual']-r['point']) for r in rows),sum(abs(r['actual']-r['point']) for r in data['control']))
 def test_heteroscedastic_widths_vary_in_each_fold(self):
  import json
  from pathlib import Path
  fits=json.loads(Path('work/e-unc/fits.json').read_text())
  for f in fits:
   if f['season']>=2016:
    self.assertLess(f['scale_min'],f['scale_max'])
    self.assertLess(f['trained_through'],f['season'])
 def test_row_order_does_not_change_distribution_or_scores(self):
  pairs=[(10,20),(30,35),(25,17)]
  a=joint_targets(pairs);b=joint_targets(list(reversed(pairs)))
  for t in ('home','away','margin','total'):
   self.assertEqual(crps(a[t],12),crps(b[t],12))
   self.assertEqual(quantile_dots(a[t]),quantile_dots(b[t]))
  self.assertEqual(a['home_win_probability'],b['home_win_probability'])
