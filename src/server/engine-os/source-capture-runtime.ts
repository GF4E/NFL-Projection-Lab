import type { CaptureDataset, RedactedHttpRequest } from "@/domain/engine-os";
import { canonicalJson, sha256Hex } from "@/domain/hash";
import engineOperatingContractJson from "../../../config/engine-operating-contract.v1.json";
import sourceCaptureContractV5Json from "../../../config/source-capture-contract-2026.v5.json";
import {
  OS03A_EFFECTIVE_CONTRACT_HASH,
  OS03A_EFFECTIVE_CONTRACT_VERSION,
  assertRegisteredCaptureRequest,
  assertSecretFreeCanonicalValue,
  assertSecretFreeCaptureResponse,
  buildCaptureAlertId,
  buildCaptureEventId,
  buildEventPayloadHash,
  buildLaterImportHash,
  buildManifestExtensionHash,
  buildOs03aCaptureEvidence,
  buildOs03aManifestExtension,
  buildSidecarSha256,
  buildUsageRightsHash,
  getQualificationSourceProfile,
  sourceCaptureQualificationProfiles,
  sourceCaptureKey,
  verifyOs03aCaptureSidecar,
  type CaptureEventType,
  type CaptureFailureCode,
  type CaptureValidationState,
  type Os03aCaptureSidecar,
  type Os03aManifestExtension,
  type UsageRightsMetadata
} from "@/domain/source-capture-contract";

const OBJECT_MAX_BYTES = 100_000_000;
const QUALIFICATION_ORPHAN_MINIMUM_AGE_SECONDS = 86_400;
const SAFE_OBJECT_PREFIXES = ["raw/", "manifests/os03a/"] as const;

const sourceMaximumAgeSeconds = Object.freeze({
  schedule: engineOperatingContractJson.maximumSourceAgeSeconds.schedule,
  play_by_play: engineOperatingContractJson.maximumSourceAgeSeconds.current_season_play_by_play,
  roster: engineOperatingContractJson.maximumSourceAgeSeconds.weekly_roster,
  injury: engineOperatingContractJson.maximumSourceAgeSeconds.official_injury_report,
  inactive_roof: Math.min(
    engineOperatingContractJson.maximumSourceAgeSeconds.official_inactives_at_kickoff_minus_90,
    engineOperatingContractJson.maximumSourceAgeSeconds.roof_status_at_kickoff_minus_90
  ),
  weather: engineOperatingContractJson.maximumSourceAgeSeconds.kickoff_hour_weather_issue,
  odds: Math.min(
    engineOperatingContractJson.maximumSourceAgeSeconds.odds_opener,
    engineOperatingContractJson.maximumSourceAgeSeconds.odds_ordinary,
    engineOperatingContractJson.maximumSourceAgeSeconds.odds_kickoff_minus_120,
    engineOperatingContractJson.maximumSourceAgeSeconds.odds_kickoff_minus_60,
    engineOperatingContractJson.maximumSourceAgeSeconds.odds_kickoff_minus_15
  )
} satisfies Record<CaptureDataset, number>);

for (const [dataset, maximumAgeSeconds] of Object.entries(sourceMaximumAgeSeconds)) {
  if (!Number.isSafeInteger(maximumAgeSeconds) || maximumAgeSeconds < 1) {
    throw new Error(`Frozen OS-00B maximum source age is invalid for ${dataset}`);
  }
}

const profileMaximumAgeSeconds = Object.freeze(Object.fromEntries(
  Object.entries(sourceCaptureContractV5Json.profileFreshnessThresholds)
    .map(([profileId, threshold]) => [profileId, threshold.maximumAgeSeconds])
) as Record<string, number>);

for (const profile of sourceCaptureQualificationProfiles) {
  const profileAge = profileMaximumAgeSeconds[profile.profileId];
  const operatingAge = sourceMaximumAgeSeconds[profile.dataset as CaptureDataset];
  if (!Number.isSafeInteger(profileAge) || profileAge !== operatingAge) {
    throw new Error(`Frozen OS-03A profile freshness threshold diverges from OS-00B: ${profile.profileId}`);
  }
}

type Clock = () => Date;

function canonicalTimestamp(value: string | Date, label: string): string {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(milliseconds).toISOString();
}

function now(clock: Clock | undefined, label: string): string {
  return canonicalTimestamp((clock ?? (() => new Date()))(), label);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

async function objectBytes(bucket: R2Bucket, key: string): Promise<Uint8Array | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  return new Uint8Array(await object.arrayBuffer());
}

class ImmutableEvidenceMismatchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ImmutableEvidenceMismatchError";
  }
}

async function verifyExactObject(bucket: R2Bucket, key: string, expected: Uint8Array): Promise<void> {
  const recovered = await objectBytes(bucket, key);
  if (!recovered || !bytesEqual(recovered, expected)) {
    throw new ImmutableEvidenceMismatchError(
      `Immutable evidence object failed exact-byte verification: ${key}`
    );
  }
}

async function publishExactObject(input: {
  bucket: R2Bucket;
  key: string;
  bytes: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
}): Promise<boolean> {
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > OBJECT_MAX_BYTES) {
    throw new Error("Immutable evidence object is outside the frozen byte limits");
  }
  const prior = await objectBytes(input.bucket, input.key);
  if (prior) {
    if (!bytesEqual(prior, input.bytes)) {
      throw new Error(`Immutable evidence object key contains different bytes: ${input.key}`);
    }
    return true;
  }
  await input.bucket.put(input.key, input.bytes, {
    httpMetadata: { contentType: input.contentType },
    customMetadata: {
      ...input.metadata,
      sha256: sha256Hex(input.bytes),
      state: "immutable"
    }
  });
  await verifyExactObject(input.bucket, input.key, input.bytes);
  return false;
}

interface BaseCaptureRow {
  capture_id: string;
  idempotency_key: string;
  provider: string;
  dataset: CaptureDataset;
  request_hash: string;
  response_object_key: string;
  response_sha256: string;
  response_bytes: number;
  sidecar_object_key: string;
  sidecar_sha256: string;
  provider_published_at: string | null;
  received_at: string;
  valid_from: string | null;
  valid_to: string | null;
  source_schema_version: string;
  license_id: string;
  evidence_hash: string;
}

interface ExtensionRow {
  capture_id: string;
  contract_version: string;
  contract_hash: string;
  profile_id: string;
  capture_class: string;
  source_key: string;
  source_observed_at: string | null;
  receipt_completed_at: string;
  persistence_requested_at: string;
  response_persisted_at: string;
  sidecar_persisted_at: string;
  manifest_persisted_at: string;
  content_type: string;
  etag: string | null;
  usage_rights_json: string;
  usage_rights_hash: string;
  validation_state: CaptureValidationState;
  failure_codes_json: string;
  later_import_json: string;
  later_import_hash: string;
  extension_hash: string;
}

interface EventRow {
  event_id: string;
  attempt_token: string;
  event_type: CaptureEventType;
  capture_id: string | null;
  source_key: string;
  provider: string;
  dataset: CaptureDataset;
  idempotency_key: string;
  occurred_at: string;
  event_payload_hash: string;
  payload_json: string;
}

interface CaptureRows {
  base: BaseCaptureRow;
  extension: ExtensionRow;
}

async function captureRowsByIdentity(input: {
  db: D1Database;
  provider: string;
  dataset: CaptureDataset;
  idempotencyKey: string;
}): Promise<CaptureRows | null> {
  const row = await input.db.prepare(`SELECT
      base.capture_id, base.idempotency_key, base.provider, base.dataset,
      base.request_hash, base.response_object_key, base.response_sha256,
      base.response_bytes, base.sidecar_object_key, base.sidecar_sha256,
      base.provider_published_at, base.received_at, base.valid_from, base.valid_to,
      base.source_schema_version, base.license_id, base.evidence_hash,
      extension.contract_version AS extension_contract_version,
      extension.contract_hash AS extension_contract_hash,
      extension.profile_id, extension.capture_class, extension.source_key,
      extension.source_observed_at, extension.receipt_completed_at,
      extension.persistence_requested_at, extension.response_persisted_at,
      extension.sidecar_persisted_at, extension.manifest_persisted_at,
      extension.content_type AS extension_content_type, extension.etag AS extension_etag,
      extension.usage_rights_json, extension.usage_rights_hash,
      extension.validation_state, extension.failure_codes_json,
      extension.later_import_json, extension.later_import_hash, extension.extension_hash
    FROM source_capture_manifests base
    LEFT JOIN source_capture_manifest_extensions extension
      ON extension.capture_id = base.capture_id
    WHERE base.provider = ? AND base.dataset = ? AND base.idempotency_key = ?
    LIMIT 1`)
    .bind(input.provider, input.dataset, input.idempotencyKey)
    .first<Record<string, unknown>>();
  if (!row) return null;
  if (!row.extension_contract_version) {
    throw new Error("OS-03A base manifest exists without its immutable extension");
  }
  return {
    base: {
      capture_id: row.capture_id as string,
      idempotency_key: row.idempotency_key as string,
      provider: row.provider as string,
      dataset: row.dataset as CaptureDataset,
      request_hash: row.request_hash as string,
      response_object_key: row.response_object_key as string,
      response_sha256: row.response_sha256 as string,
      response_bytes: Number(row.response_bytes),
      sidecar_object_key: row.sidecar_object_key as string,
      sidecar_sha256: row.sidecar_sha256 as string,
      provider_published_at: row.provider_published_at as string | null,
      received_at: row.received_at as string,
      valid_from: row.valid_from as string | null,
      valid_to: row.valid_to as string | null,
      source_schema_version: row.source_schema_version as string,
      license_id: row.license_id as string,
      evidence_hash: row.evidence_hash as string
    },
    extension: {
      capture_id: row.capture_id as string,
      contract_version: row.extension_contract_version as string,
      contract_hash: row.extension_contract_hash as string,
      profile_id: row.profile_id as string,
      capture_class: row.capture_class as string,
      source_key: row.source_key as string,
      source_observed_at: row.source_observed_at as string | null,
      receipt_completed_at: row.receipt_completed_at as string,
      persistence_requested_at: row.persistence_requested_at as string,
      response_persisted_at: row.response_persisted_at as string,
      sidecar_persisted_at: row.sidecar_persisted_at as string,
      manifest_persisted_at: row.manifest_persisted_at as string,
      content_type: row.extension_content_type as string,
      etag: row.extension_etag as string | null,
      usage_rights_json: row.usage_rights_json as string,
      usage_rights_hash: row.usage_rights_hash as string,
      validation_state: row.validation_state as CaptureValidationState,
      failure_codes_json: row.failure_codes_json as string,
      later_import_json: row.later_import_json as string,
      later_import_hash: row.later_import_hash as string,
      extension_hash: row.extension_hash as string
    }
  };
}

