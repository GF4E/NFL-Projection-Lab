import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/domain/hash";

function applySql(db: DatabaseSync, filename: string): void {
  db.exec(readFileSync(resolve(process.cwd(), filename), "utf8").replaceAll("--> statement-breakpoint", ""));
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applySql(db, "drizzle/0013_engine_os_urgent.sql");
  applySql(db, "drizzle/0015_engine_os_origin_identity.sql");
  applySql(db, "drizzle/0016_engine_os_interim_scheduler.sql");
  return db;
}

const contractHash = "c".repeat(64);

function seedOrigin(db: DatabaseSync, input: {
  gameId?: string;
  revisionId?: string;
  originVersionId?: string;
  logicalOriginId?: string;
  scheduledAt?: string | null;
  observedAt?: string;
  kickoffAt?: string | null;
  status?: "scheduled" | "kickoff_unresolved";
  eligible?: 0 | 1;
  reason?: "eligible" | "schedule_unresolved" | "known_after_origin";
} = {}): void {
  const gameId = input.gameId ?? "2026_01_NE_SEA";
  const revisionId = input.revisionId ?? `${gameId}:revision:1`;
  const originVersionId = input.originVersionId ?? `${gameId}:kickoff_minus_120:v1`;
  const logicalOriginId = input.logicalOriginId ?? `${gameId}:kickoff_minus_120`;
  const scheduledAt = input.scheduledAt === undefined ? "2026-09-13T18:05:00Z" : input.scheduledAt;
  const observedAt = input.observedAt ?? "2026-08-25T00:00:00Z";
  const kickoffAt = input.kickoffAt === undefined ? "2026-09-13T20:05:00Z" : input.kickoffAt;
  const status = input.status ?? "scheduled";
  const eligible = input.eligible ?? 1;
  const reason = input.reason ?? "eligible";
  db.prepare(`INSERT INTO canonical_games (
    game_id, season, season_type, week, home_team, away_team, identity_status, created_at
  ) VALUES (?, 2026, 'REG', 1, 'SEA', 'NE', 'resolved', ?)`)
    .run(gameId, observedAt);
  db.prepare(`INSERT INTO game_schedule_revisions (
    revision_id, game_id, week, schedule_status, kickoff_utc, local_time_zone,
    observed_at, source_evidence_hash, source_row_hash
  ) VALUES (?, ?, 1, ?, ?, 'America/Los_Angeles', ?, ?, ?)`)
    .run(revisionId, gameId, status, kickoffAt, observedAt, "e".repeat(64), "r".repeat(64));
  db.prepare(`INSERT INTO forecast_origin_versions (
    origin_version_id, logical_origin_id, game_id, horizon_id, scheduled_for_utc,
    scheduled_for_local, kickoff_revision_id, scientific_eligibility, information_cutoff,
    eligible, eligibility_reason, activation_boundary, created_at
  ) VALUES (?, ?, ?, 'kickoff_minus_120', ?, ?, ?, 0, 'forecast_time', ?, ?, 'os15a-test', ?)`)
    .run(
      originVersionId,
      logicalOriginId,
      gameId,
      scheduledAt,
      scheduledAt === null ? null : "2026-09-13T11:05:00[America/Los_Angeles]",
      revisionId,
      eligible,
      reason,
      observedAt
    );
}

function insertJob(db: DatabaseSync, input: {
  jobKey?: string;
  originVersionId?: string;
  scheduledAt?: string;
  kickoffAt?: string;
  deadlineAt?: string;
  createdAt?: string;
} = {}): void {
  db.prepare(`INSERT INTO engine_origin_jobs_v2 (
    job_key, scheduler_contract_version, scheduler_contract_hash, job_key_version, job_type,
    origin_version_id, scheduled_trigger_at, kickoff_at, persistence_deadline_at,
    activation_boundary, state, created_at
  ) VALUES (?, 'interim-scheduler-contract.2026.5', ?, 'engine-os.scheduler-job.v2',
    'forecast_or_withholding', ?, ?, ?, ?, 'os15a-test', 'pending', ?)`)
    .run(
      input.jobKey ?? "job:base",
      contractHash,
      input.originVersionId ?? "2026_01_NE_SEA:kickoff_minus_120:v1",
      input.scheduledAt ?? "2026-09-13T18:05:00Z",
      input.kickoffAt ?? "2026-09-13T20:05:00Z",
      input.deadlineAt ?? "2026-09-13T18:15:00Z",
      input.createdAt ?? "2026-09-13T18:04:59Z"
    );
}

