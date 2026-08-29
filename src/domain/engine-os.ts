import { canonicalJson, sha256Hex, stableHash } from "./hash";
import { engineOperatingContract, footballLifecycle2026 } from "./engine-os-contracts";

export const ENGINE_OS_TIME_ZONE = "America/Los_Angeles";

export type CaptureDataset =
  | "schedule"
  | "play_by_play"
  | "roster"
  | "injury"
  | "inactive_roof"
  | "weather"
  | "odds";

export interface RedactedHttpRequest {
  method: string;
  url: string;
  publicQuery: Record<string, string[]>;
  redactedQueryKeys: string[];
  publicHeaders: Record<string, string>;
}

const PUBLIC_QUERY_KEYS = new Set([
  "bookmakers",
  "date",
  "dateFormat",
  "eventIds",
  "end_date",
  "hourly",
  "latitude",
  "longitude",
  "markets",
  "oddsFormat",
  "regions",
  "sport",
  "start_date",
  "temperature_unit",
  "timezone",
  "wind_speed_unit"
]);
const PUBLIC_HEADER_KEYS = new Set(["accept", "content-type", "if-none-match"]);
const SECRET_NAME = /(?:api[-_]?key|authorization|cookie|credential|password|secret|token)/i;

function canonicalTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function optionalCanonicalTimestamp(value: string | null | undefined, label: string): string | null {
  return value === null || value === undefined ? null : canonicalTimestamp(value, label);
}

export function redactHttpRequest(input: {
  url: string;
  method?: string;
  headers?: Headers | Record<string, string | undefined>;
}): RedactedHttpRequest {
  const url = new URL(input.url);
  // Known connectors authenticate in headers or query parameters. Refuse to
  // persist a path that advertises a credential slot because its next segment
  // may be the credential itself and cannot be safely inferred after the fact.
  if (url.pathname.split("/").some((segment) => SECRET_NAME.test(decodeURIComponent(segment)))) {
    throw new Error("Credential-bearing URL paths cannot be captured");
  }
  const publicQuery: Record<string, string[]> = {};
  const redactedQueryKeys = new Set<string>();
  for (const key of [...new Set(url.searchParams.keys())].sort()) {
    if (PUBLIC_QUERY_KEYS.has(key) && !SECRET_NAME.test(key)) {
      publicQuery[key] = url.searchParams.getAll(key).sort();
    } else {
      redactedQueryKeys.add(key);
    }
  }
  const publicHeaders: Record<string, string> = {};
  const headers = input.headers instanceof Headers
    ? [...input.headers.entries()]
    : Object.entries(input.headers ?? {}).flatMap(([key, value]) => value === undefined ? [] : [[key, value] as const]);
  for (const [rawKey, value] of headers) {
    const key = rawKey.toLowerCase();
    if (PUBLIC_HEADER_KEYS.has(key) && !SECRET_NAME.test(key)) publicHeaders[key] = value;
  }
  return {
    method: (input.method ?? "GET").toUpperCase(),
    url: `${url.origin}${url.pathname}`,
    publicQuery,
    redactedQueryKeys: [...redactedQueryKeys].sort(),
    publicHeaders
  };
}

export function assertSecretFreeManifest(value: unknown): void {
  const serialized = canonicalJson(value);
  const forbidden = [
    /api(?:_|-)?key\s*[=:]\s*(?!\[?redacted\]?)/i,
    /authorization\s*[=:]\s*(?!\[?redacted\]?)/i,
    /cookie\s*[=:]\s*(?!\[?redacted\]?)/i,
    /bearer\s+[a-z0-9._~-]+/i
  ];
  if (forbidden.some((pattern) => pattern.test(serialized))) {
    throw new Error("Capture manifest contains credential-bearing material");
  }
}

export interface RawCaptureManifest {
  contractVersion: "engine-os.raw-capture.v1";
  captureId: string;
  idempotencyKey: string;
  provider: string;
  dataset: CaptureDataset;
  request: RedactedHttpRequest;
  requestHash: string;
  responseObjectKey: string;
  responseSha256: string;
  responseBytes: number;
  contentType: string | null;
  etag: string | null;
  providerPublishedAt: string | null;
  receivedAt: string;
  validFrom: string | null;
  validTo: string | null;
  sourceSchemaVersion: string;
  licenseId: string;
  evidenceHash: string;
}

