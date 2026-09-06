"""Audit completed fixed identity qualification using bytes/metadata, never scores."""
from datetime import datetime
import copy
import hashlib
import json
from pathlib import Path
import resource
import stat
import sys
import time

START = time.monotonic()
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work')
OUT = WORK / 'rf02d-identity-qualification-v1'
PARENT = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02c-v1-2d9c91d803f1c991')
PINS = {
    'receipt': 'c6d979fc299301ade2a0695c9ebc440cb2bf779b68cf043c3e05578ac0d0fecb',
    'manifest': 'fc1e6a271ee2b8b2bcc8e68c8469f528b6c6dc4ec18857cdc8426a2f2e649fa4',
    'sample_file': 'c828dc0e0acfcdb585702c5172401504f1d4b7d8b33e5645ee64c6add0f1f217',
    'sample_keys': 'f36dcdbdbaa616d65feca266abc531932a539fcc8948d20105541409a6969185',
    'admission_acceptance': '8c737ad9869efa7ef2948332ab6019384517f9a511e474add9026c227f1958a3',
    'replay_acceptance': '6f3659c1f6b5bfbcc77585197969374b36867769e4fbcb2eeb180c53ed2bb5bf',
    'parent_manifest': '2d9c91d803f1c991be039b88167082c8a501ce60dc58b18afcab0b251bb75e38',
    'parent_index': 'ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab',
    'admitted_data': 'ea7dc1c17cc4613ada871927842d90f6d41ffe61b45e6302c3032eac7cdffc85',
    'admission_result': '8c0944fb4b4a6a086e26b133e1a087863ee430d1917d75ddfac1283ef6f64ca1',
    'config': '235e7bdf74b2e75620cdd4cafdd8cb9fa130c631949ff6172e047116a503a615',
    'protocol': '6fb5423bc60ef6f0f4e23b2ca4e4fe88991cda33f81a1218c74f745e76513de9',
}
OWN = {
    'scripts/research_score_conditional_qualify.py': 'cb0a13eb0afacb2a4ccde7826bc2288a31677853b71d061c5ccc477eca0647f6',
    'tests/research-score-conditional-margin/test_qualify.py': 'aace76b001643345bb5eadc1bd1fc05bc6745bb64fb6b662ef33f7f131e18341',
}
READ = {}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def budget():
    seconds = time.monotonic() - START
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 ** 2 if sys.platform == 'darwin' else 1024)
    assert seconds <= 300 and rss <= 4096
    return seconds, rss


def read(path, pin=None, size=None, parse=True):
    budget()
    path = Path(path)
    assert path.is_absolute() and '..' not in path.parts
    for part in [path] + list(path.parents):
        assert not part.is_symlink(), str(part)
    assert stat.S_ISREG(path.stat().st_mode)
    raw = path.read_bytes()
    if pin is not None:
        assert sha(raw) == pin, str(path)
    if size is not None:
        assert len(raw) == size
    READ[str(path)] = {'sha256': sha(raw), 'bytes': len(raw)}
    if not parse:
        return raw
    def pairs(items):
        result = {}
        for key, value in items:
            assert key not in result
            result[key] = value
        return result
    def constant(value):
        raise ValueError(value)
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


receipt = read(OUT / 'receipt.json', PINS['receipt'])
assert receipt['status'] == 'passed' and receipt['complete_count'] == receipt['expected_count'] == 520
assert receipt['scalar_estimates'] == receipt['football_fits'] == 0
assert receipt['seconds'] <= 600 and receipt['peak_rss_mib'] <= 4096
bounds = {'seconds': 600, 'peak_rss_mib': 4096, 'occurrences': 520,
          'scalar_estimates': 0, 'football_fits': 0, 'successor_replay': False}
assert receipt['bounds'] == bounds
artifact_names = {'manifest.json', 'sample.json'} | {f'occurrence-{i:03}.json' for i in range(520)}
assert set(receipt['artifacts']) == artifact_names
artifacts = {name: read(OUT / name, pointer['sha256'], pointer['bytes']) for name, pointer in receipt['artifacts'].items()}
assert len(artifacts) == 522
manifest, sample = artifacts['manifest.json'], artifacts['sample.json']
assert READ[str(OUT / 'manifest.json')]['sha256'] == PINS['manifest']
assert READ[str(OUT / 'sample.json')]['sha256'] == PINS['sample_file']
assert manifest['version'] == receipt['version'] == 'rf02d-identity-qualification.v1'
assert manifest['bounds'] == bounds and manifest['pins'] == receipt['pins']
assert receipt['pins'] == {key: PINS[key] for key in ['parent_manifest', 'parent_index', 'admitted_data', 'config', 'protocol',
                                                   'admission_acceptance', 'replay_acceptance', 'admission_result']}
