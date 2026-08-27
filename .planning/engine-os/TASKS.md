# Prediction Engine OS Task Register

This is the execution register. A work package is complete only when its acceptance gate has reproducible evidence. Existing code may satisfy part of a package, but it must still pass the gate. Before implementation, an epic-sized package is split into bounded issues naming inputs, produced artifact paths, an exact verification command, evidence location, and rollback or failure behavior.

## Status legend

- **NEXT** — ready for the next implementation cycle
- **PLANNED** — dependency is understood and work is queued
- **CONDITIONAL** — cannot start until a statistical decision authorizes it
- **VERIFY EXISTING** — substantial code exists, but it has not passed the OS acceptance gate
- **BLOCKED** — a named gate prevents work
- **ACCEPTED** — the acceptance gate has reproducible, immutable evidence

## Immediate execution queue

1. Preserve accepted **OS-00**, frozen **OS-00B**, terminal R1-v1, frozen **R0**, and deployed **OS-01A** evidence.
2. Preserve the accepted bounded provider-independent storage-mechanism slice of **OS-03A** and execute **OS-13A** next.
3. Finish **OS-18A** provider authentication and final scans; complete R1-v2's independent human review on its separate research lane.
4. **OS-19A**, **OS-02A**, bounded provider-free **OS-15A**, and the provider-independent OS-03A storage mechanism are accepted. Finish **OS-13A** and the remaining OS-18A gates before authenticated capture. Full OS-01/OS-02/OS-03 proceed behind them.
5. **R2** may execute only the Module 2B residual-kernel falsification and only after R1-v2 passes, followed by **R3**.
6. Continue the platform spine through **OS-14** regardless of whether the possession branch survives.
7. Start **R4 through R12** only for the decomposition branch authorized by R3; use **R3A** or **R3B** for the other branches.
8. Start **R16 and R17** only after R13 returns `shadow_eligible`; exact quote acquisition remains disabled until OS-13A, the live OS-03A connector slice, and provider-authentication gates pass and is not deferred to R16.

## Primary requirement ownership

Requirement references inside task cards show contribution. Only the primary owner below may mark a requirement accepted; supporting tasks provide evidence to that owner.

Prospective evidence is non-transferable. Every package-specific R14, R15, and R18B instance is keyed by `package_hash + config_hash + input_schema_hash + activation_boundary + sample_manifest_hash`. Evidence from another package, configuration, activation, or sample cannot qualify it.

| Requirements | Primary owner |
|---|---|
| ARC-01, ARC-02, ARC-04, ARC-05 | OS-00 |
| ARC-03 | OS-01 |
| DATA-01 | OS-03 |
| DATA-02 | OS-02 |
| DATA-03 | OS-04 |
| DATA-04 | OS-05 |
| DATA-05 | OS-06 |
| DATA-06 | OS-07 |
| DATA-07 | R1 |
| LAB-01 | OS-09 |
| LAB-02, LAB-03, LAB-06 | OS-10 |
| LAB-04, LAB-05 | OS-11 |
| LAB-07 | OS-12 |
| LAB-08 | R0 |
| LED-01, LED-02, LED-03 | OS-13 |
| LED-04, LED-05 | OS-14 |
| LED-06 | R15 |
| POS-01, POS-02, POS-03 | R2 |
| POS-04 | R3 |
| FB-01 | R4 |
| FB-02 | R5 |
| FB-03 | R6 |
| FB-04 | R7 |
| FB-05 | R8; R9 contributes a separate non-QB family |
| FB-06 | R10 |
| FB-07 | R11 |
| FB-08 | R12 |
| SCORE-01–SCORE-05 | R13 |
| MKT-01 | OS-04; OS-03A supplies the non-recoverable raw evidence |
| MKT-02, MKT-03 | R16 |
| MKT-04, MKT-05 | R17 |
| CONF-01, CONF-02, CONF-03 | R14B |
| CONF-04 | R15 |
| CONF-05 | R18A |
| OPS-01, OPS-02, OPS-03 | OS-15 |
| OPS-04 | OS-20 |
| OPS-05 | OS-17 |
| OPS-06 | OS-16 |
| OPS-07 | OS-18 |
| OPS-08 | OS-19 |
| OPS-09, OPS-10 | OS-21 |

## Platform lane

### OS-00 — Freeze the operating-system contract

**Status:** ACCEPTED

**Requirements:** ARC-01, ARC-02, ARC-04, ARC-05

**Depends on:** None

**Outcome:** Preserve current Model Lab evidence and establish D1/R2, one scheduler, and explicit execution planes as the only active production architecture.

**Deliverables:**

- Content-addressed inventory of Module 1 and Module 2 code, protocols, raw-source manifest, artifacts, and results.
- ADR assigning every table, object, job, module, and secret to Git, R2, D1, Worker, or the compute runner.
- Retirement or hard quarantine plan for `src/server/jobs/runner.ts` and the Supabase path.
- Request-path audit and removal of public-read calls to background maintenance.
- Research status record preserving `reject_all`, the C0/P0 benchmark roles, exposed seasons, and the authorized Module 2B question.

**Acceptance gate:** A clean clone verifies every retained scientific hash; no state or scheduler has dual authority; public GET tests show zero writes, provider calls, or quota changes; the Supabase execution path is unreachable in the active build.

**Acceptance evidence:** `.planning/engine-os/execution/os-00/r2-durability-receipt.v1.json` binds the exact source and manifest hashes to 117 private R2 objects (630,716,255 bytes), a clean remote-clone reconstruction, full verification/build results, corruption drills, and retirement of the temporary operator with unchanged Odds quota.

### OS-00B — Freeze the numerical operating contract

**Status:** FROZEN

**Requirement contribution:** ARC-04, OPS-03, OPS-04, OPS-06, OPS-08

**Depends on:** OS-00

**Outcome:** Replace implicit operational expectations with versioned numerical targets before recovery, capacity, or serving work claims to pass.

**Deliverables:** A frozen contract with no `TBD` values for required forecast horizons and eligibility, reschedules and late jobs, maximum source and served-snapshot age, forecast completeness, API latency/availability/payload, RPO, RTO, backup frequency, retention, provider quota, compute, storage, and egress budgets.

**Acceptance gate:** Every OS-16, OS-19, OS-20, and OS-21 drill or service test references a versioned target from this contract; a target change creates a new version and cannot rewrite prior qualification evidence.

### OS-01 — Establish migration-only schema authority