async function captureRowsById(db: D1Database, captureId: string): Promise<CaptureRows | null> {
  const identity = await db.prepare(`SELECT provider, dataset, idempotency_key
    FROM source_capture_manifests WHERE capture_id = ? LIMIT 1`)
    .bind(captureId)
    .first<{ provider: string; dataset: CaptureDataset; idempotency_key: string }>();
  if (!identity) return null;
  return captureRowsByIdentity({
    db,
    provider: identity.provider,
    dataset: identity.dataset,
    idempotencyKey: identity.idempotency_key
  });
}

function parseSidecar(bytes: Uint8Array): Os03aCaptureSidecar {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ImmutableEvidenceMismatchError("Capture sidecar is not valid canonical UTF-8 JSON");
  }
  assertSecretFreeCanonicalValue(parsed, "Stored capture sidecar");
  return parsed as Os03aCaptureSidecar;
}

function extensionFromRow(row: ExtensionRow): Os03aManifestExtension {
  return {
    captureId: row.capture_id,
    contractVersion: row.contract_version as Os03aManifestExtension["contractVersion"],
    contractHash: row.contract_hash,
    profileId: row.profile_id,
    captureClass: row.capture_class as "qualification_fixture",
    sourceKey: row.source_key,
    sourceObservedAt: row.source_observed_at,
    receiptCompletedAt: row.receipt_completed_at,
    persistenceRequestedAt: row.persistence_requested_at,
    responsePersistedAt: row.response_persisted_at,
    sidecarPersistedAt: row.sidecar_persisted_at,
    manifestPersistedAt: row.manifest_persisted_at,
    contentType: row.content_type,
    etag: row.etag,
    usageRights: JSON.parse(row.usage_rights_json) as UsageRightsMetadata,
    usageRightsHash: row.usage_rights_hash,
    validationState: row.validation_state,
    failureCodes: JSON.parse(row.failure_codes_json) as CaptureFailureCode[],
    laterImport: JSON.parse(row.later_import_json) as Os03aManifestExtension["laterImport"],
    laterImportHash: row.later_import_hash,
    extensionHash: row.extension_hash
  };
}

function assertRowsMatchSidecar(rows: CaptureRows, sidecar: Os03aCaptureSidecar): void {
  const { base, extension } = rows;
  const checks: Array<[unknown, unknown]> = [
    [base.capture_id, sidecar.captureId],
    [base.idempotency_key, sidecar.idempotencyKey],
    [base.provider, sidecar.provider],
    [base.dataset, sidecar.dataset],
    [base.request_hash, sidecar.requestHash],
    [base.response_object_key, sidecar.responseObjectKey],
    [base.response_sha256, sidecar.responseSha256],
    [base.response_bytes, sidecar.responseBytes],
    [base.provider_published_at, sidecar.providerPublishedAt],
    [base.received_at, sidecar.receiptCompletedAt],
    [base.valid_from, sidecar.validFrom],
    [base.valid_to, sidecar.validTo],
    [base.source_schema_version, sidecar.sourceSchemaVersion],
    [base.license_id, sidecar.usageRights.licenseId],
    [base.evidence_hash, sidecar.evidenceHash],
    [extension.capture_id, sidecar.captureId],
    [extension.contract_hash, OS03A_EFFECTIVE_CONTRACT_HASH],
    [extension.profile_id, sidecar.profileId],
    [extension.capture_class, sidecar.captureClass],
    [extension.source_key, sidecar.sourceKey],
    [extension.source_observed_at, sidecar.sourceObservedAt],
    [extension.receipt_completed_at, sidecar.receiptCompletedAt],
    [extension.persistence_requested_at, sidecar.persistenceRequestedAt],
    [extension.response_persisted_at, sidecar.responsePersistedAt],
    [extension.content_type, sidecar.contentType],
    [extension.etag, sidecar.etag],
    [extension.usage_rights_hash, sidecar.usageRightsHash],
    [extension.validation_state, sidecar.validationState],
    [extension.later_import_hash, sidecar.laterImportHash]
  ];
  if (checks.some(([left, right]) => left !== right)) {
    throw new ImmutableEvidenceMismatchError(
      "Stored D1 pointer does not match its immutable OS-03A sidecar"
    );
  }
  if (
    canonicalJson(JSON.parse(extension.usage_rights_json)) !== canonicalJson(sidecar.usageRights) ||
    canonicalJson(JSON.parse(extension.failure_codes_json)) !== canonicalJson(sidecar.failureCodes) ||
    canonicalJson(JSON.parse(extension.later_import_json)) !== canonicalJson(sidecar.laterImport)
  ) {
    throw new ImmutableEvidenceMismatchError(
      "Stored OS-03A extension JSON does not match its sidecar"
    );
  }
  if (
    buildUsageRightsHash(sidecar.usageRights) !== sidecar.usageRightsHash ||
    buildLaterImportHash(sidecar.laterImport) !== sidecar.laterImportHash ||
    buildManifestExtensionHash(extensionFromRow(extension)) !== extension.extension_hash
  ) {
    throw new ImmutableEvidenceMismatchError("Stored OS-03A extension hash failed verification");
  }
}

