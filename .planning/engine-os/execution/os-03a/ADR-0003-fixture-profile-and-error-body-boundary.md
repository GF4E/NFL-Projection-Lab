# ADR-0003: Bind OS-03A qualification to explicit fixture profiles

**Status:** Accepted
**Date:** 2026-08-26

## Decision

OS-03A qualification accepts only the seven route and content-type profiles frozen in `source-capture-contract.2026.3`. Binary evidence is limited to the credential-free play-by-play fixture profile. A usable qualification capture requires both source-observed and provider-publication times.

Textual error bytes may be preserved only for credential-free or fixture-only profiles after a complete secret scan. Authenticated-provider error-body policy remains an OS-18A decision and is prohibited here.

The latest-good pointer update must be conditional on the exact committed manifest and extension. The legacy insert-ignore followed by an unconditional heartbeat update is not an acceptable OS-03A publication mechanism.

## Consequences

- The isolated proof is reproducible and cannot be mistaken for a live connector test.
- A path-shaped secret cannot pass by looking like an ordinary public URL.
- Missing source time, partial data, schema failure, and HTTP failure remain raw evidence only and cannot replace last good.
- Later OS-03 and OS-04 must register and qualify real source profiles separately.
