# E1 preregistration addendum — decision latency gap sweep

**REVIEW REQUESTED — nonblocking Tier 2:** C06 (decay clock), C11 (reference schedule), C12 (preseason covariance), C25 (completion evidence representation). The chosen convention and untested alternative are below. Review does not pause independent work; an established error requires a corrected rerun.

Addendum SHA-256: `695999ed579b7174a446f3930815d51f1ec6729bcfa57d0e3eebfe3fcca06224`.
Parent registration: `a48e85241a47301ff3e462af70db6171c7c0edd750a67ac878ebe2b4411f1e62` (unchanged).

This sweep precedes the implementation follow-through in this turn. Earlier invalidated results were viewed; no corrected comparative result exists. Existing explicit or registered choices are retained, not reopened for tuning. Sources reviewed: full GOVERNANCE.md, ARCHITECTURE.md, PLAN.md, E1 registration and CONVENTIONS, current-season protocol/review packet, the supplied Addendum A–H and supplements, constrained A.2, calendar/QB instructions, and this decision-latency amendment. The older Week 2 feedback attachment was also reviewed; the controlling later registration specifies the executable candidates/gates.

## Decisions

### C01 — Tier 1: Document precedence and scope

Apply decision-latency amendment, latest calendar/QB directions, constrained A.2, supplement, governance queue, then architecture. E1 only; E2/E4/E5 remain deferred.

Reason: Explicit user precedence; no new choice of model.

Source: GOVERNANCE.md §§1–3; user amendments.

Status: DECIDED.

### C02 — Tier 1: Original registration and already-viewed history

Keep original registration byte-identical. Hash this addendum and new implementation receipt before corrected comparisons; disclose the invalidated results were viewed.

Reason: A correction does not authorize erasing exposure or backdating registration.

Source: e1/registration.json; GOVERNANCE.md §2.2–3.

Status: DECIDED.

### C03 — Tier 1: Time zones and DST

Use timezone-aware UTC comparisons, America/Los_Angeles for Tuesday 06:00, America/New_York for nflverse schedule clock. Never use a fixed UTC offset.

Reason: Existing calendar module and source convention; zero fitted parameters.

Source: engine/forecast_system/calendar.py; scripts/e1_calendar_audit.py.

Status: DECIDED.

### C04 — Tier 1: Strict boundaries

A cutoff equal to issuance is ineligible; a completion equal to cutoff is excluded. Apply to every game, irrespective of week labels.

Reason: The binding calendar rule explicitly says strictly before.

Source: User assimilation calendar rule; calendar.cutoff_before/plan.

Status: DECIDED.

### C05 — Tier 1: Frozen intervals and common availability

Use one shared result-availability calendar for control, k4, k8 and state-space, including Elo and pace histories. Two games in an interval use the same team state.

Reason: No candidate gets a timing advantage; this fixes chronology, not settings.

Source: User calendar correction; core_features.build; state_fit.replay.

Status: DECIDED.

### C06 — Tier 2: Linear decay clock on exceptional schedules

Retain the corrected implementation: elapsed scheduled assimilation cutoffs from the first forecast cutoff of a season advance the existing linear decay; freeze that weight inside an interval.

Reason: Retains the linear formula and a single state within an interval; avoids a second calendar and within-interval changes.

Source: core_features.build(calendar_batches); user week labels never order assimilation.

Alternative / recommendation: Use the forecast game NFL-week label for decay even when two games share one interval. This could change control predictions and conflicts with the frozen-state interpretation.

Status: REVIEW_REQUESTED.

### C07 — Tier 1: Result ordering and deterministic replay

Order assimilation by qualified completion timestamp, then game ID; canonical team order and row ID break remaining exact ties. Reordering source rows must be inert.

Reason: Existing deterministic chronological implementation.

Source: calendar.plan; state_fit.fit; tests/test_forecast_state_space.py.

Status: DECIDED.

### C08 — Tier 1: Byes, season boundary and initialization

Keep registered 2013 zero/P0 reset, 2012 earlier pilot, preseason shrink, weekly constrained noise on active-season cutoffs and prediction-only byes. No new offseason drift parameter.

Reason: Existing registered conventions; no silent alternative search.

Source: e1/CONVENTIONS.md; state_fit.replay.

