import { enrichWithPowerDevig, type LiveLine } from "@/domain/line-board";
import { assertD1SchemaAuthority } from "@/server/schema-authority";

type RawLiveLine = Omit<LiveLine, "fairProbability" | "marketVigPercent">;
type LiveLineRow = {
  id: string;
  game_id: string;
  book: RawLiveLine["book"];
  market: RawLiveLine["market"];
  side: string;
  point: number | null;
  american_price: number;
  captured_at: string;
  source_event_id: string;
  source_hash: string;
};

function mapRow(row: LiveLineRow): RawLiveLine {
  return {
    id: row.id,
    gameId: row.game_id,
    book: row.book,
    market: row.market,
    side: row.side,
    point: row.point,
    americanPrice: row.american_price,
    capturedAt: row.captured_at,
    sourceEventId: row.source_event_id,
    sourceHash: row.source_hash
  };
}

export async function ensureLiveLineStore(d1: D1Database): Promise<void> {
  await assertD1SchemaAuthority(d1);
}

export async function listLiveLines(d1: D1Database, gameIds?: readonly string[]): Promise<LiveLine[]> {
  if (gameIds && !gameIds.length) return [];
  const statement = gameIds
    ? d1.prepare(`SELECT * FROM live_lines WHERE book IN ('betmgm', 'fanduel') AND game_id IN (${gameIds.map(() => "?").join(", ")}) ORDER BY game_id, book, market, side`).bind(...gameIds)
    : d1.prepare("SELECT * FROM live_lines WHERE book IN ('betmgm', 'fanduel') ORDER BY game_id, book, market, side");
  const result = await statement.all<LiveLineRow>();
  return enrichWithPowerDevig(result.results.map(mapRow));
}

export async function listSnapshotGameIds(
  snapshotKey: string,
  d1: D1Database
): Promise<string[]> {
  const result = await d1.prepare(`SELECT DISTINCT game_id
    FROM live_line_snapshots WHERE snapshot_key = ? ORDER BY game_id`)
    .bind(snapshotKey).all<{ game_id: string }>();
  return result.results.map((row) => row.game_id);
}

export async function replaceLiveLines(
  lines: readonly RawLiveLine[],
  options: { db: D1Database; snapshotKey?: string; fetchedAt?: string }
): Promise<LiveLine[]> {
  const d1 = options.db;
  await ensureLiveLineStore(d1);
  const now = new Date().toISOString();
  if (lines.length) {
    const fetchedAt = options.fetchedAt ?? now;
    const gameIds = [...new Set(lines.map((line) => line.gameId))];
    for (const gameId of gameIds) {
      const gameLines = lines.filter((line) => line.gameId === gameId);
      const statements = gameLines.map((line) => d1.prepare(`
        INSERT INTO live_lines (
          id, game_id, book, market, side, point, american_price, captured_at,
          source_event_id, source_hash, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          point = excluded.point,
          american_price = excluded.american_price,
          captured_at = excluded.captured_at,
          source_event_id = excluded.source_event_id,
          source_hash = excluded.source_hash,
          updated_at = excluded.updated_at
      `).bind(
        line.id, line.gameId, line.book, line.market, line.side, line.point,
        line.americanPrice, line.capturedAt, line.sourceEventId, line.sourceHash, now
      ));
      if (options.snapshotKey) {
        statements.push(...gameLines.map((line) => d1.prepare(`INSERT OR IGNORE INTO live_line_snapshots (
            snapshot_key, line_id, game_id, book, market, side, point, american_price,
            captured_at, source_event_id, source_hash, fetched_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(options.snapshotKey, line.id, line.gameId, line.book, line.market, line.side, line.point,
            line.americanPrice, line.capturedAt, line.sourceEventId, line.sourceHash, fetchedAt)));
      }
      // A single game is the publication boundary: an incomplete or failed game
      // never contaminates the other current games, and its last good rows survive.
      await d1.batch(statements);
    }
  }
  return listLiveLines(d1, [...new Set(lines.map((line) => line.gameId))]);
}
