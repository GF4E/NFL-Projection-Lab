import type { NflverseGame, PlayerSnapCount, PlayerWeekStat, TeamGameFeature } from "./transform";

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

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS nflverse_import_state (
    dataset text PRIMARY KEY NOT NULL,
    freshness text NOT NULL,
    source_url text,
    source_tag text,
    source_hash text,
    row_count integer NOT NULL DEFAULT 0,
    last_checked_at text,
    last_success_at text,
    last_error text,
    lease_expires_at text
  )`,
  `CREATE TABLE IF NOT EXISTS nflverse_import_alerts (
    id text PRIMARY KEY NOT NULL,
    dataset text NOT NULL,
    message text NOT NULL,
    created_at text NOT NULL,
    resolved_at text
  )`,
  `CREATE TABLE IF NOT EXISTS nfl_games (
    game_id text PRIMARY KEY NOT NULL,
    season integer NOT NULL,
    season_type text NOT NULL,
    week integer NOT NULL,
    game_date text NOT NULL,
    game_time text,
    weekday text,
    away_team text NOT NULL,
    away_score integer,
    home_team text NOT NULL,
    home_score integer,
    location text,
    result real,
    total real,
    overtime integer NOT NULL,
    away_rest integer,
    home_rest integer,
    away_moneyline integer,
    home_moneyline integer,
    spread_line real,
    away_spread_odds integer,
    home_spread_odds integer,
    total_line real,
    under_odds integer,
    over_odds integer,
    division_game integer NOT NULL,
    roof text,
    surface text,
    temperature real,
    wind real,
    away_qb_id text,
    home_qb_id text,
    away_qb_name text,
    home_qb_name text,
    away_coach text,
    home_coach text,
    referee text,
    stadium_id text,
    stadium text,
    source_row_hash text NOT NULL,
    imported_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS nfl_games_stage (
    import_id text NOT NULL,
    game_id text NOT NULL,
    season integer NOT NULL,
    season_type text NOT NULL,
    week integer NOT NULL,
    game_date text NOT NULL,
    game_time text,
    weekday text,
    away_team text NOT NULL,
    away_score integer,
    home_team text NOT NULL,
    home_score integer,
    location text,
    result real,
    total real,
    overtime integer NOT NULL,
    away_rest integer,
    home_rest integer,
    away_moneyline integer,
    home_moneyline integer,
    spread_line real,
    away_spread_odds integer,
    home_spread_odds integer,
    total_line real,
    under_odds integer,
    over_odds integer,
    division_game integer NOT NULL,
    roof text,
    surface text,
    temperature real,
    wind real,
    away_qb_id text,
    home_qb_id text,
    away_qb_name text,
    home_qb_name text,
    away_coach text,
    home_coach text,
    referee text,
    stadium_id text,
    stadium text,
    source_row_hash text NOT NULL,
    PRIMARY KEY (import_id, game_id)
  )`,
  `CREATE TABLE IF NOT EXISTS nfl_team_game_features (
    id text PRIMARY KEY NOT NULL,
    game_id text NOT NULL,
    season integer NOT NULL,
    season_type text NOT NULL,
    week integer NOT NULL,
    game_date text NOT NULL,
    team text NOT NULL,
    opponent text NOT NULL,
    home_away text NOT NULL,
    plays integer NOT NULL,
    epa_per_play real NOT NULL,
    success_rate real NOT NULL,
    explosive_rate real NOT NULL,
    turnovers integer NOT NULL,
    turnover_rate real NOT NULL,
    seconds_per_play real,
    dropbacks integer NOT NULL,
    pass_rate real NOT NULL,
    expected_pass_rate real,
    pass_rate_over_expectation real,
    source_hash text NOT NULL,
    imported_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS nfl_team_game_features_stage (
    import_id text NOT NULL,
    id text NOT NULL,
    game_id text NOT NULL,
    season integer NOT NULL,
    season_type text NOT NULL,
    week integer NOT NULL,
    game_date text NOT NULL,
    team text NOT NULL,
    opponent text NOT NULL,
    home_away text NOT NULL,
    plays integer NOT NULL,
    epa_per_play real NOT NULL,
    success_rate real NOT NULL,
    explosive_rate real NOT NULL,
    turnovers integer NOT NULL,
    turnover_rate real NOT NULL,
    seconds_per_play real,
    dropbacks integer NOT NULL,
    pass_rate real NOT NULL,
    expected_pass_rate real,
    pass_rate_over_expectation real,
    PRIMARY KEY (import_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS nfl_player_week_stats (
    id text PRIMARY KEY NOT NULL,
    player_id text NOT NULL,
    player_name text NOT NULL,
    player_display_name text NOT NULL,
    position text,
    season integer NOT NULL,
    week integer NOT NULL,
    season_type text NOT NULL,
    game_id text NOT NULL,
    team text NOT NULL,
    opponent_team text NOT NULL,
    attempts integer NOT NULL,
    passing_yards real NOT NULL,
    carries integer NOT NULL,
    rushing_yards real NOT NULL,
    receptions integer NOT NULL,
    targets integer NOT NULL,
    receiving_yards real NOT NULL,
    source_hash text NOT NULL,
    imported_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS nfl_player_week_stats_stage (
    import_id text NOT NULL,
    id text NOT NULL,
    player_id text NOT NULL,
    player_name text NOT NULL,
    player_display_name text NOT NULL,
    position text,
    season integer NOT NULL,
    week integer NOT NULL,
    season_type text NOT NULL,
    game_id text NOT NULL,
    team text NOT NULL,
    opponent_team text NOT NULL,
    attempts integer NOT NULL,
    passing_yards real NOT NULL,
    carries integer NOT NULL,
    rushing_yards real NOT NULL,
    receptions integer NOT NULL,
    targets integer NOT NULL,
    receiving_yards real NOT NULL,
    PRIMARY KEY (import_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS nfl_player_snap_counts (
    id text PRIMARY KEY NOT NULL,
    game_id text NOT NULL,
    season integer NOT NULL,
    game_type text NOT NULL,
    week integer NOT NULL,
    player text NOT NULL,
    position text,
    team text NOT NULL,
    opponent text NOT NULL,
    offense_snaps integer NOT NULL,
    defense_snaps integer NOT NULL,
    special_teams_snaps integer NOT NULL,
    source_hash text NOT NULL,
    imported_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS nfl_player_snap_counts_stage (
    import_id text NOT NULL,
    id text NOT NULL,
    game_id text NOT NULL,
    season integer NOT NULL,
    game_type text NOT NULL,
    week integer NOT NULL,
    player text NOT NULL,
    position text,
    team text NOT NULL,
    opponent text NOT NULL,
    offense_snaps integer NOT NULL,
    defense_snaps integer NOT NULL,
    special_teams_snaps integer NOT NULL,
    PRIMARY KEY (import_id, id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_nfl_games_season_week ON nfl_games (season, season_type, week)",
  "CREATE INDEX IF NOT EXISTS idx_nfl_games_date ON nfl_games (game_date)",
  "CREATE INDEX IF NOT EXISTS idx_nfl_features_season_week ON nfl_team_game_features (season, season_type, week)",
  "CREATE INDEX IF NOT EXISTS idx_nfl_features_team ON nfl_team_game_features (team, season, week)",
  "CREATE INDEX IF NOT EXISTS idx_nfl_player_stats_name ON nfl_player_week_stats (player_display_name, season, week)",
  "CREATE INDEX IF NOT EXISTS idx_nfl_player_stats_game ON nfl_player_week_stats (game_id)",
  "CREATE INDEX IF NOT EXISTS idx_nfl_snap_counts_game_player ON nfl_player_snap_counts (game_id, player)",
  "CREATE INDEX IF NOT EXISTS idx_nfl_alerts_unresolved ON nflverse_import_alerts (resolved_at, created_at)"
] as const;

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
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
}

export async function listNflverseImportStates(db: D1Database): Promise<NflverseImportState[]> {
  await ensureNflverseStore(db);
  const result = await db.prepare("SELECT * FROM nflverse_import_state ORDER BY dataset").all<ImportStateRow>();
  return result.results.map(mapState);
}

export async function getNflverseImportState(
  db: D1Database,
  dataset: string
): Promise<NflverseImportState | null> {
  await ensureNflverseStore(db);
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
