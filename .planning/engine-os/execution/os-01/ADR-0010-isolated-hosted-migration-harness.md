# ADR-0010: Isolated owner-only hosted migration qualification harness

- **Status:** Locally implemented and verified; no hosted run or deployment has occurred
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

The blank request requires 276 statements in its atomic migration batch and at most
470 D1 queries in the Worker invocation after prestate and terminal evidence reads.
The successor batch has 137 statements. Cloudflare's published D1 limits currently
allow 50 queries per invocation on Free and 1,000 on Paid, with a 30-second maximum
batch duration: <https://developers.cloudflare.com/d1/platform/limits/>. The operator
must prove that the temporary Sites D1 execution tier supports at least 470 queries
per invocation before deployment. The package contains no active pre-deploy probe:
such a Worker probe would require deployment and a bound resource. Capability proof
must therefore come from read-only Sites plan and binding metadata. If those metadata
do not prove the limit, the run is blocked before deployment. A platform-limit or
timeout error is a blocker, not migration or rollback evidence.

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

## Exact hosted action sequence

1. Start from the exact harness implementation commit and verify its parent is d24.
   Build and test locally from tracked files only. Do not open ignored credential
   files or enumerate the environment.
2. Verify from the temporary Sites project's current D1 plan/binding metadata that a
   Worker invocation supports at least 470 D1 queries and that the 276-statement
   blank batch can run within the platform's 30-second batch cap. If this cannot be
   proved, record `BLOCKED` and do not deploy the harness.
3. Create three temporary Sites projects named for blank, legacy, and restore/failure.
   Before saving code, set each project to owner-only, verify one owner and no other
   principal, and verify that its D1 is a new isolated resource. Add no R2, runtime
   key, secret, schedule, or provider binding.
4. For each project, build into a different new empty directory with
   `pnpm build:os01-hosted-migration -- --project-id <that staging project id>
   --out-dir <new empty directory>`. Verify the manifest digest sidecar, entry hash,
   authority hash, contract hash, DB-only hosting file, and absence of SQL files.
5. Save and deploy only that package to its matching temporary project. Re-observe
   owner-only access and the isolated `DB` binding immediately before the first
   request. If either differs, stop and retire the project without a request.
6. On D1 A, call `blank_replay`, repeat the same request, then call
   `verify_blank_terminal`. Preserve every exact request and response byte. Require
   identical retry receipts, counts 93/80/76/0, no legacy row, `quick_check=ok`, and
   zero foreign-key violations.
7. On D1 B, call `legacy_prepare_export`, repeat it, and preserve the exact backup.
   Require identical retry receipts and through-0016 counts 48/44/46/0. Call
   `legacy_forward` with that backup, then `verify_legacy_terminal` with the same
   backup. Require 93/80/76/0 and exact preservation of all 29 source `plays`
   columns.
8. On fresh D1 C, call `restore_import` with the exact D1 B backup. Require
   `exact_distinct_restore_unavailable` and independently verify that D1 C is still
   blank. This is a negative control, not restore acceptance. Then call
   `legacy_prepare_export` on D1 C and use D1 C's own exact backup for
   `failure_probe`. Require exact pre/post state hashes, no 0017-0020 receipts, no
   qualification guard, and no partial successor object. Call `legacy_forward` and
   `verify_legacy_terminal` with D1 C's backup to prove the resource remains usable
   after rollback.
9. For every step, publish exact request bytes, response bytes, status, package
   manifest bytes/digest, project-access observation, binding observation, and
   independent D1 observation under new exclusive filenames. Any collision,
   incomplete observation, non-2xx response, hash mismatch, or unexpected database
   state rejects that resource and the entire hosted qualification.
10. Retire all three projects to an owner-only inert 410 build, remove every binding
   and runtime key from those projects, verify the qualification route is gone, then
   physically delete the temporary resources if the platform exposes deletion.
   Preserve the retirement evidence. Do not reuse any D1 resource.
11. Obtain an independent review of the exact implementation commit and hosted
    evidence. A passing result remains a bounded isolated-hosted-mechanism result;
    production migration remains blocked on the production census, production row
    manifest, production backup/restore drill, dormant forward migration, post-checks,
    and final acceptance audit.

## Request bodies

All qualification ids below are placeholders and must be replaced with separately
recorded, new 64-hex values. Do not derive them from or store them in a credential file.

```json
{"version":"engine-os.os01-hosted-migration-request.v1","action":"blank_replay","qualificationId":"<64 hex>"}
```

```json
{"version":"engine-os.os01-hosted-migration-request.v1","action":"legacy_prepare_export","qualificationId":"<64 hex>"}
```

For `restore_import`, `failure_probe`, `legacy_forward`, and
`verify_legacy_terminal`, add the exact `"backup": { ... }` returned by D1 B.

## Claim boundary

No Sites call, hosted save, hosted deployment, provider call, provider-secret read,
quota reservation, capture activation, production access, or real-lock access occurred
while creating this harness. Local tests qualify only the package mechanism. Hosted
execution can at most qualify the named isolated blank, legacy-forward,
row-preservation, rollback, logical-export, restore-block, and raw-catalog/DDL paths.
Exact distinct-resource restoration and D1 physical-manifest parity remain
unaccepted. The result cannot establish a production prestate, accept OS-01 or
ARC-03, or authorize production migration.
