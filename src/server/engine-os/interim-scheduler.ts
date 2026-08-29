import type {
  ForecastWithholdingReason,
  OriginEligibilityReason,
  RequiredForecastHorizonId
} from "@/domain/engine-os";
import { stableHash } from "@/domain/hash";
import { engineOsContractHashes } from "@/domain/engine-os-contracts";
import {
  classifyCurrentOriginHead,
  interimSchedulerContract,
  interimSchedulerContractHash,
  interimSchedulerHorizonIds,
  interimSchedulerJobKey,
  interimSchedulerTickKey,
  leaseExpiryForClaim,
  originPersistenceDeadline,
  schedulerAttemptTokenHash,
  validateInterimSchedulerContract,
  type CurrentOriginHead,
  type InterimSchedulerLane,
  type OriginDueClassification
} from "./interim-scheduler-kernel";

type CaptureHealth = "current" | "stale" | "partial" | "unavailable";

interface OriginHeadRow {
  origin_version_id: string;
  logical_origin_id: string;
  game_id: string;
  horizon_id: RequiredForecastHorizonId;
  scheduled_for_utc: string | null;
  eligible: number;
  eligibility_reason: OriginEligibilityReason;
  activation_boundary: string;
  kickoff_utc: string | null;
  terminal_record_id: string | null;
}

interface TickRow {
  tick_key: string;
  state: "running" | "completed" | "failed";
  attempt_token_hash: string | null;
  fence_token: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  completed_at: string | null;
}

interface JobRow {
  job_key: string;
  origin_version_id: string;
  scheduled_trigger_at: string;
  kickoff_at: string;
  persistence_deadline_at: string;
  activation_boundary: string;
  state: "pending" | "running" | "completed" | "invalidated";
  fence_token: number;
  active_attempt_token_hash: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  completed_at: string | null;
}

interface TickLease {
  tickKey: string;
  attemptTokenHash: string;
  fence: number;
  owner: string;
  reclaimed: boolean;
}

export interface InterimSchedulerJobLease {
  job: JobRow;
  attemptTokenHash: string;
  fence: number;
  owner: string;
  invokedAt: string;
  reclaimed: boolean;
}

export interface InterimSchedulerInvocationResult {
  lane: InterimSchedulerLane;
  tickKey: string;
  status: "completed" | "duplicate_or_active";
  nominalScheduledAt: string;
  invokedAt: string;
  dueOrigins: number;
  timelyWithholdings: number;
  lateClosures: number;
  unresolvedOrigins: number;
  invalidatedJobs: number;
  missedTicks: number;
  d1QueriesUsed: number;
  providerDispatches: 0;
}

export interface SchedulerClock {
  (): Date;
}

export interface RunInterimSchedulerInput {
  db: D1Database;
  lane: InterimSchedulerLane;
  nominalScheduledAt: Date;
  clock?: SchedulerClock;
  tokenFactory?: () => string;
  owner?: string;
}

interface SchedulerEventInput {
  db: D1Database;
  eventType:
    | "tick_claimed"
    | "tick_reclaimed"
    | "tick_renewed"
    | "tick_completed"
    | "tick_failed"
    | "job_claimed"
    | "job_reclaimed"
    | "job_renewed"
    | "job_completed"
    | "job_invalidated"
    | "missed_tick_detected"
    | "watchdog_recovery_checkpoint"
    | "schedule_unresolved_observed"
    | "operational_alert";
  tickKey?: string;
  jobKey?: string;
  originVersionId?: string;
  attemptTokenHash?: string;
  fence?: number;
  occurredAt: string;
  evidenceAt: string;
  persistedAt: string;
  payload: Record<string, unknown>;
  idempotencyParts: Record<string, unknown>;
}

interface D1InvocationBudget {
  db: D1Database;
  used(): number;
  assertOperationalCapacity(count: number): void;
  enterCleanup(): void;
}

