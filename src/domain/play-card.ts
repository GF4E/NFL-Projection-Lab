import { structuralConfig } from "./config";
import { americanToDecimal, impliedToAmerican } from "./odds";

export type PlayType = "single" | "parlay" | "teaser";
export type PlayConfidence = "watch" | "lean" | "play" | "best";
export type PlayStatus = "research" | "card" | "placed" | "settled" | "passed";
export type PlayResult = "pending" | "win" | "loss" | "push" | "void";
export type PickedBy = "gabe" | "jarrett";
export type PlayExecutionStatus = "paper" | "executed";

export type PlayForecastLegSnapshot = {
  sourceQuoteId: string;
  gameId: string;
  market: StoredPlayLeg["market"];
  side: string;
  point: number | null;
  americanPrice: number;
  book: "betmgm" | "fanduel";
  capturedAt: string;
  sourceHash: string;
  marketProbability: number | null;
  modelProbability: number | null;
  betProbability: number | null;
  pushProbability: number | null;
  uncertaintyInterval: [number, number] | null;
  uncertaintyMembers: number[] | null;
  expectedValue: number | null;
};

export type PlayForecastSnapshot = {
  generatedAt: string;
  boardGeneratedAt: string;
  championHash: string | null;
  ensembleHash: string | null;
  configHash: string;
  dataHash: string;
  artifactHash: string | null;
  consensusSnapshotId: string;
  displayedExpectedValuePercent: number;
  /** Server-recomputed from the frozen contract; null when the contract has no supported aggregate EV. */
  authoritativeExpectedValuePercent: number | null;
  /** Contract-level 80% decisive-win probability interval. */
  authoritativeProbabilityInterval: [number, number] | null;
  uncertaintyConfiguration: {
    members: number;
    seedStart: number;
    intervalPercentiles: [number, number];
  };
  /** Quarter-Kelly result at the exact frozen payout; null when unsupported. */
  suggestedUnits: number | null;
  unitsGreyed: boolean;
  displayedEdgePp: number;
  legs: PlayForecastLegSnapshot[];
};

export function forecastApprovalEligibilityError(
  play: Pick<WeeklyPlay, "playType" | "contract">,
  snapshot: PlayForecastSnapshot
): string | null {
  const contract = play.contract ?? [];
  const snapshotByQuote = new Map(snapshot.legs.map((leg) => [leg.sourceQuoteId, leg]));
  for (const leg of contract.filter((item) => item.market === "prop")) {
    const evidence = leg.sourceQuoteId ? snapshotByQuote.get(leg.sourceQuoteId) : null;
    if (!evidence || evidence.market !== "prop" || evidence.betProbability === null ||
      evidence.uncertaintyInterval === null || evidence.expectedValue === null ||
      evidence.expectedValue < structuralConfig.props.minimumExpectedValue) {
      return "This player prop no longer clears the current multi-book, history, uncertainty, and availability gates.";
    }
  }
  if (play.playType === "teaser" && (
    snapshot.authoritativeExpectedValuePercent === null ||
    snapshot.authoritativeExpectedValuePercent < -1e-9
  )) {
    return "The exact two-team teaser price is negative EV; refresh the price or choose another pair.";
  }
  if ((play.playType === "single" || play.playType === "teaser") && (
    snapshot.authoritativeProbabilityInterval === null ||
    snapshot.suggestedUnits === null ||
    snapshot.suggestedUnits < structuralConfig.sizing.minimumUnits
  )) {
    return "This contract does not clear the current uncertainty and 0.5u Kelly inclusion gates.";
  }
  return null;
}

export type StoredPlayLeg = {
  sourceQuoteId?: string;
  gameId: string;
  market: "spread" | "total" | "moneyline" | "prop" | "teaser";
  side: string;
  point: number | null;
  americanPrice: number;
  selection: string;
};

export type WeeklyPlay = {
  id: string;
  contractKey?: string;
  contract?: StoredPlayLeg[];
  forecastSnapshot?: PlayForecastSnapshot | null;
  approvals?: PickedBy[];
  season: number;
  week: number;
  gameId: string;
  playType: PlayType;
  market: string;
  primaryReason: string;
  pickedBy: PickedBy;
  title: string;
  legs: string;
  book: string;
  americanOdds: number;
  stakeCents: number;
  modelEdgePp: number;
  estimatedEvPercent: number;
  confidence: PlayConfidence;
  statsCase: string;
  footballCase: string;
  executionStatus: PlayExecutionStatus;
  cashPlacementConfirmed: boolean;
  status: PlayStatus;
  result: PlayResult;
  profitCents: number;
  closingClvCents: number | null;
  closingClvPoints: number | null;
  clvReferenceBook: "BetMGM" | "FanDuel" | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const UNIT_CENTS = 2_500;
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1_000;

export function approvalActorForEmail(
  email: string | null | undefined,
  gabeEmail: string,
  jarrettEmail: string
): PickedBy | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === gabeEmail.trim().toLowerCase()) return "gabe";
  if (normalized === jarrettEmail.trim().toLowerCase()) return "jarrett";
  return null;
}

