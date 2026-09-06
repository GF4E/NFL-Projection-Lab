"""Independent completed-admission temporal audit: metadata and hashes only."""
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import resource
import sys
import time

START = time.monotonic()
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work')
RUN = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02c-v1-2d9c91d803f1c991')
DATA = RUN.parent / 'rf01-public-2026-09-04-v1/admitted-score-data.v2.json'
OUT = WORK / 'rf02d-numerical-admission-v1/temporal-review.json'
PINS = {
    'result': '8c0944fb4b4a6a086e26b133e1a087863ee430d1917d75ddfac1283ef6f64ca1',
    'protocol': '6fb5423bc60ef6f0f4e23b2ca4e4fe88991cda33f81a1218c74f745e76513de9',
    'config': '235e7bdf74b2e75620cdd4cafdd8cb9fa130c631949ff6172e047116a503a615',
    'parent_manifest': '2d9c91d803f1c991be039b88167082c8a501ce60dc58b18afcab0b251bb75e38',
    'parent_index': 'ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab',
    'admitted_data': 'ea7dc1c17cc4613ada871927842d90f6d41ffe61b45e6302c3032eac7cdffc85',
    'prior_metadata_audit': 'ed580ce3401ecb7286886764deefd647f659d5f23f0065b0142d376773166bdd',
    'prior_metadata_ledger': 'c018dc87a5a740245b14a153e265a962b3018adaa3bcb0aa37686abd45e403f6',
    'prior_temporal_review': '056417c0b2f0841ae070045069751a7e9526cde72f819320c51adac37a97d3be',
}
ADMISSION_HASHES = {
    'scripts/research_score_conditional_admission.py': 'd6043ce8c84b5689f791d21934929debaa603267a5de27d6ec1438c75ca307b8',
    'tests/research-score-conditional-margin/test_admission.py': '416550a5459c6ae635db0dfbe35b27e1a51cd57501ec4c234f190c0b5c4249bb',
}
evidence = {}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def budget():
    seconds = time.monotonic() - START
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 ** 2 if sys.platform == 'darwin' else 1024)
    assert seconds <= 300 and rss <= 4096
    return seconds, rss


def check(path, pin=None, parse=True):
    budget()
    assert path.is_absolute() and not path.is_symlink() and path.is_file()
    raw = path.read_bytes()
    fingerprint = digest(raw)
    if pin is not None:
        assert fingerprint == pin, str(path)
    evidence[str(path)] = {'sha256': fingerprint, 'bytes': len(raw)}
    if not parse:
        return raw
    def pairs(rows):
        out = {}
        for key, value in rows:
            assert key not in out
            out[key] = value
        return out
    def constant(value):
        raise ValueError(value)
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


result = check(WORK / 'rf02d-numerical-admission-v1/result.json', PINS['result'])
configuration = check(ROOT / 'config/research-team-score-conditional.v1.json', PINS['config'])
check(ROOT / '.planning/engine-os/research-first/RF-02D-HISTORICAL-PROTOCOL.v1.md', PINS['protocol'], False)
manifest = check(RUN / 'manifest.json', PINS['parent_manifest'])
index = check(RUN / 'artifact-index.json', PINS['parent_index'])['files']
data = check(DATA, PINS['admitted_data'])
metadata = check(WORK / 'rf02d-metadata-failure-audit/result.json', PINS['prior_metadata_audit'])
metadata_ledger = check(WORK / 'rf02d-metadata-failure-audit/checked-artifacts.json', PINS['prior_metadata_ledger'])
prefit = check(WORK / 'rf02d-temporal-prefit-review.json', PINS['prior_temporal_review'])
assert prefit['protocolSha256'] == PINS['protocol'] and prefit['configSha256'] == PINS['config']
assert result['pins'] == {key: PINS[key] for key in ['parent_manifest', 'parent_index', 'admitted_data', 'config', 'protocol']}
assert metadata['pins']['artifact-index.json'] == PINS['parent_index']
assert metadata['pins']['manifest.json'] == PINS['parent_manifest']
assert metadata['pins']['admitted-data'] == PINS['admitted_data']
assert metadata['status'] == 'passed' and metadata['nativeFailures'] == 0
assert len(metadata_ledger) == 1115 and all(pointer == index[name] for name, pointer in metadata_ledger.items())
assert len(index) == result['checked_indexed_files'] == 1909
assert sum(pointer['bytes'] for pointer in index.values()) == result['checked_indexed_bytes'] == 1861782789
assert index['manifest.json']['sha256'] == PINS['parent_manifest']

