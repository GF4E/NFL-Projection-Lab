"""Cutoff-aware calibration warmup features; no fitted forecasts or activation."""
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
import resource
import signal
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from engine.projection import cutoff_features as features
from engine.projection.storage import write_bytes
from engine.forecast_system.calendar import schedule_kickoff, timestamp
from engine.forecast_system.cadence import cutoff_before
from check_calibration_sources import load, ref


def run():
    started = time.monotonic()
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('45-minute preparation limit')))
    signal.alarm(2700)
    verification_ref = ref('work/engine-rebuild/early-inputs-verification.json')
    verification = load(verification_ref)
    if verification['status'] != 'VERIFIED_SOURCE_RECONSTRUCTION_NOT_CALIBRATION':
        raise ValueError('Unverified early sources')
    source = load(verification['artifact'])
    active = load(source['sources']['active_fit'])
    hfa = dict(active['elo_hfa'])
    for year, entry in source['elo_hfa'].items():
        if year in hfa:
            raise ValueError('Early extension would replace existing HFA')
        hfa[year] = entry['value']
    stadium_ref = ref('config/stadiums.json')
    code = [ref(p) for p in ('engine/projection/cutoff_features.py', 'engine/projection/features.py',
                            'engine/projection/model.py', 'engine/elo.py', 'engine/elo_hfa.py',
                            'engine/forecast_system/calendar.py', 'engine/forecast_system/cadence.py',
                            'work/engine-rebuild/prepare_early_features.py',
                            'work/engine-rebuild/check_calibration_sources.py')]
    result = features.build(source['team_games'], source['schedule'], load(stadium_ref),
                            elo_hfa=hfa, mode='HISTORICAL_RECONSTRUCTION', minimum_season=2012)
    schedule = {g['game_id']: g for g in source['schedule']}
    seen = set()
    for state in result['lineage']:
        cutoff = timestamp(state['cutoff_at'])
        for gid in state['added_games']:
            g = schedule[gid]
            if gid in seen or schedule_kickoff(g['gameday'], g['gametime']) + dt.timedelta(hours=4) >= cutoff:
                raise ValueError('Early or repeated incorporation')
            seen.add(gid)
    rows = []
    identities = set()
    for row in result['rows']:
        if row['row_id'] in identities or row['actual_points'] is not None or set(row['game']) != set(features.GAME_FIELDS):
            raise ValueError('Duplicate or label-bearing feature row')
        identities.add(row['row_id'])
        g = schedule[row['game_id']]
        issue = schedule_kickoff(g['gameday'], g['gametime']) - dt.timedelta(minutes=75)
        if timestamp(row['state_lineage']['cutoff_at']) != cutoff_before(issue):
            raise ValueError('Wrong state at issuance')
        if row['features']['baseline'] is None:
            raise ValueError('Missing baseline after 2011 warmup')
        if any(v is not None and not math.isfinite(v) for v in row['features'].values()):
            raise ValueError('Nonfinite feature')
        keep = {k: row[k] for k in ('row_id', 'game_id', 'team', 'opponent', 'home', 'season', 'week',
                                    'features', 'state_lineage', 'source_hashes')}
        keep['issuance_at'] = issue.isoformat()
        rows.append(keep)
    counts = collections.Counter(r['season'] for r in rows)
    if counts != {y: 512 for y in range(2012, 2016)}:
        raise ValueError('Incomplete calibration preparation population')
    if code != [ref(r['path']) for r in code]:
        raise ValueError('Code changed during preparation')
    body = {'schema': 'early-cutoff-features-v1', 'role': 'PREPARATION_ONLY_NOT_FITTED',
            'historical_availability': 'UNKNOWN_ASSUMED_FOR_RECONSTRUCTION',
            'sources': {'verification': verification_ref, 'inputs': verification['artifact'], 'stadiums': stadium_ref},
            'code': code, 'rows': sorted(rows, key=lambda r: r['row_id']),
            'lineage': result['lineage'], 'eligibility': result['eligibility'], 'excluded': result['excluded']}
    payload = gzip.compress(json.dumps(body, sort_keys=True, separators=(',', ':'), allow_nan=False).encode(), mtime=0)
    path = ROOT / 'work/engine-rebuild/early-inputs' / ('features-' + hashlib.sha256(payload).hexdigest() + '.json.gz')
    write_bytes(path, payload, immutable=True)
    summary = {'status': 'VERIFIED_FEATURE_PREPARATION_NOT_CALIBRATION', 'artifact': ref(str(path.relative_to(ROOT))),
               'team_rows_by_season': dict(counts), 'games': len(rows)//2, 'incorporated_games': len(seen),
               'cutoffs': len(result['lineage']), 'early_or_duplicate_incorporations': 0,
               'label_bearing_rows': 0, 'fitted_forecasts': 0,
               'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(),
               'elapsed_seconds': time.monotonic()-started,
               'peak_rss_bytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == 'darwin' else 1024),
               'limitations': ['Historical availability assumed; no archived issuance claim.',
                               'No existing control training population or point forecast changed.',
                               'Separate own-lineage warmup forecast construction and calibration qualification remain.']}
    if summary['peak_rss_bytes'] > 4 * 1024**3:
        raise MemoryError('4-GiB preparation limit')
    signal.alarm(0)
    return summary


if __name__ == '__main__':
    result = run()
    (ROOT / 'work/engine-rebuild/early-features-verification.json').write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    print(json.dumps(result, indent=2, sort_keys=True), flush=True)
