import { getD1 } from "../../db";

export const ODDS_CREDIT_ALERT = 400;
export const ODDS_CREDIT_CEILING = 450;

export interface OddsQuotaState {
  used: number;
  remaining: number;
  lastCost: number;
  updatedAt: string;
}

const createSql = `CREATE TABLE IF NOT EXISTS odds_quota_state (
  provider text PRIMARY KEY NOT NULL,
  used integer NOT NULL,
  remaining integer NOT NULL,
  last_cost integer NOT NULL,
  updated_at text NOT NULL
)`;

export async function getOddsQuotaState(db: D1Database = getD1()): Promise<OddsQuotaState | null> {
  await db.prepare(createSql).run();
  const row = await db.prepare("SELECT used, remaining, last_cost, updated_at FROM odds_quota_state WHERE provider = 'the-odds-api'")
    .first<{ used: number; remaining: number; last_cost: number; updated_at: string }>();
  return row ? { used: row.used, remaining: row.remaining, lastCost: row.last_cost, updatedAt: row.updated_at } : null;
}

export async function assertOddsCreditsAvailable(cost: number, db: D1Database = getD1()): Promise<void> {
  const state = await getOddsQuotaState(db);
  if ((state?.used ?? 0) + cost > ODDS_CREDIT_CEILING) {
    throw new Error("Odds credit ceiling preserves the 50-credit reserve");
  }
}

export async function recordOddsQuota(input: {
  used: number;
  remaining: number;
  lastCost: number;
  updatedAt?: string;
}, db: D1Database = getD1()): Promise<OddsQuotaState> {
  if (![input.used, input.remaining, input.lastCost].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("Odds API quota headers are invalid");
  }
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  await db.prepare(createSql).run();
  await db.prepare(`INSERT INTO odds_quota_state (provider, used, remaining, last_cost, updated_at)
    VALUES ('the-odds-api', ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET used = excluded.used, remaining = excluded.remaining,
      last_cost = excluded.last_cost, updated_at = excluded.updated_at`)
    .bind(input.used, input.remaining, input.lastCost, updatedAt).run();
  return { used: input.used, remaining: input.remaining, lastCost: input.lastCost, updatedAt };
}
