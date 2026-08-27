# ADR-0007: post-publication corruption and credential-field hardening

## Status

Accepted before hosted OS-03A qualification.

## Context

Independent acceptance review found four cases not made explicit by source-capture contract v6. First, an object could verify and become the current pointer, then fail exact-byte verification later. The database guard rejected the stale-state update because the newly appended corruption event made the retained pointer ineligible. Second, common camel-case credential field names were not rejected consistently across canonical metadata, JSON, and non-JSON textual bodies. A related chronology review found that an older not-modified confirmation could mark a source current after a newer failure. Third, a deterministic publication event could commit while a concurrent newer failure advanced the heartbeat clock and prevented the pointer batch. A retry then treated the prior publication event as complete even though the candidate remained stranded. Fourth, a real provider failure could arrive after the pointer batch but before its postcondition read; the publisher could mislabel that causal successor as its own pointer failure and later heal it.

## Decision

Source-capture contract v7 supersedes v6. An already-published pointer that later becomes permanently ineligible remains as an immutable last-known reference only while the heartbeat is non-current, source identity is unchanged, and last success does not advance. It cannot be newly selected or restored to current. Not-modified confirmations exclude permanently ineligible heads and cannot clear a newer failure. A retry may finish a stranded pointer only when the deterministic publication and matching pointer-failure events exist and the candidate remains the deterministic eligible head; an incumbent that is deterministically newer wins, while an unexplained prior publication without its pointer fails closed. If the pointer is correctly installed but a causally newer attempt has already made the heartbeat non-current, publication is successful and must preserve that newer state rather than journal or later heal it. Compound auth, ID, CSRF, and client token field names are rejected in metadata, JSON keys, and textual assignments.

## Consequences

The capture-failure event and stale heartbeat can commit atomically without moving the pointer backward or hiding the corruption. Restoring the bytes does not erase the permanent failure or make the capture current again. The accepted scope remains fixture-only and provider-independent; this decision authorizes no provider request, secret read, production migration, or prospective capture.
