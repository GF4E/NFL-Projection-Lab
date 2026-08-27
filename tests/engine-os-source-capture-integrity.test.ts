import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/domain/hash";
import { canonicalizeCaptureRequest } from "@/domain/source-capture-contract";
import {
  recordOs03aCaptureFailure,
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

interface D1Faults {
  failBeforeBatchNumbers?: Set<number>;
  throwAfterCommitBatchNumbers?: Set<number>;
  failNextEventRead?: boolean;
  afterCommitBatchNumbers?: Map<number, () => Promise<void>>;
  skipStatementNumbersByBatch?: Map<number, Set<number>>;
}

function sqliteD1(db: DatabaseSync, faults: D1Faults = {}): D1Database {
  let batchNumber = 0;
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
        if (faults.failNextEventRead && /FROM source_capture_events\s+WHERE attempt_token/.test(sql)) {
          faults.failNextEventRead = false;
          throw new Error("injected transient event read failure");
        }
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
      batchNumber += 1;
      if (faults.failBeforeBatchNumbers?.has(batchNumber)) {
        throw new Error(`injected D1 batch failure ${batchNumber}`);
      }
      const results: unknown[] = [];
      let committed = false;
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const [statementIndex, statement] of statements.entries()) {
          if (!faults.skipStatementNumbersByBatch?.get(batchNumber)?.has(statementIndex + 1)) {
            results.push(await statement.run());
          }
        }
        db.exec("COMMIT");
        committed = true;
        const afterCommit = faults.afterCommitBatchNumbers?.get(batchNumber);
        if (afterCommit) {
          faults.afterCommitBatchNumbers?.delete(batchNumber);
          await afterCommit();
        }
        if (faults.throwAfterCommitBatchNumbers?.has(batchNumber)) {
          faults.failNextEventRead = true;
          throw new Error(`injected unknown D1 batch outcome ${batchNumber}`);
        }
        return results;
      } catch (error) {
        if (!committed) db.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql: string) { db.exec(sql); return { count: 0, duration: 0 }; },
    async dump() { return new ArrayBuffer(0); }
  } as unknown as D1Database;
}

class RaceR2 {
  readonly objects = new Map<string, { bytes: Uint8Array; uploaded: Date }>();
  readonly reads = new Map<string, number>();
  corruptKey: string | null = null;
  corruptOnRead = Number.POSITIVE_INFINITY;
  beforeCorrupt: (() => void) | null = null;
  throwKey: string | null = null;
  throwOnRead = Number.POSITIVE_INFINITY;

  async head(key: string) {
    const object = this.objects.get(key);
    return object ? { key, size: object.bytes.byteLength, uploaded: object.uploaded } : null;
  }