export function storedLegMatchesQuote(
  leg: StoredPlayLeg,
  quote: { point: number | null; americanPrice: number }
): boolean {
  const expectedPoint = leg.market === "teaser" && leg.point !== null ? leg.point - 6 : leg.point;
  return quote.point === expectedPoint && (leg.market === "teaser" || quote.americanPrice === leg.americanPrice);
}

export function normalizeBookKey(book: string): "betmgm" | "fanduel" | null {
  const normalized = book.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized === "betmgm" || normalized === "fanduel" ? normalized : null;
}

export function storedLegMatchesSource(
  leg: StoredPlayLeg,
  selectedBook: string,
  quote: {
    gameId: string;
    book: string;
    market: string;
    side: string;
    point: number | null;
    americanPrice: number;
  }
): boolean {
  const expectedMarket = leg.market === "teaser" ? "spread" : leg.market;
  const sameMarket = leg.market === "prop" || quote.market === expectedMarket;
  return normalizeBookKey(selectedBook) !== null
    && normalizeBookKey(selectedBook) === normalizeBookKey(quote.book)
    && quote.gameId === leg.gameId
    && sameMarket
    && quote.side.trim().toLowerCase() === leg.side.trim().toLowerCase()
    && storedLegMatchesQuote(leg, quote);
}

export function validateStoredPlayContract(
  play: Pick<WeeklyPlay, "playType" | "market" | "gameId" | "contract">
): string[] {
  const contract = play.contract ?? [];
  if (!contract.length) return ["A stored contract must contain at least one leg"];
  const errors: string[] = [];
  const sourceIds = contract.map((item) => item.sourceQuoteId?.trim() ?? "");
  if (sourceIds.some((id) => !id)) errors.push("Every contract leg must reference its live source quote");
  if (new Set(sourceIds).size !== sourceIds.length) errors.push("A source quote can appear only once in a contract");

  if (play.playType === "single") {
    if (contract.length !== 1) errors.push("A straight contract must contain exactly one leg");
    const first = contract[0];
    if (first?.market === "teaser") errors.push("A teaser leg cannot be stored as a straight");
    if (first && play.market !== first.market) errors.push("The straight market must match its stored leg");
    if (first && play.gameId !== first.gameId) errors.push("The straight game must match its stored leg");
  } else if (play.playType === "parlay") {
    if (contract.length < 2) errors.push("A parlay contract must contain at least two legs");
    if (play.market !== "parlay") errors.push("A parlay contract must use the parlay market");
    if (contract.some((item) => item.market === "teaser")) errors.push("Teaser legs cannot be stored in a standard parlay");
    if (new Set(contract.map((item) => item.gameId)).size !== contract.length) {
      errors.push("Parlay legs must come from different games because same-game correlation is not modeled");
    }
  } else {
    if (contract.length !== 2) errors.push("A teaser contract must contain exactly two legs");
    if (play.market !== "teaser") errors.push("A teaser contract must use the teaser market");
    if (contract.some((item) => item.market !== "teaser")) errors.push("A teaser contract may contain only teaser legs");
    if (new Set(contract.map((item) => item.gameId)).size !== contract.length) {
      errors.push("Teaser legs must come from two different games");
    }
  }
  return [...new Set(errors)];
}

export function validateStoredPlayPrice(
  play: Pick<WeeklyPlay, "playType" | "americanOdds" | "contract">
): string | null {
  const contract = play.contract ?? [];
  if (!contract.length) return "A stored contract must contain at least one leg";
  if (play.playType === "single") {
    return contract.length === 1 && play.americanOdds === contract[0].americanPrice
      ? null
      : "The straight payout must match its exact source quote";
  }
  if (play.playType === "teaser") {
    return structuralConfig.teasers.selectableAmericanPrices.includes(play.americanOdds)
      ? null
      : "The teaser payout must be a confirmed selectable two-team price";
  }
  const offeredDecimal = contract.reduce(
    (product, leg) => product * americanToDecimal(leg.americanPrice),
    1
  );
  const expectedAmerican = Math.round(impliedToAmerican(1 / offeredDecimal));
  return play.americanOdds === expectedAmerican
    ? null
    : "The parlay payout does not match its frozen component prices";
}

