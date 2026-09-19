SERIES NOTICE: This report cites non-authoritative historical/replay series; only work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json is authoritative for future gating. See the SERIES.md catalog.

# E-POST reconciliation — STOPPED, no fitting

Audit read in full and preserved verbatim at work/engine-audit-2026-09-19.md. Audit assertions are independently checked below, not adopted as verified conclusions.

Bias here means projected minus actual, matching the audit. Existing engine error reports commonly use the opposite sign.

| Series | Games | Team MAE | Signed bias | Projected SD (pooled population) |
|---|---:|---:|---:|---:|
| Named baseline | 2639 | 8.003437 | -2.839559 | 1.687451 |
| 2026 as-issued grades | 14 | 8.427664 | -3.453950 | 1.977087 |
| E1 control, REPLAY | 2639 | 7.571625 | +0.302699 | 3.001910 |

The audit's baseline SD 1.5 is reproduced as the mean within-season SD (1.536844), not the pooled SD. The live aggregate shares negative bias and compressed predictions with the baseline; this descriptive similarity is not proof of artifact identity. Eight grades were issued by projection-v2-172f3e04-a39aa883 and six by projection-v3-b7a84dbe-2b5d9d0f.

## Production trace and mandatory stop

scripts/projection_v3_publish.py:run calls active_artifact(), which reads work/in-season-learning-v1/active-fit-ref.json. That points to fit-8bd585610049c63e30aea2e675f61cd6e65a5c22b268e87f89971bb3bffa246d.json, version projection-v2.w2, groups calibration and elo. The current committed board agrees: all 15 upcoming cards use projection-v2.w2. Existing locked cards retain their original versions. The projection-v3 directory name does not identify the algorithm issuing its contents.

The original v3 fit-ref instead points to ef3fcdd5ae8cf31a47d883d6583e07a571f99ea89f9af0f2f8dfaaf5761cb929, groups calibration. Its experiment record distinguishes baseline_oof (8.003) from adaptive oof (7.761); they are not interchangeable. Neither is proven to be the rolling-origin counterpart of today's active weekly fit. No direct cloud-host refresh was performed; this is the committed production code and published-board trace.

Per the user's explicit rule, stop before fitting when deployed path does not match the 8.00 series. Do not silently substitute the replay or adaptive series. Next required reconciliation is to establish the exact rolling-origin counterpart of the active deployed algorithm, including weekly refits and retained historical locks.

| Candidate | MAE reproduction | Standard gate | Promotion |
|---|---|---|---|
| (a) Prior-two-season additive correction | Not run: control mismatch | Not evaluated | None |
| (b) EMOS | 7.757 audit claim not independently fitted | Not evaluated | None |
| (c) EMOS plus home offset | Not run: control mismatch | Not evaluated | None |

The audit provides no coverage results proving the full standard gate. A MAE improvement alone cannot establish coverage within three points at both levels. No candidate result, confidence interval or promotion is manufactured.

Least sure of: the valid rolling-origin series corresponding to today's active weekly-refit lineage.
