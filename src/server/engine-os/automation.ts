import {
  engineOperatingContract,
  engineOsContractHashes,
  footballLifecycle2026
} from "@/domain/engine-os-contracts";
import {
  requiredForecastOriginsForSchedule,
  type ForecastOriginIdentity
} from "@/domain/engine-os";
import { stableHash } from "@/domain/hash";
import { easternScheduleTimeToIso } from "@/domain/weekly-slate";
import {
  acquireEngineJobLease,
  activateForecastLedger,
  finishEngineJob,
  recordForecastOrWithholding,
  seedCanonicalGameOrigin
} from "./ledger";
import { reconcileCanonicalGameSchedule } from "./origin-identity";

interface ScheduleGameRow {
  game_id: string;
  season: number;
  season_type: string;
  week: number;
  game_date: string;
  game_time: string | null;
  away_team: string;
  home_team: string;
  source_row_hash: string;
}

interface DueOriginRow {
  origin_id: string;
  game_id: string;
  origin_kind: "tuesday_0730_pt";
  scheduled_for_utc: string;
  scheduled_for_local: string;
  kickoff_utc: string;
  eligible: number;
}

export interface EngineOsAutomationResult {
  activationId: string | null;
  seededOrigins: number;
  reconciledOriginVersions: number;
  dueOrigins: number;
  withheld: number;
  late: number;
  skipped: number;
  unresolvedGames: number;
  status: "active" | "waiting_for_schedule";
}

function kickoffFor(row: ScheduleGameRow): string | null {
  return row.game_time ? easternScheduleTimeToIso(row.game_date, row.game_time) : null;
}

const WEEKLY_REQUIRED_SOURCES = [
  { dataset: "schedule", sourceKey: "nflverse:schedule" },
  { dataset: "play_by_play", sourceKey: `nflverse:play_by_play:${footballLifecycle2026.season}` },
  { dataset: "roster", sourceKey: "nflverse:roster" },
  { dataset: "injury", sourceKey: "official-nfl:injury" }
] as const;

async function captureHealth(db: D1Database, now: Date): Promise<"current" | "stale" | "partial" | "unavailable"> {
  const rows = await db.prepare(`SELECT source_key, dataset, status, last_success_at FROM source_capture_heartbeats
    WHERE source_key IN (?, ?, ?, ?)`)
    .bind(...WEEKLY_REQUIRED_SOURCES.map((source) => source.sourceKey))
    .all<{
      source_key: typeof WEEKLY_REQUIRED_SOURCES[number]["sourceKey"];
      dataset: typeof WEEKLY_REQUIRED_SOURCES[number]["dataset"];
      status: "current" | "stale" | "partial" | "unavailable";
      last_success_at: string | null;
    }>();
  if (WEEKLY_REQUIRED_SOURCES.some((source) => !rows.results.some((row) => row.source_key === source.sourceKey))) {
    return "unavailable";
  }
  if (rows.results.some((row) => row.status === "unavailable")) return "unavailable";
  if (rows.results.some((row) => row.status === "partial")) return "partial";
  if (rows.results.some((row) => row.status === "stale")) return "stale";
  const maximumAge: Record<typeof WEEKLY_REQUIRED_SOURCES[number]["dataset"], number> = {
    schedule: engineOperatingContract.maximumSourceAgeSeconds.schedule,
    play_by_play: engineOperatingContract.maximumSourceAgeSeconds.current_season_play_by_play,
    roster: engineOperatingContract.maximumSourceAgeSeconds.weekly_roster,
    injury: engineOperatingContract.maximumSourceAgeSeconds.official_injury_report
  };
  if (rows.results.some((row) => !row.last_success_at || !Number.isFinite(Date.parse(row.last_success_at)) ||
    Date.parse(row.last_success_at) > now.getTime() ||
    now.getTime() - Date.parse(row.last_success_at) > maximumAge[row.dataset] * 1000)) return "stale";
  return "current";
}

