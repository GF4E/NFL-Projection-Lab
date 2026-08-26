# Prediction Engine OS State

## Current position

- **Roadmap status:** Executing; contracts are frozen and the urgent fail-closed spine is deployed
- **Current phase:** Phase 1 — Canonical engine kernel and prospective-evidence activation
- **Next platform task:** Complete OS-00 R2 durability and clean-clone restore, then finish OS-02A/OS-03A/OS-13A/OS-19A before any activation
- **Statistical next task:** Preserve terminal R1-v1 as `protocol_invalid`; R1-v2 is separately frozen and now waits for two independent human reviewers, a distinct adjudicator, and a non-reviewing identity coordinator; R2 Module 2B remains unauthorized
- **Evidence-capture urgency:** Exact-byte connector and forecast-ledger slices exist, but scheduled acquisition is deliberately disabled pending the remaining identity, quota, origin, and infrastructure gates
- **Production model status:** No validated market-free candidate
- **Interface status:** Out of scope
- **Deployment status:** The fail-closed Worker and urgent D1 schema are deployed and receipted; acquisition is disabled and no broader infrastructure acceptance is claimed

## Executed gates and evidence

- **OS-00 architecture/runtime:** Frozen in Git and locally verified. The evidence inventory covers 70 files, 620,780,101 bytes, and 33 source objects. The runtime assigns production state to D1/R2, removes Supabase packages and clients, tombstones the legacy job runner, rejects all mutating HTTP methods before Vinext, handles public APIs through explicit SELECT-only paths, and defaults scheduled acquisition to disabled.
- **OS-00 durability:** Small manifests and research decisions are in Git. Large Model Lab evidence and the 64 official R1 gamebooks still require R2 upload plus restore verification before the clean-clone clause is complete.
- **OS-00B:** Numerical operating contract frozen with no required `TBD` values.
- **R0:** Research constitution frozen and hashed before any R2 work. The 2025 season is exposed and 2026 is the next prospective stream.
- **R18A:** Preseason football lifecycle frozen and receipted. No package or prospective stream is activated by that receipt.
- **OS-18A:** The owner attests that the exposed Odds API key was regenerated and the replacement was staged. Repository quarantine and application credential-lane severance are complete. The replacement has deliberately not been read or exercised by this build, so server-only operation and live provider counters remain unverified. The active Worker does not bind a credential and acquisition remains disabled.
- **OS-01A:** The urgent migration, rollback fixture, append-only guards, and journal entry pass focused tests. D1 contains the append-only `0013_engine_os_urgent` receipt with schema hash `sha256:6205a3dfe09c2d663bb8c50378f295accd266ff2b2018668ca5353436a6797bb`; this proves only the urgent slice, not OS-01 acceptance.
- **OS-19A:** Atomic one-holder reservation, append-only quota epochs and transitions, ambiguous-charge reconciliation, reset detection, plan-hash binding, and the pinned actual-2026-schedule simulation pass locally. The exact plan contains 480 registered requests; throttling holds every tested reset-offset scenario to at most 399 allowed credits while preserving openers, Tuesday origins, kickoff-minus-60, and kickoff-minus-15 snapshots. Migration 0014 and deployed-D1 contention/rollback proof are still pending, so OS-19A is not accepted and the key remains unused.
- **OS-02A / OS-03A / OS-13A:** Partial implementation and focused tests only. Missing all-horizon origin completeness, final reschedule semantics, full capture/package qualification, and deployed D1/R2/scheduler proof prevent acceptance.
- **R1-v1:** Terminal status is `protocol_invalid`, reason `reviewer_independence_blocked`. It remains immutable.
- **R1-v2:** A separately hashed commit-reveal protocol and executable workflow are frozen over the same 64 official gamebooks. It enforces four distinct natural people, blind double review, separate adjudication, truth freeze, and fail-closed unblinding. No identities or evidence were fabricated; status is `awaiting_human_review` and R2 authorization is false.
- **R2 / R3:** Not run. Module 2B and the architecture decision stay blocked by R1; drive, quarterback, player, and other downstream model modules stay prohibited.

## Fixed decisions

