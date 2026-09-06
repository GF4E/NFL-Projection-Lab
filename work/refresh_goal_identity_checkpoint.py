from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json

repo = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
workspace = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
planning = repo / '.planning/engine-os'
evidence = workspace / 'work/rf02d-identity-qualification-v1'
changes = {}

def read(path):
    if path not in changes:
        changes[path] = path.read_text()
    return changes[path]

def paragraph(path, prefix, replacement):
    parts = read(path).split('\n\n')
    hits = [i for i, value in enumerate(parts) if value.startswith(prefix)]
    assert len(hits) == 1, (path, prefix, hits)
    parts[hits[0]] = replacement
    changes[path] = '\n\n'.join(parts)

def line(path, prefix, replacement):
    parts = read(path).splitlines()
    hits = [i for i, value in enumerate(parts) if value.startswith(prefix)]
    assert len(hits) == 1, (path, prefix, hits)
    parts[hits[0]] = replacement
    changes[path] = '\n'.join(parts) + '\n'

def new(path, text):
    assert not path.exists(), path
    changes[path] = text

pins = {
    'receipt.json': 'c6d979fc299301ade2a0695c9ebc440cb2bf779b68cf043c3e05578ac0d0fecb',
    'manifest.json': 'fc1e6a271ee2b8b2bcc8e68c8469f528b6c6dc4ec18857cdc8426a2f2e649fa4',
    'numerical-review.json': 'f326654b8d5bed738a9ab0bb653d0d2e9983e943a1f30b4ec32082108a65d194',
    'temporal-review.json': 'dcabbff5b06ca8ed7196cd1f51a7de87f582113cd256651262f69f55e3b8eaf5',
}
for name, expected in pins.items():
    assert hashlib.sha256((evidence / name).read_bytes()).hexdigest() == expected
receipt = json.loads((evidence / 'receipt.json').read_text())
assert receipt['status'] == 'passed' and receipt['complete_count'] == 520
assert len(receipt['artifacts']) == 522
for name, pin in receipt['artifacts'].items():
    raw = (evidence / name).read_bytes()
    assert len(raw) == pin['bytes'] and hashlib.sha256(raw).hexdigest() == pin['sha256']
for i in range(520):
    row = json.loads((evidence / f'occurrence-{i:03}.json').read_text())
    assert row['occurrence'] == i
    assert row['archived_metrics_sha256'] == row['new_metrics_sha256']
    assert row['native_failure'] is None and row['archived_native_failure'] is None

