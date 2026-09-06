"""Freeze reviewed COMP09 results using saved metadata only; never run science."""
from pathlib import Path
import hashlib
import json

TASK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
REPO = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = TASK / 'work/rf-clock-guard'
PLAN = REPO / '.planning/engine-os/research-first'

def read(path):
    return json.loads(Path(path).read_text())

def pointer(path):
    p = Path(path)
    data = p.read_bytes()
    return dict(path=str(p), sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))

def verify(p):
    assert pointer(p['path']) == p, p['path']
    return p

def write_new(path, value):
    data = json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n'
    with Path(path).open('x') as f:
        f.write(data)

root = read(WORK / 'actual-root-integrity.v1.json')
num = read(WORK / 'actual-numerical-review.v1.json')
temporal = read(WORK / 'actual-temporal-review.v1.json')
expected = {
    'actual-root-integrity.v1.json': '62ccd9f795ec2ce82c72d79a33640586889ced6adf213f3252dd8d0910b02b69',
    'actual-numerical-review.v1.json': '8c03b42c526a8a84b0eb6ca40f6da5c77f756b3c2751d1313ad62238ba9f174f',
    'actual-temporal-review.v1.json': '52614e47c4e22d3f46c10bbd0d841008bfc319f46f43349f6c06f126923cbbef',
}
for name, sha in expected.items():
    assert pointer(WORK / name)['sha256'] == sha
assert num['status'] == 'accepted_retrospective_reject_all' and not num['blockers']
assert temporal['status'] == 'accepted_complete_retained_temporal_evidence' and not temporal['blockers']
assert root['actual_tool_exit_code'] == 0 and root['actual_tool_session'] == 34188
assert root['completed_origins'] == temporal['completed_origins'] == num['complete_population']['origins'] == 277
assert root['reported_result'] == num['terminal_status'] == temporal['reported_scientific_status'] == 'reject_all'
assert not num['full_inference']['candidate_qualified']
assert not num['full_inference']['mechanism_supported']
seen = set()
for p in num['evidence'] + temporal['evidence']:
    if p['path'] not in seen:
        verify(p)
        seen.add(p['path'])
for name in ['manifest', 'terminal', 'index', 'observer', 'evaluation']:
    verify(root[name])

record = {
    'version': 'rfcomp09.terminal-acceptance.v1',
    'status': 'accepted_complete_retrospective_reject_all',
    'run_identity': 'rfcomp09-v1-d78471e3d2ffdb18',
    'manifest': root['manifest'], 'terminal': root['terminal'],
    'artifact_index': root['index'], 'evaluation': root['evaluation'],
    'observer': root['observer'],
    'prefit_acceptance': pointer(PLAN / 'RF-COMP-09-PREFIT-ACCEPTANCE.v1.json'),
    'protocol': pointer(PLAN / 'RF-COMP-09-CLOCK-PROTOCOL.v1.md'),
    'root_integrity': pointer(WORK / 'actual-root-integrity.v1.json'),
    'independent_reviews': {
        'numerical': pointer(WORK / 'actual-numerical-review.v1.json'),
        'temporal': pointer(WORK / 'actual-temporal-review.v1.json'),
    },
    'observed_process': {k: root[k] for k in ['actual_tool_session', 'actual_tool_exit_code', 'worker_seconds', 'observer_seconds', 'worker_peak_rss_mib', 'public_inference_seconds']},
    'retained_archive': {k: root[k] for k in ['exact_membership', 'indexed_files', 'indexed_bytes', 'physical_files', 'physical_bytes']},
    'population': num['complete_population'],
    'pilot': num['registered_pilot'],
    'decision': {
        'run_status_remains': 'reject_all',
        'candidate_qualified': False,
        'mechanism_supported': False,
        'predictive_model_accepted': False,
        'candidate_disposition': 'retire_split_rate_E3_candidate_preserve_all_research_evidence',
        'computational_disposition': 'retain_qualified_serialized_clock_guard',
        'next_action': 'RF-03_negative_team_result_freeze_then_existing_RF-04_admission_boundary_review',
        'historical_invocation_permission': 'spent_closed_no_restart',
        'new_experiment_authorized_by_this_receipt': False,
        'external_five_percent_established': False,
        'prospective_evidence': False,
        'production_authorized': False,
        'goal_complete': False,
    },
    'full_inference': num['full_inference'],
    'key_contrasts_fraction_units': num['key_contrasts_fraction_units'],
    'key_calibration_fraction_units': num['key_calibration_fraction_units'],
    'decision_changing_findings': num['decision_changing_findings'],
    'audit_limits': num['limits'] + temporal['limitations'],
    'source_runtime_integrity': {'current_sources': 91, 'runtime_files': 7, 'unchanged_scientific_protocols_and_inputs': True},
}
acceptance = PLAN / 'RF-COMP-09-TERMINAL-ACCEPTANCE.v1.json'
write_new(acceptance, record)