assert manifest['qualification_source_hashes'] == OWN
assert manifest['sample_sha256'] == receipt['sample_sha256'] == sample['sha256'] == PINS['sample_keys']
assert sample['occurrences'] == len(sample['keys']) == 520
assert sha(encode(sample['keys'])) == PINS['sample_keys']

planning = ROOT / '.planning/engine-os/research-first'
admission_acceptance = read(planning / 'RF-02D-ADMISSION-ACCEPTANCE.v1.json', PINS['admission_acceptance'])
replay_acceptance = read(planning / 'RF-02D-REPLAY-UNIT-ACCEPTANCE.v1.json', PINS['replay_acceptance'])
assert admission_acceptance['status'] == 'accepted_numerical_and_temporal_admission_only'
assert replay_acceptance['status'] == 'accepted_pure_annual_and_prediction_unit_only'
accepted_evidence = {name: read(pointer['path'], pointer['sha256']) for name, pointer in admission_acceptance['evidence'].items()}
admission = accepted_evidence['result.json']
assert admission_acceptance['evidence']['result.json']['sha256'] == PINS['admission_result']
assert admission['identity_equivalence_sample'] == sample and admission['counts']['native_failures'] == 0
assert admission['status'] == 'passed' and admission['counts'] == admission_acceptance['counts']
pointer = replay_acceptance['root_test_evidence']
replay_tests = read(pointer['path'], pointer['sha256'])
assert replay_tests['returncode'] == 0
config = read(ROOT / 'config/research-team-score-conditional.v1.json', PINS['config'])
read(ROOT / config['protocol'], PINS['protocol'], parse=False)
parent_manifest = read(PARENT / 'manifest.json', PINS['parent_manifest'])
parent_index = read(PARENT / 'artifact-index.json', PINS['parent_index'])['files']
assert len(parent_index) == receipt['checked_indexed_files'] == 1909
assert sum(pointer['bytes'] for pointer in parent_index.values()) == receipt['checked_indexed_bytes'] == 1861782789
assert manifest['parent_code_hashes'] == parent_manifest['code_hashes'] and len(manifest['parent_code_hashes']) == 27
assert manifest['runtime'] == parent_manifest['runtime']
admission_source = {'scripts/research_score_conditional_admission.py': 'd6043ce8c84b5689f791d21934929debaa603267a5de27d6ec1438c75ca307b8',
                    'tests/research-score-conditional-margin/test_admission.py': '416550a5459c6ae635db0dfbe35b27e1a51cd57501ec4c234f190c0b5c4249bb'}
assert manifest['accepted_unit_hashes'] == {**config['accepted_unit_hashes'], **admission_source, **replay_acceptance['accepted_source_hashes']}
assert len(manifest['accepted_unit_hashes']) == 10
for name, pin in {**manifest['parent_code_hashes'], **manifest['accepted_unit_hashes'], **OWN}.items():
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    read(ROOT / name, pin, parse=False)
rf01 = read(planning / 'RF-01-ACCEPTANCE.v2.json', parent_manifest['accepted_receipt_sha256'])
old_config_path = Path(rf01['config']['path'])
old_config = read(old_config_path if old_config_path.is_absolute() else ROOT / old_config_path,
                  parent_manifest['bound_hashes']['config'])
data = read(rf01['admittedData']['path'], PINS['admitted_data'])
assert rf01['admittedData']['sha256'] == PINS['admitted_data']

series = [(family[:-1], variant) for family, variant in config['series']]
all_series = [(family, variant) for family in old_config['models']
              for variant in ['full'] + old_config['variants']['allModels'] + old_config['variants'].get(family, [])
              + old_config['variants']['negativeControlsAllModels']]
assert len(all_series) == len(set(all_series)) == 40 and len(series) == len(set(series)) == 20
years = list(range(2013, 2026))
origins = [origin for origin in data['origins'] if origin['season'] in years]
assert len(origins) == 226
assert [(o['season'], o['week']) for o in origins] == sorted({(o['season'], o['week']) for o in origins})
records = {row['gameId']: row for row in data['records']}
assert len(records) == len(data['records'])
origin_by_key = {(o['season'], o['week']): o for o in origins}
expected_keys = []
for year, count in zip(years, [256] * 8 + [272, 271, 272, 272, 272]):
    games = [(origin['week'], game) for origin in origins if origin['season'] == year for game in origin['targetGameIds']]
    assert len(games) == len(set(game for _, game in games)) == count
    assert {game for _, game in games} == {game for game, row in records.items() if row['season'] == year}
    for week, game in [games[0], games[-1]]:
        expected_keys.extend({'season': year, 'week': week, 'game_id': game, 'family': family, 'variant': variant}
                             for family, variant in series)
