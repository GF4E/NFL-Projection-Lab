export type PlayType = "single" | "parlay" | "teaser";
export type PlayConfidence = "watch" | "lean" | "play" | "best";
export type PlayStatus = "research" | "card" | "placed" | "settled" | "passed";
export type PlayResult = "pending" | "win" | "loss" | "push" | "void";
export type PickedBy = "gabe" | "jarrett";

export type WeeklyPlay = {
  id: string;
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
  status: PlayStatus;
  result: PlayResult;
  profitCents: number;
  closingClvCents: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const UNIT_CENTS = 2_500;

export function stakeToUnits(stakeCents: number): number {
  return Math.round((stakeCents / UNIT_CENTS) * 10) / 10;
}

export function trackerSummary(plays: readonly WeeklyPlay[]) {
  const settled = plays.filter((play) => play.status === "settled");
  const stakedCents = settled.reduce((sum, play) => sum + play.stakeCents, 0);
  const profitCents = settled.reduce((sum, play) => sum + play.profitCents, 0);
  const clvRows = settled.filter((play) => play.closingClvCents !== null);
  const averageClvCents = clvRows.length
    ? clvRows.reduce((sum, play) => sum + (play.closingClvCents ?? 0), 0) / clvRows.length
    : 0;
  return {
    settledCount: settled.length,
    stakedCents,
    profitCents,
    roiPercent: stakedCents ? (profitCents / stakedCents) * 100 : 0,
    averageClvCents,
    clvCount: clvRows.length,
    winCount: settled.filter((play) => play.result === "win").length,
    lossCount: settled.filter((play) => play.result === "loss").length,
    pushCount: settled.filter((play) => ["push", "void"].includes(play.result)).length
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
