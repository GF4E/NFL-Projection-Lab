import { z } from "zod";
import { stableHash } from "@/domain/hash";
import type { LineBookKey, LineMarketKey, LiveLine } from "@/domain/line-board";
import { weekOneMatchups } from "@/lib/week-one-data";

type RawLiveLine = Omit<LiveLine, "fairProbability" | "marketVigPercent">;

const outcomeSchema = z.object({
  name: z.string(),
  price: z.number().int().refine((value) => value !== 0),
  point: z.number().optional()
});
const marketSchema = z.object({
  key: z.enum(["h2h", "spreads", "totals"]),
  last_update: z.string().optional(),
  outcomes: z.array(outcomeSchema).min(2)
});
const bookmakerSchema = z.object({
  key: z.enum(["betmgm", "williamhill_us"]),
  last_update: z.string(),
  markets: z.array(marketSchema)
});
const eventSchema = z.object({
  id: z.string(),
  commence_time: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  bookmakers: z.array(bookmakerSchema)
});

const bookKey = (key: "betmgm" | "williamhill_us"): LineBookKey => key === "betmgm" ? "betmgm" : "caesars";
const marketKey = (key: "h2h" | "spreads" | "totals"): LineMarketKey => key === "h2h" ? "moneyline" : key === "spreads" ? "spread" : "total";

export async function fetchWeekOneLiveOdds(apiKey: string, fetcher: typeof fetch = fetch): Promise<{
  lines: RawLiveLine[];
  used: number;
  remaining: number;
  lastCost: number;
  sourceHash: string;
}> {
  const query = new URLSearchParams({
    apiKey,
    regions: "us",
    markets: "h2h,spreads,totals",
    oddsFormat: "american",
    bookmakers: "betmgm,williamhill_us",
    dateFormat: "iso"
  });
  const response = await fetcher(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Live line refresh failed with HTTP ${response.status}`);
  const raw: unknown = await response.json();
  const events = z.array(eventSchema).parse(raw);
  const sourceHash = stableHash(raw);
  const used = Number(response.headers.get("x-requests-used") ?? "0");
  const remaining = Number(response.headers.get("x-requests-remaining") ?? "0");
  const lastCost = Number(response.headers.get("x-requests-last") ?? "0");
  const lines: RawLiveLine[] = [];

  for (const event of events) {
    const matchup = weekOneMatchups.find((game) => game.homeName === event.home_team && game.awayName === event.away_team);
    if (!matchup) continue;
    for (const bookmaker of event.bookmakers) {
      for (const market of bookmaker.markets) {
        for (const outcome of market.outcomes) {
          const side = market.key === "totals"
            ? outcome.name
            : outcome.name === matchup.homeName
              ? matchup.home
              : outcome.name === matchup.awayName
                ? matchup.away
                : null;
          if (!side) continue;
          const book = bookKey(bookmaker.key);
          const normalizedMarket = marketKey(market.key);
          lines.push({
            id: `${matchup.id}:${book}:${normalizedMarket}:${side.toLowerCase()}`,
            gameId: matchup.id,
            book,
            market: normalizedMarket,
            side,
            point: outcome.point ?? null,
            americanPrice: outcome.price,
            capturedAt: bookmaker.last_update || market.last_update || new Date().toISOString(),
            sourceEventId: event.id,
            sourceHash
          });
        }
      }
    }
  }
  if (!lines.length) throw new Error("The provider returned no BetMGM or Caesars Week 1 lines yet");
  return { lines, used, remaining, lastCost, sourceHash };
}
