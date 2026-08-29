# Prediction Engine OS Roadmap

## Summary

- [ ] **Phase 1 — Canonical engine kernel:** preserve the existing evidence, choose one control plane, centralize schema authority, and make reads inert.
- [ ] **Phase 2 — Point-in-time evidence spine:** make every source, identity, target, and feature replayable as of a forecast origin.
- [ ] **Phase 3 — Reproducible research laboratory:** turn frozen protocols into deterministic, portable experiment and model packages.
- [ ] **Phase 4 — Forecast and evaluation ledgers:** store football forecasts independently and grade every eligible game prospectively.
- [ ] **Phase 5 — Possession architecture decision:** run the one authorized kernel falsification and decide whether the possession branch lives or dies.
- [ ] **Phase 6 — Separately testable football components:** let drives, team state, quarterbacks, players, special teams, context, and clock mechanics earn inclusion one at a time.
- [ ] **Phase 7 — Joint football-only score engine:** compose only earned components into one coherent joint score distribution and try to invalidate it.
- [ ] **Phase 8 — Market and value measurement:** compare the frozen football engine with exact market evidence without contaminating the football model.
- [ ] **Phase 9 — Confidence and human learning:** express reliability, scenarios, failure regimes, and human annotations without turning disagreement into confidence.
- [ ] **Phase 10 — Operations, serving, and release:** run one durable job graph, publish atomic read snapshots, rehearse recovery, and qualify the public engine.

## Dependency spine

```text
Capture lane:   Phase 1 -> OS-03A -------------------------------+
                   +-> OS-01A -> OS-02A -> OS-15A -> OS-13A ----|
                                                                  |
Platform lane:  Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 --------+
                   |                                             |
Research lane:     +-> R0 + R1 -> Phase 5 -> Phase 6 ------------+-> Phase 7
                                                                        |   |
                                                                        |   +-> Phase 8
                                                                        +-----> Phase 9
                                                                                  |
                                                                                  v
                                                                               Phase 10
```

Phase numbers describe capability layers, not a forced serial queue. Secret-redacted 2026 evidence capture and the append-only forecast-or-withheld ledger start before the full refactor so ephemeral evidence is not lost. The narrow Phase 5 experiment may run on the preserved laboratory after OS-00, R0, and R1 while the platform lane proceeds. Its result is later imported into the canonical registry. Phase 5 must end with an architecture decision before a decomposition module begins. Phase 8 requires a Phase 7 `shadow_eligible` football engine.

## Progress

| Phase | Status | Primary task set | Exit decision |
|---|---|---|---|
| 1 | In progress: OS-00 accepted; OS-01 Generation 10 hosted DDL and offline replay are bounded accepted; ARC-03 and OS-18A remain open | OS-00, OS-00B, OS-01A/OS-01, OS-18A, R0, R18A | One authoritative, preserved, numerically governed engine kernel |
| 2 | OS-02A and OS-19A accepted; bounded provider-independent OS-03A storage qualified; live capture and full canonicalization still queued | OS-02A, OS-03A, OS-19A, OS-02–OS-08, R1 | Replayable point-in-time evidence and verified targets |
| 3 | Queued | OS-09–OS-12 | Deterministic experiment and portable model packages |
| 4 | OS-15A accepted; the clean OS-13A successor accepts only the dormant append-only ledger mechanism; production activation, OS-13B, complete coverage, and grading remain queued | OS-15A, OS-13A, OS-13B, OS-14 | Independent prospective ledgers and all-game grading |
| 5 | Blocked: R1-v1 terminal `protocol_invalid`; R1-v2 awaiting human review | Complete R1-v2, then R2 and R3 only on a verified pass | Continue possessions, redesign target, or kill branch |
| 6 | Blocked by R3 branch | R3A or R3B, or R4–R12 | Selected architecture produces accepted modules/candidate or rejection |
| 7 | Blocked by selected architecture | R13 | Frozen football-only engine or `reject_all` |
| 8 | Blocked by R13 `shadow_eligible` | R16, R17 | Valid model-market and value evidence |
| 9 | Shadow archive starts with any eligible package | R14A, R15A, R15B, R14B | Prospectively qualified reliability layer |
| 10 | Queued foundation; final gate blocked | OS-15–OS-21 including OS-16B, R18B, R18C | Operationally qualified public release |

