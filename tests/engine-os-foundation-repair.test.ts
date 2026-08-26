import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/domain/hash";
import {
  applyProductionFoundationSchemaRepair,
  inspectProductionFoundationRepair,
  PRODUCTION_FOUNDATION_SCHEMA_REPAIR_ARTIFACT,
  reconstructProductionFoundationBootstrap,
  verifyProductionFoundationRepair
} from "@/server/engine-os/production-foundation-repair-20260826";

const epoch = "2af18312d58955cbffc3bfe09694608ad60f509bf1c93834217a8395c57359ef";
const observedAt = "2026-08-26T02:24:13.471Z";
const generation = "oddsapi-20260825-owner-rotation-01";
const alertId = "a5514f45beb8ad9c90efb03bed10bfcc2d056cc238f310187f9e91fa9370c1a0";

const repairedObjects = [
  "source_capture_manifests",
  "idx_source_capture_received",
  "idx_source_capture_evidence_hash",
  "source_capture_heartbeats",
  "odds_quota_state",
  "odds_quota_events",
  "source_capture_manifests_no_update",
  "source_capture_manifests_no_delete",
  "odds_quota_events_no_update",
  "odds_quota_events_no_delete",
  "odds_quota_epochs",
  "odds_quota_epochs_no_update",
  "odds_quota_epochs_no_delete",
  "odds_quota_control",
  "odds_quota_reservations",
  "idx_odds_quota_reservations_outstanding",
  "odds_quota_reservation_events",
  "idx_odds_quota_reservation_events_request",
  "odds_quota_reservation_events_no_update",
  "odds_quota_reservation_events_no_delete"
] as const;

function applySql(db: DatabaseSync, filename: string): void {
  db.exec(readFileSync(resolve(process.cwd(), filename), "utf8")
    .replaceAll("--> statement-breakpoint", ""));
}

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
      const results: unknown[] = [];
      db.exec("BEGIN IMMEDIATE");
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

function insertPreservedAlert(db: DatabaseSync): void {
  db.prepare(`INSERT INTO engine_system_alerts (
    alert_id, alert_type, deduplication_key, severity, state, created_at, resolved_at, payload_json
  ) VALUES (?, 'odds_quota_manual_bootstrap', ?, 'warning', 'open', ?, NULL, ?)`)
    .run(
      alertId,
      `the-odds-api:manual-bootstrap:${epoch}`,
      observedAt,
      JSON.stringify({
        provider: "the-odds-api",
        quotaEpoch: epoch,
        credentialGenerationId: generation,
        used: 38,
        remaining: 462
      })
    );
}

function baseDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applySql(db, "drizzle/0004_player_prop_decision_board.sql");
  applySql(db, "drizzle/0013_engine_os_urgent.sql");
  applySql(db, "drizzle/0014_odds_quota_reservations.sql");
  applySql(db, "drizzle/0015_engine_os_origin_identity.sql");
  applySql(db, "drizzle/0016_engine_os_interim_scheduler.sql");
  return db;
}

