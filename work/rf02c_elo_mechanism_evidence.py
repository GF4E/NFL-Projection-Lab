"""Read-only extraction of hash-authenticated RF-02C final mechanism evidence."""
import hashlib
import json
from pathlib import Path

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
RUN = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02c-v1-2d9c91d803f1c991')
OUT = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02c-elo-mechanism-evidence.json')
INDEX_SHA = 'ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


raw = (RUN / 'artifact-index.json').read_bytes()
assert digest(raw) == INDEX_SHA
index = json.loads(raw)['files']
bindings = {'artifact-index.json': INDEX_SHA}


def artifact(name):
    raw = (RUN / name).read_bytes()
    assert len(raw) == index[name]['bytes'] and digest(raw) == index[name]['sha256']
    bindings[name] = digest(raw)
    return json.loads(raw)


manifest = artifact('manifest.json')
assert bindings['manifest.json'] == '2d9c91d803f1c991be039b88167082c8a501ce60dc58b18afcab0b251bb75e38'
cards = artifact('scorecards.json')
inference = artifact('paired-inference.json')
terminal = artifact('terminal-decision.json')
source_hashes = {}
for name in ('scripts/research_score_models.py', 'scripts/research_score_replay.py', 'scripts/research_score_distribution.py'):
    raw = (ROOT / name).read_bytes()
    assert digest(raw) == manifest['code_hashes'][name]
    source_hashes[name] = digest(raw)
config_raw = (ROOT / 'config/research-team-score.v2.json').read_bytes()
assert digest(config_raw) == manifest['bound_hashes']['config']
config = json.loads(config_raw)
metric_names = ['joint_energy_score', 'joint_nll', 'home_mae', 'away_mae', 'home_crps', 'away_crps',
                'margin_crps', 'total_crps', 'home_coverage_80', 'away_coverage_80', 'margin_coverage_80',
                'total_coverage_80', 'home_width_80', 'away_width_80', 'margin_width_80', 'total_width_80']
names = ['N0:full', 'E1:full', 'E1:K_zero', 'E2:full', 'E2:no_defense', 'E2:no_offense']
rows = {}
for name in names:
    card = cards[name]
    dev, diagnostic = card['development']['metrics'], card['seasons']['2025']['metrics']
    reference = cards['N0:full']
    energy = dev['joint_energy_score']['mean']
    base = reference['development']['metrics']['joint_energy_score']['mean']
    base2025 = reference['seasons']['2025']['metrics']['joint_energy_score']['mean']
    rows[name] = {'development_games': card['development']['games'], 'all_games': card['scored_games'],
                  'native_failures': card['native_failures'], 'development': {k: dev[k]['mean'] for k in metric_names},
                  'energy_gain_vs_N0_development_percent': 100 * (base-energy)/base,
                  'energy_2025': diagnostic['joint_energy_score']['mean'],
                  'energy_gain_vs_N0_2025_percent': 100 * (base2025-diagnostic['joint_energy_score']['mean'])/base2025,
                  'season_energy': {s: value['metrics']['joint_energy_score']['mean'] for s, value in card['seasons'].items()}}
comparison_names = ['N0:full->E1:full', 'N0:full->E2:full', 'E1:full->E2:full', 'E1:full->E1:K_zero',
                    'E2:full->E2:no_defense', 'E2:full->E2:no_offense']
comparisons = {name: inference['comparisons'][name] for name in comparison_names}
for name in names[1:]:
    for metric in ('margin_crps', 'total_crps'):
        base = rows['N0:full']['development'][metric]
        rows[name][metric + '_regression_vs_N0_percent'] = 100 * (rows[name]['development'][metric] - base)/base
removals = {}
for name in ('E2:no_defense', 'E2:no_offense'):
    full = rows['E2:full']['season_energy']
    removed = rows[name]['season_energy']
    removals[name] = {'full_better_development_seasons': sum(full[str(year)] < removed[str(year)] for year in range(2013, 2025)),
                      'removal_gain_development_percent': 100 * comparisons['E2:full->' + name]['gain'],
                      'removal_gain_2025_percent': 100 * (full['2025'] - removed['2025']) / full['2025']}
result = {'run': str(RUN), 'bindings': bindings, 'source_hashes': source_hashes,
          'config_sha256': digest(config_raw), 'model_grids': config['models'], 'rows': rows,
          'registered_paired_comparisons': comparisons, 'removal_diagnostics': removals,
          'terminal_status': terminal['status'], 'E1_gates': terminal['gates']['E1'], 'E2_gates': terminal['gates']['E2'],
          'inference_convention': 'Gain=(reference loss-variant loss)/reference loss; simultaneous 95% intervals over 42 comparisons; 10000 season/week-block bootstrap replicates, lengths 1/3/6.',
          'scope': 'Extraction and algebra only; no model fit, new score computation, tuning, revised criterion or authorization.'}
with OUT.open('x') as stream:
    json.dump(result, stream, sort_keys=True, indent=2, allow_nan=False)
    stream.write('\n')
print(json.dumps({'output': str(OUT), 'sha256': digest(OUT.read_bytes()),
                  'removal_diagnostics': removals, 'gains': {name: rows[name]['energy_gain_vs_N0_development_percent'] for name in names},
                  'total_crps_regression_percent': {name: rows[name].get('total_crps_regression_vs_N0_percent') for name in names}}, indent=2))
