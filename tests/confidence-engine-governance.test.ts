import { describe, expect, it } from "vitest";
import {
  assertTrainingInputsAllowed,
  decideExperiment,
  registerExperiment
} from "@/domain/research-registry";
import { createResearchQuestionAnswer, researchQuestions, unansweredResearchQuestions } from "@/domain/research-questions";
import { buildMarketAnchoredScoreDistribution } from "@/domain/joint-score";
import { recordHumanJudgment, scoreModelVersusJudgment } from "@/domain/human-judgment";

describe("confidence-engine research governance", () => {
  const experiment = registerExperiment({
    id: "exp-1", name: "market velocity", hypothesis: "latency-normalized movement predicts the next quote",
    evidenceTier: "shadow", baselineFamily: "market", candidateFamily: "market_velocity",
    sourceIds: ["the_odds_api"], requiredSeasonStart: 2026, requiredSeasonEnd: 2026,
    transformation: "next-quote residual", primaryMetric: "log_loss", secondaryMetrics: ["brier"],
    falsifier: "no prospective improvement", featureSetFrozen: true,
    gate: { primaryMetric: "log_loss", minimumImprovement: 0.005, maximumCalibrationSlopeError: 0.2, minimumIntervalCoverage80: 0.72, multiplicityFamily: "movement", plannedComparisons: 4 },
    preregisteredAt: "2026-08-24T17:00:00.000Z"
  });

  it("requires preregistered gates and offseason promotion", () => {
    expect(experiment.registryHash).toHaveLength(64);
    expect(() => decideExperiment({
      experiment, previousStatus: "running", requestedDecision: "promote", evaluationWindow: "2026 weeks 1-18",
      rowsHash: "rows", baselineMetrics: { log_loss: 0.7 }, candidateMetrics: { log_loss: 0.68 },
      calibrationSlope: 1, intervalCoverage80: 0.8, rationale: "passes", decidedAt: "2027-02-01T00:00:00.000Z",
      offseasonReview: false
    })).toThrow(/offseason/);
    const decision = decideExperiment({
      experiment, previousStatus: "running", requestedDecision: "promote", evaluationWindow: "2026 weeks 1-18",
      rowsHash: "rows", baselineMetrics: { log_loss: 0.7 }, candidateMetrics: { log_loss: 0.68 },
      calibrationSlope: 1, intervalCoverage80: 0.8, rationale: "passes", decidedAt: "2027-02-01T00:00:00.000Z",
      offseasonReview: true
    });
    expect(decision.decision).toBe("promote");
  });

  it("hard-blocks team decisions and human adjustments from training", () => {
    expect(() => assertTrainingInputsAllowed(["market_logit", "team_pick_outcome"])).toThrow(/prohibited/);
    expect(() => assertTrainingInputsAllowed(["human_adjustment_points"])).toThrow(/prohibited/);
    expect(() => assertTrainingInputsAllowed(["market_logit", "team_epa"])).not.toThrow();
  });

  it("turns all 52 questions into immutable answer gates", () => {
    expect(researchQuestions).toHaveLength(52);
    const answer = createResearchQuestionAnswer({
      questionId: "RQ-001", hypothesis: "fixed horizons make forecasts comparable", decisionImpact: "structure",
      asOfContract: "opener, early week, t-120, t-60, t-15", baseline: "market",
      evaluationRowsHash: "rows", primaryMetric: "joint_log_score",
      calibrationAndCoverageGates: ["slope 0.8-1.2", "80% coverage"], falsifier: "horizon labels do not reproduce",
      evidence: ["prospective-archive"], decision: "defer", author: "system research",
      recordedAt: "2026-08-24T18:00:00.000Z", offseasonReview: false
    });
    expect(answer.answerHash).toHaveLength(64);
    expect(unansweredResearchQuestions([answer])).toHaveLength(51);
  });

  it("scores human judgment separately without changing training eligibility", () => {
    const distribution = buildMarketAnchoredScoreDistribution({
      expectedHomeMargin: 2.5, expectedTotal: 45, homeDispersion: 18, awayDispersion: 17,
      dependence: 0.05, maxScore: 55, generatedAt: "2026-09-10T17:00:00.000Z",
      modelHash: "model", provenanceHash: "data"
    });
    const forecast = {
      forecastHash: "forecast", gameId: "game", generatedAt: "2026-09-10T17:00:00.000Z",
      distribution, dataHash: "data", modelHash: "model"
    };
    const adjustment = recordHumanJudgment({
      id: "adjustment", forecastHash: "forecast", authorLabel: "analyst",
      sourceUrl: "https://example.com/report", sourcePublishedAt: "2026-09-10T17:05:00.000Z",
      rationale: "starter role uncertainty", affectedScenarioIds: ["backup"],
      scenarioWeightOverrides: { starter: 0.6, backup: 0.4 }, createdAt: "2026-09-10T17:10:00.000Z"
    });
    expect(adjustment.trainingEligible).toBe(false);
    const scored = scoreModelVersusJudgment({
      forecast, adjustment, adjustedDistribution: distribution,
      actualHomeScore: 24, actualAwayScore: 20, homeSpreadPoint: -2.5, totalPoint: 45
    });
    expect(scored.modelOnly.jointLogScore).toBe(scored.humanAdjusted?.jointLogScore);
  });
});

