import contractV1Json from "../../config/source-capture-contract-2026.v1.json";
import contractV2Json from "../../config/source-capture-contract-2026.v2.json";
import contractV3Json from "../../config/source-capture-contract-2026.v3.json";
import contractV4Json from "../../config/source-capture-contract-2026.v4.json";
import contractV5Json from "../../config/source-capture-contract-2026.v5.json";
import contractV6Json from "../../config/source-capture-contract-2026.v6.json";
import contractManifestV10Json from "../../config/engine-os-contract-manifest.v10.json";
import type { CaptureDataset, RedactedHttpRequest } from "./engine-os";
import { redactHttpRequest } from "./engine-os";
import { canonicalJson, sha256Hex, stableHash } from "./hash";

export const OS03A_CAPTURE_CONTRACT_VERSION = "engine-os.os-03a-capture.v1" as const;
export const OS03A_SIDECAR_SCHEMA = "engine-os.os-03a-capture-sidecar.v1" as const;

const effectiveArtifact = contractManifestV10Json.artifacts.find(
  (artifact) => artifact.task === "OS-03A" && artifact.status === "effective"
);
if (!effectiveArtifact) throw new Error("The effective OS-03A contract is not bound by manifest v10");

export const OS03A_EFFECTIVE_CONTRACT_VERSION = "source-capture-contract.2026.6" as const;
if (contractV6Json.version !== OS03A_EFFECTIVE_CONTRACT_VERSION) {
  throw new Error("The effective OS-03A source-capture contract version changed");
}
export const OS03A_EFFECTIVE_CONTRACT_HASH = effectiveArtifact.canonicalContentSha256;

export type CaptureValidationState =
  | "usable"
  | "raw_only_schema_invalid"
  | "raw_only_partial"
  | "raw_only_http_error";

export type CaptureFailureCode =
  | "provider_unavailable"
  | "schema_invalid"
  | "partial_import"
  | "storage_failure"
  | "manifest_failure"
  | "corrupt_object"
  | "secret_filtered"
  | "source_time_missing"
  | "publication_time_missing";

export type CaptureEventType =
  | "capture_committed"
  | "capture_committed_usable"
  | "capture_committed_raw_only"
  | "capture_deduplicated"
  | "capture_failed"
  | "not_modified_confirmed"
  | "replay_verified"
  | "freshness_stale"
  | "orphan_detected"
  | "orphan_removed";

export interface UsageRightsMetadata {
  licenseId: string;
  rightsUri: string;
  retrievedFor: string;
  redistribution: string;
  retentionClass: "raw_source_3650_days";
  reviewStatus: string;
}

export interface LaterImportMapping {
  owner: "OS-03" | "OS-04";
  target: string;
}

export interface QualificationSourceProfile {
  readonly profileId: string;
  readonly provider: string;
  readonly dataset: CaptureDataset;
  readonly origin: string;
  readonly pathTemplate: string;
  readonly allowedMethods: readonly string[];
  readonly allowedPublicQueryKeys: readonly string[];
  readonly allowedPublicHeaderKeys: readonly string[];
  readonly allowedContentTypes: readonly string[];
  readonly requestCredentialMode: "none" | "fixture_only";
}

export interface Os03aCaptureSidecar {
  schema: typeof OS03A_SIDECAR_SCHEMA;
  contractVersion: typeof OS03A_CAPTURE_CONTRACT_VERSION;
  captureId: string;
  idempotencyKey: string;
  profileId: string;
  provider: string;
  dataset: CaptureDataset;
  captureClass: "qualification_fixture";
  sourceKey: string;
  request: RedactedHttpRequest;
  requestHash: string;
  responseObjectKey: string;
  responseSha256: string;
  responseBytes: number;
  contentType: string;
  etag: string | null;
  sourceObservedAt: string | null;
  providerPublishedAt: string | null;
  receiptCompletedAt: string;
  persistenceRequestedAt: string;
  responsePersistedAt: string;
  validFrom: string | null;
  validTo: string | null;
  sourceSchemaVersion: string;
  usageRights: UsageRightsMetadata;
  usageRightsHash: string;
  validationState: CaptureValidationState;
  failureCodes: CaptureFailureCode[];
  laterImport: LaterImportMapping;
  laterImportHash: string;
  evidenceHash: string;
}

export interface Os03aManifestExtension {
  captureId: string;
  contractVersion: typeof OS03A_EFFECTIVE_CONTRACT_VERSION;
  contractHash: string;
  profileId: string;
  captureClass: "qualification_fixture";
  sourceKey: string;
  sourceObservedAt: string | null;
  receiptCompletedAt: string;
  persistenceRequestedAt: string;
  responsePersistedAt: string;
  sidecarPersistedAt: string;
  manifestPersistedAt: string;
  contentType: string;
  etag: string | null;
  usageRights: UsageRightsMetadata;
  usageRightsHash: string;
  validationState: CaptureValidationState;
  failureCodes: CaptureFailureCode[];
  laterImport: LaterImportMapping;
  laterImportHash: string;
  extensionHash: string;
}

