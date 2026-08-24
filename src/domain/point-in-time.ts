import { stableHash } from "./hash";
import type { DataFreshness } from "./types";

export type ObservationKind = "observed" | "forecast" | "market" | "manual";

export interface SourceObservation {
  id: string;
  provider: string;
  dataset: string;
  sourceRecordId: string;
  kind: ObservationKind;
  /** Time the source says the observation was published or issued. */
  publishedAt: string;
  /** Time our importer captured the source. */
  capturedAt: string;
  /** Event time for observations, or forecast-valid time for forecasts. */
  validAt: string;
  validTo: string | null;
  schemaVersion: string;
  sourceHash: string;
  importRunId: string;
  licenseTag: string;
  freshness: DataFreshness;
  sourceUrl: string | null;
}

export interface PointInTimeFeatureRow {
  id: string;
  gameId: string;
  season: number;
  targetWeek: number;
  inputsThroughWeek: number;
  generatedAt: string;
  featureSchemaVersion: string;
  transformationVersion: string;
  imputationPolicy: string;
  values: Record<string, number | null>;
  missingness: Record<string, boolean>;
  observations: SourceObservation[];
  maximumSourceTime: string;
  upstreamSnapshotHash: string;
  rowHash: string;
}

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid ISO timestamp`);
  return parsed;
}

export function assertObservationAvailableAt(
  observation: SourceObservation,
  forecastGeneratedAt: string
): void {
  const forecastTime = timestamp(forecastGeneratedAt, "forecast generatedAt");
  const published = timestamp(observation.publishedAt, `${observation.id} publishedAt`);
  const captured = timestamp(observation.capturedAt, `${observation.id} capturedAt`);
  timestamp(observation.validAt, `${observation.id} validAt`);
  if (observation.validTo !== null) timestamp(observation.validTo, `${observation.id} validTo`);
  if (published > forecastTime || captured > forecastTime) {
    throw new Error(`Point-in-time leakage: ${observation.id} was unavailable at ${forecastGeneratedAt}`);
  }
  if (observation.freshness === "partial" || observation.freshness === "unavailable") {
    throw new Error(`Point-in-time input ${observation.id} is ${observation.freshness}`);
  }
  if (!observation.sourceHash || !observation.schemaVersion || !observation.licenseTag || !observation.importRunId) {
    throw new Error(`Point-in-time input ${observation.id} is missing provenance`);
  }
}

export function assertFeatureRowLeakageSafe(row: PointInTimeFeatureRow): void {
  if (row.inputsThroughWeek > row.targetWeek - 1) {
    throw new Error(`Point-in-time leakage: Week ${row.targetWeek} uses game data through Week ${row.inputsThroughWeek}`);
  }
  if (!row.observations.length) throw new Error("Point-in-time feature row requires source observations");
  row.observations.forEach((observation) => assertObservationAvailableAt(observation, row.generatedAt));
  const maximumSourceTime = maximumAvailableAt(row.observations);
  if (maximumSourceTime !== row.maximumSourceTime) {
    throw new Error("Point-in-time feature row maximum source time is invalid");
  }
  const expectedUpstream = stableHash(
    [...row.observations]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((observation) => ({
        id: observation.id,
        sourceHash: observation.sourceHash,
        publishedAt: observation.publishedAt,
        capturedAt: observation.capturedAt,
        schemaVersion: observation.schemaVersion,
        importRunId: observation.importRunId,
        validAt: observation.validAt,
        validTo: observation.validTo
      }))
  );
  if (row.upstreamSnapshotHash !== expectedUpstream) {
    throw new Error("Point-in-time feature row upstream hash does not match its observations");
  }
  const expectedRowHash = stableHash({
    id: row.id,
    gameId: row.gameId,
    season: row.season,
    targetWeek: row.targetWeek,
    inputsThroughWeek: row.inputsThroughWeek,
    generatedAt: row.generatedAt,
    featureSchemaVersion: row.featureSchemaVersion,
    transformationVersion: row.transformationVersion,
    imputationPolicy: row.imputationPolicy,
    values: row.values,
    missingness: row.missingness,
    maximumSourceTime: row.maximumSourceTime,
    upstreamSnapshotHash: row.upstreamSnapshotHash
  });
  if (row.rowHash !== expectedRowHash) throw new Error("Point-in-time feature row hash is invalid");
}

export function createPointInTimeFeatureRow(input: Omit<
  PointInTimeFeatureRow,
  "upstreamSnapshotHash" | "rowHash" | "maximumSourceTime"
>): PointInTimeFeatureRow {
  const observations = [...input.observations].sort((left, right) => left.id.localeCompare(right.id));
  const upstreamSnapshotHash = stableHash(observations.map((observation) => ({
    id: observation.id,
    sourceHash: observation.sourceHash,
    publishedAt: observation.publishedAt,
    capturedAt: observation.capturedAt,
    schemaVersion: observation.schemaVersion,
    importRunId: observation.importRunId,
    validAt: observation.validAt,
    validTo: observation.validTo
  })));
  const maximumSourceTime = maximumAvailableAt(observations)!;
  const rowHash = stableHash({
    id: input.id,
    gameId: input.gameId,
    season: input.season,
    targetWeek: input.targetWeek,
    inputsThroughWeek: input.inputsThroughWeek,
    generatedAt: input.generatedAt,
    featureSchemaVersion: input.featureSchemaVersion,
    transformationVersion: input.transformationVersion,
    imputationPolicy: input.imputationPolicy,
    values: input.values,
    missingness: input.missingness,
    maximumSourceTime,
    upstreamSnapshotHash
  });
  const row = { ...input, observations, maximumSourceTime, upstreamSnapshotHash, rowHash };
  assertFeatureRowLeakageSafe(row);
  return row;
}

export function maximumAvailableAt(observations: readonly SourceObservation[]): string | null {
  if (!observations.length) return null;
  return observations
    .flatMap((observation) => [observation.publishedAt, observation.capturedAt])
    .sort()
    .at(-1) ?? null;
}

export interface AtomicSnapshotCandidate<T> {
  snapshotKey: string;
  capturedAt: string;
  freshness: DataFreshness;
  complete: boolean;
  sourceHash: string;
  value: T;
}

export function promoteAtomicSnapshot<T>(input: {
  candidate: AtomicSnapshotCandidate<T>;
  lastGood: AtomicSnapshotCandidate<T> | null;
}): { published: AtomicSnapshotCandidate<T> | null; rejected: AtomicSnapshotCandidate<T> | null } {
  if (
    input.candidate.complete &&
    input.candidate.freshness === "current" &&
    input.candidate.sourceHash
  ) {
    return { published: input.candidate, rejected: null };
  }
  return { published: input.lastGood, rejected: input.candidate };
}
