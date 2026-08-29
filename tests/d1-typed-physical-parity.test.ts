import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { normalizeSqlTokens } from "../scripts/verify_d1_schema_authority";

type Scalar = string | number | bigint | null;
type Row = Record<string, Scalar>;

const root = process.cwd();

function quotedIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function rows(db: DatabaseSync, statement: string): Row[] {
  return db.prepare(statement).all() as Row[];
}

function migrationPaths(): string[] {
  const journal = JSON.parse(readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  expect(journal.entries.map((entry) => entry.idx)).toEqual(
    journal.entries.map((_, index) => index)
  );
  return journal.entries.map((entry) => resolve(root, `drizzle/${entry.tag}.sql`));
}

function migrationDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migrationPath of migrationPaths()) {
    db.exec(readFileSync(migrationPath, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return db;
}

function typedDatabase(): DatabaseSync {
  const result = spawnSync(
    "pnpm",
    ["exec", "drizzle-kit", "export", "--dialect", "sqlite", "--schema", "./db/schema.ts"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  if (result.status !== 0) {
    throw new Error(`Drizzle export failed:\n${result.stderr ?? ""}`);
  }
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(result.stdout);
  return db;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(typeof value === "bigint" ? value.toString() : value);
}

function stripTableQualifiers(tokens: string[], tableName: string): string[] {
  const output: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tokens[index] === `atom:${tableName.toLowerCase()}` &&
      tokens[index + 1] === "symbol:." &&
      tokens[index + 2]?.startsWith("atom:")
    ) {
      output.push(tokens[index + 2]!);
      index += 2;
      continue;
    }
    output.push(tokens[index]!);
  }
  return output;
}

function withoutRedundantOuterParentheses(tokens: string[]): string[] {
  let current = tokens;
  for (;;) {
    if (current[0] !== "symbol:(" || current.at(-1) !== "symbol:)") return current;
    let depth = 0;
    let closesAtEnd = false;
    for (let index = 0; index < current.length; index += 1) {
      if (current[index] === "symbol:(") depth += 1;
      if (current[index] === "symbol:)") depth -= 1;
      if (depth === 0) {
        closesAtEnd = index === current.length - 1;
        break;
      }
    }
    if (!closesAtEnd) return current;
    current = current.slice(1, -1);
  }
}

function checkExpressions(createSql: string, tableName: string): string[] {
  const tokens = normalizeSqlTokens(createSql);
  const checks: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] !== "atom:check" || tokens[index + 1] !== "symbol:(") continue;
    let depth = 0;
    const expression: string[] = [];
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor]!;
      if (token === "symbol:(") {
        depth += 1;
        if (depth > 1) expression.push(token);
        continue;
      }
      if (token === "symbol:)") {
        depth -= 1;
        if (depth === 0) {
          index = cursor;
          break;
        }
        expression.push(token);
        continue;
      }
      expression.push(token);
    }
    checks.push(withoutRedundantOuterParentheses(stripTableQualifiers(expression, tableName)).join(" "));
  }
  return checks.sort();
}

function indexKeys(db: DatabaseSync, indexName: string): Array<{
  position: number;
  columnId: number;
  name: string | null;
  descending: number;
  collation: string | null;
}> {
  return rows(db, `PRAGMA index_xinfo(${quotedIdentifier(indexName)})`)
    .filter((row) => Number(row.key) === 1)
    .map((row) => ({
      position: Number(row.seqno),
      columnId: Number(row.cid),
      name: row.name === null ? null : String(row.name),
      descending: Number(row.desc),
      collation: row.coll === null ? null : String(row.coll).toLowerCase()
    }));
}

function whereTokens(createSql: string | null, tableName: string): string[] {
  const tokens = stripTableQualifiers(normalizeSqlTokens(createSql), tableName);
  const where = tokens.indexOf("atom:where");
  return where < 0 ? [] : withoutRedundantOuterParentheses(tokens.slice(where + 1));
}

