import { weekOneKickoffs, weekOneMatchups } from "@/lib/week-one-data";
import {
  inspectMainlineCompleteness,
  scheduledMainlineCandidates as scheduledMainlineCandidatesForGames,
  scheduledPropCandidates as scheduledPropCandidatesForGames,
  type MainlineValidationResult,
  type OddsAutomationJob,
  type ScheduledGame,
  type ScheduledOddsCandidate
} from "@/domain/odds-schedule";
import { getD1 } from "../../db";
import { listLiveLines, replaceLiveLines } from "./live-line-store";
import {
  assertOddsCreditsAvailable,
  getOddsQuotaState,
  ODDS_CREDIT_ALERT,
  recordOddsQuota
} from "./odds-quota";
import { refreshPlayerPropBoard } from "./player-props";
import { fetchWeekOneLiveOdds } from "./week-one-live-odds";

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

const scheduledGames: ScheduledGame[] = weekOneMatchups.map((game) => ({
  id: game.id,
  away: game.away,
  home: game.home,
  kickoffAt: weekOneKickoffs[game.id]
}));

export function scheduledMainlineCandidates(now: Date): ScheduledOddsCandidate[] {
  return scheduledMainlineCandidatesForGames(now, scheduledGames);
}

export function scheduledPropCandidates(now: Date, trackedGameIds: ReadonlySet<string>): ScheduledOddsCandidate[] {
  return scheduledPropCandidatesForGames(now, scheduledGames, trackedGameIds);
}

export function inspectWeekOneMainlineCompleteness(lines: Awaited<ReturnType<typeof fetchWeekOneLiveOdds>>["lines"]): MainlineValidationResult {
  return inspectMainlineCompleteness(lines, weekOneMatchups.map((game) => game.id));
}

export function validateCompleteWeekOneMainlines(lines: Awaited<ReturnType<typeof fetchWeekOneLiveOdds>>["lines"]): void {
  const result = inspectWeekOneMainlineCompleteness(lines);
  if (!result.complete) throw new Error(`Provider board is partial (${result.completeGames}/${result.totalGames} games have spread, total and moneyline); last good prices preserved`);
}

export async function refreshCompleteWeekOneMainlines(input: {
  apiKey: string;
  db?: D1Database;
  fetcher?: typeof fetch;
  snapshotKey: string;
  fetchedAt?: string;
}) {
  const db = input.db ?? getD1();
  await assertOddsCreditsAvailable(MAINLINE_COST, db);
  const result = await fetchWeekOneLiveOdds(input.apiKey, input.fetcher ?? fetch);
  await recordOddsQuota({ used: result.used, remaining: result.remaining, lastCost: result.lastCost }, db);
  validateCompleteWeekOneMainlines(result.lines);
  return {
    lines: await replaceLiveLines(result.lines, { db, snapshotKey: input.snapshotKey, fetchedAt: input.fetchedAt }),
    quota: { used: result.used, remaining: result.remaining, lastCost: result.lastCost }
  };
}

async function trackedPropGameIds(db: D1Database): Promise<Set<string>> {
  try {
    const result = await db.prepare("SELECT game_id FROM player_prop_scan_state").all<{ game_id: string }>();
    return new Set(result.results.map((row) => row.game_id));
  } catch {
    return new Set();
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

function throttled(candidate: ScheduledOddsCandidate, used: number): string | null {
  if (used >= ODDS_CREDIT_ALERT && (candidate.job === "daily" || candidate.job === "kickoff_minus_120")) {
    return "Skipped by the 400-credit throttle";
  }
  if (used + candidate.cost > 450) return "Skipped to preserve the 50-credit reserve";
  return null;
}

export async function runScheduledOddsAutomation(input: {
  db?: D1Database;
  apiKey: string | undefined;
  now?: Date;
  fetcher?: typeof fetch;
}): Promise<OddsAutomationSummary> {
  const db = input.db ?? getD1();
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  await ensureStore(db);
  const tracked = await trackedPropGameIds(db);
  const due = [...scheduledMainlineCandidates(now), ...scheduledPropCandidates(now, tracked)]
    .sort((left, right) => left.priority - right.priority);
  const summary: OddsAutomationSummary = { checkedAt, due: due.length, completed: 0, failed: 0, skipped: 0, results: [] };
  for (const candidate of due) {
    if (!await acquireRun(db, candidate, checkedAt)) continue;
    const quota = await getOddsQuotaState(db);
    const throttleReason = throttled(candidate, quota?.used ?? 0);
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
        const refreshed = await refreshCompleteWeekOneMainlines({ apiKey: input.apiKey, db, fetcher: input.fetcher, snapshotKey: candidate.key, fetchedAt: checkedAt });
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

export async function listOddsAutomationRuns(db: D1Database = getD1()): Promise<OddsAutomationRunRow[]> {
  await ensureStore(db);
  const result = await db.prepare("SELECT * FROM odds_automation_runs ORDER BY scheduled_for DESC LIMIT 100").all<OddsAutomationRunRow>();
  return result.results;
}

export async function currentAutomatedLines(db: D1Database = getD1()) {
  return listLiveLines(db);
}