**Status:** EPIC; OS-01A is urgent

**Requirements:** ARC-03

**Depends on:** OS-00

**Outcome:** One ordered migration history defines the entire production D1 schema.

**Deliverables:** Complete migrations, schema-version check, schema-drift test, forward migration rehearsal, rollback/restore procedure, and removal of runtime production `CREATE TABLE` statements.

**Acceptance gate:** A blank D1 reaches the full schema through migrations; its schema matches the declared schema; CI catches drift; `rg "CREATE TABLE"` finds no production runtime DDL outside migrations or test fixtures.

#### OS-01A — Migrate the urgent capture and origin ledger

**Status:** DEPLOYED urgent slice; OS-01 full-schema acceptance remains pending

**Requirement contribution:** ARC-03, LED-03

**Depends on:** OS-00

**Outcome:** Create the smallest migration-only D1 slice required to preserve 2026 capture health and forecast-or-withheld records while OS-01 continues.

**Deliverables:** Ordered migrations for source-capture heartbeat/manifest pointer, canonical game-origin seed tables, forecast-or-withheld rows, immutable output pointers, leases/idempotency, quota state, and schema version; forward and rollback fixtures.

**Acceptance gate:** A blank D1 applies the slice with migrations only; duplicate keys are idempotent; append-only constraints reject mutation; rollback restores the prior schema without deleting R2 evidence; OS-01 later absorbs the slice without redefinition.

### OS-02 — Canonicalize identities, time, and forecast origins

**Status:** EPIC; OS-02A is urgent

**Requirements:** DATA-02

**Depends on:** OS-01

**Outcome:** Every game, franchise, team, player, venue, provider event, and market contract has a temporal identity valid at a declared UTC origin.

**Deliverables:** Canonical identity tables, temporal alias history, unresolved-identity queue, local-zone metadata, reschedule rules, Tuesday-origin utility, and provider reconciliation fixtures.

**Acceptance gate:** Source IDs map deterministically or remain explicitly unresolved; reschedules retain game identity; DST tests pass; Week W views cannot include Week W evidence; identity history is append-only.

#### OS-02A — Establish game, kickoff, reschedule, and origin identity

**Status:** ACCEPTED

**Requirement contribution:** DATA-02, LED-03

**Depends on:** OS-01A

**Outcome:** Resolve only the identities and time rules required for honest 2026 pre-kickoff capture, without waiting for full player and venue identity work.

**Deliverables:** Canonical game key, provider-game aliases, kickoff UTC/local zone, reschedule history, Week W membership, required forecast origins, eligibility, and same-week exclusion fixtures.

**Acceptance gate:** Every scheduled 2026 game resolves or is explicitly unresolved; reschedules append rather than overwrite; origins obey OS-00B and DST rules; a late or postponed game cannot be assigned an earlier eligible origin.

**Acceptance evidence:** `.planning/engine-os/execution/os-02a/acceptance-receipt.v1.json` binds the pinned 272-game schedule to 1,360 five-horizon origin identities, append-only reschedule and provider-alias guards, DST/same-week/late-game fixtures, the three-revision eligibility ratchet, an independent pass, live D1 migration 0015, and a clean fail-closed Sites deployment with unchanged Odds quota.

### OS-03A — Start immutable 2026 evidence capture

**Status:** ACCEPTED — bounded provider-independent storage-mechanism slice only; live connectors and prospective capture remain open

**Requirement contribution:** DATA-01, MKT-01, LED-06

**Depends on:** OS-00; scheduled authenticated market capture additionally depends on OS-15A, OS-18A, and OS-19A

**Outcome:** Preserve otherwise-ephemeral 2026 source evidence while the canonical schema and identity layers are still being built.

**Deliverables:** Append-only content-addressed R2 capture for schedules, football source updates, issued weather forecasts, official injury/inactive context, and exact opener/origin/pre-kickoff market responses; secret-redacted sidecar manifest; capture heartbeat and failure alert; later-import mapping into OS-03/OS-04.

**Security rule:** Persist exact response bytes but only a canonical redacted request. Never retain query-string API keys, authorization headers, cookies, credential-bearing headers, or secret-bearing error bodies. The object hash covers response evidence and the redacted request contract, not a secret.

**Acceptance gate:** A captured object and sidecar verify by hash; repeated responses deduplicate; capture failure alerts before the next required horizon; canonical identity may be linked later without changing original bytes or capture time; no secret scan finding exists in stored objects or manifests.

**Acceptance evidence:** `.planning/engine-os/execution/os-03a/acceptance-receipt.v1.json`, `local-qualification-receipt.v1.json`, and `sites-staging-proof-receipt.v1.json` bind contract v9, migration 0017, the provider-independent runtime, and 23 hosted phases to exact-byte recovery, deterministic deduplication, secret filtering, append-only manifests, pointer atomicity, corruption exclusion, failure alerts, last-good preservation, orphan handling, and provider-offline replay. The complete hosted protocol replayed twice with an identical receipt, 13 manifests, 48 events, 7 heartbeats, 16 alerts, 38/462 quota state, and zero provider calls, secret reads, reservations, or reservation events.

**Scope boundary:** This accepts only the provider-independent D1/R2 storage mechanism. The market phase used fixtures; no live connector or provider credential was exercised, migration 0017 was not applied to production, and no prospective capture stream started. Full OS-03A, DATA-01, MKT-01, LED-06, OS-03, and OS-04 remain open.

### OS-03 — Build the immutable raw-snapshot store

**Status:** PLANNED

**Requirements:** DATA-01

**Depends on:** OS-01

**Outcome:** Exact provider responses remain available for replay after normalization or provider deletion.

**Deliverables:** Content-addressed R2 keys; D1 manifest fields for redacted request identity, response, provider publication, receipt, validity, schema, ETag, size, license, and hashes; secret-filter tests; publish-before-pointer transaction; garbage/retry policy; importer for OS-03A objects.

**Acceptance gate:** Every manifest resolves to matching bytes; identical input deduplicates; corruption is detected; a D1 failure after upload cannot create a broken pointer; replay succeeds with the provider offline; requests and error records contain no credentials.

### OS-04 — Unify source connectors and staging

**Status:** VERIFY EXISTING

**Requirements:** DATA-03, MKT-01

**Depends on:** OS-03

**Outcome:** nflverse, official roster/injury/inactive context, venues/roof, Open-Meteo, and The Odds API use one atomic connector contract.

