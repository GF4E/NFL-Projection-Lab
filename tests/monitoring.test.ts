import { describe, expect, it } from "vitest";
import { brierScore, calibrationSlope, logLoss, monitoringAlerts, populationStabilityIndex } from "@/domain/monitoring";

describe("background weekly monitoring", () => {
  it("scores stored probabilities against outcomes and the market baseline", () => {
    const rows = [{ probability: 0.8, outcome: 1 as const }, { probability: 0.3, outcome: 0 as const }];
    expect(brierScore(rows)).toBeCloseTo(0.065);
    expect(logLoss(rows)).toBeLessThan(logLoss(rows.map((row) => ({ ...row, probability: 0.5 }))));
    expect(calibrationSlope(rows)).not.toBeNull();
  });

  it("detects distribution and four-week CLV drift without emitting push events", () => {
    expect(populationStabilityIndex([0.5, 0.5], [0.25, 0.75])).toBeGreaterThan(0.2);
    const alerts = monitoringAlerts({
      calibrationSlope40: 1.4,
      maxFeaturePsi: 0.21,
      weeklyClvGapCents: [3, 3.1, 4, 3.2],
      now: "2026-10-06T16:00:00.000Z"
    });
    expect(alerts.map((alert) => alert.type)).toEqual([
      "calibration_drift",
      "feature_shift",
      "soft_book_anchor"
    ]);
  });
});
