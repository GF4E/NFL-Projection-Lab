"""Prospective Elo + sourced football judgments; no market inputs to forecasting.

Weights are explicit engineering priors, not estimates of causal effects.
The caller supplies researched facts separately from their interpretation.
This candidate does not alter the registered live package or assign PLAY.
"""
import datetime as dt
import hashlib
import json
import math


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                    allow_nan=False).encode()).hexdigest()


def time(value):
    result = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Evidence timestamps require a timezone')
    return result


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Expected a finite number')
    return float(value)


def forecast(game, state, evidence, config, as_of):
    """Return margin and its explanation without accepting sportsbook lines.

    Each unique football mechanism receives one signed assessment per target.
    Independent articles confirming the same mechanism do not multiply it.
    Scores/probabilities remain absent: Elo supplies no total distribution.
    """
    now = time(as_of)
    if now >= time(game['kickoff_at']) or game.get('status') in ('FINAL', 'MISSED'):
        raise ValueError('No retrospective football forecasts')
    if tuple(state['training_max_origin']) >= (game['season'], game['week']):
        raise ValueError('Elo state must precede the target week')
    if config['market_weight'] != 0:
        raise ValueError('Market inputs cannot originate the football forecast')
    home, away = game['home_abbr'], game['away_abbr']
    h, a = state['teams'].get(home), state['teams'].get(away)
    if h is None or a is None:
        return {'status': 'UNAVAILABLE', 'reason': 'Missing team Elo', 'version': config['version']}
    base = (number(h['elo']) - number(a['elo']) +
            (0 if game.get('neutral') else number(config['home_advantage_elo']))) / number(config['elo_points_per_rating'])
    categories = config['categories']
    totals = {c: {'margin': 0., 'total': 0.} for c in categories}
    accepted, rejected, seen = [], [], set()
    for item in evidence:
        reason = None
        key = item.get('mechanism_id')
        if item.get('game_id') != game['game_id']:
            reason = 'OTHER_GAME'
        elif not key or key in seen:
            reason = 'DUPLICATE_OR_MISSING_MECHANISM'
        elif item.get('category') not in categories:
            reason = 'UNKNOWN_CATEGORY'
        elif item.get('status') != 'CONFIRMED':
            reason = 'UNCONFIRMED_OR_CONFLICTING_FACT'
        elif not item.get('fact') or not item.get('interpretation') or not item.get('sources'):
            reason = 'FACT_INTERPRETATION_OR_SOURCE_MISSING'
        else:
            for source in item['sources']:
                if not source.get('url', '').startswith('https://') or len(source.get('sha256', '')) != 64:
                    reason = 'UNPINNED_SOURCE'
                    break
                observed = time(source['observed_at'])
                published = time(source['published_at']) if source.get('published_at') else observed
                if observed > now or published > now:
                    reason = 'FUTURE_SOURCE'
                elif (now - observed).total_seconds() > config['maximum_source_age_hours'] * 3600:
                    reason = 'STALE_SOURCE'
        if reason:
            rejected.append({'mechanism_id': key, 'reason': reason})
            continue
        seen.add(key)
        # Source reliability is a fact-verification rating, never a cover probability.
        reliability = number(item['source_reliability'])
        if not 0 <= reliability <= 1:
            raise ValueError('Invalid source reliability')
        contributions = {}
        for target in ('margin', 'total'):
            assessment = number(item[target + '_assessment'])
            if not -1 <= assessment <= 1:
                raise ValueError('Assessment must lie in [-1, 1]')
            contribution = assessment * reliability * number(categories[item['category']])
            totals[item['category']][target] += contribution
            contributions[target + '_points'] = contribution
        accepted.append({**item, **contributions})
    # Related facts cannot exceed their category allowance, even with different IDs.
    applied = {t: sum(max(-categories[c], min(categories[c], v[t]))
                      for c, v in totals.items()) for t in ('margin', 'total')}
    cap = number(config['maximum_adjustment_points'])
    applied = {t: max(-cap, min(cap, v)) for t, v in applied.items()}
    margin = base + applied['margin']
    covered = {x['category'] for x in accepted}
    return {
        'version': config['version'], 'status': 'EXPERIMENTAL_NOT_PROMOTED',
        'as_of': as_of, 'game_id': game['game_id'], 'home_abbr': home, 'away_abbr': away,
        'config_sha256': digest(config), 'state_sha256': digest(state),
        'evidence_sha256': digest(evidence), 'elo_home_margin': base,
        'football_home_margin': margin, 'adjustment_points': applied,
        'projected_winner': home if margin > 0 else away if margin < 0 else min(home, away),
        'winner_basis': 'coin flip' if margin == 0 else 'Elo plus football judgments',
        'cover_probability': None, 'total_projection': None, 'projected_score': None,
        'probability_reason': 'Candidate residual distribution has not been fitted or validated',
        'total_reason': 'Elo supplies no total; a market-independent total baseline is required',
        'accepted': accepted, 'rejected': rejected,
        'unknown_categories': sorted(set(categories) - covered),
        'category_points_before_caps': totals,
        'explanation': [f'Elo starts with a home margin of {base:+.2f} points.'] +
            [f'{x["fact"]} Our interpretation: {x["interpretation"]} '
             f'Provisional margin contribution {x["margin_points"]:+.2f} points before caps.' for x in accepted] +
            [f'After category caps, football evidence changes the margin by {applied["margin"]:+.2f} points.'],
    }


def compare_line(prediction, home_spread):
    """Assess a quote only after producing the independent football number."""
    value = prediction['football_home_margin'] + number(home_spread)
    return {'side': prediction['home_abbr'] if value > 0 else prediction['away_abbr'] if value < 0 else None,
            'home_line': home_spread, 'home_margin_against_line': value,
            'status': 'NO_DIRECTION_AT_THIS_LINE' if value == 0 else 'EXPERIMENTAL_LEAN',
            'betting_filter': 'NOT_EVALUATED', 'EV': None}