export function addTeamApproval(current: readonly PickedBy[], actor: PickedBy): PickedBy[] {
  return ([...new Set([...current, actor])] as PickedBy[]).sort((left, right) => left === "gabe" ? -1 : right === "gabe" ? 1 : 0);
}

export function isTeamApproved(approvals: readonly PickedBy[] | undefined): boolean {
  return approvals?.includes("gabe") === true && approvals.includes("jarrett");
}

/** Replays the immutable saved contract through the authenticated approval API. */
export function exactContractApprovalRequest(play: WeeklyPlay) {
  return {
    week: play.week,
    gameId: play.gameId,
    playType: play.playType,
    market: play.market,
    primaryReason: play.primaryReason,
    title: play.title,
    legs: play.legs,
    book: play.book,
    americanOdds: play.americanOdds,
    stakeDollars: play.stakeCents / 100,
    modelEdgePp: play.modelEdgePp,
    estimatedEvPercent: play.estimatedEvPercent,
    contract: play.contract ?? [],
    confidence: play.confidence,
    statsCase: play.statsCase,
    footballCase: play.footballCase,
    status: "card" as const
  };
}

export function earliestPlayKickoff(
  play: Pick<WeeklyPlay, "gameId" | "contract">,
  kickoffByGame: ReadonlyMap<string, string>
): string | null {
  const gameIds = play.contract?.length
    ? [...new Set(play.contract.map((leg) => leg.gameId))]
    : [play.gameId];
  const kickoffs = gameIds
    .map((gameId) => kickoffByGame.get(gameId))
    .filter((value): value is string => Boolean(value))
    .sort();
  return kickoffs[0] ?? null;
}

export function draftExpirationReason(
  play: Pick<WeeklyPlay, "gameId" | "contract" | "createdAt">,
  now: string,
  kickoffByGame: ReadonlyMap<string, string>
): "stale" | "kickoff" | null {
  const nowMs = Date.parse(now);
  const createdMs = Date.parse(play.createdAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(createdMs)) throw new Error("Draft timestamps must be valid ISO dates");
  const kickoff = earliestPlayKickoff(play, kickoffByGame);
  if (kickoff && nowMs >= Date.parse(kickoff)) return "kickoff";
  return nowMs - createdMs >= DRAFT_MAX_AGE_MS ? "stale" : null;
}

export function cashPlacementEligibilityError(
  play: Pick<WeeklyPlay, "approvals" | "status" | "result" | "executionStatus" | "cashPlacementConfirmed" | "gameId" | "contract">,
  now: string,
  kickoffByGame: ReadonlyMap<string, string>
): string | null {
  if (play.status === "placed" && play.executionStatus === "executed" && play.cashPlacementConfirmed) return null;
  if (!isTeamApproved(play.approvals)) return "Cash placement requires both teammates to approve the exact contract first";
  if (play.status !== "card" || play.result !== "pending") return "Only an open, jointly approved card can be marked as cash placed";
  const kickoff = earliestPlayKickoff(play, kickoffByGame);
  if (!kickoff) return "Cash placement is unavailable because kickoff could not be verified";
  const nowMs = Date.parse(now);
  const kickoffMs = Date.parse(kickoff);
  if (!Number.isFinite(nowMs) || !Number.isFinite(kickoffMs)) return "Cash placement timing is invalid";
  return nowMs >= kickoffMs ? "Cash placement must be confirmed before kickoff" : null;
}

function playGameMarkets(play: Pick<WeeklyPlay, "gameId" | "market" | "contract">): Map<string, string[]> {
  const output = new Map<string, string[]>();
  const legs = play.contract?.length
    ? play.contract
    : [{ gameId: play.gameId, market: play.market }];
  for (const leg of legs) {
    const markets = output.get(leg.gameId) ?? [];
    markets.push(leg.market);
    output.set(leg.gameId, markets);
  }
  return output;
}

