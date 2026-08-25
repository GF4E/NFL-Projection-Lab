import { createHash, randomUUID } from "node:crypto";
import {
  assertSecretFreeManifest,
  buildRawCaptureManifest,
  buildRawCaptureManifestFromDigest,
  type CaptureDataset,
  type RawCaptureManifest,
  type RedactedHttpRequest
} from "@/domain/engine-os";
import { sha256Hex, stableHash } from "@/domain/hash";

export interface StoredRawCapture {
  manifest: RawCaptureManifest;
  sidecarObjectKey: string;
  sidecarSha256: string;
  deduplicatedResponse: boolean;
}

type BuiltRawCapture = ReturnType<typeof buildRawCaptureManifest>;

async function hashReadableStream(stream: ReadableStream): Promise<{ sha256: string; bytes: number }> {
  const reader = stream.getReader();
  const hash = createHash("sha256");
  let bytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    const chunk = result.value as Uint8Array;
    hash.update(chunk);
    bytes += chunk.byteLength;
  }
  return { sha256: hash.digest("hex"), bytes };
}

async function hashObjectBody(object: R2ObjectBody): Promise<{ sha256: string; bytes: number }> {
  const body = (object as R2ObjectBody & { body?: ReadableStream }).body;
  if (body) return hashReadableStream(body);
  const bytes = new Uint8Array(await object.arrayBuffer());
  return { sha256: sha256Hex(bytes), bytes: bytes.byteLength };
}

async function verifyObjectHash(bucket: R2Bucket, key: string, expectedSha256: string): Promise<boolean> {
  const object = await bucket.get(key);
  if (!object) return false;
  return (await hashObjectBody(object)).sha256 === expectedSha256;
}

async function putVerifiedContent(
  bucket: R2Bucket,
  key: string,
  bytes: Uint8Array,
  expectedSha256: string,
  options?: R2PutOptions
): Promise<boolean> {
  const existing = await bucket.get(key);
  if (existing) {
    const existingBytes = new Uint8Array(await existing.arrayBuffer());
    if (sha256Hex(existingBytes) !== expectedSha256) {
      throw new Error(`Immutable evidence object failed verification: ${key}`);
    }
    return true;
  }
  await bucket.put(key, bytes, options);
  const persisted = await bucket.get(key);
  if (!persisted || sha256Hex(new Uint8Array(await persisted.arrayBuffer())) !== expectedSha256) {
    throw new Error(`Immutable evidence object was not durably verified: ${key}`);
  }
  return false;
}

interface StoredCaptureRow {
  capture_id: string;
  request_hash: string;
  response_sha256: string;
  response_object_key: string;
  sidecar_object_key: string;
  sidecar_sha256: string;
}

async function existingCapture(input: {
  db: D1Database;
  bucket: R2Bucket;
  provider: string;
  dataset: CaptureDataset;
  idempotencyKey: string;
  requestHash: string;
  responseSha256: string;
}): Promise<StoredRawCapture | null> {
  const row = await input.db.prepare(`SELECT capture_id, request_hash, response_sha256,
      response_object_key, sidecar_object_key, sidecar_sha256
    FROM source_capture_manifests
    WHERE provider = ? AND dataset = ? AND idempotency_key = ?
    LIMIT 1`)
    .bind(input.provider, input.dataset, input.idempotencyKey)
    .first<StoredCaptureRow>();
  if (!row) return null;
  if (row.request_hash !== input.requestHash || row.response_sha256 !== input.responseSha256) {
    throw new Error("Raw-capture idempotency key resolved to different evidence");
  }
  const verified = await verifyStoredRawCapture({
    bucket: input.bucket,
    responseObjectKey: row.response_object_key,
    responseSha256: row.response_sha256,
    sidecarObjectKey: row.sidecar_object_key,
    sidecarSha256: row.sidecar_sha256
  });
  if (!verified) throw new Error("Previously captured evidence failed immutable verification");
  const sidecar = await input.bucket.get(row.sidecar_object_key);
  if (!sidecar) throw new Error("Previously captured evidence sidecar is missing");
  const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(await sidecar.arrayBuffer()))) as RawCaptureManifest;
  assertSecretFreeManifest(manifest);
  if (manifest.captureId !== row.capture_id || manifest.requestHash !== row.request_hash ||
    manifest.responseSha256 !== row.response_sha256) {
    throw new Error("Previously captured evidence sidecar does not match its D1 pointer");
  }
  return {
    manifest,
    sidecarObjectKey: row.sidecar_object_key,
    sidecarSha256: row.sidecar_sha256,
    deduplicatedResponse: true
  };
}