### Phase 1: Canonical engine kernel

**Goal:** Preserve the work already done and eliminate competing schema, database, scheduler, and request-side execution paths before adding another model.

**Dependencies:** None.

**Requirements:** ARC-01, ARC-02, ARC-03, ARC-04, ARC-05.

**Plans:**

1. Preserve accepted OS-00 evidence: every frozen object is content-addressed in private R2, D1/R2 are the production authority, Supabase is quarantined, and public reads are inert. The permanent recovery workflow remains OS-16 work and does not reopen OS-00.
2. Execute OS-00B and R0 to freeze numerical operating targets, the research constitution, multiplicity policy, candidate statuses, exposed seasons, forecast origins, losses, and prospective confirmation rule; then execute R18A before the first activated shadow forecast.
3. Execute OS-18A to revoke the exposed Odds API key, rotate the deployed secret, and scan repository history, artifacts, logs, and client bundles.
4. Preserve accepted urgent OS-01A and bounded OS-01 Generation 10 hosted-DDL/offline-replay evidence. Continue OS-01 with the frozen 28-table hosted foreign-key census, then row-count shards and the remaining schema-authority gates before migrating all persistent tables into one ordered history and forbidding runtime production DDL.

**Observable success criteria:**

- A clean clone can retrieve or verify every retained Module 1 and Module 2 artifact and obtain the same scientific hashes.
- Every persistent object and scheduled action has exactly one owner, source of truth, retention rule, and execution plane; operational SLO, RPO, RTO, retention, and cost targets contain no `TBD` values.
- A blank D1 instance reaches the complete schema through migrations alone, and CI detects schema drift.
- Public `GET` requests cause zero database writes, provider calls, model work, or quota usage.
- The active runtime cannot reach the old Supabase scheduler or storage path, and the exposed Odds key is revoked and absent from server/client artifacts.

### Phase 2: Point-in-time evidence spine

**Goal:** Make “what was knowable at forecast time” a reproducible data product instead of an assumption embedded in each script.

**Dependencies:** Phase 1.

**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07.

**Plans:**

1. Preserve the accepted bounded provider-independent OS-03A storage mechanism and the bounded mechanism-only OS-13A ledger. Live non-market connectors, authenticated quote capture, full OS-03A, and prospective activation still wait for full platform integration and the remaining OS-18A provider-authentication gate.
2. Preserve accepted OS-02A after OS-01A, then complete OS-02 and OS-03 in parallel to establish full temporal identities and canonical raw-object manifests; source bytes are preserved before identity resolution.
3. Execute OS-04 and OS-05 to route each provider through one connector, validation, quarantine, and atomic publication contract.
4. Execute OS-06, OS-07, and OS-08 to reconstruct as-of views, register definitions, and produce origin-keyed offline and online rows.
5. Execute R1 only after preregistering its audit, reconciling the frozen score, regulation-possession, overtime, and Module 2 edge targets; drives receive their own audit in R4.

**Observable success criteria:**

- Every published manifest row resolves to exact raw bytes with a matching hash even if the original URL disappears.
- All provider IDs resolve to a canonical as-of identity or a visible unresolved state; reschedules and franchise aliases do not rewrite history.
- Replaying the same origin and manifest produces identical selected observations, features, targets, missingness, and hashes.
- Injected partial, stale, corrupt, or schema-shifted inputs are quarantined while the last good product remains available and visibly stale.
- The independent gamebook audit meets its frozen agreement threshold or modeling stops for a target-definition decision.

### Phase 3: Reproducible research laboratory

**Goal:** Create one deterministic route from a frozen statistical question to a reviewable result and then, only if earned, a portable inference package.

