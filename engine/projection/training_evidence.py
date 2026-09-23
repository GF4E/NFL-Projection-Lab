"""Audit legacy training inputs without upgrading their chronology or fitting.

Numerical reproduction, a recorded pre-lock digest, and physical availability
are distinct claims. This module never creates a cutoff-pipeline training row.
"""
import datetime as dt
import hashlib
import json
import math
from .card import ALIASES


def timestamp(value):
    result = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Evidence clock requires a timezone')
    return result


def paired(rows, card):
    """Keep the two original teams together and reject outcome contamination."""
    selected = [r for r in rows if r['game_id'] == card['game_id']]
    if len(selected) != 2 or {r['home'] for r in selected} != {True, False}:
        raise ValueError('Exactly two distinct training sides required')
    result = {}
    for row in selected:
        side = 'home' if row['home'] else 'away'
        if (ALIASES.get(row['team'], row['team']) != card[side]
                or ALIASES.get(row['opponent'], row['opponent']) != card['away' if row['home'] else 'home']
                or row['row_id'] != card['game_id'] + ':' + row['team']):
            raise ValueError('Training identity differs from frozen forecast')
        if row.get('actual_points') is not None:
            raise ValueError('Outcome embedded in pregame training row')
        game = row['game']
        if game['game_id'] != card['game_id'] or any(ALIASES.get(game[s+'_team'], game[s+'_team']) != card[s] for s in ('home', 'away')):
            raise ValueError('Training schedule identity differs')
        if any(game.get(s+'_score') not in (None, '') for s in ('home', 'away')):
            raise ValueError('Outcome embedded in pregame schedule')
        result[side] = row
    return result


def independent_points(fit, features):
    """Standard-library ridge arithmetic, independent of the shipping predictor."""
    fields = ('names', 'means', 'scales', 'coefficients')
    if len({len(fit[k]) for k in fields}) != 1:
        raise ValueError('Fit dimensions differ')
    value = features['baseline']
    if value is None or not math.isfinite(value):
        raise ValueError('Finite football baseline required')
    terms = [value]
    for name, mean, scale, coefficient in zip(*(fit[k] for k in fields)):
        if not all(math.isfinite(x) for x in (mean, scale, coefficient)) or scale <= 0:
            raise ValueError('Invalid ridge coefficient or scaling')
        x = features.get(name)
        if x is not None and math.isfinite(x):
            terms.append((x-mean)*coefficient/scale)
    if 'calibration' in fit['groups']:
        terms.append(fit['intercept'])
    return math.fsum(terms)


def inspect(card, rows, fit, *, source_kind, recorded_at=None, tolerance=1e-10):
    if card['evidence'] != 'AS_ISSUED':
        raise ValueError('Retrospective forecasts are not pregame evidence')
    if source_kind not in ('FROZEN_LOCK_FEATURES', 'GIT_HASHED_CACHE'):
        raise ValueError('Unknown training evidence source')
    pair = paired(rows, card)
    issued, deadline = timestamp(card['issued_at']), timestamp(card['freeze_time'])
    if issued >= deadline:
        raise ValueError('Forecast was not declared before its lock')
    differences = [abs(independent_points(fit, pair[s]['features'])-card['projection'][s+'_points'])
                   for s in ('home', 'away')]
    if not all(math.isfinite(d) and d <= tolerance for d in differences):
        raise ValueError('Retained inputs do not reproduce original point forecasts')
    difference = max(differences)
    if source_kind == 'GIT_HASHED_CACHE' and (recorded_at is None or timestamp(recorded_at) >= deadline):
        raise ValueError('Cache digest lacks a recorded pre-lock commit')
    return {'game_id': card['game_id'], 'evidence': card['evidence'],
            'source_kind': source_kind, 'max_point_difference': difference,
            'recorded_at': recorded_at, 'issued_at': card['issued_at'], 'freeze_time': card['freeze_time'],
            'digest_recorded_before_declared_issuance':
                None if recorded_at is None else timestamp(recorded_at) < issued,
            'physical_input_availability': 'NOT_RECORDED',
            'scheduled_state_receipt': 'NOT_RECORDED',
            'eligible_for_new_cutoff_refit': False,
            'qualification': 'LEGACY_INPUT_REPRODUCTION_ONLY'}


def verify_cache(data, manifest):
    import gzip
    if hashlib.sha256(data).hexdigest() != manifest['sha256']:
        raise ValueError('Feature cache differs from its recorded digest')
    rows = json.loads(gzip.decompress(data))
    if not isinstance(rows, list) or len({r['row_id'] for r in rows}) != len(rows):
        raise ValueError('Nonunique or malformed feature cache')
    return rows
