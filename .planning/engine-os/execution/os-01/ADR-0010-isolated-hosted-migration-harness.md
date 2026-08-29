# ADR-0010: Isolated owner-only hosted migration qualification harness

- **Status:** Terminally rejected for capacity accounting; do not deploy
- **Date:** 2026-08-28
- **Scope:** Staging-only OS-01 migration-path qualification
- **Machine-readable contract:** `config/os01-hosted-migration-qualification.v1.json`
- **Accepted source authority:** commit `d24db5632410894d4f82c12e7f1d0c4c256a208d`

## Decision

Package a standalone Worker entry that is unreachable from the production Worker and
binds only one isolated D1 database. The package embeds the exact ordered migration
bytes produced from the accepted d24 authority. Its build fails if any accepted
authority file or migration byte changed, if its output directory is not empty, if
the archive contains an SQL/migration path, or if the runtime contains a provider or
capture marker. It creates no scheduled trigger and has no provider or R2 binding.

The Sites project itself supplies the owner-only access control. The Worker does not
implement a second application credential. A hosted run is forbidden until the
operator has observed that each temporary project is owner-only with no additional
principal and has a fresh isolated D1 binding. The harness is never attached to the
existing site, its database, production, or the real retained lock.

The route is `POST /__engine-os/os01-hosted-migration/v1`. It accepts stable JSON with
an exact closed key set, a 64-hex qualification id, one closed action, and a backup
only for actions that require it. Every successful response is stable JSON with a
self-hash and explicit zero counters for provider dispatch, provider-binding reads,
and capture activation.

## Authority and atomicity

The build-time loader consumes the accepted d24 contract, v1 and v2 authorities,
journal, terminal manifest, and each migration path once with `O_NOFOLLOW`. It calls
the accepted internal range validator and emits the ordered bytes into a virtual
module. The Worker re-hashes every embedded migration, checks its order, path,
receipt, full-bundle hash, and legacy-prefix hash before reading or writing D1.

One requested range is submitted as one D1 `batch`. The batch creates a temporary
guard, revalidates the schema version, exact catalog and exact row projection inside
the write unit, executes every reviewed migration statement in order, verifies the
terminal catalog and row conditions, then drops the guard. A failed check violates a
guard constraint and aborts the complete batch. Retries inspect the resulting state
and converge on the same receipt instead of replaying migrations.

“Exact catalog” in this harness is deliberately bounded to object names, types,
owning tables, exact raw `sqlite_schema.sql`, normalized SQL tokens, counts, expected
rows, semantic receipt validity, foreign-key check, and quick-check. The harness does
not recompute the accepted d24 physical-manifest fingerprint from `table_xinfo`,
`index_xinfo`, `foreign_key_list`, collations, key flags, hidden columns, defaults,
and every other engine-interpreted detail. The same raw SQL could be interpreted
differently by another SQLite/D1 engine version. A passing run therefore establishes
raw-catalog/DDL parity only. Hosted physical-manifest parity remains a separate
unaccepted gate.

The failure probe uses that same successor batch and inserts one qualification-only
read of an intentionally absent table after successor statement 70, within migration
0019. It is safe only on fresh isolated D1 C. Passing requires the batch to reject and
the complete post-failure state evidence to equal the prestate evidence.

The original 470-query estimate was invalid. It counted one
`--> statement-breakpoint` entry as one D1 statement, but migrations 0010, 0011, and
0012 respectively contain entries with 13, 4, and 5 executable semicolon statements.
Semicolon-aware accounting that respects comments, quoted values, identifiers, and
trigger bodies proves 291 migration statements, four qualification guards, and a
295-statement atomic blank batch. Adding four blank-prestate queries and 190 terminal
queries produces exactly 489 D1 queries in one Worker invocation. The successor batch
remains 137 statements.

Cloudflare's official D1 limits page currently documents 50 queries per Worker
invocation on Free, 1,000 on Workers Paid, and a 30-second maximum applying to the
entire batch: <https://developers.cloudflare.com/d1/platform/limits/>. No
authoritative evidence establishes the effective Sites D1 plan/limit, and no evidence
proves that this 295-statement batch completes within 30 seconds. There is no atomic
successor that fits the documented 50-query Free limit. A platform-limit or timeout
error would not prove migration behavior. The harness is therefore capacity-blocked
and must not be deployed.

## Backup and restoration block

`legacy_prepare_export` returns a content-addressed logical export of every table,
explicit column, ordered row, per-row hash, table hash, and whole-row-manifest hash at
the deterministic through-0016 fixture state. The exact source timestamps remain in
that immutable backup.

The harness does **not** accept a replay-based restore. The accepted migrations create
`engine_schema_versions.applied_at` inside D1 and immediately protect the table with
append-only triggers. A replay into a distinct resource generates different exact
receipt rows. Normalizing, exempting, updating, dropping, disabling, or bypassing that
evidence would violate ADR-0007. `restore_import` therefore validates the backup and
then returns `exact_distinct_restore_unavailable` before the first database write.
Corrupt backups are rejected separately. Exact restore remains blocked until a
platform export/import or backup/restore path preserves every receipt byte and the
complete rows hash on a distinct isolated D1.

## Permitted next actions

1. Preserve commit `031826519736016ee3223c0f943506edefc7c245` and its local receipt
   as terminally rejected capacity evidence.
2. Retain the semicolon-aware counter and its frozen 489-query test as the sole local
   capacity authority for this harness.
3. Do not create a staging project, bind D1, save the package, deploy, or issue a
   hosted request.
4. Resume hosted design only after an authoritative channel proves the effective
   Sites query limit and a non-mutating qualification proves the 295-statement batch
   fits the 30-second cap, or after a separately reviewed atomic design fits within
   every applicable documented limit.
5. Continue to require the independent physical-manifest and exact-distinct-restore
   gates even if capacity is later resolved.

## Request bodies

All qualification ids below are placeholders and must be replaced with separately
recorded, new 64-hex values. Do not derive them from or store them in a credential file.

```json
{"version":"engine-os.os01-hosted-migration-request.v1","action":"blank_replay","qualificationId":"<64 hex>"}
```

```json
{"version":"engine-os.os01-hosted-migration-request.v1","action":"legacy_prepare_export","qualificationId":"<64 hex>"}
```

These bodies are retained as design documentation only. They are not authorized for
hosted execution while the capacity block remains.

## Claim boundary

No Sites call, hosted save, hosted deployment, provider call, provider-secret read,
quota reservation, capture activation, production access, or real-lock access occurred
while creating this harness. Commit 0318265 and its local acceptance receipt are
terminally rejected because their 470-query premise was false. The corrected count is
489, with 295 statements in one atomic batch. No hosted execution is authorized.
Exact distinct-resource restoration and D1 physical-manifest parity remain
unaccepted. The result cannot establish a production prestate, accept OS-01 or
ARC-03, or authorize production migration.
