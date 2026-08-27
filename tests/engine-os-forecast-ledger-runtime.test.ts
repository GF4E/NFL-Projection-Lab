import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type { RequiredForecastHorizonId } from "@/domain/engine-os";
import { sha256Hex } from "@/domain/hash";
import { forecastOutputObjectKey } from "@/server/engine-os/forecast-ledger-kernel";
import {
  ForecastLedgerAuthorityError,
  ForecastLedgerIntegrityError,
  claimOs13aLedgerJob,
  createOs13aQualificationActivation,
  forecastLedgerRuntimeBoundary,
  materializeOs13aLedgerJobs,
  publishOs13aLedgerRecord,
  reconcileOs13aSupersededJobs,
  recoverOs13aForecastOutput,
  registerOs13aFixtureQualification,
  renewOs13aLedgerLease,
  type ForecastLedgerJobLease,
  type ForecastLedgerPublicationInput
} from "@/server/engine-os/forecast-ledger-runtime";

type SqlValue = string | number | bigint | Uint8Array | null;

interface D1Faults {
  failBatches: number;
  databaseReceiptAt: string;
  databaseReceiptTimes: string[];
  databaseClockObservations: string[];
  databaseClockAdvanceAfter: Partial<Record<string, string>>;
}

const D1_FAULTS = new WeakMap<object, D1Faults>();

function applySql(db: DatabaseSync, filename: string, useTestClock = false): void {
  let sql = readFileSync(resolve(process.cwd(), filename), "utf8")
    .replaceAll("--> statement-breakpoint", "");
  if (useTestClock) {
    sql = sql.replaceAll("'now' /* os13a-authoritative-clock */", "os13a_test_now()");
  }
  db.exec(sql);
}

function sqliteD1(db: DatabaseSync, faults: D1Faults): D1Database {
  let priorBatch = Promise.resolve();
  function prepare(sql: string) {
    let parameters: SqlValue[] = [];
    return {
      bind(...values: unknown[]) {
        parameters = values as SqlValue[];
        return this;
      },
      async run() {
        const result = db.prepare(sql).run(...parameters);
        return { success: true, meta: { changes: Number(result.changes) }, results: [] };
      },
      async first<T>() {
        if (sql.includes("os13a-database-clock")) {
          const observation = /os13a-database-clock:([a-z_]+)/.exec(sql)?.[1] ?? "unknown";
          faults.databaseClockObservations.push(observation);
          const databaseReceiptAt = faults.databaseReceiptTimes.shift() ?? faults.databaseReceiptAt;
          const advanceTo = faults.databaseClockAdvanceAfter[observation];
          if (advanceTo) faults.databaseReceiptAt = advanceTo;
          return { database_receipt_at: databaseReceiptAt } as T;
        }
        return (db.prepare(sql).get(...parameters) ?? null) as T | null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...parameters) as T[], success: true, meta: {} };
      },
      async raw<T>() {
        return db.prepare(sql).all(...parameters)
          .map((row) => Object.values(row as Record<string, T>));
      }
    };
  }
  return {
    prepare,
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      let release!: () => void;
      const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
      const predecessor = priorBatch;
      priorBatch = gate;
      await predecessor;
      try {
        if (faults.failBatches > 0) {
          faults.failBatches -= 1;
          throw new Error("injected D1 batch failure");
        }
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
      } finally {
        release();
      }
    },
    async exec(sql: string) { db.exec(sql); return { count: 0, duration: 0 }; },
    async dump() { return new ArrayBuffer(0); }
  } as unknown as D1Database;
}

class MemoryR2 {
  readonly objects = new Map<string, Uint8Array>();
  puts = 0;
  gets = 0;
  failPuts = 0;
  corruptPuts = 0;
  afterPut: (() => Promise<void>) | null = null;

  async put(key: string, value: Uint8Array | ArrayBuffer | ReadableStream) {
    this.puts += 1;
    if (this.failPuts > 0) {
      this.failPuts -= 1;
      throw new Error("injected R2 put failure");
    }
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) bytes = value.slice();
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value.slice(0));
    else {
      const reader = value.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        chunks.push(part.value as Uint8Array);
      }
      const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    if (this.corruptPuts > 0) {
      this.corruptPuts -= 1;
      bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    }
    this.objects.set(key, bytes);
    if (this.afterPut) await this.afterPut();
    return { key };
  }

  async get(key: string) {
    this.gets += 1;
    const stored = this.objects.get(key);
    if (!stored) return null;
    const bytes = stored.slice();
    return {
      key,
      body: new Blob([bytes.buffer]).stream(),
      async arrayBuffer() { return bytes.slice().buffer; }
    };
  }
}

function database(): {
  sqlite: DatabaseSync;
  db: D1Database;
  faults: D1Faults;
} {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const faults = {
    failBatches: 0,
    databaseReceiptAt: plus(HORIZON_TIMES.kickoff_minus_60, 4_000),
    databaseReceiptTimes: [],
    databaseClockObservations: [],
    databaseClockAdvanceAfter: {}
  };
  sqlite.function("os13a_test_now", () => faults.databaseReceiptAt);
  for (const migration of [
    "drizzle/0013_engine_os_urgent.sql",
    "drizzle/0015_engine_os_origin_identity.sql",
    "drizzle/0018_engine_os_forecast_ledger.sql"
  ]) applySql(sqlite, migration, migration.includes("0018_engine_os_forecast_ledger"));
  const db = sqliteD1(sqlite, faults);
  D1_FAULTS.set(db as unknown as object, faults);
  return { sqlite, db, faults };
}

