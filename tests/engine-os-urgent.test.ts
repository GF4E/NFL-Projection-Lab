import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import scheduleManifest from "../config/2026-nfl-schedule.v1.json";

vi.mock("../db", () => ({
  getD1: () => {
    throw new Error("Tests must inject D1 explicitly");
  }
}));
import {
  assessOddsQuota,
  buildForecastLedgerRecord,
  buildRawCaptureManifest,
  deterministicEngineJobKey,
  priorWeekEvidenceOnly,
  redactHttpRequest,
  tuesdayForecastOrigin,
  type ForecastProvenance
} from "@/domain/engine-os";
import { sha256Hex } from "@/domain/hash";
import { storeRawCapture, storeRawCaptureStream, verifyStoredRawCapture } from "@/server/engine-os/capture";
import {
  acquireEngineJobLease,
  finishEngineJob,
  seedCanonicalGameOrigin
} from "@/server/engine-os/ledger";
import { refreshCompleteSlateMainlines } from "@/server/odds-automation";
import { bootstrapOddsQuotaState, recordOddsQuota } from "@/server/odds-quota";

const completeProvenance: ForecastProvenance = {
  runnerHash: sha256Hex("runner"),
  codeHash: sha256Hex("code"),
  packageHash: sha256Hex("package"),
  configHash: sha256Hex("config"),
  inputManifestHash: sha256Hex("inputs"),
  featureSchemaHash: sha256Hex("features"),
  targetSchemaHash: sha256Hex("targets"),
  outputObjectKey: "forecasts/output",
  outputObjectHash: sha256Hex("output")
};

class MemoryR2 {
  readonly objects = new Map<string, Uint8Array>();
  puts = 0;

  async head(key: string) {
    return this.objects.has(key) ? { key } : null;
  }

  async put(key: string, value: Uint8Array | ReadableStream) {
    this.puts += 1;
    if (value instanceof Uint8Array) {
      this.objects.set(key, value.slice());
    } else {
      const reader = value.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = result.value as Uint8Array;
        chunks.push(chunk);
        length += chunk.byteLength;
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      this.objects.set(key, bytes);
    }
    return { key };
  }

  async get(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      body: new Blob([bytes.slice().buffer]).stream(),
      async arrayBuffer() {
        return bytes.slice().buffer;
      }
    };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function noOpD1(): D1Database {
  const statement = {
    bind() { return this; },
    async run() { return { meta: { changes: 1 } }; },
    async first() { return null; },
    async all() { return { results: [], success: true, meta: {} }; },
    async raw() { return []; }
  };
  return {
    prepare() { return statement; },
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      return Promise.all(statements.map((item) => item.run()));
    },
    async exec() { return { count: 0, duration: 0 }; },
    async dump() { return new ArrayBuffer(0); }
  } as unknown as D1Database;
}

