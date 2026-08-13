import { americanToDecimal, impliedToAmerican, powerDevig, shrinkProbability } from "./odds";
import { bootstrapEdgeInterval } from "./bootstrap";
import { structuralConfig } from "./config";
import { sizeKelly } from "./sizing";

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

export interface MoneylineProjection {
  gameId: string;
  book: "betmgm" | "fanduel";
  homeTeam: string;
  marketHomeProbability: number;
  consensusHomeProbability: number;
  modelHomeProbability: number | null;
  shrunkHomeProbability: number | null;
  tieProbability: number | null;
  homeExpectedValue: number | null;
  awayExpectedValue: number | null;
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
  id: "efficiency" | "success" | "explosive" | "turnovers" | "pace" | "pass_rate" | "rest" | "strength";
  label: string;
  lean: string;
  detail: string;
  strength: number;
}

function matchupMetricSignal(input: {
  id: "efficiency" | "success" | "explosive";
  label: string;
  away: TeamBaseline;
  home: TeamBaseline;
  awayOffenseRank: number;
  homeOffenseRank: number;
  awayDefenseRank: number;
  homeDefenseRank: number;
}): MatchupSignal | null {
  const awayScore = 33 - input.awayOffenseRank + input.homeDefenseRank;
  const homeScore = 33 - input.homeOffenseRank + input.awayDefenseRank;
  const difference = homeScore - awayScore;
  if (Math.abs(difference) < 7) return null;
  const team = difference > 0 ? input.home : input.away;
  const opponent = difference > 0 ? input.away : input.home;
  const offenseRank = difference > 0 ? input.homeOffenseRank : input.awayOffenseRank;
  const opponentDefenseRank = difference > 0 ? input.awayDefenseRank : input.homeDefenseRank;
  return {
    id: input.id,
    label: input.label,
    lean: team.team,
    detail: `${team.team} O #${offenseRank} vs ${opponent.team} D #${opponentDefenseRank}`,
    strength: Math.abs(difference)
  };
}

