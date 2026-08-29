import { z } from "zod";
import { redactHttpRequest, type RedactedHttpRequest } from "@/domain/engine-os";
import { sha256Hex } from "@/domain/hash";
import type { LineBookKey, LineMarketKey, LiveLine } from "@/domain/line-board";
import type { WeeklyMatchup } from "@/domain/weekly-slate";
import { weekOneMatchups } from "@/lib/week-one-data";

type RawLiveLine = Omit<LiveLine, "fairProbability" | "marketVigPercent">;

export interface RawLiveOddsResponse {
  status: number;
  statusText: string;
  rawBytes: Uint8Array;
  request: RedactedHttpRequest;
  contentType: string | null;
  etag: string | null;
  receivedAt: string;
  quota: {
    used: number | null;
    remaining: number | null;
    lastCost: number | null;
  };
}

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
  key: z.enum(["betmgm", "fanduel"]),
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

const bookKey = (key: "betmgm" | "fanduel"): LineBookKey => key;
const marketKey = (key: "h2h" | "spreads" | "totals"): LineMarketKey => key === "h2h" ? "moneyline" : key === "spreads" ? "spread" : "total";

function quotaHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export async function fetchRawLiveOddsResponse(
  apiKey: string,
  fetcher: typeof fetch = fetch
): Promise<RawLiveOddsResponse> {
  const query = new URLSearchParams({
    apiKey,
    regions: "us",
    markets: "h2h,spreads,totals",
    oddsFormat: "american",
    bookmakers: "betmgm,fanduel",
    dateFormat: "iso"
  });
  const requestUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?${query}`;
  let response: Response;
  try {
    response = await fetcher(requestUrl, { cache: "no-store" });
  } catch {
    throw new Error("Live line provider request failed before a response was received");
  }
  const rawBytes = new Uint8Array(await response.arrayBuffer());
  const receivedAt = new Date().toISOString();
  return {
    status: response.status,
    statusText: response.statusText,
    rawBytes,
    request: redactHttpRequest({ url: requestUrl }),
    contentType: response.headers.get("content-type"),
    etag: response.headers.get("etag"),
    receivedAt,
    quota: {
      used: quotaHeader(response.headers, "x-requests-used"),
      remaining: quotaHeader(response.headers, "x-requests-remaining"),
      lastCost: quotaHeader(response.headers, "x-requests-last")
    }
  };
}

export function normalizeLiveOddsForSlate(
  response: RawLiveOddsResponse,
  matchups: readonly Pick<WeeklyMatchup, "id" | "home" | "away" | "homeName" | "awayName">[]
): { lines: RawLiveLine[]; sourceHash: string } {
  const { rawBytes } = response;
  const raw: unknown = JSON.parse(new TextDecoder().decode(rawBytes));
  const events = z.array(eventSchema).parse(raw);
  const sourceHash = sha256Hex(rawBytes);
  const lines: RawLiveLine[] = [];

  for (const event of events) {
    const matchup = matchups.find((game) => game.homeName === event.home_team && game.awayName === event.away_team);
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
  if (!lines.length) throw new Error("The provider returned no BetMGM or FanDuel lines for the active week");
  return { lines, sourceHash };
}

export async function fetchLiveOddsForSlate(apiKey: string, matchups: readonly Pick<WeeklyMatchup, "id" | "home" | "away" | "homeName" | "awayName">[], fetcher: typeof fetch = fetch): Promise<{
  lines: RawLiveLine[];
  used: number;
  remaining: number;
  lastCost: number;
  sourceHash: string;
  rawBytes: Uint8Array;
  request: RedactedHttpRequest;
  contentType: string | null;
  etag: string | null;
  receivedAt: string;
}> {
  const response = await fetchRawLiveOddsResponse(apiKey, fetcher);
  const { used, remaining, lastCost } = response.quota;
  if (used === null || remaining === null || lastCost === null) {
    throw new Error("Live line provider returned invalid quota headers");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Live line refresh failed with HTTP ${response.status}`);
  }
  const normalized = normalizeLiveOddsForSlate(response, matchups);
  return {
    ...normalized,
    used,
    remaining,
    lastCost,
    rawBytes: response.rawBytes,
    request: response.request,
    contentType: response.contentType,
    etag: response.etag,
    receivedAt: response.receivedAt
  };
}

export async function fetchWeekOneLiveOdds(apiKey: string, fetcher: typeof fetch = fetch) {
  return fetchLiveOddsForSlate(apiKey, weekOneMatchups.map((game) => ({
    id: game.id,
    home: game.home,
    away: game.away,
    homeName: game.homeName,
    awayName: game.awayName
  })), fetcher);
}
