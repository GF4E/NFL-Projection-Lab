import { getD1 } from "../../db";
import { isTeamApproved, storedLegMatchesQuote, type PickedBy, type WeeklyPlay } from "@/domain/play-card";

type PlayDatabaseRow = {
  id: string;
  contract_key: string;
  contract_json: string;
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

const CREATE_PLAYS_SQL = `
  CREATE TABLE IF NOT EXISTS plays (
    id text PRIMARY KEY NOT NULL,
    contract_key text DEFAULT '' NOT NULL,
    contract_json text DEFAULT '[]' NOT NULL,
    gabe_approved integer DEFAULT 0 NOT NULL,
    jarrett_approved integer DEFAULT 0 NOT NULL,
    season integer DEFAULT 2026 NOT NULL,
    week integer NOT NULL,
    game_id text DEFAULT '' NOT NULL,
    play_type text NOT NULL,
    market text DEFAULT 'spread' NOT NULL,
    primary_reason text DEFAULT 'other' NOT NULL,
    picked_by text DEFAULT 'gabe' NOT NULL,
    title text NOT NULL,
    legs text DEFAULT '' NOT NULL,
    book text NOT NULL,
    american_odds integer NOT NULL,
    stake_cents integer NOT NULL,
    model_edge_pp real NOT NULL,
    estimated_ev_percent real NOT NULL,
    confidence text NOT NULL,
    stats_case text NOT NULL,
    football_case text DEFAULT 'Awaiting football read' NOT NULL,
    execution_status text DEFAULT 'paper' NOT NULL,
    cash_placement_confirmed integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'card' NOT NULL,
    result text DEFAULT 'pending' NOT NULL,
    profit_cents integer DEFAULT 0 NOT NULL,
    closing_clv_cents real,
    closing_clv_points real,
    clv_reference_book text,
    created_by text NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    CHECK (play_type IN ('single', 'parlay', 'teaser')),
    CHECK (confidence IN ('watch', 'lean', 'play', 'best')),
    CHECK (execution_status IN ('paper', 'executed')),
    CHECK (status IN ('research', 'card', 'placed', 'settled', 'passed')),
    CHECK (result IN ('pending', 'win', 'loss', 'push', 'void')),
    CHECK (stake_cents >= 1250)
  )
`;

const INSERT_PLAY_SQL = `
  INSERT OR IGNORE INTO plays (
    id, contract_key, contract_json, gabe_approved, jarrett_approved, season, week, game_id, play_type, market, primary_reason, picked_by, title, legs, book, american_odds, stake_cents,
    model_edge_pp, estimated_ev_percent, confidence, stats_case, football_case, execution_status, cash_placement_confirmed,
    status, result, profit_cents, closing_clv_cents, closing_clv_points, clv_reference_book, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

function mapRow(row: PlayDatabaseRow): WeeklyPlay {
  return {
    id: row.id,
    contractKey: row.contract_key,
    contract: contractFor(row),
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

export async function ensurePlayStore(d1: D1Database = getD1()): Promise<void> {
  await d1.prepare(CREATE_PLAYS_SQL).run();
  const columns = await d1.prepare("PRAGMA table_info(plays)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const upgrades: D1PreparedStatement[] = [];
  if (!names.has("game_id")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN game_id text DEFAULT '' NOT NULL"));
  if (!names.has("market")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN market text DEFAULT 'spread' NOT NULL"));
  if (!names.has("primary_reason")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN primary_reason text DEFAULT 'other' NOT NULL"));
  if (!names.has("picked_by")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN picked_by text DEFAULT 'gabe' NOT NULL"));
  if (!names.has("contract_key")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN contract_key text DEFAULT '' NOT NULL"));
  if (!names.has("contract_json")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN contract_json text DEFAULT '[]' NOT NULL"));
  if (!names.has("gabe_approved")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN gabe_approved integer DEFAULT 0 NOT NULL"));
  if (!names.has("jarrett_approved")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN jarrett_approved integer DEFAULT 0 NOT NULL"));
  if (!names.has("execution_status")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN execution_status text DEFAULT 'paper' NOT NULL"));
  if (!names.has("cash_placement_confirmed")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN cash_placement_confirmed integer DEFAULT 0 NOT NULL"));
  if (!names.has("closing_clv_points")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN closing_clv_points real"));
  if (!names.has("clv_reference_book")) upgrades.push(d1.prepare("ALTER TABLE plays ADD COLUMN clv_reference_book text"));
  if (upgrades.length) await d1.batch(upgrades);
  await d1.batch([
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_plays_season_week_status ON plays (season, week, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_plays_created_at ON plays (created_at)")
  ]);
  await d1.prepare("PRAGMA optimize").run();
}

export async function listPlays(week?: number): Promise<WeeklyPlay[]> {
  await ensurePlayStore();
  const statement = week === undefined
    ? getD1().prepare("SELECT * FROM plays WHERE season = 2026 AND game_id <> '' ORDER BY week, created_at ASC")
    : getD1().prepare("SELECT * FROM plays WHERE season = 2026 AND week = ? AND game_id <> '' ORDER BY created_at ASC").bind(week);
  const result = await statement.all<PlayDatabaseRow>();
  return result.results.map(mapRow);
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
      const quote = await d1.prepare("SELECT point, american_price FROM player_prop_quotes WHERE id = ?")
        .bind(leg.sourceQuoteId).first<{ point: number; american_price: number }>();
      if (!quote || !storedLegMatchesQuote(leg, { point: quote.point, americanPrice: quote.american_price })) {
        throw new Error("A player-prop point or price changed. Refresh the card; both approvals must restart.");
      }
      continue;
    }
    const quote = await d1.prepare("SELECT point, american_price FROM live_lines WHERE id = ?")
      .bind(leg.sourceQuoteId).first<{ point: number | null; american_price: number }>();
    if (!quote || !storedLegMatchesQuote(leg, { point: quote.point, americanPrice: quote.american_price })) {
      throw new Error("A point or price changed. Refresh the card; both approvals must restart.");
    }
  }
}

export async function addOrApprovePlay(play: WeeklyPlay, actor: PickedBy): Promise<WeeklyPlay> {
  await ensurePlayStore();
  const d1 = getD1();
  const existing = await d1.prepare("SELECT * FROM plays WHERE id = ?").bind(play.id).first<PlayDatabaseRow>();
  if (existing) {
    const current = mapRow(existing);
    if (!current.approvals?.includes(actor) && !isTeamApproved(current.approvals)) {
      await assertApprovalContractCurrent(d1, current);
    }
    await d1.prepare(`UPDATE plays SET
      gabe_approved = CASE WHEN ? = 'gabe' THEN 1 ELSE gabe_approved END,
      jarrett_approved = CASE WHEN ? = 'jarrett' THEN 1 ELSE jarrett_approved END,
      status = CASE WHEN (gabe_approved = 1 OR ? = 'gabe') AND (jarrett_approved = 1 OR ? = 'jarrett') THEN 'card' ELSE 'research' END,
      updated_at = ? WHERE id = ?`)
      .bind(actor, actor, actor, actor, play.updatedAt, play.id).run();
    return (await getPlay(play.id))!;
  }
  await d1.prepare(INSERT_PLAY_SQL).bind(
    play.id, play.contractKey ?? "", JSON.stringify(play.contract ?? []), actor === "gabe" ? 1 : 0, actor === "jarrett" ? 1 : 0,
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
  return (await getPlay(play.id))!;
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
        execution_status = CASE WHEN ? = 'placed' THEN 'executed' ELSE execution_status END,
        cash_placement_confirmed = CASE WHEN ? = 'placed' THEN 1 ELSE cash_placement_confirmed END,
        updated_at = ?
    WHERE id = ?
  `).bind(update.status, update.result, update.profitCents, update.closingClvCents, update.closingClvPoints,
    update.clvReferenceBook, update.status, update.status, update.updatedAt, id).run();
  const row = await getD1().prepare("SELECT * FROM plays WHERE id = ?").bind(id).first<PlayDatabaseRow>();
  return row ? mapRow(row) : null;
}
