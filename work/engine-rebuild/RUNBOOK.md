# Rebuild operational runbook — partial implementation

The goal remains active. These procedures cover implemented operations only. Full release rollback, always-on outside-host coverage, durable capacity and numerical cadence replay are not certified.

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

## Independent monitoring

The new `nfl-engine-watchdog.timer` runs a separate read-only observer every 60 seconds, outside the capture/daily dispatch lock. Its current state is `/run/nfl-engine-monitor/host.json`; outside receipts are `outside-receipt.json`. This tmpfs state can still be written when the root data filesystem is full. It is not a backup; reboot begins a new observation epoch. The Mac retains material observations in `~/Library/Application Support/NFLProjectionMonitor/`, with `outside.json`, acknowledgments, and immutable incident changes in `events/`. No normal poll creates a Git commit or incident file.

The Mac LaunchAgent `com.gabe.nfl-projection-watchdog` runs every minute, reading the host's saved heartbeat and checking the actual website API. Its SSH read never refreshes the host heartbeat. Only after a durable local report does it submit a content-hashed outside receipt. Retrying an identical receipt does not extend its age. Each side flags the other's heartbeat after 180 seconds. The Mac is an outside failure domain only while awake, connected and logged in; simultaneous failure of both observers has no independently delivered alarm. Native notifications are requested only for material changes and recoveries; successful submission is not proof the user saw one. Inspect `notification.json` for submission/failure status.

Transient worker failure requires 60 seconds of continuous evidence. Missing locks and integrity failures are immediate. Publication lag allowance is 840 seconds, derived from installed service/cache/observation limits, not a late-issuance allowance. The reader is flagged stale at 900 seconds, adding its normal 60-second poll period. Full-job headroom remains UNQUALIFIED regardless of a positive byte count. An old but identical source/public board is healthy; fresh metadata never substitutes for matching content. See `GAP-SWEEP.md` for the Tier 2 alternatives and detection budgets.

The current unauthenticated website API returns 403. This is `PUBLIC_ACCESS_UNQUALIFIED`, not a website outage finding. That observation channel latches instead of repeating unauthorized requests every minute. Once the endpoint's access is legitimately corrected, explicitly recheck with:

```sh
/opt/anaconda3/bin/python3.12 -B scripts/projection_watchdog.py outside --retry-public
```

The monitor never loads browser credentials, takes ownership, restarts a paid worker, changes a fit, or rewrites forecasts. Preserve an unresolved alarm while investigating it. Current metrics use the independently pinned schedule denominator; physical on-time commit receipts and first-verified-final availability are still NOT_RECORDED, so no grade-latency or full issuance-SLO percentage is claimed from them. Installation and actual-cycle evidence belongs in `watchdog-verification.json`; unit definitions or green fixtures alone do not establish it.

Confidence: high for the explicitly tested recovery transitions and invariant preservation under their stated fault model; this is not a claim of complete operational reliability. Lower to medium if a production caller bypasses these controls or an untested filesystem failure changes the commit semantics.
