import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Hex } from "@/domain/hash";
import {
  buildEvidenceHash,
  canonicalizeCaptureRequest,
  type CaptureValidationState,
  type Os03aCaptureSidecar
} from "@/domain/source-capture-contract";
import {
  os03aProviderIndependentRuntimeBoundary,
  recordOs03aNotModified,
  runOs03aFreshnessWatchdog,
  storeOs03aCapture,
  sweepOs03aQualificationOrphan,
  verifyOs03aCaptureOffline,
  type StoreOs03aCaptureInput
} from "@/server/engine-os/source-capture-runtime";

type SqlValue = string | number | bigint | Uint8Array | null;

function applySql(db: DatabaseSync, filename: string): void {
  db.exec(readFileSync(resolve(process.cwd(), filename), "utf8").replaceAll("--> statement-breakpoint", ""));
}

function sqliteD1(db: DatabaseSync, faults?: { failBatches?: number }): D1Database {
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
      let release!: () => void;
      const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
      const predecessor = priorBatch;
      priorBatch = gate;
      await predecessor;
      try {
        if ((faults?.failBatches ?? 0) > 0) {
          faults!.failBatches! -= 1;
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
  readonly objects = new Map<string, { bytes: Uint8Array; uploaded: Date }>();
  failPuts = 0;
  failOnPutNumber: number | null = null;
  puts = 0;
  deletes = 0;
  beforeDelete: (() => Promise<void>) | null = null;
  clock = new Date("2026-08-20T00:00:00.000Z");

  async head(key: string) {
    const object = this.objects.get(key);
    return object ? { key, size: object.bytes.byteLength, uploaded: object.uploaded } : null;
  }

  async put(key: string, value: Uint8Array | ArrayBuffer | ReadableStream) {
    this.puts += 1;
    if (this.failPuts > 0 || this.puts === this.failOnPutNumber) {
      this.failPuts -= 1;
      throw new Error("injected R2 upload failure");
    }
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) bytes = value.slice();
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value.slice(0));
    else {
      const reader = value.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        chunks.push(result.value as Uint8Array);
      }
      const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    this.objects.set(key, { bytes, uploaded: new Date(this.clock) });
    return { key };
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    const bytes = object.bytes.slice();
    return {
      key,
      uploaded: object.uploaded,
      body: new Blob([bytes.buffer]).stream(),
      async arrayBuffer() { return bytes.slice().buffer; }
    };
  }

  async delete(key: string) {
    this.deletes += 1;
    if (this.beforeDelete) await this.beforeDelete();
    this.objects.delete(key);
  }
}

function database(faults?: { failBatches?: number }): { sqlite: DatabaseSync; db: D1Database } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  applySql(sqlite, "drizzle/0013_engine_os_urgent.sql");
  applySql(sqlite, "drizzle/0017_engine_os_source_capture.sql");
  return { sqlite, db: sqliteD1(sqlite, faults) };
}

function sequenceClock(...timestamps: string[]): () => Date {
  let index = 0;
  return () => new Date(timestamps[Math.min(index++, timestamps.length - 1)]!);
}

const rights = {
  licenseId: "fixture-public-license",
  rightsUri: "https://fixtures.invalid/rights",
  retrievedFor: "owner-only OS-03A qualification",
  redistribution: "private-preservation-only",
  retentionClass: "raw_source_3650_days" as const,
  reviewStatus: "fixture-verified"
};

