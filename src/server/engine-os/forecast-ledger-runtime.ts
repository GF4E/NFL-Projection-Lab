import type {
  ForecastWithholdingReason,
  OriginEligibilityReason,
  RequiredForecastHorizonId
} from "@/domain/engine-os";
import { canonicalJson, sha256Hex, stableHash } from "@/domain/hash";
import {
  classifyForecastEvidenceScope,
  forecastLedgerContract,
  forecastLedgerContractHash,
  forecastLedgerHorizonIds,
  forecastLedgerPersistenceDeadline,
  forecastOutputObjectKey,
  forecastQualificationKey,
  prepareForecastLedgerRecord,
  type ForecastLedgerCaptureHealth,
  type ForecastLedgerOrigin,
  type ForecastLedgerProvenance,
  type ForecastLedgerRecord
} from "./forecast-ledger-kernel";

const JOB_KEY_VERSION = "engine-os.forecast-ledger-job.v1";
const ACTIVATION_KEY_VERSION = "engine-os.forecast-ledger-activation.v2";
const QUALIFICATION_KEY_VERSION = "engine-os.forecast-ledger-qualification-row.v1";
const ATTEMPT_KEY_VERSION = "engine-os.forecast-ledger-attempt.v1";
const EVENT_KEY_VERSION = "engine-os.forecast-ledger-event.v1";
const LEASE_DURATION_MILLISECONDS = 120_000;

const HASH = /^[a-f0-9]{64}$/;
const HORIZON_SQL = forecastLedgerHorizonIds.map(() => "?").join(", ");

export const forecastLedgerRuntimeBoundary = Object.freeze({
  workPackage: "OS-13A",
  qualificationOnly: true,
  productionActivationAllowed: false,
  syntheticFixtureForecastOnly: true,
  externalInputs: Object.freeze(["D1Database", "R2Bucket"]),
  networkDispatches: 0,
  marketDependencies: 0,
  secretReads: 0
});

type ActivationMode = "withholding_only" | "qualified_package";

interface QualificationRow {
  qualification_id: string;
  ledger_contract_version: string;
  ledger_contract_hash: string;
  activation_boundary: string;
  qualification_key: string;
  qualification_key_version: string;
  qualification_stream: "eligible_package" | "no_eligible_package";
  model_or_package_hash: string | null;
  runner_hash: string | null;
  code_hash: string | null;
  config_hash: string | null;
  feature_schema_hash: string | null;
  target_schema_hash: string | null;
  qualification_status: "eligible" | "rejected";
  qualified_at: string;
  qualification_evidence_hash: string;
}

interface ActivationRow {
  activation_id: string;
  ledger_contract_version: string;
  ledger_contract_hash: string;
  activation_boundary: string;
  qualification_id: string;
  evidence_scope: "full_season_shadow" | "partial_season_shadow";
  season: number;
  first_week: number;
  activated_at: string;
  first_origin_utc: string;
  week_one_origin_complete: number;
  qualification_only: number;
}

interface OriginRow {
  origin_version_id: string;
  logical_origin_id: string;
  game_id: string;
  horizon_id: RequiredForecastHorizonId;
  scheduled_for_utc: string;
  eligible: number;
  eligibility_reason: OriginEligibilityReason;
  activation_boundary: string;
  kickoff_utc: string;
}

interface JobRow {
  job_key: string;
  job_key_version: string;
  ledger_contract_version: string;
  ledger_contract_hash: string;
  activation_id: string;
  origin_version_id: string;
  qualification_id: string;
  expected_input_manifest_hash: string | null;
  scheduled_trigger_at: string;
  persistence_deadline_at: string;
  kickoff_at: string;
  state: "pending" | "running" | "completed" | "invalidated";
  fence_token: number;
  active_attempt_token_hash: string | null;
  lease_owner: string | null;
  lease_acquired_at: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface StoredRecordRow {
  record_id: string;
  job_key: string;
  status: "forecast" | "withheld";
  withholding_reason: ForecastWithholdingReason | null;
  attempt_token_hash: string;
  fence_token: number;
  output_object_key: string | null;
  output_object_hash: string | null;
  output_object_bytes: number | null;
  evidence_at: string;
  generated_at: string;
  persistence_requested_at: string;
  persisted_at: string;
  capture_health: ForecastLedgerCaptureHealth;
  payload_json: string;
  payload_hash: string;
}

interface StoredLedgerPayload {
  record: ForecastLedgerRecord;
  invokedAt: string;
  evidenceAt: string;
  publicationRequestedAt: string;
  intentHash: string;
}

interface LedgerEventRow {
  event_id: string;
  event_type: string;
  activation_id: string | null;
  qualification_id: string | null;
  job_key: string | null;
  origin_version_id: string | null;
  attempt_token_hash: string | null;
  fence_token: number | null;
  occurred_at: string;
  evidence_at: string;
  persisted_at: string;
  payload_json: string;
  payload_hash: string;
}

interface LedgerEventInsertion {
  statement: D1PreparedStatement;
  expected: LedgerEventRow;
}

export interface Os13aFixtureQualificationInput {
  db: D1Database;
  activationBoundary: string;
  packageId: string;
  packageHash: string;
  runnerHash: string;
  codeHash: string;
  modelHash: string;
  configHash: string;
  featureSchemaHash: string;
  targetSchemaHash: string;
  qualifiedAt: string;
  qualificationEvidenceHash: string;
}

export interface Os13aActivationInput {
  db: D1Database;
  activationBoundary: string;
  mode: ActivationMode;
  qualificationId?: string | null;
  season: number;
  firstWeek: number;
  activatedAt: string;
  firstOriginUtc: string;
  weekOneOriginComplete: boolean;
}

export interface ForecastLedgerJobLease {
  jobKey: string;
  originVersionId: string;
  activationId: string;
  attemptTokenHash: string;
  fence: number;
  owner: string;
  invokedAt: string;
  leaseExpiresAt: string;
  reclaimed: boolean;
}

export interface ForecastLedgerPublicationInput {
  db: D1Database;
  bucket: R2Bucket;
  lease: ForecastLedgerJobLease;
  evidenceAt: string;
  generatedAt: string;
  /** Stable caller intent time. Operational ledger clocks are sampled from D1. */
  publicationRequestedAt: string;
  captureHealth?: ForecastLedgerCaptureHealth;
  requestedStatus?: "forecast" | "withheld";
  requestedWithholdingReason?: ForecastWithholdingReason | null;
  provenance?: Partial<ForecastLedgerProvenance> | null;
  outputBytes?: Uint8Array | null;
  outputContentType?: string;
}

export interface ForecastLedgerPublicationResult {
  status: "committed" | "deduplicated";
  record: ForecastLedgerRecord;
  objectPublished: boolean;
  providerDispatches: 0;
}

export class ForecastLedgerAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForecastLedgerAuthorityError";
  }
}

export class ForecastLedgerIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForecastLedgerIntegrityError";
  }
}

function iso(value: string | Date, label: string): string {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(milliseconds).toISOString();
}

function digest(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!HASH.test(normalized)) throw new Error(`${label} must be lowercase SHA-256 hex`);
  return normalized;
}

function nonempty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function changed(result: D1Result<unknown>): boolean {
  return Number(result.meta?.changes ?? 0) > 0;
}

type DatabaseClockObservation =
  | "qualification_registered"
  | "activation_created"
  | "job_created"
  | "origin_superseded"
  | "lease_claim"
  | "lease_renewal"
  | "preflight"
  | "output_published"
  | "output_verified"
  | "persistence_requested"
  | "persistence_receipt";

async function databaseReceiptTime(
  db: D1Database,
  observation: DatabaseClockObservation
): Promise<string> {
  const row = await db.prepare(`SELECT
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS database_receipt_at
    /* os13a-database-clock:${observation} */`).first<{ database_receipt_at: string }>();
  if (!row?.database_receipt_at) throw new Error("D1 did not supply an authoritative receipt time");
  return iso(row.database_receipt_at, "D1 receipt time");
}

function publicationIntentHash(input: {
  requestedStatus: "forecast" | "withheld";
  requestedReason: ForecastWithholdingReason | null;
  captureHealth: ForecastLedgerCaptureHealth;
  invokedAt: string;
  evidenceAt: string;
  generatedAt: string;
  publicationRequestedAt: string;
  provenance: Partial<ForecastLedgerProvenance> | null;
  outputBytes: Uint8Array | null;
}): string {
  return stableHash({
    contract: "engine-os.forecast-ledger-publication-intent.v1",
    ledgerContractHash: forecastLedgerContractHash,
    requestedStatus: input.requestedStatus,
    requestedReason: input.requestedReason,
    captureHealth: input.captureHealth,
    invokedAt: input.invokedAt,
    evidenceAt: input.evidenceAt,
    generatedAt: input.generatedAt,
    publicationRequestedAt: input.publicationRequestedAt,
    provenance: input.provenance,
    outputObjectHash: input.outputBytes ? sha256Hex(input.outputBytes) : null
  });
}

