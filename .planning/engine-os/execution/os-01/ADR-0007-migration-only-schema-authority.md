# ADR-0007: Migration-only D1 schema authority

- **Status:** Accepted as the frozen OS-01 acceptance contract; OS-01 itself is not qualified
- **Date:** 2026-08-27
- **Decision scope:** OS-01 / ARC-03 only
- **Baseline commit:** `636c419777a09380fe38dce804e6df5c4e374110`
- **Machine-readable contract:** `config/d1-schema-authority.v1.json`

## Context

The application currently has two schema authorities. Ordered SQL migrations create one
set of D1 objects, while production store initializers create or alter another set at
runtime. `CREATE ... IF NOT EXISTS` cannot prove compatibility: an older table or index
with the expected name can retain different columns, constraints, predicates, or
collations. Conditional `ALTER TABLE`, trigger replacement, and writable `PRAGMA`
operations create further deployment-dependent states.

The existing migration chain from `0000` through `0018` applies successfully to a blank
SQLite database, but that fact alone is insufficient. The typed Drizzle declaration does
not yet cover every migrated table, runtime source still owns persistent objects absent
from migrations, and no exact full-production semantic census has been frozen. OS-01 is
therefore open.

Four accepted deployed slices must not be reinterpreted while OS-01 closes the gap:
`0013_engine_os_urgent`, `0014_odds_quota_reservations`,
`0015_engine_os_origin_identity`, and `0016_engine_os_interim_scheduler`. Their receipt
hashes and accepted foundation fingerprint are bound by the machine-readable contract.
Migrations `0017` and `0018` have bounded isolated qualification evidence but are not
deployed and must remain dormant unless a later, separately receipted OS-01 execution
applies their exact frozen bytes.

## Decision

### One execution authority

Ordered SQL migrations are the only authority allowed to create or change persistent D1
objects. `db/schema.ts` is the typed application declaration, not an alternate runtime
mutation path. A committed semantic physical manifest will cover SQLite features that
Drizzle cannot fully express, including triggers, views, partial-index predicates,
generated expressions, and deferrable or named constraints.

The baseline journal and every migration byte hash from `0000` through `0018` are frozen
in `d1-schema-authority.2026.1`. They may not be edited, squashed, renumbered, reordered,
or assigned fabricated historical application times. New schema work is append-only and
requires a successor contract version.

### Exactly two supported prestates

1. **Blank ordered chain.** A database with no application-owned objects may receive the
   exact baseline chain in journal order.
2. **Exact production census.** A production database may receive a successor forward
   migration only after a read-only semantic census and row-preservation manifest exactly
   match its preregistered prestate.

No best-effort, partially recognized, inferred, or auto-repaired prestate is supported.
An extra object, changed definition, missing receipt, or incompatible legacy row blocks
the migration before any schema write. `IF NOT EXISTS` is not a drift-reconciliation
strategy.

The currently accepted eight-table foundation fingerprint is a preservation anchor, not
the final production census and not the final OS-01 schema fingerprint. This ADR does not
invent either missing artifact.

### Semantic schema equality

Parity is semantic rather than textual. The verifier must build stable per-object and
aggregate SHA-256 manifests from:

- `sqlite_master` object identity and SQL;
- `PRAGMA table_list`, `table_xinfo`, `foreign_key_list`, and `index_list`;
- `PRAGMA index_xinfo` for ordered keys, expressions, collation, and direction;
- parsed CHECK, generated, DEFERRABLE, partial-index, trigger, and view expressions.

Objects sort by type and name; columns sort by ordinal; foreign keys by identity and
sequence; indexes and triggers by name. Stable JSON uses UTF-8, sorted keys, and no
insignificant whitespace. SQL comparison uses a SQLite parser AST or equivalent token
stream, never whitespace comparison or a regular expression for nested expressions.

Whitespace and equivalent identifier quoting are negative-control equivalences. A change
to a column, default, nullability, primary key, unique or CHECK constraint, foreign-key
action, index key order or predicate, trigger body, generated expression, strictness, or
`WITHOUT ROWID` state is drift.

Only explicitly listed SQLite or D1 internal objects may be excluded. An unknown object
is drift, not a new implicit allowlist entry.