**Dependencies:** Phase 2. The protocol registry may be scaffolded after Phase 1, but no candidate replay closes before the evidence spine passes.

**Requirements:** LAB-01, LAB-02, LAB-03, LAB-04, LAB-05, LAB-06, LAB-07, LAB-08.

**Plans:**

1. Execute OS-09 to implement the immutable experiment state machine and import Modules 1 and 2 as preserved negative results.
2. Execute OS-10 to lock the analytical runtime and generate canonical predictions, metrics, uncertainty, ablations, audits, and hashes from chronological origins.
3. Execute OS-11 to centralize score, calibration, coverage, stability, paired-inference, and leakage gates without mutating model status during calculation.
4. Execute OS-12 to export, verify, register, load, and roll back portable model packages across Python and TypeScript.

**Observable success criteria:**

- A frozen protocol cannot be edited; a changed question creates a new experiment identity.
- Two runs from the same inputs produce identical scientific hashes, including persisted metric rows and null/NaN handling.
- Every candidate is scored on the same game manifest and a missing, duplicate, or post-origin row invalidates the comparison.
- Deliberately degraded, unstable, uncalibrated, or leaky challengers are rejected with reproducible gate evidence.
- TypeScript inference rejects corrupted, unregistered, incompatible, or scientifically rejected packages.

### Phase 4: Forecast and evaluation ledgers

**Goal:** Store the football forecast as its own immutable claim, attach other evidence without changing it, and evaluate all games rather than selected decisions.

**Dependencies:** OS-13A starts after the minimal Phase 1 schema and identity work; complete package integration depends on Phases 2 and 3.

**Requirements:** LED-01, LED-02, LED-03, LED-04, LED-05, LED-06.

**Plans:**

1. Preserve accepted OS-15A, bounded provider-independent OS-03A storage, and the bounded mechanism-only clean OS-13A successor. Production activation must later prove every actual origin as a provenance-complete pre-kickoff forecast or contemporaneous withholding, never as a late backfill.
2. Execute OS-13B after OS-12 to bind verified packages, point-in-time inputs, large distributions, market evidence, and comparisons without rewriting OS-13A history.
3. Execute OS-14 to settle regulation and overtime outcomes with correction lineage and score all eligible forecasts.

**Observable success criteria:**

- A market-free forecast is archived on schedule when odds are missing or stale.
- Market snapshots and later comparisons cannot overwrite a football forecast, package, origin, or input manifest.
- Every activated scheduled game at every required horizon has either a provenance-complete pre-kickoff forecast with immutable output pointer or a coded withholding record; a late-season activation is labeled partial-season shadow evidence.
- Settlement distinguishes regulation, overtime, push, void, and later source correction while retaining every prior grade.
- Monitoring metrics reproduce from the all-game ledger and do not depend on selected opportunities or human notes.

### Phase 5: Possession architecture decision

**Goal:** Resolve the single known distribution-layer defect before investing in drive or player modules.

**Dependencies:** OS-00, R0, and R1. R2 may use the preserved audited Module 2 laboratory; its frozen result must be imported into OS-09/OS-10 later. Phase 4 must support prospective shadow storage before a `shadow_eligible` result can be acted on.

**Requirements:** POS-01, POS-02, POS-03, POS-04.

**Plans:**

1. Execute R2 as Module 2B: compare only the frozen D0 and D1 residual kernels with the same target, rows, P0, P1, losses, seeds, and leakage rules.
2. Publish the terminal result and complete evidence without adding P2, a total/difference smoother, player data, market data, or conditional routing.
3. Execute R3 as a written architecture checkpoint choosing one of three branches: continue the possession decomposition, run R3A target redesign, or run R3B direct joint-score modeling.

**Observable success criteria:**

- The pre-run protocol proves the kernel is the only changed statistical mechanism.
- Replayed D1 reduces absolute possession-difference variance error by at least 0.30 and achieves the frozen marginal coverage test, or the kernel path is killed.
- P1-D1 clears the frozen paired NLL, percentage gain, energy/CRPS, and zero-failure gates, or P1 development is killed.
- One immutable `reject_all`, `shadow_eligible`, or `protocol_invalid` result is recorded.
- No drive-outcome implementation begins until the R3 ADR is accepted.

