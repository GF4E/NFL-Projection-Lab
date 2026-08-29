#!/usr/bin/env node

import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  stableJson as acceptedStableJson,
  validateAuthorizedRangeContract,
  type QualificationContract
} from "./os01-migration-qualification";
import {
  normalizeHostedSqlTokens,
  type Os01HostedMigrationAuthority,
  type Os01HostedMigrationSource
} from "../qualification/os01-hosted-migration/core";

const ACCEPTED_SOURCE_COMMIT = "d24db5632410894d4f82c12e7f1d0c4c256a208d";
const ACCEPTED_CONTRACT = {
  path: "config/os01-migration-qualification.v1.json",
  byteSha256: "9b5da72706f18670c3ecb67763d18f109cf228b2a56c83f1ea52ff8582882e51"
};
const PREDECESSOR_AUTHORITY = {
  path: "config/d1-schema-authority.v1.json",
  byteSha256: "948dbfd5657c169c01d15d6a6fea08524a321d71852cc3148355c0d4210fcc0d"
};
const SUCCESSOR_AUTHORITY = {
  path: "config/d1-schema-authority.v2.json",
  byteSha256: "87db50ad848bdd3ee11a6bc8895b2647b5cda7ad43bc9f49f9954276ead2d04e"
};
const JOURNAL = {
  path: "drizzle/meta/_journal.json",
  byteSha256: "c2f4c41e680cc92e3eb21cb02869e45dae4862e7296e0a72880e5f1026fbe77f"
};
const TERMINAL_MANIFEST = {
  path: "config/d1-schema-manifest.v1.json",
  byteSha256: "4ca77b123faeeb7f5287994548f969bed35e2be9c6efcf4d88c509fb3d89b47d"
};
const MIGRATION_BUNDLE_HASH = "b72fae202662ae4cf689c4656bc762944264e9a59e637582b9fa0b4e0a31e122";
const LEGACY_MIGRATION_BUNDLE_HASH = "ba75205577b97fc97db5b9b4eea9f8351a077390994bf6b5e2a4642a062f9a79";
const INTERNAL_OBJECTS = new Set([
  "_cf_KV",
  "d1_migrations",
  "sqlite_sequence",
  "sqlite_stat1",
  "sqlite_stat4"
]);

type JsonObject = Record<string, unknown>;
type ObjectType = "index" | "table" | "trigger" | "view";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function workspacePath(root: string, path: string): string {
  const resolved = resolve(root, path);
  const local = relative(root, resolved);
  if (isAbsolute(path) || local === ".." || local.startsWith(`..${sep}`)) {
    throw new Error(`OS-01 hosted authority path escapes the workspace: ${path}`);
  }
  return resolved;
}

function singleReadLoader(root: string): (path: string, expectedHash: string) => Buffer {
  const cache = new Map<string, Buffer>();
  return (path, expectedHash) => {
    if (cache.has(path)) throw new Error(`OS-01 hosted authority path was reopened: ${path}`);
    const descriptor = openSync(workspacePath(root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!fstatSync(descriptor).isFile()) throw new Error(`OS-01 hosted authority is not a file: ${path}`);
      const bytes = readFileSync(descriptor);
      if (sha256(bytes) !== expectedHash) throw new Error(`OS-01 hosted authority byte mismatch: ${path}`);
      cache.set(path, bytes);
      return bytes;
    } finally {
      closeSync(descriptor);
    }
  };
}

function json<T>(bytes: Uint8Array, label: string): T {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
  } catch {
    throw new Error(`OS-01 hosted authority JSON is invalid: ${label}`);
  }
}

function statements(source: string): string[] {
  return source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean);
}

