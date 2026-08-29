import { stableHash } from "@/domain/hash";
import type { MarketSentimentMarket } from "@/domain/market-sentiment";
import { normalizeNflverseTeam } from "@/domain/decision-board";

interface ActionTeam {
  id?: number;
  abbr?: string;
}

interface ActionBetInfo {
  tickets?: { percent?: number };
  money?: { percent?: number };
}

interface ActionOutcome {
  team_id?: number;
  side?: string;
  bet_info?: ActionBetInfo;
}

interface ActionGame {
  id?: number | string;
  start_time?: string;
  away_team_id?: number;
  home_team_id?: number;
  type?: string;
  season?: number;
  week?: number;
  num_bets?: number;
  teams?: ActionTeam[];
  markets?: Record<string, { event?: Partial<Record<MarketSentimentMarket, ActionOutcome[]>> }>;
}

export interface ParsedMarketSentimentRow {
  providerGameId: string;
  awayTeam: string;
  homeTeam: string;
  kickoffAt: string;
  season: number;
  seasonType: string;
  week: number;
  market: MarketSentimentMarket;
  side: string;
  ticketsPercent: number;
  moneyPercent: number | null;
  sampleBets: number;
}

export interface ParsedMarketSentimentFeed {
  season: number | null;
  seasonType: string | null;
  week: number | null;
  capturedAt: string;
  sourceHash: string;
  rows: ParsedMarketSentimentRow[];
}

function percentage(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const normalized = value <= 1 && value > 0 ? value * 100 : value;
  return normalized <= 100 ? normalized : null;
}

function scriptJson(html: string): unknown {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error("Action Network response did not include __NEXT_DATA__");
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error("Action Network __NEXT_DATA__ was not valid JSON");
  }
}

function marketPair(game: ActionGame, market: MarketSentimentMarket): ActionOutcome[] {
  const candidates = Object.values(game.markets ?? {})
    .map((book) => book.event?.[market] ?? [])
    .filter((outcomes) => outcomes.length === 2)
    .map((outcomes) => outcomes.filter((outcome) => percentage(outcome.bet_info?.tickets?.percent) !== null))
    .filter((outcomes) => outcomes.length === 2)
    .sort((left, right) => {
      const leftComplete = left.filter((outcome) => percentage(outcome.bet_info?.money?.percent) !== null).length;
      const rightComplete = right.filter((outcome) => percentage(outcome.bet_info?.money?.percent) !== null).length;
      return rightComplete - leftComplete;
    });
  return candidates[0] ?? [];
}

export function parseActionNetworkSentiment(html: string, capturedAt: string): ParsedMarketSentimentFeed {
  const data = scriptJson(html) as {
    props?: { pageProps?: { scoreboardResponse?: { games?: ActionGame[] } } };
  };
  const games = data.props?.pageProps?.scoreboardResponse?.games;
  if (!Array.isArray(games)) throw new Error("Action Network response did not include an NFL scoreboard");
  const rows: ParsedMarketSentimentRow[] = [];
  for (const game of games) {
    const teams = new Map((game.teams ?? []).map((team) => [team.id, normalizeNflverseTeam(team.abbr ?? "")]));
    const awayTeam = teams.get(game.away_team_id) ?? "";
    const homeTeam = teams.get(game.home_team_id) ?? "";
    const validGame = game.id !== undefined && awayTeam && homeTeam && game.start_time &&
      Number.isInteger(game.season) && Number.isInteger(game.week) && Number.isFinite(game.num_bets);
    if (!validGame) continue;
    for (const market of ["spread", "total", "moneyline"] as const) {
      for (const outcome of marketPair(game, market)) {
        const ticketsPercent = percentage(outcome.bet_info?.tickets?.percent);
        if (ticketsPercent === null) continue;
        const teamSide = outcome.team_id === undefined ? null : teams.get(outcome.team_id);
        const side = market === "total"
          ? outcome.side?.toLowerCase() === "over" ? "Over" : outcome.side?.toLowerCase() === "under" ? "Under" : ""
          : teamSide ?? "";
        if (!side) continue;
        rows.push({
          providerGameId: String(game.id),
          awayTeam,
          homeTeam,
          kickoffAt: game.start_time!,
          season: game.season!,
          seasonType: game.type ?? "unknown",
          week: game.week!,
          market,
          side,
          ticketsPercent,
          moneyPercent: percentage(outcome.bet_info?.money?.percent),
          sampleBets: Math.max(0, Math.trunc(game.num_bets!))
        });
      }
    }
  }
  const descriptors = games.map((game) => ({
    id: game.id,
    startTime: game.start_time,
    season: game.season,
    type: game.type,
    week: game.week,
    numBets: game.num_bets,
    teams: game.teams,
    markets: game.markets
  }));
  return {
    season: rows[0]?.season ?? games[0]?.season ?? null,
    seasonType: rows[0]?.seasonType ?? games[0]?.type ?? null,
    week: rows[0]?.week ?? games[0]?.week ?? null,
    capturedAt,
    sourceHash: stableHash(descriptors),
    rows
  };
}
