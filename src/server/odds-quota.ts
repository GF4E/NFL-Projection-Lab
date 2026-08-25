import { assessOddsQuota, type OddsQuotaPolicy } from "@/domain/engine-os";
import { engineOperatingContract } from "@/domain/engine-os-contracts";
import { stableHash } from "@/domain/hash";

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
}

const QUOTA_BOOTSTRAP_ATTESTATION = "verified_against_provider_dashboard";

export async function getOddsQuotaState(db: D1Database): Promise<OddsQuotaState | null> {
  const row = await db.prepare("SELECT used, remaining, last_cost, updated_at FROM odds_quota_state WHERE provider = 'the-odds-api'")
    .first<{ used: number; remaining: number; last_cost: number; updated_at: string }>();
  return row ? { used: row.used, remaining: row.remaining, lastCost: row.last_cost, updatedAt: row.updated_at } : null;
}

async function emitQuotaAlert(input: {
  db: D1Database;
  reason: string;
  now: string;
  projectedUsed: number | null;
}): Promise<void> {
  const period = input.now.slice(0, 7);
  const deduplicationKey = `the-odds-api:${period}:${input.reason}`;
  const alertId = stableHash({ contract: "engine-os.odds-quota-alert.v1", deduplicationKey });
  await input.db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
    alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
  ) VALUES (?, 'odds_quota_guard', ?, ?, 'open', ?, ?)`)
    .bind(
      alertId,
      deduplicationKey,
      input.reason === "threshold" ? "warning" : "error",
      input.now,
      JSON.stringify({ provider: "the-odds-api", reason: input.reason, projectedUsed: input.projectedUsed })
    ).run();
}

export async function assertOddsCreditsAvailable(
  cost: number,
  db: D1Database,
  options: { essential?: boolean; now?: string } = {}
): Promise<void> {
  const now = options.now ?? new Date().toISOString();
  const decision = assessOddsQuota({
    state: await getOddsQuotaState(db),
    requestCost: cost,
    essential: options.essential ?? true,
    now,
    policy: ODDS_QUOTA_POLICY
  });
  if (!decision.allowed) {
    await emitQuotaAlert({ db, reason: decision.reason, now, projectedUsed: decision.projectedUsed });
    throw new Error(`Odds quota preflight blocked: ${decision.reason}`);
  }
  if (decision.alert) {
    await emitQuotaAlert({ db, reason: "threshold", now, projectedUsed: decision.projectedUsed });
  }
}

export async function recordOddsQuota(input: {
  used: number;
  remaining: number;
  lastCost: number;
  updatedAt?: string;
  requestKey?: string;
  responseCaptureId?: string | null;
}, db: D1Database): Promise<OddsQuotaState> {
  if (![input.used, input.remaining, input.lastCost].every((value) => Number.isInteger(value) && value >= 0) ||
    input.used + input.remaining !== frozenBudget.monthlyPlanCredits) {
    throw new Error("Odds API quota headers are invalid");
  }
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const requestKey = input.requestKey ?? stableHash({
    contract: "engine-os.odds-quota-event.v1",
    used: input.used,
    remaining: input.remaining,
    lastCost: input.lastCost,
    updatedAt
  });
  const responseCaptureId = input.responseCaptureId ?? null;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO odds_quota_events (
      request_key, provider, used, remaining, last_cost, captured_at, response_capture_id
    ) VALUES (?, 'the-odds-api', ?, ?, ?, ?, ?)`)
      .bind(requestKey, input.used, input.remaining, input.lastCost, updatedAt, responseCaptureId),
    db.prepare(`INSERT INTO odds_quota_state (provider, used, remaining, last_cost, updated_at)
      SELECT 'the-odds-api', ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM odds_quota_events
        WHERE request_key = ? AND provider = 'the-odds-api'
          AND used = ? AND remaining = ? AND last_cost = ? AND captured_at = ?
          AND response_capture_id IS ?
      )
      ON CONFLICT(provider) DO UPDATE SET
        used = CASE WHEN excluded.updated_at >= odds_quota_state.updated_at THEN excluded.used ELSE odds_quota_state.used END,
        remaining = CASE WHEN excluded.updated_at >= odds_quota_state.updated_at THEN excluded.remaining ELSE odds_quota_state.remaining END,
        last_cost = CASE WHEN excluded.updated_at >= odds_quota_state.updated_at THEN excluded.last_cost ELSE odds_quota_state.last_cost END,
        updated_at = CASE WHEN excluded.updated_at >= odds_quota_state.updated_at THEN excluded.updated_at ELSE odds_quota_state.updated_at END`)
      .bind(
        input.used, input.remaining, input.lastCost, updatedAt,
        requestKey, input.used, input.remaining, input.lastCost, updatedAt, responseCaptureId
      )
  ]);
  const event = await db.prepare(`SELECT used, remaining, last_cost, captured_at, response_capture_id
    FROM odds_quota_events WHERE request_key = ? LIMIT 1`).bind(requestKey).first<{
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
  return { used: input.used, remaining: input.remaining, lastCost: input.lastCost, updatedAt };
}

/**
 * One-time blank-D1 bootstrap for an operator who has read the authoritative
 * counters in The Odds API dashboard. This is intentionally not routed through
 * any public endpoint. If the exact free-plan accounting cannot be attested,
 * quota preflight remains fail-closed and the provider is not called.
 */
export async function bootstrapOddsQuotaState(input: {
  used: number;
  remaining: number;
  observedAt: string;
  operatorAttestation: typeof QUOTA_BOOTSTRAP_ATTESTATION;
}, db: D1Database): Promise<OddsQuotaState> {
  if (input.operatorAttestation !== QUOTA_BOOTSTRAP_ATTESTATION) {
    throw new Error("Odds quota bootstrap requires an explicit provider-dashboard attestation");
  }
  if (![input.used, input.remaining].every((value) => Number.isInteger(value) && value >= 0) ||
    input.used + input.remaining !== frozenBudget.monthlyPlanCredits) {
    throw new Error("Bootstrapped quota counters must exactly reconcile to the frozen monthly plan");
  }
  const observedAt = new Date(input.observedAt);
  if (!Number.isFinite(observedAt.getTime()) || Math.abs(Date.now() - observedAt.getTime()) > 15 * 60_000) {
    throw new Error("Bootstrapped quota counters must have been observed within 15 minutes");
  }
  if (await getOddsQuotaState(db)) {
    throw new Error("Odds quota state already exists; bootstrap cannot replace provider headers");
  }
  const requestKey = stableHash({
    contract: "engine-os.odds-quota-bootstrap.v1",
    used: input.used,
    remaining: input.remaining,
    observedAt: observedAt.toISOString()
  });
  const state = await recordOddsQuota({
    used: input.used,
    remaining: input.remaining,
    lastCost: 0,
    updatedAt: observedAt.toISOString(),
    requestKey
  }, db);
  const deduplicationKey = `the-odds-api:manual-bootstrap:${requestKey}`;
  await db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
    alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
  ) VALUES (?, 'odds_quota_manual_bootstrap', ?, 'warning', 'open', ?, ?)`)
    .bind(
      stableHash({ contract: "engine-os.odds-quota-bootstrap-alert.v1", deduplicationKey }),
      deduplicationKey,
      observedAt.toISOString(),
      JSON.stringify({ provider: "the-odds-api", used: input.used, remaining: input.remaining })
    ).run();
  return state;
}
