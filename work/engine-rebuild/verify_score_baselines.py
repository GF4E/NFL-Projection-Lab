"""Independent pandas recomputation from pinned source scores and exported rows."""
import gzip
import hashlib
import io
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]


def read(ref):
    raw = (ROOT / ref['path']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref['sha256']:
        raise ValueError('Independent source hash mismatch')
    return gzip.decompress(raw) if ref['path'].endswith('.gz') else raw


def main():
    ref = json.loads((ROOT / 'work/engine-rebuild/score-baselines/current-ref.json').read_text())
    summary = json.loads(read(ref))
    source = pd.DataFrame(json.loads(read(summary['schedule_ref'])))
    source = source[source.game_type == 'REG'].copy()
    source['season'] = pd.to_numeric(source.season, errors='raise')
    source['end_proxy'] = pd.to_datetime(source.gameday + ' ' + source.gametime).dt.tz_localize('America/New_York').dt.tz_convert('UTC') + pd.Timedelta(hours=4)
    aliases = {'LAR': 'LA', 'STL': 'LA', 'WSH': 'WAS', 'OAK': 'LV', 'SD': 'LAC'}
    pieces = []
    for side in ('away', 'home'):
        piece = source[['game_id', 'season', 'location', 'end_proxy']].copy()
        piece['side'] = side
        piece['team'] = source[side + '_team'].replace(aliases)
        piece['points'] = pd.to_numeric(source[side + '_score'], errors='coerce')
        pieces.append(piece)
    historical = pd.concat(pieces).sort_values(['end_proxy', 'game_id', 'side'])
    pair_counts = historical.groupby('game_id').points.count()
    historical = historical[historical.game_id.isin(pair_counts[pair_counts == 2].index)]
    rows = pd.read_csv(io.BytesIO(read(summary['rows_ref'])), float_precision='round_trip')
    methods = ('replay', 'league_prior_season', 'venue_prior_season', 'team_last_four')
    prediction_checks = history_checks = metric_checks = 0
    max_prediction_difference = max_metric_difference = 0.
    for (year, cutoff), batch in rows.groupby(['season', 'state_cutoff']):
        past = historical[historical.end_proxy < pd.Timestamp(cutoff)]
        prior = past[past.season == year - 1]
        for row in batch.itertuples():
            league = prior
            venue = prior if row.neutral_target else prior[(prior.side == row.side) & (prior.location == 'Home')]
            recent = past[past.team == row.team].tail(4)
            selected = (league, venue, recent if len(recent) else league)
            if row.persistence_team_games != len(recent) or row.persistence_fallback != (len(recent) == 0):
                raise ValueError('Independent history coverage mismatch')
            for method, data in zip(methods[1:], selected):
                if data.empty:
                    raise ValueError('Independent benchmark history is empty')
                expected = data.points.to_numpy().mean()
                difference = abs(expected - getattr(row, method))
                max_prediction_difference = max(max_prediction_difference, difference)
                if not np.isfinite(difference) or difference > 1e-12:
                    raise ValueError('Independent baseline prediction mismatch')
                prediction_checks += 1
                population = [(h.game_id, h.side, float(h.points)) for h in data.itertuples()]
                sha = hashlib.sha256(json.dumps(population, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
                if sha != getattr(row, method + '_history_sha256') or len(data) != getattr(row, method + '_observations'):
                    raise ValueError('Independent history identity mismatch')
                history_checks += 1
    for season in ('pooled', *sorted(summary['by_season'])):
        sample = rows if season == 'pooled' else rows[rows.season == int(season)]
        published = summary['pooled'] if season == 'pooled' else summary['by_season'][season]
        for method in methods:
            error = sample[method].to_numpy() - sample.actual_points.to_numpy()
            pairs = sample.pivot(index='game_id', columns='side', values=[method, 'actual_points'])
            he = pairs[method]['home'] - pairs.actual_points.home
            ae = pairs[method]['away'] - pairs.actual_points.away
            values = {'games': len(pairs), 'team_targets': len(sample), 'team_mae': abs(error).mean(),
                      'team_rmse': np.sqrt(np.mean(error**2)), 'team_bias': error.mean(),
                      'margin_mae': abs(he - ae).mean(), 'margin_bias': (he - ae).mean(),
                      'total_mae': abs(he + ae).mean(), 'total_bias': (he + ae).mean(),
                      'projected_team_sd': sample[method].std(ddof=0), 'actual_team_sd': sample.actual_points.std(ddof=0)}
            for key, value in values.items():
                difference = abs(float(value) - published['models'][method][key])
                max_metric_difference = max(max_metric_difference, difference)
                if not np.isfinite(difference) or difference > 1e-10:
                    raise ValueError('Independent test metric mismatch')
                metric_checks += 1
            if method != 'replay':
                error_frame = sample.assign(delta=abs(sample.replay - sample.actual_points) - abs(sample[method] - sample.actual_points))
                deltas = error_frame.groupby('game_id').delta.mean()
                paired = {'games': len(deltas), 'replay_minus_baseline_team_mae': deltas.mean(),
                          'replay_lower_error_games': int((deltas < 0).sum()), 'equal_error_games': int((deltas == 0).sum()),
                          'baseline_lower_error_games': int((deltas > 0).sum())}
                for key, value in paired.items():
                    difference = abs(float(value) - published['paired'][method][key])
                    max_metric_difference = max(max_metric_difference, difference)
                    if not np.isfinite(difference) or difference > 1e-10:
                        raise ValueError('Independent paired comparison mismatch')
                    metric_checks += 1
    result = {'status': 'PASS', 'scope': 'Independent baseline predictions, history identities and exported arithmetic only',
              'summary_ref': ref, 'prediction_checks': prediction_checks, 'history_checks': history_checks,
              'metric_checks': metric_checks, 'max_prediction_difference': max_prediction_difference,
              'max_metric_difference': max_metric_difference,
              'verifier_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'pandas': pd.__version__, 'numpy': np.__version__}
    encoded = json.dumps(result, indent=2, sort_keys=True).encode() + b'\n'
    sha = hashlib.sha256(encoded).hexdigest()
    path = ROOT / f'work/engine-rebuild/score-baselines/verification-{sha}.json'
    if path.exists():
        if path.read_bytes() != encoded:
            raise ValueError('Independent verification record changed')
    else:
        with path.open('xb') as handle:
            handle.write(encoded)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
