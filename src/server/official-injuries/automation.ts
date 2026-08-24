import { nflSeasonForDate } from "@/server/nflverse/automation";
import { weeklySlate } from "@/server/weekly-slate";
import { parseOfficialNflInjuryHtml } from "./parser";
import {
  acquireOfficialInjuryLease,
  completeOfficialInjuryUnchanged,
  failOfficialInjuryImport,
  getOfficialInjuryImportState,
  publishOfficialInjuryReport
} from "./store";

const REFRESH_INTERVAL_MS = 6 * 60 * 60_000;

export interface OfficialInjuryAutomationResult {
  dataset: string;
  season: number;
  week: number;
  status: "updated" | "unchanged" | "unavailable" | "skipped";
  rows: number;
  message: string | null;
}

function sourceUrl(season: number, week: number): string {
  return `https://www.nfl.com/injuries/league/${season}/reg${week}`;
}

function sourceTimestamp(response: Response, fallback: Date): string {
  const candidate = response.headers.get("last-modified") ?? response.headers.get("date");
  const parsed = candidate ? Date.parse(candidate) : Number.NaN;
  return new Date(Number.isFinite(parsed) ? parsed : fallback.getTime()).toISOString();
}

function elapsed(iso: string | null, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? now.getTime() - value : Number.POSITIVE_INFINITY;
}

export async function runOfficialInjuryAutomation(input: {
  db: D1Database;
  now?: Date;
  fetcher?: typeof fetch;
  force?: boolean;
}): Promise<OfficialInjuryAutomationResult> {
  const now = input.now ?? new Date();
  const season = nflSeasonForDate(now);
  const slate = await weeklySlate({ db: input.db, season, now });
  const week = slate.week;
  const dataset = `official-injuries:${season}:reg${week}`;
  const url = sourceUrl(season, week);
  const state = await getOfficialInjuryImportState(input.db, dataset);
  if (!input.force && elapsed(state?.lastCheckedAt ?? null, now) < REFRESH_INTERVAL_MS) {
    return { dataset, season, week, status: "skipped", rows: state?.rowCount ?? 0, message: state?.lastError ?? null };
  }

  const checkedAt = now.toISOString();
  const acquired = await acquireOfficialInjuryLease({ db: input.db, dataset, sourceUrl: url, checkedAt });
  if (!acquired) return { dataset, season, week, status: "skipped", rows: state?.rowCount ?? 0, message: "Import already running" };

  try {
    const response = await (input.fetcher ?? fetch)(url, {
      cache: "no-store",
      headers: { accept: "text/html,application/xhtml+xml" }
    });
    if (!response.ok) throw new Error(`Official NFL injury import failed with HTTP ${response.status}`);
    const tag = response.headers.get("etag") ?? response.headers.get("last-modified");
    const html = await response.text();
    if (!html.trim()) throw new Error("Official NFL injury import returned an empty page");
    const report = parseOfficialNflInjuryHtml({
      html,
      season,
      week,
      schedule: slate.games.map((game) => ({ gameId: game.id, awayTeam: game.away, homeTeam: game.home }))
    });
    if (state?.sourceHash === report.rawSnapshotHash && state.lastSuccessAt) {
      await completeOfficialInjuryUnchanged({ db: input.db, dataset, checkedAt, sourceTag: tag });
      return { dataset, season, week, status: "unchanged", rows: state.rowCount, message: null };
    }
    await publishOfficialInjuryReport({
      db: input.db,
      dataset,
      report,
      sourceUrl: url,
      sourceTag: tag,
      sourceTimestamp: sourceTimestamp(response, now),
      importedAt: checkedAt
    });
    return { dataset, season, week, status: "updated", rows: report.injuries.length, message: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown official NFL injury import failure";
    await failOfficialInjuryImport({ db: input.db, dataset, failedAt: checkedAt, message });
    return { dataset, season, week, status: "unavailable", rows: state?.rowCount ?? 0, message };
  }
}
