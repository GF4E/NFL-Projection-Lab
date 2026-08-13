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
  pushProbability: number | null;
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
  pushProbability: number | null;
  expectedValue: number | null;
  edgeInterval: [number, number] | null;
  translationWarning: "none" | "interpolated" | "extrapolated" | "unsupported";
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
  /** 80% interval for the decisive win probability at the teased point. */
  probabilityInterval: [number, number] | null;
  /** Fixed-seed member probabilities, retained in seed order for pair aggregation. */
  probabilityMembers: number[] | null;
  pushProbabilityMembers: number[] | null;
  fairAmerican: number | null;
  classification: "classic_wong" | "key_number" | "ordinary";
  crossedKeys: number[];
  warning: "none" | "interpolated" | "extrapolated" | "unsupported";
}

export interface TeaserPairCandidate {
  id: string;
  book: "betmgm" | "fanduel";
  legs: [TeaserCandidate, TeaserCandidate];
  /** Hypothetical price used to screen the pair; approval must use a confirmed live price. */
  screeningAmerican: number;
  fairProbability: number;
  pushProbability: number;
  lossProbability: number;
  fairAmerican: number;
  playToAmerican: number;
  expectedValue: number;
  edgeInterval: [number, number];
  suggestedUnits: number;
  unitsGreyed: boolean;
  translationWarning: "none" | "interpolated" | "extrapolated";
}

export interface TwoTeamTeaserValue {
  winProbability: number;
  pushProbability: number;
  lossProbability: number;
  conditionalWinProbability: number;
  fairAmerican: number;
  playToAmerican: number;
  expectedValue: number;
}