**Deliverables:** Shared connector interface, provider adapters, staged publication boundaries, source-specific fixtures, idempotency keys, freshness/completeness status, an enforced football-versus-market namespace boundary, and normalized exact-contract quote rows for every required opener/origin/pre-kickoff horizon captured by OS-03A.

**Acceptance gate:** Fixture, timeout, schema-change, partial-response, duplicate, and retry tests pass for each connector; a partial import never replaces last good data; no odds field can enter a football-only feature request; every expected market snapshot has book, market, selection, point, price, provider/source/capture times, availability state, and raw-object hash or an explicit missing record.

### OS-05 — Add data validation and quarantine

**Status:** VERIFY EXISTING

**Requirements:** DATA-04

**Depends on:** OS-04

**Outcome:** Bad data fails visibly without corrupting published forecasts or disappearing from the audit trail.

**Deliverables:** Dataset expectations for schema, counts, keys, ranges, integrity, missingness, freshness, and completeness; quarantine records; dependency stale propagation; last-good selection rules.

**Acceptance gate:** Known-good snapshots pass and injected schema drift, duplicate games, missing teams, invalid scores, partial inactives, stale schedules, and corrupt objects fail with reasons and hashes; quarantined inputs cannot enter replay.

### OS-06 — Build the point-in-time replay engine

**Status:** VERIFY EXISTING

**Requirements:** DATA-05

**Depends on:** OS-02, OS-05

**Outcome:** A forecast origin deterministically reconstructs only the evidence available at that time.

**Deliverables:** As-of selector distinguishing provider publication, capture, event-valid, and correction times; frozen precedence and clock-skew rules; explicit policy when original publication time is unavailable; replay manifest containing connector, parser, identity, and schema versions; correction versioning; same-week and truncated-source tests.

**Acceptance gate:** Repeat replay yields identical selected rows and hash; no maximum availability time exceeds origin; later corrections do not rewrite prior views; two consecutive completed weeks reproduce end to end.

### OS-07 — Create the feature and label definition registry

**Status:** PLANNED

**Requirements:** DATA-06

**Depends on:** OS-06; the label-registry portion also depends on R1's accepted target definitions

**Outcome:** Every model input and target has a versioned definition and availability contract.

**Deliverables:** Registry fields for name, namespace, type, unit, source fields, formula, availability, imputation, fold-local transformation, owner module, dependencies, and version; dependency validator.

**Acceptance gate:** Every model column resolves to a frozen registry entry; cycles, unknown units, missing availability rules, and unregistered imputations fail; football experiments cannot request market namespaces.

### OS-08 — Build origin-keyed offline and online feature products

**Status:** PLANNED

**Requirements:** DATA-06

**Depends on:** OS-07

**Outcome:** Research and scheduled inference consume the same definitions without allowing later backfill to alter an earlier row.

**Deliverables:** Versioned Parquet offline frames, compact D1 online rows, fold-local fit artifacts, source/schema/transform hashes, maximum source time, and missingness metadata.

**Acceptance gate:** Offline and online rows match within declared tolerance; repeated generation has identical hashes; every transform fits within its fold; later data cannot change an existing origin row; missingness never silently becomes zero.

### OS-09 — Implement the experiment and protocol registry

**Status:** VERIFY EXISTING

**Requirements:** LAB-01, LAB-08

**Depends on:** OS-07

**Outcome:** Statistical questions and their terminal results become immutable, queryable research records.

**Deliverables:** State machine, protocol schema, freeze hash, result linkage, negative-result ledger, exposed-data fields, and importers for Module 1 and Module 2.

**Acceptance gate:** Frozen records cannot mutate; incomplete protocols cannot run; a protocol-invalid run cannot publish a scorecard; imported negative results retain their original hashes and status.

### OS-10 — Build the deterministic experiment runner

**Status:** VERIFY EXISTING

**Requirements:** LAB-02, LAB-03, LAB-04, LAB-05, LAB-06

**Depends on:** OS-08, OS-09

**Outcome:** One command runs chronological folds and emits a complete, canonically hashed artifact bundle.

**Deliverables:** Locked Python environment; common-manifest executor; fold-local transforms; proper-loss, calibration, coverage, PIT, covariance, runtime, and failure ledgers; paired season/week-block inference; ablations, controls, leakage audit; canonical serializer; CI fixture replay.

**Acceptance gate:** Identical inputs produce identical scientific hashes; persisted metric rows retain type/null/NaN meaning; candidates have identical manifests; random splits and post-origin evidence are rejected; missing candidate rows abort comparison.

### OS-11 — Centralize evaluation and promotion gates

**Status:** VERIFY EXISTING

**Requirements:** LAB-04, LAB-05

**Depends on:** OS-10

**Outcome:** Scientific evidence is calculated once and model status changes only in a separate atomic decision.

**Deliverables:** Metric registry, paired uncertainty methods, calibration/coverage gates, stability criteria, falsifier execution, evidence packet, degraded-candidate fixtures, and scientific decision API.

**Acceptance gate:** Deliberately degraded, unstable, uncalibrated, leaky, or incomplete candidates are rejected; every decision reproduces from stored game metrics; rejected candidates remain queryable.

### OS-12 — Build the portable model-package registry

**Status:** PLANNED

**Requirements:** LAB-07

**Depends on:** OS-11

**Outcome:** A scientifically eligible Python artifact can be verified and executed by the production TypeScript runtime without reinterpretation.

**Deliverables:** Package manifest with a typed capability such as `possession_component`, `drive_component`, `joint_score`, `reliability_annotation`, or `market_layer`; inference contract, feature schema, transforms, parameters/state, training boundary, dependency lock, seeds, calibration, distribution interface, R2 storage, D1 metadata, Python exporter, TypeScript verifier/loader, atomic pointer, and rollback history.

**Acceptance gate:** Content and metadata hashes verify exactly before load; corrupted, rejected, incompatible, unregistered, or capability-mismatched packages fail closed; a fixture produces Python and TypeScript outputs within a manifest-declared numeric tolerance and identical categorical/support semantics; a component package cannot populate a joint-score publication; pointer changes atomically and rolls back.

### OS-13 — Separate forecast, market, and comparison ledgers

**Status:** EPIC; OS-13A is urgent

**Requirements:** LED-01, LED-02, LED-03, LED-06

**Depends on:** OS-13A, then OS-13B

**Outcome:** The market-free model can make and preserve its own pregame claim regardless of odds availability.

