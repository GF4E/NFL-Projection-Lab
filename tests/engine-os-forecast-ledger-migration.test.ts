import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  forecastLedgerActivationsV1,
  forecastLedgerAttemptsV1,
  forecastLedgerEventsV1,
  forecastLedgerJobsV1,
  forecastLedgerQualificationsV1,
  forecastLedgerRecordsV1
} from "../db/engine-os-schema";
import { sha256Hex } from "@/domain/hash";

const databaseClocks = new WeakMap<DatabaseSync, { now: string }>();

function applySql(db: DatabaseSync, filename: string): void {
  let sqlText = readFileSync(resolve(process.cwd(), filename), "utf8")
    .replaceAll("--> statement-breakpoint", "");
  if (filename.endsWith("0018_engine_os_forecast_ledger.sql")) {
    sqlText = sqlText
      .replaceAll(
        "julianday('now' /* os13a-authoritative-clock */)",
        "julianday(os13a_test_now())"
      )
      .replaceAll("julianday('now')", "julianday(os13a_test_now())");
  }
  db.exec(sqlText);
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const clock = { now: new Date(clockAnchorMs).toISOString() };
  databaseClocks.set(db, clock);
  db.function("os13a_test_now", () => clock.now);
  for (const migration of [
    "drizzle/0013_engine_os_urgent.sql",
    "drizzle/0015_engine_os_origin_identity.sql",
    "drizzle/0016_engine_os_interim_scheduler.sql",
    "drizzle/0017_engine_os_source_capture.sql",
    "drizzle/0018_engine_os_forecast_ledger.sql"
  ]) applySql(db, migration);
  return db;
}

function setDatabaseClock(db: DatabaseSync, value: string): void {
  const clock = databaseClocks.get(db);
  if (!clock) throw new Error("OS-13A test database clock is unavailable");
  clock.now = new Date(Date.parse(value)).toISOString();
}

