import type { NflverseGame, PlayerSnapCount, PlayerWeekStat, TeamGameFeature } from "./transform";
import { assertD1SchemaAuthority } from "@/server/schema-authority";

export type ImportFreshness = "current" | "stale" | "running" | "unavailable";

export interface NflverseImportState {
  dataset: string;
  freshness: ImportFreshness;
  sourceUrl: string | null;
  sourceTag: string | null;
  sourceHash: string | null;
  rowCount: number;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  leaseExpiresAt: string | null;
}

interface ImportStateRow {
  dataset: string;
  freshness: ImportFreshness;
  source_url: string | null;
  source_tag: string | null;
  source_hash: string | null;
  row_count: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  lease_expires_at: string | null;
}


const gameColumns = [
  "game_id", "season", "season_type", "week", "game_date", "game_time", "weekday", "away_team",
  "away_score", "home_team", "home_score", "location", "result", "total", "overtime", "away_rest",
  "home_rest", "away_moneyline", "home_moneyline", "spread_line", "away_spread_odds", "home_spread_odds",
  "total_line", "under_odds", "over_odds", "division_game", "roof", "surface", "temperature", "wind",
  "away_qb_id", "home_qb_id", "away_qb_name", "home_qb_name", "away_coach", "home_coach", "referee",
  "stadium_id", "stadium", "source_row_hash"
] as const;

const featureColumns = [
  "id", "game_id", "season", "season_type", "week", "game_date", "team", "opponent", "home_away",
  "plays", "epa_per_play", "success_rate", "explosive_rate", "turnovers", "turnover_rate",
  "seconds_per_play", "dropbacks", "pass_rate", "expected_pass_rate", "pass_rate_over_expectation"
] as const;

const playerStatColumns = [
  "id", "player_id", "player_name", "player_display_name", "position", "season", "week", "season_type",
  "game_id", "team", "opponent_team", "attempts", "passing_yards", "carries", "rushing_yards",
  "receptions", "targets", "receiving_yards"
] as const;

const snapCountColumns = [
  "id", "game_id", "season", "game_type", "week", "player", "position", "team", "opponent",
  "offense_snaps", "defense_snaps", "special_teams_snaps"
] as const;

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function mapState(row: ImportStateRow): NflverseImportState {
  return {
    dataset: row.dataset,
    freshness: row.freshness,
    sourceUrl: row.source_url,
    sourceTag: row.source_tag,
    sourceHash: row.source_hash,
    rowCount: row.row_count,
    lastCheckedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    leaseExpiresAt: row.lease_expires_at
  };
}

export async function ensureNflverseStore(db: D1Database): Promise<void> {
  await assertD1SchemaAuthority(db);
}

export async function listNflverseImportStates(db: D1Database): Promise<NflverseImportState[]> {
  const result = await db.prepare("SELECT * FROM nflverse_import_state ORDER BY dataset").all<ImportStateRow>();
  return result.results.map(mapState);
}

export async function getNflverseImportState(
  db: D1Database,
  dataset: string
): Promise<NflverseImportState | null> {
  const row = await db.prepare("SELECT * FROM nflverse_import_state WHERE dataset = ?").bind(dataset).first<ImportStateRow>();
  return row ? mapState(row) : null;
}

