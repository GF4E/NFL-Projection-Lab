# Prediction Engine OS State

## Current position

- **Roadmap status:** Created and ready for execution
- **Current phase:** Phase 1 — Canonical engine kernel
- **Next task:** OS-00 — Freeze the operating-system contract
- **Statistical next task:** R0 and R1 after OS-00, then R2 Module 2B
- **Evidence-capture urgency:** OS-03A and OS-13A must begin before the full platform refactor is complete
- **Production model status:** No validated market-free candidate
- **Interface status:** Out of scope
- **Deployment status:** No engine-OS change deployed by this roadmap task

## Fixed decisions

- D1 and R2 are the intended production state stores; OS-00 must make this binding and retire or quarantine the Supabase path.
- Git stores code, configuration, protocols, feature definitions, and small manifests.
- R2 stores exact raw bytes, large origin-keyed datasets, model packages, and large forecast distributions.
- D1 stores identities, manifests, job state, compact features, registry metadata, forecast summaries, evaluations, and serving pointers.
- Python in a locked compute environment owns historical replay and fitting.
- Cloudflare Worker owns lightweight coordination, verified inference, atomic publication, and read serving.
- Public request handlers do not ingest, fit, archive, or spend provider quota.
- Exact 2026 source and market evidence is captured now with secret-redacted requests; acquisition is not deferred until model-market comparison.
- Every activated forecast origin receives a pre-kickoff forecast or contemporaneous withholding; nothing is backfilled as a prospective claim.
- A forecast requires complete runner/code, package/model, config, input, schema, and immutable output hashes; incomplete provenance is a withholding, not a forecast.
- Component packages may shadow their own targets, but only a prospectively qualified R13 `joint_score` package whose R14B, R15B, and R18B records share the exact package/config/schema/activation/sample key may populate prediction endpoints.
- Module 1 and Module 2 remain `reject_all`; C0 and P0 are research benchmarks only.
- Module 2B is the only authorized next model experiment.
- 2025 is research-exposed. The 2026 pre-kickoff archive is the next prospective confirmation stream.
- Football-only training excludes odds, lines, movement, sentiment, site selections, and human adjustments.

## Immediate queue

```text
OS-00
  |
  +--> OS-00B --> R18A
  +--> OS-18A --> OS-19A --> OS-03A market capture
  +--> OS-03A non-market capture
  +--> OS-01A --> OS-02A --> OS-15A --> OS-13A
  |       +--> OS-01 --> OS-02 ----------------------+--> OS-06 --> OS-07 --> OS-08
  |                    +--> OS-03 --> OS-04 --> OS-05
  |
  +--> R0 ----+
  |           +--> R2 --> R3
  +--> R1 ----+

OS-07 --> OS-09 --> OS-10 --> OS-11 --> OS-12 --> OS-13B --> OS-14
R3 --> decomposition: R4 onward | target redesign: R3A | direct score: R3B
```

OS-00B, OS-18A, non-market OS-03A, OS-01A, R0, and the preregistration portion of R1 may proceed once OS-00 freezes the evidence and ownership contract. Authenticated market capture waits for OS-18A and OS-19A. OS-13A waits for the named migration, identity, and scheduler slices. R2 changes one distribution mechanism only. R3 is the decision boundary and does not silently fall through to drive modeling.

## Kill gates in force

- If R1 finds target disagreement beyond its frozen threshold, R2 becomes `protocol_invalid` until the target is resolved.
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

1. D1/Worker and Supabase job paths coexist.
2. Migrations and runtime DDL both define schema.
3. Production manifests do not consistently retain exact source bytes.
4. The Python laboratory has no verified TypeScript package bridge.
5. Football forecast archival is coupled to odds freshness and decision-board construction.
6. A public board request can initiate maintenance.
7. Player, roster, injury, snap, venue, and provider identities lack one as-of service.
8. Heavy refits and bootstraps are assigned to Worker execution.
9. Some monitoring still uses selected plays rather than the all-game forecast ledger.
10. The Odds API credential previously pasted in chat must be revoked and rotated immediately after OS-00, before authenticated 2026 market capture.
11. The urgent capture lane needs its own hard quota guard, idempotent scheduler, provenance-complete forecast rows, and late-run exclusion before activation.

## Decision log

| Decision | State | Evidence or next action |
|---|---|---|
| Module 1 score challengers | Frozen `reject_all` | Preserve artifacts; C0 benchmark only |
| Module 2 possession challengers | Frozen `reject_all` | Preserve artifacts; P0 benchmark only; kill current P2 |
| Module 2B kernel falsification | Authorized, not run | R0 and R1 first; then exact D0/D1 comparison |
| Drive-outcome module | Blocked | Requires R3 decomposition branch |
| Target redesign/direct score | Conditional | R3A or R3B only if selected by R3 |
| Prospective capture | Urgent | OS-03A plus OS-01A → OS-02A → OS-15A → OS-13A; OS-19A guards market quota |
| Market comparison | Blocked | Requires R13 `shadow_eligible`; quote acquisition starts now |
| Production promotion | Blocked | Requires prospective and operational qualification |
| Security response | Urgent after OS-00 | Rotate exposed Odds key through OS-18A |
| Engine OS implementation | Ready | Begin OS-00 |

## Completion rule

The OS is not complete when the site can display a prediction. It is complete when a forecast can be reconstructed from immutable evidence, tied to a verified model package, stored before kickoff, graded on all eligible games, compared with market evidence without mutation, served from a last-good publication snapshot, and rejected or promoted only through frozen gates.
