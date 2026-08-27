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
  db.exec("PRAGMA foreign_keys = ON");
  applySql(db, "drizzle/0013_engine_os_urgent.sql");
  applySql(db, "drizzle/0017_engine_os_source_capture.sql");
  return db;
}

const contractHash = "4829d2dc5713a802210a3e80ad8edb8c1fcf874b41a46414ae6596b701e0951f";
const hash = "a".repeat(64);
const captureId = "c".repeat(64);
const rights = JSON.stringify({
  licenseId: "fixture-private",
  rightsUri: "https://fixtures.invalid/rights",
  retrievedFor: "OS-03A qualification",
  redistribution: "prohibited",
  retentionClass: "raw_source_3650_days",
  reviewStatus: "fixture_verified"
});
const laterImport = JSON.stringify({ owner: "OS-03", target: "schedule_raw_snapshot" });

function seedBase(db: DatabaseSync, overrides: {
  captureId?: string;
  idempotencyKey?: string;
  providerPublishedAt?: string | null;
  receivedAt?: string;
} = {}): void {
  db.prepare(`INSERT INTO source_capture_manifests (
    capture_id, idempotency_key, provider, dataset, request_hash, response_object_key,
    response_sha256, response_bytes, sidecar_object_key, sidecar_sha256,
    provider_published_at, received_at, valid_from, valid_to, source_schema_version,
    license_id, evidence_hash
  ) VALUES (?, ?, 'nflverse-fixture', 'schedule', ?, ?, ?, 12, ?, ?, ?, ?, ?, NULL,
    'fixture.schedule.v1', 'fixture-private', ?)`)
    .run(
      overrides.captureId ?? captureId,
      overrides.idempotencyKey ?? "schedule:2026-08-26",
      hash,
      `raw/nflverse-fixture/schedule/sha256/${hash}`,
      hash,
      `manifests/os03a/sha256/${hash}.json`,
      hash,
      overrides.providerPublishedAt === undefined
        ? "2026-08-26T16:00:00.000Z"
        : overrides.providerPublishedAt,
      overrides.receivedAt ?? "2026-08-26T16:00:01.000Z",
      "2026-08-26T16:00:00.000Z",
      hash
    );
}

