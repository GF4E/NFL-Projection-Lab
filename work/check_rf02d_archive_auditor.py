"""Independent synthetic files exercise the read-only integrity auditor."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile

WORK = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('rf02d_archive_auditor', WORK / 'verify_rf02d_archive.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def raw(value):
    return json.dumps(value, sort_keys=True, allow_nan=False).encode()


def pin(body):
    return {'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)}


def rejects(operation):
    try:
        operation()
    except (ValueError, OSError):
        return
    raise AssertionError('Expected rejection')


with tempfile.TemporaryDirectory(prefix='rf02d-auditor-synthetic-', dir=WORK) as directory:
    base = Path(directory)
    audit.REPOSITORY = base / 'repo'
    (audit.REPOSITORY / 'scripts').mkdir(parents=True)
    audit.OUTPUT_PARENT = base / 'runs'
    audit.OUTPUT_PARENT.mkdir()
    sources = {}
    for i in range(43):
        name = f'scripts/research_score_fixture_{i:02}.py'
        body = f'# synthetic source {i}\n'.encode()
        (audit.REPOSITORY / name).write_bytes(body)
        sources[name] = pin(body)['sha256']
    manifest = raw({'code_hashes': sources})
    manifest_hash = pin(manifest)['sha256']
    run = audit.OUTPUT_PARENT / ('rf02d-v1-' + manifest_hash[:16])
    run.mkdir()
    (run / 'manifest.json').write_bytes(manifest)
    rejects(lambda: audit.verify(run, manifest_hash))
    completion = run / 'completion'
    completion.mkdir()
    terminal = raw({'status': 'protocol_invalid'})
    (completion / 'terminal.json').write_bytes(terminal)
    index = {'files': {'manifest.json': pin(manifest), 'completion/terminal.json': pin(terminal)},
             'uncommitted_staging': [], 'uncommitted_artifacts': []}
    (completion / 'artifact-index.json').write_bytes(raw(index))
    result = audit.verify(run, manifest_hash)
    assert result['status'] == 'passed_integrity_only' and result['current_source_pins_verified'] == 43
    assert result['scientific_acceptance_established'] is False
    (completion / 'terminal.json').write_bytes(terminal + b' ')
    rejects(lambda: audit.verify(run, manifest_hash))
    (completion / 'terminal.json').write_bytes(terminal)
    (run / 'unindexed.json').write_text('{}')
    rejects(lambda: audit.verify(run, manifest_hash))
    (run / 'unindexed.json').unlink()
    source = audit.REPOSITORY / 'scripts/research_score_fixture_00.py'
    original = source.read_bytes()
    source.write_bytes(original + b'# changed\n')
    rejects(lambda: audit.verify(run, manifest_hash))
    source.write_bytes(original)
    backing = source.with_suffix('.backup')
    source.rename(backing)
    source.symlink_to(backing)
    rejects(lambda: audit.verify(run, manifest_hash))
    source.unlink()
    backing.rename(source)
    rejects(lambda: audit.parse(b'{"files":{},"files":{}}'))
    rejects(lambda: audit.parse(b'{"value":NaN}'))
    rejects(lambda: audit.verify(run, '0' * 64))
    final = audit.verify(run, manifest_hash)
    assert final['indexed_files'] == 2
    partial = b'{incomplete publication'
    (run / 'failed-forecast.json').write_bytes(partial)
    index['files']['failed-forecast.json'] = pin(partial)
    index['uncommitted_artifacts'] = ['failed-forecast.json']
    staging_name = '.completion-staging-' + 'a' * 16
    staging = run / staging_name
    staging.mkdir()
    staged_terminal = raw({'status': 'research_candidate_qualified_not_promoted'})
    (staging / 'terminal.json').write_bytes(staged_terminal)
    (staging / 'artifact-index.json').write_bytes(b'{}')
    index['files'][staging_name + '/terminal.json'] = pin(staged_terminal)
    index['files'][staging_name + '/artifact-index.json'] = pin(b'{}')
    index['uncommitted_staging'] = [staging_name]
    (completion / 'artifact-index.json').write_bytes(raw(index))
    retained = audit.verify(run, manifest_hash)
    assert retained['indexed_files'] == 5 and retained['terminal_reported_status'] == 'protocol_invalid'
    assert retained['authoritative_terminal'] == 'completion/terminal.json'
    (staging / 'extra.json').write_bytes(b'{}')
    rejects(lambda: audit.verify(run, manifest_hash))
    (staging / 'extra.json').unlink()
    index['files']['completion/terminal.json'] = pin(staged_terminal)
    (completion / 'terminal.json').write_bytes(staged_terminal)
    (completion / 'artifact-index.json').write_bytes(raw(index))
    rejects(lambda: audit.verify(run, manifest_hash))

report = {'version': 'rf02d-integrity-auditor-synthetic-check.v1', 'status': 'passed',
          'checks': ['complete immutable fixture', 'missing completion', 'corrupt terminal bytes',
                     'unindexed artifact', 'changed source', 'symlink source',
                     'duplicate JSON key', 'nonfinite JSON constant', 'wrong expected manifest',
                     'declared partial artifact and staged terminal are evidence only',
                     'unindexed staging child', 'success forbidden with uncommitted prefix'],
          'historical_archives_read': 0, 'runner_executions': 0,
          'limitation': 'Synthetic integrity format only; no scientific or historical result acceptance.'}
print(json.dumps(report, indent=2))
