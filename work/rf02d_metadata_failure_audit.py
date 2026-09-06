"""Read-only archived metadata audit; no model imports, fitting or scoring."""
import collections
import datetime
import hashlib
import json
import math
from pathlib import Path

RUN = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02c-v1-2d9c91d803f1c991')
DATA = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf01-public-2026-09-04-v1/admitted-score-data.v2.json')
OUT = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02d-metadata-failure-audit')
PINS = {
    'artifact-index.json': 'ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab',
    'manifest.json': '2d9c91d803f1c991be039b88167082c8a501ce60dc58b18afcab0b251bb75e38',
    'admitted-data': 'ea7dc1c17cc4613ada871927842d90f6d41ffe61b45e6302c3032eac7cdffc85',
}
COMMON = ['full', 'no_home_effect', 'no_prior_season_carryover', 'no_time_decay', 'no_team_identity',
          'independent_marginals', 'availability_24h', 'shuffled_identity', 'deterministic_noise']
SERIES = [(f, v) for f in ['N0', 'E2'] for v in COMMON + (['no_offense', 'no_defense'] if f == 'E2' else [])]
checked = {}


def sha(b):
    return hashlib.sha256(b).hexdigest()


def parse(b):
    return json.loads(b, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))


index_bytes = (RUN / 'artifact-index.json').read_bytes()
assert sha(index_bytes) == PINS['artifact-index.json']
index = parse(index_bytes)['files']


def read(name):
    assert name in index and Path(name).name == name
    b = (RUN / name).read_bytes()
    assert len(b) == index[name]['bytes'] and sha(b) == index[name]['sha256'], name
    checked[name] = {'sha256': sha(b), 'bytes': len(b)}
    return parse(b)


manifest_bytes = (RUN / 'manifest.json').read_bytes()
assert sha(manifest_bytes) == PINS['manifest.json']
data_bytes = DATA.read_bytes()
assert sha(data_bytes) == PINS['admitted-data']
data = parse(data_bytes)
records = {r['gameId']: r for r in data['records']}
assert len(records) == len(data['records'])
assert data['historicalStatus'] == 'retrospective_inferred'
origins = {(o['season'], o['week']): o for o in data['origins']}
years = list(range(2013, 2026))
season_ids = {y: {k for k, r in records.items() if r['season'] == y} for y in years}
first_origins = {y: min(o['originAt'] for o in data['origins'] if o['season'] == y) for y in years}
dt = datetime.datetime.fromisoformat
mapper_names = {}
seen = {s: {y: set() for y in years} for s in SERIES}
failed = {s: {y: [] for y in years} for s in SERIES}
failure_references = []
metadata_failures = []
prior_timing_checks = 0
origin_checks = collections.Counter()
forecast_names = sorted(n for n in index if n.startswith('forecasts-') and int(n.split('-')[1]) in years)
assert len(forecast_names) == 226

for name in forecast_names:
    _, year_string, week_string = name[:-5].split('-')
    y, w = int(year_string), int(week_string)
    forecast = read(name)
    state = read(f'state-{y}-{w:02}.json')
    losses = read(f'outer-losses-{y}-{w:02}.json')
    origin = origins[(y, w)]
    assert state['origin'] == origin
    assert forecast['origin_at'] == origin['originAt']
    assert forecast['manifest_sha256'] == PINS['manifest.json']
    assert forecast['classification'] == 'retrospective'
    rows = {(r['family'], r['variant'], r['game_id']): r for r in forecast['outer_selected_forecasts']}
    assert len(rows) == len(forecast['outer_selected_forecasts'])
    loss_rows = {(r['family'], r['variant'], r['game_id']): r for r in losses}
    assert len(loss_rows) == len(losses)
    target_ids = set(origin['targetGameIds'])
    for delay in ('12', '24'):
        for identity in origin['windows'][delay]['eligibleInputIds']:
            assert dt(records[identity]['availability'][delay]) < dt(origin['originAt'])
            origin_checks[delay] += 1
    for s in SERIES:
        family, variant = s
        matching = {k[2] for k in rows if k[:2] == s}
        assert matching == target_ids, (name, s)
        for identity in sorted(matching):
            row = rows[(family, variant, identity)]
            loss = loss_rows[(family, variant, identity)]
            assert row['native_failure'] == loss['native_failure']
            assert identity not in seen[s][y]
            seen[s][y].add(identity)
            assert dt(origin['originAt']) < dt(records[identity]['kickoffAt'])
            descriptor = row['distribution']
            pointer = descriptor['mapper']
            assert pointer['sha256'] == index[pointer['name']]['sha256']
            mapper_names.setdefault(pointer['name'], set()).add((y, w, '24' if variant == 'availability_24h' else '12'))
            if row['native_failure'] is not None:
                failed[s][y].append({'gameId': identity, 'reason': row['native_failure']})
                if family == 'E2':
                    reference_variant = variant if variant in COMMON else 'full'
                    reference = rows[('N0', reference_variant, identity)]
                    assert descriptor == reference['distribution'], (name, s, identity, 'fallback_distribution_mismatch')
                    failure_references.append({'season': y, 'gameId': identity, 'family': family, 'variant': variant,
                                               'referenceFamily': 'N0', 'referenceVariant': reference_variant,
                                               'descriptorExactlyMatches': True})
        assert all(records[identity]['season'] == y for identity in seen[s][y])

assert all(seen[s][y] == season_ids[y] for s in SERIES for y in years)
print(json.dumps({'phase': 'forecast_metadata_checked', 'series': len(SERIES), 'rows': sum(len(seen[s][y]) for s in SERIES for y in years),
                  'nativeFailures': sum(len(failed[s][y]) for s in SERIES for y in years)}), flush=True)

