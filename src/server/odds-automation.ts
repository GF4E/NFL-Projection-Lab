import {
  deterministicRecoveryCandidate,
  inspectMainlineCompleteness,
  latestExpectedMainlineCandidate,
  scheduledMainlineCandidates,
  scheduledPropCandidates,
  scheduledSeasonQuotaPlanHash,
  type MainlineValidationResult,
  type OddsAutomationJob,
  type ScheduledGame,
  type ScheduledOddsCandidate
} from "@/domain/odds-schedule";
import {
  plannedOddsFutureReserveCredits,
  plannedOddsThrottleReason
} from "@/domain/odds-credit-plan";
import {
  oddsQuotaRequestClass,
  type OddsQuotaRequestClass
} from "@/domain/odds-quota-budget";
import type { WeeklyMatchup, WeeklySlate } from "@/domain/weekly-slate";
import { listLiveLines, replaceLiveLines } from "./live-line-store";
import {
  getOddsQuotaState,
  listOutstandingOddsQuotaReservations,
  markOddsQuotaChargeUnknown,
  markOddsQuotaDispatched,
  releaseOddsQuotaBeforeDispatch,
  reserveOddsQuota,
  settleOddsQuotaReservation
} from "./odds-quota";
import {
  fetchLiveOddsForSlate,
  fetchRawLiveOddsResponse,
  normalizeLiveOddsForSlate
} from "./week-one-live-odds";
import { seasonSchedule, weeklySlate } from "./weekly-slate";
import { recordCaptureFailure, storeRawCapture } from "./engine-os/capture";
import { getPlayerPropAvailability } from "./player-props";
import { assertD1SchemaAuthority } from "@/server/schema-authority";

const MAINLINE_COST = 3;

export interface OddsAutomationRunRow {
  snapshot_key: string;
  job: OddsAutomationJob;
  scheduled_for: string;
  game_id: string | null;
  status: "running" | "succeeded" | "failed" | "skipped";
  started_at: string;
  completed_at: string | null;
  message: string | null;
  quota_used: number | null;
}

export interface OddsAutomationSummary {
  checkedAt: string;
  due: number;
  completed: number;
  failed: number;
  skipped: number;
  results: Array<{ key: string; status: OddsAutomationRunRow["status"]; message: string }>;
}

export interface MainlineRecoveryStatus {
  stale: boolean;
  expectedSnapshotKey: string | null;
  expectedJob: OddsAutomationJob | null;
  runStatus: OddsAutomationRunRow["status"] | null;
}



async function ensureStore(db: D1Database): Promise<void> {
  await assertD1SchemaAuthority(db);
}

export function inspectSlateMainlineCompleteness(
  lines: Awaited<ReturnType<typeof fetchLiveOddsForSlate>>["lines"],
  matchups: readonly Pick<WeeklyMatchup, "id">[]
): MainlineValidationResult {
  return inspectMainlineCompleteness(lines, matchups.map((game) => game.id));
}

export function publishableCompleteGameLines(
  lines: Awaited<ReturnType<typeof fetchLiveOddsForSlate>>["lines"],
  matchups: readonly Pick<WeeklyMatchup, "id">[]
) {
  const validation = inspectSlateMainlineCompleteness(lines, matchups);
  const completeGameIds = new Set(validation.completeGameIds);
  return {
    validation,
    lines: lines.filter((line) => completeGameIds.has(line.gameId))
  };
}

