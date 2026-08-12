import { z } from "zod";
import {
  PROP_MARKETS,
  scanMarketConfirmedProps,
  type PlayerPropBoard,
  type PropMarketKey,
  type RawPropQuote
} from "@/domain/decision-board";
import { stableHash } from "@/domain/hash";
import { getD1 } from "../../db";
import {
  assertOddsCreditsAvailable,
  ODDS_CREDIT_ALERT,
  ODDS_CREDIT_CEILING,
  recordOddsQuota
} from "./odds-quota";
import { seasonSchedule } from "./weekly-slate";

const CACHE_MS = 15 * 60_000;

const eventListSchema = z.array(z.object({
  id: z.string(),
  commence_time: z.string(),
  home_team: z.string(),
  away_team: z.string()
}));

const eventOddsSchema = z.object({
  id: z.string(),
  bookmakers: z.array(z.object({
    key: z.string(),
    markets: z.array(z.object({
      key: z.enum(PROP_MARKETS),
      last_update: z.string().optional(),
      outcomes: z.array(z.object({
        name: z.enum(["Over", "Under"]),
        description: z.string(),
        price: z.number().int().refine((value) => value !== 0),
        point: z.number()
      }))
    }))
  }))
});

interface StateRow {
  game_id: string;
  event_id: string | null;
  status: "current" | "stale" | "unavailable";
  last_checked_at: string | null;
  last_success_at: string | null;
  quota_used: number | null;
  quota_remaining: number | null;
  quota_last_cost: number | null;
  message: string | null;
}

