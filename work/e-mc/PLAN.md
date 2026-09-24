# E-MC — registered intent; execution deferred

## Authority and sequence

Gabe's 2026-09-24 request registers E-MC immediately after E-PFF. E-MC must not start until BOTH E-GROUPS and E-PFF have reported. This registration reserves the order E-GROUPS → E-PFF → E-MC; it does not start a simulation, fit, comparison, publication, or experiment clock. Preserve the existing queue outside this constraint.

Neither predecessor's registration/report is present in the checked repository. Names are dependency references, not invented experiment specifications or completed reports. Before activation, resolve and hash both actual terminal reports and any resulting production release. A rejected predecessor still satisfies “reports”; a queued/running item does not. A governance INCONCLUSIVE report advances the queue but does not make any unavailable input qualified.

Following the existing queued-registration convention, the clock starts with the Tuesday executable activation preregistration after the published closeout, ends the following Tuesday 06:00 Pacific, and applies the standing INCONCLUSIVE/one-block policy. Hash the activation addendum before any comparative result; preserve this intent registration unchanged.

## Purpose and premise

Improve the SHAPE of team-point predictive distributions, not compress interval width or change expected team scores. Cite [FINDINGS.md](../../FINDINGS.md#predictive-variance-e-unc): coefficient uncertainty is under 0.2 percent of predictive variance, so interval width is not expected to narrow materially within a season. This is an accepted historical E-UNC REPLAY finding, not an authoritative-control re-estimate or proof of a physically irreducible floor. Do not tune toward narrower intervals; judge probability quality and calibrated coverage.

## Registered candidates

- **(a) Drive simulation:** replace the deployed residual-shifted team-points distribution with 10,000 game simulations. Draw each team's drive count from its pace distribution. Draw touchdown, field goal, safety, or no-score outcomes using the team's opponent-adjusted per-drive rates. Scale so each simulated team distribution's mean equals that game's deployed full-precision point projection exactly, subject only to the declared arithmetic tolerance. Preserve integer football scores; do not quietly rescale realized scores to fractional points.
- **(b) Drive simulation plus QB mixture:** (a), with a starter designated Questionable at issuance mixed with the backup at historical play rates by injury designation, estimated strictly from earlier qualified data. The mixture's unconditional team mean must still match the deployed target. Unknown designation/backup histories stay unknown; no actual starter or retrospective designation substitution, dropped games, or silent zero-effect fallback.
- **(c) Control:** the authoritative deployed lineage and its issued distribution at E-MC activation. Trace the actual publisher, code, fit, calibration, generation date and rolling-origin artifact; do not automatically substitute today's HFA file or historical E-UNC replay. If the deployed distribution has changed by activation, reconcile the registered “residual-shifted” premise before starting.

No candidate changes any team-point, margin or total point forecast. Keep full precision in storage. An arm that changes these is OUT_OF_SCOPE, not a scored challenger. Deterministic seeds must be derived from game ID and frozen experiment/version identity, stored with generator/version, component stream identities, and all distribution parameters. Candidate (a)'s non-QB draws should be shared with (b) for fair comparison. Input row ordering cannot change output.

## Evaluation and gate

Chronological outer seasons 2016–2025 on the same 2,639 registered completed games, both team outcomes retained and paired. Revalidate their identities against the authoritative deployed control at activation; a different population needs explicit resolution. Every input, nuisance estimate and any calibration uses strictly earlier qualified training data, respecting actual issuance/cutoff chronology and the installed production cadence. No current-season target, future designation, market line or test-season outcome can enter a forecast or select a setting.

E-MC-only primary: pooled mean team-points CRPS against actual final scores. Required relative improvement at least 1 percent versus (c); central inclusive team-point coverage within 3 percentage points of 50 and 80 percent. Report coverage separately for margin and total under the standing protocol; if unchanged from control, identify that explicitly. Reuse E-UNC's point-forecast invariance tolerance of 1e-12 and report identical team MAE for all arms. Resolve the scope of inherited interval-score/coverage gates in the activation sweep rather than silently changing them. Prefer the simpler arm on ties under the governing rule.

Report per season and pooled: team CRPS, team MAE, bias, projected/actual dispersion, coverage/counts/widths, interval scores and paired-game uncertainty; supporting margin/total accuracy and probability diagnostics. Reuse the pinned validated scoring implementation. The primary objective exception applies only to E-MC; no market-relative score is a target, gate, tuning or ranking criterion. Existing reference diagnostics remain two lines marked DIAGNOSTIC ONLY in the eventual experiment report.

For EVERY team and threshold 17.5, 20.5, 23.5, 27.5, 30.5, report P(score > threshold) against the observed indicator, per season and pooled: counts, mean forecast probability, empirical frequency, calibration gap, Brier score, and fixed reliability bins [0,.1), …, [.9,1]. Publish all cells including empty/sparse cells with their counts; no selected-team/threshold headline. Include binomial intervals for observed frequencies; they do not measure total forecast-estimation uncertainty. Threshold metrics are supporting diagnostics, not extra gates or selection opportunities.

## Predictability-floor deliverable (after execution)

Use the same drive simulator with fixed pregame inputs/parameters and fixed QB identity; draw pace and drive outcomes, not epistemic parameter/weather/QB-status uncertainty. Report the standard deviation of simulated team points in points as the **simulation-implied predictability floor (fixed inputs)**, alongside engine MAE and climatology MAE. It is model-dependent SD, not a lower bound on MAE or proof of irreducible physical randomness. Report the separate mixture spread for (b) without calling it the fixed-input floor.

Add this diagnostic to the Season convergence chart with a distinct legend, units, sample counts, version, and explicit SD-versus-MAE distinction. Use issuance-time inputs only and label historical replays. If data are insufficient, show the named shortfall and counts. Do not invent a flat floor, retrofit frozen cards, or publish the chart before the predecessor reports and verified simulation evidence exist. Diagnostic publication does not promote a rejected candidate's distributions into issued forecasts.

## Pre-implementation gap sweep

This is a COMPLETE sweep of currently visible design gaps for intent registration, not a claim that executable definitions are settled. Revisit against the then-deployed interfaces at activation, before fitting; batch every remaining Tier 3 decision together.

| ID | Tier | Convention / disposition |
| --- | --- | --- |
| C01 | 1 | Use authoritative deployed control at activation, strict earlier-data chronology, paired games, no market input, and unchanged population: standing governance. Pin source/code/fit/data hashes then. |
| C02 | 1 | Point invariance uses existing E-UNC 1e-12 absolute tolerance; do not rederive point predictions from noisy empirical medians. Keep all three point targets unchanged. |
| C03 | 1 | Threshold event is strictly score > half-point threshold; central inclusive integer intervals and CRPS follow existing discrete scoring conventions. No pushes exist at these thresholds. |
| C04 | 1 | Seeded 10,000 draws, immutable artifacts, cached results, reports never refit. One worker, 4 GiB/45-minute gate ceiling and 10-minute weekly ceiling remain binding; no automatic smaller sample or paid capacity. |
| C05 | 2 | REVIEW REQUESTED: floor “spread” means conditional SD with fixed QB identity; alternative includes QB-status uncertainty. SD follows the earlier floor definition and isolates drive randomness. Report it explicitly, never as an MAE bound. |
| C06 | 2 | REVIEW REQUESTED: fixed ten equal-width reliability bins, publish all team/threshold cells and counts; alternative adaptive bins. Fixed bins avoid selection from outcomes, and sparse cells carry no affirmative calibration claim. |
| B01 | 3 | Exact mean with integer support: 10,000 equally weighted integer totals have mean on a 0.0001 grid, whereas deployed targets need not. Do not multiply scores into fractions. Recommendation for activation review: normalized nonnegative probability weights on simulated integer support, deterministic mean calibration with a feasibility check and effective sample size. Alternative: enforce only the generative expected mean, which relaxes the requested empirical equality. Neither is selected here; require an explicit executable definition before starting. |
| B02 | 3 | Pace window/distribution, opponent adjustment, smoothing, touchdown conversion scoring, safety beneficiary, regulation/overtime, team dependence and mean-matching operation are not specified here. Recover qualified existing interfaces after E-PFF; hash an explicit model/parameter inventory. Reuse them where possible, otherwise obtain a batched definition approval before adding fitted parameters. No hidden Poisson/independence/7-point-TD/default prior choice. |
| B03 | 3 | Qualified injury-timestamp history, conditional starter/backup scoring rates and missing-history behavior for (b) are not established by this request. Inventory season/team coverage before fitting; pin earlier-fold designation play-rate tables. Missing history cannot silently change the candidate or eligible population. Recommend keeping (b) blocked until qualified rather than inventing rates. |
| B04 | 3 | “As in E-UNC” could inherit its no-worsening Winkler gate, while the current request explicitly names CRPS, coverage and point invariance. Resolve this together with whether margin/total distributions change and thus which inherited coverage gates apply. Recommendation: retain no-worsening Winkler at both levels and the standing margin/total coverage checks; do not claim this unstated interpretation has been approved. |

Tier 3 gaps block EXECUTION, not this authorized queue registration. No new user decision is needed merely to reserve E-MC's requested place. Sources: work/projection-governance-v2/DECISION-LATENCY.md, GOVERNANCE.md, CONFIDENCE-AND-PREMISE.md, work/e-unc/registration.json, work/engine-rebuild/MEAN-CONTRACT.md.

## Required implementation/acceptance tests, deferred with the experiment

1. Refuse activation unless both actual predecessor reports are hash-verified, authoritative control passes premise verification, Tuesday closeout is published, and the executable gap addendum is resolved and hashed.
2. Across every eligible game, both arms preserve team/margin/total point forecasts versus control to 1e-12; team MAE is unchanged. Distribution means meet the separately resolved exact-mean contract; positive normalized weights and nonnegative integer support are checked independently.
3. Exactly 10,000 simulations per game, stored reproducible seed, deterministic output under training-row and drive reordering. Exercise low-score, rare safety, overtime, infeasible mean, degenerate pace/rates and extreme probability fixtures.
4. QB mixture rates reproduce the training-fold designation table; verify backup/starter branches and mixture mean without future starter leakage. Fail on unqualified input rather than silently substitute.
5. Check CRPS, threshold probabilities and central interval quantiles independently from saved distributions; retain both teams together in uncertainty resampling and compare identical eligible games.
6. Floor is invariant to drive ordering, conditioned on fixed inputs, and reproducible from saved seed/rates. Season chart matches the saved floor artifact, labels SD separately from MAE, preserves version/time provenance and shows named shortfalls.
7. Separation tests forbid market fields and future data in all new modules; no report triggers fitting. No release before the unchanged governing review/promotion requirements are satisfied.

## Registration status

No E-MC fits, draws, comparisons, performance claims, gate decisions, releases or Season-page changes have been made. The registration and its source evidence are hash-pinned; predecessor receipts and executable details remain explicit dependencies.

Least certain: the exact-mean integer simulation convention; it stays unresolved rather than silently distorting the score support.

Confidence: near-total in the recorded queue order and hash-verified historical variance arithmetic, meaning arithmetic on verified records; lower to high if independent hash/row reconstruction disagrees. This is not confidence that E-MC will improve forecasts.
