# ADR-0005: Separate immutable manifest commitment from verified pointer publication

**Status:** Accepted before final OS-03A qualification
**Date:** 2026-08-26

## Context

Independent integrity review found a contradiction between two useful requirements. Contract v3 placed the immutable manifest and latest-good pointer in one D1 batch, while contract v2 prohibited a transient pointer to anything other than fully verified evidence. A storage fault occurring after the D1 batch but during the required post-commit R2 readback could briefly expose a candidate that did not pass that readback. Moving the pointer backward with a delete-and-reinsert compensation would bypass the migration's forward-only database guard and was rejected.

No isolated D1/R2 qualification or production activation had occurred when this issue was found.

## Decision

Freeze `source-capture-contract.2026.5` and replace the usable-capture publication boundary with two D1 batches separated by a committed-row R2 verification:

1. Publish and verify the response and sidecar objects.
2. Atomically append the base manifest, extension, and `capture_committed` candidate event without changing latest good.
3. Resolve the object keys from those committed rows and verify both R2 objects and every bound hash again.
4. Atomically append `capture_committed_usable` and advance the heartbeat pointer forward only.

The fourth step is the successful verification event and supplies the freshness time. A failure after step two uses a deterministic, distinct attempt token to append the failure event and alert while preserving any prior latest-good pointer. Runtime code may not delete a heartbeat, clear a pointer, move a pointer backward, or conceal the failed candidate. A retry must repeat committed-row R2 verification before it may complete the fourth step.

Freshness limits are bound to the frozen OS-00B profile mapping. Caller-selected thresholds cannot change the result. A stale, partial, or unavailable heartbeat cannot be reported as current merely because a retained last-good capture is still young.

## Consequences

- The pointer is never intentionally exposed before the final committed-row byte verification.
- Append-only manifests and failures remain visible even when pointer publication cannot complete.
- Crash recovery can finish a missing pointer publication without rewriting evidence or moving a pointer backward.
- V3's same-batch pointer clause and v4's manifest-time verification clause remain preserved as superseded audit history.
- This correction does not qualify a real connector, authenticated market capture, production activation, or a production orphan sweeper.
