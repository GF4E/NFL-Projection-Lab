"""One frozen descriptive pass over saved means; no fitting or scoring."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import signal
import sys
import time

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
BASE = ROOT / '.planning/engine-os'
HERE = Path(__file__).resolve().parent
SCOPE = BASE / 'research-first/RF-02E-MEAN-DIAGNOSTIC-SCOPE.v1.md'
SCOPE_HASH = '0663b5f6c78daa9c4ecd6ebaafbdfd6e3d125ba05a1a7abb448c506bae0c843f'
ACCEPTANCE = BASE / 'research-first/RF-02E-TERMINAL-ACCEPTANCE.v1.json'
ACCEPTANCE_HASH = '463bc0a16c617dc228b4a7f1c80bc15cabcf8df5900ea97b5ab9db28135d9835'
SERIES = [('N0', 'full'), ('N0', 'availability_24h'), ('E2', 'full'), ('E2', 'availability_24h')]
TARGETS = ('margin', 'total')
COUNTS = dict(zip(range(2013, 2026), [256] * 8 + [272, 271, 272, 272, 272]))
REL_TOL, ABS_TOL = 1e-12, 1e-9


def enc(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def close(a, b):
    assert math.isclose(a, b, rel_tol=REL_TOL, abs_tol=ABS_TOL), (a, b)


def moments(prediction, observed):
    n = len(prediction)
    assert n and len(observed) == n
    assert all(type(v) in (int, float) and math.isfinite(v) for v in prediction + observed)
    mp, my = math.fsum(prediction) / n, math.fsum(observed) / n
    bias = math.fsum(y - p for p, y in zip(prediction, observed)) / n
    mse = math.fsum((y - p) ** 2 for p, y in zip(prediction, observed)) / n
    vp = math.fsum((p - mp) ** 2 for p in prediction) / n
    vy = math.fsum((y - my) ** 2 for y in observed) / n
    cov = math.fsum((p - mp) * (y - my) for p, y in zip(prediction, observed)) / n
    close(bias, my - mp)
    close(mse, vy + vp - 2 * cov + bias ** 2)
    return dict(n=n, mean_prediction=mp, mean_observation=my, observed_minus_predicted_bias=bias,
                mean_squared_error=mse, prediction_variance=vp, prediction_observation_covariance=cov)


def reconcile(pool, groups):
    n = sum(g['n'] for g in groups)
    assert n == pool['n']
    for key in ('mean_prediction', 'mean_observation', 'observed_minus_predicted_bias', 'mean_squared_error'):
        close(pool[key], math.fsum(g['n'] * g[key] for g in groups) / n)
    close(pool['prediction_variance'], math.fsum(g['n'] * (g['prediction_variance']
          + (g['mean_prediction'] - pool['mean_prediction']) ** 2) for g in groups) / n)
    close(pool['prediction_observation_covariance'], math.fsum(g['n'] * (g['prediction_observation_covariance']
          + (g['mean_prediction'] - pool['mean_prediction']) * (g['mean_observation'] - pool['mean_observation']))
          for g in groups) / n)


def self_test():
    a = moments([1., 3.], [2., 4.])
    assert a == dict(n=2, mean_prediction=2., mean_observation=3., observed_minus_predicted_bias=1.,
                     mean_squared_error=1., prediction_variance=1., prediction_observation_covariance=1.)
    b = moments([2., 2.], [1., 3.])
    assert b['mean_squared_error'] == 1. and b['prediction_variance'] == b['prediction_observation_covariance'] == 0.
    naive = moments([2., 2.], [2., 4.])
    assert a['mean_squared_error'] - naive['mean_squared_error'] == -1.
    p, y = [1., 3., 5., 7.], [2., 4., 8., 10.]
    reconcile(moments(p, y), [moments(p[:2], y[:2]), moments(p[2:], y[2:])])
    assert moments(p[::-1], y[::-1]) == moments(p, y)
    for bad in ([True, 2.], [float('nan'), 2.], ['1', 2.]):
        try:
            moments(bad, [2., 4.])
        except AssertionError:
            pass
        else:
            raise AssertionError('nonnumeric input accepted')
    return {'known_values': True, 'constant_predictor': True, 'paired_sign': True,
            'pooled_between_group_terms': True, 'reversal_invariance': True, 'invalid_numeric_rejection': True}


def run():
    started = time.monotonic()
    destination = HERE / 'result-v1'
    destination.mkdir()  # Exclusive: even an invalid prior prefix refuses a second invocation.
    read_log = {}
    def budget():
        assert time.monotonic() - started <= 120, '120_second_limit'
        assert resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2 <= 2048, '2048_mib_limit'
    def expired(_sig, _frame):
        raise TimeoutError('120_second_limit')
    previous = signal.signal(signal.SIGALRM, expired)
    assert signal.getitimer(signal.ITIMER_REAL) == (0., 0.)
    signal.setitimer(signal.ITIMER_REAL, 120)
    result = None
    try:
        source_hash = sha(Path(__file__).read_bytes())
        assert sha(SCOPE.read_bytes()) == SCOPE_HASH
        assert sha(ACCEPTANCE.read_bytes()) == ACCEPTANCE_HASH
        acceptance = json.loads(ACCEPTANCE.read_bytes())
        assert acceptance['status'] == 'accepted_derived_retrospective_negative_result_only'
        for name, digest in acceptance['accepted_source_hashes'].items():
            assert sha((ROOT / name).read_bytes()) == digest
        sys.path.insert(0, str(ROOT / 'scripts'))
        from research_score_contract import read_regular, runtime_manifest
        def load(pointer):
            budget()
            path = Path(pointer['path'])
            raw = read_regular(path)
            assert sha(raw) == pointer['sha256']
            assert 'bytes' not in pointer or len(raw) == pointer['bytes']
            read_log[str(path)] = {'sha256': sha(raw), 'bytes': len(raw)}
            return json.loads(raw)
        em = load(acceptance['manifest'])
        ei = load(acceptance['artifact_index'])
        eroot = Path(acceptance['manifest']['path']).parent
        def indexed(directory, index, name):
            assert name == Path(name).name or name.startswith('completion/')
            return load({'path': str(directory / name), **index['files'][name]})
        for name, pointer in acceptance['independent_reviews'].items():
            review = load(pointer)
            assert review['blockers'] == [] and review['manifest_sha256'] == acceptance['manifest']['sha256']
            assert review['source_hashes'] == acceptance['accepted_source_hashes']
        cm_pointer = em['fixed_inputs']['RF-02C parent manifest']
        cm = load(cm_pointer)
        ci = load(em['fixed_inputs']['RF-02C parent index'])
        croot = Path(cm_pointer['path']).parent
        runtime = runtime_manifest({'runtime': cm['runtime']['versions']})
        assert runtime == cm['runtime'] == em['runtime']
        dp = em['fixed_inputs']['Admitted score data v2']
        data = load(dp)
        assert cm['bound_hashes']['admittedData'] == dp['sha256']
        records = {r['gameId']: r for r in data['records']}
        assert len(records) == len(data['records'])
        origins = [o for o in data['origins'] if 2013 <= o['season'] <= 2025]
        keys = [g for o in origins for g in o['targetGameIds']]
        assert len(origins) == 226 and len(keys) == len(set(keys)) == 3407
        assert {year: sum(records[g]['season'] == year for g in keys) for year in COUNTS} == COUNTS
        ledger = indexed(eroot, ei, 'authenticated-inputs.json')
        assert sha(enc(keys)) == ledger['ordered_games_sha256']
        data_rows = {s: [] for s in SERIES}
        metric_hashes = {s: hashlib.sha256() for s in SERIES}
        reason_hashes = {s: hashlib.sha256() for s in SERIES}
        native_counts = {s: 0 for s in SERIES}
        maximum_squared_error_difference = 0.
        for origin in origins:
            suffix = f"{origin['season']}-{origin['week']:02}.json"
            rows = indexed(croot, ci, 'outer-losses-' + suffix)
            forecast = indexed(croot, ci, 'forecasts-' + suffix)
            assert forecast['manifest_sha256'] == cm_pointer['sha256'] and forecast['origin_at'] == origin['originAt']
            issued = {(x['family'], x['variant'], x['game_id']): x for x in forecast['outer_selected_forecasts']}
            assert len(issued) == len(forecast['outer_selected_forecasts'])
            chosen = [r for r in rows if (r['family'], r['variant']) in SERIES]
            assert [(r['family'], r['variant'], r['game_id']) for r in chosen] == [(*s, g) for s in SERIES for g in origin['targetGameIds']]
            for row in chosen:
                family, variant, game = row['family'], row['variant'], row['game_id']
                s = family, variant
                assert set(row) == {'family', 'variant', 'game_id', 'native_failure', 'metrics'}
                assert row['native_failure'] == issued[family, variant, game]['native_failure']
                reason_hashes[s].update(enc({'game_id': game, 'native_failure': row['native_failure']}))
                native_counts[s] += row['native_failure'] is not None
                metric_hashes[s].update(enc({'game_id': game, 'metrics': row['metrics']}))
                record = records[game]
                assert (record['season'], record['week']) == (origin['season'], origin['week'])
                values = {}
                for target in TARGETS:
                    m = row['metrics']; prediction, observed, squared = [m[target + '_' + k] for k in ('mean', 'observed', 'squared_error')]
                    assert all(type(v) in (int, float) and math.isfinite(v) for v in (prediction, observed, squared))
                    expected = record['homeScore'] - record['awayScore'] if target == 'margin' else record['homeScore'] + record['awayScore']
                    assert observed == expected
                    discrepancy = abs((observed - prediction) ** 2 - squared)
                    maximum_squared_error_difference = max(maximum_squared_error_difference, discrepancy)
                    close((observed - prediction) ** 2, squared)
                    values[target] = (prediction, observed)
                data_rows[s].append((game, record['season'], values))
        assert all([r[0] for r in rows] == keys for rows in data_rows.values())
        for s in SERIES:
            expected = next(x for x in ledger['series'] if (x['family'], x['variant']) == s)
            assert expected['metrics_sha256'] == metric_hashes[s].hexdigest() and expected['rows'] == 3407
        partitions = {'development': [i for i, g in enumerate(keys) if records[g]['season'] <= 2024]}
        partitions.update({str(year): [i for i, g in enumerate(keys) if records[g]['season'] == year] for year in range(2013, 2025)})
        partitions['exposed_2025'] = [i for i, g in enumerate(keys) if records[g]['season'] == 2025]
        cells = {}
        for family, variant in SERIES:
            for target in TARGETS:
                name = ':'.join((family, variant, target))
                cells[name] = {}
                for partition, inds in partitions.items():
                    pairs = [data_rows[family, variant][i][2][target] for i in inds]
                    cells[name][partition] = moments([p for p, _ in pairs], [y for _, y in pairs])
                reconcile(cells[name]['development'], [cells[name][str(year)] for year in range(2013, 2025)])
        paired = {}
        for variant in ('full', 'availability_24h'):
            for target in TARGETS:
                paired[variant + ':' + target] = {}
                for partition, inds in partitions.items():
                    diffs = []
                    for i in inds:
                        p0, y0 = data_rows['N0', variant][i][2][target]
                        p2, y2 = data_rows['E2', variant][i][2][target]
                        assert y0 == y2
                        diffs.append((y2 - p2) ** 2 - (y0 - p0) ** 2)
                    difference = math.fsum(diffs) / len(diffs)
                    close(difference, cells['E2:' + variant + ':' + target][partition]['mean_squared_error']
                          - cells['N0:' + variant + ':' + target][partition]['mean_squared_error'])
                    paired[variant + ':' + target][partition] = {'n': len(diffs), 'E2_minus_N0_mean_squared_error': difference}
        evaluation = load(acceptance['evaluation'])
        calibration = {}
        for family, variant in SERIES:
            for target in TARGETS:
                name = ':'.join((family, variant, target)); calibration[name] = {}
                for partition in ('development', 'exposed_2025'):
                    card = evaluation['scorecards'][family + ':' + variant][partition]
                    calibration[name][partition] = card['calibration'][target]
                    for field, metric in [('mean_prediction', 'mean'), ('mean_observation', 'observed'), ('mean_squared_error', 'squared_error')]:
                        close(cells[name][partition][field], card['metrics'][target + '_' + metric]['mean'])
        budget()
        assert sha(Path(__file__).read_bytes()) == source_hash and sha(SCOPE.read_bytes()) == SCOPE_HASH
        result = {'version': 'rf02e-saved-mean-diagnostic.v1', 'status': 'complete_descriptive_evidence_requires_independent_review',
                  'scope_sha256': SCOPE_HASH, 'script_sha256': source_hash, 'terminal_acceptance_sha256': ACCEPTANCE_HASH,
                  'runtime': runtime, 'source_hashes': acceptance['accepted_source_hashes'], 'read_files': read_log,
                  'counts': {'origins': 226, 'games': 3407, 'selected_rows': 13628, 'cells': 8, 'partitions': 14, 'cell_summaries': 112, 'paired_differences': 56},
                  'ordered_games_sha256': sha(enc(keys)), 'partition_counts': {k: len(v) for k, v in partitions.items()},
                  'native_failure_counts': {':'.join(s): n for s, n in native_counts.items()},
                  'native_reason_digests': {':'.join(s): h.hexdigest() for s, h in reason_hashes.items()},
                  'complete_metric_digests': {':'.join(s): h.hexdigest() for s, h in metric_hashes.items()},
                  'cells': cells, 'paired_differences': paired, 'existing_calibration_no_new_fit_no_uncertainty': calibration,
                  'analytical_tests': self_test(), 'validation': {'relative_tolerance': REL_TOL, 'absolute_tolerance': ABS_TOL,
                  'squared_errors_checked': 27256, 'maximum_squared_error_absolute_difference': maximum_squared_error_difference,
                  'all_moment_and_partition_identities_passed': True, 'existing_aggregate_reconciliation_passed': True},
                  'scientific_calls': {'fit': 0, 'transform': 0, 'forecast': 0, 'score': 0, 'bootstrap': 0},
                  'limits': {'seconds': 120, 'peak_rss_mib': 2048}, 'seconds_before_publication': time.monotonic() - started,
                  'peak_rss_mib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2,
                  'decision': 'pending_root_and_independent_interpretation_of_all_partitions_no_grid_authorized',
                  'limitations': ['Descriptive exposed-history moments cannot identify optimal update rates or demonstrate prospective improvement.',
                                  'Original publication/availability limits are inherited; no original model or experiment is accepted by these diagnostics.']}
        raw = enc(result)
        with (destination / 'result.json').open('xb') as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        budget()
        observation = {'status': result['status'], 'result_sha256': sha(raw), 'seconds': time.monotonic() - started,
                       'peak_rss_mib': result['peak_rss_mib'], 'counts': result['counts']}
        with (destination / 'completion.json').open('xb') as stream:
            stream.write(enc(observation)); stream.flush(); os.fsync(stream.fileno())
        budget()
        print(json.dumps(observation))
    except Exception as exc:
        signal.setitimer(signal.ITIMER_REAL, 0)
        failure = {'status': 'diagnostic_invalid', 'failure': type(exc).__name__, 'reason': str(exc),
                   'seconds': time.monotonic() - started, 'read_files': read_log, 'automatic_retry': False}
        with (destination / 'failure.json').open('xb') as stream:
            stream.write(enc(failure))
        print(json.dumps({k: v for k, v in failure.items() if k != 'read_files'}))
        raise
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0); signal.signal(signal.SIGALRM, previous)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--execute-once', action='store_true')
    args = parser.parse_args()
    assert args.self_test != args.execute_once, 'choose self-test or execute-once'
    if args.self_test:
        print(json.dumps(self_test()))
    else:
        run()