function sqliteD1(db: DatabaseSync): D1Database {
  type TestSqlValue = string | number | bigint | Uint8Array | null;
  function prepare(sql: string) {
    let parameters: TestSqlValue[] = [];
    return {
      bind(...values: unknown[]) {
        parameters = values as TestSqlValue[];
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
  const sql = readFileSync(resolve(process.cwd(), filename), "utf8")
    .replaceAll("--> statement-breakpoint", "");
  db.exec(sql);
}

describe("Engine OS urgent evidence and origin contracts", () => {
  it("redacts the exposed credential while retaining a stable public request identity", () => {
    const request = redactHttpRequest({
      url: "https://api.the-odds-api.com/v4/sports/nfl/odds?apiKey=do-not-store&regions=us&markets=spreads"
    });
    expect(JSON.stringify(request)).not.toContain("do-not-store");
    expect(request.url).toBe("https://api.the-odds-api.com/v4/sports/nfl/odds");
    expect(request.publicQuery).toEqual({ markets: ["spreads"], regions: ["us"] });
    expect(request.redactedQueryKeys).toEqual(["apiKey"]);
    expect(() => redactHttpRequest({ url: "https://example.test/token/do-not-store/data" }))
      .toThrow(/Credential-bearing URL paths/);
  });

  it("content-addresses exact response bytes and deduplicates identical R2 objects", async () => {
    const bytes = new TextEncoder().encode("{\"line\":-2.5}\n");
    const request = redactHttpRequest({ url: "https://example.test/data?apiKey=secret&regions=us" });
    const built = buildRawCaptureManifest({
      idempotencyKey: "scheduled:one",
      provider: "test-provider",
      dataset: "odds",
      request,
      responseBytes: bytes,
      receivedAt: "2026-08-25T12:00:00.000Z",
      sourceSchemaVersion: "test.v1",
      licenseId: "test-license"
    });
    expect(built.manifest.responseSha256).toBe(sha256Hex(bytes));
    expect(built.manifest.responseObjectKey).toContain(built.manifest.responseSha256);
    expect(new TextDecoder().decode(built.sidecarBytes)).not.toContain("secret");

    const bucket = new MemoryR2();
    const first = await storeRawCapture({
      db: noOpD1(),
      bucket: bucket as unknown as R2Bucket,
      idempotencyKey: "scheduled:one",
      provider: "test-provider",
      dataset: "odds",
      request,
      responseBytes: bytes,
      receivedAt: "2026-08-25T12:00:00.000Z",
      sourceSchemaVersion: "test.v1",
      licenseId: "test-license"
    });
    const second = await storeRawCapture({
      db: noOpD1(),
      bucket: bucket as unknown as R2Bucket,
      idempotencyKey: "scheduled:one",
      provider: "test-provider",
      dataset: "odds",
      request,
      responseBytes: bytes,
      receivedAt: "2026-08-25T12:00:00.000Z",
      sourceSchemaVersion: "test.v1",
      licenseId: "test-license"
    });
    expect(first.deduplicatedResponse).toBe(false);
    expect(second.deduplicatedResponse).toBe(true);
    expect(bucket.puts).toBe(2);
    await expect(verifyStoredRawCapture({
      bucket: bucket as unknown as R2Bucket,
      responseObjectKey: first.manifest.responseObjectKey,
      responseSha256: first.manifest.responseSha256,
      sidecarObjectKey: first.sidecarObjectKey,
      sidecarSha256: first.sidecarSha256
    })).resolves.toBe(true);
  });

  it("deduplicates bytes across capture horizons without collapsing capture events", async () => {
    const db = new DatabaseSync(":memory:");
    applySql(db, "drizzle/0013_engine_os_urgent.sql");
    const d1 = sqliteD1(db);
    const bucket = new MemoryR2();
    const common = {
      db: d1,
      bucket: bucket as unknown as R2Bucket,
      provider: "test-provider",
      dataset: "odds" as const,
      request: redactHttpRequest({ url: "https://example.test/data?regions=us" }),
      responseBytes: new TextEncoder().encode("same exact response"),
      sourceSchemaVersion: "test.v1",
      licenseId: "test-license"
    };
    const first = await storeRawCapture({
      ...common,
      idempotencyKey: "opener",
      receivedAt: "2026-09-06T01:00:00Z"
    });
    const second = await storeRawCapture({
      ...common,
      idempotencyKey: "origin",
      receivedAt: "2026-09-08T14:30:00Z"
    });
    expect(first.manifest.captureId).not.toBe(second.manifest.captureId);
    expect(first.manifest.responseObjectKey).toBe(second.manifest.responseObjectKey);
    expect(db.prepare("SELECT count(*) AS count FROM source_capture_manifests").get()).toEqual({ count: 2 });
    await expect(storeRawCapture({
      ...common,
      idempotencyKey: "opener",
      receivedAt: "2026-09-06T01:00:00Z",
      responseBytes: new TextEncoder().encode("changed response")
    })).rejects.toThrow(/idempotency key resolved to different evidence/);
    db.close();
  });

  it("streams large raw evidence through staging without materializing a second response buffer", async () => {
    const db = new DatabaseSync(":memory:");
    applySql(db, "drizzle/0013_engine_os_urgent.sql");
    const bucket = new MemoryR2();
    const encoder = new TextEncoder();
    const expected = encoder.encode("chunk-one|chunk-two|chunk-three");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("chunk-one|"));
        controller.enqueue(encoder.encode("chunk-two|"));
        controller.enqueue(encoder.encode("chunk-three"));
        controller.close();
      }
    });
    const stored = await storeRawCaptureStream({
      db: sqliteD1(db),
      bucket: bucket as unknown as R2Bucket,
      idempotencyKey: "streamed-pbp",
      provider: "nflverse",
      dataset: "play_by_play",
      request: redactHttpRequest({ url: "https://example.test/pbp.csv.gz" }),
      responseStream: stream,
      validFromAtReceipt: true,
      sourceSchemaVersion: "test.pbp.v1",
      licenseId: "test-license"
    });
    expect(stored.manifest.responseSha256).toBe(sha256Hex(expected));
    expect(stored.manifest.responseBytes).toBe(expected.byteLength);
    expect(stored.manifest.validFrom).toBe(stored.manifest.receivedAt);
    expect([...bucket.objects.keys()].some((key) => key.startsWith("staging/"))).toBe(false);
    db.close();
  });

  it("bootstraps blank quota state only from a fresh, reconciled operator attestation", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE odds_quota_state (
      provider text PRIMARY KEY NOT NULL, used integer NOT NULL, remaining integer NOT NULL,
      last_cost integer NOT NULL, updated_at text NOT NULL
    )`);
    applySql(db, "drizzle/0013_engine_os_urgent.sql");
    applySql(db, "drizzle/0014_odds_quota_reservations.sql");
    const observedAt = new Date().toISOString();
    await expect(bootstrapOddsQuotaState({
      used: 12,
      remaining: 488,
      observedAt,
      credentialGenerationId: "rotation-2026-08-25-r2",
      operatorAttestation: "verified_against_provider_dashboard"
    }, sqliteD1(db))).resolves.toMatchObject({ used: 12, remaining: 488, lastCost: 0 });
    await expect(bootstrapOddsQuotaState({
      used: 12,
      remaining: 488,
      observedAt,
      credentialGenerationId: "rotation-2026-08-25-r2",
      operatorAttestation: "verified_against_provider_dashboard"
    }, sqliteD1(db))).rejects.toThrow(/did not establish/);
    expect(db.prepare("SELECT count(*) AS count FROM odds_quota_events").get()).toEqual({ count: 1 });
    db.close();
  });

  it("creates DST-correct Tuesday origins and rejects same-week evidence", () => {
    const daylight = tuesdayForecastOrigin("game-one", "2026-09-13T20:05:00.000Z");
    const standard = tuesdayForecastOrigin("game-two", "2026-12-13T21:25:00.000Z");
    expect(daylight.scheduledForUtc).toBe("2026-09-08T14:30:00.000Z");
    expect(standard.scheduledForUtc).toBe("2026-12-08T15:30:00.000Z");
    expect(priorWeekEvidenceOnly({ forecastSeason: 2026, forecastWeek: 3, evidenceSeason: 2026, evidenceWeek: 2 })).toBe(true);
    expect(priorWeekEvidenceOnly({ forecastSeason: 2026, forecastWeek: 3, evidenceSeason: 2026, evidenceWeek: 3 })).toBe(false);
    expect(deterministicEngineJobKey({ job: "forecast", scheduledFor: daylight.scheduledForUtc, gameId: "game-one" }))
      .toBe(deterministicEngineJobKey({ job: "forecast", scheduledFor: daylight.scheduledForUtc, gameId: "game-one" }));
  });

  it("fails quota preflight closed and preserves essential capacity", () => {
    const policy = {
      alertAt: 400,
      nonessentialCeiling: 400,
      hardCeiling: 450,
      stateMaxAgeMinutes: 1450,
      monthlyPlanCredits: 500
    };
    const now = "2026-09-08T14:30:00.000Z";
    expect(assessOddsQuota({ state: null, requestCost: 3, essential: true, now, policy })).toMatchObject({
      allowed: false,
      reason: "missing_state"
    });
    expect(assessOddsQuota({
      state: { used: 399, remaining: 101, lastCost: 3, updatedAt: now },
      requestCost: 3,
      essential: false,
      now,
      policy
    })).toMatchObject({ allowed: false, reason: "nonessential_reserve" });
    expect(assessOddsQuota({
      state: { used: 399, remaining: 101, lastCost: 3, updatedAt: now },
      requestCost: 3,
      essential: true,
      now,
      policy
    })).toMatchObject({ allowed: true, projectedUsed: 402, alert: true });
    expect(assessOddsQuota({
      state: { used: 449, remaining: 51, lastCost: 3, updatedAt: now },
      requestCost: 3,
      essential: true,
      now,
      policy
    })).toMatchObject({ allowed: false, reason: "hard_ceiling" });
    expect(assessOddsQuota({
      state: { used: 300, remaining: 200, lastCost: 3, updatedAt: "2026-09-05T14:30:00.000Z" },
      requestCost: 3,
      essential: true,
      now,
      policy
    })).toMatchObject({ allowed: false, reason: "stale_state" });
  });

  it("preserves exact charged response bytes and quota before rejecting malformed odds", async () => {
    const db = new DatabaseSync(":memory:");
    applySql(db, "drizzle/0004_player_prop_decision_board.sql");
    applySql(db, "drizzle/0013_engine_os_urgent.sql");
    applySql(db, "drizzle/0014_odds_quota_reservations.sql");
    const observedAt = new Date().toISOString();
    await bootstrapOddsQuotaState({
      used: 9,
      remaining: 491,
      observedAt,
      credentialGenerationId: "rotation-2026-08-25-r2",
      operatorAttestation: "verified_against_provider_dashboard"
    }, sqliteD1(db));
    const rawBytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x22, 0x62, 0x61, 0x64, 0x22, 0x3a, 0x7d]);
    const bucket = new MemoryR2();

    await expect(refreshCompleteSlateMainlines({
      apiKey: "redacted-test-key",
      matchups: [],
      db: sqliteD1(db),
      fetcher: async () => new Response(rawBytes, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-requests-used": "12",
          "x-requests-remaining": "488",
          "x-requests-last": "3"
        }
      }),
      snapshotKey: "charged-but-malformed",
      fetchedAt: observedAt,
      requestClass: "kickoff_minus_15",
      futureReserveCredits: 0,
      quotaPlanHash: scheduleManifest.quotaPlanSha256,
      evidenceBucket: bucket as unknown as R2Bucket
    })).rejects.toThrow();

    const manifest = db.prepare(`SELECT response_object_key, response_sha256, response_bytes
      FROM source_capture_manifests WHERE idempotency_key = 'charged-but-malformed'`).get() as {
        response_object_key: string;
        response_sha256: string;
        response_bytes: number;
      };
    expect(manifest.response_sha256).toBe(sha256Hex(rawBytes));
    expect(manifest.response_bytes).toBe(rawBytes.byteLength);
    expect(bucket.objects.get(manifest.response_object_key)).toEqual(rawBytes);
    expect(db.prepare(`SELECT used, remaining, last_cost, response_capture_id IS NOT NULL AS linked
      FROM odds_quota_events WHERE request_key = 'charged-but-malformed'`).get())
      .toEqual({ used: 12, remaining: 488, last_cost: 3, linked: 1 });
    expect(db.prepare(`SELECT status, failure_code FROM source_capture_heartbeats
      WHERE source_key = 'the-odds-api:odds'`).get())
      .toEqual({ status: "stale", failure_code: "schema_invalid" });

    const errorBytes = new TextEncoder().encode('{"message":"rate limited"}\n');
    await expect(refreshCompleteSlateMainlines({
      apiKey: "redacted-test-key",
      matchups: [],
      db: sqliteD1(db),
      fetcher: async () => new Response(errorBytes, {
        status: 429,
        headers: {
          "content-type": "application/json",
          "x-requests-used": "15",
          "x-requests-remaining": "485",
          "x-requests-last": "3"
        }
      }),
      snapshotKey: "charged-http-error",
      fetchedAt: new Date(Date.now() + 1_000).toISOString(),
      requestClass: "kickoff_minus_15",
      futureReserveCredits: 0,
      quotaPlanHash: scheduleManifest.quotaPlanSha256,
      evidenceBucket: bucket as unknown as R2Bucket
    })).rejects.toThrow(/HTTP 429/);
    expect(db.prepare(`SELECT response_sha256 FROM source_capture_manifests
      WHERE idempotency_key = 'charged-http-error'`).get())
      .toEqual({ response_sha256: sha256Hex(errorBytes) });
    expect(db.prepare(`SELECT used, remaining, last_cost, response_capture_id IS NOT NULL AS linked
      FROM odds_quota_events WHERE request_key = 'charged-http-error'`).get())
      .toEqual({ used: 15, remaining: 485, last_cost: 3, linked: 1 });
    expect(db.prepare(`SELECT status, failure_code FROM source_capture_heartbeats
      WHERE source_key = 'the-odds-api:odds'`).get())
      .toEqual({ status: "stale", failure_code: "provider_unavailable" });
    const immutableEvent = db.prepare(`SELECT captured_at, response_capture_id FROM odds_quota_events
      WHERE request_key = 'charged-http-error'`).get() as { captured_at: string; response_capture_id: string };
    await expect(recordOddsQuota({
      used: 16,
      remaining: 484,
      lastCost: 1,
      updatedAt: immutableEvent.captured_at,
      requestKey: "charged-http-error",
      responseCaptureId: immutableEvent.response_capture_id
    }, sqliteD1(db))).rejects.toThrow(/collided/);
    expect(db.prepare("SELECT used, remaining FROM odds_quota_state WHERE provider = 'the-odds-api'").get())
      .toEqual({ used: 15, remaining: 485 });
    db.close();
  });

  it("coerces incomplete, stale, and late forecasts into explicit withholding", () => {
    const origin = tuesdayForecastOrigin("game-one", "2026-09-13T20:05:00.000Z");
    const base = {
      origin,
      requestedStatus: "forecast" as const,
      generatedAt: "2026-09-08T14:31:00.000Z",
      recordedAt: "2026-09-08T14:31:30.000Z",
      captureHealth: "current" as const,
      activationBoundary: "activation",
      evidenceScope: "full_season_shadow" as const,
      originGraceSeconds: 600,
      qualificationKey: "qualified-package"
    };
    expect(buildForecastLedgerRecord({ ...base, provenance: null })).toMatchObject({
      status: "withheld",
      withholdingReason: "provenance_incomplete",
      timing: "timely",
      prospectiveEligible: true
    });
    expect(buildForecastLedgerRecord({ ...base, provenance: completeProvenance })).toMatchObject({
      status: "forecast",
      withholdingReason: null
    });
    expect(buildForecastLedgerRecord({ ...base, qualificationKey: null, provenance: completeProvenance })).toMatchObject({
      status: "withheld",
      withholdingReason: "provenance_incomplete"
    });
    expect(buildForecastLedgerRecord({ ...base, provenance: completeProvenance, captureHealth: "stale" })).toMatchObject({
      status: "withheld",
      withholdingReason: "required_source_stale"
    });
    expect(buildForecastLedgerRecord({
      ...base,
      provenance: completeProvenance,
      generatedAt: "2026-09-08T14:41:00.000Z",
      recordedAt: "2026-09-08T14:41:00.000Z"
    })).toMatchObject({ status: "withheld", withholdingReason: "late_origin_excluded", timing: "late", prospectiveEligible: false });
  });

  it("recovers failed and expired leases but never reopens completed work", async () => {
    const db = new DatabaseSync(":memory:");
    applySql(db, "drizzle/0013_engine_os_urgent.sql");
    db.exec(`
      INSERT INTO canonical_games VALUES ('g', 2026, 'REG', 1, 'SEA', 'SF', 'resolved', '2026-08-25T00:00:00.000Z', NULL);
      INSERT INTO game_kickoff_revisions VALUES ('k', 'g', '2026-09-13T20:05:00.000Z', 'America/Los_Angeles', '2026-08-25T00:00:00.000Z', NULL, NULL);
      INSERT INTO forecast_origins VALUES ('o', 'g', 'tuesday_0730_pt', '2026-09-08T14:30:00.000Z', '2026-09-08T07:30:00[America/Los_Angeles]', 'k', 1, 'a', '2026-08-25T00:00:00.000Z');
    `);
    const d1 = sqliteD1(db);
    const first = await acquireEngineJobLease({
      db: d1, job: "forecast", scheduledFor: "2026-09-08T14:30:00Z", owner: "one",
      now: "2026-09-08T14:30:00Z", leaseSeconds: 60, gameId: "g", originId: "o"
    });
    expect(first.acquired).toBe(true);
    await finishEngineJob({ db: d1, jobKey: first.jobKey, owner: "one", completedAt: "2026-09-08T14:30:10Z", state: "failed" });
    const retry = await acquireEngineJobLease({
      db: d1, job: "forecast", scheduledFor: "2026-09-08T14:30:00.000Z", owner: "two",
      now: "2026-09-08T14:30:20Z", leaseSeconds: 60, gameId: "g", originId: "o"
    });
    expect(retry).toEqual({ acquired: true, jobKey: first.jobKey });
    await finishEngineJob({ db: d1, jobKey: first.jobKey, owner: "two", completedAt: "2026-09-08T14:30:30Z", state: "succeeded" });
    await expect(acquireEngineJobLease({
      db: d1, job: "forecast", scheduledFor: "2026-09-08T14:30:00Z", owner: "three",
      now: "2026-09-08T14:32:00Z", leaseSeconds: 60, gameId: "g", originId: "o"
    })).resolves.toMatchObject({ acquired: false });
    db.close();
  });

  it("marks pre-activation origins ineligible instead of backfilling them", async () => {
    const db = new DatabaseSync(":memory:");
    applySql(db, "drizzle/0013_engine_os_urgent.sql");
    const seeded = await seedCanonicalGameOrigin({
      gameId: "past-game",
      season: 2026,
      seasonType: "REG",
      week: 1,
      homeTeam: "SEA",
      awayTeam: "SF",
      kickoffUtc: "2026-09-13T20:05:00Z",
      observedAt: "2026-09-15T15:00:00Z",
      activationBoundary: "engine-os-2026:2026-09-15T15:00:00.000Z",
      activatedAt: "2026-09-15T15:00:00Z"
    }, sqliteD1(db));
    expect(seeded.origin.eligible).toBe(false);
    expect(db.prepare("SELECT eligible FROM forecast_origins WHERE origin_id = ?").get(seeded.origin.originId))
      .toEqual({ eligible: 0 });
    db.close();
  });

  it("applies and rolls back the urgent schema with append-only and completeness guards", () => {
    const db = new DatabaseSync(":memory:");
    for (const migration of [
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
      "drizzle/0014_odds_quota_reservations.sql"
    ]) applySql(db, migration);
    const schemaVersion = db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0013_engine_os_urgent'`).get() as { migration_hash: string };
    const urgentMigration = readFileSync(resolve(process.cwd(), "drizzle/0013_engine_os_urgent.sql"), "utf8");
    const schemaDefinition = urgentMigration.split("INSERT INTO `engine_schema_versions`")[0]!;
    expect(schemaVersion.migration_hash).toBe(`sha256:${sha256Hex(schemaDefinition)}`);
    const quotaMigration = readFileSync(resolve(process.cwd(), "drizzle/0014_odds_quota_reservations.sql"), "utf8");
    const quotaDefinition = quotaMigration.split("INSERT INTO `engine_schema_versions`")[0]!;
    const quotaVersion = db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0014_odds_quota_reservations'`).get() as { migration_hash: string };
    expect(quotaVersion.migration_hash).toBe(`sha256:${sha256Hex(quotaDefinition)}`);
    db.exec(`
      INSERT INTO canonical_games VALUES ('g', 2026, 'REG', 1, 'SEA', 'SF', 'resolved', '2026-08-25T00:00:00Z', NULL);
      INSERT INTO canonical_games VALUES ('g2', 2026, 'REG', 1, 'LAR', 'ARI', 'resolved', '2026-08-25T00:00:00Z', NULL);
      INSERT INTO game_kickoff_revisions VALUES ('k', 'g', '2026-09-13T20:05:00Z', 'America/Los_Angeles', '2026-08-25T00:00:00Z', NULL, NULL);
      INSERT INTO game_kickoff_revisions VALUES ('k2', 'g2', '2026-09-13T23:25:00Z', 'America/Los_Angeles', '2026-08-25T00:00:00Z', NULL, NULL);
      INSERT INTO forecast_origins VALUES ('o', 'g', 'tuesday_0730_pt', '2026-09-08T14:30:00Z', '2026-09-08T07:30:00[America/Los_Angeles]', 'k', 1, 'a', '2026-08-25T00:00:00Z');
      INSERT INTO forecast_origins VALUES ('o-ineligible', 'g2', 'tuesday_0730_pt', '2026-09-08T14:30:00Z', '2026-09-08T07:30:00[America/Los_Angeles]', 'k2', 0, 'a', '2026-08-25T00:00:00Z');
    `);
    expect(() => db.exec(`INSERT INTO forecast_origin_records (
      record_id, record_hash, origin_id, game_id, status, withholding_reason,
      generated_at, recorded_at, timing, prospective_eligible, capture_health,
      activation_boundary, evidence_scope
    ) VALUES ('bad', 'bad-hash', 'o', 'g', 'forecast', NULL,
      '2026-09-08T14:31:00Z', '2026-09-08T14:31:00Z', 'timely', 1, 'current', 'a', 'full_season_shadow')`))
      .toThrow(/forecast_record_provenance_check/);
    expect(() => db.exec(`INSERT INTO forecast_origin_records (
      record_id, record_hash, origin_id, game_id, status, withholding_reason,
      generated_at, recorded_at, timing, prospective_eligible, capture_health,
      activation_boundary, evidence_scope
    ) VALUES ('ineligible-origin', 'ineligible-origin-hash', 'o-ineligible', 'g2', 'withheld', 'no_eligible_package',
      '2026-09-08T14:31:00Z', '2026-09-08T14:31:00Z', 'timely', 1, 'current', 'a', 'full_season_shadow')`))
      .toThrow(/requires an eligible origin/);
    db.exec(`INSERT INTO forecast_origin_records (
      record_id, record_hash, origin_id, game_id, status, withholding_reason,
      generated_at, recorded_at, timing, prospective_eligible, capture_health,
      activation_boundary, evidence_scope
    ) VALUES ('withheld', 'withheld-hash', 'o', 'g', 'withheld', 'no_eligible_package',
      '2026-09-08T14:31:00Z', '2026-09-08T14:31:00Z', 'timely', 1, 'current', 'a', 'full_season_shadow')`);
    expect(() => db.exec("UPDATE forecast_origin_records SET capture_health = 'stale' WHERE record_id = 'withheld'"))
      .toThrow(/append-only/);
    expect(() => db.exec("DELETE FROM forecast_origin_records WHERE record_id = 'withheld'"))
      .toThrow(/append-only/);
    expect(() => db.exec(`INSERT INTO forecast_origin_records (
      record_id, record_hash, origin_id, game_id, status, withholding_reason,
      generated_at, recorded_at, timing, prospective_eligible, capture_health,
      activation_boundary, evidence_scope
    ) VALUES ('wrong-game', 'wrong-game-hash', 'o', 'g2', 'withheld', 'no_eligible_package',
      '2026-09-08T14:31:00Z', '2026-09-08T14:31:00Z', 'late', 0, 'current', 'a', 'full_season_shadow')`))
      .toThrow(/FOREIGN KEY constraint failed/);
    applySql(db, "drizzle/rollback/0014_odds_quota_reservations.down.sql");
    applySql(db, "drizzle/rollback/0013_engine_os_urgent.down.sql");
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='forecast_origin_records'").get();
    expect(table).toBeUndefined();
    db.close();
  });
});
