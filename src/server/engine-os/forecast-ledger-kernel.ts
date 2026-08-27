import forecastLedgerContractJson from "../../../config/forecast-ledger-contract-2026.v1.json";
import sourceCaptureContractJson from "../../../config/source-capture-contract-2026.v9.json";
import {
  classifySeasonEvidence,
  engineOperatingContract,
  engineOsContractHashes,
  footballLifecycle2026,
  researchConstitution
} from "@/domain/engine-os-contracts";
import type {
  ForecastWithholdingReason,
  OriginEligibilityReason,
  RequiredForecastHorizonId
} from "@/domain/engine-os";
import { sha256Hex, stableHash } from "@/domain/hash";
import {
  interimSchedulerContract,
  interimSchedulerContractHash,
  interimSchedulerHorizonIds
} from "@/server/engine-os/interim-scheduler-kernel";

const REQUIRED_HORIZONS = [
  "weekly_tuesday_0730",
  "kickoff_minus_120",
  "kickoff_minus_90",
  "kickoff_minus_60",
  "kickoff_minus_15"
] as const satisfies readonly RequiredForecastHorizonId[];

const APPROVED_WITHHOLDING_REASONS = [
  "no_eligible_package",
  "schedule_unavailable_at_origin",
  "required_source_stale",
  "required_source_partial",
  "required_source_unavailable",
  "schema_invalid",
  "provenance_incomplete",
  "package_hash_mismatch",
  "late_origin_excluded",
  "compute_failure"
] as const satisfies readonly ForecastWithholdingReason[];

const REQUIRED_PROVENANCE_FIELDS = [
  "runner_hash",
  "code_hash",
  "model_or_package_hash",
  "config_hash",
  "input_manifest_hash",
  "feature_schema_hash",
  "target_schema_hash",
  "output_object_hash",
  "output_object_key"
] as const;

const RECORD_KEY_FIELDS = [
  "ledger_contract_hash",
  "origin_version_id",
  "activation_boundary"
] as const;

const RECORD_KEY_EXCLUDES = [
  "status",
  "withholding_reason",
  "qualification_key",
  "generated_at",
  "persisted_at",
  "output_object_hash"
] as const;

const QUALIFICATION_KEY_FIELDS = [
  "ledger_contract_hash",
  "activation_boundary",
  "qualification_stream",
  "model_or_package_hash"
] as const;

const REQUIRED_TIMES = [
  "scheduled_for_utc",
  "invoked_at",
  "evidence_at",
  "generated_at",
  "persistence_requested_at",
  "persisted_at",
  "persistence_deadline_at",
  "kickoff_at"
] as const;

const REQUIRED_TIME_ORDERING = [
  "activation_at_lte_scheduled_for_utc",
  "scheduled_for_utc_lte_invoked_at",
  "invoked_at_lte_generated_at",
  "evidence_at_lte_generated_at",
  "generated_at_lte_output_published_at_for_forecast",
  "output_published_at_lte_output_verified_at_for_forecast",
  "output_verified_at_lte_persistence_requested_at_for_forecast",
  "generated_at_lte_persistence_requested_at",
  "persistence_requested_at_lte_persisted_at",
  "persisted_at_lt_persistence_deadline_at",
  "persisted_at_lte_kickoff_minus_1_second"
] as const;

const QUALIFICATION_STREAMS = ["eligible_package", "no_eligible_package"] as const;

const PROVENANCE_KEYS = [
  "runnerHash",
  "codeHash",
  "modelOrPackageHash",
  "configHash",
  "inputManifestHash",
  "featureSchemaHash",
  "targetSchemaHash",
  "outputObjectHash",
  "outputObjectKey"
] as const;

const HASH_PROVENANCE_KEYS = PROVENANCE_KEYS.filter(
  (key): key is Exclude<typeof PROVENANCE_KEYS[number], "outputObjectKey"> =>
    key !== "outputObjectKey"
);

const DIGEST = /^[a-f0-9]{64}$/;

export type ForecastQualificationStream = typeof QUALIFICATION_STREAMS[number];
export type ForecastLedgerCaptureHealth = "current" | "stale" | "partial" | "unavailable";
export type ForecastLedgerTiming = "timely" | "late";
export type ForecastLedgerStatus = "forecast" | "withheld";

export interface ForecastLedgerContractValidation {
  errors: string[];
  contractHash: string;
}