acceptance = {
    'version': 'rf02d-identity-acceptance.v1',
    'created_at': datetime.now(timezone.utc).isoformat(),
    'status': 'accepted_fixed_identity_qualification_only',
    'evidence': {name: {'path': str(evidence / name), 'sha256': sha} for name, sha in pins.items()},
    'implementation_acceptance_sha256': '5c71c108ada35997383f1a1d4ed8b5bfc0716576cad503fb6f2b1b3f63b16639',
    'root_verified_indexed_artifacts': 522,
    'exact_identity_occurrences': 520,
    'sample_keys_sha256': receipt['sample_sha256'],
    'qualification_seconds': receipt['seconds'],
    'qualification_peak_rss_mib': receipt['peak_rss_mib'],
    'accepted_combined_synthetic_tests': 100,
    'independent_numerical_scope': 'All 520 distributions/descriptors and archived metric digests checked; fixed 52-case subset freshly rescored with the original uncached scorer.',
    'independent_temporal_scope': 'All 522 artifacts, original ordered 520 keys and provenance checked. Mutable timestamps support the reviewed persistence path but do not prove absence of unrelated executions.',
    'historical_identity_qualification_accepted': True,
    'full_historical_runner_accepted': False,
    'inference_implementation_accepted': False,
    'historical_scalar_estimates': 0,
    'calibrated_successor_forecasts': 0,
    'historical_scalar_fitting_authorized_by_this_receipt': False,
    'successor_replay_authorized_by_this_receipt': False,
    'predictive_improvement_established': False,
    'production_authorized': False,
    'native_goal_complete': False,
}
ip = planning / 'research-first/RF-02D-IDENTITY-IMPLEMENTATION-ACCEPTANCE.v1.json'
assert hashlib.sha256(ip.read_bytes()).hexdigest() == acceptance['implementation_acceptance_sha256']
new(planning / 'research-first/RF-02D-IDENTITY-ACCEPTANCE.v1.json', json.dumps(acceptance, indent=2, sort_keys=True) + '\n')
new(planning / 'research-first/RF-02D-IDENTITY-RESULT.v1.md', '''# RF-02D fixed identity qualification result

2026-09-05. Accepted for the fixed identity equivalence gate only. The one qualification completed all 520 predetermined occurrences with exact original distribution and complete archived metric equality in 9.273181 seconds and 438.203125 MiB. Root observed session 25020 exit 0 and authenticated all 522 indexed artifacts. No rerun occurred during this goal refresh.

Independent numerical review reconstructed all 520 distribution/operation records and checked archived metric digests. It freshly rescored a fixed 52-case subset using the original uncached scorer; it did not independently rescore all 520. Independent temporal review authenticated the complete ordered sample and provenance, with all native-failure flags zero. Filesystem timestamps support the reviewed write/fsync-before-scoring path but are mutable and cannot exclude unrelated executions. The source and accepted synthetic checks provide the persistence implementation evidence.

The accepted combined synthetic suite contains 100 tests. The new inference module has author-reported 18 additional passing tests (118 combined); its final independent acceptance is pending. Neither the inference implementation nor integrated full historical runner is accepted by this result.

All 234 prior-case availability closures remain verified; the 234 annual scalar receipts remain unfitted. These identity computations test equivalence at scale 1. They establish no calibrated successor prediction, predictive gain, external benchmark advantage or production qualification. Next complete independent inference review and integrated runner qualification before the single preregistered historical experiment. Preserve the 20-series, 28-comparison, 16-cell design, budgets and all original outcomes.

The exact evidence paths, hashes and scope are bound in [RF-02D-IDENTITY-ACCEPTANCE.v1.json](RF-02D-IDENTITY-ACCEPTANCE.v1.json).
''')

checkpoint = ('Numerical archive admission, the pure chronological replay bridge and fixed identity qualification are independently accepted. '
    'Admission validated 68,140 original distributions and 56,430 prior-only cases. All 520 predetermined identity comparisons matched exactly in 9.273 seconds / 438.20 MiB; scoped independent numerical and temporal audits passed. '
    'The accepted combined synthetic suite has 100 passing tests. The new inference implementation has 18 additional author-reported passing tests (118 combined), with final independent acceptance pending. '
    'Next complete independent inference review and integrated historical runner qualification before estimating historical scalars or scoring calibrated successors. '
    'All 234 prior-case availability closures are verified; the 234 annual scalar receipts remain unfitted. Keep 2025 outcomes out of calibration and preserve the frozen 20-series, 28-comparison, 16-cell design. '
    'No calibrated successor forecast, predictive acceptance or external 5% advantage is established.')

