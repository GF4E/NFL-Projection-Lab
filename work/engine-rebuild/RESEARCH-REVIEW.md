# Rebuild prompt research and review

Status: Ready within reviewed scope. Complete review of the 12-section replacement specification; implementation and future forecast gains are not certified. The user requested research and rewriting, not activation. PROMPT-researched.md remains a draft; no policy, experiment, scheduler or release was changed.

Reviewed on September 21, 2026 Pacific. Used the Data plugin's index, metric-design and analytical-validation guidance, the existing authoritative audit/requirements, primary forecasting research, primary production engineering guidance and source data documentation. No external reviewer or subagent opinion is represented as having occurred. No fresh live-game or host-health measurement is asserted in this rewrite.

## Changes after adversarial review

| Risk in the previous prompt | Rewritten provision | Evidence and check |
| --- | --- | --- |
| Uncertainty-only changes face an impossible 1% point-MAE improvement requirement | Explicit, narrow proposed E-CAL-LINEAGE CRPS gate and exact point invariance; not a silent reuse of E-UNC's one-off exception | Algebra: identical point forecasts have identical MAE; proper-scoring literature supports scoring distributions separately |
| Repeatedly backtesting until a result passes may fit the evaluation set | Fixed registrations, trial ledger, historical reuse disclosure, separate prospective comparison and no weekly significance-peeking trigger | Cawley/Talbot; rolling-origin guidance |
| “Expected score,” median and distribution center are conflated | Mean target, unchanged MAE policy, explicit legacy labeling, compatible distribution identities and registered numerical migration | FPP3 accuracy; constructed median-sum and mean/winner counterexamples |
| Earlier stadium-local timestamp rule misreads source semantics | Documented Eastern timezone to UTC, DST and source-format fixtures | nflseedR data dictionary; constructed 3-hour error example |
| Kickoff +4h described as proof of physical completion | Retained eligibility proxy, separate observed final availability and historical-vintage caveat | Source availability semantics and existing governance; no actual completion timestamp invented |
| “Exactly once” implied across non-idempotent external requests | Atomic committed effects, stable work keys, payload consistency, receipt reconciliation and bounded provider retries | AWS idempotency contract; Google data-pipeline guidance |
| Retries worsen resource exhaustion; research competes with locks | Bounded recovery, production priority, measured capacity, durable checkpoints and no extra paid shadow pulls | SRE overload/retry principles; audited resource constraint |
| Last-good fallback can conceal stale data or change frozen predictions | Original timestamps, named failure, immutable original bundles, linked corrections and compatible release rollback | Audit provenance requirements; operational safety reasoning |
| Unit tests treated as production success | Passive comparison on captured production inputs, operational canary and actual host/readback verification | Google SRE canary/data-pipeline guidance; ML Test Score |
| Operational repairs, chronology changes and methods share one ambiguous gate | Three explicit release lanes and new authority only after corrected production/control verification | Existing governance and audit |
| Self-improvement silently bypasses human reviews or restarts rejected models | Preserved reviewer prerequisites, explicit dependency status, queue clock and specified new registrations only | Current protocol and user decisions |
| Prompt can finish while a required statistical objective never ships | Reliability readiness, experiment disposition and achieved accuracy/coherence objectives reported separately | Acceptance-path review: rejected calibration cannot count as completed migration |

The proposed E-CAL gate, queue priority, mean-target convention and source-timezone correction are explicit adoption decisions, not changes already made. The exact 1% and three-percentage-point thresholds are governance choices; the cited papers do not establish them as universally optimal.

## Primary evidence and applicability

