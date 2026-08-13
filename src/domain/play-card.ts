export type PlayType = "single" | "parlay" | "teaser";
export type PlayConfidence = "watch" | "lean" | "play" | "best";
export type PlayStatus = "research" | "card" | "placed" | "settled" | "passed";
export type PlayResult = "pending" | "win" | "loss" | "push" | "void";
export type PickedBy = "gabe" | "jarrett";
export type PlayExecutionStatus = "paper" | "executed";

export type StoredPlayLeg = {
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

export function approvalActorForEmail(email: string | null | undefined, jarrettEmail: string): PickedBy {
  return email?.trim().toLowerCase() === jarrettEmail.trim().toLowerCase() ? "jarrett" : "gabe";
}

export function addTeamApproval(current: readonly PickedBy[], actor: PickedBy): PickedBy[] {
  return ([...new Set([...current, actor])] as PickedBy[]).sort((left, right) => left === "gabe" ? -1 : right === "gabe" ? 1 : 0);
}

export function isTeamApproved(approvals: readonly PickedBy[] | undefined): boolean {
  return approvals?.includes("gabe") === true && approvals.includes("jarrett");
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