goal = planning / 'RESEARCH-GOAL.md'
paragraph(goal, 'Current execution begins', 'Current execution begins with independent inference review and integrated historical runner qualification for RF-02D. ' + checkpoint + ' Preserve predicted team means, the entire total-score law and original Poisson background. The split-gain Elo search is deferred. RF-02S repair, RF-02C results and RF-02D admission/identity checks are completed prerequisites, not experiments to repeat. After the remaining implementation gates pass, execute and independently audit the one prescribed historical experiment. Use its outcome to choose the smallest useful next preregistered Elo enhancement or comparator-admission step. Keep unmet architecture, performance, player-data, prospective and release requirements explicit.')
paragraph(goal, 'The independently accepted [historical protocol]', 'The independently accepted [historical protocol](research-first/RF-02D-HISTORICAL-PROTOCOL.v1.md) fixes 20 mapped series, 28 paired comparisons and 16 calibration cells. [Numerical admission](research-first/RF-02D-ADMISSION-RESULT.v1.md) passed in 157.03 seconds and 421.34 MiB, authenticating 1,909 indexed artifacts and validating all 68,140 selected distributions and 56,430 prior-only cases. The pure annual-receipt and outcome-free prediction bridge is accepted. [Fixed identity qualification](research-first/RF-02D-IDENTITY-RESULT.v1.md) passed all 520 comparisons exactly, with 522 indexed artifacts authenticated and scoped independent audits accepted. Numerical review freshly rescored a fixed 52-case subset with the original uncached scorer; verification of all 520 recorded metric digests is a separate check. All 234 prior-case availability closures are verified; all 234 annual scalar receipts remain unfitted. No 2025 observation entered a calibration case. The accepted suite has 100 tests; the 18 new inference tests are author evidence pending final independent acceptance. Complete inference and integrated full-runner qualification before historical scalar estimation or calibrated successor scoring. Identity equality and faster computation do not establish predictive improvement.')
changes[goal] = read(goal).rstrip() + '\n\n- **2026-09-05 identity closure and goal refresh:** The fixed qualification passed all 520 exact identity checks in 9.273 seconds / 438.20 MiB; scoped independent numerical and temporal reviews passed and root authenticated all 522 artifacts. The accepted synthetic suite now contains 100 tests. Inference implementation and 18 additional author-tested cases exist, but final independent acceptance is pending. Move the immediate milestone to inference review and integrated runner qualification; do not repeat identity qualification. Preserve 234 unfitted annual scalar receipts, no calibrated successor score, frozen historical gates and all prior negative results. The enhanced Elo foundation, regular backtesting, rigorous 5% external target, prospective confirmation and owner-feedback endpoint remain unchanged. This refresh updates the written goal and current planning records; the native objective text remains unchanged.\n'

paragraph(planning / 'PROJECT.md', 'Current work:', 'Current work: **RF-02D inference review and integrated runner qualification after accepted identity checks.** ' + checkpoint + ' RF-02C remains the independently audited `reject_all` result over 3,407 games, with no family selected. Preserve naive/SRS/classical-Elo controls, all frozen scientific rules and the 7,200-second / 4,096-MiB full-run limits. The correction preserves Elo means, the total-score law and Poisson background. The split-gain search is deferred; RF-04 player admission remains blocked. See [STATE.md](STATE.md).')
paragraph(planning / 'REQUIREMENTS.md', 'Current successor goal:', 'Current successor goal: [RESEARCH-GOAL.md](RESEARCH-GOAL.md), reflecting the owner\'s latest requirements and accepted execution evidence; the native objective text remains unchanged. ' + checkpoint + ' RF-02S numerical repair and RF-02C\'s independently audited `reject_all` backtest remain completed evidence. The enhanced Elo core, regular backtests, evolving evidence-led plan, minimum 5% external predictive advantage and owner-feedback tool endpoint remain the goal.')
line(planning / 'ROADMAP.md', '| 4C | RF-02D |', '| 4C | RF-02D | Qualify one conditional-margin mapping enhancement with frozen Elo means and total law | ADMISSION + PURE REPLAY + IDENTITY ACCEPTED: 100 accepted tests; 520 exact identity checks and scoped audits passed. New inference code has 18 additional author-tested cases, final acceptance pending. Next inference review and integrated runner qualification; 234 annual scalar receipts remain unfitted; 20/28/16 design frozen |')
line(planning / 'STATE.md', '- **Current phase:**', '- **Current phase:** RF-02D inference review and integrated historical runner qualification. Numerical admission, pure replay and fixed identity qualification are independently accepted. RF-02C remains the audited `reject_all` result over 3,407 games and 226 outer origins, completed in 3,151.10 seconds / 2,950.28 MiB. Its 1,909-file archive is verified; no model is accepted and no restart follows.')
line(planning / 'STATE.md', '- **Statistical next task:**', '- **Statistical next task:** ' + checkpoint + ' See `research-first/RF-02D-IDENTITY-ACCEPTANCE.v1.json`. The 27-setting split-gain scope remains deferred.')
line(planning / 'STATE.md', '- **Latest quality direction:**', '- **Latest quality direction:** The one distribution-only hypothesis preserves Elo states, means, total law and Poisson support. Scoped independent audits now accept numerical admission, the pure chronological bridge and the fixed identity result. Finish independent inference review and qualify the integrated caller, full-run budgets, persistence and publication-before-grading behavior before historical fitting/scoring. No predictive requirement closes through equivalence alone.')
line(planning / 'STATE.md', '  -> RF-02D [', '  -> RF-02D [ADMISSION + PURE REPLAY + IDENTITY ACCEPTED: inference review and integrated runner next; no historical scalar fit]')
line(planning / 'TASKS.md', '   **RF-02D next:**', '   **RF-02D next:** ' + checkpoint + ' Preserve means, total law and original Poisson support/tail guarantees. See `RF-02D-IDENTITY-ACCEPTANCE.v1.json`; the split-gain proposal is deferred.')

