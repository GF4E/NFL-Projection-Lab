# Earlier calibration data inventory

Preparation only; no candidate fit, comparison, registration or release. This is an input inventory for the chronological train/validation/test contract in PROMPT-reviewed-2026-09-22.md section 10. Completed integer team scores are the supervised labels; expected-score predictions remain full precision. Existing TRAIN-TEST.md and BASELINES.md supply descriptive held-out-at-prediction errors, explicitly NON-AUTHORITATIVE REPLAY, not production results or independent prospective proof.

The necessary early raw football data are present locally. It is the own-lineage forecast history that remains unqualified, not absence of all early data.

| Season | Completed regular games | Paired team-stat games | Unmatched pairs after existing franchise normalization |
| --- | ---: | ---: | ---: |
| 2011 | 256 | 256 | 0 |
| 2012 | 256 | 256 | 0 |
| 2013 | 256 | 256 | 0 |
| 2014 | 256 | 256 | 0 |
| 2015 | 256 | 256 | 0 |

All three 2011–2013 play-by-play files match their pinned SHA256 identities. Their saved aggregates identify those source hashes. This check does not independently reaggregate plays. The historical schedule and current team-stat source also pass pinned-hash checks. The initial check compared raw legacy team names with canonical aggregate names; its output is preserved in calibration-source-inventory-before-alias-normalization.json. Applying scripts/projection_prepare.py's existing franchise mapping resolves those representation mismatches without dropping a game or changing any source.

The existing Phase A forecast cache has 256 games in each of 2013, 2014 and 2015, but uses 18 optional groups, annual refits and earlier penalty selection. The current issuing method uses calibration/Elo groups and fixed settings [none, 10] with weekly refits. The cache is therefore not substitutable for the issuing method's own calibration errors. An earlier date alone does not establish compatible lineage.

The current HFA artifact has entries beginning in 2014, while the extension needs 2011–2013 as well. Reconstruct those entries using the promoted three-prior-season, non-neutral regular-game mean home-margin times 25 rule in scripts/elo_hfa_deployed_gate.py. Do not transplant later HFA or silently insert a constant. Then extend the common source adapter and produce separately identified 2013–2015 forecasts for each required calibration lineage, using strictly earlier data. Verify the early aggregate derivation first. Historical provider availability remains an explicit assumption; 2026 retrieval cannot establish historical live availability.

Reproduce with `/opt/anaconda3/bin/python3.12 -B work/engine-rebuild/check_calibration_sources.py`. Exact file identities, method differences, counts and prerequisites are in calibration-source-inventory.json. Inventory assertions pass for all 1,280 game pairs. No fitting or probabilistic accuracy score was computed. Existing cadence, control-authority and review prerequisites still apply; E-CAL-LINEAGE is not ready to start. Unattended public-closeout access and durable capacity also remain unresolved independently.

Least certain: whether reconstruction will match the issuing method through every historical boundary. Consequently these inputs are recorded as available source evidence, not qualified residuals.

Confidence: near-total in the file identities, counts and method mismatch, meaning arithmetic and direct comparisons on verified records. Lower to high if independent recomputation changes those counts or shows a different saved method. Predictive improvement and calibration readiness remain unproved.
