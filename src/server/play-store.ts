import { getD1 } from "../../db";
import type { WeeklyPlay } from "@/domain/play-card";
import { rehearsalPlays } from "@/lib/play-data";

type PlayDatabaseRow = {
  id: string;
  season: number;
  week: number;
  play_type: WeeklyPlay["playType"];
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
  status: WeeklyPlay["status"];
  result: WeeklyPlay["result"];
  profit_cents: number;
  closing_clv_cents: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const CREATE_PLAYS_SQL = `
  CREATE TABLE IF NOT EXISTS plays (
    id text PRIMARY KEY NOT NULL,
    season integer DEFAULT 2026 NOT NULL,
    week integer NOT NULL,
    play_type text NOT NULL,
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
    status text DEFAULT 'card' NOT NULL,
    result text DEFAULT 'pending' NOT NULL,
    profit_cents integer DEFAULT 0 NOT NULL,
    closing_clv_cents real,
    created_by text NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    CHECK (play_type IN ('single', 'parlay', 'teaser')),
    CHECK (confidence IN ('watch', 'lean', 'play', 'best')),
    CHECK (status IN ('research', 'card', 'placed', 'settled', 'passed')),
    CHECK (result IN ('pending', 'win', 'loss', 'push', 'void')),
    CHECK (stake_cents >= 1250)
  )
`;

const INSERT_PLAY_SQL = `
  INSERT OR IGNORE INTO plays (
    id, season, week, play_type, title, legs, book, american_odds, stake_cents,
    model_edge_pp, estimated_ev_percent, confidence, stats_case, football_case,
    status, result, profit_cents, closing_clv_cents, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function mapRow(row: PlayDatabaseRow): WeeklyPlay {
  return {
    id: row.id,
    season: row.season,
    week: row.week,
    playType: row.play_type,
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
    status: row.status,
    result: row.result,
    profitCents: row.profit_cents,
    closingClvCents: row.closing_clv_cents,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function ensurePlayStore(): Promise<void> {
  const d1 = getD1();
  await d1.prepare(CREATE_PLAYS_SQL).run();
  await d1.batch([
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_plays_season_week_status ON plays (season, week, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_plays_created_at ON plays (created_at)")
  ]);
  const count = await d1.prepare("SELECT count(*) AS count FROM plays").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;
  await d1.batch(rehearsalPlays.map((play) => d1.prepare(INSERT_PLAY_SQL).bind(
    play.id, play.season, play.week, play.playType, play.title, play.legs, play.book,
    play.americanOdds, play.stakeCents, play.modelEdgePp, play.estimatedEvPercent,
    play.confidence, play.statsCase, play.footballCase, play.status, play.result,
    play.profitCents, play.closingClvCents, play.createdBy, play.createdAt, play.updatedAt
  )));
  await d1.prepare("PRAGMA optimize").run();
}

export async function listPlays(week = 1): Promise<WeeklyPlay[]> {
  await ensurePlayStore();
  const result = await getD1().prepare(
    "SELECT * FROM plays WHERE season = 2026 AND week = ? ORDER BY created_at ASC"
  ).bind(week).all<PlayDatabaseRow>();
  return result.results.map(mapRow);
}

export async function addPlay(play: WeeklyPlay): Promise<WeeklyPlay> {
  await ensurePlayStore();
  await getD1().prepare(INSERT_PLAY_SQL).bind(
    play.id, play.season, play.week, play.playType, play.title, play.legs, play.book,
    play.americanOdds, play.stakeCents, play.modelEdgePp, play.estimatedEvPercent,
    play.confidence, play.statsCase, play.footballCase, play.status, play.result,
    play.profitCents, play.closingClvCents, play.createdBy, play.createdAt, play.updatedAt
  ).run();
  return play;
}

export async function updatePlayResult(
  id: string,
  update: Pick<WeeklyPlay, "status" | "result" | "profitCents" | "closingClvCents" | "updatedAt">
): Promise<WeeklyPlay | null> {
  await ensurePlayStore();
  await getD1().prepare(`
    UPDATE plays
    SET status = ?, result = ?, profit_cents = ?, closing_clv_cents = ?, updated_at = ?
    WHERE id = ?
  `).bind(update.status, update.result, update.profitCents, update.closingClvCents, update.updatedAt, id).run();
  const row = await getD1().prepare("SELECT * FROM plays WHERE id = ?").bind(id).first<PlayDatabaseRow>();
  return row ? mapRow(row) : null;
}
