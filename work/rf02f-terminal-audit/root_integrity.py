"""Read-only terminal artifact authentication. No numerical model execution."""
from pathlib import Path
import hashlib
import json
import resource
import signal
import time

START = time.monotonic()
signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('root_audit_120_seconds')))
signal.setitimer(signal.ITIMER_REAL, 120)
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path(__file__).resolve().parent
RUN = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02f-v1-7b400dec97ab30c1')
OBS = ROOT/'work/rf02f-observer-c8bfb96705884106'

def pointer(path):
    sha = hashlib.sha256()
    size = 0
    with path.open('rb') as stream:
        while chunk := stream.read(1048576):
            sha.update(chunk)
            size += len(chunk)
    return {'path': str(path), 'sha256': sha.hexdigest(), 'bytes': size}

def load(path):
    return json.loads(path.read_text())

index = load(RUN/'completion/artifact-index.json')
terminal = load(RUN/'completion/terminal.json')
manifest = load(RUN/'manifest.json')
process = load(OBS/'process-report.json')
assert pointer(RUN/'manifest.json')['sha256'] == terminal['manifest_sha256'] == '7b400dec97ab30c11928463696ed4f86b8ca496646998f4e15812c0cfd8e381e'
assert not index['uncommitted_artifacts'] and not index['uncommitted_staging']
actual = {str(path.relative_to(RUN)) for path in RUN.rglob('*') if path.is_file()}
assert set(index['files']) == actual - {'completion/artifact-index.json'}
assert {path.name for path in (RUN/'completion').iterdir()} == {'artifact-index.json', 'terminal.json'}
size = 0
for name, expected in index['files'].items():
    path = RUN/name
    assert not path.is_symlink() and path.is_file()
    got = pointer(path)
    assert got['bytes'] == expected['bytes'] and got['sha256'] == expected['sha256']
    size += got['bytes']
for name, sha in manifest['code_hashes'].items():
    assert pointer(ROOT/name)['sha256'] == sha
for name, expected in process['artifacts'].items():
    got = pointer(OBS/name)
    assert got['bytes'] == expected['bytes'] and got['sha256'] == expected['sha256']
origins = sorted(RUN.glob('origin-evidence-*.json'))
assert len(origins) == terminal['completed_origins'] == 53
assert origins[-1].name == 'origin-evidence-2013-02.json'
assert terminal['status'] == 'protocol_invalid' and terminal['reason'] == 'registered_pilot_cost_screen_failed'
assert process['exit_code'] == 1 and process['status'] == 'failed_process'
assert not process['kill_requests'] and not process['limit_failure'] and not process['observation_errors']
assert not (RUN/'evaluation.json').exists() and not (RUN/'origin-index.json').exists()
assert len(list(RUN.parent.glob('rf02f-v1-*'))) == 1
pilot = load(RUN/'pilot.json')['projection']
smoke = load(RUN/'smoke.json')
report = {
    'version': 'rf02f.root-terminal-integrity.v1',
    'status': 'passed_integrity_only_pending_independent_terminal_reviews',
    'run_directory': str(RUN), 'indexed_files': len(index['files']), 'indexed_bytes': size,
    'manifest': pointer(RUN/'manifest.json'),
    'completion_files': [pointer(RUN/'completion'/n) for n in ('artifact-index.json', 'terminal.json')],
    'process_report': pointer(OBS/'process-report.json'),
    'source_files_unchanged': len(manifest['code_hashes']),
    'actual_completed_origins': len(origins), 'last_origin': [2013, 2],
    'uncommitted_artifacts': [], 'uncommitted_staging': [], 'only_model_namespace': True,
    'terminal_status': terminal['status'], 'terminal_reason': terminal['reason'],
    'counts': terminal['counts'], 'scientific_failed_callbacks': pilot['failed_callback_count'],
    'pilot_projection_seconds': pilot['projected_total_seconds'], 'registered_limit_seconds': 7200,
    'process_seconds': process['elapsed_seconds'], 'process_peak_rss_mib': process['waited_worker_peak_rss_mib'],
    'actual_admission_seconds': pilot['admission_seconds'], 'complete_smoke_seconds': smoke['complete_smoke_seconds'],
    'public_smoke_evaluator_seconds': smoke['public_evaluator_seconds'],
    'no_full_historical_evaluation': True, 'new_scientific_calls': 0, 'automatic_restart': False,
    'prior_read_only_attempt': {
        'status': 'failed_audit_schema_assumption', 'error': 'AssertionError',
        'reason': 'Initial inline audit compared index membership to top-level files only. The index also correctly includes completion/terminal.json. The corrected audit compares recursive files except the index itself.',
        'research_artifact_or_source_changed': False, 'scientific_invocation': False
    },
    'seconds': time.monotonic()-START,
    'peak_rss_mib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1048576,
    'script': pointer(Path(__file__).resolve())
}
assert report['seconds'] < 120 and report['peak_rss_mib'] < 1024
out = WORK/'root-integrity-review.json'
with out.open('x') as stream:
    json.dump(report, stream, indent=2)
    stream.write('\n')
print(json.dumps({k:report[k] for k in ('status','indexed_files','indexed_bytes','seconds','peak_rss_mib')}))
print(json.dumps(pointer(out)))
