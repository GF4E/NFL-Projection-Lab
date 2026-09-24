# Rebuild operational runbook — current operating instructions

The goal remains active. Current operating facts below supersede obsolete next-action statements in historical reports; those reports and immutable review snapshots remain preserved. Recovery and same-code handoff/rollback are verified on captured inputs. Actual corrected issuance/control authority, the statistical gates, sustained storage reserve, authentic method reviews and an observed live cycle remain incomplete.

## Current state and next action

Repository of record: `GF4E/NFL-Projection-Lab`, engine-v2, `/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6`. Live owner: `digitalocean:599707390`; service account `nflengine`; interpreter `/opt/nfl-runtime/env/bin/python -B`. Do not invoke a provider worker outside the scheduler owner/dispatch fence.

The current review pointer is `work/engine-rebuild/release-review/current-ref.json`. At this reconciliation it resolves to packet `d7e4d6ae770902a6d3b61ac76b318d77181dcbf2393c147774140d1254d0d260`, restored source `e14390e567d1b6357bdd88a2b8c8910becf4b0c6`, issuing source `e2959f43db758e41ebed880501c87a6b149472d0`, and active fit `801ef07927ea59bc112fc955ad86249b981d5e60a0f4a9636f39b2eb23be623f`. Resolve and verify hashes afresh; neither a version label nor a newer documentation-only Git HEAD establishes a new model.

| Capability | Installed/current state | Next required evidence |
|---|---|---|
| Capture, grading, existing report publication | Automatic under current legacy projection path | Continue immutable locks/first grades and matching public bytes |
| Fri/Mon/Tue 06:00 Pacific state worker | Installed, NUMERICAL_SHADOW; first state Friday September 25 2026 at 13:00 UTC | Actual completed cutoff acknowledgment; no backdating |
| Corrected scheduled issuance and coupled weekly configuration | Implemented and captured-canary verified; both active pointers absent | Stage/activate exact qualified plan through INITIAL-HANDOFF-RUNBOOK.md after eligible state; independently verify issued/public lineage |
| Weekly probability diagnostics | Automatic report-only first-grade computation | Preserve exact original calibration, explicit lineage strata and named shortfalls |
| Prospective paired comparison | Implemented, NOT_ENROLLED | Verified production/control association before actual pre-lock enrollment |
| E-CAL-LINEAGE, then E-VENUE-DIRECT | No real calibration registration or fitting yet | Authoritative corrected control, Tuesday published closeout and refit, hashed registration, gate and authentic reviews |

Next actual state is Friday September 25 at 06:00 Pacific. Thursday keeps its original legacy lock. A timer definition, simulation or waiting status is not a completed cutoff. Initial stage/activation is an explicit operator action; scheduler recovery resumes only a matching transaction already begun. The first eligible experiment slot is Tuesday September 29, conditional on its closeout/refit and control qualification; do not invent a prior preregistration date. Read INITIAL-HANDOFF-RUNBOOK.md for exact commands and RUNTIME-RECOVERY-RUNBOOK.md for the current recoverable pair.

## Installed schedule and process limits

The timer definitions are observed on the actual host in `runbook-reconciliation/installed-timers.json`. Capture checks due windows every 15 seconds; daily preparation/grading runs hourly; learning is Tuesday 06:00 Pacific; cutoff state is Friday/Monday/Tuesday 06:00 Pacific with a minute catch-up check; the independent host watchdog runs each minute. Timers remain enabled/active and storage mount dependencies are retained. A timer tick is not an additional paid pull: the existing due-window, ownership and provider ledgers still govern requests.

| Service | Hard oneshot start ceiling | Memory cap | Swap cap | CPU quota |
|---|---:|---:|---:|---:|
| Capture | 240 seconds | 400 MiB | 1,500 MiB | One CPU |
| Daily preparation/grading | 570 seconds | 400 MiB | 1,500 MiB | One CPU |
| Tuesday learning | 570 seconds | 4 GiB | Zero | One CPU |
| Cutoff state | 570 seconds | 4 GiB | Zero | One CPU |

