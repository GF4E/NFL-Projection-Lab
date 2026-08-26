# ADR-0002: Correct the OS-03A freeze before implementation

**Status:** Accepted
**Date:** 2026-08-26

## Context

Independent pre-implementation review found that contract manifest v7 used `jq` key ordering instead of the repository `canonicalJson` function. The byte hash was correct, but the recorded canonical-content hash was not reproducible by runtime code. The same review found four ambiguities around persistence-clock storage, last-good meaning, retry-event identity, and source-route binding.

No OS-03A implementation existed when the defect was found.

## Decision

Preserve v1 and invalid manifest v7 as audit history. Freeze `source-capture-contract.2026.2` as an additive correction and bind it with `engine-os-contract-manifest.2026.8` using the repository hashing implementation.

Implementation must import and verify both the v1 base and v2 amendment. Manifest v7 must never qualify evidence.

## Consequences

- The failed freeze is visible rather than silently rewritten.
- Runtime and receipt hashes use one executable canonicalization definition.
- Last-good pointers, retries, source profiles, partial status, and persistence clocks now have deterministic meanings.
