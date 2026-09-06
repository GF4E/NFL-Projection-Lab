"""RF-COMP-01 candidate only: exact Poisson CDF and flat-array JSON shortcuts.

No historical entry point or global patch. Unsupported domains delegate to the
frozen implementation. Qualification is specific to the pinned runtime.
"""
import json
import math

import numpy as np
from scipy.special import pdtr
from scipy.stats import poisson, skellam

from research_score_contract import encoded
from research_score_distribution import NumericalFailure, _finite
from research_score_compute_distribution import MemoizedDistribution
from research_score_metrics import score_forecast as legacy_score_forecast

VERSION = 'rf.compute-probability.v1'


def poisson_cdf(value, rate):
    """Shortcut the validated internal domain; keep original generic fallback."""
    if type(rate) not in (float, np.float64) or not math.isfinite(rate) or rate <= 0:
        return poisson.cdf(value, rate)
    if type(value) is int and -(2**53) <= value <= 2**53:
        if value < 0:
            return np.float64(0.)
        return np.clip(pdtr(value, rate), 0., 1.)
    if type(value) is np.ndarray and value.ndim == 1 and value.dtype == np.dtype('float64'):
        if (np.all(np.isfinite(value)) and np.all(np.abs(value) <= 2**53)
                and np.all(value == np.floor(value))):
            result = np.zeros(value.shape, dtype='d')
            supported = value >= 0
            if np.any(supported):
                result[supported] = np.clip(pdtr(value[supported], rate), 0., 1.)
            return result
    return poisson.cdf(value, rate)


def encode_flat_floats(value):
    """Return the original indented JSON bytes, using C float-token encoding."""
    if type(value) is not list or not all(type(x) is float and math.isfinite(x) for x in value):
        return encoded(value)
    if not value:
        return b'[]\n'
    compact = json.dumps(value, separators=(',', ':'), allow_nan=False).encode()
    return b'[\n  ' + compact[1:-1].replace(b',', b',\n  ') + b'\n]\n'


def _cdf(law, target, value):
    # Preserve original empirical arithmetic, CDF guards and accumulation order.
    # Only the Poisson cdf calls below use the guarded helper; sf/Skellam stay.
    k = math.floor(value)
    r, s = law.rates
    if target in ('home', 'away'):
        side = 0 if target == 'home' else 1
        answer = float(law.alpha[law.atoms[:, side] <= k].sum()) + law.beta * float(poisson_cdf(k, law.rates[side]))
    elif target in ('total', 'margin') and not law.independent:
        values = law.atoms[:, 0] + law.atoms[:, 1] if target == 'total' else law.atoms[:, 0] - law.atoms[:, 1]
        background = poisson_cdf(k, r + s) if target == 'total' else skellam.cdf(k, r, s)
        answer = float(law.alpha[values <= k].sum()) + law.beta * float(background)
    elif target in ('total', 'margin'):
        h, ph = law._marginal_atoms(0)
        a, pa = law._marginal_atoms(1)
        values = h[:, None] + a if target == 'total' else h[:, None] - a
        answer = float((np.outer(ph, pa) * (values <= k)).sum())
        if target == 'total':
            answer += law.beta * float(ph @ poisson_cdf(k - h, s) + pa @ poisson_cdf(k - a, r))
            answer += law.beta ** 2 * float(poisson_cdf(k, r + s))
        else:
            answer += law.beta * float(ph @ poisson.sf(h - k - 1, s) + pa @ poisson_cdf(k + a, r))
            answer += law.beta ** 2 * float(skellam.cdf(k, r, s))
    else:
        raise NumericalFailure('unknown_target')
    _finite(answer)
    if not -1e-12 <= answer <= 1 + 1e-12:
        raise NumericalFailure('invalid_cdf_probability')
    return min(1.0, max(0.0, answer))


class ProbabilityDistribution(MemoizedDistribution):
    """Keep the frozen per-score memoization policy over the candidate CDF."""

    def cdf(self, target, value):
        key = (target, math.floor(value))
        try:
            return self._cdf_cache[key]
        except TypeError:
            return _cdf(self, target, value)
        except KeyError:
            answer = _cdf(self, target, value)
            self._cdf_cache[key] = answer
            return answer


def score_forecast(distribution, observed, game_id, double_grid=True, diagnostics=True):
    return legacy_score_forecast(ProbabilityDistribution(distribution), observed, game_id,
                                 double_grid=double_grid, diagnostics=diagnostics)
