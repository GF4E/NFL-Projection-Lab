import { describe, expect, it } from "vitest";
import { stableHash } from "@/domain/hash";
import {
  createPointInTimeFeatureRow,
  promoteAtomicSnapshot,
  type SourceObservation
} from "@/domain/point-in-time";
import {
  buildMarketAnchoredScoreDistribution,
  deriveMainlineProbabilities,
  fitJointScoreParameters,
  validateJointScoreDistribution
} from "@/domain/joint-score";
import { buildScenarioDecisionDossier } from "@/domain/scenarios";
import { summarizeSourceObservability, validateRequiredSnapshotCoverage } from "@/domain/data-observability";

function source(overrides: Partial<SourceObservation> = {}): SourceObservation {
  return {
    id: "odds-1",
    provider: "provider",
    dataset: "odds",
    sourceRecordId: "game",
    kind: "market",
    publishedAt: "2026-09-10T16:00:00.000Z",
    providerUpdatedAt: "2026-09-10T16:00:00.000Z",
    requestedAt: "2026-09-10T16:00:00.500Z",
    receivedAt: "2026-09-10T16:00:01.000Z",
    capturedAt: "2026-09-10T16:00:01.000Z",
    availabilityBasis: "provider_updated",
    validAt: "2026-09-13T20:00:00.000Z",
    validTo: null,
    schemaVersion: "1",
    sourceHash: "source-hash",
    importRunId: "run-1",
    licenseTag: "provider terms",
    freshness: "current",
    sourceUrl: null,
    ...overrides
  };
}

describe("immutable point-in-time confidence contracts", () => {
  it("rejects post-forecast observations and current-week game leakage", () => {
    expect(() => createPointInTimeFeatureRow({
      id: "row", gameId: "game", season: 2026, targetWeek: 2, inputsThroughWeek: 1,
      generatedAt: "2026-09-10T15:00:00.000Z", featureSchemaVersion: "1",
      transformationVersion: "transform-1", imputationPolicy: "none",
      values: { epa: 0.1 }, missingness: {}, observations: [source()]
    })).toThrow(/unavailable/);
    expect(() => createPointInTimeFeatureRow({
      id: "row", gameId: "game", season: 2026, targetWeek: 2, inputsThroughWeek: 2,
      generatedAt: "2026-09-10T17:00:00.000Z", featureSchemaVersion: "1",
      transformationVersion: "transform-1", imputationPolicy: "none",
      values: { epa: 0.1 }, missingness: {}, observations: [source()]
    })).toThrow(/Week 2/);
  });

  it("freezes row lineage and preserves last-good data after a partial import", () => {
    const row = createPointInTimeFeatureRow({
      id: "row", gameId: "game", season: 2026, targetWeek: 2, inputsThroughWeek: 1,
      generatedAt: "2026-09-10T17:00:00.000Z", featureSchemaVersion: "1",
      transformationVersion: "transform-1", imputationPolicy: "none",
      values: { epa: 0.1 }, missingness: {}, observations: [source()]
    });
    expect(row.upstreamSnapshotHash).toHaveLength(64);
    expect(row.rowHash).toHaveLength(64);
    const lastGood = { snapshotKey: "good", capturedAt: row.generatedAt, freshness: "current" as const, complete: true, sourceHash: row.rowHash, value: row };
    const candidate = { ...lastGood, snapshotKey: "partial", freshness: "partial" as const, complete: false };
    expect(promoteAtomicSnapshot({ candidate, lastGood })).toEqual({ published: lastGood, rejected: candidate });
  });

  it("reports provider latency and fails incomplete required coverage", () => {
    const rows = [source(), source({
      id: "odds-2", sourceRecordId: "game-2", sourceHash: "source-2",
      receivedAt: "2026-09-10T16:00:05.000Z", capturedAt: "2026-09-10T16:00:05.000Z"
    })];
    const summary = summarizeSourceObservability(rows)[0];
    expect(summary.distinctRecords).toBe(2);
    expect(summary.maximumCaptureLagSeconds).toBe(5);
    expect(validateRequiredSnapshotCoverage({
      observations: rows,
      required: [{ provider: "provider", dataset: "odds", minimumRecords: 3 }]
    })).toEqual(["provider/odds has 2/3 required records"]);
  });
});

