import schedulerContractJson from "../../../config/interim-scheduler-contract-2026.v5.json";
import cutoverContractJson from "../../../config/interim-scheduler-cutover-2026.v5.json";
import {
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

const REQUIRED_HORIZONS = [
  "weekly_tuesday_0730",
  "kickoff_minus_120",
  "kickoff_minus_90",
  "kickoff_minus_60",
  "kickoff_minus_15"
] as const satisfies readonly RequiredForecastHorizonId[];

const EXPECTED_DELAYS = new Map<RequiredForecastHorizonId, number>(
  engineOperatingContract.forecastHorizons.map((horizon) => [
    horizon.id as RequiredForecastHorizonId,
    horizon.maximumPersistenceDelaySeconds
  ])
);

const ALLOWED_LANES = ["dispatcher", "watchdog"] as const;
const RETAINED_LEGACY_TABLES = [
  "engine_activations",
  "forecast_origins",
  "forecast_origin_records",
  "engine_job_runs"
] as const;
const RETAINED_INTERIM_TABLES = [
  "engine_scheduler_ticks_v2",
  "engine_scheduler_events_v2",
  "engine_origin_jobs_v2",
  "engine_origin_attempts_v2",
  "engine_origin_records_v2"
] as const;
const CUTOVER_MANIFEST_FIELDS = [
  "scheduler_contract_version",
  "scheduler_contract_hash",
  "migration_version",
  "migration_hash",
  "activation_boundary",
  "exact_cutover_at",
  "last_completed_dispatcher_tick",
  "last_completed_watchdog_tick",
  "table_row_counts",
  "table_content_hashes",
  "outstanding_lease_inventory",
  "provider_dispatch_enabled"
] as const;
const PUBLICATION_TIMES = [
  "scheduled_trigger_at",
  "invoked_at",
  "evidence_at",
  "generated_at",
  "persistence_requested_at",
  "persisted_at",
  "persistence_deadline_at"
] as const;
const PUBLICATION_ORDERING = [
  "scheduled_trigger_at_lte_generated_at",
  "evidence_at_lte_generated_at",
  "generated_at_lte_persistence_requested_at",
  "persistence_requested_at_lte_database_persisted_at",
  "persisted_at_lt_persistence_deadline_at",
  "persisted_at_lte_kickoff_minus_1_second"
] as const;
const ACTIVATION_CURSOR_IDENTITY_FIELDS = [
  "operating_contract_hash",
  "research_contract_hash",
  "lifecycle_hash"
] as const;

export type InterimSchedulerLane = typeof ALLOWED_LANES[number];
export type InterimSchedulerJobType = "forecast_or_withholding";

export interface InterimSchedulerValidation {
  errors: string[];
  contractHash: string;
}

export interface CurrentOriginHead {
  originVersionId: string;
  logicalOriginId: string;
  gameId: string;
  horizonId: RequiredForecastHorizonId;
  scheduledForUtc: string | null;
  kickoffUtc: string | null;
  eligible: boolean;
  eligibilityReason: OriginEligibilityReason;
  activationBoundary: string;
  isCurrentHead: boolean;
  terminalRecordExists?: boolean;
}

export type OriginDueDisposition =
  | "pending"
  | "due"
  | "missed_inside_deadline"
  | "late_nonprospective"
  | "unresolved"
  | "ineligible"
  | "superseded"
  | "terminal";

export interface OriginDueClassification {
  disposition: OriginDueDisposition;
  terminalRecordRequired: boolean;
  prospective: boolean;
  withholdingReason: ForecastWithholdingReason | null;
  scheduledTriggerAt: string | null;
  persistenceDeadlineAt: string | null;
}

export type LeaseCoordinationState = "pending" | "running" | "terminal" | "invalidated";

export interface LeaseState {
  state: LeaseCoordinationState;
  fence: number;
  attemptTokenHash: string | null;
  leaseExpiresAt: string | null;
}

export interface LeaseAuthority {
  attemptTokenHash: string;
  fence: number;
}

export interface LeaseDecision {
  allowed: boolean;
  nextFence: number | null;
  reason: "claimable" | "active_lease" | "terminal" | "invalidated" | "invalid_state";
}

export interface PublicationTimes {
  scheduledTriggerAt: string;
  invokedAt: string;
  evidenceAt: string;
  generatedAt: string;
  persistedAt: string;
  persistenceDeadlineAt: string;
  kickoffAt: string;
}

export interface PublicationTimingResult {
  allowed: boolean;
  prospective: boolean;
  violations: string[];
}

function canonicalTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function timestampMilliseconds(value: string, label: string): number {
  return Date.parse(canonicalTimestamp(value, label));
}

function sameValues<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function horizonDelaySeconds(horizonId: RequiredForecastHorizonId): number {
  const delay = schedulerContractJson.horizons.find((horizon) => horizon.id === horizonId)
    ?.maximumPersistenceDelaySeconds;
  if (!Number.isFinite(delay) || delay === undefined || delay <= 0) {
    throw new Error(`Unsupported OS-15A horizon: ${horizonId}`);
  }
  return delay;
}

export const interimSchedulerContract = schedulerContractJson;
export const interimSchedulerContractHash = stableHash(schedulerContractJson);
export const interimSchedulerCutoverContract = cutoverContractJson;
export const interimSchedulerCutoverContractHash = stableHash(cutoverContractJson);
export const interimSchedulerHorizonIds = REQUIRED_HORIZONS;

/**
 * Rejects contract drift before any scheduler worker is allowed to use the
 * kernel. This intentionally validates the qualification-only prohibitions in
 * addition to numerical timing and identity rules.
 */
export function validateInterimSchedulerContract(): InterimSchedulerValidation {
  const contract = schedulerContractJson;
  const errors: string[] = [];
  const horizonIds = contract.horizons.map((horizon) => horizon.id);
  const lifecycleReasons = footballLifecycle2026.dataFailureAndWithholding.approvedWithholdingCodes;

  if (
    contract.version !== "interim-scheduler-contract.2026.5" ||
    contract.status !== "frozen_qualification" ||
    contract.effectiveSeason !== 2026 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(contract.frozenOn)
  ) {
    errors.push("OS-15A must use the frozen 2026 qualification envelope");
  }
  if (
    contract.scope.workPackage !== "OS-15A" ||
    !contract.scope.qualificationOnly ||
    contract.scope.providerDispatchEnabled ||
    contract.scope.captureActivationAllowed ||
    contract.scope.modelExecutionAllowed ||
    contract.scope.productionForecastMutationAllowed ||
    contract.scope.originSource !== "forecast_origin_versions_current_eligible_heads" ||
    contract.scope.legacyOriginSourceAllowed
  ) {
    errors.push("OS-15A scope must remain qualification-only and use only authoritative current origin heads");
  }
  if (
    contract.bindings.operatingContractVersion !== engineOperatingContract.version ||
    contract.bindings.operatingContractCanonicalSha256 !== engineOsContractHashes.operating ||
    contract.bindings.researchConstitutionVersion !== researchConstitution.version ||
    contract.bindings.researchConstitutionCanonicalSha256 !== engineOsContractHashes.research ||
    contract.bindings.lifecycleContractVersion !== footballLifecycle2026.version ||
    contract.bindings.lifecycleContractCanonicalSha256 !== engineOsContractHashes.lifecycle ||
    contract.bindings.originIdentityMigrationVersion !== "0015_engine_os_origin_identity"
  ) {
    errors.push("OS-15A bindings must match the accepted OS-00B, lifecycle, and OS-02A identities");
  }
  if (!sameValues(horizonIds, REQUIRED_HORIZONS)) {
    errors.push("OS-15A must consume exactly the five frozen horizons in their canonical order");
  }
  for (const horizon of contract.horizons) {
    const expected = EXPECTED_DELAYS.get(horizon.id as RequiredForecastHorizonId);
    if (expected === undefined || horizon.maximumPersistenceDelaySeconds !== expected) {
      errors.push(`OS-15A persistence cap drifted for ${horizon.id}`);
    }
  }
  if (
    contract.clock.timezone !== engineOperatingContract.clock.timezone ||
    contract.clock.forecastMustPrecedeKickoffSeconds !==
      engineOperatingContract.clock.forecastMustPrecedeKickoffSeconds ||
    contract.clock.dispatcherNominalIntervalSeconds !== 60 ||
    contract.clock.watchdogMaximumIntervalSeconds > 120 ||
    contract.clock.missedClaimAfterSeconds !== 60 ||
    contract.clock.scheduledTriggerMaySubstituteForInvocation ||
    contract.clock.scheduledTriggerMaySubstituteForEvidence ||
    contract.clock.scheduledTriggerMaySubstituteForPersistence
  ) {
    errors.push("OS-15A clock identities, cadence, and distinct evidence times must remain frozen");
  }
  if (
    contract.identity.tickKeyVersion !== "engine-os.scheduler-tick.v1" ||
    contract.identity.jobKeyVersion !== "engine-os.scheduler-job.v2" ||
    contract.identity.jobType !== "forecast_or_withholding" ||
    contract.identity.duplicateTriggerBehavior !== "converge_on_deterministic_tick_and_job_keys" ||
    contract.identity.terminalRecordMayBeReopened
  ) {
    errors.push("OS-15A deterministic identity or terminal idempotency rules changed");
  }
  if (
    contract.lease.durationSeconds !== 90 ||
    contract.lease.renewalEverySeconds !== 30 ||
    contract.lease.heartbeatEverySeconds !== 30 ||
    contract.lease.durationSeconds <= contract.lease.renewalEverySeconds ||
    !contract.lease.reclaimOnlyAfterLeaseExpiry ||
    !contract.lease.uniqueAttemptTokenRequired ||
    contract.lease.storedAttemptTokenRepresentation !== "sha256_only" ||
    !contract.lease.monotonicFenceRequired ||
    !contract.lease.renewalRequiresExactAttemptAndFence ||
    !contract.lease.publicationRequiresExactAttemptAndFence ||
    !contract.lease.publicationRequiresUnexpiredLease ||
    !contract.lease.renewalFailureRevokesPublicationAuthority
  ) {
    errors.push("OS-15A fenced renewable lease rules changed");
  }
  if (
    !contract.retry.sameDeterministicJobIdentity ||
    !contract.retry.newAttemptTokenRequired ||
    !contract.retry.strictlyGreaterFenceRequired ||
    contract.retry.terminalAttemptReplacementAllowed ||
    contract.retry.missedOriginProspectiveBackfillAllowed ||
    contract.retry.afterDeadlineBehavior !== "nonprospective_late_origin_excluded"
  ) {
    errors.push("OS-15A retry and no-backfill rules changed");
  }
  if (
    !contract.publication.currentEligibleHeadRecheckRequired ||
    !contract.publication.atomicTerminalInsertAndJobFinalizeRequired ||
    !sameValues(contract.publication.requiredSeparateTimes, PUBLICATION_TIMES) ||
    !sameValues(contract.publication.requiredOrdering, PUBLICATION_ORDERING) ||
    contract.publication.prospectiveDeadlineBoundary !== "strict_open_upper_bound" ||
    contract.publication.exactDeadlineBehavior !==
      "late_nonprospective_late_origin_excluded" ||
    contract.publication.persistenceClock !== "max_of_application_request_and_database_statement" ||
    contract.publication.qualificationForecastStatusAllowed ||
    contract.publication.qualificationTerminalStatus !== "withheld" ||
    contract.publication.qualificationWithholdingReason !== "no_eligible_package" ||
    !sameValues(contract.publication.approvedWithholdingReasons, lifecycleReasons)
  ) {
    errors.push("OS-15A publication must remain atomic, withholding-only, and lifecycle-bound");
  }
  if (
    contract.platformQueryBudget.profile !== "cloudflare_workers_free" ||
    contract.platformQueryBudget.d1QueriesPerInvocationLimit !== 50 ||
    !contract.platformQueryBudget.batchMembersCountIndividually ||
    contract.platformQueryBudget.qualificationHeadroomMinimumQueries < 4 ||
    contract.platformQueryBudget.originBatchMaximum < 16 ||
    contract.platformQueryBudget.originBatchMaximum > 32 ||
    !contract.platformQueryBudget.setBasedOriginClaimsRequired ||
    !contract.platformQueryBudget.setBasedTerminalPublicationRequired ||
    !contract.platformQueryBudget.aggregateMissedTickEvidenceRequired ||
    !contract.platformQueryBudget.aggregateUnresolvedEvidenceRequired ||
    !contract.platformQueryBudget.aggregateSupersededInvalidationRequired ||
    contract.platformQueryBudget.budgetOverflowBehavior !==
      "fail_closed_before_next_database_operation" ||
    !contract.platformQueryBudget.qualificationRequiresInstrumentedWorstCase
  ) {
    errors.push("OS-15A must remain within the documented Free-plan D1 invocation budget");
  }
  if (
    !contract.missedTick.independentWatchdogRequired ||
    contract.missedTick.insideDeadlineBehavior !== "claim_and_persist_timely_compute_failure_withholding" ||
    contract.missedTick.afterDeadlineBehavior !== "persist_nonprospective_late_origin_excluded_and_alert" ||
    contract.missedTick.fabricatedContemporaneousRecordAllowed ||
    !contract.missedTick.watchdogAlertsIdempotent ||
    !contract.missedTick.activationCursorRequired ||
    contract.missedTick.activationCursorSource !== "engine_activations" ||
    !sameValues(
      contract.missedTick.activationCursorIdentityFields,
      ACTIVATION_CURSOR_IDENTITY_FIELDS
    ) ||
    contract.missedTick.activationCursorFormula !==
      "first_dispatcher_slot_strictly_after_activated_at" ||
    contract.missedTick.missingActivationCursorBehavior !==
      "abort_without_advancing_checkpoint" ||
    contract.missedTick.recoveryBatchMaximumSlots !== 12 ||
    contract.missedTick.recoveryCursorEventType !== "watchdog_recovery_checkpoint" ||
    contract.missedTick.recoveryCursorPersistence !== "append_only_after_each_completed_batch" ||
    contract.missedTick.extendedOutageBehavior !==
      "resume_from_latest_audited_checkpoint_without_prospective_replay"
  ) {
    errors.push("OS-15A watchdog and missed-tick behavior changed");
  }
  if (
    !contract.scheduleRevision.selectCurrentHeadOnly ||
    contract.scheduleRevision.completedRecordReopenAllowed ||
    contract.scheduleRevision.laterKickoffAffectsElapsedOrigins ||
    contract.scheduleRevision.earlierKickoffMayGainEarlierOrigin ||
    contract.scheduleRevision.lateDiscoveredOriginBehavior !==
      "nonprospective_schedule_unavailable_at_origin" ||
    contract.scheduleRevision.unresolvedOriginBehavior !==
      "record_current_head_set_event_without_fabricated_trigger" ||
    contract.scheduleRevision.resolvedPastOriginBehavior !==
      "nonprospective_schedule_unavailable_at_origin" ||
    contract.scheduleRevision.allUnresolvedSchedulesMayActivate
  ) {
    errors.push("OS-15A schedule-revision and unresolved-origin rules changed");
  }
  if (
    contract.security.oddsSecretMayBeRead ||
    contract.security.providerConnectorDependencyAllowed ||
    contract.security.networkDispatchAllowed ||
    !contract.security.captureEnvironmentFlagRequiredForWorkerEntry ||
    contract.security.captureEnvironmentFlagName !== "ENGINE_OS_CAPTURE_ENABLED" ||
    contract.security.captureEnvironmentFlagQualifiedValue !== "true"
  ) {
    errors.push("OS-15A security boundary must keep provider dispatch and capture disabled");
  }
  if (
    !contract.cutover.nonexpiredLeasesBlockCutover ||
    contract.cutover.missedOriginsMayBeReplayed ||
    !contract.cutover.terminalRowsRetainedUnchanged ||
    !contract.cutover.onlyFuturePendingCurrentHeadsTransfer ||
    !contract.cutover.singlePublishingSchedulerRequired
  ) {
    errors.push("OS-15A cutover must block split-brain publication and replay");
  }
  const cutover = cutoverContractJson;
  if (
    schedulerContractJson.cutover.contractPath !==
      "config/interim-scheduler-cutover-2026.v5.json" ||
    cutover.version !== "interim-scheduler-cutover.2026.5" ||
    cutover.status !== "frozen_pre_cutover_contract" ||
    cutover.effectiveSeason !== 2026 ||
    cutover.sourceSchedulerContractVersion !== schedulerContractJson.version ||
    cutover.targetWorkPackage !== "OS-15" ||
    !sameValues(cutover.retainedLegacyTables, RETAINED_LEGACY_TABLES) ||
    !sameValues(cutover.retainedInterimTables, RETAINED_INTERIM_TABLES) ||
    cutover.deterministicKeyVersions.tick !== schedulerContractJson.identity.tickKeyVersion ||
    cutover.deterministicKeyVersions.job !== schedulerContractJson.identity.jobKeyVersion ||
    !sameValues(cutover.requiredManifestFields, CUTOVER_MANIFEST_FIELDS) ||
    cutover.leaseBoundary.nonexpiredLeaseBehavior !== "block_cutover" ||
    cutover.leaseBoundary.expiredLeaseBehavior !==
      "target_may_reclaim_with_strictly_greater_fence" ||
    cutover.leaseBoundary.priorAttemptPublicationAfterCutoverAllowed ||
    !cutover.recordBoundary.terminalRowsImportedUnchanged ||
    cutover.recordBoundary.terminalRowsReplayed ||
    cutover.recordBoundary.terminalRowsReopened ||
    !cutover.recordBoundary.onlyFuturePendingCurrentHeadsTransfer ||
    cutover.recordBoundary.elapsedOrMissedOriginsReplayed ||
    cutover.recordBoundary.elapsedOrMissedOriginsProspective ||
    !cutover.recordBoundary.activationBoundaryMustRemainIdentical ||
    cutover.recordBoundary.prospectiveDeadlineComparator !==
      "persisted_at_strictly_before_persistence_deadline_at" ||
    cutover.recordBoundary.exactDeadlineClassification !== "late_nonprospective" ||
    cutover.activationBoundary.qualificationCreatesProductionActivation ||
    !cutover.activationBoundary.captureMustRemainDisabledUntilSeparateApproval ||
    cutover.activationBoundary.twoPublishingSchedulersAllowed ||
    !cutover.activationBoundary.watchdogCursorMustExistBeforeEnable ||
    cutover.activationBoundary.watchdogCursorSource !== "engine_activations.activated_at" ||
    !sameValues(
      cutover.activationBoundary.watchdogCursorIdentityFields,
      ACTIVATION_CURSOR_IDENTITY_FIELDS
    ) ||
    cutover.activationBoundary.firstRecoverableDispatcherSlot !== "strictly_after_activated_at" ||
    cutover.activationBoundary.missingCursorBehavior !== "block_enable"
  ) {
    errors.push("OS-15A cutover contract drifted from retained-table, lease, activation, or no-replay rules");
  }

  return { errors, contractHash: interimSchedulerContractHash };
}

/** Deterministic nominal-tick identity. Actual invocation time is never part of the key. */
export function interimSchedulerTickKey(input: {
  lane: InterimSchedulerLane;
  nominalScheduledAt: string;
}): string {
  if (!ALLOWED_LANES.includes(input.lane)) throw new Error(`Unsupported scheduler lane: ${input.lane}`);
  return stableHash({
    contract: schedulerContractJson.identity.tickKeyVersion,
    schedulerContractHash: interimSchedulerContractHash,
    lane: input.lane,
    nominalScheduledAt: canonicalTimestamp(input.nominalScheduledAt, "Nominal scheduled time")
  });
}

/**
 * Deterministic work identity for one immutable current origin version. Retries
 * change attempt token and fence, never this job key.
 */
export function interimSchedulerJobKey(input: {
  originVersionId: string;
  activationBoundary: string;
  jobType?: InterimSchedulerJobType;
}): string {
  if (!input.originVersionId.trim() || !input.activationBoundary.trim()) {
    throw new Error("Scheduler job identity requires an origin version and activation boundary");
  }
  const jobType = input.jobType ?? "forecast_or_withholding";
  if (jobType !== schedulerContractJson.identity.jobType) {
    throw new Error(`Unsupported scheduler job type: ${jobType}`);
  }
  return stableHash({
    contract: schedulerContractJson.identity.jobKeyVersion,
    schedulerContractHash: interimSchedulerContractHash,
    jobType,
    originVersionId: input.originVersionId,
    activationBoundary: input.activationBoundary
  });
}

export function schedulerAttemptTokenHash(token: string): string {
  if (!token.trim()) throw new Error("Attempt token must not be empty");
  return sha256Hex(token);
}

/** Effective window is capped by both the horizon SLA and kickoff minus one second. */
export function originPersistenceDeadline(input: {
  horizonId: RequiredForecastHorizonId;
  scheduledTriggerAt: string;
  kickoffAt: string;
}): string {
  const scheduled = timestampMilliseconds(input.scheduledTriggerAt, "Scheduled trigger");
  const kickoff = timestampMilliseconds(input.kickoffAt, "Kickoff");
  const horizonCap = scheduled + horizonDelaySeconds(input.horizonId) * 1_000;
  const preKickoffCap = kickoff - schedulerContractJson.clock.forecastMustPrecedeKickoffSeconds * 1_000;
  return new Date(Math.min(horizonCap, preKickoffCap)).toISOString();
}

export function leaseExpiryForClaim(input: {
  claimedAt: string;
  persistenceDeadlineAt: string;
  prospective?: boolean;
}): string {
  const claimedAt = timestampMilliseconds(input.claimedAt, "Lease claim");
  const deadline = timestampMilliseconds(input.persistenceDeadlineAt, "Persistence deadline");
  const ordinaryExpiry = claimedAt + schedulerContractJson.lease.durationSeconds * 1_000;
  // Once the prospective window is gone, an operational late closure still
  // needs a live fenced lease. Clamping that lease to an elapsed deadline
  // would make honest `late_origin_excluded` evidence impossible to store.
  return new Date(input.prospective === false ? ordinaryExpiry : Math.min(ordinaryExpiry, deadline)).toISOString();
}

function lateReasonForIneligibleOrigin(reason: OriginEligibilityReason): ForecastWithholdingReason | null {
  if (reason === "known_after_origin") return "schedule_unavailable_at_origin";
  if (
    reason === "prior_origin_elapsed" ||
    reason === "earlier_origin_prohibited" ||
    reason === "after_kickoff" ||
    reason === "pre_activation"
  ) return "late_origin_excluded";
  return null;
}

/**
 * Pure current-head reconciliation. `now` is an observation, not a replacement
 * for scheduled time, evidence time, or persistence time.
 */
export function classifyCurrentOriginHead(
  origin: CurrentOriginHead,
  now: string
): OriginDueClassification {
  const observedAt = timestampMilliseconds(now, "Scheduler observation");
  const base = {
    scheduledTriggerAt: origin.scheduledForUtc
      ? canonicalTimestamp(origin.scheduledForUtc, "Scheduled trigger")
      : null,
    persistenceDeadlineAt: null
  };
  if (!origin.isCurrentHead) {
    return {
      ...base,
      disposition: "superseded",
      terminalRecordRequired: false,
      prospective: false,
      withholdingReason: null
    };
  }
  if (origin.terminalRecordExists) {
    return {
      ...base,
      disposition: "terminal",
      terminalRecordRequired: false,
      prospective: false,
      withholdingReason: null
    };
  }
  if (!origin.scheduledForUtc || !origin.kickoffUtc || origin.eligibilityReason === "schedule_unresolved") {
    return {
      ...base,
      disposition: "unresolved",
      terminalRecordRequired: false,
      prospective: false,
      withholdingReason: null
    };
  }
  const scheduled = timestampMilliseconds(origin.scheduledForUtc, "Scheduled trigger");
  const persistenceDeadlineAt = originPersistenceDeadline({
    horizonId: origin.horizonId,
    scheduledTriggerAt: origin.scheduledForUtc,
    kickoffAt: origin.kickoffUtc
  });
  // A ratcheted reschedule can be permanently ineligible even while its new
  // trigger remains in the future. It is not due until that immutable instant.
  if (observedAt < scheduled) {
    return {
      ...base,
      persistenceDeadlineAt,
      disposition: "pending",
      terminalRecordRequired: false,
      prospective: false,
      withholdingReason: null
    };
  }
  if (!origin.eligible || origin.eligibilityReason !== "eligible") {
    const withholdingReason = lateReasonForIneligibleOrigin(origin.eligibilityReason);
    return {
      ...base,
      persistenceDeadlineAt,
      disposition: withholdingReason ? "late_nonprospective" : "ineligible",
      terminalRecordRequired: withholdingReason !== null,
      prospective: false,
      withholdingReason
    };
  }
  const deadline = Date.parse(persistenceDeadlineAt);
  // A new prospective lease cannot be alive at the exact deadline because
  // publication requires a strictly unexpired lease. Close that boundary as
  // nonprospective instead of leaving the origin open for another tick.
  if (observedAt >= deadline) {
    return {
      ...base,
      persistenceDeadlineAt,
      disposition: "late_nonprospective",
      terminalRecordRequired: true,
      prospective: false,
      withholdingReason: "late_origin_excluded"
    };
  }
  if (observedAt >= scheduled + schedulerContractJson.clock.missedClaimAfterSeconds * 1_000) {
    return {
      ...base,
      persistenceDeadlineAt,
      disposition: "missed_inside_deadline",
      terminalRecordRequired: true,
      prospective: true,
      withholdingReason: "compute_failure"
    };
  }
  return {
    ...base,
    persistenceDeadlineAt,
    disposition: "due",
    terminalRecordRequired: true,
    prospective: true,
    withholdingReason: "no_eligible_package"
  };
}

/** A pending job or an expired running attempt may be claimed; terminal rows never reopen. */
export function decideLeaseClaim(state: LeaseState, now: string): LeaseDecision {
  const nowMs = timestampMilliseconds(now, "Lease claim observation");
  if (!Number.isInteger(state.fence) || state.fence < 0) {
    return { allowed: false, nextFence: null, reason: "invalid_state" };
  }
  if (state.state === "terminal") return { allowed: false, nextFence: null, reason: "terminal" };
  if (state.state === "invalidated") return { allowed: false, nextFence: null, reason: "invalidated" };
  if (state.state === "pending") {
    return { allowed: true, nextFence: state.fence + 1, reason: "claimable" };
  }
  if (!state.leaseExpiresAt || !state.attemptTokenHash) {
    return { allowed: false, nextFence: null, reason: "invalid_state" };
  }
  const expiresAt = timestampMilliseconds(state.leaseExpiresAt, "Lease expiry");
  if (nowMs < expiresAt) return { allowed: false, nextFence: null, reason: "active_lease" };
  return { allowed: true, nextFence: state.fence + 1, reason: "claimable" };
}

function exactLeaseAuthority(state: LeaseState, authority: LeaseAuthority): boolean {
  return state.state === "running" &&
    state.attemptTokenHash === authority.attemptTokenHash &&
    state.fence === authority.fence;
}

export function mayRenewLease(input: {
  state: LeaseState;
  authority: LeaseAuthority;
  now: string;
  persistenceDeadlineAt: string;
}): boolean {
  if (!exactLeaseAuthority(input.state, input.authority) || !input.state.leaseExpiresAt) return false;
  const now = timestampMilliseconds(input.now, "Lease renewal");
  const expiresAt = timestampMilliseconds(input.state.leaseExpiresAt, "Lease expiry");
  const deadline = timestampMilliseconds(input.persistenceDeadlineAt, "Persistence deadline");
  return now < expiresAt && now < deadline;
}

export function evaluatePublicationTiming(times: PublicationTimes): PublicationTimingResult {
  const scheduled = timestampMilliseconds(times.scheduledTriggerAt, "Scheduled trigger");
  const invoked = timestampMilliseconds(times.invokedAt, "Invocation");
  const evidence = timestampMilliseconds(times.evidenceAt, "Evidence");
  const generated = timestampMilliseconds(times.generatedAt, "Generation");
  const persisted = timestampMilliseconds(times.persistedAt, "Persistence");
  const deadline = timestampMilliseconds(times.persistenceDeadlineAt, "Persistence deadline");
  const kickoff = timestampMilliseconds(times.kickoffAt, "Kickoff");
  const violations: string[] = [];

  if (scheduled > invoked) violations.push("invocation_precedes_scheduled_trigger");
  if (scheduled > generated) violations.push("generation_precedes_scheduled_trigger");
  if (evidence > generated) violations.push("evidence_postdates_generation");
  if (generated > persisted) violations.push("generation_postdates_persistence");
  if (persisted >= deadline) violations.push("persistence_missed_deadline");
  if (persisted > kickoff - schedulerContractJson.clock.forecastMustPrecedeKickoffSeconds * 1_000) {
    violations.push("persistence_not_before_kickoff");
  }
  return {
    allowed: violations.length === 0,
    prospective: violations.length === 0,
    violations
  };
}

/**
 * Stale workers lose authority when their attempt token, fence, lease, current
 * head, or timing proof fails. The DB publication guard must enforce the same
 * predicates atomically.
 */
export function mayPublishTerminalRecord(input: {
  state: LeaseState;
  authority: LeaseAuthority;
  isCurrentEligibleHead: boolean;
  times: PublicationTimes;
}): PublicationTimingResult {
  const timing = evaluatePublicationTiming(input.times);
  const violations = [...timing.violations];
  if (!exactLeaseAuthority(input.state, input.authority)) violations.push("lease_authority_lost");
  if (!input.state.leaseExpiresAt ||
    timestampMilliseconds(input.times.persistedAt, "Persistence") >=
      timestampMilliseconds(input.state.leaseExpiresAt, "Lease expiry")) {
    violations.push("lease_expired_before_publication");
  }
  if (!input.isCurrentEligibleHead) violations.push("origin_is_not_current_eligible_head");
  return {
    allowed: violations.length === 0,
    prospective: violations.length === 0,
    violations: [...new Set(violations)]
  };
}
