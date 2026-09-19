## BOARD v8 — display-only book comparisons and table

The approved table replaces the score-lane base view. Existing Caesars captures are preferred, with BetMGM fallback, in a separate hashed display table at outputs/board-v8-market. No quote is injected into a projection, fit, assimilation, uncertainty distribution, or saved engine forecast. The scheduled publisher derives this table offline after captures; no additional provider requests or quota changes. Full-precision comparisons are rounded only at display. Late quotes are excluded from historical comparisons.

CONVENTIONS: work/board-v8/GAP-SWEEP.md records the pre-implementation decisions and reference resolution. Display-only book selection uses a complete pair from one book/capture. Existing frozen forecasts and experiment queue are unchanged.

Verification: 4 new export/boundary tests, 33 existing projection tests, 218 standing Week 1 tests pass. Paid credits spent: 0. Week 2 coverage: 15/16 BetMGM; IND at KC explicitly missing.

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

## 2026-09-16 — E1 rejected; linear decay retained

Hashed preregistration `a48e85241a47301ff3e462af70db6171c7c0edd750a67ac878ebe2b4411f1e62` preceded the first comparative result. All 2,639 eligible 2016–2025 games are paired across the unchanged linear control and three challengers. Candidate-specific calibration uses strictly earlier own OOF residuals. No challenger improves team MAE by the required 1%; all pass the four coverage limits. This closes E1 as rejected, not promoted. No extra E1 settings were tried after seeing the result.

| Candidate | Before: linear team MAE | After: candidate team MAE | Relative improvement | Margin 50 / 80 coverage | Total 50 / 80 coverage | Decision |
|---|---:|---:|---:|---|---|---|
| k4 | 7.571551 | 7.585842 | -0.189% | 50.28% / 79.35% | 50.59% / 79.73% | REJECT |
| k8 | 7.571551 | 7.600756 | -0.386% | 50.44% / 79.61% | 50.25% / 79.54% | REJECT |
| state_space | 7.571551 | 7.572710 | -0.015% | 50.59% / 79.46% | 50.36% / 80.03% | REJECT |

Evidence: work/projection-governance-v2/e1/report.md and verification.json. Coverage is not the failure: the primary improvement gate fails. The 95% paired improvement interval for state-space includes zero and does not approach the required gain. Coaching history remains unknown after PFR 403; false transition flags follow the binding A.3 fallback. This is evidence about the registered implementations under that limitation, not a universal rejection of state-space methods.

No live method version issued; original forecasts, grades and active fit preserved. E2 remains Week 3 and must be separately preregistered against retained linear. Earlier Phase A remains exploratory, not an E2 result. No PFF ingest or other new data work began.

Current-season comparison: 14 AS_ISSUED games, two retrospective games excluded. Original issued team MAE 8.4277; frozen-input counterfactuals: replay-linear 8.7087, k4 8.6965, k8 8.7366, state-space 8.8531. Original scores remain separate from replay controls. A null-grade filtering bug affected only report assembly; fixed and regression-tested, reusing the identical cached 2026 fit. No optimizer or gate rerun in response to comparative performance.

## 2026-09-16 — E1 week-label replay invalidated by final calendar audit

The numerical rejection above is WITHDRAWN as a valid E1 decision. The final audit found five postponed 2020–2021 games played after the next Tuesday 06:00 PT cutoff, but the replay had assimilated by NFL week label. This is an implementation chronology defect, not evidence to promote or reject a method. The original run and hashes are preserved in work/projection-governance-v2/e1-week-label-run with VALIDITY.json. E1 is blocked on the postponed-game cadence interpretation; no gate or candidate setting is changed, no promotion occurred, and linear remains live. No PFF or other data addition started.

## 2026-09-16 — General assimilation calendar correction; E1 rerun preflight blocked

The binding chronology rule replaces week-label assimilation for every game: the latest scheduled Tuesday 06:00 PT cutoff strictly before the game's own T-75 issuance determines state; only results completed strictly before that cutoff enter it. It applies identically to linear control, k4, k8 and state-space. Two games within an interval share state. Week labels no longer advance availability or the shared calendar decay clock. Candidates, tuning settings and release gates are unchanged; the original preregistration remains byte-identical.

The earlier E1 rejection remains **WITHDRAWN / INVALIDATED**, preserved in `work/projection-governance-v2/e1-week-label-run`. Its cause was ordering assimilation by NFL week rather than each game's issuance and completion chronology. The approved chronology interpretation is now implemented; the remaining blocker is verified historical completion timestamps. The corrected entry point was attempted and failed its full-schedule preflight before fitting. **No first valid E1 result exists yet.** Once the corrected run passes, that result must be recorded as the first valid E1 result, never as a second method experiment.