export interface ForecastLedgerOrigin {
  originVersionId: string;
  logicalOriginId: string;
  gameId: string;
  horizonId: RequiredForecastHorizonId;
  scheduledForUtc: string;
  kickoffUtc: string;
  activationBoundary: string;
  eligible: boolean;
  eligibilityReason: OriginEligibilityReason;
}

export interface ForecastLedgerProvenance {
  runnerHash: string;
  codeHash: string;
  modelOrPackageHash: string;
  configHash: string;
  inputManifestHash: string;
  featureSchemaHash: string;
  targetSchemaHash: string;
  outputObjectHash: string;
  outputObjectKey: string;
}

export type ForecastQualification =
  | {
      stream: "eligible_package";
      modelOrPackageHash: string;
    }
  | {
      stream: "no_eligible_package";
      modelOrPackageHash?: null;
    };

export interface ForecastLedgerAuthorityProof {
  state: "running" | "pending" | "terminal" | "invalidated";
  storedAttemptTokenHash: string | null;
  storedFence: number;
  suppliedAttemptTokenHash: string;
  suppliedFence: number;
  leaseExpiresAt: string | null;
  isCurrentHead: boolean;
}

export interface PrepareForecastLedgerRecordInput {
  origin: ForecastLedgerOrigin;
  activatedAt: string;
  activationFirstOriginUtc: string;
  weekOneOriginComplete: boolean;
  requestedStatus: ForecastLedgerStatus;
  requestedWithholdingReason?: ForecastWithholdingReason | null;
  captureHealth: ForecastLedgerCaptureHealth;
  invokedAt: string;
  evidenceAt: string;
  generatedAt: string;
  outputPublishedAt?: string | null;
  outputVerifiedAt?: string | null;
  persistenceRequestedAt: string;
  persistedAt: string;
  qualification: ForecastQualification;
  authority: ForecastLedgerAuthorityProof;
  provenance?: Partial<ForecastLedgerProvenance> | null;
  expectedProvenance?: Partial<ForecastLedgerProvenance> | null;
  outputBytes?: Uint8Array | null;
}

export interface ForecastLedgerRecord {
  contractVersion: typeof forecastLedgerContractJson.version;
  contractHash: string;
  recordId: string;
  originVersionId: string;
  logicalOriginId: string;
  gameId: string;
  horizonId: RequiredForecastHorizonId;
  activationBoundary: string;
  activatedAt: string;
  evidenceScope: "full_season_shadow" | "partial_season_shadow";
  qualificationStream: ForecastQualificationStream;
  qualificationKey: string;
  status: ForecastLedgerStatus;
  withholdingReason: ForecastWithholdingReason | null;
  captureHealth: ForecastLedgerCaptureHealth;
  scheduledForUtc: string;
  invokedAt: string;
  evidenceAt: string;
  generatedAt: string;
  outputPublishedAt: string | null;
  outputVerifiedAt: string | null;
  persistenceRequestedAt: string;
  persistedAt: string;
  persistenceDeadlineAt: string;
  kickoffUtc: string;
  timing: ForecastLedgerTiming;
  prospectiveEvidenceEligible: boolean;
  forecastEvaluationEligible: boolean;
  provenance: ForecastLedgerProvenance | null;
  outputObjectKey: string | null;
  outputObjectHash: string | null;
  recordHash: string;
}

export type ForecastLedgerPreparation =
  | {
      publishable: false;
      violations: string[];
      record: null;
    }
  | {
      publishable: true;
      violations: [];
      record: ForecastLedgerRecord;
    };

function sameValues<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function canonicalTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function timestampMilliseconds(value: string, label: string): number {
  return Date.parse(canonicalTimestamp(value, label));
}

function requiredString(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function canonicalDigest(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!DIGEST.test(normalized)) throw new Error(`${label} must be lowercase SHA-256 hex`);
  return normalized;
}

function horizonCapSeconds(horizonId: RequiredForecastHorizonId): number {
  const horizon = forecastLedgerContractJson.horizons.find((candidate) => candidate.id === horizonId);
  if (!horizon || !REQUIRED_HORIZONS.includes(horizonId)) {
    throw new Error(`Unsupported OS-13A horizon: ${horizonId}`);
  }
  return horizon.maximumPersistenceDelaySeconds;
}

function normalizedKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function forbiddenInputPaths(value: unknown): string[] {
  const forbidden = forecastLedgerContractJson.security.forbiddenInputKeyPatterns;
  const results: string[] = [];
  const seen = new Set<object>();
  const visit = (current: unknown, path: string): void => {
    if (!current || typeof current !== "object" || current instanceof Uint8Array) return;
    if (seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, item] of Object.entries(current as Record<string, unknown>)) {
      const normalized = normalizedKey(key);
      if (forbidden.some((pattern) => normalized.includes(pattern))) {
        results.push(path ? `${path}.${key}` : key);
      }
      visit(item, path ? `${path}.${key}` : key);
    }
  };
  visit(value, "");
  return results.sort();
}

export const forecastLedgerContract = forecastLedgerContractJson;
export const forecastLedgerContractHash = stableHash(forecastLedgerContractJson);
export const forecastLedgerHorizonIds = REQUIRED_HORIZONS;
export const forecastLedgerApprovedWithholdingReasons = APPROVED_WITHHOLDING_REASONS;

/** Rejects drift before the OS-13A kernel may construct any terminal record. */
export function validateForecastLedgerContract(): ForecastLedgerContractValidation {
  const contract = forecastLedgerContractJson;
  const errors: string[] = [];
  const horizonIds = contract.horizons.map((horizon) => horizon.id);
  const horizonDelays = contract.horizons.map((horizon) => horizon.maximumPersistenceDelaySeconds);

  if (
    contract.version !== "forecast-ledger-contract.2026.1" ||
    contract.status !== "frozen_qualification" ||
    contract.effectiveSeason !== 2026 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(contract.frozenOn)
  ) {
    errors.push("OS-13A must use the frozen 2026 qualification envelope");
  }
  if (
    contract.scope.workPackage !== "OS-13A" ||
    !contract.scope.qualificationOnly ||
    contract.scope.productionActivationAllowed ||
    contract.scope.providerDependencyAllowed ||
    contract.scope.providerDispatchAllowed ||
    contract.scope.marketInputAllowed ||
    contract.scope.modelExecutionAllowed ||
    contract.scope.productionForecastMutationAllowed ||
    contract.scope.originSource !== "forecast_origin_versions_current_heads"
  ) {
    errors.push("OS-13A scope must remain provider-free, market-free, dormant, and origin-version bound");
  }
  if (
    contract.bindings.operatingContractVersion !== engineOperatingContract.version ||
    contract.bindings.operatingContractCanonicalSha256 !== engineOsContractHashes.operating ||
    contract.bindings.researchConstitutionVersion !== researchConstitution.version ||
    contract.bindings.researchConstitutionCanonicalSha256 !== engineOsContractHashes.research ||
    contract.bindings.lifecycleContractVersion !== footballLifecycle2026.version ||
    contract.bindings.lifecycleContractCanonicalSha256 !== engineOsContractHashes.lifecycle ||
    contract.bindings.schedulerContractVersion !== interimSchedulerContract.version ||
    contract.bindings.schedulerContractCanonicalSha256 !== interimSchedulerContractHash ||
    contract.bindings.sourceCaptureContractVersion !== sourceCaptureContractJson.version ||
    contract.bindings.sourceCaptureContractCanonicalSha256 !== stableHash(sourceCaptureContractJson) ||
    contract.bindings.originIdentityMigrationVersion !== "0015_engine_os_origin_identity"
  ) {
    errors.push("OS-13A accepted-foundation bindings changed");
  }
  if (
    !sameValues(horizonIds, REQUIRED_HORIZONS) ||
    !sameValues(horizonIds, interimSchedulerHorizonIds) ||
    !sameValues(horizonIds, engineOperatingContract.forecastHorizons.map((horizon) => horizon.id)) ||
    !sameValues(horizonDelays, [600, 600, 600, 600, 300]) ||
    !sameValues(
      horizonDelays,
      engineOperatingContract.forecastHorizons.map((horizon) => horizon.maximumPersistenceDelaySeconds)
    )
  ) {
    errors.push("OS-13A must bind exactly the five OS-02A horizons and their frozen delay caps");
  }
  if (
    !contract.activation.boundaryRequired ||
    !contract.activation.oneBoundaryPerPackage ||
    contract.activation.fullSeasonActivationDeadline !==
      footballLifecycle2026.seasonBoundary.fullSeasonActivationDeadline ||
    contract.activation.fullSeasonFirstOriginUtc !== "2026-09-08T14:30:00.000Z" ||
    !contract.activation.weekOneOriginCompleteRequiredForFullSeason ||
    contract.activation.fullSeasonEvidenceLabel !== footballLifecycle2026.seasonBoundary.fullSeasonLabel ||
    contract.activation.lateActivationEvidenceLabel !== footballLifecycle2026.seasonBoundary.lateActivationLabel ||
    !sameValues(contract.activation.qualificationStreams, QUALIFICATION_STREAMS) ||
    contract.activation.productionActivationCreatedByQualification
  ) {
    errors.push("OS-13A activation and partial-season evidence boundary changed");
  }
  if (
    contract.identity.recordKeyVersion !== "engine-os.forecast-ledger-record.v2" ||
    !sameValues(contract.identity.recordKeyFields, RECORD_KEY_FIELDS) ||
    !sameValues(contract.identity.recordKeyExcludes, RECORD_KEY_EXCLUDES) ||
    contract.identity.qualificationKeyVersion !== "engine-os.forecast-qualification.v1" ||
    !sameValues(contract.identity.qualificationKeyFields, QUALIFICATION_KEY_FIELDS) ||
    contract.identity.noPackageSentinel !== "none_no_eligible_package" ||
    !contract.identity.oneTerminalRecordPerActivatedOrigin ||
    contract.identity.terminalRecordMayBeReopened
  ) {
    errors.push("OS-13A record or qualification identity changed");
  }
  if (
    !sameValues(contract.timing.requiredSeparateTimes, REQUIRED_TIMES) ||
    !sameValues(contract.timing.forecastOnlySeparateTimes, [
      "output_published_at",
      "output_verified_at"
    ]) ||
    !sameValues(contract.timing.requiredOrdering, REQUIRED_TIME_ORDERING) ||
    contract.timing.deadlineFormula !==
      "min(scheduled_for_utc_plus_horizon_cap,kickoff_at_minus_1_second)" ||
    contract.timing.prospectiveDeadlineComparator !== "strict_open_upper_bound" ||
    contract.timing.exactDeadlineClassification !== "late_nonprospective" ||
    contract.timing.forecastMustPrecedeKickoffSeconds !== 1 ||
    contract.timing.retrospectiveBackfillAllowed ||
    contract.timing.lateRecordProspectiveEligible
  ) {
    errors.push("OS-13A strict timing or no-backfill rules changed");
  }
  if (
    !contract.publication.r2ObjectMustExistBeforeD1Pointer ||
    !contract.publication.r2ObjectMustVerifyBeforeD1Pointer ||
    contract.publication.outputHashAlgorithm !== "sha256" ||
    contract.publication.outputObjectKeyPrefix !== "forecast-output/sha256" ||
    !contract.publication.contentAddressedOutputRequired ||
    !contract.publication.currentHeadRecheckRequired ||
    !contract.publication.exactLeaseAttemptAndFenceRequired ||
    !contract.publication.unexpiredLeaseRequired ||
    !contract.publication.atomicTerminalInsertRequired ||
    contract.publication.duplicateAndRetryBehavior !== "converge_on_record_key" ||
    contract.publication.failedObjectWriteMayPublishPointer ||
    contract.publication.failedPointerWriteMayReplaceLastGood ||
    contract.publication.corruptObjectMayPublishPointer
  ) {
    errors.push("OS-13A output publication, fencing, or last-good rule changed");
  }
  if (
    !sameValues(contract.provenance.requiredForecastFields, REQUIRED_PROVENANCE_FIELDS) ||
    contract.provenance.hashEncoding !== "lowercase_sha256_hex" ||
    !contract.provenance.allFieldsMustMatchExpectedQualification ||
    contract.provenance.missingFieldReason !== "provenance_incomplete" ||
    contract.provenance.mismatchedFieldReason !== "package_hash_mismatch" ||
    contract.provenance.forecastWithoutVerifiedOutputAllowed ||
    contract.provenance.withholdingCarriesForecastProvenance
  ) {
    errors.push("OS-13A forecast provenance must remain complete, exact, and output-verified");
  }
  if (
    !sameValues(contract.withholding.approvedReasons, APPROVED_WITHHOLDING_REASONS) ||
    !sameValues(
      contract.withholding.approvedReasons,
      footballLifecycle2026.dataFailureAndWithholding.approvedWithholdingCodes
    ) ||
    contract.withholding.unknownReasonAllowed ||
    !contract.withholding.noEligiblePackageDefault ||
    !contract.withholding.missingProvenancePrecedesRequestedReason ||
    !contract.withholding.mismatchedProvenancePrecedesRequestedReason ||
    !contract.withholding.lateTimingPrecedesAllOtherReasons
  ) {
    errors.push("OS-13A withholding vocabulary or deterministic precedence changed");
  }
  if (
    !contract.immutability.appendOnly ||
    contract.immutability.historicalMutationAllowed ||
    contract.immutability.correctionMode !== "append_relation_only" ||
    contract.immutability.os13bMigrationMode !== "append_relation_preserve_original" ||
    contract.immutability.missedOriginReplayAllowed ||
    contract.immutability.lateRecordMayBecomeProspective
  ) {
    errors.push("OS-13A append-only correction, OS-13B, or no-replay rules changed");
  }
  if (
    contract.security.providerSecretMayBeRead ||
    contract.security.providerBindingMayBeRead ||
    contract.security.networkDispatchAllowed ||
    contract.security.oddsMayBlockFootballRecord ||
    !sameValues(contract.security.forbiddenInputKeyPatterns, [
      "odds",
      "spread",
      "total",
      "moneyline",
      "price",
      "line_movement",
      "public_betting",
      "recorded_selection"
    ])
  ) {
    errors.push("OS-13A must remain independent of provider, market, and selection state");
  }
  return { errors, contractHash: forecastLedgerContractHash };
}

