# Captured initial chronology handoff — 2026-09-23

The actual initial operator passes on captured Linux inputs. This is an isolated simulation; production still has no active pipeline manifest or weekly configuration, and its first installed real state remains Friday September 25 06:00 Pacific. No authoritative-control change or registered experiment occurred.

| Check | Result |
|---|---|
| Tested source commit | 9b0ff881f1dd7a266cf7683e55a9776b0fb74bc4 |
| Issuing code | All 46 files exactly match restored source 76f840b0 |
| Tested packet | 12351980916f7b2cf5492381b150ac49cf7361ec99c59a3acb948c6ef5f5f224 |
| Technical preflight | Real source, recovery, fit, calibration, training, public-closeout and runtime checks; no mocked technical admission |
| Stage | Preserved initial preparation, active fit, absent pipeline pointer and absent weekly configuration |
| Migration boundary | 2,927 to 2,928 training games; original simulated ATL-at-GB Thursday lock retained; added row explicitly reconstructed, not relabeled AS_ISSUED |
| Activate and retry | Committed matching configuration and release; exact retry returned the same result |
| Friday state | Fourteen eligible later games use the simulated Friday cutoff; all sixteen board games retained |
| Rollback | Original preparation/fit and absent weekly configuration restored; Thursday lock unchanged |
| Protected production evidence | All 52 original records plus active-fit pointer unchanged; live pipeline/configuration/state pointers remain absent |
| Timing | Application 198.856 seconds; journal service span 206.069 seconds including lock wait/setup |
| Memory | Process maximum RSS 264,187,904 bytes; journal reports 267.7M peak memory and 232.5M peak swap |
| Current disk headroom | Root 4,129,181,696 bytes; artifact volume 5,251,239,936 bytes at independent post-run observation |

Availability receipts, the Thursday lock, Friday state and operator clock are disclosed fixtures. The clock advances with elapsed execution time. This does not establish historical availability, a real Thursday result, a live transition or improved accuracy. Source commit differences are later artifact/document commits; exact issuing bytes, fit and calibration remain unchanged. The 570-second/4-GiB limits and private network were requested through systemd-run; measured execution fits those limits. Live resource-property snapshots for these completed canaries were not retained.

## Terminal evidence correction

Systemd unloaded the completed transient units. A later systemctl show returns LoadState=not-found with default success/zero/infinity/no values, which are not evidence of either outcome or installed limits. Preserve initial-operator-host-after-unloaded.json and the earlier recovery acceptance as historical records, but discard their unloaded unit-property fields as proof. The corrected independent recovery acceptance uses the exact invocation's journal start and success records, rejects missing/wrong-invocation/failure/cross-boot evidence, and rechecks original records and host identity. Five focused fixtures pass. No numerical run was repeated to manufacture a new outcome.

Retained manager journal records establish terminal success for restored consumer b7aa7024191c44c983f7f772a8aab65c, initial operator a135cd59e96140b99c167f6197e7ea17, and actual-host preflight f36d4c428ba849468d20e203049dbf02. Service spans are 176.028, 206.069 and 28.799 seconds respectively. The real host preflight passed all six technical checks against packet 12351980; its overall BLOCKED label reflects unverified live transition, not an invented permission stop.

Evidence: initial-operator-result.json/.log, initial-operator-host-after.json, initial-recovery-job-journal.jsonl, initial-recovery-job-verification.json, initial-restored-consumer-journal-accepted.json and release-review/initial-source-host-preflight.json. Future acceptance must capture limits while a unit is loaded and use invocation-pinned terminal journal evidence after exit. No generic unloaded defaults may qualify a job.

Next: preserve the installed bootstrap and original Thursday forecast; verify the actual Friday state and execute the qualified initial handoff then. Confirm actual issued/public lineage before assigning corrected control authority or registering E-CAL. Storage growth/reserve, probability/mean semantics, authentic statistical reviews and prospective/live-cycle evidence remain open. No provider request, new paid resource or unique record deletion occurred.

Least certain: historical availability and reconstruction assumptions, and compatibility after an OS/native-library change.

Confidence: medium in release readiness—authoritative captured evidence supports it, but reconstruction and same-host compatibility choices could reasonably differ. Lower to low on an independent lineage/restore discrepancy or a failed actual cutoff/issuance transition.
