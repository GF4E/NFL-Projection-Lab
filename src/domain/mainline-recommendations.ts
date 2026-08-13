import type {
  BaselineProjection,
  MoneylineProjection,
  TotalProjection
} from "./decision-board";
import type { LineBookKey, LineMarketKey, LiveLine } from "./line-board";
import { americanToImplied, expectedValueWithPush } from "./odds";
import { structuralConfig } from "./config";
import { sizeKelly, type SizingResult } from "./sizing";

export interface MainlineRecommendation {
  market: LineMarketKey;
  line: LiveLine;
  betProbability: number;
  breakEvenProbability: number;
  probabilityEdge: number;
  expectedValue: number;
  pushProbability: number;
  edgeInterval: [number, number];
  sizing: SizingResult;
  preferenceConflict: boolean;
  actionable: boolean;
}

export interface MainlineRecommendationInput {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  book: LineBookKey;
  lines: readonly LiveLine[];
  spread: BaselineProjection | null;
  total: TotalProjection | null;
  moneyline: MoneylineProjection | null;
  preferredTeams: ReadonlySet<string>;
  exceptionalProbabilityEdge?: number;
}

function invertInterval(interval: [number, number]): [number, number] {
  return [-interval[1], -interval[0]];
}

function buildCandidate(input: {
  line: LiveLine | null;
  betProbability: number | null;
  pushProbability: number | null;
  edgeInterval: [number, number] | null;
  awayTeam: string;
  homeTeam: string;
  preferredTeams: ReadonlySet<string>;
  exceptionalProbabilityEdge: number;
}): MainlineRecommendation | null {
  const { line, betProbability, pushProbability, edgeInterval } = input;
  if (!line || line.fairProbability === null || betProbability === null || pushProbability === null || edgeInterval === null) {
    return null;
  }
  const probabilityEdge = betProbability - line.fairProbability;
  const expectedValue = expectedValueWithPush(betProbability, pushProbability, line.americanPrice);
  const sizing = sizeKelly(betProbability, line.americanPrice, edgeInterval, {
    referenceBankrollUnits: structuralConfig.sizing.referenceBankrollUnits,
    kellyFraction: structuralConfig.sizing.kellyFraction,
    increment: structuralConfig.sizing.roundDownUnits,
    minimum: structuralConfig.sizing.minimumUnits,
    maximum: structuralConfig.sizing.maximumUnits
  });
  const preferenceConflict = line.market !== "total" &&
    [input.awayTeam, input.homeTeam].some((team) => input.preferredTeams.has(team) && team !== line.side);
  return {
    market: line.market,
    line,
    betProbability,
    breakEvenProbability: americanToImplied(line.americanPrice),
    probabilityEdge,
    expectedValue,
    pushProbability,
    edgeInterval,
    sizing,
    preferenceConflict,
    actionable: expectedValue > 0 && sizing.included &&
      (!preferenceConflict || probabilityEdge >= input.exceptionalProbabilityEdge)
  };
}

export function rankMainlineRecommendations(input: MainlineRecommendationInput): MainlineRecommendation[] {
  const exceptionalProbabilityEdge = input.exceptionalProbabilityEdge ?? structuralConfig.monitoring.pushEdgeThreshold;
  const gameLines = input.lines.filter((line) => line.gameId === input.gameId && line.book === input.book);
  const sideCandidates: MainlineRecommendation[] = [];

  if (input.spread?.shrunkHomeProbability !== null && input.spread?.shrunkHomeProbability !== undefined && input.spread.edgeInterval) {
    const homeEdge = input.spread.shrunkHomeProbability - input.spread.marketHomeProbability;
    const side = homeEdge >= 0 ? input.homeTeam : input.awayTeam;
    const line = gameLines.find((candidate) => candidate.market === "spread" && candidate.side === side) ?? null;
    const candidate = buildCandidate({
      line,
      betProbability: homeEdge >= 0 ? input.spread.shrunkHomeProbability : 1 - input.spread.shrunkHomeProbability,
      pushProbability: input.spread.pushProbability,
      edgeInterval: homeEdge >= 0 ? input.spread.edgeInterval : invertInterval(input.spread.edgeInterval),
      awayTeam: input.awayTeam,
      homeTeam: input.homeTeam,
      preferredTeams: input.preferredTeams,
      exceptionalProbabilityEdge
    });
    if (candidate) sideCandidates.push(candidate);
  }

  if (input.moneyline?.shrunkHomeProbability !== null && input.moneyline?.shrunkHomeProbability !== undefined && input.moneyline.edgeInterval) {
    for (const side of [input.homeTeam, input.awayTeam]) {
      const isHome = side === input.homeTeam;
      const line = gameLines.find((candidate) => candidate.market === "moneyline" && candidate.side === side) ?? null;
      const candidate = buildCandidate({
        line,
        betProbability: isHome ? input.moneyline.shrunkHomeProbability : 1 - input.moneyline.shrunkHomeProbability,
        pushProbability: input.moneyline.tieProbability,
        edgeInterval: isHome ? input.moneyline.edgeInterval : invertInterval(input.moneyline.edgeInterval),
        awayTeam: input.awayTeam,
        homeTeam: input.homeTeam,
        preferredTeams: input.preferredTeams,
        exceptionalProbabilityEdge
      });
      if (candidate) sideCandidates.push(candidate);
    }
  }

  const bestSide = sideCandidates.sort((left, right) => right.expectedValue - left.expectedValue)[0] ?? null;
  const totalLine = input.total && input.total.lean !== "Pass"
    ? gameLines.find((line) => line.market === "total" && line.side.toLowerCase() === input.total!.lean.toLowerCase()) ?? null
    : null;
  const totalCandidate = input.total ? buildCandidate({
    line: totalLine,
    betProbability: input.total.shrunkProbability,
    pushProbability: input.total.pushProbability,
    edgeInterval: input.total.edgeInterval,
    awayTeam: input.awayTeam,
    homeTeam: input.homeTeam,
    preferredTeams: input.preferredTeams,
    exceptionalProbabilityEdge
  }) : null;

  return [bestSide, totalCandidate]
    .filter((candidate): candidate is MainlineRecommendation => candidate !== null)
    .sort((left, right) => Number(right.actionable) - Number(left.actionable) || right.expectedValue - left.expectedValue)
    .slice(0, 2);
}
