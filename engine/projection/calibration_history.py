"""Explicit earlier-error banks for historical qualification; not activated live.

Source authority and feature-vintage qualification remain the caller's job.
This module enforces the declared population, identities, clocks and arithmetic.
It never fits a point model or changes point forecasts.
"""
import copy
import datetime as dt
import math
import re
from .calibration_json import digest as hash_value
from .distribution import residual_distribution, pmf, quantile, summarize
from engine.forecast_system.calendar import timestamp

SCHEMA = 'prior-season-empirical-calibration-v1'
ROW_KEYS = {'game_id', 'season', 'home', 'away', 'actual_home', 'actual_away',
            'issuance_at', 'label_available_at', 'fit_evidence_sha256'}
FIT_KEYS = {'method_sha256', 'available_at', 'training_game_ids', 'last_label_available_at'}


def digest(value):
    if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
        raise ValueError('Invalid SHA256 identity')
    return value


def finite(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Finite numeric value required')
    return value


def build(history, fits, *, expected_game_ids, donor_method_sha256, point_method_sha256,
          relation, target_season, fitted_at, cadence, source_refs):
    """Create a bank on exactly the declared prior-season donor population."""
    digest(donor_method_sha256); digest(point_method_sha256)
    if relation not in ('OWN_LINEAGE', 'DECLARED_LEGACY_DONOR'):
        raise ValueError('Explicit lineage relation required')
    if relation == 'OWN_LINEAGE' and donor_method_sha256 != point_method_sha256:
        raise ValueError('Own-lineage method mismatch')
    if type(target_season) is not int or cadence not in ('OFFSEASON', 'WEEK9'):
        raise ValueError('Unsupported calibration season/cadence')
    at = timestamp(fitted_at)
    expected = sorted(expected_game_ids)
    if not expected or len(set(expected)) != len(expected) or any(not isinstance(g, str) or not g for g in expected):
        raise ValueError('Explicit unique nonempty calibration population required')
    sources = copy.deepcopy(source_refs)
    if not sources:
        raise ValueError('Source references required')
    for r in sources:
        if set(r) != {'path', 'sha256'} or not isinstance(r['path'], str) or not r['path']:
            raise ValueError('Invalid source reference')
        digest(r['sha256'])
    selected = []
    seen = set()
    used_fits = {}
    fit_checks = {}
    for row in history:
        if type(row.get('season')) is not int:
            raise ValueError('Invalid donor season')
        if row['season'] >= target_season:
            continue
        if set(row) != ROW_KEYS or row['game_id'] in seen:
            raise ValueError('Invalid or duplicate donor row')
        seen.add(row['game_id'])
        issue = timestamp(row['issuance_at'])
        label_at = timestamp(row['label_available_at'])
        if label_at < issue + dt.timedelta(minutes=75, hours=4) or label_at >= at:
            raise ValueError('Outcome unavailable at calibration fitting')
        fit_hash = digest(row['fit_evidence_sha256'])
        if fit_hash not in used_fits:
            manifest = fits.get(fit_hash)
            if not manifest or set(manifest) != FIT_KEYS or hash_value(manifest) != fit_hash:
                raise ValueError('Missing or mismatched donor fit manifest')
            if manifest['method_sha256'] != donor_method_sha256:
                raise ValueError('Donor method mismatch')
            fit_at = timestamp(manifest['available_at'])
            last_label = timestamp(manifest['last_label_available_at'])
            training = manifest['training_game_ids']
            if (not isinstance(training, list) or len(set(training)) != len(training)
                    or any(not isinstance(g, str) or not g for g in training)):
                raise ValueError('Invalid/self-trained donor population')
            used_fits[fit_hash] = copy.deepcopy(manifest)
            fit_checks[fit_hash] = (fit_at, last_label, set(training))
        fit_at, last_label, training = fit_checks[fit_hash]
        if fit_at >= issue or last_label >= fit_at:
            raise ValueError('Donor fit unavailable at issuance')
        if row['game_id'] in training:
            raise ValueError('Invalid/self-trained donor population')
        for side in ('home', 'away'):
            finite(row[side])
            actual = finite(row['actual_'+side])
            if actual < 0 or actual != int(actual):
                raise ValueError('Actual team scores must be nonnegative integers')
        selected.append(copy.deepcopy(row))
    if sorted(seen) != expected:
        raise ValueError('Calibration population mismatch; no games dropped')
    selected.sort(key=lambda r: r['game_id'])
    evidence = {'rows': selected, 'fits': used_fits, 'donor_method_sha256': donor_method_sha256}
    errors = {'team_points': [], 'margin': [], 'total': []}
    for row in selected:
        he, ae = row['actual_home'] - row['home'], row['actual_away'] - row['away']
        errors['team_points'].extend((he, ae))
        errors['margin'].append(he - ae)
        errors['total'].append(he + ae)
    source_hash = hash_value(evidence)
    body = {'schema': SCHEMA, 'donor_method_sha256': donor_method_sha256,
            'point_method_sha256': point_method_sha256, 'relation': relation,
            'target_season': target_season, 'fitted_at': at.isoformat(), 'cadence': cadence,
            'expected_game_ids': expected, 'source_refs': sorted(sources, key=lambda r: (r['path'], r['sha256'])),
            'evidence': evidence,
            'shapes': {k: residual_distribution(v, source_hash) for k, v in errors.items()},
            'semantics': 'LEGACY_CENTERS; raw paired errors; separate marginals; negative mass retained'}
    return {**body, 'sha256': hash_value(body)}


def validate(bank, *, expected_sha256):
    digest(expected_sha256)
    if bank.get('schema') != SCHEMA or bank.get('sha256') != expected_sha256:
        raise ValueError('Calibration reference mismatch')
    if hash_value({k: v for k, v in bank.items() if k != 'sha256'}) != expected_sha256:
        raise ValueError('Calibration bank content changed')
    rebuilt = build(bank['evidence']['rows'], bank['evidence']['fits'],
                    **{k: bank[k] for k in ('expected_game_ids', 'donor_method_sha256', 'point_method_sha256',
                                           'relation', 'target_season', 'fitted_at', 'cadence', 'source_refs')})
    if rebuilt != bank:
        raise ValueError('Calibration bank does not reproduce from donor evidence')
    return bank


def attach(points, bank, *, expected_sha256, point_method_sha256, season, issuance_at):
    """Attach historical uncertainty; input point values are preserved exactly."""
    validate(bank, expected_sha256=expected_sha256)
    return _attach(points, bank, point_method_sha256=point_method_sha256, season=season, issuance_at=issuance_at)


def attach_many(forecasts, bank, *, expected_sha256, point_method_sha256):
    """Validate once per bank, not once per game in a historical season."""
    validate(bank, expected_sha256=expected_sha256)
    if not forecasts or any(set(r) != {'game_id', 'season', 'issuance_at', 'points'} for r in forecasts):
        raise ValueError('Explicit forecast batch required')
    if len({r['game_id'] for r in forecasts}) != len(forecasts):
        raise ValueError('Duplicate forecast game')
    return {r['game_id']: _attach(r['points'], bank, point_method_sha256=point_method_sha256,
                                  season=r['season'], issuance_at=r['issuance_at'])
            for r in sorted(forecasts, key=lambda r: r['game_id'])}


def _attach(points, bank, *, point_method_sha256, season, issuance_at):
    if point_method_sha256 != bank['point_method_sha256'] or season != bank['target_season']:
        raise ValueError('Calibration receiver lineage/season mismatch')
    if timestamp(bank['fitted_at']) >= timestamp(issuance_at):
        raise ValueError('Calibration unavailable at issuance')
    if set(points) != {'away_points', 'home_points', 'margin', 'total'}:
        raise ValueError('Exact point-only forecast required')
    for value in points.values():
        finite(value)
    result = summarize(points['away_points'], points['home_points'], bank['shapes'])
    if any(result[k] != points[k] for k in points):
        raise ValueError('Point forecast changed or inconsistent before attachment')
    masses = {'away_points': pmf(bank['shapes']['team_points'], points['away_points']),
              'home_points': pmf(bank['shapes']['team_points'], points['home_points']),
              'margin': pmf(bank['shapes']['margin'], points['margin']),
              'total': pmf(bank['shapes']['total'], points['total'])}
    for side in ('away_points', 'home_points'):
        result['intervals'][side] = {str(level): [quantile(masses[side], (1-level/100)/2),
                                                 quantile(masses[side], 1-(1-level/100)/2)] for level in (50, 80)}
    result.update(home_strict_win_probability=sum(p for x, p in masses['margin'].items() if x > 0),
                  away_strict_win_probability=sum(p for x, p in masses['margin'].items() if x < 0),
                  calibration_sha256=bank['sha256'], point_semantics='LEGACY_RIDGE_CENTER',
                  distribution_means={k: math.fsum(x*p for x, p in mass.items()) for k, mass in masses.items()},
                  negative_score_mass={k: sum(p for x, p in masses[k].items() if x < 0)
                                       for k in ('away_points', 'home_points', 'total')})
    return result