Status: DECIDED.

### C09 — Tier 1: Observation units and inactive offsets

Normalize net team points by pregame expected drives; r is PPD squared. Keep actually active calibration/Elo groups and penalty 10; inactive venue/QB/weather/kicking offsets remain inactive.

Reason: E1 changes strength updating only; activating other inputs would change the candidate.

Source: e1/CONVENTIONS.md; e1/registration.json.

Status: DECIDED.

### C10 — Tier 1: Identified space and numerical algebra

Retain exact C projection of mean/covariance, q*C, 63 identified dimensions, Joseph-equivalent covariance update, registered Riccati tolerance/cap. No clipping or jitter parameters.

Reason: Explicit supplement and implemented constraint; no approximation to identification.

Source: state_space.py; user A.2 replacement.

Status: DECIDED.

### C11 — Tier 2: Reference schedule and steady-state diagnostic

Retain registered symmetric 32 virtual team-versus-league games and posterior P0; diagonal KH gains and offense/defense half-lives remain diagnostics.

Reason: Already preregistered before results; changing the reference now would add discretion.

Source: e1/CONVENTIONS.md; state_space.reference_observations/stationary.

Alternative / recommendation: A rotating 16-real-matchup reference schedule. Not evaluated; would require an explicit protocol correction if reviewers establish the retained construction is wrong.

Status: REVIEW_REQUESTED.

### C12 — Tier 2: Preseason injection cross-covariances

Retain registered C[D P0 D]C congruence with sqrt(2) on flagged components, then the registered lambda transition.

Reason: Preserves positive semidefiniteness and identification without new parameters; maintains original registered construction.

Source: e1/CONVENTIONS.md; state_space.preseason.

Alternative / recommendation: Add flagged diagonal variance alone before projection. Not tested; it changes cross-covariances and could change forecasts.

Status: REVIEW_REQUESTED.

### C13 — Tier 1: Staff unknowns and QB flag

Coach unknown independently means false; known QB1 change can still double variance. Report all 448 coaching unknowns and 2017 MIA/TB QB1 gaps. No PFR workaround or coordinator sourcing.

Reason: Direct binding instruction.

Source: config/staff_history.json; user coaching direction.

Status: DECIDED.

### C14 — Tier 1: Rho and optimizer

Estimate rho once from the fixed first-start training-only pilot; do not search it. Retain exactly three q/r/lambda starts/bounds and likelihood selection; no OOF-MAE tuning or adaptive retries.

Reason: Existing hashed fitting rule; nuisance estimation is not a search.

Source: e1/CONVENTIONS.md; state_fit.fit.

Status: DECIDED.

### C15 — Tier 1: Training and nested chronology

Retain annual expanding training, own earlier-fold state features, 2013–2015 calibration-only forecasts and each candidate’s prior-three-season residuals. Fixed k=4/k=8 need no extra inner MAE search.

Reason: Existing registration; no new settings or shorter calibration substitute.

Source: e1/registration.json; scripts/e1_evaluate.py.

Status: DECIDED.

### C16 — Tier 1: Population integrity

Require exactly the registered scored game IDs and two teams per game for every candidate, not merely equal reduced intersections. Unknown required input blocks instead of dropping a game.

Reason: Prevents an unnoticed population change; use frozen prior-run identifiers only, not its invalid metrics.

Source: GOVERNANCE.md §1; e1-week-label-run/oof.json.

Status: DECIDED.

### C17 — Tier 1: Point and uncertainty semantics

Retain core points and paired empirical residuals, current numpy quantiles, inclusive interval endpoints, empirical CRPS and mid-P PIT. No E2 recentering or ensemble layer.

Reason: Existing metric functions are authoritative; changing them would change registered metrics.

Source: engine/forecast_system/verification.py; e1/CONVENTIONS.md.

Status: DECIDED.

### C18 — Tier 1: Winner ties and summary weighting

Retain home-win event margin>0, including actual ties as not a home win; equal team-observation MAE, population SD of scores, sample SD of errors, 10 reliability/PIT bins. Label semantics.

Reason: Existing metrics; do not quietly substitute half-win Brier targets or change denominators.

Source: scripts/e1_evaluate.py summary; verification.py.

Status: DECIDED.

