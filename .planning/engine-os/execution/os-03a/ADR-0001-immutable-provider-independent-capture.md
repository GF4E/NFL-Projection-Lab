# ADR-0001: Qualify a provider-independent immutable capture boundary

**Status:** Accepted for OS-03A implementation
**Date:** 2026-08-26
**Deciders:** Engine OS owner; independent acceptance reviewers must verify the result

## Context

OS-01A established an urgent raw-manifest table and a useful content-addressed capture skeleton. It did not qualify cross-store publication, complete capture timing, usage-rights metadata, invalid-response preservation, append-only attempt evidence, orphan recovery, or a provider-offline replay path. Authenticated market acquisition is prohibited until the separate OS-18A provider-authentication gate passes.

OS-03A must therefore prove the storage mechanism without creating a prospective stream or using a provider credential. The proof must preserve the accepted OS-00, OS-00B, OS-01A, OS-02A, OS-15A, and OS-19A artifacts unchanged.

## Decision

Freeze `source-capture-contract-2026.v1.json` and qualify only a fixture-fed, provider-independent storage lane against isolated D1 and R2 resources.

The lane accepts already-received response bytes; it contains no network fetcher or provider credential. It writes and verifies the response object first, then builds and verifies a secret-redacted sidecar, then atomically commits the existing OS-01A base manifest, an OS-03A extension, an append-only event, and a conditional latest-good pointer. Invalid or partial responses may be preserved as raw evidence but cannot advance latest-good state. A secret-bearing body is never persisted.

Existing OS-01A tables and contracts remain intact. A new additive migration supplies extension and event tables. Production receives only dormant schema. `ENGINE_OS_CAPTURE_ENABLED` remains absent, no activation is created, and production source-capture tables remain empty.

## Options considered

### Extend the accepted OS-01A foundation additively

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Evidence integrity | High |
| Migration risk | Low; existing rows and schema remain valid |
| Provider independence | Complete |

**Pros:** Preserves accepted artifacts, exercises the intended D1/R2 architecture, and gives later OS-03/OS-04 work an explicit import boundary.
**Cons:** Leaves full connectors, live rights validation, and production activation for later gates.

### Rewrite the OS-01A manifest table

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Evidence integrity | Medium |
| Migration risk | High; changes an accepted foundation |
| Provider independence | Complete |

**Rejected:** It would redefine accepted OS-01A evidence and create unnecessary migration risk.

### Qualify with live non-market provider calls

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Evidence integrity | Variable |
| Reproducibility | Low |
| Provider independence | No |

**Rejected:** Live responses add network, publication, and rights variability without improving the storage-mechanism proof.

## Consequences

- OS-03A can establish exact-byte, hash, pointer, failure, replay, and cleanup behavior without provider access.
- The proof cannot be called prospective capture because all inputs are fixtures and production remains dormant.
- OS-03 must later qualify real connector imports, retention operations, and permanent garbage collection.
- OS-04 must later qualify market connectors and normalized market contracts.
- OS-18A remains the only gate allowed to authorize reading or exercising the Odds credential.

## Action items

1. Add a versioned additive migration and rollback fixture.
2. Implement the sidecar builder, secret filter, R2/D1 publication coordinator, replay verifier, failure journal, freshness watchdog, and orphan sweeper.
3. Test all required behavior locally and against isolated owner-only D1/R2 resources.
4. Preserve a reproducible receipt and update the master plan without checking complete requirements that remain broader than this slice.