function acquire(db: DatabaseSync, input: {
  jobKey?: string;
  token: string;
  acquiredAt: string;
  expiresAt: string;
  owner?: string;
}): void {
  db.prepare(`UPDATE engine_origin_jobs_v2 SET
    state = 'running', fence_token = fence_token + 1, active_attempt_token_hash = ?,
    lease_owner = ?, lease_acquired_at = ?, lease_expires_at = ?, heartbeat_at = ?
    WHERE job_key = ?`)
    .run(input.token, input.owner ?? "worker", input.acquiredAt, input.expiresAt, input.acquiredAt,
      input.jobKey ?? "job:base");
}

function insertRecord(db: DatabaseSync, input: {
  recordId: string;
  recordHash?: string;
  jobKey?: string;
  originVersionId?: string;
  token: string;
  fence: number;
  invokedAt: string;
  evidenceAt: string;
  generatedAt: string;
  persistedAt: string;
  reason?: string;
  timing?: "timely" | "late";
  prospective?: 0 | 1;
  deadlineAt?: string;
}): void {
  db.prepare(`INSERT INTO engine_origin_records_v2 (
    record_id, decision_hash, job_key, origin_version_id, scheduler_contract_version,
    scheduler_contract_hash, status, withholding_reason, scheduled_trigger_at, invoked_at,
    evidence_at, generated_at, persistence_requested_at, persisted_at,
    persistence_deadline_at, kickoff_at, timing,
    prospective_eligible, capture_health, activation_boundary, attempt_token_hash,
    fence_token, qualification_only, payload_json
  ) VALUES (?, ?, ?, ?, 'interim-scheduler-contract.2026.5', ?, 'withheld', ?,
    '2026-09-13T18:05:00Z', ?, ?, ?, ?, ?, ?, '2026-09-13T20:05:00Z', ?, ?,
    'unavailable', 'os15a-test', ?, ?, 1, '{}')`)
    .run(
      input.recordId,
      input.recordHash ?? sha256Hex(input.recordId),
      input.jobKey ?? "job:base",
      input.originVersionId ?? "2026_01_NE_SEA:kickoff_minus_120:v1",
      contractHash,
      input.reason ?? "no_eligible_package",
      input.invokedAt,
      input.evidenceAt,
      input.generatedAt,
      input.persistedAt,
      input.persistedAt,
      input.deadlineAt ?? "2026-09-13T18:15:00Z",
      input.timing ?? "timely",
      input.prospective ?? 1,
      input.token,
      input.fence
    );
}