| Evidence | Before | After |
|---|---|---|
| Scored-period calendar audit | Five identified late games | Full 2,639-game schedule inspected; missing verified completion evidence blocks replay |
| Affected forecasts by season | Not computed | Explicitly unknown until complete timestamp evidence permits dependency comparison |
| Candidate timing | Week labels | Common strict cutoff for all four candidates; no timing advantage assigned to any candidate |
| Coaching/QB1 flag | Unknown coaching suppressed known QB1 changes | Unknown coach half false independently; 152 known QB1 changes activate flags |
| Numerical decision | Invalidated rejection | No replacement numerical result; linear stays live |

Coaching fields remain unknown for all 448 team-seasons; no PFR 403 workaround. QB1 coverage remains 446/448, with 2017 MIA and TB missing. Coordinator sourcing is deferred. No PFF or unrelated data ingestion. Completion source probes and the blocked full-history audit are preserved in `work/projection-governance-v2/e1-calendar-corrected/`; its report distinguishes 304 passing code tests from the failed historical evidence audit. No frozen forecasts, grades or model activation changed.


## 2026-09-16 — CONVENTIONS: decision-latency amendment and E1 gap sweep

Binding amendment adopted in work/projection-governance-v2/DECISION-LATENCY.md. E1 sweep: **22 Tier 1 decisions, four nonblocking Tier 2 review flags, one existing Tier 3 evidence blocker**. Original preregistration remains byte-identical; invalidated results were already viewed and remain preserved. No corrected comparisons have been viewed. This addendum is recorded before this follow-through, not backdated over earlier implementation.

Addendum hash: `695999ed579b7174a446f3930815d51f1ec6729bcfa57d0e3eebfe3fcca06224`. Full choices and untested alternatives: e1-calendar-corrected/PREREGISTRATION-ADDENDUM.md.

