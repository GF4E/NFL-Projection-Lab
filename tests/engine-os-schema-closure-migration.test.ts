import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/domain/hash";
import * as declaredSchema from "../db/schema";

const migrations = [
  "drizzle/0000_keen_red_shift.sql",
  "drizzle/0001_parched_hedge_knight.sql",
  "drizzle/0002_watery_patriot.sql",
  "drizzle/0003_hesitant_bloodstorm.sql",
  "drizzle/0004_player_prop_decision_board.sql",
  "drizzle/0005_structured_contract_settlement.sql",
  "drizzle/0006_execution_tracking.sql",
  "drizzle/0008_play_forecast_provenance.sql",
  "drizzle/0009_market_sentiment.sql",
  "drizzle/0010_confidence_engine.sql",
  "drizzle/0011_model_gate_evidence.sql",
  "drizzle/0012_source_snapshot_timing.sql",
  "drizzle/0013_engine_os_urgent.sql",
  "drizzle/0014_odds_quota_reservations.sql",
  "drizzle/0015_engine_os_origin_identity.sql",
  "drizzle/0016_engine_os_interim_scheduler.sql",
  "drizzle/0017_engine_os_source_capture.sql",
  "drizzle/0018_engine_os_forecast_ledger.sql",
  "drizzle/0019_engine_os_schema_closure.sql"
] as const;

const acceptedMigrationHashes: Readonly<Record<string, string>> = {
  "drizzle/0000_keen_red_shift.sql": "95d155204514f9acad8e06eaffdced88fc58d7a152d242f1694fd5cd4ed7668f",
  "drizzle/0001_parched_hedge_knight.sql": "ba6a0602c62700a05637e331cfd918823fe17a16e0e37398aabac761ff6b4d47",
  "drizzle/0002_watery_patriot.sql": "d604c66a3cf2ea5b7eaa2b97c5f0ff88aeab13adfce5abbf5bdc1c987f85bfd4",
  "drizzle/0003_hesitant_bloodstorm.sql": "39e03dad4e9f4535a2e10e2da26be135d55e67b78a9498e7eee3d1d7ad2d4823",
  "drizzle/0004_player_prop_decision_board.sql": "658662124f2180c96e3676bbacc4931e3f9561cb975d3a7f9ddd8b88bb6866f3",
  "drizzle/0005_structured_contract_settlement.sql": "6f84a08bde4b1229bd2dbaa34063f7ec8a06db28f8d77beba3ca39fc9c6e4146",
  "drizzle/0006_execution_tracking.sql": "a7163a21cde47d11da1bdcac7d5856d7f83641393c0dcb462fe70db5412c7009",
  "drizzle/0008_play_forecast_provenance.sql": "5126c77eb8614211e131b63f178755e9e5829ec423bc4043870214d7860fa216",
  "drizzle/0009_market_sentiment.sql": "5af41485ca67fed363738c968eaeaeba44bab9ba321436a3b9489dc3411ed100",
  "drizzle/0010_confidence_engine.sql": "ebdbfc422aaab63c57271c21a40acf65e1a9400746514ade4250c543c6f1bc00",
  "drizzle/0011_model_gate_evidence.sql": "b57e98b24b93f10bd52d6e1a2ab98668e8f5a0a2bf15743810fa06e80bca49bb",
  "drizzle/0012_source_snapshot_timing.sql": "1e147eea83396253ec8ed41404dc81c393878b4971d13bd0c6500494cbc75812",
  "drizzle/0013_engine_os_urgent.sql": "39d6695a24d1fdb66b70ab831af1bcc9e061e523080d9a07239aa3583e3c9df9",
  "drizzle/0014_odds_quota_reservations.sql": "614147e88b73360636781ff826716f4db2b6f075136d175b5c70483cc33adab9",
  "drizzle/0015_engine_os_origin_identity.sql": "96a161205f0d5966a337f47dc3a5ca662afb0dfe3dc1df29f07b6fe5fec7ea76",
  "drizzle/0016_engine_os_interim_scheduler.sql": "c121be1514510dedb2b5b1f6caef2e61d9b5999afc1a2f61a3f7477df7f74930",
  "drizzle/0017_engine_os_source_capture.sql": "5ab272cdd5fccc79664c1b3fcdcbc9ee451bb4e64a5afd2b3c5fd3a9692f3358",
  "drizzle/0018_engine_os_forecast_ledger.sql": "356eabfa9ca55b821bab9e50c04321d04657d09483b64139e1b620e61d1272d2"
};