function defaultToken(): string {
  return crypto.randomUUID();
}

function tokenHash(raw: string): string {
  return sha256Hex(nonempty(raw, "Attempt token"));
}

function leaseExpiry(acquiredAt: string): string {
  return new Date(Date.parse(acquiredAt) + LEASE_DURATION_MILLISECONDS).toISOString();
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

async function r2Bytes(bucket: R2Bucket, key: string): Promise<Uint8Array | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  return new Uint8Array(await object.arrayBuffer());
}

async function publishOutput(input: {
  bucket: R2Bucket;
  key: string;
  bytes: Uint8Array;
  hash: string;
  contentType: string;
}): Promise<boolean> {
  if (input.bytes.byteLength < 1) throw new ForecastLedgerIntegrityError("Forecast output is empty");
  const prior = await r2Bytes(input.bucket, input.key);
  if (prior) {
    if (sha256Hex(prior) !== input.hash || !bytesEqual(prior, input.bytes)) {
      throw new ForecastLedgerIntegrityError("Content-addressed forecast output is corrupt");
    }
    return false;
  }
  await input.bucket.put(input.key, input.bytes, {
    httpMetadata: { contentType: input.contentType },
    customMetadata: {
      sha256: input.hash,
      state: "immutable",
      workPackage: "OS-13A"
    }
  });
  return true;
}

async function verifyOutput(input: {
  bucket: R2Bucket;
  key: string;
  bytes: Uint8Array;
  hash: string;
}): Promise<void> {
  const recovered = await r2Bytes(input.bucket, input.key);
  if (!recovered || sha256Hex(recovered) !== input.hash || !bytesEqual(recovered, input.bytes)) {
    throw new ForecastLedgerIntegrityError("Forecast output failed exact-byte verification");
  }
}

