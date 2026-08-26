import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyOddsQuotaMigration,
  ODDS_QUOTA_MIGRATION_HASH,
  ODDS_QUOTA_MIGRATION_VERSION
} from "@/server/engine-os/quota-migration";

type SqlValue = string | number | bigint | Uint8Array | null;

function sqliteD1(db: DatabaseSync): D1Database {
  function prepare(sql: string) {
    let parameters: SqlValue[] = [];
    return {
      bind(...values: unknown[]) { parameters = values as SqlValue[]; return this; },
      async run() { const result = db.prepare(sql).run(...parameters); return { meta: { changes: Number(result.changes) } }; },
      async first<T>() { return (db.prepare(sql).get(...parameters) ?? null) as T | null; },
      async all<T>() { return { results: db.prepare(sql).all(...parameters) as T[], success: true, meta: {} }; },
      async raw<T>() { return db.prepare(sql).all(...parameters).map((row) => Object.values(row as Record<string, T>)); }
    };
  }
  return {
    prepare,
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      const results = [];
      db.exec("BEGIN");
      try {
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql: string) { db.exec(sql); return { count: 0, duration: 0 }; },
    async dump() { return new ArrayBuffer(0); }
  } as unknown as D1Database;
}

function baseDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(resolve(process.cwd(), "drizzle/0013_engine_os_urgent.sql"), "utf8")
    .replaceAll("--> statement-breakpoint", ""));
  return db;
}

describe("one-shot Odds quota D1 migration", () => {
  it("applies transactionally, verifies the receipt, and is idempotent", async () => {
    const sqlite = baseDb();
    const db = sqliteD1(sqlite);
    await expect(applyOddsQuotaMigration(db)).resolves.toMatchObject({
      status: "applied",
      version: ODDS_QUOTA_MIGRATION_VERSION,
      migrationHash: ODDS_QUOTA_MIGRATION_HASH,
      statementCount: 11
    });
    await expect(applyOddsQuotaMigration(db)).resolves.toMatchObject({ status: "already_applied" });
    expect(sqlite.prepare(`SELECT migration_hash FROM engine_schema_versions WHERE version = ?`)
      .get(ODDS_QUOTA_MIGRATION_VERSION)).toEqual({ migration_hash: ODDS_QUOTA_MIGRATION_HASH });
    sqlite.close();
  });

  it("rejects partial schema objects without the immutable receipt", async () => {
    const sqlite = baseDb();
    sqlite.exec("CREATE TABLE odds_quota_control (provider text PRIMARY KEY NOT NULL)");
    await expect(applyOddsQuotaMigration(sqliteD1(sqlite)))
      .rejects.toThrow(/without the immutable 0014 receipt/);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_schema_versions
      WHERE version = ?`).get(ODDS_QUOTA_MIGRATION_VERSION)).toEqual({ count: 0 });
    sqlite.close();
  });
});