for name, pin in manifest['code_hashes'].items():
    assert '..' not in Path(name).parts and not Path(name).is_absolute()
    check(ROOT / name, pin, False)
assert len(manifest['code_hashes']) == 27
for name, pin in {**configuration['accepted_unit_hashes'], **ADMISSION_HASHES}.items():
    check(ROOT / name, pin, False)

protocol_acceptance = check(ROOT / '.planning/engine-os/research-first/RF-02D-PROTOCOL-ACCEPTANCE.v1.json')
implementation_acceptance = check(ROOT / '.planning/engine-os/research-first/RF-02D-ADMISSION-IMPLEMENTATION-ACCEPTANCE.v1.json')
assert protocol_acceptance['protocol_and_configuration_hashes'] == {
    '.planning/engine-os/research-first/RF-02D-HISTORICAL-PROTOCOL.v1.md': PINS['protocol'],
    'config/research-team-score-conditional.v1.json': PINS['config'],
}
assert protocol_acceptance['accepted_unit_hashes'] == configuration['accepted_unit_hashes']
assert protocol_acceptance['temporal_review']['sha256'] == PINS['prior_temporal_review']
assert protocol_acceptance['metadata_audit']['sha256'] == PINS['prior_metadata_audit']
assert implementation_acceptance['accepted_source_hashes'] == ADMISSION_HASHES
assert implementation_acceptance['status'] == 'accepted_for_bounded_numerical_admission_only'
assert not implementation_acceptance['historical_scalar_fitting_authorized']
assert not implementation_acceptance['successor_scoring_authorized']
tests = check(WORK / 'rf02d-admission-test-result.json')
assert tests['returncode'] == 0 and tests['source_hashes'] == ADMISSION_HASHES
assert tests['seconds'] == implementation_acceptance['root_tests']['subprocess_seconds']
assert tests['peak_rss_mib'] == implementation_acceptance['root_tests']['peak_rss_mib']

assert result['version'] == 'rf02d-parent-admission.v1' and result['status'] == 'passed'
assert result['seconds'] <= 600 and result['peak_rss_mib'] <= 4096
assert result['scope'] == {'availability_class': 'retrospective_inferred', 'football_fits': 0,
                           'historical_publication_verified': False, 'new_forecasts': 0,
                           'scalar_estimates': 0, 'score_calls': 0}
assert result['counts'] == {'annual_selections': 13, 'calibration_cases': 56430, 'lineage_closures': 452,
                            'native_failures': 0, 'ordinary_series': 18, 'recovered_distributions': 68140,
                            'selected_games': 3407, 'selected_rows': 68140, 'series': 20, 'source_mapper_objects': 437}
assert result['limits'] == {'empirical_total': 200, 'input_atoms': 65536, 'latest_case_season': 2024}

years = list(range(2013, 2026))
series = [(family[:-1], variant) for family, variant in configuration['series']]
ordinary = [key for key in series if key[1] != 'independent_marginals']
assert len(series) == len(set(series)) == 20 and len(ordinary) == 18
metadata_by_key = {(row['family'], row['variant']): row for row in metadata['series']}
assert set(metadata_by_key) == set(series) and metadata['years'] == years
assert all(row['nativeFailuresByYear'] == [0] * 13 for row in metadata_by_key.values())

records = {row['gameId']: row for row in data['records']}
assert len(records) == len(data['records']) == 4175
origins = [origin for origin in data['origins'] if origin['season'] in years]
assert len(origins) == 226
assert [(o['season'], o['week']) for o in origins] == sorted({(o['season'], o['week']) for o in origins})
by_year = {year: [(o['week'], game) for o in origins if o['season'] == year for game in o['targetGameIds']] for year in years}
expected_year_counts = [256, 256, 256, 256, 256, 256, 256, 256, 272, 271, 272, 272, 272]
assert [len(by_year[year]) for year in years] == expected_year_counts
for year in years:
    assert len(by_year[year]) == len({game for _, game in by_year[year]})
    assert {game for _, game in by_year[year]} == {game for game, row in records.items() if row['season'] == year}
for row in metadata_by_key.values():
    assert row['selectedRowsByYear'] == expected_year_counts
    assert row['priorSelectedRowsByTargetYear'] == configuration['calibration']['expected_prior_counts']
    assert row['priorNativeSuccessRowsByTargetYear'] == configuration['calibration']['expected_prior_counts']