function captureInput(
  db: D1Database,
  bucket: MemoryR2,
  overrides: Partial<StoreOs03aCaptureInput> = {}
): StoreOs03aCaptureInput {
  return {
    db,
    bucket: bucket as unknown as R2Bucket,
    profileId: "fixture_nflverse_schedule_v1",
    attemptToken: "attempt-schedule-1",
    idempotencyKey: "schedule:2026:week-1:tuesday",
    request: canonicalizeCaptureRequest({
      profileId: "fixture_nflverse_schedule_v1",
      url: "https://fixtures.invalid/nflverse/schedule.csv",
      headers: { accept: "text/csv" }
    }),
    responseBytes: new TextEncoder().encode("game_id,kickoff\n2026_01_A_B,2026-09-10T00:20:00Z\n"),
    contentType: "text/csv",
    etag: "fixture-etag-v1",
    sourceObservedAt: "2026-08-26T10:00:00.000Z",
    providerPublishedAt: "2026-08-26T09:59:00.000Z",
    receiptCompletedAt: "2026-08-26T10:00:01.000Z",
    persistenceRequestedAt: "2026-08-26T10:00:02.000Z",
    validFrom: "2026-08-26T09:59:00.000Z",
    sourceSchemaVersion: "fixture.schedule.v1",
    usageRights: rights,
    validationState: "usable",
    clock: sequenceClock(
      "2026-08-26T10:00:03.000Z",
      "2026-08-26T10:00:04.000Z",
      "2026-08-26T10:00:05.000Z",
      "2026-08-26T10:00:06.000Z"
    ),
    ...overrides
  };
}

function scalar(sqlite: DatabaseSync, sql: string): number {
  return Number((sqlite.prepare(sql).get() as { value: number }).value);
}

