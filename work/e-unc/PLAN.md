# E-UNC implementation plan

Read in full before implementation: SPEC.md; governance, decision-latency and clock amendments; v2 architecture and Addendum 1/supplements; BOARD v7. Repository of record: GF4E/NFL-Projection-Lab, engine-v2 (methods), main (reader).

| Requirement | File / verification | Status |
|---|---|---|
| Preregistration, tiers, queue, clock | GAP-SWEEP.md, preregistration-review.json; governance queue | Review before comparative runs; Tier 3 pending |
| 1.1 single-game interval audit | audit.json, REPORT.md; engine/projection/distribution.py; engine/board_v7.py | Read-only audit |
| 1.2 variance components by season | audit.json; later training-only repeated-fit diagnostic | Current artifacts do not identify the split; no invented irreducible variance |
| 1.3 margin, probability, measured correlation | scripts/e_unc_audit.py; audit.json | Read-only incumbent OOF audit |
| 2a joint paired ensemble | engine/uncertainty.py, tests/test_e_unc.py | Synthetic primitives only until gate/queue resolved |
| 2b/2c conditional scale | future engine/e_unc_fit.py | Dependent on fixed-feature availability amendment; no silent dropping |
| 3.1–3.4 CRPS, interval scores, coverage, widths | engine/uncertainty.py; future annual-scoring.json | Metrics primitives now; no candidate results before final preregistration |
| 3.5 PIT and spread-skill | engine/uncertainty.py; future scoring plots | PIT primitive now; plots require valid evaluated forecasts |
| 3.6 Brier and ten-bin reliability | engine/uncertainty.py; future scoring report | Probability primitive now; reliability convention in sweep |
| Release gate | future gate.json | Tier 3: primary objective amendment unresolved |
| 4.1–4.6 labels, graded bars, constancy, overlap, dotplots, typography | main: board-v7.tsx, board-v7.css; engine/board_v7.py | Deferred until experiment registration resolves; use actual issuing distributions, never invent dots from endpoints |
| 5 mathematical/synthetic tests | tests/test_e_unc.py | Isolated primitives; existing frozen arithmetic untouched |
| 5 rendering tests | main tests/board-v7.test.tsx | Pending display implementation |
| 6 full report, source hashes, gate, limitations | REPORT.md, audit.json, preregistration-review.json | Partial review packet, not DONE |

No promotion, refit, current-season comparative scoring, or production change is authorized by this preparation alone. No provider credits used. Do not refit from a report route.