| ID / tier | Convention and decision | Reason / source |
|---|---|---|
| C01 / 1 | Document precedence and scope: Apply decision-latency amendment, latest calendar/QB directions, constrained A.2, supplement, governance queue, then architecture. E1 only; E2/E4/E5 remain deferred. | Explicit user precedence; no new choice of model. Source: GOVERNANCE.md §§1–3; user amendments. |
| C02 / 1 | Original registration and already-viewed history: Keep original registration byte-identical. Hash this addendum and new implementation receipt before corrected comparisons; disclose the invalidated results were viewed. | A correction does not authorize erasing exposure or backdating registration. Source: e1/registration.json; GOVERNANCE.md §2.2–3. |
| C03 / 1 | Time zones and DST: Use timezone-aware UTC comparisons, America/Los_Angeles for Tuesday 06:00, America/New_York for nflverse schedule clock. Never use a fixed UTC offset. | Existing calendar module and source convention; zero fitted parameters. Source: engine/forecast_system/calendar.py; scripts/e1_calendar_audit.py. |
| C04 / 1 | Strict boundaries: A cutoff equal to issuance is ineligible; a completion equal to cutoff is excluded. Apply to every game, irrespective of week labels. | The binding calendar rule explicitly says strictly before. Source: User assimilation calendar rule; calendar.cutoff_before/plan. |
| C05 / 1 | Frozen intervals and common availability: Use one shared result-availability calendar for control, k4, k8 and state-space, including Elo and pace histories. Two games in an interval use the same team state. | No candidate gets a timing advantage; this fixes chronology, not settings. Source: User calendar correction; core_features.build; state_fit.replay. |
| C06 / 2 | Linear decay clock on exceptional schedules: Retain the corrected implementation: elapsed scheduled assimilation cutoffs from the first forecast cutoff of a season advance the existing linear decay; freeze that weight inside an interval. | Retains the linear formula and a single state within an interval; avoids a second calendar and within-interval changes. Source: core_features.build(calendar_batches); user week labels never order assimilation. |
| C07 / 1 | Result ordering and deterministic replay: Order assimilation by qualified completion timestamp, then game ID; canonical team order and row ID break remaining exact ties. Reordering source rows must be inert. | Existing deterministic chronological implementation. Source: calendar.plan; state_fit.fit; tests/test_forecast_state_space.py. |
| C08 / 1 | Byes, season boundary and initialization: Keep registered 2013 zero/P0 reset, 2012 earlier pilot, preseason shrink, weekly constrained noise on active-season cutoffs and prediction-only byes. No new offseason drift parameter. | Existing registered conventions; no silent alternative search. Source: e1/CONVENTIONS.md; state_fit.replay. |
| C09 / 1 | Observation units and inactive offsets: Normalize net team points by pregame expected drives; r is PPD squared. Keep actually active calibration/Elo groups and penalty 10; inactive venue/QB/weather/kicking offsets remain inactive. | E1 changes strength updating only; activating other inputs would change the candidate. Source: e1/CONVENTIONS.md; e1/registration.json. |
| C10 / 1 | Identified space and numerical algebra: Retain exact C projection of mean/covariance, q*C, 63 identified dimensions, Joseph-equivalent covariance update, registered Riccati tolerance/cap. No clipping or jitter parameters. | Explicit supplement and implemented constraint; no approximation to identification. Source: state_space.py; user A.2 replacement. |
| C11 / 2 | Reference schedule and steady-state diagnostic: Retain registered symmetric 32 virtual team-versus-league games and posterior P0; diagonal KH gains and offense/defense half-lives remain diagnostics. | Already preregistered before results; changing the reference now would add discretion. Source: e1/CONVENTIONS.md; state_space.reference_observations/stationary. |
| C12 / 2 | Preseason injection cross-covariances: Retain registered C[D P0 D]C congruence with sqrt(2) on flagged components, then the registered lambda transition. | Preserves positive semidefiniteness and identification without new parameters; maintains original registered construction. Source: e1/CONVENTIONS.md; state_space.preseason. |
| C13 / 1 | Staff unknowns and QB flag: Coach unknown independently means false; known QB1 change can still double variance. Report all 448 coaching unknowns and 2017 MIA/TB QB1 gaps. No PFR workaround or coordinator sourcing. | Direct binding instruction. Source: config/staff_history.json; user coaching direction. |
| C14 / 1 | Rho and optimizer: Estimate rho once from the fixed first-start training-only pilot; do not search it. Retain exactly three q/r/lambda starts/bounds and likelihood selection; no OOF-MAE tuning or adaptive retries. | Existing hashed fitting rule; nuisance estimation is not a search. Source: e1/CONVENTIONS.md; state_fit.fit. |
| C15 / 1 | Training and nested chronology: Retain annual expanding training, own earlier-fold state features, 2013–2015 calibration-only forecasts and each candidate’s prior-three-season residuals. Fixed k=4/k=8 need no extra inner MAE search. | Existing registration; no new settings or shorter calibration substitute. Source: e1/registration.json; scripts/e1_evaluate.py. |
| C16 / 1 | Population integrity: Require exactly the registered scored game IDs and two teams per game for every candidate, not merely equal reduced intersections. Unknown required input blocks instead of dropping a game. | Prevents an unnoticed population change; use frozen prior-run identifiers only, not its invalid metrics. Source: GOVERNANCE.md §1; e1-week-label-run/oof.json. |
| C17 / 1 | Point and uncertainty semantics: Retain core points and paired empirical residuals, current numpy quantiles, inclusive interval endpoints, empirical CRPS and mid-P PIT. No E2 recentering or ensemble layer. | Existing metric functions are authoritative; changing them would change registered metrics. Source: engine/forecast_system/verification.py; e1/CONVENTIONS.md. |
| C18 / 1 | Winner ties and summary weighting: Retain home-win event margin>0, including actual ties as not a home win; equal team-observation MAE, population SD of scores, sample SD of errors, 10 reliability/PIT bins. Label semantics. | Existing metrics; do not quietly substitute half-win Brier targets or change denominators. Source: scripts/e1_evaluate.py summary; verification.py. |
| C19 / 1 | Skill and persistence availability: Use training-only league and previous-season-team baselines; last four completed games as of the common cutoff, sorted chronologically. Undefined skill denominator remains null and is reported. | Chronology correction and existing skill convention. Source: verification.skill; e1_evaluate.py. |
| C20 / 1 | Pairing, uncertainty, ties and release gates: Retain 2,000 fixed-seed four-NFL-week circular blocks within each season, both teams together; 1% team MAE and four ±3pp coverage gates, existing simpler-candidate tie rule. Week labels can group reports/resampling, never availability. | These are already registered metrics and procedure; no new block-size search. Source: e1/registration.json; e1_evaluate.py. |
| C21 / 1 | Extreme-game sensitivity and parameter reporting: Add descriptive leave-one-game-out MAE-improvement range and worst-influence game IDs; never use it as a new gate. Report 3 optimized +1 nuisance, games/3 and games/4; 63 latent dimensions separately. | Standing request for extreme-game sensitivity and honest parameter accounting; no fitted quantity added. Source: Week 2 feedback attachment; e1/CONVENTIONS.md. |
| C22 / 1 | Current-season population and caches: Keep the frozen 14 AS_ISSUED input games separate from their retrospective challenger counterfactuals; never pool the two RETROSPECTIVE games. Use corrected historical fits only, copy frozen snapshot with its hash, and reject a mismatched cache lineage. | Existing current-season protocol and immutability rules. Source: e1/current-season-protocol.json; scripts/e1_current.py. |
| C23 / 1 | Budgets, reports and release state: Keep one fit worker/4 GiB/45-minute gate budget; reports read cached results and never fit. Selected optimizer failure or required audit failure blocks; never counts as a method rejection. Two reviews and explicit release remain required. | Existing compute/release rules; no reduced population or relaxed tolerances. Source: User Addendum F; GOVERNANCE.md §2/5; e1/CONVENTIONS.md. |
| C24 / 1 | Affected-game counting: Report distinct forecasts whose incorporated historical game-ID set changes, by season, plus source events separately; do not equate five source games with affected forecast count or numerical propagation. | Straight set comparison; reporting only, no new gate. Source: scripts/e1_calendar_audit.py; user full-calendar audit request. |
| C25 / 2 | Completion evidence precision and substitutes: Retain exact qualified completion timestamps for the executable audit. Missing/contradictory clocks remain unknown; do not substitute kickoff plus duration, last-play start, an edit time or a later current FINAL flag. Continue sourcing; stop only the dependent fit. | Existing conservative evidence policy avoids asserting facts the source does not establish. Source: e1-calendar-corrected/completion-probes.json; calendar-audit.json; user unknown-data default. |
| C26 / 1 | Implementation receipt and runnable stages: Validate addendum/hash and fixed population before comparisons; run current-season audit and evidence rendering from the corrected directory, not legacy paths. Preserve original and invalidated artifacts. | Routine implementation/lineage corrections, not undefined model settings. Source: scripts/e1_calendar_run.py; original registration file hashes. |
| B01 / 3 | Unqualified historical completion evidence: Do not run a valid E1 comparison until every required game has defensible completion/cutoff evidence. Preserve all games and the failed preflight. | Missing evidence cannot be manufactured, and dropping games changes the registered population. This is the only presently identified Tier 3 blocker; all manifestations are batched here. Source: calendar-audit.json; completion-probes.json; binding chronology and unknown-data rules. |