assert sample['keys'] == expected_keys
assert len({tuple(row.items()) for row in expected_keys}) == 520

source_bytes, source_files = 0, set()
locations = {}
ledger_by_key = {(row['key']['family'], row['key']['variant'], row['key']['game_id']): row
                 for name, row in artifacts.items() if name.startswith('occurrence-')}
assert len(ledger_by_key) == 520
for i, key in enumerate(expected_keys):
    budget()
    ledger = artifacts[f'occurrence-{i:03}.json']
    assert ledger['occurrence'] == i and ledger['key'] == key
    location = key['season'], key['week']
    if location not in locations:
        origin = origin_by_key[location]
        suffix = f'{location[0]}-{location[1]:02}'
        forecast_name, loss_name = 'forecasts-' + suffix + '.json', 'outer-losses-' + suffix + '.json'
        forecast = read(PARENT / forecast_name, **{'pin': parent_index[forecast_name]['sha256'], 'size': parent_index[forecast_name]['bytes']})
        losses = read(PARENT / loss_name, **{'pin': parent_index[loss_name]['sha256'], 'size': parent_index[loss_name]['bytes']})
        source_files.update([forecast_name, loss_name])
        source_bytes += parent_index[forecast_name]['bytes'] + parent_index[loss_name]['bytes']
        assert forecast['origin_at'] == origin['originAt'] and forecast['manifest_sha256'] == PINS['parent_manifest']
        assert forecast['classification'] == 'retrospective'
        expected_rows = [(family, variant, game) for family, variant in all_series for game in origin['targetGameIds']]
        rows = forecast['outer_selected_forecasts']
        assert [(r['family'], r['variant'], r['game_id']) for r in rows] == expected_rows
        assert [(r['family'], r['variant'], r['game_id']) for r in losses] == expected_rows
        assert len(set(expected_rows)) == len(expected_rows)
        assert all(row['native_failure'] == loss['native_failure'] for row, loss in zip(rows, losses))
        locations[location] = (forecast_name, loss_name, dict(zip(expected_rows, rows)), dict(zip(expected_rows, losses)))
    forecast_name, loss_name, rows, losses = locations[location]
    row_key = key['family'], key['variant'], key['game_id']
    row, loss, record = rows[row_key], losses[row_key], records[key['game_id']]
    assert ledger['forecast_file'] == {forecast_name: parent_index[forecast_name]}
    assert ledger['loss_file'] == {loss_name: parent_index[loss_name]}
    assert ledger['source_descriptor_sha256'] == sha(encode(row['distribution']))
    assert ledger['archived_loss_row_sha256'] == sha(encode(loss))
    assert ledger['archived_metrics_sha256'] == ledger['new_metrics_sha256'] == sha(encode(loss['metrics']))
    assert ledger['native_failure'] is ledger['archived_native_failure'] is row['native_failure'] is loss['native_failure'] is None
    assert (record['season'], record['week']) == location
    assert datetime.fromisoformat(origin_by_key[location]['originAt']) < datetime.fromisoformat(record['kickoffAt'])
    assert ledger['source_distribution_sha256'] == ledger['result_distribution_sha256']
    transform = ledger['transformation']
    assert transform['version'] == 'rf02d-conditional-adapter-v1' and type(transform['s']) is float and transform['s'] == 1.0
    assert transform['original_distribution_fingerprint'] == transform['resulting_distribution_fingerprint']
    if key['variant'] == 'independent_marginals':
        full_row = rows[key['family'], 'full', key['game_id']]
        expected = copy.deepcopy(full_row['distribution'])
        expected['independent'] = True
        covariance = expected['covariance']
        expected['covariance'] = [[covariance[0][0], 0.0], [0.0, covariance[1][1]]]
        assert encode(expected) == encode(row['distribution'])
        full_ledger = ledger_by_key[key['family'], 'full', key['game_id']]
        assert ledger['full_source_distribution_sha256'] == full_ledger['source_distribution_sha256'] == transform['original_distribution_fingerprint']
        operation = ledger['independence_operation']
        assert operation['version'] == 'rf02d-conditional-policy-v1' and operation['operation'] == 'product_of_calibrated_full_marginals'
        assert operation['joint_transformation'] == transform and operation['resulting_distribution_fingerprint'] == ledger['result_distribution_sha256']
    else:
        assert ledger['full_source_distribution_sha256'] is None and ledger['independence_operation'] is None
        assert transform['original_distribution_fingerprint'] == ledger['source_distribution_sha256']