  async put(key: string, value: Uint8Array | ArrayBuffer | ReadableStream) {
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) bytes = value.slice();
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value.slice(0));
    else {
      const chunks: Uint8Array[] = [];
      const reader = value.getReader();
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        chunks.push(next.value as Uint8Array);
      }
      bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    this.objects.set(key, { bytes, uploaded: new Date("2026-08-20T00:00:00.000Z") });
    return { key };
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    const read = (this.reads.get(key) ?? 0) + 1;
    this.reads.set(key, read);
    if (key === this.throwKey && read >= this.throwOnRead) {
      this.throwOnRead = Number.POSITIVE_INFINITY;
      throw new Error("injected transient R2 read failure");
    }
    if (key === this.corruptKey && read >= this.corruptOnRead && object.bytes.byteLength > 0) {
      this.beforeCorrupt?.();
      object.bytes[0] ^= 1;
      this.corruptOnRead = Number.POSITIVE_INFINITY;
    }
    const bytes = object.bytes.slice();
    return {
      key,
      uploaded: object.uploaded,
      body: new Blob([bytes.buffer]).stream(),
      async arrayBuffer() { return bytes.slice().buffer; }
    };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function database(faults: D1Faults = {}) {
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

const usageRights = {
  licenseId: "fixture-public-license",
  rightsUri: "https://fixtures.invalid/rights",
  retrievedFor: "owner-only OS-03A qualification",
  redistribution: "private-preservation-only",
  retentionClass: "raw_source_3650_days" as const,
  reviewStatus: "fixture-verified"
};

function captureInput(
  db: D1Database,
  bucket: RaceR2,
  overrides: Partial<StoreOs03aCaptureInput> = {}
): StoreOs03aCaptureInput {
  return {
    db,
    bucket: bucket as unknown as R2Bucket,
    profileId: "fixture_nflverse_schedule_v1",
    attemptToken: "integrity-attempt-1",
    idempotencyKey: "schedule:integrity:one",
    request: canonicalizeCaptureRequest({
      profileId: "fixture_nflverse_schedule_v1",
      url: "https://fixtures.invalid/nflverse/schedule.csv",
      headers: { accept: "text/csv" }
    }),
    responseBytes: new TextEncoder().encode("game_id,kickoff\n2026_01_TEST,2026-09-10T00:00:00Z\n"),
    contentType: "text/csv",
    sourceObservedAt: "2026-08-26T10:00:00.000Z",
    providerPublishedAt: "2026-08-26T10:00:00.000Z",
    receiptCompletedAt: "2026-08-26T10:00:01.000Z",
    persistenceRequestedAt: "2026-08-26T10:00:02.000Z",
    sourceSchemaVersion: "fixture.schedule.v1",
    usageRights,
    validationState: "usable",
    clock: sequenceClock(
      "2026-08-26T10:00:03.000Z",
      "2026-08-26T10:00:04.000Z",
      "2026-08-26T10:00:05.000Z"
    ),
    ...overrides
  };
}

describe("OS-03A integrity hardening", () => {
  it("closes an active orphan tombstone after delete succeeded but removal journaling failed", async () => {
    const { sqlite, db } = database({ failBeforeBatchNumbers: new Set([2]) });
    const bucket = new RaceR2();
    const responseBytes = new TextEncoder().encode("recoverable orphan\n");
    const objectKey = `raw/nflverse-fixture/schedule/sha256/${sha256Hex(responseBytes)}`;
    await bucket.put(objectKey, responseBytes);

    await expect(sweepOs03aQualificationOrphan({
      db,
      bucket: bucket as unknown as R2Bucket,
      qualificationOnly: true,
      profileId: "fixture_nflverse_schedule_v1",
      idempotencyKey: "orphan:journal-failure",
      attemptToken: "integrity-orphan",
      objectKey,
      checkedAt: "2026-08-26T00:00:00.000Z"
    })).rejects.toThrow(/injected D1 batch failure 2/);
    expect(bucket.objects.has(objectKey)).toBe(false);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'orphan_detected'`).get()).toEqual({ count: 1 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'orphan_removed'`).get()).toEqual({ count: 0 });

    await expect(sweepOs03aQualificationOrphan({
      db,
      bucket: bucket as unknown as R2Bucket,
      qualificationOnly: true,
      profileId: "fixture_nflverse_schedule_v1",
      idempotencyKey: "orphan:journal-failure",
      attemptToken: "integrity-orphan-retry",
      objectKey,
      checkedAt: "2026-08-26T00:01:00.000Z"
    })).resolves.toEqual({ status: "removed", providerDispatches: 0 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'orphan_removed'`).get()).toEqual({ count: 1 });

    await expect(storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "integrity-publisher-after-recovery",
      idempotencyKey: "schedule:after-orphan-recovery",
      responseBytes
    }))).resolves.toMatchObject({ status: "committed", providerDispatches: 0 });
    sqlite.close();
  });

  it("derives watchdog age from OS-00B and rejects caller threshold drift", async () => {
    const { sqlite, db } = database();
    await expect(runOs03aFreshnessWatchdog({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-watchdog-frozen",
      checkedAt: "2026-08-26T12:00:00.000Z"
    })).resolves.toEqual({ status: "unavailable", ageSeconds: null, providerDispatches: 0 });
    const payload = sqlite.prepare(`SELECT payload_json FROM source_capture_events
      WHERE attempt_token = 'integrity-watchdog-frozen'`).get() as { payload_json: string };
    expect(JSON.parse(payload.payload_json)).toMatchObject({ maximumAgeSeconds: 600 });

    await expect(runOs03aFreshnessWatchdog({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-watchdog-drift",
      checkedAt: "2026-08-26T12:00:00.000Z",
      maximumAgeSeconds: 601
    })).rejects.toThrow(/must equal frozen OS-00B value 600/);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE attempt_token = 'integrity-watchdog-drift'`).get()).toEqual({ count: 0 });
    sqlite.close();
  });

  it("does not call a young last-good current while a later source failure is unresolved", async () => {
    const { sqlite, db } = database();
    const bucket = new RaceR2();
    const stored = await storeOs03aCapture(captureInput(db, bucket));
    await recordOs03aCaptureFailure({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-young-last-good-failure",
      idempotencyKey: "schedule:failed-refresh",
      failedAt: "2026-08-26T10:00:30.000Z",
      failureCode: "provider_unavailable"
    });
    await expect(runOs03aFreshnessWatchdog({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-young-last-good-watchdog",
      checkedAt: "2026-08-26T10:01:00.000Z"
    })).resolves.toEqual({ status: "stale", ageSeconds: 55, providerDispatches: 0 });
    expect(sqlite.prepare(`SELECT status, latest_capture_id FROM source_capture_heartbeats`).get())
      .toEqual({ status: "stale", latest_capture_id: stored.captureId });
    sqlite.close();
  });

  it("fails closed between manifest and pointer while preserving the verified prior pointer", async () => {
    const { sqlite, db } = database();
    const bucket = new RaceR2();
    const prior = await storeOs03aCapture(captureInput(db, bucket));

    const racingBytes = new TextEncoder().encode("game_id,kickoff\n2026_02_RACE,2026-09-17T00:00:00Z\n");
    const racingKey = `raw/nflverse-fixture/schedule/sha256/${sha256Hex(racingBytes)}`;
    bucket.corruptKey = racingKey;
    bucket.corruptOnRead = 3;
    let pointerObservedBeforeCorruption: string | null | undefined;
    bucket.beforeCorrupt = () => {
      const row = sqlite.prepare(`SELECT latest_capture_id FROM source_capture_heartbeats`).get() as
        { latest_capture_id: string | null } | undefined;
      pointerObservedBeforeCorruption = row?.latest_capture_id;
    };
    const racingInput = captureInput(db, bucket, {
      attemptToken: "integrity-postcommit-race",
      idempotencyKey: "schedule:integrity:race",
      responseBytes: racingBytes,
      sourceObservedAt: "2026-08-26T11:00:00.000Z",
      providerPublishedAt: "2026-08-26T11:00:00.000Z",
      receiptCompletedAt: "2026-08-26T11:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T11:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T11:00:03.000Z",
        "2026-08-26T11:00:04.000Z",
        "2026-08-26T11:00:05.000Z",
        "2026-08-26T11:00:06.000Z"
      )
    });
    await expect(storeOs03aCapture(racingInput)).rejects.toThrow(/latest-good was not advanced/);
    expect(pointerObservedBeforeCorruption).toBe(prior.captureId);

    expect(sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: prior.captureId,
      failure_code: "corrupt_object"
    });
    const events = sqlite.prepare(`SELECT attempt_token, event_type FROM source_capture_events
      ORDER BY rowid`).all() as Array<{ attempt_token: string; event_type: string }>;
    expect(events.filter((event) => event.event_type === "capture_committed")).toHaveLength(2);
    expect(events.filter((event) => event.event_type === "capture_committed_usable")).toHaveLength(1);
    const failureEvent = events.find((event) => event.event_type === "capture_failed");
    expect(failureEvent?.attempt_token).toMatch(/^postcommit:[a-f0-9]{64}$/);
    expect(failureEvent?.attempt_token).not.toBe("integrity-postcommit-race");
    expect(sqlite.prepare(`SELECT occurred_at FROM source_capture_events
      WHERE event_type = 'capture_failed'`).get()).toEqual({
      occurred_at: "2026-08-26T11:00:06.000Z"
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'source_capture_failure'`).get()).toEqual({ count: 1 });
    await expect(verifyOs03aCaptureOffline({
      db,
      bucket: bucket as unknown as R2Bucket,
      captureId: prior.captureId
    })).resolves.toMatchObject({ providerDispatches: 0 });
    bucket.objects.get(racingKey)!.bytes = racingBytes.slice();
    await expect(storeOs03aCapture(racingInput)).rejects.toThrow(/permanently ineligible/);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'capture_failed'`).get()).toEqual({ count: 1 });

    await expect(runOs03aFreshnessWatchdog({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-watchdog-after-compensation",
      checkedAt: "2026-08-26T11:07:00.000Z"
    })).resolves.toEqual({ status: "stale", ageSeconds: 4015, providerDispatches: 0 });
    expect(sqlite.prepare(`SELECT status, latest_capture_id FROM source_capture_heartbeats`).get())
      .toEqual({ status: "stale", latest_capture_id: prior.captureId });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'source_capture_stale'`).get()).toEqual({ count: 1 });
    sqlite.close();
  });

  it("keeps a corrupt first candidate off latest-good and marks the source stale", async () => {
    const { sqlite, db } = database();
    const bucket = new RaceR2();
    const bytes = new TextEncoder().encode("game_id,kickoff\n2026_01_FIRST,2026-09-10T00:00:00Z\n");
    bucket.corruptKey = `raw/nflverse-fixture/schedule/sha256/${sha256Hex(bytes)}`;
    bucket.corruptOnRead = 3;
    let pointerExistedBeforeCorruption = false;
    bucket.beforeCorrupt = () => {
      pointerExistedBeforeCorruption = sqlite.prepare(`SELECT 1 FROM source_capture_heartbeats`).get() !== undefined;
    };

    await expect(storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "integrity-postcommit-first",
      idempotencyKey: "schedule:integrity:first-corrupt",
      responseBytes: bytes,
      clock: sequenceClock(
        "2026-08-26T10:00:03.000Z",
        "2026-08-26T10:00:04.000Z",
        "2026-08-26T10:00:05.000Z",
        "2026-08-26T10:00:06.000Z"
      )
    }))).rejects.toThrow(/latest-good was not advanced/);
    expect(pointerExistedBeforeCorruption).toBe(false);

    expect(sqlite.prepare(`SELECT status, latest_capture_id, last_success_at,
      last_failure_at, failure_code FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: null,
      last_success_at: null,
      last_failure_at: "2026-08-26T10:00:06.000Z",
      failure_code: "corrupt_object"
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'capture_failed' AND attempt_token <> 'integrity-postcommit-first'`).get())
      .toEqual({ count: 1 });
    sqlite.close();
  });

  it("permanently stales an already-current capture that later fails exact-byte recovery", async () => {
    const { sqlite, db } = database();
    const bucket = new RaceR2();
    const originalInput = captureInput(db, bucket);
    const stored = await storeOs03aCapture(originalInput);
    const originalBytes = bucket.objects.get(stored.responseObjectKey)!.bytes.slice();
    bucket.objects.get(stored.responseObjectKey)!.bytes[0] ^= 1;

    await expect(storeOs03aCapture(captureInput(db, bucket, {
      clock: sequenceClock("2026-08-26T10:01:00.000Z")
    }))).rejects.toThrow(/latest-good was not advanced/);
    expect(sqlite.prepare(`SELECT status, latest_capture_id, last_success_at, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: stored.captureId,
      last_success_at: "2026-08-26T10:00:05.000Z",
      failure_code: "corrupt_object"
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'capture_failed'
        AND json_extract(payload_json, '$.failureCode') = 'corrupt_object'`).get())
      .toEqual({ count: 1 });

    bucket.objects.get(stored.responseObjectKey)!.bytes = originalBytes;
    await expect(recordOs03aNotModified({
      db,
      bucket: bucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-corrupt-current-304",
      idempotencyKey: "schedule:integrity:corrupt-current-304",
      confirmedAt: "2026-08-26T10:02:00.000Z"
    })).rejects.toThrow(/prior usable capture/);
    expect(sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: stored.captureId,
      failure_code: "corrupt_object"
    });
    sqlite.close();
  });

  it("re-verifies committed rows and completes a failed pointer batch idempotently", async () => {
    const { sqlite, db } = database({ failBeforeBatchNumbers: new Set([4]) });
    const bucket = new RaceR2();
    const prior = await storeOs03aCapture(captureInput(db, bucket));
    const candidateInput = captureInput(db, bucket, {
      attemptToken: "integrity-pointer-retry",
      idempotencyKey: "schedule:integrity:pointer-retry",
      responseBytes: new TextEncoder().encode(
        "game_id,kickoff\n2026_02_RETRY,2026-09-17T00:00:00Z\n"
      ),
      sourceObservedAt: "2026-08-26T11:00:00.000Z",
      providerPublishedAt: "2026-08-26T11:00:00.000Z",
      receiptCompletedAt: "2026-08-26T11:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T11:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T11:00:03.000Z",
        "2026-08-26T11:00:04.000Z",
        "2026-08-26T11:00:05.000Z",
        "2026-08-26T11:00:06.000Z",
        "2026-08-26T11:00:07.000Z",
        "2026-08-26T11:00:08.000Z"
      )
    });

    await expect(storeOs03aCapture(candidateInput)).rejects.toThrow(/latest-good remains fail-closed/);
    const candidate = sqlite.prepare(`SELECT capture_id FROM source_capture_manifests
      WHERE idempotency_key = 'schedule:integrity:pointer-retry'`).get() as { capture_id: string };
    expect(sqlite.prepare(`SELECT status, latest_capture_id FROM source_capture_heartbeats`).get())
      .toEqual({ status: "stale", latest_capture_id: prior.captureId });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE capture_id = ? AND event_type = 'capture_committed_usable'`).get(candidate.capture_id))
      .toEqual({ count: 0 });

    await expect(storeOs03aCapture(candidateInput)).resolves.toMatchObject({
      status: "deduplicated",
      captureId: candidate.capture_id,
      providerDispatches: 0
    });
    expect(sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "current",
      latest_capture_id: candidate.capture_id,
      failure_code: null
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE capture_id = ? AND event_type = 'capture_committed_usable'`).get(candidate.capture_id))
      .toEqual({ count: 1 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'capture_failed'`).get()).toEqual({ count: 1 });
    sqlite.close();
  });

  it("recovers a stranded deterministic publication event instead of accepting an older pointer", async () => {
    const faults: D1Faults = {
      skipStatementNumbersByBatch: new Map([[4, new Set([3])]])
    };
    const { sqlite, db } = database(faults);
    const bucket = new RaceR2();
    const prior = await storeOs03aCapture(captureInput(db, bucket));
    const candidateInput = captureInput(db, bucket, {
      attemptToken: "integrity-stranded-publication",
      idempotencyKey: "schedule:integrity:stranded-publication",
      responseBytes: new TextEncoder().encode(
        "game_id,kickoff\n2026_02_STRANDED,2026-09-17T00:00:00Z\n"
      ),
      sourceObservedAt: "2026-08-26T11:00:00.000Z",
      providerPublishedAt: "2026-08-26T11:00:00.000Z",
      receiptCompletedAt: "2026-08-26T11:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T11:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T11:00:03.000Z", "2026-08-26T11:00:04.000Z",
        "2026-08-26T11:00:05.000Z", "2026-08-26T11:00:06.000Z",
        "2026-08-26T11:00:07.000Z"
      )
    });

    await expect(storeOs03aCapture(candidateInput)).rejects.toThrow(/latest-good remains fail-closed/);
    const candidate = sqlite.prepare(`SELECT capture_id FROM source_capture_manifests
      WHERE idempotency_key = 'schedule:integrity:stranded-publication'`).get() as { capture_id: string };
    expect(sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: prior.captureId,
      failure_code: "manifest_failure"
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE capture_id = ? AND event_type = 'capture_committed_usable'`).get(candidate.capture_id))
      .toEqual({ count: 1 });

    await expect(storeOs03aCapture(candidateInput)).resolves.toMatchObject({
      status: "deduplicated",
      captureId: candidate.capture_id
    });
    expect(sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "current",
      latest_capture_id: candidate.capture_id,
      failure_code: null
    });
    sqlite.close();
  });

  it("does not regress the heartbeat clock while recovering a stranded publication", async () => {
    const faults: D1Faults = {
      skipStatementNumbersByBatch: new Map([[4, new Set([3])]])
    };
    const { sqlite, db } = database(faults);
    const bucket = new RaceR2();
    await storeOs03aCapture(captureInput(db, bucket));
    const candidateInput = captureInput(db, bucket, {
      attemptToken: "integrity-stranded-publication-clock",
      idempotencyKey: "schedule:integrity:stranded-publication-clock",
      responseBytes: new TextEncoder().encode(
        "game_id,kickoff\n2026_02_STRANDED_CLOCK,2026-09-17T00:00:00Z\n"
      ),
      sourceObservedAt: "2026-08-26T11:00:00.000Z",
      providerPublishedAt: "2026-08-26T11:00:00.000Z",
      receiptCompletedAt: "2026-08-26T11:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T11:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T11:00:03.000Z", "2026-08-26T11:00:04.000Z",
        "2026-08-26T11:00:05.000Z", "2026-08-26T11:00:06.000Z",
        "2026-08-26T11:00:07.000Z"
      )
    });

    await expect(storeOs03aCapture(candidateInput)).rejects.toThrow(/latest-good remains fail-closed/);
    expect(sqlite.prepare(`SELECT status, last_attempt_at, last_failure_at, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      last_attempt_at: "2026-08-26T11:00:07.000Z",
      last_failure_at: "2026-08-26T11:00:07.000Z",
      failure_code: "manifest_failure"
    });

    await expect(storeOs03aCapture({
      ...candidateInput,
      clock: sequenceClock("2026-08-26T11:00:06.500Z")
    })).rejects.toThrow(/latest-good remains fail-closed/);
    expect(sqlite.prepare(`SELECT status, last_attempt_at, last_failure_at, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      last_attempt_at: "2026-08-26T11:00:07.000Z",
      last_failure_at: "2026-08-26T11:00:07.000Z",
      failure_code: "manifest_failure"
    });
    sqlite.close();
  });

  it("preserves a causally newer provider failure after pointer commit and before postcondition", async () => {
    const faults: D1Faults = { afterCommitBatchNumbers: new Map() };
    const { sqlite, db } = database(faults);
    const bucket = new RaceR2();
    await storeOs03aCapture(captureInput(db, bucket));
    faults.afterCommitBatchNumbers!.set(4, async () => {
      await recordOs03aCaptureFailure({
        db,
        profileId: "fixture_nflverse_schedule_v1",
        attemptToken: "integrity-causal-provider-failure",
        idempotencyKey: "schedule:integrity:causal-provider-failure",
        failedAt: "2026-08-26T12:00:00.000Z",
        failureCode: "provider_unavailable"
      });
    });
    const candidateInput = captureInput(db, bucket, {
      attemptToken: "integrity-pointer-before-causal-failure",
      idempotencyKey: "schedule:integrity:pointer-before-causal-failure",
      responseBytes: new TextEncoder().encode(
        "game_id,kickoff\n2026_02_CAUSAL,2026-09-17T00:00:00Z\n"
      ),
      sourceObservedAt: "2026-08-26T11:00:00.000Z",
      providerPublishedAt: "2026-08-26T11:00:00.000Z",
      receiptCompletedAt: "2026-08-26T11:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T11:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T11:00:03.000Z", "2026-08-26T11:00:04.000Z",
        "2026-08-26T11:00:05.000Z", "2026-08-26T11:00:06.000Z"
      )
    });
    const stored = await storeOs03aCapture(candidateInput);
    expect(sqlite.prepare(`SELECT status, latest_capture_id, last_failure_at, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: stored.captureId,
      last_failure_at: "2026-08-26T12:00:00.000Z",
      failure_code: "provider_unavailable"
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'capture_failed'
        AND json_extract(payload_json, '$.failureCode') = 'manifest_failure'`).get())
      .toEqual({ count: 0 });

    await expect(storeOs03aCapture(candidateInput)).resolves.toMatchObject({
      status: "deduplicated",
      captureId: stored.captureId
    });
    expect(sqlite.prepare(`SELECT status, last_failure_at, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      last_failure_at: "2026-08-26T12:00:00.000Z",
      failure_code: "provider_unavailable"
    });
    sqlite.close();
  });

  it("recovers an unknown committed pointer-batch outcome without duplicating publication", async () => {
    const { sqlite, db } = database({
      throwAfterCommitBatchNumbers: new Set([4]),
      failBeforeBatchNumbers: new Set([6])
    });
    const bucket = new RaceR2();
    await storeOs03aCapture(captureInput(db, bucket));
    const candidateInput = captureInput(db, bucket, {
      attemptToken: "integrity-pointer-unknown",
      idempotencyKey: "schedule:integrity:pointer-unknown",
      responseBytes: new TextEncoder().encode("game_id,kickoff\n2026_02_UNKNOWN,2026-09-17T00:00:00Z\n"),
      sourceObservedAt: "2026-08-26T11:00:00.000Z",
      providerPublishedAt: "2026-08-26T11:00:00.000Z",
      receiptCompletedAt: "2026-08-26T11:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T11:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T11:00:03.000Z",
        "2026-08-26T11:00:04.000Z",
        "2026-08-26T11:00:05.000Z",
        "2026-08-26T11:00:06.000Z",
        "2026-08-26T11:00:07.000Z",
        "2026-08-26T11:00:08.000Z"
      )
    });

    await expect(storeOs03aCapture(candidateInput)).rejects.toThrow(/latest-good remains fail-closed/);
    const candidate = sqlite.prepare(`SELECT capture_id FROM source_capture_manifests
      WHERE idempotency_key = 'schedule:integrity:pointer-unknown'`).get() as { capture_id: string };
    expect(sqlite.prepare(`SELECT status, latest_capture_id FROM source_capture_heartbeats`).get())
      .toEqual({ status: "stale", latest_capture_id: candidate.capture_id });

    await expect(storeOs03aCapture(candidateInput)).rejects.toThrow(/latest-good remains fail-closed/);
    expect(sqlite.prepare(`SELECT status, latest_capture_id FROM source_capture_heartbeats`).get())
      .toEqual({ status: "stale", latest_capture_id: candidate.capture_id });

    await expect(storeOs03aCapture(candidateInput)).resolves.toMatchObject({
      status: "deduplicated",
      captureId: candidate.capture_id
    });
    expect(sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "current",
      latest_capture_id: candidate.capture_id,
      failure_code: null
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE capture_id = ? AND event_type = 'capture_committed_usable'`).get(candidate.capture_id))
      .toEqual({ count: 1 });
    sqlite.close();
  });

  it("keeps a transient R2 read failure retryable while withholding the pointer", async () => {
    const { sqlite, db } = database();
    const bucket = new RaceR2();
    const prior = await storeOs03aCapture(captureInput(db, bucket));
    const bytes = new TextEncoder().encode("game_id,kickoff\n2026_02_TRANSIENT,2026-09-17T00:00:00Z\n");
    bucket.throwKey = `raw/nflverse-fixture/schedule/sha256/${sha256Hex(bytes)}`;
    bucket.throwOnRead = 3;
    const candidateInput = captureInput(db, bucket, {
      attemptToken: "integrity-r2-transient",
      idempotencyKey: "schedule:integrity:r2-transient",
      responseBytes: bytes,
      sourceObservedAt: "2026-08-26T11:00:00.000Z",
      providerPublishedAt: "2026-08-26T11:00:00.000Z",
      receiptCompletedAt: "2026-08-26T11:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T11:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T11:00:03.000Z", "2026-08-26T11:00:04.000Z",
        "2026-08-26T11:00:05.000Z", "2026-08-26T11:00:06.000Z",
        "2026-08-26T11:00:07.000Z"
      )
    });
    await expect(storeOs03aCapture(candidateInput)).rejects.toThrow(/verification was unavailable/);
    expect(sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale", latest_capture_id: prior.captureId, failure_code: "storage_failure"
    });
    await expect(storeOs03aCapture(candidateInput)).resolves.toMatchObject({ status: "deduplicated" });
    expect(sqlite.prepare(`SELECT status, failure_code FROM source_capture_heartbeats`).get())
      .toEqual({ status: "current", failure_code: null });
    sqlite.close();
  });

  it("does not let an older verified retry clear a newer source failure", async () => {
    const { sqlite, db } = database();
    const bucket = new RaceR2();
    const firstInput = captureInput(db, bucket);
    await storeOs03aCapture(firstInput);
    const newer = await storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "integrity-newer-good",
      idempotencyKey: "schedule:integrity:newer-good",
      responseBytes: new TextEncoder().encode("game_id,kickoff\n2026_02_NEW,2026-09-17T00:00:00Z\n"),
      sourceObservedAt: "2026-08-26T11:00:00.000Z",
      providerPublishedAt: "2026-08-26T11:00:00.000Z",
      receiptCompletedAt: "2026-08-26T11:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T11:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T11:00:03.000Z", "2026-08-26T11:00:04.000Z",
        "2026-08-26T11:00:05.000Z", "2026-08-26T11:00:06.000Z"
      )
    }));
    await recordOs03aCaptureFailure({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-provider-failure-after-newer",
      idempotencyKey: "schedule:integrity:provider-failure",
      failedAt: "2026-08-26T12:00:00.000Z",
      failureCode: "provider_unavailable"
    });
    await expect(storeOs03aCapture(firstInput)).resolves.toMatchObject({ status: "deduplicated" });
    expect(sqlite.prepare(`SELECT status, latest_capture_id, last_failure_at, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: newer.captureId,
      last_failure_at: "2026-08-26T12:00:00.000Z",
      failure_code: "provider_unavailable"
    });
    sqlite.close();
  });

  it("does not let an older not-modified confirmation clear a newer source failure", async () => {
    const { sqlite, db } = database();
    const bucket = new RaceR2();
    const stored = await storeOs03aCapture(captureInput(db, bucket));
    await recordOs03aCaptureFailure({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-provider-failure-before-old-304",
      idempotencyKey: "schedule:integrity:provider-failure-before-old-304",
      failedAt: "2026-08-26T12:00:00.000Z",
      failureCode: "provider_unavailable"
    });

    await expect(recordOs03aNotModified({
      db,
      bucket: bucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-old-304",
      idempotencyKey: "schedule:integrity:old-304",
      confirmedAt: "2026-08-26T11:00:00.000Z"
    })).resolves.toEqual({ captureId: stored.captureId, providerDispatches: 0 });
    expect(sqlite.prepare(`SELECT status, last_attempt_at, last_failure_at, failure_code,
      latest_capture_id FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      last_attempt_at: "2026-08-26T12:00:00.000Z",
      last_failure_at: "2026-08-26T12:00:00.000Z",
      failure_code: "provider_unavailable",
      latest_capture_id: stored.captureId
    });
    sqlite.close();
  });

  it("does not let an older not-modified confirmation mask a stranded newer publication", async () => {
    const faults: D1Faults = {
      skipStatementNumbersByBatch: new Map([[4, new Set([3])]])
    };
    const { sqlite, db } = database(faults);
    const bucket = new RaceR2();
    const prior = await storeOs03aCapture(captureInput(db, bucket));
    const candidateInput = captureInput(db, bucket, {
      attemptToken: "integrity-stranded-before-304",
      idempotencyKey: "schedule:integrity:stranded-before-304",
      responseBytes: new TextEncoder().encode(
        "game_id,kickoff\n2026_02_STRANDED_304,2026-09-17T00:00:00Z\n"
      ),
      sourceObservedAt: "2026-08-26T11:00:00.000Z",
      providerPublishedAt: "2026-08-26T11:00:00.000Z",
      receiptCompletedAt: "2026-08-26T11:00:01.000Z",
      persistenceRequestedAt: "2026-08-26T11:00:02.000Z",
      clock: sequenceClock(
        "2026-08-26T11:00:03.000Z", "2026-08-26T11:00:04.000Z",
        "2026-08-26T11:00:05.000Z", "2026-08-26T11:00:06.000Z",
        "2026-08-26T11:00:07.000Z"
      )
    });

    await expect(storeOs03aCapture(candidateInput)).rejects.toThrow(/latest-good remains fail-closed/);
    const candidate = sqlite.prepare(`SELECT capture_id FROM source_capture_manifests
      WHERE idempotency_key = 'schedule:integrity:stranded-before-304'`).get() as { capture_id: string };
    await expect(recordOs03aNotModified({
      db,
      bucket: bucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-304-after-stranded",
      idempotencyKey: "schedule:integrity:304-after-stranded",
      confirmedAt: "2026-08-26T11:00:08.000Z"
    })).rejects.toThrow(/newer unresolved publication/);
    expect(sqlite.prepare(`SELECT status, latest_capture_id, last_attempt_at,
      last_failure_at, failure_code FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: prior.captureId,
      last_attempt_at: "2026-08-26T11:00:08.000Z",
      last_failure_at: "2026-08-26T11:00:08.000Z",
      failure_code: "manifest_failure"
    });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'not_modified_confirmed'`).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE attempt_token = 'integrity-304-after-stranded'
        AND event_type = 'capture_failed'
        AND json_extract(payload_json, '$.context.expectedCaptureId') = ?`).get(candidate.capture_id))
      .toEqual({ count: 1 });

    await expect(storeOs03aCapture({
      ...candidateInput,
      clock: sequenceClock("2026-08-26T11:00:09.000Z")
    })).resolves.toMatchObject({ status: "deduplicated", captureId: candidate.capture_id });
    expect(sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "current",
      latest_capture_id: candidate.capture_id,
      failure_code: null
    });
    sqlite.close();
  });

  it("journals permanent and transient exact-byte failures before accepting not-modified", async () => {
    const permanent = database();
    const permanentBucket = new RaceR2();
    const stored = await storeOs03aCapture(captureInput(permanent.db, permanentBucket));
    const originalBytes = permanentBucket.objects.get(stored.responseObjectKey)!.bytes.slice();
    permanentBucket.objects.get(stored.responseObjectKey)!.bytes[0] ^= 1;

    await expect(recordOs03aNotModified({
      db: permanent.db,
      bucket: permanentBucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-304-corrupt",
      idempotencyKey: "schedule:integrity:304-corrupt",
      confirmedAt: "2026-08-26T10:01:00.000Z"
    })).rejects.toThrow(/latest-good was not advanced/);
    expect(permanent.sqlite.prepare(`SELECT status, latest_capture_id, last_success_at,
      failure_code FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: stored.captureId,
      last_success_at: "2026-08-26T10:00:05.000Z",
      failure_code: "corrupt_object"
    });
    expect(permanent.sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'capture_failed'
        AND json_extract(payload_json, '$.failureCode') = 'corrupt_object'
        AND json_extract(payload_json, '$.context.captureId') = ?`).get(stored.captureId))
      .toEqual({ count: 1 });
    expect(permanent.sqlite.prepare(`SELECT count(*) AS count FROM engine_system_alerts
      WHERE alert_type = 'source_capture_failure'`).get()).toEqual({ count: 1 });
    permanentBucket.objects.get(stored.responseObjectKey)!.bytes = originalBytes;
    await expect(recordOs03aNotModified({
      db: permanent.db,
      bucket: permanentBucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-304-corrupt-restored",
      idempotencyKey: "schedule:integrity:304-corrupt-restored",
      confirmedAt: "2026-08-26T10:02:00.000Z"
    })).rejects.toThrow(/prior usable capture/);
    permanent.sqlite.close();

    const transient = database();
    const transientBucket = new RaceR2();
    const transientStored = await storeOs03aCapture(captureInput(transient.db, transientBucket));
    transientBucket.throwKey = transientStored.responseObjectKey;
    transientBucket.throwOnRead = (transientBucket.reads.get(transientStored.responseObjectKey) ?? 0) + 1;
    await expect(recordOs03aNotModified({
      db: transient.db,
      bucket: transientBucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-304-transient",
      idempotencyKey: "schedule:integrity:304-transient",
      confirmedAt: "2026-08-26T10:01:00.000Z"
    })).rejects.toThrow(/unavailable/);
    expect(transient.sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: transientStored.captureId,
      failure_code: "storage_failure"
    });
    expect(transient.sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE event_type = 'capture_failed'
        AND json_extract(payload_json, '$.failureCode') = 'storage_failure'`).get())
      .toEqual({ count: 1 });
    await expect(recordOs03aNotModified({
      db: transient.db,
      bucket: transientBucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-304-transient-retry",
      idempotencyKey: "schedule:integrity:304-transient-retry",
      confirmedAt: "2026-08-26T10:02:00.000Z"
    })).resolves.toEqual({ captureId: transientStored.captureId, providerDispatches: 0 });
    expect(transient.sqlite.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "current",
      latest_capture_id: transientStored.captureId,
      failure_code: null
    });
    transient.sqlite.close();
  });

  it("rejects regressing verification and watchdog clocks without publishing freshness", async () => {
    const { sqlite, db } = database();
    const bucket = new RaceR2();
    await expect(storeOs03aCapture(captureInput(db, bucket, {
      attemptToken: "integrity-regressing-verification",
      idempotencyKey: "schedule:integrity:regressing-verification",
      clock: sequenceClock(
        "2026-08-26T10:00:03.000Z", "2026-08-26T10:00:04.000Z",
        "2026-08-26T10:00:05.000Z", "2026-08-26T10:00:04.000Z"
      )
    }))).rejects.toThrow(/verification time regressed/);
    expect(sqlite.prepare(`SELECT status, latest_capture_id FROM source_capture_heartbeats`).get())
      .toEqual({ status: "stale", latest_capture_id: null });

    const freshDb = database();
    const freshBucket = new RaceR2();
    await storeOs03aCapture(captureInput(freshDb.db, freshBucket));
    await expect(runOs03aFreshnessWatchdog({
      db: freshDb.db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-watchdog-before-success",
      checkedAt: "2026-08-26T10:00:04.000Z"
    })).rejects.toThrow(/predates the latest successful verification/);
    expect(freshDb.sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events
      WHERE attempt_token = 'integrity-watchdog-before-success'`).get()).toEqual({ count: 0 });
    freshDb.sqlite.close();
    sqlite.close();
  });

  it("rejects generic token fields from failure metadata", async () => {
    const { sqlite, db } = database();
    await expect(recordOs03aCaptureFailure({
      db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-secret-context",
      idempotencyKey: "schedule:integrity:secret-context",
      failedAt: "2026-08-26T10:00:00.000Z",
      failureCode: "provider_unavailable",
      safeContext: { token: "sensitive-fixture-token" }
    })).rejects.toThrow(/credential-bearing material/);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events`).get())
      .toEqual({ count: 0 });
    sqlite.close();
  });

  it("secret-filters every caller-controlled event identity before persistence", async () => {
    const secretIdentity = ["auth", "Token=", "fixture", "-", "secret"].join("");
    const { sqlite, db } = database();
    const bucket = new RaceR2();
    const stored = await storeOs03aCapture(captureInput(db, bucket));
    const baselineEvents = sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events`).get();

    await expect(recordOs03aNotModified({
      db,
      bucket: bucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: "integrity-secret-304-idempotency",
      idempotencyKey: secretIdentity,
      confirmedAt: "2026-08-26T10:01:00.000Z"
    })).rejects.toThrow(/credential-bearing material/);
    await expect(recordOs03aNotModified({
      db,
      bucket: bucket as unknown as R2Bucket,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: secretIdentity,
      idempotencyKey: "schedule:integrity:secret-304-attempt",
      confirmedAt: "2026-08-26T10:01:00.000Z"
    })).rejects.toThrow(/credential-bearing material/);
    await expect(verifyOs03aCaptureOffline({
      db,
      bucket: bucket as unknown as R2Bucket,
      captureId: stored.captureId,
      attemptToken: secretIdentity,
      verifiedAt: "2026-08-26T10:01:00.000Z"
    })).rejects.toThrow(/credential-bearing material/);
    expect(sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events`).get())
      .toEqual(baselineEvents);
    sqlite.close();

    const watchdog = database();
    await expect(runOs03aFreshnessWatchdog({
      db: watchdog.db,
      profileId: "fixture_nflverse_schedule_v1",
      attemptToken: secretIdentity,
      checkedAt: "2026-08-26T12:00:00.000Z"
    })).rejects.toThrow(/credential-bearing material/);
    expect(watchdog.sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events`).get())
      .toEqual({ count: 0 });
    watchdog.sqlite.close();

    const orphan = database();
    const orphanBucket = new RaceR2();
    const orphanKey = `raw/nflverse-fixture/schedule/sha256/${"f".repeat(64)}`;
    await orphanBucket.put(orphanKey, new TextEncoder().encode("orphan-fixture"));
    await expect(sweepOs03aQualificationOrphan({
      db: orphan.db,
      bucket: orphanBucket as unknown as R2Bucket,
      qualificationOnly: true,
      profileId: "fixture_nflverse_schedule_v1",
      idempotencyKey: secretIdentity,
      attemptToken: "integrity-secret-orphan-idempotency",
      objectKey: orphanKey,
      checkedAt: "2026-08-26T12:00:00.000Z"
    })).rejects.toThrow(/credential-bearing material/);
    await expect(sweepOs03aQualificationOrphan({
      db: orphan.db,
      bucket: orphanBucket as unknown as R2Bucket,
      qualificationOnly: true,
      profileId: "fixture_nflverse_schedule_v1",
      idempotencyKey: "schedule:integrity:secret-orphan-attempt",
      attemptToken: secretIdentity,
      objectKey: orphanKey,
      checkedAt: "2026-08-26T12:00:00.000Z"
    })).rejects.toThrow(/credential-bearing material/);
    expect(orphan.sqlite.prepare(`SELECT count(*) AS count FROM source_capture_events`).get())
      .toEqual({ count: 0 });
    expect(orphanBucket.objects.has(orphanKey)).toBe(true);
    orphan.sqlite.close();
  });
});
