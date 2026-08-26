import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getD1: () => {
    throw new Error("Tests must inject D1 explicitly");
  }
}));

import {
  priorWeekEvidenceOnly,
  requiredForecastOriginsForSchedule
} from "@/domain/engine-os";
import { sha256Hex } from "@/domain/hash";
import { reconcileCanonicalGameSchedule } from "@/server/engine-os/origin-identity";
import { runEngineOsUrgentAutomation } from "@/server/engine-os/automation";

type SqlValue = string | number | bigint | Uint8Array | null;

function sqliteD1(db: DatabaseSync): D1Database {
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

function applySql(db: DatabaseSync, filename: string): void {
  db.exec(readFileSync(resolve(process.cwd(), filename), "utf8").replaceAll("--> statement-breakpoint", ""));
}

function input(db: D1Database, overrides: Record<string, unknown> = {}) {
  return {
    db,
    gameId: "2026_01_NE_SEA",
    season: 2026,
    seasonType: "REG",
    week: 1,
    homeTeam: "SEA",
    awayTeam: "NE",
    provider: "nflverse",
    providerGameId: "2026_01_NE_SEA",
    scheduleStatus: "scheduled" as const,
    kickoffUtc: "2026-09-13T20:05:00.000Z",
    observedAt: "2026-08-25T23:28:37.000Z",
    activatedAt: "2026-08-25T23:28:37.000Z",
    activationBoundary: "os02a-qualification",
    sourceEvidenceHash: "b".repeat(64),
    sourceRowHash: "a".repeat(64),
    ...overrides
  };
}

describe("OS-02A canonical schedule and forecast-origin identity", () => {
  it("creates all five frozen origins for all 272 pinned 2026 games with DST-correct Tuesdays", () => {
    const schedule = JSON.parse(readFileSync(resolve(process.cwd(), "config/2026-nfl-schedule.v1.json"), "utf8")) as {
      capturedAt: string;
      gameCount: number;
      games: Array<{ id: string; week: number; kickoffAt: string }>;
    };
    expect(schedule.gameCount).toBe(272);
    const origins = schedule.games.flatMap((game) => requiredForecastOriginsForSchedule({
      gameId: game.id,
      week: game.week,
      kickoffUtc: game.kickoffAt,
      observedAt: schedule.capturedAt,
      activatedAt: schedule.capturedAt
    }));
    expect(origins).toHaveLength(1_360);
    expect(new Set(origins.map((origin) => `${origin.gameId}:${origin.horizonId}`)).size).toBe(1_360);
    expect(origins.every((origin) => origin.eligible)).toBe(true);
    const weekEight = origins.find((origin) => origin.horizonId === "weekly_tuesday_0730" &&
      schedule.games.find((game) => game.id === origin.gameId)?.week === 8)!;
    const weekNine = origins.find((origin) => origin.horizonId === "weekly_tuesday_0730" &&
      schedule.games.find((game) => game.id === origin.gameId)?.week === 9)!;
    expect(weekEight.scheduledForUtc).toBe("2026-10-27T14:30:00.000Z");
    expect(weekNine.scheduledForUtc).toBe("2026-11-03T15:30:00.000Z");
    expect(weekEight.scheduledForLocal).toContain("T07:30:00[America/Los_Angeles]");
    expect(weekNine.scheduledForLocal).toContain("T07:30:00[America/Los_Angeles]");
  });

  it("anchors Tuesday to NFL Week W and preserves same-week isolation", () => {
    const original = requiredForecastOriginsForSchedule({
      gameId: "postponed-week-one",
      week: 1,
      kickoffUtc: "2026-09-13T20:05:00Z",
      observedAt: "2026-08-25T00:00:00Z",
      activatedAt: "2026-08-25T00:00:00Z"
    });
    const postponed = requiredForecastOriginsForSchedule({
      gameId: "postponed-week-one",
      week: 1,
      kickoffUtc: "2026-09-27T20:05:00Z",
      observedAt: "2026-09-14T00:00:00Z",
      activatedAt: "2026-08-25T00:00:00Z",
      priorElapsedHorizons: ["weekly_tuesday_0730"]
    });
    const firstTuesday = original.find((origin) => origin.horizonId === "weekly_tuesday_0730")!;
    const postponedTuesday = postponed.find((origin) => origin.horizonId === "weekly_tuesday_0730")!;
    expect(postponedTuesday.scheduledForUtc).toBe(firstTuesday.scheduledForUtc);
    expect(postponedTuesday).toMatchObject({ eligible: false, eligibilityReason: "prior_origin_elapsed" });
    expect(priorWeekEvidenceOnly({
      forecastSeason: 2026,
      forecastWeek: 3,
      evidenceSeason: 2026,
      evidenceWeek: 3
    })).toBe(false);
  });

  it("reconciles every pinned 2026 schedule row into one canonical game and five versioned horizons", async () => {
    const schedule = JSON.parse(readFileSync(resolve(process.cwd(), "config/2026-nfl-schedule.v1.json"), "utf8")) as {
      capturedAt: string;
      source: { csvSha256: string };
      games: Array<{ id: string; week: number; kickoffAt: string; away: string; home: string }>;
    };
    const sqlite = new DatabaseSync(":memory:");
    applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
    applySql(sqlite, "drizzle/0015_engine_os_origin_identity.sql");
    const db = sqliteD1(sqlite);
    for (const game of schedule.games) {
      const result = await reconcileCanonicalGameSchedule({
        db,
        gameId: game.id,
        season: 2026,
        seasonType: "REG",
        week: game.week,
        homeTeam: game.home,
        awayTeam: game.away,
        provider: "nflverse",
        providerGameId: game.id,
        scheduleStatus: "scheduled",
        kickoffUtc: game.kickoffAt,
        observedAt: schedule.capturedAt,
        activatedAt: schedule.capturedAt,
        activationBoundary: "os02a-pinned-schedule-qualification",
        sourceEvidenceHash: schedule.source.csvSha256,
        sourceRowHash: sha256Hex(JSON.stringify(game))
      });
      expect(result.originVersions).toHaveLength(5);
    }
    expect(sqlite.prepare("SELECT count(*) AS count FROM canonical_games").get()).toEqual({ count: 272 });
    expect(sqlite.prepare("SELECT count(*) AS count FROM game_provider_aliases").get()).toEqual({ count: 272 });
    expect(sqlite.prepare("SELECT count(*) AS count FROM game_schedule_revisions").get()).toEqual({ count: 272 });
    expect(sqlite.prepare("SELECT count(*) AS count FROM forecast_origin_versions").get()).toEqual({ count: 1_360 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM forecast_origin_versions
      WHERE eligible = 0 OR scheduled_for_utc IS NULL`).get()).toEqual({ count: 0 });
    sqlite.close();
  });

  it("appends source-bound schedule and origin revisions without rewriting prior identities", async () => {
    const sqlite = new DatabaseSync(":memory:");
    applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
    applySql(sqlite, "drizzle/0015_engine_os_origin_identity.sql");
    const db = sqliteD1(sqlite);
    const first = await reconcileCanonicalGameSchedule(input(db));
    expect(first.appendedRevision).toBe(true);
    expect(first.originVersions).toHaveLength(5);
    expect(first.originVersions.every((origin) => origin.eligible)).toBe(true);
    const originalTuesday = sqlite.prepare(`SELECT * FROM forecast_origin_versions
      WHERE origin_version_id = ?`).get(first.originVersions[0]!.originVersionId);

    const duplicate = await reconcileCanonicalGameSchedule(input(db));
    expect(duplicate.appendedRevision).toBe(false);
    expect(sqlite.prepare("SELECT count(*) AS count FROM game_schedule_revisions").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT count(*) AS count FROM forecast_origin_versions").get()).toEqual({ count: 5 });

    const moved = await reconcileCanonicalGameSchedule(input(db, {
      kickoffUtc: "2026-09-13T23:25:00Z",
      observedAt: "2026-08-26T12:00:00Z",
      sourceRowHash: "c".repeat(64)
    }));
    expect(moved.appendedRevision).toBe(true);
    expect(sqlite.prepare("SELECT count(*) AS count FROM game_schedule_revisions").get()).toEqual({ count: 2 });
    expect(sqlite.prepare("SELECT count(*) AS count FROM forecast_origin_versions").get()).toEqual({ count: 10 });
    expect(sqlite.prepare(`SELECT * FROM forecast_origin_versions
      WHERE origin_version_id = ?`).get(first.originVersions[0]!.originVersionId)).toEqual(originalTuesday);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM forecast_origin_versions head
      WHERE NOT EXISTS (SELECT 1 FROM forecast_origin_versions child
        WHERE child.supersedes_origin_version_id = head.origin_version_id)`).get()).toEqual({ count: 5 });

    const unresolved = await reconcileCanonicalGameSchedule(input(db, {
      scheduleStatus: "kickoff_unresolved",
      kickoffUtc: null,
      observedAt: "2026-09-14T00:00:00Z",
      sourceRowHash: "d".repeat(64)
    }));
    expect(unresolved.originVersions.every((origin) =>
      !origin.eligible && origin.eligibilityReason === "schedule_unresolved" && origin.scheduledForUtc === null
    )).toBe(true);
    const resumed = await reconcileCanonicalGameSchedule(input(db, {
      kickoffUtc: "2026-09-27T20:05:00Z",
      observedAt: "2026-09-14T01:00:00Z",
      sourceRowHash: "e".repeat(64)
    }));
    expect(resumed.originVersions.every((origin) =>
      !origin.eligible && origin.eligibilityReason === "prior_origin_elapsed"
    )).toBe(true);
    expect(sqlite.prepare(`SELECT eligible, eligibility_reason FROM forecast_origin_versions
      WHERE origin_version_id = ?`).get(first.originVersions[0]!.originVersionId))
      .toEqual({ eligible: 1, eligibility_reason: "eligible" });
    expect(() => sqlite.exec("UPDATE game_schedule_revisions SET week = 2"))
      .toThrow(/append-only/);
    expect(() => sqlite.exec("DELETE FROM forecast_origin_versions"))
      .toThrow(/append-only/);
    sqlite.close();
  });

  it("ratchets eligibility so repeated kickoff revisions cannot manufacture earlier origins", async () => {
    const sqlite = new DatabaseSync(":memory:");
    applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
    applySql(sqlite, "drizzle/0015_engine_os_origin_identity.sql");
    const db = sqliteD1(sqlite);
    const original = await reconcileCanonicalGameSchedule(input(db, {
      kickoffUtc: "2026-09-13T23:25:00Z"
    }));
    const earlier = await reconcileCanonicalGameSchedule(input(db, {
      kickoffUtc: "2026-09-13T20:05:00Z",
      observedAt: "2026-08-26T12:00:00Z",
      sourceRowHash: "c".repeat(64)
    }));
    const tuesday = earlier.originVersions.find((origin) => origin.horizonId === "weekly_tuesday_0730")!;
    const relative = earlier.originVersions.filter((origin) => origin.horizonId !== "weekly_tuesday_0730");
    expect(tuesday).toMatchObject({ eligible: true, eligibilityReason: "eligible" });
    expect(relative.every((origin) =>
      !origin.eligible && origin.eligibilityReason === "earlier_origin_prohibited"
    )).toBe(true);
    for (const revised of relative) {
      const prior = original.originVersions.find((origin) => origin.horizonId === revised.horizonId)!;
      expect(Date.parse(revised.scheduledForUtc!)).toBeLessThan(Date.parse(prior.scheduledForUtc!));
    }
    const partialMoveBack = await reconcileCanonicalGameSchedule(input(db, {
      kickoffUtc: "2026-09-13T21:05:00Z",
      observedAt: "2026-08-26T13:00:00Z",
      sourceRowHash: "d".repeat(64)
    }));
    const partialRelative = partialMoveBack.originVersions.filter((origin) =>
      origin.horizonId !== "weekly_tuesday_0730"
    );
    expect(partialRelative.every((origin) =>
      !origin.eligible && origin.eligibilityReason === "earlier_origin_prohibited"
    )).toBe(true);
    for (const revised of partialRelative) {
      const originalOrigin = original.originVersions.find((origin) => origin.horizonId === revised.horizonId)!;
      const immediatelyPrior = earlier.originVersions.find((origin) => origin.horizonId === revised.horizonId)!;
      expect(Date.parse(revised.scheduledForUtc!)).toBeGreaterThan(Date.parse(immediatelyPrior.scheduledForUtc!));
      expect(Date.parse(revised.scheduledForUtc!)).toBeLessThan(Date.parse(originalOrigin.scheduledForUtc!));
    }
    sqlite.close();
  });

  it("persists explicit unresolved identities even when no imported game has a kickoff", async () => {
    const sqlite = new DatabaseSync(":memory:");
    applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
    applySql(sqlite, "drizzle/0015_engine_os_origin_identity.sql");
    sqlite.exec(`
      CREATE TABLE nfl_games (
        game_id text PRIMARY KEY, season integer, season_type text, week integer,
        game_date text, game_time text, away_team text, home_team text, source_row_hash text
      );
      CREATE TABLE nflverse_import_state (dataset text PRIMARY KEY, source_hash text);
      INSERT INTO nfl_games VALUES (
        'unresolved-game', 2026, 'REG', 1, '2026-09-13', NULL, 'NE', 'SEA', '${"a".repeat(64)}'
      );
      INSERT INTO nflverse_import_state VALUES ('schedules:live', '${"b".repeat(64)}');
      INSERT INTO source_capture_manifests (
        capture_id, idempotency_key, provider, dataset, request_hash, response_object_key,
        response_sha256, response_bytes, sidecar_object_key, sidecar_sha256,
        received_at, source_schema_version, license_id, evidence_hash
      ) VALUES (
        'schedule-capture', 'schedule-capture', 'nflverse', 'schedule', '${"c".repeat(64)}',
        'raw/schedule', '${"b".repeat(64)}', 1, 'manifest/schedule', '${"d".repeat(64)}',
        '2026-08-25T23:28:37Z', 'schedule.v1', 'nflverse', '${"e".repeat(64)}'
      );
      INSERT INTO source_capture_heartbeats (
        source_key, provider, dataset, status, last_attempt_at, last_success_at, latest_capture_id
      ) VALUES (
        'nflverse:schedule', 'nflverse', 'schedule', 'current',
        '2026-08-25T23:28:37Z', '2026-08-25T23:28:37Z', 'schedule-capture'
      );
    `);
    const result = await runEngineOsUrgentAutomation({
      db: sqliteD1(sqlite),
      now: new Date("2026-08-25T23:28:37Z")
    });
    expect(result).toMatchObject({
      activationId: null,
      status: "waiting_for_schedule",
      unresolvedGames: 1,
      reconciledOriginVersions: 5
    });
    expect(sqlite.prepare("SELECT count(*) AS count FROM canonical_games").get()).toEqual({ count: 1 });
    expect(sqlite.prepare(`SELECT schedule_status FROM game_schedule_revisions`).get())
      .toEqual({ schedule_status: "kickoff_unresolved" });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM forecast_origin_versions
      WHERE eligibility_reason = 'schedule_unresolved' AND scheduled_for_utc IS NULL`).get())
      .toEqual({ count: 5 });
    expect(sqlite.prepare("SELECT count(*) AS count FROM engine_activations").get()).toEqual({ count: 0 });
    sqlite.close();
  });

  it("rejects ambiguous aliases, branch revisions, and out-of-order schedule observations", async () => {
    const sqlite = new DatabaseSync(":memory:");
    applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
    applySql(sqlite, "drizzle/0015_engine_os_origin_identity.sql");
    const db = sqliteD1(sqlite);
    const first = await reconcileCanonicalGameSchedule(input(db));
    await expect(reconcileCanonicalGameSchedule(input(db, {
      gameId: "different-game",
      homeTeam: "SF",
      awayTeam: "LAR"
    }))).rejects.toThrow(/ambiguous/);
    expect(sqlite.prepare("SELECT count(*) AS count FROM canonical_games WHERE game_id = 'different-game'").get())
      .toEqual({ count: 0 });
    sqlite.exec(`INSERT INTO canonical_games VALUES (
      'direct-other', 2026, 'REG', 1, 'SF', 'LAR', 'resolved', '2026-08-25T00:00:00Z', NULL
    )`);
    expect(() => sqlite.exec(`INSERT INTO game_provider_aliases (
      alias_id, provider, provider_game_id, game_id, valid_from, observed_at, source_capture_id
    ) VALUES ('ambiguous-direct', 'nflverse', '2026_01_NE_SEA', 'direct-other',
      '2026-08-27T00:00:00Z', '2026-08-27T00:00:00Z', NULL)`)).toThrow(/reassigned|ambiguous/);
    await expect(reconcileCanonicalGameSchedule(input(db, {
      kickoffUtc: "2026-09-13T21:05:00Z",
      observedAt: "2026-08-24T00:00:00Z",
      sourceRowHash: "f".repeat(64)
    }))).rejects.toThrow(/after the current head/);
    await reconcileCanonicalGameSchedule(input(db, {
      kickoffUtc: "2026-09-13T21:05:00Z",
      observedAt: "2026-08-26T00:00:00Z",
      sourceRowHash: "f".repeat(64)
    }));
    expect(() => sqlite.exec(`INSERT INTO game_schedule_revisions (
      revision_id, game_id, week, schedule_status, kickoff_utc, local_time_zone,
      observed_at, source_evidence_hash, source_row_hash, supersedes_revision_id
    ) VALUES ('branch', '2026_01_NE_SEA', 1, 'scheduled', '2026-09-13T22:05:00Z',
      'America/Los_Angeles', '2026-08-27T00:00:00Z', '${"1".repeat(64)}', '${"2".repeat(64)}',
      '${first.scheduleRevisionId}')`)).toThrow();
    sqlite.close();
  });

  it("has a hash-registered forward migration and a rollback that preserves the legacy spine", () => {
    const sqlite = new DatabaseSync(":memory:");
    applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
    applySql(sqlite, "drizzle/0015_engine_os_origin_identity.sql");
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0015_engine_os_origin_identity.sql"), "utf8");
    const definition = migration.split("INSERT INTO `engine_schema_versions`")[0]!;
    expect(sqlite.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0015_engine_os_origin_identity'`).get())
      .toEqual({ migration_hash: `sha256:${sha256Hex(definition)}` });
    applySql(sqlite, "drizzle/rollback/0015_engine_os_origin_identity.down.sql");
    expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='forecast_origin_versions'`).get())
      .toBeUndefined();
    expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='forecast_origins'`).get())
      .toEqual({ name: "forecast_origins" });
    sqlite.close();
  });
});