function receipt(source: string, order: number): Os01HostedMigrationSource["receipt"] {
  const matches = [...source.matchAll(
    /INSERT\s+INTO\s+[`"]engine_schema_versions[`"]\s*\([\s\S]*?\)\s*VALUES\s*\(\s*'([^']+)'\s*,\s*'sha256:([a-f0-9]{64})'/giu
  )];
  if (order < 12) {
    if (matches.length !== 0) throw new Error("OS-01 early migration unexpectedly writes a receipt");
    return null;
  }
  if (matches.length !== 1) throw new Error("OS-01 migration receipt is not exact");
  return { version: matches[0]![1]!, migrationHash: `sha256:${matches[0]![2]!}` };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function captureCatalog(db: DatabaseSync): {
  catalogFingerprint: string;
  counts: Record<ObjectType, number>;
  identities: Array<{
    type: ObjectType;
    name: string;
    tableName: string;
    createTokens: string[];
    createSql: string | null;
  }>;
} {
  const rows = db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE type IN ('table', 'index', 'trigger', 'view')
    ORDER BY type COLLATE BINARY, name COLLATE BINARY`).all() as Array<{
      type: ObjectType;
      name: string;
      tbl_name: string;
      sql: string | null;
    }>;
  const identities = rows
    .filter((row) => !row.name.startsWith("sqlite_") && !INTERNAL_OBJECTS.has(row.name))
    .map((row) => ({
      type: row.type,
      name: row.name,
      tableName: row.tbl_name,
      createTokens: normalizeHostedSqlTokens(row.sql),
      createSql: row.sql
    }));
  const counts = { table: 0, index: 0, trigger: 0, view: 0 };
  for (const identity of identities) counts[identity.type] += 1;
  return {
    catalogFingerprint: sha256(stableJson(identities.map((identity) => ({
      type: identity.type,
      name: identity.name,
      tableName: identity.tableName,
      createTokens: identity.createTokens
    })))),
    counts,
    identities
  };
}

function replayCatalog(migrations: readonly Os01HostedMigrationSource[], count: number) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  try {
    db.exec("BEGIN IMMEDIATE");
    for (const migration of migrations.slice(0, count)) {
      for (const statement of statements(migration.source)) db.exec(statement);
    }
    db.exec("COMMIT");
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length !== 0) throw new Error("OS-01 hosted authority replay has foreign-key violations");
    return captureCatalog(db);
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

export function loadOs01HostedMigrationAuthority(
  root = process.cwd()
): Os01HostedMigrationAuthority {
  const readOnce = singleReadLoader(root);
  const contract = json<QualificationContract>(
    readOnce(ACCEPTED_CONTRACT.path, ACCEPTED_CONTRACT.byteSha256), ACCEPTED_CONTRACT.path
  );
  const predecessor = json<{
    version: string;
    frozenBaseline: { orderedMigrations: Array<{ order: number; path: string; byteSha256: string }> };
  }>(readOnce(PREDECESSOR_AUTHORITY.path, PREDECESSOR_AUTHORITY.byteSha256), PREDECESSOR_AUTHORITY.path);
  const successor = json<{
    version: string;
    predecessorContract: { path: string; byteSha256: string };
    orderedHistory: {
      activeJournal: { path: string; byteSha256: string };
      successorMigrations: Array<{ order: number; path: string; byteSha256: string }>;
    };
    physicalProjection: { manifest: { path: string; byteSha256: string } };
  }>(readOnce(SUCCESSOR_AUTHORITY.path, SUCCESSOR_AUTHORITY.byteSha256), SUCCESSOR_AUTHORITY.path);
  const journal = json<{ entries: Array<{ idx: number; tag: string }> }>(
    readOnce(JOURNAL.path, JOURNAL.byteSha256), JOURNAL.path
  );
  const terminal = json<{
    schemaFingerprint: string;
    counts: Record<ObjectType, number>;
  }>(readOnce(TERMINAL_MANIFEST.path, TERMINAL_MANIFEST.byteSha256), TERMINAL_MANIFEST.path);

  if (contract.version !== "os01-migration-qualification.2026.1" ||
      contract.authorityContract !== successor.version ||
      successor.predecessorContract.path !== PREDECESSOR_AUTHORITY.path ||
      successor.predecessorContract.byteSha256 !== PREDECESSOR_AUTHORITY.byteSha256 ||
      successor.orderedHistory.activeJournal.path !== JOURNAL.path ||
      successor.orderedHistory.activeJournal.byteSha256 !== JOURNAL.byteSha256 ||
      successor.physicalProjection.manifest.path !== TERMINAL_MANIFEST.path ||
      successor.physicalProjection.manifest.byteSha256 !== TERMINAL_MANIFEST.byteSha256) {
    throw new Error("OS-01 hosted authority does not match the accepted d24 chain");
  }
  if (journal.entries.some((entry, index) => entry.idx !== index)) {
    throw new Error("OS-01 hosted migration journal is not contiguous");
  }
  const paths = journal.entries.map((entry) => `drizzle/${entry.tag}.sql`);
  validateAuthorizedRangeContract(contract, paths, root);
  const frozen = [...predecessor.frozenBaseline.orderedMigrations,
    ...successor.orderedHistory.successorMigrations];
  if (frozen.length !== paths.length || frozen.some((item, index) =>
    item.order !== index || item.path !== paths[index])) {
    throw new Error("OS-01 hosted migration order differs from the accepted authority");
  }

  const migrations = frozen.map((item) => {
    const source = new TextDecoder().decode(readOnce(item.path, item.byteSha256));
    return {
      order: item.order,
      path: item.path,
      source,
      byteSha256: item.byteSha256,
      receipt: receipt(source, item.order)
    } satisfies Os01HostedMigrationSource;
  });
  const migrationProjection = migrations.map(({ order, path, byteSha256 }) => ({ order, path, byteSha256 }));
  if (sha256(acceptedStableJson(migrationProjection)) !== MIGRATION_BUNDLE_HASH ||
      sha256(acceptedStableJson(migrationProjection.slice(0, 16))) !== LEGACY_MIGRATION_BUNDLE_HASH) {
    throw new Error("OS-01 hosted migration bundle is not the accepted ordered byte set");
  }
  const blank = {
    id: "blank" as const,
    catalogFingerprint: sha256("[]"),
    counts: { table: 0, index: 0, trigger: 0, view: 0 },
    identities: []
  };
  const legacyCatalog = replayCatalog(migrations, 16);
  const terminalCatalog = replayCatalog(migrations, 20);
  const legacyContract = contract.supportedPrestates.find((state) =>
    state.id === "ordered_through_0016_legacy_29");
  if (!legacyContract || stableJson(legacyCatalog.counts) !== stableJson(legacyContract.objectCounts) ||
      terminal.schemaFingerprint !== contract.terminalProjection.schemaFingerprint ||
      stableJson(terminalCatalog.counts) !== stableJson(terminal.counts) ||
      stableJson(terminal.counts) !== stableJson(contract.terminalProjection.objectCounts)) {
    throw new Error("OS-01 hosted replay does not match the accepted state counts and terminal manifest");
  }

  return {
    version: "engine-os.os01-hosted-migration-authority.v1",
    sourceCommit: ACCEPTED_SOURCE_COMMIT,
    acceptedContract: ACCEPTED_CONTRACT,
    predecessorAuthority: PREDECESSOR_AUTHORITY,
    successorAuthority: SUCCESSOR_AUTHORITY,
    journal: JOURNAL,
    terminalManifest: {
      ...TERMINAL_MANIFEST,
      schemaFingerprint: terminal.schemaFingerprint,
      counts: terminal.counts
    },
    migrations,
    migrationBundleHash: MIGRATION_BUNDLE_HASH,
    legacyMigrationBundleHash: LEGACY_MIGRATION_BUNDLE_HASH,
    supportedStates: {
      blank,
      legacy: { id: "legacy", ...legacyCatalog },
      terminal: { id: "terminal", ...terminalCatalog }
    },
    failureProbe: {
      migrationPath: "drizzle/0019_engine_os_schema_closure.sql",
      globalStatementIndex: 70
    },
    claimBoundary: "Qualification-only evidence for isolated owner-only D1 blank replay, exact legacy forward preservation, atomic failure rollback, logical export, fail-closed restore blocking, and raw-catalog/DDL parity. Exact distinct-resource restoration and D1 physical-manifest parity remain unaccepted. It does not establish a production prestate, authorize production migration, accept OS-01 or ARC-03, activate capture, or access any provider."
  };
}
