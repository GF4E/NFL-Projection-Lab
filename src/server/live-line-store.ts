import { getD1 } from "../../db";
import { enrichWithPowerDevig, type LiveLine } from "@/domain/line-board";

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

const CREATE_LIVE_LINES_SQL = `
  CREATE TABLE IF NOT EXISTS live_lines (
    id text PRIMARY KEY NOT NULL,
    game_id text NOT NULL,
    book text NOT NULL,
    market text NOT NULL,
    side text NOT NULL,
    point real,
    american_price integer NOT NULL,
    captured_at text NOT NULL,
    source_event_id text NOT NULL,
    source_hash text NOT NULL,
    updated_at text NOT NULL
  )
`;

const CREATE_LIVE_LINE_SNAPSHOTS_SQL = `
  CREATE TABLE IF NOT EXISTS live_line_snapshots (
    snapshot_key text NOT NULL,
    line_id text NOT NULL,
    game_id text NOT NULL,
    book text NOT NULL,
    market text NOT NULL,
    side text NOT NULL,
    point real,
    american_price integer NOT NULL,
    captured_at text NOT NULL,
    source_event_id text NOT NULL,
    source_hash text NOT NULL,
    fetched_at text NOT NULL,
    PRIMARY KEY (snapshot_key, line_id)
  )
`;

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

export async function ensureLiveLineStore(d1: D1Database = getD1()): Promise<void> {
  await d1.batch([
    d1.prepare(CREATE_LIVE_LINES_SQL),
    d1.prepare(CREATE_LIVE_LINE_SNAPSHOTS_SQL)
  ]);
  await d1.batch([
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_live_lines_game_book_market ON live_lines (game_id, book, market)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_live_lines_captured_at ON live_lines (captured_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_line_snapshots_game_time ON live_line_snapshots (game_id, fetched_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_line_snapshots_key ON live_line_snapshots (snapshot_key)")
  ]);
  await d1.prepare("PRAGMA optimize").run();
}

export async function listLiveLines(d1: D1Database = getD1(), gameIds?: readonly string[]): Promise<LiveLine[]> {
  await ensureLiveLineStore(d1);
  if (gameIds && !gameIds.length) return [];
  const statement = gameIds
    ? d1.prepare(`SELECT * FROM live_lines WHERE book IN ('betmgm', 'fanduel') AND game_id IN (${gameIds.map(() => "?").join(", ")}) ORDER BY game_id, book, market, side`).bind(...gameIds)
    : d1.prepare("SELECT * FROM live_lines WHERE book IN ('betmgm', 'fanduel') ORDER BY game_id, book, market, side");
  const result = await statement.all<LiveLineRow>();
  return enrichWithPowerDevig(result.results.map(mapRow));
}

export async function listSnapshotGameIds(
  snapshotKey: string,
  d1: D1Database = getD1()
): Promise<string[]> {
  await ensureLiveLineStore(d1);
  const result = await d1.prepare(`SELECT DISTINCT game_id
    FROM live_line_snapshots WHERE snapshot_key = ? ORDER BY game_id`)
    .bind(snapshotKey).all<{ game_id: string }>();
  return result.results.map((row) => row.game_id);
}

export async function replaceLiveLines(
  lines: readonly RawLiveLine[],
  options: { db?: D1Database; snapshotKey?: string; fetchedAt?: string } = {}
): Promise<LiveLine[]> {
  const d1 = options.db ?? getD1();
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