function namedCheckExpressions(definition: string): Map<string, string> {
  const checks = new Map<string, string>();
  const marker = /CONSTRAINT\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+CHECK\s*\(/g;
  for (let match = marker.exec(definition); match; match = marker.exec(definition)) {
    let depth = 1;
    let index = marker.lastIndex;
    let quote: "'" | '"' | "`" | null = null;
    for (; index < definition.length && depth > 0; index += 1) {
      const character = definition[index]!;
      if (quote) {
        if (character === quote) {
          if (quote === "'" && definition[index + 1] === "'") {
            index += 1;
          } else {
            quote = null;
          }
        }
      } else if (character === "'" || character === '"' || character === "`") {
        quote = character;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
      }
    }
    if (depth !== 0) throw new Error(`Unclosed CHECK constraint ${match[1]}`);
    checks.set(match[1]!, definition.slice(marker.lastIndex, index - 1));
  }
  return checks;
}

function normalizedCheck(expression: string, tableName: string): string {
  return expression
    .replaceAll(`"${tableName}".`, "")
    .replaceAll(`\`${tableName}\`.`, "")
    .replace(/["`]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

type Horizon =
  | "weekly_tuesday_0730"
  | "kickoff_minus_120"
  | "kickoff_minus_90"
  | "kickoff_minus_60"
  | "kickoff_minus_15";

// Direct-SQL timing guards intentionally use SQLite's real clock. Keep these
// fixtures relative to the test invocation so the qualification remains
// reproducible after the 2026 season instead of silently expiring.
const clockAnchorMs = Math.floor(Date.now() / 1_000) * 1_000;
const at = (seconds: number): string => new Date(clockAnchorMs + seconds * 1_000).toISOString();
const kickoff = at(7_140);
const times: Record<Horizon, string> = {
  weekly_tuesday_0730: at(-700),
  kickoff_minus_120: at(-60),
  kickoff_minus_90: at(1_740),
  kickoff_minus_60: at(3_540),
  kickoff_minus_15: at(6_240)
};
const contractHash = "8f6e9856512b7b14b0fba8e2367b9d09ebee3edc26a10f3660f9171ae2f3241a";

function seedOrigin(
  db: DatabaseSync,
  horizon: Horizon = "kickoff_minus_120",
  suffix = "base",
  seasonType: "REG" | "PRE" | "POST" = "REG"
): string {
  const gameId = `2026_01_NE_SEA_${suffix}`;
  const revisionId = `${gameId}:revision:1`;
  const originVersionId = `${gameId}:${horizon}:v1`;
  db.prepare(`INSERT INTO canonical_games (
    game_id, season, season_type, week, home_team, away_team, identity_status, created_at
  ) VALUES (?, 2026, ?, 1, 'SEA', 'NE', 'resolved', '2026-08-25T00:00:00Z')`)
    .run(gameId, seasonType);
  db.prepare(`INSERT INTO game_schedule_revisions (
    revision_id, game_id, week, schedule_status, kickoff_utc, local_time_zone,
    observed_at, source_evidence_hash, source_row_hash
  ) VALUES (?, ?, 1, 'scheduled', ?, 'America/Los_Angeles',
    '2026-08-25T00:00:00Z', ?, ?)`)
    .run(revisionId, gameId, kickoff, sha256Hex(`evidence:${suffix}`), sha256Hex(`row:${suffix}`));
  db.prepare(`INSERT INTO forecast_origin_versions (
    origin_version_id, logical_origin_id, game_id, horizon_id, scheduled_for_utc,
    scheduled_for_local, kickoff_revision_id, scientific_eligibility, information_cutoff,
    eligible, eligibility_reason, activation_boundary, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'eligible', 'os13a-test', '2026-08-25T00:00:01Z')`)
    .run(
      originVersionId,
      `${gameId}:${horizon}`,
      gameId,
      horizon,
      times[horizon],
      `${times[horizon]}[America/Los_Angeles]`,
      revisionId,
      horizon === "weekly_tuesday_0730" ? 1 : 0,
      horizon === "weekly_tuesday_0730"
        ? "completed_games_through_week_w_minus_1_at_origin"
        : "forecast_time"
    );
  return originVersionId;
}

function insertQualification(
  db: DatabaseSync,
  suffix = "eligible",
  status: "eligible" | "rejected" = "eligible",
  stream: "eligible_package" | "no_eligible_package" = "eligible_package",
  qualifiedAt = at(-702),
  activationBoundary = `os13a:${suffix}`,
  synchronizeClock = true
) {
  const values = {
    qualificationId: sha256Hex(`qualification:${suffix}`),
    activationBoundary,
    qualificationKey: sha256Hex(`qualification-key:${suffix}`),
    qualificationStream: stream,
    modelOrPackageHash: stream === "eligible_package" ? sha256Hex(`model:${suffix}`) : null,
    runnerHash: sha256Hex(`runner:${suffix}`),
    codeHash: sha256Hex(`code:${suffix}`),
    configHash: sha256Hex(`config:${suffix}`),
    featureSchemaHash: sha256Hex(`features:${suffix}`),
    targetSchemaHash: sha256Hex(`targets:${suffix}`)
  };
  if (synchronizeClock) setDatabaseClock(db, qualifiedAt);
  db.prepare(`INSERT INTO forecast_ledger_qualifications_v1 (
    qualification_id, ledger_contract_version, ledger_contract_hash, activation_boundary,
    qualification_key, qualification_key_version, qualification_stream,
    runner_hash, code_hash, model_or_package_hash, config_hash, feature_schema_hash,
    target_schema_hash, qualification_status, qualified_at, qualification_evidence_hash
  ) VALUES (?, 'forecast-ledger-contract.2026.1', ?, ?, ?,
    'engine-os.forecast-qualification.v1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      values.qualificationId,
      contractHash,
      values.activationBoundary,
      values.qualificationKey,
      values.qualificationStream,
      stream === "eligible_package" ? values.runnerHash : null,
      stream === "eligible_package" ? values.codeHash : null,
      values.modelOrPackageHash,
      stream === "eligible_package" ? values.configHash : null,
      stream === "eligible_package" ? values.featureSchemaHash : null,
      stream === "eligible_package" ? values.targetSchemaHash : null,
      status,
      qualifiedAt,
      sha256Hex(`qualification-evidence:${suffix}`)
    );
  return values;
}

function ensureNoPackageQualification(db: DatabaseSync, activationBoundary: string) {
  const suffix = `no-eligible-package:${activationBoundary}`;
  const qualificationId = sha256Hex(`qualification:${suffix}`);
  const existing = db.prepare(`SELECT qualification_id FROM forecast_ledger_qualifications_v1
    WHERE qualification_id = ?`).get(qualificationId);
  if (!existing) return insertQualification(
    db,
    suffix,
    "eligible",
    "no_eligible_package",
    at(-702),
    activationBoundary
  );
  return {
    qualificationId,
    activationBoundary,
    qualificationKey: sha256Hex(`qualification-key:${suffix}`),
    qualificationStream: "no_eligible_package" as const,
    modelOrPackageHash: null,
    runnerHash: sha256Hex("runner:no-eligible-package"),
    codeHash: sha256Hex("code:no-eligible-package"),
    configHash: sha256Hex("config:no-eligible-package"),
    featureSchemaHash: sha256Hex("features:no-eligible-package"),
    targetSchemaHash: sha256Hex("targets:no-eligible-package")
  };
}

function insertActivation(db: DatabaseSync, input: {
  suffix?: string;
  qualificationId?: string | null;
  firstWeek?: number;
  activatedAt?: string;
  firstOriginUtc?: string;
  synchronizeClock?: boolean;
} = {}): string {
  const suffix = input.suffix ?? "withholding";
  const activationBoundary = `os13a:${suffix}`;
  const qualificationId = input.qualificationId ??
    ensureNoPackageQualification(db, activationBoundary).qualificationId;
  const firstWeek = input.firstWeek ?? 1;
  const activatedAt = input.activatedAt ?? at(-701);
  const firstOriginUtc = input.firstOriginUtc ?? times.weekly_tuesday_0730;
  const activationId = sha256Hex(`activation:${suffix}`);
  const fullSeason = firstWeek === 1 && firstOriginUtc === "2026-09-08T14:30:00.000Z";
  if (input.synchronizeClock !== false) setDatabaseClock(db, activatedAt);
  db.prepare(`INSERT INTO forecast_ledger_activations_v1 (
    activation_id, ledger_contract_version, ledger_contract_hash, activation_boundary,
    qualification_id, evidence_scope, season, first_week, activated_at, first_origin_utc,
    week_one_origin_complete, qualification_only
  ) VALUES (?, 'forecast-ledger-contract.2026.1', ?, ?, ?, ?, 2026, ?,
    ?, ?, ?, 1)`)
    .run(
      activationId,
      contractHash,
      activationBoundary,
      qualificationId,
      fullSeason ? "full_season_shadow" : "partial_season_shadow",
      firstWeek,
      activatedAt,
      firstOriginUtc,
      fullSeason ? 1 : 0
    );
  return activationId;
}

function insertJob(db: DatabaseSync, input: {
  activationId: string;
  originVersionId: string;
  horizon?: Horizon;
  qualificationId?: string | null;
  suffix?: string;
}): string {
  const suffix = input.suffix ?? "base";
  const horizon = input.horizon ?? "kickoff_minus_120";
  const scheduledAt = times[horizon];
  const capSeconds = horizon === "kickoff_minus_15" ? 300 : 600;
  const deadlineAt = new Date(Math.min(
    Date.parse(scheduledAt) + capSeconds * 1_000,
    Date.parse(kickoff) - 1_000
  )).toISOString();
  const jobKey = sha256Hex(`job:${suffix}`);
  const qualificationId = input.qualificationId ?? (db.prepare(`SELECT qualification_id
    FROM forecast_ledger_activations_v1 WHERE activation_id = ?`).get(input.activationId) as {
      qualification_id: string;
    }).qualification_id;
  const qualification = db.prepare(`SELECT qualification_stream FROM forecast_ledger_qualifications_v1
    WHERE qualification_id = ?`).get(qualificationId) as { qualification_stream: string };
  const expectedInputManifestHash = qualification.qualification_stream === "eligible_package"
    ? sha256Hex(`input-manifest:${suffix}`)
    : null;
  db.prepare(`INSERT INTO forecast_ledger_jobs_v1 (
    job_key, job_key_version, ledger_contract_version, ledger_contract_hash,
    activation_id, origin_version_id, qualification_id, expected_input_manifest_hash, scheduled_trigger_at,
    persistence_deadline_at, kickoff_at, state, created_at
  ) VALUES (?, 'engine-os.forecast-ledger-job.v1', 'forecast-ledger-contract.2026.1',
    ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '2026-08-26T00:00:01Z')`)
    .run(
      jobKey,
      contractHash,
      input.activationId,
      input.originVersionId,
      qualificationId,
      expectedInputManifestHash,
      scheduledAt,
      deadlineAt,
      kickoff
    );
  return jobKey;
}

function acquire(db: DatabaseSync, input: {
  jobKey: string;
  token: string;
  acquiredAt?: string;
  expiresAt?: string;
  owner?: string;
  synchronizeClock?: boolean;
  recordAttempt?: boolean;
}): number {
  const job = db.prepare(`SELECT scheduled_trigger_at FROM forecast_ledger_jobs_v1
    WHERE job_key = ?`).get(input.jobKey) as { scheduled_trigger_at: string };
  const acquiredAt = input.acquiredAt ?? new Date(
    Date.parse(job.scheduled_trigger_at) + 10_000
  ).toISOString();
  const expiresAt = input.expiresAt ?? new Date(Date.parse(acquiredAt) + 120_000).toISOString();
  const owner = input.owner ?? "worker-a";
  if (input.synchronizeClock !== false) setDatabaseClock(db, acquiredAt);
  db.prepare(`UPDATE forecast_ledger_jobs_v1 SET
    state = 'running', fence_token = fence_token + 1, active_attempt_token_hash = ?,
    lease_owner = ?, lease_acquired_at = ?, lease_expires_at = ?, heartbeat_at = ?
    WHERE job_key = ?`)
    .run(input.token, owner, acquiredAt, expiresAt, acquiredAt, input.jobKey);
  const row = db.prepare(`SELECT origin_version_id, fence_token
    FROM forecast_ledger_jobs_v1 WHERE job_key = ?`).get(input.jobKey) as {
      origin_version_id: string;
      fence_token: number;
    };
  if (input.recordAttempt !== false) {
    db.prepare(`INSERT INTO forecast_ledger_attempts_v1 (
      attempt_id, job_key, origin_version_id, attempt_token_hash, fence_token,
      lease_owner, invoked_at, lease_acquired_at, lease_expires_at, persisted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        sha256Hex(`${input.jobKey}:${input.token}`),
        input.jobKey,
        row.origin_version_id,
        input.token,
        row.fence_token,
        owner,
        acquiredAt,
        acquiredAt,
        expiresAt,
        acquiredAt
      );
  }
  return row.fence_token;
}

function insertWithheld(db: DatabaseSync, input: {
  activationId: string;
  jobKey: string;
  originVersionId: string;
  token: string;
  fence: number;
  suffix?: string;
  reason?: string;
  timing?: "timely" | "late";
  prospective?: 0 | 1;
  invokedAt?: string;
  persistedAt?: string;
  databaseClockAt?: string;
}): void {
  const suffix = input.suffix ?? "withheld";
  const lease = db.prepare(`SELECT lease_acquired_at FROM forecast_ledger_jobs_v1
    WHERE job_key = ?`).get(input.jobKey) as { lease_acquired_at: string | null };
  const invokedAt = input.invokedAt ?? lease.lease_acquired_at ?? at(-30);
  const evidenceAt = invokedAt;
  const generatedAt = new Date(Date.parse(invokedAt) + 10_000).toISOString();
  const persistenceRequestedAt = new Date(Date.parse(invokedAt) + 20_000).toISOString();
  const persistedAt = input.persistedAt ?? new Date(Date.parse(invokedAt) + 30_000).toISOString();
  setDatabaseClock(db, input.databaseClockAt ?? persistedAt);
  db.prepare(`INSERT INTO forecast_ledger_records_v1 (
    record_id, record_hash, record_key_version, activation_id, job_key, origin_version_id,
    qualification_id, qualification_key, qualification_stream,
    ledger_contract_version, ledger_contract_hash,
    status, withholding_reason, scheduled_trigger_at, invoked_at, evidence_at,
    generated_at, persistence_requested_at, persisted_at, persistence_deadline_at,
    kickoff_at, timing, prospective_eligible, capture_health, activation_boundary,
    evidence_scope, attempt_token_hash, fence_token, payload_json, payload_hash
  ) SELECT ?, ?, 'engine-os.forecast-ledger-record.v2', ?, ?, ?,
    qualification.qualification_id, qualification.qualification_key,
    qualification.qualification_stream, 'forecast-ledger-contract.2026.1', ?, 'withheld', ?,
    job.scheduled_trigger_at, ?, ?, ?, ?, ?,
    job.persistence_deadline_at, job.kickoff_at, ?, ?, 'unavailable',
    activation.activation_boundary, activation.evidence_scope, ?, ?, '{}', ?
    FROM forecast_ledger_jobs_v1 job
    JOIN forecast_ledger_activations_v1 activation
      ON activation.activation_id = job.activation_id
    JOIN forecast_ledger_qualifications_v1 qualification
      ON qualification.qualification_id = activation.qualification_id
    WHERE job.job_key = ?`)
    .run(
      sha256Hex(`record:${suffix}`),
      sha256Hex(`record-hash:${suffix}`),
      input.activationId,
      input.jobKey,
      input.originVersionId,
      contractHash,
      input.reason ?? "no_eligible_package",
      invokedAt,
      evidenceAt,
      generatedAt,
      persistenceRequestedAt,
      persistedAt,
      input.timing ?? "timely",
      input.prospective ?? 1,
      input.token,
      input.fence,
      sha256Hex(`payload:${suffix}`),
      input.jobKey
    );
}

function insertForecast(db: DatabaseSync, input: {
  activationId: string;
  jobKey: string;
  originVersionId: string;
  token: string;
  fence: number;
  qualification: ReturnType<typeof insertQualification>;
  suffix?: string;
  modelOrPackageHash?: string | null;
  outputObjectKey?: string;
}): string {
  const suffix = input.suffix ?? "forecast";
  const outputHash = sha256Hex(`forecast-output:${suffix}`);
  const lease = db.prepare(`SELECT lease_acquired_at FROM forecast_ledger_jobs_v1
    WHERE job_key = ?`).get(input.jobKey) as { lease_acquired_at: string };
  const invokedAt = lease.lease_acquired_at;
  const evidenceAt = invokedAt;
  const generatedAt = new Date(Date.parse(invokedAt) + 10_000).toISOString();
  const outputPublishedAt = new Date(Date.parse(invokedAt) + 20_000).toISOString();
  const outputVerifiedAt = new Date(Date.parse(invokedAt) + 25_000).toISOString();
  const persistenceRequestedAt = new Date(Date.parse(invokedAt) + 30_000).toISOString();
  const persistedAt = new Date(Date.parse(invokedAt) + 35_000).toISOString();
  setDatabaseClock(db, persistedAt);
  const expectedInputManifestHash = (db.prepare(`SELECT expected_input_manifest_hash
    FROM forecast_ledger_jobs_v1 WHERE job_key = ?`).get(input.jobKey) as {
      expected_input_manifest_hash: string;
    }).expected_input_manifest_hash;
  db.prepare(`INSERT INTO forecast_ledger_records_v1 (
    record_id, record_hash, record_key_version, activation_id, job_key, origin_version_id,
    qualification_id, qualification_key, qualification_stream,
    ledger_contract_version, ledger_contract_hash,
    status, scheduled_trigger_at, invoked_at, evidence_at, generated_at,
    output_published_at, output_verified_at, persistence_requested_at, persisted_at,
    persistence_deadline_at, kickoff_at, timing, prospective_eligible, capture_health,
    activation_boundary, evidence_scope, attempt_token_hash, fence_token,
    runner_hash, code_hash, model_or_package_hash, config_hash, input_manifest_hash,
    feature_schema_hash, target_schema_hash, output_object_key, output_object_hash,
    output_object_bytes, payload_json, payload_hash
  ) SELECT ?, ?, 'engine-os.forecast-ledger-record.v2', ?, ?, ?, ?, ?, 'eligible_package',
    'forecast-ledger-contract.2026.1', ?, 'forecast',
    job.scheduled_trigger_at, ?, ?, ?, ?, ?, ?, ?, job.persistence_deadline_at,
    job.kickoff_at, 'timely', 1, 'current', activation.activation_boundary,
    activation.evidence_scope, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 128, '{}', ?
    FROM forecast_ledger_jobs_v1 job
    JOIN forecast_ledger_activations_v1 activation
      ON activation.activation_id = job.activation_id
    WHERE job.job_key = ?`)
    .run(
      sha256Hex(`record:${suffix}`),
      sha256Hex(`record-hash:${suffix}`),
      input.activationId,
      input.jobKey,
      input.originVersionId,
      input.qualification.qualificationId,
      input.qualification.qualificationKey,
      contractHash,
      invokedAt,
      evidenceAt,
      generatedAt,
      outputPublishedAt,
      outputVerifiedAt,
      persistenceRequestedAt,
      persistedAt,
      input.token,
      input.fence,
      input.qualification.runnerHash,
      input.qualification.codeHash,
      input.modelOrPackageHash === undefined
        ? input.qualification.modelOrPackageHash
        : input.modelOrPackageHash,
      input.qualification.configHash,
      expectedInputManifestHash,
      input.qualification.featureSchemaHash,
      input.qualification.targetSchemaHash,
      input.outputObjectKey ?? `forecast-output/sha256/${outputHash}`,
      outputHash,
      sha256Hex(`payload:${suffix}`),
      input.jobKey
    );
  return outputHash;
}

describe("OS-13A additive forecast ledger migration", () => {
  it("keeps every Drizzle declaration column- and CHECK-identical to the executable migration", () => {
    const db = database();
    const dialect = new SQLiteSyncDialect();
    const tables = [
      ["forecast_ledger_qualifications_v1", forecastLedgerQualificationsV1],
      ["forecast_ledger_activations_v1", forecastLedgerActivationsV1],
      ["forecast_ledger_jobs_v1", forecastLedgerJobsV1],
      ["forecast_ledger_attempts_v1", forecastLedgerAttemptsV1],
      ["forecast_ledger_records_v1", forecastLedgerRecordsV1],
      ["forecast_ledger_events_v1", forecastLedgerEventsV1]
    ] as const;

    for (const [tableName, declaration] of tables) {
      const migrated = db.prepare(`PRAGMA table_info(${tableName})`)
        .all() as Array<{ name: string }>;
      const declared = Object.values(getTableColumns(declaration)).map((column) => column.name);
      expect(migrated.map((column) => column.name), tableName).toEqual(declared);

      const migratedDefinition = db.prepare(`SELECT sql FROM sqlite_master
        WHERE type = 'table' AND name = ?`).get(tableName) as { sql: string } | undefined;
      expect(migratedDefinition?.sql, `${tableName} executable definition`).toBeTruthy();
      const migratedChecks = namedCheckExpressions(migratedDefinition!.sql);
      const declaredChecks = new Map(getTableConfig(declaration).checks.map((constraint) => [
        constraint.name,
        dialect.sqlToQuery(constraint.value).sql
      ]));
      expect(
        [...declaredChecks.keys()].sort(),
        `${tableName} named CHECK declarations`
      ).toEqual([...migratedChecks.keys()].sort());
      for (const [name, migratedExpression] of migratedChecks) {
        expect(
          normalizedCheck(declaredChecks.get(name) ?? "", tableName),
          `${tableName}.${name} CHECK semantics`
        ).toBe(normalizedCheck(migratedExpression, tableName));
      }
    }
    db.close();
  });

  it("registers the exact definition and preserves accepted migration bytes", () => {
    const db = database();
    const migration = readFileSync(resolve(
      process.cwd(), "drizzle/0018_engine_os_forecast_ledger.sql"
    ), "utf8");
    const definition = migration.split("INSERT INTO `engine_schema_versions`")[0]!;
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0018_engine_os_forecast_ledger'`).get())
      .toEqual({ migration_hash: `sha256:${sha256Hex(definition)}` });

    const acceptedHashes: Record<string, string> = {
      "drizzle/0013_engine_os_urgent.sql":
        "39d6695a24d1fdb66b70ab831af1bcc9e061e523080d9a07239aa3583e3c9df9",
      "drizzle/0014_odds_quota_reservations.sql":
        "614147e88b73360636781ff826716f4db2b6f075136d175b5c70483cc33adab9",
      "drizzle/0015_engine_os_origin_identity.sql":
        "96a161205f0d5966a337f47dc3a5ca662afb0dfe3dc1df29f07b6fe5fec7ea76",
      "drizzle/0016_engine_os_interim_scheduler.sql":
        "c121be1514510dedb2b5b1f6caef2e61d9b5999afc1a2f61a3f7477df7f74930",
      "drizzle/0017_engine_os_source_capture.sql":
        "5ab272cdd5fccc79664c1b3fcdcbc9ee451bb4e64a5afd2b3c5fd3a9692f3358"
    };
    for (const [filename, expectedHash] of Object.entries(acceptedHashes)) {
      expect(sha256Hex(readFileSync(resolve(process.cwd(), filename)))).toBe(expectedHash);
    }
    db.close();
  });

  it("binds jobs only to the five canonical current origin heads", () => {
    const db = database();
    const activationId = insertActivation(db);
    const horizons = Object.keys(times) as Horizon[];
    for (const [index, horizon] of horizons.entries()) {
      const suffix = `horizon-${index}`;
      const originVersionId = seedOrigin(db, horizon, suffix);
      expect(() => insertJob(db, {
        activationId,
        originVersionId,
        horizon,
        suffix
      })).not.toThrow();
    }
    expect(db.prepare("SELECT count(*) AS count FROM forecast_ledger_jobs_v1").get())
      .toEqual({ count: 5 });
    expect(() => db.prepare(`INSERT INTO forecast_ledger_jobs_v1 (
      job_key, job_key_version, ledger_contract_version, ledger_contract_hash,
      activation_id, origin_version_id, scheduled_trigger_at, persistence_deadline_at,
      kickoff_at, state, created_at
    ) VALUES (?, 'v1', 'v1', ?, ?, 'fabricated-origin', '2026-09-13T18:05:00Z',
      '2026-09-13T20:00:00Z', ?, 'pending', '2026-08-26T00:00:00Z')`)
      .run(sha256Hex("fabricated-job"), contractHash, activationId, kickoff))
      .toThrow(/canonical origin|FOREIGN KEY/);
    db.close();
  });

  it("requires eligible package qualification and labels late starts partial-season", () => {
    const db = database();
    const rejected = insertQualification(db, "rejected", "rejected");
    expect(() => insertActivation(db, {
      suffix: "rejected",
      qualificationId: rejected.qualificationId
    })).toThrow(/eligible immutable qualification stream/);
    const eligible = insertQualification(db, "partial");
    const activationId = insertActivation(db, {
      suffix: "partial",
      qualificationId: eligible.qualificationId,
      firstWeek: 3
    });
    expect(db.prepare(`SELECT evidence_scope, first_week
      FROM forecast_ledger_activations_v1 WHERE activation_id = ?`).get(activationId))
      .toEqual({ evidence_scope: "partial_season_shadow", first_week: 3 });
    expect(() => db.prepare(`UPDATE forecast_ledger_qualifications_v1
      SET qualification_status = 'rejected' WHERE qualification_id = ?`)
      .run(eligible.qualificationId)).toThrow(/append-only/);
    expect(() => db.prepare(`DELETE FROM forecast_ledger_activations_v1
      WHERE activation_id = ?`).run(activationId)).toThrow(/append-only/);
    db.close();
  });

  it("enforces the frozen contract and one activation boundary per eligible package", () => {
    const db = database();
    const first = insertQualification(db, "one-boundary-package");
    insertActivation(db, {
      suffix: "one-boundary-package",
      qualificationId: first.qualificationId
    });

    const secondBoundaryQualifiedAt = at(-62);
    setDatabaseClock(db, secondBoundaryQualifiedAt);
    expect(() => db.prepare(`INSERT INTO forecast_ledger_qualifications_v1 (
      qualification_id, ledger_contract_version, ledger_contract_hash, activation_boundary,
      qualification_key, qualification_key_version, qualification_stream,
      runner_hash, code_hash, model_or_package_hash, config_hash, feature_schema_hash,
      target_schema_hash, qualification_status, qualified_at, qualification_evidence_hash
    ) VALUES (?, 'forecast-ledger-contract.2026.1', ?, 'os13a:second-boundary', ?,
      'engine-os.forecast-qualification.v1', 'eligible_package',
      ?, ?, ?, ?, ?, ?, 'eligible', ?, ?)`)
      .run(
        sha256Hex("qualification:second-boundary"),
        contractHash,
        sha256Hex("qualification-key:second-boundary"),
        sha256Hex("runner:second-boundary"),
        sha256Hex("code:second-boundary"),
        first.modelOrPackageHash,
        sha256Hex("config:second-boundary"),
        sha256Hex("features:second-boundary"),
        sha256Hex("targets:second-boundary"),
        secondBoundaryQualifiedAt,
        sha256Hex("qualification-evidence:second-boundary")
      )).toThrow(/UNIQUE/);

    const noPackageA = insertQualification(
      db,
      "no-package-a",
      "eligible",
      "no_eligible_package"
    );
    const noPackageB = insertQualification(
      db,
      "no-package-b",
      "eligible",
      "no_eligible_package"
    );
    expect(noPackageA.qualificationId).not.toBe(noPackageB.qualificationId);

    const wrongContractActivatedAt = at(-61);
    setDatabaseClock(db, wrongContractActivatedAt);
    expect(() => db.prepare(`INSERT INTO forecast_ledger_activations_v1 (
      activation_id, ledger_contract_version, ledger_contract_hash, activation_boundary,
      qualification_id, evidence_scope, season, first_week, activated_at, first_origin_utc,
      week_one_origin_complete, qualification_only
    ) VALUES (?, 'wrong-contract', ?, 'os13a:wrong-contract', ?, 'full_season_shadow',
      2026, 1, ?, ?, 1, 1)`)
      .run(
        sha256Hex("activation:wrong-contract"),
        "f".repeat(64),
        noPackageA.qualificationId,
        wrongContractActivatedAt,
        times.weekly_tuesday_0730
      )).toThrow(/CHECK constraint|eligible immutable qualification stream/);
    db.close();
  });

  it("binds full-season evidence to the exact first origin and rejects cross-boundary activation", () => {
    const db = database();
    const exact = insertQualification(db, "full-exact");
    const fullActivation = insertActivation(db, {
      suffix: "full-exact",
      qualificationId: exact.qualificationId,
      firstOriginUtc: "2026-09-08T14:30:00.000Z"
    });
    expect(db.prepare(`SELECT evidence_scope FROM forecast_ledger_activations_v1
      WHERE activation_id = ?`).get(fullActivation))
      .toEqual({ evidence_scope: "full_season_shadow" });

    const mismatched = insertQualification(db, "origin-mismatch");
    const partialActivation = insertActivation(db, {
      suffix: "origin-mismatch",
      qualificationId: mismatched.qualificationId,
      firstOriginUtc: "2026-09-08T14:30:00.001Z"
    });
    expect(db.prepare(`SELECT evidence_scope FROM forecast_ledger_activations_v1
      WHERE activation_id = ?`).get(partialActivation))
      .toEqual({ evidence_scope: "partial_season_shadow" });

    const boundaryA = insertQualification(db, "boundary-a");
    expect(() => insertActivation(db, {
      suffix: "boundary-b",
      qualificationId: boundaryA.qualificationId
    })).toThrow(/eligible immutable qualification stream/);
    db.close();
  });

  it("rejects non-regular-season origins at the ledger boundary", () => {
    const db = database();
    const originVersionId = seedOrigin(db, "kickoff_minus_120", "preseason", "PRE");
    const activationId = insertActivation(db, { suffix: "preseason" });
    expect(() => insertJob(db, {
      activationId,
      originVersionId,
      suffix: "preseason"
    })).toThrow(/current eligible canonical origin/);
    db.close();
  });

  it("rejects an activation boundary created after its first origin", () => {
    const db = database();
    const qualification = insertQualification(
      db,
      "activation-after-origin",
      "eligible",
      "no_eligible_package"
    );
    expect(() => insertActivation(db, {
      suffix: "activation-after-origin",
      qualificationId: qualification.qualificationId,
      activatedAt: at(0),
      firstOriginUtc: at(-1)
    })).toThrow(/CHECK constraint/);
    db.close();
  });

  it("rejects an activation that predates its immutable qualification evidence", () => {
    const db = database();
    const futureQualification = insertQualification(
      db,
      "qualified-after-activation",
      "eligible",
      "eligible_package",
      at(-1)
    );
    expect(() => insertActivation(db, {
      suffix: "qualified-after-activation",
      qualificationId: futureQualification.qualificationId
    })).toThrow(/eligible immutable qualification stream/);
    db.close();
  });

  it("rejects forged qualification and activation clocks, including post-Week-1 backdating", () => {
    const db = database();
    setDatabaseClock(db, at(0));
    expect(() => insertQualification(
      db,
      "backdated-qualification",
      "eligible",
      "eligible_package",
      at(-6),
      "os13a:backdated-qualification",
      false
    )).toThrow(/contemporaneous with D1/);
    expect(() => insertQualification(
      db,
      "future-qualification",
      "eligible",
      "eligible_package",
      at(6),
      "os13a:future-qualification",
      false
    )).toThrow(/contemporaneous with D1/);

    const postWeekOne = "2026-09-20T12:00:00.000Z";
    setDatabaseClock(db, postWeekOne);
    const postWeekOneQualification = insertQualification(
      db,
      "post-week-one",
      "eligible",
      "eligible_package",
      postWeekOne,
      "os13a:post-week-one",
      false
    );
    expect(() => insertActivation(db, {
      suffix: "post-week-one",
      qualificationId: postWeekOneQualification.qualificationId,
      activatedAt: "2026-09-08T14:00:00.000Z",
      firstOriginUtc: "2026-09-08T14:30:00.000Z",
      synchronizeClock: false
    })).toThrow(/contemporaneous D1 time|eligible immutable qualification/);

    setDatabaseClock(db, at(0));
    const currentQualification = insertQualification(
      db,
      "future-activation",
      "eligible",
      "eligible_package",
      at(0),
      "os13a:future-activation",
      false
    );
    expect(() => insertActivation(db, {
      suffix: "future-activation",
      qualificationId: currentQualification.qualificationId,
      activatedAt: at(6),
      firstOriginUtc: at(60),
      synchronizeClock: false
    })).toThrow(/contemporaneous D1 time/);
    db.close();
  });

  it("rejects pre-due, future, non-120-second, and future-attempt lease clocks", () => {
    const preDue = database();
    const futureOrigin = seedOrigin(preDue, "kickoff_minus_60", "pre-due-claim");
    const futureActivation = insertActivation(preDue, { suffix: "pre-due-claim" });
    const futureJob = insertJob(preDue, {
      activationId: futureActivation,
      originVersionId: futureOrigin,
      horizon: "kickoff_minus_60",
      suffix: "pre-due-claim"
    });
    setDatabaseClock(preDue, at(0));
    expect(() => acquire(preDue, {
      jobKey: futureJob,
      token: sha256Hex("pre-due-claim"),
      acquiredAt: at(0),
      expiresAt: at(120),
      synchronizeClock: false
    })).toThrow(/lease fencing/);
    preDue.close();

    const db = database();
    const originVersionId = seedOrigin(db, "kickoff_minus_120", "clock-authority");
    const activationId = insertActivation(db, { suffix: "clock-authority" });
    const jobKey = insertJob(db, {
      activationId,
      originVersionId,
      suffix: "clock-authority"
    });
    setDatabaseClock(db, at(0));
    expect(() => acquire(db, {
      jobKey,
      token: sha256Hex("future-claim"),
      acquiredAt: at(6),
      expiresAt: at(126),
      synchronizeClock: false
    })).toThrow(/lease fencing/);
    expect(() => acquire(db, {
      jobKey,
      token: sha256Hex("wrong-duration"),
      acquiredAt: at(0),
      expiresAt: at(119),
      synchronizeClock: false
    })).toThrow(/lease fencing/);

    const token = sha256Hex("valid-clock-authority");
    const fence = acquire(db, {
      jobKey,
      token,
      acquiredAt: at(0),
      expiresAt: at(120),
      synchronizeClock: false,
      recordAttempt: false
    });
    expect(() => db.prepare(`INSERT INTO forecast_ledger_attempts_v1 (
      attempt_id, job_key, origin_version_id, attempt_token_hash, fence_token,
      lease_owner, invoked_at, lease_acquired_at, lease_expires_at, persisted_at
    ) VALUES (?, ?, ?, ?, ?, 'worker-a', ?, ?, ?, ?)`)
      .run(
        sha256Hex("future-attempt-row"),
        jobKey,
        originVersionId,
        token,
        fence,
        at(0),
        at(0),
        at(120),
        at(10)
      )).toThrow(/exact current fenced lease/);

    expect(() => db.prepare(`UPDATE forecast_ledger_jobs_v1 SET
      lease_expires_at = ?, heartbeat_at = ? WHERE job_key = ?`)
      .run(at(130), at(10), jobKey)).toThrow(/lease fencing/);
    setDatabaseClock(db, at(1));
    db.prepare(`UPDATE forecast_ledger_jobs_v1 SET
      lease_expires_at = ?, heartbeat_at = ? WHERE job_key = ?`)
      .run(at(121), at(1), jobKey);
    setDatabaseClock(db, at(2));
    expect(() => db.prepare(`UPDATE forecast_ledger_jobs_v1 SET
      lease_expires_at = ?, heartbeat_at = ? WHERE job_key = ?`)
      .run(at(123), at(2), jobKey)).toThrow(/lease fencing/);
    db.close();
  });

  it("converges duplicate identities, records unique fences, and blocks a stale publisher", () => {
    const db = database();
    const originVersionId = seedOrigin(db);
    const activationId = insertActivation(db);
    const jobKey = insertJob(db, { activationId, originVersionId });
    expect(() => insertJob(db, {
      activationId,
      originVersionId,
      suffix: "duplicate"
    })).toThrow(/UNIQUE/);

    const staleToken = sha256Hex("stale-attempt");
    const staleFence = acquire(db, {
      jobKey,
      token: staleToken,
      acquiredAt: at(-50),
      expiresAt: at(70)
    });
    const liveToken = sha256Hex("live-attempt");
    const liveFence = acquire(db, {
      jobKey,
      token: liveToken,
      owner: "worker-b",
      acquiredAt: at(71),
      expiresAt: at(191)
    });
    expect(liveFence).toBe(staleFence + 1);
    expect(() => insertWithheld(db, {
      activationId,
      jobKey,
      originVersionId,
      token: staleToken,
      fence: staleFence,
      suffix: "stale"
    })).toThrow(/live fenced origin claim/);
    insertWithheld(db, {
      activationId,
      jobKey,
      originVersionId,
      token: liveToken,
      fence: liveFence,
      suffix: "live"
    });
    expect(db.prepare(`SELECT state, fence_token FROM forecast_ledger_jobs_v1
      WHERE job_key = ?`).get(jobKey)).toEqual({ state: "completed", fence_token: 2 });
    expect(() => db.prepare(`UPDATE forecast_ledger_records_v1
      SET capture_health = 'current' WHERE job_key = ?`).run(jobKey)).toThrow(/append-only/);
    db.close();
  });

  it("rejects a record invocation time not bound to its immutable fenced attempt", () => {
    const db = database();
    const originVersionId = seedOrigin(db, "kickoff_minus_120", "mutated-invocation");
    const activationId = insertActivation(db, { suffix: "mutated-invocation" });
    const jobKey = insertJob(db, {
      activationId,
      originVersionId,
      suffix: "mutated-invocation"
    });
    const token = sha256Hex("mutated-invocation-attempt");
    const fence = acquire(db, {
      jobKey,
      token,
      acquiredAt: at(-60),
      expiresAt: at(60)
    });
    expect(() => insertWithheld(db, {
      activationId,
      jobKey,
      originVersionId,
      token,
      fence,
      invokedAt: at(-50),
      suffix: "mutated-invocation"
    })).toThrow(/live fenced origin claim/);
    expect(db.prepare(`SELECT count(*) AS count FROM forecast_ledger_records_v1
      WHERE job_key = ?`).get(jobKey)).toEqual({ count: 0 });
    expect(db.prepare(`SELECT state FROM forecast_ledger_jobs_v1 WHERE job_key = ?`)
      .get(jobKey)).toEqual({ state: "running" });
    db.close();
  });

  it("invalidates a superseded pending or running job and fences its former worker", () => {
    const db = database();
    const originVersionId = seedOrigin(db, "kickoff_minus_120", "superseded");
    const activationId = insertActivation(db, { suffix: "superseded" });
    const jobKey = insertJob(db, { activationId, originVersionId, suffix: "superseded" });
    const token = sha256Hex("superseded-attempt");
    const fence = acquire(db, { jobKey, token });
    const row = db.prepare(`SELECT logical_origin_id, game_id, horizon_id, scheduled_for_utc,
      scheduled_for_local, kickoff_revision_id, scientific_eligibility, information_cutoff,
      activation_boundary FROM forecast_origin_versions WHERE origin_version_id = ?`)
      .get(originVersionId) as Record<string, string | number>;
    const replacementId = `${originVersionId}:replacement`;
    db.prepare(`INSERT INTO forecast_origin_versions (
      origin_version_id, logical_origin_id, game_id, horizon_id, scheduled_for_utc,
      scheduled_for_local, kickoff_revision_id, scientific_eligibility, information_cutoff,
      eligible, eligibility_reason, activation_boundary, supersedes_origin_version_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'eligible', ?, ?, '2026-09-13T18:05:02Z')`)
      .run(
        replacementId,
        row.logical_origin_id,
        row.game_id,
        row.horizon_id,
        row.scheduled_for_utc,
        row.scheduled_for_local,
        row.kickoff_revision_id,
        row.scientific_eligibility,
        row.information_cutoff,
        row.activation_boundary,
        originVersionId
      );
    db.prepare(`UPDATE forecast_ledger_jobs_v1 SET
      state = 'invalidated', active_attempt_token_hash = NULL, lease_owner = NULL,
      lease_acquired_at = NULL, lease_expires_at = NULL,
      completed_at = '2026-09-13T18:05:03Z'
      WHERE job_key = ?`).run(jobKey);
    expect(db.prepare(`SELECT state, fence_token FROM forecast_ledger_jobs_v1
      WHERE job_key = ?`).get(jobKey)).toEqual({ state: "invalidated", fence_token: fence });
    expect(() => insertWithheld(db, {
      activationId,
      jobKey,
      originVersionId,
      token,
      fence,
      suffix: "superseded-stale"
    })).toThrow(/live fenced origin claim/);
    db.close();
  });

  it("rejects incomplete or mismatched forecasts and accepts explicit provenance withholding", () => {
    const db = database();
    const qualification = insertQualification(db, "qualified");
    const activationId = insertActivation(db, {
      suffix: "qualified",
      qualificationId: qualification.qualificationId
    });
    const originVersionId = seedOrigin(db, "kickoff_minus_120", "qualified");
    const jobKey = insertJob(db, {
      activationId,
      originVersionId,
      qualificationId: qualification.qualificationId,
      suffix: "qualified"
    });
    const token = sha256Hex("qualified-attempt");
    const fence = acquire(db, { jobKey, token });
    expect(() => insertForecast(db, {
      activationId,
      jobKey,
      originVersionId,
      token,
      fence,
      qualification,
      suffix: "missing-model",
      modelOrPackageHash: null
    })).toThrow(/CHECK constraint|provenance/);
    expect(() => insertForecast(db, {
      activationId,
      jobKey,
      originVersionId,
      token,
      fence,
      qualification,
      suffix: "wrong-package",
      modelOrPackageHash: sha256Hex("wrong-package")
    })).toThrow(/exact provenance/);
    insertWithheld(db, {
      activationId,
      jobKey,
      originVersionId,
      token,
      fence,
      reason: "provenance_incomplete",
      suffix: "provenance-withheld"
    });
    expect(db.prepare(`SELECT status, withholding_reason FROM forecast_ledger_records_v1
      WHERE job_key = ?`).get(jobKey)).toEqual({
      status: "withheld",
      withholding_reason: "provenance_incomplete"
    });
    db.close();
  });

  it("accepts a fully verified content-addressed forecast and finalizes its job", () => {
    const db = database();
    const qualification = insertQualification(db, "complete");
    const activationId = insertActivation(db, {
      suffix: "complete",
      qualificationId: qualification.qualificationId
    });
    const originVersionId = seedOrigin(db, "kickoff_minus_120", "complete");
    const jobKey = insertJob(db, {
      activationId,
      originVersionId,
      qualificationId: qualification.qualificationId,
      suffix: "complete"
    });
    const token = sha256Hex("complete-attempt");
    const fence = acquire(db, { jobKey, token });
    const outputHash = insertForecast(db, {
      activationId,
      jobKey,
      originVersionId,
      token,
      fence,
      qualification,
      suffix: "complete"
    });
    expect(db.prepare(`SELECT status, timing, prospective_eligible, output_object_key,
      output_object_hash FROM forecast_ledger_records_v1 WHERE job_key = ?`).get(jobKey))
      .toEqual({
        status: "forecast",
        timing: "timely",
        prospective_eligible: 1,
        output_object_key: `forecast-output/sha256/${outputHash}`,
        output_object_hash: outputHash
      });
    expect(db.prepare(`SELECT state FROM forecast_ledger_jobs_v1 WHERE job_key = ?`)
      .get(jobKey)).toEqual({ state: "completed" });
    db.close();
  });

  it("enforces strict timing and preserves late claims as nonprospective", () => {
    const db = database();
    const originVersionId = seedOrigin(db, "weekly_tuesday_0730", "late");
    const activationId = insertActivation(db, { suffix: "late" });
    const jobKey = insertJob(db, {
      activationId,
      originVersionId,
      horizon: "weekly_tuesday_0730",
      suffix: "late"
    });
    const token = sha256Hex("late-attempt");
    const fence = acquire(db, {
      jobKey,
      token,
      acquiredAt: at(-30),
      expiresAt: at(90)
    });
    insertWithheld(db, {
      activationId,
      jobKey,
      originVersionId,
      token,
      fence,
      reason: "late_origin_excluded",
      timing: "late",
      prospective: 0,
      suffix: "late"
    });
    expect(db.prepare(`SELECT timing, prospective_eligible FROM forecast_ledger_records_v1
      WHERE job_key = ?`).get(jobKey)).toEqual({ timing: "late", prospective_eligible: 0 });
    db.close();
  });

  it("rejects non-contemporaneous persistence on timely and late eligible paths", () => {
    const staleDb = database();
    const staleOrigin = seedOrigin(staleDb, "kickoff_minus_120", "stale-persistence");
    const staleActivation = insertActivation(staleDb, { suffix: "stale-persistence" });
    const staleJob = insertJob(staleDb, {
      activationId: staleActivation,
      originVersionId: staleOrigin,
      suffix: "stale-persistence"
    });
    const staleToken = sha256Hex("stale-persistence-attempt");
    const staleFence = acquire(staleDb, {
      jobKey: staleJob,
      token: staleToken,
      acquiredAt: at(-60),
      expiresAt: at(60)
    });
    expect(() => insertWithheld(staleDb, {
      activationId: staleActivation,
      jobKey: staleJob,
      originVersionId: staleOrigin,
      token: staleToken,
      fence: staleFence,
      persistedAt: at(-30),
      databaseClockAt: at(0),
      suffix: "stale-persistence"
    })).toThrow(/live fenced origin claim/);
    staleDb.close();

    const timelyDb = database();
    const timelyOrigin = seedOrigin(timelyDb, "kickoff_minus_120", "future-timely");
    const timelyActivation = insertActivation(timelyDb, { suffix: "future-timely" });
    const timelyJob = insertJob(timelyDb, {
      activationId: timelyActivation,
      originVersionId: timelyOrigin,
      suffix: "future-timely"
    });
    const timelyToken = sha256Hex("future-timely-attempt");
    const timelyFence = acquire(timelyDb, {
      jobKey: timelyJob,
      token: timelyToken,
      acquiredAt: at(-30),
      expiresAt: at(90)
    });
    expect(() => insertWithheld(timelyDb, {
      activationId: timelyActivation,
      jobKey: timelyJob,
      originVersionId: timelyOrigin,
      token: timelyToken,
      fence: timelyFence,
      persistedAt: at(60),
      databaseClockAt: at(0),
      suffix: "future-timely"
    })).toThrow(/live fenced origin claim/);
    timelyDb.close();

    const lateDb = database();
    const lateOrigin = seedOrigin(lateDb, "weekly_tuesday_0730", "future-late");
    const lateActivation = insertActivation(lateDb, { suffix: "future-late" });
    const lateJob = insertJob(lateDb, {
      activationId: lateActivation,
      originVersionId: lateOrigin,
      horizon: "weekly_tuesday_0730",
      suffix: "future-late"
    });
    const lateToken = sha256Hex("future-late-attempt");
    const lateFence = acquire(lateDb, {
      jobKey: lateJob,
      token: lateToken,
      acquiredAt: at(-30),
      expiresAt: at(90)
    });
    expect(() => insertWithheld(lateDb, {
      activationId: lateActivation,
      jobKey: lateJob,
      originVersionId: lateOrigin,
      token: lateToken,
      fence: lateFence,
      reason: "late_origin_excluded",
      timing: "late",
      prospective: 0,
      persistedAt: at(7_200),
      databaseClockAt: at(0),
      suffix: "future-late"
    })).toThrow(/live fenced origin claim/);
    lateDb.close();
  });

  it("deduplicates exact event retries and aborts event identity collisions atomically", () => {
    const db = database();
    const eventId = sha256Hex("event:collision");
    const persistedAt = at(-1);
    const eventInsert = `INSERT OR IGNORE INTO forecast_ledger_events_v1 (
      event_id, event_type, occurred_at, evidence_at, persisted_at, payload_json, payload_hash
    ) VALUES (?, 'qualification_registered', ?, ?, ?, ?, ?)`;
    const payload = JSON.stringify({ stable: true });
    const payloadHash = sha256Hex(payload);
    db.prepare(eventInsert).run(
      eventId,
      persistedAt,
      persistedAt,
      persistedAt,
      payload,
      payloadHash
    );
    db.prepare(eventInsert).run(
      eventId,
      persistedAt,
      persistedAt,
      persistedAt,
      payload,
      payloadHash
    );
    expect(db.prepare(`SELECT count(*) AS count FROM forecast_ledger_events_v1
      WHERE event_id = ?`).get(eventId)).toEqual({ count: 1 });

    db.exec("BEGIN");
    try {
      insertQualification(db, "collision-parent");
      const conflictingPayload = JSON.stringify({ stable: false });
      db.prepare(eventInsert).run(
        eventId,
        persistedAt,
        persistedAt,
        persistedAt,
        conflictingPayload,
        sha256Hex(conflictingPayload)
      );
      db.exec("COMMIT");
      throw new Error("expected event identity collision");
    } catch (error) {
      db.exec("ROLLBACK");
      expect(String(error)).toMatch(/event identity collision/);
    }
    expect(db.prepare(`SELECT qualification_id FROM forecast_ledger_qualifications_v1
      WHERE qualification_id = ?`).get(sha256Hex("qualification:collision-parent")))
      .toBeUndefined();
    expect(db.prepare(`SELECT count(*) AS count FROM forecast_ledger_events_v1
      WHERE event_id = ?`).get(eventId)).toEqual({ count: 1 });
    db.close();
  });

  it("rolls back only when every ledger evidence table is empty", () => {
    const empty = database();
    const rollbackPath = "drizzle/rollback/0018_engine_os_forecast_ledger.down.sql";
    const rollback = readFileSync(resolve(process.cwd(), rollbackPath), "utf8");
    expect(rollback).not.toMatch(/^\s*(?:BEGIN(?:\s+TRANSACTION|\s+IMMEDIATE)?|COMMIT);\s*$/im);
    expect(rollback).not.toMatch(/\b(?:TEMP|TEMPORARY)\b/i);
    applySql(empty, rollbackPath);
    expect(empty.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'forecast_ledger_records_v1'`).get()).toBeUndefined();
    expect(empty.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'forecast_origin_versions'`).get())
      .toEqual({ name: "forecast_origin_versions" });
    expect(empty.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'engine_origin_jobs_v2'`).get())
      .toEqual({ name: "engine_origin_jobs_v2" });
    empty.close();

    const retained = database();
    insertActivation(retained, { suffix: "retained" });
    expect(() => applySql(retained, rollbackPath))
      .toThrow(/requires every forecast-ledger table to be empty/);
    expect(retained.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0018_engine_os_forecast_ledger'`).get()).toBeDefined();
    retained.close();
  });
});