/** One immutable row identity per activated origin; status and timestamps cannot fork it. */
export function forecastLedgerRecordId(input: {
  originVersionId: string;
  activationBoundary: string;
}): string {
  return stableHash({
    contract: forecastLedgerContractJson.identity.recordKeyVersion,
    ledgerContractHash: forecastLedgerContractHash,
    originVersionId: requiredString(input.originVersionId, "Origin version"),
    activationBoundary: requiredString(input.activationBoundary, "Activation boundary")
  });
}

/** A package gets its own stream; the absence of a package gets an explicit sentinel stream. */
export function forecastQualificationKey(input: {
  activationBoundary: string;
  qualification: ForecastQualification;
}): string {
  const activationBoundary = requiredString(input.activationBoundary, "Activation boundary");
  const modelOrPackageHash = input.qualification.stream === "eligible_package"
    ? canonicalDigest(input.qualification.modelOrPackageHash, "Model or package hash")
    : forecastLedgerContractJson.identity.noPackageSentinel;
  if (
    input.qualification.stream === "no_eligible_package" &&
    input.qualification.modelOrPackageHash !== undefined &&
    input.qualification.modelOrPackageHash !== null
  ) {
    throw new Error("The no-package qualification stream cannot carry a package hash");
  }
  return stableHash({
    contract: forecastLedgerContractJson.identity.qualificationKeyVersion,
    ledgerContractHash: forecastLedgerContractHash,
    activationBoundary,
    qualificationStream: input.qualification.stream,
    modelOrPackageHash
  });
}