export function matchupSignals(
  away: TeamBaseline | null,
  home: TeamBaseline | null,
  context: { awayRest: number | null; homeRest: number | null } = { awayRest: null, homeRest: null }
): MatchupSignal[] {
  if (!away || !home) return [];
  const candidates: Array<MatchupSignal | null> = [
    matchupMetricSignal({
      id: "efficiency", label: "EPA EDGE", away, home,
      awayOffenseRank: away.ranks.epa, homeOffenseRank: home.ranks.epa,
      awayDefenseRank: away.ranks.defenseEpa, homeDefenseRank: home.ranks.defenseEpa
    }),
    matchupMetricSignal({
      id: "success", label: "DOWN-TO-DOWN", away, home,
      awayOffenseRank: away.ranks.success, homeOffenseRank: home.ranks.success,
      awayDefenseRank: away.ranks.defenseSuccess, homeDefenseRank: home.ranks.defenseSuccess
    }),
    matchupMetricSignal({
      id: "explosive", label: "EXPLOSIVE", away, home,
      awayOffenseRank: away.ranks.explosive, homeOffenseRank: home.ranks.explosive,
      awayDefenseRank: away.ranks.defenseExplosive, homeDefenseRank: home.ranks.defenseExplosive
    })
  ];
  const turnoverDifference = away.regressedTurnoverRate - home.regressedTurnoverRate;
  if (Math.abs(turnoverDifference) >= 0.003) {
    const lean = turnoverDifference > 0 ? home : away;
    candidates.push({
      id: "turnovers",
      label: "BALL SECURITY",
      lean: lean.team,
      detail: `${(lean.regressedTurnoverRate * 100).toFixed(1)}% regressed turnover rate`,
      strength: Math.abs(turnoverDifference) * 1_000
    });
  }
  if (away.ranks.pace !== null && home.ranks.pace !== null) {
    if (away.ranks.pace <= 12 && home.ranks.pace <= 12) {
      candidates.push({ id: "pace", label: "PACE", lean: "OVER", detail: `tempo #${away.ranks.pace} / #${home.ranks.pace}`, strength: 9 });
    } else if (away.ranks.pace >= 21 && home.ranks.pace >= 21) {
      candidates.push({ id: "pace", label: "PACE", lean: "UNDER", detail: `tempo #${away.ranks.pace} / #${home.ranks.pace}`, strength: 9 });
    }
  }
  if (away.ranks.proe !== null && home.ranks.proe !== null) {
    if (away.ranks.proe <= 12 && home.ranks.proe <= 12) {
      candidates.push({ id: "pass_rate", label: "PASS TENDENCY", lean: "OVER", detail: `PROE #${away.ranks.proe} / #${home.ranks.proe}`, strength: 8 });
    } else if (away.ranks.proe >= 21 && home.ranks.proe >= 21) {
      candidates.push({ id: "pass_rate", label: "PASS TENDENCY", lean: "UNDER", detail: `PROE #${away.ranks.proe} / #${home.ranks.proe}`, strength: 8 });
    }
  }
  const strengthRankGap = away.ranks.strength - home.ranks.strength;
  if (Math.abs(strengthRankGap) >= 7) {
    const lean = strengthRankGap > 0 ? home : away;
    const opponent = strengthRankGap > 0 ? away : home;
    candidates.push({
      id: "strength",
      label: "MARKET-ADJUSTED FORM",
      lean: lean.team,
      detail: `close-residual state #${lean.ranks.strength} vs ${opponent.team} #${opponent.ranks.strength}`,
      strength: Math.abs(strengthRankGap) * 1.1
    });
  }
  if (context.awayRest !== null && context.homeRest !== null) {
    const restGap = context.homeRest - context.awayRest;
    if (Math.abs(restGap) >= 2) {
      const lean = restGap > 0 ? home : away;
      const leanRest = restGap > 0 ? context.homeRest : context.awayRest;
      const opponentRest = restGap > 0 ? context.awayRest : context.homeRest;
      candidates.push({
        id: "rest",
        label: "REST",
        lean: lean.team,
        detail: `${leanRest} days vs ${opponentRest} days`,
        strength: 7 + Math.abs(restGap)
      });
    }
  }
  return candidates.filter((signal): signal is MatchupSignal => signal !== null)
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 3);
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
  inactivesConfirmed: boolean;
  inactivePlayers: number;
  out: number;
  doubtful: number;
  questionable: number;
  qbListed: number;
  qbOutOrDoubtful: number;
  qbInactive: number;
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
  pregame?: {
    freshness: "current" | "stale" | "running" | "unavailable";
    lastSuccessAt: string | null;
    inactivesConfirmed: boolean;
    inactivePlayers: number;
    qbInactive: number;
    sourceTimestamp: string | null;
  } | null;
}): GameAvailabilityContext {
  const hasCurrent = input.freshness === "current"
    || (input.pregame?.inactivesConfirmed && input.pregame.freshness === "current");
  const hasAny = Boolean(input.lastSuccessAt || input.pregame?.lastSuccessAt);
  const sourceTimestamps = [input.counts?.sourceTimestamp, input.pregame?.sourceTimestamp]
    .filter((value): value is string => Boolean(value)).sort();
  const successTimestamps = [input.lastSuccessAt, input.pregame?.lastSuccessAt]
    .filter((value): value is string => Boolean(value)).sort();
  return {
    status: hasAny ? (hasCurrent ? "current" : "stale") : "pending",
    reportedPlayers: input.counts?.reportedPlayers ?? 0,
    inactivesConfirmed: input.pregame?.inactivesConfirmed ?? false,
    inactivePlayers: input.pregame?.inactivePlayers ?? 0,
    out: input.counts?.out ?? 0,
    doubtful: input.counts?.doubtful ?? 0,
    questionable: input.counts?.questionable ?? 0,
    qbListed: input.counts?.qbListed ?? 0,
    qbOutOrDoubtful: (input.counts?.qbOutOrDoubtful ?? 0) + (input.pregame?.qbInactive ?? 0),
    qbInactive: input.pregame?.qbInactive ?? 0,
    capturedAt: sourceTimestamps.at(-1) ?? successTimestamps.at(-1) ?? null
  };
}