export function buildRawCaptureManifest(input: {
  idempotencyKey: string;
  provider: string;
  dataset: CaptureDataset;
  request: RedactedHttpRequest;
  responseBytes: Uint8Array;
  contentType?: string | null;
  etag?: string | null;
  providerPublishedAt?: string | null;
  receivedAt: string;
  validFrom?: string | null;
  validTo?: string | null;
  sourceSchemaVersion: string;
  licenseId: string;
}): { manifest: RawCaptureManifest; sidecarBytes: Uint8Array; sidecarSha256: string; sidecarObjectKey: string } {
  return buildRawCaptureManifestFromDigest({
    ...input,
    responseSha256: sha256Hex(input.responseBytes),
    responseByteLength: input.responseBytes.byteLength
  });
}

export function buildRawCaptureManifestFromDigest(input: {
  idempotencyKey: string;
  provider: string;
  dataset: CaptureDataset;
  request: RedactedHttpRequest;
  responseSha256: string;
  responseByteLength: number;
  contentType?: string | null;
  etag?: string | null;
  providerPublishedAt?: string | null;
  receivedAt: string;
  validFrom?: string | null;
  validTo?: string | null;
  sourceSchemaVersion: string;
  licenseId: string;
}): { manifest: RawCaptureManifest; sidecarBytes: Uint8Array; sidecarSha256: string; sidecarObjectKey: string } {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(input.provider)) {
    throw new Error("Capture provider must be a storage-safe identifier");
  }
  if (!input.idempotencyKey.trim() || !input.sourceSchemaVersion.trim() || !input.licenseId.trim()) {
    throw new Error("Capture identity, schema, and license metadata are required");
  }
  const receivedAt = canonicalTimestamp(input.receivedAt, "Capture receipt time");
  const providerPublishedAt = optionalCanonicalTimestamp(input.providerPublishedAt, "Provider publication time");
  const validFrom = optionalCanonicalTimestamp(input.validFrom, "Capture valid-from time");
  const validTo = optionalCanonicalTimestamp(input.validTo, "Capture valid-to time");
  if (validFrom && validTo && Date.parse(validTo) < Date.parse(validFrom)) {
    throw new Error("Capture validity cannot end before it begins");
  }
  if (!/^[a-f0-9]{64}$/i.test(input.responseSha256) ||
    !Number.isSafeInteger(input.responseByteLength) || input.responseByteLength < 0) {
    throw new Error("Capture response digest and byte length are invalid");
  }
  const responseSha256 = input.responseSha256.toLowerCase();
  const requestHash = stableHash(input.request);
  const responseObjectKey = `raw/${input.provider}/${input.dataset}/sha256/${responseSha256}`;
  const captureId = stableHash({
    contractVersion: "engine-os.raw-capture.v1",
    idempotencyKey: input.idempotencyKey,
    provider: input.provider,
    dataset: input.dataset
  });
  const evidenceHash = stableHash({
    requestHash,
    responseSha256,
    sourceSchemaVersion: input.sourceSchemaVersion,
    providerPublishedAt,
    validFrom,
    validTo
  });
  const manifest: RawCaptureManifest = {
    contractVersion: "engine-os.raw-capture.v1",
    captureId,
    idempotencyKey: input.idempotencyKey,
    provider: input.provider,
    dataset: input.dataset,
    request: input.request,
    requestHash,
    responseObjectKey,
    responseSha256,
    responseBytes: input.responseByteLength,
    contentType: input.contentType ?? null,
    etag: input.etag ?? null,
    providerPublishedAt,
    receivedAt,
    validFrom,
    validTo,
    sourceSchemaVersion: input.sourceSchemaVersion,
    licenseId: input.licenseId,
    evidenceHash
  };
  assertSecretFreeManifest(manifest);
  const sidecarBytes = new TextEncoder().encode(canonicalJson(manifest));
  const sidecarSha256 = sha256Hex(sidecarBytes);
  return {
    manifest,
    sidecarBytes,
    sidecarSha256,
    sidecarObjectKey: `manifests/raw-capture/sha256/${sidecarSha256}.json`
  };
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function localDateTimeToUtc(input: Omit<ZonedParts, "weekday">, timeZone: string): Date {
  const target = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second);
  let guess = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    guess += target - represented;
  }
  return new Date(guess);
}

