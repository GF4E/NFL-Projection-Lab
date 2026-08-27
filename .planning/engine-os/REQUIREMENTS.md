# Prediction Engine OS Requirements

## Scope

These requirements cover the statistical and operational engine behind the predictions site. They do not cover interface redesign, user picks, or wager execution.

Status notation:

- `[ ]` not yet accepted
- `[x]` accepted with reproducible evidence
- Existing code is an input to a requirement, not proof that the requirement is complete.

## 1. Canonical engine kernel

- [x] **ARC-01 — Preserve the evidence base.** Freeze the Module 1 and Module 2 protocols, code, manifests, inputs, negative results, and hashes without relabeling a rejected model as a candidate.
- [x] **ARC-02 — One operational authority.** D1 and R2 are the only production state stores; the Supabase job path is retired or isolated so it cannot execute.
- [ ] **ARC-03 — Migration-only schema.** Every persistent D1 object is created and changed by ordered migrations; production stores cannot create tables at runtime.
- [x] **ARC-04 — Explicit execution planes.** Source ingestion, research, model packaging, forecast publication, evaluation, and serving have written interfaces and one owner each; expensive fitting is outside the public Worker.
- [x] **ARC-05 — Read paths are inert.** A public read cannot trigger ingestion, fitting, archival, provider requests, writes, or quota spend.

## 2. Point-in-time evidence spine

- [ ] **DATA-01 — Immutable raw evidence.** Exact source response bytes, secret-redacted request metadata, source and receipt times, validity interval, schema, content hash, and usage rights are retained in content-addressed storage; credentials, cookies, authorization headers, and secret-bearing error bodies are never persisted.
  - OS-03A contribution: the provider-independent D1/R2 mechanism passed exact-byte recovery, canonical secret-redacted request identity, content-addressed response and sidecar storage, deterministic deduplication, append-only manifest/event history, usage-rights metadata, corruption quarantine, failure atomicity, last-good preservation, and provider-offline replay. DATA-01 remains open until OS-03 imports and qualifies the live source population and production retention/recovery path.
- [ ] **DATA-02 — Temporal identity registry.** Games, teams, franchises, players, venues, provider events, and market contracts resolve through canonical, append-only, as-of identities.
- [ ] **DATA-03 — Unified connector contract.** Every source follows `fetch -> preserve -> parse -> validate -> stage -> publish` with idempotent snapshot keys.
- [ ] **DATA-04 — Validation and quarantine.** Stale, partial, schema-invalid, corrupt, or incomplete inputs are quarantined; dependent products preserve their last good version and expose why they are stale.
- [ ] **DATA-05 — Point-in-time replay.** A forecast origin deterministically selects only observations available by that origin; later corrections never rewrite an earlier reconstructed view.
- [ ] **DATA-06 — Registered feature and label factory.** Historical and live rows use the same versioned definitions, availability rules, imputation rules, units, transformations, and hashes.
- [ ] **DATA-07 — Independently reconciled Module 2 targets.** Score, regulation-possession, overtime, and required Module 2 edge-case targets are checked against a preregistered independent sample of official gamebooks before they may support Module 2B.

## 3. Reproducible research laboratory

- [ ] **LAB-01 — Frozen protocol registry.** Experiments move through `draft -> frozen -> running -> protocol_invalid | reject_all | shadow_eligible`; a frozen protocol cannot be edited.
- [ ] **LAB-02 — Chronological evaluation.** Training and testing follow season and week order, use one declared forecast origin, and fit every transformation inside its training fold.
- [ ] **LAB-03 — Common scored manifest.** Every candidate in a comparison is evaluated on identical games and targets; missing or duplicate candidate rows invalidate the comparison.
- [ ] **LAB-04 — Complete probabilistic scorecard.** Proper losses, calibration, coverage and width, distribution diagnostics, paired uncertainty, runtime, and failures are stored at game, fold, season, and pooled levels.
- [ ] **LAB-05 — Falsification suite.** Removal ablations, negative controls, truncated-source tests, same-week isolation, synthetic edge cases, and a leakage audit run as part of the experiment.
- [ ] **LAB-06 — Deterministic artifact bundle.** A locked runtime emits canonically serialized predictions, metrics, audits, environment data, and scientific hashes that reproduce bit-for-bit.
- [ ] **LAB-07 — Portable model package.** Python can export a package whose schema, transforms, parameters, training boundary, dependencies, and content hash are verified before TypeScript inference.
- [ ] **LAB-08 — Honest research history.** Negative results remain queryable, 2025 remains labeled research-exposed, and no retrospective slice is promoted as untouched confirmation.