async function verifyCaptureRows(bucket: R2Bucket, rows: CaptureRows): Promise<Os03aCaptureSidecar> {
  const response = await objectBytes(bucket, rows.base.response_object_key);
  const sidecarBytes = await objectBytes(bucket, rows.base.sidecar_object_key);
  if (!response || !sidecarBytes) {
    throw new ImmutableEvidenceMismatchError("Stored OS-03A evidence object is missing");
  }
  if (
    response.byteLength !== rows.base.response_bytes ||
    sha256Hex(response) !== rows.base.response_sha256 ||
    sha256Hex(sidecarBytes) !== rows.base.sidecar_sha256
  ) {
    throw new ImmutableEvidenceMismatchError("Stored OS-03A evidence object is corrupt");
  }
  const sidecar = parseSidecar(sidecarBytes);
  try {
    verifyOs03aCaptureSidecar(sidecar);
  } catch (cause) {
    throw new ImmutableEvidenceMismatchError(
      `Stored OS-03A sidecar semantic verification failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause }
    );
  }
  if (buildSidecarSha256(sidecar) !== rows.base.sidecar_sha256) {
    throw new ImmutableEvidenceMismatchError(
      "Stored OS-03A sidecar self-hash failed verification"
    );
  }
  assertRowsMatchSidecar(rows, sidecar);
  if (sidecar.responseSha256 !== sha256Hex(response)) {
    throw new ImmutableEvidenceMismatchError(
      "Stored response bytes do not match their OS-03A sidecar"
    );
  }
  return sidecar;
}

function eventIdentity(input: {
  eventType: CaptureEventType;
  attemptToken: string;
  captureId: string | null;
  payload: Record<string, unknown>;
}): {
  eventId: string;
  eventType: CaptureEventType;
  attemptToken: string;
  captureId: string | null;
  payloadHash: string;
  payloadJson: string;
} {
  const payloadHash = buildEventPayloadHash(input.payload);
  return {
    payloadHash,
    payloadJson: canonicalJson(input.payload),
    eventType: input.eventType,
    attemptToken: input.attemptToken,
    captureId: input.captureId,
    eventId: buildCaptureEventId({
      eventType: input.eventType,
      attemptToken: input.attemptToken,
      captureId: input.captureId,
      eventPayloadHash: payloadHash
    })
  };
}

async function eventByAttempt(db: D1Database, attemptToken: string): Promise<EventRow | null> {
  return db.prepare(`SELECT * FROM source_capture_events
    WHERE attempt_token = ? LIMIT 1`)
    .bind(attemptToken)
    .first<EventRow>();
}

function assertExactEvent(row: EventRow | null, expected: {
  eventId: string;
  eventType: CaptureEventType;
  attemptToken: string;
  captureId: string | null;
  payloadHash: string;
  payloadJson: string;
}): void {
  if (!row || row.event_id !== expected.eventId || row.event_type !== expected.eventType ||
      row.attempt_token !== expected.attemptToken || row.capture_id !== expected.captureId ||
      row.event_payload_hash !== expected.payloadHash ||
      row.payload_json !== expected.payloadJson) {
    throw new Error("Capture attempt token resolved to a different immutable event");
  }
}

async function executeExactEventBatch(input: {
  db: D1Database;
  attemptToken: string;
  event: ReturnType<typeof eventIdentity>;
  statements: D1PreparedStatement[];
}): Promise<void> {
  try {
    await input.db.batch(input.statements);
  } catch (error) {
    const concurrent = await eventByAttempt(input.db, input.attemptToken);
    try {
      assertExactEvent(concurrent, input.event);
      return;
    } catch {
      throw error;
    }
  }
  assertExactEvent(await eventByAttempt(input.db, input.attemptToken), input.event);
}

function eventInsertStatement(input: {
  db: D1Database;
  eventId: string;
  attemptToken: string;
  eventType: CaptureEventType;
  captureId: string | null;
  sourceKey: string;
  provider: string;
  dataset: CaptureDataset;
  idempotencyKey: string;
  occurredAt: string;
  payloadHash: string;
  payloadJson: string;
}): D1PreparedStatement {
  const values: unknown[] = [
    input.eventId,
    input.attemptToken,
    input.eventType,
    input.captureId,
    input.sourceKey,
    input.provider,
    input.dataset,
    input.idempotencyKey,
    input.occurredAt,
    input.payloadHash,
    input.payloadJson
  ];
  return input.db.prepare(`INSERT INTO source_capture_events (
      event_id, attempt_token, event_type, capture_id, source_key, provider, dataset,
      idempotency_key, occurred_at, event_payload_hash, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values);
}

export interface StoreOs03aCaptureInput {
  db: D1Database;
  bucket: R2Bucket;
  profileId: string;
  attemptToken: string;
  idempotencyKey: string;
  request: RedactedHttpRequest;
  responseBytes: Uint8Array;
  contentType: string;
  etag?: string | null;
  sourceObservedAt?: string | null;
  providerPublishedAt?: string | null;
  receiptCompletedAt: string;
  persistenceRequestedAt: string;
  validFrom?: string | null;
  validTo?: string | null;
  sourceSchemaVersion: string;
  usageRights: UsageRightsMetadata;
  validationState: CaptureValidationState;
  failureCodes?: readonly CaptureFailureCode[];
  clock?: Clock;
}

export interface StoredOs03aCapture {
  status: "committed" | "deduplicated";
  captureId: string;
  responseObjectKey: string;
  responseSha256: string;
  sidecarObjectKey: string;
  sidecarSha256: string;
  validationState: CaptureValidationState;
  deduplicatedResponse: boolean;
  providerDispatches: 0;
}

function rowsMatchCandidate(rows: CaptureRows, sidecar: Os03aCaptureSidecar): boolean {
  return rows.base.capture_id === sidecar.captureId &&
    rows.base.request_hash === sidecar.requestHash &&
    rows.base.response_sha256 === sidecar.responseSha256 &&
    rows.base.evidence_hash === sidecar.evidenceHash &&
    rows.extension.profile_id === sidecar.profileId &&
    rows.extension.source_key === sidecar.sourceKey &&
    rows.extension.validation_state === sidecar.validationState &&
    rows.extension.usage_rights_hash === sidecar.usageRightsHash &&
    rows.extension.later_import_hash === sidecar.laterImportHash;
}

async function appendDeduplicationEvent(input: {
  db: D1Database;
  rows: CaptureRows;
  sidecar: Os03aCaptureSidecar;
  attemptToken: string;
  occurredAt: string;
}): Promise<void> {
  const payload = {
    captureId: input.sidecar.captureId,
    evidenceHash: input.sidecar.evidenceHash,
    responseSha256: input.sidecar.responseSha256,
    sidecarSha256: input.rows.base.sidecar_sha256,
    outcome: "deduplicated"
  } as const;
  const event = eventIdentity({
    eventType: "capture_deduplicated",
    attemptToken: input.attemptToken,
    captureId: input.sidecar.captureId,
    payload
  });
  const prior = await eventByAttempt(input.db, input.attemptToken);
  if (prior) {
    assertExactEvent(prior, event);
    return;
  }
  await executeExactEventBatch({
    db: input.db,
    attemptToken: input.attemptToken,
    event,
    statements: [
    eventInsertStatement({
      db: input.db,
      ...event,
      attemptToken: input.attemptToken,
      eventType: "capture_deduplicated",
      captureId: input.sidecar.captureId,
      sourceKey: input.sidecar.sourceKey,
      provider: input.sidecar.provider,
      dataset: input.sidecar.dataset,
      idempotencyKey: input.sidecar.idempotencyKey,
      occurredAt: input.occurredAt
    }),
    input.db.prepare(`UPDATE source_capture_heartbeats
      SET last_attempt_at = max(last_attempt_at, ?)
      WHERE source_key = ? AND latest_capture_id = ?
        AND EXISTS (SELECT 1 FROM source_capture_events WHERE event_id = ? AND event_payload_hash = ?)`)
      .bind(
        input.occurredAt,
        input.sidecar.sourceKey,
        input.sidecar.captureId,
        event.eventId,
        event.payloadHash
      )
    ]
  });
}

class PostCommitCaptureVerificationError extends Error {
  constructor(message: string, options: { cause: unknown }) {
    super(message, options);
    this.name = "PostCommitCaptureVerificationError";
  }
}

function deterministicPostCommitAttemptToken(input: {
  committedAttemptToken: string;
  captureId: string;
  phase: string;
}): string {
  return `postcommit:${sha256Hex(canonicalJson({
    contractVersion: OS03A_EFFECTIVE_CONTRACT_VERSION,
    committedAttemptToken: input.committedAttemptToken,
    captureId: input.captureId,
    phase: input.phase
  }))}`;
}

async function recordPostCommitFailure(input: {
  db: D1Database;
  rows: CaptureRows;
  committedAttemptToken: string;
  failedAt: string;
  failureCode: CaptureFailureCode;
  phase: string;
}): Promise<void> {
  const { base, extension } = input.rows;
  const observedFailureAt = canonicalTimestamp(input.failedAt, "Post-commit failure time");
  const failedAt = Date.parse(observedFailureAt) >= Date.parse(extension.manifest_persisted_at)
    ? observedFailureAt
    : canonicalTimestamp(extension.manifest_persisted_at, "Manifest persistence time");
  await recordOs03aCaptureFailure({
    db: input.db,
    profileId: extension.profile_id,
    attemptToken: deterministicPostCommitAttemptToken({
      committedAttemptToken: input.committedAttemptToken,
      captureId: base.capture_id,
      phase: input.phase
    }),
    idempotencyKey: base.idempotency_key,
    failedAt,
    failureCode: input.failureCode,
    safeContext: {
      captureId: base.capture_id,
      evidenceHash: base.evidence_hash,
      phase: input.phase,
      pointerDisposition: "preserved_prior_only"
    }
  });
}

async function hasPermanentEvidenceVerificationFailure(
  db: D1Database,
  sourceKey: string,
  captureId: string
): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM source_capture_events
    WHERE source_key = ? AND event_type = 'capture_failed'
      AND json_extract(payload_json, '$.failureCode') = 'corrupt_object'
      AND json_extract(payload_json, '$.context.captureId') = ?
      AND json_extract(payload_json, '$.context.phase') =
        'post_manifest_pre_pointer_r2_verification'
    LIMIT 1`).bind(sourceKey, captureId).first<{ found: number }>();
  return row?.found === 1;
}

async function hasRetryablePointerPublicationFailure(
  db: D1Database,
  sourceKey: string,
  captureId: string,
  lastFailureAt: string | null
): Promise<boolean> {
  if (!lastFailureAt) return false;
  const row = await db.prepare(`SELECT 1 AS found FROM source_capture_events
    WHERE source_key = ? AND event_type = 'capture_failed' AND occurred_at = ?
      AND json_extract(payload_json, '$.failureCode') = 'manifest_failure'
      AND json_extract(payload_json, '$.context.captureId') = ?
      AND json_extract(payload_json, '$.context.phase') = 'verified_usable_pointer_publication'
    LIMIT 1`).bind(sourceKey, lastFailureAt, captureId).first<{ found: number }>();
  return row?.found === 1;
}

async function verifyCommittedCaptureOrFailClosed(input: {
  db: D1Database;
  bucket: R2Bucket;
  rows: CaptureRows;
  committedAttemptToken: string;
  expectedEvidenceHash: string;
  clock?: Clock;
}): Promise<Os03aCaptureSidecar> {
  if (await hasPermanentEvidenceVerificationFailure(
    input.db,
    input.rows.extension.source_key,
    input.rows.base.capture_id
  )) {
    throw new PostCommitCaptureVerificationError(
      "Post-commit immutable capture is permanently ineligible after evidence verification failure",
      { cause: new Error("Immutable evidence failure is append-only") }
    );
  }
  try {
    const persisted = await verifyCaptureRows(input.bucket, input.rows);
    if (persisted.evidenceHash !== input.expectedEvidenceHash) {
      throw new ImmutableEvidenceMismatchError(
        "Post-commit immutable capture verification resolved different evidence"
      );
    }
    return persisted;
  } catch (failure) {
    const failureCode: CaptureFailureCode = failure instanceof ImmutableEvidenceMismatchError
      ? "corrupt_object"
      : "storage_failure";
    await recordPostCommitFailure({
      db: input.db,
      rows: input.rows,
      committedAttemptToken: input.committedAttemptToken,
      failedAt: now(input.clock, "Post-commit verification failure observation time"),
      failureCode,
      phase: "post_manifest_pre_pointer_r2_verification"
    });
    throw new PostCommitCaptureVerificationError(
      failureCode === "corrupt_object"
        ? "Post-commit immutable capture verification failed; latest-good was not advanced"
        : "Post-commit immutable capture verification was unavailable; latest-good was not advanced",
      { cause: failure }
    );
  }
}

async function publishVerifiedUsablePointer(input: {
  db: D1Database;
  rows: CaptureRows;
  committedAttemptToken: string;
  clock?: Clock;
}): Promise<void> {
  const { base, extension } = input.rows;
  if (extension.validation_state !== "usable") return;
  const attemptToken = `publication:${sha256Hex(canonicalJson({
    contractVersion: OS03A_EFFECTIVE_CONTRACT_VERSION,
    captureId: base.capture_id,
    phase: "verified_usable_pointer_publication"
  }))}`;
  const payload = {
    captureId: base.capture_id,
    evidenceHash: base.evidence_hash,
    extensionHash: extension.extension_hash,
    responseSha256: base.response_sha256,
    sidecarSha256: base.sidecar_sha256,
    validationState: extension.validation_state
  };
  const event = eventIdentity({
    eventType: "capture_committed_usable",
    attemptToken,
    captureId: base.capture_id,
    payload
  });
  const prior = await eventByAttempt(input.db, attemptToken);
  let requiresCurrentPublication = !prior;
  if (prior) {
    assertExactEvent(prior, event);
    const heartbeat = await input.db.prepare(`SELECT status, last_failure_at, latest_capture_id
      FROM source_capture_heartbeats WHERE source_key = ? LIMIT 1`)
      .bind(extension.source_key)
      .first<{ status: string; last_failure_at: string | null; latest_capture_id: string | null }>();
    const retryableRecovery = heartbeat?.latest_capture_id === base.capture_id &&
      heartbeat.status !== "current" &&
      await hasRetryablePointerPublicationFailure(
        input.db,
        extension.source_key,
        base.capture_id,
        heartbeat.last_failure_at
      );
    if (heartbeat?.latest_capture_id && !retryableRecovery) return;
    requiresCurrentPublication = retryableRecovery || !heartbeat?.latest_capture_id;
  }

  const verifiedAt = now(input.clock, "Verified usable pointer publication time");
  if (Date.parse(verifiedAt) < Date.parse(extension.manifest_persisted_at)) {
    const failure = new Error("Verified usable time cannot predate manifest persistence");
    await recordPostCommitFailure({
      db: input.db,
      rows: input.rows,
      committedAttemptToken: input.committedAttemptToken,
      failedAt: extension.manifest_persisted_at,
      failureCode: "manifest_failure",
      phase: "verified_usable_time_regression"
    });
    throw new PostCommitCaptureVerificationError(
      "Verified pointer publication failed; verification time regressed",
      { cause: failure }
    );
  }
  try {
    const statements: D1PreparedStatement[] = [];
    if (!prior) {
      statements.push(eventInsertStatement({
        db: input.db,
        ...event,
        attemptToken,
        eventType: "capture_committed_usable",
        captureId: base.capture_id,
        sourceKey: extension.source_key,
        provider: base.provider,
        dataset: base.dataset,
        idempotencyKey: base.idempotency_key,
        occurredAt: verifiedAt
      }));
    }
    const exactEventPredicate = `EXISTS (
      SELECT 1 FROM source_capture_events event
      JOIN source_capture_manifests manifest ON manifest.capture_id = event.capture_id
      JOIN source_capture_manifest_extensions candidate ON candidate.capture_id = manifest.capture_id
      WHERE event.event_id = ? AND event.event_payload_hash = ?
        AND event.event_type = 'capture_committed_usable'
        AND manifest.evidence_hash = ? AND candidate.extension_hash = ?
        AND candidate.source_key = ? AND candidate.validation_state = 'usable'
        AND NOT EXISTS (
          SELECT 1 FROM source_capture_events failed
          WHERE failed.source_key = candidate.source_key AND failed.event_type = 'capture_failed'
            AND json_extract(failed.payload_json, '$.failureCode') = 'corrupt_object'
            AND json_extract(failed.payload_json, '$.context.captureId') = candidate.capture_id
            AND json_extract(failed.payload_json, '$.context.phase') =
              'post_manifest_pre_pointer_r2_verification'
        )
    )`;
    const exactEventBindings = [
      event.eventId,
      event.payloadHash,
      base.evidence_hash,
      extension.extension_hash,
      extension.source_key
    ] as const;
    statements.push(input.db.prepare(`INSERT OR IGNORE INTO source_capture_heartbeats (
        source_key, provider, dataset, status, last_attempt_at, last_success_at,
        last_failure_at, failure_code, latest_capture_id
      ) SELECT ?, ?, ?, 'current', ?, ?, NULL, NULL, ?
        WHERE ${exactEventPredicate}`).bind(
      extension.source_key,
      base.provider,
      base.dataset,
      verifiedAt,
      verifiedAt,
      base.capture_id,
      ...exactEventBindings
    ));
    statements.push(input.db.prepare(`UPDATE source_capture_heartbeats
      SET provider = ?, dataset = ?, status = 'current', last_attempt_at = ?,
        last_success_at = CASE WHEN last_success_at IS NULL OR ? > last_success_at
          THEN ? ELSE last_success_at END,
        last_failure_at = NULL, failure_code = NULL,
        latest_capture_id = CASE
          WHEN latest_capture_id IS NULL THEN ?
          WHEN EXISTS (
            SELECT 1 FROM source_capture_manifest_extensions candidate
            JOIN source_capture_manifest_extensions incumbent
              ON incumbent.capture_id = source_capture_heartbeats.latest_capture_id
            WHERE candidate.capture_id = ? AND (
              julianday(candidate.receipt_completed_at) > julianday(incumbent.receipt_completed_at) OR
              (candidate.receipt_completed_at = incumbent.receipt_completed_at AND
                candidate.capture_id > incumbent.capture_id)
            )
          ) THEN ? ELSE latest_capture_id END
      WHERE source_key = ? AND ? >= last_attempt_at AND ${exactEventPredicate}
        AND (
          latest_capture_id IS NULL OR
          EXISTS (
            SELECT 1 FROM source_capture_manifest_extensions candidate
            JOIN source_capture_manifest_extensions incumbent
              ON incumbent.capture_id = source_capture_heartbeats.latest_capture_id
            WHERE candidate.capture_id = ? AND (
              julianday(candidate.receipt_completed_at) > julianday(incumbent.receipt_completed_at) OR
              (candidate.receipt_completed_at = incumbent.receipt_completed_at AND
                candidate.capture_id > incumbent.capture_id)
            )
          ) OR (
            latest_capture_id = ? AND (
              status = 'current' OR (
                failure_code = 'manifest_failure' AND last_failure_at IS NOT NULL AND EXISTS (
                  SELECT 1 FROM source_capture_events failed
                  WHERE failed.source_key = source_capture_heartbeats.source_key
                    AND failed.event_type = 'capture_failed'
                    AND failed.occurred_at = source_capture_heartbeats.last_failure_at
                    AND json_extract(failed.payload_json, '$.failureCode') = 'manifest_failure'
                    AND json_extract(failed.payload_json, '$.context.captureId') = ?
                    AND json_extract(failed.payload_json, '$.context.phase') =
                      'verified_usable_pointer_publication'
                )
              )
            )
          )
        )`).bind(
      base.provider,
      base.dataset,
      verifiedAt,
      verifiedAt,
      verifiedAt,
      base.capture_id,
      base.capture_id,
      base.capture_id,
      extension.source_key,
      verifiedAt,
      ...exactEventBindings,
      base.capture_id,
      base.capture_id,
      base.capture_id
    ));

    try {
      await input.db.batch(statements);
    } catch (batchFailure) {
      try {
        assertExactEvent(await eventByAttempt(input.db, attemptToken), event);
        const head = await input.db.prepare(`SELECT heartbeat.status, heartbeat.failure_code,
            heartbeat.latest_capture_id,
            expected.capture_id AS expected_capture_id
          FROM source_capture_heartbeats heartbeat
          JOIN (
            SELECT published.capture_id
            FROM source_capture_events published
            JOIN source_capture_manifest_extensions eligible
              ON eligible.capture_id = published.capture_id
            WHERE published.source_key = ? AND published.event_type = 'capture_committed_usable'
              AND NOT EXISTS (
                SELECT 1 FROM source_capture_events failed
                WHERE failed.source_key = published.source_key AND failed.event_type = 'capture_failed'
                  AND json_extract(failed.payload_json, '$.failureCode') = 'corrupt_object'
                  AND json_extract(failed.payload_json, '$.context.captureId') = published.capture_id
                  AND json_extract(failed.payload_json, '$.context.phase') =
                    'post_manifest_pre_pointer_r2_verification'
              )
            ORDER BY julianday(eligible.receipt_completed_at) DESC, eligible.capture_id DESC
            LIMIT 1
          ) expected
          WHERE heartbeat.source_key = ? LIMIT 1`).bind(extension.source_key, extension.source_key)
          .first<{
            status: string;
            failure_code: string | null;
            latest_capture_id: string | null;
            expected_capture_id: string;
          }>();
        if (!head || head.latest_capture_id !== head.expected_capture_id ||
            (requiresCurrentPublication && head.expected_capture_id === base.capture_id &&
              (head.status !== "current" || head.failure_code !== null))) {
          throw batchFailure;
        }
        return;
      } catch {
        throw batchFailure;
      }
    }
    assertExactEvent(await eventByAttempt(input.db, attemptToken), event);
    const head = await input.db.prepare(`SELECT heartbeat.status, heartbeat.failure_code,
        heartbeat.latest_capture_id,
        expected.capture_id AS expected_capture_id
      FROM source_capture_heartbeats heartbeat
      JOIN (
        SELECT published.capture_id
        FROM source_capture_events published
        JOIN source_capture_manifest_extensions eligible ON eligible.capture_id = published.capture_id
        WHERE published.source_key = ? AND published.event_type = 'capture_committed_usable'
          AND NOT EXISTS (
            SELECT 1 FROM source_capture_events failed
            WHERE failed.source_key = published.source_key AND failed.event_type = 'capture_failed'
              AND json_extract(failed.payload_json, '$.failureCode') = 'corrupt_object'
              AND json_extract(failed.payload_json, '$.context.captureId') = published.capture_id
              AND json_extract(failed.payload_json, '$.context.phase') =
                'post_manifest_pre_pointer_r2_verification'
          )
        ORDER BY julianday(eligible.receipt_completed_at) DESC, eligible.capture_id DESC LIMIT 1
      ) expected
      WHERE heartbeat.source_key = ? LIMIT 1`).bind(extension.source_key, extension.source_key)
      .first<{
        status: string;
        failure_code: string | null;
        latest_capture_id: string | null;
        expected_capture_id: string;
      }>();
    if (!head || head.latest_capture_id !== head.expected_capture_id ||
        (requiresCurrentPublication && head.expected_capture_id === base.capture_id &&
          (head.status !== "current" || head.failure_code !== null))) {
      throw new Error("Verified usable capture did not establish the deterministic latest-good pointer");
    }
  } catch (failure) {
    try {
      await recordPostCommitFailure({
        db: input.db,
        rows: input.rows,
        committedAttemptToken: input.committedAttemptToken,
        failedAt: now(input.clock, "Pointer publication failure observation time"),
        failureCode: "manifest_failure",
        phase: "verified_usable_pointer_publication"
      });
    } catch (journalFailure) {
      throw new AggregateError(
        [failure, journalFailure],
        "Verified pointer publication failed and its failure could not be journaled"
      );
    }
    throw new PostCommitCaptureVerificationError(
      "Verified pointer publication failed; latest-good remains fail-closed",
      { cause: failure }
    );
  }
}

async function commitCapture(input: {
  db: D1Database;
  bucket: R2Bucket;
  built: ReturnType<typeof buildOs03aCaptureEvidence>;
  extension: Os03aManifestExtension;
  attemptToken: string;
  sidecarSha256: string;
  sidecarObjectKey: string;
  deduplicatedResponse: boolean;
  clock?: Clock;
}): Promise<StoredOs03aCapture> {
  const { sidecar } = input.built;
  const eventType: CaptureEventType = sidecar.validationState === "usable"
    ? "capture_committed"
    : "capture_committed_raw_only";
  const payload = {
    captureId: sidecar.captureId,
    evidenceHash: sidecar.evidenceHash,
    extensionHash: input.extension.extensionHash,
    responseSha256: sidecar.responseSha256,
    sidecarSha256: input.sidecarSha256,
    validationState: sidecar.validationState
  };
  const event = eventIdentity({
    eventType,
    attemptToken: input.attemptToken,
    captureId: sidecar.captureId,
    payload
  });
  const priorEvent = await eventByAttempt(input.db, input.attemptToken);
  if (priorEvent) {
    assertExactEvent(priorEvent, event);
    const rows = await captureRowsByIdentity({
      db: input.db,
      provider: sidecar.provider,
      dataset: sidecar.dataset,
      idempotencyKey: sidecar.idempotencyKey
    });
    if (!rows || !rowsMatchCandidate(rows, sidecar)) {
      throw new Error("Committed event exists without matching immutable capture evidence");
    }
    await verifyCommittedCaptureOrFailClosed({
      db: input.db,
      bucket: input.bucket,
      rows,
      committedAttemptToken: input.attemptToken,
      expectedEvidenceHash: sidecar.evidenceHash,
      clock: input.clock
    });
    await publishVerifiedUsablePointer({
      db: input.db,
      rows,
      committedAttemptToken: input.attemptToken,
      clock: input.clock
    });
    return {
      status: "deduplicated",
      captureId: sidecar.captureId,
      responseObjectKey: rows.base.response_object_key,
      responseSha256: rows.base.response_sha256,
      sidecarObjectKey: rows.base.sidecar_object_key,
      sidecarSha256: rows.base.sidecar_sha256,
      validationState: rows.extension.validation_state,
      deduplicatedResponse: true,
      providerDispatches: 0
    };
  }

  const rightsJson = canonicalJson(input.extension.usageRights);
  const failureCodesJson = canonicalJson(input.extension.failureCodes);
  const laterImportJson = canonicalJson(input.extension.laterImport);
  const isUsable = sidecar.validationState === "usable";
  const heartbeatStatus = isUsable ? "current" : "partial";

  const statements: D1PreparedStatement[] = [
    input.db.prepare(`INSERT OR IGNORE INTO source_capture_manifests (
      capture_id, idempotency_key, provider, dataset, request_hash,
      response_object_key, response_sha256, response_bytes, sidecar_object_key,
      sidecar_sha256, provider_published_at, received_at, valid_from, valid_to,
      source_schema_version, license_id, evidence_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      sidecar.captureId,
      sidecar.idempotencyKey,
      sidecar.provider,
      sidecar.dataset,
      sidecar.requestHash,
      sidecar.responseObjectKey,
      sidecar.responseSha256,
      sidecar.responseBytes,
      input.sidecarObjectKey,
      input.sidecarSha256,
      sidecar.providerPublishedAt,
      sidecar.receiptCompletedAt,
      sidecar.validFrom,
      sidecar.validTo,
      sidecar.sourceSchemaVersion,
      sidecar.usageRights.licenseId,
      sidecar.evidenceHash
    ),
    input.db.prepare(`INSERT OR IGNORE INTO source_capture_manifest_extensions (
      capture_id, contract_version, contract_hash, profile_id, capture_class, source_key,
      source_observed_at, receipt_completed_at, persistence_requested_at,
      response_persisted_at, sidecar_persisted_at, manifest_persisted_at,
      content_type, etag, usage_rights_json, usage_rights_hash, validation_state,
      failure_codes_json, later_import_json, later_import_hash, extension_hash
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM source_capture_manifests
        WHERE capture_id = ? AND provider = ? AND dataset = ? AND idempotency_key = ?
          AND request_hash = ? AND response_sha256 = ? AND response_bytes = ?
          AND sidecar_object_key = ? AND sidecar_sha256 = ? AND evidence_hash = ?
      ) AND NOT EXISTS (
        SELECT 1 FROM source_capture_events detected
        WHERE detected.event_type = 'orphan_detected'
          AND json_extract(detected.payload_json, '$.objectKey') IN (?, ?)
          AND NOT EXISTS (
            SELECT 1 FROM source_capture_events removed
            WHERE removed.event_type = 'orphan_removed'
              AND json_extract(removed.payload_json, '$.objectKey') =
                json_extract(detected.payload_json, '$.objectKey')
              AND removed.occurred_at >= detected.occurred_at
          )
      )`).bind(
      input.extension.captureId,
      OS03A_EFFECTIVE_CONTRACT_VERSION,
      input.extension.contractHash,
      input.extension.profileId,
      input.extension.captureClass,
      input.extension.sourceKey,
      input.extension.sourceObservedAt,
      input.extension.receiptCompletedAt,
      input.extension.persistenceRequestedAt,
      input.extension.responsePersistedAt,
      input.extension.sidecarPersistedAt,
      input.extension.manifestPersistedAt,
      input.extension.contentType,
      input.extension.etag,
      rightsJson,
      input.extension.usageRightsHash,
      input.extension.validationState,
      failureCodesJson,
      laterImportJson,
      input.extension.laterImportHash,
      input.extension.extensionHash,
      sidecar.captureId,
      sidecar.provider,
      sidecar.dataset,
      sidecar.idempotencyKey,
      sidecar.requestHash,
      sidecar.responseSha256,
      sidecar.responseBytes,
      input.sidecarObjectKey,
      input.sidecarSha256,
      sidecar.evidenceHash,
      sidecar.responseObjectKey,
      input.sidecarObjectKey
    ),
    eventInsertStatement({
      db: input.db,
      ...event,
      attemptToken: input.attemptToken,
      eventType,
      captureId: sidecar.captureId,
      sourceKey: sidecar.sourceKey,
      provider: sidecar.provider,
      dataset: sidecar.dataset,
      idempotencyKey: sidecar.idempotencyKey,
      occurredAt: input.extension.manifestPersistedAt
    }),
    input.db.prepare(`INSERT INTO source_capture_heartbeats (
      source_key, provider, dataset, status, last_attempt_at, last_success_at,
      last_failure_at, failure_code, latest_capture_id
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ? <> 'usable' AND EXISTS (
        SELECT 1 FROM source_capture_events event
        JOIN source_capture_manifests base ON base.capture_id = event.capture_id
        JOIN source_capture_manifest_extensions extension ON extension.capture_id = base.capture_id
        WHERE event.event_id = ? AND event.event_payload_hash = ?
          AND base.evidence_hash = ? AND extension.extension_hash = ?
          AND extension.source_key = ? AND extension.validation_state = ?
      )
      ON CONFLICT(source_key) DO UPDATE SET
        status = CASE
          WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
          THEN excluded.status ELSE source_capture_heartbeats.status END,
        last_attempt_at = max(source_capture_heartbeats.last_attempt_at, excluded.last_attempt_at),
        last_success_at = CASE
          WHEN excluded.last_success_at IS NULL THEN source_capture_heartbeats.last_success_at
          WHEN source_capture_heartbeats.last_success_at IS NULL OR excluded.last_success_at > source_capture_heartbeats.last_success_at
          THEN excluded.last_success_at ELSE source_capture_heartbeats.last_success_at END,
        last_failure_at = CASE
          WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
          THEN excluded.last_failure_at ELSE source_capture_heartbeats.last_failure_at END,
        failure_code = CASE
          WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
          THEN excluded.failure_code ELSE source_capture_heartbeats.failure_code END,
        latest_capture_id = CASE
          WHEN excluded.latest_capture_id IS NULL THEN source_capture_heartbeats.latest_capture_id
          WHEN source_capture_heartbeats.latest_capture_id IS NULL THEN excluded.latest_capture_id
          WHEN EXISTS (
            SELECT 1 FROM source_capture_manifest_extensions candidate
            JOIN source_capture_manifest_extensions incumbent
              ON incumbent.capture_id = source_capture_heartbeats.latest_capture_id
            WHERE candidate.capture_id = excluded.latest_capture_id
              AND (
                candidate.receipt_completed_at > incumbent.receipt_completed_at OR
                (candidate.receipt_completed_at = incumbent.receipt_completed_at AND
                  candidate.capture_id > incumbent.capture_id)
              )
          ) THEN excluded.latest_capture_id
          ELSE source_capture_heartbeats.latest_capture_id END`).bind(
      sidecar.sourceKey,
      sidecar.provider,
      sidecar.dataset,
      heartbeatStatus,
      input.extension.manifestPersistedAt,
      isUsable ? input.extension.manifestPersistedAt : null,
      isUsable ? null : input.extension.manifestPersistedAt,
      isUsable ? null : sidecar.failureCodes[0] ?? "schema_invalid",
      isUsable ? sidecar.captureId : null,
      sidecar.validationState,
      event.eventId,
      event.payloadHash,
      sidecar.evidenceHash,
      input.extension.extensionHash,
      sidecar.sourceKey,
      sidecar.validationState
    )
  ];

  if (!isUsable) {
    const failureCode = sidecar.failureCodes[0] ?? "schema_invalid";
    const alertId = buildCaptureAlertId({
      sourceKey: sidecar.sourceKey,
      failureCode,
      idempotencyKey: sidecar.idempotencyKey
    });
    statements.push(input.db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
      alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
    ) SELECT ?, 'source_capture_failure', ?, 'error', 'open', ?, ?
      WHERE EXISTS (SELECT 1 FROM source_capture_events WHERE event_id = ? AND event_payload_hash = ?)`)
      .bind(
        alertId,
        `os03a:${sidecar.sourceKey}:${sidecar.idempotencyKey}:${failureCode}`,
        input.extension.manifestPersistedAt,
        canonicalJson({
          contractVersion: OS03A_EFFECTIVE_CONTRACT_VERSION,
          sourceKey: sidecar.sourceKey,
          failureCode,
          idempotencyKey: sidecar.idempotencyKey,
          captureId: sidecar.captureId
        }),
        event.eventId,
        event.payloadHash
      ));
  }

  try {
    await input.db.batch(statements);
  } catch (error) {
    // Same-attempt duplicate delivery requires an exact event. A deliberate
    // retry with another attempt token may instead lose the manifest race to
    // equivalent evidence whose retry-only persistence clocks differ.
    const winner = await captureRowsByIdentity({
      db: input.db,
      provider: sidecar.provider,
      dataset: sidecar.dataset,
      idempotencyKey: sidecar.idempotencyKey
    });
    if (!winner || !rowsMatchCandidate(winner, sidecar)) throw error;
    const concurrent = await eventByAttempt(input.db, input.attemptToken);
    if (concurrent) assertExactEvent(concurrent, event);
    const verifiedWinner = await verifyCommittedCaptureOrFailClosed({
      db: input.db,
      bucket: input.bucket,
      rows: winner,
      committedAttemptToken: input.attemptToken,
      expectedEvidenceHash: sidecar.evidenceHash,
      clock: input.clock
    });
    await publishVerifiedUsablePointer({
      db: input.db,
      rows: winner,
      committedAttemptToken: input.attemptToken,
      clock: input.clock
    });
    if (!concurrent) {
      await appendDeduplicationEvent({
        db: input.db,
        rows: winner,
        sidecar: verifiedWinner,
        attemptToken: input.attemptToken,
        occurredAt: now(input.clock, "Concurrent capture deduplication time")
      });
    }
    return {
      status: "deduplicated",
      captureId: sidecar.captureId,
      responseObjectKey: winner.base.response_object_key,
      responseSha256: winner.base.response_sha256,
      sidecarObjectKey: winner.base.sidecar_object_key,
      sidecarSha256: winner.base.sidecar_sha256,
      validationState: winner.extension.validation_state,
      deduplicatedResponse: true,
      providerDispatches: 0
    };
  }
  const rows = await captureRowsByIdentity({
    db: input.db,
    provider: sidecar.provider,
    dataset: sidecar.dataset,
    idempotencyKey: sidecar.idempotencyKey
  });
  if (!rows || !rowsMatchCandidate(rows, sidecar)) {
    throw new Error("OS-03A manifest transaction lost an immutable identity collision");
  }
  assertExactEvent(await eventByAttempt(input.db, input.attemptToken), event);
  await verifyCommittedCaptureOrFailClosed({
    db: input.db,
    bucket: input.bucket,
    rows,
    committedAttemptToken: input.attemptToken,
    expectedEvidenceHash: sidecar.evidenceHash,
    clock: input.clock
  });
  await publishVerifiedUsablePointer({
    db: input.db,
    rows,
    committedAttemptToken: input.attemptToken,
    clock: input.clock
  });
  if (isUsable) {
    const pointer = await input.db.prepare(`SELECT latest_capture_id FROM source_capture_heartbeats
      WHERE source_key = ? LIMIT 1`).bind(sidecar.sourceKey)
      .first<{ latest_capture_id: string | null }>();
    if (!pointer?.latest_capture_id) throw new Error("Usable capture did not establish a last-good pointer");
  }
  return {
    status: "committed",
    captureId: sidecar.captureId,
    responseObjectKey: sidecar.responseObjectKey,
    responseSha256: sidecar.responseSha256,
    sidecarObjectKey: input.sidecarObjectKey,
    sidecarSha256: input.sidecarSha256,
    validationState: sidecar.validationState,
    deduplicatedResponse: input.deduplicatedResponse,
    providerDispatches: 0
  };
}

function classifyStorageFailure(error: unknown, phase: "response" | "sidecar" | "manifest"): CaptureFailureCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/secret|credential/i.test(message)) return "secret_filtered";
  if (/corrupt|different bytes|verification/i.test(message)) return "corrupt_object";
  return phase === "manifest" ? "manifest_failure" : "storage_failure";
}

export async function storeOs03aCapture(input: StoreOs03aCaptureInput): Promise<StoredOs03aCapture> {
  const profile = getQualificationSourceProfile(input.profileId);
  let phase: "response" | "sidecar" | "manifest" = "response";
  let built: ReturnType<typeof buildOs03aCaptureEvidence> | null = null;
  try {
    assertSecretFreeCanonicalValue({
      attemptToken: input.attemptToken,
      idempotencyKey: input.idempotencyKey
    }, "Capture identity metadata");
    assertRegisteredCaptureRequest(profile, input.request);
    assertSecretFreeCaptureResponse(profile, input.contentType, input.responseBytes);
    const responseSha256 = sha256Hex(input.responseBytes);
    const responseObjectKey = `raw/${profile.provider}/${profile.dataset}/sha256/${responseSha256}`;
    const persistenceRequestedAt = canonicalTimestamp(input.persistenceRequestedAt, "Persistence request time");
    const priorIdentity = await captureRowsByIdentity({
      db: input.db,
      provider: profile.provider,
      dataset: profile.dataset,
      idempotencyKey: input.idempotencyKey
    });
    if (priorIdentity) {
      const preliminary = buildOs03aCaptureEvidence({
        ...input,
        persistenceRequestedAt,
        responsePersistedAt: persistenceRequestedAt
      });
      if (!rowsMatchCandidate(priorIdentity, preliminary.sidecar)) {
        throw new Error("OS-03A idempotency key resolved to different immutable evidence");
      }
      const priorAttempt = await eventByAttempt(input.db, input.attemptToken);
      if (priorAttempt) {
        if (
          priorAttempt.capture_id !== priorIdentity.base.capture_id ||
          priorAttempt.source_key !== priorIdentity.extension.source_key ||
          priorAttempt.provider !== priorIdentity.base.provider ||
          priorAttempt.dataset !== priorIdentity.base.dataset ||
          priorAttempt.idempotency_key !== priorIdentity.base.idempotency_key ||
          !["capture_committed", "capture_committed_raw_only", "capture_deduplicated"].includes(
            priorAttempt.event_type
          )
        ) {
          throw new Error("Capture attempt token was already consumed by a different terminal event");
        }
      }
      const winner = await verifyCommittedCaptureOrFailClosed({
        db: input.db,
        bucket: input.bucket,
        rows: priorIdentity,
        committedAttemptToken: input.attemptToken,
        expectedEvidenceHash: preliminary.sidecar.evidenceHash,
        clock: input.clock
      });
      await publishVerifiedUsablePointer({
        db: input.db,
        rows: priorIdentity,
        committedAttemptToken: input.attemptToken,
        clock: input.clock
      });
      if (!priorAttempt) {
        await appendDeduplicationEvent({
          db: input.db,
          rows: priorIdentity,
          sidecar: winner,
          attemptToken: input.attemptToken,
          occurredAt: now(input.clock, "Capture deduplication time")
        });
      }
      return {
        status: "deduplicated",
        captureId: winner.captureId,
        responseObjectKey: priorIdentity.base.response_object_key,
        responseSha256: priorIdentity.base.response_sha256,
        sidecarObjectKey: priorIdentity.base.sidecar_object_key,
        sidecarSha256: priorIdentity.base.sidecar_sha256,
        validationState: priorIdentity.extension.validation_state,
        deduplicatedResponse: true,
        providerDispatches: 0
      };
    }

    const deduplicatedResponse = await publishExactObject({
      bucket: input.bucket,
      key: responseObjectKey,
      bytes: input.responseBytes,
      contentType: input.contentType,
      metadata: { provider: profile.provider, dataset: profile.dataset, contract: OS03A_EFFECTIVE_CONTRACT_VERSION }
    });
    const responsePersistedAt = now(input.clock, "Response persistence time");
    built = buildOs03aCaptureEvidence({
      ...input,
      persistenceRequestedAt,
      responsePersistedAt
    });
    if (built.responseObjectKey !== responseObjectKey) {
      throw new Error("Response identity changed after immutable publication");
    }

    phase = "sidecar";
    await publishExactObject({
      bucket: input.bucket,
      key: built.sidecarObjectKey,
      bytes: built.sidecarBytes,
      contentType: "application/json",
      metadata: { captureId: built.sidecar.captureId, contract: OS03A_EFFECTIVE_CONTRACT_VERSION }
    });
    const sidecarPersistedAt = now(input.clock, "Sidecar persistence time");
    const manifestPersistedAt = now(input.clock, "Manifest persistence time");
    const extension = buildOs03aManifestExtension({
      sidecar: built.sidecar,
      sidecarPersistedAt,
      manifestPersistedAt
    });

    // The final R2 readback immediately precedes the D1 publication boundary.
    await Promise.all([
      verifyExactObject(input.bucket, built.responseObjectKey, input.responseBytes),
      verifyExactObject(input.bucket, built.sidecarObjectKey, built.sidecarBytes)
    ]);
    phase = "manifest";
    return await commitCapture({
      db: input.db,
      bucket: input.bucket,
      built,
      extension,
      attemptToken: input.attemptToken,
      sidecarSha256: built.sidecarSha256,
      sidecarObjectKey: built.sidecarObjectKey,
      deduplicatedResponse,
      clock: input.clock
    });
  } catch (error) {
    if (error instanceof PostCommitCaptureVerificationError) throw error;
    const failureCode = classifyStorageFailure(error, phase);
    const failureMessage = error instanceof Error ? error.message : String(error);
    const updateHeartbeat = !/(?:idempotency key|attempt token|immutable identity collision)/i.test(failureMessage);
    try {
      await recordOs03aCaptureFailure({
        db: input.db,
        profileId: input.profileId,
        attemptToken: input.attemptToken,
        idempotencyKey: input.idempotencyKey,
        failedAt: now(input.clock, "Capture failure time"),
        failureCode,
        updateHeartbeat,
        safeContext: built ? {
          captureId: built.sidecar.captureId,
          responseObjectKey: built.responseObjectKey,
          sidecarObjectKey: phase === "response" ? null : built.sidecarObjectKey
        } : undefined
      });
    } catch (journalError) {
      throw new AggregateError(
        [error, journalError],
        "Capture failed and its required failure event/alert could not be persisted"
      );
    }
    throw error;
  }
}

export async function recordOs03aCaptureFailure(input: {
  db: D1Database;
  profileId: string;
  attemptToken: string;
  idempotencyKey: string;
  failedAt: string;
  failureCode: CaptureFailureCode;
  updateHeartbeat?: boolean;
  safeContext?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const profile = getQualificationSourceProfile(input.profileId);
  assertSecretFreeCanonicalValue({
    attemptToken: input.attemptToken,
    idempotencyKey: input.idempotencyKey
  }, "Capture failure identity metadata");
  const sourceKey = sourceCaptureKey(profile);
  const failedAt = canonicalTimestamp(input.failedAt, "Capture failure time");
  const payload = {
    contractVersion: OS03A_EFFECTIVE_CONTRACT_VERSION,
    sourceKey,
    failureCode: input.failureCode,
    idempotencyKey: input.idempotencyKey,
    ...(input.safeContext ? { context: input.safeContext } : {})
  };
  assertSecretFreeCanonicalValue(payload, "Capture failure payload");
  const event = eventIdentity({
    eventType: "capture_failed",
    attemptToken: input.attemptToken,
    captureId: null,
    payload
  });
  const prior = await eventByAttempt(input.db, input.attemptToken);
  if (prior) {
    assertExactEvent(prior, event);
    return;
  }
  const alertId = buildCaptureAlertId({
    sourceKey,
    failureCode: input.failureCode,
    idempotencyKey: input.idempotencyKey
  });
  const statements: D1PreparedStatement[] = [
    eventInsertStatement({
      db: input.db,
      ...event,
      attemptToken: input.attemptToken,
      eventType: "capture_failed",
      captureId: null,
      sourceKey,
      provider: profile.provider,
      dataset: profile.dataset,
      idempotencyKey: input.idempotencyKey,
      occurredAt: failedAt
    }),
    input.db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
      alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
    ) SELECT ?, 'source_capture_failure', ?, 'error', 'open', ?, ?
      WHERE EXISTS (SELECT 1 FROM source_capture_events WHERE event_id = ? AND event_payload_hash = ?)`)
      .bind(
        alertId,
        `os03a:${sourceKey}:${input.idempotencyKey}:${input.failureCode}`,
        failedAt,
        canonicalJson(payload),
        event.eventId,
        event.payloadHash
      )
  ];
  if (input.updateHeartbeat !== false) {
    statements.push(input.db.prepare(`INSERT INTO source_capture_heartbeats (
        source_key, provider, dataset, status, last_attempt_at, last_success_at,
        last_failure_at, failure_code, latest_capture_id
      ) SELECT ?, ?, ?, 'stale', ?, NULL, ?, ?, NULL
        WHERE EXISTS (SELECT 1 FROM source_capture_events WHERE event_id = ? AND event_payload_hash = ?)
        ON CONFLICT(source_key) DO UPDATE SET
          status = CASE WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
            THEN 'stale' ELSE source_capture_heartbeats.status END,
          last_attempt_at = max(source_capture_heartbeats.last_attempt_at, excluded.last_attempt_at),
          last_failure_at = CASE WHEN excluded.last_failure_at >= source_capture_heartbeats.last_attempt_at
            THEN excluded.last_failure_at ELSE source_capture_heartbeats.last_failure_at END,
          failure_code = CASE WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
            THEN excluded.failure_code ELSE source_capture_heartbeats.failure_code END`)
      .bind(
        sourceKey,
        profile.provider,
        profile.dataset,
        failedAt,
        failedAt,
        input.failureCode,
        event.eventId,
        event.payloadHash
      ));
  }
  await executeExactEventBatch({
    db: input.db,
    attemptToken: input.attemptToken,
    event,
    statements
  });
}