out = workspace / 'outputs/updated-goal.md'
paragraph(out, 'Advance from independently accepted', 'Advance from independently accepted RF-02D archive admission, pure chronological replay and fixed identity qualification to final inference review and integrated historical runner qualification. The accepted implementation passes 100 focused tests and all 520 fixed identity checks matched exactly, with scoped independent audits accepted. The new inference module has 18 additional author-reported passing tests; its independent final acceptance is pending. Preserve team means, the total-score law and original Poisson background. After the complete runner and inference gates pass, execute and independently audit the single preregistered experiment across 20 mapped series, 28 paired comparisons and 16 calibration cells. Keep 2025 outcomes out of calibration. Defer the separate-learning-rate search. Preserve the completed RF-02S repair, RF-02C `reject_all` result and every failed attempt. Use accepted findings to choose the smallest useful newly preregistered Elo enhancement. Keep chronological Elo strength updates central, derive coherent joint team-score forecasts, and test enhancements against classical Elo, naive/SRS controls and the prior accepted version.')
paragraph(out, 'The accepted pure units, admission implementation', 'Numerical admission validated all 68,140 selected distributions and 56,430 prior-only calibration cases in 157.03 seconds / 421.34 MiB. The fixed identity qualification then passed all 520 exact comparisons in 9.273 seconds / 438.20 MiB. Root authenticated all 522 indexed outputs and both independent audits passed within their stated scopes. Numerical review freshly rescored a fixed 52-case subset with the original uncached scorer; all 520 recorded metric digests were verified separately. The accepted combined synthetic suite has 100 tests. The 18 new inference tests are author evidence pending final independent acceptance.')
paragraph(out, 'All 234 annual prior-case', 'All 234 annual prior-case availability closures are verified, with 2025 outcomes excluded from calibration. The 234 annual scalar receipts remain unfitted. No historical correction parameter, calibrated successor forecast or calibrated successor score has been generated. The immediate goal is independent inference acceptance and complete integrated runner qualification, followed by the one frozen experiment to measure whether this correction helps.')
bf = workspace / 'outputs/backtest-findings.md'
paragraph(bf, 'The finite transformation, complete distribution adapter', checkpoint + ' Each series\' annual contraction parameter must use eligible prior-year forecasts only. The correction preserves Elo means, the complete total-score law and Poisson background. Proper-score evaluation can still reject this proposal; the variance gap is not a promised energy-score gain.')
paragraph(bf, 'A separate idea—', 'A separate idea—giving Elo strength and scoring level different learning rates—was documented and deferred. Testing both changes together would obscure which one mattered. The next step is independent inference review and integrated runner qualification under the accepted historical design, with every prior failed result preserved.')

scope = planning / 'research-first/RF-02D-RUNNER-IMPLEMENTATION-SCOPE.v1.md'
paragraph(scope, 'Use only the 3,135 development games', 'Use only the 3,135 development games for effect-size, NLL, CRPS, MAE, width and calibration inference; keep 272 exposed 2025 games separate for the prescribed point checks. Preserve inherited native-failure ceilings over all 3,407 games for the 20 mapped series and raw N0/E2 full/24h references. Report raw E1/S1 failures without adding new candidate vetoes. This clarifies the unchanged frozen gate population and membership. Generate each fixed 10,000-member block-count matrix once for lengths 1/3/6. Recompute paired gain ratios within resamples and correct jointly across 28 energy comparisons. Use those same count matrices for interval-mass residuals and a distinct simultaneous correction across all 16 calibration cells. Preserve original PIT/interval summaries and structural-unavailability checks. Do not reuse energy critical values for calibration or replace actual interval mass with nominal 0.8.')