const WEEKDAY_NUMBER: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

export interface ForecastOriginIdentity {
  originId: string;
  gameId: string;
  kind: "tuesday_0730_pt";
  scheduledForUtc: string;
  scheduledForLocal: string;
  kickoffUtc: string;
  timeZone: typeof ENGINE_OS_TIME_ZONE;
  eligible: boolean;
}

export function tuesdayForecastOrigin(gameId: string, kickoffUtc: string): ForecastOriginIdentity {
  const kickoff = new Date(kickoffUtc);
  if (!Number.isFinite(kickoff.getTime())) throw new Error("Kickoff must be a valid UTC timestamp");
  const local = zonedParts(kickoff, ENGINE_OS_TIME_ZONE);
  const dayNumber = WEEKDAY_NUMBER[local.weekday];
  if (dayNumber === undefined) throw new Error("Unable to resolve Pacific weekday");
  const daysSinceTuesday = (dayNumber - 2 + 7) % 7;
  const dateOnly = new Date(Date.UTC(local.year, local.month - 1, local.day - daysSinceTuesday));
  const originLocal = {
    year: dateOnly.getUTCFullYear(),
    month: dateOnly.getUTCMonth() + 1,
    day: dateOnly.getUTCDate(),
    hour: 7,
    minute: 30,
    second: 0
  };
  const scheduled = localDateTimeToUtc(originLocal, ENGINE_OS_TIME_ZONE);
  const localDay = `${originLocal.year}-${String(originLocal.month).padStart(2, "0")}-${String(originLocal.day).padStart(2, "0")}`;
  const scheduledForLocal = `${localDay}T07:30:00[${ENGINE_OS_TIME_ZONE}]`;
  return {
    originId: stableHash({ contract: "engine-os.origin.v1", gameId, kind: "tuesday_0730_pt", scheduledForLocal }),
    gameId,
    kind: "tuesday_0730_pt",
    scheduledForUtc: scheduled.toISOString(),
    scheduledForLocal,
    kickoffUtc: kickoff.toISOString(),
    timeZone: ENGINE_OS_TIME_ZONE,
    eligible: scheduled.getTime() < kickoff.getTime()
  };
}

export type RequiredForecastHorizonId =
  | "weekly_tuesday_0730"
  | "kickoff_minus_120"
  | "kickoff_minus_90"
  | "kickoff_minus_60"
  | "kickoff_minus_15";

export type OriginEligibilityReason =
  | "eligible"
  | "schedule_unresolved"
  | "known_after_origin"
  | "pre_activation"
  | "after_kickoff"
  | "prior_origin_elapsed"
  | "earlier_origin_prohibited";

export interface RequiredForecastOriginIdentity {
  logicalOriginId: string;
  gameId: string;
  horizonId: RequiredForecastHorizonId;
  scheduledForUtc: string;
  scheduledForLocal: string;
  kickoffUtc: string;
  timeZone: typeof ENGINE_OS_TIME_ZONE;
  scientificEligibility: boolean;
  informationCutoff: string;
  eligible: boolean;
  eligibilityReason: OriginEligibilityReason;
}

function localTimestamp(date: Date): string {
  const local = zonedParts(date, ENGINE_OS_TIME_ZONE);
  return `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}` +
    `T${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}:` +
    `${String(local.second).padStart(2, "0")}[${ENGINE_OS_TIME_ZONE}]`;
}

function weekTuesdayOrigin(week: number): Date {
  if (!Number.isInteger(week) || week < 1 || week > footballLifecycle2026.seasonBoundary.regularSeasonWeeks) {
    throw new Error("Forecast week is outside the frozen 2026 regular season");
  }
  const weekOne = zonedParts(
    new Date(footballLifecycle2026.seasonBoundary.fullSeasonActivationDeadline),
    ENGINE_OS_TIME_ZONE
  );
  const localDate = new Date(Date.UTC(weekOne.year, weekOne.month - 1, weekOne.day + 7 * (week - 1)));
  return localDateTimeToUtc({
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour: 7,
    minute: 30,
    second: 0
  }, ENGINE_OS_TIME_ZONE);
}

