"""Independent ridge arithmetic and real warmup chronology/invariance checks."""
import copy
import datetime as dt
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import numpy as np
from engine.forecast_system.calendar import schedule_kickoff, timestamp
from check_calibration_sources import load, ref
from prepare_early_forecasts import generate


def independent_fit(rows, labels, fit):
    # Numerical route intentionally does not call the engine fit or predict.
    names = ['baseline', 'elo', 'elo_difference']
    if fit['names'] != names or fit['penalty'] != 10 or fit['groups'] != ['calibration', 'elo']:
        raise ValueError('Warmup method differs')
    y = np.array([labels[r['game_id']][r['home']] - r['features']['baseline'] for r in rows])
    x = np.array([[r['features'][n] for n in names] for r in rows], dtype=float)
    means = np.nanmean(x, axis=0)
    scales = np.nanstd(x, axis=0)
    scales = np.where(scales > 0, scales, 1.)
    z = np.nan_to_num((x - means) / scales, nan=0.)
    intercept = float(y.mean())
    design = np.vstack([z, np.sqrt(10)*np.eye(3)])
    target = np.concatenate([y - intercept, np.zeros(3)])
    coefficients = np.linalg.lstsq(design, target, rcond=None)[0]
    differences = [abs(intercept - fit['intercept'])]
    for key, value in [('means', means), ('scales', scales), ('coefficients', coefficients)]:
        differences.append(float(np.max(np.abs(value - fit[key]))))
    if max(differences) > 1e-10:
        raise ValueError('Independent ridge differs')
    return means, scales, coefficients, intercept, max(differences)


def run():
    started = time.monotonic()
    summary = load(ref('work/engine-rebuild/early-forecasts-verification.json'))
    body = load(summary['artifact'])
    feature_body = load(body['sources']['features'])
    source = load(body['sources']['inputs'])
    active = load(body['sources']['active_fit'])
    features = feature_body['rows']
    bygame = {g['game_id']: g for g in source['schedule']}
    byrow = {r['row_id']: r for r in features}
    labels = {gid: {True: float(g['home_score']), False: float(g['away_score'])} for gid, g in bygame.items()}
    numeric = {}
    max_fit_difference = 0.
    memberships = 0
    for f in body['fits']:
        through = f['closeout_evidence']
        selected = sorted((r for r in features if r['season'] < through['season'] or
                           r['season'] == through['season'] and r['week'] <= through['week']), key=lambda r: r['row_id'])
        if sorted({r['game_id'] for r in selected}) != f['training_games'] or len(selected) != 2*len(f['training_games']):
            raise ValueError('Training population differs')
        for r in selected:
            g = bygame[r['game_id']]
            if schedule_kickoff(g['gameday'], g['gametime']) + dt.timedelta(hours=4) >= timestamp(f['at']):
                raise ValueError('Future result in fit')
            memberships += 1
        numeric[f['fit_sha256']] = independent_fit(selected, labels, f['fit'])
        max_fit_difference = max(max_fit_difference, numeric[f['fit_sha256']][-1])
    fit_lookup = {f['fit_sha256']: f for f in body['fits']}
    max_prediction_difference = 0.
    for g in body['games']:
        fitted = fit_lookup[g['fit_sha256']]
        if g['game_id'] in fitted['training_games'] or timestamp(fitted['available_at']) >= timestamp(g['issuance_at']):
            raise ValueError('Target/future fit leakage')
        means, scales, coefficients, intercept, _ = numeric[g['fit_sha256']]
        for side in ('home', 'away'):
            r = byrow[g['game_id'] + ':' + bygame[g['game_id']][side+'_team']]
            x = np.array([r['features'][n] for n in ['baseline', 'elo', 'elo_difference']])
            expected = float(r['features']['baseline'] + intercept + np.nan_to_num((x-means)/scales) @ coefficients)
            max_prediction_difference = max(max_prediction_difference, abs(expected-g[side]))
            if abs(expected-g[side]) > 1e-10 or g['legacy_donor_'+side] != r['features']['baseline']:
                raise ValueError('Independent point reconstruction differs')
            if g['actual_'+side] != labels[g['game_id']][side == 'home']:
                raise ValueError('Final differs from pinned source')
    reversed_run = generate(list(reversed(features)), list(reversed(source['schedule'])), active)
    if any(reversed_run[k] != body[k] for k in ('games', 'fits', 'waiting_refits')):
        raise ValueError('Source reversal changes warmup')
    changed = copy.deepcopy(source['schedule'])
    for g in changed:
        if int(g['season']) == 2015:
            g['home_score'], g['away_score'] = 99., 0.
    future = generate(features, changed, active)
    for key in ('games', 'fits'):
        if [r for r in future[key] if r['season'] < 2015] != [r for r in body[key] if r['season'] < 2015]:
            raise ValueError('Future labels change earlier warmup')
    changed = copy.deepcopy(source['schedule'])
    for g in changed:
        if int(g['season']) == 2012:
            g['home_score'] = float(g['home_score']) + 10
            g['away_score'] = float(g['away_score']) + 10
    past = generate(features, changed, active)
    original = {g['game_id']: g for g in body['games']}
    responsive = sum(any(abs(g[s]-original[g['game_id']][s]) > 1e-8 for s in ('home', 'away'))
                     for g in past['games'] if g['season'] == 2013)
    if responsive == 0:
        raise ValueError('Eligible past labels failed positive control')
    result = {'status': 'PASS', 'artifact': summary['artifact'], 'fits_checked': len(body['fits']),
              'games_checked': len(body['games']), 'team_training_memberships_checked': memberships,
              'max_independent_fit_difference': max_fit_difference,
              'max_independent_prediction_difference': max_prediction_difference,
              'source_order_invariant': True, 'future_labels_preserve_2013_2014': True,
              'past_label_positive_control_changed_2013_games': responsive,
              'elapsed_seconds': time.monotonic()-started, 'checker': ref(str(Path(__file__).relative_to(ROOT))),
              'scope': 'Warmup arithmetic/label boundaries only. Pregame features held fixed in label perturbations; source-to-feature checks are separate. No comparative accuracy or calibration gate.'}
    (ROOT / 'work/engine-rebuild/early-forecasts-independent-check.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2), flush=True)


if __name__ == '__main__':
    run()
