import { getD1 } from "../../db";
import { assertD1SchemaAuthority } from "@/server/schema-authority";
import {
  draftExpirationReason,
  earliestPlayKickoff,
  executionApprovalConfirmationError,
  forecastApprovalEligibilityError,
  isTeamApproved,
  storedLegMatchesSource,
  validateTeamCardPortfolio,
  validateStoredPlayContract,
  validateStoredPlayPrice,
  type PickedBy,
  type PlayForecastSnapshot,
  type WeeklyPlay
} from "@/domain/play-card";
import { seasonSchedule } from "./weekly-slate";
import { queueAndDispatchPush } from "./push/store";
import { capturePlayForecastSnapshot } from "./play-provenance";

type PlayDatabaseRow = {
  id: string;
  contract_key: string;
  contract_json: string;
  forecast_json: string | null;
  gabe_approved: number;
  jarrett_approved: number;
  season: number;
  week: number;
  game_id: string;
  play_type: WeeklyPlay["playType"];
  market: string;
  primary_reason: string;
  picked_by: WeeklyPlay["pickedBy"];
  title: string;
  legs: string;
  book: string;
  american_odds: number;
  stake_cents: number;
  model_edge_pp: number;
  estimated_ev_percent: number;
  confidence: WeeklyPlay["confidence"];
  stats_case: string;
  football_case: string;
  execution_status: WeeklyPlay["executionStatus"];
  cash_placement_confirmed: number;
  status: WeeklyPlay["status"];
  result: WeeklyPlay["result"];
  profit_cents: number;
  closing_clv_cents: number | null;
  closing_clv_points: number | null;
  clv_reference_book: "BetMGM" | "FanDuel" | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const INSERT_PLAY_SQL = `
  INSERT OR IGNORE INTO plays (
    id, contract_key, contract_json, forecast_json, gabe_approved, jarrett_approved, season, week, game_id, play_type, market, primary_reason, picked_by, title, legs, book, american_odds, stake_cents,
    model_edge_pp, estimated_ev_percent, confidence, stats_case, football_case, execution_status, cash_placement_confirmed,
    status, result, profit_cents, closing_clv_cents, closing_clv_points, clv_reference_book, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function contractFor(row: PlayDatabaseRow): WeeklyPlay["contract"] {
  try {
    const parsed = JSON.parse(row.contract_json || "[]") as unknown;
    return Array.isArray(parsed) ? parsed as WeeklyPlay["contract"] : [];
  } catch {
    return [];
  }
}

function approvalsFor(row: PlayDatabaseRow): PickedBy[] {
  const approvals: PickedBy[] = [];
  if (row.gabe_approved) approvals.push("gabe");
  if (row.jarrett_approved) approvals.push("jarrett");
  if (approvals.length) return approvals;
  // Legacy rows are treated as already accepted so existing records remain intact.
  return row.status === "research" ? [] : ["gabe", "jarrett"];
}

function forecastFor(row: PlayDatabaseRow): PlayForecastSnapshot | null {
  try {
    return row.forecast_json ? JSON.parse(row.forecast_json) as PlayForecastSnapshot : null;
  } catch {
    return null;
  }
}

function mapRow(row: PlayDatabaseRow): WeeklyPlay {
  return {
    id: row.id,
    contractKey: row.contract_key,
    contract: contractFor(row),
    forecastSnapshot: forecastFor(row),
    approvals: approvalsFor(row),
    season: row.season,
    week: row.week,
    gameId: row.game_id,
    playType: row.play_type,
    market: row.market,
    primaryReason: row.primary_reason,
    pickedBy: row.picked_by,
    title: row.title,
    legs: row.legs,
    book: row.book,
    americanOdds: row.american_odds,
    stakeCents: row.stake_cents,
    modelEdgePp: row.model_edge_pp,
    estimatedEvPercent: row.estimated_ev_percent,
    confidence: row.confidence,
    statsCase: row.stats_case,
    footballCase: row.football_case,
    executionStatus: row.execution_status ?? "paper",
    cashPlacementConfirmed: row.cash_placement_confirmed === 1,
    status: row.status,
    result: row.result,
    profitCents: row.profit_cents,
    closingClvCents: row.closing_clv_cents,
    closingClvPoints: row.closing_clv_points,
    clvReferenceBook: row.clv_reference_book,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function notifyMissingApprover(db: D1Database, play: WeeklyPlay): Promise<void> {
  if (play.status !== "research" || play.approvals?.length !== 1) return;
  const recipientId: PickedBy = play.approvals[0] === "gabe" ? "jarrett" : "gabe";
  try {
    await queueAndDispatchPush({
      db,
      type: "awaiting_you",
      recipientId,
      idempotencyKey: `awaiting_you:${play.id}:${recipientId}`,
      title: "Awaiting you",
      body: `${play.title} needs your approval on the exact ${play.book} contract.`,
      now: play.updatedAt
    });
  } catch {
    // Card persistence is authoritative. Push has its own durable retry state and
    // must never make a jointly reviewed contract fail to save.
  }
}

export async function ensurePlayStore(d1: D1Database = getD1()): Promise<void> {
  await assertD1SchemaAuthority(d1);
}

export async function listPlays(week?: number): Promise<WeeklyPlay[]> {
  const d1 = getD1();
  await ensurePlayStore(d1);
  await expireStaleTeamDrafts(d1, new Date(), true);
  const statement = week === undefined
    ? d1.prepare("SELECT * FROM plays WHERE season = 2026 AND game_id <> '' AND status <> 'passed' ORDER BY week, created_at ASC")
    : d1.prepare("SELECT * FROM plays WHERE season = 2026 AND week = ? AND game_id <> '' AND status <> 'passed' ORDER BY created_at ASC").bind(week);
  const result = await statement.all<PlayDatabaseRow>();
  return result.results.map(mapRow);
}

async function kickoffMap(d1: D1Database): Promise<Map<string, string>> {
  const schedule = await seasonSchedule({ db: d1, season: 2026 });
  return new Map(schedule.map((game) => [game.id, game.kickoffAt]));
}

export async function expireStaleTeamDrafts(
  d1: D1Database = getD1(),
  now = new Date(),
  storeReady = false
): Promise<{ expired: number }> {
  if (!storeReady) await ensurePlayStore(d1);
  const result = await d1.prepare("SELECT * FROM plays WHERE season = 2026 AND status = 'research'").all<PlayDatabaseRow>();
  if (!result.results.length) return { expired: 0 };
  const kickoffs = await kickoffMap(d1);
  const changedAt = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  let expired = 0;
  for (const row of result.results) {
    const play = mapRow(row);
    const reason = draftExpirationReason(play, changedAt, kickoffs);
    if (!reason) continue;
    expired += 1;
    statements.push(
      d1.prepare(`INSERT OR IGNORE INTO play_state_audit
        (id, play_id, transition, reason, from_status, to_status, snapshot_json, changed_at)
        VALUES (?, ?, 'expired', ?, 'research', 'passed', ?, ?)`)
        .bind(`${play.id}:expired:${changedAt}`, play.id, reason, JSON.stringify({
          contractKey: play.contractKey,
          contract: play.contract,
          approvals: play.approvals,
          createdAt: play.createdAt
        }), changedAt),
      d1.prepare(`UPDATE plays SET status = 'passed', gabe_approved = 0, jarrett_approved = 0, updated_at = ?
        WHERE id = ? AND status = 'research'`).bind(changedAt, play.id)
    );
  }
  if (statements.length) await d1.batch(statements);
  return { expired };
}

async function assertApprovalWindowOpen(d1: D1Database, play: WeeklyPlay, now: string): Promise<void> {
  const kickoff = earliestPlayKickoff(play, await kickoffMap(d1));
  if (kickoff && Date.parse(now) >= Date.parse(kickoff)) {
    throw new Error("Approval is closed because this contract has kicked off.");
  }
}

export async function getPlay(id: string): Promise<WeeklyPlay | null> {
  await ensurePlayStore();
  const row = await getD1().prepare("SELECT * FROM plays WHERE id = ?").bind(id).first<PlayDatabaseRow>();
  return row ? mapRow(row) : null;
}

async function assertApprovalContractCurrent(d1: D1Database, play: WeeklyPlay): Promise<void> {
  const contract = play.contract ?? [];
  if (!contract.length || contract.some((leg) => !leg.sourceQuoteId)) {
    throw new Error("This draft predates quote verification. Refresh it before the second approval.");
  }
  for (const leg of contract) {
    if (leg.market === "prop") {
      const quote = await d1.prepare("SELECT game_id, book, market, side, point, american_price FROM player_prop_quotes WHERE id = ?")
        .bind(leg.sourceQuoteId).first<{ game_id: string; book: string; market: string; side: string; point: number; american_price: number }>();
      if (!quote || !storedLegMatchesSource(leg, play.book, {
        gameId: quote.game_id, book: quote.book, market: quote.market, side: quote.side,
        point: quote.point, americanPrice: quote.american_price
      })) {
        throw new Error("A player-prop source, book, point, or price changed. Refresh the card; both approvals must restart.");
      }
      continue;
    }
    const quote = await d1.prepare("SELECT game_id, book, market, side, point, american_price FROM live_lines WHERE id = ?")
      .bind(leg.sourceQuoteId).first<{ game_id: string; book: string; market: string; side: string; point: number | null; american_price: number }>();
    if (!quote || !storedLegMatchesSource(leg, play.book, {
      gameId: quote.game_id, book: quote.book, market: quote.market, side: quote.side,
      point: quote.point, americanPrice: quote.american_price
    })) {
      throw new Error("A source, book, point, or price changed. Refresh the card; both approvals must restart.");
    }
  }
}

function assertStoredPlayContract(play: WeeklyPlay): void {
  const errors = validateStoredPlayContract(play);
  if (errors.length) throw new Error(errors[0]);
  const priceError = validateStoredPlayPrice(play);
  if (priceError) throw new Error(priceError);
}

function assertForecastApprovalEligible(play: WeeklyPlay, snapshot: PlayForecastSnapshot): void {
  const error = forecastApprovalEligibilityError(play, snapshot);
  if (error) throw new Error(error);
}

async function assertPortfolioAvailable(d1: D1Database, play: WeeklyPlay): Promise<void> {
  const result = await d1.prepare(`SELECT * FROM plays
    WHERE id <> ? AND season = ? AND week = ? AND status IN ('card', 'placed', 'settled')`)
    .bind(play.id, play.season, play.week).all<PlayDatabaseRow>();
  const errors = validateTeamCardPortfolio(result.results.map(mapRow), play);
  if (errors.length) throw new Error(errors[0]);
}

export async function addOrApprovePlay(play: WeeklyPlay, actor: PickedBy): Promise<WeeklyPlay> {
  assertStoredPlayContract(play);
  const d1 = getD1();
  await ensurePlayStore(d1);
  await expireStaleTeamDrafts(d1, new Date(play.updatedAt), true);
  const existing = await d1.prepare("SELECT * FROM plays WHERE id = ?").bind(play.id).first<PlayDatabaseRow>();
  if (existing) {
    const current = mapRow(existing);
    if (isTeamApproved(current.approvals) || current.approvals?.includes(actor)) return current;
    if (current.executionStatus !== play.executionStatus) {
      throw new Error("Execution status changed. Create a new revision and restart both approvals.");
    }
    await assertApprovalWindowOpen(d1, play, play.updatedAt);
    if (current.status === "passed") {
      await assertApprovalContractCurrent(d1, play);
      const forecastSnapshot = await capturePlayForecastSnapshot(d1, play);
      assertForecastApprovalEligible(play, forecastSnapshot);
      await d1.batch([
        d1.prepare(`INSERT OR IGNORE INTO play_state_audit
          (id, play_id, transition, reason, from_status, to_status, snapshot_json, changed_at)
          VALUES (?, ?, 'reactivated', 'fresh_selection', 'passed', 'research', ?, ?)`)
          .bind(`${play.id}:reactivated:${play.updatedAt}`, play.id, JSON.stringify({ contractKey: play.contractKey, contract: play.contract }), play.updatedAt),
        d1.prepare(`UPDATE plays SET contract_key = ?, contract_json = ?, forecast_json = ?, primary_reason = ?, picked_by = ?,
          title = ?, legs = ?, book = ?, american_odds = ?, stake_cents = ?, model_edge_pp = ?,
          estimated_ev_percent = ?, confidence = ?, stats_case = ?, football_case = ?,
          execution_status = ?, cash_placement_confirmed = 0,
          gabe_approved = ?, jarrett_approved = ?, status = 'research', created_by = ?, created_at = ?, updated_at = ?
          WHERE id = ? AND status = 'passed'`)
          .bind(
            play.contractKey ?? "", JSON.stringify(play.contract ?? []), JSON.stringify(forecastSnapshot), play.primaryReason, play.pickedBy,
            play.title, play.legs, play.book, play.americanOdds, play.stakeCents, play.modelEdgePp,
            play.estimatedEvPercent, play.confidence, play.statsCase, play.footballCase, play.executionStatus,
            actor === "gabe" ? 1 : 0, actor === "jarrett" ? 1 : 0, play.createdBy,
            play.createdAt, play.updatedAt, play.id
          )
      ]);
      const saved = (await getPlay(play.id))!;
      await notifyMissingApprover(d1, saved);
      return saved;
    }
    if (current.status !== "research") return current;
    assertStoredPlayContract(current);
    const confirmationError = executionApprovalConfirmationError(
      current.executionStatus,
      play.cashPlacementConfirmed,
      true
    );
    if (confirmationError) throw new Error(confirmationError);
    await assertApprovalContractCurrent(d1, current);
    await assertPortfolioAvailable(d1, current);
    const forecastSnapshot = await capturePlayForecastSnapshot(d1, current);
    assertForecastApprovalEligible(current, forecastSnapshot);
    const approval = d1.prepare(`UPDATE plays SET
      gabe_approved = CASE WHEN ? = 'gabe' THEN 1 ELSE gabe_approved END,
      jarrett_approved = CASE WHEN ? = 'jarrett' THEN 1 ELSE jarrett_approved END,
      status = CASE WHEN (gabe_approved = 1 OR ? = 'gabe') AND (jarrett_approved = 1 OR ? = 'jarrett') THEN 'card' ELSE 'research' END,
      forecast_json = ?, updated_at = ? WHERE id = ? AND status = 'research'`)
      .bind(actor, actor, actor, actor, JSON.stringify(forecastSnapshot), play.updatedAt, play.id);
    const statements = [approval];
    if (current.executionStatus === "executed") {
      statements.push(d1.prepare(`UPDATE plays SET status = 'placed', cash_placement_confirmed = 1, updated_at = ?
        WHERE id = ? AND status = 'card' AND result = 'pending' AND execution_status = 'executed'
          AND gabe_approved = 1 AND jarrett_approved = 1`).bind(play.updatedAt, play.id));
    }
    await d1.batch(statements);
    const saved = (await getPlay(play.id))!;
    await notifyMissingApprover(d1, saved);
    return saved;
  }
  const confirmationError = executionApprovalConfirmationError(
    play.executionStatus,
    play.cashPlacementConfirmed,
    false
  );
  if (confirmationError) throw new Error(confirmationError);
  await assertApprovalWindowOpen(d1, play, play.updatedAt);
  await assertApprovalContractCurrent(d1, play);
  const forecastSnapshot = await capturePlayForecastSnapshot(d1, play);
  assertForecastApprovalEligible(play, forecastSnapshot);
  await d1.prepare(INSERT_PLAY_SQL).bind(
    play.id, play.contractKey ?? "", JSON.stringify(play.contract ?? []), JSON.stringify(forecastSnapshot), actor === "gabe" ? 1 : 0, actor === "jarrett" ? 1 : 0,
    play.season, play.week, play.gameId, play.playType, play.market, play.primaryReason, play.pickedBy, play.title, play.legs, play.book,
    play.americanOdds, play.stakeCents, play.modelEdgePp, play.estimatedEvPercent,
    play.confidence, play.statsCase, play.footballCase, play.executionStatus, play.cashPlacementConfirmed ? 1 : 0, "research", play.result,
    play.profitCents, play.closingClvCents, play.closingClvPoints, play.clvReferenceBook, play.createdBy, play.createdAt, play.updatedAt
  ).run();
  await d1.prepare(`UPDATE plays SET
    gabe_approved = CASE WHEN ? = 'gabe' THEN 1 ELSE gabe_approved END,
    jarrett_approved = CASE WHEN ? = 'jarrett' THEN 1 ELSE jarrett_approved END,
    status = CASE WHEN (gabe_approved = 1 OR ? = 'gabe') AND (jarrett_approved = 1 OR ? = 'jarrett') THEN 'card' ELSE 'research' END,
    updated_at = ? WHERE id = ?`)
    .bind(actor, actor, actor, actor, play.updatedAt, play.id).run();
  const saved = (await getPlay(play.id))!;
  await notifyMissingApprover(d1, saved);
  return saved;
}

export async function confirmCashPlacement(id: string, updatedAt: string): Promise<WeeklyPlay> {
  const d1 = getD1();
  await ensurePlayStore(d1);
  const updated = await d1.prepare(`UPDATE plays SET status = 'placed', cash_placement_confirmed = 1, updated_at = ?
    WHERE id = ? AND status = 'card' AND result = 'pending' AND execution_status = 'executed'
      AND gabe_approved = 1 AND jarrett_approved = 1`)
    .bind(updatedAt, id).run();
  const row = await d1.prepare("SELECT * FROM plays WHERE id = ?").bind(id).first<PlayDatabaseRow>();
  const play = row ? mapRow(row) : null;
  if (play?.status === "placed" && play.executionStatus === "executed" && play.cashPlacementConfirmed) return play;
  if (Number(updated.meta.changes ?? 0) === 0) {
    throw new Error("Cash placement requires an open, jointly approved card");
  }
  throw new Error("Cash placement could not be confirmed");
}

export async function updatePlayResult(
  id: string,
  update: Pick<WeeklyPlay, "status" | "result" | "profitCents" | "closingClvCents" | "closingClvPoints" | "clvReferenceBook" | "updatedAt">
): Promise<WeeklyPlay | null> {
  await ensurePlayStore();
  await getD1().prepare(`
    UPDATE plays
    SET status = ?,
        result = ?,
        profit_cents = ?,
        closing_clv_cents = ?,
        closing_clv_points = ?,
        clv_reference_book = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(update.status, update.result, update.profitCents, update.closingClvCents, update.closingClvPoints,
    update.clvReferenceBook, update.updatedAt, id).run();
  const row = await getD1().prepare("SELECT * FROM plays WHERE id = ?").bind(id).first<PlayDatabaseRow>();
  return row ? mapRow(row) : null;
}
