# ADR-0004: Freeze OS-03A identities, freshness, orphan safety, and cutover

**Status:** Accepted
**Date:** 2026-08-26

## Decision

`source-capture-contract.2026.4` freezes every load-bearing hash formula using the repository `stableHash` implementation. Freshness is measured from an append-only successful verification event, including an explicit not-modified confirmation that requires a prior usable capture. Source and publication times remain immutable provenance but do not receive source-specific semantic qualification in this package.

Immediate orphan deletion is prohibited. The qualification sweeper may remove only aged, twice-checked, unreferenced fixture objects, and a concurrent publisher must reverify both R2 objects immediately before its D1 transaction.

Migration 0017 is additive. It cannot rewrite migration 0013, and rollback is allowed only while the new extension and event tables are empty. Rollback never deletes R2. Later OS-03 and OS-04 imports append relations without rewriting captured evidence.

## Consequences

- Implementation cannot choose favorable hash or freshness semantics after seeing proof results.
- The fixture proof can exercise cleanup without claiming that a production sweeper is qualified.
- A bounded OS-03A result still leaves real connectors, semantic source validation, live markets, and prospective activation open.
