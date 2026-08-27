import type { WeatherInput } from "@/domain/types";
import type { ParsedGameInactives } from "./parser";
import { assertD1SchemaAuthority } from "@/server/schema-authority";

export type PregameContextFreshness = "current" | "stale" | "running" | "unavailable";

export interface PregameContextState {
  gameId: string;
  season: number;
  week: number;
  freshness: PregameContextFreshness;
  sourceUrl: string | null;
  sourceHash: string | null;
  roof: WeatherInput["roof"];
  inactivesConfirmed: boolean;
  inactiveCount: number;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  leaseExpiresAt: string | null;
}

interface StateRow {
  game_id: string;
  season: number;
  week: number;
  freshness: PregameContextFreshness;
  source_url: string | null;
  source_hash: string | null;
  roof: WeatherInput["roof"];
  inactives_confirmed: number;
  inactive_count: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  lease_expires_at: string | null;
}


function mapState(row: StateRow): PregameContextState {
  return {
    gameId: row.game_id,
    season: row.season,
    week: row.week,
    freshness: row.freshness,
    sourceUrl: row.source_url,
    sourceHash: row.source_hash,
    roof: row.roof,
    inactivesConfirmed: row.inactives_confirmed === 1,
    inactiveCount: row.inactive_count,
    lastCheckedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    leaseExpiresAt: row.lease_expires_at
  };
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

export async function ensurePregameContextStore(db: D1Database): Promise<void> {
  await assertD1SchemaAuthority(db);
}

export async function getPregameContextStates(
  db: D1Database,
  gameIds: readonly string[]
): Promise<PregameContextState[]> {
  if (!gameIds.length) return [];
  const placeholders = gameIds.map(() => "?").join(", ");
  const result = await db.prepare(`SELECT * FROM official_pregame_context_state
    WHERE game_id IN (${placeholders}) ORDER BY game_id`).bind(...gameIds).all<StateRow>();
  return result.results.map(mapState);
}

export async function listPregameContextStates(db: D1Database): Promise<PregameContextState[]> {
  const result = await db.prepare("SELECT * FROM official_pregame_context_state ORDER BY season, week, game_id").all<StateRow>();
  return result.results.map(mapState);
}

export async function acquirePregameContextLease(input: {
  db: D1Database;
  gameId: string;
  season: number;
  week: number;
  checkedAt: string;
}): Promise<boolean> {
  await ensurePregameContextStore(input.db);
  const leaseExpiresAt = new Date(Date.parse(input.checkedAt) + 10 * 60_000).toISOString();
  const result = await input.db.prepare(`INSERT INTO official_pregame_context_state
    (game_id, season, week, freshness, last_checked_at, lease_expires_at)
    VALUES (?, ?, ?, 'running', ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET freshness = 'running', last_checked_at = excluded.last_checked_at,
      last_error = NULL, lease_expires_at = excluded.lease_expires_at
    WHERE official_pregame_context_state.inactives_confirmed = 0
      AND (official_pregame_context_state.lease_expires_at IS NULL
        OR official_pregame_context_state.lease_expires_at < excluded.last_checked_at)`)
    .bind(input.gameId, input.season, input.week, input.checkedAt, leaseExpiresAt).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function publishPregameContext(input: {
  db: D1Database;
  season: number;
  week: number;
  inactives: ParsedGameInactives;
  roof: WeatherInput["roof"];
  inactivesSourceUrl: string;
  sourceUrl: string;
  sourceTimestamp: string;
  sourceHash: string;
  importedAt: string;
}): Promise<void> {
  if (!input.inactives.players.length || input.roof === "unconfirmed") {
    throw new Error("Partial official pregame context cannot be published");
  }
  const importId = `${input.inactives.gameId}:${input.sourceHash.slice(0, 16)}`;
  await input.db.prepare("DELETE FROM official_inactives_stage WHERE import_id = ?").bind(importId).run();
  const insert = `INSERT OR REPLACE INTO official_inactives_stage
    (import_id, id, game_id, season, week, team, player, position, source_url, source_timestamp, raw_snapshot_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  for (const batch of chunks(input.inactives.players, 100)) {
    await input.db.batch(batch.map((player) => input.db.prepare(insert).bind(
      importId, player.id, player.gameId, input.season, input.week, player.team, player.player,
      player.position, input.inactivesSourceUrl, input.sourceTimestamp, input.inactives.rawSnapshotHash
    )));
  }
  const snapshotId = `${input.inactives.gameId}:${input.sourceHash}:${input.roof}`;
  const dataset = `pregame:${input.inactives.gameId}`;
  await input.db.batch([
    input.db.prepare("DELETE FROM official_inactives WHERE game_id = ?").bind(input.inactives.gameId),
    input.db.prepare(`INSERT INTO official_inactives
      (id, game_id, season, week, team, player, position, source_url, source_timestamp, raw_snapshot_hash, imported_at)
      SELECT id, game_id, season, week, team, player, position, source_url, source_timestamp, raw_snapshot_hash, ?
      FROM official_inactives_stage WHERE import_id = ?`).bind(input.importedAt, importId),
    input.db.prepare(`UPDATE official_pregame_context_state SET freshness = 'current', source_url = ?,
      source_hash = ?, roof = ?, inactives_confirmed = 1, inactive_count = ?, last_checked_at = ?,
      last_success_at = ?, last_error = NULL, lease_expires_at = NULL WHERE game_id = ?`).bind(
        input.sourceUrl, input.sourceHash, input.roof, input.inactives.players.length, input.importedAt,
        input.importedAt, input.inactives.gameId
      ),
    input.db.prepare(`INSERT OR IGNORE INTO official_pregame_context_snapshots
      (id, game_id, roof, inactive_count, source_url, source_timestamp, raw_snapshot_hash, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        snapshotId, input.inactives.gameId, input.roof, input.inactives.players.length,
        input.sourceUrl, input.sourceTimestamp, input.sourceHash, input.importedAt
      ),
    input.db.prepare("DELETE FROM official_inactives_stage WHERE import_id = ?").bind(importId),
    input.db.prepare("UPDATE game_context_alerts SET resolved_at = ? WHERE dataset = ? AND resolved_at IS NULL")
      .bind(input.importedAt, dataset)
  ]);
}

export async function failPregameContext(input: {
  db: D1Database;
  gameId: string;
  season: number;
  week: number;
  failedAt: string;
  message: string;
}): Promise<void> {
  await ensurePregameContextStore(input.db);
  const dataset = `pregame:${input.gameId}`;
  const alertId = `${dataset}:${input.failedAt.slice(0, 10)}`;
  await input.db.batch([
    input.db.prepare(`INSERT INTO official_pregame_context_state
      (game_id, season, week, freshness, roof, inactives_confirmed, last_checked_at, last_error)
      VALUES (?, ?, ?, 'unavailable', 'unconfirmed', 0, ?, ?)
      ON CONFLICT(game_id) DO UPDATE SET
        freshness = CASE WHEN official_pregame_context_state.last_success_at IS NULL THEN 'unavailable' ELSE 'stale' END,
        last_checked_at = excluded.last_checked_at, last_error = excluded.last_error, lease_expires_at = NULL`)
      .bind(input.gameId, input.season, input.week, input.failedAt, input.message),
    input.db.prepare(`INSERT INTO game_context_alerts (id, dataset, message, created_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET message = excluded.message`)
      .bind(alertId, dataset, input.message, input.failedAt)
  ]);
}