export async function refreshCompleteSlateMainlines(input: {
  apiKey: string;
  matchups: readonly WeeklyMatchup[];
  db: D1Database;
  fetcher?: typeof fetch;
  snapshotKey: string;
  fetchedAt?: string;
  requestClass: OddsQuotaRequestClass;
  futureReserveCredits: number;
  quotaPlanHash: string;
  evidenceBucket: R2Bucket;
}) {
  const db = input.db;
  const attemptedAt = input.fetchedAt ?? new Date().toISOString();
  let reservation: Awaited<ReturnType<typeof reserveOddsQuota>>;
  try {
    reservation = await reserveOddsQuota({
      requestKey: input.snapshotKey,
      requestClass: input.requestClass,
      reservedCost: MAINLINE_COST,
      futureReserve: input.futureReserveCredits,
      quotaPlanHash: input.quotaPlanHash,
      now: attemptedAt
    }, db);
  } catch (error) {
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt,
      failureCode: "quota_blocked",
      idempotencyKey: input.snapshotKey
    });
    throw error;
  }
  if (!reservation.acquired) {
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt,
      failureCode: "quota_blocked",
      idempotencyKey: input.snapshotKey
    });
    throw new Error("Duplicate Odds API request blocked before provider dispatch");
  }

  const dispatchToken = reservation.dispatchToken;
  let transport: Awaited<ReturnType<typeof fetchRawLiveOddsResponse>>;
  try {
    await markOddsQuotaDispatched({
      requestKey: input.snapshotKey,
      dispatchToken,
      dispatchedAt: attemptedAt
    }, db);
  } catch (error) {
    let releaseError: unknown;
    try {
      await releaseOddsQuotaBeforeDispatch({
        requestKey: input.snapshotKey,
        dispatchToken,
        releasedAt: attemptedAt
      }, db);
    } catch (caught) {
      releaseError = caught;
    }
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt,
      failureCode: "quota_blocked",
      idempotencyKey: input.snapshotKey
    });
    if (releaseError) {
      throw new AggregateError([error, releaseError], "Quota dispatch failed before the provider call and release was inconclusive");
    }
    throw error;
  }
  try {
    transport = await fetchRawLiveOddsResponse(input.apiKey, input.fetcher ?? fetch);
  } catch (error) {
    let transitionError: unknown;
    try {
      await markOddsQuotaChargeUnknown({
        requestKey: input.snapshotKey,
        dispatchToken,
        markedAt: new Date().toISOString()
      }, db);
    } catch (caught) {
      transitionError = caught;
    }
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt,
      failureCode: "provider_unavailable",
      idempotencyKey: input.snapshotKey
    });
    if (transitionError) {
      throw new AggregateError(
        [error, transitionError],
        "Provider dispatch failed and its quota charge could not be marked unknown"
      );
    }
    throw error;
  }
  const receivedAt = transport.receivedAt;
  const quotaHeaders = transport.quota.used !== null &&
    transport.quota.remaining !== null &&
    transport.quota.lastCost !== null
    ? {
        used: transport.quota.used,
        remaining: transport.quota.remaining,
        lastCost: transport.quota.lastCost
      }
    : null;
  const reconcileQuota = async (responseCaptureId: string | null): Promise<boolean> => {
    if (!quotaHeaders) {
      await markOddsQuotaChargeUnknown({
        requestKey: input.snapshotKey,
        dispatchToken,
        markedAt: receivedAt
      }, db);
      return false;
    }
    try {
      await settleOddsQuotaReservation({
        requestKey: input.snapshotKey,
        dispatchToken,
        ...quotaHeaders,
        updatedAt: receivedAt,
        responseCaptureId
      }, db);
    } catch (error) {
      let transitionError: unknown;
      try {
        await markOddsQuotaChargeUnknown({
          requestKey: input.snapshotKey,
          dispatchToken,
          markedAt: receivedAt
        }, db);
      } catch (caught) {
        const unresolved = (await listOutstandingOddsQuotaReservations(db))
          .find((item) => item.requestKey === input.snapshotKey);
        if (unresolved?.state === "dispatched") transitionError = caught;
      }
      if (transitionError) {
        throw new AggregateError([error, transitionError], "Quota headers were invalid and the dispatched charge could not be marked unknown");
      }
      throw error;
    }
    return true;
  };
  let responseCaptureId: string | null = null;
  try {
    const capture = await storeRawCapture({
      db,
      bucket: input.evidenceBucket,
      idempotencyKey: input.snapshotKey,
      provider: "the-odds-api",
      dataset: "odds",
      request: transport.request,
      responseBytes: transport.rawBytes,
      contentType: transport.contentType,
      etag: transport.etag,
      receivedAt,
      validFrom: receivedAt,
      sourceSchemaVersion: "the-odds-api.nfl-mainlines.v4",
      licenseId: "the-odds-api-account-terms"
    });
    responseCaptureId = capture.manifest.captureId;
  } catch (error) {
    let reconciliationError: unknown;
    try {
      await reconcileQuota(null);
    } catch (caught) {
      reconciliationError = caught;
    }
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt: receivedAt,
      failureCode: "storage_failure",
      idempotencyKey: input.snapshotKey
    });
    if (reconciliationError) {
      throw new AggregateError([error, reconciliationError], "Raw response storage and quota reconciliation both failed");
    }
    throw error;
  }
  if (!quotaHeaders) {
    let reconciliationError: unknown;
    try {
      await reconcileQuota(responseCaptureId);
    } catch (caught) {
      reconciliationError = caught;
    }
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt: receivedAt,
      failureCode: "schema_invalid",
      idempotencyKey: input.snapshotKey
    });
    if (reconciliationError) {
      throw new AggregateError(
        [new Error("Live line provider returned invalid quota headers"), reconciliationError],
        "Raw response was preserved but the ambiguous quota charge could not be recorded"
      );
    }
    throw new Error("Live line provider returned invalid quota headers; raw response preserved and publication blocked");
  }
  try {
    await reconcileQuota(responseCaptureId);
  } catch (error) {
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt: receivedAt,
      failureCode: "schema_invalid",
      idempotencyKey: input.snapshotKey
    });
    throw error;
  }
  if (transport.status < 200 || transport.status >= 300) {
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt: receivedAt,
      failureCode: "provider_unavailable",
      idempotencyKey: input.snapshotKey
    });
    throw new Error(`Live line refresh failed with HTTP ${transport.status}`);
  }
  let normalized: ReturnType<typeof normalizeLiveOddsForSlate>;
  try {
    normalized = normalizeLiveOddsForSlate(transport, input.matchups);
  } catch (error) {
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt: receivedAt,
      failureCode: "schema_invalid",
      idempotencyKey: input.snapshotKey
    });
    throw error;
  }
  const result = { ...normalized, ...quotaHeaders };
  const publishable = publishableCompleteGameLines(result.lines, input.matchups);
  if (!publishable.validation.complete) {
    await recordCaptureFailure({
      db,
      provider: "the-odds-api",
      dataset: "odds",
      attemptedAt: receivedAt,
      failureCode: "partial_import",
      idempotencyKey: input.snapshotKey
    });
    throw new Error("Provider board is partial; all last-good prices were preserved");
  }
  const lines = await replaceLiveLines(publishable.lines, { db, snapshotKey: input.snapshotKey, fetchedAt: receivedAt });
  return {
    lines,
    validation: publishable.validation,
    quota: { used: result.used, remaining: result.remaining, lastCost: result.lastCost }
  };
}