These numerical services set OPENBLAS, OMP, MKL and NUMEXPR threads to one and retain the shared dispatch fence. A oneshot uses `TimeoutStartSec`; `RuntimeMaxSec=infinity` alone does not mean its startup job is unbounded. Timeout uses SIGKILL on the whole control group, including stubborn descendants. Preserve timeout/partial-write evidence, reconcile the same durable operation and never start a second run because an SSH observation ended. The isolated two-second timeout fixture proves both parent and child are killed; it is not a full workload latency claim.

REVIEW REQUESTED (Tier 2): the daily/learning/cutoff 570-second ceiling includes preparation, lock wait and publication, using the existing canary budget inside ten minutes. A phase-specific supervisor with a longer outer orchestration window is the alternative. Do not silently extend timeouts if a future job fails. Registered experiment workers remain separate, with their own 2,700-second phase ceiling and 4 GiB limit; reports never launch them. The weekly scheduler explicitly disables automatic method promotion.

Before changing a service: preserve its installed bytes, validate the replacement with systemd-analyze, stop only its timer if needed, allow existing work to finish, acquire the real dispatch fence and require the service inactive. Install atomically, reload, inspect loaded limits and restore prior timer states; never manually start capture or learning merely to test the unit. The current installation receipt and exact unit hashes are in RUNBOOK-RECONCILIATION.md.

## Public final-feed recovery

The scheduled capture worker retains the branch ownership fence and its process lock. The final reader adds an exclusive local lock, records the owner and policy hash, and records intent before a free public GET. A held lock has no expiry. This policy must never be used for paid or mutating API requests.

| State | Evidence | Permitted automatic action | Limit / exit check |
| --- | --- | --- | --- |
| HEALTHY | Valid source hash and successful prior commit, or initial reader readiness | Poll the public final feed after its existing 60-second freshness interval | Valid parse, durable source and pointer, then matching completion receipt |
| RECOVERING | A durable attempt intent exists | Finish that attempt; after a crash, verify committed operation ID and payload/source hashes before another GET | Three attempts maximum, 120-second burst; a prior unfinished attempt is charged and backed off |
| DEGRADED | A transient request failed and a retry remains | Retry after recorded exponential jitter, without blocking sleep | 15-second base plus deterministic jitter, then 30-second base; do not start past the burst deadline |
| STALE | Last-good data exists but the transient burst expired | Preserve its received_at and scores; one public probe every 600 seconds | One attempt per probe; success requires a new verified commit, dated at actual retrieval |
| FAILED_CLOSED | No usable final feed, or a hard integrity/configuration/ownership failure | For a transient outage with no feed, the same single-probe rule; for a latched hard failure, no automatic network request | Reconcile cause and owner before resumption; missing data is never fabricated |

The 120-second burst is two normal poll periods. The probe interval uses the existing ten-minute full-slate budget. These are disclosed Tier 2 recovery-policy choices, not fitted reliability probabilities. The existing public request timeout remains eight seconds. A response completing after the burst deadline is recorded as late, not backdated. Normal successful polls maintain one current operation record; failure/recovery snapshots are immutable.

Inspect `outputs/projection-v3/operations/final-feed.json` and its `history/` snapshots. Inspect `outputs/projection-v3/final-feed.json` for the committed operation ID and last-good received_at. The scheduler reports DEGRADED if final-feed recovery is unhealthy, even if it published other valid artifacts. A success exit from another component does not clear this condition.

For a hard failure: preserve all history, confirm the source/schema/credentials or disk problem, and validate the corrected source plus owner before resuming. Do not clear the state file by hand or silently change its policy hash. Use the fenced operator command below only after correcting the named cause. It verifies the committed scheduler owner, fetches and validates a fresh public source, durably stores it and a repair proof, then resumes with a new operation ID. Failed validation leaves the latch unchanged. A corrupted existing last-good record must first be restored to its verified bytes; the command cannot merge it into a fresh feed. Ownership, policy and clock conflicts still require their separate reconciliation.