export async function acquireImportLease(input: {
  db: D1Database;
  dataset: string;
  sourceUrl: string;
  checkedAt: string;
  leaseMilliseconds?: number;
}): Promise<boolean> {
  await ensureNflverseStore(input.db);
  const leaseExpiresAt = new Date(new Date(input.checkedAt).getTime() + (input.leaseMilliseconds ?? 15 * 60_000)).toISOString();
  const result = await input.db.prepare(`
    INSERT INTO nflverse_import_state (
      dataset, freshness, source_url, row_count, last_checked_at, lease_expires_at
    ) VALUES (?, 'running', ?, 0, ?, ?)
    ON CONFLICT(dataset) DO UPDATE SET
      freshness = 'running',
      source_url = excluded.source_url,
      last_checked_at = excluded.last_checked_at,
      last_error = NULL,
      lease_expires_at = excluded.lease_expires_at
    WHERE nflverse_import_state.lease_expires_at IS NULL
       OR nflverse_import_state.lease_expires_at < excluded.last_checked_at
  `).bind(input.dataset, input.sourceUrl, input.checkedAt, leaseExpiresAt).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function completeUnchangedImport(input: {
  db: D1Database;
  dataset: string;
  checkedAt: string;
  sourceTag: string | null;
}): Promise<void> {
  await input.db.batch([
    input.db.prepare(`UPDATE nflverse_import_state SET
      freshness = 'current', source_tag = COALESCE(?, source_tag), last_checked_at = ?,
      last_error = NULL, lease_expires_at = NULL
      WHERE dataset = ?`).bind(input.sourceTag, input.checkedAt, input.dataset),
    input.db.prepare("UPDATE nflverse_import_alerts SET resolved_at = ? WHERE dataset = ? AND resolved_at IS NULL")
      .bind(input.checkedAt, input.dataset)
  ]);
}

export async function recordImportSuccess(input: {
  db: D1Database;
  dataset: string;
  sourceUrl: string;
  sourceTag: string | null;
  sourceHash: string;
  rowCount: number;
  importedAt: string;
}): Promise<void> {
  await input.db.batch([
    input.db.prepare(`UPDATE nflverse_import_state SET
      freshness = 'current', source_url = ?, source_tag = ?, source_hash = ?, row_count = ?,
      last_checked_at = ?, last_success_at = ?, last_error = NULL, lease_expires_at = NULL
      WHERE dataset = ?`).bind(
        input.sourceUrl, input.sourceTag, input.sourceHash, input.rowCount,
        input.importedAt, input.importedAt, input.dataset
      ),
    input.db.prepare("UPDATE nflverse_import_alerts SET resolved_at = ? WHERE dataset = ? AND resolved_at IS NULL")
      .bind(input.importedAt, input.dataset)
  ]);
}

function gameValues(importId: string, game: NflverseGame): unknown[] {
  return [
    importId, game.gameId, game.season, game.seasonType, game.week, game.gameDate, game.gameTime,
    game.weekday, game.awayTeam, game.awayScore, game.homeTeam, game.homeScore, game.location,
    game.result, game.total, game.overtime ? 1 : 0, game.awayRest, game.homeRest, game.awayMoneyline,
    game.homeMoneyline, game.spreadLine, game.awaySpreadOdds, game.homeSpreadOdds, game.totalLine,
    game.underOdds, game.overOdds, game.divisionGame ? 1 : 0, game.roof, game.surface, game.temperature,
    game.wind, game.awayQbId, game.homeQbId, game.awayQbName, game.homeQbName, game.awayCoach,
    game.homeCoach, game.referee, game.stadiumId, game.stadium, game.sourceRowHash
  ];
}

export async function publishSchedules(input: {
  db: D1Database;
  dataset: string;
  games: readonly NflverseGame[];
  sourceUrl: string;
  sourceTag: string | null;
  sourceHash: string;
  importedAt: string;
}): Promise<void> {
  const importId = `${input.dataset}:${input.sourceHash.slice(0, 16)}`;
  await input.db.prepare("DELETE FROM nfl_games_stage WHERE import_id = ?").bind(importId).run();
  const placeholders = Array.from({ length: gameColumns.length + 1 }, () => "?").join(", ");
  const insert = `INSERT OR REPLACE INTO nfl_games_stage (import_id, ${gameColumns.join(", ")}) VALUES (${placeholders})`;
  for (const batch of chunks(input.games, 200)) {
    await input.db.batch(batch.map((game) => input.db.prepare(insert).bind(...gameValues(importId, game))));
  }
  const updateColumns = gameColumns.slice(1).map((column) => `${column} = excluded.${column}`).join(", ");
  await input.db.batch([
    input.db.prepare(`INSERT INTO nfl_games (${gameColumns.join(", ")}, imported_at)
      SELECT ${gameColumns.join(", ")}, ? FROM nfl_games_stage WHERE import_id = ?
      ON CONFLICT(game_id) DO UPDATE SET ${updateColumns}, imported_at = excluded.imported_at
      WHERE nfl_games.source_row_hash <> excluded.source_row_hash`).bind(input.importedAt, importId),
    input.db.prepare(`UPDATE nflverse_import_state SET
      freshness = 'current', source_url = ?, source_tag = ?, source_hash = ?, row_count = ?,
      last_checked_at = ?, last_success_at = ?, last_error = NULL, lease_expires_at = NULL
      WHERE dataset = ?`).bind(
        input.sourceUrl, input.sourceTag, input.sourceHash, input.games.length,
        input.importedAt, input.importedAt, input.dataset
      ),
    input.db.prepare("DELETE FROM nfl_games_stage WHERE import_id = ?").bind(importId),
    input.db.prepare("UPDATE nflverse_import_alerts SET resolved_at = ? WHERE dataset = ? AND resolved_at IS NULL")
      .bind(input.importedAt, input.dataset)
  ]);
}

function featureValues(importId: string, feature: TeamGameFeature): unknown[] {
  return [
    importId, feature.id, feature.gameId, feature.season, feature.seasonType, feature.week,
    feature.gameDate, feature.team, feature.opponent, feature.homeAway, feature.plays,
    feature.epaPerPlay, feature.successRate, feature.explosiveRate, feature.turnovers,
    feature.turnoverRate, feature.secondsPerPlay, feature.dropbacks, feature.passRate,
    feature.expectedPassRate, feature.passRateOverExpectation
  ];
}

export async function publishTeamGameFeatures(input: {
  db: D1Database;
  dataset: string;
  features: readonly TeamGameFeature[];
  sourceUrl: string;
  sourceTag: string | null;
  sourceHash: string;
  importedAt: string;
}): Promise<void> {
  const importId = `${input.dataset}:${input.sourceHash.slice(0, 16)}`;
  await input.db.prepare("DELETE FROM nfl_team_game_features_stage WHERE import_id = ?").bind(importId).run();
  const placeholders = Array.from({ length: featureColumns.length + 1 }, () => "?").join(", ");
  const insert = `INSERT OR REPLACE INTO nfl_team_game_features_stage (import_id, ${featureColumns.join(", ")}) VALUES (${placeholders})`;
  for (const batch of chunks(input.features, 200)) {
    await input.db.batch(batch.map((feature) => input.db.prepare(insert).bind(...featureValues(importId, feature))));
  }
  const updateColumns = featureColumns.slice(1).map((column) => `${column} = excluded.${column}`).join(", ");
  await input.db.batch([
    input.db.prepare(`INSERT INTO nfl_team_game_features (${featureColumns.join(", ")}, source_hash, imported_at)
      SELECT ${featureColumns.join(", ")}, ?, ? FROM nfl_team_game_features_stage WHERE import_id = ?
      ON CONFLICT(id) DO UPDATE SET ${updateColumns}, source_hash = excluded.source_hash,
      imported_at = excluded.imported_at
      WHERE nfl_team_game_features.source_hash <> excluded.source_hash`).bind(input.sourceHash, input.importedAt, importId),
    input.db.prepare(`UPDATE nflverse_import_state SET
      freshness = 'current', source_url = ?, source_tag = ?, source_hash = ?, row_count = ?,
      last_checked_at = ?, last_success_at = ?, last_error = NULL, lease_expires_at = NULL
      WHERE dataset = ?`).bind(
        input.sourceUrl, input.sourceTag, input.sourceHash, input.features.length,
        input.importedAt, input.importedAt, input.dataset
      ),
    input.db.prepare("DELETE FROM nfl_team_game_features_stage WHERE import_id = ?").bind(importId),
    input.db.prepare("UPDATE nflverse_import_alerts SET resolved_at = ? WHERE dataset = ? AND resolved_at IS NULL")
      .bind(input.importedAt, input.dataset)
  ]);
}

function playerStatValues(importId: string, stat: PlayerWeekStat): unknown[] {
  return [
    importId, stat.id, stat.playerId, stat.playerName, stat.playerDisplayName, stat.position,
    stat.season, stat.week, stat.seasonType, stat.gameId, stat.team, stat.opponent,
    stat.attempts, stat.passingYards, stat.carries, stat.rushingYards, stat.receptions,
    stat.targets, stat.receivingYards
  ];
}

export async function publishPlayerWeekStats(input: {
  db: D1Database;
  dataset: string;
  stats: readonly PlayerWeekStat[];
  sourceUrl: string;
  sourceTag: string | null;
  sourceHash: string;
  importedAt: string;
}): Promise<void> {
  const importId = `${input.dataset}:${input.sourceHash.slice(0, 16)}`;
  await input.db.prepare("DELETE FROM nfl_player_week_stats_stage WHERE import_id = ?").bind(importId).run();
  const placeholders = Array.from({ length: playerStatColumns.length + 1 }, () => "?").join(", ");
  const insert = `INSERT OR REPLACE INTO nfl_player_week_stats_stage (import_id, ${playerStatColumns.join(", ")}) VALUES (${placeholders})`;
  for (const batch of chunks(input.stats, 150)) {
    await input.db.batch(batch.map((stat) => input.db.prepare(insert).bind(...playerStatValues(importId, stat))));
  }
  const updateColumns = playerStatColumns.slice(1).map((column) => `${column} = excluded.${column}`).join(", ");
  await input.db.batch([
    input.db.prepare(`INSERT INTO nfl_player_week_stats (${playerStatColumns.join(", ")}, source_hash, imported_at)
      SELECT ${playerStatColumns.join(", ")}, ?, ? FROM nfl_player_week_stats_stage WHERE import_id = ?
      ON CONFLICT(id) DO UPDATE SET ${updateColumns}, source_hash = excluded.source_hash,
      imported_at = excluded.imported_at
      WHERE nfl_player_week_stats.source_hash <> excluded.source_hash`).bind(input.sourceHash, input.importedAt, importId),
    input.db.prepare(`UPDATE nflverse_import_state SET
      freshness = 'current', source_url = ?, source_tag = ?, source_hash = ?, row_count = ?,
      last_checked_at = ?, last_success_at = ?, last_error = NULL, lease_expires_at = NULL
      WHERE dataset = ?`).bind(
        input.sourceUrl, input.sourceTag, input.sourceHash, input.stats.length,
        input.importedAt, input.importedAt, input.dataset
      ),
    input.db.prepare("DELETE FROM nfl_player_week_stats_stage WHERE import_id = ?").bind(importId),
    input.db.prepare("UPDATE nflverse_import_alerts SET resolved_at = ? WHERE dataset = ? AND resolved_at IS NULL")
      .bind(input.importedAt, input.dataset)
  ]);
}

function snapCountValues(importId: string, count: PlayerSnapCount): unknown[] {
  return [
    importId, count.id, count.gameId, count.season, count.gameType, count.week, count.player,
    count.position, count.team, count.opponent, count.offenseSnaps, count.defenseSnaps, count.specialTeamsSnaps
  ];
}

export async function publishPlayerSnapCounts(input: {
  db: D1Database;
  dataset: string;
  counts: readonly PlayerSnapCount[];
  sourceUrl: string;
  sourceTag: string | null;
  sourceHash: string;
  importedAt: string;
}): Promise<void> {
  const importId = `${input.dataset}:${input.sourceHash.slice(0, 16)}`;
  await input.db.prepare("DELETE FROM nfl_player_snap_counts_stage WHERE import_id = ?").bind(importId).run();
  const placeholders = Array.from({ length: snapCountColumns.length + 1 }, () => "?").join(", ");
  const insert = `INSERT OR REPLACE INTO nfl_player_snap_counts_stage (import_id, ${snapCountColumns.join(", ")}) VALUES (${placeholders})`;
  for (const batch of chunks(input.counts, 175)) {
    await input.db.batch(batch.map((count) => input.db.prepare(insert).bind(...snapCountValues(importId, count))));
  }
  const updateColumns = snapCountColumns.slice(1).map((column) => `${column} = excluded.${column}`).join(", ");
  const season = input.counts[0]?.season;
  if (season === undefined) throw new Error("Cannot publish an empty nflverse snap-count dataset");
  await input.db.batch([
    input.db.prepare(`DELETE FROM nfl_player_snap_counts WHERE season = ?
      AND id NOT IN (SELECT id FROM nfl_player_snap_counts_stage WHERE import_id = ?)`)
      .bind(season, importId),
    input.db.prepare(`INSERT INTO nfl_player_snap_counts (${snapCountColumns.join(", ")}, source_hash, imported_at)
      SELECT ${snapCountColumns.join(", ")}, ?, ? FROM nfl_player_snap_counts_stage WHERE import_id = ?
      ON CONFLICT(id) DO UPDATE SET ${updateColumns}, source_hash = excluded.source_hash,
      imported_at = excluded.imported_at
      WHERE nfl_player_snap_counts.source_hash <> excluded.source_hash`).bind(input.sourceHash, input.importedAt, importId),
    input.db.prepare(`UPDATE nflverse_import_state SET
      freshness = 'current', source_url = ?, source_tag = ?, source_hash = ?, row_count = ?,
      last_checked_at = ?, last_success_at = ?, last_error = NULL, lease_expires_at = NULL
      WHERE dataset = ?`).bind(
        input.sourceUrl, input.sourceTag, input.sourceHash, input.counts.length,
        input.importedAt, input.importedAt, input.dataset
      ),
    input.db.prepare("DELETE FROM nfl_player_snap_counts_stage WHERE import_id = ?").bind(importId),
    input.db.prepare("UPDATE nflverse_import_alerts SET resolved_at = ? WHERE dataset = ? AND resolved_at IS NULL")
      .bind(input.importedAt, input.dataset)
  ]);
}

export async function markImportUnavailable(input: {
  db: D1Database;
  dataset: string;
  checkedAt: string;
  message: string;
}): Promise<void> {
  await input.db.prepare(`UPDATE nflverse_import_state SET
    freshness = 'unavailable', last_checked_at = ?, last_error = ?, lease_expires_at = NULL
    WHERE dataset = ?`).bind(input.checkedAt, input.message, input.dataset).run();
}

export async function failNflverseImport(input: {
  db: D1Database;
  dataset: string;
  failedAt: string;
  message: string;
}): Promise<void> {
  const bucket = input.failedAt.slice(0, 13);
  await input.db.batch([
    input.db.prepare(`UPDATE nflverse_import_state SET
      freshness = 'stale', last_checked_at = ?, last_error = ?, lease_expires_at = NULL
      WHERE dataset = ?`).bind(input.failedAt, input.message, input.dataset),
    input.db.prepare(`INSERT OR IGNORE INTO nflverse_import_alerts
      (id, dataset, message, created_at) VALUES (?, ?, ?, ?)`).bind(
        `${input.dataset}:${bucket}`, input.dataset, input.message, input.failedAt
      )
  ]);
}
