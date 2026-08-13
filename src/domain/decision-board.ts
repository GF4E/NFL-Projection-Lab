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
  defenseEpaAllowed: number;
  defenseSuccessAllowed: number;
  defenseExplosiveAllowed: number;
  regressedTurnoverRate: number;
  secondsPerPlay: number | null;
  proe: number | null;
  strength: number;
  ranks: {
    epa: number;
    success: number;
    explosive: number;
    defenseEpa: number;
    defenseSuccess: number;
    defenseExplosive: number;
    turnovers: number;
    pace: number | null;
    proe: number | null;
    strength: number;
  };
}

export interface BaselineProjection {
  gameId: string;
  book: "betmgm" | "fanduel";
  homeTeam: string;
  marketHomePoint: number;
  projectedHomePoint: number;
  homeCoverProbability: number | null;
  shrunkHomeProbability: number | null;
  edgeInterval: [number, number] | null;
  marketHomeProbability: number;
  marketSource: "book" | "nflverse_consensus";
  translationWarning: "none" | "interpolated" | "extrapolated" | "unsupported";
}

export interface TotalProjection {
  gameId: string;
  book: "betmgm" | "fanduel";
  marketPoint: number;
  projectedTotal: number;
  lean: "Over" | "Under" | "Pass";
  pointEdge: number;
  fairProbability: number | null;
  shrunkProbability: number | null;
  expectedValue: number | null;
  edgeInterval: [number, number] | null;
}

export interface TeaserCandidate {
  gameId: string;
  book: "betmgm" | "fanduel";
  team: string;
  opponent: string;
  originalPoint: number;
  teasedPoint: number;
  fairProbability: number | null;
  pushProbability: number | null;
  fairAmerican: number | null;
  classification: "classic_wong" | "key_number" | "ordinary";
  crossedKeys: number[];
  warning: "none" | "interpolated" | "extrapolated" | "unsupported";
}

export interface TeaserPairCandidate {
  id: string;
  book: "betmgm" | "fanduel";
  legs: [TeaserCandidate, TeaserCandidate];
  offeredAmerican: number;
  fairProbability: number;
  pushProbability: number;
  lossProbability: number;
  fairAmerican: number;
  expectedValue: number;
}

export interface TwoTeamTeaserValue {
  winProbability: number;
  pushProbability: number;
  lossProbability: number;
  fairAmerican: number;
  expectedValue: number;
}

export interface MatchupSignal {
  id: "efficiency" | "success" | "explosive" | "turnovers" | "pace";
  label: string;
  lean: string;
  detail: string;
  strength: number;
}

export interface LineMovementPoint {
  point: number;
  americanPrice: number;
  capturedAt: string;
}

export interface LineMovementSeries {
  book: "betmgm" | "fanduel";
  market: "spread";
  side: string;
  snapshots: LineMovementPoint[];
}

export interface GameAvailabilityContext {
  status: "current" | "stale" | "pending";
  reportedPlayers: number;
  out: number;
  doubtful: number;
  questionable: number;
  qbListed: number;
  qbOutOrDoubtful: number;
  capturedAt: string | null;
}

export interface GameWeatherContext {
  status: "current" | "stale" | "pending" | "indoors" | "unconfirmed";
  roof: "outdoor" | "open" | "closed" | "fixed" | "unconfirmed";
  windMph: number | null;
  temperatureF: number | null;
  precipitationProbability: number | null;
  capturedAt: string | null;
  totalAdjustmentPoints: number;
  trainingGames: number | null;
}

export function summarizeGameAvailability(input: {
  freshness: "current" | "stale" | "running" | "unavailable" | null;
  lastSuccessAt: string | null;
  counts?: {
    reportedPlayers: number;
    out: number;
    doubtful: number;
    questionable: number;
    qbListed: number;
    qbOutOrDoubtful: number;
    sourceTimestamp: string | null;
  } | null;
}): GameAvailabilityContext {
  return {
    status: input.lastSuccessAt ? (input.freshness === "current" ? "current" : "stale") : "pending",
    reportedPlayers: input.counts?.reportedPlayers ?? 0,
    out: input.counts?.out ?? 0,
    doubtful: input.counts?.doubtful ?? 0,
    questionable: input.counts?.questionable ?? 0,
    qbListed: input.counts?.qbListed ?? 0,
    qbOutOrDoubtful: input.counts?.qbOutOrDoubtful ?? 0,
    capturedAt: input.counts?.sourceTimestamp ?? input.lastSuccessAt
  };
}

export interface DecisionBoardGame {
  gameId: string;
  away: TeamBaseline | null;
  home: TeamBaseline | null;
  projections: BaselineProjection[];
  totals: TotalProjection[];
  teasers: TeaserCandidate[];
  signals: MatchupSignal[];
  movements: LineMovementSeries[];
  availability: GameAvailabilityContext;
  weather: GameWeatherContext;
}