function plus(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

// Publication guards use SQLite's statement-time `now`. Most fixtures are
// anchored just behind the process clock while their deadline and lease remain
// ahead. This proves statement-time guards without making the suite expire.
const TEST_CLOCK_NOW_MS = Date.now();
const KICKOFF = new Date(TEST_CLOCK_NOW_MS + 15 * 60_000).toISOString();
const HORIZON_TIMES: Record<RequiredForecastHorizonId, string> = {
  weekly_tuesday_0730: new Date(TEST_CLOCK_NOW_MS - 50_000).toISOString(),
  kickoff_minus_120: new Date(TEST_CLOCK_NOW_MS - 45_000).toISOString(),
  kickoff_minus_90: new Date(TEST_CLOCK_NOW_MS - 40_000).toISOString(),
  kickoff_minus_60: new Date(TEST_CLOCK_NOW_MS - 35_000).toISOString(),
  kickoff_minus_15: new Date(TEST_CLOCK_NOW_MS - 30_000).toISOString()
};

const LATE_CLOCK_NOW_MS = TEST_CLOCK_NOW_MS;
const LATE_SCHEDULED = new Date(LATE_CLOCK_NOW_MS - 330_000).toISOString();
const LATE_KICKOFF = new Date(Date.parse(LATE_SCHEDULED) + 15 * 60_000).toISOString();
const LATE_INVOKED = new Date(LATE_CLOCK_NOW_MS - 60_000).toISOString();
const LATE_GENERATED = new Date(LATE_CLOCK_NOW_MS - 59_000).toISOString();
const LATE_PUBLICATION_REQUESTED = new Date(LATE_CLOCK_NOW_MS - 58_000).toISOString();
const LATE_DEADLINE = new Date(Date.parse(LATE_SCHEDULED) + 5 * 60_000).toISOString();
const AFTER_KICKOFF = new Date(TEST_CLOCK_NOW_MS - 20_000).toISOString();
const AFTER_KICKOFF_SCHEDULED = new Date(TEST_CLOCK_NOW_MS - 10_000).toISOString();
const FENCE_SCHEDULED = new Date(TEST_CLOCK_NOW_MS - 190_000).toISOString();

const ALL_HORIZONS = Object.keys(HORIZON_TIMES) as RequiredForecastHorizonId[];

function seedGame(sqlite: DatabaseSync, input: {
  suffix: string;
  horizons?: RequiredForecastHorizonId[];
  kickoff?: string;
  eligibilityReason?: "eligible" | "known_after_origin" | "pre_activation" |
    "after_kickoff" | "prior_origin_elapsed" | "earlier_origin_prohibited";
  scheduledAtByHorizon?: Partial<Record<RequiredForecastHorizonId, string>>;
  scheduleObservedAt?: string;
  originCreatedAt?: string;
  seasonType?: "REG" | "POST";
}): Map<RequiredForecastHorizonId, string> {
  const horizons = input.horizons ?? ALL_HORIZONS;
  const kickoff = input.kickoff ?? KICKOFF;
  const eligibilityReason = input.eligibilityReason ?? "eligible";
  const eligible = eligibilityReason === "eligible" ? 1 : 0;
  const scheduleObservedAt = input.scheduleObservedAt ?? "2026-08-25T00:00:00Z";
  const originCreatedAt = input.originCreatedAt ?? "2026-08-25T00:00:01Z";
  const seasonType = input.seasonType ?? "REG";
  const gameId = `2026_01_NE_SEA_${input.suffix}`;
  const revisionId = `${gameId}:schedule:v1`;
  sqlite.prepare(`INSERT INTO canonical_games (
    game_id, season, season_type, week, home_team, away_team, identity_status, created_at
  ) VALUES (?, 2026, ?, 1, 'SEA', 'NE', 'resolved', '2026-08-25T00:00:00Z')`)
    .run(gameId, seasonType);
  sqlite.prepare(`INSERT INTO game_schedule_revisions (
    revision_id, game_id, week, schedule_status, kickoff_utc, local_time_zone,
    observed_at, source_evidence_hash, source_row_hash
  ) VALUES (?, ?, 1, 'scheduled', ?, 'America/Los_Angeles',
    ?, ?, ?)`)
    .run(
      revisionId,
      gameId,
      kickoff,
      scheduleObservedAt,
      sha256Hex(`evidence:${input.suffix}`),
      sha256Hex(`row:${input.suffix}`)
    );
  const ids = new Map<RequiredForecastHorizonId, string>();
  for (const horizon of horizons) {
    const originId = `${gameId}:${horizon}:v1`;
    const scheduled = input.scheduledAtByHorizon?.[horizon] ?? HORIZON_TIMES[horizon];
    sqlite.prepare(`INSERT INTO forecast_origin_versions (
      origin_version_id, logical_origin_id, game_id, horizon_id, scheduled_for_utc,
      scheduled_for_local, kickoff_revision_id, scientific_eligibility, information_cutoff,
      eligible, eligibility_reason, activation_boundary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'os02a-fixture',
      ?)`).run(
      originId,
      `${gameId}:${horizon}`,
      gameId,
      horizon,
      scheduled,
      `${scheduled}[America/Los_Angeles]`,
      revisionId,
      horizon === "weekly_tuesday_0730" ? 1 : 0,
      horizon === "weekly_tuesday_0730"
        ? "completed_games_through_week_w_minus_1_at_origin"
        : "forecast_time",
      eligible,
      eligibilityReason,
      originCreatedAt
    );
    ids.set(horizon, originId);
  }
  return ids;
}

async function withholdingActivation(db: D1Database, suffix: string, overrides: {
  activatedAt?: string;
  firstOriginUtc?: string;
  firstWeek?: number;
  weekOneOriginComplete?: boolean;
} = {}) {
  const requestedActivation = overrides.activatedAt ?? "2026-08-26T00:00:00.000Z";
  const faults = D1_FAULTS.get(db as unknown as object);
  if (faults) faults.databaseReceiptAt = requestedActivation;
  return createOs13aQualificationActivation({
    db,
    activationBoundary: `os13a-withholding:${suffix}`,
    mode: "withholding_only",
    season: 2026,
    firstWeek: overrides.firstWeek ?? 1,
    activatedAt: requestedActivation,
    firstOriginUtc: overrides.firstOriginUtc ?? HORIZON_TIMES.weekly_tuesday_0730,
    weekOneOriginComplete: overrides.weekOneOriginComplete ?? true
  });
}

const HASHES = {
  runner: "1".repeat(64),
  code: "2".repeat(64),
  package: "3".repeat(64),
  config: "4".repeat(64),
  input: "5".repeat(64),
  feature: "6".repeat(64),
  target: "7".repeat(64)
};

function fixtureProvenance(bytes: Uint8Array) {
  const outputHash = sha256Hex(bytes);
  return {
    runnerHash: HASHES.runner,
    codeHash: HASHES.code,
    modelOrPackageHash: HASHES.package,
    configHash: HASHES.config,
    inputManifestHash: HASHES.input,
    featureSchemaHash: HASHES.feature,
    targetSchemaHash: HASHES.target,
    outputObjectHash: outputHash,
    outputObjectKey: forecastOutputObjectKey(outputHash)
  };
}

async function packageActivation(
  db: D1Database,
  suffix: string,
  firstOriginUtc = HORIZON_TIMES.weekly_tuesday_0730
) {
  const activationBoundary = `os13a-package:${suffix}`;
  const faults = D1_FAULTS.get(db as unknown as object);
  if (faults) faults.databaseReceiptAt = "2026-08-26T00:00:00.000Z";
  const qualification = await registerOs13aFixtureQualification({
    db,
    activationBoundary,
    packageId: `fixture-${suffix}`,
    packageHash: HASHES.package,
    runnerHash: HASHES.runner,
    codeHash: HASHES.code,
    modelHash: HASHES.package,
    configHash: HASHES.config,
    featureSchemaHash: HASHES.feature,
    targetSchemaHash: HASHES.target,
    qualifiedAt: "2026-08-26T00:00:00.000Z",
    qualificationEvidenceHash: "8".repeat(64)
  });
  if (faults) faults.databaseReceiptAt = "2026-08-26T00:00:01.000Z";
  const activation = await createOs13aQualificationActivation({
    db,
    activationBoundary,
    mode: "qualified_package",
    qualificationId: qualification.qualification_id,
    season: 2026,
    firstWeek: 1,
    activatedAt: "2026-08-26T00:00:01.000Z",
    firstOriginUtc,
    weekOneOriginComplete: true
  });
  return { activation, qualification };
}

function scalar(sqlite: DatabaseSync, sql: string): number {
  return Number((sqlite.prepare(sql).get() as { value: number }).value);
}

async function leaseFor(input: {
  db: D1Database;
  jobKey: string;
  invokedAt: string;
  owner?: string;
  token?: string;
}): Promise<ForecastLedgerJobLease> {
  const faults = D1_FAULTS.get(input.db as unknown as object);
  if (faults) faults.databaseReceiptAt = input.invokedAt;
  const lease = await claimOs13aLedgerJob({
    db: input.db,
    jobKey: input.jobKey,
    invokedAt: input.invokedAt,
    owner: input.owner ?? "worker-a",
    tokenFactory: () => input.token ?? "attempt-a"
  });
  if (!lease) throw new Error("Expected job lease");
  return lease;
}

function publication(input: {
  db: D1Database;
  faults: D1Faults;
  bucket: MemoryR2;
  lease: ForecastLedgerJobLease;
  generatedAt: string;
  receiptAt: string;
  receiptTimes?: string[];
  overrides?: Partial<ForecastLedgerPublicationInput>;
}): ForecastLedgerPublicationInput {
  const generated = Date.parse(input.generatedAt);
  input.faults.databaseReceiptAt = input.receiptAt;
  input.faults.databaseReceiptTimes = [...(input.receiptTimes ?? [])];
  input.faults.databaseClockObservations = [];
  input.faults.databaseClockAdvanceAfter = {};
  return {
    db: input.db,
    bucket: input.bucket as unknown as R2Bucket,
    lease: input.lease,
    evidenceAt: input.lease.invokedAt,
    generatedAt: input.generatedAt,
    publicationRequestedAt: new Date(generated + 1_000).toISOString(),
    ...input.overrides
  };
}

describe("OS-13A isolated D1/R2 forecast-ledger runtime", () => {
  it("materializes exactly five current heads and commits one timely no-package record per horizon without R2", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "five" });
    const activation = await withholdingActivation(db, "five");
    expect(activation.evidence_scope).toBe("partial_season_shadow");
    const materialized = await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    });
    expect(materialized).toMatchObject({ currentTimedHeads: 5, created: 5 });
    expect(new Set(materialized.jobKeys).size).toBe(5);
    const duplicate = await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:03.000Z"
    });
    expect(duplicate).toMatchObject({ currentTimedHeads: 5, created: 0 });

    const bucket = new MemoryR2();
    for (const [index, jobKey] of materialized.jobKeys.entries()) {
      const scheduled = (sqlite.prepare(`SELECT scheduled_trigger_at FROM forecast_ledger_jobs_v1
        WHERE job_key = ?`).get(jobKey) as { scheduled_trigger_at: string }).scheduled_trigger_at;
      const invokedAt = new Date(Date.parse(scheduled) + 1_000).toISOString();
      const lease = await leaseFor({
        db,
        jobKey,
        invokedAt,
        owner: `worker-${index}`,
        token: `attempt-${index}`
      });
      const result = await publishOs13aLedgerRecord(publication({
        db,
        faults,
        bucket,
        lease,
        generatedAt: new Date(Date.parse(scheduled) + 2_000).toISOString(),
        receiptAt: new Date(Date.parse(scheduled) + 4_000).toISOString()
      }));
      expect(result.record).toMatchObject({
        status: "withheld",
        withholdingReason: "no_eligible_package",
        timing: "timely",
        prospectiveEvidenceEligible: true,
        qualificationStream: "no_eligible_package"
      });
    }
    expect(bucket.puts).toBe(0);
    expect(bucket.gets).toBe(0);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(5);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_jobs_v1 WHERE state = 'completed'"))
      .toBe(5);
    expect(forecastLedgerRuntimeBoundary).toMatchObject({
      qualificationOnly: true,
      productionActivationAllowed: false,
      networkDispatches: 0,
      secretReads: 0
    });
    sqlite.close();
  });

  it("excludes non-regular-season canonical games from ledger materialization", async () => {
    const { sqlite, db } = database();
    seedGame(sqlite, {
      suffix: "postseason",
      horizons: ["kickoff_minus_60"],
      seasonType: "POST"
    });
    const activation = await withholdingActivation(db, "postseason", {
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_60
    });
    const result = await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    });
    expect(result).toEqual({ currentTimedHeads: 0, created: 0, jobKeys: [] });
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_jobs_v1")).toBe(0);
    sqlite.close();
  });

  it("rejects a caller-future qualification clock without mutating the ledger", async () => {
    const { sqlite, db, faults } = database();
    const observedAt = plus(HORIZON_TIMES.kickoff_minus_120, -20_000);
    faults.databaseReceiptAt = observedAt;
    await expect(registerOs13aFixtureQualification({
      db,
      activationBoundary: "os13a-package:future-qualification-clock",
      packageId: "fixture-future-qualification-clock",
      packageHash: HASHES.package,
      runnerHash: HASHES.runner,
      codeHash: HASHES.code,
      modelHash: HASHES.package,
      configHash: HASHES.config,
      featureSchemaHash: HASHES.feature,
      targetSchemaHash: HASHES.target,
      qualifiedAt: plus(observedAt, 1_000),
      qualificationEvidenceHash: "8".repeat(64)
    })).rejects.toThrow(ForecastLedgerAuthorityError);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_qualifications_v1")).toBe(0);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_events_v1")).toBe(0);
    sqlite.close();
  });

  it("rejects a caller-future activation clock without adding an activation or event", async () => {
    const { sqlite, db, faults } = database();
    const boundary = "os13a-package:future-activation-clock";
    const qualifiedAt = plus(HORIZON_TIMES.kickoff_minus_120, -30_000);
    faults.databaseReceiptAt = qualifiedAt;
    const qualification = await registerOs13aFixtureQualification({
      db,
      activationBoundary: boundary,
      packageId: "fixture-future-activation-clock",
      packageHash: HASHES.package,
      runnerHash: HASHES.runner,
      codeHash: HASHES.code,
      modelHash: HASHES.package,
      configHash: HASHES.config,
      featureSchemaHash: HASHES.feature,
      targetSchemaHash: HASHES.target,
      qualifiedAt,
      qualificationEvidenceHash: "8".repeat(64)
    });
    const beforeEvents = scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_events_v1");
    const observedAt = plus(HORIZON_TIMES.kickoff_minus_120, -20_000);
    faults.databaseReceiptAt = observedAt;
    await expect(createOs13aQualificationActivation({
      db,
      activationBoundary: boundary,
      mode: "qualified_package",
      qualificationId: qualification.qualification_id,
      season: 2026,
      firstWeek: 1,
      activatedAt: plus(observedAt, 1_000),
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_120,
      weekOneOriginComplete: false
    })).rejects.toThrow(ForecastLedgerAuthorityError);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_activations_v1")).toBe(0);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_events_v1"))
      .toBe(beforeEvents);
    sqlite.close();
  });

  it("rejects a pre-due caller-future claim without poisoning lease state", async () => {
    const { sqlite, db, faults } = database();
    const scheduled = plus(HORIZON_TIMES.kickoff_minus_15, 300_000);
    seedGame(sqlite, {
      suffix: "future-claim-clock",
      horizons: ["kickoff_minus_15"],
      scheduledAtByHorizon: { kickoff_minus_15: scheduled }
    });
    const activation = await withholdingActivation(db, "future-claim-clock", {
      firstOriginUtc: scheduled
    });
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    })).jobKeys;
    if (!jobKey) throw new Error("Missing future claim job");
    faults.databaseReceiptAt = plus(scheduled, -60_000);
    await expect(claimOs13aLedgerJob({
      db,
      jobKey,
      invokedAt: plus(scheduled, 1_000),
      owner: "future-clock-worker",
      tokenFactory: () => "future-clock-attempt"
    })).rejects.toThrow(ForecastLedgerAuthorityError);
    expect(sqlite.prepare(`SELECT state, fence_token, active_attempt_token_hash
      FROM forecast_ledger_jobs_v1 WHERE job_key = ?`).get(jobKey)).toEqual({
      state: "pending",
      fence_token: 0,
      active_attempt_token_hash: null
    });
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_attempts_v1")).toBe(0);
    sqlite.close();
  });

  it("rejects a caller-future renewal without extending or mutating its lease", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "future-renewal-clock", horizons: ["kickoff_minus_60"] });
    const activation = await withholdingActivation(db, "future-renewal-clock", {
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_60
    });
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    })).jobKeys;
    if (!jobKey) throw new Error("Missing renewal job");
    const lease = await leaseFor({
      db,
      jobKey,
      invokedAt: HORIZON_TIMES.kickoff_minus_60,
      token: "future-renewal-attempt"
    });
    const before = sqlite.prepare(`SELECT lease_expires_at, heartbeat_at
      FROM forecast_ledger_jobs_v1 WHERE job_key = ?`).get(jobKey);
    faults.databaseReceiptAt = plus(HORIZON_TIMES.kickoff_minus_60, 30_000);
    await expect(renewOs13aLedgerLease({
      db,
      lease,
      renewedAt: plus(HORIZON_TIMES.kickoff_minus_60, 60_000)
    })).rejects.toThrow(ForecastLedgerAuthorityError);
    expect(sqlite.prepare(`SELECT lease_expires_at, heartbeat_at
      FROM forecast_ledger_jobs_v1 WHERE job_key = ?`).get(jobKey)).toEqual(before);
    expect(scalar(sqlite, `SELECT count(*) AS value FROM forecast_ledger_events_v1
      WHERE event_type = 'lease_renewed'`)).toBe(0);
    sqlite.close();
  });

  it("stores the D1 job receipt instead of a caller creation clock", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "job-receipt-clock", horizons: ["kickoff_minus_60"] });
    const activation = await withholdingActivation(db, "job-receipt-clock", {
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_60
    });
    const authoritativeCreatedAt = plus(HORIZON_TIMES.kickoff_minus_60, -1_000);
    faults.databaseReceiptAt = authoritativeCreatedAt;
    const jobs = await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: plus(authoritativeCreatedAt, 60_000)
    });
    const jobKey = jobs.jobKeys[0];
    if (!jobKey) throw new Error("Missing clock-bound job");
    expect(sqlite.prepare(`SELECT created_at FROM forecast_ledger_jobs_v1
      WHERE job_key = ?`).get(jobKey)).toEqual({ created_at: authoritativeCreatedAt });
    expect(sqlite.prepare(`SELECT occurred_at, persisted_at FROM forecast_ledger_events_v1
      WHERE job_key = ? AND event_type = 'job_created'`).get(jobKey)).toEqual({
      occurred_at: authoritativeCreatedAt,
      persisted_at: authoritativeCreatedAt
    });
    sqlite.close();
  });

  it("rejects a duplicate package job with a conflicting immutable input manifest", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "manifest-collision", horizons: ["kickoff_minus_60"] });
    const { activation } = await packageActivation(
      db,
      "manifest-collision",
      HORIZON_TIMES.kickoff_minus_60
    );
    faults.databaseReceiptAt = plus(HORIZON_TIMES.kickoff_minus_60, -1_000);
    const first = await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: plus(HORIZON_TIMES.kickoff_minus_60, 60_000),
      expectedInputManifestHash: HASHES.input
    });
    faults.databaseReceiptAt = HORIZON_TIMES.kickoff_minus_60;
    await expect(materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: plus(HORIZON_TIMES.kickoff_minus_60, 120_000),
      expectedInputManifestHash: "9".repeat(64)
    })).rejects.toThrow("identity collision changed immutable schedule or provenance");
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_jobs_v1")).toBe(1);
    expect(sqlite.prepare(`SELECT expected_input_manifest_hash FROM forecast_ledger_jobs_v1
      WHERE job_key = ?`).get(first.jobKeys[0]!)).toEqual({
      expected_input_manifest_hash: HASHES.input
    });
    sqlite.close();
  });

  it("uses renewable fenced leases and makes an expired stale worker unable to publish", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, {
      suffix: "fence",
      horizons: ["kickoff_minus_60"],
      scheduledAtByHorizon: { kickoff_minus_60: FENCE_SCHEDULED }
    });
    const activation = await withholdingActivation(db, "fence", {
      firstOriginUtc: FENCE_SCHEDULED
    });
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    })).jobKeys;
    if (!jobKey) throw new Error("Missing job");
    const first = await leaseFor({
      db,
      jobKey,
      invokedAt: FENCE_SCHEDULED,
      owner: "worker-a",
      token: "fence-a"
    });
    faults.databaseReceiptAt = plus(FENCE_SCHEDULED, 1_000);
    expect(await claimOs13aLedgerJob({
      db,
      jobKey,
      invokedAt: plus(FENCE_SCHEDULED, 1_000),
      owner: "worker-b",
      tokenFactory: () => "fence-b-early"
    })).toBeNull();
    faults.databaseReceiptAt = plus(FENCE_SCHEDULED, 60_000);
    const renewed = await renewOs13aLedgerLease({
      db,
      lease: first,
      renewedAt: plus(FENCE_SCHEDULED, 60_000)
    });
    expect(renewed?.leaseExpiresAt).toBe(plus(FENCE_SCHEDULED, 180_000));
    const second = await leaseFor({
      db,
      jobKey,
      invokedAt: plus(FENCE_SCHEDULED, 180_000),
      owner: "worker-b",
      token: "fence-b"
    });
    expect(second).toMatchObject({ fence: 2, reclaimed: true });
    faults.databaseReceiptAt = plus(FENCE_SCHEDULED, 181_000);
    expect(await renewOs13aLedgerLease({
      db,
      lease: first,
      renewedAt: plus(FENCE_SCHEDULED, 181_000)
    })).toBeNull();
    const bucket = new MemoryR2();
    await expect(publishOs13aLedgerRecord(publication({
      db,
      faults,
      bucket,
      lease: first,
      generatedAt: plus(FENCE_SCHEDULED, 181_000),
      receiptAt: plus(FENCE_SCHEDULED, 183_000)
    }))).rejects.toThrow(ForecastLedgerAuthorityError);
    expect(bucket.puts).toBe(0);

    const committed = await publishOs13aLedgerRecord(publication({
      db,
      faults,
      bucket,
      lease: second,
      generatedAt: plus(FENCE_SCHEDULED, 181_000),
      receiptAt: plus(FENCE_SCHEDULED, 183_000)
    }));
    expect(committed.status).toBe("committed");
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_attempts_v1")).toBe(2);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(1);
    sqlite.close();
  });

  it("serializes overlapping claimers to one unique fenced attempt", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "overlap", horizons: ["kickoff_minus_60"] });
    const activation = await withholdingActivation(db, "overlap", {
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_60
    });
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    })).jobKeys;
    if (!jobKey) throw new Error("Missing job");
    faults.databaseReceiptAt = HORIZON_TIMES.kickoff_minus_60;
    const [left, right] = await Promise.all([
      claimOs13aLedgerJob({
        db,
        jobKey,
        invokedAt: HORIZON_TIMES.kickoff_minus_60,
        owner: "overlap-left",
        tokenFactory: () => "overlap-left"
      }),
      claimOs13aLedgerJob({
        db,
        jobKey,
        invokedAt: HORIZON_TIMES.kickoff_minus_60,
        owner: "overlap-right",
        tokenFactory: () => "overlap-right"
      })
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_attempts_v1")).toBe(1);
    expect(scalar(sqlite, `SELECT count(*) AS value FROM forecast_ledger_events_v1
      WHERE event_type = 'lease_acquired'`)).toBe(1);
    sqlite.close();
  });

  it("publishes arbitrary exact bytes before the pointer, recovers them offline, and deduplicates an exact retry", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "forecast", horizons: ["kickoff_minus_60"] });
    const { activation } = await packageActivation(db, "forecast");
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z",
      expectedInputManifestHash: HASHES.input
    })).jobKeys;
    if (!jobKey) throw new Error("Missing job");
    const lease = await leaseFor({
      db,
      jobKey,
      invokedAt: HORIZON_TIMES.kickoff_minus_60,
      token: "forecast-attempt"
    });
    const bytes = new Uint8Array([0, 255, 17, 44, 91, 0, 3]);
    const outputHash = sha256Hex(bytes);
    const provenance = {
      runnerHash: HASHES.runner,
      codeHash: HASHES.code,
      modelOrPackageHash: HASHES.package,
      configHash: HASHES.config,
      inputManifestHash: HASHES.input,
      featureSchemaHash: HASHES.feature,
      targetSchemaHash: HASHES.target,
      outputObjectHash: outputHash,
      outputObjectKey: forecastOutputObjectKey(outputHash)
    };
    const bucket = new MemoryR2();
    const request = publication({
      db,
      faults,
      bucket,
      lease,
      generatedAt: plus(HORIZON_TIMES.kickoff_minus_60, 1_000),
      receiptAt: plus(HORIZON_TIMES.kickoff_minus_60, 4_000),
      overrides: {
        requestedStatus: "forecast",
        requestedWithholdingReason: null,
        provenance,
        outputBytes: bytes
      }
    });
    const committed = await publishOs13aLedgerRecord(request);
    expect(committed).toMatchObject({ status: "committed", objectPublished: true, providerDispatches: 0 });
    const authoritativeReceipt = plus(HORIZON_TIMES.kickoff_minus_60, 4_000);
    expect(committed.record).toMatchObject({
      outputPublishedAt: authoritativeReceipt,
      outputVerifiedAt: authoritativeReceipt,
      persistenceRequestedAt: authoritativeReceipt,
      persistedAt: authoritativeReceipt
    });
    expect(faults.databaseClockObservations).toEqual([
      "preflight",
      "output_published",
      "output_verified",
      "persistence_requested",
      "persistence_receipt"
    ]);
    expect(bucket.objects.get(forecastOutputObjectKey(outputHash))).toEqual(bytes);
    expect(await recoverOs13aForecastOutput({
      db,
      bucket: bucket as unknown as R2Bucket,
      recordId: committed.record.recordId
    })).toEqual(bytes);
    const replay = await publishOs13aLedgerRecord(request);
    expect(replay).toMatchObject({ status: "deduplicated", objectPublished: false });
    expect(bucket.puts).toBe(1);
    expect(faults.databaseClockObservations).toHaveLength(5);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(1);
    await expect(publishOs13aLedgerRecord({
      ...request,
      publicationRequestedAt: plus(request.publicationRequestedAt, 1)
    })).rejects.toThrow("Retry intent differs");

    bucket.objects.set(forecastOutputObjectKey(outputHash), new Uint8Array([9, 9, 9]));
    await expect(recoverOs13aForecastOutput({
      db,
      bucket: bucket as unknown as R2Bucket,
      recordId: committed.record.recordId
    })).rejects.toThrow(ForecastLedgerIntegrityError);
    sqlite.close();
  });

  it("rejects a non-monotonic authoritative output clock before the D1 pointer", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "clock-order", horizons: ["kickoff_minus_60"] });
    const { activation } = await packageActivation(db, "clock-order");
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z",
      expectedInputManifestHash: HASHES.input
    })).jobKeys;
    if (!jobKey) throw new Error("Missing job");
    const lease = await leaseFor({
      db,
      jobKey,
      invokedAt: HORIZON_TIMES.kickoff_minus_60,
      token: "clock-order-attempt"
    });
    const generatedAt = plus(HORIZON_TIMES.kickoff_minus_60, 1_000);
    const bytes = new TextEncoder().encode("clock-order");
    const bucket = new MemoryR2();
    const request = publication({
      db,
      faults,
      bucket,
      lease,
      generatedAt,
      receiptAt: plus(HORIZON_TIMES.kickoff_minus_60, 6_000),
      receiptTimes: [
        plus(HORIZON_TIMES.kickoff_minus_60, 4_000),
        plus(HORIZON_TIMES.kickoff_minus_60, 3_000),
        plus(HORIZON_TIMES.kickoff_minus_60, 2_000),
        plus(HORIZON_TIMES.kickoff_minus_60, 5_000),
        plus(HORIZON_TIMES.kickoff_minus_60, 6_000)
      ],
      overrides: {
        requestedStatus: "forecast",
        requestedWithholdingReason: null,
        outputBytes: bytes,
        provenance: fixtureProvenance(bytes)
      }
    });
    await expect(publishOs13aLedgerRecord(request))
      .rejects.toThrow("output_verification_precedes_publication");
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(0);
    expect(bucket.puts).toBe(1);
    sqlite.close();
  });

  it("preserves D1 on failed/corrupt R2 and safely reuses an orphan after a pointer failure", async () => {
    async function fixture(suffix: string) {
      const setup = database();
      seedGame(setup.sqlite, { suffix, horizons: ["kickoff_minus_60"] });
      const { activation } = await packageActivation(setup.db, suffix);
      const [jobKey] = (await materializeOs13aLedgerJobs({
        db: setup.db,
        activationId: activation.activation_id,
        createdAt: "2026-08-26T00:00:02.000Z",
        expectedInputManifestHash: HASHES.input
      })).jobKeys;
      if (!jobKey) throw new Error("Missing job");
      const lease = await leaseFor({
        db: setup.db,
        jobKey,
        invokedAt: HORIZON_TIMES.kickoff_minus_60,
        token: `attempt-${suffix}`
      });
      const bytes = new TextEncoder().encode(`fixture:${suffix}`);
      const hash = sha256Hex(bytes);
      const bucket = new MemoryR2();
      const request = publication({
        db: setup.db,
        faults: setup.faults,
        bucket,
        lease,
        generatedAt: plus(HORIZON_TIMES.kickoff_minus_60, 1_000),
        receiptAt: plus(HORIZON_TIMES.kickoff_minus_60, 4_000),
        overrides: {
          requestedStatus: "forecast",
          requestedWithholdingReason: null,
          outputBytes: bytes,
          provenance: {
            runnerHash: HASHES.runner,
            codeHash: HASHES.code,
            modelOrPackageHash: HASHES.package,
            configHash: HASHES.config,
            inputManifestHash: HASHES.input,
            featureSchemaHash: HASHES.feature,
            targetSchemaHash: HASHES.target,
            outputObjectHash: hash,
            outputObjectKey: forecastOutputObjectKey(hash)
          }
        }
      });
      return { ...setup, bucket, request, hash };
    }

    const failedPut = await fixture("failed-put");
    failedPut.bucket.failPuts = 1;
    await expect(publishOs13aLedgerRecord(failedPut.request)).rejects.toThrow("injected R2");
    expect(scalar(failedPut.sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(0);
    failedPut.sqlite.close();

    const corruptPut = await fixture("corrupt-put");
    corruptPut.bucket.corruptPuts = 1;
    await expect(publishOs13aLedgerRecord(corruptPut.request))
      .rejects.toThrow(ForecastLedgerIntegrityError);
    expect(scalar(corruptPut.sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(0);
    corruptPut.sqlite.close();

    const failedPointer = await fixture("failed-pointer");
    failedPointer.faults.failBatches = 1;
    await expect(publishOs13aLedgerRecord(failedPointer.request))
      .rejects.toThrow("injected D1 batch failure");
    expect(failedPointer.bucket.objects.has(forecastOutputObjectKey(failedPointer.hash))).toBe(true);
    expect(scalar(failedPointer.sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(0);
    const retry = await publishOs13aLedgerRecord(failedPointer.request);
    expect(retry).toMatchObject({ status: "committed", objectPublished: false });
    expect(failedPointer.bucket.puts).toBe(1);
    failedPointer.sqlite.close();
  });

  it("turns missing or mismatched stored qualification provenance into withholding without touching R2", async () => {
    for (const variant of ["missing", "mismatch"] as const) {
      const { sqlite, db, faults } = database();
      seedGame(sqlite, { suffix: variant, horizons: ["kickoff_minus_60"] });
      const { activation } = await packageActivation(db, variant);
      const [jobKey] = (await materializeOs13aLedgerJobs({
        db,
        activationId: activation.activation_id,
        createdAt: "2026-08-26T00:00:02.000Z",
        expectedInputManifestHash: HASHES.input
      })).jobKeys;
      if (!jobKey) throw new Error("Missing job");
      const lease = await leaseFor({
        db,
        jobKey,
        invokedAt: HORIZON_TIMES.kickoff_minus_60,
        token: `attempt-${variant}`
      });
      const bytes = new TextEncoder().encode(variant);
      const hash = sha256Hex(bytes);
      const bucket = new MemoryR2();
      const complete = {
        runnerHash: HASHES.runner,
        codeHash: HASHES.code,
        modelOrPackageHash: HASHES.package,
        configHash: HASHES.config,
        inputManifestHash: HASHES.input,
        featureSchemaHash: HASHES.feature,
        targetSchemaHash: HASHES.target,
        outputObjectHash: hash,
        outputObjectKey: forecastOutputObjectKey(hash)
      };
      const result = await publishOs13aLedgerRecord(publication({
        db,
        faults,
        bucket,
        lease,
        generatedAt: plus(HORIZON_TIMES.kickoff_minus_60, 1_000),
        receiptAt: plus(HORIZON_TIMES.kickoff_minus_60, 4_000),
        overrides: {
          requestedStatus: "forecast",
          outputBytes: bytes,
          provenance: variant === "missing"
            ? { ...complete, runnerHash: undefined }
            : { ...complete, runnerHash: "a".repeat(64) }
        }
      }));
      expect(result.record).toMatchObject({
        status: "withheld",
        withholdingReason: variant === "missing" ? "provenance_incomplete" : "package_hash_mismatch"
      });
      expect(bucket.puts).toBe(0);
      expect(bucket.gets).toBe(0);
      sqlite.close();
    }
  });

  it("classifies the exact deadline as late and cannot retrospectively replace it", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, {
      suffix: "late",
      horizons: ["kickoff_minus_15"],
      kickoff: LATE_KICKOFF,
      scheduledAtByHorizon: { kickoff_minus_15: LATE_SCHEDULED }
    });
    const activation = await withholdingActivation(db, "late", {
      firstOriginUtc: LATE_SCHEDULED
    });
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    })).jobKeys;
    if (!jobKey) throw new Error("Missing job");
    const lease = await leaseFor({
      db,
      jobKey,
      invokedAt: LATE_INVOKED,
      token: "late-attempt"
    });
    const bucket = new MemoryR2();
    const late = await publishOs13aLedgerRecord(publication({
      db,
      faults,
      bucket,
      lease,
      generatedAt: LATE_GENERATED,
      receiptAt: LATE_DEADLINE,
      overrides: { publicationRequestedAt: LATE_PUBLICATION_REQUESTED }
    }));
    expect(late.record).toMatchObject({
      status: "withheld",
      withholdingReason: "late_origin_excluded",
      timing: "late",
      prospectiveEvidenceEligible: false
    });
    faults.databaseReceiptAt = plus(LATE_DEADLINE, 60_000);
    expect(await claimOs13aLedgerJob({
      db,
      jobKey,
      invokedAt: plus(LATE_DEADLINE, 60_000),
      owner: "backfill-worker",
      tokenFactory: () => "backfill-attempt"
    })).toBeNull();
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(1);
    sqlite.close();
  });

  it("uses the D1 receipt clock and ignores a caller's attempted persistence backdate", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, {
      suffix: "backdate",
      horizons: ["kickoff_minus_15"],
      kickoff: LATE_KICKOFF,
      scheduledAtByHorizon: { kickoff_minus_15: LATE_SCHEDULED }
    });
    const activation = await withholdingActivation(db, "backdate", {
      firstOriginUtc: LATE_SCHEDULED
    });
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    })).jobKeys;
    if (!jobKey) throw new Error("Missing job");
    const lease = await leaseFor({
      db,
      jobKey,
      invokedAt: LATE_INVOKED,
      token: "backdate-attempt"
    });
    const request = publication({
      db,
      faults,
      bucket: new MemoryR2(),
      lease,
      generatedAt: LATE_GENERATED,
      receiptAt: LATE_DEADLINE,
      overrides: { publicationRequestedAt: LATE_PUBLICATION_REQUESTED }
    });
    Object.assign(request as unknown as Record<string, unknown>, {
      outputPublishedAt: plus(LATE_GENERATED, 1_000),
      outputVerifiedAt: plus(LATE_GENERATED, 2_000),
      persistenceRequestedAt: plus(LATE_GENERATED, 3_000),
      persistedAt: plus(LATE_GENERATED, 4_000)
    });
    const result = await publishOs13aLedgerRecord(request);
    expect(result.record).toMatchObject({
      persistedAt: LATE_DEADLINE,
      timing: "late",
      withholdingReason: "late_origin_excluded",
      prospectiveEvidenceEligible: false
    });
    sqlite.close();
  });

  it("rejects a stale precommit D1 receipt and permits a fresh retry", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "stale-precommit", horizons: ["kickoff_minus_60"] });
    const activation = await withholdingActivation(db, "stale-precommit", {
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_60
    });
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    })).jobKeys;
    if (!jobKey) throw new Error("Missing stale-receipt job");
    const lease = await leaseFor({
      db,
      jobKey,
      invokedAt: HORIZON_TIMES.kickoff_minus_60,
      token: "stale-precommit-attempt"
    });
    const request = publication({
      db,
      faults,
      bucket: new MemoryR2(),
      lease,
      generatedAt: plus(HORIZON_TIMES.kickoff_minus_60, 1_000),
      receiptAt: plus(HORIZON_TIMES.kickoff_minus_60, 4_000)
    });
    faults.databaseClockAdvanceAfter.persistence_receipt =
      plus(HORIZON_TIMES.kickoff_minus_60, 20_000);
    await expect(publishOs13aLedgerRecord(request)).rejects.toThrow(
      "ledger publication requires exact provenance and the live fenced origin claim"
    );
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(0);
    expect(sqlite.prepare(`SELECT state, active_attempt_token_hash FROM forecast_ledger_jobs_v1
      WHERE job_key = ?`).get(jobKey)).toEqual({
      state: "running",
      active_attempt_token_hash: lease.attemptTokenHash
    });

    faults.databaseClockAdvanceAfter = {};
    faults.databaseReceiptAt = plus(HORIZON_TIMES.kickoff_minus_60, 21_000);
    const retry = await publishOs13aLedgerRecord(request);
    expect(retry.status).toBe("committed");
    expect(retry.record.persistedAt).toBe(plus(HORIZON_TIMES.kickoff_minus_60, 21_000));
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(1);
    sqlite.close();
  });

  it("rejects a conflicting forecast replay after an immutable withholding", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "intent-conflict", horizons: ["kickoff_minus_60"] });
    const activation = await withholdingActivation(db, "intent-conflict", {
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_60
    });
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    })).jobKeys;
    if (!jobKey) throw new Error("Missing job");
    const lease = await leaseFor({
      db,
      jobKey,
      invokedAt: HORIZON_TIMES.kickoff_minus_60,
      token: "intent-attempt"
    });
    const bucket = new MemoryR2();
    const base = publication({
      db,
      faults,
      bucket,
      lease,
      generatedAt: plus(HORIZON_TIMES.kickoff_minus_60, 1_000),
      receiptAt: plus(HORIZON_TIMES.kickoff_minus_60, 4_000)
    });
    await publishOs13aLedgerRecord(base);
    const bytes = new TextEncoder().encode("conflicting forecast");
    await expect(publishOs13aLedgerRecord({
      ...base,
      requestedStatus: "forecast",
      requestedWithholdingReason: null,
      outputBytes: bytes,
      provenance: fixtureProvenance(bytes)
    })).rejects.toThrow("Retry intent differs");
    expect(bucket.puts).toBe(0);
    expect(bucket.gets).toBe(0);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(1);
    sqlite.close();
  });

  it("lets D1 fencing reject a worker that loses its lease after R2 publication but before the pointer", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, {
      suffix: "post-r2-fence",
      horizons: ["kickoff_minus_60"],
      scheduledAtByHorizon: { kickoff_minus_60: FENCE_SCHEDULED }
    });
    const { activation } = await packageActivation(db, "post-r2-fence", FENCE_SCHEDULED);
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z",
      expectedInputManifestHash: HASHES.input
    })).jobKeys;
    if (!jobKey) throw new Error("Missing job");
    const stale = await leaseFor({
      db,
      jobKey,
      invokedAt: FENCE_SCHEDULED,
      token: "post-r2-stale"
    });
    const bytes = new TextEncoder().encode("post-r2-fence");
    const bucket = new MemoryR2();
    let successor: ForecastLedgerJobLease | null = null;
    bucket.afterPut = async () => {
      faults.databaseReceiptAt = plus(FENCE_SCHEDULED, 120_000);
      successor = await claimOs13aLedgerJob({
        db,
        jobKey,
        invokedAt: plus(FENCE_SCHEDULED, 120_000),
        owner: "worker-b",
        tokenFactory: () => "post-r2-successor"
      });
      bucket.afterPut = null;
    };
    const staleRequest = publication({
      db,
      faults,
      bucket,
      lease: stale,
      generatedAt: plus(FENCE_SCHEDULED, 1_000),
      receiptAt: plus(FENCE_SCHEDULED, 4_000),
      overrides: {
        requestedStatus: "forecast",
        requestedWithholdingReason: null,
        outputBytes: bytes,
        provenance: fixtureProvenance(bytes)
      }
    });
    await expect(publishOs13aLedgerRecord(staleRequest)).rejects.toThrow();
    expect(successor).not.toBeNull();
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(0);
    expect(bucket.objects.has(forecastOutputObjectKey(sha256Hex(bytes)))).toBe(true);

    faults.databaseReceiptAt = plus(FENCE_SCHEDULED, 124_000);
    const committed = await publishOs13aLedgerRecord({
      ...staleRequest,
      lease: successor!,
      evidenceAt: plus(FENCE_SCHEDULED, 120_000),
      generatedAt: plus(FENCE_SCHEDULED, 121_000),
      publicationRequestedAt: plus(FENCE_SCHEDULED, 122_000)
    });
    expect(committed).toMatchObject({ status: "committed", objectPublished: false });
    expect(bucket.puts).toBe(1);
    sqlite.close();
  });

  it("reclassifies a forecast as late when R2 verification crosses the strict deadline", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, {
      suffix: "slow-r2",
      horizons: ["kickoff_minus_15"],
      kickoff: LATE_KICKOFF,
      scheduledAtByHorizon: { kickoff_minus_15: LATE_SCHEDULED }
    });
    const { activation } = await packageActivation(db, "slow-r2", LATE_SCHEDULED);
    const [jobKey] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z",
      expectedInputManifestHash: HASHES.input
    })).jobKeys;
    if (!jobKey) throw new Error("Missing job");
    const lease = await leaseFor({
      db,
      jobKey,
      invokedAt: LATE_INVOKED,
      token: "slow-r2-attempt"
    });
    const bytes = new TextEncoder().encode("slow-r2-deadline");
    const bucket = new MemoryR2();
    bucket.afterPut = async () => {
      faults.databaseReceiptAt = LATE_DEADLINE;
      bucket.afterPut = null;
    };
    const result = await publishOs13aLedgerRecord(publication({
      db,
      faults,
      bucket,
      lease,
      generatedAt: LATE_GENERATED,
      receiptAt: plus(LATE_DEADLINE, -1_000),
      overrides: {
        requestedStatus: "forecast",
        requestedWithholdingReason: null,
        publicationRequestedAt: LATE_PUBLICATION_REQUESTED,
        outputBytes: bytes,
        provenance: fixtureProvenance(bytes)
      }
    }));
    expect(result).toMatchObject({ objectPublished: true });
    expect(result.record).toMatchObject({
      status: "withheld",
      withholdingReason: "late_origin_excluded",
      timing: "late",
      prospectiveEvidenceEligible: false,
      outputObjectKey: null
    });
    expect(bucket.objects.has(forecastOutputObjectKey(sha256Hex(bytes)))).toBe(true);
    sqlite.close();
  });

  it.each([
    ["known_after_origin", "schedule_unavailable_at_origin", HORIZON_TIMES.kickoff_minus_60,
      plus(HORIZON_TIMES.kickoff_minus_60, 2_000),
      plus(HORIZON_TIMES.kickoff_minus_60, 3_000),
      plus(HORIZON_TIMES.kickoff_minus_60, 5_000)],
    ["pre_activation", "late_origin_excluded", HORIZON_TIMES.kickoff_minus_60,
      HORIZON_TIMES.kickoff_minus_60, plus(HORIZON_TIMES.kickoff_minus_60, 1_000),
      plus(HORIZON_TIMES.kickoff_minus_60, 4_000)],
    ["prior_origin_elapsed", "late_origin_excluded", HORIZON_TIMES.kickoff_minus_60,
      HORIZON_TIMES.kickoff_minus_60, plus(HORIZON_TIMES.kickoff_minus_60, 1_000),
      plus(HORIZON_TIMES.kickoff_minus_60, 4_000)],
    ["earlier_origin_prohibited", "late_origin_excluded", HORIZON_TIMES.kickoff_minus_60,
      HORIZON_TIMES.kickoff_minus_60, plus(HORIZON_TIMES.kickoff_minus_60, 1_000),
      plus(HORIZON_TIMES.kickoff_minus_60, 4_000)],
    ["after_kickoff", "late_origin_excluded", AFTER_KICKOFF_SCHEDULED,
      AFTER_KICKOFF_SCHEDULED, plus(AFTER_KICKOFF_SCHEDULED, 1_000),
      plus(AFTER_KICKOFF_SCHEDULED, 4_000)]
  ] as const)("materializes timed ineligible reason %s as permanent %s", async (
    eligibilityReason,
    expectedReason,
    scheduledAt,
    invokedAt,
    generatedAt,
    receiptAt
  ) => {
    const { sqlite, db, faults } = database();
    const suffix = eligibilityReason.replaceAll("_", "-");
    seedGame(sqlite, {
      suffix,
      horizons: ["kickoff_minus_60"],
      kickoff: eligibilityReason === "after_kickoff" ? AFTER_KICKOFF : KICKOFF,
      eligibilityReason,
      scheduledAtByHorizon: { kickoff_minus_60: scheduledAt },
      scheduleObservedAt: eligibilityReason === "known_after_origin"
        ? plus(HORIZON_TIMES.kickoff_minus_60, 1_000)
        : "2026-08-25T00:00:00.000Z",
      originCreatedAt: eligibilityReason === "known_after_origin"
        ? plus(HORIZON_TIMES.kickoff_minus_60, 2_000)
        : "2026-08-25T00:00:01.000Z"
    });
    const activation = await withholdingActivation(db, suffix, {
      firstOriginUtc: scheduledAt
    });
    const materialized = await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    });
    expect(materialized).toMatchObject({ currentTimedHeads: 1, created: 1 });
    const jobKey = materialized.jobKeys[0]!;
    const lease = await leaseFor({
      db,
      jobKey,
      invokedAt,
      token: `${suffix}-attempt`
    });
    const result = await publishOs13aLedgerRecord(publication({
      db,
      faults,
      bucket: new MemoryR2(),
      lease,
      generatedAt,
      receiptAt
    }));
    expect(result.record).toMatchObject({
      status: "withheld",
      withholdingReason: expectedReason,
      timing: "late",
      prospectiveEvidenceEligible: false
    });
    sqlite.close();
  });

  it("rejects a package qualification created after its proposed activation", async () => {
    const { sqlite, db, faults } = database();
    seedGame(sqlite, { suffix: "qualification-time", horizons: ["kickoff_minus_120"] });
    const boundary = "os13a-package:qualification-time";
    faults.databaseReceiptAt = plus(HORIZON_TIMES.kickoff_minus_120, -10_000);
    const qualification = await registerOs13aFixtureQualification({
      db,
      activationBoundary: boundary,
      packageId: "fixture-qualification-time",
      packageHash: HASHES.package,
      runnerHash: HASHES.runner,
      codeHash: HASHES.code,
      modelHash: HASHES.package,
      configHash: HASHES.config,
      featureSchemaHash: HASHES.feature,
      targetSchemaHash: HASHES.target,
      qualifiedAt: plus(HORIZON_TIMES.kickoff_minus_120, -10_000),
      qualificationEvidenceHash: "8".repeat(64)
    });
    faults.databaseReceiptAt = plus(HORIZON_TIMES.kickoff_minus_120, -20_000);
    await expect(createOs13aQualificationActivation({
      db,
      activationBoundary: boundary,
      mode: "qualified_package",
      qualificationId: qualification.qualification_id,
      season: 2026,
      firstWeek: 1,
      activatedAt: plus(HORIZON_TIMES.kickoff_minus_120, -20_000),
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_120,
      weekOneOriginComplete: false
    })).rejects.toThrow("Qualification must be immutable before activation");
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_activations_v1")).toBe(0);
    sqlite.close();
  });

  it("revokes a superseded origin claim and materializes only the new current head", async () => {
    const { sqlite, db, faults } = database();
    const ids = seedGame(sqlite, { suffix: "supersede", horizons: ["kickoff_minus_60"] });
    const oldOrigin = ids.get("kickoff_minus_60");
    if (!oldOrigin) throw new Error("Missing old origin");
    const activation = await withholdingActivation(db, "supersede", {
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_60
    });
    const [oldJob] = (await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: "2026-08-26T00:00:02.000Z"
    })).jobKeys;
    if (!oldJob) throw new Error("Missing old job");
    const staleLease = await leaseFor({
      db,
      jobKey: oldJob,
      invokedAt: HORIZON_TIMES.kickoff_minus_60,
      token: "superseded-attempt"
    });

    const gameId = "2026_01_NE_SEA_supersede";
    const oldRevision = `${gameId}:schedule:v1`;
    const newRevision = `${gameId}:schedule:v2`;
    const newKickoff = plus(KICKOFF, 30 * 60_000);
    const newScheduled = plus(HORIZON_TIMES.kickoff_minus_60, 30 * 60_000);
    sqlite.prepare(`INSERT INTO game_schedule_revisions (
      revision_id, game_id, week, schedule_status, kickoff_utc, local_time_zone,
      observed_at, source_evidence_hash, source_row_hash, supersedes_revision_id
    ) VALUES (?, ?, 1, 'scheduled', ?, 'America/Los_Angeles', ?, ?, ?, ?)`)
      .run(
        newRevision,
        gameId,
        newKickoff,
        plus(HORIZON_TIMES.kickoff_minus_60, 1_000),
        "a".repeat(64),
        "b".repeat(64),
        oldRevision
      );
    const newOrigin = `${gameId}:kickoff_minus_60:v2`;
    sqlite.prepare(`INSERT INTO forecast_origin_versions (
      origin_version_id, logical_origin_id, game_id, horizon_id, scheduled_for_utc,
      scheduled_for_local, kickoff_revision_id, scientific_eligibility, information_cutoff,
      eligible, eligibility_reason, activation_boundary, supersedes_origin_version_id, created_at
    ) VALUES (?, ?, ?, 'kickoff_minus_60', ?, ?, ?, 0, 'forecast_time', 1, 'eligible',
      'os02a-fixture-v2', ?, ?)`).run(
      newOrigin,
      `${gameId}:kickoff_minus_60`,
      gameId,
      newScheduled,
      `${newScheduled}[America/Los_Angeles]`,
      newRevision,
      oldOrigin,
      plus(HORIZON_TIMES.kickoff_minus_60, 2_000)
    );

    const reconciliation = await reconcileOs13aSupersededJobs({
      db,
      activationId: activation.activation_id,
      observedAt: plus(HORIZON_TIMES.kickoff_minus_60, 2_500)
    });
    expect(reconciliation).toEqual({ observed: 1, invalidated: 1 });
    expect(sqlite.prepare(`SELECT state FROM forecast_ledger_jobs_v1 WHERE job_key = ?`)
      .get(oldJob)).toEqual({ state: "invalidated" });
    expect(scalar(sqlite, `SELECT count(*) AS value FROM forecast_ledger_events_v1
      WHERE event_type = 'origin_superseded'`)).toBe(1);

    const bucket = new MemoryR2();
    await expect(publishOs13aLedgerRecord(publication({
      db,
      faults,
      bucket,
      lease: staleLease,
      generatedAt: plus(HORIZON_TIMES.kickoff_minus_60, 3_000),
      receiptAt: plus(HORIZON_TIMES.kickoff_minus_60, 5_000)
    }))).rejects.toThrow("origin_is_not_current_head");
    const refreshed = await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: plus(HORIZON_TIMES.kickoff_minus_60, 3_000)
    });
    expect(refreshed).toMatchObject({ currentTimedHeads: 1, created: 1 });
    expect(refreshed.jobKeys[0]).not.toBe(oldJob);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM forecast_ledger_records_v1")).toBe(0);
    sqlite.close();
  });

  it("labels activation after the Week 1 full-season boundary as partial-season evidence", async () => {
    const { sqlite, db } = database();
    seedGame(sqlite, { suffix: "partial", horizons: ["kickoff_minus_120"] });
    const activation = await withholdingActivation(db, "partial", {
      activatedAt: plus(HORIZON_TIMES.kickoff_minus_120, -10_000),
      firstOriginUtc: HORIZON_TIMES.kickoff_minus_120,
      firstWeek: 1,
      weekOneOriginComplete: false
    });
    expect(activation.evidence_scope).toBe("partial_season_shadow");
    const jobs = await materializeOs13aLedgerJobs({
      db,
      activationId: activation.activation_id,
      createdAt: plus(HORIZON_TIMES.kickoff_minus_120, -5_000)
    });
    expect(jobs).toMatchObject({ currentTimedHeads: 1, created: 1 });
    sqlite.close();
  });

  it("awards full-season scope only to the exact frozen Week 1 first origin", async () => {
    const { sqlite, db } = database();
    const activation = await withholdingActivation(db, "full-scope", {
      activatedAt: "2026-09-08T14:29:00.000Z",
      firstOriginUtc: "2026-09-08T14:30:00.000Z",
      firstWeek: 1,
      weekOneOriginComplete: true
    });
    expect(activation.evidence_scope).toBe("full_season_shadow");
    sqlite.close();
  });
});
