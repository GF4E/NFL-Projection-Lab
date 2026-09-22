# SERIES — common pipeline chronology reconstruction

NON-AUTHORITATIVE — STRICT TUESDAY-ONLY SENSITIVITY, not the deployed daily catch-up policy. This is integration/chronology evidence, not the control for a statistical gate, not AS_ISSUED history, and not a promotion.

- Artifact: `replay-ba52a7e926e4429bc2440e49f7167eecc3eeacacedbfc91648c8a8de7d6b54c0.json.gz`; compressed SHA256 `ba52a7e926e4429bc2440e49f7167eecc3eeacacedbfc91648c8a8de7d6b54c0`.
- Completed file timestamp: 2026-09-22T21:17:53.702368+00:00 (local filesystem evidence, not an issuance or provider clock).
- Code path: `work/engine-rebuild/replay_common_pipeline.py` → `engine/projection/cutoff_pipeline.py` preparation, point scoring and refit; approved cutoff feature/state mathematics and production `due_week` scheduling convention.
- Source checkout baseline: `978beb3c6df076b62468e7cfbca41ef01d0954ee`. Candidate code was uncommitted when executed; exact file hashes were pinned at start and verified unchanged at completion in the artifact's `code` list. Do not substitute the baseline commit for those candidate hashes.
- Fits: 171 prior-season initial and in-season Tuesday fits, with each fit body, training population, training hash and per-forecast fit hash saved. Existing calibration/Elo groups, no decay, penalty 10; no added fitted parameter.
- Authoritative comparison: `work/e-elo-hfa-release/deployed-oof-66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f.json`, SHA256 `66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f`. That control remains authoritative. The earlier fixed-membership cutoff replay is a separate non-authoritative diagnostic.
- Source limitation: historical final/statistic availability is assumed at kickoff plus four hours. It is not verified historical provider availability. Closeout publication is simulated. The current calibration table is not used for historical probabilities.

| Pooled metric, 2,639 games | Value |
| --- | ---: |
| Team MAE | 7.574638062277 |
| Signed team bias, projected minus actual | 0.192328464675 |
| Actual-on-projected slope, with intercept | 1.010900400374 |
| Projected population SD | 2.938403055906 |
| Actual population SD | 9.966996619632 |

These are descriptive point metrics, not a gate table. Coverage, CRPS, interval score and winner reliability are NOT_SCORED without qualified own-lineage historical calibration. Reproduce the source inputs and code hashes before reusing this series.

Confidence: near-total for the table's arithmetic on verified rows. Lower to high if independent arithmetic differs. Historical availability, production readiness and future accuracy are not established by these numbers.

Disposition: see DISPOSITION.json. The production-replay interpretation was withdrawn after inspecting the daily scheduler. The mathematical result remains reproducible from the exact source archive in strict-source-ref.json; 61 forecast differences reflect the stricter refit policy and must not be promoted as an infrastructure correction.
