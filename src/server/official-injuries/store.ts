import type { ParsedOfficialInjuryReport } from "./parser";
import { assertD1SchemaAuthority } from "@/server/schema-authority";

export type OfficialInjuryFreshness = "current" | "stale" | "running" | "unavailable";

export interface OfficialInjuryImportState {
  dataset: string;
  freshness: OfficialInjuryFreshness;
  sourceUrl: string;
  sourceTag: string | null;
  sourceHash: string | null;
  rowCount: number;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  leaseExpiresAt: string | null;
}

interface StateRow {
  dataset: string;
  freshness: OfficialInjuryFreshness;
  source_url: string;
  source_tag: string | null;
  source_hash: string | null;
  row_count: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  lease_expires_at: string | null;
}


function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function mapState(row: StateRow): OfficialInjuryImportState {
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

export async function ensureOfficialInjuryStore(db: D1Database): Promise<void> {
  await assertD1SchemaAuthority(db);
}

export async function listOfficialInjuryImportStates(db: D1Database): Promise<OfficialInjuryImportState[]> {
  const result = await db.prepare("SELECT * FROM official_injury_import_state ORDER BY dataset").all<StateRow>();
  return result.results.map(mapState);
}

export async function getOfficialInjuryImportState(db: D1Database, dataset: string): Promise<OfficialInjuryImportState | null> {
  const row = await db.prepare("SELECT * FROM official_injury_import_state WHERE dataset = ?").bind(dataset).first<StateRow>();
  return row ? mapState(row) : null;
}

export async function acquireOfficialInjuryLease(input: {
  db: D1Database;
  dataset: string;
  sourceUrl: string;
  checkedAt: string;
}): Promise<boolean> {
  await ensureOfficialInjuryStore(input.db);
  const leaseExpiresAt = new Date(Date.parse(input.checkedAt) + 10 * 60_000).toISOString();
  const result = await input.db.prepare(`INSERT INTO official_injury_import_state
    (dataset, freshness, source_url, row_count, last_checked_at, lease_expires_at)
    VALUES (?, 'running', ?, 0, ?, ?)
    ON CONFLICT(dataset) DO UPDATE SET
      freshness = 'running', source_url = excluded.source_url, last_checked_at = excluded.last_checked_at,
      last_error = NULL, lease_expires_at = excluded.lease_expires_at
    WHERE official_injury_import_state.lease_expires_at IS NULL
       OR official_injury_import_state.lease_expires_at < excluded.last_checked_at`)
    .bind(input.dataset, input.sourceUrl, input.checkedAt, leaseExpiresAt).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function completeOfficialInjuryUnchanged(input: {
  db: D1Database;
  dataset: string;
  checkedAt: string;
  sourceTag: string | null;
}): Promise<void> {
  await input.db.batch([
    input.db.prepare(`UPDATE official_injury_import_state SET freshness = 'current', source_tag = COALESCE(?, source_tag),
      last_checked_at = ?, last_error = NULL, lease_expires_at = NULL WHERE dataset = ?`)
      .bind(input.sourceTag, input.checkedAt, input.dataset),
    input.db.prepare("UPDATE game_context_alerts SET resolved_at = ? WHERE dataset = ? AND resolved_at IS NULL")
      .bind(input.checkedAt, input.dataset)
  ]);
}

export async function publishOfficialInjuryReport(input: {
  db: D1Database;
  dataset: string;
  report: ParsedOfficialInjuryReport;
  sourceUrl: string;
  sourceTag: string | null;
  sourceTimestamp: string;
  importedAt: string;
}): Promise<void> {
  const importId = `${input.dataset}:${input.report.rawSnapshotHash.slice(0, 16)}`;
  await input.db.prepare("DELETE FROM official_injury_reports_stage WHERE import_id = ?").bind(importId).run();
  const insert = `INSERT OR REPLACE INTO official_injury_reports_stage
    (import_id, id, season, week, game_id, team, player, position, injuries, practice_status, game_status,
     source_url, source_timestamp, raw_snapshot_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  for (const batch of chunks(input.report.injuries, 150)) {
    await input.db.batch(batch.map((injury) => input.db.prepare(insert).bind(
      importId, injury.id, input.report.season, input.report.week, injury.gameId, injury.team, injury.player,
      injury.position, injury.injuries, injury.practiceStatus, injury.gameStatus, input.sourceUrl,
      input.sourceTimestamp, input.report.rawSnapshotHash
    )));
  }
  await input.db.batch([
    input.db.prepare("DELETE FROM official_injury_reports WHERE season = ? AND week = ?")
      .bind(input.report.season, input.report.week),
    input.db.prepare(`INSERT INTO official_injury_reports
      (id, season, week, game_id, team, player, position, injuries, practice_status, game_status, inactive,
       source_url, source_timestamp, raw_snapshot_hash, imported_at)
      SELECT id, season, week, game_id, team, player, position, injuries, practice_status, game_status, NULL,
       source_url, source_timestamp, raw_snapshot_hash, ?
      FROM official_injury_reports_stage WHERE import_id = ?`).bind(input.importedAt, importId),
    input.db.prepare(`UPDATE official_injury_import_state SET freshness = 'current', source_tag = ?, source_hash = ?,
      row_count = ?, last_checked_at = ?, last_success_at = ?, last_error = NULL, lease_expires_at = NULL
      WHERE dataset = ?`).bind(
        input.sourceTag, input.report.rawSnapshotHash, input.report.injuries.length,
        input.importedAt, input.importedAt, input.dataset
      ),
    input.db.prepare("DELETE FROM official_injury_reports_stage WHERE import_id = ?").bind(importId),
    input.db.prepare("UPDATE game_context_alerts SET resolved_at = ? WHERE dataset = ? AND resolved_at IS NULL")
      .bind(input.importedAt, input.dataset)
  ]);
}

export async function failOfficialInjuryImport(input: {
  db: D1Database;
  dataset: string;
  failedAt: string;
  message: string;
}): Promise<void> {
  const alertId = `${input.dataset}:${input.failedAt.slice(0, 10)}`;
  await input.db.batch([
    input.db.prepare(`UPDATE official_injury_import_state SET
      freshness = CASE WHEN last_success_at IS NULL THEN 'unavailable' ELSE 'stale' END,
      last_checked_at = ?, last_error = ?, lease_expires_at = NULL WHERE dataset = ?`)
      .bind(input.failedAt, input.message, input.dataset),
    input.db.prepare(`INSERT INTO game_context_alerts (id, dataset, message, created_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET message = excluded.message`)
      .bind(alertId, input.dataset, input.message, input.failedAt)
  ]);
}