quality_id = '2026-09-05-rf02d-identity-closure-goal-refresh'
new(planning / f'quality/{quality_id}.md', '''# RF-02D identity closure and owner-requested goal refresh

At 5,416,364 observed goal tokens, this phase gate accepts only the completed fixed identity qualification and advances to inference review and integrated runner qualification. This is progress, not a repeated failed experiment or goal completion.

Independent numerical and temporal reports are authenticated in RF-02D-IDENTITY-ACCEPTANCE.v1.json. Root reverified all 522 indexed identity artifacts, 520 exact archived/new metric digest pairs and 39 frozen source/test hashes. Numerical review freshly rescored 52 fixed cases using the original scorer; it separately checked all 520 reconstruction records and metric digests. Temporal review reconstructed the original ordered sample and documented the limits of mutable persistence timestamps. Both reviews accepted their distinct scopes. The run took 9.273181 seconds / 438.203125 MiB with zero scalar estimates and football fits.

The accepted suite has 100 tests. The author reports 18 new inference tests passing and 118 combined; exact source/test hashes were verified, but independent final inference acceptance remains pending. Review clarified the inherited all-3,407 native-failure population and registered reference membership without changing the frozen protocol. No integrated runner or historical calibration experiment started during this goal refresh.

An independent goal consistency review identified the completed identity stage and required preserving the distinction between 234 prior-case closures and 234 unfitted annual scalar receipts. The canonical written goal, project checkpoint records and user-facing summaries now reflect that boundary. Enhanced Elo remains central; regular chronological backtests, the 5% simultaneous minimum-effect external target, prospective confirmation and owner-feedback endpoint remain required. RF-02C reject_all is unchanged. No external archive is admitted and the 5% claim is not yet testable. Native objective text remains unchanged because its available tool permits status changes only.

Next finish independent inference review and integrated caller/runner qualification; then execute the single prescribed experiment only after acceptance. Preserve one combined 600-second admission/collector clock within the 7,200-second / 4,096-MiB full-run limits, all original cohorts and controls, chronological receipts and publication-before-grading checks. No replay restart, source/data capture, provider action, deployment, commit or push is authorized by this record.
''')
state_path = planning / 'quality/state.v1.json'
state = json.loads(state_path.read_text())
state['updatedAt'] = datetime.now(timezone.utc).isoformat()
decision = 'continue_inference_review_and_integrated_runner_qualification'
for key in ('lastDeepGate', 'lastProgressPulse'):
    state[key] = {'id': quality_id, 'observableGoalTokens': 5416364, 'decision': decision}
state['current']['observableGoalTokens'] = 5416364
state['current']['packageAttemptsSinceDeepGate'] = 0
state['current']['phaseBoundary'] = False
state['activePackage']['executionStatus'] = 'identity_accepted_inference_author_tests_passed_final_review_pending_runner_unqualified'
state['activePackage']['agentEvidenceQuestions'] = ['independent_final_inference_statistical_and_temporal_acceptance', 'integrated_historical_caller_and_runner_qualification']
state['recordedDueState'] = {'progressPulseDue': False, 'deepGateDue': False}
changes[state_path] = json.dumps(state, indent=2) + '\n'

# Validate every planned replacement before any write. Preserve current bytes as scratch evidence.
changes = {path: content.rstrip() + '\n' for path, content in changes.items()}
backup = workspace / 'work/goal-refresh-identity-before-v2'
assert not backup.exists()
backup.mkdir()
for i, (path, content) in enumerate(changes.items()):
    if path.exists():
        (backup / f'{i:02}-{path.name}').write_bytes(path.read_bytes())
    assert content.endswith('\n'), path
for path, content in changes.items():
    path.write_text(content)
print(json.dumps({'updated_files': [str(p) for p in changes], 'goal_complete': False, 'native_objective_text_changed': False}, indent=2))