export function forecastOutputObjectKey(outputObjectHash: string): string {
  const digest = canonicalDigest(outputObjectHash, "Output object hash");
  return `${forecastLedgerContractJson.publication.outputObjectKeyPrefix}/${digest}`;
}

export function forecastLedgerPersistenceDeadline(input: {
  horizonId: RequiredForecastHorizonId;
  scheduledForUtc: string;
  kickoffUtc: string;
}): string {
  const scheduled = timestampMilliseconds(input.scheduledForUtc, "Scheduled origin");
  const kickoff = timestampMilliseconds(input.kickoffUtc, "Kickoff");
  const horizonCap = scheduled + horizonCapSeconds(input.horizonId) * 1_000;
  const kickoffCap = kickoff - forecastLedgerContractJson.timing.forecastMustPrecedeKickoffSeconds * 1_000;
  return new Date(Math.min(horizonCap, kickoffCap)).toISOString();
}

export function classifyForecastEvidenceScope(input: {
  activatedAt: string;
  firstOriginUtc: string;
  weekOneOriginComplete: boolean;
}): "full_season_shadow" | "partial_season_shadow" {
  if (timestampMilliseconds(input.firstOriginUtc, "Activation first origin") !==
      timestampMilliseconds(forecastLedgerContractJson.activation.fullSeasonFirstOriginUtc, "Full-season first origin")) {
    return "partial_season_shadow";
  }
  return classifySeasonEvidence({
    activatedAt: input.activatedAt,
    weekOneOriginComplete: input.weekOneOriginComplete
  });
}

