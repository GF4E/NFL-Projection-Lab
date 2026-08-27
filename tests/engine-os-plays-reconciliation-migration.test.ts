import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const historyThrough0019 = [
  "0000_keen_red_shift",
  "0001_parched_hedge_knight",
  "0002_watery_patriot",
  "0003_hesitant_bloodstorm",
  "0004_player_prop_decision_board",
  "0005_structured_contract_settlement",
  "0006_execution_tracking",
  "0008_play_forecast_provenance",
  "0009_market_sentiment",
  "0010_confidence_engine",
  "0011_model_gate_evidence",
  "0012_source_snapshot_timing",
  "0013_engine_os_urgent",
  "0014_odds_quota_reservations",
  "0015_engine_os_origin_identity",
  "0016_engine_os_interim_scheduler",
  "0017_engine_os_source_capture",
  "0018_engine_os_forecast_ledger",
  "0019_engine_os_schema_closure"
] as const;

function sql(tag: string): string {
  return readFileSync(resolve(process.cwd(), `drizzle/${tag}.sql`), "utf8")
    .replaceAll("--> statement-breakpoint", "");
}

function definitionHash(migration: string): string {
  return createHash("sha256")
    .update(migration.split("INSERT INTO `engine_schema_versions`")[0]!)
    .digest("hex");
}

function blankReplayThrough0019(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const tag of historyThrough0019) db.exec(sql(tag));
  return db;
}

function apply0020(db: DatabaseSync): void {
  db.exec(sql("0020_engine_os_plays_reconciliation"));
}

