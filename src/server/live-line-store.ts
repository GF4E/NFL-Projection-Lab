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

export async function ensureLiveLineStore(): Promise<void> {
  const d1 = getD1();
  await d1.prepare(CREATE_LIVE_LINES_SQL).run();
  await d1.batch([
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_live_lines_game_book_market ON live_lines (game_id, book, market)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_live_lines_captured_at ON live_lines (captured_at)")
  ]);
  await d1.prepare("PRAGMA optimize").run();
}

export async function listLiveLines(): Promise<LiveLine[]> {
  await ensureLiveLineStore();
  const result = await getD1().prepare("SELECT * FROM live_lines ORDER BY game_id, book, market, side").all<LiveLineRow>();
  return enrichWithPowerDevig(result.results.map(mapRow));
}

export async function replaceLiveLines(lines: readonly RawLiveLine[]): Promise<LiveLine[]> {
  await ensureLiveLineStore();
  const now = new Date().toISOString();
  const d1 = getD1();
  if (lines.length) {
    await d1.batch(lines.map((line) => d1.prepare(`
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
    )));
  }
  return listLiveLines();
}
