import { stableHash } from "./hash";
import type { JointScoreDistribution } from "./joint-score";
import { evaluateScoreDistribution, type ScoreDistributionEvaluation } from "./probabilistic-evaluation";

export interface FrozenModelForecast {
  forecastHash: string;
  gameId: string;
  generatedAt: string;
  distribution: JointScoreDistribution;
  dataHash: string;
  modelHash: string;
}

export interface HumanJudgmentAdjustment {
  id: string;
  forecastHash: string;
  authorLabel: string;
  sourceUrl: string;
  sourcePublishedAt: string;
  rationale: string;
  affectedScenarioIds: string[];
  scenarioWeightOverrides: Record<string, number>;
  createdAt: string;
  trainingEligible: false;
  adjustmentHash: string;
}

export interface ModelVersusJudgmentScore {
  forecastHash: string;
  adjustmentHash: string | null;
  modelOnly: ScoreDistributionEvaluation;
  humanAdjusted: ScoreDistributionEvaluation | null;
}

export function recordHumanJudgment(
  input: Omit<HumanJudgmentAdjustment, "trainingEligible" | "adjustmentHash">
): HumanJudgmentAdjustment {
  if (!input.forecastHash || !input.authorLabel || !input.rationale || !input.sourceUrl) {
    throw new Error("Human judgment requires a frozen forecast, author, source, and rationale");
  }
  if (!Number.isFinite(Date.parse(input.createdAt)) || !Number.isFinite(Date.parse(input.sourcePublishedAt))) {
    throw new Error("Human judgment timestamps must be valid");
  }
  if (Date.parse(input.sourcePublishedAt) > Date.parse(input.createdAt)) {
    throw new Error("Human judgment cannot cite future information");
  }
  const weights = Object.values(input.scenarioWeightOverrides);
  if (!weights.length || weights.some((weight) => weight < 0 || weight > 1)) {
    throw new Error("Human judgment may only reweight explicitly identified scenarios");
  }
  const adjustment = { ...input, trainingEligible: false as const };
  return { ...adjustment, adjustmentHash: stableHash(adjustment) };
}

export function assertHumanJudgmentSeparated(input: {
  forecast: FrozenModelForecast;
  adjustment: HumanJudgmentAdjustment;
}): void {
  if (input.adjustment.forecastHash !== input.forecast.forecastHash) {
    throw new Error("Human judgment must reference the exact frozen forecast");
  }
  const { adjustmentHash, ...content } = input.adjustment;
  if (adjustmentHash !== stableHash(content) || input.adjustment.trainingEligible !== false) {
    throw new Error("Human judgment audit artifact is invalid");
  }
  if (Date.parse(input.adjustment.createdAt) < Date.parse(input.forecast.generatedAt)) {
    throw new Error("Human judgment cannot modify a forecast before it was frozen");
  }
}

export function scoreModelVersusJudgment(input: {
  forecast: FrozenModelForecast;
  adjustedDistribution?: JointScoreDistribution;
  adjustment?: HumanJudgmentAdjustment;
  actualHomeScore: number;
  actualAwayScore: number;
  homeSpreadPoint: number;
  totalPoint: number;
}): ModelVersusJudgmentScore {
  if (Boolean(input.adjustment) !== Boolean(input.adjustedDistribution)) {
    throw new Error("An adjusted distribution and its audit artifact must be supplied together");
  }
  if (input.adjustment) assertHumanJudgmentSeparated({ forecast: input.forecast, adjustment: input.adjustment });
  const evaluate = (distribution: JointScoreDistribution) => evaluateScoreDistribution({
    distribution,
    actualHomeScore: input.actualHomeScore,
    actualAwayScore: input.actualAwayScore,
    homeSpreadPoint: input.homeSpreadPoint,
    totalPoint: input.totalPoint
  });
  return {
    forecastHash: input.forecast.forecastHash,
    adjustmentHash: input.adjustment?.adjustmentHash ?? null,
    modelOnly: evaluate(input.forecast.distribution),
    humanAdjusted: input.adjustedDistribution ? evaluate(input.adjustedDistribution) : null
  };
}

