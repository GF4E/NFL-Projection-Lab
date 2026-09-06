"""Independent byte and timing-ledger audit only; no project imports or scoring."""
import hashlib
import json
import math
from importlib import metadata
import os
from pathlib import Path
import platform
import re
import stat
from statistics import median
import sys

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
RUN = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02c-qualification-v1-a2e7a4313ffa5cf5')
EXPECTED_MANIFEST = 'a2e7a4313ffa5cf5c96b0851485cab9f3a856a6bacae36b722e7a62ba97b4535'
EXPECTED_INDEX = '8ddfc9c0728288ee4a5f5fefbafe7ad88f8d252e639220fa7dd3d97fdf482eaa'
EXPECTED_TERMINAL = 'd06386414f0e97f5eb2e11717f831c954db68c7170dec839cf2577077f72ced8'
OUT = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work/rf02c-independent-timing-audit-result.json')

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def encode(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()

def read(path):
    path = Path(path)
    assert path.is_absolute() and '..' not in path.parts
    directory = os.open(path.anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in path.parts[1:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
    finally:
        os.close(directory)
    with os.fdopen(fd, 'rb') as stream:
        assert stat.S_ISREG(os.fstat(stream.fileno()).st_mode)
        return stream.read()

def bound(path, digest):
    assert re.fullmatch('[0-9a-f]{64}', digest)
    raw = read(path)
    assert sha(raw) == digest, str(path)
    return raw

def archive(directory, index_sha, manifest_sha):
    index_raw = bound(directory / 'artifact-index.json', index_sha)
    index = json.loads(index_raw)
    assert set(index) == {'files'}
    files = {}
    for name, value in index['files'].items():
        assert re.fullmatch('[a-z0-9][a-z0-9.-]*', name) and '..' not in name
        assert set(value) == {'sha256', 'bytes'} and type(value['bytes']) is int
        raw = bound(directory / name, value['sha256'])
        assert len(raw) == value['bytes']
        files[name] = raw
    assert sha(files['manifest.json']) == manifest_sha
    return files, {'files': len(files), 'bytes': sum(map(len, files.values())),
                   'indexSha256': index_sha, 'manifestSha256': manifest_sha}

# Authenticate every scientific input byte and the reviewed implementation before decoding ledgers.
review_raw = read(ROOT / '.planning/engine-os/research-first/RF-02C-QUALIFICATION-REVIEW.v1.json')
review = json.loads(review_raw)
assert review['result'] == 'accepted_for_one_computational_qualification'
assert review['qualificationManifestSha256'] == EXPECTED_MANIFEST
assert Path(review['qualificationDirectory']) == RUN
assert review['fullReplayAuthorized'] is False and review['automaticRestart'] is False
config_raw = bound(ROOT / 'config/research-team-score-compute.v1.json', review['bindings']['config'])
config = json.loads(config_raw)
acceptance = json.loads(bound(ROOT / '.planning/engine-os/research-first/RF-02C-ACCEPTANCE.v1.json', review['bindings']['acceptance']))
assert acceptance['result'] == 'accepted_for_implementation_only' and acceptance['implementationAuthorized'] is True
assert acceptance['configSha256'] == sha(config_raw)
bound(ROOT / config['specification']['path'], review['bindings']['specification'])
assert config['specification']['sha256'] == acceptance['protocolSha256'] == review['bindings']['specification']
for name, digest in review['codeHashes'].items():
    bound(ROOT / name, digest)
for name, digest in review['runnerHashes'].items():
    bound(ROOT / name, digest)
assert len(config['frozenSourceHashes']) == 21
for name, digest in config['frozenSourceHashes'].items():
    bound(ROOT / name, digest)
numerical_config = json.loads(bound(ROOT / config['predecessorConfig']['path'], review['bindings']['predecessorConfig']))
numerical_receipt_raw = bound(ROOT / config['predecessorImplementation']['path'], review['bindings']['predecessorImplementation'])
numerical_receipt = json.loads(numerical_receipt_raw)
assert numerical_receipt['codeHashes'] == config['frozenSourceHashes']
assert numerical_receipt['result'] == 'accepted_for_one_replay'
anchor = json.loads(read(ROOT / '.planning/engine-os/research-first/RF-02S-IMPLEMENTATION-ANCHOR.v1.json'))
assert anchor['receiptSha256'] == sha(numerical_receipt_raw)
bound(ROOT / '.planning/engine-os/research-first/RF-02S-ACCEPTANCE.v1.json', numerical_receipt['successorBindings']['acceptance'])
bound(ROOT / numerical_config['specification']['path'], numerical_receipt['successorBindings']['specification'])
assert numerical_receipt['successorBindings']['config'] == review['bindings']['predecessorConfig']
q = numerical_receipt['qualification']
old_qualification, old_qualification_summary = archive(Path(q['directory']), q['indexSha256'], q['manifestSha256'])
assert sha(old_qualification['terminal-decision.json']) == q['terminalSha256']
assert json.loads(old_qualification['terminal-decision.json'])['status'] == 'qualified'
rf01_receipt = json.loads(bound(ROOT / '.planning/engine-os/research-first/RF-01-ACCEPTANCE.v2.json', 'a9ec511e1f05935d98a9dd271a5079a4f490d3f020b31a76cbd2661146f7c11e'))
for field in ('config', 'specification', 'dataChecks', 'admittedData', 'admissionScript', 'admissionTests'):
    p = Path(rf01_receipt[field]['path'])
    bound(p if p.is_absolute() else ROOT / p, rf01_receipt[field]['sha256'])
old_files, old_summary = archive(Path(config['inputRunDirectory']), config['inputIndexSha256'], config['inputManifestSha256'])
assert old_summary['files'] == config['inputCounts']['indexedFiles']
assert old_summary['bytes'] == config['inputCounts']['indexedBytes']
files, summary = archive(RUN, EXPECTED_INDEX, EXPECTED_MANIFEST)
assert set(files) == {'manifest.json', 'terminal-decision.json', 'occurrence-ledger.json', 'timing-pass-0.json', 'timing-pass-1.json', 'timing-pass-2.json'}
assert sha(files['terminal-decision.json']) == EXPECTED_TERMINAL
manifest = json.loads(files['manifest.json'])
assert manifest['version'] == 'rf02c-qualification.v1'
assert manifest['bindings'] == review['bindings'] and manifest['codeHashes'] == review['codeHashes']
assert manifest['frozenSourceHashes'] == config['frozenSourceHashes']
assert manifest['inputManifestSha256'] == config['inputManifestSha256'] and manifest['inputIndexSha256'] == config['inputIndexSha256']
old_manifest = json.loads(old_files['manifest.json'])
assert old_manifest['code_hashes'] == config['frozenSourceHashes']
assert old_manifest['successor']['implementation_receipt_sha256'] == sha(numerical_receipt_raw)
old_terminal = json.loads(old_files['terminal-failure.json'])
assert old_terminal['status'] == 'protocol_invalid' and old_terminal['reason'] == 'pilot_projected_budget_exceeded'
runtime = manifest['runtime']
assert runtime == old_manifest['runtime'] == numerical_receipt['runtime']
assert runtime['versions']['python'] == platform.python_version() == '3.12.2' and sys.flags.isolated == 1
for name in ('numpy', 'scipy', 'pypdf'):
    package = metadata.distribution(name)
    assert metadata.version(name) == runtime['versions'][name]
    assert sha(package.read_text('METADATA').encode()) == runtime['distributionMetadata'][name]['metadataSha256']
    assert sha(package.read_text('RECORD').encode()) == runtime['distributionMetadata'][name]['recordSha256']
bound(Path(runtime['executable']), runtime['executableSha256'])
assert runtime['executable'] == sys.executable
for field in ('footballFits', 'newForecasts', 'providerRequests'):
    assert type(manifest[field]) is int and manifest[field] == 0
assert manifest['productionAuthorized'] is False

# Reconstruct every ledger occurrence independently from authenticated RF02S forecasts/losses.
expected, seen, outer = [], set(), []
for name in sorted(n for n in old_files if re.fullmatch(r'forecasts-\d{4}-\d{2}\.json', n)):
    season = int(name.split('-')[1])
    forecasts = json.loads(old_files[name])
    for scope, forecast_field, loss_prefix in (('inner', 'full_setting_forecasts', 'inner-losses-'),
                                               ('outer', 'outer_selected_forecasts', 'outer-losses-')):
        rows = forecasts[forecast_field]
        if not rows:
            assert scope == 'outer' and name.replace('forecasts-', loss_prefix) not in old_files
            continue
        losses = json.loads(old_files[name.replace('forecasts-', loss_prefix)])
        assert len(rows) == len(losses)
        identity_field = 'setting' if scope == 'inner' else 'variant'
        keys = set()
        for forecast, loss in zip(rows, losses):
            key = [forecast['family'], forecast[identity_field], forecast['game_id']]
            assert key == [loss['family'], loss[identity_field], loss['game_id']]
            assert tuple(key) not in keys
            keys.add(tuple(key))
            assert forecast['native_failure'] == loss['native_failure'] is None
            group = (season, forecast['family'], forecast.get('setting'))
            double_grid = scope == 'outer' or group not in seen
            if scope == 'inner':
                seen.add(group)
            row = {'scope': scope, 'originFile': name, 'key': key, 'gameId': forecast['game_id'],
                   'doubleGrid': double_grid, 'diagnostics': scope == 'outer', 'nativeFailure': None,
                   'metricSha256': sha(encode(loss['metrics'])), 'canonicalEqual': True}
            expected.append(row)
            if scope == 'outer':
                outer.append(row)
ledger = json.loads(files['occurrence-ledger.json'])
assert ledger == expected
counts = {'fullSettingScoredOccurrences': sum(row['scope'] == 'inner' for row in ledger),
          'outerScoredOccurrences': len(outer), 'allScoredOccurrences': len(ledger),
          'outerGames': len({row['gameId'] for row in outer}), 'outerSeries': len({tuple(row['key'][:2]) for row in outer})}
assert counts == {k: v for k, v in config['inputCounts'].items() if k not in ('indexedFiles', 'indexedBytes')}
B, C = [], []
for pair in range(3):
    timing = json.loads(files[f'timing-pass-{pair}.json'])
    assert timing['passIndex'] == pair and len(timing['occurrences']) == len(outer) == 1280
    for i, row in enumerate(timing['occurrences']):
        assert row['occurrenceIndex'] == i and row['key'] == outer[i]['key']
        assert row['order'] == (['baseline', 'candidate'] if (pair+i) % 2 == 0 else ['candidate', 'baseline'])
        assert row['canonicalEqual'] is True
        for field in ('baselineSeconds', 'candidateSeconds'):
            assert type(row[field]) is float and math.isfinite(row[field]) and row[field] > 0
    before = sum(row['baselineSeconds'] for row in timing['occurrences'])
    after = sum(row['candidateSeconds'] for row in timing['occurrences'])
    assert before == timing['baselineSeconds'] and after == timing['candidateSeconds']
    B.append(before); C.append(after)
D = min(b-c for b, c in zip(B, C))
ratios = [c/b for b, c in zip(B, C)]
ratio = median(ratios)
screen = 123.211009708 + max(0., 13.796533417003957 - D/2)*667.226243622449 + 98.47367089969339
terminal = json.loads(files['terminal-decision.json'])
eff = terminal['efficiency']
assert eff['pairedPasses'] == 3 and eff['baselineSeconds'] == B and eff['candidateSeconds'] == C
assert eff['minimumSavingsSeconds'] == D and eff['medianRatio'] == ratio and eff['screenProjectedSeconds'] == screen
assert type(eff['rssMiB']) is float and math.isfinite(eff['rssMiB']) and eff['rssMiB'] > 0
passed = all(c < b for b, c in zip(B, C)) and ratio <= .7 and screen <= 7000 and eff['rssMiB'] <= 4096
assert eff['passed'] is passed
assert terminal['status'] == ('qualified' if passed else 'qualification_failed')
assert terminal['counts'] == counts and terminal['canonicalEqualOccurrences'] == 32412
for field in ('footballFits', 'newForecasts', 'nativeFailures', 'equalityFailures'):
    assert type(terminal[field]) is int and terminal[field] == 0
assert terminal['productionAuthorized'] is False and terminal['fullReplayAuthorized'] is False
assert terminal['independentAcceptance'] == 'pending'
result = {'status': 'independently_verified_qualification_pass' if passed else 'independently_verified_qualification_failure',
          'auditor': '/root/compute_runner', 'newArchive': summary, 'oldReplayArchive': old_summary,
          'oldNumericalQualificationArchive': old_qualification_summary, 'reviewReceiptSha256': sha(review_raw),
          'terminalSha256': EXPECTED_TERMINAL, 'reviewedCodeHashes': review['codeHashes'],
          'counts': counts, 'baselineSeconds': B, 'candidateSeconds': C, 'ratios': ratios,
          'minimumSavingsSeconds': D, 'medianRatio': ratio, 'screenProjectedSeconds': screen,
          'screenMarginSeconds': 7000-screen, 'rssMiB': eff['rssMiB'], 'qualificationSeconds': terminal['seconds'],
          'baselineLastFirstRatio': B[-1]/B[0], 'candidateLastFirstRatio': C[-1]/C[0],
          'scoreCallsInAudit': 0, 'footballFitsInAudit': 0, 'timingPassesInAudit': 0,
          'notes': ['All 32412 ledger entries exactly match independently reconstructed authenticated archive keys, flags, failures and metric hashes.',
                    'All three timing passes preserve 1280 outer records, parity order, exact positive finite totals and equality flags.',
                    'Absolute times increased substantially across passes; cause is not established. All timings retained and minimum absolute savings used.',
                    'This is a computational screen. The unchanged 7200-second replay pilot remains mandatory; no predictive gain is established.',
                    'No scoring was repeated. Actual equality flags rely on authenticated reviewed implementation; this audit independently checks their archived metric hashes and complete occurrence population.']}
OUT.write_bytes(encode(result))
print(encode(result).decode())
