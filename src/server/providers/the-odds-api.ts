import { z } from "zod";
import type { BookKey, MarketKey, OddsSnapshot } from "@/domain/types";
import { stableHash } from "@/domain/hash";

const outcomeSchema = z.object({
  name: z.string(),
  price: z.number().int().refine((value) => value !== 0),
  point: z.number().optional()
});
const marketSchema = z.object({
  key: z.enum(["h2h", "spreads", "totals"]),
  last_update: z.string(),
  outcomes: z.array(outcomeSchema).min(2)
});
const bookmakerSchema = z.object({
  key: z.enum(["betmgm", "fanduel"]),
  last_update: z.string(),
  markets: z.array(marketSchema)
});
const gameSchema = z.object({
  id: z.string(),
  commence_time: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  bookmakers: z.array(bookmakerSchema)
});

function marketKey(key: "h2h" | "spreads" | "totals"): MarketKey {
  return key === "h2h" ? "moneyline" : key === "spreads" ? "spread" : "total";
}

export interface OddsImport {
  snapshots: OddsSnapshot[];
  used: number;
  remaining: number;
  lastCost: number;
  rawHash: string;
}

export async function fetchOddsSnapshots(input: {
  apiKey: string;
  scheduledFor: string;
  fetcher?: typeof fetch;
}): Promise<OddsImport> {
  const fetcher = input.fetcher ?? fetch;
  const query = new URLSearchParams({
    apiKey: input.apiKey,
    regions: "us",
    markets: "h2h,spreads,totals",
    oddsFormat: "american",
    bookmakers: "betmgm,fanduel",
    dateFormat: "iso"
  });
  const response = await fetcher(
    `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?${query}`,
    { cache: "no-store" }
  );
  if (!response.ok) throw new Error(`Odds import failed with HTTP ${response.status}`);
  const raw: unknown = await response.json();
  const games = z.array(gameSchema).parse(raw);
  const used = Number(response.headers.get("x-requests-used") ?? "0");
  const remaining = Number(response.headers.get("x-requests-remaining") ?? "0");
  const lastCost = Number(response.headers.get("x-requests-last") ?? "3");
  if (![used, remaining, lastCost].every(Number.isFinite)) {
    throw new Error("Odds quota response headers are invalid");
  }
  const rawHash = stableHash(raw);
  const snapshots = games.flatMap((game) =>
    game.bookmakers.flatMap((bookmaker) =>
      bookmaker.markets.flatMap((market) =>
        market.outcomes.map((outcome) => ({
          id: `${game.id}:${bookmaker.key}:${market.key}:${outcome.name}:${input.scheduledFor}`,
          gameId: game.id,
          book: bookmaker.key as BookKey,
          market: marketKey(market.key),
          side: outcome.name,
          point: outcome.point ?? null,
          americanPrice: outcome.price,
          capturedAt: bookmaker.last_update,
          sourceHash: rawHash,
          quota: { used, remaining, lastCost }
        }))
      )
    )
  );
  if (!snapshots.length) throw new Error("Odds provider returned no eligible BetMGM/FanDuel quotes");
  return { snapshots, used, remaining, lastCost, rawHash };
}
