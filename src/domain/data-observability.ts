import type { SourceObservation } from "./point-in-time";

export interface SourceObservabilitySummary {
  provider: string;
  dataset: string;
  observations: number;
  current: number;
  staleOrUnavailable: number;
  medianCaptureLagSeconds: number;
  maximumCaptureLagSeconds: number;
  earliestPublishedAt: string;
  latestCapturedAt: string;
  distinctRecords: number;
}

function quantile(values: readonly number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

export function summarizeSourceObservability(
  observations: readonly SourceObservation[]
): SourceObservabilitySummary[] {
  const groups = new Map<string, SourceObservation[]>();
  observations.forEach((observation) => {
    const key = `${observation.provider}:${observation.dataset}`;
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  });
  return [...groups.values()].map((rows) => {
    const lags = rows.map((row) => {
      const lag = (Date.parse(row.capturedAt) - Date.parse(row.publishedAt)) / 1_000;
      if (!Number.isFinite(lag) || lag < 0) throw new Error(`Invalid provider capture lag for ${row.id}`);
      return lag;
    });
    return {
      provider: rows[0].provider,
      dataset: rows[0].dataset,
      observations: rows.length,
      current: rows.filter((row) => row.freshness === "current").length,
      staleOrUnavailable: rows.filter((row) => row.freshness !== "current").length,
      medianCaptureLagSeconds: quantile(lags, 0.5),
      maximumCaptureLagSeconds: Math.max(...lags),
      earliestPublishedAt: rows.map((row) => row.publishedAt).sort()[0],
      latestCapturedAt: rows.map((row) => row.capturedAt).sort().at(-1)!,
      distinctRecords: new Set(rows.map((row) => row.sourceRecordId)).size
    };
  }).sort((left, right) => left.provider.localeCompare(right.provider) || left.dataset.localeCompare(right.dataset));
}

export function validateRequiredSnapshotCoverage(input: {
  observations: readonly SourceObservation[];
  required: readonly { provider: string; dataset: string; minimumRecords: number }[];
}): string[] {
  return input.required.flatMap((required) => {
    const rows = input.observations.filter((row) => row.provider === required.provider && row.dataset === required.dataset);
    if (rows.some((row) => row.freshness === "partial" || row.freshness === "unavailable")) {
      return [`${required.provider}/${required.dataset} contains a partial or unavailable snapshot`];
    }
    const records = new Set(rows.map((row) => row.sourceRecordId)).size;
    return records < required.minimumRecords
      ? [`${required.provider}/${required.dataset} has ${records}/${required.minimumRecords} required records`]
      : [];
  });
}

/**
 * A source may be described as leading only after capture-lag normalization.
 * This returns an observational sequence and deliberately makes no "sharp" claim.
 */
export function latencyNormalizedMovementOrder(
  observations: readonly SourceObservation[]
): Array<{ id: string; provider: string; effectivePublishedAt: string; captureLagSeconds: number }> {
  return observations.map((row) => {
    const captureLagSeconds = (Date.parse(row.capturedAt) - Date.parse(row.publishedAt)) / 1_000;
    if (!Number.isFinite(captureLagSeconds) || captureLagSeconds < 0) throw new Error(`Invalid market latency for ${row.id}`);
    return { id: row.id, provider: row.provider, effectivePublishedAt: row.publishedAt, captureLagSeconds };
  }).sort((left, right) => left.effectivePublishedAt.localeCompare(right.effectivePublishedAt) || left.id.localeCompare(right.id));
}