async function alertUnresolvedKickoff(db: D1Database, gameId: string, createdAt: string): Promise<void> {
  const deduplicationKey = `schedule-kickoff-unresolved:${gameId}`;
  await db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
    alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
  ) VALUES (?, 'schedule_identity_unresolved', ?, 'error', 'open', ?, ?)`)
    .bind(
      stableHash({ contract: "engine-os.schedule-unresolved-alert.v1", deduplicationKey }),
      deduplicationKey,
      createdAt,
      JSON.stringify({ gameId, reason: "missing_game_time" })
    ).run();
}

async function alertMissedOrigin(db: D1Database, originId: string, gameId: string, createdAt: string): Promise<void> {
  const deduplicationKey = `forecast-origin-missed:${originId}`;
  const alertId = stableHash({ contract: "engine-os.missed-origin-alert.v1", deduplicationKey });
  await db.prepare(`INSERT OR IGNORE INTO engine_system_alerts (
    alert_id, alert_type, deduplication_key, severity, state, created_at, payload_json
  ) VALUES (?, 'forecast_origin_missed', ?, 'error', 'open', ?, ?)`)
    .bind(alertId, deduplicationKey, createdAt, JSON.stringify({ originId, gameId }))
    .run();
}

export async function runEngineOsUrgentAutomation(input: {
  db: D1Database;
  evidenceBucket?: R2Bucket;
  now?: Date;
  owner?: string;
}): Promise<EngineOsAutomationResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const schedule = await input.db.prepare(`SELECT game_id, season, season_type, week,
      game_date, game_time, away_team, home_team, source_row_hash
    FROM nfl_games
    WHERE season = 2026 AND season_type = 'REG'
    ORDER BY week, game_date, game_time, game_id`).all<ScheduleGameRow>();
  if (!schedule.results.length) {
    return {
      activationId: null,
      seededOrigins: 0,
      dueOrigins: 0,
      withheld: 0,
      late: 0,
      skipped: 0,
      unresolvedGames: 0,
      reconciledOriginVersions: 0,
      status: "waiting_for_schedule"
    };
  }

  const scheduleEvidence = await input.db.prepare(`SELECT s.source_hash, h.latest_capture_id,
      m.response_sha256
    FROM nflverse_import_state s
    LEFT JOIN source_capture_heartbeats h ON h.source_key = 'nflverse:schedule'
    LEFT JOIN source_capture_manifests m ON m.capture_id = h.latest_capture_id
    WHERE s.dataset = 'schedules:live' LIMIT 1`).first<{
      source_hash: string | null;
      latest_capture_id: string | null;
      response_sha256: string | null;
    }>();
  if (!scheduleEvidence?.source_hash || !scheduleEvidence.latest_capture_id ||
    scheduleEvidence.response_sha256 !== scheduleEvidence.source_hash) {
    throw new Error("Canonical schedule reconciliation requires immutable schedule evidence");
  }
  const resolvedSchedule: Array<{ game: ScheduleGameRow; kickoffUtc: string }> = [];
  for (const game of schedule.results) {
    const kickoffUtc = kickoffFor(game);
    if (kickoffUtc) resolvedSchedule.push({ game, kickoffUtc });
    else await alertUnresolvedKickoff(input.db, game.game_id, nowIso);
  }
  const unresolvedGames = schedule.results.length - resolvedSchedule.length;
  let reconciledOriginVersions = 0;
  for (const game of schedule.results.filter((row) => kickoffFor(row) === null)) {
    const reconciled = await reconcileCanonicalGameSchedule({
      db: input.db,
      gameId: game.game_id,
      season: game.season,
      seasonType: game.season_type,
      week: game.week,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      provider: "nflverse",
      providerGameId: game.game_id,
      scheduleStatus: "kickoff_unresolved",
      kickoffUtc: null,
      observedAt: nowIso,
      activatedAt: nowIso,
      activationBoundary: `engine-os.identity-only:${engineOsContractHashes.operating}`,
      sourceCaptureId: scheduleEvidence.latest_capture_id,
      sourceEvidenceHash: scheduleEvidence.source_hash,
      sourceRowHash: game.source_row_hash
    });
    reconciledOriginVersions += reconciled.originVersions.length;
  }
  if (!resolvedSchedule.length) {
    return {
      activationId: null,
      seededOrigins: 0,
      dueOrigins: 0,
      withheld: 0,
      late: 0,
      skipped: 0,
      unresolvedGames,
      reconciledOriginVersions,
      status: "waiting_for_schedule"
    };
  }

  const firstOriginUtc = resolvedSchedule
    .map(({ game, kickoffUtc }) => requiredForecastOriginsForSchedule({
      gameId: game.game_id,
      week: game.week,
      kickoffUtc,
      observedAt: nowIso,
      activatedAt: nowIso
    }).find((origin) => origin.horizonId === "weekly_tuesday_0730")!.scheduledForUtc)
    .sort()[0]!;
  const activation = await activateForecastLedger({
    db: input.db,
    activatedAt: nowIso,
    firstOriginUtc
  });

  let seededOrigins = 0;
  for (const { game, kickoffUtc } of resolvedSchedule) {
    const reconciled = await reconcileCanonicalGameSchedule({
      db: input.db,
      gameId: game.game_id,
      season: game.season,
      seasonType: game.season_type,
      week: game.week,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      provider: "nflverse",
      providerGameId: game.game_id,
      scheduleStatus: "scheduled",
      kickoffUtc,
      observedAt: nowIso,
      activatedAt: activation.activatedAt,
      activationBoundary: activation.activationBoundary,
      sourceCaptureId: scheduleEvidence.latest_capture_id,
      sourceEvidenceHash: scheduleEvidence.source_hash,
      sourceRowHash: game.source_row_hash
    });
    reconciledOriginVersions += reconciled.originVersions.length;
    await seedCanonicalGameOrigin({
      gameId: game.game_id,
      season: game.season,
      seasonType: game.season_type,
      week: game.week,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      kickoffUtc,
      observedAt: nowIso,
      provider: "nflverse",
      providerGameId: game.game_id,
      activationBoundary: activation.activationBoundary,
      activatedAt: activation.activatedAt
    }, input.db);
    seededOrigins += 1;
  }

  const due = await input.db.prepare(`SELECT o.origin_id, o.game_id, o.origin_kind,
      o.scheduled_for_utc, o.scheduled_for_local, k.kickoff_utc, o.eligible
    FROM forecast_origins o
    JOIN game_kickoff_revisions k ON k.revision_id = (
      SELECT revision_id FROM game_kickoff_revisions latest
      WHERE latest.game_id = o.game_id
      ORDER BY latest.observed_at DESC, latest.revision_id DESC LIMIT 1
    )
    WHERE o.eligible = 1 AND o.scheduled_for_utc >= ? AND o.scheduled_for_utc <= ?
      AND NOT EXISTS (
        SELECT 1 FROM forecast_origin_records r WHERE r.origin_id = o.origin_id
      )
    ORDER BY o.scheduled_for_utc, o.game_id`)
    .bind(activation.activatedAt, nowIso).all<DueOriginRow>();
  const health = await captureHealth(input.db, now);
  let withheld = 0;
  let late = 0;
  let skipped = 0;
  const grace = engineOperatingContract.clock.scheduledJobGraceSeconds;
  for (const row of due.results) {
    const lease = await acquireEngineJobLease({
      db: input.db,
      job: "forecast_or_withholding",
      scheduledFor: row.scheduled_for_utc,
      owner: input.owner ?? "cloudflare-scheduler",
      now: nowIso,
      leaseSeconds: grace,
      gameId: row.game_id,
      originId: row.origin_id
    });
    if (!lease.acquired) {
      skipped += 1;
      continue;
    }
    const origin: ForecastOriginIdentity = {
      originId: row.origin_id,
      gameId: row.game_id,
      kind: row.origin_kind,
      scheduledForUtc: row.scheduled_for_utc,
      scheduledForLocal: row.scheduled_for_local,
      kickoffUtc: row.kickoff_utc,
      timeZone: "America/Los_Angeles",
      eligible: row.eligible === 1
    };
    try {
      const record = await recordForecastOrWithholding({
        db: input.db,
        bucket: input.evidenceBucket,
        origin,
        requestedStatus: "withheld",
        withholdingReason: "no_eligible_package",
        generatedAt: nowIso,
        recordedAt: nowIso,
        captureHealth: health,
        activationBoundary: activation.activationBoundary,
        evidenceScope: activation.evidenceScope,
        originGraceSeconds: grace
      });
      if (record.timing === "late") late += 1;
      else withheld += 1;
      if (record.timing === "late") {
        await alertMissedOrigin(input.db, row.origin_id, row.game_id, nowIso);
      }
      await finishEngineJob({
        db: input.db,
        jobKey: lease.jobKey,
        owner: input.owner ?? "cloudflare-scheduler",
        completedAt: nowIso,
        state: record.timing === "late" ? "late" : "succeeded",
        failureCode: record.withholdingReason
      });
    } catch (error) {
      await finishEngineJob({
        db: input.db,
        jobKey: lease.jobKey,
        owner: input.owner ?? "cloudflare-scheduler",
        completedAt: nowIso,
        state: "failed",
        failureCode: error instanceof Error ? "compute_failure" : "compute_failure"
      });
      throw error;
    }
  }
  return {
    activationId: activation.activationId,
    seededOrigins,
    reconciledOriginVersions,
    dueOrigins: due.results.length,
    withheld,
    late,
    skipped,
    unresolvedGames,
    status: "active"
  };
}
