import type { ModelRun, SystemAlert, WeeklyDigest } from "./types";
import { structuralConfig } from "./config";

const EPSILON = 1e-12;

export function brierScore(rows: Array<{ probability: number; outcome: 0 | 1 }>): number {
  if (!rows.length) throw new Error("Brier score requires forecast rows");
  return rows.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / rows.length;
}

export function logLoss(rows: Array<{ probability: number; outcome: 0 | 1 }>): number {
  if (!rows.length) throw new Error("Log loss requires forecast rows");
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

export function calibrationSlope(rows: Array<{ probability: number; outcome: 0 | 1 }>): number | null {
  if (rows.length < 2) return null;
  const logits = rows.map((row) => {
    const probability = Math.max(EPSILON, Math.min(1 - EPSILON, row.probability));
    return Math.log(probability / (1 - probability));
  });
  const meanX = logits.reduce((sum, value) => sum + value, 0) / logits.length;
  const meanY = rows.reduce((sum, row) => sum + row.outcome, 0) / rows.length;
  const variance = logits.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (variance < EPSILON) return null;
  const covariance = rows.reduce((sum, row, index) => sum + (logits[index] - meanX) * (row.outcome - meanY), 0);
  return covariance / variance / Math.max(EPSILON, meanY * (1 - meanY));
}

export function monitoringAlerts(input: {
  calibrationSlope40: number | null;
  maxFeaturePsi: number | null;
  weeklyClvGapCents: number[];
  now: string;
}): SystemAlert[] {
  const alerts: SystemAlert[] = [];
  if (
    input.calibrationSlope40 !== null &&
    (input.calibrationSlope40 < structuralConfig.monitoring.calibrationSlope[0] ||
      input.calibrationSlope40 > structuralConfig.monitoring.calibrationSlope[1])
  ) {
    alerts.push({
      id: `alert:calibration:${input.now}`,
      type: "calibration_drift",
      severity: "warning",
      message: `Trailing-40 calibration slope is outside ${structuralConfig.monitoring.calibrationSlope[0]}–${structuralConfig.monitoring.calibrationSlope[1]}; interpret with the small-sample warning.`,
      idempotencyKey: `calibration_drift:${input.now}`,
      createdAt: input.now,
      acknowledgedAt: null
    });
  }
  if (input.maxFeaturePsi !== null && input.maxFeaturePsi > structuralConfig.monitoring.psiThreshold) {
    alerts.push({
      id: `alert:psi:${input.now}`,
      type: "feature_shift",
      severity: "warning",
      message: `At least one feature exceeded the configured ${structuralConfig.monitoring.psiThreshold.toFixed(2)} PSI threshold.`,
      idempotencyKey: `feature_shift:${input.now}`,
      createdAt: input.now,
      acknowledgedAt: null
    });
  }
  if (
    input.weeklyClvGapCents.length >= structuralConfig.monitoring.softAnchorConsecutiveWeeks &&
    input.weeklyClvGapCents.slice(-structuralConfig.monitoring.softAnchorConsecutiveWeeks)
      .every((gap) => gap >= structuralConfig.monitoring.softAnchorCentGap)
  ) {
    alerts.push({
      id: `alert:soft-anchor:${input.now}`,
      type: "soft_book_anchor",
      severity: "warning",
      message: `Realized translated CLV has trailed displayed edge by at least ${structuralConfig.monitoring.softAnchorCentGap} cents for ${structuralConfig.monitoring.softAnchorConsecutiveWeeks} weeks; inspect the soft-book consensus anchor.`,
      idempotencyKey: `soft_book_anchor:${input.now}`,
      createdAt: input.now,
      acknowledgedAt: null
    });
  }
  return alerts;
}

export function createWeeklyDigest(input: Omit<WeeklyDigest, "alerts"> & {
  modelRun: ModelRun;
  priorWeeklyClvGapCents?: number[];
}): WeeklyDigest {
  const { priorWeeklyClvGapCents = [], ...digest } = input;
  const alerts = monitoringAlerts({
    calibrationSlope40: input.calibrationSlope40,
    maxFeaturePsi: input.maxFeaturePsi,
    weeklyClvGapCents: input.displayedExpectedEdgeCents === null || input.realizedClvCents === null
      ? priorWeeklyClvGapCents
      : [...priorWeeklyClvGapCents, input.displayedExpectedEdgeCents - input.realizedClvCents],
    now: input.generatedAt
  });
  return { ...digest, alerts };
}