### Runtime behavior is fail closed

Deployable source and built output may contain no executable schema DDL. This prohibits
`CREATE`, `ALTER`, `DROP`, `TRUNCATE`, writable `PRAGMA`, `VACUUM`, `REINDEX`, `ATTACH`,
and `DETACH`. Migration SQL is allowed only in ordered migrations, isolated rollback
fixtures, tests, or a dedicated offline OS-01 verifier that is unreachable from the
Worker graph.

Store initializers become a SELECT-only terminal-version and hash assertion. A blank,
old, unknown, or drifted database causes a clear failure with zero writes. Runtime repair
is prohibited. Public reads remain write-free, and scheduled/write-capable lanes remain
unable to issue schema DDL.

### Forward-only production recovery

Production migrations are forward-only once user or accepted evidence rows exist. Down
SQL qualifies only an empty isolated rollback fixture. Production recovery is a prior
compatible code deployment plus restoration from the pre-migration D1 backup.

The frozen operating targets apply: D1 metadata RPO is at most 900 seconds, service RTO
is at most 14,400 seconds, D1 backups occur at least every 21,600 seconds, recoverable
backups are retained for 35 days, and restore drills run at least every 30 days. A restore
must reproduce semantic and per-object hashes, row counts and content hashes, migration
receipts, foreign-key validity, and the accepted foundation.

Any unavoidable table rebuild uses one transaction:

1. create a shadow table from the successor migration;
2. copy without lossy coercion;
3. verify counts, row/content hashes, and constraints;
4. swap only after every check passes.

Mismatch aborts before destructive work. OS-01 never mutates R2 evidence.

## Accepted-foundation preservation

The later production preflight and post-migration audit must preserve exactly:

- the four `0013` through `0016` receipt versions and hashes;
- schema fingerprint
  `sha256:353b1ad01eb414389d895b70ef58ccf56d2aeae4ca5fa4081d044d0e1fa2f88a`;
- eight accepted tables, four indexes, eight append-only triggers, and zero foreign-key
  violations;
- 38 used and 462 remaining quota units, with zero outstanding reservation rows and zero
  reservation-event rows;
- every existing application row and accepted append-only guard.

These facts come from the tracked direct-audit receipt whose byte hash is pinned in the
machine-readable contract. They do not authorize provider access or quota mutation.

## Falsification matrix

Qualification must reject each of the following independently:

- missing, duplicate, reordered, unknown, or byte-modified migration;
- changed journal bytes or a rewritten historical receipt;
- partial migration or success receipt after a failed batch;
- missing or extra table, column, index, trigger, or view;
- semantically changed type, default, constraint, FK action, index, trigger, generated
  expression, strictness, or rowid behavior;
- runtime DDL in source or built output;
- initializer execution against a blank, old, or drifted database that performs a write;
- populated down migration;
- accepted foundation mutation;
- unknown production object or a production prestate without an exact census;
- corrupt backup or restore mismatch.

Qualification must accept only insignificant SQL whitespace and equivalent identifier
quoting. Each failure must name the semantic object and field that differs.

## Acceptance and claim boundary

OS-01 and ARC-03 remain unaccepted until all of the following pass:

1. local blank replay;
2. isolated hosted blank-D1 replay;
3. exact typed and physical schema parity;
4. production read-only census and row-preservation preflight;
5. dormant forward migration with no activation or provider path;
6. runtime and built-output DDL elimination;
7. post-migration production parity;
8. backup and restore drill;
9. independent acceptance audit.

The allowed terminal results are `accepted`, `rejected`, and `blocked`. A local or
mechanism-only pass cannot partially accept ARC-03.

This decision freezes an acceptance contract only. It performs no migration, records no
final schema fingerprint, changes no runtime, accesses no provider credential, reserves
no quota, activates no capture, and changes no production forecast.

## Owner decision boundary

No owner decision is required for the architecture above. Preserve every legacy row by
default. Owner input becomes necessary only if the exact production census reveals
nonempty legacy data that cannot be mapped losslessly and therefore requires an explicit
preserve, archive, or remove decision. Otherwise OS-01 proceeds autonomously and fails
closed on every mismatch.
