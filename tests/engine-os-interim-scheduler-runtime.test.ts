import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type { ForecastWithholdingReason, RequiredForecastHorizonId } from "@/domain/engine-os";
import {
  engineOperatingContract,
  engineOsContractHashes,
  footballLifecycle2026,
  researchConstitution
} from "@/domain/engine-os-contracts";
import { sha256Hex, stableHash } from "@/domain/hash";
import {
  interimSchedulerContractHash,
  interimSchedulerJobKey,
  originPersistenceDeadline
} from "@/server/engine-os/interim-scheduler-kernel";
import {
  claimInterimSchedulerTick,
  claimInterimSchedulerJob,
  publishInterimSchedulerWithholding,
  renewInterimSchedulerJob,
  runInterimSchedulerInvocation
} from "@/server/engine-os/interim-scheduler";
import { reconcileCanonicalGameSchedule } from "@/server/engine-os/origin-identity";

type SqlValue = string | number | bigint | Uint8Array | null;
interface D1QueryCounter { queries: number }

interface JobRow {
  job_key: string;
  origin_version_id: string;
  scheduled_trigger_at: string;
  kickoff_at: string;
  persistence_deadline_at: string;
  activation_boundary: string;
  state: "pending" | "running" | "completed" | "invalidated";
  fence_token: number;
  active_attempt_token_hash: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  completed_at: string | null;
}

function applySql(db: DatabaseSync, filename: string): void {
  db.exec(readFileSync(resolve(process.cwd(), filename), "utf8").replaceAll("--> statement-breakpoint", ""));
}

