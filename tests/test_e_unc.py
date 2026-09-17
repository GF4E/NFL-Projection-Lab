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
