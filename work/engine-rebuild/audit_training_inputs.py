"""Pin and reproduce legacy inputs; no provider calls, fitting, or activation.

Run from the repository with the pinned Python. The result is an audit artifact,
deliberately not the schema accepted by cutoff_pipeline.refit_recorded.
"""
import collections
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from engine.projection import lineage, training_evidence as evidence
from engine.projection.storage import write_bytes, save

SNAPSHOT = '555dbc916390b6085a253d3043b6a0de8381581b'
BASE = Path('work/engine-rebuild/training-input-audit')
CACHES = {
    'projection-v2': ('247e8016b30c58dfbd41e2794c467e73ba2fb1ae', 'work/projection-v2'),
    'projection-v3': ('77c755905585818368b3489e13efb250d3b7b4f2', 'work/projection-v3'),
}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def object_at(commit, path):
    return git('show', f'{commit}:{path}')


def pinned(data, suffix):
    digest = hashlib.sha256(data).hexdigest()
    path = BASE / 'objects' / (digest + suffix)
    write_bytes(ROOT / path, data, immutable=True)
    return {'path': str(path), 'sha256': digest}


def frozen_card(card):
    major = 'v2' if card['version'].startswith('projection-v2-') else 'v3'
    path = f'outputs/projection-{major}/locks/{card["game_id"]}.json'
    data = object_at(SNAPSHOT, path)
    locked = json.loads(data)
    for key in ('game_id', 'away', 'home', 'issued_at', 'freeze_time', 'evidence', 'version', 'projection'):
        if card[key] != locked[key]:
            raise ValueError(f'Board differs from original lock: {card["game_id"]} {key}')
    return locked, {'commit': SNAPSHOT, 'path': path, 'sha256': hashlib.sha256(data).hexdigest()}


def main():
    board_raw = object_at(SNAPSHOT, 'outputs/projection-v3/board.json')
    board = json.loads(board_raw)
    cards = [c for c in board['games'] if c['status'] == 'FINAL' and c['season'] == 2026 and c['week'] <= 2]
    if len(cards) != len({c['game_id'] for c in cards}) or len(cards) != 32:
        raise ValueError('Frozen cumulative population differs')
    cached = {}
    for major, (commit, folder) in CACHES.items():
        manifest_raw = object_at(commit, folder+'/current-ref.json')
        manifest = json.loads(manifest_raw)
        data_path = ROOT/BASE/'objects'/(manifest['sha256']+'.json.gz')
        data = data_path.read_bytes() if data_path.exists() else (ROOT/folder/'current-features.json.gz').read_bytes()
        rows = evidence.verify_cache(data, manifest)
        cached[major] = (rows, {'feature_ref': pinned(data, '.json.gz'),
            'manifest_ref': pinned(manifest_raw, '.json'),
            'original_manifest_path': folder+'/current-ref.json', 'commit': commit,
            'committer_time': git('show', '-s', '--format=%cI', commit).decode().strip(),
            'time_qualification': 'GIT_RECORDED_TIME_NOT_EXTERNAL_RECEIPT'})
    records = []
    for card in sorted(cards, key=lambda c:c['game_id']):
        if card['evidence'] != 'AS_ISSUED':
            records.append({'game_id': card['game_id'], 'evidence':card['evidence'],
                'qualification':'RETROSPECTIVE_NOT_PREGAME', 'eligible_for_new_cutoff_refit':False,
                'reason':'No pregame issuance; retain in population inventory, never relabel or silently drop.'})
            continue
        locked, lock_ref = frozen_card(card)
        _, association = lineage.calibration_for(locked, ROOT)
        fit_ref = association.get('fit_artifact_ref') or association['matching_artifact_refs'][0]
        artifact = lineage.read_artifact(ROOT, fit_ref)
        if locked.get('learning_features'):
            rows = list(locked['learning_features'].values())
            source = {'kind':'FROZEN_LOCK_FEATURES', 'lock_ref':lock_ref}
            recorded_at = None
        else:
            major = 'projection-v2' if locked['version'].startswith('projection-v2-') else 'projection-v3'
            rows, cache = cached[major]
            source = {'kind':'GIT_HASHED_CACHE', **cache, 'lock_ref':lock_ref}
            recorded_at = cache['committer_time']
        result = evidence.inspect(locked, rows, artifact['fit'], source_kind=source['kind'], recorded_at=recorded_at)
        result.update({'source':source, 'fit_ref':fit_ref, 'fit_association':association,
            'version':locked['version'], 'rows':evidence.paired(rows, locked)})
        records.append(result)
    body = {'schema':'legacy-training-input-audit-v1', 'snapshot_commit':SNAPSHOT,
        'board_sha256':hashlib.sha256(board_raw).hexdigest(), 'records':records,
        'population_games':len(records), 'source_counts':dict(collections.Counter(r.get('source_kind',r['qualification']) for r in records)),
        'point_tolerance':1e-10, 'new_cutoff_training_games_qualified':0,
        'max_point_difference':max(r.get('max_point_difference',0) for r in records),
        'limitations':['Git clocks are recorded commit times, not independently observed availability.',
            'Matching points do not establish every unused feature or historical source vintage.',
            'Legacy and current HFA methods must be reconciled before a new training handoff.',
            'Two retrospective games require an explicit reconstruction policy; no population is changed here.',
            'No legacy state receipt or physical availability timestamp is invented.']}
    raw = (json.dumps(body,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
    ref = pinned(gzip.compress(raw, mtime=0), '.json.gz')
    save(ROOT/BASE/'current-ref.json', ref, immutable=True)
    print(json.dumps({k:body[k] for k in ('population_games','source_counts','max_point_difference','new_cutoff_training_games_qualified')}))
    print(json.dumps(ref))


if __name__ == '__main__':
    main()
