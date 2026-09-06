"""Terminal-only independent RF02C arithmetic audit; no model or distribution fits.
Reads one indexed JSON at a time; stores outer metrics in compact float matrices.
The index must authenticate a terminal receipt before any scientific file is read.
"""
import argparse
import ast
import hashlib
import itertools
import json
import os
import stat
from pathlib import Path
import re
import sys
import time

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
sys.path.insert(0, str(ROOT / 'scripts'))
import numpy as np
from research_score_contract import load_accepted, read_regular
from research_score_metrics import mean_calibration, win_calibration
from research_score_models import BASE_SEED

TARGETS = ('home', 'away', 'margin', 'total')
ATOL = 1e-10  # Audit arithmetic tolerance only; never modifies experimental gates.


def sha_file(path):
    h = hashlib.sha256(); size = 0
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        assert stat.S_ISREG(os.fstat(stream.fileno()).st_mode), 'nonregular artifact'
        while chunk := stream.read(4 * 1024 * 1024):
            h.update(chunk); size += len(chunk)
    return h.hexdigest(), size


def read_json(path):
    return json.loads(read_regular(path))


def compare(actual, expected, label, maxima):
    if isinstance(expected, dict):
        assert set(actual) == set(expected), (label, 'keys')
        for key in expected:
            compare(actual[key], expected[key], label + '/' + str(key), maxima)
    elif isinstance(expected, list):
        assert len(actual) == len(expected), (label, 'length')
        for i, (a, b) in enumerate(zip(actual, expected)):
            compare(a, b, label + '/' + str(i), maxima)
    elif isinstance(expected, bool) or expected is None or isinstance(expected, str):
        assert actual == expected, (label, actual, expected)
    else:
        assert np.isfinite(actual) and np.isfinite(expected), (label, 'nonfinite')
        error = abs(float(actual) - float(expected))
        maxima['arithmetic'] = max(maxima.get('arithmetic', 0.), error)
        assert error <= ATOL, (label, actual, expected, error)


def aggregate(matrix, names):
    col = {name: matrix[:, j] for j, name in enumerate(names)}
    result = {'games': len(matrix), 'metrics': {}, 'calibration': {}, 'pit': {}}
    for name, values in col.items():
        result['metrics'][name] = {'mean': float(np.mean(values)), 'median': float(np.median(values))}
    for target in TARGETS:
        result['metrics'][target + '_rmse'] = float(np.sqrt(np.mean(col[target + '_squared_error'])))
        result['calibration'][target] = mean_calibration(col[target + '_mean'], col[target + '_observed'])
        counts, _ = np.histogram(col[target + '_pit'], bins=np.linspace(0, 1, 11))
        proportions = counts / len(matrix)
        result['pit'][target] = {'counts': counts.tolist(), 'proportions': proportions.tolist(),
            'maximum_uniform_bin_deviation': float(np.max(np.abs(proportions - .1)))}
    result['calibration']['home_win'] = win_calibration(col['home_win_probability'], col['home_win_observed'])
    return result


