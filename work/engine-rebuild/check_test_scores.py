"""Export held-out-at-prediction scores; no fitting, selection or publication."""
import csv
import gzip
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('membership', Path(__file__).with_name('check_train_test.py'))
membership = importlib.util.module_from_spec(spec)
spec.loader.exec_module(membership)


def score_table(replay, schedule):
    """Validate game grouping/chronology before exposing test accuracy."""
    audit = membership.audit(replay, schedule)
    games = {g['game_id']: g for g in schedule}
    rows = []
    for game in sorted(replay['games'], key=lambda g: (g['season'], g['issuance_at'], g['game_id'])):
        for side in ('away', 'home'):
            predicted, actual = game[side], game['actual_' + side]
            if isinstance(predicted, bool) or not math.isfinite(predicted):
                raise ValueError('Non-finite or boolean test prediction')
            rows.append({
                'game_id': game['game_id'], 'season': game['season'],
                'side': side, 'team': games[game['game_id']][side + '_team'],
                'predicted_points': predicted, 'actual_points': actual,
                'signed_error': predicted - actual, 'absolute_error': abs(predicted - actual),
                'fit_sha256': game['fit_sha256'], 'fit_available_at': game['fit_at'],
                'training_hash': game['training_hash'], 'issuance_at': game['issuance_at'],
                'interval_status': 'UNQUALIFIED_OWN_LINEAGE_CALIBRATION',
                'interval_50_low': None, 'interval_50_high': None,
                'interval_80_low': None, 'interval_80_high': None,
            })
    return rows, audit


def metrics(rows):
    if not rows:
        raise ValueError('Empty test population')
    pairs = {}
    for row in rows:
        pair = pairs.setdefault(row['game_id'], {})
        if row['side'] not in ('home', 'away') or row['side'] in pair:
            raise ValueError('Duplicate or unknown team side')
        pair[row['side']] = row
    if any(set(pair) != {'home', 'away'} for pair in pairs.values()):
        raise ValueError('Both teams must remain together')
    errors = [r['predicted_points'] - r['actual_points'] for r in rows]
    margin_errors = [pair['home']['signed_error'] - pair['away']['signed_error'] for pair in pairs.values()]
    total_errors = [pair['home']['signed_error'] + pair['away']['signed_error'] for pair in pairs.values()]
    return {
        'games': len(pairs), 'team_targets': len(rows),
        'team_mae': statistics.fmean(abs(e) for e in errors),
        'team_rmse': math.sqrt(statistics.fmean(e * e for e in errors)),
        'team_bias': statistics.fmean(errors),
        'margin_mae': statistics.fmean(abs(e) for e in margin_errors),
        'margin_bias': statistics.fmean(margin_errors),
        'total_mae': statistics.fmean(abs(e) for e in total_errors),
        'total_bias': statistics.fmean(total_errors),
        'projected_team_sd': statistics.pstdev(r['predicted_points'] for r in rows),
        'actual_team_sd': statistics.pstdev(r['actual_points'] for r in rows),
        'interval_metrics_status': 'UNQUALIFIED_OWN_LINEAGE_CALIBRATION',
    }


def csv_bytes(rows):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def retain(data, suffix):
    sha = hashlib.sha256(data).hexdigest()
    path = ROOT / 'work/engine-rebuild/test-score-audit' / (sha + suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError('Retained audit bytes changed')
    else:
        with path.open('xb') as handle:
            handle.write(data)
    return {'path': str(path.relative_to(ROOT)), 'sha256': sha}


def main():
    ref = json.loads((ROOT / 'work/engine-rebuild/hourly-catchup/current-ref.json').read_bytes())
    replay = membership.read(ref)
    control = membership.read(replay['control'])
    if {g['game_id'] for g in control} != {g['game_id'] for g in replay['games']}:
        raise ValueError('Registered test population differs')
    rows, audit = score_table(replay, membership.read(replay['sources']['schedule']))
    raw = csv_bytes(rows)
    row_ref = retain(gzip.compress(raw, mtime=0), '.csv.gz')
    # Independent route: standard-library direct sums on original game rows,
    # then round-trip the exported table. No shared production score helper.
    direct = math.fsum(abs(g[s] - g['actual_' + s]) for g in replay['games'] for s in ('home', 'away')) / len(rows)
    pooled = metrics(rows)
    if not math.isclose(direct, pooled['team_mae'], rel_tol=0, abs_tol=1e-12):
        raise ValueError('Independent score arithmetic differs')
    exported = list(csv.DictReader(io.StringIO(raw.decode())))
    if len(exported) != len(rows) or any(
        float(saved[key]) != original[key]
        for saved, original in zip(exported, rows)
        for key in ('predicted_points', 'actual_points', 'signed_error', 'absolute_error')
    ):
        raise ValueError('Export changed test scores')
    result = {
        'schema': 'chronological-test-score-audit-v1', 'status': 'PASS',
        'authority': 'NON_AUTHORITATIVE_REPLAY', 'replay_ref': ref,
        'population_control_ref': replay['control'], 'schedule_ref': replay['sources']['schedule'],
        'checker_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'membership_checker_sha256': hashlib.sha256(Path(membership.__file__).read_bytes()).hexdigest(),
        'test_rows_ref': row_ref, 'test_csv_sha256': hashlib.sha256(raw).hexdigest(),
        'membership': audit, 'pooled': pooled,
        'by_season': {str(year): metrics([r for r in rows if r['season'] == year]) for year in sorted({r['season'] for r in rows})},
        'independent_team_mae': direct,
        'conventions': {'signed_error': 'prediction minus actual', 'dispersion': 'population SD',
                        'rounding': 'none before scoring or export'},
        'limitations': audit['limitations'] + [
            'No new training or method selection. This scores previously retained sequential test predictions.',
            'Inner tuning, feature vintages, calibration leakage and prospective confirmation remain separate acceptance requirements.',
            'Unavailable calibration metrics are not zero. Qualified matched-game baselines remain required before promotion.',
        ],
    }
    data = json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False).encode() + b'\n'
    summary_ref = retain(data, '.json')
    (ROOT / 'work/engine-rebuild/test-score-audit/current-ref.json').write_text(json.dumps(summary_ref, indent=2) + '\n')
    print(json.dumps({'summary_ref': summary_ref, 'rows_ref': row_ref, 'pooled': pooled}))


if __name__ == '__main__':
    main()