**Deliverables:** Football forecast record, withholding record, market snapshot record, model-market comparison record, scheduled horizons, package/input/origin hashes, large-distribution object pointer, last-good behavior, and prospective 2026 mode.

**Acceptance gate:** Odds absence does not block football archival; every scheduled game/horizon has a forecast or withholding before kickoff; attaching a quote cannot mutate the football record; replay is idempotent.

#### OS-13A — Start the append-only forecast-or-withheld ledger

**Status:** NEXT; bounded provider-independent OS-03A storage and scheduler dependency OS-15A are accepted

**Requirement contribution:** LED-01, LED-03, LED-06

**Depends on:** OS-00B, OS-01A, OS-02A, OS-15A, R0, R18A

**Outcome:** Preserve the prospective stream now, before the portable package system is finished.

**Deliverables:** Minimal append-only rows for game, origin, generated-at time, `forecast | withheld`, enumerated withholding reason, capture health, activation boundary, package-scoped qualification key, and immutable R2 output pointer. A `forecast` requires non-null runner/code, model or package, configuration, input-manifest, feature/target schema, and output-object hashes. Missing provenance produces `withheld:provenance_incomplete`. A later job cannot backfill a pre-kickoff claim.

**Acceptance gate:** Every activated origin produces a pre-kickoff record or a contemporaneous withholding such as `no_eligible_package`; a forecast with any null or mismatched provenance field is rejected into withholding; its output pointer resolves to matching immutable bytes; records after kickoff are marked late and excluded; starting after Week 1 is labeled partial-season shadow evidence; no odds state can block the write.

#### OS-13B — Integrate verified packages and full distributions

**Status:** PLANNED

**Requirement contribution:** LED-01, LED-02, LED-03

**Depends on:** OS-06, OS-12, OS-13A

**Outcome:** Replace temporary artifact references with verified package inference and complete immutable distribution storage without rewriting OS-13A history.

**Deliverables:** Package verification, point-in-time input binding, large distribution object, compact summaries, market/comparison linkage, retry/idempotency logic, and migration of compatible OS-13A rows by append-only relation.

**Acceptance gate:** Package and input hashes verify before inference; Python/TypeScript parity passes; the original OS-13A record remains unchanged; market evidence attaches only through a comparison identity.

### OS-14 — Build correction-safe settlement and all-game scoring

**Status:** PLANNED

**Requirements:** LED-04, LED-05

**Depends on:** OS-13A; full probabilistic grading also depends on OS-13B

**Outcome:** Every eligible forecast is graded from authoritative results with append-only correction lineage.

**Deliverables:** Regulation/OT result schema, pushes/voids, settlement revisions, probabilistic game metrics, calibration/coverage bins, origin/season/regime summaries, and replacement of selected-play monitoring.

**Acceptance gate:** Corrections create new grades without erasing old ones; all-game aggregate metrics reproduce from game rows; selected opportunities and human annotations do not affect model evaluation.

### OS-15 — Introduce one durable orchestration DAG

**Status:** EPIC; bounded OS-15A slice accepted, full DAG queued

**Requirements:** OPS-01, OPS-02, OPS-03

**Depends on:** OS-00B, OS-01, OS-03, OS-12, OS-13, OS-14

**Outcome:** One scheduler coordinates ingestion through publication while heavy work runs in an isolated compute runner.

**Deliverables:** Job graph, deterministic run keys, dependency manifests, leases, retries, checkpoints, resource classes, compute-runner authentication, atomic promotion/publication, and scheduler retirement plan.

**Acceptance gate:** Duplicate invocations converge; partial runs resume; dependency failures preserve last good state; heavy fitting cannot execute in a public request or exceed Worker limits; no second scheduler can publish.

#### OS-15A — Qualify the interim 2026 capture scheduler

**Status:** ACCEPTED — bounded provider-free scheduler qualification

**Requirement contribution:** OPS-01, OPS-03, LED-03

**Depends on:** OS-00B, OS-01A, OS-02A; authenticated market jobs also depend on OS-18A and OS-19A

**Outcome:** Run the urgent raw-capture and forecast-or-withheld jobs at frozen origins without waiting for the full DAG cutover.

**Deliverables:** Deterministic schedule keys, lease, idempotent retry, heartbeat, provider-free dispatch boundary, late-run exclusion, missed-origin alert, no-backfill rule, and a cutover contract into OS-15. Authenticated quota preflight integration remains deferred.

**Acceptance gate:** Duplicate triggers create one record; expired leases recover safely; jobs after origin/kickoff cannot write a timely forecast; a missed job produces a contemporaneous failure/withholding; market jobs stop before violating OS-19A; full OS-15 later imports state without replaying history.

**Acceptance evidence:** `.planning/engine-os/execution/os-15a/acceptance-receipt.v1.json`, `sites-staging-proof-receipt.v1.json`, and `production-foundation-direct-audit-receipt.v1.json` bind the frozen v5 scheduler and cutover contracts to all five current OS-02A heads, distinct scheduled/invocation/evidence/persistence clocks, unique attempts, fenced renewable leases, strict deadline exclusion, duplicate and externally overlapping invocation convergence, bounded watchdog recovery, reschedule and unresolved-schedule cases, and qualification-only withholding on isolated owner-only D1. Production migration 0016 is deployed with empty scheduler tables, no activation, capture disabled, zero provider calls, and unchanged 38-used/462-remaining quota. A guarded direct-D1 audit also verified the accepted foundation objects and bootstrap after the bounded database-viewer projection proved stale; it made no repair or data mutation.

**Scope boundary:** This accepts OS-15A only. The bounded provider-independent OS-03A storage mechanism is separately accepted, but neither package accepts OS-13A, LED-03, OPS-01, OPS-03, full OS-15, prospective capture, provider dispatch, authenticated OS-19A integration, or a model package. OS-13A is the exact next platform task.

### OS-16 — Add chaos, backup, restore, and rollback qualification

**Status:** EPIC; OS-16B completes serving recovery after OS-20

**Requirements:** OPS-06

**Depends on:** OS-00B, OS-15

**Outcome:** Known failure modes are rehearsed, observable, and recoverable.

**Deliverables:** Backup schedule, clean-environment restore runbook, schema rollback, D1/R2 cross-store integrity verification, object-corruption drill, stale/missing/partial-provider drills, quota exhaustion, compute crash/restart, package rollback, and recovery evidence.

