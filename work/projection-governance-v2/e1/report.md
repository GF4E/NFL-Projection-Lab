# E1 — chronology audit blocked the result

**The first numerical rejection is withdrawn. This is not a valid E1 gate result. Linear remains live; no method was promoted.**

Replay groups state assimilation by NFL week label rather than actual Tuesday cutoff. Five postponed games entered state before their results were available at that cutoff.

| Game | Played | NFL week | Calendar week at play | Tuesday cutoff missed |
|---|---|---:|---:|---|
| 2020_05_BUF_TEN | 2020-10-13 19:00 ET | 5 | 6 | 2020-10-13 06:00 PT |
| 2020_12_BAL_PIT | 2020-12-02 15:40 ET | 12 | 13 | 2020-12-01 06:00 PT |
| 2020_13_DAL_BAL | 2020-12-08 20:05 ET | 13 | 14 | 2020-12-08 06:00 PT |
| 2021_15_SEA_LA | 2021-12-21 19:00 ET | 15 | 16 | 2021-12-21 06:00 PT |
| 2021_15_WAS_PHI | 2021-12-21 19:00 ET | 15 | 16 | 2021-12-21 06:00 PT |

## Required cadence decision

Recommended: each game uses the most recent Tuesday 06:00 PT state before its actual T-75 issuance; assimilate only results completed before that cutoff, regardless of NFL week label. The alternative is to freeze one state for an entire NFL week until all its games are final. User clarification is pending under the instruction to stop on undefined conventions.

## Completed and preserved

- Constrained filter, reference Riccati covariance, preseason transition and diagnostics implemented. Constant-shift invariance, covariance convergence, zero null variance, synthetic recovery, training-order invariance and same-week causal sequencing tests pass.
- 296 unit tests pass, but they did not cover the postponed-game calendar case. The final calendar audit fails; passing unit tests does not override that failure.
- The original hashed preregistration and all numerical artifacts are preserved in `../e1-week-label-run/`, with `VALIDITY.json` marking the run invalid. No additional parameter settings were tried.
- The 14-game current-season counterfactual table used frozen issued inputs, but its historical state fitting shares the calendar defect; it is not accepted E1 evidence.
- Staff file has 448 team-season rows; QB1 is sourced for 446. All coaching fields remain unknown after PFR 403; A.3 false unknown flags were used and disclosed. No PFF or other data addition started.
Staff file SHA-256: `a914b09d434d48371544054c26e38f14f9b1da61d9a05eb241688a02305a62a4`. Coverage by season and every unknown team-season are listed in `staff-coverage.json`.
- Active fit, prior projections, grades and Phase A archive remain unchanged. E2 has not started and will use the result of a valid E1.

Least certain: calendar-time meaning of Tuesday-only assimilation for postponed games. The actual schedule audit exposed a defect in week-label replay, so the rejection was withdrawn and the cadence decision requested instead of silently changing the protocol.