type QualificationProfileJson = (typeof contractV3Json.qualificationProfiles)[number];

export const sourceCaptureQualificationProfiles: readonly QualificationSourceProfile[] =
  Object.freeze(contractV3Json.qualificationProfiles.map((profile: QualificationProfileJson) => Object.freeze({
    ...profile,
    dataset: profile.dataset as CaptureDataset,
    allowedMethods: Object.freeze([...profile.allowedMethods]),
    allowedPublicQueryKeys: Object.freeze([...profile.allowedPublicQueryKeys]),
    allowedPublicHeaderKeys: Object.freeze([...profile.allowedPublicHeaderKeys]),
    allowedContentTypes: Object.freeze([...profile.allowedContentTypes]),
    requestCredentialMode: profile.requestCredentialMode as "none" | "fixture_only"
  })));

const sourceProfileById = new Map(
  sourceCaptureQualificationProfiles.map((profile) => [profile.profileId, profile] as const)
);

const failureCodeSet = new Set<CaptureFailureCode>(
  contractV1Json.failureAndHeartbeat.failureCodes as CaptureFailureCode[]
);
const validationStateSet = new Set<CaptureValidationState>(
  Object.keys(contractV1Json.validationStates) as CaptureValidationState[]
);
const captureEventTypeSet = new Set<CaptureEventType>([
  "capture_committed",
  "capture_committed_usable",
  "capture_committed_raw_only",
  "capture_deduplicated",
  "capture_failed",
  "not_modified_confirmed",
  "replay_verified",
  "freshness_stale",
  "orphan_detected",
  "orphan_removed"
]);
const captureDatasetSet = new Set<CaptureDataset>(
  contractV1Json.datasets.map((entry) => entry.dataset as CaptureDataset)
);
const forbiddenHeaderNames = new Set(
  contractV1Json.requestIdentity.forbiddenPersistedHeaders.map((header) => header.toLowerCase())
);
const secretNamePattern = /(?:api[-_]?key|authorization|cookie|credential|password|secret|access[-_]?token|refresh[-_]?token)/i;
const secretAssignmentPatterns = [
  /(?:api[-_]?key|authorization|cookie|proxy-authorization|set-cookie|credential|password|secret|access[-_]?token|refresh[-_]?token)[\s"']*(?::|=)[\s"']*[^\s"',;&}]+/i,
  /\bbearer\s+[a-z0-9._~+/=-]{6,}/i,
  /\bbasic\s+[a-z0-9+/=]{6,}/i
];

function canonicalTimestamp(value: string, label: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(milliseconds).toISOString();
}

function nullableTimestamp(value: string | null | undefined, label: string): string | null {
  return value === null || value === undefined ? null : canonicalTimestamp(value, label);
}

