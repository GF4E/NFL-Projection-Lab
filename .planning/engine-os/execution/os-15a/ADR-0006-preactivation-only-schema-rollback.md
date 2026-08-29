# ADR-0006 — Pre-activation-only schema rollback

## Status

Accepted for OS-15A qualification on 2026-08-26.

## Falsification result

The first rollback definition unconditionally removed the interim scheduler tables. That was safe for an empty qualification deployment but would violate retained terminal-history rules after any scheduler evidence existed.

## Decision

The rollback now aborts before destructive DDL unless every interim scheduler table is empty. It contains no explicit `BEGIN` or `COMMIT`, because Cloudflare D1 executes imports and migrations inside its own transaction. Its guard is an ordinary short-lived table, not a temporary table: D1 can reject temporary schema writes with `SQLITE_AUTH`, while the ordinary guard is still rolled back atomically on refusal and dropped on success. The exact remote mechanism is a D1 migration/file execution, not independent statements from a client loop. Empty-schema rollback preserves the accepted origin-identity spine. After any tick, job, attempt, event, or terminal record exists, rollback means disabling or reverting runtime code while retaining the additive schema and its evidence.

Primary platform references:

- https://developers.cloudflare.com/d1/best-practices/import-export-data/
- https://developers.cloudflare.com/d1/sql-api/foreign-keys/
- https://github.com/cloudflare/workers-sdk/issues/8663