def multiplicities(metadata, length, members):
    keys = sorted(set(map(tuple, metadata)))
    years = sorted({key[0] for key in keys}); assert len(years) == 12
    index = {key: i for i, key in enumerate(keys)}
    season_weeks = [np.array([index[key] for key in keys if key[0] == year]) for year in years]
    weights = np.zeros((members, len(keys)), dtype=np.int16)
    rng = np.random.Generator(np.random.PCG64(BASE_SEED + length))
    for b in range(members):
        draws = rng.integers(0, len(years), size=len(years))
        for season_index in draws:
            weeks = season_weeks[season_index]
            starts = rng.integers(0, len(weeks) - length + 1, size=(len(weeks) + length - 1) // length)
            selected = np.concatenate([weeks[start:start + length] for start in starts])[:len(weeks)]
            np.add.at(weights[b], selected, 1)
    groups = np.array([index[tuple(row)] for row in metadata])
    return weights.astype(float), groups, len(keys)


def weekly(values, groups, count):
    out = np.zeros((count,) + values.shape[1:]); np.add.at(out, groups, values)
    return out


def audit_inference(inference, matrices, names, series, metadata, config, maxima):
    lookup = {key: i for i, key in enumerate(series)}
    comparisons = [(f'{a}:full->{b}:full', (a, 'full'), (b, 'full'))
                   for a, b in itertools.combinations(config['models'], 2)]
    comparisons += [(f'{f}:full->{f}:{v}', (f, 'full'), (f, v)) for f, v in series if v != 'full']
    assert len(comparisons) == 42 and set(inference['comparisons']) == {x[0] for x in comparisons}
    refs = np.array([lookup[x[1]] for x in comparisons]); variants = np.array([lookup[x[2]] for x in comparisons])
    energy = matrices[:, :, names.index('joint_energy_score')].T
    means = energy.mean(axis=0); assert np.all(means > 0)
    gains = (means[refs] - means[variants]) / means[refs]
    coverage_keys = [(key, target, round(100 * level)) for key in series for target in TARGETS for level in (.5, .8, .95)]
    coverage = np.array([matrices[lookup[key], :, names.index(f'{target}_coverage_{level}')]
                         for key, target, level in coverage_keys]).T
    members = config['evaluation']['bootstrapMembers']; assert members == 10000
    for length in config['evaluation']['bootstrapBlockLengths']:
        counts, groups, size = multiplicities(metadata, length, members)
        denominators = counts @ np.bincount(groups, minlength=size)
        sampled = counts @ weekly(energy, groups, size) / denominators[:, None]
        sample_gains = (sampled[:, refs] - sampled[:, variants]) / sampled[:, refs]
        sd = np.std(sample_gains, axis=0, ddof=1); standardized = np.zeros_like(sample_gains)
        for k in range(42):
            if sd[k] == 0:
                assert np.all(sample_gains[:, k] == gains[k])
            else:
                standardized[:, k] = np.abs(sample_gains[:, k] - gains[k]) / sd[k]
        critical = float(np.quantile(np.max(standardized, axis=1), .95, method='linear'))
        block = inference['blocks'][str(length)]
        compare(critical, block['critical_max_standardized'], 'critical', maxima)
        assert block['members'] == members
        for k, (name, ref, variant) in enumerate(comparisons):
            stored = inference['comparisons'][name]
            assert stored['reference'] == list(ref) and stored['variant'] == list(variant)
            compare(gains[k], stored['gain'], name + '/gain', maxima)
            compare({'lower': gains[k] - critical * sd[k], 'upper': gains[k] + critical * sd[k], 'bootstrap_sd': sd[k]},
                    stored['blocks'][str(length)], name + '/bounds', maxima)
        boot_cov = counts @ weekly(coverage, groups, size) / denominators[:, None]
        endpoints = np.quantile(boot_cov, [.025, .975], axis=0, method='linear')
        computed_cov = {':'.join((*key, target, str(level))): {'point': float(coverage[:, i].mean()),
            'lower': float(endpoints[0, i]), 'upper': float(endpoints[1, i])}
            for i, (key, target, level) in enumerate(coverage_keys)}
        compare(computed_cov, block['coverage'], 'coverage', maxima)
        computed_pit = {}
        for key in series:
            for target in TARGETS:
                values = matrices[lookup[key], :, names.index(target + '_pit')]
                bins = np.minimum(9, np.floor(values * 10).astype(int)); assert np.all(bins >= 0) and np.all(values <= 1)
                indicators = np.eye(10)[bins]; proportions = indicators.mean(axis=0)
                bootstrap = counts @ weekly(indicators, groups, size) / denominators[:, None]
                radius = float(np.quantile(np.max(np.abs(bootstrap - proportions), axis=1), .95, method='linear'))
                computed_pit[':'.join((*key, target))] = {'family': 'ten_bins_for_this_series_target', 'radius': radius,
                    'lower': np.maximum(0, proportions - radius).tolist(), 'upper': np.minimum(1, proportions + radius).tolist()}
        compare(computed_pit, block['pit_simultaneous_bands'], 'pit_bands', maxima)
        print(json.dumps({'audit_phase': 'paired_inference', 'block_length': length, 'comparisons': 42}), flush=True)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('run_directory', type=Path); parser.add_argument('--expected-index-sha', required=True)
    args = parser.parse_args(); run = args.run_directory
    index_raw = read_regular(run / 'artifact-index.json')
    assert hashlib.sha256(index_raw).hexdigest() == args.expected_index_sha
    index = json.loads(index_raw)['files']
    terminal_names = [n for n in ('terminal-decision.json', 'terminal-failure.json') if n in index]
    assert len(terminal_names) == 1, 'terminal receipt required; live audit prohibited'
    total = 0
    for name, pointer in index.items():
        assert re.fullmatch(r'[a-z0-9.-]+', name) and '..' not in name
        digest, size = sha_file(run / name)
        assert digest == pointer['sha256'] and size == pointer['bytes'], name
        total += size
    terminal = read_json(run / terminal_names[0]); manifest = read_json(run / 'manifest.json')
    expected_manifest_sha = '2d9c91d803f1c991be039b88167082c8a501ce60dc58b18afcab0b251bb75e38'
    assert hashlib.sha256(read_regular(run / 'manifest.json')).hexdigest() == expected_manifest_sha
    assert run.name == 'rf02c-v1-' + expected_manifest_sha[:16]
    # Read-only accepted-chain verification, performed only after terminal authentication.
    from research_score_compute_run import preflight, adapted_tree
    context = preflight(ROOT)
    implementation = context['implementation']
    adapter = ast.dump(adapted_tree(read_regular(ROOT / 'scripts/research_score_run.py').decode()), include_attributes=False)
    expected_compute = {
        'version': 'rf02c.compute-successor.v1', 'bindings': context['bindings'],
        'qualification': implementation['receipt']['qualification'],
        'implementation_receipt_sha256': implementation['receiptSha256'],
        'implementation_anchor_sha256': implementation['anchorSha256'],
        'adapter_ast_sha256': hashlib.sha256(adapter.encode()).hexdigest(),
        'scope': 'per_score_call_exact_CDF_memoization_and_successor_provenance_only'}
    assert manifest['compute'] == expected_compute
    assert manifest['code_hashes'] == context['codeHashes']
    assert manifest['runtime'] == context['runtime']
    assert manifest['bound_hashes'] == context['accepted'][3]
    assert manifest['accepted_receipt_sha256'] == hashlib.sha256(read_regular(ROOT / '.planning/engine-os/research-first/RF-01-ACCEPTANCE.v2.json')).hexdigest()
    assert manifest['version'] == 'rf02c.team-score.v1'
    assert manifest['historical_status'] == 'retrospective_inferred'
    assert manifest['prospective_evidence'] is False and manifest['production_authorization'] is False
    assert manifest['provider_requests'] == 0
    for name, digest in manifest['code_hashes'].items():
        assert hashlib.sha256(read_regular(ROOT / name)).hexdigest() == digest, name
    _, config, data, _ = load_accepted(ROOT)
    by_game = {row['gameId']: row for row in data['records']}
    series = []
    for family in config['models']:
        series.append((family, 'full'))
        series.extend((family, v) for v in config['variants']['allModels'] + config['variants'].get(family, []) + config['variants']['negativeControlsAllModels'])
    assert len(series) == 40
    chunks = {key: [] for key in series}; failures = {key: [] for key in series}; metadata = []; identities = []; names = None
    for name in sorted(n for n in index if re.fullmatch(r'outer-losses-\d{4}-\d{2}\.json', n)):
        season, week = map(int, name.removeprefix('outer-losses-').removesuffix('.json').split('-'))
        rows = read_json(run / name); state = read_json(run / name.replace('outer-losses-', 'state-'))
        games = state['origin']['targetGameIds']; expected = [(f, v, g) for f, v in series for g in games]
        assert [(x['family'], x['variant'], x['game_id']) for x in rows] == expected
        if names is None: names = sorted(set(rows[0]['metrics']) - {'grid_cells'})
        for key in series:
            selected = [x for x in rows if (x['family'], x['variant']) == key]
            for row in selected:
                assert set(row['metrics']) == set(names) | {'grid_cells'}
                source = by_game[row['game_id']]
                assert row['metrics']['home_observed'] == source['homeScore'] and row['metrics']['away_observed'] == source['awayScore']
            block = np.array([[x['metrics'][n] for n in names] for x in selected]); assert np.all(np.isfinite(block))
            chunks[key].append(block); failures[key].extend(x['native_failure'] is not None for x in selected)
        identities.extend(games); metadata.extend((season, week) for _ in games)
    assert len(set(identities)) == len(identities)
    report = {'status': terminal['status'], 'indexed_files': len(index), 'indexed_bytes': total,
              'accepted_provenance_chain_verified': True,
              'outer_games': len(identities), 'outer_rows': len(identities) * 40, 'maxima': {},
              'limitations': ['retrospective exposed history', 'calibration uses frozen diagnostic helpers',
                              'arithmetic audit does not establish chronology or independent prospective evidence',
                              'final gate reproduction assumes a separately verified leakage pass; leakage_passed=True is not leakage proof']}
    if 'pilot-receipt.json' in index:
        pilot = read_json(run / 'pilot-receipt.json')
        origin = next(o for o in data['origins'] if (o['season'], o['week']) == (2013, 2))
        current = len(origin['windows']['12']['eligibleInputIds'])
        work = sum(max(1, len(o['windows']['12']['eligibleInputIds']) / current) * len(o['targetGameIds']) / len(origin['targetGameIds'])
                   for o in data['origins'] if (o['season'], o['week']) > (2013, 2))
        projection = pilot['elapsed_seconds'] + pilot['mean_outer_origin_seconds'] * work + pilot['inference_probe']['projected_10000_member_seconds']
        compare(work, pilot['input_scaled_remaining_work'], 'pilot/work', report['maxima'])
        compare(projection, pilot['projected_replay_seconds'], 'pilot/projection', report['maxima'])
        report['pilot_projection'] = projection
    if identities:
        matrices = np.stack([np.concatenate(chunks[key]) for key in series]); del chunks
        meta = np.array(metadata); development = meta[:, 0] <= 2024
        expected_games = [row['gameId'] for row in data['records'] if row['season'] >= 2013]
        full = len(identities) == 3407 and set(identities) == set(expected_games)
        report['full_population'] = full
        if 'scorecards.json' in index:
            assert full; cards = read_json(run / 'scorecards.json'); assert set(cards) == {':'.join(key) for key in series}
            for i, key in enumerate(series):
                matrix = matrices[i]; flags = np.array(failures[key]); card = cards[':'.join(key)]
                compare(aggregate(matrix, names), card['overall'], str(key) + '/overall', report['maxima'])
                compare(aggregate(matrix[development], names), card['development'], str(key) + '/development', report['maxima'])
                assert card['native_failures'] == int(flags.sum()) and card['scored_games'] == len(matrix)
                if np.any(~flags): compare(aggregate(matrix[~flags], names), card['native_only'], str(key) + '/native', report['maxima'])
                else: assert card['native_only'] == {'status': 'no_native_forecasts'}
                for year in range(2013, 2026):
                    compare(aggregate(matrix[meta[:, 0] == year], names), card['seasons'][str(year)], str(key) + '/' + str(year), report['maxima'])
            report['all_scorecards_recomputed'] = True
        if 'paired-inference.json' in index:
            assert full and development.sum() == 3135
            inference = read_json(run / 'paired-inference.json')
            audit_inference(inference, matrices[:, development], names, series, meta[development], config, report['maxima'])
            report['paired_comparisons_recomputed'] = 42
        if terminal_names[0] == 'terminal-decision.json':
            assert full and 'scorecards.json' in index and 'paired-inference.json' in index
            assert terminal['status'] in ('reject_all', 'shadow_eligible') and terminal['seconds'] <= 7200 and terminal['rss_mb'] <= 4096
            assert terminal['production_authorized'] is False and terminal['prospective_evidence'] is False
            assert terminal['claim_at_least_one_percent_proven'] is False
            # Exact original gate reproduction is separately checked after arithmetic.
            from research_score_inference import decide
            gate_names = ['joint_energy_score', 'joint_nll', 'home_mae', 'away_mae'] + [t + suffix for t in TARGETS for suffix in ('_crps', '_coverage_80', '_width_80')]
            gate_indices = [names.index(n) for n in gate_names]
            dict_rows = {key: [dict(zip(gate_names, values)) for values in matrices[i][:, gate_indices]] for i, key in enumerate(series)}
            cal = {key: cards[':'.join(key)]['development']['calibration'] for key in series}
            info = [{'season': int(s), 'week': int(w)} for s, w in metadata]
            decision = decide(config, info, dict_rows, failures, inference, cal, leakage_passed=True)
            compare(decision, {key: terminal[key] for key in decision}, 'terminal_gates', report['maxima'])
            report['frozen_gate_decision_reproduced'] = True
            report['gate_reproduction_assumes_separate_leakage_pass'] = True
    print(json.dumps(report, sort_keys=True, indent=2), flush=True)


if __name__ == '__main__': main()
