# ADR-0009: Separate not-modified confirmation and verification clocks

## Status

Accepted for bounded provider-independent OS-03A qualification on 2026-08-26.

## Context

Adversarial review found that contract v8 correctly re-read immutable response and sidecar bytes before accepting a not-modified confirmation, but the implementation reused `confirmedAt` as the observation time for any exact-byte verification failure. A delayed confirmation at T8 could arrive after a current heartbeat at T9, discover corruption at T10, and attempt to journal the corruption at T8. Heartbeat monotonicity would preserve the current pointer, and the independent corruption guard would then roll back the transaction, including the failure event and alert.

## Decision

Freeze `source-capture-contract.2026.9` and bind it with `engine-os-contract-manifest.2026.13`.

- `confirmedAt` remains the immutable source-confirmation time and the event time of a successful `not_modified_confirmed` record.
- Exact-byte verification uses a separate local observation clock. Failure journaling must never substitute `confirmedAt` for that observation.
- Permanent corruption or transient storage failure advances `last_attempt_at` and `last_failure_at` to the verification observation, preserves the prior `last_success_at`, and leaves the forensic pointer stale.
- A delayed or replayed confirmation cannot regress or erase later failure evidence.
- A successful older confirmation remains append-only evidence but cannot clear a newer failure or regress heartbeat clocks.

## Consequences

Provider time and local verification time retain distinct meanings. Exact-byte corruption discovered by a delayed response is journaled once and remains independently auditable; transient read failure remains retryable after bytes recover. This ADR qualifies no live connector, provider authentication, prospective capture, production activation, statistical model, or forecast.
