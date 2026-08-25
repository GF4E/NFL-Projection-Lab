import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyUrgentEngineOsMigration,
  authorizedUrgentMigrationRequest,
  URGENT_ENGINE_OS_MIGRATION_HASH,
  URGENT_ENGINE_OS_MIGRATION_VERSION
} from "@/server/engine-os/urgent-migration";

function sqliteD1(db: DatabaseSync): D1Database {
  type SqlValue = string | number | bigint | Uint8Array | null;
  function prepare(sql: string) {
    let parameters: SqlValue[] = [];
    return {
      bind(...values: unknown[]) {
        parameters = values as SqlValue[];
        return this;
      },
      async run() {
        const result = db.prepare(sql).run(...parameters);
        return { meta: { changes: Number(result.changes) } };
      },
      async first<T>() {
        return (db.prepare(sql).get(...parameters) ?? null) as T | null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...parameters) as T[], success: true, meta: {} };
      },
      async raw<T>() {
        return db.prepare(sql).all(...parameters).map((row) => Object.values(row as Record<string, T>));
      }
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

describe("one-shot urgent D1 migration", () => {
  it("authorizes only an exact POST bearer secret without a length oracle", () => {
    const secret = "d".repeat(64);
    expect(authorizedUrgentMigrationRequest(new Request("https://example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` }
    }), secret)).toBe(true);
    expect(authorizedUrgentMigrationRequest(new Request("https://example.test", {
      method: "POST",
      headers: { authorization: `Bearer ${"d".repeat(63)}` }
    }), secret)).toBe(false);
    expect(authorizedUrgentMigrationRequest(new Request("https://example.test", {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` }
    }), secret)).toBe(false);
    expect(authorizedUrgentMigrationRequest(new Request("https://example.test", { method: "POST" }), secret))
      .toBe(false);
    expect(authorizedUrgentMigrationRequest(new Request("https://example.test", { method: "POST" }), undefined))
      .toBe(false);
  });

  it("applies atomically, records the expected schema hash, and is idempotent", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    const db = sqliteD1(sqlite);

    await expect(applyUrgentEngineOsMigration(db)).resolves.toMatchObject({
      status: "applied",
      version: URGENT_ENGINE_OS_MIGRATION_VERSION,
      migrationHash: URGENT_ENGINE_OS_MIGRATION_HASH
    });
    await expect(applyUrgentEngineOsMigration(db)).resolves.toMatchObject({
      status: "already_applied"
    });
    expect(sqlite.prepare("SELECT migration_hash FROM engine_schema_versions").get()).toEqual({
      migration_hash: URGENT_ENGINE_OS_MIGRATION_HASH
    });
    expect(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'forecast_origin_records'").get())
      .toEqual({ name: "forecast_origin_records" });
    sqlite.close();
  });

  it("rejects an ambiguous partial schema instead of repairing it silently", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE engine_schema_versions (
      version text PRIMARY KEY NOT NULL,
      migration_hash text NOT NULL,
      applied_at text NOT NULL
    )`);

    await expect(applyUrgentEngineOsMigration(sqliteD1(sqlite)))
      .rejects.toThrow(/partial or ambiguous migration/);
    sqlite.close();
  });
});
