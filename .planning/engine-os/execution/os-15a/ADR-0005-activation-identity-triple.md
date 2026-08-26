# ADR-0005 — Complete activation-cursor identity

## Status

Accepted for OS-15A qualification on 2026-08-26.

## Falsification result

The v3 watchdog cursor selected an activation by operating-contract and lifecycle hashes only. The authoritative activation identity is the complete operating-contract, research-constitution, and lifecycle hash triple. A later activation for a different research constitution could therefore advance the recovery floor and silently omit valid dispatcher ticks.

## Decision

The v4 scheduler and cutover contracts bind all three activation hashes. A missing match aborts without advancing a checkpoint. A later activation that shares the operating and lifecycle hashes but carries another research-constitution hash is ignored.

The adversarial regression seeds both identities and proves recovery begins at the matching triple's first dispatcher minute. The v5 contract manifest freezes exact v4 scheduler and cutover bytes and canonical hashes. Qualification still creates no production activation and cannot enable capture.
