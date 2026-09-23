"""Reproduce the archived calibration donor and audit calendar compatibility."""
import collections
import gc
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import signal
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import numpy as np
from engine.projection import cutoff_features, observations
from engine.projection.model import hash_value
from engine.projection.storage import write_bytes
from engine.projection_v3.model import fit, predict, GROUPS
from check_calibration_sources import load, ref

TOLERANCE = 1e-10


def independent(rows, fitted):
    rows = sorted(rows, key=lambda r: r['row_id'])
    names = fitted['names']
    x = np.asarray([[r['features'][n] for n in names] for r in rows], dtype=float).reshape(len(rows), len(names))
    y = np.asarray([r['actual_points'] - r['features']['baseline'] for r in rows])
    means = np.asarray([np.mean(x[np.isfinite(x[:, i]), i]) if np.isfinite(x[:, i]).any() else 0. for i in range(len(names))])
    scales = np.asarray([np.std(x[np.isfinite(x[:, i]), i]) if np.isfinite(x[:, i]).any() else 1. for i in range(len(names))])
    scales = np.where(scales > 0, scales, 1.)
    z = np.nan_to_num((x - means) / scales)
    intercept = float(np.mean(y)) if 'calibration' in fitted['groups'] else 0.
    beta = np.linalg.lstsq(np.vstack((z, np.sqrt(fitted['penalty'])*np.eye(len(names)))),
                           np.concatenate((y-intercept, np.zeros(len(names)))), rcond=None)[0] if names else np.array([])
    difference = max([abs(intercept-fitted['intercept'])] +
                     [float(np.max(np.abs(a-b))) for a, b in ((means, fitted['means']), (scales, fitted['scales']),
                                                             (beta, fitted['coefficients'])) if len(a)])
    if difference > TOLERANCE:
        raise ValueError('Independent donor fit differs')
    return difference


def before_only(value, year):
    if isinstance(value, dict):
        if 'eligible_seasons' in value and any(y >= year for y in value['eligible_seasons']):
            raise ValueError('Current/future season in recorded qualification evidence')
        for item in value.values():
            before_only(item, year)
    elif isinstance(value, list):
        for item in value:
            before_only(item, year)