describe("OS-03A provider-independent immutable capture runtime", () => {
  it("publishes exact response and sidecar bytes before one atomic D1 pointer and replays offline", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    const expected = captureInput(db, bucket).responseBytes;
    const stored = await storeOs03aCapture(captureInput(db, bucket));

    expect(stored).toMatchObject({ status: "committed", validationState: "usable", providerDispatches: 0 });
    expect(bucket.objects.get(stored.responseObjectKey)?.bytes).toEqual(expected);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifests")).toBe(1);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifest_extensions")).toBe(1);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_events")).toBe(1);
    expect(sqlite.prepare("SELECT latest_capture_id, status FROM source_capture_heartbeats").get())
      .toEqual({ latest_capture_id: stored.captureId, status: "current" });

    const replay = await verifyOs03aCaptureOffline({
      db,
      bucket: bucket as unknown as R2Bucket,
      captureId: stored.captureId,
      attemptToken: "attempt-offline-replay-1",
      verifiedAt: "2026-08-26T11:00:00.000Z"
    });
    expect(replay.sidecar.captureId).toBe(stored.captureId);
    expect(replay.providerDispatches).toBe(0);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_events WHERE event_type = 'replay_verified'"))
      .toBe(1);
    sqlite.close();
  });

  it("deduplicates the same bytes, keeps distinct origin manifests, and fences collisions", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    const first = await storeOs03aCapture(captureInput(db, bucket));
    const duplicate = await storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-schedule-2",
      receiptCompletedAt: "2026-08-26T10:10:01.000Z",
      persistenceRequestedAt: "2026-08-26T10:10:02.000Z"
    }));
    expect(duplicate.status).toBe("deduplicated");
    expect(duplicate.captureId).toBe(first.captureId);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_events")).toBe(2);

    const secondOrigin = await storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-schedule-origin-2",
      idempotencyKey: "schedule:2026:week-1:kickoff-minus-120",
      receiptCompletedAt: "2026-08-26T12:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T12:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T12:00:03.000Z",
        "2026-08-26T12:00:04.000Z",
        "2026-08-26T12:00:05.000Z"
      )
    }));
    expect(secondOrigin.captureId).not.toBe(first.captureId);
    expect(secondOrigin.responseObjectKey).toBe(first.responseObjectKey);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifests")).toBe(2);

    const pointerBefore = sqlite.prepare("SELECT latest_capture_id, last_success_at FROM source_capture_heartbeats").get();
    await expect(storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-schedule-collision",
      responseBytes: new TextEncoder().encode("different bytes\n")
    }))).rejects.toThrow(/idempotency key resolved to different immutable evidence/);
    expect(sqlite.prepare("SELECT latest_capture_id, last_success_at FROM source_capture_heartbeats").get())
      .toEqual(pointerBefore);
    sqlite.close();
  });

  it("rejects attempt-token reuse across failure and later success", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    bucket.failPuts = 1;
    const attempted = captureInput(db, bucket, { attemptToken: "attempt-one-terminal-event" });
    await expect(storeOs03aCapture(attempted)).rejects.toThrow(/injected R2 upload failure/);
    expect(sqlite.prepare("SELECT event_type FROM source_capture_events").get())
      .toEqual({ event_type: "capture_failed" });

    await expect(storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-one-terminal-event"
    }))).rejects.toBeInstanceOf(AggregateError);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifests")).toBe(0);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_events")).toBe(1);
    sqlite.close();
  });

  it("records upload and manifest failures loudly while preserving the last-good pointer", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    const good = await storeOs03aCapture(captureInput(db, bucket));
    bucket.failPuts = 1;
    await expect(storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-upload-failure",
      idempotencyKey: "schedule:upload-failure",
      responseBytes: new TextEncoder().encode("upload failure body\n")
    }))).rejects.toThrow(/injected R2 upload failure/);
    expect(sqlite.prepare("SELECT latest_capture_id FROM source_capture_heartbeats").get())
      .toEqual({ latest_capture_id: good.captureId });
    expect(scalar(sqlite, "SELECT count(*) AS value FROM engine_system_alerts")).toBe(1);

    const faults = { failBatches: 1 };
    const faultingDb = sqliteD1(sqlite, faults);
    await expect(storeOs03aCapture(captureInput(faultingDb, bucket, {
      attemptToken: "attempt-manifest-failure",
      idempotencyKey: "schedule:manifest-failure",
      responseBytes: new TextEncoder().encode("manifest failure body\n")
    }))).rejects.toThrow(/injected D1 batch failure/);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_events WHERE event_type = 'capture_failed'"))
      .toBe(2);

    const alwaysFail = sqliteD1(sqlite, { failBatches: 2 });
    await expect(storeOs03aCapture(captureInput(alwaysFail, bucket, {
      attemptToken: "attempt-journal-failure",
      idempotencyKey: "schedule:journal-failure",
      responseBytes: new TextEncoder().encode("journal failure body\n")
    }))).rejects.toBeInstanceOf(AggregateError);
    sqlite.close();
  });

  it("does not publish a D1 pointer when the sidecar upload fails after response preservation", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    bucket.failOnPutNumber = 2;
    await expect(storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-sidecar-upload-failure",
      idempotencyKey: "schedule:sidecar-upload-failure"
    }))).rejects.toThrow(/injected R2 upload failure/);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifests")).toBe(0);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifest_extensions")).toBe(0);
    expect(sqlite.prepare("SELECT event_type FROM source_capture_events").get())
      .toEqual({ event_type: "capture_failed" });
    expect([...bucket.objects.keys()].some((key) => key.startsWith("raw/"))).toBe(true);
    expect([...bucket.objects.keys()].some((key) => key.startsWith("manifests/os03a/"))).toBe(false);
    sqlite.close();
  });

  it("makes overlapping identical workers converge on one manifest, event, and pointer", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    const common = {
      attemptToken: "attempt-overlapping-workers",
      clock: sequenceClock(
        "2026-08-26T10:00:03.000Z",
        "2026-08-26T10:00:04.000Z",
        "2026-08-26T10:00:05.000Z",
        "2026-08-26T10:00:06.000Z"
      )
    };
    const results = await Promise.all([
      storeOs03aCapture(captureInput(db, bucket, common)),
      storeOs03aCapture(captureInput(db, bucket, {
        ...common,
        clock: sequenceClock(
          "2026-08-26T10:00:03.000Z",
          "2026-08-26T10:00:04.000Z",
          "2026-08-26T10:00:05.000Z",
          "2026-08-26T10:00:06.000Z"
        )
      }))
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["committed", "deduplicated"]);
    expect(new Set(results.map((result) => result.captureId)).size).toBe(1);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifests")).toBe(1);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifest_extensions")).toBe(1);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_events")).toBe(1);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_heartbeats")).toBe(1);
    sqlite.close();
  });

  it("preserves last good when partial or missing-time evidence is stored raw-only", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    const good = await storeOs03aCapture(captureInput(db, bucket));

    const partial = await storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-partial",
      idempotencyKey: "schedule:partial",
      responseBytes: new TextEncoder().encode("partial fixture\n"),
      validationState: "raw_only_partial",
      failureCodes: ["partial_import"],
      receiptCompletedAt: "2026-08-26T12:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T12:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T12:00:03.000Z",
        "2026-08-26T12:00:04.000Z",
        "2026-08-26T12:00:05.000Z"
      )
    }));
    expect(partial.validationState).toBe("raw_only_partial");
    expect(sqlite.prepare("SELECT latest_capture_id, status FROM source_capture_heartbeats").get())
      .toEqual({ latest_capture_id: good.captureId, status: "partial" });

    const missing = await storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-missing-time",
      idempotencyKey: "schedule:missing-time",
      responseBytes: new TextEncoder().encode("missing time fixture\n"),
      validationState: "raw_only_schema_invalid",
      sourceObservedAt: null,
      failureCodes: ["source_time_missing"],
      receiptCompletedAt: "2026-08-26T13:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T13:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T13:00:03.000Z",
        "2026-08-26T13:00:04.000Z",
        "2026-08-26T13:00:05.000Z"
      )
    }));
    expect(missing.validationState).toBe("raw_only_schema_invalid");
    expect(sqlite.prepare("SELECT latest_capture_id FROM source_capture_heartbeats").get())
      .toEqual({ latest_capture_id: good.captureId });
    sqlite.close();
  });

  it("rejects secret-bearing bytes before R2 and detects later corruption during offline replay", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    await expect(storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-secret",
      idempotencyKey: "schedule:secret",
      responseBytes: new TextEncoder().encode("api_key=do-not-store\n")
    }))).rejects.toThrow(/credential-bearing material/);
    expect(bucket.puts).toBe(0);
    expect(sqlite.prepare("SELECT failure_code FROM source_capture_heartbeats").get())
      .toEqual({ failure_code: "secret_filtered" });

    const stored = await storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "attempt-clean-after-secret"
    }));
    bucket.objects.get(stored.responseObjectKey)!.bytes[0] ^= 1;
    await expect(verifyOs03aCaptureOffline({
      db,
      bucket: bucket as unknown as R2Bucket,
      captureId: stored.captureId
    })).rejects.toThrow(/corrupt/);
    sqlite.close();
  });

  it("rejects a self-consistently rehashed D1/sidecar semantic forgery during offline replay", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    const stored = await storeOs03aCapture(captureInput(db, bucket));
    const original = bucket.objects.get(stored.sidecarObjectKey)!;
    const sidecar = JSON.parse(new TextDecoder().decode(original.bytes)) as Os03aCaptureSidecar;
    sidecar.requestHash = "a".repeat(64);
    sidecar.evidenceHash = buildEvidenceHash({
      contractVersion: sidecar.contractVersion,
      captureId: sidecar.captureId,
      profileId: sidecar.profileId,
      requestHash: sidecar.requestHash,
      responseSha256: sidecar.responseSha256,
      responseBytes: sidecar.responseBytes,
      contentType: sidecar.contentType,
      etag: sidecar.etag,
      sourceObservedAt: sidecar.sourceObservedAt,
      providerPublishedAt: sidecar.providerPublishedAt,
      validFrom: sidecar.validFrom,
      validTo: sidecar.validTo,
      sourceSchemaVersion: sidecar.sourceSchemaVersion,
      usageRightsHash: sidecar.usageRightsHash,
      validationState: sidecar.validationState,
      laterImportHash: sidecar.laterImportHash
    });
    const forgedBytes = new TextEncoder().encode(canonicalJson(sidecar));
    const forgedSha = sha256Hex(forgedBytes);
    const forgedKey = `manifests/os03a/sha256/${forgedSha}.json`;
    bucket.objects.set(forgedKey, { bytes: forgedBytes, uploaded: new Date(bucket.clock) });
    sqlite.exec("DROP TRIGGER source_capture_manifests_no_update");
    sqlite.prepare(`UPDATE source_capture_manifests SET
      request_hash = ?, evidence_hash = ?, sidecar_object_key = ?, sidecar_sha256 = ?
      WHERE capture_id = ?`).run(
      sidecar.requestHash,
      sidecar.evidenceHash,
      forgedKey,
      forgedSha,
      stored.captureId
    );

    await expect(verifyOs03aCaptureOffline({
      db,
      bucket: bucket as unknown as R2Bucket,
      captureId: stored.captureId
    })).rejects.toThrow(/request hash/i);
    sqlite.close();
  });

  it("allows 304 only with a verified usable head and drives provider-free watchdog alerts", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    await expect(recordOs03aNotModified({
      db,
      bucket: bucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "attempt-304-no-head",
      idempotencyKey: "schedule:304",
      confirmedAt: "2026-08-26T11:00:00.000Z"
    })).rejects.toThrow(/prior usable capture/);

    const stored = await storeOs03aCapture(captureInput(db, bucket));
    await expect(recordOs03aNotModified({
      db,
      bucket: bucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "attempt-304-with-head",
      idempotencyKey: "schedule:304",
      confirmedAt: "2026-08-26T11:00:00.000Z"
    })).resolves.toEqual({ captureId: stored.captureId, providerDispatches: 0 });

    await expect(runOs03aFreshnessWatchdog({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "attempt-watchdog-current",
      checkedAt: "2026-08-26T11:05:00.000Z",
      maximumAgeSeconds: 600
    })).resolves.toMatchObject({ status: "current", ageSeconds: 300, providerDispatches: 0 });
    await expect(runOs03aFreshnessWatchdog({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "attempt-watchdog-stale",
      checkedAt: "2026-08-26T12:00:01.000Z",
      maximumAgeSeconds: 600
    })).resolves.toMatchObject({ status: "stale", providerDispatches: 0 });
    expect(sqlite.prepare("SELECT latest_capture_id, status FROM source_capture_heartbeats").get())
      .toEqual({ latest_capture_id: stored.captureId, status: "stale" });
    expect(scalar(sqlite, "SELECT count(*) AS value FROM engine_system_alerts WHERE alert_type = 'source_capture_stale'"))
      .toBe(1);
    sqlite.close();
  });

  it("creates an unavailable heartbeat and alert when the watchdog has no prior evidence", async () => {
    const { sqlite, db } = database();
    await expect(runOs03aFreshnessWatchdog({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "attempt-watchdog-no-evidence",
      checkedAt: "2026-08-26T12:00:01.000Z",
      maximumAgeSeconds: 600
    })).resolves.toEqual({ status: "unavailable", ageSeconds: null, providerDispatches: 0 });
    expect(sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "unavailable",
      latest_capture_id: null,
      failure_code: "provider_unavailable"
    });
    expect(scalar(sqlite, "SELECT count(*) AS value FROM engine_system_alerts WHERE alert_type = 'source_capture_stale'"))
      .toBe(1);
    sqlite.close();
  });

  it("stores the disabled market branch only from supplied fixture bytes and makes no dispatch", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("network forbidden");
    }) as typeof fetch;
    try {
      const validationState: CaptureValidationState = "usable";
      const stored = await storeOs03aCapture(captureInput(db, bucket, {
        profileId: "fixture_market_odds_v1",
        attemptToken: "attempt-market-fixture",
        idempotencyKey: "market:fixture:one",
        request: canonicalizeCaptureRequest({
          profileId: "fixture_market_odds_v1",
          url: "https://fixtures.invalid/market/odds.json",
          headers: { accept: "application/json" }
        }),
        responseBytes: new TextEncoder().encode('{"fixture":true,"book":"betmgm"}\n'),
        contentType: "application/json",
        sourceSchemaVersion: "fixture.market.v1",
        validationState
      }));
      expect(stored.providerDispatches).toBe(0);
      expect(fetchCalls).toBe(0);
      expect(os03aProviderIndependentRuntimeBoundary).toMatchObject({
        acceptsSuppliedBytesOnly: true,
        networkDispatches: 0,
        providerSecretReads: 0,
        marketQualification: "fixture_only"
      });
    } finally {
      globalThis.fetch = originalFetch;
      sqlite.close();
    }
  });

  it("removes only aged, unreferenced qualification objects and preserves referenced evidence", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    const stored = await storeOs03aCapture(captureInput(db, bucket));
    bucket.objects.get(stored.responseObjectKey)!.uploaded = new Date("2026-08-20T00:00:00.000Z");
    await expect(sweepOs03aQualificationOrphan({
      db,
      bucket: bucket as unknown as R2Bucket,
      qualificationOnly: true,
      profileId: "fixture_nflverse_schedule_v1",
      idempotencyKey: "orphan:referenced",
      attemptToken: "attempt-orphan-referenced",
      objectKey: stored.responseObjectKey,
      checkedAt: "2026-08-26T00:00:00.000Z"
    })).resolves.toMatchObject({ status: "referenced", providerDispatches: 0 });

    const orphanKey = `raw/nflverse-fixture/schedule/sha256/${"f".repeat(64)}`;
    await bucket.put(orphanKey, new TextEncoder().encode("orphan"));
    bucket.objects.get(orphanKey)!.uploaded = new Date("2026-08-20T00:00:00.000Z");
    await expect(sweepOs03aQualificationOrphan({
      db,
      bucket: bucket as unknown as R2Bucket,
      qualificationOnly: true,
      profileId: "fixture_nflverse_schedule_v1",
      idempotencyKey: "orphan:unreferenced",
      attemptToken: "attempt-orphan-unreferenced",
      objectKey: orphanKey,
      checkedAt: "2026-08-26T00:00:00.000Z"
    })).resolves.toMatchObject({ status: "removed", providerDispatches: 0 });
    expect(bucket.objects.has(orphanKey)).toBe(false);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_events WHERE event_type LIKE 'orphan_%'"))
      .toBe(2);
    sqlite.close();
  });

  it("fences a publisher that races an active orphan tombstone before deletion", async () => {
    const { sqlite, db } = database();
    const bucket = new MemoryR2();
    const input = captureInput(db, bucket, {
      attemptToken: "attempt-racing-publisher",
      idempotencyKey: "schedule:racing-publisher"
    });
    const responseKey = `raw/nflverse-fixture/schedule/sha256/${sha256Hex(input.responseBytes)}`;
    await bucket.put(responseKey, input.responseBytes);
    bucket.objects.get(responseKey)!.uploaded = new Date("2026-08-20T00:00:00.000Z");
    let publisherError: unknown = null;
    bucket.beforeDelete = async () => {
      bucket.beforeDelete = null;
      try {
        await storeOs03aCapture(input);
      } catch (error) {
        publisherError = error;
      }
    };

    await expect(sweepOs03aQualificationOrphan({
      db,
      bucket: bucket as unknown as R2Bucket,
      qualificationOnly: true,
      profileId: "fixture_nflverse_schedule_v1",
      idempotencyKey: "orphan:racing-publisher",
      attemptToken: "attempt-orphan-race",
      objectKey: responseKey,
      checkedAt: "2026-08-26T00:00:00.000Z"
    })).resolves.toMatchObject({ status: "removed" });
    expect(publisherError).toBeInstanceOf(Error);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifests")).toBe(0);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_manifest_extensions")).toBe(0);
    expect(scalar(sqlite, "SELECT count(*) AS value FROM source_capture_events WHERE event_type = 'capture_failed'"))
      .toBe(1);
    sqlite.close();
  });
});