export interface DecisionBoardPayload {
  generatedAt: string;
  season: number;
  week: number;
  basisSeason: number | null;
  artifactHash: string | null;
  games: DecisionBoardGame[];
  teaserPairs: TeaserPairCandidate[];
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
  executionBook: "betmgm" | "fanduel";
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
    const executionBook = quote.book === "betmgm" ? "betmgm" : quote.book === "fanduel" ? "fanduel" : null;
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
  return (["betmgm", "fanduel"] as const).flatMap((book) => candidates
    .filter((candidate) => candidate.executionBook === book)
    .sort((left, right) => right.lowerBoundExpectedValue - left.lowerBoundExpectedValue || right.expectedValue - left.expectedValue)
    .slice(0, maximumPerBook));
}

export function fairAmericanFromProbability(probability: number): number {
  return Math.round(impliedToAmerican(probability));
}

export function priceTwoTeamTeaser(
  legs: readonly { coverProbability: number; pushProbability: number }[],
  offeredAmerican: number
): TwoTeamTeaserValue | null {
  if (legs.length !== 2) return null;
  if (legs.some((leg) =>
    !Number.isFinite(leg.coverProbability) || !Number.isFinite(leg.pushProbability) ||
    leg.coverProbability < 0 || leg.pushProbability < 0 || leg.coverProbability + leg.pushProbability > 1
  )) return null;
  const winProbability = legs.reduce((product, leg) => product * leg.coverProbability, 1);
  const noLossProbability = legs.reduce((product, leg) => product * (leg.coverProbability + leg.pushProbability), 1);
  const pushProbability = Math.max(0, noLossProbability - winProbability);
  const lossProbability = Math.max(0, 1 - winProbability - pushProbability);
  if (!(winProbability > 0) || !(winProbability + lossProbability > 0)) return null;
  const conditionalWinProbability = winProbability / (winProbability + lossProbability);
  return {
    winProbability,
    pushProbability,
    lossProbability,
    fairAmerican: fairAmericanFromProbability(conditionalWinProbability),
    expectedValue: winProbability * americanToDecimal(offeredAmerican) + pushProbability - 1
  };
}

export function isClassicWongPoint(point: number): boolean {
  return (point >= 1.5 && point <= 2.5) || (point >= -8.5 && point <= -7.5);
}

export function crossedKeyNumbers(fromPoint: number, toPoint: number, keys = [3, 6, 7, 10, 14]): number[] {
  const low = Math.min(fromPoint, toPoint);
  const high = Math.max(fromPoint, toPoint);
  return keys.filter((key) => (low < key && high > key) || (low < -key && high > -key));
}

export function rankTeaserPairs(
  candidates: readonly TeaserCandidate[],
  options: { offeredAmerican?: number; maximum?: number; preferredTeams?: readonly string[]; exceptionalEvThreshold?: number } = {}
): TeaserPairCandidate[] {
  const offeredAmerican = options.offeredAmerican ?? -120;
  const preferred = new Set(options.preferredTeams ?? ["SEA", "ATL"]);
  const exceptionalEvThreshold = options.exceptionalEvThreshold ?? 0.05;
  const pairs: TeaserPairCandidate[] = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (left.fairProbability === null || left.pushProbability === null || left.warning === "unsupported") continue;
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex];
      if (right.fairProbability === null || right.pushProbability === null || right.warning === "unsupported") continue;
      if (left.book !== right.book || left.gameId === right.gameId) continue;
      const priced = priceTwoTeamTeaser([
        { coverProbability: left.fairProbability, pushProbability: left.pushProbability },
        { coverProbability: right.fairProbability, pushProbability: right.pushProbability }
      ], offeredAmerican);
      if (!priced) continue;
      const fairProbability = priced.winProbability;
      const expectedValue = priced.expectedValue;
      if (expectedValue < 0) continue;
      const opposesPreferredTeam = preferred.has(left.opponent) || preferred.has(right.opponent);
      if (opposesPreferredTeam && expectedValue < exceptionalEvThreshold) continue;
      const legs = [left, right] as [TeaserCandidate, TeaserCandidate];
      pairs.push({
        id: `teaser-pair:${left.book}:${left.gameId}:${left.team}:${right.gameId}:${right.team}`,
        book: left.book,
        legs,
        offeredAmerican,
        fairProbability,
        pushProbability: priced.pushProbability,
        lossProbability: priced.lossProbability,
        fairAmerican: priced.fairAmerican,
        expectedValue
      });
    }
  }
  return pairs.sort((left, right) =>
    right.expectedValue - left.expectedValue ||
    right.legs.filter((leg) => leg.classification === "classic_wong").length - left.legs.filter((leg) => leg.classification === "classic_wong").length
  ).slice(0, options.maximum ?? 8);
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
