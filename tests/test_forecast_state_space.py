import unittest
import numpy as np
from engine.forecast_system.state_space import C, constrain, predict, observation, observation_noise, update, stationary, preseason, reference_observations

class ConstrainedStateTests(unittest.TestCase):
    def test_constant_shift_preserves_every_matchup(self):
        x=np.random.default_rng(2026).normal(size=64)
        original,_=constrain(x,C)
        shifted,_=constrain(x+73.,C)
        for home in range(32):
            for away in range(32):
                if home!=away:
                    np.testing.assert_allclose(observation(home,away)@original,observation(home,away)@shifted,atol=2e-13)

    def test_stationary_covariance_converges_in_identified_subspace(self):
        self.assertEqual(np.linalg.matrix_rank(reference_observations()),63)
        for q,r in ((.001,10.),(.01,2.),(.5,.5)):
            p,info=stationary(q,r,.2)
            self.assertTrue(info['converged'])
            self.assertLess(info['max_change'],1e-10)
            np.testing.assert_allclose(p@np.ones(64),0,atol=1e-12)
            eigen=np.linalg.eigvalsh(p)
            self.assertGreater(eigen[1],0)
            self.assertGreater(eigen[0],-1e-12)
            self.assertGreater(info['offense_half_life'],0)

    def test_prediction_update_and_preseason_preserve_constraint(self):
        p,_=stationary(.01,2.,.2)
        x=np.zeros(64)
        x,p=predict(x,p,.01)
        x,p,*_=update(x,p,observation(0,1),[.3,-.4],observation_noise(2.,.2))
        p0,_=stationary(.01,2.,.2)
        x,p=preseason(x,p,p0,.7,[True]+[False]*31)
        self.assertAlmostEqual(float(x.sum()),0)
        np.testing.assert_allclose(p@np.ones(64),0,atol=1e-12)
        self.assertGreater(np.linalg.eigvalsh(p).min(),-1e-12)

    def test_bye_prediction_adds_constrained_noise_without_changing_mean(self):
        x,_=constrain(np.arange(64,dtype=float),C)
        new,p=predict(x,C,.05)
        np.testing.assert_array_equal(x,new)
        np.testing.assert_allclose(p,1.05*C,atol=1e-14)

    def test_known_strength_recovery_and_row_order(self):
        from engine.forecast_system.state_fit import replay
        rng=np.random.default_rng(401)
        true,_=constrain(rng.normal(0,.3,64),C)
        games=[]
        for week in range(1,81):
            order=rng.permutation(32)
            for i in range(0,32,2):
                h,a=map(int,order[i:i+2]);drives=np.array([10.,10.])
                actual=(2.+observation(h,a)@true+rng.normal(0,.04,2))*drives
                games.append(dict(game_id=f'{week:03}-{i:02}',season=2014,week=week,home_index=h,away_index=a,drives=drives,offset=np.zeros(2),actual=actual))
        first=replay(games,(.001,.5,.7),0.,2.,{})
        second=replay(list(reversed(games)),(.001,.5,.7),0.,2.,{})
        self.assertEqual(first[1],second[1])
        self.assertLess(np.sqrt(np.mean((first[2][0]-true)**2)),.08)
        self.assertAlmostEqual(first[3]['offense_half_life'],np.log(.5)/np.log1p(-first[3]['offense_gain']))

    def test_preseason_zero_retention_and_doubled_injection(self):
        p0,_=stationary(.01,2.,.2)
        mean,_=constrain(np.arange(64,dtype=float),p0)
        x,p=preseason(mean,3*p0,p0,0.,[False]*32)
        np.testing.assert_allclose(x,0,atol=1e-14)
        np.testing.assert_allclose(p,p0,atol=1e-13)
        x,p=preseason(mean,3*p0,p0,0.,[True]*32)
        np.testing.assert_allclose(p,2*p0,atol=1e-13)

    def test_reference_half_life_responds_to_injected_noise(self):
        _,base=stationary(.01,2.,.2)
        _,more_process=stationary(.1,2.,.2)
        _,more_observation=stationary(.01,4.,.2)
        self.assertLess(more_process['offense_half_life'],base['offense_half_life'])
        self.assertGreater(more_observation['offense_half_life'],base['offense_half_life'])

