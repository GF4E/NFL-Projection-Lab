"""Offline calibration-history extension from pinned local football sources."""
import argparse
import csv
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.forecast_system.core_features import build
from engine.projection_v3.personnel import enrich
from scripts import projection_prepare as legacy


def read(source, ref):
    raw = (source/ref['path']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref['sha256']:
        raise ValueError('Source checksum mismatch')
    return json.loads(raw)


def run(source):
    out = ROOT/'work/projection-v2/phase-a'
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((source/'work/projection-v1/source-manifest.json').read_text())
    rows = [r for r in read(source, manifest['team_games']) if r['season'] <= 2025]
    raw_manifest = json.loads((source/'work/projection-v3/raw-manifest.json').read_text())
    legacy.ROOT = source
    early_refs = []
    for year in (2011, 2012, 2013):
        ref = next(r for r in raw_manifest if r['name'] == f'play_by_play_{year}.parquet' and not r.get('status'))
        early_refs.append(ref)
        cache = out/f'aggregate-{ref["sha256"]}.json'
        if cache.exists():
            batch = json.loads(cache.read_text())
        else:
            batch, _ = legacy.aggregate(ref, {})
            cache.write_text(json.dumps(legacy.clean(batch), sort_keys=True, allow_nan=False))
        rows.extend(batch)
        print('prepared early team games', year, len(batch), flush=True)
    # Read the raw schedule through the existing explicit football allowlist.
    refs = list((source/'outputs/model-pick-v1/daily').glob('*/results-ref.json'))
    ref = max((json.loads(p.read_text()) for p in refs), key=lambda r: r.get('received_at', ''))
    raw = Path(ref['path']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref['sha256']:
        raise ValueError('Schedule checksum mismatch')
    allowed = 'game_id season game_type week gameday gametime away_team home_team away_score home_score location roof stadium_id'.split()
    schedule = []
    for r in csv.DictReader(raw.decode().splitlines()):
        if 2011 <= int(r['season']) <= 2025:
            item = {k: r.get(k) for k in allowed}
            for k in ('away_team', 'home_team'):
                item[k] = legacy.canonical(item[k])
            item['source_hash'] = ref['sha256']
            schedule.append(item)
    stadiums = json.loads((source/'config/stadiums.json').read_text())
    personnel_ref = json.loads((source/'work/projection-v3/personnel-ref.json').read_text())
    personnel = read(source, personnel_ref)
    features = build(sorted(rows, key=lambda r:(r['season'],r['week'],r['game_id'],r['team'])), schedule, stadiums)
    print('core historical features', len(features), flush=True)
    features = enrich(features, personnel)
    # Avoid carrying the large repeated attribution metadata into fitting.
    compact = [{k:r[k] for k in ('row_id','game_id','team','opponent','home','season','week','features','actual_points')} for r in features]
    payload = json.dumps(compact, sort_keys=True, allow_nan=False).encode()
    path = out/'features.json.gz'
    path.write_bytes(gzip.compress(payload, mtime=0))
    evidence = dict(schema='forecast-system-v2-features-1', path=str(path.relative_to(ROOT)),
                    sha256=hashlib.sha256(path.read_bytes()).hexdigest(), rows=len(compact),
                    seasons=sorted({r['season'] for r in compact}), source_manifest=manifest,
                    early_refs=early_refs, personnel_ref=personnel_ref, schedule_ref=ref,
                    limitations=['Historical personnel charts are weekly proxies, not verified issuance timestamps',
                                 'Unqualified slots remain missing; no historical roster target shares invented',
                                 'No weather weights without forecast-only provenance'])
    (out/'features-ref.json').write_text(json.dumps(evidence, indent=2))
    print('features saved', evidence['sha256'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-root', type=Path, required=True)
    run(parser.parse_args().source_root)