cutoffs = {year: next(o['originAt'] for o in origins if o['season'] == year) for year in years}
forecast_times = {game: o['originAt'] for o in origins for game in o['targetGameIds']}
assert len(forecast_times) == 3407
assert all(datetime.fromisoformat(forecast_times[game]) < datetime.fromisoformat(records[game]['kickoffAt']) for game in forecast_times)
expected_closures = []
availability_comparisons = 0
for family, variant in ordinary:
    for year in years:
        budget()
        keys = [game for old_year in years if old_year < year for _, game in by_year[old_year]]
        assert all(2013 <= records[game]['season'] < year and records[game]['season'] <= 2024 for game in keys)
        for game in keys:
            row = records[game]
            kickoff = datetime.fromisoformat(row['kickoffAt'])
            for delay in (12, 24):
                available = datetime.fromisoformat(row['availability'][str(delay)])
                assert available == kickoff + timedelta(hours=delay)
                assert available < datetime.fromisoformat(cutoffs[year])
                availability_comparisons += 1
        expected_closures.append({'family': family, 'variant': variant, 'target_season': year,
                                 'cutoff': cutoffs[year], 'expected': len(keys), 'native_success': len(keys),
                                 'failed': 0, 'failed_keys': [], 'case_keys_sha256': digest(encoded(keys))})
assert len(expected_closures) == 234
assert encoded(expected_closures) == encoded(result['case_availability'])
assert sum(row['native_success'] == 0 for row in expected_closures) == 18
assert sum(row['native_success'] >= 256 for row in expected_closures) == 216
assert max(row['native_success'] for row in expected_closures) == 3135

identity_keys = []
for year in years:
    for week, game in [by_year[year][0], by_year[year][-1]]:
        identity_keys.extend({'season': year, 'week': week, 'game_id': game, 'family': family, 'variant': variant}
                             for family, variant in series)
assert len(identity_keys) == 520 and len({tuple(row.items()) for row in identity_keys}) == 520
assert result['identity_equivalence_sample'] == {'keys': identity_keys, 'sha256': digest(encoded(identity_keys)), 'occurrences': 520}

seconds, rss = budget()
review = {
    'version': 'rf02d-actual-admission-temporal-review.v1', 'status': 'accepted_temporal_admission_only',
    'admission_result_sha256': PINS['result'], 'evidence': evidence,
    'verified': {'original_code_test_files': 27, 'new_accepted_unit_and_admission_files': 8,
                 'ordinary_series': 18, 'ordered_annual_prior_closures': 234,
                 'empty_2013_closures': 18, 'supported_2014_through_2025_closures': 216,
                 'maximum_native_success_cases_per_fit': 3135, 'all_native_failures': 0,
                 'prior_counts_by_target_year': configuration['calibration']['expected_prior_counts'],
                 'annual_cutoffs': cutoffs, 'both_delay_availability_comparisons': availability_comparisons,
                 'no_2025_calibration_cases': True, 'identity_sample_ordered_keys': 520,
                 'identity_sample_sha256': digest(encoded(identity_keys)),
                 'annual_closures_sha256': digest(encoded(expected_closures)),
                 'parent_index_files': len(index), 'parent_index_bytes': sum(p['bytes'] for p in index.values())},
    'completed_admission_report': {'numerical_distributions_recovered': 68140, 'numerical_case_inputs_constructed': 56430,
                                   'seconds': result['seconds'], 'peak_rss_mib': result['peak_rss_mib'],
                                   'case_inputs_sha256': result['case_inputs_sha256'],
                                   'recovered_sources_sha256': result['recovered_sources_sha256']},
    'limits_of_this_review': {'numerical_case_or_distribution_digests_independently_recomputed': False,
                              'native_failure_evidence': 'Authenticated prior independent metadata audit and its parent-index-bound ledger.',
                              'full_parent_bytes_rehashed_again': False,
                              'annual_scalar_receipts_fitted': 0,
                              'case_availability_entries_are_fitted_scalar_receipts': False,
                              'identity_sample_metrics_evaluated': False,
                              'new_distribution_recoveries': 0, 'new_case_constructions': 0,
                              'parameter_estimates': 0, 'football_fits': 0, 'forecasts': 0, 'score_calls': 0,
                              'historical_publication_verified': False, 'production_authorized': False},
    'review_resources': {'seconds': seconds, 'peak_rss_mib': rss, 'maximum_seconds': 300, 'maximum_rss_mib': 4096},
    'review_script_sha256': digest(Path(__file__).read_bytes()),
}
content = encoded(review)
with OUT.open('xb') as stream:
    stream.write(content)
print(json.dumps({'path': str(OUT), 'sha256': digest(content), 'bytes': len(content),
                  'status': review['status'], 'closures': 234, 'identity_keys': 520,
                  'seconds': seconds, 'peak_rss_mib': rss}, sort_keys=True))
