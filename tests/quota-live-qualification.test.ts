import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  OWNER_ATTESTED_CREDENTIAL_GENERATION,
  qualifyLiveOddsQuota
} from "@/server/engine-os/quota-live-qualification";

type SqlValue = string | number | bigint | Uint8Array | null;

function sqliteD1(db: DatabaseSync): D1Database {
  let queue = Promise.resolve();
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
    batch(statements: Array<{ run(): Promise<unknown> }>) {
      const execute = async () => {
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
      };
      const result = queue.then(execute, execute);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
    async exec(sql: string) { db.exec(sql); return { count: 0, duration: 0 }; },
    async dump() { return new ArrayBuffer(0); }
  } as unknown as D1Database;
}

function applySql(db: DatabaseSync, filename: string): void {
  db.exec(readFileSync(resolve(process.cwd(), filename), "utf8")
    .replaceAll("--> statement-breakpoint", ""));
}

function qualificationDb(): { sqlite: DatabaseSync; d1: D1Database } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  applySql(sqlite, "drizzle/0004_player_prop_decision_board.sql");
  applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
  applySql(sqlite, "drizzle/0014_odds_quota_reservations.sql");
  sqlite.prepare(`INSERT INTO odds_quota_state
    (provider, used, remaining, last_cost, updated_at)
    VALUES ('the-odds-api', 39, 461, 3, ?)`).run(new Date(Date.now() - 60_000).toISOString());
  return { sqlite, d1: sqliteD1(sqlite) };
}

describe("temporary deployed-D1 quota qualification", () => {
  it("bootstraps owner-attested counters and proves one holder plus batch rollback", async () => {
    const { sqlite, d1 } = qualificationDb();
    const result = await qualifyLiveOddsQuota(d1);
    expect(result).toMatchObject({
      bootstrapStatus: "applied",
      quotaState: {
        used: 38,
        remaining: 462,
        lastCost: 0,
        credentialGenerationId: OWNER_ATTESTED_CREDENTIAL_GENERATION
      },
      probe: {
        contenders: 2,
        acquired: 1,
        reservationRows: 1,
        eventRows: 1,
        rollbackFailureObserved: true,
        rollbackRows: 0,
        temporaryObjectsRemoved: true
      }
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM sqlite_schema
      WHERE name LIKE 'engine_os_quota_probe_%'`).get()).toEqual({ count: 0 });

    const repeat = await qualifyLiveOddsQuota(d1);
    expect(repeat.bootstrapStatus).toBe("already_applied");
    expect(repeat.quotaState.used).toBe(38);
    sqlite.close();
  });
});