The blocked E1 comparison is not a method rejection. Source qualification continues to be required; no game is dropped, no timestamp invented, and no gate relaxed. All four candidates remain subject to identical chronology.


### CONVENTIONS implementation follow-through

After the hashed sweep was pushed in `5349830a4f77ad2cd77e6257ae7c9542dbc61d00`, applied C16/C21/C22/C26: exact registered game-ID and paired-team validation (equal reduced intersections now fail), descriptive paired-game extreme-loss sensitivity, corrected-directory current-season/cache/report/audit wiring, cache lineage validation, and nonblocking Tier 2 flags with explicit alternatives at the top of reports. Removed stale unconditional-rejection and combined-unknown-flag wording from the renderer. These are implementation/reporting corrections; candidate fitting, metrics and gates remain unchanged.

310 tests pass. The frozen 14-game current-season population shares one cutoff, so no exception was needed. Re-attempted the corrected entry point; B01 completion-evidence preflight still stops before fitting. The post-preflight full-history pipeline has not been validated against qualified completion data. No corrected E1 decision, release or rejection is claimed. Original registration and invalidated artifacts remain unchanged.


## 2026-09-16 — CONVENTIONS: B01 resolved by fixed kickoff-plus-four-hours rule (Tier 1)

Authority: user's binding B01 resolution. `assimilation_available_at` is actual-played nflverse schedule kickoff plus four hours; a result enters only when that value is strictly before the scheduled Tuesday 06:00 PT cutoff strictly before its own T-75 issuance. No completion clock is required, invented or read. All registered games and all four candidates use the same convention; there is no fitted duration. Original registration remains unchanged; availability-convention.json pins this supersession before comparison.

