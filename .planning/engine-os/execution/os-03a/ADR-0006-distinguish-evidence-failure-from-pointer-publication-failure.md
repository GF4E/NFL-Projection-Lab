# ADR-0006: Distinguish evidence failure from retryable pointer-publication failure

**Status:** Accepted before final OS-03A qualification
**Date:** 2026-08-26

## Context

The first two-phase correction correctly prevented transient pointer publication, but its failure clause was too broad. A committed candidate whose R2 bytes fail verification must never become latest good. A candidate whose bytes verify but whose final atomic D1 pointer batch fails remains valid evidence and can be recovered safely after another complete verification. Treating both cases identically would either promote corrupt evidence or strand verified evidence.

## Decision

Freeze `source-capture-contract.2026.6` with separate outcomes:

- An R2 object, hash, identity, or semantic verification failure permanently disqualifies that committed candidate from latest good. Retry preserves the immutable manifest and failure history and fails verification again.
- A failed or unknown final D1 publication batch does not disqualify an otherwise verified candidate. Retry must re-read the committed rows, reverify both R2 objects, and converge on one capture-derived verification-event token and forward-only pointer batch.
- Any failure event remains append-only even if a later publication retry succeeds.
- A recovered heartbeat may become current only at a verification time no older than the latest recorded attempt.

Freshness threshold lookup is bound to the registered fixture profile and validated against the frozen OS-00B values. Caller-selected freshness behavior remains prohibited.

## Consequences

- Crash recovery does not silently rewrite evidence or erase failures.
- A storage-corrupt candidate and a transient D1 publication failure have different, testable terminal behavior.
- All workers converge on one verified-publication event for a capture, independent of the original caller attempt token.