## 4. Forecast and evaluation ledgers

- [ ] **LED-01 — Market-free forecast ledger.** Football forecasts can be generated and stored when odds are absent or stale; market inputs cannot change the archived football distribution.
- [ ] **LED-02 — Separate market and comparison ledgers.** Exact quotes are immutable evidence and football-versus-market comparisons are derived artifacts, never overwrites.
- [ ] **LED-03 — Complete pre-kickoff archive.** Every scheduled game and required horizon has a timestamped forecast or an explicit withholding record before kickoff.
  - OS-15A contribution: the dormant provider-free scheduler can produce exactly one timely qualification-only withholding for each of the five OS-02A horizons under duplicate, overlap, lease-loss, reschedule, and missed-tick tests. The requirement remains open until OS-13A proves complete activated production coverage with immutable provenance.
  - Rejected OS-13A attempt: the 2026-08-27 run stopped before implementation after a credential-boundary violation in an independent audit. It contributes no evidence toward LED-03.
- [ ] **LED-04 — Correction-safe settlement.** Regulation scores, overtime, pushes, voids, source corrections, and grading changes retain append-only lineage.
- [ ] **LED-05 — All-game evaluation is authoritative.** Model quality is measured on all eligible forecasts, not site selections or human adjustments.
- [ ] **LED-06 — Prospective 2026 confirmation stream.** Every activated 2026 shadow forecast is stored before kickoff under a frozen package and scored without retroactive replacement; activation after Week 1 is labeled partial-season shadow evidence and is never backfilled or called full-season confirmation.
  - OS-03A contribution: immutable evidence and later-import mechanics are qualified for provider-independent fixtures, but no activation or prospective forecast exists. LED-06 remains wholly gated by OS-13A, an eligible frozen package or explicit withholding contract, and the package-scoped prospective gates.

## 5. Possession architecture decision

- [ ] **POS-01 — Exact Module 2B test.** Compare only D0 kernel `{0.15, 0.70, 0.15}` with D1 `{0, 1, 0}` while retaining the frozen Module 2 target, rows, P0, P1, losses, and rules; exclude P2 and all new features.
- [ ] **POS-02 — Frozen mechanism and forecast gates.** Require the preregistered variance, coverage, paired NLL, energy/CRPS, and zero-failure thresholds with no post-run routing.
- [ ] **POS-03 — Terminal possession result.** Publish `reject_all`, `shadow_eligible`, or `protocol_invalid` with complete artifacts and preserve the failed branch if rejected.
- [ ] **POS-04 — Architecture checkpoint.** Record an ADR choosing possession continuation, target redesign, or direct score modeling before any drive-outcome implementation begins.

## 6. Separately testable football components