### Phase 6: Separately testable football components

**Goal:** Build football structure as small falsifiable modules so a complex simulator cannot hide which information helps and which only fits noise.

**Dependencies:** Phase 5 R3 decision and Phase 2 evidence products. R4–R12 run only when R3 selects decomposition; target redesign runs through R3A and returns to R3; direct score modeling runs through R3B and may advance directly to Phase 7.

**Requirements:** FB-01, FB-02, FB-03, FB-04, FB-05, FB-06, FB-07, FB-08.

**Plans:**

1. If R3 selects target redesign, execute R3A and return its terminal evidence to R3; if R3 selects direct score modeling, execute R3B and skip unearned decomposition work.
2. Only for the decomposition branch, execute R4 and R5 for the drive-state target and the simplest regularized drive-outcome baseline.
3. Execute R6–R10 for dynamic team state, separately modeled quarterback availability/effect, non-quarterback roles, special teams, and field position.
4. Execute R11 and R12 for isolated context families and explicit regulation, clock, end-of-half, tie, and overtime mechanics.
5. Promote no component without its own common-manifest scorecard, paired uncertainty, calibration, ablations, leakage audit, and stable held-out gain.

**Observable success criteria:**

- Each module has a frozen target, forecast origin, input namespace, baseline, challenger, loss, falsifier, and promotion threshold before fitting.
- Availability and performance are not conflated, and no player or team state uses same-week or post-origin evidence.
- Every component has a removal ablation and a negative control; failed components remain preserved but cannot enter the compiler.
- Regulation and overtime behavior are separately testable and era-correct.
- The accepted component set is no larger than the evidence supports; an empty or sparse accepted set is a valid result.

### Phase 7: Joint football-only score engine

**Goal:** Compile the accepted football mechanisms into one normalized pregame score distribution and decide whether the whole is more predictive than simpler football baselines.

**Dependencies:** Either Phase 6 accepted/retained components or a passing R3B direct-score candidate, plus Phase 3 packaging and Phase 4 ledgers.

**Requirements:** SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05.

**Plans:**

1. Execute R13 to define and preregister the joint score compiler, nuisance assumptions, baselines, and component-integration ablations.
2. Validate separate regulation, overtime-transition, and final-score distributions with a frozen tail-error bound; means, covariance, wins, ties, margin, total, and fixed model-independent grid probabilities must reconcile. Actual posted contracts remain in Phase 8.
3. Run chronological rolling-origin comparison, calibration, paired uncertainty, era diagnostics, component removals, and failure-regime attacks.
4. Freeze a football-only `shadow_eligible` package only if every gate passes; otherwise retain the best simple benchmark or return `reject_all`.

**Observable success criteria:**

- Market prices, selections, line movement, and site outcomes are absent from every football feature and training manifest.
- Every derived probability reconciles numerically with the stored joint score grid.
- Removing any claimed value-adding component causes the preregistered degradation, while double-counting and negative-control tests pass.
- Calibration and predictive intervals meet their frozen out-of-sample criteria without post-hoc regime routing.
- The terminal football decision and complete package hashes are immutable before market comparison begins.

### Phase 8: Market and value measurement

**Goal:** Measure what the frozen football forecast adds relative to exact, time-aligned prices and whether a separate decision layer can describe value honestly.

**Dependencies:** Phase 7 status `shadow_eligible` and the point-in-time quote evidence captured since OS-03A.

**Requirements:** MKT-01, MKT-02, MKT-03, MKT-04, MKT-05.

**Plans:**

1. Execute R16 to freeze the market baseline, closing definition, power de-vigging, discrete point translation, and identical-game comparison.
2. Execute R17 to test offseason-only shrinkage, book-specific EV and CLV, and provenance-qualified public/reference signals as separate research objects.
3. Keep football quality, market-relative value, and selected-opportunity results in separate reports and ledgers.

