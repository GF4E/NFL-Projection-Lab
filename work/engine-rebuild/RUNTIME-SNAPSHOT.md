# Private runtime recovery — September 23

The actual installed runtime was captured and accepted after exact source/copy verification: 27,481 entries, 23,577 regular files, 1,733 internal symlinks and 800,655,733 file bytes. Manifest SHA256: 421443b220e5d492d8baf7c714c819ff44f4aa296d235f22aa9b7c1887454a01. Raw manifests and copies remain private on the approved volume at /mnt/nfl-engine-profiles/runtime-restore-20260923.

The subsequent restore did not complete. The SSH command returned 255; the bounded command had a 570-second kill ceiling. Independent observation found no worker, no terminal receipt, a preserved partial restore, and an accepted capture. The exit code alone does not establish whether the ceiling or transport caused termination. No successful restore or executable rollback is claimed. Original runtime was never replaced; no activation or provider request occurred.

Eight recovery fault/roundtrip fixtures pass on Mac and actual Linux; the broader 498-test projection suite passes. They cover interrupted copies, source changes, changed bytes/metadata, occupied destinations, external links/unsafe ancestors, nested destinations and manifest tampering. Initial local module-name invocation failed because tests is not an importable package; unittest discovery then executed the actual tests. The first read-only host observation hit Git's ownership guard; repeating only the Git read as nflengine succeeded without changing Git trust settings.

At 19:11:22 UTC, root free space was 4,135,436,288 bytes; approved-volume free space was 14,345,846,784 bytes. Host commit f14f2a466994730c0be59fd1fa2f2ac6cd97e1a0. Evidence: runtime-snapshot-host.log, runtime-snapshot-host-observation.json and tests-runtime-snapshot-host.json.

Next: independently revalidate the accepted snapshot, complete a fresh isolated restore without overwriting the retained partial copy, then recover the pinned source with the existing standalone Git-bundle verifier and qualify OS/native compatibility. Only a fixed-prefix private mount/network namespace consumer canary can establish executable recovery. Preserve the original host mounts and immutable records. The 570-second operation here is not an actual full-slate forecast operation; any differently bounded recovery qualification must be declared before running, not applied retrospectively to this attempt. Do not restart capture unnecessarily or infer success from file presence.

Least certain: why the SSH command ended; preserve the observed exit and missing receipt rather than infer a successful or timed-out restore.

Confidence: medium in recovery readiness—exact authoritative capture evidence exists, but the complete restore and actual consumer have not passed. Lower to low if independent snapshot verification fails. This rating does not claim predictive improvement.