function eventStatement(input: {
  db: D1Database;
  eventType:
    | "qualification_registered"
    | "activation_created"
    | "job_created"
    | "lease_acquired"
    | "lease_renewed"
    | "lease_reclaimed"
    | "record_committed"
    | "record_deduplicated"
    | "output_publish_failed"
    | "output_integrity_failed"
    | "origin_superseded";
  activationId?: string | null;
  qualificationId?: string | null;
  jobKey?: string | null;
  originVersionId?: string | null;
  attemptTokenHash?: string | null;
  fence?: number | null;
  occurredAt: string;
  evidenceAt: string;
  persistedAt: string;
  payload: Record<string, unknown>;
  identity: Record<string, unknown>;
}): LedgerEventInsertion {
  const payloadJson = canonicalJson(input.payload);
  const eventId = stableHash({
    contract: EVENT_KEY_VERSION,
    ledgerContractHash: forecastLedgerContractHash,
    eventType: input.eventType,
    ...input.identity
  });
  const expected: LedgerEventRow = {
    event_id: eventId,
    event_type: input.eventType,
    activation_id: input.activationId ?? null,
    qualification_id: input.qualificationId ?? null,
    job_key: input.jobKey ?? null,
    origin_version_id: input.originVersionId ?? null,
    attempt_token_hash: input.attemptTokenHash ?? null,
    fence_token: input.fence ?? null,
    occurred_at: iso(input.occurredAt, "Event occurrence"),
    evidence_at: iso(input.evidenceAt, "Event evidence"),
    persisted_at: iso(input.persistedAt, "Event persistence"),
    payload_json: payloadJson,
    payload_hash: sha256Hex(payloadJson)
  };
  const statement = input.db.prepare(`INSERT OR IGNORE INTO forecast_ledger_events_v1 (
    event_id, event_type, activation_id, qualification_id, job_key, origin_version_id,
    attempt_token_hash, fence_token, occurred_at, evidence_at, persisted_at,
    payload_json, payload_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    expected.event_id,
    expected.event_type,
    expected.activation_id,
    expected.qualification_id,
    expected.job_key,
    expected.origin_version_id,
    expected.attempt_token_hash,
    expected.fence_token,
    expected.occurred_at,
    expected.evidence_at,
    expected.persisted_at,
    expected.payload_json,
    expected.payload_hash
  );
  return { statement, expected };
}

function immutableRowClockedEventStatement(input: {
  db: D1Database;
  source: "qualification" | "activation";
  sourceId: string;
  eventType: "qualification_registered" | "activation_created";
  activationId?: string | null;
  qualificationId?: string | null;
  payload: Record<string, unknown>;
  identity: Record<string, unknown>;
}): {
  statement: D1PreparedStatement;
  expectedAt: (timestamp: string) => LedgerEventRow;
} {
  const payloadJson = canonicalJson(input.payload);
  const payloadHash = sha256Hex(payloadJson);
  const eventId = stableHash({
    contract: EVENT_KEY_VERSION,
    ledgerContractHash: forecastLedgerContractHash,
    eventType: input.eventType,
    ...input.identity
  });
  const source = input.source === "qualification"
    ? {
        table: "forecast_ledger_qualifications_v1",
        idColumn: "qualification_id",
        timeColumn: "qualified_at"
      }
    : {
        table: "forecast_ledger_activations_v1",
        idColumn: "activation_id",
        timeColumn: "activated_at"
      };
  const statement = input.db.prepare(`INSERT OR IGNORE INTO forecast_ledger_events_v1 (
      event_id, event_type, activation_id, qualification_id, job_key, origin_version_id,
      attempt_token_hash, fence_token, occurred_at, evidence_at, persisted_at,
      payload_json, payload_hash
    ) SELECT ?, ?, ?, ?, NULL, NULL, NULL, NULL,
      source.${source.timeColumn}, source.${source.timeColumn}, source.${source.timeColumn}, ?, ?
    FROM ${source.table} source
    WHERE source.${source.idColumn} = ?`).bind(
    eventId,
    input.eventType,
    input.activationId ?? null,
    input.qualificationId ?? null,
    payloadJson,
    payloadHash,
    input.sourceId
  );
  return {
    statement,
    expectedAt(timestamp: string): LedgerEventRow {
      const observedAt = iso(timestamp, "Immutable event source time");
      return {
        event_id: eventId,
        event_type: input.eventType,
        activation_id: input.activationId ?? null,
        qualification_id: input.qualificationId ?? null,
        job_key: null,
        origin_version_id: null,
        attempt_token_hash: null,
        fence_token: null,
        occurred_at: observedAt,
        evidence_at: observedAt,
        persisted_at: observedAt,
        payload_json: payloadJson,
        payload_hash: payloadHash
      };
    }
  };
}

async function assertExactEvent(db: D1Database, expected: LedgerEventRow): Promise<void> {
  const stored = await db.prepare(`SELECT event_id, event_type, activation_id, qualification_id,
      job_key, origin_version_id, attempt_token_hash, fence_token, occurred_at, evidence_at,
      persisted_at, payload_json, payload_hash
    FROM forecast_ledger_events_v1 WHERE event_id = ?`).bind(expected.event_id)
    .first<LedgerEventRow>();
  if (!stored || canonicalJson(stored) !== canonicalJson(expected) ||
      sha256Hex(stored.payload_json) !== stored.payload_hash) {
    throw new ForecastLedgerIntegrityError("Ledger event identity collision changed immutable data");
  }
}

async function exactQualification(db: D1Database, qualificationId: string): Promise<QualificationRow> {
  const row = await db.prepare(`SELECT * FROM forecast_ledger_qualifications_v1
    WHERE qualification_id = ?`).bind(qualificationId).first<QualificationRow>();
  if (!row) throw new Error("Forecast qualification does not exist");
  return row;
}

async function exactActivation(db: D1Database, activationId: string): Promise<ActivationRow> {
  const row = await db.prepare(`SELECT * FROM forecast_ledger_activations_v1
    WHERE activation_id = ?`).bind(activationId).first<ActivationRow>();
  if (!row) throw new Error("Forecast-ledger activation does not exist");
  return row;
}

/** Registers only an isolated, synthetic qualification fixture; it cannot activate production. */
export async function registerOs13aFixtureQualification(
  input: Os13aFixtureQualificationInput
): Promise<QualificationRow> {
  const activationBoundary = nonempty(input.activationBoundary, "Activation boundary");
  const packageId = nonempty(input.packageId, "Package id");
  if (!packageId.startsWith("fixture-")) {
    throw new Error("OS-13A mechanism qualification accepts synthetic fixture packages only");
  }
  const packageHash = digest(input.packageHash, "Package hash");
  const qualificationKey = forecastQualificationKey({
    activationBoundary,
    qualification: { stream: "eligible_package", modelOrPackageHash: packageHash }
  });
  const requestedQualifiedAt = iso(input.qualifiedAt, "Requested qualification time");
  const qualifiedAt = await databaseReceiptTime(input.db, "qualification_registered");
  if (Date.parse(requestedQualifiedAt) > Date.parse(qualifiedAt)) {
    throw new ForecastLedgerAuthorityError(
      "Caller qualification time cannot postdate the authoritative D1 observation"
    );
  }
  const row: QualificationRow = {
    qualification_id: stableHash({
      contract: QUALIFICATION_KEY_VERSION,
      ledgerContractHash: forecastLedgerContractHash,
      activationBoundary,
      packageHash,
      qualificationKey
    }),
    ledger_contract_version: forecastLedgerContract.version,
    ledger_contract_hash: forecastLedgerContractHash,
    activation_boundary: activationBoundary,
    qualification_key: qualificationKey,
    qualification_key_version: forecastLedgerContract.identity.qualificationKeyVersion,
    qualification_stream: "eligible_package",
    model_or_package_hash: packageHash,
    runner_hash: digest(input.runnerHash, "Runner hash"),
    code_hash: digest(input.codeHash, "Code hash"),
    config_hash: digest(input.configHash, "Config hash"),
    feature_schema_hash: digest(input.featureSchemaHash, "Feature schema hash"),
    target_schema_hash: digest(input.targetSchemaHash, "Target schema hash"),
    qualification_status: "eligible",
    qualified_at: qualifiedAt,
    qualification_evidence_hash: digest(
      input.qualificationEvidenceHash,
      "Qualification evidence hash"
    )
  };
  // The synthetic package hash binds its model bytes; an independently supplied
  // model hash must agree so the fixture cannot smuggle a second model identity.
  if (digest(input.modelHash, "Model hash") !== packageHash) {
    throw new Error("Synthetic model hash must equal its package hash");
  }
  const insert = input.db.prepare(`INSERT OR IGNORE INTO forecast_ledger_qualifications_v1 (
    qualification_id, ledger_contract_version, ledger_contract_hash, activation_boundary,
    qualification_key, qualification_key_version, qualification_stream,
    model_or_package_hash,
    runner_hash, code_hash, config_hash, feature_schema_hash, target_schema_hash,
    qualification_status, qualified_at, qualification_evidence_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    row.qualification_id,
    row.ledger_contract_version,
    row.ledger_contract_hash,
    row.activation_boundary,
    row.qualification_key,
    row.qualification_key_version,
    row.qualification_stream,
    row.model_or_package_hash,
    row.runner_hash,
    row.code_hash,
    row.config_hash,
    row.feature_schema_hash,
    row.target_schema_hash,
    row.qualification_status,
    row.qualified_at,
    row.qualification_evidence_hash
  );
  const event = immutableRowClockedEventStatement({
    db: input.db,
    source: "qualification",
    sourceId: row.qualification_id,
    eventType: "qualification_registered",
    qualificationId: row.qualification_id,
    payload: { qualificationKey, packageId, qualificationOnly: true, syntheticFixture: true },
    identity: { qualificationId: row.qualification_id }
  });
  await input.db.batch([insert, event.statement]);
  const stored = await exactQualification(input.db, row.qualification_id);
  const expectedStored = { ...row, qualified_at: stored.qualified_at };
  if (canonicalJson(stored) !== canonicalJson(expectedStored)) {
    throw new ForecastLedgerIntegrityError("Qualification identity collision changed immutable data");
  }
  await assertExactEvent(input.db, event.expectedAt(stored.qualified_at));
  return stored;
}

async function registerNoPackageQualification(input: {
  db: D1Database;
  activationBoundary: string;
}): Promise<QualificationRow> {
  const qualificationKey = forecastQualificationKey({
    activationBoundary: input.activationBoundary,
    qualification: { stream: "no_eligible_package" }
  });
  const qualifiedAt = await databaseReceiptTime(input.db, "qualification_registered");
  const row: QualificationRow = {
    qualification_id: stableHash({
      contract: QUALIFICATION_KEY_VERSION,
      ledgerContractHash: forecastLedgerContractHash,
      activationBoundary: input.activationBoundary,
      qualificationKey,
      sentinel: forecastLedgerContract.identity.noPackageSentinel
    }),
    ledger_contract_version: forecastLedgerContract.version,
    ledger_contract_hash: forecastLedgerContractHash,
    activation_boundary: input.activationBoundary,
    qualification_key: qualificationKey,
    qualification_key_version: forecastLedgerContract.identity.qualificationKeyVersion,
    qualification_stream: "no_eligible_package",
    model_or_package_hash: null,
    runner_hash: null,
    code_hash: null,
    config_hash: null,
    feature_schema_hash: null,
    target_schema_hash: null,
    qualification_status: "eligible",
    qualified_at: qualifiedAt,
    qualification_evidence_hash: stableHash({
      contract: "engine-os.no-eligible-package-evidence.v1",
      ledgerContractHash: forecastLedgerContractHash,
      activationBoundary: input.activationBoundary,
      qualifiedAt
    })
  };
  const insertion = input.db.prepare(`INSERT OR IGNORE INTO forecast_ledger_qualifications_v1 (
    qualification_id, ledger_contract_version, ledger_contract_hash, activation_boundary,
    qualification_key, qualification_key_version, qualification_stream,
    model_or_package_hash,
    runner_hash, code_hash, config_hash, feature_schema_hash, target_schema_hash,
    qualification_status, qualified_at, qualification_evidence_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'eligible', ?, ?)`).bind(
    row.qualification_id,
    row.ledger_contract_version,
    row.ledger_contract_hash,
    row.activation_boundary,
    row.qualification_key,
    row.qualification_key_version,
    row.qualification_stream,
    row.qualified_at,
    row.qualification_evidence_hash
  );
  const event = immutableRowClockedEventStatement({
    db: input.db,
    source: "qualification",
    sourceId: row.qualification_id,
    eventType: "qualification_registered",
    qualificationId: row.qualification_id,
    payload: { qualificationKey, qualificationStream: "no_eligible_package" },
    identity: { qualificationId: row.qualification_id }
  });
  await input.db.batch([insertion, event.statement]);
  const stored = await exactQualification(input.db, row.qualification_id);
  const expectedEvidenceHash = stableHash({
    contract: "engine-os.no-eligible-package-evidence.v1",
    ledgerContractHash: forecastLedgerContractHash,
    activationBoundary: input.activationBoundary,
    qualifiedAt: stored.qualified_at
  });
  const expectedStored = {
    ...row,
    qualified_at: stored.qualified_at,
    qualification_evidence_hash: expectedEvidenceHash
  };
  if (canonicalJson(stored) !== canonicalJson(expectedStored)) {
    throw new ForecastLedgerIntegrityError("No-package qualification identity collision");
  }
  await assertExactEvent(input.db, event.expectedAt(stored.qualified_at));
  return stored;
}

/** Creates an explicit dormant boundary. There is deliberately no implicit/default activation. */
export async function createOs13aQualificationActivation(
  input: Os13aActivationInput
): Promise<ActivationRow> {
  const activationBoundary = nonempty(input.activationBoundary, "Activation boundary");
  const requestedActivatedAt = iso(input.activatedAt, "Requested activation time");
  const firstOriginUtc = iso(input.firstOriginUtc, "First origin");
  if (!Number.isInteger(input.season) || input.season < 2026) throw new Error("Season is invalid");
  if (!Number.isInteger(input.firstWeek) || input.firstWeek < 1 || input.firstWeek > 25) {
    throw new Error("First week is invalid");
  }
  const qualification = input.mode === "withholding_only"
    ? await registerNoPackageQualification({
        db: input.db,
        activationBoundary
      })
    : input.qualificationId
      ? await exactQualification(input.db, input.qualificationId)
      : null;
  if (!qualification || qualification.qualification_status !== "eligible") {
    throw new Error("Activation requires an eligible qualification");
  }
  if (
    qualification.ledger_contract_version !== forecastLedgerContract.version ||
    qualification.ledger_contract_hash !== forecastLedgerContractHash ||
    qualification.activation_boundary !== activationBoundary
  ) {
    throw new ForecastLedgerIntegrityError(
      "Activation qualification is not bound to this contract and boundary"
    );
  }
  if (
    (input.mode === "withholding_only" && qualification.qualification_stream !== "no_eligible_package") ||
    (input.mode === "qualified_package" && qualification.qualification_stream !== "eligible_package")
  ) {
    throw new Error("Activation mode does not match its immutable qualification stream");
  }
  const qualificationId = qualification.qualification_id;
  const activationId = stableHash({
    contract: ACTIVATION_KEY_VERSION,
    ledgerContractHash: forecastLedgerContractHash,
    activationBoundary,
    qualificationStream: qualification.qualification_stream,
    qualificationId,
    season: input.season,
    firstWeek: input.firstWeek,
    firstOriginUtc,
    weekOneOriginComplete: input.weekOneOriginComplete
  });
  const activationObservedAt = await databaseReceiptTime(input.db, "activation_created");
  if (Date.parse(requestedActivatedAt) > Date.parse(activationObservedAt)) {
    throw new ForecastLedgerAuthorityError(
      "Caller activation time cannot postdate the authoritative D1 observation"
    );
  }
  const prior = await input.db.prepare(`SELECT * FROM forecast_ledger_activations_v1
    WHERE activation_id = ?`).bind(activationId).first<ActivationRow>();
  const activatedAt = prior?.activated_at ?? activationObservedAt;
  if (Date.parse(activatedAt) > Date.parse(firstOriginUtc)) {
    throw new Error("Activation must exist no later than its first origin");
  }
  if (Date.parse(qualification.qualified_at) > Date.parse(activatedAt)) {
    throw new Error("Qualification must be immutable before activation");
  }
  const evidenceScope = classifyForecastEvidenceScope({
    activatedAt,
    firstOriginUtc,
    weekOneOriginComplete: input.weekOneOriginComplete
  });
  const row: ActivationRow = {
    activation_id: activationId,
    ledger_contract_version: forecastLedgerContract.version,
    ledger_contract_hash: forecastLedgerContractHash,
    activation_boundary: activationBoundary,
    qualification_id: qualificationId,
    evidence_scope: evidenceScope,
    season: input.season,
    first_week: input.firstWeek,
    activated_at: activatedAt,
    first_origin_utc: firstOriginUtc,
    week_one_origin_complete: input.weekOneOriginComplete ? 1 : 0,
    qualification_only: 1
  };
  const insert = input.db.prepare(`INSERT OR IGNORE INTO forecast_ledger_activations_v1 (
    activation_id, ledger_contract_version, ledger_contract_hash, activation_boundary,
    qualification_id, evidence_scope, season, first_week, activated_at,
    first_origin_utc, week_one_origin_complete, qualification_only
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).bind(
    row.activation_id,
    row.ledger_contract_version,
    row.ledger_contract_hash,
    row.activation_boundary,
    row.qualification_id,
    row.evidence_scope,
    row.season,
    row.first_week,
    row.activated_at,
    row.first_origin_utc,
    row.week_one_origin_complete
  );
  const event = immutableRowClockedEventStatement({
    db: input.db,
    source: "activation",
    sourceId: activationId,
    eventType: "activation_created",
    activationId,
    qualificationId,
    payload: {
      activationBoundary,
      qualificationStream: qualification.qualification_stream,
      qualificationOnly: true
    },
    identity: { activationId }
  });
  await input.db.batch([insert, event.statement]);
  const stored = await exactActivation(input.db, activationId);
  if (canonicalJson(stored) !== canonicalJson(row)) {
    throw new ForecastLedgerIntegrityError("Activation identity collision changed immutable data");
  }
  await assertExactEvent(input.db, event.expectedAt(stored.activated_at));
  return stored;
}

export function forecastLedgerJobKey(input: {
  activationId: string;
  originVersionId: string;
}): string {
  return stableHash({
    contract: JOB_KEY_VERSION,
    ledgerContractHash: forecastLedgerContractHash,
    activationId: nonempty(input.activationId, "Activation id"),
    originVersionId: nonempty(input.originVersionId, "Origin version id")
  });
}

/** Materializes jobs from current, timed OS-02A origin heads.
 *
 * Timed ineligible heads are intentional inputs: they terminate as immutable
 * schedule-unavailable or late-origin withholding evidence. An unresolved head
 * has no timestamp and therefore remains outside this materialization lane.
 */
export async function materializeOs13aLedgerJobs(input: {
  db: D1Database;
  activationId: string;
  createdAt: string;
  expectedInputManifestHash?: string | null;
}): Promise<{ currentTimedHeads: number; created: number; jobKeys: string[] }> {
  const activation = await exactActivation(input.db, input.activationId);
  const qualification = await exactQualification(input.db, activation.qualification_id);
  iso(input.createdAt, "Requested job creation");
  const createdAt = await databaseReceiptTime(input.db, "job_created");
  const expectedInputManifestHash = qualification.qualification_stream === "eligible_package"
    ? digest(input.expectedInputManifestHash ?? "", "Expected input manifest hash")
    : null;
  const result = await input.db.prepare(`SELECT
      origin.origin_version_id, origin.logical_origin_id, origin.game_id, origin.horizon_id,
      origin.scheduled_for_utc, origin.eligible, origin.eligibility_reason,
      origin.activation_boundary, schedule.kickoff_utc
    FROM forecast_origin_versions origin
    JOIN canonical_games game ON game.game_id = origin.game_id
    JOIN game_schedule_revisions schedule
      ON schedule.revision_id = origin.kickoff_revision_id
     AND schedule.game_id = origin.game_id
    WHERE game.season = ? AND game.season_type = 'REG'
      AND origin.horizon_id IN (${HORIZON_SQL})
      AND origin.eligibility_reason <> 'schedule_unresolved'
      AND origin.scheduled_for_utc IS NOT NULL
      AND schedule.schedule_status = 'scheduled' AND schedule.kickoff_utc IS NOT NULL
      AND julianday(origin.scheduled_for_utc) >= julianday(?)
      AND NOT EXISTS (
        SELECT 1 FROM forecast_origin_versions child
        WHERE child.supersedes_origin_version_id = origin.origin_version_id
      )
    ORDER BY origin.scheduled_for_utc, origin.game_id, origin.horizon_id`).bind(
    activation.season,
    ...forecastLedgerHorizonIds,
    activation.first_origin_utc
  ).all<OriginRow>();
  let created = 0;
  const jobKeys: string[] = [];
  for (const origin of result.results) {
    const jobKey = forecastLedgerJobKey({
      activationId: activation.activation_id,
      originVersionId: origin.origin_version_id
    });
    const deadline = forecastLedgerPersistenceDeadline({
      horizonId: origin.horizon_id,
      scheduledForUtc: origin.scheduled_for_utc,
      kickoffUtc: origin.kickoff_utc
    });
    const insertion = input.db.prepare(`INSERT OR IGNORE INTO forecast_ledger_jobs_v1 (
      job_key, job_key_version, ledger_contract_version, ledger_contract_hash, activation_id,
      origin_version_id, qualification_id, expected_input_manifest_hash,
      scheduled_trigger_at, persistence_deadline_at,
      kickoff_at, state, fence_token, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`).bind(
      jobKey,
      JOB_KEY_VERSION,
      forecastLedgerContract.version,
      forecastLedgerContractHash,
      activation.activation_id,
      origin.origin_version_id,
      activation.qualification_id,
      expectedInputManifestHash,
      origin.scheduled_for_utc,
      deadline,
      origin.kickoff_utc,
      createdAt
    );
    const event = eventStatement({
      db: input.db,
      eventType: "job_created",
      activationId: activation.activation_id,
      qualificationId: activation.qualification_id,
      jobKey,
      originVersionId: origin.origin_version_id,
      occurredAt: createdAt,
      evidenceAt: createdAt,
      persistedAt: createdAt,
      payload: { horizonId: origin.horizon_id, scheduledForUtc: origin.scheduled_for_utc },
      identity: { jobKey }
    });
    const expectedEvent = event.expected;
    // A duplicate trigger may supply a later observation time. Insert the
    // event only when this invocation created the immutable job; otherwise the
    // original job timestamp remains authoritative and is verified below.
    const conditionalEvent = input.db.prepare(`INSERT OR IGNORE INTO forecast_ledger_events_v1 (
        event_id, event_type, activation_id, qualification_id, job_key, origin_version_id,
        attempt_token_hash, fence_token, occurred_at, evidence_at, persisted_at,
        payload_json, payload_hash
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM forecast_ledger_jobs_v1 WHERE job_key = ? AND created_at = ?`).bind(
      expectedEvent.event_id,
      expectedEvent.event_type,
      expectedEvent.activation_id,
      expectedEvent.qualification_id,
      expectedEvent.job_key,
      expectedEvent.origin_version_id,
      expectedEvent.attempt_token_hash,
      expectedEvent.fence_token,
      expectedEvent.occurred_at,
      expectedEvent.evidence_at,
      expectedEvent.persisted_at,
      expectedEvent.payload_json,
      expectedEvent.payload_hash,
      jobKey,
      createdAt
    );
    const [insertionResult] = await input.db.batch([
      insertion,
      conditionalEvent
    ]) as D1Result<unknown>[];
    const storedJob = await input.db.prepare(`SELECT * FROM forecast_ledger_jobs_v1
      WHERE job_key = ?`).bind(jobKey).first<JobRow>();
    if (!storedJob) throw new ForecastLedgerIntegrityError("Materialized ledger job disappeared");
    const immutableStoredJob = {
      job_key: storedJob.job_key,
      job_key_version: storedJob.job_key_version,
      ledger_contract_version: storedJob.ledger_contract_version,
      ledger_contract_hash: storedJob.ledger_contract_hash,
      activation_id: storedJob.activation_id,
      origin_version_id: storedJob.origin_version_id,
      qualification_id: storedJob.qualification_id,
      expected_input_manifest_hash: storedJob.expected_input_manifest_hash,
      scheduled_trigger_at: storedJob.scheduled_trigger_at,
      persistence_deadline_at: storedJob.persistence_deadline_at,
      kickoff_at: storedJob.kickoff_at
    };
    const expectedImmutableJob = {
      job_key: jobKey,
      job_key_version: JOB_KEY_VERSION,
      ledger_contract_version: forecastLedgerContract.version,
      ledger_contract_hash: forecastLedgerContractHash,
      activation_id: activation.activation_id,
      origin_version_id: origin.origin_version_id,
      qualification_id: activation.qualification_id,
      expected_input_manifest_hash: expectedInputManifestHash,
      scheduled_trigger_at: origin.scheduled_for_utc,
      persistence_deadline_at: deadline,
      kickoff_at: origin.kickoff_utc
    };
    if (canonicalJson(immutableStoredJob) !== canonicalJson(expectedImmutableJob)) {
      throw new ForecastLedgerIntegrityError(
        "Ledger job identity collision changed immutable schedule or provenance"
      );
    }
    const immutableEvent = eventStatement({
      db: input.db,
      eventType: "job_created",
      activationId: storedJob.activation_id,
      qualificationId: storedJob.qualification_id,
      jobKey: storedJob.job_key,
      originVersionId: storedJob.origin_version_id,
      occurredAt: storedJob.created_at,
      evidenceAt: storedJob.created_at,
      persistedAt: storedJob.created_at,
      payload: { horizonId: origin.horizon_id, scheduledForUtc: origin.scheduled_for_utc },
      identity: { jobKey: storedJob.job_key }
    });
    await assertExactEvent(input.db, immutableEvent.expected);
    if (insertionResult && changed(insertionResult)) created += 1;
    jobKeys.push(jobKey);
  }
  return { currentTimedHeads: result.results.length, created, jobKeys };
}

/** Atomically invalidates old jobs after an immutable OS-02A origin successor appears. */
export async function reconcileOs13aSupersededJobs(input: {
  db: D1Database;
  activationId: string;
  observedAt: string;
}): Promise<{ observed: number; invalidated: number }> {
  iso(input.observedAt, "Requested supersession observation");
  const observedAt = await databaseReceiptTime(input.db, "origin_superseded");
  const candidates = await input.db.prepare(`SELECT job.*
    FROM forecast_ledger_jobs_v1 job
    WHERE job.activation_id = ? AND job.state IN ('pending', 'running')
      AND EXISTS (
        SELECT 1 FROM forecast_origin_versions child
        WHERE child.supersedes_origin_version_id = job.origin_version_id
      )
    ORDER BY job.job_key`).bind(input.activationId).all<JobRow>();
  let invalidated = 0;
  for (const job of candidates.results) {
    const payloadJson = canonicalJson({
      originVersionId: job.origin_version_id,
      priorState: job.state,
      invalidatedAt: observedAt
    });
    const eventId = stableHash({
      contract: EVENT_KEY_VERSION,
      ledgerContractHash: forecastLedgerContractHash,
      eventType: "origin_superseded",
      jobKey: job.job_key,
      observedAt
    });
    const update = input.db.prepare(`UPDATE forecast_ledger_jobs_v1 SET
        state = 'invalidated', active_attempt_token_hash = NULL, lease_owner = NULL,
        lease_acquired_at = NULL, lease_expires_at = NULL,
        heartbeat_at = coalesce(heartbeat_at, ?), completed_at = ?
      WHERE job_key = ? AND state = ? AND fence_token = ?
        AND EXISTS (
          SELECT 1 FROM forecast_origin_versions child
          WHERE child.supersedes_origin_version_id = forecast_ledger_jobs_v1.origin_version_id
        )`).bind(observedAt, observedAt, job.job_key, job.state, job.fence_token);
    const event = input.db.prepare(`INSERT OR IGNORE INTO forecast_ledger_events_v1 (
        event_id, event_type, activation_id, qualification_id, job_key, origin_version_id,
        attempt_token_hash, fence_token, occurred_at, evidence_at, persisted_at,
        payload_json, payload_hash
      ) SELECT ?, 'origin_superseded', activation_id, qualification_id, job_key,
        origin_version_id, NULL, fence_token, ?, ?, ?, ?, ?
      FROM forecast_ledger_jobs_v1
      WHERE job_key = ? AND state = 'invalidated' AND completed_at = ?`).bind(
      eventId,
      observedAt,
      observedAt,
      observedAt,
      payloadJson,
      sha256Hex(payloadJson),
      job.job_key,
      observedAt
    );
    const [updateResult] = await input.db.batch([update, event]) as D1Result<unknown>[];
    if (updateResult && changed(updateResult)) {
      await assertExactEvent(input.db, {
        event_id: eventId,
        event_type: "origin_superseded",
        activation_id: job.activation_id,
        qualification_id: job.qualification_id,
        job_key: job.job_key,
        origin_version_id: job.origin_version_id,
        attempt_token_hash: null,
        fence_token: job.fence_token,
        occurred_at: observedAt,
        evidence_at: observedAt,
        persisted_at: observedAt,
        payload_json: payloadJson,
        payload_hash: sha256Hex(payloadJson)
      });
      invalidated += 1;
    }
  }
  return { observed: candidates.results.length, invalidated };
}

export async function claimOs13aLedgerJob(input: {
  db: D1Database;
  jobKey: string;
  invokedAt: string;
  owner: string;
  tokenFactory?: () => string;
}): Promise<ForecastLedgerJobLease | null> {
  const requestedInvokedAt = iso(input.invokedAt, "Requested invocation");
  const invokedAt = await databaseReceiptTime(input.db, "lease_claim");
  if (Date.parse(requestedInvokedAt) > Date.parse(invokedAt)) {
    throw new ForecastLedgerAuthorityError(
      "Caller invocation time cannot postdate the authoritative D1 observation"
    );
  }
  const owner = nonempty(input.owner, "Lease owner");
  const attemptTokenHash = tokenHash((input.tokenFactory ?? defaultToken)());
  const expiresAt = leaseExpiry(invokedAt);
  const prior = await input.db.prepare(`SELECT * FROM forecast_ledger_jobs_v1
    WHERE job_key = ?`).bind(input.jobKey).first<JobRow>();
  if (!prior || prior.state === "completed" || prior.state === "invalidated") return null;
  if (Date.parse(invokedAt) < Date.parse(prior.scheduled_trigger_at)) return null;
  const reclaimed = prior.state === "running";
  if (
    reclaimed &&
    (!prior.lease_expires_at || Date.parse(prior.lease_expires_at) > Date.parse(invokedAt))
  ) {
    return null;
  }
  const nextFence = prior.fence_token + 1;
  const update = input.db.prepare(`UPDATE forecast_ledger_jobs_v1 SET
      state = 'running', fence_token = fence_token + 1, active_attempt_token_hash = ?,
      lease_owner = ?, lease_acquired_at = ?, lease_expires_at = ?, heartbeat_at = ?
    WHERE job_key = ? AND state = ? AND fence_token = ?
      AND (
        ? = 'pending' OR (
          active_attempt_token_hash IS ? AND lease_expires_at IS ?
          AND julianday(lease_expires_at) <= julianday(?)
        )
      )`).bind(
    attemptTokenHash,
    owner,
    invokedAt,
    expiresAt,
    invokedAt,
    input.jobKey,
    prior.state,
    prior.fence_token,
    prior.state,
    prior.active_attempt_token_hash,
    prior.lease_expires_at,
    invokedAt
  );
  const attemptId = stableHash({
    contract: ATTEMPT_KEY_VERSION,
    ledgerContractHash: forecastLedgerContractHash,
    jobKey: prior.job_key,
    attemptTokenHash,
    fence: nextFence
  });
  const attempt = input.db.prepare(`INSERT INTO forecast_ledger_attempts_v1 (
    attempt_id, job_key, origin_version_id, attempt_token_hash, fence_token, lease_owner,
    invoked_at, lease_acquired_at, lease_expires_at, persisted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    attemptId,
    prior.job_key,
    prior.origin_version_id,
    attemptTokenHash,
    nextFence,
    owner,
    invokedAt,
    invokedAt,
    expiresAt,
    invokedAt
  );
  const event = eventStatement({
    db: input.db,
    eventType: reclaimed ? "lease_reclaimed" : "lease_acquired",
    activationId: prior.activation_id,
    qualificationId: prior.qualification_id,
    jobKey: prior.job_key,
    originVersionId: prior.origin_version_id,
    attemptTokenHash,
    fence: nextFence,
    occurredAt: invokedAt,
    evidenceAt: invokedAt,
    persistedAt: invokedAt,
    payload: { owner, leaseExpiresAt: expiresAt },
    identity: { jobKey: prior.job_key, fence: nextFence, attemptTokenHash }
  });
  try {
    await input.db.batch([update, attempt, event.statement]);
    await assertExactEvent(input.db, event.expected);
  } catch (cause) {
    const current = await input.db.prepare(`SELECT * FROM forecast_ledger_jobs_v1
      WHERE job_key = ?`).bind(input.jobKey).first<JobRow>();
    if (
      current &&
      (current.state !== prior.state || current.fence_token !== prior.fence_token) &&
      current.active_attempt_token_hash !== attemptTokenHash
    ) {
      return null;
    }
    throw cause;
  }
  const row = await input.db.prepare(`SELECT * FROM forecast_ledger_jobs_v1
    WHERE job_key = ?`).bind(input.jobKey).first<JobRow>();
  if (
    !row || row.state !== "running" || row.active_attempt_token_hash !== attemptTokenHash ||
    row.fence_token !== nextFence || row.lease_owner !== owner || row.lease_expires_at !== expiresAt
  ) {
    throw new ForecastLedgerAuthorityError("Atomic lease claim did not preserve exact authority");
  }
  return {
    jobKey: row.job_key,
    originVersionId: row.origin_version_id,
    activationId: row.activation_id,
    attemptTokenHash,
    fence: row.fence_token,
    owner,
    invokedAt,
    leaseExpiresAt: row.lease_expires_at,
    reclaimed
  };
}

export async function renewOs13aLedgerLease(input: {
  db: D1Database;
  lease: ForecastLedgerJobLease;
  renewedAt: string;
}): Promise<ForecastLedgerJobLease | null> {
  const requestedRenewedAt = iso(input.renewedAt, "Requested lease renewal");
  const renewedAt = await databaseReceiptTime(input.db, "lease_renewal");
  if (Date.parse(requestedRenewedAt) > Date.parse(renewedAt)) {
    throw new ForecastLedgerAuthorityError(
      "Caller renewal time cannot postdate the authoritative D1 observation"
    );
  }
  const newExpiry = leaseExpiry(renewedAt);
  const update = input.db.prepare(`UPDATE forecast_ledger_jobs_v1 SET
      lease_expires_at = ?, heartbeat_at = ?
    WHERE job_key = ? AND state = 'running' AND active_attempt_token_hash = ?
      AND fence_token = ? AND lease_owner = ?
      AND julianday(lease_expires_at) > julianday(?)
      AND julianday(?) > julianday(heartbeat_at)
      AND julianday(?) > julianday(lease_expires_at)`).bind(
    newExpiry,
    renewedAt,
    input.lease.jobKey,
    input.lease.attemptTokenHash,
    input.lease.fence,
    input.lease.owner,
    renewedAt,
    renewedAt,
    newExpiry
  );
  const payloadJson = canonicalJson({
    owner: input.lease.owner,
    leaseExpiresAt: newExpiry
  });
  const eventId = stableHash({
    contract: EVENT_KEY_VERSION,
    ledgerContractHash: forecastLedgerContractHash,
    eventType: "lease_renewed",
    jobKey: input.lease.jobKey,
    fence: input.lease.fence,
    renewedAt
  });
  // The heartbeat and its evidence event are one D1 transaction. The SELECT
  // predicate also makes a retry capable of repairing an event only when the
  // exact renewed authority is already present.
  const event = input.db.prepare(`INSERT OR IGNORE INTO forecast_ledger_events_v1 (
      event_id, event_type, activation_id, qualification_id, job_key, origin_version_id,
      attempt_token_hash, fence_token, occurred_at, evidence_at, persisted_at,
      payload_json, payload_hash
    ) SELECT ?, 'lease_renewed', activation_id, qualification_id, job_key,
      origin_version_id, active_attempt_token_hash, fence_token, ?, ?, ?, ?, ?
    FROM forecast_ledger_jobs_v1
    WHERE job_key = ? AND state = 'running' AND active_attempt_token_hash = ?
      AND fence_token = ? AND lease_owner = ? AND heartbeat_at = ?
      AND lease_expires_at = ?`).bind(
    eventId,
    renewedAt,
    renewedAt,
    renewedAt,
    payloadJson,
    sha256Hex(payloadJson),
    input.lease.jobKey,
    input.lease.attemptTokenHash,
    input.lease.fence,
    input.lease.owner,
    renewedAt,
    newExpiry
  );
  const [result] = await input.db.batch([update, event]) as D1Result<unknown>[];
  if (!result || !changed(result)) return null;
  const renewedJob = await input.db.prepare(`SELECT * FROM forecast_ledger_jobs_v1
    WHERE job_key = ?`).bind(input.lease.jobKey).first<JobRow>();
  if (!renewedJob) throw new ForecastLedgerIntegrityError("Renewed ledger job disappeared");
  await assertExactEvent(input.db, {
    event_id: eventId,
    event_type: "lease_renewed",
    activation_id: renewedJob.activation_id,
    qualification_id: renewedJob.qualification_id,
    job_key: renewedJob.job_key,
    origin_version_id: renewedJob.origin_version_id,
    attempt_token_hash: input.lease.attemptTokenHash,
    fence_token: input.lease.fence,
    occurred_at: renewedAt,
    evidence_at: renewedAt,
    persisted_at: renewedAt,
    payload_json: payloadJson,
    payload_hash: sha256Hex(payloadJson)
  });
  return { ...input.lease, leaseExpiresAt: newExpiry };
}

async function publicationContext(input: {
  db: D1Database;
  lease: ForecastLedgerJobLease;
}): Promise<{
  job: JobRow;
  activation: ActivationRow;
  origin: OriginRow;
  qualification: QualificationRow;
  isCurrentHead: boolean;
}> {
  const job = await input.db.prepare(`SELECT * FROM forecast_ledger_jobs_v1
    WHERE job_key = ?`).bind(input.lease.jobKey).first<JobRow>();
  if (!job) throw new ForecastLedgerAuthorityError("Ledger job does not exist");
  const activation = await exactActivation(input.db, job.activation_id);
  const origin = await input.db.prepare(`SELECT
      origin.origin_version_id, origin.logical_origin_id, origin.game_id, origin.horizon_id,
      origin.scheduled_for_utc, origin.eligible, origin.eligibility_reason,
      origin.activation_boundary, schedule.kickoff_utc
    FROM forecast_origin_versions origin
    JOIN game_schedule_revisions schedule
      ON schedule.revision_id = origin.kickoff_revision_id
     AND schedule.game_id = origin.game_id
    WHERE origin.origin_version_id = ?`).bind(job.origin_version_id).first<OriginRow>();
  if (!origin || !origin.scheduled_for_utc || !origin.kickoff_utc) {
    throw new ForecastLedgerAuthorityError("Ledger origin is not persistable");
  }
  const child = await input.db.prepare(`SELECT origin_version_id FROM forecast_origin_versions
    WHERE supersedes_origin_version_id = ? LIMIT 1`).bind(origin.origin_version_id)
    .first<{ origin_version_id: string }>();
  const qualification = await exactQualification(input.db, activation.qualification_id);
  return { job, activation, origin, qualification, isCurrentHead: child === null };
}

function parsedStoredPayload(row: StoredRecordRow): StoredLedgerPayload {
  if (sha256Hex(row.payload_json) !== row.payload_hash) {
    throw new ForecastLedgerIntegrityError("Stored forecast-ledger payload hash is invalid");
  }
  try {
    const payload = JSON.parse(row.payload_json) as Partial<StoredLedgerPayload>;
    if (
      !payload.record || !payload.invokedAt || !payload.evidenceAt ||
      !payload.publicationRequestedAt || !payload.intentHash
    ) {
      throw new Error("payload envelope is incomplete");
    }
    return payload as StoredLedgerPayload;
  } catch (cause) {
    throw new ForecastLedgerIntegrityError(
      `Stored forecast-ledger payload is invalid: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
}

async function verifyExistingRetry(input: {
  bucket: R2Bucket;
  row: StoredRecordRow;
  lease: ForecastLedgerJobLease;
  requestedStatus: "forecast" | "withheld";
  requestedReason: ForecastWithholdingReason | null;
  outputBytes: Uint8Array | null;
  provenance: Partial<ForecastLedgerProvenance> | null;
  evidenceAt: string;
  generatedAt: string;
  publicationRequestedAt: string;
  captureHealth: ForecastLedgerCaptureHealth;
  intentHash: string;
}): Promise<ForecastLedgerRecord> {
  if (
    input.row.attempt_token_hash !== input.lease.attemptTokenHash ||
    input.row.fence_token !== input.lease.fence
  ) {
    throw new ForecastLedgerAuthorityError("A different fenced attempt already committed this origin");
  }
  const payload = parsedStoredPayload(input.row);
  const record = payload.record;
  if (
    payload.intentHash !== input.intentHash ||
    payload.invokedAt !== input.lease.invokedAt ||
    payload.evidenceAt !== input.evidenceAt ||
    payload.publicationRequestedAt !== input.publicationRequestedAt ||
    input.row.evidence_at !== input.evidenceAt ||
    input.row.generated_at !== input.generatedAt ||
    input.row.capture_health !== input.captureHealth
  ) {
    throw new ForecastLedgerIntegrityError("Retry intent differs from the immutable record");
  }
  if (input.row.status === "forecast") {
    if (!input.outputBytes || !input.row.output_object_hash || !input.row.output_object_key) {
      throw new ForecastLedgerIntegrityError("Retry omitted the committed forecast output");
    }
    if (sha256Hex(input.outputBytes) !== input.row.output_object_hash) {
      throw new ForecastLedgerIntegrityError("Retry output differs from the immutable forecast");
    }
    if (canonicalJson(input.provenance) !== canonicalJson(record.provenance)) {
      throw new ForecastLedgerIntegrityError("Retry provenance differs from the immutable forecast");
    }
    const recovered = await r2Bytes(input.bucket, input.row.output_object_key);
    if (!recovered || !bytesEqual(recovered, input.outputBytes)) {
      throw new ForecastLedgerIntegrityError("Committed forecast output failed retry verification");
    }
  } else if (
    input.requestedStatus === "withheld" && input.requestedReason &&
    input.row.withholding_reason !== input.requestedReason &&
    input.row.withholding_reason !== "late_origin_excluded"
  ) {
    throw new ForecastLedgerIntegrityError("Retry withholding differs from the immutable record");
  }
  return record;
}

/**
 * Publishes synthetic fixture output bytes before its D1 pointer, or records a
 * provider-independent withholding without touching R2.
 */
export async function publishOs13aLedgerRecord(
  input: ForecastLedgerPublicationInput
): Promise<ForecastLedgerPublicationResult> {
  const requestedStatus = input.requestedStatus ?? "withheld";
  const requestedReason = input.requestedWithholdingReason ??
    (requestedStatus === "withheld" ? "no_eligible_package" : null);
  const generatedAt = iso(input.generatedAt, "Generation");
  const publicationRequestedAt = iso(
    input.publicationRequestedAt,
    "Publication request"
  );
  const evidenceAt = iso(input.evidenceAt, "Evidence");
  const captureHealth = input.captureHealth ?? "current";
  const outputBytes = input.outputBytes ?? null;
  const intentHash = publicationIntentHash({
    requestedStatus,
    requestedReason,
    captureHealth,
    invokedAt: input.lease.invokedAt,
    evidenceAt,
    generatedAt,
    publicationRequestedAt,
    provenance: input.provenance ?? null,
    outputBytes
  });
  const existing = await input.db.prepare(`SELECT record_id, job_key, status, withholding_reason,
      attempt_token_hash, fence_token, output_object_key, output_object_hash,
      output_object_bytes, evidence_at, generated_at, persistence_requested_at, persisted_at,
      capture_health, payload_json, payload_hash
    FROM forecast_ledger_records_v1 WHERE job_key = ?`).bind(input.lease.jobKey)
    .first<StoredRecordRow>();
  if (existing) {
    const record = await verifyExistingRetry({
      bucket: input.bucket,
      row: existing,
      lease: input.lease,
      requestedStatus,
      requestedReason,
      outputBytes,
      provenance: input.provenance ?? null,
      evidenceAt,
      generatedAt,
      publicationRequestedAt,
      captureHealth,
      intentHash
    });
    return { status: "deduplicated", record, objectPublished: false, providerDispatches: 0 };
  }

  let context = await publicationContext({ db: input.db, lease: input.lease });
  const preflightAt = await databaseReceiptTime(input.db, "preflight");
  if (
    Date.parse(context.job.scheduled_trigger_at) > Date.parse(input.lease.invokedAt) ||
    Date.parse(input.lease.invokedAt) > Date.parse(generatedAt) ||
    Date.parse(evidenceAt) > Date.parse(generatedAt) ||
    Date.parse(generatedAt) > Date.parse(publicationRequestedAt) ||
    Date.parse(publicationRequestedAt) > Date.parse(preflightAt)
  ) {
    throw new Error("Forecast-ledger publication clocks violate causal ordering");
  }
  const outputHash = outputBytes ? sha256Hex(outputBytes) : null;
  const outputKey = outputHash ? forecastOutputObjectKey(outputHash) : null;
  const prepareAt = (runtimeContext: typeof context, clocks: {
    outputPublishedAt: string | null;
    outputVerifiedAt: string | null;
    persistenceRequestedAt: string;
    persistedAt: string;
  }) => {
    const qualification = runtimeContext.qualification.qualification_stream === "eligible_package" &&
        runtimeContext.qualification.model_or_package_hash
      ? {
          stream: "eligible_package" as const,
          modelOrPackageHash: runtimeContext.qualification.model_or_package_hash
        }
      : { stream: "no_eligible_package" as const };
    const expectedProvenance: ForecastLedgerProvenance | null =
        runtimeContext.qualification.qualification_stream === "eligible_package" &&
        runtimeContext.qualification.model_or_package_hash &&
        runtimeContext.qualification.runner_hash && runtimeContext.qualification.code_hash &&
        runtimeContext.qualification.config_hash &&
        runtimeContext.qualification.feature_schema_hash &&
        runtimeContext.qualification.target_schema_hash &&
        runtimeContext.job.expected_input_manifest_hash && outputHash && outputKey
      ? {
          runnerHash: runtimeContext.qualification.runner_hash,
          codeHash: runtimeContext.qualification.code_hash,
          modelOrPackageHash: runtimeContext.qualification.model_or_package_hash,
          configHash: runtimeContext.qualification.config_hash,
          inputManifestHash: runtimeContext.job.expected_input_manifest_hash,
          featureSchemaHash: runtimeContext.qualification.feature_schema_hash,
          targetSchemaHash: runtimeContext.qualification.target_schema_hash,
          outputObjectHash: outputHash,
          outputObjectKey: outputKey
        }
      : null;
    const origin: ForecastLedgerOrigin = {
      originVersionId: runtimeContext.origin.origin_version_id,
      logicalOriginId: runtimeContext.origin.logical_origin_id,
      gameId: runtimeContext.origin.game_id,
      horizonId: runtimeContext.origin.horizon_id,
      scheduledForUtc: runtimeContext.origin.scheduled_for_utc,
      kickoffUtc: runtimeContext.origin.kickoff_utc,
      activationBoundary: runtimeContext.activation.activation_boundary,
      eligible: runtimeContext.origin.eligible === 1,
      eligibilityReason: runtimeContext.origin.eligibility_reason
    };
    return prepareForecastLedgerRecord({
      origin,
      activatedAt: runtimeContext.activation.activated_at,
      activationFirstOriginUtc: runtimeContext.activation.first_origin_utc,
      weekOneOriginComplete: runtimeContext.activation.evidence_scope === "full_season_shadow",
      requestedStatus,
      requestedWithholdingReason: requestedReason,
      captureHealth,
      invokedAt: input.lease.invokedAt,
      evidenceAt,
      generatedAt,
      outputPublishedAt: clocks.outputPublishedAt,
      outputVerifiedAt: clocks.outputVerifiedAt,
      persistenceRequestedAt: clocks.persistenceRequestedAt,
      persistedAt: clocks.persistedAt,
      qualification,
      authority: {
        state: runtimeContext.job.state === "completed" ? "terminal" : runtimeContext.job.state,
        storedAttemptTokenHash: runtimeContext.job.active_attempt_token_hash,
        storedFence: runtimeContext.job.fence_token,
        suppliedAttemptTokenHash: input.lease.attemptTokenHash,
        suppliedFence: input.lease.fence,
        leaseExpiresAt: runtimeContext.job.lease_expires_at,
        isCurrentHead: runtimeContext.isCurrentHead
      },
      provenance: input.provenance,
      expectedProvenance,
      outputBytes
    });
  };

  // A dry run at an authoritative D1 observation prevents deterministic
  // withholding (bad provenance, source health, ineligible origin, no package)
  // from ever touching R2. A valid forecast is expected to fail this dry run
  // only because actual output publication/verification have not happened yet.
  const preflight = prepareAt(context, {
    outputPublishedAt: null,
    outputVerifiedAt: null,
    persistenceRequestedAt: preflightAt,
    persistedAt: preflightAt
  });
  const awaitingOutputClocks = !preflight.publishable &&
    preflight.violations.length === 2 &&
    preflight.violations.includes("output_publication_time_missing") &&
    preflight.violations.includes("output_verification_time_missing");
  if (!preflight.publishable && !awaitingOutputClocks) {
    throw new ForecastLedgerAuthorityError(
      `Forecast-ledger publication rejected: ${preflight.violations.join(",")}`
    );
  }

  let objectPublished = false;
  let outputPublishedAt: string | null = null;
  let outputVerifiedAt: string | null = null;
  if (awaitingOutputClocks) {
    if (!outputBytes || !outputKey || !outputHash) {
      throw new ForecastLedgerIntegrityError("Forecast output candidate is incomplete");
    }
    objectPublished = await publishOutput({
      bucket: input.bucket,
      key: outputKey,
      bytes: outputBytes,
      hash: outputHash,
      contentType: input.outputContentType ?? "application/octet-stream"
    });
    outputPublishedAt = await databaseReceiptTime(input.db, "output_published");
    await verifyOutput({ bucket: input.bucket, key: outputKey, bytes: outputBytes, hash: outputHash });
    outputVerifiedAt = await databaseReceiptTime(input.db, "output_verified");
  }

  const persistenceRequestedAt = await databaseReceiptTime(input.db, "persistence_requested");
  // Refresh authority and current-head state after the potentially slow R2
  // operation, then take the final database observation immediately before the
  // append-only D1 pointer transaction.
  context = await publicationContext({ db: input.db, lease: input.lease });
  const persistedAt = await databaseReceiptTime(input.db, "persistence_receipt");
  const prepared = prepareAt(context, {
    outputPublishedAt,
    outputVerifiedAt,
    persistenceRequestedAt,
    persistedAt
  });
  if (!prepared.publishable) {
    throw new ForecastLedgerAuthorityError(
      `Forecast-ledger publication lost authority before pointer commit: ${
        prepared.violations.join(",")
      }`
    );
  }
  const record = prepared.record;

  const qualificationKey = context.qualification.qualification_key;
  const payloadJson = canonicalJson({
    record,
    invokedAt: input.lease.invokedAt,
    evidenceAt,
    publicationRequestedAt,
    intentHash
  } satisfies StoredLedgerPayload);
  const recordStatement = input.db.prepare(`INSERT INTO forecast_ledger_records_v1 (
    record_id, record_hash, record_key_version, activation_id, job_key, origin_version_id,
    qualification_id,
    qualification_key, qualification_stream, ledger_contract_version, ledger_contract_hash, status,
    withholding_reason, scheduled_trigger_at, invoked_at, evidence_at, generated_at,
    output_published_at, output_verified_at, persistence_requested_at, persisted_at,
    persistence_deadline_at, kickoff_at, timing, prospective_eligible, capture_health,
    activation_boundary, evidence_scope, attempt_token_hash, fence_token, runner_hash,
    code_hash, model_or_package_hash, config_hash, input_manifest_hash,
    feature_schema_hash, target_schema_hash, output_object_key, output_object_hash,
    output_object_bytes, payload_json, payload_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    record.recordId,
    record.recordHash,
    forecastLedgerContract.identity.recordKeyVersion,
    context.activation.activation_id,
    context.job.job_key,
    record.originVersionId,
    context.activation.qualification_id,
    qualificationKey,
    record.qualificationStream,
    record.contractVersion,
    record.contractHash,
    record.status,
    record.withholdingReason,
    record.scheduledForUtc,
    record.invokedAt,
    record.evidenceAt,
    record.generatedAt,
    record.outputPublishedAt,
    record.outputVerifiedAt,
    record.persistenceRequestedAt,
    record.persistedAt,
    record.persistenceDeadlineAt,
    record.kickoffUtc,
    record.timing,
    record.prospectiveEvidenceEligible ? 1 : 0,
    record.captureHealth,
    record.activationBoundary,
    record.evidenceScope,
    input.lease.attemptTokenHash,
    input.lease.fence,
    record.provenance?.runnerHash ?? null,
    record.provenance?.codeHash ?? null,
    record.provenance?.modelOrPackageHash ?? null,
    record.provenance?.configHash ?? null,
    record.provenance?.inputManifestHash ?? null,
    record.provenance?.featureSchemaHash ?? null,
    record.provenance?.targetSchemaHash ?? null,
    record.outputObjectKey,
    record.outputObjectHash,
    record.status === "forecast" ? outputBytes?.byteLength ?? null : null,
    payloadJson,
    sha256Hex(payloadJson)
  );
  const event = eventStatement({
    db: input.db,
    eventType: "record_committed",
    activationId: context.activation.activation_id,
    qualificationId: context.activation.qualification_id,
    jobKey: context.job.job_key,
    originVersionId: context.origin.origin_version_id,
    attemptTokenHash: input.lease.attemptTokenHash,
    fence: input.lease.fence,
    occurredAt: record.persistedAt,
    evidenceAt,
    persistedAt: record.persistedAt,
    payload: {
      recordId: record.recordId,
      recordHash: record.recordHash,
      status: record.status,
      withholdingReason: record.withholdingReason,
      prospectiveEvidenceEligible: record.prospectiveEvidenceEligible
    },
    identity: { recordId: record.recordId, recordHash: record.recordHash }
  });
  await input.db.batch([recordStatement, event.statement]);
  await assertExactEvent(input.db, event.expected);
  const stored = await input.db.prepare(`SELECT record_id, job_key, status, withholding_reason,
      attempt_token_hash, fence_token, output_object_key, output_object_hash,
      output_object_bytes, evidence_at, generated_at, persistence_requested_at, persisted_at,
      capture_health, payload_json, payload_hash
    FROM forecast_ledger_records_v1 WHERE record_id = ?`).bind(record.recordId)
    .first<StoredRecordRow>();
  if (!stored || stored.record_id !== record.recordId) {
    throw new ForecastLedgerIntegrityError("D1 pointer was not committed after output publication");
  }
  return { status: "committed", record, objectPublished, providerDispatches: 0 };
}

/** Recovers immutable output without executing any forecast or external acquisition path. */
export async function recoverOs13aForecastOutput(input: {
  db: D1Database;
  bucket: R2Bucket;
  recordId: string;
}): Promise<Uint8Array> {
  const row = await input.db.prepare(`SELECT record_id, job_key, status, withholding_reason,
      attempt_token_hash, fence_token, output_object_key, output_object_hash,
      output_object_bytes, evidence_at, generated_at, persistence_requested_at, persisted_at,
      capture_health, payload_json, payload_hash
    FROM forecast_ledger_records_v1 WHERE record_id = ?`).bind(input.recordId)
    .first<StoredRecordRow>();
  if (!row || row.status !== "forecast" || !row.output_object_key ||
      !row.output_object_hash || row.output_object_bytes === null) {
    throw new ForecastLedgerIntegrityError("Forecast output pointer is unavailable");
  }
  if (row.output_object_key !== forecastOutputObjectKey(row.output_object_hash)) {
    throw new ForecastLedgerIntegrityError("Forecast output pointer is not content-addressed");
  }
  const bytes = await r2Bytes(input.bucket, row.output_object_key);
  if (!bytes || bytes.byteLength !== row.output_object_bytes || sha256Hex(bytes) !== row.output_object_hash) {
    throw new ForecastLedgerIntegrityError("Forecast output failed offline exact-byte recovery");
  }
  return bytes;
}