mapper_details = []
for name, references in sorted(mapper_names.items()):
    mapper = read(name)
    atoms = mapper['atoms']
    assert len(atoms) == len(mapper['weights']) and 0 < len(atoms) <= 65536
    totals = []
    for atom in atoms:
        assert len(atom) == 2
        assert all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) and n >= 0 and int(n) == n for n in atom)
        totals.append(int(sum(atom)))
    assert max(totals) <= 200
    for y, w, delay in references:
        ids = origins[(y, w)]['windows'][delay]['eligibleInputIds']
        # Frozen from_scores mirrors home/away and then applies lexicographic unique.
        # Reproduce only that support metadata operation, never weights or a distribution.
        source_pairs = [(records[i]['homeScore'], records[i]['awayScore']) for i in ids]
        expected_atoms = [list(pair) for pair in sorted(set(source_pairs + [(a, h) for h, a in source_pairs]))]
        assert atoms == expected_atoms, (name, y, w, delay, 'mapper_atom_lineage_mismatch')
    mapper_details.append({'name': name, 'atomRows': len(atoms), 'minimumTotal': min(totals), 'maximumTotal': max(totals),
                           'originWindowReferences': len(references)})

all_observed_totals = []
for row in records.values():
    scores = [row['homeScore'], row['awayScore']]
    assert all(isinstance(n, int) and not isinstance(n, bool) and n >= 0 for n in scores)
    all_observed_totals.append(sum(scores))
assert max(all_observed_totals) <= 200

expected_priors = [0, 256, 512, 768, 1024, 1280, 1536, 1792, 2048, 2320, 2591, 2863, 3135]
series_summary = []
for family, variant in SERIES:
    s = family, variant
    prior_counts, native_prior_counts = [], []
    for target_year in years:
        previous = [identity for y in years if y < target_year for identity in seen[s][y]]
        previous_failed = sum(len(failed[s][y]) for y in years if y < target_year)
        prior_counts.append(len(previous))
        native_prior_counts.append(len(previous) - previous_failed)
        for identity in previous:
            for delay in ('12', '24'):
                assert dt(records[identity]['availability'][delay]) < dt(first_origins[target_year])
                prior_timing_checks += 1
    assert prior_counts == expected_priors
    series_summary.append({'family': family, 'variant': variant,
                           'selectedRowsByYear': [len(seen[s][y]) for y in years],
                           'nativeFailuresByYear': [len(failed[s][y]) for y in years],
                           'priorSelectedRowsByTargetYear': prior_counts,
                           'priorNativeSuccessRowsByTargetYear': native_prior_counts})

result = {
    'version': 'rf02d-metadata-failure-audit.v1', 'status': 'passed',
    'runDirectory': str(RUN), 'pins': PINS, 'years': years,
    'seriesCount': len(SERIES), 'selectedRows': sum(len(seen[s][y]) for s in SERIES for y in years),
    'uniqueSelectedGames': sum(len(season_ids[y]) for y in years),
    'nativeFailures': sum(len(failed[s][y]) for s in SERIES for y in years),
    'series': series_summary, 'actualFailureReferences': failure_references,
    'registeredFallbackReferences': {v: ('N0:' + (v if v in COMMON else 'full')) for v in COMMON + ['no_offense', 'no_defense']},
    'mapperMetadata': {'objects': len(mapper_details), 'maximumAtomRows': max(x['atomRows'] for x in mapper_details),
                       'minimumAtomRows': min(x['atomRows'] for x in mapper_details),
                       'maximumEmpiricalTotal': max(x['maximumTotal'] for x in mapper_details),
                       'limits': {'maximumAtomRows': 65536, 'maximumEmpiricalTotal': 200},
                       'exactEligibleMirroredUniqueSourceAtomOrderChecked': True},
    'observations': {'admittedRows': len(records), 'maximumTotalAllAdmitted': max(all_observed_totals),
                     'maximumTotalSelectedOuter': max(records[i]['homeScore'] + records[i]['awayScore'] for y in years for i in season_ids[y]),
                     'maximumPermittedTotal': 200},
    'temporalMetadata': {'historicalStatus': data['historicalStatus'],
                         'originEligibleAvailabilityComparisons': dict(origin_checks),
                         'priorOutcomeAvailabilityComparisons': prior_timing_checks,
                         'bothDelayHours': [12, 24], 'strictBeforeCutoff': True,
                         'annualCutoffsByYear': first_origins, 'forecastOriginsBeforeKickoff': True},
    'checkedIndexedFiles': len(checked), 'checkedIndexedBytes': sum(x['bytes'] for x in checked.values()),
    'scope': {'modelImports': 0, 'distributionRecoveries': 0, 'conditionalCasesBuilt': 0, 'parameterEstimates': 0,
              'footballFits': 0, 'newForecasts': 0, 'scoresComputed': 0, 'providerRequests': 0,
              'existingMetricsUsed': 'native_failure flags only; no metric values computed or aggregated'},
}
OUT.mkdir(exist_ok=True)
for name, value in [('result.json', result), ('checked-artifacts.json', checked), ('mapper-metadata.json', mapper_details)]:
    content = (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()
    (OUT / name).write_bytes(content)
    print(json.dumps({'file': str(OUT / name), 'sha256': sha(content), 'bytes': len(content)}), flush=True)
print(json.dumps({k: result[k] for k in ['status', 'seriesCount', 'selectedRows', 'nativeFailures', 'mapperMetadata', 'observations', 'checkedIndexedFiles', 'checkedIndexedBytes']}), flush=True)
