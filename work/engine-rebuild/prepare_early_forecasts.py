"""Calibration-only 2013–2015 point histories; no candidate metrics or gate."""
import collections
import copy
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from engine.projection import cutoff_pipeline as pipeline, cutoff_features as features
from engine.projection.model import hash_value
from engine.projection.storage import write_bytes
from engine.projection_v3.qualify import residuals
from engine.forecast_system.calendar import schedule_kickoff, timestamp, PACIFIC
from engine.forecast_system.cadence import cutoff_before, next_cutoff
from scripts.projection_learning import due_week
from check_calibration_sources import load, ref


def raw(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def prepared_rows(rows, games):
    out = []
    for saved in rows:
        r = copy.deepcopy(saved)
        g = games[r['game_id']]
        issue = pipeline.time_of(g)
        context = {'cutoff_at': r['state_lineage']['cutoff_at'],
                   'state_sha256': r['state_lineage']['state_sha256'],
                   'source_availability': 'HISTORICAL_AVAILABILITY_ASSUMED'}
        r.update(game={k: g.get(k) for k in features.GAME_FIELDS}, actual_points=None, metadata={})
        r['state_lineage'] = {**context, 'role': 'HISTORICAL_RECONSTRUCTION',
                              'prepared_at': issue.isoformat(), 'required_cutoff': cutoff_before(issue).isoformat()}
        out.append(r)
    return out


def generate(rows, games, active):
    """Replay the frozen refit calendar using previously verified pregame rows."""
    by_id = {g['game_id']: g for g in games}
    rows = prepared_rows(rows, by_id)
    issues = collections.defaultdict(list)
    for r in rows:
        issues[pipeline.time_of(r['game'])].append(r)
    dispatches = {}
    initials = {}
    for year in range(2013, 2016):
        season = [g for g in games if int(g['season']) == year]
        first = min(cutoff_before(pipeline.time_of(g)) for g in season)
        if first.astimezone(PACIFIC).weekday() != 1:
            raise ValueError('Initial fit must follow a Tuesday cutoff')
        last = max(next_cutoff(schedule_kickoff(g['gameday'], g['gametime']) + dt.timedelta(hours=4)) for g in season)
        initials[first] = year
        cursor = first
        while cursor <= last:
            dispatches[cursor] = year
            cursor += dt.timedelta(hours=1)
    completed = sorted((schedule_kickoff(g['gameday'], g['gametime']) + dt.timedelta(hours=4), g['game_id']) for g in games)
    label_cursor = 0
    labels = {}
    history = []
    fits = []
    result = []
    waiting = []
    current = None
    last_through = 0
    template = {k: copy.deepcopy(active[k]) for k in ('groups', 'selected', 'inactive', 'elo_hfa')}
    template.update(fit={'training_hash': hash_value([])}, shapes=None)

    def refit(year, through, execution, initial=False):
        nonlocal current, last_through
        local = execution.astimezone(PACIFIC)
        date = local.date() - dt.timedelta(days=(local.weekday() - 1) % 7)
        cut = dt.datetime.combine(date, dt.time(6), PACIFIC).astimezone(dt.timezone.utc)
        if cut > execution:
            cut -= dt.timedelta(days=7)
        season = year - 1 if initial else year
        week = max(int(g['week']) for g in games if int(g['season']) == season) if initial else through
        closeout = {'state': 'PUBLISHED', 'season': season, 'week': week,
                    'published_at': execution.isoformat(), 'evidence': 'SIMULATED_HISTORICAL_CLOSEOUT'}
        current = pipeline.refit(history, labels, template if initial else current, cutoff=cut,
                                 through_season=season, through_week=week, closeout=closeout, fit_at=execution)
        current['issued_at'] = (execution + dt.timedelta(minutes=10)).isoformat()
        last_through = 0 if initial else through
        fits.append({'season': year, 'through_week': last_through, 'at': execution.isoformat(),
                     'available_at': current['issued_at'], 'scheduled_cutoff': cut.isoformat(),
                     'fit': current['fit'], 'fit_sha256': hash_value(current['fit']),
                     'training_games': current['training_games'], 'training_exclusions': current['training_exclusions'],
                     'closeout_evidence': closeout})

    for event in sorted(set(issues) | set(dispatches)):
        while label_cursor < len(completed) and completed[label_cursor][0] < event:
            done, gid = completed[label_cursor]
            g = by_id[gid]
            labels[gid] = {'home_points': float(g['home_score']), 'away_points': float(g['away_score']),
                           'kickoff_at': schedule_kickoff(g['gameday'], g['gametime']).isoformat(),
                           'available_at': done.isoformat()}
            label_cursor += 1
        if event in initials:
            refit(initials[event], 0, event, initial=True)
        if event in dispatches:
            year = dispatches[event]
            season = [g for g in games if int(g['season']) == year]
            through = due_week([{'game_id': g['game_id'], 'week': int(g['week']), 'game': g} for g in season], event)
            if through is not None and last_through < through < 18:
                required = {g['game_id'] for g in season if int(g['week']) <= through}
                missing = sorted(required - set(labels))
                if missing:
                    waiting.append({'at': event.isoformat(), 'missing': missing})
                else:
                    refit(year, through, event)
        slate = issues.get(event, [])
        history.extend(copy.deepcopy(slate))
        if not slate or slate[0]['season'] < 2013:
            continue
        available = [f for f in fits if f['season'] == slate[0]['season'] and timestamp(f['available_at']) < event]
        if not available:
            raise ValueError('No available fit at issuance')
        chosen = available[-1]
        context = {k: slate[0]['state_lineage'][k] for k in ('cutoff_at', 'state_sha256', 'source_availability')}
        prepared = {'schema': pipeline.SCHEMA, 'role': 'HISTORICAL_RECONSTRUCTION',
                    'prepared_at': event.isoformat(), 'state': context, 'rows': slate}
        scored = pipeline.score(prepared, {**template, 'fit': chosen['fit']})
        pairs = collections.defaultdict(dict)
        for row in slate:
            pairs[row['game_id']]['home' if row['home'] else 'away'] = row
        for gid, value in sorted(scored.items()):
            if gid in chosen['training_games']:
                raise ValueError('Target in its own fit')
            pair = pairs[gid]
            result.append({'game_id': gid, 'season': int(by_id[gid]['season']), 'week': int(by_id[gid]['week']),
                           'issuance_at': event.isoformat(), 'state_cutoff': context['cutoff_at'],
                           'fit_sha256': chosen['fit_sha256'], 'fit_available_at': chosen['available_at'],
                           'training_hash': chosen['fit']['training_hash'],
                           'home': value['projection']['home_points'], 'away': value['projection']['away_points'],
                           'legacy_donor_home': pair['home']['features']['baseline'],
                           'legacy_donor_away': pair['away']['features']['baseline'],
                           'actual_home': float(by_id[gid]['home_score']), 'actual_away': float(by_id[gid]['away_score'])})
    expected = {g['game_id'] for g in games if 2013 <= int(g['season']) <= 2015}
    if len(result) != len(expected) or {r['game_id'] for r in result} != expected:
        raise ValueError('Warmup forecast population differs')
    return {'games': sorted(result, key=lambda r: r['game_id']), 'fits': fits, 'waiting_refits': waiting}


def run():
    if os.environ.get('OPENBLAS_NUM_THREADS') != '1':
        raise ValueError('Single worker required')
    started = time.monotonic()
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('45-minute preparation limit')))
    signal.alarm(2700)
    catalog = load(ref('work/series-registry/catalog.json'))
    control = next(r for r in catalog['series'] if r['path'] == catalog['authoritative_control'] and r['authoritative'])
    load(control)
    feature_summary_ref = ref('work/engine-rebuild/early-features-verification.json')
    feature_summary = load(feature_summary_ref)
    feature_body = load(feature_summary['artifact'])
    source = load(feature_body['sources']['inputs'])
    active = load(source['sources']['active_fit'])
    shapes = load(active['shapes'])
    legacy_ref = ref('work/projection-v3/experiment.json')
    legacy = load(legacy_ref)
    donor = load(legacy['oof'])
    if residuals(donor) != shapes:
        raise ValueError('Legacy donor does not reproduce issuing calibration')
    plan = ref('work/engine-rebuild/EARLY-FORECASTS-PLAN.md')
    code = [ref(p) for p in ('work/engine-rebuild/prepare_early_forecasts.py', 'work/engine-rebuild/check_calibration_sources.py',
                            'engine/projection/cutoff_pipeline.py', 'engine/projection/scoring.py',
                            'engine/projection_v3/model.py', 'engine/projection_v3/qualify.py',
                            'engine/projection/model.py', 'engine/projection/distribution.py',
                            'engine/forecast_system/calendar.py', 'engine/forecast_system/cadence.py',
                            'scripts/projection_learning.py')]
    result = generate(feature_body['rows'], source['schedule'], active)
    if code != [ref(r['path']) for r in code] or plan != ref(plan['path']):
        raise ValueError('Code/plan changed during preparation')
    load(control)
    result.update(schema='calibration-only-point-history-v1', role='RECONSTRUCTED_WARMUP_NOT_AUTHORITATIVE_CONTROL',
                  assumptions=['2011 state initialization; 2012 first retained training season.',
                               'Historical source/closeout clocks assumed; 600-second fit availability.',
                               'Legacy donor optional admission has fewer than three prior OOF seasons in all three warmup folds.'],
                  sources={'features': feature_summary['artifact'], 'inputs': feature_body['sources']['inputs'],
                           'active_fit': source['sources']['active_fit'], 'shipping_shapes': active['shapes'],
                           'legacy_experiment': legacy_ref, 'legacy_donor': legacy['oof'],
                           'authoritative_control_unchanged': control}, code=code, plan=plan)
    payload = gzip.compress(raw(result), mtime=0)
    path = ROOT / 'work/engine-rebuild/early-forecasts' / (hashlib.sha256(payload).hexdigest() + '.json.gz')
    write_bytes(path, payload, immutable=True)
    summary = {'status': 'GENERATED_WARMUP_REQUIRES_INDEPENDENT_CHECK', 'artifact': ref(str(path.relative_to(ROOT))),
               'games_by_season': dict(collections.Counter(r['season'] for r in result['games'])),
               'fits': len(result['fits']), 'waiting_dispatches': len(result['waiting_refits']),
               'legacy_shipping_residuals_reproduced': True, 'control_unchanged': True,
               'metrics': 'NOT_COMPUTED; preparation only, no candidate comparison',
               'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(),
               'elapsed_seconds': time.monotonic()-started,
               'peak_rss_bytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)}
    if summary['peak_rss_bytes'] > 4*1024**3:
        raise MemoryError('4-GiB preparation limit')
    signal.alarm(0)
    return summary


if __name__ == '__main__':
    result = run()
    (ROOT / 'work/engine-rebuild/early-forecasts-verification.json').write_text(json.dumps(result, indent=2, sort_keys=True)+'\n')
    print(json.dumps(result, indent=2, sort_keys=True), flush=True)
