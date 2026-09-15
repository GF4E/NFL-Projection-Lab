"""Pure verification functions. No I/O, model fitting, or provider imports."""
import math
import numpy as np
from .postprocess import empirical_crps


def verify(samples, actual):
    x = np.asarray(samples, dtype=float)
    score = empirical_crps(x, actual)
    result = dict(crps=score, median=float(np.median(x)),
                  spread=float(np.std(x)),
                  pit=float(np.mean(x < actual)+.5*np.mean(x == actual)))
    for level in (50, 80):
        alpha = 1-level/100
        lo, hi = np.quantile(x, [alpha/2, 1-alpha/2])
        result[str(level)] = dict(lower=float(lo), upper=float(hi),
                                 covered=bool(lo <= actual <= hi), width=float(hi-lo),
                                 interval_score=float(hi-lo+2/alpha*max(lo-actual, 0)+2/alpha*max(actual-hi, 0)))
    return result


def skill(predicted, actual, climatology):
    p, y, c = [np.asarray(a, dtype=float) for a in (predicted, actual, climatology)]
    if p.shape != y.shape or p.shape != c.shape or p.ndim != 1 or not p.size:
        raise ValueError('Identical nonempty score populations required')
    if not all(np.isfinite(a).all() for a in (p, y, c)):
        raise ValueError('Finite scores required')
    denominator = float(np.mean((c-y)**2))
    return None if denominator == 0 else 1-float(np.mean((p-y)**2))/denominator


def reliability(probabilities, outcomes):
    if len(probabilities) != len(outcomes):
        raise ValueError('Paired probabilities and outcomes required')
    bins = [[] for _ in range(10)]
    losses = []
    for p, y in zip(probabilities, outcomes):
        if not math.isfinite(p) or not 0 <= p <= 1 or y not in (0, 1):
            raise ValueError('Binary event and probability required')
        bins[min(int(p*10), 9)].append((p, y))
        losses.append((p-y)**2)
    return dict(brier=float(np.mean(losses)) if losses else None,
                bins=[dict(lower=i/10, upper=(i+1)/10, count=len(b),
                           predicted=float(np.mean([p for p,y in b])) if b else None,
                           observed=float(np.mean([y for p,y in b])) if b else None)
                      for i,b in enumerate(bins)])
