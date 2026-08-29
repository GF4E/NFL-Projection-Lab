import { nflSeasonForDate } from "@/server/nflverse/automation";
import { weeklySlate } from "@/server/weekly-slate";
import { parseOfficialNflInjuryHtml } from "./parser";
import {
  acquireOfficialInjuryLease,
  completeOfficialInjuryUnchanged,
  ensureOfficialInjuryStore,
  failOfficialInjuryImport,
  getOfficialInjuryImportState,
  publishOfficialInjuryReport
} from "./store";
import { redactHttpRequest } from "@/domain/engine-os";
import { recordCaptureFailure, storeRawCapture } from "@/server/engine-os/capture";

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

function captureFailureCode(error: unknown): "provider_unavailable" | "schema_invalid" | "storage_failure" {
  const message = error instanceof Error ? error.message : String(error);
  if (/evidence|r2|storage|capture|durably|object|sidecar/i.test(message)) return "storage_failure";
  if (/empty|parse|schema|complete|team/i.test(message)) return "schema_invalid";
  return "provider_unavailable";
}

export async function runOfficialInjuryAutomation(input: {
  db: D1Database;
  now?: Date;
  fetcher?: typeof fetch;
  force?: boolean;
  evidenceBucket?: R2Bucket;
}): Promise<OfficialInjuryAutomationResult> {
  const now = input.now ?? new Date();
  await ensureOfficialInjuryStore(input.db);
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
    if (!input.evidenceBucket) throw new Error("Immutable evidence storage is unavailable for official injuries");
    const requestHeaders = { accept: "text/html,application/xhtml+xml" };
    const response = await (input.fetcher ?? fetch)(url, {
      cache: "no-store",
      headers: requestHeaders
    });
    if (!response.ok) throw new Error(`Official NFL injury import failed with HTTP ${response.status}`);
    const tag = response.headers.get("etag") ?? response.headers.get("last-modified");
    const rawBytes = new Uint8Array(await response.arrayBuffer());
    const receivedAt = new Date().toISOString();
    const html = new TextDecoder().decode(rawBytes);
    if (!html.trim()) throw new Error("Official NFL injury import returned an empty page");
    await storeRawCapture({
      db: input.db,
      bucket: input.evidenceBucket,
      idempotencyKey: `official-injuries:${season}:reg${week}:${checkedAt}`,
      provider: "official-nfl",
      dataset: "injury",
      request: redactHttpRequest({ url, headers: requestHeaders }),
      responseBytes: rawBytes,
      contentType: response.headers.get("content-type"),
      etag: response.headers.get("etag"),
      providerPublishedAt: sourceTimestamp(response, new Date(receivedAt)),
      receivedAt,
      validFrom: receivedAt,
      sourceSchemaVersion: "official-nfl.injury-html.v1",
      licenseId: "official-nfl-public-page-terms"
    });
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
      sourceTimestamp: sourceTimestamp(response, new Date(receivedAt)),
      importedAt: checkedAt
    });
    return { dataset, season, week, status: "updated", rows: report.injuries.length, message: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown official NFL injury import failure";
    await recordCaptureFailure({
      db: input.db,
      provider: "official-nfl",
      dataset: "injury",
      attemptedAt: new Date().toISOString(),
      failureCode: captureFailureCode(error),
      idempotencyKey: `official-injuries:${season}:reg${week}:${checkedAt}`
    });
    await failOfficialInjuryImport({ db: input.db, dataset, failedAt: checkedAt, message });
    return { dataset, season, week, status: "unavailable", rows: state?.rowCount ?? 0, message };
  }
}
