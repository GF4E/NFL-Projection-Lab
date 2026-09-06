"""Independent streaming temporal audit; run only after RF-02C is terminal.

No model/distribution fit, scoring, replay, provider or production operation.
The terminal index hash must be supplied from the owner's observed terminal run.
"""
import argparse
import collections
import copy
from datetime import datetime, timedelta
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import re
import stat
import sys

import numpy as np

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
PARENT = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data')
MANIFEST_SHA = '2d9c91d803f1c991be039b88167082c8a501ce60dc58b18afcab0b251bb75e38'
RUN = PARENT / ('rf02c-v1-' + MANIFEST_SHA[:16])
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_regular(path):
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts, 'unsafe_absolute_path')
    parent = os.open(path.anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in path.parts[1:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent)
            parent = child
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
    finally:
        os.close(parent)
    with os.fdopen(fd, 'rb') as stream:
        require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), 'nonregular_input')
        return stream.read()


def bound(path, expected, size=None):
    raw = read_regular(path)
    require(sha(raw) == expected and (size is None or len(raw) == size), 'bound_bytes_mismatch:' + str(path))
    return raw


def authenticate(index_sha):
    require(re.fullmatch('[0-9a-f]{64}', index_sha) is not None, 'invalid_terminal_index_hash')
    manifest_raw = bound(RUN / 'manifest.json', MANIFEST_SHA)
    index_raw = bound(RUN / 'artifact-index.json', index_sha)
    index = json.loads(index_raw)
    require(set(index) == {'files'} and isinstance(index['files'], dict), 'invalid_index')
    index = index['files']
    terminals = set(index) & {'terminal-decision.json', 'terminal-failure.json'}
    require(len(terminals) == 1 and 'manifest.json' in index, 'terminal_artifact_required')
    total = 0
    # First pass authenticates every indexed byte without retaining or parsing it.
    for name, pointer in index.items():
        require(re.fullmatch('[a-z0-9][a-z0-9.-]*', name) is not None and '..' not in name,
                'unsafe_index_name')
        require(set(pointer) == {'sha256', 'bytes'} and type(pointer['bytes']) is int, 'invalid_index_pointer')
        total += len(bound(RUN / name, pointer['sha256'], pointer['bytes']))
    require(index['manifest.json']['sha256'] == MANIFEST_SHA, 'manifest_index_mismatch')

    def artifact(name):
        pointer = index[name]
        return json.loads(bound(RUN / name, pointer['sha256'], pointer['bytes']))

    terminal_name = next(iter(terminals))
    terminal = artifact(terminal_name)
    require(terminal.get('status') in {'protocol_invalid', 'reject_all', 'shadow_eligible'}, 'nonterminal_status')
    manifest = json.loads(manifest_raw)
    require(manifest['version'] == 'rf02c.team-score.v1' and manifest['production_authorization'] is False
            and manifest['prospective_evidence'] is False and manifest['provider_requests'] == 0,
            'manifest_scope_changed')
    for name, expected in manifest['code_hashes'].items():
        require(name.startswith(('scripts/research_score_', 'tests/research-score')) and '..' not in Path(name).parts,
                'unexpected_source_binding')
        bound(ROOT / name, expected)
    require(len(manifest['code_hashes']) == 27, 'source_population_changed')
    acceptance_path = ROOT / '.planning/engine-os/research-first/RF-01-ACCEPTANCE.v2.json'
    acceptance = json.loads(bound(acceptance_path, manifest['accepted_receipt_sha256']))
    admitted = config = None
    for key, expected in manifest['bound_hashes'].items():
        pointer = acceptance[key]
        require(pointer['sha256'] == expected, 'admission_manifest_binding_mismatch')
        path = Path(pointer['path'])
        raw = bound(path if path.is_absolute() else ROOT / path, expected)
        if key == 'admittedData':
            admitted = json.loads(raw)
        elif key == 'config':
            config = json.loads(raw)
    require(admitted is not None and config is not None, 'missing_admission_or_config')
    compute = manifest['compute']
    base = ROOT / '.planning/engine-os/research-first'
    anchor = json.loads(bound(base / 'RF-02C-IMPLEMENTATION-ANCHOR.v1.json', compute['implementation_anchor_sha256']))
    require(anchor['receiptSha256'] == compute['implementation_receipt_sha256'], 'implementation_anchor_mismatch')
    implementation = json.loads(bound(base / 'RF-02C-IMPLEMENTATION.v1.json', anchor['receiptSha256']))
    require(implementation['codeHashes'] == manifest['code_hashes'] and implementation['runtime'] == manifest['runtime']
            and implementation['computeBindings'] == compute['bindings']
            and implementation['qualification'] == compute['qualification']
            and implementation['result'] == 'accepted_for_one_replay', 'implementation_manifest_mismatch')
    compute_config = json.loads(bound(ROOT / 'config/research-team-score-compute.v1.json', compute['bindings']['config']))
    bound(base / 'RF-02C-ACCEPTANCE.v1.json', compute['bindings']['acceptance'])
    bound(ROOT / compute_config['specification']['path'], compute['bindings']['specification'])
    for key in ('predecessorConfig', 'predecessorImplementation'):
        pointer = compute_config[key]
        require(pointer['sha256'] == compute['bindings'][key], 'predecessor_binding_mismatch')
        bound(ROOT / pointer['path'], pointer['sha256'])
    # Loading the already hash-verified contract does not execute any model.
    sys.path.insert(0, str(ROOT / 'scripts'))
    from research_score_contract import runtime_manifest
    require(runtime_manifest(config) == manifest['runtime'], 'audit_runtime_mismatch')
    smoke = artifact('synthetic-tests.json')
    require(smoke['returncode'] == 0 and smoke['seconds'] <= 120
            and smoke['code_hashes'] == manifest['code_hashes'], 'frozen_synthetic_smoke_failed')
    return index, artifact, manifest, terminal, config, admitted, total