function transactional0020(db: DatabaseSync, migration = sql("0020_engine_os_plays_reconciliation")): void {
  try {
    db.exec(`BEGIN IMMEDIATE;\n${migration}\nCOMMIT;`);
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function schemaSql(db: DatabaseSync): unknown[] {
  return db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`).all();
}

function apply0020Rollback(db: DatabaseSync): void {
  try {
    db.exec(
      `BEGIN IMMEDIATE;\n${readFileSync(resolve(
        process.cwd(),
        "drizzle/rollback/0020_engine_os_plays_reconciliation.down.sql"
      ), "utf8")}\nCOMMIT;`
    );
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function playsColumns(db: DatabaseSync): string[] {
  return (db.prepare("PRAGMA table_xinfo('plays')").all() as Array<{ name: string }>)
    .map((row) => row.name);
}

function minimalProductionPrestate(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE engine_schema_versions (
    version text PRIMARY KEY NOT NULL,
    migration_hash text NOT NULL,
    applied_at text NOT NULL
  )`);
  return db;
}

describe("OS-01 plays reconciliation", () => {
  it("reconciles the ordered legacy table and records the exact terminal receipt", () => {
    const db = blankReplayThrough0019();
    expect(playsColumns(db)).not.toContain("contract_key");
    apply0020(db);
    expect(playsColumns(db)).toEqual([
      "id", "contract_key", "contract_json", "forecast_json", "gabe_approved",
      "jarrett_approved", "season", "week", "game_id", "play_type", "market",
      "primary_reason", "picked_by", "title", "legs", "book", "american_odds",
      "stake_cents", "model_edge_pp", "estimated_ev_percent", "confidence",
      "stats_case", "football_case", "execution_status", "cash_placement_confirmed",
      "status", "result", "profit_cents", "closing_clv_cents", "closing_clv_points",
      "clv_reference_book", "created_by", "created_at", "updated_at"
    ]);
    const migration = readFileSync(resolve(
      process.cwd(),
      "drizzle/0020_engine_os_plays_reconciliation.sql"
    ), "utf8");
    const row = db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0020_engine_os_plays_reconciliation'`).get();
    expect(row).toEqual({ migration_hash: `sha256:${definitionHash(migration)}` });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM sqlite_schema
      WHERE type = 'trigger' AND tbl_name = 'plays'`).get()).toEqual({ count: 3 });
    db.close();
  });

  it("preserves every common legacy value and initializes only new columns", () => {
    const db = blankReplayThrough0019();
    db.prepare(`INSERT INTO plays (
      id, season, week, play_type, title, legs, book, american_odds, stake_cents,
      model_edge_pp, estimated_ev_percent, confidence, stats_case, football_case,
      status, result, profit_cents, closing_clv_cents, created_by, created_at,
      updated_at, game_id, market, primary_reason, picked_by, contract_json,
      execution_status, cash_placement_confirmed, forecast_json
    ) VALUES (
      ?, 2026, 3, 'single', 'legacy', 'SEA -2.5', 'FanDuel', -105, 2500,
      0.04, 3.2, 'play', 'stable EPA', 'QB edge', 'settled', 'win', 2381,
      4.5, 'owner', '2026-08-20T00:00:00Z', '2026-08-21T00:00:00Z',
      'game-1', 'spread', 'model_edge', 'gabe', ?, 'paper', 0, ?
    )`).run(
      "legacy-1",
      '[{"gameId":"game-1","market":"spread","sourceQuoteId":"quote-1"}]',
      '{"configHash":"c","dataHash":"d","consensusSnapshotId":"s","legs":[]}'
    );
    const before = db.prepare("SELECT * FROM plays WHERE id = 'legacy-1'").get() as Record<string, unknown>;
    apply0020(db);
    const after = db.prepare("SELECT * FROM plays WHERE id = 'legacy-1'").get() as Record<string, unknown>;
    for (const [column, value] of Object.entries(before)) expect(after[column], column).toEqual(value);
    expect(after).toMatchObject({
      contract_key: "",
      gabe_approved: 0,
      jarrett_approved: 0,
      closing_clv_points: null,
      clv_reference_book: null
    });
    expect(() => apply0020Rollback(db)).toThrow(/requires every play and play-audit table to be empty/);
    expect(db.prepare("SELECT profit_cents FROM plays WHERE id = 'legacy-1'").get())
      .toEqual({ profit_cents: 2381 });
    db.close();
  });

  it("supports the exact production prestate where plays is absent", () => {
    const db = minimalProductionPrestate();
    apply0020(db);
    expect(playsColumns(db)).toHaveLength(34);
    expect(db.prepare("SELECT COUNT(*) AS count FROM plays").get()).toEqual({ count: 0 });
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0020_engine_os_plays_reconciliation'`).get())
      .toEqual({ migration_hash: "sha256:ad9cdf8d26293ecc3720bb08c8c1bd8a04df14d72159f4a04684b19debc83247" });
    db.close();
  });

  it("permits isolated rollback only while plays and all play-audit tables are empty", () => {
    const db = blankReplayThrough0019();
    apply0020(db);
    apply0020Rollback(db);
    expect(playsColumns(db)).toHaveLength(29);
    expect(playsColumns(db)).not.toContain("contract_key");
    expect(db.prepare(`SELECT version FROM engine_schema_versions
      WHERE version = '0020_engine_os_plays_reconciliation'`).get()).toBeUndefined();
    db.close();
  });

  it("aborts a corrupted row copy before swap and rolls the whole migration back", () => {
    const db = blankReplayThrough0019();
    db.prepare(`INSERT INTO plays (
      id, week, play_type, title, book, american_odds, stake_cents, model_edge_pp,
      estimated_ev_percent, confidence, stats_case, created_by, created_at, updated_at
    ) VALUES ('preserved', 1, 'single', 'row', 'book', -110, 2500, 0, 0,
      'watch', 'case', 'owner', '2026-08-27T00:00:00Z', '2026-08-27T00:00:00Z')`).run();
    const before = schemaSql(db);
    const corrupted = sql("0020_engine_os_plays_reconciliation")
      .replace("SELECT\n\t`id`, '', `contract_json`", "SELECT\n\t`id`, 'corrupt', `contract_json`");
    expect(() => transactional0020(db, corrupted)).toThrow(/copy verification failed before swap/);
    expect(schemaSql(db)).toEqual(before);
    expect(db.prepare("SELECT id FROM plays").all()).toEqual([{ id: "preserved" }]);
    expect(db.prepare(`SELECT version FROM engine_schema_versions
      WHERE version = '0020_engine_os_plays_reconciliation'`).get()).toBeUndefined();
    db.close();
  });

  it("rolls back every schema write when the terminal receipt cannot publish", () => {
    const db = blankReplayThrough0019();
    db.prepare(`INSERT INTO engine_schema_versions (version, migration_hash, applied_at)
      VALUES ('0020_engine_os_plays_reconciliation', 'sha256:wrong', '2026-08-27T00:00:00Z')`).run();
    const before = schemaSql(db);
    expect(() => transactional0020(db)).toThrow(/UNIQUE constraint failed/);
    expect(schemaSql(db)).toEqual(before);
    expect(playsColumns(db)).not.toContain("contract_key");
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0020_engine_os_plays_reconciliation'`).get())
      .toEqual({ migration_hash: "sha256:wrong" });
    db.close();
  });
});