const additiveTables = [
  "edge_notification_state",
  "game_context_alerts",
  "kickoff_weather_alerts",
  "kickoff_weather_current",
  "kickoff_weather_snapshots",
  "kickoff_weather_stage",
  "kickoff_weather_state",
  "model_lifecycle_state",
  "model_system_alerts",
  "model_versions",
  "nfl_games_stage",
  "nfl_player_snap_counts",
  "nfl_player_snap_counts_stage",
  "nfl_player_week_stats",
  "nfl_player_week_stats_stage",
  "nfl_team_game_features_stage",
  "official_inactives",
  "official_inactives_stage",
  "official_injury_import_state",
  "official_injury_reports",
  "official_injury_reports_stage",
  "official_pregame_context_snapshots",
  "official_pregame_context_state",
  "play_clv_audit",
  "play_correction_audit",
  "play_state_audit",
  "player_prop_quote_snapshots",
  "player_prop_quotes_stage",
  "qb_model_overrides",
  "rolling_feature_states",
  "rolling_feature_states_stage",
  "team_strength_states",
  "team_strength_states_stage",
  "web_push_attempts",
  "web_push_deliveries",
  "web_push_subscriptions",
  "weekly_digests"
] as const;

function sql(filename: string): string {
  return readFileSync(resolve(process.cwd(), filename), "utf8")
    .replaceAll("--> statement-breakpoint", "");
}

function database(through: number = migrations.length): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations.slice(0, through)) db.exec(sql(migration));
  return db;
}

function tableNames(db: DatabaseSync): string[] {
  return (db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as { name: string }[])
    .map((row) => row.name);
}

