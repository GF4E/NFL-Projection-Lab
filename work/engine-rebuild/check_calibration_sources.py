"""Read-only source inventory; no model fit, candidate evaluation, or activation."""
import collections
import csv
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.projection_prepare import canonical


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def load(ref):
    path = ROOT / ref['path']
    if digest(path) != ref['sha256']:
        raise ValueError('Source hash mismatch: ' + ref['path'])
    data = path.read_bytes()
    return json.loads(gzip.decompress(data) if path.suffix == '.gz' else data)


def ref(path):
    path = ROOT / path
    return {'path': str(path.relative_to(ROOT)), 'sha256': digest(path)}


def run():
    phase_ref = ref('work/projection-v2/phase-a/features-ref.json')
    phase = load(phase_ref)
    source_ref = ref('work/projection-v1/source-manifest.json')
    source = load(source_ref)
    active_pointer = ref('work/in-season-learning-v1/active-fit-ref.json')
    active_ref = load(active_pointer)
    active = load(active_ref)
    schedule_ref = dict(phase['schedule_ref'])
    schedule_path = ROOT / schedule_ref['path']
    if digest(schedule_path) != schedule_ref['sha256']:
        raise ValueError('Historical schedule hash differs')
    schedule = list(csv.DictReader(schedule_path.read_text().splitlines()))
    regular = {r['game_id']: r for r in schedule if r['game_type'] == 'REG'
               and r['home_score'] != '' and r['away_score'] != ''}
    early = []
    rows = list(load(source['team_games']))
    for raw in phase['early_refs']:
        if digest(ROOT / raw['path']) != raw['sha256']:
            raise ValueError('Early play-by-play source hash differs')
        aggregate_ref = ref('work/projection-v2/phase-a/aggregate-' + raw['sha256'] + '.json')
        batch = load(aggregate_ref)
        if any(r['source_hash'] != raw['sha256'] for r in batch):
            raise ValueError('Aggregate source identity differs')
        rows.extend(batch)
        early.append({'raw': raw, 'aggregate': aggregate_ref, 'rows': len(batch),
                      'derivation_status': 'HASH_VERIFIED; NOT_REAGGREGATED_THIS_CHECK'})
    annual = {}
    for year in range(2011, 2016):
        games = {k: g for k, g in regular.items() if int(g['season']) == year}
        batches = collections.defaultdict(list)
        for row in rows:
            if int(row['season']) == year:
                batches[row['game_id']].append(row)
        failures = []
        for gid, game in games.items():
            pair = batches.get(gid, [])
            if len(pair) != 2 or {canonical(r['team']) for r in pair} != {canonical(game['away_team']), canonical(game['home_team'])}:
                failures.append(gid)
        annual[str(year)] = {'completed_regular_games': len(games),
                             'paired_stat_games': sum(k in games and len(v) == 2 for k, v in batches.items()),
                             'unmatched_or_duplicate_team_pairs': failures}
    cache_ref = ref('work/projection-v2/phase-a/core-oof.json')
    cache = load(cache_ref)
    manifest_ref = ref('work/projection-v2/phase-a/core-manifest.json')
    manifest = load(manifest_ref)
    cache_counts = {str(y): len({r['game_id'] for r in cache if r['season'] == y}) for y in range(2013, 2016)}
    required_hfa = {str(y) for y in range(2011, 2016)}
    missing_hfa = sorted(required_hfa - set(active.get('elo_hfa', {})))
    return {
        'status': 'SOURCE_INVENTORY_ONLY; CALIBRATION_NOT_QUALIFIED',
        'purpose': 'Identify prerequisites for strictly earlier own-lineage calibration, without fitting or scoring a candidate.',
        'sources': {'phase_a': phase_ref, 'current_source_manifest': source_ref,
                    'active_pointer': active_pointer, 'active_fit': active_ref,
                    'schedule': {'path': str(schedule_path.relative_to(ROOT)), 'sha256': schedule_ref['sha256']},
                    'early': early, 'existing_oof': cache_ref, 'existing_method': manifest_ref,
                    'franchise_normalization': ref('scripts/projection_prepare.py')},
        'by_season': annual,
        'existing_2013_2015_cache_games': cache_counts,
        'existing_cache_groups': manifest['groups'],
        'issuing_groups': active['groups'], 'issuing_settings': active['selected'],
        'cache_usable_as_issuing_lineage': False,
        'reason': 'Phase A uses different groups, annual fitting and penalty selection; its forecasts cannot be substituted for the issuing weekly-refit method.',
        'missing_early_hfa_seasons_in_active_artifact': missing_hfa,
        'next_actions': [
            'Verify aggregate derivation against pinned early play-by-play before extending the common source adapter.',
            'Derive missing early HFA entries using the existing promoted prior-season rule; do not copy later-season HFA or insert a default.',
            'Generate separately identified strictly earlier 2013–2015 forecasts for both required calibration lineages using their own methods.',
            'Complete chronology-control authority and unattended closeout prerequisites before preregistration or candidate comparison.'
        ],
        'limitations': ['Raw bytes and aggregate source tags verified, not independent play-by-play reaggregation.',
                        'Historical provider availability is unknown; retrieval in 2026 does not establish availability at historical issuance.',
                        'No qualified own-lineage residuals, probability accuracy, or release readiness are established.'],
        'checker': ref(str(Path(__file__).relative_to(ROOT)))
    }


if __name__ == '__main__':
    print(json.dumps(run(), indent=2, sort_keys=True, allow_nan=False))
