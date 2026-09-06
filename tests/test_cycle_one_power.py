import importlib.util
from pathlib import Path
import unittest
import numpy as np
spec=importlib.util.spec_from_file_location('power',Path(__file__).resolve().parents[1]/'scripts/cycle_one_power.py')
p=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
class PowerTests(unittest.TestCase):
    def test_paired_constant_ratios(self):
        w=np.array([[1,2,2,4],[3,6,6,12]],float)
        s=p.sample_sums([w],3,6,100,np.random.default_rng(2))
        np.testing.assert_allclose(s[:,:2]/s[:,2:],.5)
    def test_reproducibility(self):
        w=[np.arange(1,33).reshape(8,4)]
        np.testing.assert_array_equal(p.sample_sums(w,2,3,100,np.random.default_rng(4)),p.sample_sums(w,2,3,100,np.random.default_rng(4)))
    def test_block_preserves_whole_season(self):
        w=np.arange(1,25).reshape(6,4)
        s=p.sample_sums([w],1,6,20,np.random.default_rng(9))
        np.testing.assert_array_equal(s,np.tile(w.sum(axis=0),(20,1)))
    def test_exact_gain_constant_template(self):
        r=np.full((1000,2),.9)
        np.testing.assert_allclose(p.lower_bounds(r,r,np.array([.9,.9]),.075,.025),.075)
    def test_lower_bound_direction(self):
        cal=np.tile(np.linspace(.8,1.2,1000)[:,None],(1,2)); sim=np.ones((1000,2))
        self.assertTrue(np.all(p.lower_bounds(sim,cal,np.ones(2),.075,.025)<.075))
    def test_gain_grid(self): self.assertEqual(p.GAINS,[0,.01,.025,.05,.075,.1])
if __name__=='__main__': unittest.main()
