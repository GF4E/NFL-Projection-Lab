import unittest
import numpy as np
from engine.disagreement import bucket,bucket_study,regression
class DisagreementTests(unittest.TestCase):
    def test_boundaries(self):
        self.assertEqual([bucket(x) for x in (0,.999,1,2,3,4,4.001,-4.001)],[0,0,1,2,3,3,4,4])
    def test_side_push_and_no_side(self):
        rows=[dict(season=2020,week=1,market_margin_location=3,anya_margin_location=e,margin=y) for e,y in [(4,7),(2,7),(4,3),(3,4)]]
        result=bucket_study(rows,'anya_margin_location',reps=100)
        r=result[1];self.assertEqual((r['wins'],r['losses'],r['pushes']),(1,1,1));self.assertEqual(r['ats_rate'],.5);self.assertEqual(r['mean_residual_toward_model'],0)
        self.assertEqual(result[0]['no_side'],1);self.assertIsNone(result[0]['ats_rate'])
    def test_coefficients_match_direct_design_and_cluster_covariance(self):
        import statsmodels.api as sm
        rng=np.random.default_rng(3);m=rng.normal(size=100);e=m+rng.normal(size=100);y=1+.7*m+.2*e+rng.normal(size=100)
        rows=[dict(season=2020,week=i//5+1,market_margin_location=m[i],anya_margin_location=e[i],margin=y[i]) for i in range(100)]
        fitted=regression(rows);oracle=sm.OLS(y,np.column_stack([np.ones(100),m,e])).fit(cov_type='cluster',cov_kwds={'groups':np.arange(100)//5,'use_correction':True},use_t=True)
        np.testing.assert_allclose([fitted['a'],fitted['b'],fitted['c']],oracle.params,atol=1e-12)
        self.assertAlmostEqual(fitted['c_se'],oracle.bse[2],places=12)
        np.testing.assert_allclose([fitted['c_lower95'],fitted['c_upper95']],oracle.conf_int()[2],atol=1e-12)
    def test_fixed_population_and_no_lookahead(self):
        import json
        from engine.disagreement import OUT
        r=json.loads((OUT/'run-2/experiment.json').read_text())
        self.assertEqual(sum(b['games'] for b in r['buckets']['ANYA']),2639)
        self.assertEqual(sum(b['games'] for b in r['buckets']['nfelo']),946)
        for series in r['buckets'].values():
            for b in series:self.assertEqual(b['games'],b['wins']+b['losses']+b['pushes']+b['no_side'])
        for f in r['regressions']:self.assertLess(f['training_max_season'],f['evaluation_season'])
        self.assertFalse(r['positive_stable']);self.assertEqual(r['blend_status'],'CONDITION_NOT_MET_NOT_FITTED')
