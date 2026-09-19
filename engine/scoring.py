"""Pinned probability scoring adapter. No forecast or fitting inputs are changed.

Attribution: frazane/scoringrules 0.10.0, Apache-2.0. See HARVEST.md.
"""
import math
from importlib.metadata import version
import numpy as np
import scoringrules as sr
if version('scoringrules')!='0.10.0':raise RuntimeError('Scoring runtime must use scoringrules==0.10.0')

def _ensemble(values,actual):
 x=np.asarray(values,dtype=float)
 if x.ndim!=1 or not len(x) or not np.isfinite(x).all() or not math.isfinite(actual):raise ValueError('Finite nonempty univariate ensemble required')
 return x

def crps(values,actual):
 x=_ensemble(values,actual)
 return float(sr.crps_ensemble(float(actual),x,estimator='nrg',backend='numpy'))

def pmf_crps(mass,actual):
 pairs=sorted(mass.items());x=_ensemble([x for x,p in pairs],actual);weights=np.asarray([p for x,p in pairs],dtype=float)
 if not np.isfinite(weights).all() or (weights<0).any() or not math.isclose(float(weights.sum()),1.,abs_tol=1e-12,rel_tol=0):raise ValueError('Normalized finite PMF required')
 return float(sr.crps_ensemble(float(actual),x,ens_w=weights,estimator='nrg',backend='numpy'))

def interval_score(lo,hi,actual,level):
 if not 0<level<1 or lo>hi or not all(math.isfinite(v) for v in (lo,hi,actual)):raise ValueError('Invalid interval')
 return float(sr.interval_score(float(actual),float(lo),float(hi),1-level,backend='numpy'))

def brier(probability,outcome):
 if not 0<=probability<=1 or outcome not in (0,.5,1):raise ValueError('Invalid probability/outcome')
 # Preserve legacy fractional tie target using binary-library identity.
 if outcome==.5:return .5*(float(sr.brier_score(0.,float(probability),backend='numpy'))+float(sr.brier_score(1.,float(probability),backend='numpy')))-.25
 return float(sr.brier_score(float(outcome),float(probability),backend='numpy'))

def tail_crps(values,actual,lo80,hi80):
 x=_ensemble(values,actual)
 if not all(math.isfinite(v) for v in (lo80,hi80)) or lo80>hi80:raise ValueError('Invalid fixed forecast bounds')
 def chain(v):return np.minimum(v,lo80)+np.maximum(v-hi80,0)
 return float(sr.twcrps_ensemble(float(actual),x,v_func=chain,estimator='nrg',backend='numpy'))

def tail_pmf_crps(mass,actual,lo80,hi80):
 # Validation is shared with exact weighted CRPS; no Monte Carlo approximation.
 pmf_crps(mass,actual)
 if not all(math.isfinite(v) for v in (lo80,hi80)) or lo80>hi80:raise ValueError('Invalid fixed forecast bounds')
 pairs=sorted(mass.items());x=np.asarray([v for v,p in pairs]);w=np.asarray([p for v,p in pairs])
 def chain(v):return np.minimum(v,lo80)+np.maximum(v-hi80,0)
 return float(sr.twcrps_ensemble(float(actual),x,ens_w=w,v_func=chain,estimator='nrg',backend='numpy'))