1. [Cawley and Talbot, 2010](https://www.jmlr.org/papers/v11/cawley10a.html). Selection can overfit finite-sample evaluation criteria, with effects comparable to differences between algorithms. Supports preregistration, trial accounting and caution about recycled evaluation results. Does not supply a universal weekly promotion threshold.
2. [Forecasting: Principles and Practice — rolling-origin evaluation](https://otexts.com/fpp3/tscv.html). Each evaluation forecast must use earlier observations only. Applied to preprocessing, tuning, calibration and the actual issuing workflow; a historical replay is not proof of historical source-publication times.
3. [Forecasting: Principles and Practice — point accuracy](https://otexts.com/fpp3/accuracy.html). Absolute loss targets a median, squared loss a mean. Supports an explicit target and supporting RMSE while preserving Gabe's MAE selection policy. It does not imply a mean forecast cannot be evaluated with MAE.
4. [Gneiting and Raftery, 2007](https://sites.stat.washington.edu/raftery/Research/PDF/Gneiting2007jasa.pdf), and [FPP3 distribution accuracy](https://otexts.com/fpp3/distaccuracy.html). Proper distribution scores and interval scores assess uncertainty beyond point error or coverage alone. Supports a distinct calibration evaluation; it does not prove a new calibration family is needed or that the proposed candidate will pass.
5. [Google SRE — data processing pipelines](https://sre.google/workbook/data-processing/). Covers freshness/completeness targets, checkpoints, idempotent staged mutations and processing real data without production writes. Applied selectively to this single-worker engine, not as a request for Google's infrastructure scale.
6. [AWS Builders' Library — safe retries](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/). Caller request identity and atomic side-effect recording make supported APIs safe to retry. Local keys alone cannot establish an upstream paid provider's guarantee.
7. [Google SRE — canarying releases](https://sre.google/workbook/canarying-releases/). Release-specific operational comparisons catch failures beyond isolated tests. Here a passive, isolated-output comparison precedes bounded operational exposure. Operational canaries do not establish predictive superiority.
8. [Breck et al., 2017 — ML Test Score](https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/). Production ML needs tests and monitoring beyond offline model evaluation. Supports coverage of data, interfaces, validation and monitoring; no claim that a rubric certifies this unbuilt system.
9. [nflseedR — Lee Sharpe games dictionary](https://nflseedr.com/reference/load_sharpe_games.html). gametime is Eastern irrespective of venue; location distinguishes neutral sites. This directly corrects the earlier stadium-local interpretation.

Repository evidence: work/engine-audit-2026-09-21/REPORT.md and REBUILD.md, work/projection-governance-v2/GOVERNANCE.md, ANALYTICS-SCOPE.md and CONFIDENCE-AND-PREMISE.md. Current user amendments supersede stale queue passages. Prior audit measurements remain scoped to their frozen dates and populations.

## Review coverage and remaining uncertainty

| Review area | Assessment |
| --- | --- |
| All 12 prompt sections | Reviewed for purpose, conflicts, dependencies and acceptance evidence; revisions incorporated |
| Point/distribution mathematics | Four constructed counterexamples checked by independent elementary calculations; counterexamples.json records outcomes |
| Source timezone | Provider dictionary inspected; Eastern versus stadium-local conversion demonstrated |
| Gate and authority boundaries | Proposed amendments called out; no automatic policy activation; no MAE exception generalized silently |
| Operational design | Failure paths and limits mapped to tests; actual rebuild not implemented or fault-tested in this request |
| Reproducibility and historical evidence | Prior verified audit reused within its scope; no new engine fit, full replay or live season calculation performed |
| Dashboard rendering and interaction | N/A: requested artifact is a written implementation prompt; source receipt is delivery metadata, not a dashboard |
| Predictive superiority | Unproved until registered evaluation and prospective evidence; high confidence in requirements is not high confidence in an unknown effect size |

Pass 1 reviewed statistical validity; pass 2 tested recovery, authority and chronology failure cases; final consistency review checked new amendments against the one-method clock, unchanged standard point gate and preserved issued records. No additional rewrite is justified solely to increase the confidence adjective. Reopen this review only for a concrete new conflict, source fact or failed acceptance case.

Confidence: high in the revised specification's methodological safeguards and completeness within this scope. High means its central requirements are supported by the cross-season audit and survive the obvious statistical and operational counterexamples reviewed here. This is not a claim that implementation already works or future MAE improves. Lower to medium if an independent review identifies an unresolved authority conflict, a leakage path, or a recovery path that can change committed evidence. Production resilience and predictive gains remain separately unverified.