function driftDatabase(): DatabaseSync {
  const db = baseDatabase();
  insertPreservedAlert(db);
  db.exec("PRAGMA foreign_keys = OFF");
  for (const table of [
    "odds_quota_reservation_events",
    "odds_quota_reservations",
    "odds_quota_control",
    "odds_quota_epochs",
    "odds_quota_events",
    "odds_quota_state",
    "source_capture_heartbeats",
    "source_capture_manifests"
  ]) db.exec(`DROP TABLE ${table}`);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function normalizedDefinition(sql: string): string {
  return sql
    .replace(/\bIF\s+NOT\s+EXISTS\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .trim();
}

function objectDefinitions(db: DatabaseSync): Map<string, string> {
  const placeholders = repairedObjects.map(() => "?").join(", ");
  const rows = db.prepare(`SELECT name, sql FROM sqlite_master
    WHERE name IN (${placeholders}) ORDER BY name`)
    .all(...repairedObjects) as Array<{ name: string; sql: string }>;
  return new Map(rows.map((row) => [row.name, normalizedDefinition(row.sql)]));
}

describe("Engine OS 0017 foundation repair", () => {
  it("is schema-only on a clean ordered database and registers its exact definition hash", () => {
    const db = baseDatabase();
    applySql(db, "drizzle/0017_engine_os_foundation_repair.sql");

    for (const table of [
      "source_capture_manifests",
      "source_capture_heartbeats",
      "odds_quota_events",
      "odds_quota_state",
      "odds_quota_epochs",
      "odds_quota_control",
      "odds_quota_reservations",
      "odds_quota_reservation_events"
    ]) {
      expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }

    const migration = readFileSync(resolve(
      process.cwd(), "drizzle/0017_engine_os_foundation_repair.sql"
    ), "utf8");
    const definition = migration.split("INSERT INTO `engine_schema_versions`")[0]!;
    expect(PRODUCTION_FOUNDATION_SCHEMA_REPAIR_ARTIFACT).toEqual({
      migrationVersion: "0017_engine_os_foundation_repair",
      definitionHash: `sha256:${sha256Hex(definition)}`,
      fileHash: `sha256:${sha256Hex(migration)}`,
      statementCount: 21
    });
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0017_engine_os_foundation_repair'`).get())
      .toEqual({ migration_hash: `sha256:${sha256Hex(definition)}` });
    db.close();
  });

  it("restores the exact accepted object definitions from the eight-table drift", async () => {
    const reference = baseDatabase();
    const expected = objectDefinitions(reference);
    const drifted = driftDatabase();
    const d1 = sqliteD1(drifted);

    await expect(inspectProductionFoundationRepair(d1)).resolves.toMatchObject({
      mode: "exact_eight_object_drift",
      preservedAlertId: alertId
    });
    await expect(applyProductionFoundationSchemaRepair(d1)).resolves.toEqual({
      status: "applied",
      migrationVersion: "0017_engine_os_foundation_repair",
      definitionHash: "sha256:34ecd02bd2b0082b2fb22457ce65350fd0e8970d229ef038c323b73816eddd74",
      fileHash: "sha256:a4f6bdaa22ff90161f5ac021200cfbefe3dfbfb7361f8cf12d7c92d785dfbf78",
      statementCount: 21,
      schemaFingerprint: "sha256:64a7b3d45cde53a3566fd46c935ace8680eae6faa0bfe71827d1f110b6b00e93",
      providerRequestMade: false
    });
    await expect(inspectProductionFoundationRepair(d1)).resolves.toMatchObject({
      mode: "exact_healthy_0017"
    });
    const actual = objectDefinitions(drifted);
    expect(actual.size).toBe(expected.size);
    for (const [name, definition] of expected) expect(actual.get(name)).toBe(definition);

    reference.close();
    drifted.close();
  });

  it("reconstructs exactly one accepted bootstrap without provider activity", async () => {
    const db = driftDatabase();
    const d1 = sqliteD1(db);
    applySql(db, "drizzle/0017_engine_os_foundation_repair.sql");

    await expect(reconstructProductionFoundationBootstrap(d1)).resolves.toEqual({
      status: "reconstructed",
      migrationVersion: "0017_engine_os_foundation_repair",
      quotaEpoch: epoch,
      credentialGenerationId: generation,
      observedAt,
      used: 38,
      remaining: 462,
      lastCost: 0,
      sourceCaptureRows: 0,
      reservationRows: 0,
      reservationEventRows: 0,
      providerRequestMade: false
    });
    expect(db.prepare("SELECT * FROM odds_quota_epochs").get()).toEqual({
      quota_epoch: epoch,
      provider: "the-odds-api",
      credential_generation_id: generation,
      opened_at: observedAt,
      reason: "credential_bootstrap",
      initial_used: 38,
      initial_remaining: 462,
      source_request_key: `bootstrap:${epoch}`
    });
    expect(db.prepare("SELECT * FROM odds_quota_state").get()).toEqual({
      provider: "the-odds-api",
      used: 38,
      remaining: 462,
      last_cost: 0,
      updated_at: observedAt
    });
    expect(db.prepare("SELECT * FROM odds_quota_events").get()).toEqual({
      request_key: `bootstrap:${epoch}`,
      provider: "the-odds-api",
      used: 38,
      remaining: 462,
      last_cost: 0,
      captured_at: observedAt,
      response_capture_id: null
    });
    await expect(reconstructProductionFoundationBootstrap(d1)).resolves.toMatchObject({
      status: "already_reconstructed",
      quotaEpoch: epoch,
      used: 38,
      remaining: 462,
      providerRequestMade: false
    });
    expect(() => db.exec("UPDATE odds_quota_events SET used = 39"))
      .toThrow(/append-only/);
    db.close();
  });

  it("refuses partial drift, changed receipts, changed alerts, and nonempty healthy state", async () => {
    const partial = driftDatabase();
    applySql(partial, "drizzle/0017_engine_os_foundation_repair.sql");
    partial.exec("DROP TABLE source_capture_heartbeats");
    await expect(inspectProductionFoundationRepair(sqliteD1(partial)))
      .rejects.toThrow(/incomplete or mistyped/);
    partial.close();

    const changedReceipt = driftDatabase();
    changedReceipt.exec("DROP TRIGGER engine_schema_versions_no_update");
    changedReceipt.exec("UPDATE engine_schema_versions SET migration_hash = 'changed' WHERE version = '0014_odds_quota_reservations'");
    await expect(inspectProductionFoundationRepair(sqliteD1(changedReceipt)))
      .rejects.toThrow(/receipt is absent or changed/);
    changedReceipt.close();

    const changedAlert = driftDatabase();
    changedAlert.exec("UPDATE engine_system_alerts SET state = 'resolved' WHERE alert_id = 'a5514f45beb8ad9c90efb03bed10bfcc2d056cc238f310187f9e91fa9370c1a0'");
    await expect(inspectProductionFoundationRepair(sqliteD1(changedAlert)))
      .rejects.toThrow(/alert is absent or changed/);
    changedAlert.close();

    const nonempty = driftDatabase();
    applySql(nonempty, "drizzle/0017_engine_os_foundation_repair.sql");
    nonempty.prepare(`INSERT INTO source_capture_manifests (
      capture_id, idempotency_key, provider, dataset, request_hash,
      response_object_key, response_sha256, response_bytes, sidecar_object_key,
      sidecar_sha256, received_at, source_schema_version, license_id, evidence_hash
    ) VALUES ('capture', 'idempotency', 'fixture', 'fixture', 'request',
      'response', 'response-hash', 0, 'sidecar', 'sidecar-hash', ?, 'v1', 'fixture', 'evidence')`)
      .run(observedAt);
    await expect(reconstructProductionFoundationBootstrap(sqliteD1(nonempty)))
      .rejects.toThrow(/partial or nonempty/);
    expect(nonempty.prepare("SELECT count(*) AS count FROM odds_quota_epochs").get())
      .toEqual({ count: 0 });
    nonempty.close();

    const conflicting = driftDatabase();
    applySql(conflicting, "drizzle/0017_engine_os_foundation_repair.sql");
    conflicting.prepare(`INSERT INTO odds_quota_state
      (provider, used, remaining, last_cost, updated_at)
      VALUES ('the-odds-api', 39, 461, 0, ?)`)
      .run(observedAt);
    await expect(reconstructProductionFoundationBootstrap(sqliteD1(conflicting)))
      .rejects.toThrow(/partial or nonempty/);
    expect(conflicting.prepare("SELECT count(*) AS count FROM odds_quota_epochs").get())
      .toEqual({ count: 0 });
    conflicting.close();
  });

  it("returns a complete read-only verification payload for the operator receipt", async () => {
    const db = driftDatabase();
    const d1 = sqliteD1(db);
    applySql(db, "drizzle/0017_engine_os_foundation_repair.sql");
    await reconstructProductionFoundationBootstrap(d1);

    await expect(verifyProductionFoundationRepair(d1)).resolves.toMatchObject({
      status: "verified",
      schemaFingerprint: "sha256:64a7b3d45cde53a3566fd46c935ace8680eae6faa0bfe71827d1f110b6b00e93",
      foreignKeyViolationCount: 0,
      tableCounts: {
        source_manifests: 0,
        source_heartbeats: 0,
        quota_events: 1,
        quota_state: 1,
        quota_epochs: 1,
        quota_control: 1,
        reservations: 0,
        reservation_events: 0
      },
      bootstrap: {
        quotaEpoch: epoch,
        credentialGenerationId: generation,
        requestKey: `bootstrap:${epoch}`,
        observedAt,
        used: 38,
        remaining: 462,
        lastCost: 0
      },
      preservedAlertId: alertId,
      downstreamOperationalTableCounts: {
        canonical_games: 0,
        game_provider_aliases: 0,
        game_kickoff_revisions: 0,
        forecast_origins: 0,
        game_schedule_revisions: 0,
        forecast_origin_versions: 0,
        engine_activations: 0,
        engine_scheduler_ticks_v2: 0,
        engine_scheduler_events_v2: 0,
        engine_origin_jobs_v2: 0,
        engine_origin_attempts_v2: 0,
        engine_origin_records_v2: 0
      },
      downstreamOperationalTablesEmpty: true,
      providerRequestMade: false
    });
    db.close();
  });

  it("rolls back only the 0017 receipt and preserves repaired schema and bootstrap data", async () => {
    const db = driftDatabase();
    const d1 = sqliteD1(db);
    applySql(db, "drizzle/0017_engine_os_foundation_repair.sql");
    await reconstructProductionFoundationBootstrap(d1);
    const before = objectDefinitions(db);

    applySql(db, "drizzle/rollback/0017_engine_os_foundation_repair.down.sql");
    expect(db.prepare(`SELECT version FROM engine_schema_versions
      WHERE version = '0017_engine_os_foundation_repair'`).get()).toBeUndefined();
    expect(objectDefinitions(db)).toEqual(before);
    expect(db.prepare("SELECT used, remaining, last_cost FROM odds_quota_state").get())
      .toEqual({ used: 38, remaining: 462, last_cost: 0 });
    expect(db.prepare("SELECT count(*) AS count FROM odds_quota_events").get())
      .toEqual({ count: 1 });
    expect(() => db.exec("DELETE FROM engine_schema_versions WHERE version = '0014_odds_quota_reservations'"))
      .toThrow(/append-only/);
    db.close();
  });
});
