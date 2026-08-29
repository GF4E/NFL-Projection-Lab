import { assessOddsQuota, type OddsQuotaPolicy } from "@/domain/engine-os";
import { engineOperatingContract } from "@/domain/engine-os-contracts";
import { stableHash } from "@/domain/hash";
import { assertApprovedOddsQuotaReservation } from "@/domain/odds-approved-plan";
import type { OddsQuotaRequestClass } from "@/domain/odds-quota-budget";

const frozenBudget = engineOperatingContract.providerBudgets.theOddsApi;

export const ODDS_CREDIT_ALERT = frozenBudget.alertAtCredits;
export const ODDS_CREDIT_CEILING = frozenBudget.hardCeilingCredits;
export const ODDS_NONESSENTIAL_CEILING = ODDS_CREDIT_ALERT;

export const ODDS_QUOTA_POLICY: OddsQuotaPolicy = {
  monthlyPlanCredits: frozenBudget.monthlyPlanCredits,
  alertAt: ODDS_CREDIT_ALERT,
  nonessentialCeiling: ODDS_NONESSENTIAL_CEILING,
  hardCeiling: ODDS_CREDIT_CEILING,
  stateMaxAgeMinutes: Math.ceil(
    (engineOperatingContract.maximumSourceAgeSeconds.odds_ordinary +
      engineOperatingContract.clock.scheduledJobGraceSeconds) / 60
  )
};

export interface OddsQuotaState {
  used: number;
  remaining: number;
  lastCost: number;
  updatedAt: string;
  quotaEpoch: string;
  credentialGenerationId: string;
}

export type OddsQuotaReservationState =
  | "reserved"
  | "dispatched"
  | "settled"
  | "released_before_dispatch"
  | "charge_unknown";

export interface OddsQuotaReservation {
  requestKey: string;
  quotaEpoch: string;
  credentialGenerationId: string;
  requestClass: OddsQuotaRequestClass;
  reservedCost: number;
  futureReserve: number;
  quotaPlanHash: string;
  state: OddsQuotaReservationState;
  reservedAt: string;
  dispatchedAt: string | null;
  completedAt: string | null;
}

export type OddsQuotaReservationResult =
  | { acquired: true; dispatchToken: string; reservation: OddsQuotaReservation }
  | { acquired: false; reason: "duplicate"; reservation: OddsQuotaReservation };

const QUOTA_BOOTSTRAP_ATTESTATION = "verified_against_provider_dashboard";
interface ReservationRow {
  request_key: string;
  quota_epoch: string;
  credential_generation_id: string;
  request_class: OddsQuotaRequestClass;
  reserved_cost: number;
  future_reserve: number;
  quota_plan_hash: string;
  dispatch_token_hash: string;
  state: OddsQuotaReservationState;
  reserved_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
}

interface QuotaStateRow {
  used: number;
  remaining: number;
  last_cost: number;
  updated_at: string;
  quota_epoch: string;
  credential_generation_id: string;
}

function reservationFromRow(row: ReservationRow): OddsQuotaReservation {
  return {
    requestKey: row.request_key,
    quotaEpoch: row.quota_epoch,
    credentialGenerationId: row.credential_generation_id,
    requestClass: row.request_class,
    reservedCost: row.reserved_cost,
    futureReserve: row.future_reserve,
    quotaPlanHash: row.quota_plan_hash,
    state: row.state,
    reservedAt: row.reserved_at,
    dispatchedAt: row.dispatched_at,
    completedAt: row.completed_at
  };
}

function validIso(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validateCredentialGenerationId(value: string): void {
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(value)) {
    throw new Error("Credential generation ID must be a short non-secret identifier");
  }
}

export function providerMonthlyResetWindow(value: string): boolean {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return false;
  // The provider documents a first-of-month reset but not its timezone. This
  // accepts only the union of local-midnight windows from UTC-12 through
  // UTC+14, at 15-minute resolution, with a 30-minute observation allowance.
  for (let offset = -12 * 60; offset <= 14 * 60; offset += 15) {
    const local = new Date(instant + offset * 60_000);
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (local.getUTCDate() === 1 && minutes <= 30) return true;
  }
  return false;
}

export async function getOddsQuotaState(db: D1Database): Promise<OddsQuotaState | null> {
  let row: QuotaStateRow | null;
  try {
    row = await db.prepare(`SELECT q.used, q.remaining, q.last_cost, q.updated_at,
        c.quota_epoch, c.credential_generation_id
      FROM odds_quota_state q
      JOIN odds_quota_control c ON c.provider = q.provider
      WHERE q.provider = 'the-odds-api'`)
      .first<QuotaStateRow>();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table.*odds_quota_control/i.test(message)) return null;
    throw error;
  }
  return row ? {
    used: row.used,
    remaining: row.remaining,
    lastCost: row.last_cost,
    updatedAt: row.updated_at,
    quotaEpoch: row.quota_epoch,
    credentialGenerationId: row.credential_generation_id
  } : null;
}

