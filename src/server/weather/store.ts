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

export async function ensureKickoffWeatherStore(db: D1Database): Promise<void> {
  await db.batch(schema.map((statement) => db.prepare(statement)));
}

export async function listKickoffWeather(db: D1Database, gameIds: readonly string[]): Promise<StoredKickoffWeather[]> {
  await ensureKickoffWeatherStore(db);
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
  const statements = input.snapshots.flatMap(({ weather, sourceHash }) => {
    const values = [
      weather.gameId, weather.stadium, weather.roof, weather.kickoffAt, weather.forecastIssuedAt,
      weather.validAt, weather.windMph, weather.temperatureF, weather.precipitationProbability,
      sourceHash, input.checkedAt
    ] as const;
    return [
      input.db.prepare(`INSERT INTO kickoff_weather_current
        (game_id, stadium, roof, kickoff_at, forecast_issued_at, valid_at, wind_mph, temperature_f,
         precipitation_probability, source_hash, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id) DO UPDATE SET stadium = excluded.stadium, roof = excluded.roof,
          kickoff_at = excluded.kickoff_at, forecast_issued_at = excluded.forecast_issued_at,
          valid_at = excluded.valid_at, wind_mph = excluded.wind_mph, temperature_f = excluded.temperature_f,
          precipitation_probability = excluded.precipitation_probability, source_hash = excluded.source_hash,
          imported_at = excluded.imported_at`).bind(...values),
      input.db.prepare(`INSERT OR IGNORE INTO kickoff_weather_snapshots
        (id, game_id, stadium, roof, kickoff_at, forecast_issued_at, valid_at, wind_mph, temperature_f,
         precipitation_probability, source_hash, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          `${weather.gameId}:${sourceHash}`, ...values
        ),
      input.db.prepare(`INSERT INTO kickoff_weather_state
        (game_id, freshness, roof, source_hash, last_checked_at, last_success_at, last_error)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(game_id) DO UPDATE SET freshness = excluded.freshness, roof = excluded.roof,
          source_hash = excluded.source_hash, last_checked_at = excluded.last_checked_at,
          last_success_at = excluded.last_success_at, last_error = NULL`).bind(
          weather.gameId,
          weather.roof === "closed" || weather.roof === "fixed" ? "indoors" : "current",
          weather.roof,
          sourceHash,
          input.checkedAt,
          input.checkedAt
        )
    ];
  });
  const placeholders = input.snapshots.map(() => "?").join(", ");
  statements.push(input.db.prepare(`UPDATE kickoff_weather_alerts SET resolved_at = ?
    WHERE game_id IN (${placeholders}) AND resolved_at IS NULL`)
    .bind(input.checkedAt, ...input.snapshots.map(({ weather }) => weather.gameId)));
  await input.db.batch(statements);
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