describe("OS-15A additive scheduler migration", () => {
  it("rejects fabricated tick/job states, identity mutation, expired completion, and deletion", () => {
    const db = database();
    const tickToken = "1".repeat(64);
    expect(() => db.prepare(`INSERT INTO engine_scheduler_ticks_v2 (
      tick_key, scheduler_contract_version, scheduler_contract_hash, tick_key_version,
      lane, nominal_scheduled_at, invoked_at, evidence_at, persisted_at, state,
      fence_token, heartbeat_at, completed_at
    ) VALUES ('fabricated', 'interim-scheduler-contract.2026.5', ?,
      'engine-os.scheduler-tick.v1', 'dispatcher', '2026-09-13T18:05:00Z',
      '2026-09-13T18:05:01Z', '2026-09-13T18:05:01Z', '2026-09-13T18:05:01Z',
      'completed', 1, '2026-09-13T18:05:01Z', '2026-09-13T18:05:01Z')`)
      .run(contractHash)).toThrow(/begin as one live fenced attempt/);

    db.prepare(`INSERT INTO engine_scheduler_ticks_v2 (
      tick_key, scheduler_contract_version, scheduler_contract_hash, tick_key_version,
      lane, nominal_scheduled_at, invoked_at, evidence_at, persisted_at, state,
      attempt_token_hash, fence_token, lease_owner, lease_acquired_at, lease_expires_at,
      heartbeat_at
    ) VALUES ('tick:valid', 'interim-scheduler-contract.2026.5', ?,
      'engine-os.scheduler-tick.v1', 'dispatcher', '2026-09-13T18:05:00Z',
      '2026-09-13T18:05:01Z', '2026-09-13T18:05:01Z', '2026-09-13T18:05:01Z',
      'running', ?, 1, 'worker', '2026-09-13T18:05:01Z',
      '2026-09-13T18:06:31Z', '2026-09-13T18:05:01Z')`)
      .run(contractHash, tickToken);
    expect(() => db.exec(`UPDATE engine_scheduler_ticks_v2
      SET invoked_at = '2026-09-13T18:05:02Z' WHERE tick_key = 'tick:valid'`))
      .toThrow(/fencing contract/);
    expect(() => db.exec(`UPDATE engine_scheduler_ticks_v2 SET
      state = 'completed', attempt_token_hash = NULL, lease_owner = NULL,
      lease_acquired_at = NULL, lease_expires_at = NULL,
      completed_at = '2026-09-13T18:06:31Z'
      WHERE tick_key = 'tick:valid'`)).toThrow(/fencing contract/);
    expect(() => db.exec(`DELETE FROM engine_scheduler_ticks_v2 WHERE tick_key = 'tick:valid'`))
      .toThrow(/cannot be deleted/);

    seedOrigin(db);
    expect(() => db.prepare(`INSERT INTO engine_origin_jobs_v2 (
      job_key, scheduler_contract_version, scheduler_contract_hash, job_key_version,
      job_type, origin_version_id, scheduled_trigger_at, kickoff_at,
      persistence_deadline_at, activation_boundary, state, fence_token,
      active_attempt_token_hash, lease_owner, lease_acquired_at, lease_expires_at,
      heartbeat_at, created_at
    ) VALUES ('job:fabricated', 'interim-scheduler-contract.2026.5', ?,
      'engine-os.scheduler-job.v2', 'forecast_or_withholding',
      '2026_01_NE_SEA:kickoff_minus_120:v1', '2026-09-13T18:05:00Z',
      '2026-09-13T20:05:00Z', '2026-09-13T18:15:00Z', 'os15a-test',
      'running', 1, ?, 'worker', '2026-09-13T18:05:01Z',
      '2026-09-13T18:06:31Z', '2026-09-13T18:05:01Z', '2026-09-13T18:05:00Z')`)
      .run(contractHash, tickToken)).toThrow(/current timed origin/);
    insertJob(db);
    expect(() => db.exec(`DELETE FROM engine_origin_jobs_v2 WHERE job_key = 'job:base'`))
      .toThrow(/cannot be deleted/);
    db.close();
  });

  it("fences a stale attempt and atomically finalizes one terminal record", () => {
    const db = database();
    seedOrigin(db);
    insertJob(db);
    const staleToken = "a".repeat(64);
    const liveToken = "b".repeat(64);
    acquire(db, {
      token: staleToken,
      acquiredAt: "2026-09-13T18:05:10Z",
      expiresAt: "2026-09-13T18:06:40Z"
    });
    acquire(db, {
      token: liveToken,
      acquiredAt: "2026-09-13T18:06:41Z",
      expiresAt: "2026-09-13T18:08:11Z",
      owner: "recovery-worker"
    });
    expect(db.prepare(`SELECT count(*) AS count FROM engine_origin_attempts_v2`).get())
      .toEqual({ count: 2 });
    expect(() => insertRecord(db, {
      recordId: "pre-trigger-record",
      token: liveToken,
      fence: 2,
      invokedAt: "2026-09-13T18:04:59Z",
      evidenceAt: "2026-09-13T18:06:45Z",
      generatedAt: "2026-09-13T18:06:50Z",
      persistedAt: "2026-09-13T18:07:00Z"
    })).toThrow();
    expect(() => insertRecord(db, {
      recordId: "stale-record",
      token: staleToken,
      fence: 1,
      invokedAt: "2026-09-13T18:05:10Z",
      evidenceAt: "2026-09-13T18:06:45Z",
      generatedAt: "2026-09-13T18:06:50Z",
      persistedAt: "2026-09-13T18:07:00Z"
    })).toThrow(/live fenced lease/);
    insertRecord(db, {
      recordId: "live-record",
      token: liveToken,
      fence: 2,
      invokedAt: "2026-09-13T18:06:41Z",
      evidenceAt: "2026-09-13T18:06:45Z",
      generatedAt: "2026-09-13T18:06:50Z",
      persistedAt: "2026-09-13T18:07:00Z"
    });
    expect(db.prepare(`SELECT state, fence_token, active_attempt_token_hash, completed_at
      FROM engine_origin_jobs_v2 WHERE job_key = 'job:base'`).get()).toEqual({
      state: "completed",
      fence_token: 2,
      active_attempt_token_hash: null,
      completed_at: "2026-09-13T18:07:00Z"
    });
    expect(() => db.exec(`UPDATE engine_origin_records_v2 SET capture_health = 'current'`))
      .toThrow(/append-only/);
    db.close();
  });

  it("allows an ineligible current head to close nonprospectively without waiting for the cap", () => {
    const db = database();
    seedOrigin(db, {
      gameId: "late-discovered",
      revisionId: "late-discovered:revision:1",
      originVersionId: "late-discovered:kickoff_minus_120:v1",
      logicalOriginId: "late-discovered:kickoff_minus_120",
      observedAt: "2026-09-13T18:06:00Z",
      eligible: 0,
      reason: "known_after_origin"
    });
    insertJob(db, {
      jobKey: "job:late-discovered",
      originVersionId: "late-discovered:kickoff_minus_120:v1",
      createdAt: "2026-09-13T18:06:01Z"
    });
    const token = "d".repeat(64);
    acquire(db, {
      jobKey: "job:late-discovered",
      token,
      acquiredAt: "2026-09-13T18:06:10Z",
      expiresAt: "2026-09-13T18:07:40Z"
    });
    insertRecord(db, {
      recordId: "schedule-unavailable-record",
      jobKey: "job:late-discovered",
      originVersionId: "late-discovered:kickoff_minus_120:v1",
      token,
      fence: 1,
      invokedAt: "2026-09-13T18:06:10Z",
      evidenceAt: "2026-09-13T18:06:20Z",
      generatedAt: "2026-09-13T18:06:25Z",
      persistedAt: "2026-09-13T18:06:30Z",
      reason: "schedule_unavailable_at_origin",
      timing: "late",
      prospective: 0
    });
    expect(db.prepare(`SELECT timing, prospective_eligible, withholding_reason
      FROM engine_origin_records_v2`).get()).toEqual({
      timing: "late",
      prospective_eligible: 0,
      withholding_reason: "schedule_unavailable_at_origin"
    });
    db.close();
  });

  it("rejects timely equality and permits only eligible nonprospective closure at the exact deadline", () => {
    const db = database();
    seedOrigin(db);
    insertJob(db);
    const token = "5".repeat(64);
    acquire(db, {
      token,
      acquiredAt: "2026-09-13T18:15:00Z",
      expiresAt: "2026-09-13T18:16:30Z"
    });
    expect(() => insertRecord(db, {
      recordId: "exact-deadline-timely-record",
      token,
      fence: 1,
      invokedAt: "2026-09-13T18:15:00Z",
      evidenceAt: "2026-09-13T18:15:00Z",
      generatedAt: "2026-09-13T18:15:00Z",
      persistedAt: "2026-09-13T18:15:00Z",
      reason: "no_eligible_package",
      timing: "timely",
      prospective: 1
    })).toThrow(/CHECK constraint|live fenced lease/);
    insertRecord(db, {
      recordId: "exact-deadline-record",
      token,
      fence: 1,
      invokedAt: "2026-09-13T18:15:00Z",
      evidenceAt: "2026-09-13T18:15:00Z",
      generatedAt: "2026-09-13T18:15:00Z",
      persistedAt: "2026-09-13T18:15:00Z",
      reason: "late_origin_excluded",
      timing: "late",
      prospective: 0
    });
    expect(db.prepare(`SELECT timing, prospective_eligible, persisted_at, persistence_deadline_at
      FROM engine_origin_records_v2`).get()).toEqual({
      timing: "late",
      prospective_eligible: 0,
      persisted_at: "2026-09-13T18:15:00Z",
      persistence_deadline_at: "2026-09-13T18:15:00Z"
    });
    db.close();
  });

  it("rejects unresolved jobs, superseded-head publication, unfenced updates, and forecasts", () => {
    const db = database();
    seedOrigin(db, {
      gameId: "unresolved",
      revisionId: "unresolved:revision:1",
      originVersionId: "unresolved:kickoff_minus_120:v1",
      logicalOriginId: "unresolved:kickoff_minus_120",
      scheduledAt: null,
      kickoffAt: null,
      status: "kickoff_unresolved",
      eligible: 0,
      reason: "schedule_unresolved"
    });
    expect(() => insertJob(db, {
      jobKey: "job:unresolved",
      originVersionId: "unresolved:kickoff_minus_120:v1"
    })).toThrow(/current timed origin/);

    seedOrigin(db);
    insertJob(db);
    const token = "f".repeat(64);
    acquire(db, {
      token,
      acquiredAt: "2026-09-13T18:05:10Z",
      expiresAt: "2026-09-13T18:06:40Z"
    });
    expect(() => db.exec(`UPDATE engine_origin_jobs_v2 SET fence_token = 0 WHERE job_key = 'job:base'`))
      .toThrow(/fencing contract|CHECK constraint/);
    db.prepare(`INSERT INTO forecast_origin_versions (
      origin_version_id, logical_origin_id, game_id, horizon_id, scheduled_for_utc,
      scheduled_for_local, kickoff_revision_id, scientific_eligibility, information_cutoff,
      eligible, eligibility_reason, activation_boundary, supersedes_origin_version_id, created_at
    ) VALUES (
      '2026_01_NE_SEA:kickoff_minus_120:v2', '2026_01_NE_SEA:kickoff_minus_120',
      '2026_01_NE_SEA', 'kickoff_minus_120', '2026-09-13T18:05:00Z',
      '2026-09-13T11:05:00[America/Los_Angeles]', '2026_01_NE_SEA:revision:1',
      0, 'forecast_time', 1, 'eligible', 'os15a-test',
      '2026_01_NE_SEA:kickoff_minus_120:v1', '2026-09-13T18:05:01Z'
    )`).run();
    expect(() => insertRecord(db, {
      recordId: "superseded-record",
      token,
      fence: 1,
      invokedAt: "2026-09-13T18:05:10Z",
      evidenceAt: "2026-09-13T18:05:20Z",
      generatedAt: "2026-09-13T18:05:25Z",
      persistedAt: "2026-09-13T18:05:30Z"
    })).toThrow(/current head/);
    expect(() => db.prepare(`INSERT INTO engine_origin_records_v2 (
      record_id, decision_hash, job_key, origin_version_id, scheduler_contract_version,
      scheduler_contract_hash, status, withholding_reason, scheduled_trigger_at, invoked_at,
      evidence_at, generated_at, persistence_requested_at, persisted_at,
      persistence_deadline_at, kickoff_at, timing,
      prospective_eligible, capture_health, activation_boundary, attempt_token_hash,
      fence_token, qualification_only, payload_json
    ) VALUES ('forecast', ?, 'job:base', '2026_01_NE_SEA:kickoff_minus_120:v1',
      'interim-scheduler-contract.2026.5', ?, 'forecast', 'no_eligible_package',
      '2026-09-13T18:05:00Z', '2026-09-13T18:05:10Z', '2026-09-13T18:05:20Z',
      '2026-09-13T18:05:25Z', '2026-09-13T18:05:30Z', '2026-09-13T18:05:30Z',
      '2026-09-13T18:15:00Z',
      '2026-09-13T20:05:00Z', 'timely', 1, 'unavailable', 'os15a-test', ?, 1, 1, '{}')`)
      .run("9".repeat(64), contractHash, token)).toThrow();
    db.close();
  });

  it("rejects malformed clocks and premature late closure of an eligible origin", () => {
    const db = database();
    expect(() => db.prepare(`INSERT INTO engine_scheduler_ticks_v2 (
      tick_key, scheduler_contract_version, scheduler_contract_hash, tick_key_version,
      lane, nominal_scheduled_at, invoked_at, evidence_at, persisted_at, state,
      attempt_token_hash, fence_token, lease_owner, lease_acquired_at, lease_expires_at,
      heartbeat_at
    ) VALUES ('tick:malformed', 'interim-scheduler-contract.2026.5', ?,
      'engine-os.scheduler-tick.v1', 'dispatcher', 'not-a-time',
      '2026-09-13T18:05:01Z', '2026-09-13T18:05:01Z', '2026-09-13T18:05:01Z',
      'running', ?, 1, 'worker', '2026-09-13T18:05:01Z',
      '2026-09-13T18:06:31Z', '2026-09-13T18:05:01Z')`)
      .run(contractHash, "8".repeat(64))).toThrow(/CHECK constraint/);

    seedOrigin(db);
    insertJob(db);
    const token = "7".repeat(64);
    acquire(db, {
      token,
      acquiredAt: "2026-09-13T18:05:10Z",
      expiresAt: "2026-09-13T18:06:40Z"
    });
    expect(() => insertRecord(db, {
      recordId: "premature-late-record",
      token,
      fence: 1,
      invokedAt: "2026-09-13T18:05:10Z",
      evidenceAt: "2026-09-13T18:05:20Z",
      generatedAt: "2026-09-13T18:05:25Z",
      persistedAt: "2026-09-13T18:05:30Z",
      reason: "late_origin_excluded",
      timing: "late",
      prospective: 0
    })).toThrow(/current head|live fenced lease/);
    expect(db.prepare(`SELECT count(*) AS count FROM engine_origin_records_v2`).get())
      .toEqual({ count: 0 });
    db.close();
  });

  it("registers the exact migration definition and rolls back only v2 tables", () => {
    const db = database();
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0016_engine_os_interim_scheduler.sql"), "utf8");
    const rollback = readFileSync(resolve(
      process.cwd(), "drizzle/rollback/0016_engine_os_interim_scheduler.down.sql"
    ), "utf8");
    expect(rollback).not.toMatch(/^\s*(?:BEGIN(?:\s+TRANSACTION|\s+IMMEDIATE)?|COMMIT);\s*$/im);
    expect(rollback).not.toMatch(/\b(?:TEMP|TEMPORARY)\b/i);
    expect(rollback).toContain("CREATE TABLE IF NOT EXISTS `_os15a_rollback_guard`");
    expect(rollback).toContain("OS-15A rollback requires every interim scheduler table to be empty");
    const definition = migration.split("INSERT INTO `engine_schema_versions`")[0]!;
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0016_engine_os_interim_scheduler'`).get())
      .toEqual({ migration_hash: `sha256:${sha256Hex(definition)}` });
    applySql(db, "drizzle/rollback/0016_engine_os_interim_scheduler.down.sql");
    expect(db.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'engine_origin_jobs_v2'`).get()).toBeUndefined();
    expect(db.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'forecast_origin_versions'`).get())
      .toEqual({ name: "forecast_origin_versions" });
    expect(db.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'forecast_origins'`).get())
      .toEqual({ name: "forecast_origins" });
    db.close();
  });

  it("refuses rollback after any scheduler evidence exists", () => {
    const db = database();
    const token = "6".repeat(64);
    db.prepare(`INSERT INTO engine_scheduler_ticks_v2 (
      tick_key, scheduler_contract_version, scheduler_contract_hash, tick_key_version,
      lane, nominal_scheduled_at, invoked_at, evidence_at, persisted_at, state,
      attempt_token_hash, fence_token, lease_owner, lease_acquired_at, lease_expires_at,
      heartbeat_at
    ) VALUES ('tick:retained', 'interim-scheduler-contract.2026.5', ?,
      'engine-os.scheduler-tick.v1', 'dispatcher', '2026-09-13T18:05:00Z',
      '2026-09-13T18:05:01Z', '2026-09-13T18:05:01Z', '2026-09-13T18:05:01Z',
      'running', ?, 1, 'worker', '2026-09-13T18:05:01Z',
      '2026-09-13T18:06:31Z', '2026-09-13T18:05:01Z')`)
      .run(contractHash, token);
    expect(() => applySql(db, "drizzle/rollback/0016_engine_os_interim_scheduler.down.sql"))
      .toThrow(/requires every interim scheduler table to be empty/);
    expect(db.prepare(`SELECT tick_key FROM engine_scheduler_ticks_v2`).get())
      .toEqual({ tick_key: "tick:retained" });
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0016_engine_os_interim_scheduler'`).get()).toBeDefined();
    db.close();
  });
});