function budgetedD1(rawDb: D1Database): D1InvocationBudget {
  const limit = interimSchedulerContract.platformQueryBudget.d1QueriesPerInvocationLimit;
  const operationalLimit = limit -
    interimSchedulerContract.platformQueryBudget.qualificationHeadroomMinimumQueries;
  let queries = 0;
  let cleanup = false;
  const originals = new WeakMap<object, D1PreparedStatement>();
  const consume = (count: number): void => {
    const activeLimit = cleanup ? limit : operationalLimit;
    if (queries + count > activeLimit) {
      throw new Error(`OS-15A D1 query budget exhausted before operation ${queries + 1}`);
    }
    queries += count;
  };
  const wrapStatement = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = new Proxy(statement as object, {
      get(target, property) {
        if (property === "bind") {
          return (...values: unknown[]) => wrapStatement(
            (target as D1PreparedStatement).bind(...values)
          );
        }
        if (property === "run" || property === "all" || property === "first" || property === "raw") {
          return (...args: unknown[]) => {
            consume(1);
            const method = Reflect.get(target, property) as (...callArgs: unknown[]) => unknown;
            return method.apply(target, args);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as D1PreparedStatement;
    originals.set(wrapped as object, statement);
    return wrapped;
  };
  const db = new Proxy(rawDb as object, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => wrapStatement((target as D1Database).prepare(query));
      }
      if (property === "batch") {
        return (statements: D1PreparedStatement[]) => {
          consume(statements.length);
          return (target as D1Database).batch(statements.map((statement) =>
            originals.get(statement as object) ?? statement
          ));
        };
      }
      if (property === "exec") {
        return (...args: unknown[]) => {
          consume(1);
          return ((target as D1Database).exec as (...callArgs: unknown[]) => unknown)(...args);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  }) as D1Database;
  return {
    db,
    used: () => queries,
    assertOperationalCapacity: (count) => {
      if (queries + count > operationalLimit) {
        throw new Error(`OS-15A D1 query budget cannot admit ${count} additional operations`);
      }
    },
    enterCleanup: () => { cleanup = true; }
  };
}

const APPROVED_REASONS = new Set<ForecastWithholdingReason>(
  interimSchedulerContract.publication.approvedWithholdingReasons as ForecastWithholdingReason[]
);

function iso(value: Date | string, label: string): string {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function leaseDurationExpiry(at: string): string {
  return new Date(Date.parse(at) + interimSchedulerContract.lease.durationSeconds * 1_000).toISOString();
}

function changed(result: D1Result<unknown>): boolean {
  return Number(result.meta?.changes ?? 0) > 0;
}

function token(factory: () => string): { raw: string; hash: string } {
  const raw = factory();
  return { raw, hash: schedulerAttemptTokenHash(raw) };
}

function defaultToken(): string {
  return crypto.randomUUID();
}

function currentHead(row: OriginHeadRow): CurrentOriginHead {
  return {
    originVersionId: row.origin_version_id,
    logicalOriginId: row.logical_origin_id,
    gameId: row.game_id,
    horizonId: row.horizon_id,
    scheduledForUtc: row.scheduled_for_utc,
    kickoffUtc: row.kickoff_utc,
    eligible: row.eligible === 1,
    eligibilityReason: row.eligibility_reason,
    activationBoundary: row.activation_boundary,
    isCurrentHead: true,
    terminalRecordExists: row.terminal_record_id !== null
  };
}

function captureHealthFor(reason: ForecastWithholdingReason): CaptureHealth {
  if (reason === "required_source_stale") return "stale";
  if (reason === "required_source_partial") return "partial";
  return "unavailable";
}

async function appendSchedulerEvent(input: SchedulerEventInput): Promise<boolean> {
  if ((input.tickKey === undefined) === (input.jobKey === undefined)) {
    throw new Error("Scheduler events require exactly one tick or job subject");
  }
  const eventId = stableHash({
    contract: "engine-os.scheduler-event.v2",
    schedulerContractHash: interimSchedulerContractHash,
    eventType: input.eventType,
    ...input.idempotencyParts
  });
  const result = await input.db.prepare(`INSERT OR IGNORE INTO engine_scheduler_events_v2 (
    event_id, event_type, tick_key, job_key, origin_version_id, attempt_token_hash,
    fence_token, occurred_at, evidence_at, persisted_at, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      eventId,
      input.eventType,
      input.tickKey ?? null,
      input.jobKey ?? null,
      input.originVersionId ?? null,
      input.attemptTokenHash ?? null,
      input.fence ?? null,
      input.occurredAt,
      input.evidenceAt,
      input.persistedAt,
      JSON.stringify(input.payload)
    )
    .run();
  return changed(result);
}

async function appendSystemAlert(input: {
  db: D1Database;
  alertType: string;
  deduplicationKey: string;
  severity: "warning" | "error" | "critical";
  createdAt: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const alertId = stableHash({
    contract: "engine-os.scheduler-alert.v2",
    alertType: input.alertType,
    deduplicationKey: input.deduplicationKey
  });
  const result = await input.db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
    alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
  ) VALUES (?, ?, ?, ?, 'open', ?, ?)`)
    .bind(
      alertId,
      input.alertType,
      input.deduplicationKey,
      input.severity,
      input.createdAt,
      JSON.stringify(input.payload)
    )
    .run();
  return changed(result);
}

export async function claimInterimSchedulerTick(input: {
  db: D1Database;
  lane: InterimSchedulerLane;
  nominalScheduledAt: string;
  invokedAt: string;
  tokenFactory: () => string;
  owner: string;
}): Promise<TickLease | null> {
  const tickKey = interimSchedulerTickKey({
    lane: input.lane,
    nominalScheduledAt: input.nominalScheduledAt
  });
  const attempt = token(input.tokenFactory);
  const expiresAt = leaseDurationExpiry(input.invokedAt);
  const inserted = await input.db.prepare(`INSERT OR IGNORE INTO engine_scheduler_ticks_v2 (
    tick_key, scheduler_contract_version, scheduler_contract_hash, tick_key_version, lane,
    nominal_scheduled_at, invoked_at, evidence_at, persisted_at, state,
    attempt_token_hash, fence_token, lease_owner, lease_acquired_at, lease_expires_at,
    heartbeat_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, 1, ?, ?, ?, ?)`)
    .bind(
      tickKey,
      interimSchedulerContract.version,
      interimSchedulerContractHash,
      interimSchedulerContract.identity.tickKeyVersion,
      input.lane,
      input.nominalScheduledAt,
      input.invokedAt,
      input.invokedAt,
      input.invokedAt,
      attempt.hash,
      input.owner,
      input.invokedAt,
      expiresAt,
      input.invokedAt
    )
    .run();
  let reclaimed = false;
  if (!changed(inserted)) {
    const takeover = await input.db.prepare(`UPDATE engine_scheduler_ticks_v2 SET
      attempt_token_hash = ?, fence_token = fence_token + 1, lease_owner = ?,
      lease_acquired_at = ?, lease_expires_at = ?, heartbeat_at = ?
      WHERE tick_key = ? AND state = 'running'
        AND julianday(lease_expires_at) <= julianday(?)`)
      .bind(
        attempt.hash,
        input.owner,
        input.invokedAt,
        expiresAt,
        input.invokedAt,
        tickKey,
        input.invokedAt
      )
      .run();
    reclaimed = changed(takeover);
  }
  const row = await input.db.prepare(`SELECT tick_key, state, attempt_token_hash, fence_token,
    lease_owner, lease_expires_at, heartbeat_at, completed_at
    FROM engine_scheduler_ticks_v2 WHERE tick_key = ?`)
    .bind(tickKey)
    .first<TickRow>();
  if (!row || row.state !== "running" || row.attempt_token_hash !== attempt.hash || row.lease_owner !== input.owner) {
    return null;
  }
  const persistedAt = input.invokedAt;
  await appendSchedulerEvent({
    db: input.db,
    eventType: reclaimed ? "tick_reclaimed" : "tick_claimed",
    tickKey,
    attemptTokenHash: attempt.hash,
    fence: row.fence_token,
    occurredAt: input.invokedAt,
    evidenceAt: input.invokedAt,
    persistedAt,
    payload: { lane: input.lane, nominalScheduledAt: input.nominalScheduledAt },
    idempotencyParts: { tickKey, fence: row.fence_token, event: reclaimed ? "reclaimed" : "claimed" }
  });
  return {
    tickKey,
    attemptTokenHash: attempt.hash,
    fence: row.fence_token,
    owner: input.owner,
    reclaimed
  };
}

export async function renewInterimSchedulerTick(input: {
  db: D1Database;
  lease: TickLease;
  renewedAt: Date;
}): Promise<boolean> {
  const renewedAt = input.renewedAt.toISOString();
  const expiresAt = leaseDurationExpiry(renewedAt);
  const result = await input.db.prepare(`UPDATE engine_scheduler_ticks_v2 SET
    heartbeat_at = ?, lease_expires_at = ?
    WHERE tick_key = ? AND state = 'running' AND attempt_token_hash = ?
      AND fence_token = ? AND lease_owner = ?
      AND julianday(heartbeat_at) < julianday(?)
      AND julianday(?) < julianday(lease_expires_at)
      AND julianday(lease_expires_at) < julianday(?)`)
    .bind(
      renewedAt,
      expiresAt,
      input.lease.tickKey,
      input.lease.attemptTokenHash,
      input.lease.fence,
      input.lease.owner,
      renewedAt,
      renewedAt,
      expiresAt
    )
    .run();
  if (!changed(result)) return false;
  await appendSchedulerEvent({
    db: input.db,
    eventType: "tick_renewed",
    tickKey: input.lease.tickKey,
    attemptTokenHash: input.lease.attemptTokenHash,
    fence: input.lease.fence,
    occurredAt: renewedAt,
    evidenceAt: renewedAt,
    persistedAt: renewedAt,
    payload: { leaseExpiresAt: expiresAt },
    idempotencyParts: { tickKey: input.lease.tickKey, fence: input.lease.fence, renewedAt }
  });
  return true;
}

async function finishTick(input: {
  db: D1Database;
  lease: TickLease;
  completedAt: string;
  failureCode?: string;
}): Promise<boolean> {
  const state = input.failureCode ? "failed" : "completed";
  const result = await input.db.prepare(`UPDATE engine_scheduler_ticks_v2 SET
    state = ?, attempt_token_hash = NULL, lease_owner = NULL, lease_acquired_at = NULL,
    lease_expires_at = NULL, completed_at = ?, failure_code = ?
    WHERE tick_key = ? AND state = 'running' AND attempt_token_hash = ?
      AND fence_token = ? AND lease_owner = ?
      AND julianday(?) < julianday(lease_expires_at)`)
    .bind(
      state,
      input.completedAt,
      input.failureCode ?? null,
      input.lease.tickKey,
      input.lease.attemptTokenHash,
      input.lease.fence,
      input.lease.owner,
      input.completedAt
    )
    .run();
  if (!changed(result)) return false;
  await appendSchedulerEvent({
    db: input.db,
    eventType: input.failureCode ? "tick_failed" : "tick_completed",
    tickKey: input.lease.tickKey,
    attemptTokenHash: input.lease.attemptTokenHash,
    fence: input.lease.fence,
    occurredAt: input.completedAt,
    evidenceAt: input.completedAt,
    persistedAt: input.completedAt,
    payload: { failureCode: input.failureCode ?? null },
    idempotencyParts: {
      tickKey: input.lease.tickKey,
      fence: input.lease.fence,
      terminalState: state
    }
  });
  return true;
}

async function loadCurrentHeads(db: D1Database): Promise<OriginHeadRow[]> {
  const placeholders = interimSchedulerHorizonIds.map(() => "?").join(", ");
  const result = await db.prepare(`SELECT
    origin.origin_version_id, origin.logical_origin_id, origin.game_id, origin.horizon_id,
    origin.scheduled_for_utc, origin.eligible, origin.eligibility_reason,
    origin.activation_boundary, schedule.kickoff_utc,
    record.record_id AS terminal_record_id
  FROM forecast_origin_versions origin
  JOIN game_schedule_revisions schedule
    ON schedule.revision_id = origin.kickoff_revision_id AND schedule.game_id = origin.game_id
  JOIN canonical_games game
    ON game.game_id = origin.game_id AND game.season = 2026 AND game.season_type = 'REG'
  LEFT JOIN engine_origin_records_v2 record
    ON record.origin_version_id = origin.origin_version_id
  WHERE origin.horizon_id IN (${placeholders})
    AND NOT EXISTS (
      SELECT 1 FROM forecast_origin_versions child
      WHERE child.supersedes_origin_version_id = origin.origin_version_id
    )
  ORDER BY origin.scheduled_for_utc, origin.game_id, origin.horizon_id`)
    .bind(...interimSchedulerHorizonIds)
    .all<OriginHeadRow>();
  return result.results;
}

async function invalidateSupersededJobs(input: {
  db: D1Database;
  tickKey: string;
  at: string;
}): Promise<number> {
  const result = await input.db.prepare(`UPDATE engine_origin_jobs_v2 SET
    state = 'invalidated', active_attempt_token_hash = NULL, lease_owner = NULL,
    lease_acquired_at = NULL, lease_expires_at = NULL,
    heartbeat_at = coalesce(heartbeat_at, ?), completed_at = ?
  WHERE state IN ('pending', 'running')
    AND EXISTS (
      SELECT 1 FROM forecast_origin_versions child
      WHERE child.supersedes_origin_version_id = engine_origin_jobs_v2.origin_version_id
    )
  RETURNING job_key, origin_version_id, fence_token`)
    .bind(input.at, input.at)
    .all<{
      job_key: string;
      origin_version_id: string;
      fence_token: number;
    }>();
  if (result.results.length > 0) {
    const invalidated = result.results
      .map(({ job_key, origin_version_id, fence_token }) => ({
        jobKey: job_key,
        originVersionId: origin_version_id,
        fence: fence_token
      }))
      .sort((left, right) => left.jobKey.localeCompare(right.jobKey));
    await appendSchedulerEvent({
      db: input.db,
      eventType: "job_invalidated",
      tickKey: input.tickKey,
      occurredAt: input.at,
      evidenceAt: input.at,
      persistedAt: input.at,
      payload: { reason: "origin_superseded", invalidated },
      idempotencyParts: { invalidatedSetHash: stableHash(invalidated) }
    });
  }
  return result.results.length;
}

export async function claimInterimSchedulerJob(input: {
  db: D1Database;
  job: JobRow;
  prospective: boolean;
  invokedAt: Date;
  tokenFactory?: () => string;
  owner: string;
}): Promise<InterimSchedulerJobLease | null> {
  const invokedAt = input.invokedAt.toISOString();
  const attempt = token(input.tokenFactory ?? defaultToken);
  const expiresAt = leaseExpiryForClaim({
    claimedAt: invokedAt,
    persistenceDeadlineAt: input.job.persistence_deadline_at,
    prospective: input.prospective
  });
  if (Date.parse(expiresAt) <= Date.parse(invokedAt)) return null;
  const previousFence = input.job.fence_token;
  const result = await input.db.prepare(`UPDATE engine_origin_jobs_v2 SET
    state = 'running', fence_token = fence_token + 1, active_attempt_token_hash = ?,
    lease_owner = ?, lease_acquired_at = ?, lease_expires_at = ?, heartbeat_at = ?
    WHERE job_key = ? AND state IN ('pending', 'running')
      AND (state = 'pending' OR julianday(lease_expires_at) <= julianday(?))
      AND NOT EXISTS (
        SELECT 1 FROM engine_origin_records_v2 record WHERE record.job_key = ?
      )
      AND NOT EXISTS (
        SELECT 1 FROM forecast_origin_versions child
        WHERE child.supersedes_origin_version_id = engine_origin_jobs_v2.origin_version_id
      )`)
    .bind(
      attempt.hash,
      input.owner,
      invokedAt,
      expiresAt,
      invokedAt,
      input.job.job_key,
      invokedAt,
      input.job.job_key
    )
    .run();
  if (!changed(result)) return null;
  const job = await input.db.prepare(`SELECT job_key, origin_version_id, scheduled_trigger_at,
    kickoff_at, persistence_deadline_at, activation_boundary, state, fence_token,
    active_attempt_token_hash, lease_owner, lease_expires_at, heartbeat_at, completed_at
    FROM engine_origin_jobs_v2 WHERE job_key = ?`)
    .bind(input.job.job_key)
    .first<JobRow>();
  if (!job || job.state !== "running" || job.active_attempt_token_hash !== attempt.hash ||
    job.lease_owner !== input.owner) return null;
  const reclaimed = previousFence > 0;
  await appendSchedulerEvent({
    db: input.db,
    eventType: reclaimed ? "job_reclaimed" : "job_claimed",
    jobKey: job.job_key,
    originVersionId: job.origin_version_id,
    attemptTokenHash: attempt.hash,
    fence: job.fence_token,
    occurredAt: invokedAt,
    evidenceAt: invokedAt,
    persistedAt: invokedAt,
    payload: { prospective: input.prospective, leaseExpiresAt: expiresAt },
    idempotencyParts: { jobKey: job.job_key, fence: job.fence_token, event: "claimed" }
  });
  return {
    job,
    attemptTokenHash: attempt.hash,
    fence: job.fence_token,
    owner: input.owner,
    invokedAt,
    reclaimed
  };
}

export async function renewInterimSchedulerJob(input: {
  db: D1Database;
  lease: InterimSchedulerJobLease;
  renewedAt: Date;
  prospective: boolean;
}): Promise<boolean> {
  const renewedAt = input.renewedAt.toISOString();
  const expiresAt = leaseExpiryForClaim({
    claimedAt: renewedAt,
    persistenceDeadlineAt: input.lease.job.persistence_deadline_at,
    prospective: input.prospective
  });
  const result = await input.db.prepare(`UPDATE engine_origin_jobs_v2 SET
    heartbeat_at = ?, lease_expires_at = ?
    WHERE job_key = ? AND state = 'running' AND active_attempt_token_hash = ?
      AND fence_token = ? AND lease_owner = ?
      AND julianday(heartbeat_at) < julianday(?)
      AND julianday(?) < julianday(lease_expires_at)
      AND julianday(lease_expires_at) < julianday(?)`)
    .bind(
      renewedAt,
      expiresAt,
      input.lease.job.job_key,
      input.lease.attemptTokenHash,
      input.lease.fence,
      input.lease.owner,
      renewedAt,
      renewedAt,
      expiresAt
    )
    .run();
  if (!changed(result)) return false;
  await appendSchedulerEvent({
    db: input.db,
    eventType: "job_renewed",
    jobKey: input.lease.job.job_key,
    originVersionId: input.lease.job.origin_version_id,
    attemptTokenHash: input.lease.attemptTokenHash,
    fence: input.lease.fence,
    occurredAt: renewedAt,
    evidenceAt: renewedAt,
    persistedAt: renewedAt,
    payload: { leaseExpiresAt: expiresAt },
    idempotencyParts: { jobKey: input.lease.job.job_key, fence: input.lease.fence, renewedAt }
  });
  return true;
}

export async function publishInterimSchedulerWithholding(input: {
  db: D1Database;
  lease: InterimSchedulerJobLease;
  reason: ForecastWithholdingReason;
  prospective: boolean;
  evidenceAt: Date;
  generatedAt: Date;
  persistedAt: Date;
}): Promise<{ recordId: string; duplicate: boolean }> {
  if (!APPROVED_REASONS.has(input.reason)) {
    throw new Error(`Unapproved OS-15A withholding reason: ${input.reason}`);
  }
  if (input.prospective &&
    (input.reason === "late_origin_excluded" || input.reason === "schedule_unavailable_at_origin")) {
    throw new Error(`${input.reason} cannot be recorded as prospective`);
  }
  if (!input.prospective &&
    input.reason !== "late_origin_excluded" && input.reason !== "schedule_unavailable_at_origin") {
    throw new Error(`${input.reason} requires a timely prospective scheduler window`);
  }
  const evidenceAt = input.evidenceAt.toISOString();
  const generatedAt = input.generatedAt.toISOString();
  const persistedAt = input.persistedAt.toISOString();
  const recordId = stableHash({
    contract: "engine-os.scheduler-origin-record.v2",
    schedulerContractHash: interimSchedulerContractHash,
    jobKey: input.lease.job.job_key
  });
  const payload = {
    qualificationOnly: true,
    providerDispatchEnabled: false,
    reason: input.reason,
    prospective: input.prospective,
    persistenceRequestedAt: persistedAt,
    persistenceClock: "max_of_request_and_database_statement"
  };
  // This hashes the immutable decision/provenance request. `persisted_at` is a
  // separate database-assigned operational receipt and is protected by the
  // append-only table rather than misrepresented as application-known content.
  const decisionHash = stableHash({
    contract: "engine-os.scheduler-origin-decision.v2",
    recordId,
    jobKey: input.lease.job.job_key,
    originVersionId: input.lease.job.origin_version_id,
    reason: input.reason,
    invokedAt: input.lease.invokedAt,
    evidenceAt,
    generatedAt,
    persistenceRequestedAt: persistedAt,
    attemptTokenHash: input.lease.attemptTokenHash,
    fence: input.lease.fence,
    payload
  });
  const recordStatement = input.db.prepare(`INSERT INTO engine_origin_records_v2 (
    record_id, decision_hash, job_key, origin_version_id, scheduler_contract_version,
    scheduler_contract_hash, status, withholding_reason, scheduled_trigger_at, invoked_at,
    evidence_at, generated_at, persistence_requested_at, persisted_at,
    persistence_deadline_at, kickoff_at, timing,
    prospective_eligible, capture_health, activation_boundary, attempt_token_hash,
    fence_token, qualification_only, payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, 'withheld', ?, ?, ?, ?, ?, ?,
    CASE WHEN julianday(?) > julianday('now')
      THEN ? ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END,
    ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .bind(
      recordId,
      decisionHash,
      input.lease.job.job_key,
      input.lease.job.origin_version_id,
      interimSchedulerContract.version,
      interimSchedulerContractHash,
      input.reason,
      input.lease.job.scheduled_trigger_at,
      input.lease.invokedAt,
      evidenceAt,
      generatedAt,
      persistedAt,
      persistedAt,
      persistedAt,
      input.lease.job.persistence_deadline_at,
      input.lease.job.kickoff_at,
      input.prospective ? "timely" : "late",
      input.prospective ? 1 : 0,
      captureHealthFor(input.reason),
      input.lease.job.activation_boundary,
      input.lease.attemptTokenHash,
      input.lease.fence,
      JSON.stringify(payload)
    );
  const eventId = stableHash({
    contract: "engine-os.scheduler-event.v2",
    schedulerContractHash: interimSchedulerContractHash,
    eventType: "job_completed",
    jobKey: input.lease.job.job_key,
    fence: input.lease.fence
  });
  const eventStatement = input.db.prepare(`INSERT INTO engine_scheduler_events_v2 (
    event_id, event_type, job_key, origin_version_id, attempt_token_hash, fence_token,
    occurred_at, evidence_at, persisted_at, payload_json
  ) VALUES (?, 'job_completed', ?, ?, ?, ?, ?, ?,
    CASE WHEN julianday(?) > julianday('now')
      THEN ? ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END, ?)`)
    .bind(
      eventId,
      input.lease.job.job_key,
      input.lease.job.origin_version_id,
      input.lease.attemptTokenHash,
      input.lease.fence,
      generatedAt,
      evidenceAt,
      persistedAt,
      persistedAt,
      JSON.stringify({ recordId, reason: input.reason, prospective: input.prospective })
    );
  try {
    await input.db.batch([recordStatement, eventStatement]);
    return { recordId, duplicate: false };
  } catch (error) {
    const existing = await input.db.prepare(`SELECT record_id, attempt_token_hash, fence_token
      FROM engine_origin_records_v2 WHERE job_key = ?`)
      .bind(input.lease.job.job_key)
      .first<{ record_id: string; attempt_token_hash: string; fence_token: number }>();
    if (existing?.record_id === recordId &&
      existing.attempt_token_hash === input.lease.attemptTokenHash &&
      existing.fence_token === input.lease.fence) {
      return { recordId, duplicate: true };
    }
    throw error;
  }
}

async function recordUnresolvedSet(input: {
  db: D1Database;
  tickKey: string;
  origins: CurrentOriginHead[];
  at: string;
}): Promise<void> {
  if (input.origins.length === 0) return;
  const originVersionIds = input.origins.map((origin) => origin.originVersionId).sort();
  const unresolvedSetHash = stableHash(originVersionIds);
  await appendSchedulerEvent({
    db: input.db,
    eventType: "schedule_unresolved_observed",
    tickKey: input.tickKey,
    occurredAt: input.at,
    evidenceAt: input.at,
    persistedAt: input.at,
    payload: {
      unresolvedSetHash,
      originCount: originVersionIds.length,
      fabricatedTrigger: false
    },
    idempotencyParts: { unresolvedSetHash, event: "unresolved_current_head_set" }
  });
}

async function detectMissedDispatcherTick(input: {
  db: D1Database;
  watchdogTickKey: string;
  nominalScheduledAt: string;
  observedAt: string;
  activationCursorAt: string;
}): Promise<number> {
  const dispatcherIntervalMs = interimSchedulerContract.clock.dispatcherNominalIntervalSeconds * 1_000;
  const dueCutoffMs = Date.parse(input.nominalScheduledAt) -
    interimSchedulerContract.clock.missedClaimAfterSeconds * 1_000;
  const checkpoint = await input.db.prepare(`SELECT
      max(json_extract(event.payload_json, '$.throughNominalScheduledAt')) AS through_at
    FROM engine_scheduler_events_v2 event
    JOIN engine_scheduler_ticks_v2 tick ON tick.tick_key = event.tick_key
    WHERE event.event_type = 'watchdog_recovery_checkpoint'
      AND tick.scheduler_contract_hash = ?`)
    .bind(interimSchedulerContractHash)
    .first<{ through_at: string | null }>();
  const checkpointAtMs = checkpoint?.through_at ? Date.parse(checkpoint.through_at) : Number.NaN;
  let scanStartMs: number;
  if (Number.isFinite(checkpointAtMs)) {
    scanStartMs = Math.min(checkpointAtMs + dispatcherIntervalMs, dueCutoffMs + dispatcherIntervalMs);
  } else {
    const activationMs = Date.parse(input.activationCursorAt);
    scanStartMs = Math.floor(activationMs / dispatcherIntervalMs) * dispatcherIntervalMs +
      dispatcherIntervalMs;
  }
  const batchEndMs = Math.min(
    dueCutoffMs,
    scanStartMs + (interimSchedulerContract.missedTick.recoveryBatchMaximumSlots - 1) * dispatcherIntervalMs
  );
  const observedAtMs = Date.parse(input.observedAt);
  const missed: Array<{
    expectedDispatcherTickKey: string;
    expectedNominalScheduledAt: string;
    observedState: string;
    heartbeatAt: string | null;
    leaseExpiresAt: string | null;
  }> = [];

  // A normal two-minute cadence inspects both intervening dispatcher slots.
  // After a longer watchdog outage, resume from the prior completed watchdog
  // so no older slot disappears. Per-slot identities make overlap idempotent.
  for (let expectedAtMs = scanStartMs; expectedAtMs <= batchEndMs;
    expectedAtMs += dispatcherIntervalMs) {
    const expectedAt = new Date(expectedAtMs).toISOString();
    const expectedTickKey = interimSchedulerTickKey({ lane: "dispatcher", nominalScheduledAt: expectedAt });
    const prior = await input.db.prepare(`SELECT state, heartbeat_at, lease_expires_at, completed_at
      FROM engine_scheduler_ticks_v2 WHERE tick_key = ?`)
      .bind(expectedTickKey)
      .first<{
        state: string;
        heartbeat_at: string | null;
        lease_expires_at: string | null;
        completed_at: string | null;
      }>();
    if (prior?.state === "completed") continue;
    const heartbeatAgeSeconds = prior?.heartbeat_at
      ? (observedAtMs - Date.parse(prior.heartbeat_at)) / 1_000
      : Number.POSITIVE_INFINITY;
    const healthyRunningTick = prior?.state === "running" &&
      heartbeatAgeSeconds <= interimSchedulerContract.lease.heartbeatAlertAfterSeconds &&
      prior.lease_expires_at !== null && Date.parse(prior.lease_expires_at) > observedAtMs;
    if (healthyRunningTick) continue;

    missed.push({
      expectedDispatcherTickKey: expectedTickKey,
      expectedNominalScheduledAt: expectedAt,
      observedState: prior?.state ?? "absent",
      heartbeatAt: prior?.heartbeat_at ?? null,
      leaseExpiresAt: prior?.lease_expires_at ?? null
    });
  }
  if (missed.length > 0) {
    const missedSetHash = stableHash(missed);
    await appendSchedulerEvent({
      db: input.db,
      eventType: "missed_tick_detected",
      tickKey: input.watchdogTickKey,
      occurredAt: input.observedAt,
      evidenceAt: input.observedAt,
      persistedAt: input.observedAt,
      payload: { missedSetHash, missed },
      idempotencyParts: { missedSetHash }
    });
    await appendSystemAlert({
      db: input.db,
      alertType: "scheduler_missed_tick",
      deduplicationKey: `scheduler-missed-tick-set:${missedSetHash}`,
      severity: "error",
      createdAt: input.observedAt,
      payload: { missedSetHash, missed }
    });
  }
  if (scanStartMs <= batchEndMs) {
    const throughNominalScheduledAt = new Date(batchEndMs).toISOString();
    const targetNominalScheduledAt = new Date(dueCutoffMs).toISOString();
    const backlogRemaining = batchEndMs < dueCutoffMs;
    await appendSchedulerEvent({
      db: input.db,
      eventType: "watchdog_recovery_checkpoint",
      tickKey: input.watchdogTickKey,
      occurredAt: input.observedAt,
      evidenceAt: input.observedAt,
      persistedAt: input.observedAt,
      payload: {
        throughNominalScheduledAt,
        targetNominalScheduledAt,
        backlogRemaining,
        batchMaximumSlots: interimSchedulerContract.missedTick.recoveryBatchMaximumSlots
      },
      idempotencyParts: { throughNominalScheduledAt }
    });
    if (backlogRemaining) {
      await appendSystemAlert({
        db: input.db,
        alertType: "scheduler_watchdog_recovery_backlog",
        deduplicationKey: `scheduler-watchdog-backlog:${throughNominalScheduledAt}:${targetNominalScheduledAt}`,
        severity: "error",
        createdAt: input.observedAt,
        payload: { throughNominalScheduledAt, targetNominalScheduledAt }
      });
    }
  }
  return missed.length;
}

async function requireInterimSchedulerActivationCursor(db: D1Database): Promise<string> {
  const activation = await db.prepare(`SELECT activated_at
    FROM engine_activations
    WHERE operating_contract_hash = ? AND research_contract_hash = ? AND lifecycle_hash = ?
    ORDER BY activated_at DESC LIMIT 1`)
    .bind(
      engineOsContractHashes.operating,
      engineOsContractHashes.research,
      engineOsContractHashes.lifecycle
    )
    .first<{ activated_at: string }>();
  if (!activation || !Number.isFinite(Date.parse(activation.activated_at))) {
    throw new Error("OS-15A scheduler activation cursor is missing");
  }
  return new Date(activation.activated_at).toISOString();
}

interface OriginBatchPlan {
  origin: CurrentOriginHead;
  classification: OriginDueClassification;
}

interface OriginBatchResult {
  attempted: number;
  timely: number;
  late: number;
  lateOrigins: Array<{ originVersionId: string; reason: ForecastWithholdingReason }>;
}

async function ensureOriginJobsBatch(input: {
  db: D1Database;
  plans: OriginBatchPlan[];
  createdAt: string;
}): Promise<JobRow[]> {
  if (input.plans.length === 0) return [];
  const rows = input.plans.map(({ origin, classification }) => {
    if (!origin.scheduledForUtc || !origin.kickoffUtc || !classification.persistenceDeadlineAt) {
      throw new Error(`Origin ${origin.originVersionId} is not a timed terminal origin`);
    }
    return {
      jobKey: interimSchedulerJobKey({
        originVersionId: origin.originVersionId,
        activationBoundary: origin.activationBoundary
      }),
      originVersionId: origin.originVersionId,
      scheduledTriggerAt: origin.scheduledForUtc,
      kickoffAt: origin.kickoffUtc,
      persistenceDeadlineAt: classification.persistenceDeadlineAt,
      activationBoundary: origin.activationBoundary,
      createdAt: input.createdAt
    };
  });
  const encoded = JSON.stringify(rows);
  await input.db.prepare(`INSERT OR IGNORE INTO engine_origin_jobs_v2 (
    job_key, scheduler_contract_version, scheduler_contract_hash, job_key_version, job_type,
    origin_version_id, scheduled_trigger_at, kickoff_at, persistence_deadline_at,
    activation_boundary, state, created_at
  ) SELECT
    json_extract(value, '$.jobKey'), ?, ?, ?, 'forecast_or_withholding',
    json_extract(value, '$.originVersionId'), json_extract(value, '$.scheduledTriggerAt'),
    json_extract(value, '$.kickoffAt'), json_extract(value, '$.persistenceDeadlineAt'),
    json_extract(value, '$.activationBoundary'), 'pending', json_extract(value, '$.createdAt')
  FROM json_each(?)`)
    .bind(
      interimSchedulerContract.version,
      interimSchedulerContractHash,
      interimSchedulerContract.identity.jobKeyVersion,
      encoded
    )
    .run();
  const result = await input.db.prepare(`SELECT job_key, origin_version_id, scheduled_trigger_at,
    kickoff_at, persistence_deadline_at, activation_boundary, state, fence_token,
    active_attempt_token_hash, lease_owner, lease_expires_at, heartbeat_at, completed_at
    FROM engine_origin_jobs_v2
    WHERE job_key IN (
      SELECT json_extract(value, '$.jobKey') FROM json_each(?)
    ) ORDER BY job_key`)
    .bind(encoded)
    .all<JobRow>();
  return result.results;
}

async function claimOriginJobsBatch(input: {
  db: D1Database;
  jobs: JobRow[];
  prospectiveByJob: Map<string, boolean>;
  invokedAt: Date;
  tokenFactory: () => string;
  owner: string;
}): Promise<InterimSchedulerJobLease[]> {
  if (input.jobs.length === 0) return [];
  const invokedAt = input.invokedAt.toISOString();
  const claims = input.jobs
    .filter((job) => job.state !== "completed" && job.state !== "invalidated")
    .map((job) => {
      const prospective = input.prospectiveByJob.get(job.job_key);
      if (prospective === undefined) throw new Error(`Missing classification for ${job.job_key}`);
      const attempt = token(input.tokenFactory);
      return {
        jobKey: job.job_key,
        attemptTokenHash: attempt.hash,
        leaseExpiresAt: leaseExpiryForClaim({
          claimedAt: invokedAt,
          persistenceDeadlineAt: job.persistence_deadline_at,
          prospective
        })
      };
    })
    .filter((claim) => Date.parse(claim.leaseExpiresAt) > Date.parse(invokedAt));
  if (claims.length === 0) return [];
  if (new Set(claims.map((claim) => claim.attemptTokenHash)).size !== claims.length) {
    throw new Error("OS-15A batch attempt tokens must be unique");
  }
  const encoded = JSON.stringify(claims);
  const result = await input.db.prepare(`WITH claims AS (
    SELECT json_extract(value, '$.jobKey') AS job_key,
      json_extract(value, '$.attemptTokenHash') AS attempt_token_hash,
      json_extract(value, '$.leaseExpiresAt') AS lease_expires_at
    FROM json_each(?)
  )
  UPDATE engine_origin_jobs_v2 SET
    state = 'running', fence_token = fence_token + 1,
    active_attempt_token_hash = (
      SELECT claim.attempt_token_hash FROM claims claim
      WHERE claim.job_key = engine_origin_jobs_v2.job_key
    ),
    lease_owner = ?, lease_acquired_at = ?,
    lease_expires_at = (
      SELECT claim.lease_expires_at FROM claims claim
      WHERE claim.job_key = engine_origin_jobs_v2.job_key
    ), heartbeat_at = ?
  WHERE EXISTS (
      SELECT 1 FROM claims claim WHERE claim.job_key = engine_origin_jobs_v2.job_key
    )
    AND state IN ('pending', 'running')
    AND (state = 'pending' OR julianday(lease_expires_at) <= julianday(?))
    AND NOT EXISTS (
      SELECT 1 FROM engine_origin_records_v2 record
      WHERE record.job_key = engine_origin_jobs_v2.job_key
    )
    AND NOT EXISTS (
      SELECT 1 FROM forecast_origin_versions child
      WHERE child.supersedes_origin_version_id = engine_origin_jobs_v2.origin_version_id
    )
  RETURNING job_key, origin_version_id, scheduled_trigger_at, kickoff_at,
    persistence_deadline_at, activation_boundary, state, fence_token,
    active_attempt_token_hash, lease_owner, lease_expires_at, heartbeat_at, completed_at`)
    .bind(encoded, input.owner, invokedAt, invokedAt, invokedAt)
    .all<JobRow>();
  const claimByJob = new Map(claims.map((claim) => [claim.jobKey, claim]));
  const priorByJob = new Map(input.jobs.map((job) => [job.job_key, job]));
  const leases = result.results.map((job) => {
    const claim = claimByJob.get(job.job_key);
    if (!claim || !job.active_attempt_token_hash) {
      throw new Error(`Claim receipt missing for ${job.job_key}`);
    }
    return {
      job,
      attemptTokenHash: job.active_attempt_token_hash,
      fence: job.fence_token,
      owner: input.owner,
      invokedAt,
      reclaimed: (priorByJob.get(job.job_key)?.fence_token ?? 0) > 0
    } satisfies InterimSchedulerJobLease;
  });
  const events = leases.map((lease) => ({
    eventId: stableHash({
      contract: "engine-os.scheduler-event.v2",
      schedulerContractHash: interimSchedulerContractHash,
      eventType: lease.reclaimed ? "job_reclaimed" : "job_claimed",
      jobKey: lease.job.job_key,
      fence: lease.fence,
      event: "claimed"
    }),
    eventType: lease.reclaimed ? "job_reclaimed" : "job_claimed",
    jobKey: lease.job.job_key,
    originVersionId: lease.job.origin_version_id,
    attemptTokenHash: lease.attemptTokenHash,
    fence: lease.fence,
    invokedAt,
    payloadJson: JSON.stringify({
      prospective: input.prospectiveByJob.get(lease.job.job_key),
      leaseExpiresAt: lease.job.lease_expires_at
    })
  }));
  if (events.length > 0) {
    await input.db.prepare(`INSERT OR IGNORE INTO engine_scheduler_events_v2 (
      event_id, event_type, job_key, origin_version_id, attempt_token_hash, fence_token,
      occurred_at, evidence_at, persisted_at, payload_json
    ) SELECT json_extract(value, '$.eventId'), json_extract(value, '$.eventType'),
      json_extract(value, '$.jobKey'), json_extract(value, '$.originVersionId'),
      json_extract(value, '$.attemptTokenHash'), json_extract(value, '$.fence'),
      json_extract(value, '$.invokedAt'), json_extract(value, '$.invokedAt'),
      json_extract(value, '$.invokedAt'), json_extract(value, '$.payloadJson')
    FROM json_each(?)`)
      .bind(JSON.stringify(events))
      .run();
  }
  return leases;
}

async function publishOriginWithholdingsBatch(input: {
  db: D1Database;
  rows: Array<{
    lease: InterimSchedulerJobLease;
    reason: ForecastWithholdingReason;
    prospective: boolean;
    evidenceAt: string;
    generatedAt: string;
    persistenceRequestedAt: string;
  }>;
}): Promise<void> {
  if (input.rows.length === 0) return;
  const records = input.rows.map((row) => {
    if (!APPROVED_REASONS.has(row.reason)) {
      throw new Error(`Unapproved OS-15A withholding reason: ${row.reason}`);
    }
    const recordId = stableHash({
      contract: "engine-os.scheduler-origin-record.v2",
      schedulerContractHash: interimSchedulerContractHash,
      jobKey: row.lease.job.job_key
    });
    const payload = {
      qualificationOnly: true,
      providerDispatchEnabled: false,
      reason: row.reason,
      prospective: row.prospective,
      persistenceRequestedAt: row.persistenceRequestedAt,
      persistenceClock: "max_of_request_and_database_statement"
    };
    const decisionHash = stableHash({
      contract: "engine-os.scheduler-origin-decision.v2",
      recordId,
      jobKey: row.lease.job.job_key,
      originVersionId: row.lease.job.origin_version_id,
      reason: row.reason,
      invokedAt: row.lease.invokedAt,
      evidenceAt: row.evidenceAt,
      generatedAt: row.generatedAt,
      persistenceRequestedAt: row.persistenceRequestedAt,
      attemptTokenHash: row.lease.attemptTokenHash,
      fence: row.lease.fence,
      payload
    });
    return {
      recordId,
      decisionHash,
      jobKey: row.lease.job.job_key,
      originVersionId: row.lease.job.origin_version_id,
      reason: row.reason,
      scheduledTriggerAt: row.lease.job.scheduled_trigger_at,
      invokedAt: row.lease.invokedAt,
      evidenceAt: row.evidenceAt,
      generatedAt: row.generatedAt,
      persistenceRequestedAt: row.persistenceRequestedAt,
      persistenceDeadlineAt: row.lease.job.persistence_deadline_at,
      kickoffAt: row.lease.job.kickoff_at,
      timing: row.prospective ? "timely" : "late",
      prospectiveEligible: row.prospective ? 1 : 0,
      captureHealth: captureHealthFor(row.reason),
      activationBoundary: row.lease.job.activation_boundary,
      attemptTokenHash: row.lease.attemptTokenHash,
      fence: row.lease.fence,
      payloadJson: JSON.stringify(payload),
      eventId: stableHash({
        contract: "engine-os.scheduler-event.v2",
        schedulerContractHash: interimSchedulerContractHash,
        eventType: "job_completed",
        jobKey: row.lease.job.job_key,
        fence: row.lease.fence
      }),
      eventPayloadJson: JSON.stringify({ recordId, reason: row.reason, prospective: row.prospective })
    };
  });
  const encoded = JSON.stringify(records);
  const recordStatement = input.db.prepare(`INSERT INTO engine_origin_records_v2 (
    record_id, decision_hash, job_key, origin_version_id, scheduler_contract_version,
    scheduler_contract_hash, status, withholding_reason, scheduled_trigger_at, invoked_at,
    evidence_at, generated_at, persistence_requested_at, persisted_at,
    persistence_deadline_at, kickoff_at, timing, prospective_eligible, capture_health,
    activation_boundary, attempt_token_hash, fence_token, qualification_only, payload_json
  ) SELECT json_extract(value, '$.recordId'), json_extract(value, '$.decisionHash'),
    json_extract(value, '$.jobKey'), json_extract(value, '$.originVersionId'), ?, ?,
    'withheld', json_extract(value, '$.reason'), json_extract(value, '$.scheduledTriggerAt'),
    json_extract(value, '$.invokedAt'), json_extract(value, '$.evidenceAt'),
    json_extract(value, '$.generatedAt'), json_extract(value, '$.persistenceRequestedAt'),
    CASE WHEN julianday(json_extract(value, '$.persistenceRequestedAt')) > julianday('now')
      THEN json_extract(value, '$.persistenceRequestedAt')
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END,
    json_extract(value, '$.persistenceDeadlineAt'), json_extract(value, '$.kickoffAt'),
    json_extract(value, '$.timing'), json_extract(value, '$.prospectiveEligible'),
    json_extract(value, '$.captureHealth'), json_extract(value, '$.activationBoundary'),
    json_extract(value, '$.attemptTokenHash'), json_extract(value, '$.fence'), 1,
    json_extract(value, '$.payloadJson')
  FROM json_each(?)`)
    .bind(interimSchedulerContract.version, interimSchedulerContractHash, encoded);
  const eventStatement = input.db.prepare(`INSERT INTO engine_scheduler_events_v2 (
    event_id, event_type, job_key, origin_version_id, attempt_token_hash, fence_token,
    occurred_at, evidence_at, persisted_at, payload_json
  ) SELECT json_extract(value, '$.eventId'), 'job_completed',
    json_extract(value, '$.jobKey'), json_extract(value, '$.originVersionId'),
    json_extract(value, '$.attemptTokenHash'), json_extract(value, '$.fence'),
    json_extract(value, '$.generatedAt'), json_extract(value, '$.evidenceAt'),
    CASE WHEN julianday(json_extract(value, '$.persistenceRequestedAt')) > julianday('now')
      THEN json_extract(value, '$.persistenceRequestedAt')
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END,
    json_extract(value, '$.eventPayloadJson')
  FROM json_each(?)`).bind(encoded);
  try {
    await input.db.batch([recordStatement, eventStatement]);
  } catch (error) {
    const existing = await input.db.prepare(`SELECT job_key, attempt_token_hash, fence_token
      FROM engine_origin_records_v2
      WHERE job_key IN (SELECT json_extract(value, '$.jobKey') FROM json_each(?))`)
      .bind(encoded)
      .all<{ job_key: string; attempt_token_hash: string; fence_token: number }>();
    const expected = new Map(records.map((record) => [record.jobKey, record]));
    if (existing.results.length === records.length && existing.results.every((record) => {
      const match = expected.get(record.job_key);
      return match?.attemptTokenHash === record.attempt_token_hash && match.fence === record.fence_token;
    })) return;
    throw error;
  }
}

async function processOriginBatch(input: {
  db: D1Database;
  plans: OriginBatchPlan[];
  owner: string;
  clock: SchedulerClock;
  tokenFactory: () => string;
}): Promise<OriginBatchResult> {
  if (input.plans.length === 0) {
    return { attempted: 0, timely: 0, late: 0, lateOrigins: [] };
  }
  const limited = input.plans.slice(0, interimSchedulerContract.platformQueryBudget.originBatchMaximum);
  const originByVersion = new Map(limited.map((plan) => [plan.origin.originVersionId, plan.origin]));
  const jobs = await ensureOriginJobsBatch({
    db: input.db,
    plans: limited,
    createdAt: input.clock().toISOString()
  });
  const classificationAt = input.clock().toISOString();
  const initialClassification = new Map(limited.map((plan) => [
    plan.origin.originVersionId,
    classifyCurrentOriginHead(plan.origin, classificationAt)
  ]));
  const prospectiveByJob = new Map(jobs.map((job) => [
    job.job_key,
    initialClassification.get(job.origin_version_id)?.prospective ?? false
  ]));
  let leases = await claimOriginJobsBatch({
    db: input.db,
    jobs,
    prospectiveByJob,
    invokedAt: input.clock(),
    tokenFactory: input.tokenFactory,
    owner: input.owner
  });
  let evidenceAt = input.clock().toISOString();
  let generatedAt = input.clock().toISOString();
  let persistenceRequestedAt = input.clock().toISOString();
  let finalByOrigin = new Map(leases.map((lease) => {
    const origin = originByVersion.get(lease.job.origin_version_id)!;
    return [lease.job.origin_version_id, classifyCurrentOriginHead(origin, persistenceRequestedAt)];
  }));
  const nonprospectiveClaims = new Set(
    leases.filter((lease) => prospectiveByJob.get(lease.job.job_key) === false)
      .map((lease) => lease.job.job_key)
  );
  for (let transition = 0; transition < interimSchedulerHorizonIds.length; transition += 1) {
    const crossed = leases.filter((lease) => {
      const final = finalByOrigin.get(lease.job.origin_version_id);
      return !nonprospectiveClaims.has(lease.job.job_key) &&
        final?.terminalRecordRequired && !final.prospective &&
        Date.parse(persistenceRequestedAt) >= Date.parse(lease.job.lease_expires_at ?? "");
    });
    if (crossed.length === 0) break;
    const lateInvokedAt = input.clock();
    const recovered = await claimOriginJobsBatch({
      db: input.db,
      jobs: crossed.map((lease) => lease.job),
      prospectiveByJob: new Map(crossed.map((lease) => [lease.job.job_key, false])),
      invokedAt: lateInvokedAt,
      tokenFactory: input.tokenFactory,
      owner: input.owner
    });
    if (recovered.length !== crossed.length) {
      throw new Error("OS-15A could not fence every deadline-crossing batch claim");
    }
    const recoveredByJob = new Map(recovered.map((lease) => [lease.job.job_key, lease]));
    leases = leases.map((lease) => recoveredByJob.get(lease.job.job_key) ?? lease);
    for (const lease of recovered) nonprospectiveClaims.add(lease.job.job_key);
    evidenceAt = input.clock().toISOString();
    generatedAt = input.clock().toISOString();
    persistenceRequestedAt = input.clock().toISOString();
    finalByOrigin = new Map(leases.map((lease) => {
      const origin = originByVersion.get(lease.job.origin_version_id)!;
      return [lease.job.origin_version_id, classifyCurrentOriginHead(origin, persistenceRequestedAt)];
    }));
  }
  const publicationRows = leases.map((lease) => {
    const classification = finalByOrigin.get(lease.job.origin_version_id);
    if (!classification?.terminalRecordRequired || !classification.withholdingReason) {
      throw new Error(`Origin ${lease.job.origin_version_id} lost its terminal classification`);
    }
    return {
      lease,
      reason: classification.withholdingReason,
      prospective: classification.prospective,
      evidenceAt,
      generatedAt,
      persistenceRequestedAt
    };
  });
  await publishOriginWithholdingsBatch({ db: input.db, rows: publicationRows });
  const lateOrigins = publicationRows
    .filter((row) => !row.prospective)
    .map((row) => ({
      originVersionId: row.lease.job.origin_version_id,
      reason: row.reason
    }))
    .sort((left, right) => left.originVersionId.localeCompare(right.originVersionId));
  return {
    attempted: limited.length,
    timely: publicationRows.length - lateOrigins.length,
    late: lateOrigins.length,
    lateOrigins
  };
}

/**
 * Provider-free OS-15A qualification entrypoint. It never receives an API key,
 * R2 bucket, provider callback, or model callback. The only terminal outcome in
 * this contract version is an approved withholding record.
 */
export async function runInterimSchedulerInvocation(
  input: RunInterimSchedulerInput
): Promise<InterimSchedulerInvocationResult> {
  const validation = validateInterimSchedulerContract();
  if (validation.errors.length > 0) {
    throw new Error(`OS-15A scheduler contract drift: ${validation.errors.join("; ")}`);
  }
  const nominalScheduledAt = iso(input.nominalScheduledAt, "Nominal scheduler tick");
  const clock = input.clock ?? (() => new Date());
  const invokedAt = clock().toISOString();
  const tokenFactory = input.tokenFactory ?? defaultToken;
  const owner = input.owner ?? `${input.lane}:${crypto.randomUUID()}`;
  const budget = budgetedD1(input.db);
  const db = budget.db;
  // Both lanes fail before their first coordination write unless the exact
  // operating/research/lifecycle activation identity exists. The watchdog
  // reuses this cursor so the preflight does not add a second D1 query.
  const activationCursorAt = await requireInterimSchedulerActivationCursor(db);
  const tick = await claimInterimSchedulerTick({
    db,
    lane: input.lane,
    nominalScheduledAt,
    invokedAt,
    tokenFactory,
    owner
  });
  const tickKey = interimSchedulerTickKey({ lane: input.lane, nominalScheduledAt });
  if (!tick) {
    return {
      lane: input.lane,
      tickKey,
      status: "duplicate_or_active",
      nominalScheduledAt,
      invokedAt,
      dueOrigins: 0,
      timelyWithholdings: 0,
      lateClosures: 0,
      unresolvedOrigins: 0,
      invalidatedJobs: 0,
      missedTicks: 0,
      d1QueriesUsed: budget.used(),
      providerDispatches: 0
    };
  }

  let dueOrigins = 0;
  let timelyWithholdings = 0;
  let lateClosures = 0;
  let unresolvedOrigins = 0;
  let missedTicks = 0;
  let invalidatedJobs = 0;
  let tickHeartbeatAtMs = Date.parse(invokedAt);
  const keepTickLease = async (at: Date): Promise<void> => {
    if (at.getTime() - tickHeartbeatAtMs < interimSchedulerContract.lease.renewalEverySeconds * 1_000) {
      return;
    }
    budget.assertOperationalCapacity(2);
    const renewed = await renewInterimSchedulerTick({ db, lease: tick, renewedAt: at });
    if (!renewed) throw new Error(`Scheduler ${input.lane} tick lost its fenced lease during renewal`);
    tickHeartbeatAtMs = at.getTime();
  };
  try {
    const observedAt = clock().toISOString();
    invalidatedJobs = await invalidateSupersededJobs({ db, tickKey: tick.tickKey, at: observedAt });
    if (input.lane === "watchdog") {
      missedTicks = await detectMissedDispatcherTick({
        db,
        watchdogTickKey: tick.tickKey,
        nominalScheduledAt,
        observedAt,
        activationCursorAt
      });
    }
    const rows = await loadCurrentHeads(db);
    const progressAt = clock();
    await keepTickLease(progressAt);
    const plans: OriginBatchPlan[] = [];
    const unresolved: CurrentOriginHead[] = [];
    for (const row of rows) {
      const origin = currentHead(row);
      const classification = classifyCurrentOriginHead(origin, progressAt.toISOString());
      if (classification.disposition === "unresolved") {
        unresolved.push(origin);
      } else if (classification.terminalRecordRequired &&
        !(input.lane === "watchdog" && classification.disposition === "due")) {
        plans.push({ origin, classification });
      }
    }
    plans.sort((left, right) => {
      if (left.classification.prospective !== right.classification.prospective) {
        return left.classification.prospective ? -1 : 1;
      }
      const deadline = (left.classification.persistenceDeadlineAt ?? "")
        .localeCompare(right.classification.persistenceDeadlineAt ?? "");
      if (deadline !== 0) return deadline;
      const scheduled = (left.origin.scheduledForUtc ?? "")
        .localeCompare(right.origin.scheduledForUtc ?? "");
      return scheduled !== 0 ? scheduled :
        left.origin.originVersionId.localeCompare(right.origin.originVersionId);
    });
    unresolvedOrigins = unresolved.length;
    await recordUnresolvedSet({ db, tickKey: tick.tickKey, origins: unresolved, at: observedAt });
    const batchLimit = interimSchedulerContract.platformQueryBudget.originBatchMaximum;
    const batchPlans = plans.slice(0, batchLimit);
    dueOrigins = batchPlans.length;
    const batch = await processOriginBatch({
      db,
      plans: batchPlans,
      owner,
      clock,
      tokenFactory
    });
    timelyWithholdings = batch.timely;
    lateClosures = batch.late;
    if (batch.lateOrigins.length > 0) {
      const lateSetHash = stableHash(batch.lateOrigins);
      await appendSystemAlert({
        db,
        alertType: "scheduler_late_origin",
        deduplicationKey: `scheduler-late-origin-set:${lateSetHash}`,
        severity: "error",
        createdAt: observedAt,
        payload: {
          lateSetHash,
          lateOrigins: batch.lateOrigins,
          prospective: false
        }
      });
    }
    if (plans.length > batchLimit) {
      const deferredOriginVersionIds = plans.slice(batchLimit)
        .map((plan) => plan.origin.originVersionId);
      await appendSystemAlert({
        db,
        alertType: "scheduler_origin_backlog",
        deduplicationKey: `scheduler-origin-backlog:${stableHash(deferredOriginVersionIds)}`,
        severity: "error",
        createdAt: observedAt,
        payload: {
          deferredCount: deferredOriginVersionIds.length,
          deferredSetHash: stableHash(deferredOriginVersionIds),
          prospectiveReplayAllowed: false
        }
      });
    }
    if (rows.length > 0 && unresolvedOrigins === rows.length) {
      const unresolvedSetHash = stableHash(rows.map((row) => row.origin_version_id).sort());
      await appendSystemAlert({
        db,
        alertType: "scheduler_all_schedules_unresolved",
        deduplicationKey: `scheduler-all-unresolved:${unresolvedSetHash}`,
        severity: "critical",
        createdAt: observedAt,
        payload: { unresolvedSetHash, originCount: unresolvedOrigins, activationAllowed: false }
      });
    }
    const completedAtDate = clock();
    await keepTickLease(completedAtDate);
    const completedAt = completedAtDate.toISOString();
    budget.assertOperationalCapacity(2);
    if (!await finishTick({ db, lease: tick, completedAt })) {
      throw new Error(`Scheduler ${input.lane} tick lost its fenced lease before completion`);
    }
    return {
      lane: input.lane,
      tickKey,
      status: "completed",
      nominalScheduledAt,
      invokedAt,
      dueOrigins,
      timelyWithholdings,
      lateClosures,
      unresolvedOrigins,
      invalidatedJobs,
      missedTicks,
      d1QueriesUsed: budget.used(),
      providerDispatches: 0
    };
  } catch (error) {
    budget.enterCleanup();
    const failedAt = clock().toISOString();
    await finishTick({
      db,
      lease: tick,
      completedAt: failedAt,
      failureCode: "scheduler_compute_failure"
    }).catch(() => false);
    await appendSystemAlert({
      db,
      alertType: "scheduler_invocation_failed",
      deduplicationKey: `scheduler-invocation-failed:${tick.tickKey}:${tick.fence}`,
      severity: "critical",
      createdAt: failedAt,
      payload: {
        lane: input.lane,
        tickKey: tick.tickKey,
        fence: tick.fence,
        message: error instanceof Error ? error.message : "unknown scheduler failure"
      }
    }).catch(() => false);
    throw error;
  }
}

export function schedulerDeadlineForHead(origin: CurrentOriginHead): string | null {
  if (!origin.scheduledForUtc || !origin.kickoffUtc) return null;
  return originPersistenceDeadline({
    horizonId: origin.horizonId,
    scheduledTriggerAt: origin.scheduledForUtc,
    kickoffAt: origin.kickoffUtc
  });
}