function applyRollback(db: DatabaseSync): void {
  try {
    db.exec(`BEGIN IMMEDIATE;\n${sql("drizzle/rollback/0019_engine_os_schema_closure.down.sql")}\nCOMMIT;`);
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function apply0020Rollback(db: DatabaseSync): void {
  try {
    db.exec(`BEGIN IMMEDIATE;\n${sql("drizzle/rollback/0020_engine_os_plays_reconciliation.down.sql")}\nCOMMIT;`);
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

describe("OS-01 additive schema closure", () => {
  it("replays the complete blank migration history to exactly 93 declared tables", () => {
    const db = database();
    const migrated = tableNames(db);
    const declared = Object.values(declaredSchema)
      .map((table) => getTableConfig(table).name)
      .sort();
    expect(migrated).toHaveLength(93);
    expect(new Set(migrated).size).toBe(93);
    expect(declared).toHaveLength(93);
    expect(new Set(declared).size).toBe(93);
    expect(declared).toEqual(migrated);
    expect(additiveTables).toHaveLength(37);
    for (const table of additiveTables) expect(migrated).toContain(table);
    db.close();
  });

  it("registers the exact 0019 definition hash and one journal successor", () => {
    const db = database();
    const migration = readFileSync(resolve(
      process.cwd(),
      "drizzle/0019_engine_os_schema_closure.sql"
    ), "utf8");
    const definition = migration.split("INSERT INTO `engine_schema_versions`")[0]!;
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0019_engine_os_schema_closure'`).get())
      .toEqual({ migration_hash: `sha256:${sha256Hex(definition)}` });
    const journal = JSON.parse(readFileSync(resolve(
      process.cwd(),
      "drizzle/meta/_journal.json"
    ), "utf8")) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.find((entry) => entry.tag === "0019_engine_os_schema_closure"))
      .toMatchObject({
      idx: 18,
      tag: "0019_engine_os_schema_closure"
    });
    expect(journal.entries.filter((entry) => entry.tag === "0019_engine_os_schema_closure"))
      .toHaveLength(1);
    db.close();
  });

  it("preserves every accepted 0000 through 0018 migration byte-for-byte", () => {
    for (const [filename, expectedHash] of Object.entries(acceptedMigrationHashes)) {
      expect(sha256Hex(readFileSync(resolve(process.cwd(), filename))), filename)
        .toBe(expectedHash);
    }
  });

  it("documents and preserves an exact preflight-qualified adopted object", () => {
    const migration = readFileSync(resolve(
      process.cwd(),
      "drizzle/0019_engine_os_schema_closure.sql"
    ), "utf8");
    expect(migration).toContain("external");
    expect(migration).toContain("preflight has proved");
    expect(migration).toContain("does not");
    expect(migration).toContain("attempt to repair or replace a mismatched object");

    const db = database(migrations.length - 1);
    db.exec(`CREATE TABLE play_clv_audit (
      play_id text PRIMARY KEY NOT NULL, reference_book text, clv_cents real,
      clv_points real, synthetic_closing_american real, detail_json text NOT NULL,
      calculated_at text NOT NULL, source text NOT NULL
    )`);
    db.prepare(`INSERT INTO play_clv_audit (
      play_id, detail_json, calculated_at, source
    ) VALUES ('preflight-qualified', '{}', '2026-08-27T00:00:00Z', 'fixture')`).run();
    db.exec(sql("drizzle/0019_engine_os_schema_closure.sql"));
    expect(db.prepare("SELECT source FROM play_clv_audit WHERE play_id = 'preflight-qualified'").get())
      .toEqual({ source: "fixture" });
    expect(() => applyRollback(db)).toThrow(/requires every adopted table to be empty/);
    expect(db.prepare("SELECT count(*) AS count FROM play_clv_audit").get())
      .toEqual({ count: 1 });
    db.close();
  });

  it("rolls back only an empty closure and preserves the prior 56-table schema", () => {
    const db = database();
    applyRollback(db);
    expect(tableNames(db)).toHaveLength(56);
    for (const table of additiveTables) expect(tableNames(db)).not.toContain(table);
    expect(db.prepare(`SELECT version FROM engine_schema_versions
      WHERE version = '0019_engine_os_schema_closure'`).get()).toBeUndefined();
    expect(db.prepare(`SELECT name FROM sqlite_schema
      WHERE type = 'index' AND name = 'idx_model_runs_completed'`).get()).toBeUndefined();
    expect(db.prepare(`SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'forecast_ledger_records_v1'`).get())
      .toEqual({ name: "forecast_ledger_records_v1" });
    db.close();
  });

  it("refuses out-of-order 0019 rollback while the 0020 terminal receipt remains", () => {
    const db = database();
    db.exec(sql("drizzle/0020_engine_os_plays_reconciliation.sql"));
    const before = tableNames(db);
    expect(before).toHaveLength(93);
    expect(() => applyRollback(db)).toThrow(/requires 0020 to be rolled back first/);
    expect(tableNames(db)).toEqual(before);
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0020_engine_os_plays_reconciliation'`).get())
      .toEqual({ migration_hash: "sha256:ad9cdf8d26293ecc3720bb08c8c1bd8a04df14d72159f4a04684b19debc83247" });
    db.close();
  });

  it("permits the empty isolated rollback chain only in reverse order", () => {
    const db = database();
    db.exec(sql("drizzle/0020_engine_os_plays_reconciliation.sql"));
    apply0020Rollback(db);
    applyRollback(db);
    expect(tableNames(db)).toHaveLength(56);
    expect(db.prepare(`SELECT version FROM engine_schema_versions
      WHERE version IN ('0019_engine_os_schema_closure', '0020_engine_os_plays_reconciliation')`).all())
      .toEqual([]);
    db.close();
  });
});
