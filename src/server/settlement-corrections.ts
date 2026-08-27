import { americanToDecimal } from "@/domain/odds";
import type { PlayResult } from "@/domain/play-card";

interface CorrectablePlayRow {
  id: string;
  status: string;
  result: PlayResult;
  profit_cents: number;
  stake_cents: number;
  american_odds: number;
}

function correctedProfitCents(result: Exclude<PlayResult, "pending">, stakeCents: number, americanOdds: number): number {
  if (result === "win") return Math.round(stakeCents * (americanToDecimal(americanOdds) - 1));
  if (result === "loss") return -stakeCents;
  return 0;
}

export async function correctStoredPlaySettlement(input: {
  db: D1Database;
  playId: string;
  result: Exclude<PlayResult, "pending">;
  reason: string;
  actorId: string;
  correctedAt?: string;
}) {
  const current = await input.db.prepare(`SELECT id, status, result, profit_cents, stake_cents, american_odds
    FROM plays WHERE id = ?`).bind(input.playId).first<CorrectablePlayRow>();
  if (!current) throw new Error("Play not found");
  if (current.status !== "settled" || current.result === "pending") {
    throw new Error("Only a settled play can be corrected");
  }
  if (!input.reason.trim()) throw new Error("Settlement correction requires a reason");
  const correctedAt = input.correctedAt ?? new Date().toISOString();
  const profitCents = correctedProfitCents(input.result, current.stake_cents, current.american_odds);
  const auditId = `${input.playId}:correction:${correctedAt}`;
  await input.db.batch([
    input.db.prepare(`INSERT INTO play_correction_audit
      (id, play_id, actor_id, reason, before_result, before_profit_cents,
       after_result, after_profit_cents, corrected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        auditId, input.playId, input.actorId, input.reason.trim(), current.result, current.profit_cents,
        input.result, profitCents, correctedAt
      ),
    input.db.prepare(`UPDATE plays SET result = ?, profit_cents = ?, updated_at = ?
      WHERE id = ? AND status = 'settled'`).bind(input.result, profitCents, correctedAt, input.playId)
  ]);
  return { playId: input.playId, result: input.result, profitCents, correctedAt, auditId };
}
