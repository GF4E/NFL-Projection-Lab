# ADR-0014: Read-only staging census successor

## Status

Candidate for independent qualification. It does not accept OS-01 or authorize a staging mutation.

## Decision

The rejected v1 staging census is replaced by the shared v2 semantic contract in
`qualification/os01-staging-census/contract.ts`. The SHA-256 of the canonical semantic
contract is the qualification identity. The request is admitted only at the exact owner-only
staging origin and v2 route, with an empty query, exact media type, and exact UTF-8 body bytes.

The worker is deliberately stateless and read-only. It does **not** claim to durably enforce a
one-shot request. The separate controller derives one canonical authority root and fixed artifact
names from the qualification identity. Initialization first persists a self-hashed authority
record. It validates a mode-0600 control-plane pre-observation, durably reserves and writes the
intent, then exclusively reserves the response, result, and dispatch-completion files before its
sole transport call. Existing artifacts, persistence conflict, uncertain transport, or a blank
crash artifact permanently prohibit a retry for that qualification identity. All reads use
no-follow descriptors with stable descriptor/path identity checks. A response is persisted only
after its complete schema and evidence roots validate; arbitrary or credential-reflecting bodies
remain absent.

A valid worker response remains `pending_control_plane_postcheck` until an independently hashed
dispatch-completion record seals the exact intent, response, and result bytes after authority
verification. Any later authority failure writes a terminal fence. Finalization is itself one-shot:
it durably reserves a finalization intent before reading evidence, validates exact schemas and
cross-record hashes, enforces canonical UTC ordering within a 30-minute window, and accepts only a
post-observation with identical source, deployment, access, empty environment-key set, bindings,
and package identities. A malformed or premature finalization cannot be repaired and retried. The
controller rejects noncanonical roots as qualification evidence and bounds response bytes.

The response contains table names, table DDL, DDL hashes, normalized foreign keys, exact row
counts, and canonically sorted view names. It never returns view SQL. It re-reads the full catalog
and every table count and accepts only if the pre/post evidence matches. This is bounded
consistency evidence, not an atomic database snapshot; it is acceptable only while the isolated
staging project has no other writer.

The package remains DB-only, contains no migration payload, exposes no scheduled trigger, and has
no provider, quota, capture, production, or secret binding. A passing hosted receipt is evidence
for constructing and auditing a separate static cleanup candidate only. It does not itself permit
cleanup, migration replay, production census, or OS-01 acceptance.
