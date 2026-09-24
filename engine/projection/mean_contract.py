"""Read-only forecast-meaning checks; never fit, repair, select or release a model.

The existing legacy model need not pass this future expected-score contract.
Separate marginal agreement is necessary but cannot establish a joint model.
"""
import math

TARGETS = ('home_points', 'away_points', 'margin', 'total')
TOLERANCE = 1e-10
CDF_TOLERANCE = 1e-14


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def distribution(value):
    if not isinstance(value, dict) or not value:
        raise ValueError('Nonempty discrete probability distribution required')
    if any(type(k) is not int or not finite(p) or p < 0 for k, p in value.items()):
        raise ValueError('Integer outcomes and finite nonnegative probabilities required')
    if abs(math.fsum(value.values()) - 1) > TOLERANCE:
        raise ValueError('Probability mass must sum to one; no normalization applied')
    return {k: p for k, p in sorted(value.items()) if p > 0}


def quantile(mass, probability):
    cumulative = 0.
    for k, p in sorted(mass.items()):
        cumulative = math.fsum((cumulative, p))
        if cumulative + CDF_TOLERANCE >= probability:
            return k
    raise ValueError('CDF does not reach requested quantile')


def assess(points, marginals, *, intervals, probabilities, contributions=None, joint=None):
    """Return named shortcomings; malformed inputs fail instead of being repaired.

    `joint` is explicit finite support: home_points, away_points, probability.
    No joint is constructed from marginal distributions. Only a supplied and
    matched joint can establish coherence. A result is not release authority.
    """
    if set(points) != set(TARGETS) or any(not finite(v) for v in points.values()):
        raise ValueError('Four finite full-precision point forecasts required')
    if set(marginals) != set(TARGETS):
        raise ValueError('Four explicit marginal distributions required')
    masses = {k: distribution(marginals[k]) for k in TARGETS}
    means = {k: math.fsum(x*p for x, p in m.items()) for k, m in masses.items()}
    issues = []
    def flag(condition, name):
        if condition:
            issues.append(name)
    for k in TARGETS:
        flag(abs(points[k]-means[k]) > TOLERANCE, 'POINT_IS_NOT_DISTRIBUTION_MEAN:'+k)
        flag(k != 'margin' and any(x < 0 for x in masses[k]), 'NEGATIVE_SCORE_SUPPORT:'+k)
    for k, sign in [('total', 1), ('margin', -1)]:
        flag(abs(points[k]-(points['home_points']+sign*points['away_points'])) > TOLERANCE,
             'POINT_LINEAR_IDENTITY:'+k)
        flag(abs(means[k]-(means['home_points']+sign*means['away_points'])) > TOLERANCE,
             'MARGINAL_MEAN_LINEAR_IDENTITY:'+k)
    if not isinstance(intervals, dict) or set(intervals) != set(TARGETS):
        raise ValueError('All four targets require explicit intervals')
    for k, mass in masses.items():
        if set(intervals[k]) != {'50', '80'}:
            raise ValueError('Explicit 50 and 80 percent intervals required')
        for label, low, high in [('50', .25, .75), ('80', .10, .90)]:
            band = intervals[k][label]
            if not isinstance(band, (list, tuple)) or len(band) != 2 or any(type(v) is not int for v in band):
                raise ValueError('Integer interval endpoints required')
            flag(list(band) != [quantile(mass, low), quantile(mass, high)],
                 'INTERVAL_DIFFERS_FROM_DISTRIBUTION:'+k+':'+label)
        outer, inner = intervals[k]['80'], intervals[k]['50']
        flag(not outer[0] <= inner[0] <= inner[1] <= outer[1], 'UNNESTED_INTERVALS:'+k)
    margin = masses['margin']
    home = math.fsum(p for x, p in margin.items() if x > 0)
    away = math.fsum(p for x, p in margin.items() if x < 0)
    tie = margin.get(0, 0.)
    expected = {'home_strict_win_probability': home, 'away_strict_win_probability': away,
                'tie_probability': tie, 'home_win_probability': home+tie/2,
                'away_win_probability': away+tie/2}
    if set(probabilities) != set(expected):
        raise ValueError('Strict win, tie and separately named tie-split probabilities required')
    for name, p in probabilities.items():
        if not finite(p) or not 0 <= p <= 1:
            raise ValueError('Probability outside zero to one')
        flag(abs(p-expected[name]) > TOLERANCE, 'PROBABILITY_EVENT_MISMATCH:'+name)
    if contributions is None:
        issues.append('CONTRIBUTION_EVIDENCE_MISSING')
    else:
        if set(contributions) != {'home', 'away'}:
            raise ValueError('Both team contribution tables required')
        for side, rows in contributions.items():
            if not isinstance(rows, list) or not rows or any(not isinstance(r, dict) or not finite(r.get('points')) for r in rows):
                raise ValueError('Explicit finite contribution rows required')
            flag(any(r.get('status') == 'INACTIVE' and abs(r['points']) > TOLERANCE for r in rows),
                 'INACTIVE_CONTRIBUTION_NONZERO:'+side)
            flag(abs(math.fsum(r['points'] for r in rows)-points[side+'_points']) > TOLERANCE,
                 'CONTRIBUTION_SUM_MISMATCH:'+side)
    joint_status = 'NOT_ESTABLISHED'
    if joint is None:
        issues.append('JOINT_EVIDENCE_MISSING')
    else:
        if not isinstance(joint, list) or not joint:
            raise ValueError('Nonempty explicit joint score support required')
        cells = {}
        for row in joint:
            if not isinstance(row, dict) or set(row) != {'home_points', 'away_points', 'probability'}:
                raise ValueError('Exact joint support row required')
            h, a, p = row['home_points'], row['away_points'], row['probability']
            if type(h) is not int or type(a) is not int or min(h, a) < 0 or not finite(p) or p < 0:
                raise ValueError('Nonnegative integer joint scores and finite probabilities required')
            if (h, a) in cells:
                raise ValueError('Duplicate joint outcome; explicit aggregation required')
            cells[(h, a)] = p
        if abs(math.fsum(cells.values())-1) > TOLERANCE:
            raise ValueError('Joint probability mass must sum to one')
        derived = {k: {} for k in TARGETS}
        for (h, a), p in sorted(cells.items()):
            for k, x in zip(TARGETS, (h, a, h-a, h+a)):
                derived[k].setdefault(x, []).append(p)
        differences = []
        for k in TARGETS:
            for x in set(masses[k]) | set(derived[k]):
                if abs(masses[k].get(x, 0.)-math.fsum(derived[k].get(x, []))) > TOLERANCE:
                    differences.append(k)
                    break
        for k in differences:
            issues.append('JOINT_MARGINAL_MISMATCH:'+k)
        joint_status = 'INCOMPATIBLE_WITH_SUPPLIED_JOINT' if differences else 'VERIFIED_SUPPLIED_JOINT'
    return {'schema': 'expected-score-contract-assessment-v1',
            'expected_score_contract_met': not issues, 'violations': sorted(issues),
            'distribution_means': means, 'joint_status': joint_status,
            'numeric_tolerance': TOLERANCE, 'cdf_tolerance': CDF_TOLERANCE,
            'home_win_probability_field': 'P(home strict win) + 0.5 P(tie)',
            'support_check_scope': 'Nonnegative integer scores; not a football scoring-path model',
            'statistical_mean_accuracy': 'NOT_ESTABLISHED_BY_ARITHMETIC',
            'scope': 'READ_ONLY_DIAGNOSTIC; not an E-CAL gate or release authorization',
            'activates_method': False}


def require_expected_score_contract(*args, **kwargs):
    result = assess(*args, **kwargs)
    if not result['expected_score_contract_met']:
        raise ValueError('EXPECTED_SCORE_CONTRACT_NOT_MET: '+', '.join(result['violations']))
    return result