export interface TwoTeamTeaserDecision extends TwoTeamTeaserValue {
  edgeInterval: [number, number];
  sizing: ReturnType<typeof sizeKelly>;
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
      id: "efficiency", label: "ADJ EPA", away, home,
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
  // Preserve every threshold-clearing candidate here. The screen chooses the
  // exact contract first, then filters, ranks, and caps its relevant evidence.
  // A game-level cap would let strong side signals crowd a pace/PROE cue off a
  // total decision (and vice versa).
  return candidates.filter((signal): signal is MatchupSignal => signal !== null)
    .sort((left, right) => right.strength - left.strength);
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

export interface MatchupEvidenceProvenance {
  status: "current" | "stale" | "unavailable";
  provider: "nflverse";
  throughSeason: number | null;
  throughWeek: number | null;
  throughDate: string | null;
  expectedThroughSeason: number;
  expectedThroughWeek: number;
  featureGames: number;
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
  awayTeam?: string;
  homeTeam?: string;
  away: TeamBaseline | null;
  home: TeamBaseline | null;
  projections: BaselineProjection[];
  totals: TotalProjection[];
  moneylines: MoneylineProjection[];
  teasers: TeaserCandidate[];
  signals: MatchupSignal[];
  evidence: MatchupEvidenceProvenance;
  movements: LineMovementSeries[];
  availability: GameAvailabilityContext;
  weather: GameWeatherContext;
  quarterbacks: GameQuarterbackContext;
}

export interface TeamQuarterbackContext {
  team: string;
  referenceStarter: string | null;
  referenceSource: "latest_completed_start" | "unavailable";
  availability: "available" | "at_risk" | "inactive" | "unconfirmed";
  backupTier: string | null;
  learnedPointPrior: number | null;
  ownerOverridePoints: number | null;
  appliedTeamMarginPoints: number;
  sourceTimestamp: string | null;
  auditHash: string;
}

export interface GameQuarterbackContext {
  home: TeamQuarterbackContext;
  away: TeamQuarterbackContext;
  configStatus: string;
  forecastHandling: "validated_prior" | "market_only" | "owner_override";
}

export interface DecisionBoardPayload {
  generatedAt: string;
  season: number;
  week: number;
  basisSeason: number | null;
  artifactHash: string | null;
  configHash: string;
  dataHash: string;
  championHash: string | null;
  ensembleHash: string | null;
  championStatus: "compatible" | "config_mismatch" | "unavailable";
  games: DecisionBoardGame[];
  teaserPairs: TeaserPairCandidate[];
  marketCoverage: Array<{
    book: "betmgm" | "fanduel";
    market: "spread" | "total" | "moneyline";
    completeGames: number;
    totalGames: number;
    status: "complete" | "partial" | "unavailable";
  }>;
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
  participated?: boolean;
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

export function completeLeaguePropEfficiencyPrior(
  totals: {
    seasons: number;
    passingYards: number;
    attempts: number;
    rushingYards: number;
    carries: number;
    receivingYards: number;
    targets: number;
  } | null,
  requiredSeasons: number
): Record<PropMarketKey, number> | null {
  if (!totals || totals.seasons < requiredSeasons || totals.attempts <= 0 || totals.carries <= 0 || totals.targets <= 0) {
    return null;
  }
  return {
    player_pass_yds: totals.passingYards / totals.attempts,
    player_rush_yds: totals.rushingYards / totals.carries,
    player_reception_yds: totals.receivingYards / totals.targets
  };
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

export function normalizePropPlayerName(value: string): string {
  return value.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "");
}

export function propPlayerLookupPattern(player: string): string {
  const withoutSuffix = player.trim().replace(/\s+(?:jr\.?|sr\.?|ii|iii|iv)$/i, "");
  const tokens = withoutSuffix.match(/[a-z0-9]+/gi) ?? [];
  const surname = tokens.at(-1)?.toLowerCase() ?? normalizePropPlayerName(player);
  return `%${surname}%`;
}

export function isPropPlayerUnavailable(gameStatus: string | null, inactive = false): boolean {
  return inactive || /\b(?:out|doubtful)\b/i.test(gameStatus ?? "");
}

export function playerPropEvidenceKey(input: Pick<PlayerPropEvidence, "player" | "market" | "side" | "point">): string {
  return `${input.market}:${normalizePropPlayerName(input.player)}:${input.side}:${input.point}`;
}

/**
 * A power de-vig is defined only for a complete Over/Under contract. Reject a
 * partial provider payload before it can replace the last good prop board.
 */
export function assertCompletePropQuotePairs(quotes: readonly RawPropQuote[]): void {
  const contracts = new Map<string, Set<RawPropQuote["side"]>>();
  for (const quote of quotes) {
    const key = `${quote.gameId}:${quote.book}:${quote.market}:${normalizePropPlayerName(quote.player)}:${quote.point}`;
    const sides = contracts.get(key) ?? new Set<RawPropQuote["side"]>();
    if (sides.has(quote.side)) {
      throw new Error(`Player prop import was partial: duplicate ${quote.side} quote for ${quote.player}`);
    }
    sides.add(quote.side);
    contracts.set(key, sides);
  }
  for (const [key, sides] of contracts) {
    if (!sides.has("Over") || !sides.has("Under") || sides.size !== 2) {
      throw new Error(`Player prop import was partial: incomplete Over/Under contract ${key}`);
    }
  }
}

export function buildPlayerPropEvidence(
  history: readonly PlayerPropHistoryRow[],
  contract: { player: string; market: PropMarketKey; side: "Over" | "Under"; point: number },
  options: {
    minimumGames?: number;
    windowGames?: number;
    priorGames?: number;
    leagueYardsPerOpportunity?: Partial<Record<PropMarketKey, number>>;
  } = {}
): PlayerPropEvidence | null {
  const minimumGames = options.minimumGames ?? structuralConfig.props.minimumHistoryGames;
  const windowGames = options.windowGames ?? structuralConfig.props.historyWindowGames;
  const priorGames = options.priorGames ?? structuralConfig.props.priorGames;
  const playerKey = normalizePropPlayerName(contract.player);
  const samples = history
    .filter((row) =>
      normalizePropPlayerName(row.player) === playerKey &&
      row.market === contract.market &&
      (row.opportunities > 0 || row.participated === true)
    )
    .sort((left, right) => right.season - left.season || right.week - left.week)
    .slice(0, windowGames);
  if (samples.length < minimumGames) return null;
  const weighted = samples.map((row, index) => ({ row, weight: structuralConfig.props.recencyWeight ** index }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const weightedYards = weighted.reduce((sum, item) => sum + item.row.value * item.weight, 0);
  const projection = structuralConfig.props.projectionByMarket[contract.market];
  let projectedValue = weightedYards / totalWeight;
  if (projection.method === "usage_efficiency") {
    const leagueEfficiency = options.leagueYardsPerOpportunity?.[contract.market];
    if (leagueEfficiency === undefined || !Number.isFinite(leagueEfficiency) || leagueEfficiency <= 0) return null;
    const usageWeighted = samples.map((row, index) => ({ row, weight: projection.usageRecencyWeight ** index }));
    const usageWeight = usageWeighted.reduce((sum, item) => sum + item.weight, 0);
    const projectedOpportunities = usageWeighted.reduce((sum, item) => sum + item.row.opportunities * item.weight, 0) / usageWeight;
    const weightedOpportunities = weighted.reduce((sum, item) => sum + item.row.opportunities * item.weight, 0);
    const efficiency = (
      weightedYards + projection.efficiencyPriorOpportunities * leagueEfficiency
    ) / (
      weightedOpportunities + projection.efficiencyPriorOpportunities
    );
    projectedValue = projectedOpportunities * efficiency;
  }
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
    maximumQuoteAgeMs?: number;
    now?: string;
    evidence?: readonly PlayerPropEvidence[];
    requireEvidence?: boolean;
    availabilityConfirmed?: boolean;
    unavailablePlayers?: readonly string[];
    requireConfirmedAvailability?: boolean;
  } = {}
): PropCandidate[] {
  const minimumReferenceBooks = options.minimumReferenceBooks ?? structuralConfig.props.minimumReferenceBooks;
  const minimumExpectedValue = options.minimumExpectedValue ?? structuralConfig.props.minimumExpectedValue;
  const maximumPerBook = options.maximumPerBook ?? structuralConfig.props.maximumPerBook;
  const maximumSnapshotSkewMs = options.maximumSnapshotSkewMs ?? Number.POSITIVE_INFINITY;
  const maximumQuoteAgeMs = options.maximumQuoteAgeMs ?? Number.POSITIVE_INFINITY;
  const nowMs = options.now === undefined ? Number.NaN : Date.parse(options.now);
  const evidence = new Map((options.evidence ?? []).map((item) => [playerPropEvidenceKey(item), item]));
  if (options.requireConfirmedAvailability && options.availabilityConfirmed !== true) return [];
  const unavailablePlayers = new Set((options.unavailablePlayers ?? []).map(normalizePropPlayerName));
  const fair = deviggedQuotes(quotes);
  const candidates: PropCandidate[] = [];
  for (const quote of quotes) {
    const capturedAtMs = Date.parse(quote.capturedAt);
    if (!Number.isFinite(capturedAtMs) || Number.isFinite(nowMs) && nowMs - capturedAtMs > maximumQuoteAgeMs) continue;
    if (unavailablePlayers.has(normalizePropPlayerName(quote.player))) continue;
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
  return (["betmgm", "fanduel"] as const).flatMap((book) => {
    const ranked = candidates
      .filter((candidate) => candidate.executionBook === book)
      .sort((left, right) => right.lowerBoundExpectedValue - left.lowerBoundExpectedValue || right.expectedValue - left.expectedValue);
    const distinct: PropCandidate[] = [];
    const representedTheses = new Set<string>();
    for (const candidate of ranked) {
      const thesis = `${normalizePropPlayerName(candidate.player)}:${candidate.market}`;
      if (representedTheses.has(thesis)) continue;
      representedTheses.add(thesis);
      distinct.push(candidate);
      if (distinct.length === maximumPerBook) break;
    }
    return distinct;
  });
}

/** Choose at most one exact execution contract for each player/market thesis. */
export function rankBestExecutionProps(candidates: readonly PropCandidate[], maximum = 3): PropCandidate[] {
  const limit = Math.max(0, Math.floor(maximum));
  if (limit === 0) return [];
  const ranked = [...candidates].sort((left, right) =>
    right.lowerBoundExpectedValue - left.lowerBoundExpectedValue ||
    right.expectedValue - left.expectedValue ||
    right.edge - left.edge
  );
  const selected: PropCandidate[] = [];
  const representedTheses = new Set<string>();
  for (const candidate of ranked) {
    const thesis = `${normalizePropPlayerName(candidate.player)}:${candidate.market}`;
    if (representedTheses.has(thesis)) continue;
    representedTheses.add(thesis);
    selected.push(candidate);
    if (selected.length === limit) break;
  }
  return selected;
}

export function fairAmericanFromProbability(probability: number): number {
  return Math.round(impliedToAmerican(probability));
}

export function playToAmericanFromProbability(probability: number): number {
  return Math.ceil(impliedToAmerican(probability));
}

export function priceTwoTeamTeaser(
  legs: readonly { conditionalWinProbability: number; pushProbability: number }[],
  offeredAmerican: number
): TwoTeamTeaserValue | null {
  if (legs.length !== 2) return null;
  if (legs.some((leg) =>
    !Number.isFinite(leg.conditionalWinProbability) || !Number.isFinite(leg.pushProbability) ||
    leg.conditionalWinProbability < 0 || leg.conditionalWinProbability > 1 ||
    leg.pushProbability < 0 || leg.pushProbability >= 1
  )) return null;
  const rawLegs = legs.map((leg) => ({
    win: (1 - leg.pushProbability) * leg.conditionalWinProbability,
    push: leg.pushProbability
  }));
  const winProbability = rawLegs.reduce((product, leg) => product * leg.win, 1);
  const noLossProbability = rawLegs.reduce((product, leg) => product * (leg.win + leg.push), 1);
  const pushProbability = Math.max(0, noLossProbability - winProbability);
  const lossProbability = Math.max(0, 1 - winProbability - pushProbability);
  if (!(winProbability > 0) || !(winProbability + lossProbability > 0)) return null;
  const conditionalWinProbability = winProbability / (winProbability + lossProbability);
  return {
    winProbability,
    pushProbability,
    lossProbability,
    conditionalWinProbability,
    fairAmerican: fairAmericanFromProbability(conditionalWinProbability),
    playToAmerican: playToAmericanFromProbability(conditionalWinProbability),
    expectedValue: winProbability * americanToDecimal(offeredAmerican) + pushProbability - 1
  };
}

export function priceTwoTeamTeaserDecision(
  legs: readonly {
    conditionalWinProbability: number;
    pushProbability: number;
    probabilityMembers: readonly number[];
    pushProbabilityMembers: readonly number[];
  }[],
  offeredAmerican: number
): TwoTeamTeaserDecision | null {
  const memberCount = legs[0]?.probabilityMembers.length ?? 0;
  if (!memberCount || legs.some((leg) =>
    leg.probabilityMembers.length !== memberCount || leg.pushProbabilityMembers.length !== memberCount
  )) return null;
  const central = priceTwoTeamTeaser(legs, offeredAmerican);
  if (!central) return null;
  const memberProbabilities = Array.from({ length: memberCount }, (_, index) => priceTwoTeamTeaser(
    legs.map((leg) => ({
      conditionalWinProbability: leg.probabilityMembers[index],
      pushProbability: leg.pushProbabilityMembers[index]
    })),
    offeredAmerican
  )?.conditionalWinProbability ?? Number.NaN);
  if (memberProbabilities.some((probability) => !Number.isFinite(probability))) return null;
  const sorted = [...memberProbabilities].sort((left, right) => left - right);
  const percentile = (probability: number): number => {
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? sorted[lower]
      : sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
  };
  const [lowPercentile, highPercentile] = structuralConfig.model.intervalPercentiles;
  const breakEvenProbability = 1 / americanToDecimal(offeredAmerican);
  const edgeInterval: [number, number] = [
    percentile(lowPercentile) - breakEvenProbability,
    percentile(highPercentile) - breakEvenProbability
  ];
  return {
    ...central,
    edgeInterval,
    sizing: sizeKelly(central.conditionalWinProbability, offeredAmerican, edgeInterval, {
      referenceBankrollUnits: structuralConfig.sizing.referenceBankrollUnits,
      kellyFraction: structuralConfig.sizing.kellyFraction,
      increment: structuralConfig.sizing.roundDownUnits,
      minimum: structuralConfig.sizing.minimumUnits,
      maximum: structuralConfig.sizing.maximumUnits
    })
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
  options: {
    offeredAmerican: number;
    maximum?: number;
    minimumExpectedValue?: number;
    preferredTeams?: readonly string[];
    exceptionalEvThreshold?: number;
  }
): TeaserPairCandidate[] {
  const offeredAmerican = options.offeredAmerican;
  const minimumExpectedValue = options.minimumExpectedValue ?? 0;
  const preferred = new Set(options.preferredTeams ?? ["SEA", "ATL"]);
  const exceptionalEvThreshold = options.exceptionalEvThreshold ?? 0.05;
  const pairs: TeaserPairCandidate[] = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (left.fairProbability === null || left.pushProbability === null || left.probabilityInterval === null || left.probabilityMembers?.length !== structuralConfig.model.bootstrapMembers || left.pushProbabilityMembers?.length !== structuralConfig.model.bootstrapMembers || left.warning === "unsupported") continue;
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex];
      if (right.fairProbability === null || right.pushProbability === null || right.probabilityInterval === null || right.probabilityMembers?.length !== structuralConfig.model.bootstrapMembers || right.pushProbabilityMembers?.length !== structuralConfig.model.bootstrapMembers || right.warning === "unsupported") continue;
      if (left.book !== right.book || left.gameId === right.gameId) continue;
      const priced = priceTwoTeamTeaserDecision([
        {
          conditionalWinProbability: left.fairProbability,
          pushProbability: left.pushProbability,
          probabilityMembers: left.probabilityMembers,
          pushProbabilityMembers: left.pushProbabilityMembers
        },
        {
          conditionalWinProbability: right.fairProbability,
          pushProbability: right.pushProbability,
          probabilityMembers: right.probabilityMembers,
          pushProbabilityMembers: right.pushProbabilityMembers
        }
      ], offeredAmerican);
      if (!priced) continue;
      if (!priced.sizing.included) continue;
      const fairProbability = priced.conditionalWinProbability;
      const expectedValue = priced.expectedValue;
      if (expectedValue < minimumExpectedValue) continue;
      const opposesPreferredTeam = preferred.has(left.opponent) || preferred.has(right.opponent);
      if (opposesPreferredTeam && expectedValue < exceptionalEvThreshold) continue;
      const legs = [left, right] as [TeaserCandidate, TeaserCandidate];
      const translationWarning = [left.warning, right.warning].includes("extrapolated")
        ? "extrapolated" as const
        : [left.warning, right.warning].includes("interpolated")
          ? "interpolated" as const
          : "none" as const;
      pairs.push({
        id: `teaser-pair:${left.book}:${left.gameId}:${left.team}:${right.gameId}:${right.team}`,
        book: left.book,
        legs,
        screeningAmerican: offeredAmerican,
        fairProbability,
        pushProbability: priced.pushProbability,
        lossProbability: priced.lossProbability,
        fairAmerican: priced.fairAmerican,
        playToAmerican: priced.playToAmerican,
        expectedValue,
        edgeInterval: priced.edgeInterval,
        suggestedUnits: priced.sizing.suggestedUnits,
        unitsGreyed: priced.sizing.greyed,
        translationWarning
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