- D1 and R2 are the intended production state stores; OS-00 must make this binding and retire or quarantine the Supabase path.
- Git stores code, configuration, protocols, feature definitions, and small manifests.
- R2 stores exact raw bytes, large origin-keyed datasets, model packages, and large forecast distributions.
- D1 stores identities, manifests, job state, compact features, registry metadata, forecast summaries, evaluations, and serving pointers.
- Python in a locked compute environment owns historical replay and fitting.
- Cloudflare Worker owns lightweight coordination, verified inference, atomic publication, and read serving.
- Public request handlers do not ingest, fit, archive, or spend provider quota.
- Once activation gates pass, exact 2026 source and market evidence will be captured with secret-redacted requests rather than deferred until model-market comparison. The connector slice exists now, but acquisition is disabled and no prospective stream has started.
- Every activated forecast origin receives a pre-kickoff forecast or contemporaneous withholding; nothing is backfilled as a prospective claim.
- A forecast requires complete runner/code, package/model, config, input, schema, and immutable output hashes; incomplete provenance is a withholding, not a forecast.
- Component packages may shadow their own targets, but only a prospectively qualified R13 `joint_score` package whose R14B, R15B, and R18B records share the exact package/config/schema/activation/sample key may populate prediction endpoints.
- Module 1 and Module 2 remain `reject_all`; C0 and P0 are research benchmarks only.
- Module 2B is the only authorized next model experiment.
- 2025 is research-exposed. The 2026 pre-kickoff archive is the next prospective confirmation stream.
- Football-only training excludes odds, lines, movement, sentiment, site selections, and human adjustments.

## Immediate queue

```text
OS-00 contract/runtime-local
  |
  +--> OS-00 R2 durability + clean-clone restore
  +--> OS-00B [frozen] --> R18A
  +--> OS-18A [owner-attested rotation; runtime use unverified] --> OS-19A deploy proof --> OS-03A market capture
  +--> OS-03A non-market [partial, disabled] --> complete/deploy/capture proof
  +--> OS-01A [deployed urgent slice] --> OS-02A [partial] --> OS-15A --> OS-13A [partial]
  |       +--> OS-01 --> OS-02 ----------------------+--> OS-06 --> OS-07 --> OS-08
  |                    +--> OS-03 --> OS-04 --> OS-05
  |
  +--> R0 [frozen] --------+
  |                         +--> R2 --> R3
  +--> R1-v1 [terminal protocol_invalid]
  +--> R1-v2 [frozen; awaiting 4 human roles] -- pass required --X R2

OS-07 --> OS-09 --> OS-10 --> OS-11 --> OS-12 --> OS-13B --> OS-14
R3 --> decomposition: R4 onward | target redesign: R3A | direct score: R3B
```

The next safe execution unit is migration 0014 plus deployed-D1 OS-19A contention/rollback proof, followed by a fresh dashboard-counter bootstrap without an Odds API request. Authenticated market capture remains disabled until the remaining origin, identity, capture, package, and infrastructure gates pass. R1-v1 remains immutable. R1-v2 is ready for two independent reviewers, a separate adjudicator, and a non-reviewing identity coordinator; only a verified pass can authorize R2. R2 changes one distribution mechanism only after that audit passes. R3 is the decision boundary and does not silently fall through to drive modeling.

## Kill gates in force

- R1-v1 is terminal `protocol_invalid`; it cannot be edited into a pass. R1-v2 is frozen and awaiting four distinct natural-person roles. R2 remains blocked unless R1-v2 reaches a verified pass.
- If Module 2B does not reduce absolute possession-difference variance error by at least 0.30 and repair the frozen coverage test, kill the kernel path.
- If the mechanism passes but P1-D1 does not clear the frozen NLL, percentage, paired-bound, energy/CRPS, and failure gates, retain P0 only and kill P1 development.
- Do not begin the drive-outcome module unless R3 explicitly selects decomposition; target redesign and direct score modeling have their own tasks.
- Do not add a football component without stable paired out-of-sample gain, calibration, ablation evidence, and a leakage audit.
- Do not compare the football model with a market baseline unless R13 is `shadow_eligible` and its package is frozen; continue acquiring exact quotes independently.
- Do not call a candidate production-ready from retrospective evidence.

## Existing assets awaiting qualification

- Worker/D1 ingestion, staging, freshness, quota, alerts, and last-good paths
- nflverse, odds, injury, weather, context, and sentiment adapters
- point-in-time, provenance, experiment, registry, forecast, and evaluation types
- power de-vigging, discrete market translation, joint score, scenario, and probabilistic evaluation libraries
- Model Lab Module 1 and Module 2 code, configs, source cache, artifacts, audits, and negative results
- weekly lifecycle and champion/challenger code for the current market-residual model

