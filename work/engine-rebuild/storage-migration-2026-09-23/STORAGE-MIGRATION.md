# Approved storage expansion and verified migration

The approved 20 GiB nyc3 volume is installed at USD 2/month before tax. It holds the full engine checkout through a persistent bind at its original absolute path. The root filesystem recovered from zero service-available bytes to 4,134,039,552 bytes; the artifact volume had 16,069,505,024 bytes available at cutover. This is restored capacity, not a measured long-term growth or peak-write guarantee.

## Preservation and recovery evidence

- All 21,161 regular files (4,276,473,751 logical bytes), 23,075 total entries, matched by content SHA-256, length, type, ownership, mode and link target. Full manifest SHA-256: `30b852a9f147b2f0d7f663510f03e95573fd5575c3804e13ed4bb5c18a3c4b26`.
- A 2,114,850,897-byte compressed backup is retained in the ignored private Mac storage-migration directory. Its full extraction and every restored content hash were verified. Archive SHA-256: `4cf89c2133ba4dd172241fbaca432c2fea4b86d6f80cc29f6a6b63e5e50852ac`. Raw manifests remain private alongside the archive and on the volume.
- Manual bind rollback passed before removal; all retained content was rehashed after removal. The exact saved fstab was subsequently exercised by unmounting both mounts and mounting from configuration. No reboot was needed or claimed.
- Only the redundant original checkout entries on the root filesystem were removed, after verified replacement and backup. The root checkout directory remains as the mount point. The private source manifest enumerates every removed duplicate. No unique forecast, grade, ledger, source, Git content or evidence was discarded.
- Engine services require the volume and checkout mounts, with an explicit mount-point condition. Service-user write, fsync, atomic rename and readback passed on both root and artifact storage. All nine Linux storage tests passed. All five original timers were restored.
- Monitoring now checks both filesystems; three added fixtures cover full root, full artifact disk, exhausted inodes, and the distinction between available capacity and peak-write qualification. All 28 watchdog tests passed.

## Corrections retained

The initial root mount-directory creation failed for lack of space; the existing empty /mnt was used. The provider's preformatted filesystem image initially occupied only 512 MiB, so its filesystem was grown to the already provisioned 20 GiB before the successful copy. Neither root size nor its reserved blocks were changed.

The first cleanup guard stopped because root free space did not increase. Shared mount propagation had mirrored the destination into the temporary root view. The original root copy and verified off-host backup were intact. The one affected destination Git pack was restored from its original root copy and hash-checked. The corrected underlay is recursively private, with device and mount checks after the bind. A separate Linux mount-namespace canary verifies that failure mode. A subsequent directory timestamp-only mismatch was restored from the source after both full content checks had passed; metadata-continuation.json records the continuation. Final whole-tree verification passed.

Restart exposed a cold Git-index refresh taking 56.93 seconds, exceeding the existing 45-second scheduler sync limit; automatic Git maintenance was also active. Under the existing dispatch lock, refreshed the index, fetched and merged normally with a bounded maintenance command. No forced reset, model change, paid data refresh, or permanent scheduler timeout change. The normal writing timers were restored after synchronization.

## Scheduled recovery observed

After normal timers resumed, the final-score reader refreshed successfully at 2026-09-23 17:10:41 UTC, replacing its stale 10:16:11 UTC success. The 17:11:02 UTC host monitor no longer reported disk exhaustion or a stale final reader; its only remaining local finding was the explicitly unqualified peak-write/growth reserve. The cutoff service also completed successfully at 17:11:08 UTC. These are observed scheduled results, not an inference from service startup. See scheduled-recovery.json; the earlier receipt is retained separately.

## Billing and remaining limits

The user reports USD 3.29 signup credit. The billing API does not expose its promotional balance or expiration, so no deduction or remaining credit is asserted. The approved incremental cost remains USD 2/month before tax. Official pricing: https://docs.digitalocean.com/products/volumes/details/pricing/ .

The website's anonymous-access qualification and measured peak-write/growth capacity qualification remain separate open items; moving data does not silently qualify them. The monitor retains those explicit limitations. Full rebuild acceptance remains open; this migration changes storage and operational monitoring, not forecast mathematics.

Confidence: high in preserved content and restored writable storage, supported by whole-tree hashes, complete off-host restore, rollback, persisted remount and service-user write checks. Lower to medium if a subsequent restart or independent restore fails. Least certain was mount propagation; the actual safety-stop evidence led to private mount isolation and a targeted Linux canary before proceeding.