- [ ] **FB-01 — Drive-state ontology.** Regulation drives and terminal states are reconstructed and reconciled independently, with overtime stored separately.
- [ ] **FB-02 — Drive-outcome baseline.** A market-free, regularized drive-outcome model must beat declared football-only baselines out of sample before it becomes a component.
- [ ] **FB-03 — Dynamic team state.** Offense and defense evolution is estimated chronologically and must add stable paired value beyond partial pooling.
- [ ] **FB-04 — Quarterback availability.** Starter probability and scenario data quality are estimated separately from quarterback performance effect.
- [ ] **FB-05 — Quarterback and player effects.** Quarterback, line, receiver, defender, and role effects use leakage-safe as-of participation and cross-fitting; each family faces a separate ablation gate.
- [ ] **FB-06 — Special teams and field position.** Kicking, punting, returns, turnovers, and starting-field-position effects enter only through separately evaluated modules.
- [ ] **FB-07 — Context families.** Rest, travel, surface, roof, weather, coaching, and schedule effects are tested in isolated preregistered families rather than one feature dump.
- [ ] **FB-08 — Clock, regulation, and overtime.** Possession timing, end-of-half behavior, kneels, game-state rules, ties, and era-specific overtime are explicit simulation mechanics.

## 7. Joint football-only score engine

- [ ] **SCORE-01 — Earned composition.** The compiler may use only modules that passed their own gate or were explicitly declared nuisance components before the comparison.
- [ ] **SCORE-02 — Normalized joint distribution.** The engine emits a valid joint home-away score distribution, not just two point estimates.
- [ ] **SCORE-03 — Coherent derived outcomes.** Win, tie, margin, total, means, quantiles, covariance, and cover/push/total probabilities on fixed model-independent grids reconcile to the same joint distribution; actual posted contracts and prices enter only in the market layer.
- [ ] **SCORE-04 — Integration falsification.** Component removal, double-counting checks, residual diagnostics, era checks, and scenario sensitivity seek to invalidate the assembled engine.
- [ ] **SCORE-05 — Frozen football decision.** The engine earns `reject_all` or prospective `shadow_eligible` under a preregistered scorecard; complexity is rejected when its gain is unstable.

## 8. Market and value measurement

- [ ] **MKT-01 — Exact contract archive.** Opener, forecast-time, and last valid pre-kickoff quotes retain book, market, selection, point, price, capture time, source time, and availability.
  - OS-03A contribution: a market-response fixture passed exact-byte storage, redacted request identity, deduplication, manifest, failure, and replay behavior without dispatching a provider request. MKT-01 remains open because no authenticated live quote or normalized exact contract was captured.
- [ ] **MKT-02 — Valid market math.** Two-way markets use power de-vigging and different points are translated with data-derived discrete margin probabilities before price or EV comparison.
- [ ] **MKT-03 — Post-freeze benchmark.** The frozen football model and frozen market baseline are compared on identical games and timestamps only after the football decision.
- [ ] **MKT-04 — Separate blend and value research.** Shrinkage, CLV, EV, and sizing are offseason experiments; they do not redefine football confidence or train on selected outcomes.
- [ ] **MKT-05 — Provenance-sensitive sentiment.** Public, consensus, or reference-market claims require source-population, timestamp, latency, and missingness validation and remain shadow signals until they pass.

## 9. Confidence and human learning

- [ ] **CONF-01 — Reliability vector.** Confidence is represented by predictive coverage, ensemble disagreement, data quality, distribution shift, and scenario sensitivity, not by model-market disagreement or one opaque score.
- [ ] **CONF-02 — Scenario robustness.** Forecasts identify robust, fragile, and indeterminate conclusions across plausible pregame scenarios without pretending scenario probabilities are known when they are not.
- [ ] **CONF-03 — Decision evidence.** Outputs expose material model contributions, uncertainty, known failure regimes, and the observation most likely to change the forecast.
- [ ] **CONF-04 — Human judgment is auditable and separate.** Manual interpretation and overrides are immutable annotations that can be reviewed but never become football-model training labels.
- [ ] **CONF-05 — Controlled learning loop.** Weekly state changes follow frozen rules; drift can alert or withhold, coefficient changes require a logged gate, and structure changes only in offseason review.

## 10. Operations, serving, and public release

- [ ] **OPS-01 — One durable job graph.** Ingestion, canonicalization, features, fitting, packaging, forecasting, settlement, evaluation, and publication use deterministic keys, leases, checkpoints, retries, and explicit dependencies.
  - OS-15A contribution: deterministic scheduler ticks/jobs, fenced renewable leases, retries, bounded watchdog recovery, and a versioned no-replay cutover contract are qualified for the interim forecast-or-withholding node only. Full graph ownership, compute isolation, checkpoints, and scheduler retirement remain OS-15 work.
