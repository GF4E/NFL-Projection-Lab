# Same-host executable recovery procedure

Scope: restore a previously captured source/runtime pair in isolation and prove that the actual consumer works. This does not automatically activate it, restore the OS, change a fit, backdate forecasts, or qualify a statistical release. The ordinary scheduler retains ownership throughout the canary.

## Retained recovery point

- Source commit: `1c34bd80e53b806db2f1cf6607f210493375b943`.
- Standalone Git bundle: `040630d494d75d26f4ff0c9bd3e0a4fa87d887e62dd655a15e33585e4870af3b`, 550,563,892 bytes. Private off-host original remains under `.cloud-private/executable-recovery-20260923/source/`; host copy is under `/mnt/nfl-engine-profiles/`.
- Runtime manifest: `421443b220e5d492d8baf7c714c819ff44f4aa296d235f22aa9b7c1887454a01`; accepted private capture `/mnt/nfl-engine-profiles/runtime-restore-20260923/snapshot`.
- Accepted runtime tree restore: `/mnt/nfl-engine-profiles/runtime-restored-20260923-attempt2`, verified by `runtime-restore-attempt2.json`.
- Source restore: `/mnt/nfl-engine-profiles/source-restored-20260923`, verified by `source-restored-20260923.json`.
- The original `/mnt/nfl-engine-profiles/runtime-restore-20260923/restored` is an incomplete attempt, not an accepted restore. Preserve it.

## Bounded procedure

1. Confirm the actual job state, free bytes/inodes and writable approved storage. A running unit is a verified wait, not grounds to retry. Inspect `ActiveState`, `SubState`, `MainPID`, `Result` and `ExecMainStatus`; `Result=success` alone while active is not completion. Use a fresh destination, receipt and unit name for each new attempt. Do not overwrite partial copies or acceptance receipts.
2. Verify the runtime's immutable intent/acceptance hash and every source member with `engine.projection.runtime_snapshot.restore`. It refuses unaccepted, altered or unsafe snapshots and occupied destinations. Preserve original prefix semantics; internal absolute symlinks are not relocation-safe on their own. Reserve two source sizes before a fresh runtime restore.
3. Verify and restore the standalone Git bundle using `scripts.projection_backup.restore`. Require strict object and working-tree checks, no remote and no object alternates; reserve twice the tracked-tree bytes including the object store. Flush the restored filesystem before accepting the source receipt. Raw source/environment manifests stay private.
4. Capture original host mount identities, namespaces, immutable locks/first grades, active fit and any active pipeline/refit configuration. Require verified source/runtime receipts before constructing the canary. The saved pair is a historical recovery point; do not describe it as today's source merely because it restores successfully.
5. Use a recursively private mount namespace and a separate network namespace. Bind the restored source and runtime at their original absolute paths read-only. Verify actual device/inode identities, service UID, interpreter prefix, read-only flags and namespace separation before scoring. Failure to establish isolation stops execution; never fall back to original host paths. The negative namespace test must reject before producing parity or acceptance receipts.
6. As `nflengine`, reproduce saved forecasts and first grades, then execute `check_full_lifecycle.verify` on captured inputs. One worker, 4 GiB address-space/memory limits, BLAS threads=1. The full-slate consumer job has a hard 570-second kill ceiling; recovery-only copy jobs have their separately declared 1,200-second ceiling. Persist logs in the private volume so SSH loss cannot erase the result.
7. Only after terminal success, independently verify the consumer receipt outside its namespace: original records and mount/namespace identities unchanged; actual kernel/OS identity and mapped external native-library bytes match. A missing receipt, timeout, failed invariant or mismatched dependency is an incomplete/failed qualification. Preserve evidence and investigate; do not activate.
8. Production rollback is a separate controlled release operation. Select a compatible code/fit/calibration/schema/input-history manifest and follow existing owner fencing and release-transition checks. Grade historical games from their original immutable bundles. This runbook does not authorize skipping review, changing control authority or switching a live mount based solely on a copied directory.

Commands and implementation are captured in `restore_runtime_host.py`, `restore_source_host.py`, `prepare_restored_consumer.py`, `restored_consumer_namespace.sh`, `restored_consumer.py` and `verify_restored_consumer_host.py`. These September 23 harnesses pin specific evidence paths; a later attempt must declare its new paths and identity before running. Never reuse the September 23 receipt names for another release.

Confidence: medium in end-to-end operational readiness—the component copies and refusal behavior are verified, including the consumer result, but broader live release and cross-version compatibility still require separate qualification. Lower to low if a retained identity cannot be independently reproduced. Predictive improvement is outside this operational claim.