function requiredHorizonTime(horizonId: RequiredForecastHorizonId, week: number, kickoff: Date): Date {
  if (horizonId === "weekly_tuesday_0730") return weekTuesdayOrigin(week);
  const minutes = Number(horizonId.slice("kickoff_minus_".length));
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`Unsupported forecast horizon: ${horizonId}`);
  return new Date(kickoff.getTime() - minutes * 60_000);
}

/**
 * Builds the five frozen origin identities for one immutable schedule revision.
 * The scientific Tuesday origin is anchored to NFL Week W, never to a revised
 * kickoff date. A schedule learned after an origin, or a postponed game whose
 * prior version already elapsed, cannot manufacture prospective evidence.
 */
export function requiredForecastOriginsForSchedule(input: {
  gameId: string;
  week: number;
  kickoffUtc: string;
  observedAt: string;
  activatedAt: string;
  priorElapsedHorizons?: readonly RequiredForecastHorizonId[];
  priorScheduledForByHorizon?: Partial<Record<RequiredForecastHorizonId, string>>;
}): RequiredForecastOriginIdentity[] {
  const kickoff = new Date(input.kickoffUtc);
  const observedAt = new Date(input.observedAt);
  const activatedAt = new Date(input.activatedAt);
  if (![kickoff, observedAt, activatedAt].every((date) => Number.isFinite(date.getTime()))) {
    throw new Error("Schedule, observation, and activation timestamps must be valid");
  }
  const priorElapsed = new Set(input.priorElapsedHorizons ?? []);
  return engineOperatingContract.forecastHorizons.map((contract) => {
    const horizonId = contract.id as RequiredForecastHorizonId;
    const scheduled = requiredHorizonTime(horizonId, input.week, kickoff);
    const priorScheduledValue = input.priorScheduledForByHorizon?.[horizonId];
    const priorScheduled = priorScheduledValue ? new Date(priorScheduledValue) : null;
    if (priorScheduled && !Number.isFinite(priorScheduled.getTime())) {
      throw new Error(`Prior ${horizonId} origin must be a valid timestamp`);
    }
    let eligibilityReason: OriginEligibilityReason = "eligible";
    if (priorElapsed.has(horizonId)) eligibilityReason = "prior_origin_elapsed";
    else if (priorScheduled && scheduled.getTime() < priorScheduled.getTime()) {
      eligibilityReason = "earlier_origin_prohibited";
    }
    else if (scheduled.getTime() >= kickoff.getTime()) eligibilityReason = "after_kickoff";
    else if (observedAt.getTime() > scheduled.getTime()) eligibilityReason = "known_after_origin";
    else if (activatedAt.getTime() > scheduled.getTime()) eligibilityReason = "pre_activation";
    const scheduledForUtc = scheduled.toISOString();
    const logicalOriginId = stableHash({
      contract: "engine-os.required-origin.v1",
      gameId: input.gameId,
      horizonId,
      scheduledForUtc
    });
    return {
      logicalOriginId,
      gameId: input.gameId,
      horizonId,
      scheduledForUtc,
      scheduledForLocal: localTimestamp(scheduled),
      kickoffUtc: kickoff.toISOString(),
      timeZone: ENGINE_OS_TIME_ZONE,
      scientificEligibility: contract.scientificEligibility,
      informationCutoff: contract.informationCutoff,
      eligible: eligibilityReason === "eligible",
      eligibilityReason
    };
  });
}

export function priorWeekEvidenceOnly(input: {
  forecastSeason: number;
  forecastWeek: number;
  evidenceSeason: number;
  evidenceWeek: number;
}): boolean {
  return input.evidenceSeason < input.forecastSeason ||
    input.evidenceSeason === input.forecastSeason && input.evidenceWeek < input.forecastWeek;
}

export function deterministicEngineJobKey(input: {
  job: string;
  scheduledFor: string;
  gameId?: string | null;
  originId?: string | null;
}): string {
  return stableHash({ contract: "engine-os.job.v1", ...input });
}