### C19 — Tier 1: Skill and persistence availability

Use training-only league and previous-season-team baselines; last four completed games as of the common cutoff, sorted chronologically. Undefined skill denominator remains null and is reported.

Reason: Chronology correction and existing skill convention.

Source: verification.skill; e1_evaluate.py.

Status: DECIDED.

### C20 — Tier 1: Pairing, uncertainty, ties and release gates

Retain 2,000 fixed-seed four-NFL-week circular blocks within each season, both teams together; 1% team MAE and four ±3pp coverage gates, existing simpler-candidate tie rule. Week labels can group reports/resampling, never availability.

Reason: These are already registered metrics and procedure; no new block-size search.

Source: e1/registration.json; e1_evaluate.py.

Status: DECIDED.

### C21 — Tier 1: Extreme-game sensitivity and parameter reporting

Add descriptive leave-one-game-out MAE-improvement range and worst-influence game IDs; never use it as a new gate. Report 3 optimized +1 nuisance, games/3 and games/4; 63 latent dimensions separately.

Reason: Standing request for extreme-game sensitivity and honest parameter accounting; no fitted quantity added.

Source: Week 2 feedback attachment; e1/CONVENTIONS.md.

Status: DECIDED.

### C22 — Tier 1: Current-season population and caches

Keep the frozen 14 AS_ISSUED input games separate from their retrospective challenger counterfactuals; never pool the two RETROSPECTIVE games. Use corrected historical fits only, copy frozen snapshot with its hash, and reject a mismatched cache lineage.

Reason: Existing current-season protocol and immutability rules.

Source: e1/current-season-protocol.json; scripts/e1_current.py.

Status: DECIDED.

### C23 — Tier 1: Budgets, reports and release state

Keep one fit worker/4 GiB/45-minute gate budget; reports read cached results and never fit. Selected optimizer failure or required audit failure blocks; never counts as a method rejection. Two reviews and explicit release remain required.

Reason: Existing compute/release rules; no reduced population or relaxed tolerances.

Source: User Addendum F; GOVERNANCE.md §2/5; e1/CONVENTIONS.md.

Status: DECIDED.

### C24 — Tier 1: Affected-game counting

Report distinct forecasts whose incorporated historical game-ID set changes, by season, plus source events separately; do not equate five source games with affected forecast count or numerical propagation.

Reason: Straight set comparison; reporting only, no new gate.

Source: scripts/e1_calendar_audit.py; user full-calendar audit request.

Status: DECIDED.

### C25 — Tier 2: Completion evidence precision and substitutes

Retain exact qualified completion timestamps for the executable audit. Missing/contradictory clocks remain unknown; do not substitute kickoff plus duration, last-play start, an edit time or a later current FINAL flag. Continue sourcing; stop only the dependent fit.

Reason: Existing conservative evidence policy avoids asserting facts the source does not establish.

Source: e1-calendar-corrected/completion-probes.json; calendar-audit.json; user unknown-data default.

Alternative / recommendation: Accept independently verified completion-time bounds that prove identical cutoff membership while retaining exact time as unknown. This is a possible evidence representation for reviewer consideration, not an approved fabricated timestamp.

Status: REVIEW_REQUESTED.

### C26 — Tier 1: Implementation receipt and runnable stages

Validate addendum/hash and fixed population before comparisons; run current-season audit and evidence rendering from the corrected directory, not legacy paths. Preserve original and invalidated artifacts.

Reason: Routine implementation/lineage corrections, not undefined model settings.

Source: scripts/e1_calendar_run.py; original registration file hashes.

Status: DECIDED.

### B01 — Tier 3: Unqualified historical completion evidence

Do not run a valid E1 comparison until every required game has defensible completion/cutoff evidence. Preserve all games and the failed preflight.

Reason: Missing evidence cannot be manufactured, and dropping games changes the registered population. This is the only presently identified Tier 3 blocker; all manifestations are batched here.

Source: calendar-audit.json; completion-probes.json; binding chronology and unknown-data rules.

Alternative / recommendation: Recommendation: obtain authoritative gamebook/end-of-game records, retain the strict audit, and rerun the same candidates. Do not loosen a gate, infer a duration, or exclude troublesome games.

Status: BLOCKED_EVIDENCE.