```sh
/opt/nfl-runtime/env/bin/python -B scripts/projection_final_repair.py --host digitalocean:599707390 --reason SCHEMA_FIXED
```

Other named reasons are ACCESS_RESTORED and STORAGE_RESTORED. Run as the configured service account from the service checkout. The command makes one free public GET when repair is needed; it makes no paid-provider request. Do not edit or delete the recovery state file. A held scheduler lock causes a clean defer, not takeover.

## Closeout publication

A new-format closeout first commits its snapshot checkpoint, then writes immutable scorecard/trend/season derivatives. Retries resume the checkpoint. Its local PUBLISHED receipt is not sufficient: the acknowledgment must show a verified source-remote commit containing the receipt. Refits and monthly scans check this dependency. This proves source-repository publication, not website rendering. The installed curl transport now verifies exact frozen public scorecard/trend/season bytes and retains a separate immutable acknowledgment. The current recovered packet binds the September 22 closeout acknowledgment observed September 23 at 17:50:24 UTC. Every new closeout still requires its own matching live proof before a dependent refit or experiment. See PUBLIC-TRANSPORT.md, BOARD-BYTES.md and outputs/cadence-v2/closeouts/public-acknowledgments.

## Integrity and capacity

Never rewrite a locked projection or first grade. A conflicting immutable payload fails. On an uncertain write, reconcile the same logical operation and bytes before retrying. Do not delete a pending file owned by another operation or steal its lock.

The approved 20 GiB volume at USD 2/month before tax is installed; the checkout is persistently bound at its original path. Full content copy, off-host restore, rollback/remount and service-user writes were verified. Signup credit was user-reported; its balance/expiration is unverified. Monitor root and artifact filesystems separately, including inodes and write capability. A sample of free bytes is not a sustainable reserve. Daily growth collection is installed; the captured lifecycle observed 36,229,120 allocated bytes at peak on its pinned source, excluding metadata/unobserved transients, Git repack, backup/restore and historical research. See storage-migration-2026-09-23/STORAGE-MIGRATION.md and STORAGE-PROFILE-COMPLETE.md.

Do not delete unique artifacts or broaden retention authority. Only previously authorized, fully verified duplicate/cache removals have occurred. The obsolete expanded source-1c34, source-76 and source-50 trees are retired; their standalone archives, private removal manifests and every acceptance receipt remain. Use the current restored source under /mnt/nfl-engine-profiles/source-recovery-qualified. Preserve the newer historical diagnostics restore and all runtime evidence. Capacity remains STORAGE_HEADROOM_UNQUALIFIED pending growth and the remaining workload reserve, even though disk exhaustion recovered.

## Independent monitoring

The new `nfl-engine-watchdog.timer` runs a separate read-only observer every 60 seconds, outside the capture/daily dispatch lock. Its current state is `/run/nfl-engine-monitor/host.json`; outside receipts are `outside-receipt.json`. This tmpfs state can still be written when the root data filesystem is full. It is not a backup; reboot begins a new observation epoch. The Mac retains material observations in `~/Library/Application Support/NFLProjectionMonitor/`, with `outside.json`, acknowledgments, and immutable incident changes in `events/`. No normal poll creates a Git commit or incident file.

The Mac LaunchAgent `com.gabe.nfl-projection-watchdog` runs every minute, reading the host's saved heartbeat and checking the actual website API. Its SSH read never refreshes the host heartbeat. Only after a durable local report does it submit a content-hashed outside receipt. Retrying an identical receipt does not extend its age. Each side flags the other's heartbeat after 180 seconds. The Mac is an outside failure domain only while awake, connected and logged in; simultaneous failure of both observers has no independently delivered alarm. Native notifications are requested only for material changes and recoveries; successful submission is not proof the user saw one. Inspect `notification.json` for submission/failure status.

