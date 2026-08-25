import type { WeatherInput } from "@/domain/types";

export type WeatherFreshness = "current" | "stale" | "unavailable" | "unconfirmed" | "indoors";

export interface StoredKickoffWeather extends WeatherInput {
  freshness: WeatherFreshness;
  sourceHash: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

interface WeatherRow {
  game_id: string;
  stadium: string;
  roof: WeatherInput["roof"];
  kickoff_at: string;
  forecast_issued_at: string;
  valid_at: string;
  wind_mph: number | null;
  temperature_f: number | null;
  precipitation_probability: number | null;
  source_hash: string;
  freshness: WeatherFreshness;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS kickoff_weather_current (
    game_id text PRIMARY KEY NOT NULL,
    stadium text NOT NULL,
    roof text NOT NULL,
    kickoff_at text NOT NULL,
    forecast_issued_at text NOT NULL,
    valid_at text NOT NULL,
    wind_mph real,
    temperature_f real,
    precipitation_probability real,
    source_hash text NOT NULL,
    imported_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS kickoff_weather_snapshots (
    id text PRIMARY KEY NOT NULL,
    game_id text NOT NULL,
    stadium text NOT NULL,
    roof text NOT NULL,
    kickoff_at text NOT NULL,
    forecast_issued_at text NOT NULL,
    valid_at text NOT NULL,
    wind_mph real,
    temperature_f real,
    precipitation_probability real,
    source_hash text NOT NULL,
    imported_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS kickoff_weather_stage (
    run_id text NOT NULL,
    game_id text NOT NULL,
    stadium text NOT NULL,
    roof text NOT NULL,
    kickoff_at text NOT NULL,
    forecast_issued_at text NOT NULL,
    valid_at text NOT NULL,
    wind_mph real,
    temperature_f real,
    precipitation_probability real,
    source_hash text NOT NULL,
    imported_at text NOT NULL,
    PRIMARY KEY (run_id, game_id)
  )`,
  `CREATE TABLE IF NOT EXISTS kickoff_weather_state (
    game_id text PRIMARY KEY NOT NULL,
    freshness text NOT NULL,
    roof text NOT NULL,
    source_hash text,
    last_checked_at text,
    last_success_at text,
    last_error text
  )`,
  `CREATE TABLE IF NOT EXISTS kickoff_weather_alerts (
    id text PRIMARY KEY NOT NULL,
    game_id text NOT NULL,
    message text NOT NULL,
    created_at text NOT NULL,
    resolved_at text
  )`,
  "CREATE INDEX IF NOT EXISTS idx_weather_snapshots_game ON kickoff_weather_snapshots (game_id, imported_at)",
  "CREATE INDEX IF NOT EXISTS idx_weather_alerts_unresolved ON kickoff_weather_alerts (resolved_at, created_at)"
] as const;

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

export async function ensureKickoffWeatherStore(db: D1Database): Promise<void> {
  await db.batch(schema.map((statement) => db.prepare(statement)));
}

export async function listKickoffWeather(db: D1Database, gameIds: readonly string[]): Promise<StoredKickoffWeather[]> {
  if (!gameIds.length) return [];
  const placeholders = gameIds.map(() => "?").join(", ");
  const result = await db.prepare(`SELECT current.*, state.freshness, state.last_checked_at, state.last_success_at, state.last_error
    FROM kickoff_weather_current current
    JOIN kickoff_weather_state state ON state.game_id = current.game_id
    WHERE current.game_id IN (${placeholders})`).bind(...gameIds).all<WeatherRow>();
  return result.results.map((row) => ({
    gameId: row.game_id,
    stadium: row.stadium,
    roof: row.roof,
    kickoffAt: row.kickoff_at,
    forecastIssuedAt: row.forecast_issued_at,
    validAt: row.valid_at,
    windMph: row.wind_mph,
    temperatureF: row.temperature_f,
    precipitationProbability: row.precipitation_probability,
    freshness: row.freshness,
    sourceHash: row.source_hash,
    lastCheckedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error
  }));
}

export async function lastWeatherChecks(db: D1Database): Promise<Map<string, string | null>> {
  await ensureKickoffWeatherStore(db);
  const result = await db.prepare("SELECT game_id, last_checked_at FROM kickoff_weather_state").all<{ game_id: string; last_checked_at: string | null }>();
  return new Map(result.results.map((row) => [row.game_id, row.last_checked_at]));
}

export async function publishKickoffWeather(input: {
  db: D1Database;
  snapshots: Array<{ weather: WeatherInput; sourceHash: string }>;
  checkedAt: string;
}): Promise<void> {
  if (!input.snapshots.length) return;
  const runId = `weather:${input.checkedAt}`;
  await input.db.prepare("DELETE FROM kickoff_weather_stage WHERE run_id = ?").bind(runId).run();
  for (const group of chunks(input.snapshots, 6)) {
    await input.db.batch(group.map(({ weather, sourceHash }) => input.db.prepare(`INSERT INTO kickoff_weather_stage
      (run_id, game_id, stadium, roof, kickoff_at, forecast_issued_at, valid_at, wind_mph, temperature_f,
       precipitation_probability, source_hash, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(runId, weather.gameId, weather.stadium, weather.roof, weather.kickoffAt, weather.forecastIssuedAt,
        weather.validAt, weather.windMph, weather.temperatureF, weather.precipitationProbability,
        sourceHash, input.checkedAt)));
  }
  await input.db.batch([
    input.db.prepare(`INSERT INTO kickoff_weather_current
      (game_id, stadium, roof, kickoff_at, forecast_issued_at, valid_at, wind_mph, temperature_f,
       precipitation_probability, source_hash, imported_at)
      SELECT game_id, stadium, roof, kickoff_at, forecast_issued_at, valid_at, wind_mph, temperature_f,
        precipitation_probability, source_hash, imported_at FROM kickoff_weather_stage WHERE run_id = ?
      ON CONFLICT(game_id) DO UPDATE SET stadium = excluded.stadium, roof = excluded.roof,
        kickoff_at = excluded.kickoff_at, forecast_issued_at = excluded.forecast_issued_at,
        valid_at = excluded.valid_at, wind_mph = excluded.wind_mph, temperature_f = excluded.temperature_f,
        precipitation_probability = excluded.precipitation_probability, source_hash = excluded.source_hash,
        imported_at = excluded.imported_at`).bind(runId),
    input.db.prepare(`INSERT OR IGNORE INTO kickoff_weather_snapshots
      (id, game_id, stadium, roof, kickoff_at, forecast_issued_at, valid_at, wind_mph, temperature_f,
       precipitation_probability, source_hash, imported_at)
      SELECT game_id || ':' || source_hash, game_id, stadium, roof, kickoff_at, forecast_issued_at, valid_at,
        wind_mph, temperature_f, precipitation_probability, source_hash, imported_at
      FROM kickoff_weather_stage WHERE run_id = ?`).bind(runId),
    input.db.prepare(`INSERT INTO kickoff_weather_state
      (game_id, freshness, roof, source_hash, last_checked_at, last_success_at, last_error)
      SELECT game_id, CASE WHEN roof IN ('closed', 'fixed') THEN 'indoors' ELSE 'current' END,
        roof, source_hash, imported_at, imported_at, NULL FROM kickoff_weather_stage WHERE run_id = ?
      ON CONFLICT(game_id) DO UPDATE SET freshness = excluded.freshness, roof = excluded.roof,
        source_hash = excluded.source_hash, last_checked_at = excluded.last_checked_at,
        last_success_at = excluded.last_success_at, last_error = NULL`).bind(runId),
    input.db.prepare(`UPDATE kickoff_weather_alerts SET resolved_at = ?
      WHERE game_id IN (SELECT game_id FROM kickoff_weather_stage WHERE run_id = ?) AND resolved_at IS NULL`)
      .bind(input.checkedAt, runId),
    input.db.prepare("DELETE FROM kickoff_weather_stage WHERE run_id = ?").bind(runId)
  ]);
}

export async function markRoofUnconfirmed(input: {
  db: D1Database;
  gameId: string;
  checkedAt: string;
}): Promise<void> {
  await input.db.prepare(`INSERT INTO kickoff_weather_state
    (game_id, freshness, roof, last_checked_at, last_error)
    VALUES (?, 'unconfirmed', 'unconfirmed', ?, 'Roof status unconfirmed')
    ON CONFLICT(game_id) DO UPDATE SET freshness = 'unconfirmed', roof = 'unconfirmed',
      last_checked_at = excluded.last_checked_at, last_error = excluded.last_error`)
    .bind(input.gameId, input.checkedAt).run();
}

export async function failKickoffWeather(input: {
  db: D1Database;
  gameId: string;
  roof: WeatherInput["roof"];
  failedAt: string;
  message: string;
}): Promise<void> {
  const alertId = `${input.gameId}:${input.failedAt.slice(0, 13)}`;
  await input.db.batch([
    input.db.prepare(`INSERT INTO kickoff_weather_state
      (game_id, freshness, roof, last_checked_at, last_error)
      VALUES (?, 'unavailable', ?, ?, ?)
      ON CONFLICT(game_id) DO UPDATE SET
        freshness = CASE WHEN kickoff_weather_state.last_success_at IS NULL THEN 'unavailable' ELSE 'stale' END,
        roof = excluded.roof, last_checked_at = excluded.last_checked_at, last_error = excluded.last_error`)
      .bind(input.gameId, input.roof, input.failedAt, input.message),
    input.db.prepare(`INSERT INTO kickoff_weather_alerts (id, game_id, message, created_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET message = excluded.message`)
      .bind(alertId, input.gameId, input.message, input.failedAt)
  ]);
}