def seed(*items):
    raw = json.dumps([20260904, *items], ensure_ascii=True, separators=(',', ':')).encode()
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], 'big')


def check_lineage(ancestry, cutoff, ids, feature_hash, manifest, forecast_sha, delay):
    nodes = {node['id']: node for node in ancestry['nodes']}
    require(len(nodes) == len(ancestry['nodes']) == 6, 'lineage_population_mismatch')
    seen, visiting = set(), set()

    def visit(identity, expected):
        require(identity not in visiting and identity in nodes, 'lineage_cycle_or_missing')
        node = nodes[identity]
        require(node['sha256'] == expected == sha(encoded({k: v for k, v in node.items() if k != 'sha256'})),
                'lineage_hash_mismatch')
        require(node['kind'] in {'football_source', 'feature_schema', 'target_schema', 'configuration', 'transform', 'model', 'forecast'},
                'forbidden_lineage_kind')
        require(node.get('available_at') is None or datetime.fromisoformat(node['available_at']) <= cutoff,
                'future_lineage')
        if identity in seen:
            return
        visiting.add(identity)
        for parent in node['parents']:
            visit(parent['id'], parent['sha256'])
        visiting.remove(identity)
        seen.add(identity)

    visit('forecast', ancestry['expected_root'])
    require(len(seen) == 6, 'incomplete_lineage_closure')
    source = nodes['eligible-football']['body']
    require(source['ids'] == ids and source['input_sha256'] == feature_hash
            and source['admission_manifest'] == MANIFEST_SHA, 'lineage_input_mismatch')
    require(nodes['model']['body']['code_sha256'] == sha(encoded(manifest['code_hashes']))
            and nodes['configuration']['body']['sha256'] == manifest['bound_hashes']['config'], 'lineage_code_config_mismatch')
    require(nodes['forecast']['body'] == {'delay_hours': delay, 'forecast_bytes_sha256': forecast_sha},
            'lineage_forecast_mismatch')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index-sha256', required=True)
    parser.add_argument('--output', default=str(WORK / 'rf02c_temporal_audit.json'))
    args = parser.parse_args()
    output = Path(args.output)
    require(output.parent == WORK and not output.exists(), 'new_work_output_required')
    index, artifact, manifest, terminal, config, data, total = authenticate(args.index_sha256)
    rows = sorted(data['records'], key=lambda row: (row['season'], row['week'], row['gameId']))
    byid = {row['gameId']: row for row in rows}
    origins = {(row['season'], row['week']): row for row in data['origins']}
    teams = sorted({row['homeTeam'] for row in rows} | {row['awayTeam'] for row in rows})
    team_index = {name: i for i, name in enumerate(teams)}
    require(len(teams) == 32 and len(byid) == len(rows) == 4175, 'admitted_population_changed')
    model = config['models']
    settings = {'N0': [{}],
                'S1': [dict(ridge=r, half_life=h) for r, h in itertools.product(model['S1']['ridgeGridInTieOrder'], model['S1']['halfLifeGridInTieOrder'])],
                'E1': [dict(k=k, retention=r, home_points=h) for k, r, h in itertools.product(model['E1']['kGridInTieOrder'], model['E1']['retentionGridInTieOrder'], model['E1']['homePointsGridInTieOrder'])],
                'E2': [dict(k=k, retention=r) for k, r in itertools.product(model['E2']['kGridInTieOrder'], model['E2']['retentionGridInTieOrder'])]}
    series = [(family, variant) for family in config['models']
              for variant in ['full'] + config['variants']['allModels'] + config['variants'].get(family, []) + config['variants']['negativeControlsAllModels']]
    expected_trajectories = {(family, j, variant) for family, variant in series
                             if variant not in {'independent_marginals', 'deterministic_noise'}
                             for j in range(len(settings[family]))}
    require(len(series) == 40 and len(expected_trajectories) == 352, 'registered_trajectory_population_changed')
    state_names = sorted(name for name in index if re.fullmatch(r'state-\d{4}-\d{2}\.json', name))
    state_keys = [tuple(map(int, name[6:-5].split('-'))) for name in state_names]
    require(state_keys == list(origins)[:len(state_keys)] and state_keys, 'origin_prefix_not_complete')
    counts = collections.Counter(indexed_files=len(index), indexed_bytes=total)
    maxima = {'dynamic_state': 0., 'dynamic_requested_mean': 0., 'published_requested_mean': 0.}
    omission_counts = {12: 0, 24: 0}
    prior_ids = {12: set(), 24: set()}
    previous, previous_key, pending = None, None, {}
    inner_losses = collections.defaultdict(dict)
    annual, seen_outer, selections = {}, set(), []
    partial = []
    from research_score_contract import prepare_origin

    for name, key in zip(state_names, state_keys):
        state = artifact(name)
        origin = origins[key]
        cutoff = datetime.fromisoformat(origin['originAt'])
        prefix = f'{key[0]}-{key[1]:02}'
        require(state['origin'] == origin and state['historical_status'] == 'retrospective_inferred'
                and state['prospective'] is False, 'state_origin_or_classification_changed')
        ids, new_ids, feature_hashes = {}, {}, {}
        for delay in (12, 24):
            eligible = [row for row in rows if (row['season'], row['week']) < key
                        and datetime.fromisoformat(row['kickoffAt']) + timedelta(hours=delay) < cutoff]
            ids[delay] = [row['gameId'] for row in eligible]
            new_ids[delay] = set(ids[delay]) - prior_ids[delay]
            window = origin['windows'][str(delay)]
            require(ids[delay] == window['eligibleInputIds'] and sha(encoded(ids[delay])) == window['inputIdSha256'],
                    'availability_input_mismatch:' + prefix)
            require(new_ids[delay] == set(window['firstDeliveryIds']) and prior_ids[delay] <= set(ids[delay]),
                    'availability_delivery_mismatch:' + prefix)
            earlier = {row['gameId'] for row in rows if (row['season'], row['week']) < key}
            require(earlier - set(ids[delay]) == set(window['omittedPriorInputIds']), 'omitted_prior_mismatch')
            require(not set(ids[delay]) & set(origin['targetGameIds'])
                    and all(datetime.fromisoformat(byid[gid]['kickoffAt']) > cutoff for gid in origin['targetGameIds']),
                    'current_or_future_target_input')
            for row in eligible:
                require(row['availability'][str(delay)] == (datetime.fromisoformat(row['kickoffAt']) + timedelta(hours=delay)).isoformat(),
                        'availability_proxy_changed')
            features = [{'context': {'game_id': row['gameId'], 'season': row['season'], 'week': row['week'],
                                      'home': row['homeTeam'], 'away': row['awayTeam'], 'neutral': row['neutral']},
                         'home_score': row['homeScore'], 'away_score': row['awayScore']} for row in eligible]
            feature_hashes[delay] = sha(encoded(features))
            omission_counts[delay] += len(window['omittedPriorInputIds'])
            counts['origin_windows'] += 1
            ancestry_name = 'ancestry-' + prefix + '.json'
            if ancestry_name in index:
                check_lineage(artifact(ancestry_name)[str(delay)], cutoff, ids[delay], feature_hashes[delay], manifest,
                              index['forecasts-' + prefix + '.json']['sha256'], delay)
                counts['lineage_closures'] += 1
            # Actual-origin feature falsifiers, without fitting or scoring.
            baseline = prepare_origin(rows, origin, delay)
            require(baseline['input_hash'] == feature_hashes[delay], 'independent_feature_hash_mismatch')
            changed = [dict(row, spread=-1234, recorded_selection='injected-control',
                            **({'homeScore': 201, 'awayScore': 177, 'overtime': 99}
                               if (row['season'], row['week']) >= key else {})) for row in rows]
            require(baseline == prepare_origin(changed, origin, delay), 'future_label_or_market_falsification_failed')
            truncated = [row for row in rows if (row['season'], row['week']) <= key][::-1]
            require(baseline == prepare_origin(truncated, origin, delay), 'truncation_or_order_falsification_failed')
            counts['feature_falsification_comparisons'] += 2

        current = {tuple(row['key']): row for row in state['trajectory_state']}
        require(set(current) == expected_trajectories and len(current) == len(state['trajectory_state']), 'trajectory_population_mismatch')
        boundary = previous_key is not None and key[0] > previous_key[0]
        for trajectory_key, trajectory in current.items():
            family, setting, variant = trajectory_key
            delay = 24 if variant == 'availability_24h' else 12
            result, events = trajectory['output'], trajectory['output']['events']
            require(len(events['delivered']) == len(set(events['delivered']))
                    and set(events['delivered']) == new_ids[delay], 'trajectory_delivery_mismatch')
            require(set(events['initialization_only']) <= new_ids[delay]
                    and events['offseason_retention_applied'] == boundary, 'trajectory_event_mismatch')
            forecasts = result['forecasts']
            require([row['game_id'] for row in forecasts] == sorted(origin['targetGameIds']), 'trajectory_target_mismatch')
            counts['trajectory_delivery_ledgers'] += 1
            if family not in ('E1', 'E2'):
                continue
            old = None if previous is None else previous[trajectory_key]
            rating = np.full(32, 1500.) if old is None else np.array(old['ratings'])
            offense = np.zeros(32) if old is None else np.array(old['offense'])
            defense = np.zeros(32) if old is None else np.array(old['defense'])
            parameters = settings[family][setting]
            saved = pending.setdefault(trajectory_key, {})
            already_failed = old is not None and old['output']['absorbing_failure']
            # New absorbing failures cannot be recovered from the saved pre-reset
            # state; preserve an explicit unsupported check instead of claiming it.
            new_absorbing = result['absorbing_failure'] and not already_failed
            skipped_initialization = []

            def mapped(row):
                if variant != 'shuffled_identity':
                    return row['homeTeam'], row['awayTeam']
                order = np.random.Generator(np.random.PCG64(seed('shuffle', row['season'], row['week']))).permutation(teams)
                mapping = dict(zip(teams, order))
                return mapping[row['homeTeam']], mapping[row['awayTeam']]

            def deliver(games):
                rd, od, dd = np.zeros(32), np.zeros(32), np.zeros(32)
                for gid in sorted(games, key=lambda value: (byid[value]['season'], byid[value]['week'], value)):
                    require(gid in saved, 'missing_original_origin_expectation')
                    original = saved.pop(gid)
                    if already_failed:
                        continue
                    row = byid[gid]
                    home, away = mapped(row)
                    h, a = team_index[home], team_index[away]
                    k = parameters['k'] * (.5 if row['season'] == 2020 else 1.)
                    if variant in ('no_team_identity', 'K_zero'):
                        k = 0.
                    if family == 'E1':
                        y = 1. if row['homeScore'] > row['awayScore'] else .5 if row['homeScore'] == row['awayScore'] else 0.
                        delta = k * (y - original['expected_win'])
                        rd[h] += delta
                        rd[a] -= delta
                    elif original['initialization_only']:
                        skipped_initialization.append(gid)
                    else:
                        error = np.array([row['homeScore'], row['awayScore']]) - original['mean']
                        if variant != 'no_offense':
                            od[h] += k * error[0] / 2
                            od[a] += k * error[1] / 2
                        if variant != 'no_defense':
                            dd[a] -= k * error[0] / 2
                            dd[h] -= k * error[1] / 2
                if not already_failed:
                    rating[:] += rd
                    offense[:] += od
                    defense[:] += dd
                    offense[:] -= offense.mean()
                    defense[:] -= defense.mean()

            if boundary:
                deliver([gid for gid in new_ids[delay] if byid[gid]['season'] < key[0]])
                if not already_failed:
                    retention = 0. if variant == 'no_prior_season_carryover' else parameters['retention']
                    retention **= key[0] - previous_key[0]
                    rating[:] = 1500 + (rating - 1500) * retention
                    offense[:] *= retention
                    defense[:] *= retention
                deliver([gid for gid in new_ids[delay] if byid[gid]['season'] == key[0]])
            else:
                deliver(new_ids[delay])
            if new_absorbing:
                partial.append({'check': 'new_absorbing_transition', 'origin': list(key), 'trajectory': list(trajectory_key)})
            else:
                error = max(float(np.max(np.abs(values - trajectory[field])))
                            for values, field in ((rating, 'ratings'), (offense, 'offense'), (defense, 'defense')))
                require(error < 1e-10, 'independent_dynamic_state_mismatch:' + repr((key, trajectory_key, error)))
                maxima['dynamic_state'] = max(maxima['dynamic_state'], error)
                require(set(events['initialization_only']) == set(skipped_initialization), 'initialization_delivery_mismatch')
                counts['dynamic_state_transitions'] += 1
            for forecast in forecasts:
                row = byid[forecast['game_id']]
                home, away = mapped(row)
                h, a = team_index[home], team_index[away]
                at_home = 0. if row['neutral'] else 1.
                stored = {'mean': forecast['mean'], 'initialization_only': forecast['initialization_only']}
                if family == 'E1' and not result['absorbing_failure']:
                    hp = 0. if variant == 'no_home_effect' else parameters['home_points']
                    x = float((trajectory['ratings'][h] - trajectory['ratings'][a] + hp * at_home) / 400)
                    # Stable mathematical base-10 probability, independently
                    # computed from the original-origin saved ratings.
                    z = math.log(10) * x
                    stored['expected_win'] = 1 / (1 + math.exp(-z)) if z >= 0 else math.exp(z) / (1 + math.exp(z))
                    expected = None if result['league_mean'] is None else np.array([
                        result['league_mean'] + result['elo_score_slope'] * x / 2,
                        result['league_mean'] - result['elo_score_slope'] * x / 2])
                elif family == 'E2' and not result['absorbing_failure']:
                    expected = None if result['league_mean'] is None else np.array([
                        result['league_mean'] + result['home_effect'] * at_home / 2 + trajectory['offense'][h] - trajectory['defense'][a],
                        result['league_mean'] - result['home_effect'] * at_home / 2 + trajectory['offense'][a] - trajectory['defense'][h]])
                else:
                    expected = None
                require((expected is None) == (forecast['mean'] is None), 'requested_mean_availability_mismatch')
                if expected is not None:
                    error = float(np.max(np.abs(expected - forecast['mean'])))
                    require(error < 1e-12, 'independent_requested_mean_mismatch')
                    maxima['dynamic_requested_mean'] = max(maxima['dynamic_requested_mean'], error)
                    counts['dynamic_requested_means'] += 1
                saved[forecast['game_id']] = stored

        selection_name = f'selection-{key[0]}.json'
        if key[0] >= 2013 and key[0] not in annual:
            require(selection_name in index, 'missing_annual_selection')
            selected = artifact(selection_name)
            expected_games = {(row['season'], row['gameId']) for row in rows if row['season'] in (key[0] - 2, key[0] - 1)}
            require(set(selected) == set(settings), 'selection_family_mismatch')
            for family, parameter_rows in settings.items():
                decision, candidates = selected[family], []
                require(decision['inner_seasons'] == [key[0] - 2, key[0] - 1]
                        and decision['games'] == len(expected_games), 'selection_fold_mismatch')
                for j in range(len(parameter_rows)):
                    source = {(s, gid): value for (s, gid), value in inner_losses[(family, j)].items()
                              if s in (key[0] - 2, key[0] - 1)}
                    require(set(source) == expected_games, 'selection_inner_population_mismatch')
                    values = [source[identity] for identity in sorted(expected_games)]
                    energy = float(np.mean([value[0] for value in values]))
                    failure = float(np.mean([value[1] for value in values]))
                    candidates.append({'setting': j, 'mean_energy': energy, 'failure_rate': failure,
                                       'eligible': failure <= config['failure']['innerSettingIneligibleAboveFailureRate']})
                require(candidates == decision['candidates'], 'selection_candidates_mismatch')
                good = [row for row in candidates if row['eligible']]
                chosen = None if not good else next(row['setting'] for row in good
                    if row['mean_energy'] <= min(value['mean_energy'] for value in good) + config['common']['selectionTieTolerance'])
                require(chosen == decision['setting'], 'selected_setting_mismatch')
                counts['selected_family_seasons'] += 1
            annual[key[0]] = selected
            selections.append({'season': key[0], 'settings': {family: decision['setting'] for family, decision in selected.items()},
                               'inner_games': len(expected_games)})
            # Retain only losses needed for this season's later successor folds.
            for population in inner_losses.values():
                for identity in list(population):
                    if identity[0] < key[0] - 1:
                        del population[identity]

        forecast_name = 'forecasts-' + prefix + '.json'
        if forecast_name in index:
            publication = artifact(forecast_name)
            require(publication['manifest_sha256'] == MANIFEST_SHA and publication['origin_at'] == origin['originAt']
                    and publication['classification'] == 'retrospective', 'forecast_provenance_mismatch')
            full = publication['full_setting_forecasts']
            expected_full = [(family, j, gid) for gid in origin['targetGameIds']
                             for family, parameters in settings.items() for j in range(len(parameters))]
            require([(row['family'], row['setting'], row['game_id']) for row in full] == expected_full,
                    'full_forecast_population_mismatch')
            native = {trajectory_key: {row['game_id']: row for row in trajectory['output']['forecasts']}
                      for trajectory_key, trajectory in current.items()}
            mapper_objects = {}

            def check_forecast(row, outer):
                family, j, gid = row['family'], row['setting'], row['game_id']
                variant = row['variant'] if outer else 'full'
                delay = 24 if variant == 'availability_24h' else 12
                descriptor = row['distribution']
                pointer = descriptor['mapper']
                require(pointer == {'name': pointer['name'], 'sha256': index[pointer['name']]['sha256']},
                        'mapper_pointer_mismatch')
                if pointer['name'] not in mapper_objects:
                    mapper_objects[pointer['name']] = artifact(pointer['name'])
                require(mapper_objects[pointer['name']]['input_sha256'] == feature_hashes[delay], 'mapper_availability_mismatch')
                if row['native_failure'] is not None:
                    counts['published_native_failures'] += 1
                    partial.append({'check': 'fallback_descriptor_requires_separate_quantitative_review', 'origin': list(key),
                                    'family': family, 'setting': j, 'variant': variant, 'game': gid, 'failure': row['native_failure']})
                    return
                require(j is not None, 'native_forecast_without_selected_setting')
                trajectory_variant = 'full' if variant in ('independent_marginals', 'deterministic_noise') else variant
                requested = np.array(native[(family, j, trajectory_variant)][gid]['mean'])
                if variant == 'deterministic_noise':
                    requested += np.array([np.random.Generator(np.random.PCG64(seed('noise', gid, side))).standard_normal()
                                           for side in ('home', 'away')])
                require(descriptor['independent'] is (variant == 'independent_marginals'), 'independent_variant_mismatch')
                error = float(np.max(np.abs(requested - descriptor['mean'])))
                require(error <= 1e-7, 'published_requested_mean_mismatch')
                maxima['published_requested_mean'] = max(maxima['published_requested_mean'], error)
                counts['outer_requested_mean_comparisons' if outer else 'full_requested_mean_comparisons'] += 1

            for row in full:
                check_forecast(row, False)
            outer = publication['outer_selected_forecasts']
            expected_outer = [(family, variant, gid) for family, variant in series for gid in origin['targetGameIds']] if key[0] >= 2013 else []
            require([(row['family'], row['variant'], row['game_id']) for row in outer] == expected_outer,
                    'outer_forecast_population_mismatch')
            for row in outer:
                require(row['setting'] == annual[key[0]][row['family']]['setting'], 'outer_selected_trajectory_mismatch')
                check_forecast(row, True)
            counts['forecast_origins'] += 1
            for scope, expected in (('inner', expected_full), ('outer', expected_outer)):
                loss_name = scope + '-losses-' + prefix + '.json'
                if not expected:
                    continue
                if loss_name not in index:
                    partial.append({'check': 'published_forecast_without_completed_scoring', 'origin': list(key), 'scope': scope})
                    continue
                losses = artifact(loss_name)
                actual = [(row['family'], row['setting'] if scope == 'inner' else row['variant'], row['game_id']) for row in losses]
                require(actual == expected, 'loss_forecast_population_mismatch')
                forecasts = full if scope == 'inner' else outer
                for loss, forecast in zip(losses, forecasts):
                    require(loss['native_failure'] == forecast['native_failure'], 'native_failure_ledger_mismatch')
                    if scope == 'inner' and key[0] >= 2011:
                        population = inner_losses[(loss['family'], loss['setting'])]
                        identity = (key[0], loss['game_id'])
                        require(identity not in population, 'duplicate_selection_inner_loss')
                        population[identity] = (loss['metrics']['joint_energy_score'], loss['native_failure'] is not None)
                counts[scope + '_scored_occurrences'] += len(losses)
                if scope == 'outer':
                    require(not seen_outer & set(origin['targetGameIds']), 'repeated_outer_game')
                    seen_outer.update(origin['targetGameIds'])
                    counts['outer_scored_origins'] += 1
        elif origin['windows']['12']['minimumTrainingMet']:
            partial.append({'check': 'state_without_completed_forecast_publication', 'origin': list(key)})
        previous, previous_key = current, key
        prior_ids = {delay: set(ids[delay]) for delay in (12, 24)}
        counts['state_origins'] += 1
        if counts['state_origins'] % 25 == 0:
            print(json.dumps({'audit_phase': 'temporal', 'origins': counts['state_origins'], 'through': list(key)}), flush=True)

    full_scope = len(state_keys) == len(origins) and len(seen_outer) == 3407 and counts['outer_scored_occurrences'] == 3407 * 40
    require(terminal['status'] == 'protocol_invalid' or full_scope, 'scientific_terminal_requires_full_population')
    report = {'status': 'temporal_checks_pass_with_limits' if not partial else 'temporal_checks_partial',
              'run_manifest_sha256': MANIFEST_SHA, 'artifact_index_sha256': args.index_sha256,
              'terminal': terminal, 'full_temporal_population': full_scope,
              'first_origin': list(state_keys[0]), 'last_origin': list(state_keys[-1]),
              'outer_games': len(seen_outer), 'counts': dict(counts), 'max_abs_differences': maxima,
              'omitted_prior_occurrences': omission_counts, 'selections': selections, 'incomplete_checks': partial,
              'falsification_scope': 'Every available origin at 12h/24h: current/future score and OT mutation plus injected market/selection fields; future truncation plus row reversal. No model fitting or score recomputation.',
              'limits': ['Retrospective kickoff+12h/24h proxies are not original completion/publication evidence; ancestor available_at fields remain null.',
                         'E1/E2 state equations independently reconstructed from original-origin snapshots across available variants; E1 score-slope and S1/N0 coefficients were inspected, not independently refit.',
                         'Global franchise renaming and neutral swaps are inherited synthetic-smoke evidence, not fresh all-history refits.',
                         'This audit does not recompute metrics, calibration, uncertainty, promotion or market value; those require separate quantitative review.',
                         'No scorecard or temporal audit establishes prospective or 1% predictive improvement.'],
              'football_fits': 0, 'distribution_fits': 0, 'score_calls': 0, 'provider_requests': 0,
              'production_authorized': False, 'script_sha256': sha(read_regular(Path(__file__).resolve()))}
    with output.open('xb') as stream:
        stream.write(encoded(report))
    print(json.dumps({'status': report['status'], 'output': str(output), 'full_temporal_population': full_scope,
                      'counts': dict(counts), 'incomplete_checks': len(partial), 'report_sha256': sha(encoded(report))}), flush=True)


if __name__ == '__main__':
    main()