function insertExtension(db: DatabaseSync, overrides: {
  captureId?: string;
  sourceKey?: string;
  sourceObservedAt?: string | null;
  validationState?: string;
  receiptCompletedAt?: string;
  failureCodesJson?: string;
} = {}): void {
  db.prepare(`INSERT INTO source_capture_manifest_extensions (
    capture_id, contract_version, contract_hash, profile_id, capture_class, source_key,
    source_observed_at, receipt_completed_at, persistence_requested_at,
    response_persisted_at, sidecar_persisted_at, manifest_persisted_at, content_type,
    etag, usage_rights_json, usage_rights_hash, validation_state, failure_codes_json,
    later_import_json, later_import_hash, extension_hash
  ) VALUES (?, 'source-capture-contract.2026.8', ?, 'fixture_nflverse_schedule_v1',
    'qualification_fixture', ?, ?, ?, '2026-08-26T16:00:02.000Z',
    '2026-08-26T16:00:03.000Z', '2026-08-26T16:00:04.000Z',
    '2026-08-26T16:00:05.000Z', 'text/csv', 'fixture-etag', ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      overrides.captureId ?? captureId,
      contractHash,
      overrides.sourceKey ?? "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
      overrides.sourceObservedAt === undefined
        ? "2026-08-26T16:00:00.000Z"
        : overrides.sourceObservedAt,
      overrides.receiptCompletedAt ?? "2026-08-26T16:00:01.000Z",
      rights,
      hash,
      overrides.validationState ?? "usable",
      overrides.failureCodesJson ?? "[]",
      laterImport,
      hash,
      hash
    );
}

function insertEvent(db: DatabaseSync, overrides: {
  eventId?: string;
  attemptToken?: string;
  eventType?: string;
  captureId?: string | null;
  sourceKey?: string;
  provider?: string;
  dataset?: string;
  idempotencyKey?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
} = {}): void {
  const eventType = overrides.eventType ?? "capture_committed_usable";
  const eventCaptureId = overrides.captureId === undefined ? captureId : overrides.captureId;
  const payload = overrides.payload ?? {
    captureId: eventCaptureId,
    evidenceHash: hash,
    ...(eventType.startsWith("capture_committed") ? { extensionHash: hash } : {}),
    ...(["capture_committed", "capture_committed_usable", "capture_committed_raw_only",
      "capture_deduplicated", "replay_verified"].includes(eventType)
      ? { responseSha256: hash, sidecarSha256: hash }
      : {})
  };
  db.prepare(`INSERT INTO source_capture_events (
    event_id, attempt_token, event_type, capture_id, source_key, provider, dataset,
    idempotency_key, occurred_at, event_payload_hash, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      overrides.eventId ?? "e".repeat(64),
      overrides.attemptToken ?? "attempt-1",
      eventType,
      eventCaptureId,
      overrides.sourceKey ?? "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
      overrides.provider ?? "nflverse-fixture",
      overrides.dataset ?? "schedule",
      overrides.idempotencyKey ?? "schedule:2026-08-26",
      overrides.occurredAt ?? "2026-08-26T16:00:05.000Z",
      hash,
      JSON.stringify(payload)
    );
}

describe("OS-03A additive source-capture migration", () => {
  it("registers the exact migration definition without rewriting accepted tables", () => {
    const db = database();
    const migration = readFileSync(resolve(
      process.cwd(),
      "drizzle/0017_engine_os_source_capture.sql"
    ), "utf8");
    const definition = migration.split("INSERT INTO `engine_schema_versions`")[0]!;
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0017_engine_os_source_capture'`).get())
      .toEqual({ migration_hash: `sha256:${sha256Hex(definition)}` });
    expect(db.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'source_capture_manifests'`).get())
      .toEqual({ name: "source_capture_manifests" });
    expect(db.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'source_capture_manifest_extensions'`).get())
      .toEqual({ name: "source_capture_manifest_extensions" });
    expect(db.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'source_capture_events'`).get())
      .toEqual({ name: "source_capture_events" });
    db.close();
  });

  it("binds an extension and event to the exact immutable base identity", () => {
    const db = database();
    seedBase(db);
    insertExtension(db);
    insertEvent(db);
    expect(db.prepare(`SELECT validation_state, source_key
      FROM source_capture_manifest_extensions WHERE capture_id = ?`).get(captureId))
      .toEqual({
        validation_state: "usable",
        source_key: "nflverse-fixture:schedule:fixture_nflverse_schedule_v1"
      });
    expect(() => db.exec(`UPDATE source_capture_manifest_extensions
      SET validation_state = 'raw_only_partial' WHERE capture_id = '${captureId}'`))
      .toThrow(/append-only/);
    expect(() => db.exec(`DELETE FROM source_capture_events WHERE event_id = '${"e".repeat(64)}'`))
      .toThrow(/append-only/);
    db.close();
  });

  it("rejects cross-wired identities, unusable clocks, and conflicting attempt deliveries", () => {
    const crossWire = database();
    seedBase(crossWire);
    expect(() => insertExtension(crossWire, { sourceKey: "other:schedule:fixture_nflverse_schedule_v1" }))
      .toThrow(/exact base manifest identity/);
    crossWire.close();

    const missingSourceTime = database();
    seedBase(missingSourceTime);
    expect(() => insertExtension(missingSourceTime, { sourceObservedAt: null }))
      .toThrow(/usable source times|CHECK constraint/);
    missingSourceTime.close();

    const missingPublicationTime = database();
    seedBase(missingPublicationTime, { providerPublishedAt: null });
    expect(() => insertExtension(missingPublicationTime))
      .toThrow(/usable source times/);
    missingPublicationTime.close();

    const conflict = database();
    seedBase(conflict);
    insertExtension(conflict);
    expect(() => insertEvent(conflict, { provider: "market-fixture" }))
      .toThrow(/exact immutable capture identity/);
    insertEvent(conflict);
    insertEvent(conflict, {
      eventId: "9".repeat(64),
      attemptToken: "attempt-304-new-request",
      eventType: "not_modified_confirmed",
      idempotencyKey: "schedule:304:new-request"
    });
    expect(() => insertEvent(conflict, {
      eventId: "8".repeat(64),
      attemptToken: "attempt-dedup-wrong-idempotency",
      eventType: "capture_deduplicated",
      idempotencyKey: "schedule:wrong"
    })).toThrow(/exact immutable capture identity/);
    expect(() => insertEvent(conflict, {
      eventId: "7".repeat(64),
      attemptToken: "attempt-wrong-evidence",
      eventType: "replay_verified",
      payload: {
        captureId,
        evidenceHash: "0".repeat(64),
        responseSha256: hash,
        sidecarSha256: hash
      }
    })).toThrow(/exact immutable capture identity/);
    expect(() => insertEvent(conflict, {
      eventId: "d".repeat(64),
      provider: "nflverse-fixture"
    })).toThrow(/UNIQUE constraint/);
    expect(() => insertEvent(conflict, {
      eventId: "b".repeat(64),
      eventType: "replay_verified"
    })).toThrow(/UNIQUE constraint/);
    conflict.close();
  });

  it("preserves raw-only evidence without requiring source or publication time", () => {
    const db = database();
    seedBase(db, { providerPublishedAt: null });
    insertExtension(db, {
      sourceObservedAt: null,
      validationState: "raw_only_schema_invalid",
      failureCodesJson: '["source_time_missing","publication_time_missing"]'
    });
    insertEvent(db, {
      eventType: "capture_committed_raw_only",
      eventId: "f".repeat(64)
    });
    expect(db.prepare(`SELECT validation_state FROM source_capture_manifest_extensions`).get())
      .toEqual({ validation_state: "raw_only_schema_invalid" });
    db.close();
  });

  it("guards latest-good pointer binding and deterministic forward ordering", () => {
    const db = database();
    seedBase(db);
    insertExtension(db);
    const insertHeartbeat = () => db.prepare(`INSERT INTO source_capture_heartbeats (
      source_key, provider, dataset, status, last_attempt_at, last_success_at,
      last_failure_at, failure_code, latest_capture_id
    ) VALUES (?, 'nflverse-fixture', 'schedule', 'current', ?, ?, NULL, NULL, ?)`)
      .run(
        "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
        "2026-08-26T16:00:05.000Z",
        "2026-08-26T16:00:05.000Z",
        captureId
      );
    expect(insertHeartbeat).toThrow(/exact usable immutable capture/);
    insertEvent(db);
    insertHeartbeat();

    const laterCaptureId = "d".repeat(64);
    seedBase(db, { captureId: laterCaptureId, idempotencyKey: "schedule:2026-08-26:later" });
    insertExtension(db, { captureId: laterCaptureId });
    insertEvent(db, {
      eventId: "b".repeat(64),
      attemptToken: "attempt-later",
      captureId: laterCaptureId,
      idempotencyKey: "schedule:2026-08-26:later"
    });
    db.prepare(`UPDATE source_capture_heartbeats
      SET latest_capture_id = ?, last_attempt_at = ?, last_success_at = ?
      WHERE source_key = ?`)
      .run(
        laterCaptureId,
        "2026-08-26T16:00:06.000Z",
        "2026-08-26T16:00:06.000Z",
        "nflverse-fixture:schedule:fixture_nflverse_schedule_v1"
      );
    expect(db.prepare(`SELECT latest_capture_id FROM source_capture_heartbeats`).get())
      .toEqual({ latest_capture_id: laterCaptureId });
    expect(() => db.prepare(`UPDATE source_capture_heartbeats SET latest_capture_id = ?
      WHERE source_key = ?`).run(
      captureId,
      "nflverse-fixture:schedule:fixture_nflverse_schedule_v1"
    )).toThrow(/move backward/);
    expect(() => db.exec(`UPDATE source_capture_heartbeats SET latest_capture_id = NULL`))
      .toThrow(/cannot clear/);

    const rawOnlyId = "f".repeat(64);
    seedBase(db, {
      captureId: rawOnlyId,
      idempotencyKey: "schedule:2026-08-26:raw"
    });
    insertExtension(db, {
      captureId: rawOnlyId,
      validationState: "raw_only_partial",
      failureCodesJson: '["partial_import"]'
    });
    expect(() => db.prepare(`UPDATE source_capture_heartbeats SET latest_capture_id = ?
      WHERE source_key = ?`).run(
      rawOnlyId,
      "nflverse-fixture:schedule:fixture_nflverse_schedule_v1"
    )).toThrow(/move backward/);
    db.close();
  });

  it("rejects pre-manifest verification events and permanently failed pointer candidates", () => {
    const early = database();
    seedBase(early);
    insertExtension(early);
    expect(() => insertEvent(early, {
      occurredAt: "2026-08-26T16:00:03.000Z"
    })).toThrow(/exact immutable capture identity/);
    early.close();

    const failed = database();
    seedBase(failed);
    insertExtension(failed);
    insertEvent(failed);
    insertEvent(failed, {
      eventId: "c".repeat(64),
      attemptToken: "postcommit-permanent-failure",
      eventType: "capture_failed",
      captureId: null,
      payload: {
        sourceKey: "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
        failureCode: "corrupt_object",
        idempotencyKey: "schedule:2026-08-26",
        context: {
          captureId,
          phase: "post_manifest_pre_pointer_r2_verification"
        }
      }
    });
    expect(() => failed.prepare(`INSERT INTO source_capture_heartbeats (
      source_key, provider, dataset, status, last_attempt_at, last_success_at,
      last_failure_at, failure_code, latest_capture_id
    ) VALUES (?, 'nflverse-fixture', 'schedule', 'current', ?, ?, NULL, NULL, ?)`)
      .run(
        "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
        "2026-08-26T16:00:06.000Z",
        "2026-08-26T16:00:06.000Z",
        captureId
      )).toThrow(/exact usable immutable capture/);
    failed.close();
  });

  it("retains an already-pointed corrupt capture only as a non-current forensic pointer", () => {
    const db = database();
    seedBase(db);
    insertExtension(db);
    insertEvent(db);
    db.prepare(`INSERT INTO source_capture_heartbeats (
      source_key, provider, dataset, status, last_attempt_at, last_success_at,
      last_failure_at, failure_code, latest_capture_id
    ) VALUES (?, 'nflverse-fixture', 'schedule', 'current', ?, ?, NULL, NULL, ?)`)
      .run(
        "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
        "2026-08-26T16:00:05.000Z",
        "2026-08-26T16:00:05.000Z",
        captureId
      );
    insertEvent(db, {
      eventId: "c".repeat(64),
      attemptToken: "postcommit-current-corruption",
      eventType: "capture_failed",
      captureId: null,
      occurredAt: "2026-08-26T16:00:06.000Z",
      payload: {
        sourceKey: "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
        failureCode: "corrupt_object",
        idempotencyKey: "schedule:2026-08-26",
        context: {
          captureId,
          phase: "post_manifest_pre_pointer_r2_verification"
        }
      }
    });

    db.prepare(`UPDATE source_capture_heartbeats
      SET status = 'stale', last_attempt_at = ?, last_failure_at = ?,
        failure_code = 'corrupt_object'
      WHERE source_key = ?`).run(
      "2026-08-26T16:00:06.000Z",
      "2026-08-26T16:00:06.000Z",
      "nflverse-fixture:schedule:fixture_nflverse_schedule_v1"
    );
    expect(db.prepare(`SELECT status, latest_capture_id, last_success_at, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: captureId,
      last_success_at: "2026-08-26T16:00:05.000Z",
      failure_code: "corrupt_object"
    });
    expect(() => db.exec(`UPDATE source_capture_heartbeats SET status = 'current'`))
      .toThrow(/move backward|cross-wire/);
    expect(() => db.exec(`UPDATE source_capture_heartbeats
      SET last_success_at = '2026-08-26T16:00:07.000Z'`))
      .toThrow(/move backward|cross-wire/);
    expect(() => db.exec(`UPDATE source_capture_heartbeats
      SET last_attempt_at = '2026-08-26T16:00:04.000Z'`))
      .toThrow(/move backward|cross-wire/);
    expect(() => insertEvent(db, {
      eventId: "7".repeat(64),
      attemptToken: "corrupt-not-modified",
      eventType: "not_modified_confirmed",
      idempotencyKey: "schedule:corrupt-not-modified",
      occurredAt: "2026-08-26T16:00:07.000Z"
    })).toThrow(/exact immutable capture identity/);
    db.close();
  });

  it("blocks not-modified publication and current status for an older deterministic head", () => {
    const db = database();
    seedBase(db);
    insertExtension(db);
    insertEvent(db);
    db.prepare(`INSERT INTO source_capture_heartbeats (
      source_key, provider, dataset, status, last_attempt_at, last_success_at,
      last_failure_at, failure_code, latest_capture_id
    ) VALUES (?, 'nflverse-fixture', 'schedule', 'stale', ?, ?, ?, 'manifest_failure', ?)`).run(
      "nflverse-fixture:schedule:fixture_nflverse_schedule_v1",
      "2026-08-26T16:00:07.000Z",
      "2026-08-26T16:00:05.000Z",
      "2026-08-26T16:00:07.000Z",
      captureId
    );

    const newerCaptureId = "d".repeat(64);
    seedBase(db, {
      captureId: newerCaptureId,
      idempotencyKey: "schedule:2026-08-26:newer"
    });
    insertExtension(db, { captureId: newerCaptureId });
    insertEvent(db, {
      eventId: "d".repeat(64),
      attemptToken: "newer-publication",
      captureId: newerCaptureId,
      idempotencyKey: "schedule:2026-08-26:newer",
      occurredAt: "2026-08-26T17:00:06.000Z"
    });

    expect(() => insertEvent(db, {
      eventId: "7".repeat(64),
      attemptToken: "older-not-modified",
      eventType: "not_modified_confirmed",
      idempotencyKey: "schedule:older-not-modified",
      occurredAt: "2026-08-26T17:00:08.000Z"
    })).toThrow(/exact immutable capture identity/);
    expect(() => db.exec(`UPDATE source_capture_heartbeats
      SET status = 'current', last_attempt_at = '2026-08-26T17:00:08.000Z',
        last_success_at = '2026-08-26T17:00:08.000Z', last_failure_at = NULL,
        failure_code = NULL`)).toThrow(/move backward|cross-wire/);
    expect(db.prepare(`SELECT status, latest_capture_id, failure_code
      FROM source_capture_heartbeats`).get()).toEqual({
      status: "stale",
      latest_capture_id: captureId,
      failure_code: "manifest_failure"
    });
    db.close();
  });

  it("rolls back only empty 0017 tables and never contains an R2 deletion operation", () => {
    const db = database();
    const rollback = readFileSync(resolve(
      process.cwd(),
      "drizzle/rollback/0017_engine_os_source_capture.down.sql"
    ), "utf8");
    expect(rollback).toContain("requires both additive source-capture tables to be empty");
    expect(rollback).not.toMatch(/\b(?:DELETE|DROP)\b[^;]*(?:R2|raw\/|manifests\/os03a\/)/i);
    applySql(db, "drizzle/rollback/0017_engine_os_source_capture.down.sql");
    expect(db.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'source_capture_manifest_extensions'`).get())
      .toBeUndefined();
    expect(db.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'source_capture_manifests'`).get())
      .toEqual({ name: "source_capture_manifests" });
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0017_engine_os_source_capture'`).get()).toBeUndefined();
    db.close();
  });

  it("refuses rollback once either additive table contains evidence", () => {
    const db = database();
    seedBase(db);
    insertExtension(db);
    expect(() => applySql(db, "drizzle/rollback/0017_engine_os_source_capture.down.sql"))
      .toThrow(/requires both additive source-capture tables to be empty/);
    expect(db.prepare(`SELECT capture_id FROM source_capture_manifest_extensions`).get())
      .toEqual({ capture_id: captureId });
    expect(db.prepare(`SELECT migration_hash FROM engine_schema_versions
      WHERE version = '0017_engine_os_source_capture'`).get()).toBeDefined();
    db.close();
  });
});