interface QuoteRow {
  id: string;
  game_id: string;
  event_id: string;
  book: string;
  market: PropMarketKey;
  player: string;
  side: "Over" | "Under";
  point: number;
  american_price: number;
  captured_at: string;
  source_hash: string;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS player_prop_quotes (
    id text PRIMARY KEY NOT NULL, game_id text NOT NULL, event_id text NOT NULL, book text NOT NULL,
    market text NOT NULL, player text NOT NULL, side text NOT NULL, point real NOT NULL,
    american_price integer NOT NULL, captured_at text NOT NULL, source_hash text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS player_prop_quotes_stage (
    import_id text NOT NULL, id text NOT NULL, game_id text NOT NULL, event_id text NOT NULL, book text NOT NULL,
    market text NOT NULL, player text NOT NULL, side text NOT NULL, point real NOT NULL,
    american_price integer NOT NULL, captured_at text NOT NULL, source_hash text NOT NULL,
    PRIMARY KEY (import_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS player_prop_scan_state (
    game_id text PRIMARY KEY NOT NULL, event_id text, status text NOT NULL, last_checked_at text,
    last_success_at text, quota_used integer, quota_remaining integer, quota_last_cost integer, message text
  )`,
  "CREATE INDEX IF NOT EXISTS idx_prop_quotes_game_book ON player_prop_quotes (game_id, book)",
  "CREATE INDEX IF NOT EXISTS idx_prop_quotes_contract ON player_prop_quotes (game_id, market, player, point)",
  "CREATE INDEX IF NOT EXISTS idx_prop_stage_import ON player_prop_quotes_stage (import_id)"
] as const;

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function ensureStore(db: D1Database): Promise<void> {
  await db.batch(schema.map((statement) => db.prepare(statement)));
}

function mapQuote(row: QuoteRow): RawPropQuote {
  return {
    id: row.id, gameId: row.game_id, eventId: row.event_id, book: row.book, market: row.market,
    player: row.player, side: row.side, point: row.point, americanPrice: row.american_price,
    capturedAt: row.captured_at, sourceHash: row.source_hash
  };
}

async function quotesForGame(db: D1Database, gameId: string): Promise<RawPropQuote[]> {
  const result = await db.prepare("SELECT * FROM player_prop_quotes WHERE game_id = ? ORDER BY market, player, point, book, side")
    .bind(gameId).all<QuoteRow>();
  return result.results.map(mapQuote);
}

async function stateForGame(db: D1Database, gameId: string): Promise<StateRow | null> {
  return db.prepare("SELECT * FROM player_prop_scan_state WHERE game_id = ?").bind(gameId).first<StateRow>();
}

function board(gameId: string, state: StateRow | null, quotes: RawPropQuote[]): PlayerPropBoard {
  const candidates = scanMarketConfirmedProps(quotes);
  return {
    gameId,
    status: state?.status ?? "unavailable",
    generatedAt: state?.last_success_at ?? state?.last_checked_at ?? new Date().toISOString(),
    eventId: state?.event_id ?? null,
    candidates,
    quota: state?.quota_used === null || state?.quota_used === undefined ? null : {
      used: state.quota_used,
      remaining: state.quota_remaining ?? 0,
      lastCost: state.quota_last_cost ?? 0
    },
    message: state?.message ?? (quotes.length ? "Cached market-confirmed props" : "Props have not been scanned for this game yet")
  };
}

export async function getPlayerPropBoard(gameId: string, db: D1Database = getD1()): Promise<PlayerPropBoard> {
  await ensureStore(db);
  return board(gameId, await stateForGame(db, gameId), await quotesForGame(db, gameId));
}

async function resolveEventId(input: {
  db: D1Database;
  gameId: string;
  apiKey: string;
  fetcher: typeof fetch;
  existing: StateRow | null;
}): Promise<string | null> {
  if (input.existing?.event_id) return input.existing.event_id;
  const cached = await input.db.prepare("SELECT source_event_id FROM live_lines WHERE game_id = ? LIMIT 1")
    .bind(input.gameId).first<{ source_event_id: string }>();
  if (cached?.source_event_id) return cached.source_event_id;
  const matchup = (await seasonSchedule({ db: input.db })).find((game) => game.id === input.gameId);
  if (!matchup) return null;
  const query = new URLSearchParams({ apiKey: input.apiKey, dateFormat: "iso" });
  const response = await input.fetcher(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`NFL event lookup failed with HTTP ${response.status}`);
  const events = eventListSchema.parse(await response.json());
  return events.find((event) => event.home_team === matchup.homeName && event.away_team === matchup.awayName)?.id ?? null;
}

async function markState(input: {
  db: D1Database; gameId: string; eventId: string | null; status: StateRow["status"];
  checkedAt: string; successAt: string | null; quota: PlayerPropBoard["quota"]; message: string;
}): Promise<void> {
  await input.db.prepare(`INSERT INTO player_prop_scan_state (
      game_id, event_id, status, last_checked_at, last_success_at, quota_used, quota_remaining, quota_last_cost, message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET event_id = excluded.event_id, status = excluded.status,
      last_checked_at = excluded.last_checked_at, last_success_at = COALESCE(excluded.last_success_at, player_prop_scan_state.last_success_at),
      quota_used = COALESCE(excluded.quota_used, player_prop_scan_state.quota_used),
      quota_remaining = COALESCE(excluded.quota_remaining, player_prop_scan_state.quota_remaining),
      quota_last_cost = COALESCE(excluded.quota_last_cost, player_prop_scan_state.quota_last_cost), message = excluded.message`)
    .bind(input.gameId, input.eventId, input.status, input.checkedAt, input.successAt,
      input.quota?.used ?? null, input.quota?.remaining ?? null, input.quota?.lastCost ?? null, input.message).run();
}

export async function refreshPlayerPropBoard(input: {
  gameId: string;
  apiKey: string | undefined;
  db?: D1Database;
  fetcher?: typeof fetch;
  force?: boolean;
}): Promise<PlayerPropBoard> {
  const db = input.db ?? getD1();
  const fetcher = input.fetcher ?? fetch;
  await ensureStore(db);
  const checkedAt = new Date().toISOString();
  const existing = await stateForGame(db, input.gameId);
  const cachedQuotes = await quotesForGame(db, input.gameId);
  if (!input.force && existing?.last_success_at && Date.now() - Date.parse(existing.last_success_at) < CACHE_MS) {
    return board(input.gameId, existing, cachedQuotes);
  }
  if (!input.apiKey) {
    await markState({ db, gameId: input.gameId, eventId: existing?.event_id ?? null, status: cachedQuotes.length ? "stale" : "unavailable", checkedAt, successAt: null, quota: null, message: "Player props need the private Odds API key" });
    return getPlayerPropBoard(input.gameId, db);
  }
  try {
    await assertOddsCreditsAvailable(PROP_MARKETS.length, db);
  } catch {
    await markState({ db, gameId: input.gameId, eventId: existing?.event_id ?? null, status: cachedQuotes.length ? "stale" : "unavailable", checkedAt, successAt: null, quota: null, message: "Odds credit ceiling preserves the last good prop board" });
    return getPlayerPropBoard(input.gameId, db);
  }
  let importId: string | null = null;
  try {
    const eventId = await resolveEventId({ db, gameId: input.gameId, apiKey: input.apiKey, fetcher, existing });
    if (!eventId) {
      await markState({ db, gameId: input.gameId, eventId: null, status: cachedQuotes.length ? "stale" : "unavailable", checkedAt, successAt: null, quota: null, message: "The provider has not listed this regular-season event yet" });
      return getPlayerPropBoard(input.gameId, db);
    }
    const query = new URLSearchParams({
      apiKey: input.apiKey,
      regions: "us",
      markets: PROP_MARKETS.join(","),
      oddsFormat: "american",
      dateFormat: "iso"
    });
    const response = await fetcher(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${eventId}/odds?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Player prop refresh failed with HTTP ${response.status}`);
    const raw: unknown = await response.json();
    const event = eventOddsSchema.parse(raw);
    const sourceHash = stableHash(raw);
    const quota = {
      used: Number(response.headers.get("x-requests-used") ?? existing?.quota_used ?? "0"),
      remaining: Number(response.headers.get("x-requests-remaining") ?? existing?.quota_remaining ?? "0"),
      lastCost: Number(response.headers.get("x-requests-last") ?? "0")
    };
    await recordOddsQuota(quota, db);
    if (quota.used > ODDS_CREDIT_CEILING) throw new Error("Odds credit ceiling exceeded; cached props were preserved");
    const quotes: RawPropQuote[] = event.bookmakers.flatMap((bookmaker) => bookmaker.markets.flatMap((market) => market.outcomes.map((outcome) => {
      const identity = { gameId: input.gameId, eventId, book: bookmaker.key, market: market.key, player: outcome.description, side: outcome.name, point: outcome.point };
      return {
        id: stableHash(identity),
        ...identity,
        americanPrice: outcome.price,
        capturedAt: market.last_update ?? checkedAt,
        sourceHash
      };
    })));
    if (!quotes.length) {
      await markState({ db, gameId: input.gameId, eventId, status: cachedQuotes.length ? "stale" : "unavailable", checkedAt, successAt: null, quota, message: "Player props are not posted yet; the last good board was preserved" });
      return getPlayerPropBoard(input.gameId, db);
    }
    importId = crypto.randomUUID();
    for (const group of chunks(quotes, 75)) {
      await db.batch(group.map((quote) => db.prepare(`INSERT OR REPLACE INTO player_prop_quotes_stage (
          import_id, id, game_id, event_id, book, market, player, side, point, american_price, captured_at, source_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(importId, quote.id, quote.gameId, quote.eventId, quote.book, quote.market, quote.player, quote.side, quote.point, quote.americanPrice, quote.capturedAt, quote.sourceHash)));
    }
    const message = quota.used >= ODDS_CREDIT_ALERT
      ? `Market-confirmed props refreshed · credit alert ${quota.used}/${ODDS_CREDIT_CEILING}`
      : `Market-confirmed props refreshed from ${event.bookmakers.length} books`;
    await db.batch([
      db.prepare("DELETE FROM player_prop_quotes WHERE game_id = ?").bind(input.gameId),
      db.prepare(`INSERT INTO player_prop_quotes (id, game_id, event_id, book, market, player, side, point, american_price, captured_at, source_hash)
        SELECT id, game_id, event_id, book, market, player, side, point, american_price, captured_at, source_hash
        FROM player_prop_quotes_stage WHERE import_id = ?`).bind(importId),
      db.prepare("DELETE FROM player_prop_quotes_stage WHERE import_id = ?").bind(importId),
      db.prepare(`INSERT INTO player_prop_scan_state (
          game_id, event_id, status, last_checked_at, last_success_at, quota_used, quota_remaining, quota_last_cost, message
        ) VALUES (?, ?, 'current', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id) DO UPDATE SET event_id = excluded.event_id, status = 'current',
          last_checked_at = excluded.last_checked_at, last_success_at = excluded.last_success_at,
          quota_used = excluded.quota_used, quota_remaining = excluded.quota_remaining,
          quota_last_cost = excluded.quota_last_cost, message = excluded.message`)
        .bind(input.gameId, eventId, checkedAt, checkedAt, quota.used, quota.remaining, quota.lastCost, message)
    ]);
    return getPlayerPropBoard(input.gameId, db);
  } catch (error) {
    if (importId) await db.prepare("DELETE FROM player_prop_quotes_stage WHERE import_id = ?").bind(importId).run();
    const message = error instanceof Error ? error.message : "Player prop refresh failed";
    await markState({ db, gameId: input.gameId, eventId: existing?.event_id ?? null, status: cachedQuotes.length ? "stale" : "unavailable", checkedAt, successAt: null, quota: null, message });
    return getPlayerPropBoard(input.gameId, db);
  }
}
