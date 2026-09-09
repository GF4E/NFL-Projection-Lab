import unittest
from engine.teaser import ticket,leg
from engine.market_distribution import MarketDistribution,wong
from engine.teaser_study import stats,outcome
class TeaserStudyTests(unittest.TestCase):
 def test_independent_ticket_price(self):
  legs=[dict(game_id=str(i),win=.8,push=0,loss=.2) for i in range(3)]
  self.assertAlmostEqual(ticket(legs[:2],-110)['win'],.64)
  self.assertAlmostEqual(ticket(legs,-120)['win'],.512)
 def test_push_policy(self):
  ls=[dict(game_id=str(i),win=.7,push=.1,loss=.2) for i in range(2)];r=ticket(ls,-120)
  self.assertAlmostEqual(r['win'],.49);self.assertAlmostEqual(r['void'],.15);self.assertAlmostEqual(r['loss'],.36)
 def test_same_game_rejected(self):
  with self.assertRaises(ValueError):ticket([dict(game_id='x',win=.8,push=0,loss=.2)]*2,-110)
 def test_wong_crosses_key_numbers(self):
  self.assertTrue(all(wong(x) for x in [-8.5,-8,-7.5,1.5,2,2.5]));self.assertFalse(wong(-7))
  for x in [-8.5,-8,-7.5]:self.assertTrue(x<-7<-3<x+6)
  for x in [1.5,2,2.5]:self.assertTrue(x<3<7<x+6)
 def test_home_away_leg_symmetry(self):
  a={'targets':{'margin':{'counts':{-1:1,0:1,1:1}},'total':{'counts':{0:1}}}}
  h=MarketDistribution(a,-8,44);away=MarketDistribution(a,8,44)
  self.assertEqual(leg(h,-8,True)['win'],leg(away,-8,False)['win'])
 def test_stats_push_and_adjustment(self):
  rows=[dict(season=2020,week=i//3,outcome=outcome(i%3-1)) for i in range(30)];r=stats(rows,6)
  self.assertEqual(r['pushes'],10);self.assertEqual(r['rate'],.5);self.assertLessEqual(r['bonferroni_lower'],r['lower95'])
if __name__=='__main__':unittest.main()