async function emitQuotaAlert(input: {
  db: D1Database;
  reason: string;
  now: string;
  projectedUsed: number | null;
  quotaEpoch?: string | null;
}): Promise<void> {
  const epoch = input.quotaEpoch ?? (await getOddsQuotaState(input.db))?.quotaEpoch ?? "unbootstrapped";
  const deduplicationKey = `the-odds-api:${epoch}:${input.reason}`;
  const alertId = stableHash({ contract: "engine-os.odds-quota-alert.v2", deduplicationKey });
  await input.db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
    alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
  ) VALUES (?, 'odds_quota_guard', ?, ?, 'open', ?, ?)`)
    .bind(
      alertId,
      deduplicationKey,
      input.reason === "threshold" ? "warning" : "error",
      input.now,
      JSON.stringify({ provider: "the-odds-api", quotaEpoch: epoch, reason: input.reason, projectedUsed: input.projectedUsed })
    ).run();
}

/**
 * Deliberately fail closed for legacy callers. A read-then-check API cannot
 * safely authorize provider dispatch; callers must acquire a request-keyed
 * reservation and use its one-holder dispatch token.
 */
export async function assertOddsCreditsAvailable(..._legacyArguments: unknown[]): Promise<never> {
  void _legacyArguments;
  throw new Error("Atomic Odds quota reservation is required before provider dispatch");
}

async function outstandingReservedCredits(db: D1Database, state: OddsQuotaState): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE(SUM(reserved_cost), 0) AS reserved
    FROM odds_quota_reservations
    WHERE provider = 'the-odds-api' AND quota_epoch = ? AND credential_generation_id = ?
      AND state IN ('reserved', 'dispatched', 'charge_unknown')`)
    .bind(state.quotaEpoch, state.credentialGenerationId)
    .first<{ reserved: number }>();
  return Number(row?.reserved ?? 0);
}