- [ ] **OPS-02 — Isolated batch compute.** Full-history refits, bootstraps, and large replays run in an authenticated compute environment with bounded resources, not on public requests.
- [ ] **OPS-03 — Atomic last-good publication.** A failed or partial job cannot replace valid inputs, forecasts, model pointers, or site snapshots.
  - OS-15A contribution: lease-losing and stale workers cannot publish an origin record, deadline failures become explicit nonprospective or withheld outcomes, and the dormant production schema is empty. Cross-store source, package, forecast-output, and site-snapshot atomicity remain open under OS-03A, OS-13A, OS-15, and OS-20.
  - OS-03A contribution: response and sidecar objects publish before a verified manifest pointer; failed uploads, failed manifests, partial input, stale confirmations, and corrupt pointed objects preserve or explicitly stale the last-good source head. Package, forecast-output, and site-snapshot atomicity remain open under OS-13A, OS-15, and OS-20.
- [ ] **OPS-04 — Precomputed read-only API.** The site reads versioned publication snapshots with no fitting, source fetch, large join, or mutation in the request path.
- [ ] **OPS-05 — Monitoring without silent adaptation.** Freshness, schema, latency, quota, calibration, coverage, drift, job, and package failures create observable alerts and never trigger unlogged retuning.
- [ ] **OPS-06 — Recovery qualification.** Backup, restore, rollback, provider-outage, stale-source, corrupt-object, partial-import, and degraded-model drills pass before release.
- [ ] **OPS-07 — Public security and licensing.** Secrets are rotated and scanned, personal access and pick state are removed, routes are least-privilege, and every published dataset and logo has a documented usage basis.
  - OS-13A incident: a read-only audit accessed the dormant provider credential through an overbroad environment inventory. No provider request, quota mutation, repository secret write, or activation occurred, but the credential must be rotated and the clean successor must prohibit environment-secret access in delegated audits.
- [ ] **OPS-08 — Cost and capacity controls.** Storage, compute, egress, provider quota, and schedule simulations have budgets, alerts, throttling rules, and an essential-work reserve.
- [ ] **OPS-09 — Reproducible public repository.** A clean clone can migrate, test, replay a fixture, verify preserved artifacts, and build the engine from documented locked dependencies.
- [ ] **OPS-10 — Separate readiness gate.** Scientific promotion, operational qualification, and public-serving release are independent decisions; passing one never implies the others.

## Traceability

| Roadmap phase | Requirement IDs | Count |
|---|---|---:|
| 1. Canonical engine kernel | ARC-01, ARC-02, ARC-03, ARC-04, ARC-05 | 5 |
| 2. Point-in-time evidence spine | DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07 | 7 |
| 3. Reproducible research laboratory | LAB-01, LAB-02, LAB-03, LAB-04, LAB-05, LAB-06, LAB-07, LAB-08 | 8 |
| 4. Forecast and evaluation ledgers | LED-01, LED-02, LED-03, LED-04, LED-05, LED-06 | 6 |
| 5. Possession architecture decision | POS-01, POS-02, POS-03, POS-04 | 4 |
| 6. Separately testable football components | FB-01, FB-02, FB-03, FB-04, FB-05, FB-06, FB-07, FB-08 | 8 |
| 7. Joint football-only score engine | SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05 | 5 |
| 8. Market and value measurement | MKT-01, MKT-02, MKT-03, MKT-04, MKT-05 | 5 |
| 9. Confidence and human learning | CONF-01, CONF-02, CONF-03, CONF-04, CONF-05 | 5 |
| 10. Operations, serving, and public release | OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06, OPS-07, OPS-08, OPS-09, OPS-10 | 10 |
| **Total** | **Every requirement mapped once** | **63** |