describe("data-derived joint score and scenario engine", () => {
  const training = Array.from({ length: 320 }, (_, index) => {
    const expectedMargin = index % 9 - 4;
    const expectedTotal = 41 + index % 9;
    const homeMean = (expectedTotal + expectedMargin) / 2;
    const awayMean = (expectedTotal - expectedMargin) / 2;
    return {
      gameId: `g-${index}`,
      season: 2021 + index % 5,
      actualHomeScore: Math.max(0, Math.round(homeMean + (index * 7 % 11) - 5)),
      actualAwayScore: Math.max(0, Math.round(awayMean + (index * 5 % 9) - 4)),
      expectedHomeMargin: expectedMargin,
      expectedTotal,
      weight: 0.7 + index % 4 / 10
    };
  });

  it("does not manufacture overdispersion by truncating negative row contributions", () => {
    const underdispersed = Array.from({ length: 40 }, (_, index) => ({
      gameId: `under-${index}`, season: 2025,
      actualHomeScore: 24 + (index % 2 ? 1 : -1),
      actualAwayScore: 20 + (index % 2 ? -1 : 1),
      expectedHomeMargin: 4, expectedTotal: 44, weight: 1
    }));
    const fit = fitJointScoreParameters(underdispersed);
    expect(fit.homeDispersion).toBe(1_000_000);
    expect(fit.awayDispersion).toBe(1_000_000);
  });

  it("centers score residuals before estimating dependence", () => {
    const commonBias = Array.from({ length: 40 }, (_, index) => ({
      gameId: `bias-${index}`, season: 2025,
      actualHomeScore: 27,
      actualAwayScore: 23,
      expectedHomeMargin: 4, expectedTotal: 44, weight: 1
    }));
    expect(fitJointScoreParameters(commonBias).dependence).toBe(0);
  });

  it("learns dispersion and dependence from rows and reconciles all markets", () => {
    const fit = fitJointScoreParameters(training);
    expect(fit.trainingGames).toBe(320);
    expect(fit.homeDispersion).toBeGreaterThan(0);
    expect(Math.abs(fit.dependence)).toBeLessThanOrEqual(0.35);
    const distribution = buildMarketAnchoredScoreDistribution({
      expectedHomeMargin: 3.5, expectedTotal: 45.5,
      homeDispersion: fit.homeDispersion, awayDispersion: fit.awayDispersion,
      maxScore: 60,
      generatedAt: "2026-09-10T17:00:00.000Z", modelHash: "model", provenanceHash: fit.trainingHash
    });
    validateJointScoreDistribution(distribution);
    const probabilities = deriveMainlineProbabilities(distribution, { homeSpreadPoint: -3.5, totalPoint: 45.5 });
    expect(probabilities.moneyline.home + probabilities.moneyline.away + probabilities.moneyline.tie).toBeCloseTo(1, 10);
    expect(probabilities.spread.homeCover + probabilities.spread.awayCover + probabilities.spread.push).toBeCloseTo(1, 10);
    expect(probabilities.total.over + probabilities.total.under + probabilities.total.push).toBeCloseTo(1, 10);
    expect(probabilities.expectedHomeScore - probabilities.expectedAwayScore).toBeCloseTo(3.5, 0);
  });

  it("labels a material unsupported branch indeterminate and names the missing fact", () => {
    const fit = fitJointScoreParameters(training);
    const distribution = buildMarketAnchoredScoreDistribution({
      expectedHomeMargin: 2, expectedTotal: 44, homeDispersion: fit.homeDispersion,
      awayDispersion: fit.awayDispersion, maxScore: 55,
      generatedAt: "2026-09-10T17:00:00.000Z", modelHash: "model", provenanceHash: "data"
    });
    const dossier = buildScenarioDecisionDossier({
      branches: [
        { id: "base", label: "base", condition: "starter active", weight: 1, supported: true, material: false, observations: [], distribution, edge: 0.04, edgeInterval: [0.01, 0.07], suggestedUnits: 1 },
        { id: "qb", label: "qb", condition: "backup starts", weight: null, supported: false, material: true, observations: [], distribution, edge: -0.03, edgeInterval: [-0.06, 0], suggestedUnits: 0 }
      ],
      aggregateEdgeInterval: [0.01, 0.07], suggestedUnits: 1, kellyFloor: 0.5,
      homeSpreadPoint: -2, totalPoint: 44, generatedAt: "2026-09-10T17:00:00.000Z",
      modelHash: "model", scenarioConfigHash: stableHash("scenario"), provenanceHash: "data"
    });
    expect(dossier.status).toBe("indeterminate");
    expect(dossier.whatChangesTheView.join(" ")).toContain("backup starts");
  });
});