These assets should be preserved and tested against the new contracts. Their existence does not waive an acceptance gate.

## Known defects to address

1. Some legacy schema still uses runtime DDL outside the urgent slice; OS-01 must absorb and remove it.
2. The urgent D1 migration is deployed and receipted, but R2 object durability, restore, scheduler behavior, and capture infrastructure are not yet qualified.
3. Exact player-stat and snap-count source capture remains outside the narrow OS-03A slice.
4. The Python laboratory has no verified TypeScript package bridge.
5. Football forecast archival is coupled to odds freshness and decision-board construction.
6. The live mutating-HTTP boundary is verified, but legacy read APIs still expose demo/research analytics that are not prospectively qualified.
7. Player, roster, injury, snap, venue, and provider identities lack one as-of service.
8. No authenticated external compute runner exists; retained heavy lifecycle/refit source is unreachable from the active Worker.
9. Some monitoring still uses selected plays rather than the all-game forecast ledger.
10. The owner attests that the Odds API credential previously pasted in chat was regenerated and its replacement staged. The replacement remains uninspected and unused by the active bundle; a fresh server-side counter bootstrap and live-operation verification are still required before capture.
11. The urgent capture lane now has locally verified atomic reservations, exact schedule-plan binding, ambiguous-charge handling, and reset reconciliation. Migration 0014 plus deployed-D1 concurrency, rollback, R2, and scheduler qualification remain absent.
12. A failed staging-object cleanup can leave an unreferenced R2 object; pointer integrity is preserved, but OS-03 still needs garbage collection.
13. HTTP 304 checks refresh the heartbeat without creating a separate append-only check-event row; OS-03 must decide whether that evidence is required.
14. OS-02A still needs immutable supersession semantics for schedule revisions and every frozen forecast horizon.
15. The Tuesday 7:30 a.m. market origin and actual 2026 reset-offset simulation now exist in the registered quota plan, but OS-03A still lacks live immutable-capture and schedule-supersession qualification.
16. OS-19A still needs migration 0014 and deployed-D1 contention/rollback proof plus a fresh owner-attested provider-counter bootstrap. The Worker must keep acquisition disabled and must not read the staged key until the remaining activation gates pass.
17. Forecast origins are not yet bound to captured schedule evidence, and only the Tuesday horizon is represented.
18. Roster capture lacks schema validation, per-game pregame freshness is incomplete, and actual forecast outputs lack a fully qualified immutable package/output-pointer boundary.
19. The activation table is contract-scoped rather than package-scoped and cannot yet open the frozen lifecycle's independent prospective stream for a later eligible package.
20. R1-v1 has no review entries and is terminal. R1-v2 now supplies frozen attestation, commit-reveal, double-entry freeze, adjudication, truth freeze, unblinding, and gate-computation tooling, but four distinct natural people have not yet completed it.

## Decision log

| Decision | State | Evidence or next action |
|---|---|---|
| Module 1 score challengers | Frozen `reject_all` | Preserve artifacts; C0 benchmark only |
| Module 2 possession challengers | Frozen `reject_all` | Preserve artifacts; P0 benchmark only; kill current P2 |
| Module 2B kernel falsification | Blocked, not run | R0 is frozen; R1 is `protocol_invalid` with `r2Authorized=false` |
| Drive-outcome module | Blocked | Requires R3 decomposition branch |
| Target redesign/direct score | Conditional | R3A or R3B only if selected by R3 |
| Prospective capture | Partial and disabled | Urgent D1 schema is deployed; finish OS-02A/OS-03A/OS-13A/OS-19A and verify D1/R2/scheduler before activation |
| Market comparison | Blocked | Requires R13 `shadow_eligible`; exact quote acquisition starts only after OS-18A rotation and OS-19A bootstrap |
| Production promotion | Blocked | Requires prospective and operational qualification |
| Security response | Partially complete | Owner attests regeneration and staging; code quarantine passes, but the replacement remains deliberately unused pending server-only and quota-bootstrap proof |
| Engine OS implementation | In progress | Urgent spine is deployed fail-closed; complete R2 evidence durability and remaining gates; keep R2 statistical work blocked |

## Completion rule

The OS is not complete when the site can display a prediction. It is complete when a forecast can be reconstructed from immutable evidence, tied to a verified model package, stored before kickoff, graded on all eligible games, compared with market evidence without mutation, served from a last-good publication snapshot, and rejected or promoted only through frozen gates.
