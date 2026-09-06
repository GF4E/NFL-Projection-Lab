"""Independent synthetic temporal probes; no historical inputs or model calls."""
import hashlib
import importlib.util
import json
from pathlib import Path
import resource
import sys
import time

START = time.monotonic()
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
OUT = Path(__file__).resolve().parent
PINS = {
    'scripts/research_score_conditional_inference.py': 'acaf57739ebb30f6a7a4abcb3c2673bbbd649ceca7fa3af6c435c27be9dd1604',
    'tests/research-score-conditional-margin/test_inference.py': '598d40031b1630993ff2f2aceb13a7d280dc86a5d4789e572c383d54da1ea629',
    'config/research-team-score-conditional.v1.json': '235e7bdf74b2e75620cdd4cafdd8cb9fa130c631949ff6172e047116a503a615',
    '.planning/engine-os/research-first/RF-02D-HISTORICAL-PROTOCOL.v1.md': '6fb5423bc60ef6f0f4e23b2ca4e4fe88991cda33f81a1218c74f745e76513de9',
    '.planning/engine-os/research-first/RF-02D-RUNNER-IMPLEMENTATION-SCOPE.v1.md': '53a275d9d7c4178c53cb954092881651b1abb63f999b9bad8423e9604c398e95',
}


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


for name, pin in PINS.items():
    assert hash_file(ROOT / name) == pin, name