**Acceptance gate:** Each drill preserves or restores the last good publication, creates the expected alert, and proves cross-store integrity, lineage, RPO, and RTO against OS-00B without silent data loss.

#### OS-16B — Prove clean recovery of the serving layer

**Status:** BLOCKED by OS-20

**Requirement contribution:** OPS-04, OPS-06

**Depends on:** OS-16, OS-20

**Outcome:** Restore D1, R2, the serving pointer, publication snapshot, and cache behavior into a clean environment and prove the versioned public API recovers coherently.

**Acceptance gate:** Restored API points only to retrievable matching artifacts; ETag and `stale-if-error` behavior pass; no mixed-version response is possible; recovery meets OS-00B RPO/RTO and can roll back to the prior publication.

### OS-17 — Build engine observability

**Status:** VERIFY EXISTING

**Requirements:** OPS-05

**Depends on:** OS-14, OS-15

**Outcome:** Data, jobs, models, forecasts, packages, quotas, calibration, coverage, and drift expose machine-readable health without silent adaptation.

**Deliverables:** Structured events, run manifests, health summaries, failure taxonomy, source freshness, forecast completeness, package version, scientific metrics, drift alerts, quota alerts, and in-app/public status boundary.

**Acceptance gate:** Injected failures produce one deduplicated alert and correct stale state; monitoring never retunes a model; every public forecast resolves to its current health and run lineage.

### OS-18 — Harden security, secrets, and licensing for a public repository

**Status:** EPIC; OS-18A is urgent

**Requirements:** OPS-07

**Depends on:** OS-18A, OS-18B

**Outcome:** Public code reveals no credential or personal state and every redistributed asset or dataset has a documented basis.

**Deliverables:** Credential response, secret and PII controls, least-privilege routes, personal-state removal, and data/asset rights documentation.

**Acceptance gate:** Repository and built assets pass secret/PII scans; deployed secret is not present in Git; unauthenticated mutation routes fail; license inventory covers every distributed input and asset.

#### OS-18A — Rotate exposed credentials and scan history

**Status:** PARTIAL PASS; replacement secret is installed server-side, but provider authentication and final secret/client/history scans remain pending

**Requirement contribution:** OPS-07

**Depends on:** OS-00

**Outcome:** Revoke the Odds API credential exposed in chat and prove no active credential exists in code, Git history, stored request metadata, logs, artifacts, or client bundles.

**Deliverables:** Provider-side revoke/rotate confirmation, deployment-secret update, Git and artifact scan report, built-client scan, redaction regression test, and incident note. If provider rotation requires owner action, the task remains blocked and public ingestion is disabled rather than reusing the exposed key.

**Acceptance gate:** Old key fails, replacement works only server-side, scans return no active secrets, and no browser response or source map includes the key.

#### OS-18B — Complete public-route, PII, and licensing hardening

**Status:** PLANNED

**Requirement contribution:** OPS-07

**Depends on:** OS-03, OS-20, OS-18A

**Outcome:** Qualify the public repository and deployed read service for anonymous use without personal collaboration state or unsupported redistribution.

**Deliverables:** Least-privilege route/auth audit, rate-abuse review, removal of owner/Jarrett access and pick state, environment template, data/logo/license inventory, attribution, and takedown process.

**Acceptance gate:** Unauthenticated mutations fail; personal state is absent from public data and code paths; license inventory covers each redistributed dataset and asset; repository and built outputs pass final PII/secret scans.

### OS-19 — Add cost, quota, and capacity controls

**Status:** EPIC; OS-19A is urgent

**Requirements:** OPS-08

**Depends on:** OS-00B, OS-03, OS-15

**Outcome:** Essential forecasts remain within provider and infrastructure budgets under the actual NFL schedule.

**Deliverables:** Storage/egress/compute accounting, odds-credit meter, schedule simulation, throttle order, reserve, alerts, retention tiers, and batch resource ceilings.

**Acceptance gate:** Full-season and quota-reset simulations fit budgets; alerts and throttling occur at frozen thresholds; openers, essential pre-kickoff inputs, and prospective forecasts retain reserved capacity.

#### OS-19A — Enforce the urgent odds quota and reserve guard

**Status:** ACCEPTED urgent slice; authenticated capture remains blocked by the live OS-03A connector slice, OS-13A, and OS-18A

**Requirement contribution:** OPS-08, MKT-01

**Depends on:** OS-00B

**Outcome:** Prevent the urgent capture lane from exhausting The Odds API allowance before essential opener/origin/closing snapshots.

**Deliverables:** Response-header usage ledger, preflight projected-use check, hard ceiling, reserve, frozen throttle order, deduplicated alert, and fail-closed behavior when quota state is missing.

**Acceptance gate:** Schedule simulation respects OS-00B; duplicate calls do not double-count; ordinary snapshots throttle in the frozen order; essential reserve cannot be consumed by nonessential work; absent or stale quota state blocks the call and alerts.

### OS-20 — Build the versioned read model and public API

**Status:** PLANNED

**Requirements:** OPS-04

**Depends on:** OS-00B, OS-13, OS-14, OS-17

**Outcome:** The predictions site reads one precomputed publication snapshot and cannot cause engine work.

**Deliverables:** Versioned response schema and compatibility policy, atomic serving pointer, ETag and `stale-if-error` cache policy, compact public response, enumerated stale/withheld fields, maximum snapshot age, CORS/rate limits, payload ceiling, version endpoint, rollback, and request-path budget tests.

**Acceptance gate:** Reads perform no provider request, fit, large join, or mutation; responses identify publication/package/input versions; CORS, rate, payload, maximum-age, compatibility, cache, and rollback tests pass; latency and availability meet OS-00B.

### OS-21 — Establish prospective readiness and release gates

**Status:** PLANNED

**Requirements:** OPS-09, OPS-10

**Depends on:** OS-16B, OS-18, OS-19, OS-20, R13 status `shadow_eligible`, R14B, R15B for that exact `joint_score` package, and R18B; R18C is additionally required if market/value fields are included

**Outcome:** Scientific eligibility, prospective shadow evidence, operational qualification, champion selection, and public release remain separate recorded decisions.

**Deliverables:** Clean-clone CI, fixture replay, migration test, artifact verification, capability-typed release manifest, release checklist, prospective completeness report, operational scorecard, champion packet, explicit inclusion/exclusion of market fields, and atomic release/rollback decision.

