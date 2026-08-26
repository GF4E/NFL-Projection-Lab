import {
  requiredForecastOriginsForSchedule,
  type OriginEligibilityReason,
  type RequiredForecastHorizonId
} from "@/domain/engine-os";
import { stableHash } from "@/domain/hash";

export type GameScheduleStatus = "scheduled" | "kickoff_unresolved" | "postponed" | "cancelled";

export interface CanonicalScheduleInput {
  db: D1Database;
  gameId: string;
  season: number;
  seasonType: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
  provider: string;
  providerGameId: string;
  scheduleStatus: GameScheduleStatus;
  kickoffUtc?: string | null;
  observedAt: string;
  activatedAt: string;
  activationBoundary: string;
  sourceCaptureId?: string | null;
  sourceEvidenceHash?: string | null;
  sourceRowHash: string;
}

interface ScheduleHeadRow {
  revision_id: string;
  week: number;
  schedule_status: GameScheduleStatus;
  kickoff_utc: string | null;
  observed_at: string;
  source_capture_id: string | null;
  source_evidence_hash: string | null;
  source_row_hash: string;
}

interface OriginHeadRow {
  origin_version_id: string;
  logical_origin_id: string;
  horizon_id: RequiredForecastHorizonId;
  scheduled_for_utc: string | null;
  eligible: number;
  eligibility_reason: OriginEligibilityReason;
}

export interface ReconciledGameSchedule {
  gameId: string;
  scheduleRevisionId: string;
  scheduleStatus: GameScheduleStatus;
  appendedRevision: boolean;
  originVersions: Array<{
    originVersionId: string;
    logicalOriginId: string;
    horizonId: RequiredForecastHorizonId;
    scheduledForUtc: string | null;
    eligible: boolean;
    eligibilityReason: OriginEligibilityReason;
  }>;
}

function canonicalTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function validateSchedule(input: CanonicalScheduleInput): {
  observedAt: string;
  activatedAt: string;
  kickoffUtc: string | null;
} {
  const observedAt = canonicalTimestamp(input.observedAt, "Schedule observation");
  const activatedAt = canonicalTimestamp(input.activatedAt, "Activation");
  const kickoffUtc = input.kickoffUtc ? canonicalTimestamp(input.kickoffUtc, "Kickoff") : null;
  if (input.season !== 2026 || input.seasonType !== "REG" || !Number.isInteger(input.week) ||
    input.week < 1 || input.week > 18) {
    throw new Error("OS-02A accepts only 2026 regular-season game identities");
  }
  if ((input.scheduleStatus === "scheduled") !== Boolean(kickoffUtc)) {
    throw new Error("A scheduled revision requires kickoff; unresolved, postponed, and cancelled revisions forbid it");
  }
  if (!/^[a-f0-9]{64}$/i.test(input.sourceRowHash) ||
    input.sourceEvidenceHash !== null && input.sourceEvidenceHash !== undefined &&
      !/^[a-f0-9]{64}$/i.test(input.sourceEvidenceHash) ||
    !input.sourceCaptureId && !input.sourceEvidenceHash) {
    throw new Error("Schedule identity requires immutable source-row and source-evidence hashes");
  }
  return { observedAt, activatedAt, kickoffUtc };
}

