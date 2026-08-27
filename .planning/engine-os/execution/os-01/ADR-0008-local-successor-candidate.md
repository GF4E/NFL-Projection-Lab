# ADR-0008: Bind the local OS-01 successor without promoting it

- **Status:** Accepted as a local candidate contract; OS-01 and ARC-03 remain open
- **Date:** 2026-08-27
- **Decision scope:** OS-01 migration candidate through `0020`
- **Machine-readable contract:** `config/d1-schema-authority.v2.json`

## Context

ADR-0007 froze the pre-OS-01 history through migration `0018` and required every
successor migration to receive a successor contract. The local implementation now adds
two migrations. `0019` adopts every persistent object formerly created by runtime store
initializers. `0020` reconciles the legacy `plays` table through a transactional shadow
copy, bidirectional value comparison, successor-constraint enforcement, and swap. The
Worker now performs only a read-only terminal receipt assertion and contains no runtime
schema repair path.

The local result is not a production result. The deployed database has a known
50-table inventory, but its full columns, constraints, indexes, triggers, row counts,
and row-content hashes have not yet been frozen as the exact production prestate. No
production migration or backup/restore drill has occurred.

## Decision

`d1-schema-authority.2026.2` binds the immutable predecessor contract, the exact
20-entry journal, migrations `0019` and `0020`, their empty-only rollbacks, the full
93-table typed declaration, the Drizzle snapshot, the semantic physical manifest, and
the successor ownership registry.

The candidate supports no inferred production shape. The next execution contract must
bind a read-only semantic census and row-preservation manifest from the actual deployed
D1 before the first schema write. Any unknown object, changed definition, missing
receipt, unexpected row, or unsupported `plays` prestate aborts without repair.

The `plays` rebuild is allowed only inside the migration transaction. It copies all 29
predecessor fields, proves equal counts and bidirectional value equality, verifies exact
defaults for five successor fields, and only then drops and renames. The terminal
receipt is in the same transaction. A copy mismatch, constraint failure, receipt
conflict, or lease/operator failure leaves the predecessor state intact.

The typed Drizzle projection is no longer treated as self-validating. A separate test
replays the physical migrations and compares all 93 tables with a fresh Drizzle export
across columns, defaults, nullability, primary keys, UNIQUE enforcement, CHECK
expressions, foreign keys, and explicit or partial indexes. The semantic manifest
separately binds triggers and full SQLite object definitions.

## Claim boundary

This ADR accepts only the frozen local candidate contract. It does not accept OS-01,
ARC-03, a hosted migration, the production census, backup recovery, the production
migration, prospective evidence, provider authentication, capture activation, or any
statistical model. Provider calls and quota reservations remain zero for this package.

## Next proof sequence

1. Build and scan a clean credential-free source archive.
2. Freeze an exact read-only production census and row-preservation prestate.
3. Replay the exact blank and production prestates on isolated hosted D1.
4. Prove whole-batch rollback on injected partial failure.
5. Create and restore a pre-migration backup, checking schema and row hashes.
6. Apply the exact dormant forward migration only if every preflight matches.
7. Deploy the DDL-free runtime and verify postmigration semantic and row parity.
8. Obtain a fresh independent acceptance audit before marking ARC-03 complete.

Any failure stops the sequence. A later contract version must bind the production
census and hosted receipts; this candidate must not be edited into that result.
