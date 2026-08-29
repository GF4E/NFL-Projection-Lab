#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  buildPhysicalManifest,
  compareManifest,
  type CommittedManifest
} from "./verify_d1_schema_authority";

type Scalar = string | number | bigint | Uint8Array | null;

export type RowProjection = {
  columns: string[];
  count: number;
  rowHashes: string[];
  contentHash: string;
};

export type DatabaseEvidence = {
  schema: CommittedManifest;
  rows: Record<string, RowProjection>;
  rowsHash: string;
  foreignKeyViolations: unknown[];
};

export type PreflightClaim = {
  version: "os01.migration-preflight.v1";
  supportedPrestate: "blank_ordered_chain" | "ordered_through_0016_legacy_29";
  schemaFingerprint: string;
  rowsHash: string;
  claimHash: string;
};

export type MigrationRunOptions = {
  expectedPrestate: {
    id: PreflightClaim["supportedPrestate"];
    schemaFingerprint: string;
    objectCounts: CommittedManifest["counts"];
  };
  expectedFinalManifest: CommittedManifest;
  expectedMigrationPaths: readonly string[];
  expectedMigrationByteHashes: Readonly<Record<string, string>>;
  expectedReceiptAdditions: ReadonlyArray<{
    version: string;
    migrationHash: string;
  }>;
  afterQuiesce?: () => void;
  afterStatement?: (input: {
    migrationPath: string;
    migrationIndex: number;
    statementIndex: number;
    globalStatementIndex: number;
  }) => void;
};

export type MigrationRunResult = {
  preflightClaimHash: string;
  finalSchemaFingerprint: string;
  finalRowsHash: string;
  finalCounts: CommittedManifest["counts"];
  foreignKeyViolationCount: number;
  appliedMigrationPaths: string[];
  appliedStatementCount: number;
};