function authorityViolations(input: {
  authority: ForecastLedgerAuthorityProof;
  persistedAt: string;
}): string[] {
  const { authority } = input;
  const violations: string[] = [];
  if (authority.state !== "running") violations.push("lease_not_running");
  if (!authority.isCurrentHead) violations.push("origin_is_not_current_head");
  if (!Number.isInteger(authority.storedFence) || authority.storedFence < 1) {
    violations.push("stored_fence_invalid");
  }
  if (!Number.isInteger(authority.suppliedFence) || authority.suppliedFence < 1) {
    violations.push("supplied_fence_invalid");
  }
  if (
    authority.storedAttemptTokenHash !== authority.suppliedAttemptTokenHash ||
    authority.storedFence !== authority.suppliedFence
  ) {
    violations.push("lease_authority_lost");
  }
  if (!authority.leaseExpiresAt) {
    violations.push("lease_expiry_missing");
  } else if (
    timestampMilliseconds(input.persistedAt, "Persistence") >=
    timestampMilliseconds(authority.leaseExpiresAt, "Lease expiry")
  ) {
    violations.push("lease_expired_before_publication");
  }
  return [...new Set(violations)];
}

function normalizeProvenance(
  value: Partial<ForecastLedgerProvenance> | null | undefined
): ForecastLedgerProvenance | null {
  if (!value) return null;
  for (const key of PROVENANCE_KEYS) {
    if (typeof value[key] !== "string" || !value[key]?.trim()) return null;
  }
  try {
    const normalized = { ...value } as ForecastLedgerProvenance;
    for (const key of HASH_PROVENANCE_KEYS) {
      normalized[key] = canonicalDigest(normalized[key], key);
    }
    normalized.outputObjectKey = requiredString(normalized.outputObjectKey, "Output object key");
    return normalized;
  } catch {
    return null;
  }
}

function provenanceMatchesExpected(
  actual: ForecastLedgerProvenance,
  expected: ForecastLedgerProvenance
): boolean {
  return PROVENANCE_KEYS.every((key) => actual[key] === expected[key]);
}

function captureHealthReason(health: ForecastLedgerCaptureHealth): ForecastWithholdingReason | null {
  if (health === "stale") return "required_source_stale";
  if (health === "partial") return "required_source_partial";
  if (health === "unavailable") return "required_source_unavailable";
  return null;
}

function validWithholdingReason(reason: string | null | undefined): reason is ForecastWithholdingReason {
  return APPROVED_WITHHOLDING_REASONS.includes(reason as ForecastWithholdingReason);
}

/**
 * Pure OS-13A terminal-row constructor. It never writes R2 or D1. A runtime may
 * persist only the `record` of a `publishable: true` result, after performing
 * the contract's object-first transaction protocol.
 */
