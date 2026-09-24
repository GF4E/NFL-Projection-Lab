"""Read-only first-grade diagnostics. No fitting, providers or release decisions."""
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import numpy as np
from engine import scoring
from . import lineage
from .distribution import pmf, quantile

TARGETS = ('team_points', 'margin', 'total')
LEVELS = ('50', '80')
REPLICATES = 2000
SEED = 20260923


def average(values):
    return math.fsum(values) / len(values) if values else None


def finite(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Finite numerical forecast/outcome required')
    return value


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def verified_grade(card):
    p = card['projection']; g = card['grades']['PROJECTION']; actual = g['actual']
    for side in ('home_points', 'away_points'):
        finite(p[side]); finite(actual[side])
        if actual[side] < 0 or int(actual[side]) != actual[side]:
            raise ValueError('Final team score must be a nonnegative integer')
    for value, expected in ((p['margin'], p['home_points']-p['away_points']),
                            (p['total'], p['home_points']+p['away_points']),
                            (actual['margin'], actual['home_points']-actual['away_points']),
                            (actual['total'], actual['home_points']+actual['away_points'])):
        if abs(finite(value)-expected) > 1e-10: raise ValueError('Score identity differs')
    for target in ('home_points', 'away_points', 'margin', 'total'):
        if abs(finite(g['errors'][target])-(actual[target]-p[target])) > 1e-10:
            raise ValueError('First-grade error differs from original forecast')
    for target, bands in p['intervals'].items():
        for level in LEVELS:
            lo, hi = bands[level]
            if finite(lo) > finite(hi): raise ValueError('Unordered interval')
            if target in g.get('interval_hits', {}):
                if g['interval_hits'][target][level] != (lo <= actual[target] <= hi):
                    raise ValueError('First-grade interval hit differs')
    return p, actual


def target_score(point, actual, shape=None, saved_bands=None):
    row = {'point': point, 'actual': actual, 'error': actual-point,
           'absolute_error': abs(actual-point)}
    if shape is None: return row
    mass = pmf(shape, point)
    row.update(crps=scoring.pmf_crps(mass, actual),
               pit=math.fsum(v for k, v in mass.items() if k < actual)+.5*mass.get(actual, 0.),
               negative_mass=math.fsum(v for k, v in mass.items() if k < 0))
    for level in LEVELS:
        alpha = 1-int(level)/100
        lo, hi = quantile(mass, alpha/2), quantile(mass, 1-alpha/2)
        if saved_bands is not None and [lo, hi] != saved_bands[level]:
            raise ValueError('Original interval and calibration disagree')
        row[level] = {'lower': lo, 'upper': hi, 'hit': lo <= actual <= hi,
                      'width': hi-lo, 'interval_score': scoring.interval_score(lo, hi, actual, int(level)/100)}
    if not row['80']['lower'] <= row['50']['lower'] <= row['50']['upper'] <= row['80']['upper']:
        raise ValueError('Intervals not nested')
    return row


def score_card(root, card):
    p, actual = verified_grade(card)
    try:
        shapes, association = lineage.calibration_for(card, root)
    except FileNotFoundError:
        shapes = None; association = {'status': 'INSUFFICIENT', 'needs': 'Original calibration/fit artifact or frozen legacy registry'}
    except ValueError as exc:
        if str(exc) != 'Legacy exact fit evidence unavailable': raise
        shapes = None; association = {'status': 'INSUFFICIENT', 'needs': 'Unique original fit/calibration association in frozen legacy registry'}
    targets = {}
    for field in ('home_points', 'away_points', 'margin', 'total'):
        key = 'team_points' if field.endswith('_points') else field
        targets[field] = target_score(p[field], actual[field], shapes[key] if shapes else None, p['intervals'].get(field))
    winner = None
    if shapes:
        mass = pmf(shapes['margin'], p['margin']); tie = mass.get(0, 0.)
        strict = math.fsum(v for k, v in mass.items() if k > 0); probability = strict+tie/2
        for field, value in [('home_win_probability', probability), ('away_win_probability', 1-probability), ('tie_probability', tie)]:
            if abs(finite(p[field])-value) > 1e-12: raise ValueError('Original probability and calibration disagree')
        outcome = 1. if actual['margin'] > 0 else 0. if actual['margin'] < 0 else .5
        winner = {'probability': probability, 'strict_home_win': strict, 'tie': tie,
                  'outcome': outcome, 'brier': scoring.brier(probability, outcome)}
    key = (association.get('fit_sha256', 'UNKNOWN:'+card['version']) + '/' +
           association.get('calibration_ref', {}).get('sha256', 'UNKNOWN'))
    return {'game_id': card['game_id'], 'season': card['season'], 'week': card['week'],
            'evidence': card['evidence'], 'version': card['version'], 'lineage_key': key,
            'calibration': association, 'scores': targets, 'winner': winner}


def paired_interval(values):
    if len(values) < 2:
        return {'status': 'INSUFFICIENT', 'games': len(values), 'needs': 'At least two distinct graded games'}
    # values already holds ONE mean per game; both teams move together.
    a = np.asarray(values, dtype=float); rng = np.random.default_rng(SEED)
    draws = [float(a[rng.integers(0, len(a), len(a))].mean()) for _ in range(REPLICATES)]
    return {'status': 'DESCRIPTIVE', 'games': len(values),
            'lower95': float(np.quantile(draws, .025)), 'upper95': float(np.quantile(draws, .975))}


def summarize(records):
    result = {'games': len(records), 'targets': {}}
    fields = {'team_points': ('home_points', 'away_points'), 'margin': ('margin',), 'total': ('total',)}
    for target, names in fields.items():
        rows = [r['scores'][name] for r in records for name in names]
        proper = [r for r in rows if 'crps' in r]
        out = {'n': len(rows), 'mae': average([r['absolute_error'] for r in rows]),
               'rmse': math.sqrt(average([r['error']**2 for r in rows])) if rows else None,
               'bias_actual_minus_projected': average([r['error'] for r in rows]),
               'sigma': statistics.stdev(r['error'] for r in rows) if len(rows)>1 else None,
               'projected_sd': statistics.pstdev(r['point'] for r in rows) if rows else None,
               'actual_sd': statistics.pstdev(r['actual'] for r in rows) if rows else None,
               'probability_n': len(proper), 'crps': average([r['crps'] for r in proper]),
               'negative_mass_mean': average([r['negative_mass'] for r in proper]),
               'pit_counts': np.histogram([r['pit'] for r in proper], bins=np.linspace(0, 1, 11))[0].tolist(),
               'mae_paired95': paired_interval([average([r['scores'][n]['absolute_error'] for n in names]) for r in records]),
               'crps_paired95': paired_interval([average([r['scores'][n]['crps'] for n in names]) for r in records
                                                if all('crps' in r['scores'][n] for n in names)])}
        for level in LEVELS:
            hits = sum(r[level]['hit'] for r in proper)
            out[level] = {'hits': hits, 'n': len(proper), 'coverage': hits/len(proper) if proper else None,
                          'width': average([r[level]['width'] for r in proper]),
                          'interval_score': average([r[level]['interval_score'] for r in proper])}
        if len(proper) != len(rows):
            out['shortfall'] = {'missing_observations': len(rows)-len(proper), 'needs': 'Verified original calibration for every first-grade forecast'}
        result['targets'][target] = out
    result['home_bias'] = average([r['scores']['home_points']['error'] for r in records])
    result['away_bias'] = average([r['scores']['away_points']['error'] for r in records])
    winners = [r['winner'] for r in records if r['winner'] is not None]
    result['winner'] = {'n': len(winners), 'brier': average([r['brier'] for r in winners]), 'reliability': []}
    for i in range(10):
        b = [r for r in winners if min(9, int(r['probability']*10)) == i]
        result['winner']['reliability'].append({'bin': i, 'n': len(b),
                'forecast': average([r['probability'] for r in b]), 'observed': average([r['outcome'] for r in b])})
    return result


def build(root, cards):
    root = Path(root); ids = [c['game_id'] for c in cards]
    if len(ids) != len(set(ids)): raise ValueError('Duplicate diagnostic game identity')
    records = []; shortfalls = []; pending = []
    for c in sorted(cards, key=lambda c: c['game_id']):
        gid = c['game_id']
        if not re.fullmatch(r'[A-Za-z0-9_]+', gid): raise ValueError('Unsafe game identity')
        if not c.get('projection'): continue
        path = root/f'outputs/projection-v3/grades/{gid}.json'
        if not path.exists():
            if not (c.get('grades') or {}).get('PROJECTION'):
                pending.append(gid)
            else:
                shortfalls.append({'game_id': gid, 'needs': 'Immutable original first-grade record', 'evidence': c.get('evidence')})
            continue
        raw = path.read_bytes(); first = json.loads(raw)
        for field in ('game_id', 'season', 'week', 'home', 'away', 'evidence'):
            if first[field] != c[field]: raise ValueError('Board and first-grade identity disagree')
        result = score_card(root, first)
        result['first_grade_ref'] = {'path': str(path.relative_to(root)), 'sha256': sha(raw)}
        result['board_differs_from_first_grade'] = first['projection'] != c['projection'] or first['grades']['PROJECTION'] != (c.get('grades') or {}).get('PROJECTION')
        lock = root/f'outputs/projection-v3/locks/{gid}.json'
        result['lock_evidence'] = 'NOT_RECORDED_SEPARATELY'
        if lock.exists():
            lock_raw = lock.read_bytes(); locked = json.loads(lock_raw)
            for field in ('game_id', 'version', 'projection', 'fit_sha256', 'calibration_ref', 'forecast_bundle_ref',
                          'learning_features', 'contributions', 'cutoff_at'):
                if locked.get(field) != first.get(field): raise ValueError('Original lock/first-grade forecast differs')
            result['lock_evidence'] = {'path': str(lock.relative_to(root)), 'sha256': sha(lock_raw)}
        records.append(result)
    populations = {}
    for evidence in sorted({r['evidence'] for r in records} | {'AS_ISSUED', 'RETROSPECTIVE'}):
        rr = [r for r in records if r['evidence'] == evidence]; tables = []; by_lineage = []
        for season in sorted({r['season'] for r in rr}):
            years = [r for r in rr if r['season'] == season]
            scopes = [(None, 'season', years)]
            for week in sorted({r['week'] for r in years}):
                scopes.extend([(week, 'week', [r for r in years if r['week']==week]),
                               (week, 'cumulative', [r for r in years if r['week']<=week])])
            for week, scope, subset in scopes:
                meta = {'season': season, 'week': week, 'scope': scope}
                tables.append({**meta, **summarize(subset)})
                for key in sorted({r['lineage_key'] for r in subset}):
                    group = [r for r in subset if r['lineage_key'] == key]
                    by_lineage.append({**meta, 'lineage_key': key, 'versions': sorted({r['version'] for r in group}), **summarize(group)})
        populations[evidence] = {'games': len(rr), 'tables': tables, 'by_lineage': by_lineage}
    return {'schema': 'first-grade-weekly-diagnostics-v1', 'records': records, 'populations': populations,
            'shortfalls': shortfalls, 'pending_games': pending,
            'provenance_counts': {'first_grades': len(records), 'separately_retained_locks': sum(isinstance(r['lock_evidence'], dict) for r in records),
                'board_differences': sum(r['board_differs_from_first_grade'] for r in records),
                'calibration_status': {s: sum(r['calibration']['status']==s for r in records) for s in sorted({r['calibration']['status'] for r in records})}},
            'definitions': {'error': 'actual minus projected', 'points': 'Original legacy ridge centers, not relabeled as distribution means',
                'team_intervals': 'Reconstructed derivative of original calibration; not originally stored team bands',
                'coverage': 'Inclusive endpoints, hits and observation counts; team denominator has two observations per game',
                'probability': 'P(home win) plus half P(tie); Brier uses fractional tie outcome 0.5',
                'pit': 'Mid-PIT: P(X<actual)+0.5 P(X=actual); discrete mid-PIT need not be uniform',
                'population': 'All-fit operational aggregate plus exact fit/calibration strata; AS_ISSUED and RETROSPECTIVE separate',
                'negative_support': 'Measured without truncation; negative team/total score mass is an unresolved legacy limitation',
                'uncertainty': {'method': 'Percentile paired-game bootstrap, both teams together', 'replicates': REPLICATES, 'seed': SEED,
                    'review_requested': 'Tier 2: game resampling ignores cross-game dependence; alternative week blocks is not qualified by two weeks. Descriptive only, no decision or gate.'}}}


def original_cards(root, cards, report):
    """Resolve already-validated first grades for all report consumers."""
    import copy
    root = Path(root); records = {r['game_id']: r for r in report['records']}; result = []
    for card in sorted(cards, key=lambda c: c['game_id']):
        gid = card['game_id']
        if gid in records:
            ref = records[gid]['first_grade_ref']
            if not re.fullmatch(r'[A-Za-z0-9_]+', gid) or ref['path'] != f'outputs/projection-v3/grades/{gid}.json':
                raise ValueError('Unapproved first-grade path')
            raw = (root / ref['path']).read_bytes()
            if sha(raw) != ref['sha256']: raise ValueError('First grade changed during reporting')
            result.append(json.loads(raw))
        else:
            pending = copy.deepcopy(card)
            pending['_diagnostic_shortfall'] = 'Immutable original first-grade record' if card.get('grades') else None
            pending['grades'] = None
            result.append(pending)
    return result


def markdown(report):
    lines = ['## First-grade probability diagnostics', '', 'Descriptive operational evidence; no model gate. Errors are actual minus projected. All-fit rows are not a single-model evaluation.', '',
             'Team intervals are reconstructed from each original calibration. Legacy centers, tie-split probabilities and invalid score support remain unchanged.', '',
             'REVIEW REQUESTED (Tier 2): paired-game bootstrap ignores cross-game dependence; two observed weeks do not qualify week-block uncertainty. No significance or promotion claim.', '',
             '| Evidence | Season | Week | Scope | Games | Team MAE | Team CRPS | Margin CRPS | Total CRPS | Team 50 hits/n | Team 80 hits/n | Brier |',
             '|---|---|---|---|---|---|---|---|---|---|---|---|']
    def fmt(x): return '—' if x is None else f'{x:.4f}'
    for evidence, pop in report['populations'].items():
        for row in pop['tables']:
            t = row['targets']; team = t['team_points']
            vals = [evidence, str(row['season']), str(row['week'] or 'all'), row['scope'], str(row['games']),
                    fmt(team['mae']), fmt(team['crps']), fmt(t['margin']['crps']), fmt(t['total']['crps']),
                    f"{team['50']['hits']}/{team['50']['n']}", f"{team['80']['hits']}/{team['80']['n']}", fmt(row['winner']['brier'])]
            lines.append('| '+' | '.join(vals)+' |')
    lines += ['', f"Pending games: {len(report['pending_games'])}. Missing immutable first grades: {len(report['shortfalls'])}.",
              'Complete counts, interval scores/widths, RMSE, bias, dispersion, PIT, reliability, paired intervals, lineage strata and original evidence hashes are in trend.json → forecast_diagnostics.', '']
    for r in report['shortfalls']: lines.append(f"- {r['game_id']}: needs {r['needs']}.")
    missing = [r for r in report['records'] if r['calibration']['status']=='INSUFFICIENT']
    for r in missing: lines.append(f"- {r['game_id']}: needs {r['calibration']['needs']}.")
    return '\n'.join(lines)+'\n'
