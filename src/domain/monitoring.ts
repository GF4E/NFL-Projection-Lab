import type { ModelRun, SystemAlert, WeeklyDigest } from "./types";

const EPSILON = 1e-12;

export function brierScore(rows: Array<{ probability: number; outcome: 0 | 1 }>): number {
  return rows.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / rows.length;
}

export function logLoss(rows: Array<{ probability: number; outcome: 0 | 1 }>): number {
  return rows.reduce((sum, row) => {
    const probability = Math.max(EPSILON, Math.min(1 - EPSILON, row.probability));
    return sum - (row.outcome * Math.log(probability) + (1 - row.outcome) * Math.log(1 - probability));
  }, 0) / rows.length;
}

export function populationStabilityIndex(expected: number[], actual: number[]): number {
  if (expected.length !== actual.length) throw new Error("PSI vectors must share bins");
  return expected.reduce((sum, expectedShare, index) => {
    const expectedSafe = Math.max(EPSILON, expectedShare);
    const actualSafe = Math.max(EPSILON, actual[index]);
    return sum + (actualSafe - expectedSafe) * Math.log(actualSafe / expectedSafe);
  }, 0);
}

export function monitoringAlerts(input: {
  calibrationSlope40: number | null;
  maxFeaturePsi: number;
  weeklyClvGapCents: number[];
  now: string;
}): SystemAlert[] {
  const alerts: SystemAlert[] = [];
  if (
    input.calibrationSlope40 !== null &&
    (input.calibrationSlope40 < 0.7 || input.calibrationSlope40 > 1.3)
  ) {
    alerts.push({
      id: `alert:calibration:${input.now}`,
      type: "calibration_drift",
      severity: "warning",
      message: "Trailing-40 calibration slope is outside 0.7–1.3; interpret with the small-sample warning.",
      idempotencyKey: `calibration_drift:${input.now}`,
      createdAt: input.now,
      acknowledgedAt: null
    });
  }
  if (input.maxFeaturePsi > 0.2) {
    alerts.push({
      id: `alert:psi:${input.now}`,
      type: "feature_shift",
      severity: "warning",
      message: "At least one feature exceeded the configured 0.20 PSI threshold.",
      idempotencyKey: `feature_shift:${input.now}`,
      createdAt: input.now,
      acknowledgedAt: null
    });
  }
  if (
    input.weeklyClvGapCents.length >= 4 &&
    input.weeklyClvGapCents.slice(-4).every((gap) => gap >= 3)
  ) {
    alerts.push({
      id: `alert:soft-anchor:${input.now}`,
      type: "soft_book_anchor",
      severity: "warning",
      message: "Realized translated CLV has trailed displayed edge by at least three cents for four weeks; inspect the soft-book consensus anchor.",
      idempotencyKey: `soft_book_anchor:${input.now}`,
      createdAt: input.now,
      acknowledgedAt: null
    });
  }
  return alerts;
}

export function createWeeklyDigest(input: Omit<WeeklyDigest, "alerts"> & { modelRun: ModelRun }): WeeklyDigest {
  const alerts = monitoringAlerts({
    calibrationSlope40: input.calibrationSlope40,
    maxFeaturePsi: input.maxFeaturePsi,
    weeklyClvGapCents: [
      input.displayedExpectedEdgeCents - input.realizedClvCents
    ],
    now: input.generatedAt
  });
  return { ...input, alerts };
}
