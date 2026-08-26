# ADR-0006 — Pre-activation-only schema rollback

## Status

Accepted for OS-15A qualification on 2026-08-26.

## Falsification result

The first rollback definition unconditionally removed the interim scheduler tables. That was safe for an empty qualification deployment but would violate retained terminal-history rules after any scheduler evidence existed.

## Decision

The rollback now aborts before destructive DDL unless every interim scheduler table is empty. Empty-schema rollback runs transactionally and preserves the accepted origin-identity spine. After any tick, job, attempt, event, or terminal record exists, rollback means disabling or reverting runtime code while retaining the additive schema and its evidence.