async function commitBuiltCapture(input: {
  db: D1Database;
  bucket: R2Bucket;
  built: BuiltRawCapture;
  deduplicatedResponse: boolean;
  heartbeatSourceKey?: string;
}): Promise<StoredRawCapture> {
  const { built } = input;
  const heartbeatSourceKey = input.heartbeatSourceKey ?? `${built.manifest.provider}:${built.manifest.dataset}`;
  if (!heartbeatSourceKey.trim()) throw new Error("Capture heartbeat source key is required");
  await putVerifiedContent(
    input.bucket,
    built.sidecarObjectKey,
    built.sidecarBytes,
    built.sidecarSha256,
    {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { sha256: built.sidecarSha256, contract: built.manifest.contractVersion }
    }
  );

  const results = await input.db.batch([
    input.db.prepare(`INSERT OR IGNORE INTO source_capture_manifests (
      capture_id, idempotency_key, provider, dataset, request_hash,
      response_object_key, response_sha256, response_bytes, sidecar_object_key,
      sidecar_sha256, provider_published_at, received_at, valid_from, valid_to,
      source_schema_version, license_id, evidence_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      built.manifest.captureId,
      built.manifest.idempotencyKey,
      built.manifest.provider,
      built.manifest.dataset,
      built.manifest.requestHash,
      built.manifest.responseObjectKey,
      built.manifest.responseSha256,
      built.manifest.responseBytes,
      built.sidecarObjectKey,
      built.sidecarSha256,
      built.manifest.providerPublishedAt,
      built.manifest.receivedAt,
      built.manifest.validFrom,
      built.manifest.validTo,
      built.manifest.sourceSchemaVersion,
      built.manifest.licenseId,
      built.manifest.evidenceHash
    ),
    input.db.prepare(`INSERT INTO source_capture_heartbeats (
      source_key, provider, dataset, status, last_attempt_at, last_success_at,
      last_failure_at, failure_code, latest_capture_id
    ) VALUES (?, ?, ?, 'current', ?, ?, NULL, NULL, ?)
    ON CONFLICT(source_key) DO UPDATE SET
      status = CASE WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
        THEN 'current' ELSE source_capture_heartbeats.status END,
      last_attempt_at = max(source_capture_heartbeats.last_attempt_at, excluded.last_attempt_at),
      last_success_at = CASE WHEN source_capture_heartbeats.last_success_at IS NULL OR
        excluded.last_success_at >= source_capture_heartbeats.last_success_at
        THEN excluded.last_success_at ELSE source_capture_heartbeats.last_success_at END,
      last_failure_at = CASE WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
        THEN NULL ELSE source_capture_heartbeats.last_failure_at END,
      failure_code = CASE WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
        THEN NULL ELSE source_capture_heartbeats.failure_code END,
      latest_capture_id = CASE WHEN source_capture_heartbeats.last_success_at IS NULL OR
        excluded.last_success_at >= source_capture_heartbeats.last_success_at
        THEN excluded.latest_capture_id ELSE source_capture_heartbeats.latest_capture_id END`).bind(
      heartbeatSourceKey,
      built.manifest.provider,
      built.manifest.dataset,
      built.manifest.receivedAt,
      built.manifest.receivedAt,
      built.manifest.captureId
    )
  ]);

  if (Number(results[0]?.meta.changes ?? 0) === 0) {
    const winner = await existingCapture({
      db: input.db,
      bucket: input.bucket,
      provider: built.manifest.provider,
      dataset: built.manifest.dataset,
      idempotencyKey: built.manifest.idempotencyKey,
      requestHash: built.manifest.requestHash,
      responseSha256: built.manifest.responseSha256
    });
    if (!winner) throw new Error("Raw-capture pointer was not committed");
    return winner;
  }

  return {
    manifest: built.manifest,
    sidecarObjectKey: built.sidecarObjectKey,
    sidecarSha256: built.sidecarSha256,
    deduplicatedResponse: input.deduplicatedResponse
  };
}

export async function storeRawCapture(input: {
  db: D1Database;
  bucket: R2Bucket;
  idempotencyKey: string;
  provider: string;
  dataset: CaptureDataset;
  request: RedactedHttpRequest;
  responseBytes: Uint8Array;
  contentType?: string | null;
  etag?: string | null;
  providerPublishedAt?: string | null;
  receivedAt: string;
  validFrom?: string | null;
  validTo?: string | null;
  sourceSchemaVersion: string;
  licenseId: string;
  heartbeatSourceKey?: string;
}): Promise<StoredRawCapture> {
  const built = buildRawCaptureManifest(input);
  const prior = await existingCapture({
    db: input.db,
    bucket: input.bucket,
    provider: input.provider,
    dataset: input.dataset,
    idempotencyKey: input.idempotencyKey,
    requestHash: built.manifest.requestHash,
    responseSha256: built.manifest.responseSha256
  });
  if (prior) return prior;

  const deduplicatedResponse = await putVerifiedContent(
    input.bucket,
    built.manifest.responseObjectKey,
    input.responseBytes,
    built.manifest.responseSha256,
    {
      httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
      customMetadata: {
        sha256: built.manifest.responseSha256,
        provider: input.provider,
        dataset: input.dataset
      }
    }
  );
  return commitBuiltCapture({
    db: input.db,
    bucket: input.bucket,
    built,
    deduplicatedResponse,
    heartbeatSourceKey: input.heartbeatSourceKey
  });
}

/**
 * Stores a large response without materializing it in Worker memory. Callers
 * tee the provider body: one branch feeds normalization and this branch is
 * staged to R2, hashed while streaming, then copied to its content address.
 */
export async function storeRawCaptureStream(input: {
  db: D1Database;
  bucket: R2Bucket;
  idempotencyKey: string;
  provider: string;
  dataset: CaptureDataset;
  request: RedactedHttpRequest;
  responseStream: ReadableStream;
  contentType?: string | null;
  etag?: string | null;
  providerPublishedAt?: string | null;
  receivedAt?: string;
  validFrom?: string | null;
  validFromAtReceipt?: boolean;
  validTo?: string | null;
  sourceSchemaVersion: string;
  licenseId: string;
  heartbeatSourceKey?: string;
}): Promise<StoredRawCapture> {
  const stagingKey = `staging/raw-capture/${randomUUID()}`;
  const hash = createHash("sha256");
  let responseBytes = 0;
  const measured = input.responseStream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      hash.update(chunk);
      responseBytes += chunk.byteLength;
      controller.enqueue(chunk);
    }
  }));

  try {
    await input.bucket.put(stagingKey, measured, {
      httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
      customMetadata: { state: "uncommitted-raw-capture" }
    });
    if (responseBytes === 0) throw new Error("Raw capture stream returned no bytes");
    const responseSha256 = hash.digest("hex");
    const receivedAt = input.receivedAt ?? new Date().toISOString();
    const built = buildRawCaptureManifestFromDigest({
      ...input,
      responseSha256,
      responseByteLength: responseBytes,
      receivedAt,
      validFrom: input.validFromAtReceipt ? receivedAt : input.validFrom
    });
    const prior = await existingCapture({
      db: input.db,
      bucket: input.bucket,
      provider: input.provider,
      dataset: input.dataset,
      idempotencyKey: input.idempotencyKey,
      requestHash: built.manifest.requestHash,
      responseSha256
    });
    if (prior) return prior;

    const existing = await input.bucket.get(built.manifest.responseObjectKey);
    let deduplicatedResponse = existing !== null;
    if (existing) {
      if ((await hashObjectBody(existing)).sha256 !== responseSha256) {
        throw new Error(`Immutable evidence object failed verification: ${built.manifest.responseObjectKey}`);
      }
    } else {
      const staged = await input.bucket.get(stagingKey);
      if (!staged) throw new Error("Staged raw capture disappeared before content-addressed publication");
      await input.bucket.put(built.manifest.responseObjectKey, staged.body, {
        httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
        customMetadata: {
          sha256: responseSha256,
          provider: input.provider,
          dataset: input.dataset
        }
      });
      if (!await verifyObjectHash(input.bucket, built.manifest.responseObjectKey, responseSha256)) {
        throw new Error("Streamed evidence object was not durably verified");
      }
      deduplicatedResponse = false;
    }
    return await commitBuiltCapture({
      db: input.db,
      bucket: input.bucket,
      built,
      deduplicatedResponse,
      heartbeatSourceKey: input.heartbeatSourceKey
    });
  } finally {
    await input.bucket.delete(stagingKey).catch(() => undefined);
  }
}

export async function recordCaptureFailure(input: {
  db: D1Database;
  provider: string;
  dataset: CaptureDataset;
  attemptedAt: string;
  failureCode: "provider_unavailable" | "schema_invalid" | "partial_import" | "quota_blocked" | "storage_failure";
  idempotencyKey: string;
  sourceKey?: string;
}): Promise<void> {
  const attemptedAt = new Date(input.attemptedAt).toISOString();
  const sourceKey = input.sourceKey ?? `${input.provider}:${input.dataset}`;
  if (!sourceKey.trim()) throw new Error("Capture heartbeat source key is required");
  const alertId = stableHash({
    contract: "engine-os.capture-failure.v1",
    sourceKey,
    failureCode: input.failureCode,
    idempotencyKey: input.idempotencyKey
  });
  await input.db.batch([
    input.db.prepare(`INSERT INTO source_capture_heartbeats (
      source_key, provider, dataset, status, last_attempt_at, last_success_at,
      last_failure_at, failure_code, latest_capture_id
    ) VALUES (?, ?, ?, 'stale', ?, NULL, ?, ?, NULL)
    ON CONFLICT(source_key) DO UPDATE SET
      status = CASE WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
        THEN 'stale' ELSE source_capture_heartbeats.status END,
      last_attempt_at = max(source_capture_heartbeats.last_attempt_at, excluded.last_attempt_at),
      last_failure_at = CASE WHEN source_capture_heartbeats.last_failure_at IS NULL OR
        excluded.last_failure_at >= source_capture_heartbeats.last_failure_at
        THEN excluded.last_failure_at ELSE source_capture_heartbeats.last_failure_at END,
      failure_code = CASE WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
        THEN excluded.failure_code ELSE source_capture_heartbeats.failure_code END`)
      .bind(sourceKey, input.provider, input.dataset, attemptedAt, attemptedAt, input.failureCode),
    input.db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
      alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
    ) VALUES (?, 'source_capture_failure', ?, 'error', 'open', ?, ?)`)
      .bind(
        alertId,
        `${sourceKey}:${input.idempotencyKey}`,
        attemptedAt,
        JSON.stringify({ sourceKey, failureCode: input.failureCode })
      )
  ]);
}

