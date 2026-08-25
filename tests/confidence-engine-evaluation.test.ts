import { describe, expect, it } from "vitest";
import { runForecastBakeoff } from "@/domain/forecast-bakeoff";
import { buildMarketAnchoredScoreDistribution } from "@/domain/joint-score";
import {
  evaluatePrequentialForecasts,
  evaluateScoreDistribution,
  scenarioBrierScore,
  blockBootstrapLossImprovement,
  type PrequentialForecastRow
} from "@/domain/probabilistic-evaluation";
import { buildScoreModelCandidateSet } from "@/domain/forecast-baselines";

function rows(family: string, gameCount = 20): PrequentialForecastRow[] {
  return Array.from({ length: gameCount }, (_, index) => {
    const spread = index % 7 - 3;
    const total = 42.5 + index % 6;
    const distribution = buildMarketAnchoredScoreDistribution({
      expectedHomeMargin: spread, expectedTotal: total,
      homeDispersion: 18, awayDispersion: 17, maxScore: 55,
      generatedAt: "2026-09-10T17:00:00.000Z", modelHash: family, provenanceHash: `p-${index}`
    });
    const actualHomeScore = 18 + index % 15;
    const actualAwayScore = 17 + index * 3 % 14;
    return {
      id: `${family}-${index}`, gameId: `game-${index}`, season: 2025, week: index % 18 + 1,
      forecastHorizon: "t_minus_60", generatedAt: "2026-09-10T17:00:00.000Z", family,
      modelHash: family, dataHash: `data-${index}`, distribution, homeSpreadPoint: -spread,
      totalPoint: total, actualHomeScore, actualAwayScore,
      marketHomeWinProbability: 0.5, marketHomeCoverProbability: 0.5,
      marketOverProbability: 0.5, quoteFresh: true
    };
  });
}

describe("prequential forecast evaluation", () => {
  it("constructs all three required score-model candidates without selecting a winner", () => {
    const candidates = buildScoreModelCandidateSet({
      expectedMarketHomeMargin: 2.5, expectedMarketTotal: 44.5,
      independentExpectedHomeScore: 24, independentExpectedAwayScore: 20,
      fittedCountParameters: { homeDispersion: 18, awayDispersion: 17, dependence: 0.08, trainingGames: 300, effectiveGames: 240, trainingHash: "training" },
      possessionHome: { expectedPossessions: 11, possessionStandardDeviation: 1.2, scoringOutcomes: [{ points: 0, probability: 0.64 }, { points: 3, probability: 0.14 }, { points: 7, probability: 0.22 }] },
      possessionAway: { expectedPossessions: 11, possessionStandardDeviation: 1.2, scoringOutcomes: [{ points: 0, probability: 0.67 }, { points: 3, probability: 0.14 }, { points: 7, probability: 0.19 }] },
      possessionSimulations: 2_000, possessionSeed: 202600, maxScore: 55,
      generatedAt: "2026-09-10T17:00:00.000Z", provenanceHash: "data",
      modelHashes: { marketAnchored: "market", correlatedCount: "count", possession: "possession" }
    });
    expect(candidates.map((candidate) => candidate.family)).toEqual([
      "market_anchored_independent_negative_binomial", "correlated_negative_binomial", "possession_simulation"
    ]);
    candidates.forEach((candidate) => expect(candidate.cells.reduce((sum, cell) => sum + cell.probability, 0)).toBeCloseTo(1, 10));
  });

  it("scores every game with proper distribution, calibration, and coverage diagnostics", () => {
    const sample = rows("market");
    const scorecard = evaluatePrequentialForecasts(sample);
    expect(scorecard.rows).toBe(sample.length);
    expect(scorecard.games).toBe(sample.length);
    expect(scorecard.meanJointLogScore).toBeGreaterThan(0);
    expect(scorecard.brier.bins.reduce((sum, bin) => sum + bin.count, 0)).toBeGreaterThan(sample.length);
    expect(scorecard.coverage80.margin).toBeGreaterThanOrEqual(0);
    const one = evaluateScoreDistribution(sample[0]);
    expect(one.marginCrps).toBeGreaterThanOrEqual(0);
    expect(one.pitMargin).toBeGreaterThanOrEqual(0);
  });

  it("rejects a candidate that cherry-picks games in a shared-contract bakeoff", () => {
    const market = rows("market");
    const incomplete = rows("candidate", market.length - 1);
    const result = runForecastBakeoff({
      contractHash: "contract", rows: [...market, ...incomplete], marketFamily: "market",
      calibrationSlopeRange: [-100, 100], minimumCoverage80: 0, maximumCoverage80: 1,
      maximumLogLossRegression: 1
    });
    expect(result.entries.find((entry) => entry.family === "candidate")).toMatchObject({
      status: "rejected",
      reason: "candidate was not evaluated on the identical contract set"
    });
  });

  it("evaluates scenario probabilities with a proper multiclass score", () => {
    expect(scenarioBrierScore({ branchProbabilities: { starter: 0.8, backup: 0.2 }, resolvedBranchId: "starter" })).toBeCloseTo(0.08);
    expect(() => scenarioBrierScore({ branchProbabilities: { starter: 0.8 }, resolvedBranchId: "backup" })).toThrow();
  });

  it("measures improvement with fixed-seed week blocks rather than treating games as independent", () => {
    const comparison = blockBootstrapLossImprovement({
      rows: Array.from({ length: 80 }, (_, index) => ({
        blockId: `week-${index % 8}`,
        baselineLoss: 0.7 + index % 3 / 100,
        candidateLoss: 0.68 + index % 3 / 100
      })),
      members: 500,
      seed: 202600
    });
    expect(comparison.uniqueBlocks).toBe(8);
    expect(comparison.meanImprovement).toBeCloseTo(0.02);
    expect(comparison.probabilityOfImprovement).toBe(1);
  });
});
