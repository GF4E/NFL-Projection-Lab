# Projection change log

## 2026-09-13 — In-season learning loop registered

Operational release; no input, ridge setting or weight changed. Tuesday refits inherit the deployed v3 calibration-only model and retain its original lineage. Method proposals begin after a completed week with supported diagnostics or edit evidence. Week 1 has no as-issued grades yet; no improvement proposal or promotion is justified.

| Setting | Before | After |
|---|---|---|
| Selected groups | calibration | calibration |
| Ridge penalty | 10 | 10 |
| Decay | none | none |
| Historical / frozen game records | issuing version | issuing version |
| Automatic refit | absent | Tuesday 06:00 Pacific, after complete grades and PBP |

Protocol: `work/in-season-learning-v1/PLAN.md`. Historical experiments and their older gates are unchanged.

<!-- proposal-2026-1 -->
## Proposed input change · Week 1 · elo

Evidence: `work/in-season-learning-v1/proposal-evidence-41e2ab14b6baf2861d7d95c2672eb05251001125f178f96d6db4d43bdd09a01f.json`. Evaluation pending; no activation.

| Comparison | Before | After |
|---|---|---|
| OOF/current-season | Pending paired evaluation | Pending paired evaluation |

<!-- learning-2026-1 -->
## Learning proposal · Week 1 · PROMOTED
One group added: elo. Requires >=1% OOF team MAE gain, four coverage rates within 3pp of nominal, and a comparable current-season as-issued sample.
Evidence: `work/in-season-learning-v1/proposal-evidence-41e2ab14b6baf2861d7d95c2672eb05251001125f178f96d6db4d43bdd09a01f.json`

### OOF 2016–2025 (coverage 2017–2025)
| Metric | Before | After |
|---|---|---|
| games | 2639 | 2639 |
| team_points_mae | 7.713496858546301 | 7.575499060162176 |
| team_points_sigma | 9.67029067018569 | 9.51813883479201 |
| margin_mae | 10.47584167057839 | 10.241924592559998 |
| margin_sigma | 13.431101001275215 | 13.127436302311423 |
| margin_coverage_50 | 0.5279060008392782 | 0.5249685270667226 |
| margin_coverage_80 | 0.7994125052454889 | 0.809903483004616 |
| total_mae | 10.965923985748663 | 10.866720285515285 |
| total_sigma | 13.799263149447523 | 13.679107835099066 |
| total_coverage_50 | 0.4775493075954679 | 0.4813260595887537 |
| total_coverage_80 | 0.7759127150650441 | 0.7847251363827109 |
| home_bias | 0.5825176023115548 | 0.6914514256486997 |
| total_bias | -0.6552919513864914 | -0.3491017381746888 |
| favorite_bias_[-inf,3) | 0.0045903630019779535 | -0.3347477814062978 |
| favorite_bias_[3,7) | 1.3955058097331876 | 0.3643118626565387 |
| favorite_bias_[7,14) | -0.08840819826732484 | -0.41295115116002007 |
| favorite_bias_[14,inf) | None | -1.4933783669273966 |
### Current season as-issued vs retrospective candidate
| Metric | Before | After |
|---|---|---|
| games | 2 | 2 |
| team_points_mae | 7.298000659397659 | 8.465985004746909 |
| team_points_sigma | 9.25973431465076 | 10.94443557045154 |
| margin_mae | 14.596001318795318 | 16.931970009493817 |
| margin_sigma | 9.074764329626419 | 10.981907295626636 |
| margin_coverage_50 | 0.5 | 0.5 |
| margin_coverage_80 | 0.5 | 0.5 |
| total_mae | 3.2776998791941594 | 3.5141510411517523 |
| total_sigma | 2.45320623525934 | 4.96976006262434 |
| total_coverage_50 | 1 | 1 |
| total_coverage_80 | 1 | 1 |
| home_bias | 5.659150719800579 | 7.381690075186878 |
| total_bias | -3.2776998791941594 | -2.1685898591200647 |
| favorite_bias_[-inf,3) | -8.93685059899474 | -3.910513854181257 |
| favorite_bias_[3,7) | None | -15.190046014432625 |
| favorite_bias_[7,14) | None | None |
| favorite_bias_[14,inf) | None | None |

Decision receipt: `outputs/in-season-learning-v1/changes/2026-w1.json`

## 2026-09-15 — Forecast-system v2 Phase A: REJECTED, not deployed

User authorized the forecast-system architecture and Addendum 1, including 2013–2015 calibration-only OOF extension. Added isolated empirical-CRPS postprocessing, chronological loader, verification, source extension, deterministic tests and report-only rendering. Existing production artifacts and issued grades remain unchanged. Phases B–E are not started.

| Target | Raw core MAE | Postprocessed MAE |
|---|---:|---:|
| team | 7.8709 | 7.5311 |
| margin | 10.1530 | 10.1677 |
| total | 11.6488 | 10.8417 |

Gate FAIL: all ten years fail projected team SD >=4.0; annual coverage failures and negative 2024 total skill also recorded. No gain was forced by constraining b upward. Full annual gates, parameters, per-week verification, compute and BAL–IND WHY: work/projection-v2/phase-a/report.md. 279 tests pass; these do not override failed statistical gates.

## 2026-09-15 — Governance and weekly experiment queue adopted

Governance Prompt 3 supersedes architecture phase ordering/gates. The earlier Phase A result remains immutable exploratory evidence; it does not reject queued E2. E1 Week2 is the next experiment. Linear decay is the unchanged control outside the three-challenger cap; challengers are k4, k8, and state-space. No E1 comparisons have been viewed.

| Behavior | Before | After |
|---|---|---|
| Automated method promotion | Weekly group-toggle path could promote or replay promotions | Disabled; weight-only refit continues with lineage |
| Weekly compression audit | Not a canonical metric | Projected and actual team-point population SD on the same graded games |
| Release governance | Legacy automatic gate | Hashed registration/evidence, paired comparison, >=1% MAE, coverage, two reviews, unresolved leak/double-count blockers |
| Architecture Phase A failure | Closed later phases | Retained exploratory evidence; weekly queue now governs |

No method or input weight changed. E1 remains a draft until state-space fitting conventions and evidence-qualified preseason transitions are registered. Staff history is currently unseeded; unknown transitions must not be treated as unchanged. No reviewer responses invented.

## 2026-09-16 — E1 order registered; staff seed is a separate data addition

Earlier Phase A post-processing predates the queue and is exploratory evidence only, not an E2 result. E1 (early-season updating) is Week 2's single registered method change: unchanged linear control, and exactly three challengers, k=4, k=8, constrained state-space. E2 reruns as a properly registered Week 3 experiment against whatever E1 promotes (or retained linear control if E1 rejects). No E1 comparative result has been viewed at this entry.

| Item | Before | Registered treatment |
|---|---|---|
| Filter identity | Unidentified 64th direction | Sum-zero projection; 63 identified dimensions; q*C noise |
| Filter fit | Undefined | Training-only likelihood; three fixed starts; q, r, lambda only searched |
| Staff data | Empty history | 448 explicit team-season rows; 446 Week 1 QB IDs; coaching evidence unknown after PFR 403 |
| Missing transitions | Blocked | False flag, explicitly unknown, per binding A.3 |
| Method activation | Linear | Unchanged pending complete E1 gates and reviews |

Staff data addition does not activate continuity weights and is not credited as a method gain. Source, coverage, unknown rows and content hash are in work/projection-governance-v2/e1/staff-coverage.json. No PFF ingest or other data addition. Full operational definitions, hashes and limitations are frozen in e1/registration.json before comparison.
