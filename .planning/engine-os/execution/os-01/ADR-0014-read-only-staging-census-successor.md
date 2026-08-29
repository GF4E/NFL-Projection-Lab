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
