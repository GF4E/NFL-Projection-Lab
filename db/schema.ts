import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const plays = sqliteTable("plays", {
  id: text("id").primaryKey(),
  season: integer("season").notNull().default(2026),
  week: integer("week").notNull(),
  gameId: text("game_id").notNull().default(""),
  playType: text("play_type", { enum: ["single", "parlay", "teaser"] }).notNull(),
  market: text("market").notNull().default("spread"),
  primaryReason: text("primary_reason").notNull().default("other"),
  pickedBy: text("picked_by", { enum: ["gabe", "jarrett"] }).notNull().default("gabe"),
  title: text("title").notNull(),
  legs: text("legs").notNull().default(""),
  book: text("book").notNull(),
  americanOdds: integer("american_odds").notNull(),
  stakeCents: integer("stake_cents").notNull(),
  modelEdgePp: real("model_edge_pp").notNull(),
  estimatedEvPercent: real("estimated_ev_percent").notNull(),
  confidence: text("confidence", { enum: ["watch", "lean", "play", "best"] }).notNull(),
  statsCase: text("stats_case").notNull(),
  footballCase: text("football_case").notNull().default("Awaiting football read"),
  status: text("status", { enum: ["research", "card", "placed", "settled", "passed"] }).notNull().default("card"),
  result: text("result", { enum: ["pending", "win", "loss", "push", "void"] }).notNull().default("pending"),
  profitCents: integer("profit_cents").notNull().default(0),
  closingClvCents: real("closing_clv_cents"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [
  index("idx_plays_season_week_status").on(table.season, table.week, table.status),
  index("idx_plays_created_at").on(table.createdAt),
  check("plays_play_type_check", sql`${table.playType} in ('single', 'parlay', 'teaser')`),
  check("plays_confidence_check", sql`${table.confidence} in ('watch', 'lean', 'play', 'best')`),
  check("plays_status_check", sql`${table.status} in ('research', 'card', 'placed', 'settled', 'passed')`),
  check("plays_result_check", sql`${table.result} in ('pending', 'win', 'loss', 'push', 'void')`),
  check("plays_stake_check", sql`${table.stakeCents} >= 1250`)
]);

export const liveLines = sqliteTable("live_lines", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  book: text("book", { enum: ["betmgm", "fanduel"] }).notNull(),
  market: text("market", { enum: ["spread", "total", "moneyline"] }).notNull(),
  side: text("side").notNull(),
  point: real("point"),
  americanPrice: integer("american_price").notNull(),
  capturedAt: text("captured_at").notNull(),
  sourceEventId: text("source_event_id").notNull(),
  sourceHash: text("source_hash").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [
  index("idx_live_lines_game_book_market").on(table.gameId, table.book, table.market),
  index("idx_live_lines_captured_at").on(table.capturedAt)
]);

export const liveLineSnapshots = sqliteTable("live_line_snapshots", {
  snapshotKey: text("snapshot_key").notNull(),
  lineId: text("line_id").notNull(),
  gameId: text("game_id").notNull(),
  book: text("book", { enum: ["betmgm", "fanduel"] }).notNull(),
  market: text("market", { enum: ["spread", "total", "moneyline"] }).notNull(),
  side: text("side").notNull(),
  point: real("point"),
  americanPrice: integer("american_price").notNull(),
  capturedAt: text("captured_at").notNull(),
  sourceEventId: text("source_event_id").notNull(),
  sourceHash: text("source_hash").notNull(),
  fetchedAt: text("fetched_at").notNull()
}, (table) => [
  primaryKey({ columns: [table.snapshotKey, table.lineId] }),
  index("idx_line_snapshots_game_time").on(table.gameId, table.fetchedAt),
  index("idx_line_snapshots_key").on(table.snapshotKey)
]);

export const playerPropQuotes = sqliteTable("player_prop_quotes", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  eventId: text("event_id").notNull(),
  book: text("book").notNull(),
  market: text("market").notNull(),
  player: text("player").notNull(),
  side: text("side", { enum: ["Over", "Under"] }).notNull(),
  point: real("point").notNull(),
  americanPrice: integer("american_price").notNull(),
  capturedAt: text("captured_at").notNull(),
  sourceHash: text("source_hash").notNull()
}, (table) => [
  index("idx_prop_quotes_game_book").on(table.gameId, table.book),
  index("idx_prop_quotes_contract").on(table.gameId, table.market, table.player, table.point)
]);

export const playerPropScanState = sqliteTable("player_prop_scan_state", {
  gameId: text("game_id").primaryKey(),
  eventId: text("event_id"),
  status: text("status", { enum: ["current", "stale", "unavailable"] }).notNull(),
  lastCheckedAt: text("last_checked_at"),
  lastSuccessAt: text("last_success_at"),
  quotaUsed: integer("quota_used"),
  quotaRemaining: integer("quota_remaining"),
  quotaLastCost: integer("quota_last_cost"),
  message: text("message")
});

export const oddsQuotaState = sqliteTable("odds_quota_state", {
  provider: text("provider").primaryKey(),
  used: integer("used").notNull(),
  remaining: integer("remaining").notNull(),
  lastCost: integer("last_cost").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const oddsAutomationRuns = sqliteTable("odds_automation_runs", {
  snapshotKey: text("snapshot_key").primaryKey(),
  job: text("job").notNull(),
  scheduledFor: text("scheduled_for").notNull(),
  gameId: text("game_id"),
  status: text("status", { enum: ["running", "succeeded", "failed", "skipped"] }).notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  message: text("message"),
  quotaUsed: integer("quota_used")
}, (table) => [
  index("idx_odds_runs_schedule").on(table.scheduledFor, table.status),
  index("idx_odds_runs_game").on(table.gameId, table.scheduledFor)
]);

export const nflverseImportState = sqliteTable("nflverse_import_state", {
  dataset: text("dataset").primaryKey(),
  freshness: text("freshness", { enum: ["current", "stale", "running", "unavailable"] }).notNull(),
  sourceUrl: text("source_url"),
  sourceTag: text("source_tag"),
  sourceHash: text("source_hash"),
  rowCount: integer("row_count").notNull().default(0),
  lastCheckedAt: text("last_checked_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  leaseExpiresAt: text("lease_expires_at")
});

export const nflverseImportAlerts = sqliteTable("nflverse_import_alerts", {
  id: text("id").primaryKey(),
  dataset: text("dataset").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at")
}, (table) => [
  index("idx_nfl_alerts_unresolved").on(table.resolvedAt, table.createdAt)
]);

export const nflGames = sqliteTable("nfl_games", {
  gameId: text("game_id").primaryKey(),
  season: integer("season").notNull(),
  seasonType: text("season_type").notNull(),
  week: integer("week").notNull(),
  gameDate: text("game_date").notNull(),
  gameTime: text("game_time"),
  weekday: text("weekday"),
  awayTeam: text("away_team").notNull(),
  awayScore: integer("away_score"),
  homeTeam: text("home_team").notNull(),
  homeScore: integer("home_score"),
  location: text("location"),
  result: real("result"),
  total: real("total"),
  overtime: integer("overtime", { mode: "boolean" }).notNull(),
  awayRest: integer("away_rest"),
  homeRest: integer("home_rest"),
  awayMoneyline: integer("away_moneyline"),
  homeMoneyline: integer("home_moneyline"),
  spreadLine: real("spread_line"),
  awaySpreadOdds: integer("away_spread_odds"),
  homeSpreadOdds: integer("home_spread_odds"),
  totalLine: real("total_line"),
  underOdds: integer("under_odds"),
  overOdds: integer("over_odds"),
  divisionGame: integer("division_game", { mode: "boolean" }).notNull(),
  roof: text("roof"),
  surface: text("surface"),
  temperature: real("temperature"),
  wind: real("wind"),
  awayQbId: text("away_qb_id"),
  homeQbId: text("home_qb_id"),
  awayQbName: text("away_qb_name"),
  homeQbName: text("home_qb_name"),
  awayCoach: text("away_coach"),
  homeCoach: text("home_coach"),
  referee: text("referee"),
  stadiumId: text("stadium_id"),
  stadium: text("stadium"),
  sourceRowHash: text("source_row_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [
  index("idx_nfl_games_season_week").on(table.season, table.seasonType, table.week),
  index("idx_nfl_games_date").on(table.gameDate)
]);

export const nflTeamGameFeatures = sqliteTable("nfl_team_game_features", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  seasonType: text("season_type").notNull(),
  week: integer("week").notNull(),
  gameDate: text("game_date").notNull(),
  team: text("team").notNull(),
  opponent: text("opponent").notNull(),
  homeAway: text("home_away", { enum: ["home", "away"] }).notNull(),
  plays: integer("plays").notNull(),
  epaPerPlay: real("epa_per_play").notNull(),
  successRate: real("success_rate").notNull(),
  explosiveRate: real("explosive_rate").notNull(),
  turnovers: integer("turnovers").notNull(),
  turnoverRate: real("turnover_rate").notNull(),
  secondsPerPlay: real("seconds_per_play"),
  dropbacks: integer("dropbacks").notNull(),
  passRate: real("pass_rate").notNull(),
  expectedPassRate: real("expected_pass_rate"),
  passRateOverExpectation: real("pass_rate_over_expectation"),
  sourceHash: text("source_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [
  index("idx_nfl_features_season_week").on(table.season, table.seasonType, table.week),
  index("idx_nfl_features_team").on(table.team, table.season, table.week)
]);

export type PlayRow = typeof plays.$inferSelect;
export type NewPlayRow = typeof plays.$inferInsert;
