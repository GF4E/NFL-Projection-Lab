"""Qualify early source aggregates without fitting or replacing live inputs."""
import collections
import csv
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
import resource
import signal
import statistics
import sys
import time
import warnings

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import pyarrow.parquet as pq
from engine.projection import observations
from engine.projection.storage import write_bytes
from scripts import projection_prepare as original
from check_calibration_sources import load, ref, digest

TOLERANCE = 1e-12


def hfa_history(schedule, years):
    """The promoted three-prior-season rule; retain its exact member IDs."""
    rows = []
    seen = set()
    for g in schedule:
        if g['game_id'] in seen:
            raise ValueError('Duplicate schedule game')
        seen.add(g['game_id'])
        if g['game_type'] == 'REG' and g.get('home_score') not in ('', None) and g.get('away_score') not in ('', None):
            if not all(math.isfinite(float(g[k])) and float(g[k]) >= 0 for k in ('home_score', 'away_score')):
                raise ValueError('Invalid score')
            rows.append(g)
    output = {}
    for y in years:
        members = sorted((g for g in rows if y - 3 <= int(g['season']) < y
                          and g['location'] != 'Neutral'), key=lambda g: g['game_id'])
        if {int(g['season']) for g in members} != set(range(y - 3, y)):
            raise ValueError('Incomplete HFA season window')
        output[str(y)] = {'value': statistics.mean(float(g['home_score']) - float(g['away_score']) for g in members) * 25,
                          'training_games': [g['game_id'] for g in members],
                          'trained_through_season': y - 1}
    return output


def paired(schedule, team_rows):
    games = {g['game_id']: g for g in schedule}
    if len(games) != len(schedule):
        raise ValueError('Duplicate target game')
    bygame = collections.defaultdict(list)
    for r in team_rows:
        bygame[r['game_id']].append(r)
    if set(games) != set(bygame):
        raise ValueError('Schedule/stat game populations differ')
    for gid, game in games.items():
        rows = bygame[gid]
        teams = {game['away_team'], game['home_team']}
        if len(rows) != 2 or {r['team'] for r in rows} != teams:
            raise ValueError('Missing or duplicate team pair')
        for row in rows:
            if row['opponent'] != next(t for t in teams if t != row['team']):
                raise ValueError('Opponent mismatch')
            if int(row['season']) != int(game['season']) or int(row['week']) != int(game['week']):
                raise ValueError('Season/week mismatch')


def independent_core(path):
    """Separate Python record grouping, not the original aggregate helper."""
    cols = 'season_type game_id posteam defteam qtr wp play_type qb_kneel qb_spike rush_attempt qb_dropback epa fixed_drive posteam_score posteam_score_post'.split()
    rows = pq.read_table(path, columns=cols).to_pylist()
    groups = collections.defaultdict(list)
    for r in rows:
        if r['season_type'] != 'REG' or r['posteam'] is None or r['defteam'] is None:
            continue
        if r['qtr'] == 4 and r['wp'] is not None and (r['wp'] < .05 or r['wp'] > .95):
            continue
        groups[r['game_id'], original.canonical(r['posteam'])].append(r)
    result = {}
    for key, group in groups.items():
        normal = [r for r in group if r['play_type'] in ('run', 'pass') and r['qb_kneel'] != 1 and r['qb_spike'] != 1]
        if not normal:
            continue
        ids = {r['fixed_drive'] for r in normal if r['fixed_drive'] is not None}
        drive_rows = collections.defaultdict(list)
        for r in group:
            if r['fixed_drive'] in ids:
                drive_rows[r['fixed_drive']].append(r)
        points = []
        for drive in drive_rows.values():
            start = [r['posteam_score'] for r in drive if r['posteam_score'] is not None]
            end = [r['posteam_score_post'] for r in drive if r['posteam_score_post'] is not None]
            if not start or not end:
                raise ValueError('Unqualified drive scores')
            points.append(max(0, max(end) - min(start)))
        def epa(flag):
            values = [r['epa'] for r in normal if r[flag] == 1 and r['epa'] is not None and math.isfinite(r['epa'])]
            return statistics.mean(values) if values else None
        result[key] = {'off_ppd': statistics.mean(points), 'drives': len(points),
                       'plays_per_drive': len(normal) / len(points),
                       'pass_epa': epa('qb_dropback'), 'rush_epa': epa('rush_attempt')}
    return result


def compare(before, after):
    if before.keys() != after.keys():
        raise ValueError('Comparison fields differ')
    largest = 0.
    for k, expected in before.items():
        actual = after[k]
        if isinstance(expected, (int, float)) and not isinstance(expected, bool):
            if not math.isfinite(expected) or isinstance(actual, bool) or not isinstance(actual, (int, float)) or not math.isfinite(actual):
                raise ValueError('Missing/nonfinite numeric field: ' + k)
            difference = abs(expected - actual)
            if difference > TOLERANCE:
                raise ValueError('Aggregate difference: ' + k + ': ' + str(difference))
            largest = max(largest, difference)
        elif actual != expected:
            raise ValueError('Aggregate identity or missingness differs: ' + k)
    return largest


