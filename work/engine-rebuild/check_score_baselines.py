"""Descriptive score benchmarks on saved sequential test games; never fits."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import statistics
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from engine.forecast_system.calendar import schedule_kickoff, timestamp
from engine.forecast_system.cadence import cutoff_before
from engine.projection.storage import write_bytes

spec = importlib.util.spec_from_file_location('scores', Path(__file__).with_name('check_test_scores.py'))
scores = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scores)
MODELS = ('replay', 'league_prior_season', 'venue_prior_season', 'team_last_four')
ALIASES = {'LAR': 'LA', 'STL': 'LA', 'WSH': 'WAS', 'OAK': 'LV', 'SD': 'LAC'}


def canonical(team):
    return ALIASES.get(team, team)


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def predictions(targets, schedule):
    """Only earlier completed scores enter a benchmark; no target label is read."""
    by_id = {g['game_id']: g for g in schedule}
    if len(by_id) != len(schedule):
        raise ValueError('Duplicate schedule game')
    if len({g['game_id'] for g in targets}) != len(targets):
        raise ValueError('Duplicate target game')
    regular = sorted((g for g in schedule if g['game_type'] == 'REG'),
                     key=lambda g: (g['gameday'], g['gametime'], g['game_id']))
    clocks = {g['game_id']: schedule_kickoff(g['gameday'], g['gametime']) for g in regular}
    cache = {}
    result = []
    for target in sorted(targets, key=lambda g: (g['season'], g['issuance_at'], g['game_id'])):
        game = by_id[target['game_id']]
        cutoff = timestamp(target['state_cutoff'])
        if cutoff != cutoff_before(target['issuance_at']):
            raise ValueError('Wrong assimilation cutoff')
        if (game['game_type'] != 'REG' or int(game['season']) != target['season'] or
                timestamp(target['issuance_at']) != clocks[game['game_id']] - dt.timedelta(minutes=75)):
            raise ValueError('Target identity or issuance differs')
        key = (target['season'], cutoff)
        if key not in cache:
            history = []
            for past in regular:
                if clocks[past['game_id']] + dt.timedelta(hours=4) >= cutoff:
                    continue
                if past.get('home_score') in (None, '') or past.get('away_score') in (None, ''):
                    continue  # No verified pair of finals; never substitute zero.
                if past['location'] not in ('Home', 'Neutral'):
                    raise ValueError('Unknown historical venue')
                for side in ('away', 'home'):
                    value = past[side + '_score']
                    if isinstance(value, bool):
                        raise ValueError('Invalid integer final')
                    value = float(value)
                    if not math.isfinite(value) or value < 0 or value != int(value):
                        raise ValueError('Invalid integer final')
                    history.append({'game_id': past['game_id'], 'season': int(past['season']),
                                    'side': side, 'team': canonical(past[side + '_team']),
                                    'points': value, 'neutral': past['location'] == 'Neutral'})
            prior = [h for h in history if h['season'] == target['season'] - 1]
            if not prior:
                raise ValueError('Missing prior-season benchmark history; population cannot shrink')
            cache[key] = (history, prior)
        history, prior = cache[key]
        if game['location'] not in ('Home', 'Neutral'):
            raise ValueError('Unknown target venue')
        for side in ('away', 'home'):
            team = canonical(game[side + '_team'])
            venue = prior if game['location'] == 'Neutral' else [h for h in prior if h['side'] == side and not h['neutral']]
            if not venue:
                raise ValueError('Missing role-specific venue history; population cannot shrink')
            recent = [h for h in history if h['team'] == team][-4:]
            selected = {'league_prior_season': prior, 'venue_prior_season': venue,
                        'team_last_four': recent or prior}
            row = {'game_id': game['game_id'], 'season': target['season'], 'side': side,
                   'team': team, 'issuance_at': target['issuance_at'], 'state_cutoff': target['state_cutoff'],
                   'persistence_team_games': len(recent), 'persistence_fallback': not recent,
                   'neutral_target': game['location'] == 'Neutral'}
            for name, entries in selected.items():
                if any(h['game_id'] == game['game_id'] for h in entries):
                    raise ValueError('Target leaked into benchmark')
                row[name] = statistics.fmean(h['points'] for h in entries)
                row[name + '_observations'] = len(entries)
                row[name + '_history_sha256'] = digest([(h['game_id'], h['side'], h['points']) for h in entries])
            result.append(row)
    return result


def comparison(rows):
    tables = {}
    for name in MODELS:
        values = [dict(r, predicted_points=r[name], signed_error=r[name] - r['actual_points']) for r in rows]
        tables[name] = scores.metrics(values)
    paired = {}
    for name in MODELS[1:]:
        games = collections.defaultdict(list)
        for row in rows:
            games[row['game_id']].append(abs(row['replay'] - row['actual_points']) - abs(row[name] - row['actual_points']))
        deltas = [statistics.fmean(values) for _, values in sorted(games.items())]
        if any(len(values) != 2 for values in games.values()):
            raise ValueError('Paired benchmark population differs')
        paired[name] = {'games': len(deltas), 'replay_minus_baseline_team_mae': statistics.fmean(deltas),
                        'replay_lower_error_games': sum(d < 0 for d in deltas),
                        'equal_error_games': sum(d == 0 for d in deltas),
                        'baseline_lower_error_games': sum(d > 0 for d in deltas),
                        'descriptive_only': True}
    return {'models': tables, 'paired': paired}


def retain(data, suffix):
    sha = hashlib.sha256(data).hexdigest()
    path = ROOT / 'work/engine-rebuild/score-baselines' / (sha + suffix)
    write_bytes(path, data, immutable=True)
    return {'path': str(path.relative_to(ROOT)), 'sha256': sha}


def main():
    replay_ref = json.loads((ROOT / 'work/engine-rebuild/hourly-catchup/current-ref.json').read_bytes())
    replay = scores.membership.read(replay_ref)
    schedule = scores.membership.read(replay['sources']['schedule'])
    control = scores.membership.read(replay['control'])
    if {g['game_id'] for g in control} != {g['game_id'] for g in replay['games']}:
        raise ValueError('Preserved game population differs')
    score_rows, audit = scores.score_table(replay, schedule)
    baseline_rows = predictions(replay['games'], schedule)
    known = {(r['game_id'], r['side']): r for r in score_rows}
    if {(r['game_id'], r['side']) for r in baseline_rows} != set(known):
        raise ValueError('Matched score population differs')
    for row in baseline_rows:
        original = known[row['game_id'], row['side']]
        row.update(replay=original['predicted_points'], actual_points=original['actual_points'],
                   fit_sha256=original['fit_sha256'])
    raw = scores.csv_bytes(baseline_rows)
    rows_ref = retain(gzip.compress(raw, mtime=0), '.csv.gz')
    result = {'schema': 'matched-test-score-baselines-v1', 'authority': 'NON_AUTHORITATIVE_REPLAY',
              'status': 'PASS', 'replay_ref': replay_ref, 'schedule_ref': replay['sources']['schedule'],
              'population_control_ref': replay['control'], 'membership': audit,
              'checker_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'plan_sha256': hashlib.sha256(Path(__file__).with_name('BASELINES-PLAN.md').read_bytes()).hexdigest(),
              'rows_ref': rows_ref, 'pooled': comparison(baseline_rows),
              'by_season': {str(s): comparison([r for r in baseline_rows if r['season'] == s]) for s in sorted({r['season'] for r in baseline_rows})},
              'coverage': {'games': len(known) // 2, 'team_targets': len(known), 'dropped_games': 0,
                           'persistence_fallback_rows': sum(r['persistence_fallback'] for r in baseline_rows),
                           'persistence_under_four_rows': sum(r['persistence_team_games'] < 4 for r in baseline_rows),
                           'neutral_target_rows': sum(r['neutral_target'] for r in baseline_rows)},
              'limitations': ['Descriptive historical development evidence, not authoritative production or a gate result.',
                              'Historical eligibility uses kickoff plus four hours; provider availability was not archived.',
                              'No qualified own-lineage calibration: interval and CRPS metrics are unavailable, not zero.',
                              'Venue window is Tier 2 REVIEW REQUESTED; no superiority or future-accuracy inference.',
                              'Full-pipeline feature/tuning/calibration leakage and prospective validation remain open.']}
    summary_ref = retain(json.dumps(result, sort_keys=True, indent=2, allow_nan=False).encode() + b'\n', '.json')
    write_bytes(ROOT / 'work/engine-rebuild/score-baselines/current-ref.json',
                json.dumps(summary_ref, indent=2).encode() + b'\n')
    print(json.dumps({'summary_ref': summary_ref, 'rows_ref': rows_ref, 'coverage': result['coverage'],
                      'team_mae': {name: value['team_mae'] for name, value in result['pooled']['models'].items()}}))


if __name__ == '__main__':
    main()
