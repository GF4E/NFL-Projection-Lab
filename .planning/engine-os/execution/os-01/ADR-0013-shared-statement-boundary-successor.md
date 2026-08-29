# ADR-0013: Shared statement-boundary hosted successor

- **Status:** Candidate; one isolated blank-replay retry allowed only after local acceptance and a fresh owner-only staging refresh
- **Date:** 2026-08-28
- **Scope:** OS-01 hosted migration runtime-boundary repair
- **Machine-readable contract:** `config/os01-hosted-migration-qualification.v4.json`
- **Rejected predecessor:** `config/os01-hosted-migration-qualification.v3.json`
- **Rejection receipt:** `.planning/engine-os/execution/os-01/hosted-migration-v3-runtime-boundary-rejection-receipt.v1.json`

## Hosted v3 rejection

The v3 package was deployed successfully to the exact owner-only temporary Sites
project and received one correctly authenticated `blank_replay` request. The Worker
returned HTTP 500 with the closed body `{"error":"qualification_failed"}` after
213 milliseconds. A fresh D1 observation immediately afterward contained no tables.
The atomic failure therefore preserved the blank database, but the attempt supplied
no migration or duration qualification evidence.

Two earlier HTTP 401 attempts used the wrong gateway authorization header and never
reached the Worker. They are not harness executions and do not affect the v3 result.
The correct request used `OAI-Sites-Authorization`.

## Root cause

The accepted capacity counter parsed embedded semicolon-separated SQL and counted 291
migration statements. The deployed v3 runtime split only at 272
`statement-breakpoint` entries. Three entries contained 13, 4, and 5 statements,
respectively, leaving 19 statement boundaries invisible to the runtime. The runtime
therefore passed multi-statement strings to `D1Database.prepare`.

The hosted response intentionally did not expose a raw D1 error. The cause is
confirmed by the exact code-path mismatch plus a D1-faithful negative adapter that
rejects any prepare containing more than one semicolon-aware statement and reproduces
the pre-batch, zero-table failure. The evidence does not claim an unobserved raw
hosted error message.

## Decision

Preserve the v3 contract, package facts, request, response, D1 observation, and
rejection receipt without amendment. Create v4 with one Worker-safe semicolon-aware
parser in `qualification/os01-hosted-migration/sql-statements.ts`. Both the runtime
and capacity counter must import that exact parser. The builder hashes it, verifies
both imports, and refuses to emit a package if any count drifts from:

- 291 migration statements;
- 4 guard statements;
- 295 statements in the single atomic migration batch;
- 489 total blank-replay D1 queries including prestate and terminal evidence.

The runtime may return only one of the closed preparation diagnostic tokens
`d1_prepare_multiple_statements` or `d1_prepare_rejected` beside the generic
`qualification_failed` error. It never returns raw D1 messages or SQL.

## Retry boundary

The failed hosted attempt left the exact isolated D1 blank, so a corrected retry is
eligible only after the v4 implementation passes focused, full, type, lint, build,
reproducibility, fail-closed, and clean-checkout audits. Immediately before any retry,
the operator must freshly verify all of the following on project
`appgprj_6a92435d1d788191b4d6bcaff0a1525d`:

- access is owner-only;
- `DB` is the sole runtime binding;
- no provider binding or scheduled trigger exists;
- the isolated D1 still has zero tables.

That refresh is the sole remaining predeployment action. If it passes, the v4 package
may replace v3 on this exact temporary project and issue one `blank_replay` request
with a new qualification id. Any drift, timeout, platform rejection, partial result,
or nonblank prestate blocks the retry. V3 itself is never retried.

## Claim boundary

V4 corrects the runtime statement-boundary mechanism and can only authorize the one
bounded staging retry described above. The 588-millisecond capacity result remains a
read-only proof, not mutating-duration evidence. Until a hosted v4 replay passes, the
mutating duration, terminal state, physical-manifest parity, legacy-forward,
distinct-resource restoration, partial-failure, production census, OS-01, and ARC-03
claims remain unaccepted. No provider secret was read, no provider or quota path was
called, no capture was activated, no production resource was accessed, and no hosted
resource was mutated while creating this successor.
