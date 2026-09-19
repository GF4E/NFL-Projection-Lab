SERIES NOTICE: This report cites non-authoritative historical/replay series; only work/projection-v2w/deployed-oof-6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10.json is authoritative for future gating. See the SERIES.md catalog.

# Deployed-lineage replay: stop at sign reconciliation

E-POST candidates were not fitted. The historical control has pooled projected-minus-actual bias +0.189, not the hypothesized persistent negative bias. Six seasons have positive bias and four negative. Per the explicit step 2 stop condition, investigate the live lineage before a corrective-layer gate. This is neither an E-POST rejection nor a promotion.

## Direct host verification

Host commit: 538ce1f424bfe794ecbccf64ccabc8e4e9bbfadc. Active artifact: 8bd585610049c63e30aea2e675f61cd6e65a5c22b268e87f89971bb3bffa246d, verified by hashing its actual bytes. Version projection-v2.w2; calibration+Elo; no decay; penalty 10. Seven production source files were hashed on host and matched to that commit; the replay imports modules extracted verbatim from that commit. The new replay driver is instrumentation committed separately, not code falsely attributed to the older host commit.

Tracked host difference: outputs/projection-v3/final-feed.json. 440 untracked nonignored paths are listed individually in host-status-2026-09-19.txt and host-verification-2026-09-19.json. Git-ignored private caches/secrets are outside this repository-content comparison; no credential contents were read or copied. Source files inspected have no local host modifications. Root filesystem is full (8.7G used, zero available). No host files deleted.

Verification used ssh -i .cloud-private/admin_key -o IdentitiesOnly=yes -o BatchMode=yes root@159.89.185.88, executing the read-only verifier saved as host_verify.py with /opt/nfl-runtime/env/bin/python -. The verifier uses GIT_OPTIONAL_LOCKS=0 and a command-scoped safe.directory because the checkout is owned by nflengine. Complete structured output is host-verification-2026-09-19.json.

## Replay provenance and limitations

OOF SHA256: 6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10. All 2639 registered games preserved. Repeating the complete replay produced the identical OOF hash. Pinned prior-season feature rows, exact model fit/predict and weekly whole-slate refit eligibility reproduce the production algorithm. No state-space method added. Host and replay numerical source byte hashes match. Historical provider delivery and entry-sync timing cannot be reconstructed: REVIEW REQUESTED on the disclosed kickoff+4h/next-hour data-availability convention in REPLAY-PLAN.md. No claim of exact historical wall-clock delivery. No current 2026 coefficients enter historical fits. No game required a prior-week unavailable-result feature rebuild in this population.

The 14-game live statistic is a mixture of eight older v2 and six original v3 forecasts, not 14 games issued by the active weekly-fit artifact. Historical nonnegative pooled bias therefore does not prove a new 2026 environment defect; version-specific reconciliation is required.

## Step 1

| Season | Games | Team MAE | Bias | Projected SD |
|---|---:|---:|---:|---:|
| 2016 | 256 | 7.153 | +0.184 | 2.661 |
| 2017 | 256 | 7.840 | +0.455 | 2.790 |
| 2018 | 256 | 7.877 | +0.068 | 2.776 |
| 2019 | 256 | 7.516 | -0.030 | 2.993 |
| 2020 | 256 | 7.573 | -0.559 | 3.108 |
| 2021 | 272 | 7.986 | +0.481 | 3.136 |
| 2022 | 271 | 7.246 | +0.906 | 2.605 |
| 2023 | 272 | 7.607 | +0.496 | 2.676 |
| 2024 | 272 | 7.378 | -0.084 | 2.947 |
| 2025 | 272 | 7.571 | -0.075 | 3.118 |
| pooled | 2639 | 7.574 | +0.189 | 2.943 |

## Step 2

| Season | Deployed bias | Deployed slope | Baseline bias | Baseline slope | REPLAY bias | REPLAY slope |
|---|---:|---:|---:|---:|---:|---:|
| 2016 | +0.184 | 1.016 | -3.151 | 1.682 | +0.258 | 0.920 |
| 2017 | +0.455 | 0.777 | -2.941 | 1.035 | +0.629 | 0.781 |
| 2018 | +0.068 | 0.939 | -2.925 | 1.072 | +0.126 | 0.917 |
| 2019 | -0.030 | 1.156 | -3.031 | 1.954 | +0.163 | 1.131 |
| 2020 | -0.559 | 0.996 | -3.387 | 1.216 | -0.626 | 1.015 |
| 2021 | +0.481 | 1.024 | -2.472 | 1.514 | +0.597 | 1.021 |
| 2022 | +0.906 | 0.777 | -2.123 | 1.147 | +1.070 | 0.758 |
| 2023 | +0.496 | 1.014 | -2.569 | 1.646 | +0.690 | 1.009 |
| 2024 | -0.084 | 1.130 | -2.939 | 1.940 | +0.045 | 1.130 |
| 2025 | -0.075 | 1.026 | -2.927 | 1.960 | +0.019 | 1.017 |
| pooled | +0.189 | 1.009 | -2.840 | 1.442 | +0.303 | 0.993 |

## Gate table

| Candidate | MAE / bootstrap / coverage gate | Decision |
|---|---|---|
| (a) Additive correction | Not evaluated | Stopped at required sign reconciliation |
| (b) EMOS | Not evaluated | Stopped at required sign reconciliation |
| (c) EMOS + home offset | Not evaluated | Stopped at required sign reconciliation |

Least sure of: how historical provider-delivery delays would change a small number of weekly-refit issuance times.