**Acceptance gate:** A clean clone passes the documented build; OS-21 verifies the same R13 `joint_score` package hash, config hash, input-schema hash, activation boundary, and frozen sample-manifest hash across R14B, R15B, and R18B; every required game in that sample is forecast or withheld before kickoff; operational and serving-recovery drills pass; a `possession_component` or other component package cannot populate prediction endpoints; unqualified market fields are absent; no package becomes champion or public merely because it passed a retrospective scientific gate.

## Statistical research lane

### R0 — Freeze the research constitution and prospective contract

**Status:** FROZEN

**Requirements:** LAB-01, LAB-08, LED-06

**Depends on:** OS-00

**Outcome:** One immutable document states targets, Tuesday origin, forbidden features, fold rules, losses, uncertainty, confirmation seasons, promotion language, and the rule that negative results stay negative.

**Acceptance gate:** Hash is recorded before R2 fitting; 2025 is labeled exposed; 2026 is the next prospective confirmation stream from its actual activation date; C0 and P0 are benchmarks only; site selections and market evidence are forbidden football features; every new family, slice, hyperparameter attempt, or changed endpoint consumes a new exposed experiment identity under a frozen discovery-versus-confirmation policy.

### R1 — Independently reconcile score and possession targets

**Status:** TERMINAL `protocol_invalid` for R1-v1; R1-v2 frozen and awaiting four distinct natural-person roles

**Requirements:** DATA-07

**Depends on:** OS-00 and preserved source cache

**Outcome:** Determine whether the already-frozen regulation score, regulation-possession, overtime, and Module 2 edge-case labels agree with official gamebooks independently of the modeling code. Drive targets are excluded until R4 freezes their ontology.

**Deliverables:** Before any gamebook review, hash a preregistration containing sampling strata, sample size, agreement statistic, severe-error definition, thresholds, reviewer independence, adjudication rules, and excluded cases. Then produce the double-entry review sheet, discrepancy taxonomy, adjudicated truth rows, agreement metrics, and target-definition decision.

**Acceptance gate:** The frozen agreement and severe-error thresholds pass; otherwise this experiment identity ends as `protocol_invalid`. R1-v1 ended for reviewer-independence failure and cannot be edited or resumed. R1-v2 is the separately hashed successor; it requires two independent reviewers, a separate adjudicator, a non-reviewing identity coordinator, commit-reveal identity and entry freezes, blinded discrepancy handling, truth freeze, and verified unblinding before it can pass.

### R2 — Run Module 2B residual-kernel falsification

**Status:** BLOCKED; R1-v2 is frozen but no successor audit has passed

**Requirements:** POS-01, POS-02, POS-03

**Depends on:** R0, R1

**Outcome:** Learn whether the independent smoothing kernel caused enough of Module 2's overdispersion to justify retaining P1 research.

**Frozen comparison:** D0 `{0.15, 0.70, 0.15}` versus D1 `{0, 1, 0}` only. Parent v8 code hash is `6ea88ae5a609ef4dac85aa28e4f39785b86c2a32d456c34bf220ae17ed23efd6`; any difference outside the preregistered kernel experiment invalidates the protocol. Keep the joint home/away regulation target, Tuesday 7:30 a.m. Pacific origin, Week W−1 cutoff, no within-week refresh, rows, P0, P1, residual ledger, decay, support, pseudocount, losses, resampling, and leakage rules unchanged. Store overtime occurrence and possessions separately. Exclude P2 and all new features.

**Required scorecard:** Joint negative log loss, multivariate energy score, home/away/total/difference CRPS, count MAE and RMSE, 50/80/95% coverage and width, randomized discrete PIT, predicted/observed mean-variance-covariance, runtime, numerical bounds, and failures on identical games. Use the frozen paired season and week-block bootstrap, its confidence levels, same-week isolation, truncated-source, negative controls, synthetic possession edges, and leakage audit. Define `ΔNLL = NLL(P0-D1) − NLL(P1-D1)`, so positive favors P1-D1.

**Acceptance gate:** Mechanism success requires at least 0.30 reduction in absolute difference-variance error and marginal 80% coverage in `[0.72, 0.88]` with clustered intervals containing 0.80. Forecast success requires `ΔNLL >= 0.01` nat and at least 1%, every frozen paired lower bound above zero, no energy or individual CRPS regression above 0.5%, no team MAE regression above 0.05 possession, no required diagnostic/ablation/leakage failure, and zero forecast failures. Publish one terminal status and later import it into OS-09/OS-10 without changing the source artifacts.

### R3 — Record the possession architecture decision

**Status:** BLOCKED by R2

**Requirements:** POS-04

**Depends on:** R2

**Outcome:** Choose the next statistical architecture instead of automatically adding more features.

**Branches:**

- Mechanism failure: kill the residual-kernel path and choose target redesign or direct score modeling.
- Mechanism passes but P1 fails: retain P0 as benchmark, kill P1 development, and choose target redesign or direct score modeling.
- Both pass: package P1-D1 for prospective shadow only and authorize the next decomposition module.

**Acceptance gate:** Accepted ADR names the branch, evidence, killed ideas, retained benchmark, next target, and what result would reverse the choice.

### R3A — Redesign and validate the possession target

**Status:** CONDITIONAL on the R3 target-redesign branch

**Requirement contribution:** POS-04

**Depends on:** R3 selects target redesign

**Outcome:** Preregister one revised possession estimand and reconstruction rule because the target, not another feature family, is the hypothesized failure source.

**Deliverables:** New ontology and estimand, official-gamebook audit, synthetic edge fixtures, new experiment identity, naive baseline, simplest challenger, chronological scorecard, and a return ADR.

**Acceptance gate:** The target audit passes before fitting; comparison uses no exposed favorable slices; result is terminal and returns to R3 for a new branch decision. A failure cannot fall through automatically to R4.

### R3B — Test a direct market-free joint-score baseline

**Status:** CONDITIONAL on the R3 direct-score branch

**Requirement contribution:** SCORE-01, SCORE-02, SCORE-04

**Depends on:** R3 selects direct score modeling

**Outcome:** Preregister and test the smallest defensible direct joint-score architecture without first assuming a possession/drive decomposition.

**Deliverables:** A written architectural difference and falsifier relative to rejected Module 1, naive football score baseline, regularized direct-count challenger, optional dynamic challenger only if preregistered, chronological common-manifest evaluation, calibration, paired uncertainty, ablations, leakage audit, and package decision.