function requiredText(value: string, label: string, maximumLength = 512): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} is missing or invalid`);
  }
  return normalized;
}

function storageSafe(value: string, label: string): string {
  const normalized = requiredText(value, label, 256);
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(normalized)) {
    throw new Error(`${label} must be a storage-safe identifier`);
  }
  return normalized;
}

function requireSha256(value: string, label: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireValidationState(value: CaptureValidationState): CaptureValidationState {
  if (!validationStateSet.has(value)) throw new Error("Unknown capture validation state");
  return value;
}

function requireAttemptToken(value: string): string {
  const normalized = requiredText(value, "Capture attempt token", 200);
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(normalized)) {
    throw new Error("Capture attempt token must be a storage-safe identifier");
  }
  return normalized;
}

function mediaType(contentType: string): string {
  return contentType.split(";", 1)[0]!.trim().toLowerCase();
}

function isTextualMediaType(value: string): boolean {
  return value.startsWith("text/") ||
    value === "application/json" ||
    value.endsWith("+json") ||
    value === "application/xml" ||
    value.endsWith("+xml") ||
    value === "application/javascript";
}

function scanSecretBearingText(value: string, label: string): void {
  const candidates = new Set<string>();
  let candidate = value;
  for (let pass = 0; pass < 3; pass += 1) {
    candidates.add(candidate);
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      break;
    }
  }
  for (const candidate of candidates) {
    if (secretAssignmentPatterns.some((pattern) => pattern.test(candidate))) {
      throw new Error(`${label} contains credential-bearing material`);
    }
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    const visit = (item: unknown): void => {
      if (Array.isArray(item)) {
        item.forEach(visit);
        return;
      }
      if (!item || typeof item !== "object") return;
      for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
        if (secretNamePattern.test(key) && child !== null && child !== "" && child !== "[redacted]") {
          throw new Error(`${label} contains credential-bearing material`);
        }
        visit(child);
      }
    };
    visit(parsed);
  } catch (error) {
    if (error instanceof Error && /credential-bearing material/.test(error.message)) throw error;
    // Non-JSON textual source formats remain covered by the raw-text scans.
  }
}

function assertCanonicalRequestShape(request: RedactedHttpRequest): void {
  const expectedKeys = ["method", "publicHeaders", "publicQuery", "redactedQueryKeys", "url"];
  if (canonicalJson(Object.keys(request).sort()) !== canonicalJson(expectedKeys)) {
    throw new Error("Capture request contains fields outside the redacted request contract");
  }
  if (request.method !== request.method.toUpperCase()) {
    throw new Error("Capture request method must be uppercase");
  }
  const queryKeys = Object.keys(request.publicQuery);
  if (new Set(queryKeys).size !== queryKeys.length) throw new Error("Capture request query keys must be unique");
  for (const [key, values] of Object.entries(request.publicQuery)) {
    if (key !== key.trim() || !Array.isArray(values) || values.some((value) => typeof value !== "string")) {
      throw new Error("Capture request public query is malformed");
    }
    const sorted = [...values].sort((left, right) => left.localeCompare(right));
    if (values.some((value, index) => value !== sorted[index])) {
      throw new Error("Capture request public query values must be sorted");
    }
  }
  const sortedRedacted = [...new Set(request.redactedQueryKeys)].sort((left, right) => left.localeCompare(right));
  if (
    request.redactedQueryKeys.length !== sortedRedacted.length ||
    request.redactedQueryKeys.some((value, index) => value !== sortedRedacted[index])
  ) {
    throw new Error("Capture request redacted query keys must be sorted and unique");
  }
  for (const key of Object.keys(request.publicHeaders)) {
    if (key !== key.toLowerCase() || forbiddenHeaderNames.has(key) || secretNamePattern.test(key)) {
      throw new Error("Capture request contains a forbidden persisted header");
    }
  }
  scanSecretBearingText(canonicalJson(request), "Capture request");
}

function normalizeFailureCodes(
  validationState: CaptureValidationState,
  failureCodes: readonly CaptureFailureCode[] | undefined,
  sourceObservedAt: string | null,
  providerPublishedAt: string | null
): CaptureFailureCode[] {
  const codes = new Set(failureCodes ?? []);
  for (const code of codes) {
    if (!failureCodeSet.has(code)) throw new Error(`Unknown capture failure code: ${code}`);
  }
  if (sourceObservedAt === null) codes.add("source_time_missing");
  if (providerPublishedAt === null) codes.add("publication_time_missing");
  if (validationState === "raw_only_partial") codes.add("partial_import");
  if (validationState === "raw_only_schema_invalid" && codes.size === 0) codes.add("schema_invalid");
  if (validationState === "raw_only_http_error" && codes.size === 0) {
    throw new Error("A raw-only HTTP capture requires an explicit frozen failure code");
  }
  if (validationState === "usable" && codes.size > 0) {
    throw new Error("A usable capture cannot contain a failure code or missing source time");
  }
  if (
    (sourceObservedAt === null || providerPublishedAt === null) &&
    validationState !== "raw_only_schema_invalid"
  ) {
    throw new Error("Missing source or publication time requires raw_only_schema_invalid");
  }
  return [...codes].sort((left, right) => left.localeCompare(right));
}

function validateUsageRights(input: UsageRightsMetadata): UsageRightsMetadata {
  const rights: UsageRightsMetadata = {
    licenseId: requiredText(input.licenseId, "Usage-rights license ID"),
    rightsUri: requiredText(input.rightsUri, "Usage-rights URI", 2048),
    retrievedFor: requiredText(input.retrievedFor, "Usage-rights retrieval purpose"),
    redistribution: requiredText(input.redistribution, "Usage-rights redistribution policy"),
    retentionClass: input.retentionClass,
    reviewStatus: requiredText(input.reviewStatus, "Usage-rights review status")
  };
  try {
    new URL(rights.rightsUri);
  } catch {
    throw new Error("Usage-rights URI must be absolute");
  }
  if (rights.retentionClass !== contractV1Json.usageRights.retentionClass) {
    throw new Error("Usage-rights retention class does not match the frozen contract");
  }
  scanSecretBearingText(canonicalJson(rights), "Usage-rights metadata");
  return rights;
}

export function validateFrozenSourceCaptureContracts(): {
  errors: string[];
  canonicalHashes: Record<string, string>;
} {
  const contracts = [contractV1Json, contractV2Json, contractV3Json, contractV4Json, contractV5Json, contractV6Json];
  const errors: string[] = [];
  const canonicalHashes = Object.fromEntries(contracts.map((contract) => [contract.version, stableHash(contract)]));
  for (const contract of contracts) {
    if (contract.status !== "frozen") errors.push(`${contract.version} is not frozen`);
    const artifact = contractManifestV10Json.artifacts.find((entry) => entry.contractVersion === contract.version);
    if (!artifact) errors.push(`${contract.version} is not bound by manifest v10`);
    else if (artifact.canonicalContentSha256 !== canonicalHashes[contract.version]) {
      errors.push(`${contract.version} canonical hash does not match manifest v10`);
    }
  }
  if (!contractV6Json.effectiveContract.includes("every clarification in this file")) {
    errors.push("OS-03A v6 effective-contract chain changed");
  }
  const profileIds = sourceCaptureQualificationProfiles.map((profile) => profile.profileId);
  if (profileIds.length !== 7 || new Set(profileIds).size !== profileIds.length) {
    errors.push("OS-03A requires exactly seven unique qualification profiles");
  }
  if (sourceCaptureQualificationProfiles.some((profile) => profile.origin !== "https://fixtures.invalid")) {
    errors.push("OS-03A qualification profiles must remain fixture-only");
  }
  const marketProfiles = sourceCaptureQualificationProfiles.filter((profile) => profile.dataset === "odds");
  if (
    marketProfiles.length !== 1 ||
    marketProfiles[0]?.requestCredentialMode !== "fixture_only" ||
    contractV1Json.scope.marketProviderDispatch !== "prohibited"
  ) {
    errors.push("OS-03A market qualification must remain fixture-only with provider dispatch prohibited");
  }
  return { errors, canonicalHashes };
}

export function getQualificationSourceProfile(profileId: string): QualificationSourceProfile {
  const profile = sourceProfileById.get(profileId);
  if (!profile) throw new Error(`Unregistered OS-03A source profile: ${profileId}`);
  return profile;
}

export function sourceCaptureKey(profile: Pick<QualificationSourceProfile, "provider" | "dataset" | "profileId">): string {
  return `${storageSafe(profile.provider, "Capture provider")}:${profile.dataset}:${storageSafe(profile.profileId, "Capture profile")}`;
}

export function canonicalizeCaptureRequest(input: {
  profileId: string;
  url: string;
  method?: string;
  headers?: Headers | Record<string, string | undefined>;
}): RedactedHttpRequest {
  const rawUrl = new URL(input.url);
  if (rawUrl.username || rawUrl.password || rawUrl.hash) {
    throw new Error("Capture request URL cannot contain userinfo or a fragment");
  }
  const request = redactHttpRequest(input);
  assertRegisteredCaptureRequest(getQualificationSourceProfile(input.profileId), request);
  return request;
}

export function assertRegisteredCaptureRequest(
  profile: QualificationSourceProfile,
  request: RedactedHttpRequest
): void {
  assertCanonicalRequestShape(request);
  const requestUrl = new URL(request.url);
  const expectedOrigin = new URL(profile.origin).origin;
  if (
    requestUrl.origin !== expectedOrigin ||
    requestUrl.pathname !== profile.pathTemplate ||
    requestUrl.search ||
    requestUrl.hash ||
    requestUrl.username ||
    requestUrl.password
  ) {
    throw new Error("Capture request does not match its registered source route");
  }
  if (!profile.allowedMethods.includes(request.method)) {
    throw new Error("Capture request method is not allowed by its source profile");
  }
  const allowedQueryKeys = new Set(profile.allowedPublicQueryKeys);
  if (Object.keys(request.publicQuery).some((key) => !allowedQueryKeys.has(key))) {
    throw new Error("Capture request contains an unregistered public query key");
  }
  if (request.redactedQueryKeys.length > 0) {
    throw new Error("Credential-free qualification profiles cannot contain redacted query keys");
  }
  const allowedHeaderKeys = new Set(profile.allowedPublicHeaderKeys);
  if (Object.keys(request.publicHeaders).some((key) => !allowedHeaderKeys.has(key))) {
    throw new Error("Capture request contains an unregistered public header");
  }
}

export function assertSecretFreeCanonicalValue(value: unknown, label = "Capture metadata"): void {
  scanSecretBearingText(canonicalJson(value), label);
}

export function assertSecretFreeCaptureResponse(
  profile: QualificationSourceProfile,
  contentType: string,
  responseBytes: Uint8Array
): void {
  if (
    responseBytes.byteLength < contractV1Json.responseEvidence.minimumBytes ||
    responseBytes.byteLength > contractV1Json.responseEvidence.maximumWorkerObjectBytes
  ) {
    throw new Error("Capture response byte length is outside the frozen limits");
  }
  const normalizedContentType = mediaType(requiredText(contentType, "Capture content type"));
  if (!profile.allowedContentTypes.includes(normalizedContentType)) {
    throw new Error("Capture content type is not allowed by its source profile");
  }
  if (isTextualMediaType(normalizedContentType)) {
    let responseText: string;
    try {
      responseText = new TextDecoder("utf-8", { fatal: true }).decode(responseBytes);
    } catch {
      throw new Error("Textual capture response is not valid UTF-8");
    }
    scanSecretBearingText(responseText, "Capture response");
    return;
  }
  if (
    profile.profileId !== contractV3Json.amendments.binaryQualification.allowedOnlyForProfile ||
    profile.requestCredentialMode !== contractV3Json.amendments.binaryQualification.requestCredentialModeMustEqual ||
    !(contractV3Json.amendments.binaryQualification.allowedContentTypes as string[]).includes(normalizedContentType)
  ) {
    throw new Error("Binary response is not allowed by the frozen OS-03A profile");
  }
}

export function buildCaptureId(input: {
  provider: string;
  dataset: CaptureDataset;
  idempotencyKey: string;
}): string {
  if (!captureDatasetSet.has(input.dataset)) throw new Error("Unknown capture dataset");
  return stableHash({
    contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
    provider: storageSafe(input.provider, "Capture provider"),
    dataset: input.dataset,
    idempotencyKey: requiredText(input.idempotencyKey, "Capture idempotency key")
  });
}

export function buildUsageRightsHash(usageRights: UsageRightsMetadata): string {
  return stableHash(validateUsageRights(usageRights));
}

export function buildLaterImportHash(laterImport: LaterImportMapping): string {
  return stableHash({
    owner: laterImport.owner,
    target: requiredText(laterImport.target, "Later-import target")
  });
}

export interface EvidenceHashInput {
  contractVersion: typeof OS03A_CAPTURE_CONTRACT_VERSION;
  captureId: string;
  profileId: string;
  requestHash: string;
  responseSha256: string;
  responseBytes: number;
  contentType: string;
  etag: string | null;
  sourceObservedAt: string | null;
  providerPublishedAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  sourceSchemaVersion: string;
  usageRightsHash: string;
  validationState: CaptureValidationState;
  laterImportHash: string;
}

export function buildEvidenceHash(input: EvidenceHashInput): string {
  if (input.contractVersion !== OS03A_CAPTURE_CONTRACT_VERSION) {
    throw new Error("Evidence hash uses an unknown capture contract version");
  }
  requireSha256(input.captureId, "Capture ID");
  storageSafe(input.profileId, "Capture profile");
  requireSha256(input.requestHash, "Capture request hash");
  requireSha256(input.responseSha256, "Capture response hash");
  if (!Number.isSafeInteger(input.responseBytes) || input.responseBytes < 1) {
    throw new Error("Capture response byte count is invalid");
  }
  requireSha256(input.usageRightsHash, "Usage-rights hash");
  requireValidationState(input.validationState);
  requireSha256(input.laterImportHash, "Later-import hash");
  return stableHash({
    contractVersion: input.contractVersion,
    captureId: input.captureId,
    profileId: input.profileId,
    requestHash: input.requestHash,
    responseSha256: input.responseSha256,
    responseBytes: input.responseBytes,
    contentType: input.contentType,
    etag: input.etag,
    sourceObservedAt: input.sourceObservedAt,
    providerPublishedAt: input.providerPublishedAt,
    validFrom: input.validFrom,
    validTo: input.validTo,
    sourceSchemaVersion: input.sourceSchemaVersion,
    usageRightsHash: input.usageRightsHash,
    validationState: input.validationState,
    laterImportHash: input.laterImportHash
  });
}

export function buildSidecarSha256(sidecar: Os03aCaptureSidecar | Record<string, unknown>): string {
  const selfHashable = { ...(sidecar as Record<string, unknown>) };
  delete selfHashable.sidecarSha256;
  delete selfHashable.sidecarPersistedAt;
  delete selfHashable.manifestPersistedAt;
  assertSecretFreeCanonicalValue(selfHashable, "Capture sidecar");
  return sha256Hex(canonicalJson(selfHashable));
}

export function buildManifestExtensionHash(
  extension: Omit<Os03aManifestExtension, "extensionHash"> | Os03aManifestExtension
): string {
  const immutableFields = { ...(extension as unknown as Record<string, unknown>) };
  delete immutableFields.extensionHash;
  delete immutableFields.manifestPersistedAt;
  assertSecretFreeCanonicalValue(immutableFields, "Capture manifest extension");
  return stableHash(immutableFields);
}

export function buildEventPayloadHash(payload: unknown): string {
  assertSecretFreeCanonicalValue(payload, "Capture event payload");
  return stableHash(payload);
}

export function buildCaptureEventId(input: {
  eventType: CaptureEventType;
  attemptToken: string;
  captureId: string | null;
  eventPayloadHash: string;
}): string {
  if (!captureEventTypeSet.has(input.eventType)) throw new Error("Unknown capture event type");
  if (input.captureId !== null) requireSha256(input.captureId, "Capture event capture ID");
  requireSha256(input.eventPayloadHash, "Capture event payload hash");
  return stableHash({
    contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
    eventType: input.eventType,
    attemptToken: requireAttemptToken(input.attemptToken),
    captureId: input.captureId,
    eventPayloadHash: input.eventPayloadHash
  });
}

export function buildCaptureAlertId(input: {
  sourceKey: string;
  failureCode: CaptureFailureCode;
  idempotencyKey: string;
}): string {
  if (!failureCodeSet.has(input.failureCode)) throw new Error("Unknown capture failure code");
  return stableHash({
    contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
    sourceKey: requiredText(input.sourceKey, "Capture source key"),
    failureCode: input.failureCode,
    idempotencyKey: requiredText(input.idempotencyKey, "Capture idempotency key")
  });
}

export interface BuildOs03aCaptureEvidenceInput {
  profileId: string;
  idempotencyKey: string;
  request: RedactedHttpRequest;
  responseBytes: Uint8Array;
  contentType: string;
  etag?: string | null;
  sourceObservedAt?: string | null;
  providerPublishedAt?: string | null;
  receiptCompletedAt: string;
  persistenceRequestedAt: string;
  responsePersistedAt: string;
  validFrom?: string | null;
  validTo?: string | null;
  sourceSchemaVersion: string;
  usageRights: UsageRightsMetadata;
  validationState: CaptureValidationState;
  failureCodes?: readonly CaptureFailureCode[];
  laterImport?: LaterImportMapping;
}

export interface BuiltOs03aCaptureEvidence {
  profile: QualificationSourceProfile;
  sidecar: Os03aCaptureSidecar;
  sidecarBytes: Uint8Array;
  sidecarSha256: string;
  sidecarObjectKey: string;
  responseSha256: string;
  responseObjectKey: string;
}

const sidecarFieldSet = new Set<keyof Os03aCaptureSidecar>([
  "schema",
  "contractVersion",
  "captureId",
  "idempotencyKey",
  "profileId",
  "provider",
  "dataset",
  "captureClass",
  "sourceKey",
  "request",
  "requestHash",
  "responseObjectKey",
  "responseSha256",
  "responseBytes",
  "contentType",
  "etag",
  "sourceObservedAt",
  "providerPublishedAt",
  "receiptCompletedAt",
  "persistenceRequestedAt",
  "responsePersistedAt",
  "validFrom",
  "validTo",
  "sourceSchemaVersion",
  "usageRights",
  "usageRightsHash",
  "validationState",
  "failureCodes",
  "laterImport",
  "laterImportHash",
  "evidenceHash"
]);

export function verifyOs03aCaptureSidecar(sidecar: Os03aCaptureSidecar): void {
  const actualFields = Object.keys(sidecar);
  if (
    actualFields.length !== sidecarFieldSet.size ||
    actualFields.some((field) => !sidecarFieldSet.has(field as keyof Os03aCaptureSidecar))
  ) {
    throw new Error("Capture sidecar fields do not match the frozen schema");
  }
  if (sidecar.schema !== OS03A_SIDECAR_SCHEMA || sidecar.contractVersion !== OS03A_CAPTURE_CONTRACT_VERSION) {
    throw new Error("Capture sidecar schema or capture contract version is invalid");
  }
  const profile = getQualificationSourceProfile(sidecar.profileId);
  if (
    sidecar.provider !== profile.provider ||
    sidecar.dataset !== profile.dataset ||
    sidecar.captureClass !== "qualification_fixture" ||
    sidecar.sourceKey !== sourceCaptureKey(profile)
  ) {
    throw new Error("Capture sidecar is cross-wired to a different source profile");
  }
  assertRegisteredCaptureRequest(profile, sidecar.request);
  const expectedCaptureId = buildCaptureId({
    provider: profile.provider,
    dataset: profile.dataset,
    idempotencyKey: sidecar.idempotencyKey
  });
  if (sidecar.captureId !== expectedCaptureId) throw new Error("Capture sidecar capture ID is invalid");
  if (sidecar.requestHash !== stableHash(sidecar.request)) throw new Error("Capture sidecar request hash is invalid");
  requireSha256(sidecar.responseSha256, "Capture response hash");
  if (!Number.isSafeInteger(sidecar.responseBytes) || sidecar.responseBytes < 1) {
    throw new Error("Capture sidecar response byte count is invalid");
  }
  if (sidecar.responseObjectKey !== `raw/${profile.provider}/${profile.dataset}/sha256/${sidecar.responseSha256}`) {
    throw new Error("Capture sidecar response object key is invalid");
  }
  const normalizedMediaType = mediaType(requiredText(sidecar.contentType, "Capture content type"));
  if (!profile.allowedContentTypes.includes(normalizedMediaType)) {
    throw new Error("Capture sidecar content type is outside its source profile");
  }
  if (sidecar.etag !== null) requiredText(sidecar.etag, "Capture ETag");

  const sourceObservedAt = nullableTimestamp(sidecar.sourceObservedAt, "Source observation time");
  const providerPublishedAt = nullableTimestamp(sidecar.providerPublishedAt, "Provider publication time");
  const receiptCompletedAt = canonicalTimestamp(sidecar.receiptCompletedAt, "Capture receipt-complete time");
  const persistenceRequestedAt = canonicalTimestamp(sidecar.persistenceRequestedAt, "Capture persistence-request time");
  const responsePersistedAt = canonicalTimestamp(sidecar.responsePersistedAt, "Response persistence time");
  const validFrom = nullableTimestamp(sidecar.validFrom, "Capture valid-from time");
  const validTo = nullableTimestamp(sidecar.validTo, "Capture valid-to time");
  for (const [stored, normalized, label] of [
    [sidecar.sourceObservedAt, sourceObservedAt, "source observation"],
    [sidecar.providerPublishedAt, providerPublishedAt, "provider publication"],
    [sidecar.receiptCompletedAt, receiptCompletedAt, "receipt completion"],
    [sidecar.persistenceRequestedAt, persistenceRequestedAt, "persistence request"],
    [sidecar.responsePersistedAt, responsePersistedAt, "response persistence"],
    [sidecar.validFrom, validFrom, "valid-from"],
    [sidecar.validTo, validTo, "valid-to"]
  ] as const) {
    if (stored !== normalized) throw new Error(`Capture sidecar ${label} timestamp is not canonical UTC milliseconds`);
  }
  if (Date.parse(receiptCompletedAt) > Date.parse(persistenceRequestedAt)) {
    throw new Error("Capture receipt must precede its persistence request");
  }
  if (Date.parse(persistenceRequestedAt) > Date.parse(responsePersistedAt)) {
    throw new Error("Capture persistence request must precede response verification");
  }
  if (validFrom && validTo && Date.parse(validFrom) > Date.parse(validTo)) {
    throw new Error("Capture validity cannot end before it begins");
  }
  const validationState = requireValidationState(sidecar.validationState);
  const expectedFailureCodes = normalizeFailureCodes(
    validationState,
    sidecar.failureCodes,
    sourceObservedAt,
    providerPublishedAt
  );
  if (canonicalJson(sidecar.failureCodes) !== canonicalJson(expectedFailureCodes)) {
    throw new Error("Capture sidecar failure codes are not canonical");
  }
  const usageRights = validateUsageRights(sidecar.usageRights);
  if (sidecar.usageRightsHash !== buildUsageRightsHash(usageRights)) {
    throw new Error("Capture sidecar usage-rights hash is invalid");
  }
  const configuredLaterImport = contractV1Json.laterImport[profile.dataset] as LaterImportMapping;
  if (canonicalJson(sidecar.laterImport) !== canonicalJson(configuredLaterImport)) {
    throw new Error("Capture sidecar later-import mapping is invalid");
  }
  if (sidecar.laterImportHash !== buildLaterImportHash(configuredLaterImport)) {
    throw new Error("Capture sidecar later-import hash is invalid");
  }
  const expectedEvidenceHash = buildEvidenceHash({
    contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
    captureId: sidecar.captureId,
    profileId: sidecar.profileId,
    requestHash: sidecar.requestHash,
    responseSha256: sidecar.responseSha256,
    responseBytes: sidecar.responseBytes,
    contentType: sidecar.contentType,
    etag: sidecar.etag,
    sourceObservedAt,
    providerPublishedAt,
    validFrom,
    validTo,
    sourceSchemaVersion: requiredText(sidecar.sourceSchemaVersion, "Capture source-schema version"),
    usageRightsHash: sidecar.usageRightsHash,
    validationState,
    laterImportHash: sidecar.laterImportHash
  });
  if (sidecar.evidenceHash !== expectedEvidenceHash) throw new Error("Capture sidecar evidence hash is invalid");
  assertSecretFreeCanonicalValue(sidecar, "Capture sidecar");
}

export function buildOs03aCaptureEvidence(input: BuildOs03aCaptureEvidenceInput): BuiltOs03aCaptureEvidence {
  const profile = getQualificationSourceProfile(input.profileId);
  assertRegisteredCaptureRequest(profile, input.request);
  assertSecretFreeCaptureResponse(profile, input.contentType, input.responseBytes);

  const idempotencyKey = requiredText(input.idempotencyKey, "Capture idempotency key");
  const sourceObservedAt = nullableTimestamp(input.sourceObservedAt, "Source observation time");
  const providerPublishedAt = nullableTimestamp(input.providerPublishedAt, "Provider publication time");
  const receiptCompletedAt = canonicalTimestamp(input.receiptCompletedAt, "Capture receipt-complete time");
  const persistenceRequestedAt = canonicalTimestamp(input.persistenceRequestedAt, "Capture persistence-request time");
  const responsePersistedAt = canonicalTimestamp(input.responsePersistedAt, "Response persistence time");
  const validFrom = nullableTimestamp(input.validFrom, "Capture valid-from time");
  const validTo = nullableTimestamp(input.validTo, "Capture valid-to time");
  if (Date.parse(receiptCompletedAt) > Date.parse(persistenceRequestedAt)) {
    throw new Error("Capture receipt must precede its persistence request");
  }
  if (Date.parse(persistenceRequestedAt) > Date.parse(responsePersistedAt)) {
    throw new Error("Capture persistence request must precede response verification");
  }
  if (validFrom && validTo && Date.parse(validFrom) > Date.parse(validTo)) {
    throw new Error("Capture validity cannot end before it begins");
  }

  const validationState = requireValidationState(input.validationState);
  const failureCodes = normalizeFailureCodes(
    validationState,
    input.failureCodes,
    sourceObservedAt,
    providerPublishedAt
  );
  const usageRights = validateUsageRights(input.usageRights);
  const configuredLaterImport = contractV1Json.laterImport[profile.dataset] as LaterImportMapping;
  const laterImport = { ...(input.laterImport ?? configuredLaterImport) };
  if (canonicalJson(laterImport) !== canonicalJson(configuredLaterImport)) {
    throw new Error("Later-import mapping does not match the frozen dataset mapping");
  }

  const contentType = requiredText(input.contentType, "Capture content type");
  const etag = input.etag === null || input.etag === undefined
    ? null
    : requiredText(input.etag, "Capture ETag");
  const sourceSchemaVersion = requiredText(input.sourceSchemaVersion, "Capture source-schema version");
  const captureId = buildCaptureId({
    provider: profile.provider,
    dataset: profile.dataset,
    idempotencyKey
  });
  const requestHash = stableHash(input.request);
  const responseSha256 = sha256Hex(input.responseBytes);
  const responseObjectKey = `raw/${profile.provider}/${profile.dataset}/sha256/${responseSha256}`;
  const usageRightsHash = buildUsageRightsHash(usageRights);
  const laterImportHash = buildLaterImportHash(laterImport);
  const evidenceHash = buildEvidenceHash({
    contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
    captureId,
    profileId: profile.profileId,
    requestHash,
    responseSha256,
    responseBytes: input.responseBytes.byteLength,
    contentType,
    etag,
    sourceObservedAt,
    providerPublishedAt,
    validFrom,
    validTo,
    sourceSchemaVersion,
    usageRightsHash,
    validationState,
    laterImportHash
  });

  const sidecar: Os03aCaptureSidecar = {
    schema: OS03A_SIDECAR_SCHEMA,
    contractVersion: OS03A_CAPTURE_CONTRACT_VERSION,
    captureId,
    idempotencyKey,
    profileId: profile.profileId,
    provider: profile.provider,
    dataset: profile.dataset,
    captureClass: "qualification_fixture",
    sourceKey: sourceCaptureKey(profile),
    request: input.request,
    requestHash,
    responseObjectKey,
    responseSha256,
    responseBytes: input.responseBytes.byteLength,
    contentType,
    etag,
    sourceObservedAt,
    providerPublishedAt,
    receiptCompletedAt,
    persistenceRequestedAt,
    responsePersistedAt,
    validFrom,
    validTo,
    sourceSchemaVersion,
    usageRights,
    usageRightsHash,
    validationState,
    failureCodes,
    laterImport,
    laterImportHash,
    evidenceHash
  };
  verifyOs03aCaptureSidecar(sidecar);
  const sidecarBytes = new TextEncoder().encode(canonicalJson(sidecar));
  const sidecarSha256 = buildSidecarSha256(sidecar);
  if (sidecarSha256 !== sha256Hex(sidecarBytes)) {
    throw new Error("Capture sidecar serialization is not canonical");
  }
  return {
    profile,
    sidecar,
    sidecarBytes,
    sidecarSha256,
    sidecarObjectKey: `manifests/os03a/sha256/${sidecarSha256}.json`,
    responseSha256,
    responseObjectKey
  };
}

export function buildOs03aManifestExtension(input: {
  sidecar: Os03aCaptureSidecar;
  sidecarPersistedAt: string;
  manifestPersistedAt: string;
}): Os03aManifestExtension {
  const sidecarPersistedAt = canonicalTimestamp(input.sidecarPersistedAt, "Sidecar persistence time");
  const manifestPersistedAt = canonicalTimestamp(input.manifestPersistedAt, "Manifest persistence time");
  if (Date.parse(input.sidecar.responsePersistedAt) > Date.parse(sidecarPersistedAt)) {
    throw new Error("Response verification must precede sidecar verification");
  }
  if (Date.parse(sidecarPersistedAt) > Date.parse(manifestPersistedAt)) {
    throw new Error("Sidecar verification must precede manifest persistence");
  }
  const unsigned: Omit<Os03aManifestExtension, "extensionHash"> = {
    captureId: input.sidecar.captureId,
    contractVersion: OS03A_EFFECTIVE_CONTRACT_VERSION,
    contractHash: OS03A_EFFECTIVE_CONTRACT_HASH,
    profileId: input.sidecar.profileId,
    captureClass: input.sidecar.captureClass,
    sourceKey: input.sidecar.sourceKey,
    sourceObservedAt: input.sidecar.sourceObservedAt,
    receiptCompletedAt: input.sidecar.receiptCompletedAt,
    persistenceRequestedAt: input.sidecar.persistenceRequestedAt,
    responsePersistedAt: input.sidecar.responsePersistedAt,
    sidecarPersistedAt,
    manifestPersistedAt,
    contentType: input.sidecar.contentType,
    etag: input.sidecar.etag,
    usageRights: input.sidecar.usageRights,
    usageRightsHash: input.sidecar.usageRightsHash,
    validationState: input.sidecar.validationState,
    failureCodes: input.sidecar.failureCodes,
    laterImport: input.sidecar.laterImport,
    laterImportHash: input.sidecar.laterImportHash
  };
  const extensionHash = buildManifestExtensionHash(unsigned);
  return { ...unsigned, extensionHash };
}
