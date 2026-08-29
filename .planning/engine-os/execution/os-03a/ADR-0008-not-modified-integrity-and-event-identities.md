# ADR-0008: Apply immutable-evidence and identity rules to not-modified events

## Status

Accepted for bounded provider-independent OS-03A qualification on 2026-08-26.

## Context

Independent acceptance review found three gaps after contract v7. A not-modified confirmation could select an older retained pointer while a newer usable publication event remained stranded. Exact-byte failure during that confirmation was not journaled, so corrupt or unavailable evidence could leave a heartbeat current. Several exported event paths also reached D1 with caller-controlled attempt or idempotency fields that had not passed the central credential scan.

## Decision

Freeze `source-capture-contract.2026.8` and bind it with `engine-os-contract-manifest.2026.12`.

- A not-modified confirmation is eligible only when its retained pointer is the deterministic newest eligible usable publication.
- Response and sidecar bytes are re-read and verified before the confirmation event publishes.
- Missing or corrupt bytes append a deterministic `corrupt_object` failure and alert, retain the pointer only as non-current forensic evidence, and permanently exclude it from later not-modified confirmation.
- A transient read failure appends `storage_failure`, preserves a stale pointer, and remains retryable.
- An older confirmation cannot clear a newer attempt. A later exact verification of the named stranded head may resolve the specific ordering failure.
- Every event identity and persistence column is secret-scanned before an insert statement is prepared.
- D1 triggers independently prohibit a not-modified event or `current` heartbeat state for an older deterministic head.

## Consequences

Not-modified is now a verified evidence publication, not a shortcut around immutable storage. A provider-independent replay can recover a transient read failure, but permanent corruption remains append-only and cannot be relabeled. The event layer fails before persistence when any caller-controlled identity contains credential-bearing material.

This ADR qualifies no live connector, provider authentication, prospective capture, production activation, statistical model, or forecast.