export async function recordOs03aNotModified(input: {
  db: D1Database;
  bucket: R2Bucket;
  profileId: string;
  attemptToken: string;
  idempotencyKey: string;
  confirmedAt: string;
}): Promise<{ captureId: string; providerDispatches: 0 }> {
  const profile = getQualificationSourceProfile(input.profileId);
  const sourceKey = sourceCaptureKey(profile);
  const confirmedAt = canonicalTimestamp(input.confirmedAt, "Not-modified confirmation time");
  const head = await input.db.prepare(`SELECT heartbeat.latest_capture_id AS capture_id
    FROM source_capture_heartbeats heartbeat
    JOIN source_capture_manifest_extensions extension
      ON extension.capture_id = heartbeat.latest_capture_id
    WHERE heartbeat.source_key = ? AND extension.source_key = ?
      AND extension.profile_id = ? AND extension.validation_state = 'usable'
    LIMIT 1`).bind(sourceKey, sourceKey, profile.profileId)
    .first<{ capture_id: string }>();
  if (!head?.capture_id) {
    throw new Error("A not-modified confirmation requires a prior usable capture");
  }
  const rows = await captureRowsById(input.db, head.capture_id);
  if (!rows) throw new Error("Not-modified head is missing its immutable manifest");
  await verifyCaptureRows(input.bucket, rows);
  const payload = {
    captureId: head.capture_id,
    evidenceHash: rows.base.evidence_hash,
    profileId: profile.profileId,
    sourceKey,
    outcome: "not_modified_confirmed"
  } as const;
  const event = eventIdentity({
    eventType: "not_modified_confirmed",
    attemptToken: input.attemptToken,
    captureId: head.capture_id,
    payload
  });
  const prior = await eventByAttempt(input.db, input.attemptToken);
  if (prior) {
    assertExactEvent(prior, event);
    return { captureId: head.capture_id, providerDispatches: 0 };
  }
  await executeExactEventBatch({
    db: input.db,
    attemptToken: input.attemptToken,
    event,
    statements: [
    eventInsertStatement({
      db: input.db,
      ...event,
      attemptToken: input.attemptToken,
      eventType: "not_modified_confirmed",
      captureId: head.capture_id,
      sourceKey,
      provider: profile.provider,
      dataset: profile.dataset,
      idempotencyKey: input.idempotencyKey,
      occurredAt: confirmedAt
    }),
    input.db.prepare(`UPDATE source_capture_heartbeats SET
      status = 'current', last_attempt_at = max(last_attempt_at, ?),
      last_success_at = CASE WHEN last_success_at IS NULL OR ? > last_success_at
        THEN ? ELSE last_success_at END,
      last_failure_at = CASE WHEN ? >= last_attempt_at THEN NULL ELSE last_failure_at END,
      failure_code = CASE WHEN ? >= last_attempt_at THEN NULL ELSE failure_code END
      WHERE source_key = ? AND latest_capture_id = ?
        AND EXISTS (SELECT 1 FROM source_capture_events WHERE event_id = ? AND event_payload_hash = ?)`)
      .bind(
        confirmedAt,
        confirmedAt,
        confirmedAt,
        confirmedAt,
        confirmedAt,
        sourceKey,
        head.capture_id,
        event.eventId,
        event.payloadHash
      )
    ]
  });
  return { captureId: head.capture_id, providerDispatches: 0 };
}