export type ForecastWithholdingReason =
  | "no_eligible_package"
  | "schedule_unavailable_at_origin"
  | "required_source_stale"
  | "required_source_partial"
  | "required_source_unavailable"
  | "schema_invalid"
  | "provenance_incomplete"
  | "package_hash_mismatch"
  | "late_origin_excluded"
  | "compute_failure";

export interface ForecastProvenance {
  runnerHash: string;
  codeHash: string;
  packageHash: string;
  configHash: string;
  inputManifestHash: string;
  featureSchemaHash: string;
  targetSchemaHash: string;
  outputObjectKey: string;
  outputObjectHash: string;
}

const PROVENANCE_KEYS: ReadonlyArray<keyof ForecastProvenance> = [
  "runnerHash",
  "codeHash",
  "packageHash",
  "configHash",
  "inputManifestHash",
  "featureSchemaHash",
  "targetSchemaHash",
  "outputObjectKey",
  "outputObjectHash"
];

export interface ForecastLedgerRecord {
  recordId: string;
  originId: string;
  gameId: string;
  status: "forecast" | "withheld";
  withholdingReason: ForecastWithholdingReason | null;
  generatedAt: string;
  recordedAt: string;
  timing: "early" | "timely" | "late";
  prospectiveEligible: boolean;
  captureHealth: "current" | "stale" | "partial" | "unavailable";
  activationBoundary: string;
  evidenceScope: "full_season_shadow" | "partial_season_shadow";
  qualificationKey: string | null;
  provenance: ForecastProvenance | null;
  recordHash: string;
}

export function completeForecastProvenance(value: Partial<ForecastProvenance> | null | undefined): value is ForecastProvenance {
  if (!value) return false;
  const digest = /^(?:sha256:)?[a-f0-9]{64}$/i;
  return PROVENANCE_KEYS.every((key) => {
    const field = value[key];
    if (typeof field !== "string" || field.trim().length === 0) return false;
    return key === "outputObjectKey" || digest.test(field);
  });
}

export function buildForecastLedgerRecord(input: {
  origin: ForecastOriginIdentity;
  requestedStatus: "forecast" | "withheld";
  withholdingReason?: ForecastWithholdingReason | null;
  generatedAt: string;
  recordedAt?: string;
  captureHealth: ForecastLedgerRecord["captureHealth"];
  activationBoundary: string;
  evidenceScope: ForecastLedgerRecord["evidenceScope"];
  originGraceSeconds: number;
  qualificationKey?: string | null;
  provenance?: Partial<ForecastProvenance> | null;
}): ForecastLedgerRecord {
  const generated = new Date(input.generatedAt);
  const recordedAt = input.recordedAt ?? input.generatedAt;
  const recorded = new Date(recordedAt);
  const origin = new Date(input.origin.scheduledForUtc);
  const kickoff = new Date(input.origin.kickoffUtc);
  if (![generated, recorded, origin, kickoff].every((date) => Number.isFinite(date.getTime()))) {
    throw new Error("Ledger timestamps must be valid ISO timestamps");
  }
  if (recorded.getTime() < generated.getTime()) throw new Error("A record cannot predate its generation time");
  if (generated.getTime() < origin.getTime()) {
    throw new Error("A forecast-origin record cannot be written before its activated origin");
  }
  if (!Number.isFinite(input.originGraceSeconds) || input.originGraceSeconds < 0) {
    throw new Error("Origin grace must be a nonnegative number of seconds");
  }
  const latestTimelyPersistence = origin.getTime() + input.originGraceSeconds * 1000;
  const timing = !input.origin.eligible
    ? "late" as const
    : generated.getTime() < origin.getTime()
      ? "early" as const
      : recorded.getTime() > latestTimelyPersistence || recorded.getTime() >= kickoff.getTime()
      ? "late" as const
      : "timely" as const;
  const hasProvenance = completeForecastProvenance(input.provenance);
  const hasQualificationKey = typeof input.qualificationKey === "string" && input.qualificationKey.trim().length > 0;
  const captureReason = input.requestedStatus !== "forecast"
    ? null
    : input.captureHealth === "stale"
    ? "required_source_stale" as const
    : input.captureHealth === "partial"
      ? "required_source_partial" as const
      : input.captureHealth === "unavailable"
        ? "required_source_unavailable" as const
        : null;
  const status = input.requestedStatus === "forecast" && hasProvenance && hasQualificationKey && timing === "timely" && captureReason === null
    ? "forecast" as const
    : "withheld" as const;
  const withholdingReason = status === "forecast"
    ? null
    : timing === "late"
      ? "late_origin_excluded" as const
      : captureReason ?? (input.requestedStatus === "forecast"
      ? "provenance_incomplete" as const
      : input.withholdingReason ?? "compute_failure");
  const unsigned = {
    contractVersion: "engine-os.forecast-ledger.v1",
    originId: input.origin.originId,
    gameId: input.origin.gameId,
    status,
    withholdingReason,
    generatedAt: generated.toISOString(),
    recordedAt: recorded.toISOString(),
    timing,
    captureHealth: input.captureHealth,
    activationBoundary: input.activationBoundary,
    evidenceScope: input.evidenceScope,
    qualificationKey: input.qualificationKey ?? null,
    provenance: status === "forecast" ? input.provenance as ForecastProvenance : null
  };
  const recordHash = stableHash(unsigned);
  return {
    recordId: stableHash({ contract: "engine-os.forecast-ledger.record.v1", originId: input.origin.originId, timing, recordHash }),
    ...unsigned,
    prospectiveEligible: timing === "timely",
    recordHash
  };
}