export interface DecisionBoardGame {
  gameId: string;
  away: TeamBaseline | null;
  home: TeamBaseline | null;
  projections: BaselineProjection[];
  totals: TotalProjection[];
  moneylines: MoneylineProjection[];
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
  championHash: string | null;
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
  sourceQuoteId: string;
  gameId: string;
  executionBook: "betmgm" | "fanduel";
  market: PropMarketKey;
  player: string;
  side: "Over" | "Under";
  point: number;
  americanPrice: number;
  executionFairProbability: number;
  consensusProbability: number;
  betProbability: number;
  modelProbability: number | null;
  projectedValue: number | null;
  sampleGames: number | null;
  hitRate: number | null;
  consensusInterval: [number, number];
  edge: number;
  edgeInterval: [number, number];
  expectedValue: number;
  lowerBoundExpectedValue: number;
  suggestedUnits: number;
  unitsGreyed: boolean;
  referenceBooks: number;
  capturedAt: string;
}

export interface PlayerPropHistoryRow {
  player: string;
  market: PropMarketKey;
  season: number;
  week: number;
  value: number;
  opportunities: number;
}

export interface PlayerPropEvidence {
  player: string;
  market: PropMarketKey;
  side: "Over" | "Under";
  point: number;
  sampleGames: number;
  projectedValue: number;
  hitRate: number;
  modelProbability: number;
  probabilityInterval: [number, number];
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

function normalizedPlayerName(value: string): string {
  return value.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "");
}

export function playerPropEvidenceKey(input: Pick<PlayerPropEvidence, "player" | "market" | "side" | "point">): string {
  return `${input.market}:${normalizedPlayerName(input.player)}:${input.side}:${input.point}`;
}

