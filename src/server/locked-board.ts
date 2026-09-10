import type { LockedBoard } from "../domain/locked-board";

export const BOARD_URL = "https://raw.githubusercontent.com/GF4E/NFL-Projection-Lab/engine-v2/outputs/model-pick-v1/board.json";
export const BOARD_CADENCE_MS = 300_000;
const STALE_MS = 900_000;
type Database = Pick<D1Database, "prepare" | "exec">;
const TABLE = "engine_locked_board_publication";

export function validateBoard(value: unknown): LockedBoard {
  const b = value as LockedBoard;
  if (!b || b.schema !== "locked-board-v1" || typeof b.version !== "string" ||
      !/^[a-f0-9]{64}$/.test(b.content_sha256) || !Number.isFinite(Date.parse(b.published_at)) ||
      !Array.isArray(b.games) || b.games.length === 0 || !Number.isInteger(b.default_week)) throw new Error("Invalid board publication");
  const ids = new Set<string>();
  for (const g of b.games) {
    if (!g.game_id || ids.has(g.game_id) || !g.home_team || !g.away_team || !g.version ||
        !Number.isFinite(Date.parse(g.expires_at)) || !Number.isInteger(g.week)) throw new Error("Invalid game");
    ids.add(g.game_id);
    if (g.status === "FINAL" && (!g.final_score || !Number.isFinite(g.final_score.home) || !Number.isFinite(g.final_score.away))) throw new Error("Missing final score");
    for (const market of ["spreads", "totals"] as const) {
      const v = g.verdicts?.[market];
      if (!v || ![null, "PLAY", "TEASE", "HARD PASS"].includes(v.state) || ![null, "W", "L", "PUSH"].includes(v.grade)) throw new Error("Invalid verdict");
      if (v.state === "PLAY" && (!v.side || !v.book || ![v.line, v.price, v.fair_probability, v.EV].every(n => typeof n === "number" && Number.isFinite(n)))) throw new Error("Incomplete PLAY");
      if (v.state === "TEASE" && (!v.leg || !v.best_book || typeof v.teased_line !== "number" || !Array.isArray(v.key_numbers_crossed) || v.partner_status !== "NEEDS_PARTNER" || typeof v.teaser_price !== "number")) throw new Error("Incomplete TEASE");
      if (v.state === "HARD PASS" && !v.reason) throw new Error("Missing pass reason");
    }
  }
  return b;
}

export function displayBoard(board: LockedBoard, checkedAt: number, now = Date.now()): LockedBoard {
  const stale = now - checkedAt > STALE_MS;
  return { ...board, publication_status: stale ? "STALE" : "CURRENT", games: board.games.map(g => {
    if (g.status === "FINAL" || g.lock_status === "MISSED") return g;
    if (!stale && now < Date.parse(g.expires_at)) return g;
    const v = { state: null, availability: "STALE", reason: "No current executable locked quote.", edge_source: null, grade: null };
    return { ...g, status: "STALE", verdicts: { spreads: v, totals: v } };
  }) };
}

async function download(fetcher: typeof fetch): Promise<LockedBoard> {
  const r = await fetcher(BOARD_URL, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Board source HTTP ${r.status}`);
  return validateBoard(await r.json());
}

/** Reject rollback or a final/first-grade disagreement without deriving results. */
export function assertPublicationProgress(previous: LockedBoard, next: LockedBoard): void {
  if (Date.parse(next.published_at) < Date.parse(previous.published_at)) throw new Error("Older board publication");
  for (const prior of previous.games) {
    if (prior.status !== "FINAL") continue;
    const current = next.games.find(g => g.game_id === prior.game_id);
    if (!current || current.status !== "FINAL" || current.final_score?.home !== prior.final_score?.home || current.final_score?.away !== prior.final_score?.away) throw new Error("Final score regression");
    for (const market of ["spreads", "totals"] as const) {
      const grade = prior.verdicts[market].grade;
      if (grade && grade !== current.verdicts[market].grade) throw new Error("First grade changed");
    }
  }
}

/** Existing scheduled cadence; a failed fetch never overwrites last-good data. */
export async function refreshLockedBoard(db: Database, fetcher: typeof fetch = fetch, now = Date.now()): Promise<void> {
  const board = await download(fetcher);
  await db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, checked_at INTEGER NOT NULL)`);
  const previous = await db.prepare(`SELECT payload FROM ${TABLE} WHERE id=1`).first<{payload: string}>();
  if (previous) assertPublicationProgress(validateBoard(JSON.parse(previous.payload)), board);
  await db.prepare(`INSERT INTO ${TABLE} (id,payload,checked_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, checked_at=excluded.checked_at WHERE excluded.checked_at >= ${TABLE}.checked_at`).bind(JSON.stringify(board), now).run();
}

export async function readLockedBoard(db: Database, fetcher: typeof fetch = fetch, now = Date.now()): Promise<LockedBoard> {
  let row: { payload: string; checked_at: number } | null = null;
  try { row = await db.prepare(`SELECT payload, checked_at FROM ${TABLE} WHERE id=1`).first<{ payload: string; checked_at: number }>(); } catch { /* Bootstrap before the first cron; still read-only. */ }
  if (row) return displayBoard(validateBoard(JSON.parse(row.payload)), row.checked_at, now);
  return displayBoard(await download(fetcher), now, now);
}