def run():
    started = time.monotonic()
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('45-minute preparation limit')))
    signal.alarm(2700)
    evidence = {'status': 'PREPARATION_ONLY', 'checks': [], 'maximum_numeric_difference': 0.}
    phase_ref = ref('work/projection-v2/phase-a/features-ref.json')
    phase = load(phase_ref)
    current_ref = ref('work/projection-v1/source-manifest.json')
    current = load(current_ref)
    active_ref = load(ref('work/in-season-learning-v1/active-fit-ref.json'))
    active = load(active_ref)
    code = [ref(str(Path(__file__).relative_to(ROOT))), ref('scripts/projection_prepare.py'),
            ref('work/engine-rebuild/check_calibration_sources.py'), ref('engine/projection/observations.py')]
    team_rows = [r for r in load(current['team_games']) if 2014 <= int(r['season']) <= 2015]
    early = []
    for raw in phase['early_refs']:
        if digest(ROOT / raw['path']) != raw['sha256']:
            raise ValueError('Raw checksum differs')
        aggregate_ref = ref('work/projection-v2/phase-a/aggregate-' + raw['sha256'] + '.json')
        saved = load(aggregate_ref)
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', FutureWarning)
            recomputed, _ = original.aggregate(raw, {})
        recomputed = {(r['game_id'], r['team']): r for r in original.clean(recomputed)}
        independent = independent_core(ROOT / raw['path'])
        if len(saved) != len(recomputed) or set(recomputed) != set(independent):
            raise ValueError('Reaggregation population differs')
        maximum = 0.
        for r in saved:
            key = r['game_id'], r['team']
            maximum = max(maximum, compare(r, recomputed[key]),
                          compare({k: r[k] for k in independent[key]}, independent[key]))
        team_rows.extend(saved)
        early.append({'raw': raw, 'saved_aggregate': aggregate_ref})
        evidence['checks'].append({'source': raw['name'], 'team_rows': len(saved),
                                   'all_fields_reproduced': True, 'independent_core_fields': 5,
                                   'maximum_difference': maximum})
        evidence['maximum_numeric_difference'] = max(evidence['maximum_numeric_difference'], maximum)
        print('verified', raw['name'], len(saved), 'rows; max difference', maximum, flush=True)
    schedule_path = ROOT / phase['schedule_ref']['path']
    if digest(schedule_path) != phase['schedule_ref']['sha256']:
        raise ValueError('Schedule checksum differs')
    allowed = set(observations.GAME_KEYS) - {'source_hash'}
    with schedule_path.open() as stream:
        all_games = [{k: r.get(k) for k in allowed} for r in csv.DictReader(stream)]
    hfa = hfa_history(all_games, range(2011, 2026))
    hfa_difference = max(abs(hfa[y]['value'] - active['elo_hfa'][y]) for y in hfa if y in active['elo_hfa'])
    if hfa_difference > TOLERANCE:
        raise ValueError('HFA overlap differs from issuing method: ' + str(hfa_difference))
    games = [g for g in all_games if g['game_type'] == 'REG' and 2011 <= int(g['season']) <= 2015
             and g['home_score'] not in ('', None) and g['away_score'] not in ('', None)]
    for g in games:
        for key in ('home_team', 'away_team'):
            g[key] = original.canonical(g[key])
        g['source_hash'] = phase['schedule_ref']['sha256']
    stats = [{k: r.get(k) for k in (*observations.STAT_FIELDS, 'source_hash')} for r in team_rows]
    paired(games, stats)
    body = {'schema': 'early-calibration-inputs-v1', 'role': 'HISTORICAL_SOURCE_PREPARATION_NOT_FITTED',
            'historical_availability': 'UNKNOWN; no originally available source vintage established',
            'schedule': sorted(games, key=lambda g: g['game_id']),
            'team_games': sorted(stats, key=lambda r: (r['game_id'], r['team'])),
            'elo_hfa': {y: hfa[y] for y in ('2011', '2012', '2013')},
            'sources': {'phase_a': phase_ref, 'current_manifest': current_ref, 'early': early,
                        'schedule': {'path': str(schedule_path.relative_to(ROOT)), 'sha256': phase['schedule_ref']['sha256']},
                        'active_fit': active_ref}, 'code': code}
    if code != [ref(r['path']) for r in code]:
        raise ValueError('Code changed during preparation')
    payload = gzip.compress(json.dumps(body, sort_keys=True, separators=(',', ':'), allow_nan=False).encode(), mtime=0)
    path = ROOT / 'work/engine-rebuild/early-inputs' / (hashlib.sha256(payload).hexdigest() + '.json.gz')
    write_bytes(path, payload, immutable=True)
    evidence.update(status='VERIFIED_SOURCE_RECONSTRUCTION_NOT_CALIBRATION', artifact=ref(str(path.relative_to(ROOT))),
                    generated_at=dt.datetime.now(dt.timezone.utc).isoformat(), games=len(games), team_rows=len(stats),
                    hfa_overlap_max_difference=hfa_difference,
                    early_hfa={y: {'value': hfa[y]['value'], 'training_games': len(hfa[y]['training_games'])} for y in ('2011', '2012', '2013')},
                    elapsed_seconds=time.monotonic()-started,
                    peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == 'darwin' else 1024))
    if evidence['peak_rss_bytes'] > 4 * 1024**3:
        raise MemoryError('4-GiB preparation limit')
    signal.alarm(0)
    return evidence


if __name__ == '__main__':
    result = run()
    target = ROOT / 'work/engine-rebuild/early-inputs-verification.json'
    target.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    print(json.dumps(result, indent=2, sort_keys=True), flush=True)