function tableSemantics(db: DatabaseSync, tableName: string) {
  const identifier = quotedIdentifier(tableName);
  const tableRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName) as { sql: string } | undefined;
  if (!tableRow) throw new Error(`missing table ${tableName}`);

  const columns = rows(db, `PRAGMA table_xinfo(${identifier})`).map((row) => ({
    position: Number(row.cid),
    name: String(row.name),
    type: String(row.type).toLowerCase(),
    notNull: Number(row.notnull),
    default: normalizeSqlTokens(row.dflt_value === null ? null : String(row.dflt_value)),
    primaryKeyPosition: Number(row.pk),
    hidden: Number(row.hidden)
  }));

  const foreignKeyRows = rows(db, `PRAGMA foreign_key_list(${identifier})`);
  const foreignKeyGroups = new Map<number, Row[]>();
  for (const row of foreignKeyRows) {
    const id = Number(row.id);
    foreignKeyGroups.set(id, [...(foreignKeyGroups.get(id) ?? []), row]);
  }
  const foreignKeys = [...foreignKeyGroups.values()]
    .map((group) => group.sort((left, right) => Number(left.seq) - Number(right.seq)))
    .map((group) => ({
      table: String(group[0]!.table),
      from: group.map((row) => String(row.from)),
      to: group.map((row) => String(row.to)),
      onUpdate: String(group[0]!.on_update).toLowerCase(),
      onDelete: String(group[0]!.on_delete).toLowerCase(),
      match: String(group[0]!.match).toLowerCase()
    }))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));

  const tableUniques: unknown[] = [];
  const explicitIndexes: unknown[] = [];
  for (const indexRow of rows(db, `PRAGMA index_list(${identifier})`)) {
    const origin = String(indexRow.origin);
    if (origin === "pk") continue;
    const indexName = String(indexRow.name);
    const keys = indexKeys(db, indexName);
    if (origin === "u" || (Number(indexRow.unique) === 1 && Number(indexRow.partial) === 0)) {
      tableUniques.push({ unique: Number(indexRow.unique), partial: Number(indexRow.partial), keys });
      continue;
    }
    const indexSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?"
    ).get(indexName) as { sql: string | null } | undefined;
    explicitIndexes.push({
      name: indexName,
      unique: Number(indexRow.unique),
      partial: Number(indexRow.partial),
      keys,
      where: whereTokens(indexSql?.sql ?? null, tableName)
    });
  }

  return {
    columns,
    foreignKeys,
    tableUniques: tableUniques.sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
    explicitIndexes: explicitIndexes.sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
    checks: checkExpressions(tableRow.sql, tableName)
  };
}

function tableNames(db: DatabaseSync): string[] {
  return rows(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .map((row) => String(row.name))
    .sort();
}

describe("typed Drizzle schema is physically exact after migration replay", () => {
  it("matches tables, columns/defaults/PK, UNIQUE constraints, CHECKs, FKs, and indexes", () => {
    const physical = migrationDatabase();
    const typed = typedDatabase();
    try {
      const physicalTables = tableNames(physical);
      expect(tableNames(typed)).toEqual(physicalTables);

      const mismatches: Array<{ table: string; category: string; physical: unknown; typed: unknown }> = [];
      for (const table of physicalTables) {
        const physicalSemantics = tableSemantics(physical, table);
        const typedSemantics = tableSemantics(typed, table);
        for (const category of Object.keys(physicalSemantics) as Array<keyof typeof physicalSemantics>) {
          if (stableJson(physicalSemantics[category]) !== stableJson(typedSemantics[category])) {
            mismatches.push({
              table,
              category,
              physical: physicalSemantics[category],
              typed: typedSemantics[category]
            });
          }
        }
      }
      if (mismatches.length > 0) {
        throw new Error(
          `typed/physical mismatches (${mismatches.length}):\n${mismatches
            .map((mismatch) => `${mismatch.table}:${mismatch.category}`)
            .join("\n")}\n\n${JSON.stringify(mismatches, null, 2)}`
        );
      }
    } finally {
      physical.close();
      typed.close();
    }
  }, 30_000);
});