timestamps = {}
for name in ['manifest.json', 'sample.json'] + [f'occurrence-{i:03}.json' for i in range(520)] + ['receipt.json']:
    info = (OUT / name).stat()
    timestamps[name] = {'mtime_ns': info.st_mtime_ns, 'ctime_ns': info.st_ctime_ns, 'birthtime': getattr(info, 'st_birthtime', None)}
occurrence_times = [timestamps[f'occurrence-{i:03}.json']['mtime_ns'] for i in range(520)]
assert timestamps['manifest.json']['mtime_ns'] <= timestamps['sample.json']['mtime_ns'] < min(occurrence_times)
assert occurrence_times == sorted(occurrence_times)
assert max(occurrence_times) <= timestamps['receipt.json']['mtime_ns']
names = {p.name for p in OUT.iterdir()}
assert {name for name in names if name.startswith('occurrence-')} == {f'occurrence-{i:03}.json' for i in range(520)}
assert {name for name in names if name.startswith('sample')} == {'sample.json'}
assert artifact_names | {'receipt.json'} <= names
assert not OUT.resolve().is_relative_to(PARENT.resolve())
seconds, rss = budget()
review = {
    'version': 'rf02d-actual-identity-temporal-review.v1', 'status': 'accepted_fixed_identity_temporal_review',
    'receipt_sha256': PINS['receipt'], 'manifest_sha256': PINS['manifest'],
    'sample_file_sha256': PINS['sample_file'], 'sample_keys_sha256': PINS['sample_keys'],
    'all_522_indexed_artifacts_verified': True, 'indexed_artifact_bytes': sum(p['bytes'] for p in receipt['artifacts'].values()),
    'indexed_artifact_ledger_sha256': sha(encode(receipt['artifacts'])),
    'ordered_occurrences': 520, 'distinct_selected_games': 26, 'source_origin_batches': len(locations),
    'parent_forecast_loss_files_verified': len(source_files), 'parent_forecast_loss_bytes_verified': source_bytes,
    'accepted_source_test_files_verified': 39, 'native_failure_flags_verified_zero': 520,
    'complete_archived_metric_dictionary_hashes_verified': 520,
    'ordinary_identity_records': 468, 'independent_identity_records': 52,
    'source_parent_membership_and_operation_chain_consistent': True,
    'sample_order_reconstructed_from_original_origins_and_target_ids': True,
    'no_alternate_sample_or_duplicate_occurrence_within_this_output': True,
    'complete_prefix_indices': [0, 519], 'unindexed_review_files_observed': sorted(names - artifact_names - {'receipt.json'}),
    'observed_persistence_evidence': {
        'manifest': timestamps['manifest.json'], 'sample': timestamps['sample.json'],
        'first_occurrence': timestamps['occurrence-000.json'], 'last_occurrence': timestamps['occurrence-519.json'],
        'receipt': timestamps['receipt.json'], 'all_occurrence_mtimes_nondecreasing': True,
        'sample_mtime_precedes_every_occurrence_mtime': True,
        'source_and_synthetic_evidence': 'Reviewed accepted qualifier writes and fsyncs manifest/sample before entering its first metric occurrence; independent synthetic persistence/failure test passed.',
        'limits': 'Filesystem timestamps are supporting mutable metadata, not a cryptographic execution trace. Complete contiguous output plus the reviewed exclusive/no-retry code supports one completed fixed pass in this directory; it cannot rule out unrelated external executions. Process exit0/session25020 was observed by root, not independently observed by this audit.',
    },
    'qualification_reported_seconds': receipt['seconds'], 'qualification_reported_peak_rss_mib': receipt['peak_rss_mib'],
    'scope': {'new_metric_calls': 0, 'new_distribution_recoveries': 0, 'case_constructions': 0,
              'scalar_estimates': 0, 'football_fits': 0, 'qualifier_reruns': 0,
              'metric_values_and_distribution_fingerprints_recomputed_numerically': False,
              'historical_publication_verified': False, 'successor_replay_performed': False,
              'full_runner_qualification_or_production_authorization': False},
    'review_resources': {'seconds': seconds, 'peak_rss_mib': rss, 'maximum_seconds': 300, 'maximum_rss_mib': 4096},
    'review_script_sha256': sha(Path(__file__).read_bytes()),
}
output = OUT / 'temporal-review.json'
raw = encode(review)
with output.open('xb') as stream:
    stream.write(raw)
print(json.dumps({'path': str(output), 'sha256': sha(raw), 'bytes': len(raw), 'status': review['status'],
                  'indexed_artifacts': 522, 'source_files': len(source_files), 'seconds': seconds, 'peak_rss_mib': rss}, sort_keys=True))