export async function verifyOs03aCaptureOffline(input: {
  db: D1Database;
  bucket: R2Bucket;
  captureId: string;
  attemptToken?: string;
  verifiedAt?: string;
}): Promise<{ sidecar: Os03aCaptureSidecar; providerDispatches: 0 }> {
  const rows = await captureRowsById(input.db, input.captureId);
  if (!rows) throw new Error("OS-03A capture manifest does not exist");
  const sidecar = await verifyCaptureRows(input.bucket, rows);
  if (input.attemptToken || input.verifiedAt) {
    if (!input.attemptToken || !input.verifiedAt) {
      throw new Error("Offline replay event requires both attempt token and verification time");
    }
    const occurredAt = canonicalTimestamp(input.verifiedAt, "Offline replay verification time");
    const payload = {
      captureId: sidecar.captureId,
      evidenceHash: sidecar.evidenceHash,
      responseSha256: sidecar.responseSha256,
      sidecarSha256: rows.base.sidecar_sha256,
      outcome: "replay_verified"
    } as const;
    const event = eventIdentity({
      eventType: "replay_verified",
      attemptToken: input.attemptToken,
      captureId: sidecar.captureId,
      payload
    });
    const prior = await eventByAttempt(input.db, input.attemptToken);
    if (prior) assertExactEvent(prior, event);
    else {
      await executeExactEventBatch({
        db: input.db,
        attemptToken: input.attemptToken,
        event,
        statements: [eventInsertStatement({
        db: input.db,
        ...event,
        attemptToken: input.attemptToken,
        eventType: "replay_verified",
        captureId: sidecar.captureId,
        sourceKey: sidecar.sourceKey,
        provider: sidecar.provider,
        dataset: sidecar.dataset,
        idempotencyKey: sidecar.idempotencyKey,
        occurredAt
        })]
      });
    }
  }
  return { sidecar, providerDispatches: 0 };
}

