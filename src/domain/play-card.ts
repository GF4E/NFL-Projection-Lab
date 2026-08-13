import { structuralConfig } from "./config";

export type PlayType = "single" | "parlay" | "teaser";
export type PlayConfidence = "watch" | "lean" | "play" | "best";
export type PlayStatus = "research" | "card" | "placed" | "settled" | "passed";
export type PlayResult = "pending" | "win" | "loss" | "push" | "void";
export type PickedBy = "gabe" | "jarrett";
export type PlayExecutionStatus = "paper" | "executed";

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

export function approvalActorForEmail(email: string | null | undefined, jarrettEmail: string): PickedBy {
  return email?.trim().toLowerCase() === jarrettEmail.trim().toLowerCase() ? "jarrett" : "gabe";
}

export function storedLegMatchesQuote(
  leg: StoredPlayLeg,
  quote: { point: number | null; americanPrice: number }
): boolean {
  const expectedPoint = leg.market === "teaser" && leg.point !== null ? leg.point - 6 : leg.point;
  return quote.point === expectedPoint && (leg.market === "teaser" || quote.americanPrice === leg.americanPrice);
}

export function addTeamApproval(current: readonly PickedBy[], actor: PickedBy): PickedBy[] {
  return ([...new Set([...current, actor])] as PickedBy[]).sort((left, right) => left === "gabe" ? -1 : right === "gabe" ? 1 : 0);
}

export function isTeamApproved(approvals: readonly PickedBy[] | undefined): boolean {
  return approvals?.includes("gabe") === true && approvals.includes("jarrett");
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