async function appendProviderAlias(input: CanonicalScheduleInput, observedAt: string): Promise<void> {
  const latest = await input.db.prepare(`SELECT game_id FROM game_provider_aliases
    WHERE provider = ? AND provider_game_id = ?
    ORDER BY observed_at DESC, alias_id DESC LIMIT 1`)
    .bind(input.provider, input.providerGameId).first<{ game_id: string | null }>();
  if (latest?.game_id && latest.game_id !== input.gameId) {
    throw new Error(`Provider game identity is ambiguous for ${input.provider}:${input.providerGameId}`);
  }
  if (latest?.game_id === input.gameId) return;
  const aliasId = stableHash({
    contract: "engine-os.game-alias.v2",
    provider: input.provider,
    providerGameId: input.providerGameId,
    gameId: input.gameId,
    observedAt
  });
  await input.db.prepare(`INSERT OR IGNORE INTO game_provider_aliases (
    alias_id, provider, provider_game_id, game_id, valid_from, observed_at, source_capture_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
    aliasId,
    input.provider,
    input.providerGameId,
    input.gameId,
    observedAt,
    observedAt,
    input.sourceCaptureId ?? null
  ).run();
  const authoritative = await input.db.prepare(`SELECT game_id FROM game_provider_aliases
    WHERE provider = ? AND provider_game_id = ?
    ORDER BY observed_at DESC, alias_id DESC LIMIT 1`)
    .bind(input.provider, input.providerGameId).first<{ game_id: string | null }>();
  if (authoritative?.game_id !== input.gameId) {
    throw new Error(`Provider game identity did not resolve atomically for ${input.provider}:${input.providerGameId}`);
  }
}

async function assertProviderAliasAvailable(input: CanonicalScheduleInput): Promise<void> {
  const latest = await input.db.prepare(`SELECT game_id FROM game_provider_aliases
    WHERE provider = ? AND provider_game_id = ?
    ORDER BY observed_at DESC, alias_id DESC LIMIT 1`)
    .bind(input.provider, input.providerGameId).first<{ game_id: string | null }>();
  if (latest?.game_id && latest.game_id !== input.gameId) {
    throw new Error(`Provider game identity is ambiguous for ${input.provider}:${input.providerGameId}`);
  }
}

async function assertCanonicalGame(input: CanonicalScheduleInput, observedAt: string): Promise<void> {
  await input.db.prepare(`INSERT OR IGNORE INTO canonical_games (
    game_id, season, season_type, week, home_team, away_team,
    identity_status, created_at, source_capture_id
  ) VALUES (?, ?, ?, ?, ?, ?, 'resolved', ?, ?)`).bind(
    input.gameId,
    input.season,
    input.seasonType,
    input.week,
    input.homeTeam,
    input.awayTeam,
    observedAt,
    input.sourceCaptureId ?? null
  ).run();
  const stored = await input.db.prepare(`SELECT season, season_type, week, home_team, away_team
    FROM canonical_games WHERE game_id = ?`).bind(input.gameId).first<{
      season: number;
      season_type: string;
      week: number;
      home_team: string;
      away_team: string;
    }>();
  if (!stored || stored.season !== input.season || stored.season_type !== input.seasonType ||
    stored.week !== input.week || stored.home_team !== input.homeTeam || stored.away_team !== input.awayTeam) {
    throw new Error(`Canonical game identity conflict for ${input.gameId}`);
  }
}

async function currentScheduleHead(db: D1Database, gameId: string): Promise<ScheduleHeadRow | null> {
  return db.prepare(`SELECT revision_id, week, schedule_status, kickoff_utc, observed_at,
      source_capture_id, source_evidence_hash, source_row_hash
    FROM game_schedule_revisions candidate
    WHERE game_id = ? AND NOT EXISTS (
      SELECT 1 FROM game_schedule_revisions child
      WHERE child.supersedes_revision_id = candidate.revision_id
    )
    LIMIT 1`).bind(gameId).first<ScheduleHeadRow>();
}

async function currentOriginHeads(db: D1Database, gameId: string): Promise<OriginHeadRow[]> {
  const rows = await db.prepare(`SELECT candidate.origin_version_id, candidate.logical_origin_id,
      candidate.horizon_id, candidate.scheduled_for_utc, candidate.eligible,
      candidate.eligibility_reason
    FROM forecast_origin_versions candidate
    WHERE candidate.game_id = ? AND NOT EXISTS (
      SELECT 1 FROM forecast_origin_versions child
      WHERE child.supersedes_origin_version_id = candidate.origin_version_id
    )
    ORDER BY candidate.horizon_id`).bind(gameId).all<OriginHeadRow>();
  return rows.results;
}

async function elapsedOriginHorizons(
  db: D1Database,
  gameId: string,
  observedAt: string
): Promise<RequiredForecastHorizonId[]> {
  const rows = await db.prepare(`SELECT DISTINCT horizon_id
    FROM forecast_origin_versions
    WHERE game_id = ? AND scheduled_for_utc IS NOT NULL AND scheduled_for_utc <= ?
    ORDER BY horizon_id`).bind(gameId, observedAt).all<{ horizon_id: RequiredForecastHorizonId }>();
  return rows.results.map((row) => row.horizon_id);
}

async function latestPermissibleOriginFloors(
  db: D1Database,
  gameId: string
): Promise<Partial<Record<RequiredForecastHorizonId, string>>> {
  const rows = await db.prepare(`SELECT horizon_id, MAX(scheduled_for_utc) AS scheduled_for_utc
    FROM forecast_origin_versions
    WHERE game_id = ? AND scheduled_for_utc IS NOT NULL
    GROUP BY horizon_id
    ORDER BY horizon_id`).bind(gameId).all<{
      horizon_id: RequiredForecastHorizonId;
      scheduled_for_utc: string;
    }>();
  const result: Partial<Record<RequiredForecastHorizonId, string>> = {};
  for (const row of rows.results) result[row.horizon_id] = row.scheduled_for_utc;
  return result;
}

function unchangedSchedule(head: ScheduleHeadRow, input: CanonicalScheduleInput, kickoffUtc: string | null): boolean {
  return head.week === input.week && head.schedule_status === input.scheduleStatus &&
    head.kickoff_utc === kickoffUtc && head.source_row_hash === input.sourceRowHash;
}

export async function reconcileCanonicalGameSchedule(
  input: CanonicalScheduleInput
): Promise<ReconciledGameSchedule> {
  const { observedAt, activatedAt, kickoffUtc } = validateSchedule(input);
  await assertProviderAliasAvailable(input);
  await assertCanonicalGame(input, observedAt);
  await appendProviderAlias(input, observedAt);
  const priorSchedule = await currentScheduleHead(input.db, input.gameId);
  const priorOrigins = await currentOriginHeads(input.db, input.gameId);
  if (priorSchedule && unchangedSchedule(priorSchedule, input, kickoffUtc)) {
    return {
      gameId: input.gameId,
      scheduleRevisionId: priorSchedule.revision_id,
      scheduleStatus: priorSchedule.schedule_status,
      appendedRevision: false,
      originVersions: priorOrigins.map((row) => ({
        originVersionId: row.origin_version_id,
        logicalOriginId: row.logical_origin_id,
        horizonId: row.horizon_id,
        scheduledForUtc: row.scheduled_for_utc,
        eligible: row.eligible === 1,
        eligibilityReason: row.eligibility_reason
      }))
    };
  }
  if (priorSchedule && Date.parse(observedAt) <= Date.parse(priorSchedule.observed_at)) {
    throw new Error("A changed schedule revision must be observed after the current head");
  }
  const scheduleRevisionId = stableHash({
    contract: "engine-os.schedule-revision.v1",
    gameId: input.gameId,
    week: input.week,
    scheduleStatus: input.scheduleStatus,
    kickoffUtc,
    observedAt,
    sourceCaptureId: input.sourceCaptureId ?? null,
    sourceEvidenceHash: input.sourceEvidenceHash ?? null,
    sourceRowHash: input.sourceRowHash
  });
  const priorByHorizon = new Map(priorOrigins.map((row) => [row.horizon_id, row]));
  const priorElapsedHorizons = await elapsedOriginHorizons(input.db, input.gameId, observedAt);
  const priorScheduledForByHorizon = await latestPermissibleOriginFloors(input.db, input.gameId);
  const resolvedOrigins = kickoffUtc ? requiredForecastOriginsForSchedule({
    gameId: input.gameId,
    week: input.week,
    kickoffUtc,
    observedAt,
    activatedAt,
    priorElapsedHorizons,
    priorScheduledForByHorizon
  }) : [];
  const resolvedByHorizon = new Map(resolvedOrigins.map((origin) => [origin.horizonId, origin]));
  const originRows = ([
    "weekly_tuesday_0730",
    "kickoff_minus_120",
    "kickoff_minus_90",
    "kickoff_minus_60",
    "kickoff_minus_15"
  ] as const).map((horizonId) => {
    const resolved = resolvedByHorizon.get(horizonId);
    const logicalOriginId = resolved?.logicalOriginId ?? stableHash({
      contract: "engine-os.required-origin.unresolved.v1",
      gameId: input.gameId,
      horizonId,
      scheduleRevisionId
    });
    const originVersionId = stableHash({
      contract: "engine-os.origin-version.v1",
      logicalOriginId,
      scheduleRevisionId
    });
    return {
      originVersionId,
      logicalOriginId,
      horizonId,
      scheduledForUtc: resolved?.scheduledForUtc ?? null,
      scheduledForLocal: resolved?.scheduledForLocal ?? null,
      scientificEligibility: resolved?.scientificEligibility ?? horizonId === "weekly_tuesday_0730",
      informationCutoff: resolved?.informationCutoff ?? (horizonId === "weekly_tuesday_0730"
        ? "completed_games_through_week_w_minus_1_at_origin"
        : "forecast_time"),
      eligible: resolved?.eligible ?? false,
      eligibilityReason: resolved?.eligibilityReason ?? "schedule_unresolved" as OriginEligibilityReason,
      supersedesOriginVersionId: priorByHorizon.get(horizonId)?.origin_version_id ?? null
    };
  });
  const statements = [
    input.db.prepare(`INSERT INTO game_schedule_revisions (
      revision_id, game_id, week, schedule_status, kickoff_utc, local_time_zone,
      observed_at, source_capture_id, source_evidence_hash, source_row_hash,
      supersedes_revision_id
    ) VALUES (?, ?, ?, ?, ?, 'America/Los_Angeles', ?, ?, ?, ?, ?)`).bind(
      scheduleRevisionId,
      input.gameId,
      input.week,
      input.scheduleStatus,
      kickoffUtc,
      observedAt,
      input.sourceCaptureId ?? null,
      input.sourceEvidenceHash ?? null,
      input.sourceRowHash,
      priorSchedule?.revision_id ?? null
    ),
    ...originRows.map((origin) => input.db.prepare(`INSERT INTO forecast_origin_versions (
      origin_version_id, logical_origin_id, game_id, horizon_id, scheduled_for_utc,
      scheduled_for_local, kickoff_revision_id, scientific_eligibility,
      information_cutoff, eligible, eligibility_reason, activation_boundary,
      supersedes_origin_version_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      origin.originVersionId,
      origin.logicalOriginId,
      input.gameId,
      origin.horizonId,
      origin.scheduledForUtc,
      origin.scheduledForLocal,
      scheduleRevisionId,
      origin.scientificEligibility ? 1 : 0,
      origin.informationCutoff,
      origin.eligible ? 1 : 0,
      origin.eligibilityReason,
      input.activationBoundary,
      origin.supersedesOriginVersionId,
      observedAt
    ))
  ];
  await input.db.batch(statements);
  return {
    gameId: input.gameId,
    scheduleRevisionId,
    scheduleStatus: input.scheduleStatus,
    appendedRevision: true,
    originVersions: originRows.map((origin) => ({
      originVersionId: origin.originVersionId,
      logicalOriginId: origin.logicalOriginId,
      horizonId: origin.horizonId,
      scheduledForUtc: origin.scheduledForUtc,
      eligible: origin.eligible,
      eligibilityReason: origin.eligibilityReason
    }))
  };
}
