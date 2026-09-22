NON-AUTHORITATIVE: inactive numerical chronology diagnostic; no experiment gate or production activation.

# Series registry — cutoff reconstruction

Generated September 22, 2026. Source checkout parent: `e2faeb6b015e89ee89ad5431ec1189b111794bfc`; the receipt pins the exact modified numerical module and replay driver bytes. The commit containing those bytes is recorded in CHANGELOG and the delivery report. Runtime: pinned Mac Python 3.12, one BLAS worker.

Current compressed series: `work/engine-rebuild/numerical-cutoff/replay-ee8e40fdfe6632cfd50373dd05cc7959bd721ca09d6f7c5fdc24e476f234d2ce.json.gz` (SHA256 `ee8e40fdfe6632cfd50373dd05cc7959bd721ca09d6f7c5fdc24e476f234d2ce`; decoded SHA256 `e668b1b921754293f277a182a24fc90ff440e0e175e7b790583e36c803c3aedf`).

The control is `work/e-elo-hfa-release/deployed-oof-66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f.json`, registered 2026-09-20T02:53:35.244810+00:00. It remains the sole authoritative control; this diagnostic does not replace it. Active fit reference `801ef07927ea59bc112fc955ad86249b981d5e60a0f4a9636f39b2eb23be623f` supplies the approved calibration/Elo groups, ridge penalty 10, no decay, and historical HFA map. Each replay fold refits the unchanged method; its actual training hash is stored per game. This is not one constant 2026 fit applied backward.

Code path: `engine/projection/features.py` plus `engine/projection_v3/model.py` reproduces the legacy control. The inactive `engine/projection/cutoff_features.py` changes observation eligibility/order using the same numerical helpers. `replay_cutoff_features.py` holds historical weekly-fit memberships fixed, first compares changed inputs under old fits, then refits the same memberships using those features. This isolates timing and propagated-fit effects, not a qualified Tuesday production refit scheduler.

| Series | Team MAE | Bias (projection − actual) | Actual-on-projected slope | Projected SD |
|---|---:|---:|---:|---:|
| control | 7.575628833 | +0.188862609 | 1.011109366 | 2.934554179 |
| changed_inputs_fixed_fit | 7.574839389 | +0.190900312 | 1.012751114 | 2.932605141 |
| changed_inputs_and_refits | 7.574666097 | +0.192096678 | 1.010818710 | 2.938524461 |

All rows: 2,639 regular-season games / 5,278 team forecasts, 2016–2025. Population SD and pooled OLS slope with intercept; annual values are in metrics.json. These descriptive measurements are not a selection criterion for this correction. No uncertainty forecasts or accuracy gate are produced here.

Historical provider availability is UNKNOWN. Kickoff+4h is the disclosed reconstruction proxy; historical replay does not establish live source availability. Live mode requires both first-seen clocks and an execution timestamp, refuses past issuance, and cannot prepare a final forecast before its required cutoff. Production bootstrap and persisted source/state lineage remain unfinished.

Earlier attempts are retained under prior-attempts.json with both compressed and original byte hashes; their originals were moved to private ignored storage, not deleted. The selected final receipt adds stronger live guards; deterministic numerical results agree. No failed or earlier attempt was used as a gate result.

Confidence: medium — the observed timing effect holds on the authoritative control population but depends on defensible target-week weighting and reconstruction-availability conventions. Lower to low if qualified source vintages materially change which observations were available.

## September 22 state-restoration rerun

The current reference now pins `work/engine-rebuild/numerical-cutoff/replay-8a9e0f89dc915f3eb1324bf7001a3849b186c2b34bbb3b3b95847fec7b7469b6.json.gz` (SHA256 `8a9e0f89dc915f3eb1324bf7001a3849b186c2b34bbb3b3b95847fec7b7469b6`). The prior selected replay remains preserved above and on disk. The new code separately gates final-score and paired-statistics availability and reconstructs cumulative state in played order. `state-reconciliation.json` verifies exact equality of all 2,639 per-game forecast/training records and all annual counts with the prior replay. All descriptive metrics in the original table therefore remain unchanged. The authoritative control remains the HFA series. This rerun took 161.93 seconds and 830,439,424 peak resident bytes; it does not install a new live scheduler or qualify historical source vintages.

Persisted state and a label-free shadow adapter now have isolated recovery evidence; production integration remains pending. Finals can update Elo/rest before paired statistics arrive, preserving legacy behavior. Missing statistics are explicit, not zero. See ../CUTOFF-STATE.md and ../cutoff-state-canary.json.

Confidence: high in numerical equality with the prior diagnostic across all ten seasons; this survives reversed-row and delayed-arrival fixtures. Lower to medium if independent reconstruction finds a changed point or training identity. Historical live availability and operational readiness remain unqualified.
