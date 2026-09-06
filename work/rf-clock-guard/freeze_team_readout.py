"""RF-03 saved-result export. No model imports, fitting, grading or resampling."""
from pathlib import Path
import csv
import hashlib
import io
import json
import sys

TASK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
REPO = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
PLAN = REPO / '.planning/engine-os/research-first'
ACCEPT = PLAN / 'RF-COMP-09-TERMINAL-ACCEPTANCE.v1.json'
EXPECTED = 'f884a144b73ad40e0ae6999f6c08852d61d70f6adde4df137c0aa046a8f0f0a6'

def pointer(path):
    p = Path(path)
    b = p.read_bytes()
    return dict(path=str(p), sha256=hashlib.sha256(b).hexdigest(), bytes=len(b))

def verify(p):
    assert pointer(p['path']) == p

assert pointer(ACCEPT)['sha256'] == EXPECTED
a = json.loads(ACCEPT.read_text())
verify(a['evaluation'])
e = json.loads(Path(a['evaluation']['path']).read_text())
assert e['status'] == 'reject_all' and not e['candidate_qualified'] and not e['mechanism_supported']
metrics = ['joint_energy_score', 'joint_nll', 'home_crps', 'away_crps',
           'home_mae', 'away_mae', 'margin_mae', 'total_mae', 'margin_rmse',
           'total_rmse', 'margin_crps', 'total_crps', 'home_win_brier',
           'margin_coverage_80', 'total_coverage_80', 'margin_width_80', 'total_width_80']
rows = []
for series, card in e['scorecards'].items():
    populations = [(k, card[k]) for k in ['all_issued', 'development', 'exposed_2025']]
    populations += [('season_' + k, v) for k, v in card['seasons'].items()]
    for population, c in populations:
        row = dict(series=series, population=population, games=c['games'])
        for metric in metrics:
            value = c['metrics'][metric]
            row[metric] = value['mean'] if isinstance(value, dict) else value
        rows.append(row)
assert len(rows) == 19 * 16
stream = io.StringIO(newline='')
writer = csv.DictWriter(stream, fieldnames=['series', 'population', 'games'] + metrics, lineterminator='\n')
writer.writeheader()
writer.writerows(rows)
csv_text = stream.getvalue()
# Round-trip verifies every exported number exactly, without recomputing science.
for expected_row, actual_row in zip(rows, csv.DictReader(io.StringIO(csv_text)), strict=True):
    assert expected_row['series'] == actual_row['series'] and expected_row['population'] == actual_row['population']
    assert expected_row['games'] == int(actual_row['games'])
    for metric in metrics:
        assert expected_row[metric] == float(actual_row[metric])

names = {'N0:full': 'Naive baseline (N0)', 'S1:full': 'SRS baseline (S1)',
         'E1:full': 'Classical Elo (E1)', 'E2:full': 'Offense/defense Elo (E2)',
         'E3:full': 'Split-rate Elo (E3)'}
table = ['| Model | Joint energy ↓ | Joint log loss ↓ | Margin MAE ↓ | Total MAE ↓ |',
         '|---|---:|---:|---:|---:|']
for key, label in names.items():
    m = e['scorecards'][key]['development']['metrics']
    table.append(f"| {label} | {m['joint_energy_score']['mean']:.5f} | {m['joint_nll']['mean']:.5f} | {m['margin_mae']['mean']:.3f} | {m['total_mae']['mean']:.3f} |")
