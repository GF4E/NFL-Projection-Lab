import type { MarketSentimentSnapshot } from "@/domain/market-sentiment";

export type MarketSentimentFreshness = "current" | "stale" | "running" | "unavailable";

interface MarketSentimentStateRow {
  dataset: string;
  freshness: MarketSentimentFreshness;
  source_url: string | null;
  source_hash: string | null;
  row_count: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  lease_expires_at: string | null;
}

interface MarketSentimentRow {
  game_id: string;
  provider_game_id: string;
  market: MarketSentimentSnapshot["market"];
  side: string;
  tickets_percent: number;
  money_percent: number | null;
  sample_bets: number;
  source_url: string;
  source_timestamp: string;
  source_hash: string;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS market_sentiment_import_state (
    dataset text PRIMARY KEY NOT NULL,
    freshness text NOT NULL,
    source_url text,
    source_hash text,
    row_count integer NOT NULL DEFAULT 0,
    last_checked_at text,
    last_success_at text,
    last_error text,
    lease_expires_at text
  )`,
  `CREATE TABLE IF NOT EXISTS market_sentiment_snapshots (
    id text PRIMARY KEY NOT NULL,
    dataset text NOT NULL,
    provider_game_id text NOT NULL,
    game_id text NOT NULL,
    season integer NOT NULL,
    week integer NOT NULL,
    market text NOT NULL,
    side text NOT NULL,
    tickets_percent real NOT NULL,
    money_percent real,
    sample_bets integer NOT NULL,
    source_url text NOT NULL,
    source_timestamp text NOT NULL,
    source_hash text NOT NULL,
    imported_at text NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_market_sentiment_game_time ON market_sentiment_snapshots (game_id, source_timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_market_sentiment_dataset_hash ON market_sentiment_snapshots (dataset, source_hash)"
];

export async function ensureMarketSentimentStore(db: D1Database): Promise<void> {
  await db.batch(schema.map((statement) => db.prepare(statement)));
}

export async function getMarketSentimentState(
  db: D1Database,
  dataset: string
): Promise<MarketSentimentStateRow | null> {
  return await db.prepare("SELECT * FROM market_sentiment_import_state WHERE dataset = ?")
    .bind(dataset).first<MarketSentimentStateRow>();
}

export async function acquireMarketSentimentLease(input: {
  db: D1Database;
  dataset: string;
  sourceUrl: string;
  checkedAt: string;
  leaseExpiresAt: string;
}): Promise<boolean> {
  const result = await input.db.prepare(`INSERT INTO market_sentiment_import_state
    (dataset, freshness, source_url, row_count, last_checked_at, lease_expires_at)
    VALUES (?, 'running', ?, 0, ?, ?)
    ON CONFLICT(dataset) DO UPDATE SET freshness = 'running', source_url = excluded.source_url,
      last_checked_at = excluded.last_checked_at, last_error = NULL,
      lease_expires_at = excluded.lease_expires_at
    WHERE market_sentiment_import_state.lease_expires_at IS NULL
       OR market_sentiment_import_state.lease_expires_at < excluded.last_checked_at`)
    .bind(input.dataset, input.sourceUrl, input.checkedAt, input.leaseExpiresAt).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function publishMarketSentiment(input: {
  db: D1Database;
  dataset: string;
  season: number;
  week: number;
  rows: readonly MarketSentimentSnapshot[];
  sourceUrl: string;
  sourceHash: string;
  importedAt: string;
}): Promise<void> {
  const insert = `INSERT OR IGNORE INTO market_sentiment_snapshots
    (id, dataset, provider_game_id, game_id, season, week, market, side,
      tickets_percent, money_percent, sample_bets, source_url, source_timestamp, source_hash, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  for (let offset = 0; offset < input.rows.length; offset += 100) {
    await input.db.batch(input.rows.slice(offset, offset + 100).map((row) => input.db.prepare(insert).bind(
      `${row.sourceHash}:${row.gameId}:${row.market}:${row.side}`,
      input.dataset,
      row.providerGameId,
      row.gameId,
      input.season,
      input.week,
      row.market,
      row.side,
      row.ticketsPercent,
      row.moneyPercent,
      row.sampleBets,
      row.sourceUrl,
      row.capturedAt,
      row.sourceHash,
      input.importedAt
    )));
  }
  await input.db.prepare(`UPDATE market_sentiment_import_state SET
      freshness = 'current', source_url = ?, source_hash = ?, row_count = ?,
      last_checked_at = ?, last_success_at = ?, last_error = NULL, lease_expires_at = NULL
    WHERE dataset = ?`).bind(
      input.sourceUrl, input.sourceHash, input.rows.length,
      input.importedAt, input.importedAt, input.dataset
    ).run();
}

export async function recordMarketSentimentNoSlate(input: {
  db: D1Database;
  dataset: string;
  checkedAt: string;
  sourceUrl: string;
  sourceHash: string;
  message: string;
}): Promise<void> {
  await input.db.prepare(`UPDATE market_sentiment_import_state SET
      freshness = CASE WHEN last_success_at IS NULL THEN 'unavailable' ELSE 'stale' END,
      source_url = ?, source_hash = ?, last_checked_at = ?, last_error = ?, lease_expires_at = NULL
    WHERE dataset = ?`).bind(
      input.sourceUrl, input.sourceHash, input.checkedAt, input.message, input.dataset
    ).run();
}

export async function recordMarketSentimentFailure(input: {
  db: D1Database;
  dataset: string;
  checkedAt: string;
  message: string;
}): Promise<void> {
  await input.db.prepare(`UPDATE market_sentiment_import_state SET
      freshness = CASE WHEN last_success_at IS NULL THEN 'unavailable' ELSE 'stale' END,
      last_checked_at = ?, last_error = ?, lease_expires_at = NULL
    WHERE dataset = ?`).bind(input.checkedAt, input.message, input.dataset).run();
}

export async function listLatestMarketSentiment(
  db: D1Database,
  gameIds: readonly string[]
): Promise<MarketSentimentSnapshot[]> {
  if (!gameIds.length) return [];
  const placeholders = gameIds.map(() => "?").join(", ");
  const result = await db.prepare(`SELECT game_id, provider_game_id, market, side, tickets_percent,
      money_percent, sample_bets, source_url, source_timestamp, source_hash
    FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY game_id, market, side ORDER BY source_timestamp DESC, imported_at DESC
      ) AS recency_rank
      FROM market_sentiment_snapshots WHERE game_id IN (${placeholders})
    ) WHERE recency_rank = 1
    ORDER BY game_id, market, side`).bind(...gameIds).all<MarketSentimentRow>();
  return result.results.map((row) => ({
    gameId: row.game_id,
    providerGameId: row.provider_game_id,
    market: row.market,
    side: row.side,
    ticketsPercent: row.tickets_percent,
    moneyPercent: row.money_percent,
    sampleBets: row.sample_bets,
    capturedAt: row.source_timestamp,
    sourceUrl: row.source_url,
    sourceHash: row.source_hash
  }));
}
