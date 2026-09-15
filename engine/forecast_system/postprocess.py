"""Prior-three-season empirical CRPS postprocessing (Addendum C).

Only a season loader can supply fitting data. The loader is never called for
the issuing season. Archived core forecasts must carry a training cutoff.
"""
import hashlib
import json
import math

import numpy as np
from scipy.optimize import minimize


def empirical_crps(samples, actual):
    x = np.sort(np.asarray(samples, dtype=float))
    if x.ndim != 1 or not len(x) or not np.isfinite(x).all() or not math.isfinite(actual):
        raise ValueError('Finite nonempty univariate distribution required')
    n = len(x)
    return float(np.mean(np.abs(x - actual)) - np.dot(2*np.arange(n)-n+1, x)/(n*n))


def _design(core):
    return np.column_stack([np.ones(len(core)), core, core < 20, core > 27])


def fit(issuing_season, load_season):
    """Fit a,b,c and two identified band offsets; return a frozen artifact.

    Rows: row_id, season, core_median, actual, trained_through_season.
    The training cutoff asserts the core forecast's chronological provenance;
    the phase runner must verify it against the archived core fit manifest.
    """
    rows = []
    years = list(range(issuing_season-3, issuing_season))
    for year in years:
        batch = list(load_season(year))
        if not batch:
            raise ValueError(f'Missing OOF calibration season {year}')
        for r in batch:
            if r['season'] != year or r['trained_through_season'] >= year:
                raise ValueError('Nonchronological core calibration forecast')
            rows.append({k: r[k] for k in ('row_id', 'season', 'core_median', 'actual', 'trained_through_season')})
    rows.sort(key=lambda r: (r['season'], r['row_id']))
    if len({r['row_id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate calibration row')
    core = np.array([r['core_median'] for r in rows], dtype=float)
    actual = np.array([r['actual'] for r in rows], dtype=float)
    if not np.isfinite(core).all() or not np.isfinite(actual).all():
        raise ValueError('Nonfinite calibration observation')
    design = _design(core)
    if np.linalg.matrix_rank(design) != 4:
        raise ValueError('Insufficient independent observations for all point bands')
    residual = np.sort(actual-core)
    residual -= np.median(residual)
    prefix = np.r_[0., np.cumsum(residual)]
    n = len(residual)
    pair = float(np.dot(2*np.arange(n)-n+1, residual)/(n*n))

    def objective(theta):
        scale = theta[4]
        if scale <= 0:
            return float('inf')
        z = (actual-design@theta[:4])/scale
        k = np.searchsorted(residual, z, side='right')
        # E|R-z| via prefix sums, without an n-by-n allocation.
        absolute = (z*k-prefix[k] + prefix[-1]-prefix[k]-z*(n-k))/n
        return float(scale*(np.mean(absolute)-pair))

    start = np.r_[np.linalg.lstsq(design, actual, rcond=None)[0], 1.]
    result = minimize(objective, start, method='Powell',
                      bounds=[(None, None)]*4+[(1e-6, None)],
                      options={'maxiter': 1000, 'maxfev': 30000, 'xtol': 1e-9, 'ftol': 1e-10})
    if not result.success or not np.isfinite(result.x).all():
        raise ValueError('CRPS fit did not converge')
    a, b, low, high, c = map(float, result.x)
    body = dict(schema='forecast-system-v2-emos-1', issuing_season=issuing_season,
                calibration_seasons=years, a=a, b=b, c=c,
                band_offsets={'under_20': low, '20_to_27': 0., 'over_27': high},
                residuals=residual.tolist(), parameters=5, team_observations=n,
                training_sha256=hashlib.sha256(json.dumps(rows, sort_keys=True, allow_nan=False).encode()).hexdigest(),
                fit_crps=float(result.fun), inert_slope_scale=abs(b-1)<=.05 and abs(c-1)<=.05)
    body['sha256'] = hashlib.sha256(json.dumps(body, sort_keys=True, allow_nan=False).encode()).hexdigest()
    return body


def distribution(artifact, core_median):
    body = {k: v for k, v in artifact.items() if k != 'sha256'}
    if hashlib.sha256(json.dumps(body, sort_keys=True, allow_nan=False).encode()).hexdigest() != artifact['sha256']:
        raise ValueError('Postprocessor artifact hash mismatch')
    if not math.isfinite(core_median):
        raise ValueError('Finite core median required')
    key = 'under_20' if core_median < 20 else 'over_27' if core_median > 27 else '20_to_27'
    center = artifact['a']+artifact['b']*core_median+artifact['band_offsets'][key]
    return center+artifact['c']*np.array(artifact['residuals'])