Transient worker failure requires 60 seconds of continuous evidence. Missing locks and integrity failures are immediate. Publication lag allowance is 840 seconds, derived from installed service/cache/observation limits, not a late-issuance allowance. The reader is flagged stale at 900 seconds, adding its normal 60-second poll period. Full-job headroom remains UNQUALIFIED regardless of a positive byte count. An old but identical source/public board is healthy; fresh metadata never substitutes for matching content. See `GAP-SWEEP.md` for the Tier 2 alternatives and detection budgets.

Current outside-monitor evidence records public bytes VERIFIED using the explicitly configured anonymous curl transport. The earlier urllib 403 and subsequent parse/reserialize hash defect are preserved historical failures, resolved by the qualified transport and byte-preserving reader. No credentials or access-policy change were used. A future PUBLIC_ACCESS_UNQUALIFIED is not automatically a website outage. The denied channel latches rather than repeating requests every minute; only after correcting the named cause, explicitly recheck with:

```sh
/opt/anaconda3/bin/python3.12 -B scripts/projection_watchdog.py outside --retry-public
```

The monitor never loads browser credentials, takes ownership, restarts a paid worker, changes a fit, or rewrites forecasts. Preserve an unresolved alarm while investigating it. Current metrics use the independently pinned schedule denominator. Due cutoff-contract cards consume verified physical issuance receipts; valid legacy cards retain UNKNOWN commit timing. The all-season issuance rate stays null/PARTIAL while unknown records remain. This measures local durable bundles, with public delivery separate. First-verified-final availability and grade-commit latency remain NOT_RECORDED. See ISSUANCE-SLO.md. Installation and actual-cycle evidence belongs in `watchdog-verification.json`; unit definitions or green fixtures alone do not establish it.

Confidence: high for the explicitly tested recovery transitions and invariant preservation under their stated fault model; this is not a claim of complete operational reliability. Lower to medium if a production caller bypasses these controls or an untested filesystem failure changes the commit semantics.

## Scoring bundles

New cards carry forecast_bundle_ref and release_ref. Resolve them with engine.projection.bundle.verify_card(root, card); never reconstruct from a version name or current fit pointer. A failed hash, schema, missing calibration or changed forecast stops locking/grading/publication. Restore the exact referenced record from verified evidence; do not strip references to force the legacy path. Old cards retain their original convention and frozen calibration registry.

The scoring child receives one batch of allowlisted values and existing fit/residual parameters, with no inherited credentials and one numerical thread. It reads stdin, imports the existing implementation, then forbids further source file/network/process access while calculating. Failure/timeout propagates; no fallback execution with raw rows. The guard is not a hostile native-code sandbox. Prepared inputs must match their recorded hash and active fit.

Bundles are immutable deterministic gzip records, committed before card references. An unchanged card/input/release retains its previous issued time and bundle. A release manifest records exact code files, last code-changing commit and scorer environment identity; uncommitted issuing code is refused. This bundle alone does not install archived executables or roll back the pipeline. Full restored consumer and initial same-code handoff/rollback are now verified separately in SOURCE-QUALIFIED-RECOVERY.md. Never edit current-release references as a substitute for the fenced, configuration-compatible operation.

Chronology fields explicitly distinguish captured values/hashes from source publication/first-seen/cutoff evidence missing in legacy preparation. Do not call those source vintages verified, or relabel legacy ridge centers as distribution means. Reproduction proves the captured computation; it does not validate all preceding feature construction.

## Lossless final-source archives

Use engine.projection.source_archive.read_source(root, feed). source_sha256 always identifies the original provider bytes. A new source_ref may additionally identify a .csv.gz artifact by its stored-byte sha256, encoding=gzip and sha256_uncompressed. Verify stored bytes first, decompress, then verify the original hash. Do not infer compression solely from a filename or silently fall back when an explicit reference fails.

