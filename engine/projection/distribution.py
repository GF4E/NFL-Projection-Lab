"""Empirical integer residual distributions, with no smoothing or parametric shape."""
from collections import Counter
import math
from .model import hash_value


def integer(value):
    if not math.isfinite(value):raise ValueError('Finite value required')
    return int(math.copysign(math.floor(abs(value)+.5),value))


def residual_distribution(residuals, source_hash):
    values=[integer(x) for x in residuals]
    if not values:raise ValueError('Out-of-fold residuals required')
    c=Counter(values);counts={str(k):c[k] for k in range(min(c),max(c)+1)}
    body={'counts':counts,'n':len(values),'source_hash':source_hash,'rounding':'nearest integer, half away from zero'}
    return {**body,'sha256':hash_value(body)}


def pmf(distribution, center):
    d=distribution;body={k:v for k,v in d.items() if k!='sha256'}
    if hash_value(body)!=d['sha256']:raise ValueError('Residual artifact hash mismatch')
    if d['n']<=0 or sum(d['counts'].values())!=d['n']:raise ValueError('Invalid empirical sample size')
    if any(int(k)!=float(k) or v<0 for k,v in d['counts'].items()):raise ValueError('Invalid integer mass')
    c=integer(center)
    return {c+int(k):v/d['n'] for k,v in d['counts'].items()}


def quantile(mass, probability):
    cumulative=0.
    for value,p in sorted(mass.items()):
        cumulative+=p
        if cumulative+1e-14>=probability:return value
    return max(mass)


def summarize(away_points,home_points,residuals):
    if not all(math.isfinite(x) for x in (away_points,home_points)):raise ValueError('Finite team points required')
    margin=home_points-away_points;total=home_points+away_points
    m=pmf(residuals['margin'],margin);t=pmf(residuals['total'],total)
    tie=m.get(0,0.);home=sum(p for x,p in m.items() if x>0)+tie/2
    intervals={target:{str(level):[quantile(mass,(1-level/100)/2),quantile(mass,1-(1-level/100)/2)] for level in (50,80)} for target,mass in [('margin',m),('total',t)]}
    return {'away_points':away_points,'home_points':home_points,'margin':margin,'total':total,'home_win_probability':home,'away_win_probability':1-home,'tie_probability':tie,'intervals':intervals}