text = '''# Completed team-model backtest

Private research readout · September 6, 2026 · RF-COMP-09

**The complete run is valid, and the split-rate Elo candidate is rejected.** Its small improvement does not pass the registered effect-size, uncertainty, stability, mechanism and calibration requirements. The operational timer repair is retained.

All 277 forecast origins completed. The comparison below uses the same 3,135 development games from 2013–2024. Lower scores are better; the table is descriptive and does not select a new champion. All 272 games from 2025 remain a separate, already exposed retrospective slice.

''' + '\n'.join(table) + '''

E3 reduces mean joint energy loss by **0.137% versus E2** and **0.725% versus N0**, short of the unchanged 1% research floor. The corrected uncertainty bounds do not establish the required advantage. Five of twelve development seasons improve versus E2; exposed 2025 worsens by **0.300%**. Removing defense or the scoring-level update does not establish the required mechanism evidence.

The nominal 80% margin interval covers 85.04% of development outcomes. Discrete interval mass explains only part of that difference: coverage exceeds the model's own interval mass by **3.77 percentage points**, with a block-6 simultaneous interval of **1.23 to 6.30 points**. Calibration therefore remains a material problem even where average errors improve.

The worker completed in **28.43 minutes**, peaking at **1.73 GiB**, within the approved 150-minute / 4-GiB limit. All 27 qualification checks passed beforehand. Separate result reviews verified 163,202 saved rows, prior-only annual choices and the complete archive. The audits reused authenticated fits and statistical resamples; they did not independently rerun every fitted diagnostic or bootstrap member.

**What changes next:** retire this split-rate candidate and preserve the complete negative result. Keep enhanced Elo as the required research foundation, with its acceptance still open. Return to the player-population evidence gap before any player fit. Additional tuning, a new graph framework or repeated runs of the same experiment have no current evidence-based justification.

The external 5% performance target remains untested; no eligible comparison archive has been admitted. No prospective or production model has been accepted from this result. The public front page remains within the approved Beta scope; this report is private.

[Complete metric extract: all 19 series and 16 populations](team-scorecard.csv) · [Updated goal](updated-goal.md) · [Evidence needed next](player-data-next-step.md)
'''
csv_path = TASK / 'outputs/team-scorecard.csv'
report_path = TASK / 'outputs/team-backtest-result.md'
freeze_path = PLAN / 'RF-03-TEAM-RESULT-FREEZE-COMP09.v1.json'
if '--verify' in sys.argv:
    assert csv_path.read_text() == csv_text
    assert report_path.read_text() == text
    f = json.loads(freeze_path.read_text())
    for p in f['artifacts']:
        verify(p)
    assert not f['eligible_model_package'] and not f['forecast_activation']
    print(json.dumps({'status': 'verified_saved_result_export', 'rows': len(rows), 'numeric_cells': len(rows) * len(metrics), 'science_rerun': False}))
else:
    for path, value in [(csv_path, csv_text), (report_path, text)]:
        with path.open('x') as out:
            out.write(value)
    freeze = {
        'version': 'rf03.team-result-freeze.comp09.v1',
        'status': 'complete_negative_team_result_frozen',
        'scientific_status': 'reject_all',
        'run_identity': a['run_identity'],
        'eligible_model_package': False, 'forecast_activation': False,
        'prospective_evidence': False, 'external_five_percent_established': False,
        'production_authorized': False, 'goal_complete': False,
        'artifacts': [pointer(ACCEPT), a['manifest'], a['artifact_index'], a['evaluation'],
                      pointer(PLAN / 'RF-COMP-09-RESULT.v1.md'), pointer(csv_path),
                      pointer(report_path), pointer(Path(__file__))],
        'forecast_bundle': 'Existing immutable run directory; original per-origin forecasts, parameters, scores and provenance remain indexed by the authenticated artifact index. No duplicate 1.78-GB archive was created.',
        'export_validation': {'rows': len(rows), 'metric_columns': len(metrics), 'all_numeric_cells_exact_round_trip': True},
        'reproduction': '/opt/anaconda3/bin/python3.12 -I ' + str(Path(__file__)) + ' --verify',
        'scope': 'Deterministic report projection of already reviewed saved results. No model or bootstrap rerun, new hypothesis, parameter selection, player training or release.',
        'next_action': 'Resolve existing RF-04 population and outcome-label admission gap; no further automatic team tuning.',
    }
    with freeze_path.open('x') as out:
        json.dump(freeze, out, sort_keys=True, indent=2, allow_nan=False)
        out.write('\n')
    print(json.dumps({'freeze': pointer(freeze_path), 'report': pointer(report_path), 'scorecard_rows': len(rows), 'science_rerun': False}))
