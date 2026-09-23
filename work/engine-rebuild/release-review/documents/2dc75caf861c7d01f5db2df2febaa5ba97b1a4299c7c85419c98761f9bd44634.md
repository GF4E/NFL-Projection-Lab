# Complete initial-handoff source recovery — 2026-09-23

The complete 46-file issuing source is now qualified by a fresh physical source restore and an isolated restored-runtime consumer. No production handoff, control-authority transfer, statistical promotion or accuracy improvement is claimed. The initial-operator captured-boundary test is separate from this recovery result.

| Check | Verified result |
|---|---|
| Pinned source | 76f840b0569d29043eec83acab0270dd003143f0 |
| Standalone off-host bundle SHA256 | fc1e18bc7c099fcaff6a5719768fcb5ce3c7b4cb6d6c087b0f1087ba3e59b279 |
| Source restore | 13,091 tracked entries; 2,953,490,228 bytes; strict Git fsck, full tree verification, syncfs; 430.225 seconds |
| Dependencies on other Git stores/remotes | None |
| Runtime re-verification | Installed and independently restored trees match manifest 421443b220e5d492d8baf7c714c819ff44f4aa296d235f22aa9b7c1887454a01: 27,481 entries, 23,577 files, 1,733 symlinks, 800,655,733 file bytes each |
| Saved result parity | 16 forecasts and 32 first grades exactly reproduced |
| Captured operational lifecycle | 2,927 training games / 5,854 rows; 16 locks and 16 synthetic grades; rollback and retry passed |
| Runtime | 175.081 seconds including parity; lifecycle 171.741 seconds; process maximum RSS 236,412,928 bytes |
| Resource supervision | 570-second service ceiling, 4-GiB memory ceiling, single numerical worker, live dispatch exclusion |
| External acceptance | Terminal success; 52 original records plus fit pointer unchanged; original host mounts/namespaces unchanged; ten external native files and OS/kernel verified |

The consumer runs as the actual service user with the restored source/runtime bound read-only at their original prefixes inside private mount/network namespaces. A deliberate invocation without isolation fails before numerical work. This proves same-host executable recovery with explicitly checked native/OS compatibility, not a complete machine disaster recovery or an observed live forecast cycle.

Preserve the first start's nonblocking dispatch contention: the service exited before the consumer produced output while scheduled Python jobs held the dispatch lock. Attempt 2 used a maximum 30-second wait and a separate retained unit/log, without enlarging the 570-second ceiling. There was no failed numerical result or experiment disposition. Earlier source/runtime restores and all failed evidence remain retained. No unique artifact was removed, no provider request was made, and no new paid resource was created.

Evidence: initial-source-restored-76f840b0.json, initial-runtime-reverified-76f840b0.json, initial-restored-consumer.json, initial-restored-consumer-accepted.json, initial-restored-consumer.log, initial-recovery-no-isolation.log and initial-recovery-lock-contention.log. The parameterized external harnesses preserve the prior fixed-source harnesses. Reports do not refit anything.

Remaining: exercise the actual initial operator against a captured Thursday/Friday boundary; verify a current host preflight; wait for the already-installed first real cutoff Friday September 25 06:00 Pacific. Preserve Thursday's legacy lock, seal the actual training boundary without backdating, and verify real issuing/public provenance before any control-authority claim. Sustained storage reserve, calibration/point semantics, actual statistical reviews and prospective/live-cycle acceptance remain open.

Least certain: same-host restoration does not establish recoverability after an OS or native-library change; historical source availability remains assumed in reconstruction.

Confidence: medium in release readiness—verified captured evidence supports it, but same-host compatibility and reconstruction choices could reasonably differ. Lower to low if an independent restore or lineage recomputation fails. Exact file/count/parity claims are near-total: arithmetic on verified rows and bytes; lower to high on independent disagreement.
