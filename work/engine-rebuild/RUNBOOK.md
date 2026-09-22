# Rebuild operational runbook — partial implementation

The goal remains active. These procedures cover implemented operations only. Full release rollback, outside-host monitoring, durable capacity and numerical cadence replay are not certified.

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

A new-format closeout first commits its snapshot checkpoint, then writes immutable scorecard/trend/season derivatives. Retries resume the checkpoint. Its local PUBLISHED receipt is not sufficient: the acknowledgment must show a verified source-remote commit containing the receipt. Refits and monthly scans check this dependency. This proves source-repository publication, not website rendering; public-site verification remains a separate unfinished requirement.

## Integrity and capacity

Never rewrite a locked projection or first grade. A conflicting immutable payload fails. On an uncertain write, reconcile the same logical operation and bytes before retrying. Do not delete a pending file owned by another operation or steal its lock.

The root disk remains critically constrained. Package cache removal was temporary recovery only. The prepared 20 GiB volume/migration plan awaits explicit spending and verified-copy-removal authority. No retention changes, artifact deletion or additional paid provider call is authorized by this runbook.

Confidence: high for the explicitly tested recovery transitions and invariant preservation under their stated fault model; this is not a claim of complete operational reliability. Lower to medium if a production caller bypasses these controls or an untested filesystem failure changes the commit semantics.