Rationale: the fixed rule removes the missing-completion-clock dependency while preserving explicit pregame schedule lineage and identical candidate timing. Two factual corrections are necessary: nflverse's documented `gametime` is Eastern regardless of venue, so localize to America/New_York and convert to UTC (not stadium local); and four hours does not exceed every game duration (2018 TEN–MIA lasted 7h08). Thus this is a user-authorized assimilation-availability convention, not a claimed universal completion bound. Sources: https://github.com/nflverse/nflreadr/blob/main/data-raw/dictionary_schedules.csv and https://www.tennesseetitans.com/news/titans-dolphins-game-notes.

The rule uses actual played dates/times from the pinned schedule, including rescheduling. B01 is resolved. The previous exact-completion policy C25 is superseded, with its resolution retained alongside the other three Tier 2 flags at the report top. Prior failed preflight evidence is preserved in e1-calendar-corrected/blocked-preflight-before-B01-resolution. No comparative decision has yet been made under this rule.

## First valid E1 result — September 16, 2026

The corrected replay and independent audit passed on all 2,639 registered 2016–2025 games. No challenger clears the unchanged 1% team-MAE improvement gate. All challengers pass the four coverage limits. Retain linear; E2 remains Week 3 against linear. No live fit, frozen projection, grade, or Phase A artifact changed. The prior week-label rejection remains withdrawn and preserved as an invalidated run, not an earlier valid E1 result.

| Method | Team MAE | Improvement vs linear | Margin 50 / 80 | Total 50 / 80 | Decision |
|---|---:|---:|---|---|---|
| linear | 7.5716 | control | 50.25% / 79.54% | 50.66% / 80.07% | RETAIN |
| k4 | 7.5860 | -0.1905% | 50.28% / 79.35% | 50.59% / 79.77% | REJECT |
| k8 | 7.6010 | -0.3883% | 50.44% / 79.61% | 50.28% / 79.54% | REJECT |
| state-space | 7.5724 | -0.0105% | 50.36% / 79.58% | 50.17% / 80.07% | REJECT |

The identical calendar correction applies to control and all three challengers; none gains an information-timing advantage. Changed available-history sets affect 47 forecasts in 2020 and 18 in 2021, zero in the other eight seasons. No registered game was dropped. The full historical test checks every included result's kickoff-plus-four-hours mark is strictly before the state's cutoff. nflverse times are Eastern, converted to UTC; four hours is the authorized availability convention, not an observed completion timestamp or universal duration bound.

Evidence: work/projection-governance-v2/e1-calendar-corrected/report.md, audit.json (PASS), validity.json (FIRST_VALID_E1_RESULT), verification.json, calendar-audit.json and compressed per-game lineage. 312 tests passed. Historical fit 644.6 seconds; current-season fit 94.2 seconds; peak historical process RSS 908.1 MiB; one worker. Paid provider credits: 0.


## GOVERNANCE — experiment clock (2026-09-16)

Effective 2026-09-16T22:29:05Z: each preregistered experiment has until the following Tuesday 06:00 PT to reach its unchanged gate. Otherwise log INCONCLUSIVE plus its one-line blocker and advance the queue. Return requires blocker-resolution evidence; no experiment may block the queue twice. Returned attempts do not delay the scheduled queue. E1's clock starts now, due September 22 at 06:00 PT; the already audited first valid gate decision satisfies it. Prior decisions and preregistration hashes remain immutable.

## PRIORITY — E1 gate checkpoint (2026-09-16)

Reverified the first valid E1 result receipt, all referenced artifact hashes, and independent PASS audit before any further board work. E1 has reported: NO_CHALLENGER_CLEARS_GATE; retain linear. Blocker: none; Tier 3: no. PFF may be a separate data addition, but E-PFF and PFF fit admission cannot precede E1's report; neither is started here. See work/projection-governance-v2/E1-PRIORITY-CHECKPOINT.md.

## 2026-09-16 — E-UNC registered, evaluated, retained control

User-approved exception: team-points CRPS primary for E-UNC only; next experiment returns to team MAE. Registration SHA256 cc426270c4270bc5343f9d00628d538db2c7b0eb88afcfb867c7eb3f500a20e1. No candidate moves any point forecast on 2,639 games. Reduced heteroscedastic candidates are PARTIAL TESTS, not a rejection of the general hypothesis. Full before/after tables: work/e-unc/REPORT.md and scores.json. No promotion or fit activated.

|Candidate|Before team CRPS|After team CRPS|Team MAE unchanged|Decision|
|---|---:|---:|---:|---|
|a_joint|5.359013|5.350874|7.571625|REJECTED|
|b_hetero|5.359013|5.645239|7.571625|REJECTED|
|c_joint_hetero|5.359013|5.657299|7.571625|REJECTED|

