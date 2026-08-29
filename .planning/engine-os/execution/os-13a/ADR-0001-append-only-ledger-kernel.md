# ADR-0001: Separate terminal-row identity from qualification-stream identity

**Status:** Frozen for clean OS-13A qualification
**Date:** 2026-08-26
**Deciders:** Prediction Engine OS owner; independent reviewers decide acceptance

## Context

OS-02A defines immutable origin versions and OS-15A coordinates exactly one
terminal publication for each activated origin. OS-13A must preserve either a
forecast or an explicit withholding without allowing retries, a status change,
or a package-reference change to fork a second terminal row. It must also keep
evidence from an eligible package distinct from evidence recorded while no
eligible package exists.

This work package is qualification-only. It cannot activate production, execute
a model, read a provider binding, dispatch a network request, or mutate an
accepted scheduler or forecast.

## Decision

Use two related deterministic identities:

1. The terminal record key binds the ledger-contract hash, immutable origin
   version, and activation boundary. It excludes status, withholding reason,
   qualification key, timestamps, and output hash. Duplicate workers and retries
   therefore converge on one row identity.
2. The qualification key binds the ledger-contract hash, activation boundary,
   qualification stream, and either the immutable model/package hash or the
   explicit `none_no_eligible_package` sentinel.

The activation boundary remains package-specific under the accepted lifecycle
contract. A later package therefore creates a new evidence stream without
changing an older terminal record.

A forecast is constructible only when every expected and observed provenance
field matches, exact output bytes match the declared digest, and the pointer is
the content-addressed key derived from that digest. Missing provenance becomes
`withheld:provenance_incomplete`; any mismatch becomes
`withheld:package_hash_mismatch`. A timely no-package run becomes
`withheld:no_eligible_package`.

The kernel returns no record at all when current-head or exact fenced-lease
authority is absent, the lease has expired, generation precedes the origin, or
persistence clocks are causally impossible. A claim persisted at or after the
strict horizon deadline, after the pre-kickoff cap, or from a post-origin
activation becomes `withheld:late_origin_excluded` and is permanently excluded
from prospective evidence. It is never rewritten or backfilled.

## Options considered

### Include package and status in the terminal record key

Rejected. A retry could fork a forecast and a withholding, or two package labels
could compete for the same activated origin.

### Use one qualification key for both package and no-package runs

Rejected. It would make absence of an eligible package indistinguishable from a
package-qualified stream and would weaken later all-game completeness audits.

### Let the kernel write storage directly

Rejected for this slice. The pure constructor makes timing, identity, authority,
provenance, and byte-verification rules independently testable. The OS-13A
runtime must separately prove R2-object-before-D1-pointer ordering and atomic
terminal insertion against isolated storage before acceptance.

## Consequences

- The kernel cannot create competing terminal identities for one activated
  origin.
- Package and no-package evidence are explicitly distinguishable.
- Withholding rows never carry forecast provenance or an output pointer.
- A verified kernel does not by itself qualify persistence, production
  activation, OS-13B package execution, or prospective scientific evidence.
- OS-13B must attach new package/distribution relations without rewriting OS-13A
  history.