**Acceptance gate:** If no defensible pre-run difference from Module 1 exists, do not rerun used architecture; otherwise stable out-of-sample improvement and calibration pass or all challengers are rejected. A passing result enters R13 integration validation, while a rejection returns to R3 rather than adding features.

### R4 — Define and validate the drive-state target layer

**Status:** CONDITIONAL

**Requirements:** FB-01

**Depends on:** R3 explicitly selects the possession/drive decomposition branch

**Outcome:** Build a regulation drive ontology with explicit kickoff, punt, field goal, turnover, defensive/special-teams score, safety, onside, kneel, no-play, half-ending, game-ending, and overtime treatment.

**Acceptance gate:** Synthetic edge cases and an independent official-gamebook sample pass; unresolved severe target errors stop R5.

### R5 — Test the market-free drive-outcome baseline

**Status:** CONDITIONAL

**Requirements:** FB-02

**Depends on:** R4

**Outcome:** Compare naive and partially pooled football baselines with the simplest regularized drive-outcome challenger on chronological folds.

**Acceptance gate:** Stable paired out-of-sample improvement, calibrated outcome probabilities, complete common manifest, ablations, leakage audit, and zero silent failures; otherwise retain the simpler baseline or reject all.

### R6 — Test dynamic offense and defense state

**Status:** CONDITIONAL

**Requirements:** FB-03

**Depends on:** R5

**Outcome:** Determine whether a leakage-safe dynamic state adds stable predictive value beyond partial pooling and season effects.

**Acceptance gate:** Preregistered state evolution, offseason variance, and identifiability tests pass; paired gain is stable across seasons and removal ablation; otherwise reject the dynamic layer.

### R7 — Build quarterback availability scenarios

**Status:** CONDITIONAL

**Requirements:** FB-04

**Depends on:** R4 plus OS-08-qualified as-of roster, participation, snap, injury, and inactive products

**Outcome:** Estimate who will start and the quality of that information without estimating the quarterback's scoring effect in the same model.

**Acceptance gate:** Availability probabilities are prospectively calibrated, source-complete, timestamp-correct, and beat declared roster-status baselines; otherwise mark the scenario unresolved.

### R8 — Test quarterback performance effect

**Status:** CONDITIONAL

**Requirements:** FB-05

**Depends on:** R6, R7

**Outcome:** Estimate starter-to-alternative effects using cross-fitted, opportunity-adjusted historical evidence and propagate availability scenarios.

**Acceptance gate:** Incremental held-out gain, stable shrinkage, counterfactual sanity checks, scenario calibration, and availability/effect separation pass; otherwise exclude the QB effect.

### R9 — Test non-quarterback player roles

**Status:** CONDITIONAL

**Requirements:** FB-05

**Depends on:** R6 plus OS-08-qualified temporal roster, participation, snap, injury, and role products

**Outcome:** Evaluate line, receiver, running back, defender, and unit continuity as preregistered families rather than individual star-name features.

**Acceptance gate:** Each family clears paired incremental gain, role-probability calibration, removal ablation, missingness stress, and multiple-comparison control; failed families stay out.

### R10 — Test special teams and starting field position

**Status:** CONDITIONAL

**Requirements:** FB-06

**Depends on:** R4, R5

**Outcome:** Model kicking, punting, returns, touchbacks, turnovers, and starting field position without double-counting offensive or defensive drive strength.

**Acceptance gate:** Era rules, rare events, calibration, component ablations, and held-out score gain pass; otherwise keep only the necessary simulation mechanics.

### R11 — Test isolated context families

**Status:** CONDITIONAL

**Requirements:** FB-07

**Depends on:** R6 plus OS-08-qualified as-of venue, surface, roof, issued-weather, coaching, rest, travel, and schedule products; a missing family blocks only that family

**Outcome:** Test rest/travel, venue/surface/roof, weather, coaching, and schedule families one at a time.

**Acceptance gate:** Each family has frozen availability and missingness rules, paired held-out evidence, a plausible mechanism, and distribution-shift stress; no pooled feature dump is allowed.

### R12 — Implement and falsify clock, regulation, and overtime mechanics

**Status:** CONDITIONAL

**Requirements:** FB-08

**Depends on:** R4, R5, R10

**Outcome:** Simulate regulation timing, end-of-half choices, kneels, trailing/leading pace, ties, and era-specific overtime separately from score fitting.

**Acceptance gate:** Synthetic rule fixtures, era transitions, regulation/OT separation, total-possession and scoring-tail calibration, and removal tests pass.

### R13 — Compile and test the joint football-only score engine

**Status:** BLOCKED by the R3-selected architecture

**Requirements:** SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05

**Depends on:** Either accepted/retained components from R4–R12, or a passing R3B direct-score candidate; a target-redesign branch must complete R3A and return through R3 first

**Outcome:** Produce and separately store a normalized regulation score distribution, overtime transition, and final-score distribution, then test them against naive and regularized football-only baselines.

**Acceptance gate:** Win/tie, margin, total, means, quantiles, covariance, and cover/push/total probabilities on fixed model-independent grids reconcile to the stored distributions; actual contracts remain absent; tail truncation has a frozen error bound; common-manifest proper scores, calibration, coverage, paired uncertainty, integration ablations, double-counting checks, era diagnostics, and leakage audit pass. Terminal result is `reject_all` or `shadow_eligible`.

### R14 — Build and validate the reliability and scenario-sensitivity model

**Status:** EPIC; definition and prospective qualification are separate

**Requirements:** CONF-01, CONF-02, CONF-03

**Depends on:** R14A, R15B, R14B

**Outcome:** Estimate a reliability vector from coverage, ensemble disagreement, data quality, distribution shift, and scenario sensitivity and identify robust, fragile, indeterminate, or withheld conclusions.

**Acceptance gate:** Each dimension has a measurable definition and passes its frozen prospective calibration test; market disagreement is excluded; one opaque composite score is not used.

#### R14A — Define reliability dimensions and freeze validation

**Status:** CONDITIONAL on any frozen `shadow_eligible` forecast package

**Requirement contribution:** CONF-01, CONF-02, CONF-03

**Depends on:** Frozen candidate distribution and OS-14 evaluation schema

**Outcome:** Define coverage, ensemble disagreement, data quality, distribution shift, and scenario sensitivity separately and preregister how prospective evidence will qualify each dimension.