function asScheduledGames(matchups: readonly WeeklyMatchup[]): ScheduledGame[] {
  return matchups.map((game) => ({
    id: game.sourceGameId ?? game.id,
    week: game.week,
    away: game.away,
    home: game.home,
    kickoffAt: game.kickoffAt
  }));
}

async function targetSlateForCandidate(db: D1Database, now: Date, job: OddsAutomationJob): Promise<WeeklySlate> {
  const current = await weeklySlate({ db, now });
  if (job !== "open_sunday" && job !== "open_monday") return current;
  const firstKickoff = Math.min(...current.games.map((game) => Date.parse(game.kickoffAt)));
  if (now.getTime() < firstKickoff || current.week >= 18) return current;
  try {
    return await weeklySlate({ db, season: current.season, week: current.week + 1, now });
  } catch {
    return current;
  }
}

async function acquireRun(db: D1Database, candidate: ScheduledOddsCandidate, startedAt: string): Promise<boolean> {
  const result = await db.prepare(`INSERT OR IGNORE INTO odds_automation_runs (
      snapshot_key, job, scheduled_for, game_id, status, started_at
    ) VALUES (?, ?, ?, ?, 'running', ?)`)
    .bind(candidate.key, candidate.job, candidate.scheduledFor, candidate.gameId, startedAt).run();
  return Number(result.meta.changes ?? 0) > 0;
}