export async function recordCaptureFreshnessConfirmation(input: {
  db: D1Database;
  provider: string;
  dataset: CaptureDataset;
  confirmedAt: string;
  sourceKey?: string;
}): Promise<void> {
  const confirmedAt = new Date(input.confirmedAt).toISOString();
  const sourceKey = input.sourceKey ?? `${input.provider}:${input.dataset}`;
  if (!sourceKey.trim()) throw new Error("Capture heartbeat source key is required");
  const existing = await input.db.prepare(`SELECT latest_capture_id FROM source_capture_heartbeats
    WHERE source_key = ? LIMIT 1`).bind(sourceKey).first<{ latest_capture_id: string | null }>();
  if (!existing?.latest_capture_id) {
    throw new Error("A not-modified response cannot confirm a source with no captured object");
  }
  await input.db.prepare(`UPDATE source_capture_heartbeats SET
      status = 'current', last_attempt_at = max(last_attempt_at, ?),
      last_success_at = CASE WHEN last_success_at IS NULL OR ? >= last_success_at THEN ? ELSE last_success_at END,
      last_failure_at = CASE WHEN ? >= last_attempt_at THEN NULL ELSE last_failure_at END,
      failure_code = CASE WHEN ? >= last_attempt_at THEN NULL ELSE failure_code END
    WHERE source_key = ?`)
    .bind(confirmedAt, confirmedAt, confirmedAt, confirmedAt, confirmedAt, sourceKey).run();
}

export async function verifyStoredRawCapture(input: {
  bucket: R2Bucket;
  responseObjectKey: string;
  responseSha256: string;
  sidecarObjectKey: string;
  sidecarSha256: string;
}): Promise<boolean> {
  const [response, sidecar] = await Promise.all([
    input.bucket.get(input.responseObjectKey),
    input.bucket.get(input.sidecarObjectKey)
  ]);
  if (!response || !sidecar) return false;
  const [responseDigest, sidecarDigest] = await Promise.all([
    hashObjectBody(response),
    hashObjectBody(sidecar)
  ]);
  return responseDigest.sha256 === input.responseSha256 && sidecarDigest.sha256 === input.sidecarSha256;
}
