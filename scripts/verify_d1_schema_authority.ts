#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Scalar = string | number | bigint | null;

export type SchemaObject = {
  type: "index" | "table" | "trigger" | "view";
  name: string;
  tableName: string;
  semanticHash: string;
  semantics: unknown;
};

export type CommittedManifest = {
  version: string;
  migrationSetHash: string;
  schemaFingerprint: string;
  counts: Record<SchemaObject["type"], number>;
  objects: SchemaObject[];
};

const root = process.cwd();
const journalPath = resolve(root, "drizzle/meta/_journal.json");
const defaultManifestPath = resolve(root, "config/d1-schema-manifest.v1.json");
const internalExact = new Set(["_cf_KV", "d1_migrations", "sqlite_sequence", "sqlite_stat1", "sqlite_stat4"]);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function quotedIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Token normalization preserves string literals and expression structure while
 * discarding comments, whitespace, identifier quote style, and keyword case. */
export function normalizeSqlTokens(sql: string | null): string[] {
  if (!sql) return [];
  const tokens: string[] = [];
  let index = 0;
  while (index < sql.length) {
    const character = sql[index]!;
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "-" && sql[index + 1] === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && sql[index + 1] === "*") {
      index += 2;
      while (index + 1 < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (character === "'") {
      let literal = "'";
      index += 1;
      while (index < sql.length) {
        literal += sql[index]!;
        if (sql[index] === "'") {
          if (sql[index + 1] === "'") {
            literal += "'";
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      tokens.push(`string:${literal}`);
      continue;
    }
    if (character === '"' || character === "`" || character === "[") {
      const closer = character === "[" ? "]" : character;
      let identifier = "";
      index += 1;
      while (index < sql.length) {
        if (sql[index] === closer) {
          if (closer !== "]" && sql[index + 1] === closer) {
            identifier += closer;
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        identifier += sql[index]!;
        index += 1;
      }
      tokens.push(`atom:${identifier.toLowerCase()}`);
      continue;
    }
    const word = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    if (word) {
      tokens.push(`atom:${word.toLowerCase()}`);
      index += word.length;
      continue;
    }
    const number = sql.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)?.[0];
    if (number) {
      tokens.push(`number:${number.toLowerCase()}`);
      index += number.length;
      continue;
    }
    const operator = sql.slice(index, index + 2);
    if (["<=", ">=", "<>", "!=", "==", "||", "->", "=>"].includes(operator)) {
      tokens.push(`operator:${operator}`);
      index += 2;
      continue;
    }
    tokens.push(`symbol:${character}`);
    index += 1;
  }
  return tokens;
}

function rows<T extends Record<string, Scalar>>(db: DatabaseSync, sql: string): T[] {
  return db.prepare(sql).all() as T[];
}

function tableSemantics(db: DatabaseSync, name: string, createSql: string | null) {
  const identifier = quotedIdentifier(name);
  const tableList = db.prepare(
    "SELECT schema, name, type, ncol, wr, strict FROM pragma_table_list WHERE name = ?"
  ).all(name) as Array<Record<string, Scalar>>;
  const columns = rows<Record<string, Scalar>>(db, `PRAGMA table_xinfo(${identifier})`)
    .map((row) => ({
      ...row,
      type: typeof row.type === "string" ? row.type.toLowerCase() : row.type,
      dflt_value: normalizeSqlTokens(row.dflt_value as string | null)
    }));
  const foreignKeys = rows<Record<string, Scalar>>(db, `PRAGMA foreign_key_list(${identifier})`)
    .sort((left, right) => Number(left.id) - Number(right.id) || Number(left.seq) - Number(right.seq));
  const indexes = rows<Record<string, Scalar>>(db, `PRAGMA index_list(${identifier})`)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)))
    .map((indexRow) => ({
      ...indexRow,
      columns: rows<Record<string, Scalar>>(db, `PRAGMA index_xinfo(${quotedIdentifier(String(indexRow.name))})`)
        .sort((left, right) => Number(left.seqno) - Number(right.seqno))
    }));
  return {
    createTokens: normalizeSqlTokens(createSql),
    tableList,
    columns,
    foreignKeys,
    indexes
  };
}

function objectSemantics(db: DatabaseSync, row: {
  type: SchemaObject["type"];
  name: string;
  tbl_name: string;
  sql: string | null;
}) {
  if (row.type === "table") return tableSemantics(db, row.name, row.sql);
  if (row.type === "index") {
    return {
      createTokens: normalizeSqlTokens(row.sql),
      columns: rows<Record<string, Scalar>>(db, `PRAGMA index_xinfo(${quotedIdentifier(row.name)})`)
        .sort((left, right) => Number(left.seqno) - Number(right.seqno))
    };
  }
  return { createTokens: normalizeSqlTokens(row.sql) };
}

function orderedMigrationPaths(): string[] {
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const indexes = journal.entries.map((entry) => entry.idx);
  if (indexes.some((value, index) => value !== index)) throw new Error("migration journal indexes are not contiguous");
  const paths = journal.entries.map((entry) => resolve(root, `drizzle/${entry.tag}.sql`));
  if (new Set(paths).size !== paths.length) throw new Error("migration journal contains a duplicate path");
  return paths;
}

export function buildPhysicalManifest(
  db: DatabaseSync,
  migrationSetHash: string
): CommittedManifest {
  const violations = rows<Record<string, Scalar>>(db, "PRAGMA foreign_key_check");
  if (violations.length) throw new Error(`foreign-key violations after migration replay: ${stableJson(violations)}`);

  const physicalRows = rows<{
    type: SchemaObject["type"];
    name: string;
    tbl_name: string;
    sql: string | null;
  }>(db, `SELECT type, name, tbl_name, sql FROM sqlite_master
      WHERE type IN ('table', 'index', 'trigger', 'view') ORDER BY type, name`)
    .filter((row) => !row.name.startsWith("sqlite_") && !internalExact.has(row.name));
  const objects = physicalRows.map((row) => {
    const semantics = stable(objectSemantics(db, row));
    return {
      type: row.type,
      name: row.name,
      tableName: row.tbl_name,
      semanticHash: sha256(stableJson(semantics)),
      semantics
    };
  });
  const counts = { table: 0, index: 0, trigger: 0, view: 0 };
  for (const object of objects) counts[object.type] += 1;
  const schemaFingerprint = sha256(stableJson(objects));
  return {
    version: "d1-schema-manifest.2026.1",
    migrationSetHash,
    schemaFingerprint,
    counts,
    objects
  };
}

export function buildSchemaManifest(): CommittedManifest {
  const migrationPaths = orderedMigrationPaths();
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const path of migrationPaths) db.exec(readFileSync(path, "utf8"));
  const migrationSetHash = sha256(stableJson(migrationPaths.map((path) => ({
    path: path.slice(root.length + 1),
    byteSha256: sha256(readFileSync(path))
  }))));
  const manifest = buildPhysicalManifest(db, migrationSetHash);
  db.close();
  return manifest;
}

export function compareManifest(expected: CommittedManifest, actual: CommittedManifest): string[] {
  const errors: string[] = [];
  if (expected.version !== actual.version) errors.push(`manifest version ${expected.version} != ${actual.version}`);
  if (expected.migrationSetHash !== actual.migrationSetHash) errors.push("migration-set hash mismatch");
  if (expected.schemaFingerprint !== actual.schemaFingerprint) errors.push("schema fingerprint mismatch");
  if (stableJson(expected.counts) !== stableJson(actual.counts)) {
    errors.push(`object counts differ: ${stableJson(expected.counts)} != ${stableJson(actual.counts)}`);
  }
  const expectedObjects = new Map(expected.objects.map((object) => [`${object.type}:${object.name}`, object]));
  const actualObjects = new Map(actual.objects.map((object) => [`${object.type}:${object.name}`, object]));
  for (const [key, object] of expectedObjects) {
    const candidate = actualObjects.get(key);
    if (!candidate) errors.push(`missing object ${key}`);
    else if (candidate.tableName !== object.tableName) {
      errors.push(`semantic drift in ${key} at tableName`);
    } else if (candidate.semanticHash !== object.semanticHash) {
      errors.push(`semantic drift in ${key} at ${firstDifference(object.semantics, candidate.semantics)}`);
    }
  }
  for (const key of actualObjects.keys()) if (!expectedObjects.has(key)) errors.push(`unexpected object ${key}`);
  return errors;
}

function firstDifference(expected: unknown, actual: unknown, path = "semantics"): string {
  if (Object.is(expected, actual)) return path;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${path}.length`;
    for (let index = 0; index < expected.length; index += 1) {
      if (stableJson(expected[index]) !== stableJson(actual[index])) {
        return firstDifference(expected[index], actual[index], `${path}[${index}]`);
      }
    }
    return path;
  }
  if (
    expected && actual && typeof expected === "object" && typeof actual === "object" &&
    !Array.isArray(expected) && !Array.isArray(actual)
  ) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])]
      .sort((left, right) => {
        if (left === "createTokens") return 1;
        if (right === "createTokens") return -1;
        return left.localeCompare(right);
      });
    for (const key of keys) {
      if (!(key in expectedRecord) || !(key in actualRecord)) return `${path}.${key}`;
      if (stableJson(expectedRecord[key]) !== stableJson(actualRecord[key])) {
        return firstDifference(expectedRecord[key], actualRecord[key], `${path}.${key}`);
      }
    }
    return path;
  }
  return path;
}

function main(): void {
  const actual = buildSchemaManifest();
  const writeIndex = process.argv.indexOf("--write");
  if (writeIndex >= 0) {
    const output = process.argv[writeIndex + 1] ? resolve(process.argv[writeIndex + 1]!) : defaultManifestPath;
    writeFileSync(output, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
    process.stdout.write(`wrote ${output}\n${actual.schemaFingerprint}\n`);
    return;
  }
  const manifestIndex = process.argv.indexOf("--manifest");
  const input = manifestIndex >= 0 && process.argv[manifestIndex + 1]
    ? resolve(process.argv[manifestIndex + 1]!)
    : defaultManifestPath;
  const expected = JSON.parse(readFileSync(input, "utf8")) as CommittedManifest;
  const errors = compareManifest(expected, actual);
  if (errors.length) {
    for (const error of errors) process.stderr.write(`ERROR: ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `D1 schema authority verified: ${actual.counts.table} tables, ${actual.counts.index} indexes, ` +
    `${actual.counts.trigger} triggers, ${actual.counts.view} views, ${actual.schemaFingerprint}\n`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) main();
