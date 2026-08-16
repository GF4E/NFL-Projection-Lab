import {
  inspectMainlineCompleteness,
  latestExpectedMainlineCandidate,
  scheduledMainlineCandidates,
  scheduledPropCandidates,
  type MainlineValidationResult,
  type OddsAutomationJob,
  type ScheduledGame,
  type ScheduledOddsCandidate
} from "@/domain/odds-schedule";
import { plannedOddsThrottleReason } from "@/domain/odds-credit-plan";
import type { WeeklyMatchup, WeeklySlate } from "@/domain/weekly-slate";
import { getD1 } from "../../db";
import { listLiveLines, replaceLiveLines } from "./live-line-store";
import {
  assertOddsCreditsAvailable,
  getOddsQuotaState,
  recordOddsQuota
} from "./odds-quota";
import { getPlayerPropAvailability, refreshPlayerPropBoard } from "./player-props";
import { fetchLiveOddsForSlate } from "./week-one-live-odds";
import { seasonSchedule, weeklySlate } from "./weekly-slate";

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


const schema = [
  `CREATE TABLE IF NOT EXISTS odds_automation_runs (
    snapshot_key text PRIMARY KEY NOT NULL,
    job text NOT NULL,
    scheduled_for text NOT NULL,
    game_id text,
    status text NOT NULL,
    started_at text NOT NULL,
    completed_at text,
    message text,
    quota_used integer
  )`,
  "CREATE INDEX IF NOT EXISTS idx_odds_runs_schedule ON odds_automation_runs (scheduled_for, status)",
  "CREATE INDEX IF NOT EXISTS idx_odds_runs_game ON odds_automation_runs (game_id, scheduled_for)"
] as const;

async function ensureStore(db: D1Database): Promise<void> {
  await db.batch(schema.map((statement) => db.prepare(statement)));
}

export function inspectSlateMainlineCompleteness(
  lines: Awaited<ReturnType<typeof fetchLiveOddsForSlate>>["lines"],
  matchups: readonly Pick<WeeklyMatchup, "id">[]
): MainlineValidationResult {
  return inspectMainlineCompleteness(lines, matchups.map((game) => game.id));
}

export function validateCompleteSlateMainlines(
  lines: Awaited<ReturnType<typeof fetchLiveOddsForSlate>>["lines"],
  matchups: readonly Pick<WeeklyMatchup, "id">[]
): void {
  const result = inspectSlateMainlineCompleteness(lines, matchups);
  if (!result.complete) throw new Error(`Provider board is partial (${result.completeGames}/${result.totalGames} games have spread, total and moneyline); last good prices preserved`);
}

export async function refreshCompleteSlateMainlines(input: {
  apiKey: string;
  matchups: readonly WeeklyMatchup[];
  db?: D1Database;
  fetcher?: typeof fetch;
  snapshotKey: string;
  fetchedAt?: string;
}) {
  const db = input.db ?? getD1();
  await assertOddsCreditsAvailable(MAINLINE_COST, db);
  const result = await fetchLiveOddsForSlate(input.apiKey, input.matchups, input.fetcher ?? fetch);
  await recordOddsQuota({ used: result.used, remaining: result.remaining, lastCost: result.lastCost }, db);
  validateCompleteSlateMainlines(result.lines, input.matchups);
  const lines = await replaceLiveLines(result.lines, { db, snapshotKey: input.snapshotKey, fetchedAt: input.fetchedAt });
  try {
    const [{ buildDecisionBoard }, { publishEdgeThresholdNotifications }] = await Promise.all([
      import("./decision-board"),
      import("./push/edge-notifications")
    ]);
    const first = input.matchups[0];
    if (first) {
      const board = await buildDecisionBoard(db, { season: first.season, week: first.week });
      await publishEdgeThresholdNotifications({
        db,
        board,
        lines,
        matchups: input.matchups,
        snapshotKey: input.snapshotKey,
        now: input.fetchedAt,
        fetcher: input.fetcher
      });
    }
  } catch {
    // A notification transport failure never rolls back a validated odds snapshot.
    // The delivery remains pending/failed in D1 for the isolated retry pass.
  }
  return {
    lines,
    quota: { used: result.used, remaining: result.remaining, lastCost: result.lastCost }
  };
}

