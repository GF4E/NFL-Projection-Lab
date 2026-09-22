"""Read-only independent arithmetic audit; no production imports or fitting.

Reads a hash-pinned host capture and the registered historical control. Output
is diagnostic evidence, never a replacement forecast or calibration artifact.
"""
import argparse
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[2]


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def checked(root, ref):
    path = (root / ref['path']).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Reference escapes snapshot')
    raw = path.read_bytes()
    if digest(raw) != ref['sha256']:
        raise ValueError('Reference bytes differ: ' + ref['path'])
    return json.loads(raw)


def rounded(value):
    # Independent decimal implementation of the recorded legacy convention.
    return int(Decimal(str(value)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def masses(shape, center):
    if digest(canonical({k: v for k, v in shape.items() if k != 'sha256'})) != shape['sha256']:
        raise ValueError('Residual body mismatch')
    counts = shape['counts']
    if not isinstance(shape['n'], int) or shape['n'] <= 0:
        raise ValueError('Invalid residual denominator')
    if any(not isinstance(n, int) or n < 0 or str(int(k)) != k for k, n in counts.items()):
        raise ValueError('Invalid residual count')
    if sum(counts.values()) != shape['n']:
        raise ValueError('Counts do not sum to denominator')
    return {rounded(center) + int(k): n / shape['n'] for k, n in counts.items() if n}


def quantile(mass, probability):
    for value in sorted(mass):
        if math.fsum(p for k, p in mass.items() if k <= value) + 1e-14 >= probability:
            return value
    raise ValueError('Quantile outside distribution')


def metrics(rows):
    pairs = [(r[s], r['actual_' + s]) for r in rows for s in ('home', 'away')]
    pred, actual = zip(*pairs)
    xp, yp = statistics.mean(pred), statistics.mean(actual)
    denom = math.fsum((p - xp) ** 2 for p in pred)
    return {'games': len(rows), 'team_observations': len(pairs),
            'mae': statistics.mean(abs(p - y) for p, y in pairs),
            'bias_projected_minus_actual': statistics.mean(p - y for p, y in pairs),
            'projected_sd_population': statistics.pstdev(pred),
            'actual_sd_population': statistics.pstdev(actual),
            'actual_on_projected_slope': math.fsum((p-xp)*(y-yp) for p,y in pairs)/denom if denom else None}


def resolve_shapes(snapshot, card, registry):
    if card.get('calibration_ref'):
        artifact = checked(snapshot, card['fit_artifact_ref'])
        if (artifact['version'] != card['version'] or artifact['shapes'] != card['calibration_ref']
                or digest(canonical(artifact['fit'])) != card['fit_sha256']):
            raise ValueError('Card/fit/calibration mismatch')
        return checked(snapshot, artifact['shapes']), artifact['shapes'], 'EXACT_REFERENCE'
    choices = []
    for ref in registry['versions'].get(card['version'], []):
        a = checked(snapshot, ref)
        if card.get('fit_sha256') and digest(canonical(a['fit'])) != card['fit_sha256']:
            continue
        choices.append(a)
    if not choices or len({digest(canonical(a['fit'])) for a in choices}) != 1 or len({digest(canonical(a['shapes'])) for a in choices}) != 1:
        raise ValueError('Ambiguous legacy calibration')
    ref = choices[0]['shapes']
    return checked(snapshot, ref), ref, 'LEGACY_RECONSTRUCTED_NOT_ORIGINAL_REFERENCE'


def run(root=ROOT):
    receipt_path = 'work/engine-rebuild/prepared-input-capture.json'
    receipt = json.loads((root/receipt_path).read_bytes())
    snapshot = root/receipt['folder']
    # Validate every captured input, not merely the ones used by this audit.
    for path, meta in receipt['files'].items():
        local = (snapshot/path).resolve()
        if not local.is_relative_to(snapshot.resolve()):
            raise ValueError('Capture path escapes snapshot')
        if digest(local.read_bytes()) != meta['sha256']:
            raise ValueError('Captured bytes differ')
    board = json.loads((snapshot/'outputs/projection-v3/board.json').read_bytes())
    registry = json.loads((snapshot/'work/engine-rebuild/legacy-calibration-map.json').read_bytes())
    if digest(canonical({k:v for k,v in registry.items() if k!='sha256'})) != registry['sha256']:
        raise ValueError('Legacy map differs')
    catalog = json.loads((root/'work/series-registry/catalog.json').read_bytes())
    control = next(r for r in catalog['series'] if r['path'] == catalog['authoritative_control'] and r['authoritative'])
    rows = checked(root, control)
    if len({r['game_id'] for r in rows}) != len(rows) or sorted({r['season'] for r in rows}) != list(range(2016, 2026)):
        raise ValueError('Invalid control population')
    measurements = []; shapes_seen = {}; populations = Counter(); max_probability_error = 0.; max_sum_error = 0.
    for card in sorted(board['games'], key=lambda c: c['game_id']):
        populations[(card['week'], card['status'], card.get('evidence'), card['version'])] += 1
        if not card.get('projection'):
            continue
        shapes, ref, evidence = resolve_shapes(snapshot, card, registry)
        p = card['projection']; a = p['away_points']; h = p['home_points']
        if abs(p['margin']-(h-a)) > 1e-12 or abs(p['total']-(h+a)) > 1e-12:
            raise ValueError('Point identity mismatch')
        by_target = {}
        for target, center in [('away_points',a), ('home_points',h), ('margin',h-a), ('total',h+a)]:
            shape = shapes['team_points' if target.endswith('_points') else target]
            mass = masses(shape, center)
            bands = {str(l): [quantile(mass, (100-l)/200), quantile(mass, (100+l)/200)] for l in (50,80)}
            if target in p['intervals'] and p['intervals'][target] != bands:
                raise ValueError('Saved interval differs: ' + card['game_id'])
            if not bands['80'][0] <= bands['50'][0] <= bands['50'][1] <= bands['80'][1]:
                raise ValueError('Unnested intervals')
            by_target[target] = {'center':center, 'distribution_mean':math.fsum(x*v for x,v in mass.items()),
                                  'mean_minus_center':math.fsum(x*v for x,v in mass.items())-center,
                                  'negative_mass':math.fsum(v for x,v in mass.items() if x<0),
                                  'intervals':bands}
        margin = masses(shapes['margin'], h-a)
        tie = margin.get(0,0.); win = math.fsum(v for x,v in margin.items() if x>0)
        for actual,expected in [(p['home_win_probability'],win+tie/2), (p['away_win_probability'],1-win-tie/2), (p['tie_probability'],tie)]:
            max_probability_error = max(max_probability_error, abs(actual-expected))
        for side in ('home','away'):
            contribution_sum = math.fsum(x['points'] for x in card['contributions'][side])
            max_sum_error = max(max_sum_error,abs(contribution_sum-p[side+'_points']))
        measurements.append({'game_id':card['game_id'],'week':card['week'],'status':card['status'],
                             'evidence':card.get('evidence'),'version':card['version'], 'calibration_ref':ref,
                             'resolution':evidence,'targets':by_target,'strict_home_win':win,
                             'home_tie':tie,'tie_split_home_score':win+tie/2,
                             'point_vs_tie_split_direction_differs':(h>a) != (win+tie/2>.5) if h!=a and win+tie/2!=.5 else False})
        shapes_seen[ref['sha256']] = {'ref':ref, 'targets':{t:{'n':s['n'],'source_hash':s['source_hash'],
                       'residual_mean':sum(int(k)*v for k,v in s['counts'].items())/s['n']} for t,s in shapes.items()}}
    if max_probability_error > 1e-12 or max_sum_error > 1e-9:
        raise ValueError('Saved probability/contribution mismatch')
    season_path = 'outputs/cadence-v2/weeks/2026-w2/season.json'
    season = json.loads((root/season_path).read_bytes())
    reference_rows = checked(root,season['reference']['oof_source'])
    source_entry = next(x for x in catalog['series'] if x['path']==season['reference']['oof_source']['path'])
    reference_hash = digest(canonical(reference_rows))
    current_ref = json.loads((snapshot/'work/in-season-learning-v1/active-fit-ref.json').read_bytes())
    current = checked(snapshot,current_ref)
    current_shape = shapes_seen[current['shapes']['sha256']]
    # Recreate current residual counts from the earlier adaptive series, without
    # calling the producer. This verifies the lineage, not its suitability.
    errors = {'team_points':[], 'margin':[], 'total':[]}
    for r in reference_rows:
        he=r['actual_home']-r['home']; ae=r['actual_away']-r['away']
        errors['team_points'] += [he,ae]; errors['margin'].append(he-ae); errors['total'].append(he+ae)
    current_raw = checked(snapshot,current['shapes'])
    count_reproduction = {t:Counter(rounded(v) for v in e)==Counter({int(k):v for k,v in current_raw[t]['counts'].items() if v}) for t,e in errors.items()}
    if not all(count_reproduction.values()):
        raise ValueError('Current residual ancestry did not reproduce')
    return {'scope':'DIAGNOSTIC ONLY: immutable captured forecasts and point-series arithmetic; no fitting or migration',
            'capture_receipt':{'path':receipt_path,'sha256':digest((root/receipt_path).read_bytes())},
            'captured_at':receipt['captured_at'],'host_commit_at_capture':receipt['host_commit'],
            'control':{k:control[k] for k in ('path','sha256','date_added','producer_and_fit')},
            'control_pooled':metrics(rows),
            'control_by_season':{str(s):metrics([r for r in rows if r['season']==s]) for s in range(2016,2026)},
            'control_uncertainty_rows':sum('intervals' in r or 'home_win_probability' in r for r in rows),
            'populations':[{'week':w,'status':s,'evidence':e,'version':v,'games':n} for (w,s,e,v),n in sorted(populations.items())],
            'max_probability_reproduction_error':max_probability_error,'max_contribution_sum_error':max_sum_error,
            'calibrations':shapes_seen, 'current_fit_ref':current_ref,
            'current_calibration_source_matches_season_reference':all(t['source_hash']==reference_hash for t in current_shape['targets'].values()),
            'current_calibration_count_reproduction':count_reproduction,
            'season_reference':{'artifact':season_path,'sha256':digest((root/season_path).read_bytes()),
                                'reference':season['reference'],'registered_status':source_entry['status'],
                                'pooled_recomputed':metrics(reference_rows),'trust':season['trust']},
            'cards':measurements}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    output=Path(args.output).resolve()
    if output != ROOT/'work/engine-rebuild/forecast-contract-audit.json':
        raise ValueError('Only the dedicated diagnostic output may be written')
    result=run();output.write_text(json.dumps(result,sort_keys=True,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ('cards','calibrations','control_by_season','season_reference')},indent=2))