export async function reserveOddsQuota(input: {
  requestKey: string;
  requestClass: OddsQuotaRequestClass;
  reservedCost: number;
  futureReserve: number;
  quotaPlanHash: string;
  now?: string;
}, db: D1Database): Promise<OddsQuotaReservationResult> {
  const now = input.now ?? new Date().toISOString();
  if (!input.requestKey.trim()) throw new Error("Odds quota reservation requires a request key");
  if (!validIso(now)) throw new Error("Odds quota reservation time must be canonical UTC");
  if (!Number.isInteger(input.reservedCost) || input.reservedCost <= 0 ||
    !Number.isInteger(input.futureReserve) || input.futureReserve < 0) {
    throw new Error("Odds quota reservation costs must be non-negative integers");
  }
  assertApprovedOddsQuotaReservation(input);
  const dispatchToken = crypto.randomUUID();
  const dispatchTokenHash = stableHash(dispatchToken);
  const cutoff = new Date(Date.parse(now) - ODDS_QUOTA_POLICY.stateMaxAgeMinutes * 60_000).toISOString();
  const eventId = stableHash({
    contract: "engine-os.odds-quota-reservation-event.v1",
    requestKey: input.requestKey,
    type: "reserved",
    dispatchTokenHash
  });
  const eventPayload = JSON.stringify({
    requestClass: input.requestClass,
    reservedCost: input.reservedCost,
    futureReserve: input.futureReserve,
    quotaPlanHash: input.quotaPlanHash
  });
  const nonessential = input.requestClass === "ordinary" || input.requestClass === "kickoff_minus_120";
  const outstandingSql = `COALESCE((SELECT SUM(r.reserved_cost) FROM odds_quota_reservations r
    WHERE r.provider = 'the-odds-api' AND r.quota_epoch = c.quota_epoch
      AND r.credential_generation_id = c.credential_generation_id
      AND r.state IN ('reserved', 'dispatched', 'charge_unknown')), 0)`;
  const [insertResult] = await db.batch([
    db.prepare(`INSERT INTO odds_quota_reservations (
        request_key, provider, quota_epoch, credential_generation_id, request_class,
        reserved_cost, future_reserve, quota_plan_hash, dispatch_token_hash, state, reserved_at
      )
      SELECT ?, 'the-odds-api', c.quota_epoch, c.credential_generation_id, ?, ?, ?, ?, ?, 'reserved', ?
      FROM odds_quota_state q
      JOIN odds_quota_control c ON c.provider = q.provider
      WHERE q.provider = 'the-odds-api'
        AND q.used >= 0 AND q.remaining >= 0 AND q.used + q.remaining = ?
        AND q.updated_at >= ? AND q.updated_at <= ?
        AND q.used + ${outstandingSql} + ? + ? <= ?
        AND (? = 0 OR q.used + ${outstandingSql} + ? <= ?)
      ON CONFLICT(request_key) DO NOTHING`)
      .bind(
        input.requestKey,
        input.requestClass,
        input.reservedCost,
        input.futureReserve,
        input.quotaPlanHash,
        dispatchTokenHash,
        now,
        frozenBudget.monthlyPlanCredits,
        cutoff,
        now,
        input.reservedCost,
        input.futureReserve,
        ODDS_CREDIT_CEILING,
        nonessential ? 1 : 0,
        input.reservedCost,
        ODDS_NONESSENTIAL_CEILING
      ),
    db.prepare(`INSERT INTO odds_quota_reservation_events (
        event_id, request_key, event_type, occurred_at, payload_json
      ) SELECT ?, request_key, 'reserved', ?, ? FROM odds_quota_reservations
        WHERE request_key = ? AND dispatch_token_hash = ? AND state = 'reserved'
      ON CONFLICT(event_id) DO NOTHING`)
      .bind(eventId, now, eventPayload, input.requestKey, dispatchTokenHash)
  ]);
  const row = await db.prepare(`SELECT request_key, quota_epoch, credential_generation_id,
      request_class, reserved_cost, future_reserve, quota_plan_hash, dispatch_token_hash, state,
      reserved_at, dispatched_at, completed_at
    FROM odds_quota_reservations WHERE request_key = ?`)
    .bind(input.requestKey).first<ReservationRow>();
  const changed = Number((insertResult as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  if (row) {
    if (row.request_class !== input.requestClass || row.reserved_cost !== input.reservedCost ||
      row.future_reserve !== input.futureReserve || row.quota_plan_hash !== input.quotaPlanHash) {
      throw new Error("Odds quota request key collided with a different reservation");
    }
    const reservation = reservationFromRow(row);
    if (changed) {
      const state = await getOddsQuotaState(db);
      const outstanding = state ? await outstandingReservedCredits(db, state) : 0;
      const projected = state ? state.used + outstanding : null;
      if (projected !== null && projected >= ODDS_CREDIT_ALERT) {
        await emitQuotaAlert({
          db,
          reason: "threshold",
          now,
          projectedUsed: projected,
          quotaEpoch: state?.quotaEpoch
        });
      }
    }
    return changed
      ? { acquired: true, dispatchToken, reservation }
      : { acquired: false, reason: "duplicate", reservation };
  }

  const state = await getOddsQuotaState(db);
  const decision = assessOddsQuota({
    state,
    requestCost: input.reservedCost,
    essential: !nonessential,
    now,
    policy: ODDS_QUOTA_POLICY
  });
  const outstanding = state ? await outstandingReservedCredits(db, state) : 0;
  const projected = state ? state.used + outstanding + input.reservedCost + input.futureReserve : null;
  const reason = !decision.allowed
    ? decision.reason
    : projected !== null && projected > ODDS_CREDIT_CEILING
      ? "future_reserve"
      : "atomic_capacity_race";
  await emitQuotaAlert({ db, reason, now, projectedUsed: projected, quotaEpoch: state?.quotaEpoch });
  throw new Error(`Odds quota reservation blocked: ${reason}`);
}

async function transitionReservation(input: {
  requestKey: string;
  dispatchToken: string;
  from: OddsQuotaReservationState;
  to: OddsQuotaReservationState;
  at: string;
  quotaEventRequestKey?: string | null;
} , db: D1Database): Promise<void> {
  if (!validIso(input.at)) throw new Error("Reservation transition time must be canonical UTC");
  const tokenHash = stableHash(input.dispatchToken);
  const eventId = stableHash({
    contract: "engine-os.odds-quota-reservation-event.v1",
    requestKey: input.requestKey,
    type: input.to,
    at: input.at
  });
  const dispatchedAt = input.to === "dispatched" ? input.at : null;
  const completedAt = ["settled", "released_before_dispatch", "charge_unknown"].includes(input.to) ? input.at : null;
  const terminal = ["settled", "released_before_dispatch", "charge_unknown"].includes(input.to);
  const exclusiveDispatch = input.to === "dispatched";
  const [updateResult] = await db.batch([
    db.prepare(`UPDATE odds_quota_reservations SET
        state = ?,
        dispatched_at = COALESCE(dispatched_at, ?),
        completed_at = ?,
        quota_event_request_key = COALESCE(?, quota_event_request_key)
      WHERE request_key = ? AND dispatch_token_hash = ? AND state = ?
        AND (? = 0 OR EXISTS (
          SELECT 1 FROM odds_quota_control c
          WHERE c.provider = odds_quota_reservations.provider
            AND c.quota_epoch = odds_quota_reservations.quota_epoch
            AND c.credential_generation_id = odds_quota_reservations.credential_generation_id
        ))
        AND (? = 0 OR NOT EXISTS (
          SELECT 1 FROM odds_quota_reservations active
          WHERE active.provider = 'the-odds-api' AND active.state = 'dispatched'
            AND active.request_key <> ?
        ))`)
      .bind(input.to, dispatchedAt, completedAt, input.quotaEventRequestKey ?? null,
        input.requestKey, tokenHash, input.from,
        exclusiveDispatch ? 1 : 0,
        exclusiveDispatch ? 1 : 0,
        input.requestKey),
    db.prepare(`INSERT INTO odds_quota_reservation_events (
        event_id, request_key, event_type, occurred_at, payload_json
      ) SELECT ?, request_key, ?, ?, ? FROM odds_quota_reservations
        WHERE request_key = ? AND dispatch_token_hash = ? AND state = ?
          AND (? = 1 AND completed_at = ? OR ? = 0 AND dispatched_at = ?)
      ON CONFLICT(event_id) DO NOTHING`)
      .bind(
        eventId,
        input.to,
        input.at,
        JSON.stringify({ from: input.from, quotaEventRequestKey: input.quotaEventRequestKey ?? null }),
        input.requestKey,
        tokenHash,
        input.to,
        terminal ? 1 : 0,
        input.at,
        terminal ? 1 : 0,
        input.at
      )
  ]);
  const changed = Number((updateResult as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  const row = await db.prepare(`SELECT state, dispatched_at, completed_at
    FROM odds_quota_reservations WHERE request_key = ? AND dispatch_token_hash = ?`)
    .bind(input.requestKey, tokenHash)
    .first<{ state: OddsQuotaReservationState; dispatched_at: string | null; completed_at: string | null }>();
  if (!changed || !row || row.state !== input.to) {
    throw new Error(`Odds quota reservation cannot transition ${input.from} -> ${input.to}`);
  }
}

export async function markOddsQuotaDispatched(input: {
  requestKey: string;
  dispatchToken: string;
  dispatchedAt?: string;
}, db: D1Database): Promise<void> {
  await transitionReservation({
    requestKey: input.requestKey,
    dispatchToken: input.dispatchToken,
    from: "reserved",
    to: "dispatched",
    at: input.dispatchedAt ?? new Date().toISOString()
  }, db);
}

export async function releaseOddsQuotaBeforeDispatch(input: {
  requestKey: string;
  dispatchToken: string;
  releasedAt?: string;
}, db: D1Database): Promise<void> {
  await transitionReservation({
    requestKey: input.requestKey,
    dispatchToken: input.dispatchToken,
    from: "reserved",
    to: "released_before_dispatch",
    at: input.releasedAt ?? new Date().toISOString()
  }, db);
}

export async function markOddsQuotaChargeUnknown(input: {
  requestKey: string;
  dispatchToken: string;
  markedAt?: string;
}, db: D1Database): Promise<void> {
  await transitionReservation({
    requestKey: input.requestKey,
    dispatchToken: input.dispatchToken,
    from: "dispatched",
    to: "charge_unknown",
    at: input.markedAt ?? new Date().toISOString()
  }, db);
}

export async function recordOddsQuota(input: {
  used: number;
  remaining: number;
  lastCost: number;
  updatedAt?: string;
  requestKey: string;
  responseCaptureId?: string | null;
  quotaEpoch?: string;
}, db: D1Database): Promise<OddsQuotaState> {
  if (![input.used, input.remaining, input.lastCost].every((value) => Number.isInteger(value) && value >= 0) ||
    input.used + input.remaining !== frozenBudget.monthlyPlanCredits) {
    throw new Error("Odds API quota headers are invalid");
  }
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  if (!validIso(updatedAt)) throw new Error("Odds quota response time must be canonical UTC");
  const current = await getOddsQuotaState(db);
  if (!current) throw new Error("Odds quota state has not been bootstrapped for the staged credential");
  const quotaEpoch = input.quotaEpoch ?? current.quotaEpoch;
  const responseCaptureId = input.responseCaptureId ?? null;

  if (input.used < current.used) {
    if (quotaEpoch !== current.quotaEpoch || updatedAt <= current.updatedAt ||
      !providerMonthlyResetWindow(updatedAt)) {
      throw new Error("Odds API quota counters regressed outside a plausible monthly reset window");
    }
    const resetEpoch = stableHash({
      contract: "engine-os.odds-quota-epoch.v1",
      previousQuotaEpoch: current.quotaEpoch,
      credentialGenerationId: current.credentialGenerationId,
      resetObservedAt: updatedAt,
      used: input.used,
      remaining: input.remaining
    });
    await db.batch([
      db.prepare(`INSERT INTO odds_quota_events (
        request_key, provider, used, remaining, last_cost, captured_at, response_capture_id
      ) VALUES (?, 'the-odds-api', ?, ?, ?, ?, ?)
      ON CONFLICT(request_key) DO NOTHING`).bind(
        input.requestKey, input.used, input.remaining, input.lastCost, updatedAt, responseCaptureId
      ),
      db.prepare(`INSERT INTO odds_quota_epochs (
          quota_epoch, provider, credential_generation_id, opened_at, reason,
          initial_used, initial_remaining, source_request_key
        ) SELECT ?, 'the-odds-api', ?, ?, 'provider_monthly_reset', ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM odds_quota_events e
          WHERE e.request_key = ? AND e.used = ? AND e.remaining = ? AND e.last_cost = ?
            AND e.captured_at = ? AND e.response_capture_id IS ?
        )
        ON CONFLICT(quota_epoch) DO NOTHING`).bind(
          resetEpoch,
          current.credentialGenerationId,
          updatedAt,
          input.used,
          input.remaining,
          input.requestKey,
          input.requestKey,
          input.used,
          input.remaining,
          input.lastCost,
          updatedAt,
          responseCaptureId
        ),
      db.prepare(`UPDATE odds_quota_control SET quota_epoch = ?, observed_at = ?
        WHERE provider = 'the-odds-api' AND quota_epoch = ? AND EXISTS (
          SELECT 1 FROM odds_quota_events e
          WHERE e.request_key = ? AND e.used = ? AND e.remaining = ? AND e.last_cost = ?
            AND e.captured_at = ? AND e.response_capture_id IS ?
        )`).bind(
          resetEpoch, updatedAt, current.quotaEpoch,
          input.requestKey, input.used, input.remaining, input.lastCost, updatedAt, responseCaptureId
        ),
      db.prepare(`UPDATE odds_quota_state SET used = ?, remaining = ?, last_cost = ?, updated_at = ?
        WHERE provider = 'the-odds-api' AND EXISTS (
          SELECT 1 FROM odds_quota_control c
          WHERE c.provider = 'the-odds-api' AND c.quota_epoch = ?
        ) AND EXISTS (
          SELECT 1 FROM odds_quota_events e
          WHERE e.request_key = ? AND e.used = ? AND e.remaining = ? AND e.last_cost = ?
            AND e.captured_at = ? AND e.response_capture_id IS ?
        )`).bind(
          input.used, input.remaining, input.lastCost, updatedAt,
          resetEpoch,
          input.requestKey, input.used, input.remaining, input.lastCost, updatedAt, responseCaptureId
        )
    ]);
    const event = await db.prepare(`SELECT used, remaining, last_cost, captured_at, response_capture_id
      FROM odds_quota_events WHERE request_key = ? LIMIT 1`).bind(input.requestKey).first<{
        used: number;
        remaining: number;
        last_cost: number;
        captured_at: string;
        response_capture_id: string | null;
      }>();
    if (!event || event.used !== input.used || event.remaining !== input.remaining ||
      event.last_cost !== input.lastCost || event.captured_at !== updatedAt ||
      event.response_capture_id !== responseCaptureId) {
      throw new Error("Odds API quota request key collided with a different immutable event");
    }
    const resetState = await getOddsQuotaState(db);
    if (!resetState || resetState.quotaEpoch !== resetEpoch || resetState.used !== input.used) {
      throw new Error("Concurrent Odds quota reset reconciliation did not become authoritative");
    }
    return resetState;
  }

  if (quotaEpoch !== current.quotaEpoch) {
    throw new Error("Odds quota response belongs to a superseded quota epoch");
  }
  await db.batch([
    db.prepare(`INSERT INTO odds_quota_events (
      request_key, provider, used, remaining, last_cost, captured_at, response_capture_id
    ) VALUES (?, 'the-odds-api', ?, ?, ?, ?, ?)
    ON CONFLICT(request_key) DO NOTHING`)
      .bind(input.requestKey, input.used, input.remaining, input.lastCost, updatedAt, responseCaptureId),
    db.prepare(`UPDATE odds_quota_state SET
        used = CASE WHEN ? > used THEN ? ELSE used END,
        remaining = ? - CASE WHEN ? > used THEN ? ELSE used END,
        last_cost = CASE WHEN ? > used OR (? = used AND ? >= updated_at) THEN ? ELSE last_cost END,
        updated_at = CASE WHEN ? > updated_at THEN ? ELSE updated_at END
      WHERE provider = 'the-odds-api' AND EXISTS (
        SELECT 1 FROM odds_quota_control c
        WHERE c.provider = 'the-odds-api' AND c.quota_epoch = ?
      ) AND EXISTS (
        SELECT 1 FROM odds_quota_events e
        WHERE e.request_key = ? AND e.used = ? AND e.remaining = ? AND e.last_cost = ?
          AND e.captured_at = ? AND e.response_capture_id IS ?
      )`)
      .bind(
        input.used, input.used,
        frozenBudget.monthlyPlanCredits, input.used, input.used,
        input.used, input.used, updatedAt, input.lastCost,
        updatedAt, updatedAt,
        quotaEpoch,
        input.requestKey, input.used, input.remaining, input.lastCost, updatedAt, responseCaptureId
      ),
    db.prepare(`UPDATE odds_quota_control SET observed_at = CASE WHEN ? > observed_at THEN ? ELSE observed_at END
      WHERE provider = 'the-odds-api' AND quota_epoch = ? AND EXISTS (
        SELECT 1 FROM odds_quota_events e
        WHERE e.request_key = ? AND e.used = ? AND e.remaining = ? AND e.last_cost = ?
          AND e.captured_at = ? AND e.response_capture_id IS ?
      )`)
      .bind(
        updatedAt, updatedAt, quotaEpoch,
        input.requestKey, input.used, input.remaining, input.lastCost, updatedAt, responseCaptureId
      )
  ]);
  const event = await db.prepare(`SELECT used, remaining, last_cost, captured_at, response_capture_id
    FROM odds_quota_events WHERE request_key = ? LIMIT 1`).bind(input.requestKey).first<{
      used: number;
      remaining: number;
      last_cost: number;
      captured_at: string;
      response_capture_id: string | null;
    }>();
  if (!event || event.used !== input.used || event.remaining !== input.remaining ||
    event.last_cost !== input.lastCost || event.captured_at !== updatedAt ||
    event.response_capture_id !== responseCaptureId) {
    throw new Error("Odds API quota request key collided with a different immutable event");
  }
  const state = await getOddsQuotaState(db);
  if (!state) throw new Error("Odds quota state disappeared during response reconciliation");
  return state;
}

async function reconcileCoveredUnknownCharges(input: {
  quotaEpoch: string;
  excludeRequestKey: string;
  coveredCredits: number;
  reconciledByRequestKey: string;
  reconciledAt: string;
}, db: D1Database): Promise<void> {
  if (input.coveredCredits <= 0) return;
  const unknown = await db.prepare(`SELECT request_key, reserved_cost
    FROM odds_quota_reservations
    WHERE provider = 'the-odds-api' AND quota_epoch = ? AND state = 'charge_unknown'
      AND request_key <> ?
    ORDER BY reserved_at, request_key`).bind(input.quotaEpoch, input.excludeRequestKey)
    .all<{ request_key: string; reserved_cost: number }>();
  let remaining = input.coveredCredits;
  for (const row of unknown.results) {
    if (row.reserved_cost > remaining) continue;
    const eventId = stableHash({
      contract: "engine-os.odds-quota-reservation-event.v1",
      requestKey: row.request_key,
      type: "settled",
      reconciledBy: input.reconciledByRequestKey
    });
    const [updateResult] = await db.batch([
      db.prepare(`UPDATE odds_quota_reservations SET state = 'settled', completed_at = ?,
          quota_event_request_key = ?
        WHERE request_key = ? AND quota_epoch = ? AND state = 'charge_unknown'`)
        .bind(input.reconciledAt, input.reconciledByRequestKey, row.request_key, input.quotaEpoch),
      db.prepare(`INSERT INTO odds_quota_reservation_events (
          event_id, request_key, event_type, occurred_at, payload_json
        ) SELECT ?, request_key, 'settled', ?, ? FROM odds_quota_reservations
          WHERE request_key = ? AND quota_epoch = ? AND state = 'settled'
            AND completed_at = ? AND quota_event_request_key = ?
        ON CONFLICT(event_id) DO NOTHING`)
        .bind(
          eventId,
          input.reconciledAt,
          JSON.stringify({ reconciledByRequestKey: input.reconciledByRequestKey }),
          row.request_key,
          input.quotaEpoch,
          input.reconciledAt,
          input.reconciledByRequestKey
        )
    ]);
    if (Number((updateResult as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0) {
      remaining -= row.reserved_cost;
    }
  }
}

export async function settleOddsQuotaReservation(input: {
  requestKey: string;
  dispatchToken: string;
  used: number;
  remaining: number;
  lastCost: number;
  updatedAt: string;
  responseCaptureId?: string | null;
}, db: D1Database): Promise<OddsQuotaState> {
  const tokenHash = stableHash(input.dispatchToken);
  const reservation = await db.prepare(`SELECT request_key, quota_epoch, credential_generation_id,
      request_class, reserved_cost, future_reserve, quota_plan_hash, dispatch_token_hash, state,
      reserved_at, dispatched_at, completed_at
    FROM odds_quota_reservations WHERE request_key = ? AND dispatch_token_hash = ?`)
    .bind(input.requestKey, tokenHash).first<ReservationRow>();
  if (!reservation || reservation.state !== "dispatched") {
    throw new Error("A dispatched quota reservation is required to reconcile provider headers");
  }
  const stateBefore = await getOddsQuotaState(db);
  if (!stateBefore || stateBefore.credentialGenerationId !== reservation.credential_generation_id) {
    throw new Error("Reservation credential generation no longer matches the authoritative provider counter");
  }
  if (stateBefore.quotaEpoch !== reservation.quota_epoch) {
    throw new Error("Reservation response belongs to a superseded quota epoch");
  }
  const state = await recordOddsQuota({
    used: input.used,
    remaining: input.remaining,
    lastCost: input.lastCost,
    updatedAt: input.updatedAt,
    requestKey: input.requestKey,
    responseCaptureId: input.responseCaptureId,
    quotaEpoch: stateBefore.quotaEpoch
  }, db);
  await reconcileCoveredUnknownCharges({
    quotaEpoch: state.quotaEpoch,
    excludeRequestKey: input.requestKey,
    coveredCredits: Math.max(0, input.used - stateBefore.used - input.lastCost),
    reconciledByRequestKey: input.requestKey,
    reconciledAt: input.updatedAt
  }, db);
  await transitionReservation({
    requestKey: input.requestKey,
    dispatchToken: input.dispatchToken,
    from: reservation.state,
    to: "settled",
    at: input.updatedAt,
    quotaEventRequestKey: input.requestKey
  }, db);
  if (input.lastCost > reservation.reserved_cost) {
    await emitQuotaAlert({
      db,
      reason: "provider_overcharge",
      now: input.updatedAt,
      projectedUsed: input.used,
      quotaEpoch: reservation.quota_epoch
    });
    throw new Error("Odds provider charged more credits than the atomic reservation");
  }
  return state;
}

/**
 * Initial or stale-state reconciliation from the provider dashboard. The
 * credential generation is a non-secret rotation label, never the API key.
 * Concurrent identical bootstraps are serialized by the conditional control
 * row update; exactly one caller receives success.
 */
export async function bootstrapOddsQuotaState(input: {
  used: number;
  remaining: number;
  observedAt: string;
  credentialGenerationId: string;
  operatorAttestation: typeof QUOTA_BOOTSTRAP_ATTESTATION;
}, db: D1Database): Promise<OddsQuotaState> {
  if (input.operatorAttestation !== QUOTA_BOOTSTRAP_ATTESTATION) {
    throw new Error("Odds quota bootstrap requires an explicit provider-dashboard attestation");
  }
  validateCredentialGenerationId(input.credentialGenerationId);
  if (![input.used, input.remaining].every((value) => Number.isInteger(value) && value >= 0) ||
    input.used + input.remaining !== frozenBudget.monthlyPlanCredits) {
    throw new Error("Bootstrapped quota counters must exactly reconcile to the frozen monthly plan");
  }
  const observedAt = new Date(input.observedAt);
  if (!Number.isFinite(observedAt.getTime()) || Math.abs(Date.now() - observedAt.getTime()) > 15 * 60_000) {
    throw new Error("Bootstrapped quota counters must have been observed within 15 minutes");
  }
  const observedAtIso = observedAt.toISOString();
  const staleCutoff = new Date(observedAt.getTime() - ODDS_QUOTA_POLICY.stateMaxAgeMinutes * 60_000).toISOString();
  const quotaEpoch = stableHash({
    contract: "engine-os.odds-quota-epoch.v1",
    credentialGenerationId: input.credentialGenerationId,
    observedAt: observedAtIso,
    used: input.used,
    remaining: input.remaining
  });
  const requestKey = `bootstrap:${quotaEpoch}`;
  const deduplicationKey = `the-odds-api:manual-bootstrap:${quotaEpoch}`;
  const [, controlResult] = await db.batch([
    db.prepare(`INSERT INTO odds_quota_epochs (
        quota_epoch, provider, credential_generation_id, opened_at, reason,
        initial_used, initial_remaining, source_request_key
      ) SELECT ?, 'the-odds-api', ?, ?,
          CASE WHEN EXISTS (
            SELECT 1 FROM odds_quota_control c
            WHERE c.provider = 'the-odds-api' AND c.credential_generation_id = ?
          ) THEN 'stale_reconciliation' ELSE 'credential_bootstrap' END,
          ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM odds_quota_control c WHERE c.provider = 'the-odds-api'
      ) OR EXISTS (
        SELECT 1 FROM odds_quota_control c WHERE c.provider = 'the-odds-api'
          AND (c.credential_generation_id <> ? OR c.observed_at < ?)
      )
      ON CONFLICT(quota_epoch) DO NOTHING`)
      .bind(
        quotaEpoch,
        input.credentialGenerationId,
        observedAtIso,
        input.credentialGenerationId,
        input.used,
        input.remaining,
        requestKey,
        input.credentialGenerationId,
        staleCutoff
      ),
    db.prepare(`INSERT INTO odds_quota_control (
        provider, quota_epoch, credential_generation_id, observed_at
      ) VALUES ('the-odds-api', ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        quota_epoch = excluded.quota_epoch,
        credential_generation_id = excluded.credential_generation_id,
        observed_at = excluded.observed_at
      WHERE odds_quota_control.credential_generation_id <> excluded.credential_generation_id
        OR odds_quota_control.observed_at < ?`)
      .bind(quotaEpoch, input.credentialGenerationId, observedAtIso, staleCutoff),
    db.prepare(`INSERT INTO odds_quota_state (provider, used, remaining, last_cost, updated_at)
      SELECT 'the-odds-api', ?, ?, 0, ?
      WHERE EXISTS (SELECT 1 FROM odds_quota_control WHERE provider = 'the-odds-api' AND quota_epoch = ?)
      ON CONFLICT(provider) DO UPDATE SET
        used = excluded.used,
        remaining = excluded.remaining,
        last_cost = excluded.last_cost,
        updated_at = excluded.updated_at
      WHERE EXISTS (SELECT 1 FROM odds_quota_control WHERE provider = 'the-odds-api' AND quota_epoch = ?)`)
      .bind(input.used, input.remaining, observedAtIso, quotaEpoch, quotaEpoch),
    db.prepare(`INSERT INTO odds_quota_events (
        request_key, provider, used, remaining, last_cost, captured_at, response_capture_id
      ) SELECT ?, 'the-odds-api', ?, ?, 0, ?, NULL
        WHERE EXISTS (SELECT 1 FROM odds_quota_control WHERE provider = 'the-odds-api' AND quota_epoch = ?)
      ON CONFLICT(request_key) DO NOTHING`)
      .bind(requestKey, input.used, input.remaining, observedAtIso, quotaEpoch),
    db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
      alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
    ) SELECT ?, 'odds_quota_manual_bootstrap', ?, 'warning', 'open', ?, ?
      WHERE EXISTS (SELECT 1 FROM odds_quota_control WHERE provider = 'the-odds-api' AND quota_epoch = ?)`)
      .bind(
        stableHash({ contract: "engine-os.odds-quota-bootstrap-alert.v2", deduplicationKey }),
        deduplicationKey,
        observedAtIso,
        JSON.stringify({
          provider: "the-odds-api",
          quotaEpoch,
          credentialGenerationId: input.credentialGenerationId,
          used: input.used,
          remaining: input.remaining
        }),
        quotaEpoch
      )
  ]);
  const changed = Number((controlResult as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  if (!changed) {
    throw new Error("Odds quota bootstrap did not establish a new credential generation or reconcile stale state");
  }
  const state = await getOddsQuotaState(db);
  if (!state || state.quotaEpoch !== quotaEpoch) {
    throw new Error("Odds quota bootstrap failed closed before acquisition");
  }
  return state;
}

export async function listOutstandingOddsQuotaReservations(db: D1Database): Promise<OddsQuotaReservation[]> {
  const result = await db.prepare(`SELECT request_key, quota_epoch, credential_generation_id,
      request_class, reserved_cost, future_reserve, quota_plan_hash, dispatch_token_hash, state,
      reserved_at, dispatched_at, completed_at
    FROM odds_quota_reservations
    WHERE state IN ('reserved', 'dispatched', 'charge_unknown')
    ORDER BY reserved_at, request_key`).all<ReservationRow>();
  return result.results.map(reservationFromRow);
}
