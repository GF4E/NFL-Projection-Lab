import unittest
import numpy as np
import statsmodels.api as sm
from engine.weather import exposure,design,fit,study,wind_bucket
from scripts.harvest_weather_capture import kickoff

class WeatherTests(unittest.TestCase):
 def test_kickoff_timezone(self):
  self.assertEqual(kickoff(dict(gameday='2025-09-07',gametime='13:00')),'2025-09-07T17:00')
  self.assertEqual(kickoff(dict(gameday='2025-12-07',gametime='20:20')),'2025-12-08T01:00')
 def test_outdoor_missing_is_error(self):
  with self.assertRaises(ValueError):exposure(dict(dome=0,wind_mph='',precip_mm=0))
 def test_indoor_is_exposure_not_measurement(self):
  self.assertEqual(exposure(dict(dome=1,wind_mph='',precip_mm='')),(0,0,1))
 def test_bucket_boundaries(self):
  self.assertEqual([wind_bucket(x) for x in [9.9,10,14.9,15,20,20.1]],['<10','10–<15','10–<15','15–20','15–20','>20'])
 def test_under_pushes_and_domes(self):
  rows=[dict(season=2020,week=1,dome=0,wind_mph=11,precip_mm=0,market_total=40,total=v) for v in [39,40,41]]
  rows.append(dict(season=2020,week=2,dome=1,wind_mph='',precip_mm='',market_total=40.5,total=40))
  wind=study(rows,'wind',100)[1]
  self.assertEqual((wind['n'],wind['under_w'],wind['under_l'],wind['push']),(3,1,1,1));self.assertEqual(wind['under_rate'],.5)
  self.assertEqual(study(rows,'dome',100)[1]['under_w'],1)
 def test_cluster_regression_oracle(self):
  rng=np.random.default_rng(6);rows=[]
  for i in range(160):
   dome=i%3==0;w=0 if dome else rng.uniform(1,22);p=0 if dome else rng.uniform(0,3);m=rng.uniform(35,55)
   rows.append(dict(season=2015,week=i//8+1,dome=int(dome),wind_mph=w,precip_mm=p,market_total=m,total=4+.9*m-.3*w-2*p+dome+rng.normal()))
  beta,coefs=fit(rows);X=design(rows);oracle=sm.OLS([r['total'] for r in rows],X).fit(cov_type='cluster',cov_kwds={'groups':[r['week'] for r in rows]},use_t=True)
  np.testing.assert_allclose(beta,oracle.params,atol=1e-10)
  np.testing.assert_allclose([r['se'] for r in coefs],oracle.bse,atol=1e-10)
  np.testing.assert_allclose([[r['lower95'],r['upper95']] for r in coefs],oracle.conf_int(),atol=1e-10)
if __name__=='__main__':unittest.main()