export function buildPlayerPropEvidence(
  history: readonly PlayerPropHistoryRow[],
  contract: { player: string; market: PropMarketKey; side: "Over" | "Under"; point: number },
  options: { minimumGames?: number; windowGames?: number; priorGames?: number } = {}
): PlayerPropEvidence | null {
  const minimumGames = options.minimumGames ?? structuralConfig.props.minimumHistoryGames;
  const windowGames = options.windowGames ?? structuralConfig.props.historyWindowGames;
  const priorGames = options.priorGames ?? structuralConfig.props.priorGames;
  const playerKey = normalizedPlayerName(contract.player);
  const samples = history
    .filter((row) => normalizedPlayerName(row.player) === playerKey && row.market === contract.market && row.opportunities > 0)
    .sort((left, right) => right.season - left.season || right.week - left.week)
    .slice(0, windowGames);
  if (samples.length < minimumGames) return null;
  const weighted = samples.map((row, index) => ({ row, weight: structuralConfig.props.recencyWeight ** index }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const projectedValue = weighted.reduce((sum, item) => sum + item.row.value * item.weight, 0) / totalWeight;
  const hits = weighted.map((item) => ({
    edge: item.row.value === contract.point ? 0.5 : contract.side === "Over" ? Number(item.row.value > contract.point) : Number(item.row.value < contract.point),
    weight: item.weight
  }));
  const weightedHits = hits.reduce((sum, item) => sum + item.edge * item.weight, 0);
  const modelProbability = (weightedHits + priorGames * 0.5) / (totalWeight + priorGames);
  const bootstrapRows = [
    ...hits,
    ...Array.from({ length: priorGames }, () => ({ edge: 0.5, weight: 1 }))
  ];
  const bootstrap = bootstrapEdgeInterval(
    bootstrapRows,
    structuralConfig.model.bootstrapMembers,
    structuralConfig.model.bootstrapSeedStart
  );
  return {
    ...contract,
    sampleGames: samples.length,
    projectedValue,
    hitRate: weightedHits / totalWeight,
    modelProbability,
    probabilityInterval: bootstrap.interval
  };
}

export function scanMarketConfirmedProps(
  quotes: readonly RawPropQuote[],
  options: {
    minimumReferenceBooks?: number;
    minimumExpectedValue?: number;
    maximumPerBook?: number;
    maximumSnapshotSkewMs?: number;
    evidence?: readonly PlayerPropEvidence[];
    requireEvidence?: boolean;
  } = {}
): PropCandidate[] {
  const minimumReferenceBooks = options.minimumReferenceBooks ?? structuralConfig.props.minimumReferenceBooks;
  const minimumExpectedValue = options.minimumExpectedValue ?? structuralConfig.props.minimumExpectedValue;
  const maximumPerBook = options.maximumPerBook ?? structuralConfig.props.maximumPerBook;
  const maximumSnapshotSkewMs = options.maximumSnapshotSkewMs ?? Number.POSITIVE_INFINITY;
  const evidence = new Map((options.evidence ?? []).map((item) => [playerPropEvidenceKey(item), item]));
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
        Math.abs(Date.parse(reference.capturedAt) - Date.parse(quote.capturedAt)) <= maximumSnapshotSkewMs &&
        fair.has(reference.id)
      )
      .map((reference) => ({ book: reference.book, probability: fair.get(reference.id)! }));
    const onePerBook = [...new Map(references.map((reference) => [reference.book, reference.probability])).values()]
      .sort((left, right) => left - right);
    if (onePerBook.length < minimumReferenceBooks) continue;
    const consensusProbability = percentile(onePerBook, 0.5);
    const low = onePerBook[0];
    const high = onePerBook.at(-1)!;
    const playerEvidence = evidence.get(playerPropEvidenceKey(quote));
    if (options.requireEvidence && !playerEvidence) continue;
    if (playerEvidence) {
      const aligns = quote.side === "Over" ? playerEvidence.projectedValue > quote.point : playerEvidence.projectedValue < quote.point;
      if (!aligns || playerEvidence.hitRate < structuralConfig.props.minimumHitRate) continue;
    }
    const betProbability = playerEvidence
      ? shrinkProbability(playerEvidence.modelProbability, consensusProbability, structuralConfig.model.shrinkageWeight)
      : consensusProbability;
    const intervalLow = playerEvidence
      ? shrinkProbability(playerEvidence.probabilityInterval[0], low, structuralConfig.model.shrinkageWeight)
      : low;
    const intervalHigh = playerEvidence
      ? shrinkProbability(playerEvidence.probabilityInterval[1], high, structuralConfig.model.shrinkageWeight)
      : high;
    const expectedValue = betProbability * americanToDecimal(quote.americanPrice) - 1;
    const lowerBoundExpectedValue = intervalLow * americanToDecimal(quote.americanPrice) - 1;
    if (expectedValue < minimumExpectedValue || lowerBoundExpectedValue <= 0) continue;
    const edgeInterval = [intervalLow - executionFairProbability, intervalHigh - executionFairProbability] as [number, number];
    const sizing = sizeKelly(betProbability, quote.americanPrice, edgeInterval, {
      referenceBankrollUnits: structuralConfig.sizing.referenceBankrollUnits,
      kellyFraction: structuralConfig.sizing.kellyFraction,
      increment: structuralConfig.sizing.roundDownUnits,
      minimum: structuralConfig.sizing.minimumUnits,
      maximum: structuralConfig.sizing.maximumUnits
    });
    if (!sizing.included) continue;
    candidates.push({
      id: `prop:${quote.id}`,
      sourceQuoteId: quote.id,
      gameId: quote.gameId,
      executionBook,
      market: quote.market,
      player: quote.player,
      side: quote.side,
      point: quote.point,
      americanPrice: quote.americanPrice,
      executionFairProbability,
      consensusProbability,
      betProbability,
      modelProbability: playerEvidence?.modelProbability ?? null,
      projectedValue: playerEvidence?.projectedValue ?? null,
      sampleGames: playerEvidence?.sampleGames ?? null,
      hitRate: playerEvidence?.hitRate ?? null,
      consensusInterval: [low, high],
      edge: betProbability - executionFairProbability,
      edgeInterval,
      expectedValue,
      lowerBoundExpectedValue,
      suggestedUnits: sizing.suggestedUnits,
      unitsGreyed: sizing.greyed,
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
  return ({ LA: "LAR", STL: "LAR", SD: "LAC", OAK: "LV", JAC: "JAX" } as Record<string, string>)[team] ?? team;
}
