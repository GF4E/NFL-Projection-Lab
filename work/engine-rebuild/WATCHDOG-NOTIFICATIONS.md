# Repeated NFL monitor notifications — 2026-09-23

The capture service repeatedly cleared and re-entered its failure state. The previous outside monitor notified on changes to the aggregate fault list, so each capture transition re-announced all persistent faults. This is an alert-delivery defect; the underlying failures remain real.

## Change and verification

Keep health assessments and event records immediate. Separately latch each notification incident until 15 minutes of continuously observed recovery. Observer gaps over three minutes and incomplete observations cannot count as recovery. New faults or affected-game identities still alert immediately; a recurrence after confirmed recovery alerts again. Existing delivered incidents migrate without another popup. Notifications now use plain language. Persist submission intent before calling macOS; a submitted notification is not a read receipt and crash-safe human delivery is not guaranteed.

The installed Mac launch agent reads the changed script each minute. Its 15:47:46 UTC observation retained all five active faults but requested no notification; the last OS submission remained 15:42:20 UTC. See watchdog-notification-live-2026-09-23.json. All 25 watchdog tests pass, including an hour of alternating capture status, new faults, recovery, observer gaps and migration. No monitoring was disabled.

## Disk remains exhausted

The root filesystem is 8.7 GiB, effectively full. The checkout consumes about 3.9 GiB (work 1.8 GiB, Git 1.2 GiB, outputs 1.1 GiB; rounded directory figures are not additive proof). Logs occupy about 102 MiB. Inodes are not exhausted. The final-score reader's last successful refresh was 10:16:11 UTC. An anonymous website verification request is blocked by HTTP 403; that is an access gap, not evidence that the website itself is down.

Under existing cache-cleanup authority, removed only /var/cache/fwupd/metadata.xmlb, a regenerable compiled firmware metadata cache, 15,985,551 bytes. Its source metadata remains. The exact hash and before/after service-available bytes are in watchdog-cache-recovery-2026-09-23.json. No NFL evidence was deleted. No logs were removed. After cleanup the filesystem had 16 MiB of root-reserved free blocks but zero bytes available to the engine service. Cleanup therefore did not restore operation.

The prepared 20 GiB storage expansion at $2/month and verified migration remain awaiting spending/migration approval. No volume was purchased and no migration was performed. The notification fix does not resolve capture, final-reader, access or capacity failures. The rebuild remains active; the separate calibration execution plan was not implemented in this incident repair.

Confidence: high in the notification diagnosis and correction, meaning it survives the tested alternative failure sequences and an installed-process observation; this is operational confidence, not a model-accuracy claim. Lower to medium if another observed clear/fail sequence repeats an unchanged incident notification. Least certain: sufficiency of cache cleanup; measuring service-available blocks showed it was insufficient, so no recovery is claimed.
