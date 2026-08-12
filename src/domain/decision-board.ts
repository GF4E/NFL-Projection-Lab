import { americanToDecimal, impliedToAmerican, powerDevig } from "./odds";

export const PROP_MARKETS = [
  "player_pass_yds",
  "player_rush_yds",
  "player_reception_yds"
] as const;

export type PropMarketKey = typeof PROP_MARKETS[number];

export interface TeamBaseline {
  team: string;
  season: number;
  games: number;
  epaPerPlay: number;
  successRate: number;
  explosiveRate: number;
  regressedTurnoverRate: number;
  secondsPerPlay: number | null;
  proe: number | null;
  strength: number;
  ranks: {
    epa: number;
    success: number;
    explosive: number;
    turnovers: number;
    pace: number | null;
    proe: number | null;
    strength: number;
  };
}

export interface BaselineProjection {
  gameId: string;
  book: "betmgm" | "caesars";
  homeTeam: string;
  marketHomePoint: number;
  projectedHomePoint: number;
  homeCoverProbability: number | null;
  shrunkHomeProbability: number | null;
  marketHomeProbability: number;
  marketSource: "book" | "nflverse_consensus";
  translationWarning: "none" | "interpolated" | "extrapolated" | "unsupported";
}

export interface TeaserCandidate {
  gameId: string;
  book: "betmgm" | "caesars";
  team: string;
  originalPoint: number;
  teasedPoint: number;
  fairProbability: number | null;
  fairAmerican: number | null;
  classification: "classic_wong" | "key_number" | "ordinary";
  crossedKeys: number[];
  warning: "none" | "interpolated" | "extrapolated" | "unsupported";
}

export interface DecisionBoardGame {
  gameId: string;
  away: TeamBaseline | null;
  home: TeamBaseline | null;
  projections: BaselineProjection[];
  teasers: TeaserCandidate[];
}

export interface DecisionBoardPayload {
  generatedAt: string;
  season: number;
  week: number;
  basisSeason: number | null;
  artifactHash: string | null;
  games: DecisionBoardGame[];
  method: string;
}

export interface RawPropQuote {
  id: string;
  gameId: string;
  eventId: string;
  book: string;
  market: PropMarketKey;
  player: string;
  side: "Over" | "Under";
  point: number;
  americanPrice: number;
  capturedAt: string;
  sourceHash: string;
}

export interface PropCandidate {
  id: string;
  gameId: string;
  executionBook: "betmgm" | "caesars";
  market: PropMarketKey;
  player: string;
  side: "Over" | "Under";
  point: number;
  americanPrice: number;
  executionFairProbability: number;
  consensusProbability: number;
  consensusInterval: [number, number];
  edge: number;
  expectedValue: number;
  lowerBoundExpectedValue: number;
  referenceBooks: number;
  capturedAt: string;
}

export interface PlayerPropBoard {
  gameId: string;
  status: "current" | "stale" | "unavailable";
  generatedAt: string;
  eventId: string | null;
  candidates: PropCandidate[];
  quota: { used: number; remaining: number; lastCost: number } | null;
  message: string;
}

function percentile(sorted: readonly number[], probability: number): number {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower]);
}

function deviggedQuotes(quotes: readonly RawPropQuote[]): Map<string, number> {
  const fair = new Map<string, number>();
  const grouped = new Map<string, RawPropQuote[]>();
  for (const quote of quotes) {
    const key = `${quote.book}:${quote.market}:${quote.player}:${quote.point}`;
    grouped.set(key, [...(grouped.get(key) ?? []), quote]);
  }
  for (const pair of grouped.values()) {
    const over = pair.find((quote) => quote.side === "Over");
    const under = pair.find((quote) => quote.side === "Under");
    if (!over || !under) continue;
    const result = powerDevig(over.americanPrice, under.americanPrice);
    fair.set(over.id, result.probabilities[0]);
    fair.set(under.id, result.probabilities[1]);
  }
  return fair;
}

export function scanMarketConfirmedProps(
  quotes: readonly RawPropQuote[],
  options: { minimumReferenceBooks?: number; minimumExpectedValue?: number; maximumPerBook?: number } = {}
): PropCandidate[] {
  const minimumReferenceBooks = options.minimumReferenceBooks ?? 3;
  const minimumExpectedValue = options.minimumExpectedValue ?? 0.02;
  const maximumPerBook = options.maximumPerBook ?? 3;
  const fair = deviggedQuotes(quotes);
  const candidates: PropCandidate[] = [];
  for (const quote of quotes) {
    const executionBook = quote.book === "betmgm" ? "betmgm" : quote.book === "williamhill_us" ? "caesars" : null;
    const executionFairProbability = fair.get(quote.id);
    if (!executionBook || executionFairProbability === undefined) continue;
    const references = quotes
      .filter((reference) =>
        reference.book !== quote.book &&
        reference.market === quote.market &&
        reference.player === quote.player &&
        reference.side === quote.side &&
        reference.point === quote.point &&
        fair.has(reference.id)
      )
      .map((reference) => ({ book: reference.book, probability: fair.get(reference.id)! }));
    const onePerBook = [...new Map(references.map((reference) => [reference.book, reference.probability])).values()]
      .sort((left, right) => left - right);
    if (onePerBook.length < minimumReferenceBooks) continue;
    const consensusProbability = percentile(onePerBook, 0.5);
    const low = percentile(onePerBook, 0.2);
    const high = percentile(onePerBook, 0.8);
    const expectedValue = consensusProbability * americanToDecimal(quote.americanPrice) - 1;
    const lowerBoundExpectedValue = low * americanToDecimal(quote.americanPrice) - 1;
    if (expectedValue < minimumExpectedValue || lowerBoundExpectedValue <= 0) continue;
    candidates.push({
      id: `prop:${quote.id}`,
      gameId: quote.gameId,
      executionBook,
      market: quote.market,
      player: quote.player,
      side: quote.side,
      point: quote.point,
      americanPrice: quote.americanPrice,
      executionFairProbability,
      consensusProbability,
      consensusInterval: [low, high],
      edge: consensusProbability - executionFairProbability,
      expectedValue,
      lowerBoundExpectedValue,
      referenceBooks: onePerBook.length,
      capturedAt: quote.capturedAt
    });
  }
  return (["betmgm", "caesars"] as const).flatMap((book) => candidates
    .filter((candidate) => candidate.executionBook === book)
    .sort((left, right) => right.lowerBoundExpectedValue - left.lowerBoundExpectedValue || right.expectedValue - left.expectedValue)
    .slice(0, maximumPerBook));
}

export function fairAmericanFromProbability(probability: number): number {
  return Math.round(impliedToAmerican(probability));
}

export function isClassicWongPoint(point: number): boolean {
  return (point >= 1.5 && point <= 2.5) || (point >= -8.5 && point <= -7.5);
}

export function crossedKeyNumbers(fromPoint: number, toPoint: number, keys = [3, 6, 7, 10, 14]): number[] {
  const low = Math.min(fromPoint, toPoint);
  const high = Math.max(fromPoint, toPoint);
  return keys.filter((key) => (low < key && high > key) || (low < -key && high > -key));
}

export function nflverseExpectedMarginToHomePoint(expectedHomeMargin: number): number {
  return -expectedHomeMargin;
}

export function marginVersusConsensusResidual(actualHomeMargin: number, expectedHomeMargin: number): number {
  return actualHomeMargin - expectedHomeMargin;
}

export function normalizeNflverseTeam(team: string): string {
  return team === "LA" ? "LAR" : team;
}