const root = process.cwd();
const internalExact = new Set([
  "_cf_KV",
  "d1_migrations",
  "sqlite_sequence",
  "sqlite_stat1",
  "sqlite_stat4"
]);

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): unknown {
  if (value instanceof Uint8Array) return { base64: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function applicationTables(db: DatabaseSync): string[] {
  return (db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' ORDER BY name`).all() as Array<{ name: string }>)
    .map((row) => row.name)
    .filter((name) => !name.startsWith("sqlite_") && !internalExact.has(name));
}

function rowProjection(db: DatabaseSync, table: string, columns?: string[]): RowProjection {
  const selectedColumns = columns ?? (db.prepare(`PRAGMA table_xinfo(${quote(table)})`).all() as Array<{
    cid: number;
    name: string;
    hidden: number;
  }>).filter((column) => column.cid >= 0 && column.hidden === 0)
    .sort((left, right) => left.cid - right.cid)
    .map((column) => column.name);
  const projection = selectedColumns.length === 0
    ? "1 AS __os01_empty_projection"
    : selectedColumns.map(quote).join(", ");
  const rows = db.prepare(`SELECT ${projection} FROM ${quote(table)}`).all() as Array<
    Record<string, Scalar>
  >;
  const rowHashes = rows.map((row) => sha256(stableJson(row))).sort();
  return {
    columns: [...selectedColumns],
    count: rows.length,
    rowHashes,
    contentHash: sha256(stableJson({ columns: selectedColumns, rowHashes }))
  };
}

export function captureDatabaseEvidence(
  db: DatabaseSync,
  migrationSetHash: string,
  projectionColumns?: Readonly<Record<string, readonly string[]>>
): DatabaseEvidence {
  const schema = buildPhysicalManifest(db, migrationSetHash);
  const rows = Object.fromEntries(applicationTables(db).map((table) => [
    table,
    rowProjection(db, table, projectionColumns?.[table] ? [...projectionColumns[table]!] : undefined)
  ]));
  const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
  return {
    schema,
    rows,
    rowsHash: sha256(stableJson(rows)),
    foreignKeyViolations
  };
}

export function preflightClaim(
  evidence: DatabaseEvidence,
  supportedPrestate: PreflightClaim["supportedPrestate"]
): PreflightClaim {
  const body = {
    version: "os01.migration-preflight.v1" as const,
    supportedPrestate,
    schemaFingerprint: evidence.schema.schemaFingerprint,
    rowsHash: evidence.rowsHash
  };
  return { ...body, claimHash: sha256(stableJson(body)) };
}

function verifyPreflightClaim(
  evidence: DatabaseEvidence,
  claim: PreflightClaim,
  expectedPrestate: MigrationRunOptions["expectedPrestate"]
): void {
  if (claim.supportedPrestate !== expectedPrestate.id ||
    evidence.schema.schemaFingerprint !== expectedPrestate.schemaFingerprint ||
    stableJson(evidence.schema.counts) !== stableJson(expectedPrestate.objectCounts)) {
    throw new Error("OS-01 target is not an exact supported prestate");
  }
  const expected = preflightClaim(evidence, claim.supportedPrestate);
  if (stableJson(expected) !== stableJson(claim)) {
    throw new Error("OS-01 immediate pre-write revalidation failed");
  }
  if (evidence.foreignKeyViolations.length !== 0) {
    throw new Error("OS-01 prestate contains foreign-key violations");
  }
}

function assertPreserved(
  before: DatabaseEvidence,
  after: DatabaseEvidence,
  db: DatabaseSync,
  expectedReceiptAdditions: MigrationRunOptions["expectedReceiptAdditions"]
): void {
  for (const [table, expected] of Object.entries(before.rows)) {
    const actual = after.rows[table];
    if (!actual) throw new Error(`OS-01 row preservation failed: missing table ${table}`);
    if (actual.columns.join("\0") !== expected.columns.join("\0")) {
      throw new Error(`OS-01 row preservation failed: changed projection ${table}`);
    }
    if (table !== "engine_schema_versions") {
      if (stableJson(actual.rowHashes) !== stableJson(expected.rowHashes)) {
        throw new Error(`OS-01 row preservation failed: ${table}`);
      }
      continue;
    }
    const available = new Map(actual.rowHashes.map((hash) => [hash, 0]));
    for (const hash of actual.rowHashes) available.set(hash, (available.get(hash) ?? 0) + 1);
    for (const hash of expected.rowHashes) {
      const count = available.get(hash) ?? 0;
      if (count === 0) throw new Error("OS-01 historical migration receipt changed");
      available.set(hash, count - 1);
    }
  }

  const receiptProjection = after.rows.engine_schema_versions;
  if (!receiptProjection) throw new Error("OS-01 terminal engine_schema_versions table is missing");
  const priorReceiptCount = before.rows.engine_schema_versions?.count ?? 0;
  if (receiptProjection.count !== priorReceiptCount + expectedReceiptAdditions.length) {
    throw new Error("OS-01 migration receipt additions are not exact");
  }
  const receiptRows = db.prepare(`SELECT version, migration_hash, applied_at
    FROM engine_schema_versions ORDER BY version`).all() as Array<{
      version: string;
      migration_hash: string;
      applied_at: string;
    }>;
  for (const expected of expectedReceiptAdditions) {
    const row = receiptRows.find((candidate) => candidate.version === expected.version);
    if (!row || row.migration_hash !== expected.migrationHash ||
      !db.prepare("SELECT julianday(?) AS value").get(row.applied_at)?.value) {
      throw new Error(`OS-01 migration receipt is missing or invalid: ${expected.version}`);
    }
  }

  for (const [table, projection] of Object.entries(after.rows)) {
    if (table !== "engine_schema_versions" && !(table in before.rows) && projection.count !== 0) {
      throw new Error(`OS-01 migration inserted an unapproved row into ${table}`);
    }
  }
}

function migrationStatements(path: string): string[] {
  return readFileSync(resolve(root, path), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function migrationPaths(): string[] {
  const journal = JSON.parse(readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  if (journal.entries.some((entry, index) => entry.idx !== index)) {
    throw new Error("OS-01 migration journal is not contiguous");
  }
  const paths = journal.entries.map((entry) => `drizzle/${entry.tag}.sql`);
  if (new Set(paths).size !== paths.length) throw new Error("OS-01 migration journal is not unique");
  return paths;
}

export function migrationByteHashes(paths: readonly string[]): Record<string, string> {
  return Object.fromEntries(paths.map((path) => [path, sha256(readFileSync(resolve(root, path)))]));
}

function assertMigrationBytes(
  paths: readonly string[],
  expected: Readonly<Record<string, string>>
): void {
  for (const path of paths) {
    const expectedHash = expected[path];
    if (!expectedHash || sha256(readFileSync(resolve(root, path))) !== expectedHash) {
      throw new Error(`OS-01 migration byte mismatch: ${path}`);
    }
  }
}

/**
 * Apply an already-qualified migration range under one SQLite write lock.
 * The claim is revalidated after BEGIN IMMEDIATE and before the first schema
 * statement. This is the isolated SQLite/D1-equivalent execution path; it is
 * deliberately not reachable from the Worker graph.
 */
export function applyQualifiedMigrationRange(
  db: DatabaseSync,
  claim: PreflightClaim,
  paths: readonly string[],
  options: MigrationRunOptions
): MigrationRunResult {
  if (stableJson(paths) !== stableJson(options.expectedMigrationPaths)) {
    throw new Error("OS-01 migration range is missing, duplicated, or out of order");
  }
  assertMigrationBytes(paths, options.expectedMigrationByteHashes);
  const before = captureDatabaseEvidence(db, `pre:${claim.claimHash}`);
  if (before.schema.schemaFingerprint !== claim.schemaFingerprint || before.rowsHash !== claim.rowsHash ||
    before.schema.schemaFingerprint !== options.expectedPrestate.schemaFingerprint ||
    stableJson(before.schema.counts) !== stableJson(options.expectedPrestate.objectCounts) ||
    claim.supportedPrestate !== options.expectedPrestate.id) {
    throw new Error("OS-01 supplied preflight claim does not match the migration target");
  }
  const originalColumns = Object.fromEntries(
    Object.entries(before.rows).map(([table, projection]) => [table, projection.columns])
  );

  let globalStatementIndex = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    options.afterQuiesce?.();
    const locked = captureDatabaseEvidence(db, `pre:${claim.claimHash}`);
    verifyPreflightClaim(locked, claim, options.expectedPrestate);
    for (const [migrationIndex, path] of paths.entries()) {
      for (const [statementIndex, statement] of migrationStatements(path).entries()) {
        db.exec(statement);
        options.afterStatement?.({
          migrationPath: path,
          migrationIndex,
          statementIndex,
          globalStatementIndex
        });
        globalStatementIndex += 1;
      }
    }
    const after = captureDatabaseEvidence(db, options.expectedFinalManifest.migrationSetHash, originalColumns);
    const manifestErrors = compareManifest(options.expectedFinalManifest, after.schema);
    if (manifestErrors.length !== 0) {
      throw new Error(`OS-01 terminal schema mismatch: ${manifestErrors.join("; ")}`);
    }
    if (after.foreignKeyViolations.length !== 0) {
      throw new Error("OS-01 terminal database contains foreign-key violations");
    }
    assertPreserved(before, after, db, options.expectedReceiptAdditions);
    const terminal = captureDatabaseEvidence(db, options.expectedFinalManifest.migrationSetHash);
    const result: MigrationRunResult = {
      preflightClaimHash: claim.claimHash,
      finalSchemaFingerprint: terminal.schema.schemaFingerprint,
      finalRowsHash: terminal.rowsHash,
      finalCounts: terminal.schema.counts,
      foreignKeyViolationCount: terminal.foreignKeyViolations.length,
      appliedMigrationPaths: [...paths],
      appliedStatementCount: globalStatementIndex
    };
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

export function applyUnqualifiedFixtureMigrations(
  db: DatabaseSync,
  paths: readonly string[]
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const path of paths) {
      for (const statement of migrationStatements(path)) db.exec(statement);
    }
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