export interface OddsQuotaPolicy {
  monthlyPlanCredits: number;
  alertAt: number;
  nonessentialCeiling: number;
  hardCeiling: number;
  stateMaxAgeMinutes: number;
}

export interface OddsQuotaSnapshot {
  used: number;
  remaining: number;
  lastCost: number;
  updatedAt: string;
}

export type OddsQuotaDecision =
  | { allowed: true; projectedUsed: number; alert: boolean }
  | { allowed: false; projectedUsed: number | null; alert: true; reason: "missing_state" | "stale_state" | "invalid_state" | "nonessential_reserve" | "hard_ceiling" };

export function assessOddsQuota(input: {
  state: OddsQuotaSnapshot | null;
  requestCost: number;
  essential: boolean;
  now: string;
  policy: OddsQuotaPolicy;
}): OddsQuotaDecision {
  const { state, policy } = input;
  if (![policy.monthlyPlanCredits, policy.alertAt, policy.nonessentialCeiling, policy.hardCeiling, policy.stateMaxAgeMinutes]
    .every((value) => Number.isFinite(value) && value >= 0) ||
    policy.alertAt > policy.hardCeiling || policy.nonessentialCeiling > policy.hardCeiling ||
    policy.hardCeiling > policy.monthlyPlanCredits) {
    return { allowed: false, projectedUsed: null, alert: true, reason: "invalid_state" };
  }
  if (!state) return { allowed: false, projectedUsed: null, alert: true, reason: "missing_state" };
  if (![state.used, state.remaining, state.lastCost, input.requestCost].every((value) => Number.isInteger(value) && value >= 0) ||
    state.used + state.remaining !== policy.monthlyPlanCredits) {
    return { allowed: false, projectedUsed: null, alert: true, reason: "invalid_state" };
  }
  const now = Date.parse(input.now);
  const updated = Date.parse(state.updatedAt);
  if (!Number.isFinite(now) || !Number.isFinite(updated) || now < updated) {
    return { allowed: false, projectedUsed: state.used + input.requestCost, alert: true, reason: "invalid_state" };
  }
  const stale = now - updated > policy.stateMaxAgeMinutes * 60_000;
  // A stale counter cannot prove that even the essential reserve remains.
  // All calls fail closed until a fresh provider-header state is recorded.
  if (stale) {
    return { allowed: false, projectedUsed: state.used + input.requestCost, alert: true, reason: "stale_state" };
  }
  const projectedUsed = state.used + input.requestCost;
  if (projectedUsed > policy.hardCeiling) {
    return { allowed: false, projectedUsed, alert: true, reason: "hard_ceiling" };
  }
  if (!input.essential && projectedUsed > policy.nonessentialCeiling) {
    return { allowed: false, projectedUsed, alert: true, reason: "nonessential_reserve" };
  }
  return { allowed: true, projectedUsed, alert: projectedUsed >= policy.alertAt };
}