export async function runOs03aFreshnessWatchdog(input: {
  db: D1Database;
  profileId: string;
  attemptToken: string;
  checkedAt: string;
  maximumAgeSeconds?: number;
}): Promise<{ status: "current" | "stale" | "unavailable"; ageSeconds: number | null; providerDispatches: 0 }> {
  const profile = getQualificationSourceProfile(input.profileId);
  const maximumAgeSeconds = profileMaximumAgeSeconds[profile.profileId];
  if (!maximumAgeSeconds) {
    throw new Error(`Freshness threshold is not frozen for source profile ${profile.profileId}`);
  }
  if (input.maximumAgeSeconds !== undefined && input.maximumAgeSeconds !== maximumAgeSeconds) {
    throw new Error(
      `Freshness maximum age for ${profile.dataset} must equal frozen OS-00B value ${maximumAgeSeconds}`
    );
  }
  const sourceKey = sourceCaptureKey(profile);
  const checkedAt = canonicalTimestamp(input.checkedAt, "Freshness watchdog time");
  const heartbeat = await input.db.prepare(`SELECT status, latest_capture_id
    FROM source_capture_heartbeats WHERE source_key = ? LIMIT 1`).bind(sourceKey)
    .first<{ status: string; latest_capture_id: string | null }>();
  const latest = heartbeat?.latest_capture_id
    ? await input.db.prepare(`SELECT occurred_at FROM source_capture_events
        WHERE source_key = ? AND capture_id = ?
          AND event_type IN ('capture_committed_usable', 'not_modified_confirmed')
        ORDER BY occurred_at DESC, event_id DESC LIMIT 1`)
      .bind(sourceKey, heartbeat.latest_capture_id)
      .first<{ occurred_at: string }>()
    : null;
  if (latest && Date.parse(latest.occurred_at) > Date.parse(checkedAt)) {
    throw new Error("Freshness watchdog time predates the latest successful verification event");
  }
  const ageSeconds = latest
    ? Math.floor((Date.parse(checkedAt) - Date.parse(latest.occurred_at)) / 1000)
    : null;
  if (heartbeat?.status === "current" && ageSeconds !== null && ageSeconds <= maximumAgeSeconds) {
    return { status: "current", ageSeconds, providerDispatches: 0 };
  }
  const status = latest ? "stale" : "unavailable";
  const idempotencyKey = `watchdog:${sourceKey}:${latest?.occurred_at ?? "never"}`;
  const payload = {
    sourceKey,
    checkedAt,
    lastSuccessfulVerificationAt: latest?.occurred_at ?? null,
    maximumAgeSeconds,
    ageSeconds,
    status
  };
  const event = eventIdentity({
    eventType: "freshness_stale",
    attemptToken: input.attemptToken,
    captureId: null,
    payload
  });
  const prior = await eventByAttempt(input.db, input.attemptToken);
  if (prior) assertExactEvent(prior, event);
  else {
    const failureCode: CaptureFailureCode = "provider_unavailable";
    const alertId = buildCaptureAlertId({ sourceKey, failureCode, idempotencyKey });
    await executeExactEventBatch({
      db: input.db,
      attemptToken: input.attemptToken,
      event,
      statements: [
      eventInsertStatement({
        db: input.db,
        ...event,
        attemptToken: input.attemptToken,
        eventType: "freshness_stale",
        captureId: null,
        sourceKey,
        provider: profile.provider,
        dataset: profile.dataset,
        idempotencyKey,
        occurredAt: checkedAt
      }),
      input.db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
        alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
      ) SELECT ?, 'source_capture_stale', ?, 'error', 'open', ?, ?
        WHERE EXISTS (SELECT 1 FROM source_capture_events WHERE event_id = ? AND event_payload_hash = ?)`)
        .bind(
          alertId,
          `os03a:${sourceKey}:freshness:${latest?.occurred_at ?? "never"}`,
          checkedAt,
          canonicalJson(payload),
          event.eventId,
          event.payloadHash
        ),
      input.db.prepare(`INSERT INTO source_capture_heartbeats (
        source_key, provider, dataset, status, last_attempt_at, last_success_at,
        last_failure_at, failure_code, latest_capture_id
      ) SELECT ?, ?, ?, ?, ?, NULL, ?, 'provider_unavailable', NULL
        WHERE EXISTS (SELECT 1 FROM source_capture_events WHERE event_id = ? AND event_payload_hash = ?)
        ON CONFLICT(source_key) DO UPDATE SET
          status = CASE WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
            THEN excluded.status ELSE source_capture_heartbeats.status END,
          last_attempt_at = max(source_capture_heartbeats.last_attempt_at, excluded.last_attempt_at),
          last_failure_at = CASE WHEN excluded.last_failure_at >= source_capture_heartbeats.last_attempt_at
            THEN excluded.last_failure_at ELSE source_capture_heartbeats.last_failure_at END,
          failure_code = CASE WHEN excluded.last_attempt_at >= source_capture_heartbeats.last_attempt_at
            THEN excluded.failure_code ELSE source_capture_heartbeats.failure_code END`)
        .bind(
          sourceKey,
          profile.provider,
          profile.dataset,
          status,
          checkedAt,
          checkedAt,
          event.eventId,
          event.payloadHash
        )
      ]
    });
  }
  return { status, ageSeconds, providerDispatches: 0 };
}

async function objectIsReferenced(db: D1Database, key: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS referenced FROM source_capture_manifests
    WHERE response_object_key = ? OR sidecar_object_key = ? LIMIT 1`).bind(key, key)
    .first<{ referenced: number }>();
  return row?.referenced === 1;
}

async function appendOrphanEvent(input: {
  db: D1Database;
  eventType: "orphan_detected" | "orphan_removed";
  attemptToken: string;
  profileId: string;
  idempotencyKey: string;
  occurredAt: string;
  objectKey: string;
}): Promise<{ eventId: string; occurredAt: string }> {
  const profile = getQualificationSourceProfile(input.profileId);
  const sourceKey = sourceCaptureKey(profile);
  const payload = { objectKey: input.objectKey, qualificationOnly: true };
  const event = eventIdentity({
    eventType: input.eventType,
    attemptToken: input.attemptToken,
    captureId: null,
    payload
  });
  const prior = await eventByAttempt(input.db, input.attemptToken);
  if (prior) {
    assertExactEvent(prior, event);
    return { eventId: event.eventId, occurredAt: input.occurredAt };
  }
  await executeExactEventBatch({
    db: input.db,
    attemptToken: input.attemptToken,
    event,
    statements: [eventInsertStatement({
    db: input.db,
    ...event,
    attemptToken: input.attemptToken,
    eventType: input.eventType,
    captureId: null,
    sourceKey,
    provider: profile.provider,
    dataset: profile.dataset,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt
    })]
  });
  return { eventId: event.eventId, occurredAt: input.occurredAt };
}

async function activeOrphanTombstone(input: {
  db: D1Database;
  profileId: string;
  objectKey: string;
}): Promise<{ eventId: string; occurredAt: string } | null> {
  const profile = getQualificationSourceProfile(input.profileId);
  const sourceKey = sourceCaptureKey(profile);
  const row = await input.db.prepare(`SELECT detected.event_id, detected.occurred_at
    FROM source_capture_events detected
    WHERE detected.event_type = 'orphan_detected'
      AND detected.source_key = ?
      AND json_extract(detected.payload_json, '$.objectKey') = ?
      AND NOT EXISTS (
        SELECT 1 FROM source_capture_events removed
        WHERE removed.event_type = 'orphan_removed'
          AND removed.source_key = detected.source_key
          AND json_extract(removed.payload_json, '$.objectKey') = ?
          AND removed.occurred_at >= detected.occurred_at
      )
    ORDER BY detected.occurred_at DESC, detected.event_id DESC
    LIMIT 1`).bind(sourceKey, input.objectKey, input.objectKey)
    .first<{ event_id: string; occurred_at: string }>();
  return row ? { eventId: row.event_id, occurredAt: row.occurred_at } : null;
}

async function closeOrphanTombstone(input: {
  db: D1Database;
  profileId: string;
  idempotencyKey: string;
  objectKey: string;
  checkedAt: string;
  tombstone: { eventId: string; occurredAt: string };
}): Promise<void> {
  const occurredAt = Date.parse(input.checkedAt) >= Date.parse(input.tombstone.occurredAt)
    ? input.checkedAt
    : input.tombstone.occurredAt;
  await appendOrphanEvent({
    db: input.db,
    eventType: "orphan_removed",
    attemptToken: `orphan-removal:${input.tombstone.eventId}`,
    profileId: input.profileId,
    idempotencyKey: input.idempotencyKey,
    occurredAt,
    objectKey: input.objectKey
  });
}

export async function sweepOs03aQualificationOrphan(input: {
  db: D1Database;
  bucket: R2Bucket;
  qualificationOnly: true;
  profileId: string;
  idempotencyKey: string;
  attemptToken: string;
  objectKey: string;
  checkedAt: string;
}): Promise<{ status: "missing" | "too_young" | "referenced" | "removed"; providerDispatches: 0 }> {
  if (!input.qualificationOnly) throw new Error("OS-03A orphan sweeping is qualification-only");
  if (!SAFE_OBJECT_PREFIXES.some((prefix) => input.objectKey.startsWith(prefix))) {
    throw new Error("Object key is outside the frozen OS-03A orphan prefixes");
  }
  const checkedAt = canonicalTimestamp(input.checkedAt, "Orphan sweep time");
  let tombstone = await activeOrphanTombstone({
    db: input.db,
    profileId: input.profileId,
    objectKey: input.objectKey
  });
  const object = await input.bucket.head(input.objectKey);
  if (!object) {
    if (!tombstone) return { status: "missing", providerDispatches: 0 };
    await closeOrphanTombstone({
      db: input.db,
      profileId: input.profileId,
      idempotencyKey: input.idempotencyKey,
      objectKey: input.objectKey,
      checkedAt,
      tombstone
    });
    return { status: "removed", providerDispatches: 0 };
  }
  const uploaded = (object as R2Object & { uploaded?: Date }).uploaded;
  if (!(uploaded instanceof Date) || !Number.isFinite(uploaded.getTime())) {
    return { status: "too_young", providerDispatches: 0 };
  }
  const ageSeconds = Math.floor((Date.parse(checkedAt) - uploaded.getTime()) / 1000);
  if (ageSeconds < QUALIFICATION_ORPHAN_MINIMUM_AGE_SECONDS) {
    return { status: "too_young", providerDispatches: 0 };
  }
  if (await objectIsReferenced(input.db, input.objectKey)) {
    return { status: "referenced", providerDispatches: 0 };
  }
  tombstone ??= await appendOrphanEvent({
      db: input.db,
      eventType: "orphan_detected",
      attemptToken: `${input.attemptToken}:detected`,
      profileId: input.profileId,
      idempotencyKey: input.idempotencyKey,
      occurredAt: checkedAt,
      objectKey: input.objectKey
    });
  if (await objectIsReferenced(input.db, input.objectKey)) {
    return { status: "referenced", providerDispatches: 0 };
  }
  await input.bucket.delete(input.objectKey);
  if (await input.bucket.head(input.objectKey)) {
    throw new Error("Qualification orphan remained after deletion");
  }
  await closeOrphanTombstone({
    db: input.db,
    profileId: input.profileId,
    idempotencyKey: input.idempotencyKey,
    objectKey: input.objectKey,
    checkedAt,
    tombstone
  });
  return { status: "removed", providerDispatches: 0 };
}

export const os03aProviderIndependentRuntimeBoundary = {
  acceptsSuppliedBytesOnly: true,
  networkDispatches: 0,
  providerSecretReads: 0,
  productionSweeperQualified: false,
  marketQualification: "fixture_only",
  permittedObjectPrefixes: SAFE_OBJECT_PREFIXES,
  orphanMinimumAgeSeconds: QUALIFICATION_ORPHAN_MINIMUM_AGE_SECONDS
} as const;