**Deliverables:** Package-scoped qualification key, definitions, estimator inputs, missingness behavior, robust/fragile/indeterminate/withheld rules, calibration targets, sample requirements, scenario protocol, and hash. Retrospective cross-validation may diagnose but cannot complete prospective qualification.

**Acceptance gate:** Every dimension is independently computable and falsifiable; market disagreement and candidate disagreement alone are excluded; validation protocol freezes before inspecting the R15 qualification sample.

#### R14B — Grade prospective reliability calibration

**Status:** BLOCKED by the R15B qualification sample

**Requirements:** CONF-01, CONF-02, CONF-03

**Depends on:** R14A and the exact matching R15B qualification key and sample boundary

**Outcome:** Determine whether the reliability labels have empirical coverage and useful discrimination prospectively.

**Acceptance gate:** Each dimension and categorical state passes its frozen calibration, coverage, failure, and completeness thresholds or is rejected/withheld; no threshold is changed after viewing the qualification outcomes; result records the same package, config, schema, activation, and sample hashes as R14A/R15B.

### R15 — Run the 2026 prospective shadow archive

**Status:** EPIC; capture and grading are separate

**Requirements:** LED-06, CONF-04, CONF-05

**Depends on:** R15A, then R15B

**Outcome:** Store every frozen candidate forecast before kickoff and grade it without in-season structural changes. If no candidate qualifies, OS-13A continues storing contemporaneous `withheld:no_eligible_package` records.

**Acceptance gate:** Every activated game/origin is forecast or explicitly withheld before kickoff; package/config/input hashes are immutable; all-game metrics and failures are complete; human notes and selected outcomes remain outside training; activation after Week 1 is labeled partial-season shadow and is not backfilled or called full-season confirmation.

#### R15A — Activate and store prospective shadow forecasts

**Status:** CONDITIONAL on any `shadow_eligible` package, including R2 or R13

**Requirement contribution:** LED-06, CONF-04

**Depends on:** OS-00B, R18A, OS-13A, OS-15A, a frozen eligible package or explicitly frozen audited runner, and capture heartbeat monitoring; OS-13B is required before public inference

**Outcome:** Store forecasts before kickoff without waiting for settlement or reliability grading. If no candidate qualifies, OS-13A continues contemporaneous `withheld:no_eligible_package` records.

**Deliverables:** Frozen package/config/schema/activation identity, append-only forecast manifest, immutable output hashes, and the prospective sample key that R15B must retain.

**Acceptance gate:** Every activated origin has a timely immutable forecast with complete provenance or a timely withholding; late records are excluded; activation boundary, package capability, and qualification key are frozen; human annotations cannot modify the forecast.

#### R15B — Settle and grade the frozen prospective sample

**Status:** BLOCKED by R15A outcomes

**Requirements:** LED-06

**Depends on:** R15A, OS-14, and the exact preregistered package/config/schema/activation identity

**Outcome:** Grade the exact frozen prospective sample after outcomes arrive without altering its membership or forecasts.

**Acceptance gate:** All eligible records settle with correction lineage; missing outcomes fail visibly; game-level and aggregate probabilistic metrics reproduce; completeness and failure rates include withheld and operational misses; no post-outcome inclusion choice is possible; the frozen sample manifest completes the same qualification key created by R15A.

### R16 — Add the frozen market baseline

**Status:** BLOCKED by R13

**Requirements:** MKT-02, MKT-03

**Depends on:** R13 status `shadow_eligible` and the point-in-time quote archive begun by OS-03A

**Outcome:** Compare the football-only distribution with power-de-vigged, point-translated exact contracts on identical games and times.

**Acceptance gate:** Close and forecast-time definitions are frozen; quote completeness and latency pass; point translation precedes comparison; paired proper-score and calibration results reproduce; football artifacts remain unchanged.

### R17 — Test blending, value, CLV, and sentiment evidence

**Status:** BLOCKED by R16

**Requirements:** MKT-04, MKT-05

**Depends on:** R16 and sufficient prospective market history

**Outcome:** Evaluate offseason-only shrinkage, discrete pricing, exact-book EV/CLV, and provenance-sensitive public/reference signals as separate decision-layer experiments.

**Acceptance gate:** No result is promoted from selection ROI alone; all-game probability and CLV evidence are separate; sentiment sources pass population/timestamp/latency audits; failed rules cannot alter the football model.

### R18A — Freeze the preseason football lifecycle

**Status:** NEXT after R0 and OS-00B

**Requirements:** CONF-05

**Depends on:** R0, OS-00B

**Outcome:** Before the first activated shadow forecast, freeze the season's structural configuration, weekly state-update permissions, withholding rules, and challenger protocol independently of market research.

**Acceptance gate:** Features, hyperparameters, transformations, calibration, and structural artifacts cannot change in season; weekly state uses only completed prior weeks; stale/partial data preserves last good output; if this gate misses Week 1, the season is explicitly partial-shadow and ineligible for full-season confirmation claims.

### R18B — Make the post-prospective football champion decision

**Status:** BLOCKED by prospective evidence

**Requirement contribution:** CONF-05, OPS-10

**Depends on:** R15B, R14B, OS-15, OS-17, all carrying the exact same package/config/schema/activation/sample qualification key

**Outcome:** Apply the frozen prospective scientific gate and the separate operational gate without using market-layer success as a condition for football-model status.

**Acceptance gate:** Decision reproduces from the preregistered all-game ledger; data, code, config, feature, package, activation, sample, and decision hashes are complete and match R14B/R15B; retrospective or other-package results cannot substitute for missing prospective evidence; rollback is proven.

### R18C — Freeze the separate market-layer lifecycle

**Status:** BLOCKED by R16 and R17

**Requirement contribution:** MKT-04, MKT-05, OPS-10

**Depends on:** R16, R17

**Outcome:** Establish offseason-only promotion and seasonal freeze rules for shrinkage, value, CLV, and sentiment without changing the football champion.

**Acceptance gate:** Market-layer promotion uses its own prospective evidence and hashes; it cannot alter football features, package, confidence, or champion status; in-season retuning is blocked.

## Explicitly not authorized yet

- No drive-outcome code unless R3 selects the decomposition branch.
- No new P2 features, conditional routing, or total/difference smoother in Module 2B.
- No quarterback, player, weather, coaching, sentiment, or market feature added to rescue a rejected football model.
- No market comparison or value research unless R13 returns `shadow_eligible`; exact quote capture continues regardless.
- No production promotion from retrospective evidence.
- No interface work under this task register.