CONVENTIONS: GAP-SWEEP.md records Tier 1 central predictive quantiles, paired-game dependence, tie semantics, CRPS/Winkler arithmetic and ten equal probability strata (Wilke chapter 16; Gneiting/Raftery 2007; existing distribution.py). Tier 2 model/diagnostic alternatives remain review-requested. Both Tier 3 amendments resolved by user before final hash. Secondary wind study remains data-blocked: documented archive begins around 2022; stored stitched rows lack pre-issuance timestamps. No reanalysis substituted, no primary game dropped.

Display-only evidence adds issuing-distribution quantile dots and explicit constant-width/predictive labels. Original forecasts, grades and score point values remain unchanged.

E-UNC audit source correction: the first correlation diagnostic used the older adaptive reference artifact. Preserved as audit-initial-adaptive-reference.json. The final audit uses the retained linear control's calendar-corrected OOF forecasts, matching the evaluated incumbent; rho is 0.039750. No candidate, fit, comparison, gate or preregistration changed.

## E-UNC secondary wind follow-through

The initial local-history blocker was partially resolved by retrieving fixed 24-hour-lead Previous Runs forecasts. Before secondary fitting, SECONDARY-ADDENDUM.md and secondary-registration.json fixed source, model, matched training/test population and no tuning. 544 qualified game records: 272 training (2024), 272 test (2025). 2021–2023 unscored because documented GFS wind archive coverage is absent. b+wind worsened team CRPS by 0.1231%; not gated and no primary decision change. Full tables and diagrams in work/e-unc/SECONDARY-REPORT.md and secondary.json. Source responses are cached and hashed. No paid credits; no reanalysis. This supersedes the initial NOT_RUN secondary status while preserving that history in Git.

## E-UNC closeout — REJECTED
Verified properties of the audited engine: single-game predictive intervals; paired margin residuals; no independence defect. Within-game residual correlation is 0.04 (unrounded 0.0397496332). The joint-ensemble benefit predicted by review was rejected by the data under the registered release gate: about 0.15% CRPS improvement did not meet 1%, and Winkler failed. Existing model retained.

Standing audited fact: coefficient uncertainty is under 0.2 percent of predictive variance, so interval width is not expected to narrow materially within a season. This is the conditional coefficient decomposition of the audited engine; it does not identify a pure physical noise floor.

Wind secondary: INSUFFICIENT, not negative. One training season and one test season cannot overturn the 2,639-game bucket study. The numerical result remains preserved; it is not a rejected wind hypothesis. Conditional return requires qualified 2021–2023 forecast history.

Heteroscedastic hypothesis: OPEN. Its three-feature set (week, games played by each team, roof) is REJECTED. Next attempt requires qualified additional fields and fresh preregistration; repeating the rejected set is prohibited.

Queue advanced to E2, post-processing, READY_FOR_PREREGISTRATION. Team-score MAE resumes as primary. Three registered candidate forms: a/b, a/b/c, and a/b/c plus points-band offsets. Separate hashed gap sweep and preregistration required; older Phase A remains exploratory. No user input needed now; only newly discovered Tier 3 questions would be batched for decision.

## 2026-09-18 — DET–BUF after-action and E-SCORE registration

- Read-only after-action uses the immutable projection-v2.w2 lock: DET 24.8980 / BUF 27.5727 versus official DET 31 / BUF 41. Detroit inside both team bands; Buffalo outside 50%, inside 80%. Full Buffalo contributions reconcile. No frozen forecast or grade rewritten.
- User priority amendment: E-SCORE league scoring environment is next, ahead of E2. E2 and later entries retained. Three fixed candidates: weekly league PPD, preseason-only PPD, chronological season intercept. Team MAE primary; unchanged 1%/coverage release gates. Registration hash `44ae73f41d03bff8a99b3ddbaa1a41a76f457c5dcfcfaeb2ebaee4e2bc12beb9`; deadline September 22 06:00 PT. Not fitted; no release decision.
- Motivation audit: Week 1 actual-minus-projected total +6.9079 across 14 AS_ISSUED games; supplied 9/14 over count is preserved but not verified (7/14 above model totals). Top three team misses are positive. Corrected E1 control annual biases are reported in work/e-scoring-environment/REPORT.md; they do not establish persistent historical underprediction.
- CONVENTIONS: Tier 1 existing control, paired chronology, version-pinned intervals and unchanged gates; Tier 2 REVIEW REQUESTED for fixed one-league-week prior exposure, two-year trend extrapolation, common-level centering, prefix-only season intercept and season-level systematic-bias diagnostic. Decisions, rationale and alternatives in hashed GAP-SWEEP.md. Full-season hindsight intercepts are diagnostics only, never OOF forecasts. No candidate search performed; no paid provider calls.