export function validateTeamCardPortfolio(
  existing: readonly Pick<WeeklyPlay, "week" | "gameId" | "market" | "contract" | "stakeCents">[],
  proposed: Pick<WeeklyPlay, "week" | "gameId" | "market" | "contract" | "stakeCents">
): string[] {
  const errors: string[] = [];
  const units = proposed.stakeCents / UNIT_CENTS;
  if (units < structuralConfig.sizing.minimumUnits || units > structuralConfig.sizing.maximumUnits) {
    errors.push(`A pick must be between ${structuralConfig.sizing.minimumUnits}u and ${structuralConfig.sizing.maximumUnits}u`);
  }
  const weeklyUnits = existing
    .filter((play) => play.week === proposed.week)
    .reduce((sum, play) => sum + play.stakeCents / UNIT_CENTS, units);
  if (weeklyUnits > structuralConfig.sizing.maximumWeekUnits) {
    errors.push(`Weekly exposure cannot exceed ${structuralConfig.sizing.maximumWeekUnits}u`);
  }
  const proposedMarkets = playGameMarkets(proposed);
  const existingMarkets = existing.map((play) => ({ play, markets: playGameMarkets(play) }));
  for (const [gameId, markets] of proposedMarkets) {
    const gameUnits = existingMarkets
      .filter((item) => item.markets.has(gameId))
      .reduce((sum, item) => sum + item.play.stakeCents / UNIT_CENTS, units);
    if (gameUnits > structuralConfig.sizing.maximumGameUnits) {
      errors.push(`Game exposure cannot exceed ${structuralConfig.sizing.maximumGameUnits}u`);
    }
    const proposedSides = markets.filter((market) => ["spread", "moneyline", "teaser"].includes(market)).length;
    const existingSides = existingMarkets.reduce((count, item) => {
      const values = item.markets.get(gameId);
      return count + (values?.filter((market) => ["spread", "moneyline", "teaser"].includes(market)).length ?? 0);
    }, 0);
    if (proposedSides + existingSides > structuralConfig.sizing.maximumSidePositionsPerGame) {
      errors.push("Only one side position is permitted per game");
    }
    const proposedTotals = markets.filter((market) => market === "total").length;
    const existingTotals = existingMarkets.reduce((count, item) =>
      count + (item.markets.get(gameId)?.filter((market) => market === "total").length ?? 0), 0);
    if (proposedTotals + existingTotals > structuralConfig.sizing.maximumTotalsPerGame) {
      errors.push("Only one total is permitted per game");
    }
  }
  return [...new Set(errors)];
}

export function stakeToUnits(stakeCents: number): number {
  return Math.round((stakeCents / UNIT_CENTS) * 10) / 10;
}

export function trackerSummary(plays: readonly WeeklyPlay[]) {
  const settled = plays
    .filter((play) => play.status === "settled")
    .sort((left, right) => left.week - right.week || left.createdAt.localeCompare(right.createdAt));
  const stakedCents = settled.reduce((sum, play) => sum + play.stakeCents, 0);
  const profitCents = settled.reduce((sum, play) => sum + play.profitCents, 0);
  const clvRows = settled.filter((play) => play.closingClvCents !== null);
  const clvPointRows = settled.filter((play) => play.closingClvPoints !== null);
  const averageClvCents = clvRows.length
    ? clvRows.reduce((sum, play) => sum + (play.closingClvCents ?? 0), 0) / clvRows.length
    : 0;
  let runningProfitCents = 0;
  let peakProfitCents = 0;
  let maximumDrawdownCents = 0;
  for (const play of settled) {
    runningProfitCents += play.profitCents;
    peakProfitCents = Math.max(peakProfitCents, runningProfitCents);
    maximumDrawdownCents = Math.max(maximumDrawdownCents, peakProfitCents - runningProfitCents);
  }
  return {
    settledCount: settled.length,
    stakedCents,
    profitCents,
    roiPercent: stakedCents ? (profitCents / stakedCents) * 100 : 0,
    averageClvCents,
    averageClvPoints: clvPointRows.length
      ? clvPointRows.reduce((sum, play) => sum + (play.closingClvPoints ?? 0), 0) / clvPointRows.length
      : 0,
    clvCount: clvRows.length,
    percentBeatingClose: clvRows.length
      ? clvRows.filter((play) => (play.closingClvCents ?? 0) > 0).length / clvRows.length * 100
      : null,
    maximumDrawdownCents,
    winCount: settled.filter((play) => play.result === "win").length,
    lossCount: settled.filter((play) => play.result === "loss").length,
    pushCount: settled.filter((play) => ["push", "void"].includes(play.result)).length
  };
}

export function trackerRecordSummaries(plays: readonly WeeklyPlay[]) {
  return {
    full: trackerSummary(plays),
    executedOnly: trackerSummary(plays.filter((play) => play.executionStatus === "executed" && play.cashPlacementConfirmed))
  };
}

export function impliedProbability(americanOdds: number): number {
  if (americanOdds === 0) throw new Error("American odds cannot be zero");
  return americanOdds > 0
    ? 100 / (americanOdds + 100)
    : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

export function estimatedEvFromEdge(americanOdds: number, edgePercentagePoints: number): number {
  const marketProbability = impliedProbability(americanOdds);
  const betProbability = Math.min(0.99, Math.max(0.01, marketProbability + edgePercentagePoints / 100));
  const decimalOdds = americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds);
  return (betProbability * decimalOdds - 1) * 100;
}
