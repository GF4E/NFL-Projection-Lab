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
names from the qualification identity. It validates a mode-0600 control-plane pre-observation,
then exclusively reserves the intent, response, and result files before its sole transport call.
An existing intent, persistence conflict, or uncertain transport permanently prohibits a retry for
that qualification identity. A valid worker response remains `pending_control_plane_postcheck`.
Only an append-only finalizer may accept it after validating a post-observation with identical
source, deployment, access, environment, bindings, and package identities. The controller rejects
noncanonical roots as qualification evidence, bounds response bytes, and never persists a response
that reflects its ephemeral Sites credential.

The response contains table names, table DDL, DDL hashes, normalized foreign keys, exact row
counts, and canonically sorted view names. It never returns view SQL. It re-reads the full catalog
and every table count and accepts only if the pre/post evidence matches. This is bounded
consistency evidence, not an atomic database snapshot; it is acceptable only while the isolated
staging project has no other writer.

The package remains DB-only, contains no migration payload, exposes no scheduled trigger, and has
no provider, quota, capture, production, or secret binding. A passing hosted receipt is evidence
for constructing and auditing a separate static cleanup candidate only. It does not itself permit
cleanup, migration replay, production census, or OS-01 acceptance.