store_source reuses verified existing CSV or gzip evidence and completes durable retries. It only compresses a new distinct source; no historical migration/deletion occurs. Restore the exact referenced bytes on corruption. Do not rewrite received_at after a failed ingestion. The existing bounded final-reader recovery/owner rules still apply. Board-context, weekly diagnostics and watchdog use this same adapter; no line data enters the scorer.

Compatibility: once a feed references gzip, a pre-adapter final-source reader is incompatible. Any later rollback must retain this storage reader or restore a verified compatible release/data combination. Never strip source_ref or manufacture a CSV fallback to make an old executable appear compatible.

## Committed-record recovery point

scripts/projection_backup.py pins the already-fetched origin/engine-v2 commit and writes a standalone Git bundle under .cloud-private/recovery-points on the Mac. It adds a local refs/rebuild-backups/<commit> pin; it does not change the working branch or push that backup ref. One Git packing thread is used. The backup is accepted only when its SHA256, complete Git object graph, every restored tree entry and the restored forecast/grade calculations pass. See work/engine-rebuild/backup-restore.json for the exact accepted commit and path.

Restoration uses a new directory and the local bundle only, with hooks/global Git configuration disabled, no object alternates and no configured remote. It never overwrites an existing restore destination, starts a scheduler, refits or publishes. A failed/interrupted run is not an accepted recovery point; preserve its evidence and inspect the actual process before any restart. The archive file is staged and fsynced before its final name, and receipts use the existing durable writer.

Scope: committed source and artifact history only. Ignored/uncommitted inputs, credentials/ownership state, the installed Linux environment and services, and public-site deployment are excluded. The original backup-restore.json consumer used Mac Python and remains historical evidence. The newer source-recovery-qualified evidence executes physically restored Linux source and runtime at their original prefixes; that is same-host executable recovery, not OS, credential, service or whole-machine disaster recovery. Do not use this receipt as authority to remove host originals or to claim a full-host recovery procedure is complete.

Attempts write backup-attempt.json; only a verified restoration writes a new immutable backup-receipts/<hash>.json and updates backup-restore.json. Failed attempts retain the last accepted recovery point. The destination-local .backup.lock is exclusive and nonblocking; LOCAL_BACKUP_ACTIVE performs no archive work. This is local exclusion, not a cross-host ownership transfer.

## Executable scorer restoration

engine.projection.executable builds a package from an exact release reference and that release's code commit. It follows repository imports (including package initializers), verifies the hashes already captured by the release, and embeds the exact fit/calibration bytes. Files absent from the original manifest are labeled reconstructed from its Git commit. The package is immutable and hash-addressed under outputs/projection-v3/executables; it is not a production activation pointer.

Restore into a new private directory only. Verify the complete member set and every byte before execution. The isolated child imports from that restored directory, receives only the existing football input contract, and uses the package's own fit/calibration. A mismatched prepared-fit reference, native runtime fingerprint, source member or artifact stops execution with no fallback to the active checkout. The runtime fingerprint covers the interpreter, imported module/cache files, packaged NumPy libraries and, on Linux, mapped native-file bytes. Non-Linux native coverage is explicitly limited; the host test is the production-runtime evidence. Neither fingerprinting nor scorer restoration archives the Linux OS, credentials or services.

work/engine-rebuild/verify_executable_host.py runs candidate fixtures and saved-forecast reproduction under the actual service identity in temporary host storage. It returns verified packages and a receipt to the Mac; it never changes the active release, prepares new inputs, fits, invokes a provider or publishes. Restore qualification is recorded separately from package creation. Compatible rollback requires preparation/state, ownership, publication and legacy-record compatibility. The current captured initial-operator canary verifies that bounded same-code path; cross-version compatibility and an actual live cycle remain separate requirements. Do not substitute current-release-ref.json edits for those checks.


## Prepared-state transaction

The v3 writer stores prepared-features/<sha>.json.gz, then prepared-manifests/<sha>.json, then atomically commits current-ref.json. The current pointer contains the exact features_ref and prepared_manifest_ref. All active v3 readers use engine.projection.prepared.load; it verifies both immutable records and their identities. An explicit historical prepared_manifest_ref resolves independently of the current pointer. It preserves old values and source metadata, not an invented old issuance time.