function sqliteD1(db: DatabaseSync, counter: D1QueryCounter): D1Database {
  function prepare(sql: string) {
    let parameters: SqlValue[] = [];
    return {
      bind(...values: unknown[]) {
        parameters = values as SqlValue[];
        return this;
      },
      async run() {
        counter.queries += 1;
        const result = db.prepare(sql).run(...parameters);
        return { success: true, meta: { changes: Number(result.changes) }, results: [] };
      },
      async first<T>() {
        counter.queries += 1;
        return (db.prepare(sql).get(...parameters) ?? null) as T | null;
      },
      async all<T>() {
        counter.queries += 1;
        return { results: db.prepare(sql).all(...parameters) as T[], success: true, meta: {} };
      },
      async raw<T>() {
        counter.queries += 1;
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
    async exec(sql: string) { counter.queries += 1; db.exec(sql); return { count: 0, duration: 0 }; },
    async dump() { return new ArrayBuffer(0); }
  } as unknown as D1Database;
}

function seedSchedulerActivation(
  sqlite: DatabaseSync,
  activatedAt: string,
  researchContractHash = engineOsContractHashes.research
): void {
  sqlite.prepare(`INSERT INTO engine_activations (
    activation_id, activated_at, activation_boundary, evidence_scope,
    operating_contract_version, operating_contract_hash,
    research_contract_version, research_contract_hash,
    lifecycle_version, lifecycle_hash, first_origin_utc
  ) VALUES (?, ?, ?, 'partial_season_shadow', ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      stableHash({ contract: "os15a-test-activation", activatedAt, researchContractHash }),
      activatedAt,
      `os15a-test:${activatedAt}`,
      engineOperatingContract.version,
      engineOsContractHashes.operating,
      researchConstitution.version,
      researchContractHash,
      footballLifecycle2026.version,
      engineOsContractHashes.lifecycle,
      activatedAt
    );
}

function database(activatedAt?: string): {
  sqlite: DatabaseSync;
  db: D1Database;
  queryCounter: D1QueryCounter;
} {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
  applySql(sqlite, "drizzle/0015_engine_os_origin_identity.sql");
  applySql(sqlite, "drizzle/0016_engine_os_interim_scheduler.sql");
  if (activatedAt) seedSchedulerActivation(sqlite, activatedAt);
  const queryCounter = { queries: 0 };
  return { sqlite, db: sqliteD1(sqlite, queryCounter), queryCounter };
}

function monotonicClock(start: string, stepMilliseconds = 1): () => Date {
  let value = Date.parse(start) - stepMilliseconds;
  return () => {
    value += stepMilliseconds;
    return new Date(value);
  };
}

function sequenceClock(values: readonly string[]): () => Date {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    if (!value) throw new Error("Sequence clock requires at least one timestamp");
    return new Date(value);
  };
}

function tokenFactory(prefix = "attempt"): () => string {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
}

const kickoffAt = "2026-09-13T20:05:00.000Z";
const horizonTimes: Record<RequiredForecastHorizonId, string> = {
  weekly_tuesday_0730: "2026-09-08T14:30:00.000Z",
  kickoff_minus_120: "2026-09-13T18:05:00.000Z",
  kickoff_minus_90: "2026-09-13T18:35:00.000Z",
  kickoff_minus_60: "2026-09-13T19:05:00.000Z",
  kickoff_minus_15: "2026-09-13T19:50:00.000Z"
};

function seedSchedule(db: DatabaseSync, input: {
  gameId: string;
  horizons: readonly RequiredForecastHorizonId[];
  scheduleStatus?: "scheduled" | "kickoff_unresolved";
  observedAt?: string;
  eligible?: 0 | 1;
  reason?: "eligible" | "schedule_unresolved" | "known_after_origin" |
    "pre_activation" | "after_kickoff" | "prior_origin_elapsed" | "earlier_origin_prohibited";
  kickoffAt?: string;
  scheduledAtByHorizon?: Partial<Record<RequiredForecastHorizonId, string>>;
}): void {
  const observedAt = input.observedAt ?? "2026-08-25T00:00:00.000Z";
  const scheduleStatus = input.scheduleStatus ?? "scheduled";
  const revisionId = `${input.gameId}:revision:1`;
  const scheduledKickoffAt = input.kickoffAt ?? kickoffAt;
  db.prepare(`INSERT INTO canonical_games (
    game_id, season, season_type, week, home_team, away_team, identity_status, created_at
  ) VALUES (?, 2026, 'REG', 1, 'SEA', 'NE', 'resolved', ?)`)
    .run(input.gameId, observedAt);
  db.prepare(`INSERT INTO game_schedule_revisions (
    revision_id, game_id, week, schedule_status, kickoff_utc, local_time_zone,
    observed_at, source_evidence_hash, source_row_hash
  ) VALUES (?, ?, 1, ?, ?, 'America/Los_Angeles', ?, ?, ?)`)
    .run(
      revisionId,
      input.gameId,
      scheduleStatus,
      scheduleStatus === "scheduled" ? scheduledKickoffAt : null,
      observedAt,
      "e".repeat(64),
      "f".repeat(64)
    );
  for (const horizon of input.horizons) {
    const unresolved = scheduleStatus === "kickoff_unresolved";
    const scheduled = unresolved ? null : input.scheduledAtByHorizon?.[horizon] ?? horizonTimes[horizon];
    const scientific = horizon === "weekly_tuesday_0730" ? 1 : 0;
    const informationCutoff = horizon === "weekly_tuesday_0730"
      ? "completed_games_through_week_w_minus_1_at_origin"
      : "forecast_time";
    db.prepare(`INSERT INTO forecast_origin_versions (
      origin_version_id, logical_origin_id, game_id, horizon_id, scheduled_for_utc,
      scheduled_for_local, kickoff_revision_id, scientific_eligibility, information_cutoff,
      eligible, eligibility_reason, activation_boundary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'os15a-runtime-test', ?)`)
      .run(
        `${input.gameId}:${horizon}:v1`,
        `${input.gameId}:${horizon}`,
        input.gameId,
        horizon,
        scheduled,
        scheduled === null ? null : `${scheduled}[America/Los_Angeles]`,
        revisionId,
        scientific,
        informationCutoff,
        input.eligible ?? (unresolved ? 0 : 1),
        input.reason ?? (unresolved ? "schedule_unresolved" : "eligible"),
        observedAt
      );
  }
}

function originVersionId(gameId: string, horizon: RequiredForecastHorizonId): string {
  return `${gameId}:${horizon}:v1`;
}

function insertPendingJob(sqlite: DatabaseSync, input: {
  gameId: string;
  horizon?: RequiredForecastHorizonId;
  originVersionId?: string;
  scheduledAt?: string;
  kickoff?: string;
  deadlineAt?: string;
  activationBoundary?: string;
}): string {
  const horizon = input.horizon ?? "kickoff_minus_120";
  const originId = input.originVersionId ?? originVersionId(input.gameId, horizon);
  const scheduledAt = input.scheduledAt ?? horizonTimes[horizon];
  const kickoff = input.kickoff ?? kickoffAt;
  const activationBoundary = input.activationBoundary ?? "os15a-runtime-test";
  const jobKey = interimSchedulerJobKey({ originVersionId: originId, activationBoundary });
  const deadline = input.deadlineAt ?? originPersistenceDeadline({
    horizonId: horizon,
    scheduledTriggerAt: scheduledAt,
    kickoffAt: kickoff
  });
  sqlite.prepare(`INSERT INTO engine_origin_jobs_v2 (
    job_key, scheduler_contract_version, scheduler_contract_hash, job_key_version, job_type,
    origin_version_id, scheduled_trigger_at, kickoff_at, persistence_deadline_at,
    activation_boundary, state, created_at
  ) VALUES (?, 'interim-scheduler-contract.2026.4', ?, 'engine-os.scheduler-job.v2',
    'forecast_or_withholding', ?, ?, ?, ?, ?, 'pending', ?)`)
    .run(
      jobKey,
      interimSchedulerContractHash,
      originId,
      scheduledAt,
      kickoff,
      deadline,
      activationBoundary,
      scheduledAt
    );
  return jobKey;
}

function job(sqlite: DatabaseSync, jobKey: string): JobRow {
  return sqlite.prepare(`SELECT job_key, origin_version_id, scheduled_trigger_at, kickoff_at,
    persistence_deadline_at, activation_boundary, state, fence_token,
    active_attempt_token_hash, lease_owner, lease_expires_at, heartbeat_at, completed_at
    FROM engine_origin_jobs_v2 WHERE job_key = ?`).get(jobKey) as unknown as JobRow;
}

describe("OS-15A provider-free scheduler runtime", () => {
  it("produces exactly 1,360 timely terminal rows in a healthy full-schedule replay", async () => {
    const { sqlite, db, queryCounter } = database();
    const schedule = JSON.parse(readFileSync(resolve(process.cwd(), "config/2026-nfl-schedule.v1.json"), "utf8")) as {
      capturedAt: string;
      source: { csvSha256: string };
      games: Array<{ id: string; week: number; kickoffAt: string; away: string; home: string }>;
    };
    for (const game of schedule.games) {
      await reconcileCanonicalGameSchedule({
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
        activationBoundary: "os15a-full-schedule-replay",
        sourceEvidenceHash: schedule.source.csvSha256,
        sourceRowHash: sha256Hex(JSON.stringify(game))
      });
    }
    const origins = sqlite.prepare(`SELECT DISTINCT scheduled_for_utc
      FROM forecast_origin_versions WHERE eligible = 1 ORDER BY scheduled_for_utc`).all() as Array<{
      scheduled_for_utc: string;
    }>;
    const tokens = tokenFactory("full-schedule");
    let maximumD1Queries = 0;
    for (const origin of origins) {
      const scheduled = new Date(origin.scheduled_for_utc);
      const beforeQueries = queryCounter.queries;
      const result = await runInterimSchedulerInvocation({
        db,
        lane: "dispatcher",
        nominalScheduledAt: scheduled,
        clock: monotonicClock(new Date(scheduled.getTime() + 1_000).toISOString()),
        tokenFactory: tokens,
        owner: `full-schedule:${origin.scheduled_for_utc}`
      });
      expect(result.status).toBe("completed");
      expect(result.providerDispatches).toBe(0);
      expect(queryCounter.queries - beforeQueries).toBe(result.d1QueriesUsed);
      maximumD1Queries = Math.max(maximumD1Queries, result.d1QueriesUsed);
    }
    expect(maximumD1Queries).toBeLessThanOrEqual(46);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2`).get())
      .toEqual({ count: 1_360 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2
      WHERE status <> 'withheld' OR timing <> 'timely' OR prospective_eligible <> 1
        OR withholding_reason <> 'no_eligible_package'`).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_jobs_v2
      WHERE state <> 'completed'`).get()).toEqual({ count: 0 });
    sqlite.close();
  }, 30_000);

  it("consumes all and only the five accepted horizons and makes duplicate ticks converge", async () => {
    const { sqlite, db } = database();
    seedSchedule(sqlite, {
      gameId: "five-horizons",
      horizons: [
        "weekly_tuesday_0730",
        "kickoff_minus_120",
        "kickoff_minus_90",
        "kickoff_minus_60",
        "kickoff_minus_15"
      ]
    });
    const tokens = tokenFactory("five");
    for (const horizon of Object.keys(horizonTimes) as RequiredForecastHorizonId[]) {
      const nominal = new Date(horizonTimes[horizon]);
      const first = await runInterimSchedulerInvocation({
        db,
        lane: "dispatcher",
        nominalScheduledAt: nominal,
        clock: monotonicClock(new Date(nominal.getTime() + 1_000).toISOString()),
        tokenFactory: tokens,
        owner: `worker:${horizon}`
      });
      expect(first).toMatchObject({
        status: "completed",
        dueOrigins: 1,
        timelyWithholdings: 1,
        lateClosures: 0,
        providerDispatches: 0
      });
      const duplicate = await runInterimSchedulerInvocation({
        db,
        lane: "dispatcher",
        nominalScheduledAt: nominal,
        clock: monotonicClock(new Date(nominal.getTime() + 2_000).toISOString()),
        tokenFactory: tokens,
        owner: `duplicate:${horizon}`
      });
      expect(duplicate.status).toBe("duplicate_or_active");
    }
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2`).get())
      .toEqual({ count: 5 });
    expect(sqlite.prepare(`SELECT count(DISTINCT origin.horizon_id) AS count
      FROM engine_origin_records_v2 record
      JOIN forecast_origin_versions origin ON origin.origin_version_id = record.origin_version_id`).get())
      .toEqual({ count: 5 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2
      WHERE status <> 'withheld' OR prospective_eligible <> 1`).get()).toEqual({ count: 0 });
    const separated = sqlite.prepare(`SELECT scheduled_trigger_at, invoked_at, evidence_at,
      generated_at, persisted_at FROM engine_origin_records_v2 ORDER BY persisted_at LIMIT 1`).get() as {
      scheduled_trigger_at: string;
      invoked_at: string;
      evidence_at: string;
      generated_at: string;
      persisted_at: string;
    };
    expect(Date.parse(separated.scheduled_trigger_at)).toBeLessThan(Date.parse(separated.invoked_at));
    expect(Date.parse(separated.invoked_at)).toBeLessThan(Date.parse(separated.evidence_at));
    expect(Date.parse(separated.evidence_at)).toBeLessThan(Date.parse(separated.generated_at));
    expect(Date.parse(separated.generated_at)).toBeLessThan(Date.parse(separated.persisted_at));
    const decision = sqlite.prepare(`SELECT record_id, decision_hash, job_key, origin_version_id,
      withholding_reason, invoked_at, evidence_at, generated_at, persistence_requested_at,
      persisted_at, attempt_token_hash, fence_token, payload_json
      FROM engine_origin_records_v2 ORDER BY persisted_at LIMIT 1`).get() as Record<string, string | number>;
    expect(Date.parse(String(decision.persistence_requested_at)))
      .toBeLessThanOrEqual(Date.parse(String(decision.persisted_at)));
    expect(decision.decision_hash).toBe(stableHash({
      contract: "engine-os.scheduler-origin-decision.v2",
      recordId: decision.record_id,
      jobKey: decision.job_key,
      originVersionId: decision.origin_version_id,
      reason: decision.withholding_reason,
      invokedAt: decision.invoked_at,
      evidenceAt: decision.evidence_at,
      generatedAt: decision.generated_at,
      persistenceRequestedAt: decision.persistence_requested_at,
      attemptTokenHash: decision.attempt_token_hash,
      fence: decision.fence_token,
      payload: JSON.parse(String(decision.payload_json)) as unknown
    }));
    sqlite.close();
  });

  it("allows only one of two overlapping workers to own a duplicate trigger", async () => {
    const { sqlite, db } = database();
    seedSchedule(sqlite, { gameId: "overlap", horizons: ["kickoff_minus_120"] });
    const nominalScheduledAt = new Date(horizonTimes.kickoff_minus_120);
    const [left, right] = await Promise.all([
      runInterimSchedulerInvocation({
        db,
        lane: "dispatcher",
        nominalScheduledAt,
        clock: monotonicClock("2026-09-13T18:05:01Z"),
        tokenFactory: tokenFactory("left"),
        owner: "worker:left"
      }),
      runInterimSchedulerInvocation({
        db,
        lane: "dispatcher",
        nominalScheduledAt,
        clock: monotonicClock("2026-09-13T18:05:01.100Z"),
        tokenFactory: tokenFactory("right"),
        owner: "worker:right"
      })
    ]);
    expect([left.status, right.status].sort()).toEqual(["completed", "duplicate_or_active"]);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_scheduler_ticks_v2`).get())
      .toEqual({ count: 1 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2`).get())
      .toEqual({ count: 1 });
    sqlite.close();
  });

  it("lets the watchdog detect a missing tick and store timely compute-failure withholding", async () => {
    const { sqlite, db } = database("2026-09-13T18:03:30Z");
    seedSchedule(sqlite, { gameId: "watchdog-timely", horizons: ["kickoff_minus_120"] });
    const result = await runInterimSchedulerInvocation({
      db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T18:06:00Z"),
      clock: monotonicClock("2026-09-13T18:06:00Z"),
      tokenFactory: tokenFactory("watchdog"),
      owner: "watchdog:timely"
    });
    expect(result).toMatchObject({
      status: "completed",
      missedTicks: 2,
      timelyWithholdings: 1,
      lateClosures: 0
    });
    expect(sqlite.prepare(`SELECT withholding_reason, timing, prospective_eligible
      FROM engine_origin_records_v2`).get()).toEqual({
      withholding_reason: "compute_failure",
      timing: "timely",
      prospective_eligible: 1
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'scheduler_missed_tick'`).get()).toEqual({ count: 1 });
    expect(sqlite.prepare(`SELECT json_array_length(json_extract(payload_json, '$.missed')) AS count
      FROM engine_system_alerts WHERE alert_type = 'scheduler_missed_tick'`).get())
      .toEqual({ count: 2 });
    sqlite.close();
  });

  it("inspects both normal slots, suppresses healthy heartbeats, and resumes after an extended watchdog outage", async () => {
    const healthy = database("2026-09-13T18:04:30Z");
    await runInterimSchedulerInvocation({
      db: healthy.db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:05:00Z"),
      clock: monotonicClock("2026-09-13T18:05:01Z"),
      tokenFactory: tokenFactory("completed-dispatcher"),
      owner: "dispatcher:completed"
    });
    const live = await claimInterimSchedulerTick({
      db: healthy.db,
      lane: "dispatcher",
      nominalScheduledAt: "2026-09-13T18:06:00.000Z",
      invokedAt: "2026-09-13T18:06:30.000Z",
      tokenFactory: tokenFactory("healthy-dispatcher"),
      owner: "dispatcher:healthy"
    });
    expect(live).not.toBeNull();
    const healthyWatchdog = await runInterimSchedulerInvocation({
      db: healthy.db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T18:07:00Z"),
      clock: monotonicClock("2026-09-13T18:07:00Z"),
      tokenFactory: tokenFactory("healthy-watchdog"),
      owner: "watchdog:healthy"
    });
    expect(healthyWatchdog.missedTicks).toBe(0);
    healthy.sqlite.close();

    const outage = database("2026-09-13T17:58:30Z");
    const first = await runInterimSchedulerInvocation({
      db: outage.db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T18:01:00Z"),
      clock: monotonicClock("2026-09-13T18:01:00Z"),
      tokenFactory: tokenFactory("outage-first"),
      owner: "watchdog:outage-first"
    });
    expect(first.missedTicks).toBe(2);
    const recovered = await runInterimSchedulerInvocation({
      db: outage.db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T18:07:00Z"),
      clock: monotonicClock("2026-09-13T18:07:00Z"),
      tokenFactory: tokenFactory("outage-recovered"),
      owner: "watchdog:outage-recovered"
    });
    expect(recovered.missedTicks).toBe(6);
    expect(outage.sqlite.prepare(`SELECT count(*) AS count FROM engine_scheduler_events_v2
      WHERE event_type = 'missed_tick_detected'`).get()).toEqual({ count: 2 });
    expect(outage.sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'scheduler_missed_tick'`).get()).toEqual({ count: 2 });
    outage.sqlite.close();
  });

  it("bounds a long watchdog recovery and resumes from its append-only checkpoint", async () => {
    const { sqlite, db } = database("2026-09-13T17:58:30Z");
    const first = await runInterimSchedulerInvocation({
      db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T18:01:00Z"),
      clock: monotonicClock("2026-09-13T18:01:00Z"),
      tokenFactory: tokenFactory("bounded-first"),
      owner: "watchdog:bounded-first"
    });
    expect(first.missedTicks).toBe(2);
    const bounded = await runInterimSchedulerInvocation({
      db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T20:01:00Z"),
      clock: monotonicClock("2026-09-13T20:01:00Z"),
      tokenFactory: tokenFactory("bounded-second"),
      owner: "watchdog:bounded-second"
    });
    expect(bounded.missedTicks).toBe(12);
    expect(sqlite.prepare(`SELECT json_extract(payload_json, '$.throughNominalScheduledAt') AS through_at,
      json_extract(payload_json, '$.backlogRemaining') AS backlog
      FROM engine_scheduler_events_v2 WHERE event_type = 'watchdog_recovery_checkpoint'
      ORDER BY occurred_at DESC LIMIT 1`).get()).toEqual({
      through_at: "2026-09-13T18:12:00.000Z",
      backlog: 1
    });
    const resumed = await runInterimSchedulerInvocation({
      db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T20:03:00Z"),
      clock: monotonicClock("2026-09-13T20:03:00Z"),
      tokenFactory: tokenFactory("bounded-third"),
      owner: "watchdog:bounded-third"
    });
    expect(resumed.missedTicks).toBe(12);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_scheduler_events_v2
      WHERE event_type = 'missed_tick_detected'`).get()).toEqual({ count: 3 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'scheduler_watchdog_recovery_backlog'`).get()).toEqual({ count: 2 });
    sqlite.close();
  });

  it("requires an activation cursor and recovers an outage before the first successful watchdog", async () => {
    const missing = database();
    await expect(runInterimSchedulerInvocation({
      db: missing.db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T20:01:00Z"),
      clock: monotonicClock("2026-09-13T20:01:00Z"),
      tokenFactory: tokenFactory("cursor-missing"),
      owner: "watchdog:cursor-missing"
    })).rejects.toThrow(/activation cursor is missing/);
    expect(missing.sqlite.prepare(`SELECT count(*) AS count FROM engine_scheduler_events_v2
      WHERE event_type = 'watchdog_recovery_checkpoint'`).get()).toEqual({ count: 0 });
    missing.sqlite.close();

    const recovered = database("2026-09-13T18:00:30Z");
    const beforeQueries = recovered.queryCounter.queries;
    const result = await runInterimSchedulerInvocation({
      db: recovered.db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T20:01:00Z"),
      clock: monotonicClock("2026-09-13T20:01:00Z"),
      tokenFactory: tokenFactory("cursor-recovery"),
      owner: "watchdog:cursor-recovery"
    });
    expect(result.missedTicks).toBe(12);
    expect(recovered.queryCounter.queries - beforeQueries).toBe(result.d1QueriesUsed);
    expect(result.d1QueriesUsed).toBeLessThanOrEqual(46);
    expect(recovered.sqlite.prepare(`SELECT json_extract(payload_json, '$.throughNominalScheduledAt') AS through_at
      FROM engine_scheduler_events_v2 WHERE event_type = 'watchdog_recovery_checkpoint'`).get())
      .toEqual({ through_at: "2026-09-13T18:12:00.000Z" });
    recovered.sqlite.close();
  });

  it("binds the watchdog cursor to the complete operating, research, and lifecycle identity", async () => {
    const isolated = database("2026-09-13T18:00:30Z");
    seedSchedulerActivation(
      isolated.sqlite,
      "2026-09-13T19:59:30Z",
      stableHash({ contract: "competing-research-constitution" })
    );
    const beforeQueries = isolated.queryCounter.queries;
    const result = await runInterimSchedulerInvocation({
      db: isolated.db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T20:01:00Z"),
      clock: monotonicClock("2026-09-13T20:01:00Z"),
      tokenFactory: tokenFactory("triple-bound-cursor"),
      owner: "watchdog:triple-bound-cursor"
    });
    expect(result.missedTicks).toBe(12);
    expect(isolated.queryCounter.queries - beforeQueries).toBe(result.d1QueriesUsed);
    expect(result.d1QueriesUsed).toBeLessThanOrEqual(46);
    expect(isolated.sqlite.prepare(`SELECT json_extract(payload_json, '$.throughNominalScheduledAt') AS through_at
      FROM engine_scheduler_events_v2 WHERE event_type = 'watchdog_recovery_checkpoint'`).get())
      .toEqual({ through_at: "2026-09-13T18:12:00.000Z" });
    isolated.sqlite.close();
  });

  it("keeps the full simultaneous Week 18 window inside the Free-plan query budget", async () => {
    const { sqlite, db, queryCounter } = database("2027-01-10T15:42:30Z");
    for (let index = 0; index < 16; index += 1) {
      seedSchedule(sqlite, {
        gameId: `week18-window-${index}`,
        horizons: ["kickoff_minus_15"],
        kickoffAt: "2027-01-10T18:00:00Z",
        scheduledAtByHorizon: { kickoff_minus_15: "2027-01-10T17:45:00Z" }
      });
    }
    const beforeQueries = queryCounter.queries;
    const result = await runInterimSchedulerInvocation({
      db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2027-01-10T17:47:00Z"),
      clock: monotonicClock("2027-01-10T17:47:00Z"),
      tokenFactory: tokenFactory("week18-window"),
      owner: "watchdog:week18-window"
    });
    expect(result).toMatchObject({
      dueOrigins: 16,
      timelyWithholdings: 16,
      lateClosures: 0,
      providerDispatches: 0
    });
    expect(result.d1QueriesUsed).toBeLessThanOrEqual(46);
    expect(queryCounter.queries - beforeQueries).toBe(result.d1QueriesUsed);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2
      WHERE timing = 'timely' AND withholding_reason = 'compute_failure'`).get())
      .toEqual({ count: 16 });
    sqlite.close();
  });

  it("renews long ticks and fails closed before a fenced takeover when renewal is lost", async () => {
    const renewed = database();
    const completed = await runInterimSchedulerInvocation({
      db: renewed.db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:05:00Z"),
      clock: sequenceClock([
        "2026-09-13T18:05:01Z",
        "2026-09-13T18:05:02Z",
        "2026-09-13T18:05:40Z"
      ]),
      tokenFactory: tokenFactory("tick-renewal"),
      owner: "dispatcher:renewal"
    });
    expect(completed.status).toBe("completed");
    expect(renewed.sqlite.prepare(`SELECT count(*) AS count FROM engine_scheduler_events_v2
      WHERE event_type = 'tick_renewed'`).get()).toEqual({ count: 1 });
    renewed.sqlite.close();

    const lost = database();
    await expect(runInterimSchedulerInvocation({
      db: lost.db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:05:00Z"),
      clock: sequenceClock([
        "2026-09-13T18:05:01Z",
        "2026-09-13T18:05:02Z",
        "2026-09-13T18:07:00Z",
        "2026-09-13T18:07:01Z"
      ]),
      tokenFactory: tokenFactory("tick-lost"),
      owner: "dispatcher:lost"
    })).rejects.toThrow(/lost its fenced lease during renewal/);
    const recoveredTick = await runInterimSchedulerInvocation({
      db: lost.db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:05:00Z"),
      clock: monotonicClock("2026-09-13T18:07:02Z"),
      tokenFactory: tokenFactory("tick-takeover"),
      owner: "dispatcher:takeover"
    });
    expect(recoveredTick.status).toBe("completed");
    expect(lost.sqlite.prepare(`SELECT state, fence_token FROM engine_scheduler_ticks_v2`).get())
      .toEqual({ state: "completed", fence_token: 2 });
    expect(lost.sqlite.prepare(`SELECT count(*) AS count FROM engine_scheduler_events_v2
      WHERE event_type = 'tick_reclaimed'`).get()).toEqual({ count: 1 });
    lost.sqlite.close();
  });

  it("never backfills an elapsed origin as prospective", async () => {
    const { sqlite, db } = database("2026-09-13T18:13:30Z");
    seedSchedule(sqlite, { gameId: "watchdog-late", horizons: ["kickoff_minus_120"] });
    const result = await runInterimSchedulerInvocation({
      db,
      lane: "watchdog",
      nominalScheduledAt: new Date("2026-09-13T18:16:00Z"),
      clock: monotonicClock("2026-09-13T18:16:00Z"),
      tokenFactory: tokenFactory("late"),
      owner: "watchdog:late"
    });
    expect(result).toMatchObject({ lateClosures: 1, timelyWithholdings: 0 });
    expect(sqlite.prepare(`SELECT withholding_reason, timing, prospective_eligible,
      persisted_at > persistence_deadline_at AS after_deadline
      FROM engine_origin_records_v2`).get()).toEqual({
      withholding_reason: "late_origin_excluded",
      timing: "late",
      prospective_eligible: 0,
      after_deadline: 1
    });
    sqlite.close();
  });

  it("rechecks the deadline before publication and converts a crossing to one fenced late closure", async () => {
    const { sqlite, db, queryCounter } = database();
    seedSchedule(sqlite, { gameId: "deadline-crossing", horizons: ["kickoff_minus_120"] });
    const beforeQueries = queryCounter.queries;
    const result = await runInterimSchedulerInvocation({
      db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:14:59Z"),
      clock: sequenceClock([
        "2026-09-13T18:14:59.000Z",
        "2026-09-13T18:14:59.100Z",
        "2026-09-13T18:14:59.200Z",
        "2026-09-13T18:14:59.300Z",
        "2026-09-13T18:14:59.400Z",
        "2026-09-13T18:14:59.500Z",
        "2026-09-13T18:14:59.600Z",
        "2026-09-13T18:15:00.100Z",
        "2026-09-13T18:15:00.200Z",
        "2026-09-13T18:15:00.300Z",
        "2026-09-13T18:15:00.400Z",
        "2026-09-13T18:15:00.500Z",
        "2026-09-13T18:15:00.600Z"
      ]),
      tokenFactory: tokenFactory("deadline-crossing"),
      owner: "dispatcher:deadline-crossing"
    });
    expect(result).toMatchObject({ timelyWithholdings: 0, lateClosures: 1 });
    expect(queryCounter.queries - beforeQueries).toBe(result.d1QueriesUsed);
    expect(sqlite.prepare(`SELECT timing, prospective_eligible, withholding_reason
      FROM engine_origin_records_v2`).get()).toEqual({
      timing: "late",
      prospective_eligible: 0,
      withholding_reason: "late_origin_excluded"
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_attempts_v2`).get())
      .toEqual({ count: 2 });
    expect(sqlite.prepare(`SELECT json_extract(payload_json, '$.lateOrigins[0].reason') AS reason
      FROM engine_system_alerts WHERE alert_type = 'scheduler_late_origin'`).get())
      .toEqual({ reason: "late_origin_excluded" });
    sqlite.close();
  });

  it("keeps a later-deadline row timely when a peer crosses during the same batch", async () => {
    const { sqlite, db, queryCounter } = database();
    seedSchedule(sqlite, {
      gameId: "mixed-crossing-early",
      horizons: ["kickoff_minus_120"],
      scheduledAtByHorizon: { kickoff_minus_120: "2026-09-13T18:05:00Z" }
    });
    seedSchedule(sqlite, {
      gameId: "mixed-crossing-later",
      horizons: ["kickoff_minus_120"],
      kickoffAt: "2026-09-13T20:10:00Z",
      scheduledAtByHorizon: { kickoff_minus_120: "2026-09-13T18:10:00Z" }
    });
    const beforeQueries = queryCounter.queries;
    const result = await runInterimSchedulerInvocation({
      db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:14:59Z"),
      clock: sequenceClock([
        "2026-09-13T18:14:59.000Z", "2026-09-13T18:14:59.100Z",
        "2026-09-13T18:14:59.200Z", "2026-09-13T18:14:59.300Z",
        "2026-09-13T18:14:59.400Z", "2026-09-13T18:14:59.500Z",
        "2026-09-13T18:14:59.600Z", "2026-09-13T18:15:00.100Z",
        "2026-09-13T18:15:00.200Z", "2026-09-13T18:15:00.300Z",
        "2026-09-13T18:15:00.400Z", "2026-09-13T18:15:00.500Z",
        "2026-09-13T18:15:00.600Z"
      ]),
      tokenFactory: tokenFactory("mixed-crossing"),
      owner: "dispatcher:mixed-crossing"
    });
    expect(result).toMatchObject({ timelyWithholdings: 1, lateClosures: 1 });
    expect(queryCounter.queries - beforeQueries).toBe(result.d1QueriesUsed);
    expect(result.d1QueriesUsed).toBeLessThanOrEqual(46);
    expect(sqlite.prepare(`SELECT origin_version_id, timing, withholding_reason
      FROM engine_origin_records_v2 ORDER BY origin_version_id`).all()).toEqual([
      {
        origin_version_id: "mixed-crossing-early:kickoff_minus_120:v1",
        timing: "late",
        withholding_reason: "late_origin_excluded"
      },
      {
        origin_version_id: "mixed-crossing-later:kickoff_minus_120:v1",
        timing: "timely",
        withholding_reason: "compute_failure"
      }
    ]);
    sqlite.close();
  });

  it("waits for future ineligible revisions and closes earlier-kickoff, late-discovered, and after-kickoff origins honestly", async () => {
    const earlier = database();
    seedSchedule(earlier.sqlite, {
      gameId: "earlier-kickoff",
      horizons: ["kickoff_minus_120"],
      eligible: 0,
      reason: "earlier_origin_prohibited"
    });
    const before = await runInterimSchedulerInvocation({
      db: earlier.db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:04:00Z"),
      clock: monotonicClock("2026-09-13T18:04:59Z"),
      tokenFactory: tokenFactory("earlier-before"),
      owner: "dispatcher:earlier-before"
    });
    expect(before.dueOrigins).toBe(0);
    expect(earlier.sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_jobs_v2`).get())
      .toEqual({ count: 0 });
    const atTrigger = await runInterimSchedulerInvocation({
      db: earlier.db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:05:00Z"),
      clock: monotonicClock("2026-09-13T18:05:01Z"),
      tokenFactory: tokenFactory("earlier-trigger"),
      owner: "dispatcher:earlier-trigger"
    });
    expect(atTrigger).toMatchObject({ lateClosures: 1, timelyWithholdings: 0 });
    expect(earlier.sqlite.prepare(`SELECT withholding_reason, timing, prospective_eligible
      FROM engine_origin_records_v2`).get()).toEqual({
      withholding_reason: "late_origin_excluded",
      timing: "late",
      prospective_eligible: 0
    });
    earlier.sqlite.close();

    const discovered = database();
    seedSchedule(discovered.sqlite, {
      gameId: "late-discovered-runtime",
      horizons: ["kickoff_minus_120"],
      eligible: 0,
      reason: "known_after_origin",
      observedAt: "2026-09-13T18:05:30Z"
    });
    await runInterimSchedulerInvocation({
      db: discovered.db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:05:00Z"),
      clock: monotonicClock("2026-09-13T18:06:01Z"),
      tokenFactory: tokenFactory("late-discovered"),
      owner: "dispatcher:late-discovered"
    });
    expect(discovered.sqlite.prepare(`SELECT withholding_reason, prospective_eligible
      FROM engine_origin_records_v2`).get()).toEqual({
      withholding_reason: "schedule_unavailable_at_origin",
      prospective_eligible: 0
    });
    discovered.sqlite.close();

    const afterKickoff = database();
    seedSchedule(afterKickoff.sqlite, {
      gameId: "after-kickoff-runtime",
      horizons: ["kickoff_minus_120"],
      eligible: 0,
      reason: "after_kickoff",
      kickoffAt: "2026-09-13T18:00:00Z",
      scheduledAtByHorizon: { kickoff_minus_120: "2026-09-13T18:05:00Z" }
    });
    const after = await runInterimSchedulerInvocation({
      db: afterKickoff.db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:05:00Z"),
      clock: monotonicClock("2026-09-13T18:05:01Z"),
      tokenFactory: tokenFactory("after-kickoff"),
      owner: "dispatcher:after-kickoff"
    });
    expect(after.lateClosures).toBe(1);
    expect(afterKickoff.sqlite.prepare(`SELECT withholding_reason, timing, prospective_eligible,
      scheduled_trigger_at > kickoff_at AS trigger_after_kickoff
      FROM engine_origin_records_v2`).get()).toEqual({
      withholding_reason: "late_origin_excluded",
      timing: "late",
      prospective_eligible: 0,
      trigger_after_kickoff: 1
    });
    afterKickoff.sqlite.close();
  });

  it("prioritizes fresh prospective work ahead of a larger late backlog", async () => {
    const { sqlite, db, queryCounter } = database();
    for (let index = 0; index < 33; index += 1) {
      seedSchedule(sqlite, {
        gameId: `late-backlog-${index}`,
        horizons: ["kickoff_minus_120"],
        scheduledAtByHorizon: { kickoff_minus_120: "2026-09-13T17:00:00Z" }
      });
    }
    seedSchedule(sqlite, {
      gameId: "fresh-priority",
      horizons: ["kickoff_minus_15"],
      kickoffAt: "2026-09-13T18:20:00Z",
      scheduledAtByHorizon: { kickoff_minus_15: "2026-09-13T18:05:00Z" }
    });
    const beforeQueries = queryCounter.queries;
    const result = await runInterimSchedulerInvocation({
      db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T18:05:00Z"),
      clock: monotonicClock("2026-09-13T18:05:01Z"),
      tokenFactory: tokenFactory("priority"),
      owner: "dispatcher:priority"
    });
    expect(result.dueOrigins).toBe(32);
    expect(result.d1QueriesUsed).toBeLessThanOrEqual(46);
    expect(queryCounter.queries - beforeQueries).toBe(result.d1QueriesUsed);
    expect(sqlite.prepare(`SELECT record.timing, record.withholding_reason
      FROM engine_origin_records_v2 record
      WHERE record.origin_version_id = 'fresh-priority:kickoff_minus_15:v1'`).get())
      .toEqual({ timing: "timely", withholding_reason: "no_eligible_package" });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'scheduler_origin_backlog'`).get()).toEqual({ count: 1 });
    sqlite.close();
  });

  it("renews only the live lease and fences the expired worker after takeover", async () => {
    const { sqlite, db } = database();
    seedSchedule(sqlite, { gameId: "lease-race", horizons: ["kickoff_minus_120"] });
    const jobKey = insertPendingJob(sqlite, { gameId: "lease-race" });
    const first = await claimInterimSchedulerJob({
      db,
      job: job(sqlite, jobKey),
      prospective: true,
      invokedAt: new Date("2026-09-13T18:05:10Z"),
      tokenFactory: () => "first-attempt",
      owner: "worker:first"
    });
    expect(first).not.toBeNull();
    expect(await renewInterimSchedulerJob({
      db,
      lease: first!,
      renewedAt: new Date("2026-09-13T18:05:40Z"),
      prospective: true
    })).toBe(true);
    expect(await renewInterimSchedulerJob({
      db,
      lease: { ...first!, attemptTokenHash: "f".repeat(64) },
      renewedAt: new Date("2026-09-13T18:06:00Z"),
      prospective: true
    })).toBe(false);
    const second = await claimInterimSchedulerJob({
      db,
      job: job(sqlite, jobKey),
      prospective: true,
      invokedAt: new Date("2026-09-13T18:07:10Z"),
      tokenFactory: () => "second-attempt",
      owner: "worker:second"
    });
    expect(second).toMatchObject({ fence: 2, reclaimed: true });
    await expect(publishInterimSchedulerWithholding({
      db,
      lease: first!,
      reason: "compute_failure",
      prospective: true,
      evidenceAt: new Date("2026-09-13T18:07:11Z"),
      generatedAt: new Date("2026-09-13T18:07:12Z"),
      persistedAt: new Date("2026-09-13T18:07:13Z")
    })).rejects.toThrow(/live fenced lease|constraint/i);
    await expect(publishInterimSchedulerWithholding({
      db,
      lease: second!,
      reason: "compute_failure",
      prospective: true,
      evidenceAt: new Date("2026-09-13T18:07:11Z"),
      generatedAt: new Date("2026-09-13T18:07:12Z"),
      persistedAt: new Date("2026-09-13T18:07:13Z")
    })).resolves.toMatchObject({ duplicate: false });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_attempts_v2`).get())
      .toEqual({ count: 2 });
    expect(sqlite.prepare(`SELECT fence_token FROM engine_origin_records_v2`).get())
      .toEqual({ fence_token: 2 });
    sqlite.close();
  });

  it("records all-unresolved schedules without fabricating jobs, times, or activation", async () => {
    const { sqlite, db } = database();
    seedSchedule(sqlite, {
      gameId: "all-unresolved",
      horizons: [
        "weekly_tuesday_0730", "kickoff_minus_120", "kickoff_minus_90",
        "kickoff_minus_60", "kickoff_minus_15"
      ],
      scheduleStatus: "kickoff_unresolved"
    });
    const result = await runInterimSchedulerInvocation({
      db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-08T14:31:00Z"),
      clock: monotonicClock("2026-09-08T14:31:00Z"),
      tokenFactory: tokenFactory("unresolved"),
      owner: "watchdog:unresolved"
    });
    expect(result).toMatchObject({ unresolvedOrigins: 5, dueOrigins: 0, providerDispatches: 0 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_jobs_v2`).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2`).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_activations`).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_scheduler_events_v2
      WHERE event_type = 'schedule_unresolved_observed'`).get()).toEqual({ count: 1 });
    expect(sqlite.prepare(`SELECT json_extract(payload_json, '$.originCount') AS count
      FROM engine_scheduler_events_v2 WHERE event_type = 'schedule_unresolved_observed'`).get())
      .toEqual({ count: 5 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'scheduler_all_schedules_unresolved'`).get()).toEqual({ count: 1 });
    sqlite.close();
  });

  it("invalidates a superseded live job and denies its stale publisher", async () => {
    const { sqlite, db } = database();
    seedSchedule(sqlite, { gameId: "rescheduled", horizons: ["kickoff_minus_120"] });
    const oldJobKey = insertPendingJob(sqlite, { gameId: "rescheduled" });
    const stale = await claimInterimSchedulerJob({
      db,
      job: job(sqlite, oldJobKey),
      prospective: true,
      invokedAt: new Date("2026-09-13T18:05:10Z"),
      tokenFactory: () => "reschedule-stale",
      owner: "worker:stale"
    });
    sqlite.prepare(`INSERT INTO game_schedule_revisions (
      revision_id, game_id, week, schedule_status, kickoff_utc, local_time_zone,
      observed_at, source_evidence_hash, source_row_hash, supersedes_revision_id
    ) VALUES ('rescheduled:revision:2', 'rescheduled', 1, 'scheduled',
      '2026-09-13T21:05:00Z', 'America/Los_Angeles', '2026-09-13T18:06:00Z',
      ?, ?, 'rescheduled:revision:1')`).run("a".repeat(64), "b".repeat(64));
    sqlite.prepare(`INSERT INTO forecast_origin_versions (
      origin_version_id, logical_origin_id, game_id, horizon_id, scheduled_for_utc,
      scheduled_for_local, kickoff_revision_id, scientific_eligibility, information_cutoff,
      eligible, eligibility_reason, activation_boundary, supersedes_origin_version_id, created_at
    ) VALUES ('rescheduled:kickoff_minus_120:v2', 'rescheduled:kickoff_minus_120',
      'rescheduled', 'kickoff_minus_120', '2026-09-13T19:05:00Z',
      '2026-09-13T12:05:00[America/Los_Angeles]', 'rescheduled:revision:2', 0,
      'forecast_time', 1, 'eligible', 'os15a-runtime-test',
      'rescheduled:kickoff_minus_120:v1', '2026-09-13T18:06:00Z')`).run();
    const result = await runInterimSchedulerInvocation({
      db,
      lane: "dispatcher",
      nominalScheduledAt: new Date("2026-09-13T19:05:00Z"),
      clock: monotonicClock("2026-09-13T19:05:01Z"),
      tokenFactory: tokenFactory("rescheduled"),
      owner: "worker:new-head"
    });
    expect(result).toMatchObject({ invalidatedJobs: 1, timelyWithholdings: 1 });
    expect(job(sqlite, oldJobKey).state).toBe("invalidated");
    await expect(publishInterimSchedulerWithholding({
      db,
      lease: stale!,
      reason: "compute_failure",
      prospective: true,
      evidenceAt: new Date("2026-09-13T18:06:01Z"),
      generatedAt: new Date("2026-09-13T18:06:02Z"),
      persistedAt: new Date("2026-09-13T18:06:03Z")
    })).rejects.toThrow();
    sqlite.close();
  });

  it("rolls back the record and automatic job finalization if its audit event fails", async () => {
    const { sqlite, db } = database();
    seedSchedule(sqlite, { gameId: "batch-rollback", horizons: ["kickoff_minus_120"] });
    const jobKey = insertPendingJob(sqlite, { gameId: "batch-rollback" });
    const lease = await claimInterimSchedulerJob({
      db,
      job: job(sqlite, jobKey),
      prospective: true,
      invokedAt: new Date("2026-09-13T18:05:10Z"),
      tokenFactory: () => "rollback-attempt",
      owner: "worker:rollback"
    });
    sqlite.exec(`CREATE TRIGGER fail_job_completed_event
      BEFORE INSERT ON engine_scheduler_events_v2
      WHEN NEW.event_type = 'job_completed'
      BEGIN SELECT RAISE(ABORT, 'synthetic event failure'); END;`);
    await expect(publishInterimSchedulerWithholding({
      db,
      lease: lease!,
      reason: "no_eligible_package",
      prospective: true,
      evidenceAt: new Date("2026-09-13T18:05:11Z"),
      generatedAt: new Date("2026-09-13T18:05:12Z"),
      persistedAt: new Date("2026-09-13T18:05:13Z")
    })).rejects.toThrow(/synthetic event failure/);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2`).get()).toEqual({ count: 0 });
    expect(job(sqlite, jobKey).state).toBe("running");
    sqlite.close();
  });

  it("uses the database statement clock so a delayed write cannot fabricate timeliness", async () => {
    const { sqlite, db } = database();
    const now = Date.now();
    const scheduledAt = new Date(now - 700_000).toISOString();
    const deadlineAt = new Date(now - 100_000).toISOString();
    const dynamicKickoff = new Date(now + 300_000).toISOString();
    seedSchedule(sqlite, {
      gameId: "database-clock-delay",
      horizons: ["kickoff_minus_120"],
      kickoffAt: dynamicKickoff,
      scheduledAtByHorizon: { kickoff_minus_120: scheduledAt }
    });
    const jobKey = insertPendingJob(sqlite, {
      gameId: "database-clock-delay",
      scheduledAt,
      deadlineAt,
      kickoff: dynamicKickoff
    });
    const lease = await claimInterimSchedulerJob({
      db,
      job: job(sqlite, jobKey),
      prospective: true,
      invokedAt: new Date(now - 110_000),
      tokenFactory: () => "database-clock-delay-attempt",
      owner: "worker:database-clock-delay"
    });
    expect(lease).not.toBeNull();
    await expect(publishInterimSchedulerWithholding({
      db,
      lease: lease!,
      reason: "no_eligible_package",
      prospective: true,
      evidenceAt: new Date(now - 108_000),
      generatedAt: new Date(now - 105_000),
      persistedAt: new Date(now - 101_000)
    })).rejects.toThrow(/constraint|live fenced lease/i);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2`).get())
      .toEqual({ count: 0 });
    sqlite.close();
  });

  it.each([
    "no_eligible_package",
    "required_source_stale",
    "required_source_partial",
    "required_source_unavailable",
    "schema_invalid",
    "provenance_incomplete",
    "package_hash_mismatch",
    "compute_failure"
  ] satisfies ForecastWithholdingReason[])("stores approved timely failure reason %s", async (reason) => {
    const { sqlite, db } = database();
    const gameId = `reason-${reason}`;
    seedSchedule(sqlite, { gameId, horizons: ["kickoff_minus_120"] });
    const jobKey = insertPendingJob(sqlite, { gameId });
    const lease = await claimInterimSchedulerJob({
      db,
      job: job(sqlite, jobKey),
      prospective: true,
      invokedAt: new Date("2026-09-13T18:05:10Z"),
      tokenFactory: () => `attempt-${reason}`,
      owner: `worker:${reason}`
    });
    await publishInterimSchedulerWithholding({
      db,
      lease: lease!,
      reason,
      prospective: true,
      evidenceAt: new Date("2026-09-13T18:05:11Z"),
      generatedAt: new Date("2026-09-13T18:05:12Z"),
      persistedAt: new Date("2026-09-13T18:05:13Z")
    });
    expect(sqlite.prepare(`SELECT withholding_reason FROM engine_origin_records_v2`).get())
      .toEqual({ withholding_reason: reason });
    sqlite.close();
  });
});