result = '''# RF-COMP-09 completed result

The corrected replay completed all **277 origins and 3,407 outer games** and is independently accepted as **`reject_all`**. The split-rate E3 candidate is retired. Retain the qualified timer correction; it removed the reproduced nested-check failure without changing scientific inputs, forecasts, losses, or thresholds.

Development results cover 3,135 games from 2013–2024; all 272 games in 2025 remain exposed retrospective evidence. E3 reduced mean joint energy score by **0.137154% versus E2** and **0.724569% versus naive N0**. Both miss the registered 1% research threshold. All three corrected E2 intervals include zero; N0 intervals for block lengths 3 and 6 also include zero. Only five of twelve development seasons improve versus E2, and exposed 2025 worsens by **0.300065%**. Required defense and scoring-level removal comparisons fail to establish mechanism support.

Calibration also fails. The full margin 80% interval has a **+3.766 percentage-point actual-mass coverage residual**, with a block-6 simultaneous interval of **+1.235 to +6.298 points**. Home, away and margin nominal interval gates fail at both availability settings. No enhanced Elo predictive model is accepted.

The actual worker took **1,705.954 seconds (28.43 minutes)** and peaked at **1,769.047 MiB**. Its unchanged cost pilot projected 8,429.742 seconds within the approved 9,000-second / 4-GiB envelope. The owned observer closed exit 0 with no resource failure or kill. These timings describe this run; they do not prove a causal speedup against older runs or revise the conservative budget rule.

Root authenticated all 2,655 indexed files and exact 2,656-file physical membership. Independent numerical review checked all 163,202 saved rows, 62,065 copied parent metrics, saved evaluator input bindings and every registered decision Boolean. Independent temporal review checked all 277 origin records and 13 prior-only annual selections, exposed-2025 isolation and process closure. All 91 source and seven runtime pins remain current. Reviewers reused authenticated fits and statistical resamples; no scientific rerun occurred during auditing. Their reports disclose scope and prior component/test authorship.

**Decision:** freeze this negative team result under RF-03, then revisit the existing RF-04 data-admission boundary. Do not search more settings to force a pass, restart a closed identity, feed a rejected team component into player training, or promote retrospective results. The external 5% goal remains untested because no eligible external archive is admitted. Prospective and tested-product requirements remain open.

[Terminal acceptance](RF-COMP-09-TERMINAL-ACCEPTANCE.v1.json) · [Frozen corrective protocol](RF-COMP-09-CLOCK-PROTOCOL.v1.md)
'''
result_path = PLAN / 'RF-COMP-09-RESULT.v1.md'
with result_path.open('x') as f:
    f.write(result)

execution_path = PLAN / 'RF-COMP-09-EXECUTION.v1.json'
execution = read(execution_path)
execution.update(status='closed_accepted_retrospective_reject_all', actual_tool_exit_code=0,
    historical_invocation_permission='spent_closed_no_restart',
    actual_result_acceptance=pointer(acceptance),
    terminal=root['terminal'], observer=root['observer'])
execution['latest_verified_progress'] = dict(completed_origin_evidence_files=277,
    last_completed_origin='2025-18', observed_elapsed_seconds=root['worker_seconds'],
    prior_failure_origin_passed=True, full_result_acceptance=True,
    predictive_model_accepted=False, result='reject_all')
execution_path.write_text(json.dumps(execution, indent=2, allow_nan=False) + '\n')
print(json.dumps({'acceptance': pointer(acceptance), 'result': pointer(result_path), 'reviewed_evidence_pointers_verified': len(seen), 'science_rerun': False}))
