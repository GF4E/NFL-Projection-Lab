"""Constrained football-only PPD Kalman primitives; no data access or activation."""
import numpy as np

DIM = 64
C = np.eye(DIM) - np.ones((DIM, DIM))/DIM


def constrain(mean, covariance):
    mean = np.asarray(mean, dtype=float)
    covariance = np.asarray(covariance, dtype=float)
    if mean.shape != (DIM,) or covariance.shape != (DIM, DIM):
        raise ValueError('Expected 64 states and a 64 by 64 covariance')
    # Algebraically C @ P @ C.T, without two dense matrix products.
    p = covariance-covariance.mean(axis=0)[None, :]-covariance.mean(axis=1)[:, None]+covariance.mean()
    return mean-mean.mean(), (p+p.T)/2


def predict(mean, covariance, q):
    if not 0.001 <= q <= 0.5:
        raise ValueError('q outside registered bounds')
    return constrain(mean, covariance+q*C)


def observation(home, away):
    if home == away or not (0 <= home < 32 and 0 <= away < 32):
        raise ValueError('Two distinct team indices required')
    h = np.zeros((2, DIM))
    h[0, home], h[0, 32+away] = 1, -1
    h[1, away], h[1, 32+home] = 1, -1
    return h


def observation_noise(r, rho):
    if not 0.5 <= r <= 10 or not -1 < rho < 1:
        raise ValueError('Registered r bounds and nonsingular correlation required')
    return r*np.array([[1., rho], [rho, 1.]])


def update(mean, covariance, h, residual_observation, noise):
    """Observation is (actual points - known offsets)/drives - league PPD."""
    cross = covariance@h.T
    innovation = np.asarray(residual_observation)-h@mean
    s = h@cross+noise
    gain = np.linalg.solve(s, cross.T).T
    # Joseph form keeps covariance PSD in long chronological replays.
    a = np.eye(DIM)-gain@h
    p = covariance-gain@cross.T-cross@gain.T+gain@s@gain.T
    x, p = constrain(mean+gain@innovation, p)
    sign, logdet = np.linalg.slogdet(s)
    if sign <= 0:
        raise ValueError('Nonpositive innovation covariance')
    likelihood = -0.5*(len(innovation)*np.log(2*np.pi)+logdet+innovation@np.linalg.solve(s, innovation))
    return x, p, float(likelihood), innovation, gain


def reference_observations():
    """32 virtual matchups: each offense/defense against league-average state.

    Each pair is own scoring and virtual opponent scoring, in PPD. This defines
    a symmetric reference, not an additional historical likelihood dataset.
    """
    h = np.zeros((64, 64))
    for team in range(32):
        h[2*team, team] = 1
        h[2*team, 32:] = -1/32
        h[2*team+1, :32] = 1/32
        h[2*team+1, 32+team] = -1
    return h


def stationary(q, r, rho, tolerance=1e-10, cap=10000):
    h = reference_observations()
    noise = np.kron(np.eye(32), observation_noise(r, rho))
    p = np.zeros((DIM, DIM))
    gain = None
    for iteration in range(1, cap+1):
        _, prior = predict(np.zeros(DIM), p, q)
        cross = prior@h.T
        gain = np.linalg.solve(h@cross+noise, cross.T).T
        a = np.eye(DIM)-gain@h
        _, new = constrain(np.zeros(DIM), a@prior@a.T+gain@noise@gain.T)
        error = float(np.max(np.abs(new-p)))
        p = new
        if error < tolerance:
            break
    converged = error < tolerance
    effective = gain@h
    k_off = float(np.diag(effective)[:32].mean())
    k_def = float(np.diag(effective)[32:].mean())
    def half(k):
        return float(np.log(.5)/np.log1p(-k)) if 0 < k < 1 else None
    return p, dict(iterations=iteration, converged=converged, max_change=error,
                   diagonal=p.diagonal().tolist(), offense_gain=k_off, defense_gain=k_def,
                   offense_half_life=half(k_off), defense_half_life=half(k_def),
                   diagnostic_label='Steady-state approximation; uninterrupted weekly reference schedule only')


def preseason(mean, covariance, p0, retention, changed):
    if not 0 <= retention <= 1 or len(changed) != 32:
        raise ValueError('Registered retention and 32 transition flags required')
    # Congruence scaling doubles the flagged marginal injection while preserving
    # PSD and scaling cross-covariances coherently before imposing the constraint.
    scale = np.sqrt(np.tile(np.where(changed, 2., 1.), 2))
    injection = scale[:, None]*p0*scale[None, :]
    return constrain(retention*mean, retention**2*covariance+(1-retention**2)*injection)
