# Calibration readback: lower memory, identical evidence

SYNTHETIC ONLY — no real experiment, candidate selection, promotion or model activation.

The retained-result loader now shares equal immutable strings across all banks in one result. Lists and dictionaries remain independent, and the pool is discarded at the end of the read. This eliminates redundant memory without deleting any training membership, changing a serialized byte or changing the numerical result. All fifty frozen issuing files still match the verified restored source.

| Measured on existing Mac | Before | After |
| --- | ---: | ---: |
| Isolated read peak RSS, bytes | 187,809,792 | 171,687,936 |
| Full-workflow sampled peak RSS, bytes | 492,568,576 | 458,489,856 |
| Full-workflow elapsed seconds | 34.517 | 35.057 |

All 2,639 artificial games and 40 banks retain numerical-body SHA256 `633dfef4f64037fe925f1a5ab324f37f8a4feaa2df6495b1d3fa9b711175bbb7`. The same six run-identity fields are excluded as in the earlier comparison; no score, uncertainty, donor or gate field is excluded. The complete synthetic execution, native receipt, research ledger, exact retry with one attempt, and retained report all finish. Mac RSS sampling is not represented as a Linux hard resource bound.

Tests: 103 focused calibration tests and 626 projection tests pass, with three Linux-only skips on Mac. New testing verifies that equal strings can be reused across files while mutations to one file's decoded containers cannot affect another; all existing crash, missing/changed bank, legacy format, no-refit report and exact-retry checks remain covered. Evidence is under `calibration-memory/readback-*` and `shared-pool-*`; logs are `tests-calibration-readback.log` and `tests-calibration-readback-broad.log`.

## Resource decision

No new Linux full-size run was started. At 03:05:37 UTC the production droplet had 198,443,008 bytes MemAvailable, less than the prior protective 256 MiB research cap. Existing Linux failures remain intact. The observed local savings do not establish sufficient safe host headroom. No memory limit was raised, no process was killed to make room, and no new VM stack was installed on the user's Mac.

The concrete CPU/RAM-only one-GiB proposal is in `RESEARCH-CAPACITY-CHOICE.md`. It would add USD 2/month; explicit approval is pending because storage approval covers a different resource. This is a named dependent operational requirement, not grounds for declaring the whole goal blocked: statistical definitions, review preparation and other independent acceptance work remain possible. Preserve all real Friday/Tuesday chronology, issuance, public-control association and review prerequisites; a synthetic resource run cannot satisfy them.

CONVENTIONS: Tier 1 equality-preserving per-result string pooling, based on existing calibration JSON practice and immutable Python strings; no global interning or mutable-container sharing. Tier 2 REVIEW REQUESTED: synthetic memory is not a worst-case real-data bound. The existing qualified Linux supervisor is retained rather than treating the Mac sampled observer as a hard cap.

Least certain: the physical memory required by the real-data experiment on Linux. Confidence: high in unchanged numerical evidence because complete result hashes and alternative storage/read paths agree. Lower to medium if independent reconstruction finds a discrepancy or a real-data shape violates the tested assumptions. Host resource readiness remains unqualified.