The old current-features.json.gz remains preserved legacy data. New production readers must not use it when an explicit snapshot reference exists. Missing/corrupt explicit records fail closed. Repair from verified records rather than stripping references to force a legacy fallback. An unchanged valid legacy cache can be migrated byte-for-byte; a new build retains the existing feature math and current source evidence.

Preparation and weekly_refit share .cloud-private/projection-preparation/writer.lock. Busy means stop; there is no timeout takeover. Cloud dispatch ownership still encloses the job. The current fit must match at both ends of preparation. After a successful weekly refit, the scheduler prepares that fit before republishing; failures preserve the last completed snapshot and do not justify relabeling it as the new fit. A post-pointer response loss is reconciled by reading the exact pointer and retrying the same payload.

Storage failures can leave unreferenced immutable snapshot files; they are preserved evidence, not accepted publication. No automated deletion is introduced. These snapshots plus a verified scorer package support exact restored computation; the initial preparation/configuration handoff and rollback now pass in captured restored execution. Actual activation and the observed Tuesday sequence remain separate requirements.


## Scheduled selection capability — not activated

The actual preparer exposes prepare(select_scheduled=True), with no manual state/game/role arguments. It requires an existing configured cutoff worker and completed state-operation receipts. Each due game's exact required cutoff is mandatory; a future-cutoff game may be PROVISIONAL on the latest completed state. Receipt completion time, configuration and exact state hash are retained in preparation and revalidated at first lock. An execution-start timestamp alone is insufficient.

All groups render before one prepared-pointer commit. A staged immutable group left by interruption is not a published update. Retry reconciles unchanged references without refreshing their original clock. A scheduled prepared manifest cannot revert through the default legacy or manual-state adapter; a qualified compatible release/rollback must manage a deliberate switch. The current cloud scheduler has not enabled this option. Do not activate it by editing prepared metadata or bypassing the owner fence. Evidence and unresolved release prerequisites are in SCHEDULED-SELECTION.md.

## Preparation-mode release transitions — not activated

engine.projection.pipeline_release retains exact code/environment identity, fit, calibration, immutable prepared checkpoint and scheduled configuration. No active pipeline-releases/active.json is created by normal startup or this source installation. Without one, current production behavior remains legacy. Once a qualified manifest is active, the preparer chooses its mode; manual overrides and incompatible code/fit/configuration fail closed. Coupled weekly configuration/training handoff is implemented and captured-canary verified through initial_release. It remains uninstalled until the qualified initial operator runs after the actual eligible cutoff. The operator, not manual pointer edits, enforces this transition.

An explicit same-fit switch acquires the real cloud-dispatch and preparation locks, verifies the current owner, reconstructs the target preparation, records an immutable intent/id, then updates the prepared and active pointers and acknowledges completion. Callers must already have verified remote ownership; this library is not an ownership-transfer CLI. A partial switch blocks dependent work. Correct the cause, retain the same operation ID/target/expected parent, and reconcile; there is no automatic unbounded retry. A changed payload or owner under the same ID, or a replay after another completed transition, fails. Completion-response retries do not overwrite a later compatible preparation.

A target cannot omit currently visible games. Do not roll back state history, alter first grades, restore an old fence or strip cutoff references from locked cards. A same-fit rollback changes future preparation mode and restores its original checkpoint clock; it does not backdate a forecast. New states and original bundles remain readable for grading. Weekly weight-only refits use the qualified weekly_refit orchestration and its durable switch record. Arbitrary changed-executable/runtime or method migrations still need a compatible release qualification; same-host recovered execution is not whole-machine recovery.

Confidence: medium in release readiness — the bounded transition is supported by captured-input evidence but broader compatibility and a live cycle remain unverified. Lower to low if a real consumer admits a pending/mismatched release or hides a visible game.
