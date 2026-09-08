import unittest
from engine.weather_followup import in_bucket,record,interval
class WeatherFollowupTests(unittest.TestCase):
 def test_half_open_bucket(self):
  self.assertEqual([in_bucket(x) for x in (9.9,10,14.99,15)],[False,True,True,False])
 def test_under_push_denominator(self):
  r=record([dict(actual_total=v,market_total=40) for v in (39,40,41,38)])
  self.assertEqual((r['under_w'],r['under_l'],r['push'],r['under_rate']),(2,1,1,2/3))
 def test_bonferroni_interval_widens(self):
  rows=[dict(season=2020,week=i//5,wind_mph=11,actual_total=39 if i%3 else 41,market_total=40) for i in range(80)]
  lo,hi=interval(rows,reps=10000,alpha=.05);blo,bhi=interval(rows,reps=10000,alpha=.05/4)
  self.assertLessEqual(blo,lo);self.assertGreaterEqual(bhi,hi)
 def test_no_picks_not_zero_rate(self):self.assertIsNone(record([])['under_rate'])
if __name__=='__main__':unittest.main()