## 2026-09-18 — Governance and cadence amendment (implementation in progress)

User replaces Addendum 1 E: Friday/Monday/Tuesday 06:00 PT assimilation; unchanged Friday 12:00 and Sunday 07:00 reruns, T80/T75, daily idempotent grading, offseason/Week 9 post-processing, Sunday 20:00 PARTIAL sheet. Tuesday order: assimilation, published complete-week closeout and Season refresh, weight-only ridge refit/version, one registered experiment, two-reviewer packet. No experiment artifact may precede publication of that week's closeout. Experiment clock runs Tuesday preregistration to next Tuesday 06:00 PT. Original experiment hashes and forecasts remain immutable.

Pre-implementation Tier 3 batch: E1 rejected state-space while production remains linear, so promotion authority needs resolution under the unchanged gate; exact forecast equality outside immediately affected games is not generally possible because legitimate early Kalman updates change subsequent means/covariances. Recommend shadow state-space pending qualification and separate direct/downstream change accounting. No host schedule or live method changed while these decisions are pending. Independent versioned calendar/lineage work can proceed without fitting or promotion.

## 2026-09-18 — Monthly GitHub scan and three queued registrations

- PLAN.md written before implementation. First scan covers 11 inspected repositories with license/commit/chronological-test/market/gap rubric and pinned source evidence. Eight discovery queries saved. Three additional distinct-gap proposals require user admission; brady-algorithm-2 exclusion verified from shuffled notebook split, absent temporal test/license, and overlapping QB inputs.
- Queue order after league E-SCORE: E-WEPA, E-OPP, E-SCORE-TOOLING (user alias E-SCORE scoringrules; collision resolved without rewriting league registration). Hashes recorded beside each SPEC. WEPA is REGISTERED_BLOCKED, not fit-ready, pending user decision on 2013–2020 training versus 2016–2025 gate and a qualified EPA/PPD state observation mapping. No method fit or promotion.
- Tooling: scoringrules 0.10.0 Apache-2.0 pinned (corrects supplied MIT; avoids unapproved NumPy 2 upgrade). 45 reconciliation cases, no absolute discrepancy above 1e-6; largest Brier difference 8.33e-17. Public library Brier rejects fractional outcomes, so disclosed binary-score identity preserves legacy tie score. Active uncertainty functions delegate to new adapter. Old frozen-reference implementations/artifacts preserved. Tail CRPS added through saved-distribution report, no refit.
- CONVENTIONS: library estimator `nrg` is empirical energy CRPS, not fair correction; exact PMF weights; Winkler alpha=1-level; fixed forecast central80 bounds for two-tail transform. Tail score is reporting only. Unknown upstream market usage remains unknown; published momentumnfl predictions are market-informed and excluded as independent comparator.
- Monthly first-Tuesday 09:00 Pacific task created; fail-closed published-closeout receipt prerequisite tested. Initial September 18 scan explicitly authorized outside cadence. Cadence publisher still pending prior Tier 3 resolution. No provider credits spent; no raw market field admitted to projection.

## 2026-09-18 — E-WEPA nested amendment and closeout prerequisite

User resolves E-WEPA fitting overlap with 2006..S-1 annual weight fits for 2016–2025, same-window WEPA/play × plays/drive minus league mean conversion, and promotion through E-WEPA's own gate only. Original registration preserved; amended registration and fold-plan hashes recorded under work/harvest-scan/e-wepa. Timeout fallback is 2006–2012 frozen, disclosed, never selected by observed accuracy. No fitting this turn.

Closeout publisher inspection: NOT BUILT at start (only consumer guard/receipt contract existed). Building that dependency takes priority over experiment implementation. momentumnfl remains excluded pending verified market-free reproduction, not merely disabling its final blend switch.

### Closeout dependency implementation and comparator decision
- Added immutable weekly closeout publisher and blocked both scheduled weight-refit paths until its evidence is pushed and a publication receipt exists. Scorecard includes dispersion, 50/80 coverage, signed total bias, best/worst five and named unqualified-game counts; trend and Season evidence are refreshed and snapshotted. Remote tip is checked after publishing.
- Status: built and locally tested; production host execution unverified. E-WEPA fitting waits for this dependency and its queue slot after the league scoring-environment experiment.
- momentumnfl remains EXCLUDED: pinned preseason.py reads market win totals even with the final blend disabled. No PURE_MODEL_REPRODUCED result claimed.