spec = importlib.util.spec_from_file_location('inference_fixture', ROOT / 'tests/research-score-conditional-margin/test_inference.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
unit = fixture.unit
config, metadata, rows, audits = fixture.production_fixture()
assert len(metadata) == 3407
assert sum(row['season'] <= 2024 for row in metadata) == 3135
assert sum(row['season'] == 2025 for row in metadata) == 272
probes = {}


def validate():
    return unit._validate(config, metadata, rows, audits)


def rejection(name, thunk, reason):
    try:
        thunk()
    except unit.InferenceFailure as exc:
        assert reason in str(exc), (name, str(exc))
        probes[name] = {'outcome': 'rejected', 'reason': str(exc)}
    else:
        raise AssertionError('missing rejection: ' + name)


validate()
probes['complete_synthetic_population'] = {'outcome': 'accepted', 'all_games': 3407, 'development_games': 3135, 'exposed_games': 272}

# These two accepted mutations demonstrate the declared caller boundary, not
# permission to substitute source membership or original within-origin order.
original = metadata[0]['game_id']
metadata[0]['game_id'] = 'substituted-unverified-game'
for values in rows.values():
    values[0]['game_id'] = metadata[0]['game_id']
validate()
probes['caller_bound_substituted_identity'] = {'outcome': 'accepted_as_documented_caller_limitation'}
metadata[0]['game_id'] = original
for values in rows.values():
    values[0]['game_id'] = original

metadata[0], metadata[1] = metadata[1], metadata[0]
for values in rows.values():
    values[0], values[1] = values[1], values[0]
validate()
probes['caller_bound_within_origin_reordering'] = {'outcome': 'accepted_as_documented_caller_limitation'}
metadata[0], metadata[1] = metadata[1], metadata[0]
for values in rows.values():
    values[0], values[1] = values[1], values[0]

rows['E2C', 'full'][0]['native_failure'] = 'synthetic-failure'
rejection('raw_mapped_failure_partition_mismatch', validate, 'inherited_failure_flag_mismatch')
rows['E2', 'full'][0]['native_failure'] = 'different-synthetic-reason'
rejection('full_independence_failure_partition_mismatch', validate, 'independent_full_failure_flag_mismatch')
rows['E2C', 'independent_marginals'][0]['native_failure'] = 'third-synthetic-reason'
validate()
probes['caller_bound_failure_reason_and_archive_authentication'] = {
    'outcome': 'accepted_as_documented_caller_limitation',
    'note': 'Inference checks Boolean failure partitions; caller must preserve and authenticate original reasons and every variant against archive.'}
for key in (('E2', 'full'), ('E2C', 'full'), ('E2C', 'independent_marginals')):
    rows[key][0]['native_failure'] = None

# Misalignment and invalidity must fail before any terminal inference work.
first_id = rows['E2C', 'full'][0]['game_id']
rows['E2C', 'full'][0]['game_id'] = 'misaligned'
result = unit.evaluate(config, metadata, rows, audits)
assert result['status'] == 'protocol_invalid' and result['mapping_supported'] is result['candidate_qualified'] is False
assert 'alignment' in result['reason']
assert 'scorecards' not in result and 'inference' not in result
probes['public_invalid_alignment_discards_partial_results'] = {'outcome': 'protocol_invalid', 'reason': result['reason']}
rows['E2C', 'full'][0]['game_id'] = first_id

for label, changed in (
    ('missing_audit', {key: value for key, value in audits.items() if key != 'leakage'}),
    ('extra_audit', dict(audits, unregistered=True)),
    ('false_audit', dict(audits, leakage=False)),
    ('truthy_nonbool_audit', dict(audits, leakage=1)),
):
    result = unit.evaluate(config, metadata, rows, changed)
    assert result['status'] == 'protocol_invalid' and result['reason'] == 'required_audit_failure'
    probes[label] = {'outcome': 'protocol_invalid', 'reason': result['reason']}

for name, pin in PINS.items():
    assert hash_file(ROOT / name) == pin, name
elapsed = time.monotonic() - START
rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 ** 2 if sys.platform == 'darwin' else 1024)
assert elapsed <= 120 and rss <= 4096, (elapsed, rss)
report = {
    'version': 'rf02d-inference-temporal-review.v1',
    'status': 'accepted_pure_inference_temporal_scope',
    'pins': PINS,
    'focused_synthetic_suite': {
        'command': '/opt/anaconda3/bin/python3.12 -I tests/research-score-conditional-margin/test_inference.py -v',
        'cwd': str(ROOT), 'tests': 18, 'seconds_reported': 20.067, 'exit_code': 0, 'status': 'passed',
        'evidence': 'Independently observed unified exec session 51502 completed with all 18 tests OK.'},
    'independent_synthetic_probes': probes,
    'code_review_findings': {
        'exact_counts': 'Public evaluate requires 3407 unique common games, exact per-year counts, 226 origins, configured 20 mapped/6 raw series, and aligned row ordering. These counts imply development3135/exposed272.',
        'development_isolation': 'evaluate filters metadata and metrics before _infer and development aggregate; development effect, secondary, calibration, season and LOSO checks exclude 2025.',
        'exposed_2025': 'Separate scorecards and two prescribed stability point checks use 2025. This is exposed diagnostic history, not an unseen holdout.',
        'failure_population': 'Inherited rates retain all3407 issued games; candidate gates include all20 mapped plus raw N0/E2 full/24h. E1/S1 rates are reported without added vetoes.',
        'failure_consistency': 'N0/N0C failures invalidate; raw/mapped N0/E2 full/24h and mapped full/independent Boolean failure partitions must match. Archive identity, original reasons and other variant provenance remain caller obligations.',
        'invalidity': 'evaluate catches invalid schema/population/audits/numerical output and returns protocol_invalid with false decision booleans, never partial success or nonfinite marker serialization.',
    },
    'required_integrated_caller_checks': [
        'Reconstruct exact original game IDs, origins, weekly cardinalities and within-origin target ordering from the pinned parent archive; compare complete metadata and all26 scored series.',
        'Authenticate original observed targets, every mapped source/failure/fallback record and raw reference; Boolean consistency alone does not authenticate archive rows or failure reasons.',
        'Bind admission/leakage/falsification/no-new-failure evidence to this immutable run; four literal true audit flags are explicit assertions, not cryptographic proof.',
        'Use public evaluate after forecast publication/grading and complete preflight; private helpers intentionally permit explicit synthetic populations and are not production entry points.',
        'Authenticate annual scalars, prior-only cases and source recipes separately; inference cannot establish outcome-free forecast construction or temporal availability from scored rows.',
    ],
    'blockers_in_declared_pure_inference_scope': [],
    'not_accepted': ['integrated historical caller', 'full historical runner', 'historical execution', 'statistical review outside temporal scope', 'predictive improvement', 'production promotion'],
    'scope': {'historical_inputs_read': 0, 'historical_distributions_recovered': 0, 'historical_metric_calls': 0,
              'historical_scalar_fits': 0, 'historical_data_evaluations': 0, 'source_edits': 0},
    'probe_resources': {'seconds': elapsed, 'peak_rss_mib': rss, 'limit_seconds': 120, 'limit_rss_mib': 4096},
    'probe_script_sha256': hash_file(Path(__file__)),
}
payload = (json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + '\n').encode()
path = OUT / 'temporal-review.json'
with path.open('xb') as stream:
    stream.write(payload)
print(json.dumps({'path': str(path), 'sha256': hashlib.sha256(payload).hexdigest(), 'bytes': len(payload),
                  'status': report['status'], 'probe_seconds': elapsed, 'peak_rss_mib': rss}))