**Observable success criteria:**

- Every market comparison resolves to an exact book contract and a quote available at the declared origin.
- Quotes at different spread or total points are translated before price, edge, or CLV comparison.
- Football and market forecasts are scored on identical games, targets, and timestamps with paired uncertainty.
- No sentiment or “sharp” label is published without a validated source population and latency record.
- A failed blend or value rule cannot alter the football package or be rescued by selection ROI.

### Phase 9: Confidence and human learning

**Goal:** Convert calibrated forecast evidence into a compact reliability and scenario layer that improves human judgment without overstating certainty.

**Dependencies:** Any frozen `shadow_eligible` distribution and Phase 4 forecast ledger. Market-relative annotations may be added after Phase 8 but are not confidence inputs.

**Requirements:** CONF-01, CONF-02, CONF-03, CONF-04, CONF-05.

**Plans:**

1. Execute R14A to define predictive coverage, ensemble disagreement, source quality, distribution shift, scenario sensitivity, categorical states, and the prospective validation protocol.
2. Execute R15A as soon as any package, including a passing R2 package, is `shadow_eligible`; capture does not wait for settlement or reliability qualification.
3. Store model contributions, failure regimes, falsifiers, and “what would change this forecast” records alongside but outside the score distribution.
4. Execute R15B after outcomes and OS-14 are available, then execute R14B on the preregistered frozen sample; reject reliability dimensions that fail prospective calibration.

**Observable success criteria:**

- Confidence never rises merely because the football model disagrees with a market or another candidate.
- Reliability dimensions are individually traceable to predictive coverage, data state, shift, ensemble, or scenario evidence.
- Human adjustments remain immutable annotations and never appear in a training manifest.
- Drift can alert, degrade, or withhold but cannot silently change features, hyperparameters, calibration, or structure.
- The 2026 archive contains only forecasts stored before kickoff and labels every missing forecast as an operational failure or explicit withholding; reliability and champion evidence carry the identical package/config/schema/activation/sample key.

### Phase 10: Operations, serving, and release

**Goal:** Operate the research-to-publication system predictably, recoverably, securely, and cheaply while keeping the site request path simple.

**Dependencies:** Platform foundations from Phases 1–4; final qualification follows Phases 7–9.

**Requirements:** OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06, OPS-07, OPS-08, OPS-09, OPS-10.

**Plans:**

1. Preserve the accepted provider-free OS-15A scheduler boundary and bounded OS-03A/OS-13A mechanisms; finish their live integration gates before activation, then execute OS-15 to import interim state without replay and replace overlapping schedulers with one durable DAG.
2. Execute OS-16 and OS-17 for chaos, backup, restore, rollback, freshness, calibration, coverage, drift, quota, and package monitoring; execute OS-16B after OS-20 to prove serving-layer recovery.
3. Complete OS-18B and OS-19 after the urgent OS-18A rotation to harden public routes, document data rights, remove personal state, and enforce frozen capacity budgets.
4. Execute OS-20 to publish one atomic, versioned, cacheable read model consumed by the site.
5. Execute OS-21, R18B, and R18C to separate football champion selection, market-layer lifecycle, prospective qualification, operational readiness, and public release.

**Observable success criteria:**

- A failed node retries idempotently, resumes from a checkpoint, and cannot publish over the last good artifact.
- Full-history replays and ensemble fitting cannot consume a public request budget or execute inside a read request.
- Backup restore, schema rollback, provider outage, corrupt object, partial import, model rollback, and stale-data drills all pass.
- A clean public clone can migrate, test, replay a fixture, verify preserved evidence, and build from locked dependencies without a secret; the site then serves one versioned precomputed snapshot with no provider fetch or model work.
- A package may be scientifically eligible yet operationally withheld; only an R13 `joint_score` package whose R14B, R15B, and R18B records share the exact qualification key may populate prediction endpoints, and the three decisions remain independently recorded.