## E-POST and deployed-control governance correction
- Preserved the independent audit verbatim and reproduced its baseline/live/replay MAE and bias. Clarified baseline SD: mean within-season 1.537 versus pooled 1.687.
- Registered E-POST ahead of all queued experiments. STOPPED before fitting under the requested control-identity rule: active publisher uses projection-v2.w2 fit 8bd58561, not an established 8.003-series control. No gate evaluated or promotion made.
- Governing experiments now require the deployed model's rolling-origin control. E1 and E-UNC annotated as valid within REPLAY, not tested against production; each may be re-registered once. Original results preserved.

### E-POST deployed-lineage amendment and batched reconciliation
- Accepted the audit's candidate numbers as reference only; removed their reproduction-threshold role for the new deployed control. Preserved original registration; hashed the new addendum.
- Before fitting, found exact production weekly ridge path does not invoke the requested three-cutoff state-space code. Registered Tier 3 reconciliation with recommendation to retain actual production semantics for the control.
- Direct droplet command failed host-key verification (exit 255); code/fit identity unverified. Recorded full command/output. Generated only baseline-versus-REPLAY season bias/slope diagnostics, no claimed deployed OOF or gate decision.
- Corrected scope of the cited 14-game live statistic: mixed older issuing versions, not fourteen projection-v2.w2 games.

### E-POST: verified host and generated production-semantics control
- Direct SSH with the provisioned admin key succeeded. Host commit 538ce1f4, active fit 8bd58561 verified by byte hash, calibration+Elo / penalty 10 / no decay. One tracked difference (final-feed.json), 440 untracked paths inventoried. Host root disk full; no deletions or live changes made.
- User resolved production semantics exactly. Generated immutable 2639-game deployed OOF 6a0238fc using verified host numerical source, prior-season initialization and within-season whole-week ridge refits. Two full runs have identical output hash. Registered delivery-timing approximation remains REVIEW REQUESTED; actual historical feed/sync timing is unavailable.
- Pooled MAE 7.57435, bias projected-minus-actual +0.18887, projected SD 2.94296. The historical bias does not share the audit's persistent negative sign. Per explicit step 2 instruction, STOPPED before E-POST candidate fitting; no gate decision or promotion claimed. The cited live 14-game record is mixed older versions, not fourteen active-lineage games.

## Host disk recovery, 2026-09-19
- Recovered zero-free-space root volume to about 719 MiB free using only package caches and log rotation; full removal inventories preserved compressed. Runtime and all artifacts of record retained.
- Pending final feed was committed by the recovered scheduler; DET-BUF grade subsequently published. All 440 untracked paths traced to unit-test writers and narrowly ignored; zero unknowns. Journal retention bounded to 32 MiB. No paid capture manually invoked.

## E-POST closeout and series hygiene
- E-POST is REJECTED_ON_PREMISE, not on gate; no candidate gate evaluated. Audit error: v3 baseline is not production, and fourteen cited grades belong to two superseded fits. The authoritative deployed lineage does not exhibit that persistent negative bias.
- Added SERIES.md identity catalogs with pooled MAE, projected-minus-actual bias, slope, SD, repository dates, hashes and producer/fit-manifest references. The deployed 6a0238fc series is the sole future gating control; E1 is REPLAY; stale baseline is SUPERSEDED. Added first-line non-authority notices to historical experiment reports. Immutable forecast JSON and original audit remain unchanged; prior report revisions remain in Git.

## E-BENCHMARK-GAP — descriptive study completed, no fitting
- Reproduced audit overlap 1177 with both source-order duplicate choices: deployed margin MAE 10.2654, nfelo pre-regression approximately 10.041, closing line 9.7872, stale baseline 10.5630. Existing duplicate policy yields primary 1170 unambiguous games: 10.2492 / 10.0226 / 9.7748. Saved every forecast, error, exclusion and duplicate alternative.
- Decomposed gap by season, week band, projected favorite size, observed starter change and roof. QB-change games are 23.6% of primary games and carry 67.6% of nfelo excess loss; named next question E-QB-CHANGE, without specifying or fitting candidates. Retrospective observed starters do not qualify a pregame input.
- Corrected comparator label: pre-regression is not certified football-only; inspected nfelo source uses closing lines in rating updates. Benchmark-only market fields remain outside the engine. Reports disclose duplicate, timing and source qualifications.