async function finishRun(db: D1Database, key: string, status: OddsAutomationRunRow["status"], message: string): Promise<void> {
  const quota = await getOddsQuotaState(db);
  await db.prepare(`UPDATE odds_automation_runs SET status = ?, completed_at = ?, message = ?, quota_used = ?
    WHERE snapshot_key = ?`).bind(status, new Date().toISOString(), message, quota?.used ?? null, key).run();
}

export async function runScheduledOddsAutomation(input: {
  db: D1Database;
  apiKey: string | undefined;
  now?: Date;
  fetcher?: typeof fetch;
  allowCatchup?: boolean;
  evidenceBucket?: R2Bucket;
}): Promise<OddsAutomationSummary> {
  const db = input.db;
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  await ensureStore(db);
  const schedule = asScheduledGames(await seasonSchedule({ db }));
  const quotaPlanHash = scheduledSeasonQuotaPlanHash(schedule);
  const due = [...scheduledMainlineCandidates(now, schedule), ...scheduledPropCandidates(now, schedule)];
  if (input.allowCatchup && !due.some((candidate) => candidate.job !== "props_minus_60")) {
    const catchup = latestExpectedMainlineCandidate(now, schedule);
    if (catchup && !due.some((candidate) => candidate.key === catchup.key)) {
      const existing = await db.prepare("SELECT status FROM odds_automation_runs WHERE snapshot_key = ? LIMIT 1")
        .bind(catchup.key).first<Pick<OddsAutomationRunRow, "status">>();
      const recovery = deterministicRecoveryCandidate(catchup, existing?.status ?? null);
      // Only a never-started canonical request may be repaired. Failed or
      // ambiguous provider calls are not assigned an unbudgeted retry key.
      if (recovery) due.push(recovery);
    }
  }
  due.sort((left, right) => left.priority - right.priority);
  const summary: OddsAutomationSummary = { checkedAt, due: due.length, completed: 0, failed: 0, skipped: 0, results: [] };
  for (const candidate of due) {
    if (candidate.job === "props_minus_60" && candidate.gameId) {
      const availability = await getPlayerPropAvailability(candidate.gameId, db);
      if (!availability.confirmed) {
        const message = "Waiting for confirmed official inactives before considering prop capture";
        summary.skipped += 1;
        summary.results.push({ key: candidate.key, status: "skipped", message });
        continue;
      }
    }
    if (!await acquireRun(db, candidate, checkedAt)) continue;
    const quota = await getOddsQuotaState(db);
    const throttleReason = plannedOddsThrottleReason(candidate, schedule, quota?.used ?? 0);
    if (!input.apiKey || !input.evidenceBucket || throttleReason) {
      const message = !input.apiKey
        ? "Private Odds API key is unavailable"
        : !input.evidenceBucket
          ? "Immutable evidence storage is unavailable; provider call blocked"
          : throttleReason!;
      await recordCaptureFailure({
        db,
        provider: "the-odds-api",
        dataset: "odds",
        attemptedAt: new Date().toISOString(),
        failureCode: throttleReason ? "quota_blocked" : !input.evidenceBucket ? "storage_failure" : "provider_unavailable",
        idempotencyKey: candidate.key
      });
      await finishRun(db, candidate.key, "skipped", message);
      summary.skipped += 1;
      summary.results.push({ key: candidate.key, status: "skipped", message });
      continue;
    }
    try {
      if (candidate.job === "props_minus_60") {
        // Props remain disabled in the urgent lane until their exact-response
        // capture is wired under OS-03. Never spend quota on uncaptured evidence.
        const message = "Player-prop capture is not yet qualified for immutable evidence storage";
        await finishRun(db, candidate.key, "skipped", message);
        summary.skipped += 1;
        summary.results.push({ key: candidate.key, status: "skipped", message });
        continue;
      }
      {
        const target = await targetSlateForCandidate(db, now, candidate.job);
        const activeGames = target.games.filter((game) => Date.parse(game.kickoffAt) > now.getTime());
        if (!activeGames.length) {
          const message = "No unstarted games remain in the target slate";
          await finishRun(db, candidate.key, "skipped", message);
          summary.skipped += 1;
          summary.results.push({ key: candidate.key, status: "skipped", message });
          continue;
        }
        const refreshed = await refreshCompleteSlateMainlines({
          apiKey: input.apiKey,
          matchups: activeGames,
          db,
          fetcher: input.fetcher,
          snapshotKey: candidate.key,
          evidenceBucket: input.evidenceBucket,
          requestClass: oddsQuotaRequestClass(candidate.job),
          futureReserveCredits: plannedOddsFutureReserveCredits(candidate, schedule),
          quotaPlanHash
        });
        const missing = refreshed.validation.missingGameIds;
        const message = `${refreshed.lines.length} complete mainline quotes published for ${refreshed.validation.completeGames}/${refreshed.validation.totalGames} games${missing.length ? `; last good prices preserved for ${missing.join(", ")}` : ""}`;
        await finishRun(db, candidate.key, "succeeded", message);
        summary.completed += 1;
        summary.results.push({ key: candidate.key, status: "succeeded", message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduled odds refresh failed";
      await finishRun(db, candidate.key, "failed", message);
      summary.failed += 1;
      summary.results.push({ key: candidate.key, status: "failed", message });
    }
  }
  return summary;
}

export async function getMainlineRecoveryStatus(input: {
  db: D1Database;
  now?: Date;
  lineCount: number;
}): Promise<MainlineRecoveryStatus> {
  const db = input.db;
  const now = input.now ?? new Date();
  const expected = latestExpectedMainlineCandidate(now, asScheduledGames(await seasonSchedule({ db })));
  if (!expected) {
    return {
      stale: input.lineCount === 0,
      expectedSnapshotKey: null,
      expectedJob: null,
      runStatus: null
    };
  }
  const recoveryKey = `${expected.key}:recovery-v2`;
  const rows = await db.prepare(`SELECT snapshot_key, status FROM odds_automation_runs
    WHERE snapshot_key IN (?, ?)`)
    .bind(expected.key, recoveryKey).all<Pick<OddsAutomationRunRow, "snapshot_key" | "status">>();
  const recoveryRow = rows.results.find((row) => row.snapshot_key === recoveryKey);
  const originalRow = rows.results.find((row) => row.snapshot_key === expected.key);
  const succeeded = recoveryRow?.status === "succeeded" ? recoveryRow :
    originalRow?.status === "succeeded" ? originalRow : undefined;
  const latest = recoveryRow ?? originalRow;
  return {
    stale: input.lineCount === 0 || !succeeded,
    expectedSnapshotKey: succeeded?.snapshot_key ?? expected.key,
    expectedJob: expected.job,
    runStatus: succeeded?.status ?? latest?.status ?? null
  };
}

export async function listOddsAutomationRuns(db: D1Database): Promise<OddsAutomationRunRow[]> {
  const result = await db.prepare("SELECT * FROM odds_automation_runs ORDER BY scheduled_for DESC LIMIT 100").all<OddsAutomationRunRow>();
  return result.results;
}

export async function currentAutomatedLines(db: D1Database) {
  const slate = await weeklySlate({ db });
  return listLiveLines(db, slate.games.map((game) => game.id));
}