def run():
    if os.environ.get('OPENBLAS_NUM_THREADS') != '1':
        raise ValueError('One worker required')
    start = time.monotonic()
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('45-minute donor audit limit')))
    signal.alarm(2700)
    plan = ref('work/engine-rebuild/LEGACY-DONOR-PLAN.md')
    code = [ref(p) for p in ('work/engine-rebuild/check_legacy_donor.py', 'work/engine-rebuild/check_calibration_sources.py',
                            'engine/projection_v3/model.py', 'engine/projection/cutoff_features.py',
                            'engine/projection/features.py', 'engine/projection/model.py', 'engine/elo.py',
                            'engine/forecast_system/calendar.py', 'engine/forecast_system/cadence.py')]
    catalog = load(ref('work/series-registry/catalog.json'))
    control_ref = next(r for r in catalog['series'] if r['path'] == catalog['authoritative_control'] and r['authoritative'])
    control = load(control_ref)
    exp_ref = ref('work/projection-v3/experiment.json')
    exp = load(exp_ref)
    donor = load(exp['oof'])
    if len(donor) != 2639 or {r['game_id'] for r in donor} != {r['game_id'] for r in control}:
        raise ValueError('Registered population differs')
    qualifications = {q['before_season']: q for q in load(exp['qualification'])}
    cache_ref = ref('work/projection-v3/features-none-cc3d318ef8315397675c47735cceeb093c9b06f4b16178ac8b33e58778bcad28.json.gz')
    cached = load(cache_ref)
    if hash_value(cached) != exp['feature_hashes']['none']:
        raise ValueError('Historical feature logical hash differs')
    rows = [{k: r[k] for k in ('row_id', 'game_id', 'team', 'home', 'season', 'week', 'features', 'actual_points')}
            for r in cached if r['season'] <= 2025 and r['actual_points'] is not None and r['features']['baseline'] is not None]
    del cached
    gc.collect()
    original_by_id = {r['row_id']: r for r in rows}
    source = exp['source_manifest']
    games = [{k: g.get(k) for k in (*observations.GAME_KEYS, 'source_hash')}
             for g in load(source['schedule']) if g['game_type'] == 'REG' and int(g['season']) <= 2025]
    game_ids = {g['game_id']: g for g in games}
    stats = [{k: r.get(k) for k in (*observations.STAT_FIELDS, 'source_hash')}
             for r in load(source['team_games']) if int(r['season']) <= 2025]
    annual = {}
    fits = []
    largest = 0.
    independent_largest = 0.
    for a in exp['annual']:
        year = a['season']
        if a['settings']['decay'] != 'none':
            raise ValueError('Additional cache qualification needed for selected decay')
        q = qualifications[year]
        before_only(q, year)
        if q['selected_groups'] != a['selected_groups']:
            raise ValueError('Recorded qualification does not match selected groups')
        training = [r for r in rows if r['season'] < year]
        targets = [r for r in rows if r['season'] == year]
        f = fit(training, a['selected_groups'], a['settings']['penalty'])
        independent_largest = max(independent_largest, independent(training, f))
        if set(r['game_id'] for r in training) & set(r['game_id'] for r in targets):
            raise ValueError('Training/test overlap')
        if fit(list(reversed(training)), a['selected_groups'], a['settings']['penalty']) != f:
            raise ValueError('Training order changes donor fit')
        values = {(r['game_id'], r['home']): predict(f, r['features'])['points'] for r in targets}
        selected = [g for g in donor if g['season'] == year]
        if len(targets) != 2*len(selected):
            raise ValueError('Donor target population differs')
        year_max = 0.
        for g in selected:
            for side in ('home', 'away'):
                game = game_ids[g['game_id']]
                row = original_by_id[g['game_id'] + ':' + game[side+'_team']]
                if row['actual_points'] != g['actual_'+side] or float(game[side+'_score']) != g['actual_'+side]:
                    raise ValueError('Donor outcome mismatch')
                year_max = max(year_max, abs(values[g['game_id'], side == 'home'] - g[side]))
        if year_max > TOLERANCE:
            raise ValueError('Saved donor forecasts fail reproduction')
        largest = max(largest, year_max)
        fits.append({'season': year, 'fit': f, 'training_game_ids': sorted({r['game_id'] for r in training}),
                     'role': 'RECONSTRUCTED_ANNUAL_FIT_NOT_ORIGINALLY_RECORDED'})
        annual[str(year)] = {'games': len(selected), 'training_games': len(training)//2,
                             'groups': a['selected_groups'], 'settings': a['settings'],
                             'reproduction_max_difference': year_max}
    print('reproduced', len(donor), 'legacy donor forecasts; maximum difference', largest, flush=True)
    stadium_ref = ref('config/stadiums.json')
    corrected = cutoff_features.build(stats, games, load(stadium_ref), mode='HISTORICAL_RECONSTRUCTION',
                                       minimum_season=2015, elo_hfa=None)
    corrected_rows = {r['row_id']: r for r in corrected['rows']}
    differences = []
    for a in exp['annual']:
        year = a['season']; names = sorted({'baseline'} | {n for group in a['selected_groups'] for n in GROUPS[group]})
        affected = set(); maximum = 0.; fields = collections.Counter()
        for original in rows:
            if original['season'] != year:
                continue
            other = corrected_rows[original['row_id']]
            for name in names:
                left, right = original['features'].get(name), other['features'].get(name)
                if left is None or right is None:
                    changed = left != right; delta = None
                else:
                    delta = abs(left-right); maximum = max(maximum, delta); changed = delta > TOLERANCE
                if changed:
                    affected.add(original['game_id']); fields[name] += 1
                    differences.append({'row_id': original['row_id'], 'season': year, 'input': name,
                                        'original': left, 'corrected_cutoff': right, 'absolute_difference': delta})
        annual[str(year)].update(games_with_material_input_difference=len(affected),
                                 input_max_difference=maximum, changed_team_fields=dict(fields))
    load(control_ref)
    if code != [ref(r['path']) for r in code] or plan != ref(plan['path']):
        raise ValueError('Audit code or plan changed during execution')
    result = {'status': 'ORIGINAL_DONOR_REPRODUCED; CORRECTED_CALENDAR_NOT_QUALIFIED' if differences else 'ORIGINAL_DONOR_REPRODUCED; INPUT_PARITY_ONLY',
              'authoritative_control_unchanged': control_ref, 'donor': exp['oof'], 'original_experiment': exp_ref,
              'cache': cache_ref, 'logical_cache_hash': exp['feature_hashes']['none'], 'source_manifest': source,
              'stadiums': stadium_ref, 'plan': plan, 'code': code, 'annual': annual, 'reconstructed_fits': fits,
              'input_differences': differences, 'reproduction_max_difference': largest,
              'independent_fit_max_difference': independent_largest,
              'qualification_scope': 'Recorded eligibility years checked; qualification search not rerun. Source availability unknown. No accuracy comparison.',
              'elapsed_seconds': time.monotonic()-start,
              'peak_rss_bytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)}
    if result['peak_rss_bytes'] > 4*1024**3:
        raise MemoryError('4-GiB audit ceiling')
    payload = gzip.compress(json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False).encode(), mtime=0)
    path = ROOT/'work/engine-rebuild/legacy-donor'/(hashlib.sha256(payload).hexdigest()+'.json.gz')
    write_bytes(path, payload, immutable=True)
    summary = {k: v for k, v in result.items() if k not in ('reconstructed_fits', 'input_differences', 'source_manifest', 'code')}
    summary['artifact'] = ref(str(path.relative_to(ROOT)))
    (ROOT/'work/engine-rebuild/legacy-donor-verification.json').write_text(json.dumps(summary, indent=2, sort_keys=True)+'\n')
    signal.alarm(0)
    print(json.dumps(summary, indent=2, sort_keys=True), flush=True)


if __name__ == '__main__':
    run()
