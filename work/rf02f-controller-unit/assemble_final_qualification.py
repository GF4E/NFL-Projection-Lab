"""Compose retained, inspected qualification evidence; never run historical work."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work')
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('final_preflight', ROOT/'scripts/research_score_split_preflight.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

def read(path):
    return p.parse(Path(path).read_bytes())

def pointer(path):
    path = Path(path)
    raw = p._file(path, lambda: None)
    return {'path': str(path), 'sha256': p.digest(raw), 'bytes': len(raw)}

pins = read(HERE/'controller-final-pins-20260905.json')
code = pins['code_hashes']
assert set(code) == set(p.CODE_FILES) and len(code) == 66
assert all(p.digest((ROOT/name).read_bytes()) == sha for name, sha in code.items())
assert all(code[name] == sha for name, sha in p.FROZEN_CODE_HASHES.items())
assert p.actual_runtime() == p.RUNTIME
for stage in p.STAGES.values():
    raw = p._file(ROOT/stage['path'], lambda: None, expected_sha=stage['sha256'])
    value = p.parse(raw)
    assert value['status'] == stage['status']
    p._stage_evidence(value, ROOT, lambda: None)

chron_dir = HERE/'chronology-attempt-1788623272783750000'
chron = read(chron_dir/'result.json')
assert chron['status'] == 'passed' and chron['actual_scientific_calls'] == dict.fromkeys(
    ('bootstrap', 'cdf_calls', 'evaluate', 'fits', 'historical_admission', 'scores'), 0)
assert p.digest((HERE/'chronology-qualification.py').read_bytes()) == chron['script_sha256']
for name, sha in chron['source_hashes'].items():
    assert p.digest((ROOT/name).read_bytes()) == sha
for name, expected in chron['evidence'].items():
    got = pointer(chron_dir/name)
    assert got['sha256'] == expected['sha256'] and got['bytes'] == expected['bytes']
assert [(s['completed_origins'], s['games']) for s in chron['scenarios']] == [(277, 4175), (53, 800)]
controller = read(HERE/'saved-input-smoke-attempt-1.json')
assert controller['status'] == 'passed'
assert all(code[n] == sha for n, sha in controller['pins'].items())
assert 'Ran 24 tests' in (HERE/'saved-input-smoke-attempt-1.log').read_text()
grader = read(HERE/'final-current-grader.json')
assert grader['status'] == 'passed' and grader['tests'] == {'run': 13, 'passed': 13}
assert grader['code_hashes'] == code
preflight = read(WORK/'rf02f-preflight-unit/author-qualification-1788620452017297000.json')
assert preflight['status'] == 'passed' and preflight['tests'] == 13
assert all(code[n] == sha for n, sha in preflight['source_hashes'].items())
phase = read(HERE/'root-watchdog-integration-review-current-cli.json')
assert phase['status'] == 'accepted' and len(phase['results']) == 6

# These author-generated reports are inputs, not independent final approvals.
cli_path, applicability_path = map(Path, sys.argv[1:3])
cli = read(cli_path)
applicability = read(applicability_path)
assert cli['status'] == 'passed_current_cli_failure_route_only'
assert cli['model_namespaces_created'] == 0 and cli['new_observer_reentry_refused'] is True
assert cli['source_hashes_unchanged'] is True and cli['historical_admission_fit_score_bootstrap_calls'] == 0
assert all(code[str(Path(name).relative_to(ROOT))] == sha for name, sha in cli['pins'].items())
assert applicability['status'] == 'applicable_with_explicit_replacement_evidence'
assert applicability['six_phase_transfer']['status'] == 'exact_class_source_bytes_proven'
assert applicability['six_phase_transfer']['class_source_sha256'] == phase['controller_class_source_sha256']
assert applicability['current_controller']['sha256'] == code['scripts/research_score_split_controller.py']

paths = [Path(__file__).resolve(), HERE/'controller-final-pins-20260905.json',
    HERE/'run_controller_tests.py', HERE/'saved-input-smoke-attempt-1.json',
    HERE/'saved-input-smoke-attempt-1.log', HERE/'final-current-grader.json',
    HERE/'final-current-grader.log', HERE/'chronology-qualification.py', chron_dir/'result.json',
    HERE/'root-watchdog-integration-review-current-cli.json',
    HERE/'numerical/controller-wiring-review.json', HERE/'numerical/chronology-evidence-review.json',
    WORK/'rf02f-grade-unit/author-qualification-final.json',
    WORK/'rf02f-grade-unit/independent-numerical-review.json',
    WORK/'rf02f-preflight-unit/author-qualification-1788620452017297000.json',
    WORK/'rf02f-preflight-unit/numerical/preflight-review.json', cli_path, applicability_path]
paths += [chron_dir/name for name in chron['evidence']]
paths += [ROOT/stage['path'] for stage in p.STAGES.values()]
paths += [WORK/'rf02f-inference-unit/full-943105d923d2043d'/name for name in (
    'qualification.json', 'fixture-manifest.json', 'evaluation.json', 'mean-mapper-scorer-bridge.json')]
paths += [WORK/'rf02f-inference-unit/full-943105d923d2043d-process.json']
paths += [Path(item['path']) for item in applicability['six_phase_transfer']['process_reports']]
paths += [Path(applicability['script']['path']), Path(cli['process_report']['path']), Path(cli['phase']['path'])]
evidence = [pointer(path) for path in dict.fromkeys(paths)]
value = {
    'version': 'rf02f.controller-qualification.v1', 'status': 'passed',
    'scope': p.REVIEW_SCOPE, 'code_hashes': code,
    'protocol_sha256': p.PROTOCOL_SHA, 'config_sha256': p.CONFIG_SHA,
    'runtime': p.RUNTIME, 'historical_execution': False,
    'tests': {'run': 58, 'passed': 58}, 'evidence': evidence,
    'qualification_method': 'composite_real_interface_scientific_and_explicit_routing_qualification',
    'test_count_basis': {'current_controller_cases': 24, 'current_real_grader_interface_cases': 13,
        'unchanged_preflight_cases': 13, 'unchanged_ControllerEnvelope_actual_subprocess_cases': 6,
        'actual_controller_loop_dispatch_scenarios': 2},
    'additional_checks_not_counted_twice': ['Current actual CLI missing-receipt and observer reentry probes.',
        'Independent component reruns and corruption probes.',
        'Nine fixed prerequisite acceptances, including the retained complete real scoring/public-inference integration.'],
    'coverage': [
        'The accepted real full synthetic fixture covers all 64,733 rows, 226 origins, 3,407 games, 19 series, 18 contrasts, eight calibration cells, three 10,000-member bootstraps, scorecards and actual-ID PIT. Its scorer generation, JSON reload and public evaluate are real. It is retained unchanged and was not rerun for this composite receipt.',
        'Current tiny real archive -> forecast reader -> mean/bank -> law assembler -> saved publication/lineage -> grader labels -> actual scorer/mass -> strict durable JSON handoffs pass 13 cases under all current source pins. Year lifetime, fallback, source copying, failures and directory durability are exercised.',
        'Current controller 24 tests cover publication ownership, state and plans, actual archive grading, atomic terminal paths and complete saved 19-by-3,407 public input routing. The large saved-input routing fixture uses conspicuous NON-METRIC sentinels; it is never passed to public evaluate or claimed as scientific scoring.',
        'The actual controller loop routes all 277 synthetic origins and logical 98,469 inner/64,733 outer rows. The distinct stop scenario ends at 53 origins with 224 unstarted. Real Store and OriginAccounting retain events, failed callback accounting and reentry refusal. Source, selector, bank, assembler, publication and grader are explicit spies in these two routing scenarios.',
        'Frozen real archive and strict selector unit evidence separately qualifies prior-only data access, source receipt order, publication-before-label access and selection/fallback boundaries. Routing spies do not replace that evidence.',
        'Actual owned watchdog/ControllerEnvelope subprocess probes qualify success, ordinary failure, interrupts and shorter deadlines on byte-identical class source. Current CLI failure/reentry probes qualify the current launch route. Fixed runtime/watchdog acceptances supply hard limits, signal ownership and atomic stop evidence.',
        'Final public preflight verifies exact 66-file source membership, all 60 frozen dependencies, fixed runtime/protocol/config, nine stage acceptances, strict evidence pointers and distinct review binding. Its synthetic tests include serializer and rehashed null-pointer rejection.'
    ],
    'costs': {'current_controller': {'seconds': controller['external_seconds'], 'peak_rss_mib': controller['waited_worker_peak_rss_mib']},
        'current_grader': {'seconds': grader['external_seconds'], 'peak_rss_mib': grader['peak_rss_mib']},
        'chronology': {'seconds': chron['elapsed_seconds'], 'peak_rss_mib': chron['peak_rss_mib']},
        'note': 'Component reports retain their full setup/run/validation costs and earlier failed attempts. Routing timing is not a historical cost estimate; no aggregate speedup is claimed.'},
    'limitations': [
        'This is complete composed qualification, not a claim that one end-to-end 277-origin synthetic run executed every scientific component simultaneously.',
        'No production archive admission, historical split-rate fit/score, prospective observation, model improvement or external five-percent comparison occurred.',
        'The real full retained-fixture in-run capacity smoke and actual 53-origin cost pilot remain mandatory within the sole historical invocation. Neither is replaced by these routing probes.',
        'Older component reports keep their actual old whole-file pins. Current grader rerun, current CLI rerun and byte-proven class applicability establish the exercised current boundaries; no old pin is relabelled.',
        'Separate final numerical and temporal review and a current root phase gate are still required before the historical invocation; this receipt is not that authorization.'
    ]
}
p._evidence_result(value, code, p.RUNTIME, p.PROTOCOL_SHA, p.CONFIG_SHA)
for item in evidence:
    p._pointer(item, ROOT, lambda: None)
out = HERE/'complete-controller-qualification.v1.json'
with out.open('xb') as stream:
    stream.write(p.encoded(value))
print(json.dumps(pointer(out)))