function asScheduledGames(matchups: readonly WeeklyMatchup[]): ScheduledGame[] {
  return matchups.map((game) => ({ id: game.id, away: game.away, home: game.home, kickoffAt: game.kickoffAt }));
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
  db?: D1Database;
  apiKey: string | undefined;
  now?: Date;
  fetcher?: typeof fetch;
  allowCatchup?: boolean;
}): Promise<OddsAutomationSummary> {
  const db = input.db ?? getD1();
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  await ensureStore(db);
  const schedule = asScheduledGames(await seasonSchedule({ db }));
  const due = [...scheduledMainlineCandidates(now, schedule), ...scheduledPropCandidates(now, schedule)];
  if (input.allowCatchup && !due.some((candidate) => candidate.job !== "props_minus_60")) {
    const catchup = latestExpectedMainlineCandidate(now, schedule);
    if (catchup && !due.some((candidate) => candidate.key === catchup.key)) due.push(catchup);
  }
  due.sort((left, right) => left.priority - right.priority);
  const summary: OddsAutomationSummary = { checkedAt, due: due.length, completed: 0, failed: 0, skipped: 0, results: [] };
  for (const candidate of due) {
    if (candidate.job === "props_minus_60" && candidate.gameId) {
      const availability = await getPlayerPropAvailability(candidate.gameId, db);
      if (!availability.confirmed) {
        const message = "Waiting for confirmed official inactives before spending prop credits";
        summary.skipped += 1;
        summary.results.push({ key: candidate.key, status: "skipped", message });
        continue;
      }
    }
    if (!await acquireRun(db, candidate, checkedAt)) continue;
    const quota = await getOddsQuotaState(db);
    const throttleReason = plannedOddsThrottleReason(candidate, schedule, quota?.used ?? 0);
    if (!input.apiKey || throttleReason) {
      const message = !input.apiKey ? "Private Odds API key is unavailable" : throttleReason!;
      await finishRun(db, candidate.key, "skipped", message);
      summary.skipped += 1;
      summary.results.push({ key: candidate.key, status: "skipped", message });
      continue;
    }
    try {
      if (candidate.job === "props_minus_60" && candidate.gameId) {
        const board = await refreshPlayerPropBoard({ gameId: candidate.gameId, apiKey: input.apiKey, db, fetcher: input.fetcher, force: true });
        if (board.status !== "current") throw new Error(board.message);
        const message = `${board.candidates.length} market-confirmed props ready`;
        await finishRun(db, candidate.key, "succeeded", message);
        summary.completed += 1;
        summary.results.push({ key: candidate.key, status: "succeeded", message });
      } else {
        const target = await targetSlateForCandidate(db, now, candidate.job);
        const refreshed = await refreshCompleteSlateMainlines({ apiKey: input.apiKey, matchups: target.games, db, fetcher: input.fetcher, snapshotKey: candidate.key, fetchedAt: checkedAt });
        const message = `${refreshed.lines.length} complete mainline quotes published`;
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
  db?: D1Database;
  now?: Date;
  lineCount: number;
}): Promise<MainlineRecoveryStatus> {
  const db = input.db ?? getD1();
  const now = input.now ?? new Date();
  await ensureStore(db);
  const expected = latestExpectedMainlineCandidate(now, asScheduledGames(await seasonSchedule({ db })));
  if (!expected) {
    return {
      stale: input.lineCount === 0,
      expectedSnapshotKey: null,
      expectedJob: null,
      runStatus: null
    };
  }
  const row = await db.prepare("SELECT status FROM odds_automation_runs WHERE snapshot_key = ? LIMIT 1")
    .bind(expected.key).first<{ status: OddsAutomationRunRow["status"] }>();
  return {
    stale: input.lineCount === 0 || row?.status !== "succeeded",
    expectedSnapshotKey: expected.key,
    expectedJob: expected.job,
    runStatus: row?.status ?? null
  };
}

export async function listOddsAutomationRuns(db: D1Database = getD1()): Promise<OddsAutomationRunRow[]> {
  await ensureStore(db);
  const result = await db.prepare("SELECT * FROM odds_automation_runs ORDER BY scheduled_for DESC LIMIT 100").all<OddsAutomationRunRow>();
  return result.results;
}

export async function currentAutomatedLines(db: D1Database = getD1()) {
  const slate = await weeklySlate({ db });
  return listLiveLines(db, slate.games.map((game) => game.id));
}