export function prepareForecastLedgerRecord(
  input: PrepareForecastLedgerRecordInput
): ForecastLedgerPreparation {
  const contractValidation = validateForecastLedgerContract();
  if (contractValidation.errors.length > 0) {
    return { publishable: false, violations: ["ledger_contract_invalid"], record: null };
  }
  const marketPaths = forbiddenInputPaths(input);
  if (marketPaths.length > 0) {
    return {
      publishable: false,
      violations: marketPaths.map((path) => `forbidden_market_input:${path}`),
      record: null
    };
  }

  const origin = input.origin;
  requiredString(origin.originVersionId, "Origin version");
  requiredString(origin.logicalOriginId, "Logical origin");
  requiredString(origin.gameId, "Game identity");
  const activationBoundary = requiredString(origin.activationBoundary, "Activation boundary");
  if (!REQUIRED_HORIZONS.includes(origin.horizonId)) {
    throw new Error(`Unsupported OS-13A horizon: ${origin.horizonId}`);
  }
  const activatedAt = canonicalTimestamp(input.activatedAt, "Activation");
  const scheduledForUtc = canonicalTimestamp(origin.scheduledForUtc, "Scheduled origin");
  const invokedAt = canonicalTimestamp(input.invokedAt, "Invocation");
  const evidenceAt = canonicalTimestamp(input.evidenceAt, "Evidence");
  const generatedAt = canonicalTimestamp(input.generatedAt, "Generation");
  const outputPublishedAt = input.outputPublishedAt === null || input.outputPublishedAt === undefined
    ? null
    : canonicalTimestamp(input.outputPublishedAt, "Output publication");
  const outputVerifiedAt = input.outputVerifiedAt === null || input.outputVerifiedAt === undefined
    ? null
    : canonicalTimestamp(input.outputVerifiedAt, "Output verification");
  const persistenceRequestedAt = canonicalTimestamp(
    input.persistenceRequestedAt,
    "Persistence request"
  );
  const persistedAt = canonicalTimestamp(input.persistedAt, "Persistence");
  const kickoffUtc = canonicalTimestamp(origin.kickoffUtc, "Kickoff");
  const persistenceDeadlineAt = forecastLedgerPersistenceDeadline({
    horizonId: origin.horizonId,
    scheduledForUtc,
    kickoffUtc
  });

  const authorityErrors = authorityViolations({ authority: input.authority, persistedAt });
  const orderingErrors: string[] = [];
  if (Date.parse(invokedAt) < Date.parse(scheduledForUtc)) {
    orderingErrors.push("invocation_precedes_origin");
  }
  if (Date.parse(generatedAt) < Date.parse(invokedAt)) {
    orderingErrors.push("generation_precedes_invocation");
  }
  if (Date.parse(generatedAt) < Date.parse(evidenceAt)) {
    orderingErrors.push("generation_precedes_evidence");
  }
  if (Date.parse(persistenceRequestedAt) < Date.parse(generatedAt)) {
    orderingErrors.push("persistence_request_precedes_generation");
  }
  if (Date.parse(persistedAt) < Date.parse(persistenceRequestedAt)) {
    orderingErrors.push("database_persistence_precedes_request");
  }
  const hardViolations = [...new Set([...authorityErrors, ...orderingErrors])];
  if (hardViolations.length > 0) {
    return { publishable: false, violations: hardViolations, record: null };
  }

  const activatedAfterOrigin = Date.parse(activatedAt) > Date.parse(scheduledForUtc);
  const originIneligible = !origin.eligible || origin.eligibilityReason !== "eligible";
  const scheduleUnavailableAtOrigin = origin.eligibilityReason === "known_after_origin" ||
    origin.eligibilityReason === "schedule_unresolved";
  const missedDeadline = Date.parse(persistedAt) >= Date.parse(persistenceDeadlineAt);
  const notBeforeKickoff = Date.parse(persistedAt) >
    Date.parse(kickoffUtc) - forecastLedgerContractJson.timing.forecastMustPrecedeKickoffSeconds * 1_000;
  const late = activatedAfterOrigin || originIneligible || missedDeadline || notBeforeKickoff;

  const expected = normalizeProvenance(input.expectedProvenance);
  const actual = normalizeProvenance(input.provenance);
  let finalStatus: ForecastLedgerStatus = input.requestedStatus;
  let withholdingReason: ForecastWithholdingReason | null = input.requestedWithholdingReason ?? null;
  let verifiedProvenance: ForecastLedgerProvenance | null = null;

  if (late) {
    finalStatus = "withheld";
    withholdingReason = scheduleUnavailableAtOrigin
      ? "schedule_unavailable_at_origin"
      : "late_origin_excluded";
  } else if (input.requestedStatus === "forecast") {
    if (!expected || !actual || !input.outputBytes) {
      finalStatus = "withheld";
      withholdingReason = "provenance_incomplete";
    } else {
      const bytesHash = sha256Hex(input.outputBytes);
      const expectedObjectKey = forecastOutputObjectKey(actual.outputObjectHash);
      const qualificationHash = input.qualification.stream === "eligible_package"
        ? input.qualification.modelOrPackageHash.trim().toLowerCase()
        : null;
      const mismatch = !provenanceMatchesExpected(actual, expected) ||
        actual.outputObjectHash !== bytesHash ||
        actual.outputObjectKey !== expectedObjectKey ||
        qualificationHash !== expected.modelOrPackageHash;
      if (mismatch) {
        finalStatus = "withheld";
        withholdingReason = "package_hash_mismatch";
      } else {
        const sourceReason = captureHealthReason(input.captureHealth);
        if (sourceReason) {
          finalStatus = "withheld";
          withholdingReason = sourceReason;
        } else if (input.qualification.stream !== "eligible_package") {
          finalStatus = "withheld";
          withholdingReason = "provenance_incomplete";
        } else {
          finalStatus = "forecast";
          withholdingReason = null;
          verifiedProvenance = actual;
        }
      }
    }
  } else if (!validWithholdingReason(withholdingReason)) {
    throw new Error("A requested withholding requires an approved reason");
  }

  if (finalStatus === "withheld" && !validWithholdingReason(withholdingReason)) {
    throw new Error("OS-13A produced an unknown withholding reason");
  }
  if (
    withholdingReason === "no_eligible_package" &&
    input.qualification.stream !== "no_eligible_package"
  ) {
    throw new Error("no_eligible_package requires the no-package qualification stream");
  }
  if (
    finalStatus === "forecast" &&
    input.qualification.stream !== "eligible_package"
  ) {
    throw new Error("A forecast requires an eligible-package qualification stream");
  }
  if (finalStatus === "forecast") {
    if (!outputPublishedAt) orderingErrors.push("output_publication_time_missing");
    if (!outputVerifiedAt) orderingErrors.push("output_verification_time_missing");
    if (
      outputPublishedAt && Date.parse(outputPublishedAt) < Date.parse(generatedAt)
    ) {
      orderingErrors.push("output_publication_precedes_generation");
    }
    if (
      outputPublishedAt && outputVerifiedAt &&
      Date.parse(outputVerifiedAt) < Date.parse(outputPublishedAt)
    ) {
      orderingErrors.push("output_verification_precedes_publication");
    }
    if (
      outputVerifiedAt && Date.parse(persistenceRequestedAt) < Date.parse(outputVerifiedAt)
    ) {
      orderingErrors.push("persistence_request_precedes_output_verification");
    }
    if (orderingErrors.length > 0) {
      return {
        publishable: false,
        violations: [...new Set(orderingErrors)],
        record: null
      };
    }
  }

  const effectiveQualification: ForecastQualification =
    input.qualification.stream === "eligible_package" && DIGEST.test(
      input.qualification.modelOrPackageHash.trim().toLowerCase()
    )
      ? {
          stream: "eligible_package",
          modelOrPackageHash: input.qualification.modelOrPackageHash.trim().toLowerCase()
        }
      : { stream: "no_eligible_package" };
  const qualificationKey = forecastQualificationKey({
    activationBoundary,
    qualification: effectiveQualification
  });
  const recordId = forecastLedgerRecordId({
    originVersionId: origin.originVersionId,
    activationBoundary
  });
  const timing: ForecastLedgerTiming = late ? "late" : "timely";
  const unsigned = {
    contractVersion: forecastLedgerContractJson.version,
    contractHash: forecastLedgerContractHash,
    recordId,
    originVersionId: origin.originVersionId,
    logicalOriginId: origin.logicalOriginId,
    gameId: origin.gameId,
    horizonId: origin.horizonId,
    activationBoundary,
    activatedAt,
    evidenceScope: classifyForecastEvidenceScope({
      activatedAt,
      firstOriginUtc: input.activationFirstOriginUtc,
      weekOneOriginComplete: input.weekOneOriginComplete
    }),
    qualificationStream: effectiveQualification.stream,
    qualificationKey,
    status: finalStatus,
    withholdingReason,
    captureHealth: input.captureHealth,
    scheduledForUtc,
    invokedAt,
    evidenceAt,
    generatedAt,
    outputPublishedAt: finalStatus === "forecast" ? outputPublishedAt : null,
    outputVerifiedAt: finalStatus === "forecast" ? outputVerifiedAt : null,
    persistenceRequestedAt,
    persistedAt,
    persistenceDeadlineAt,
    kickoffUtc,
    timing,
    prospectiveEvidenceEligible: timing === "timely",
    forecastEvaluationEligible: finalStatus === "forecast" && timing === "timely",
    provenance: finalStatus === "forecast" ? verifiedProvenance : null,
    outputObjectKey: finalStatus === "forecast" ? verifiedProvenance?.outputObjectKey ?? null : null,
    outputObjectHash: finalStatus === "forecast" ? verifiedProvenance?.outputObjectHash ?? null : null
  };
  const record: ForecastLedgerRecord = {
    ...unsigned,
    recordHash: stableHash(unsigned)
  };
  return { publishable: true, violations: [], record };
}
