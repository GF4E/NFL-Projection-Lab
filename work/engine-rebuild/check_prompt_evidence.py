"""Independent arithmetic for the September 22 prompt review; no engine imports."""
import hashlib
import json
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / 'work/engine-audit-2026-09-21/results.json'


def metrics(rows):
    predicted = [row[side] for row in rows for side in ('away', 'home')]
    actual = [row['actual_' + side] for row in rows for side in ('away', 'home')]
    mean_p, mean_a = statistics.mean(predicted), statistics.mean(actual)
    return {
        'games': len(rows),
        'team_mae': statistics.mean(abs(p-a) for p, a in zip(predicted, actual)),
        'team_bias_projection_minus_actual': statistics.mean(p-a for p, a in zip(predicted, actual)),
        'projected_population_sd': statistics.pstdev(predicted),
        'actual_population_sd': statistics.pstdev(actual),
        'actual_on_projected_slope_with_intercept': (
            sum((p-mean_p)*(a-mean_a) for p, a in zip(predicted, actual))
            / sum((p-mean_p)**2 for p in predicted)
        ),
        'home_margin_bias': statistics.mean(
            (r['home']-r['away'])-(r['actual_home']-r['actual_away']) for r in rows
        ),
    }


def main():
    audit = json.loads(AUDIT.read_text())
    source = ROOT / audit['authoritative_control']
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert digest == audit['control_sha256']
    rows = json.loads(raw)
    assert len(rows) == len({row['game_id'] for row in rows}) == 2639
    observed = metrics(rows)
    expected_keys = {'team_mae': 'team_mae', 'team_bias_projection_minus_actual': 'team_bias',
                     'projected_population_sd': 'projected_sd', 'actual_population_sd': 'actual_sd',
                     'actual_on_projected_slope_with_intercept': 'slope', 'home_margin_bias': 'margin_bias'}
    for key, audit_key in expected_keys.items():
        assert abs(observed[key]-audit['historical']['engine'][audit_key]) < 1e-10
    reversed_metrics = metrics(list(reversed(rows)))
    assert all(abs(v-reversed_metrics[k]) < 1e-10 for k, v in observed.items())
    week2 = metrics(audit['week2_rows'])
    assert week2['games'] == 15
    assert abs(week2['team_mae']-audit['week2']['engine']['team_mae']) < 1e-10
    report = {
        'scope': 'Frozen audit arithmetic only; no new host, source-vintage or probability verification',
        'review_date': '2026-09-22',
        'source': str(source.relative_to(ROOT)),
        'source_sha256': digest,
        'source_generated_at': audit['control_generated_at'],
        'audit_snapshot': audit['source_commit'],
        'definitions': 'Population SD; bias is projected minus actual; slope includes intercept',
        'pooled': observed,
        'by_season': {str(s): metrics([r for r in rows if r['season'] == s])
                      for s in sorted({r['season'] for r in rows})},
        'frozen_partial_week2': week2,
        'arithmetic_matches_preserved_audit': True,
        'confidence': 'Near-total for arithmetic on these verified rows; lower to high if independent arithmetic differs. Not a forecast-skill or current-deployment rating.',
    }
    output = Path(__file__).with_name('prompt-evidence-2026-09-22.json')
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    print(json.dumps({'output': str(output.relative_to(ROOT)), 'games': len(rows),
                      'team_mae': observed['team_mae'], 'audit_matches': True}))


if __name__ == '__main__':
    main()
