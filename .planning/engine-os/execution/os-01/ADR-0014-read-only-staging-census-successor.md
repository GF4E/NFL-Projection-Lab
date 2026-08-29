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

## Authority generation 2

The first hosted authority generation was terminally consumed before dispatch when an operator
helper appended literal backslash-n bytes after the pre-observation JSON document. The invalid
artifact and rejection receipt are preserved; no request or D1 read occurred. Generation 2 derives
a new controller-authority identity from the unchanged semantic census identity, generation number,
and predecessor rejection-receipt hash. The worker request and response contract remain v2, but the
controller root and every controller record bind the new authority identity. Rewriting or deleting
generation 1 evidence is prohibited.

## Authority generation 3

Generation 2 reached the isolated Sites dispatcher but received HTTP 401 before the worker because
the controller placed the ephemeral SIWC token in the generic Authorization header. Its reserved
artifacts and rejection receipt are preserved; no worker or D1 read occurred. Generation 3 derives
a new authority identity from that rejection receipt and follows the Sites dispatch contract: the
raw ephemeral token appears only in `OAI-Sites-Authorization`, is never persisted, and is still
checked for reflection before any response can be stored. Rewriting or deleting either earlier
generation remains prohibited.

## Authority generation 4

Generation 3 used the correct Sites header name but passed the token without the required bearer
scheme, so the isolated dispatcher again returned HTTP 401 before the worker or D1. Its terminal
evidence is preserved. Generation 4 derives a new authority identity from that rejection receipt
and sends `OAI-Sites-Authorization: Bearer <ephemeral-token>`. The token remains stdin-only,
unlogged, unpersisted, and covered by the response-reflection rejection. No generic Authorization
header is sent.

## Authority generation 5

Generation 4 authenticated successfully and reached the isolated worker. The worker read the
staging catalog and then failed one closed `user_table_catalog_invalid` invariant. The reserved
response remained empty and the terminal attempt evidence is preserved. Generation 5 is limited
to refining that single aggregate failure into non-identifying categories for table-count,
identifier, table-name equivalence, and CREATE-SQL availability. It may not return table names,
SQL, provider information, or arbitrary runtime detail. It derives a new authority identity from
the generation-4 rejection receipt; the generation-4 root and artifacts remain immutable and may
not be retried.

The worker also replaces earlier detail-bearing prestate errors and ambiguous catch-all labels with
a finite, aggregate-only failure envelope. Those broader categories are never persisted by the
generation-5 controller. Only the four user-table invariant categories above are eligible for
diagnostic persistence; every other failure response consumes the authority with an empty response
artifact. This hardening does not expand the generation-5 diagnostic scope.

## Authority generation 6

Generation 5 returned the exact closed category `user_table_count_mismatch`. The Sites database
overview reports 50 non-omitted table names, while tracked replay shows the isolated staging state
is an incomplete 50-table subset of the 93-table terminal schema. Neither fact proves the worker's
post-filter count. Generation 6 is therefore limited to one count-only refinement: expected table
count, raw table-row count, excluded-internal table-row count, and post-filter table count. It may
not return any identifier, SQL, hash, row count, foreign key, provider detail, or exception text.
The generation-5 authority is terminal and may not be retried, and the aggregate result may not by
itself change the expected census count.

For generation 6, this count-only boundary supersedes the earlier full-census response path. The
worker always terminates after the first validated catalog read, including when the observed count
equals the expected count. Its exact self-hashed response distinguishes only
`closed_user_table_count_match` from `closed_user_table_count_mismatch`, is returned with HTTP 500,
and is terminal and non-finalizable. The controller persists only this exact aggregate response;
every HTTP-200 full-census response is rejected and left unpersisted. The raw table-row count is
bounded by the versioned maximum of 1,000, inclusive. Counts below zero, above that maximum, or
violating `raw = excluded + observed` are invalid. No generation-6 path writes a dispatch-completion
or can create a census acceptance receipt.

## Authority generation 7

Generation 6 was stopped by the controller before intent reservation or transport because the
pre-observation timestamp preceded authority initialization by 194 milliseconds. No hosted
request, worker invocation, D1 read, provider path, or quota path occurred. The generation-6 root,
authority, and pre-observation are preserved, and its self-hashed rejection receipt prohibits any
rewrite or retry. Generation 7 derives a new controller authority from that receipt and retains the
identical count-only worker, response, persistence, and non-finalization contracts. Operationally,
the successor must initialize authority first and only then capture and write the pre-observation.

## Authority generation 8

Generation 7 completed its one authorized hosted invocation and returned the exact aggregate-only
count diagnostic `closed_user_table_count_mismatch`: 96 raw table rows, two excluded internal
tables, and 94 post-filter user tables. That terminal receipt does not disclose or establish any
table identity, DDL, foreign key, row count, or view evidence, and generation 7 remains rejected
and non-finalizable. It does, however, invalidate the prior expected count of 50. Because the
expected user-table count is part of the hashed semantic contract, generation 8 advances that
contract from v2 to v3, sets the expected count to 94, and derives a new semantic qualification
identity. The v2 route and request/response wire versions remain unchanged.

Generation 8 is limited to one full read-only census attempt against the same isolated staging
project and already-pinned 377-row catalog identity. Exactly 94 user tables is the sole path that
may inspect and return the full bounded census. Any other observed count returns only the exact
self-hashed mismatch diagnostic over HTTP 500 and is terminal and non-finalizable. A valid full
census is returned over HTTP 200, must pass the controller's independent exact-schema and evidence-
root validation, and remains pending until a fresh owner-only/no-writer post-observation verifies
the control-plane boundary. The generation-8 controller authority is chained to the immutable
generation-7 rejection receipt. No earlier authority, artifact, or receipt may be rewritten or
retried, and this successor still authorizes no mutation, cleanup, production access, provider
request, quota operation, capture activation, or OS-01 acceptance.

The full path uses exactly five D1 statements per invocation: catalog before, one compound
foreign-key read, one compound pre-count read, one compound post-count read, and catalog after.
This keeps the package below the Free-plan limit of 50 D1 queries per Worker invocation while
preserving the pre/post checks. The 94 table names are validated before interpolation into the
read-only compound statements, and every returned source-table identity and count is independently
checked against the canonical sorted table set.

The sole generation-8 hosted request was terminally rejected. The worker returned HTTP 500, and
the controller-preserved response-byte hash exactly matches the closed
`foreign_key_read_failed` envelope. The isolated worker log shows an otherwise successful fetch
invocation and no runtime exception; the failure is therefore confined to the compound
`pragma_foreign_key_list` D1 read. The empty response and dispatch-completion reservations,
attempt result, request identifier, and rejection receipt are preserved. Generation 8 may not be
retried or repaired into qualification evidence.

A clean successor may remove hosted foreign-key introspection only if it treats exact DDL as the
immutable source evidence and independently replays that DDL in a local SQLite verifier to derive
normalized foreign keys. Such a change must advance the semantic and response contracts, receive
a new qualification and controller authority identity chained to the generation-8 rejection
receipt, and pass independent evidence-root and parser/replay audits before any hosted request.
