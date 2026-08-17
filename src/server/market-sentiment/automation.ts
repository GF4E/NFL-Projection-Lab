import { marketSentimentConfig, type MarketSentimentSnapshot } from "@/domain/market-sentiment";
import { weeklySlate } from "@/server/weekly-slate";
import { parseActionNetworkSentiment } from "./parser";
import {
  acquireMarketSentimentLease,
  ensureMarketSentimentStore,
  getMarketSentimentState,
  publishMarketSentiment,
  recordMarketSentimentFailure,
  recordMarketSentimentNoSlate
} from "./store";

function datasetKey(season: number, week: number): string {
  return `market-sentiment:${season}:reg${week}`;
}

export async function runMarketSentimentAutomation(input: {
  db: D1Database;
  now?: Date;
  fetchImpl?: typeof fetch;
}) {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const slate = await weeklySlate({ db: input.db, now });
  const dataset = datasetKey(slate.season, slate.week);
  await ensureMarketSentimentStore(input.db);
  const existing = await getMarketSentimentState(input.db, dataset);
  const recentCutoff = now.getTime() - marketSentimentConfig.refreshMinutes * 60_000;
  if (existing?.last_checked_at && Date.parse(existing.last_checked_at) > recentCutoff &&
    (existing.freshness === "current" || existing.freshness === "running")) {
    return { status: "recent" as const, dataset, rows: existing.row_count };
  }
  const acquired = await acquireMarketSentimentLease({
    db: input.db,
    dataset,
    sourceUrl: marketSentimentConfig.sourceUrl,
    checkedAt,
    leaseExpiresAt: new Date(now.getTime() + 2 * 60_000).toISOString()
  });
  if (!acquired) return { status: "leased" as const, dataset, rows: existing?.row_count ?? 0 };

  try {
    const response = await (input.fetchImpl ?? fetch)(marketSentimentConfig.sourceUrl, {
      headers: { accept: "text/html,application/xhtml+xml" }
    });
    if (!response.ok) throw new Error(`Action Network returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html")) {
      throw new Error(`Action Network returned unexpected content type ${contentType}`);
    }
    const feed = parseActionNetworkSentiment(await response.text(), checkedAt);
    const isCurrentRegularSlate = feed.season === slate.season && feed.seasonType === "reg" && feed.week === slate.week;
    if (!isCurrentRegularSlate) {
      const message = `Source is showing ${feed.season ?? "unknown"} ${feed.seasonType ?? "unknown"} Week ${feed.week ?? "unknown"}, not the active regular-season slate`;
      await recordMarketSentimentNoSlate({
        db: input.db, dataset, checkedAt, sourceUrl: marketSentimentConfig.sourceUrl,
        sourceHash: feed.sourceHash, message
      });
      return { status: "not_current_slate" as const, dataset, rows: 0, message };
    }
    const localGames = new Map(slate.games.map((game) => [`${game.away}:${game.home}`, game]));
    const rows: MarketSentimentSnapshot[] = feed.rows.flatMap((row) => {
      if (row.season !== slate.season || row.seasonType !== "reg" || row.week !== slate.week) return [];
      const game = localGames.get(`${row.awayTeam}:${row.homeTeam}`);
      if (!game) return [];
      return [{
        gameId: game.id,
        providerGameId: row.providerGameId,
        market: row.market,
        side: row.side,
        ticketsPercent: row.ticketsPercent,
        moneyPercent: row.moneyPercent,
        sampleBets: row.sampleBets,
        capturedAt: feed.capturedAt,
        sourceUrl: marketSentimentConfig.sourceUrl,
        sourceHash: feed.sourceHash
      }];
    });
    if (!rows.length) {
      const message = "Action Network regular-season slate did not match the active nflverse schedule";
      await recordMarketSentimentNoSlate({
        db: input.db, dataset, checkedAt, sourceUrl: marketSentimentConfig.sourceUrl,
        sourceHash: feed.sourceHash, message
      });
      return { status: "unmatched" as const, dataset, rows: 0, message };
    }
    await publishMarketSentiment({
      db: input.db, dataset, season: slate.season, week: slate.week, rows,
      sourceUrl: marketSentimentConfig.sourceUrl, sourceHash: feed.sourceHash, importedAt: checkedAt
    });
    return { status: "updated" as const, dataset, rows: rows.length, sourceHash: feed.sourceHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Market sentiment import failed";
    await recordMarketSentimentFailure({ db: input.db, dataset, checkedAt, message });
    throw new Error(message);
  }
}
