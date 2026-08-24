import { createHash } from "node:crypto";
import { structuralConfig } from "@/domain/config";
import { NFLVERSE_URLS } from "@/server/providers/nflverse";
import {
  acquireImportLease,
  completeUnchangedImport,
  failNflverseImport,
  getNflverseImportState,
  listNflverseImportStates,
  markImportUnavailable,
  publishPlayerSnapCounts,
  publishPlayerWeekStats,
  publishSchedules,
  publishTeamGameFeatures,
  recordImportSuccess
} from "./store";
import { aggregatePbpCsv, parsePlayerStatsCsv, parseScheduleCsv, parseSnapCountsCsv } from "./transform";

const LIVE_SCHEDULE_DATASET = "schedules:live";
const HISTORY_SCHEDULE_DATASET = "schedules:history";
const SCHEDULE_INTERVAL_MS = 5 * 60_000;
const HISTORY_INTERVAL_MS = 6 * 24 * 60 * 60_000;

export interface NflverseAutomationResult {
  currentSeason: number;
  schedules: "updated" | "unchanged" | "skipped";
  scheduleRows: number;
  playByPlay: "updated" | "unchanged" | "unavailable" | "skipped";
  playByPlaySeason: number | null;
  teamGameRows: number;
  playerStats: "updated" | "unchanged" | "unavailable" | "skipped";
  playerStatsSeason: number | null;
  playerStatRows: number;
  snapCounts: "updated" | "unchanged" | "unavailable" | "skipped";
  snapCountsSeason: number | null;
  snapCountRows: number;
}

function pacificParts(date: Date): { year: number; month: number; weekday: string; hour: number; dayKey: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    weekday: parts.weekday,
    hour: Number(parts.hour),
    dayKey: `${parts.year}-${parts.month}-${parts.day}`
  };
}

export function nflSeasonForDate(date: Date): number {
  const { year, month } = pacificParts(date);
  return month < 3 ? year - 1 : year;
}

function elapsed(iso: string | null, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? now.getTime() - timestamp : Number.POSITIVE_INFINITY;
}

function etag(response: Response): string | null {
  return response.headers.get("etag") ?? response.headers.get("last-modified");
}

export function shouldRetryUncompressedPbp(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /compressed|decompress|gzip|trailing bytes/i.test(message);
}

export function nextMissingHistoricalSeason(
  currentSeason: number,
  datasetPrefix: string,
  importedDatasets: ReadonlySet<string>,
  depth = 2
): number | null {
  return Array.from(
    { length: Math.min(depth, currentSeason - structuralConfig.model.trainingStartSeason) },
    (_, index) => currentSeason - 1 - index
  ).find((season) => !importedDatasets.has(`${datasetPrefix}:${season}`)) ?? null;
}

async function aggregatePbpResponse(input: {
  response: Response;
  compressed: boolean;
  season: number;
  currentSeason: number;
}): Promise<{ features: Awaited<ReturnType<typeof aggregatePbpCsv>>; sourceHash: string }> {
  if (!input.response.body) throw new Error(`nflverse play-by-play ${input.season} returned an empty body`);

  const hash = createHash("sha256");
  const hashedBody = input.response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      hash.update(chunk);
      controller.enqueue(chunk);
    }
  }));
  const csvBody = input.compressed
    ? hashedBody.pipeThrough(new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>)
    : hashedBody;
  const features = await aggregatePbpCsv(csvBody, {
    season: input.season,
    currentSeason: input.currentSeason
  });
  return { features, sourceHash: hash.digest("hex") };
}

async function refreshSchedules(input: {
  db: D1Database;
  now: Date;
  currentSeason: number;
  includeHistory: boolean;
  fetcher: typeof fetch;
}): Promise<{ state: "updated" | "unchanged" | "skipped"; rows: number }> {
  const checkedAt = input.now.toISOString();
  const sourceUrl = NFLVERSE_URLS.schedules;
  const liveState = await getNflverseImportState(input.db, LIVE_SCHEDULE_DATASET);
  const acquireLive = elapsed(liveState?.lastCheckedAt ?? null, input.now) >= SCHEDULE_INTERVAL_MS
    && await acquireImportLease({ db: input.db, dataset: LIVE_SCHEDULE_DATASET, sourceUrl, checkedAt });
  const acquireHistory = input.includeHistory
    && await acquireImportLease({ db: input.db, dataset: HISTORY_SCHEDULE_DATASET, sourceUrl, checkedAt });
  if (!acquireLive && !acquireHistory) return { state: "skipped", rows: 0 };

  try {
    const headers = new Headers();
    if (!acquireHistory && liveState?.sourceTag) headers.set("if-none-match", liveState.sourceTag);
    const response = await input.fetcher(sourceUrl, { cache: "no-store", headers });
    if (response.status === 304) {
      if (acquireLive) await completeUnchangedImport({ db: input.db, dataset: LIVE_SCHEDULE_DATASET, checkedAt, sourceTag: liveState?.sourceTag ?? null });
      if (acquireHistory) await completeUnchangedImport({ db: input.db, dataset: HISTORY_SCHEDULE_DATASET, checkedAt, sourceTag: null });
      return { state: "unchanged", rows: liveState?.rowCount ?? 0 };
    }
    if (!response.ok) throw new Error(`nflverse schedules fetch failed with HTTP ${response.status}`);
    const csv = await response.text();
    if (!csv.length) throw new Error("nflverse schedules import returned an empty response");
    const sourceHash = createHash("sha256").update(csv).digest("hex");
    const games = await parseScheduleCsv(csv, {
      trainingStartSeason: structuralConfig.model.trainingStartSeason,
      currentSeason: input.currentSeason
    });
    const sourceTag = etag(response);
    const currentGames = games.filter((game) => game.season === input.currentSeason);
    if (acquireHistory) {
      await publishSchedules({
        db: input.db,
        dataset: HISTORY_SCHEDULE_DATASET,
        games,
        sourceUrl,
        sourceTag,
        sourceHash,
        importedAt: checkedAt
      });
      if (acquireLive) {
        await recordImportSuccess({
          db: input.db,
          dataset: LIVE_SCHEDULE_DATASET,
          sourceUrl,
          sourceTag,
          sourceHash,
          rowCount: currentGames.length,
          importedAt: checkedAt
        });
      }
    } else if (acquireLive) {
      await publishSchedules({
        db: input.db,
        dataset: LIVE_SCHEDULE_DATASET,
        games: currentGames,
        sourceUrl,
        sourceTag,
        sourceHash,
        importedAt: checkedAt
      });
    }
    return { state: "updated", rows: currentGames.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown nflverse schedules failure";
    if (acquireLive) await failNflverseImport({ db: input.db, dataset: LIVE_SCHEDULE_DATASET, failedAt: checkedAt, message });
    if (acquireHistory) await failNflverseImport({ db: input.db, dataset: HISTORY_SCHEDULE_DATASET, failedAt: checkedAt, message });
    throw error;
  }
}

async function refreshPbpSeason(input: {
  db: D1Database;
  season: number;
  currentSeason: number;
  now: Date;
  fetcher: typeof fetch;
}): Promise<{ state: "updated" | "unchanged" | "unavailable" | "skipped"; rows: number }> {
  const dataset = `pbp:${input.season}`;
  const sourceUrl = NFLVERSE_URLS.pbpCsv(input.season);
  const checkedAt = input.now.toISOString();
  const previous = await getNflverseImportState(input.db, dataset);
  const acquired = await acquireImportLease({
    db: input.db,
    dataset,
    sourceUrl,
    checkedAt,
    leaseMilliseconds: 30 * 60_000
  });
  if (!acquired) return { state: "skipped", rows: 0 };

  try {
    const headers = new Headers();
    if (previous?.sourceTag) headers.set("if-none-match", previous.sourceTag);
    const response = await input.fetcher(sourceUrl, { cache: "no-store", headers });
    if (response.status === 304) {
      await completeUnchangedImport({ db: input.db, dataset, checkedAt, sourceTag: previous?.sourceTag ?? null });
      return { state: "unchanged", rows: previous?.rowCount ?? 0 };
    }
    if (response.status === 404 && input.season === input.currentSeason) {
      await markImportUnavailable({
        db: input.db,
        dataset,
        checkedAt,
        message: `Play-by-play for ${input.season} has not been published by nflverse yet`
      });
      return { state: "unavailable", rows: 0 };
    }
    if (!response.ok) throw new Error(`nflverse play-by-play ${input.season} fetch failed with HTTP ${response.status}`);

    let usedResponse = response;
    let usedSourceUrl = sourceUrl;
    let aggregate;
    try {
      aggregate = await aggregatePbpResponse({
        response,
        compressed: true,
        season: input.season,
        currentSeason: input.currentSeason
      });
    } catch (error) {
      if (!shouldRetryUncompressedPbp(error)) throw error;
      usedSourceUrl = NFLVERSE_URLS.pbpCsvPlain(input.season);
      usedResponse = await input.fetcher(usedSourceUrl, { cache: "no-store" });
      if (!usedResponse.ok) {
        throw new Error(`nflverse uncompressed play-by-play ${input.season} fallback failed with HTTP ${usedResponse.status}`);
      }
      aggregate = await aggregatePbpResponse({
        response: usedResponse,
        compressed: false,
        season: input.season,
        currentSeason: input.currentSeason
      });
    }
    await publishTeamGameFeatures({
      db: input.db,
      dataset,
      features: aggregate.features,
      sourceUrl: usedSourceUrl,
      sourceTag: etag(usedResponse),
      sourceHash: aggregate.sourceHash,
      importedAt: checkedAt
    });
    return { state: "updated", rows: aggregate.features.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Unknown nflverse play-by-play ${input.season} failure`;
    await failNflverseImport({ db: input.db, dataset, failedAt: checkedAt, message });
    throw error;
  }
}

async function refreshPlayerStatsSeason(input: {
  db: D1Database;
  season: number;
  currentSeason: number;
  now: Date;
  fetcher: typeof fetch;
}): Promise<{ state: "updated" | "unchanged" | "unavailable" | "skipped"; rows: number }> {
  const dataset = `player_stats:${input.season}`;
  const sourceUrl = NFLVERSE_URLS.playerStatsCsv(input.season);
  const checkedAt = input.now.toISOString();
  const previous = await getNflverseImportState(input.db, dataset);
  const acquired = await acquireImportLease({
    db: input.db,
    dataset,
    sourceUrl,
    checkedAt,
    leaseMilliseconds: 20 * 60_000
  });
  if (!acquired) return { state: "skipped", rows: 0 };
  try {
    const headers = new Headers();
    if (previous?.sourceTag) headers.set("if-none-match", previous.sourceTag);
    const response = await input.fetcher(sourceUrl, { cache: "no-store", headers });
    if (response.status === 304) {
      await completeUnchangedImport({ db: input.db, dataset, checkedAt, sourceTag: previous?.sourceTag ?? null });
      return { state: "unchanged", rows: previous?.rowCount ?? 0 };
    }
    if (response.status === 404 && input.season === input.currentSeason) {
      await markImportUnavailable({
        db: input.db,
        dataset,
        checkedAt,
        message: `Weekly player stats for ${input.season} have not been published by nflverse yet`
      });
      return { state: "unavailable", rows: 0 };
    }
    if (!response.ok) throw new Error(`nflverse player stats ${input.season} fetch failed with HTTP ${response.status}`);
    if (!response.body) throw new Error(`nflverse player stats ${input.season} returned an empty body`);
    const hash = createHash("sha256");
    const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        hash.update(chunk);
        controller.enqueue(chunk);
      }
    }));
    const stats = await parsePlayerStatsCsv(stream, { season: input.season, currentSeason: input.currentSeason });
    await publishPlayerWeekStats({
      db: input.db,
      dataset,
      stats,
      sourceUrl,
      sourceTag: etag(response),
      sourceHash: hash.digest("hex"),
      importedAt: checkedAt
    });
    return { state: "updated", rows: stats.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Unknown nflverse player stats ${input.season} failure`;
    await failNflverseImport({ db: input.db, dataset, failedAt: checkedAt, message });
    throw error;
  }
}

async function refreshSnapCountsSeason(input: {
  db: D1Database;
  season: number;
  currentSeason: number;
  now: Date;
  fetcher: typeof fetch;
}): Promise<{ state: "updated" | "unchanged" | "unavailable" | "skipped"; rows: number }> {
  const dataset = `snap_counts:${input.season}`;
  const sourceUrl = NFLVERSE_URLS.snapCountsCsv(input.season);
  const checkedAt = input.now.toISOString();
  const previous = await getNflverseImportState(input.db, dataset);
  const acquired = await acquireImportLease({ db: input.db, dataset, sourceUrl, checkedAt, leaseMilliseconds: 20 * 60_000 });
  if (!acquired) return { state: "skipped", rows: 0 };
  try {
    const headers = new Headers();
    if (previous?.sourceTag) headers.set("if-none-match", previous.sourceTag);
    const response = await input.fetcher(sourceUrl, { cache: "no-store", headers });
    if (response.status === 304) {
      await completeUnchangedImport({ db: input.db, dataset, checkedAt, sourceTag: previous?.sourceTag ?? null });
      return { state: "unchanged", rows: previous?.rowCount ?? 0 };
    }
    if (response.status === 404 && input.season === input.currentSeason) {
      await markImportUnavailable({ db: input.db, dataset, checkedAt, message: `Snap counts for ${input.season} have not been published by nflverse yet` });
      return { state: "unavailable", rows: 0 };
    }
    if (!response.ok) throw new Error(`nflverse snap counts ${input.season} fetch failed with HTTP ${response.status}`);
    if (!response.body) throw new Error(`nflverse snap counts ${input.season} returned an empty body`);
    const hash = createHash("sha256");
    const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        hash.update(chunk);
        controller.enqueue(chunk);
      }
    }));
    const counts = await parseSnapCountsCsv(stream, { season: input.season, currentSeason: input.currentSeason });
    await publishPlayerSnapCounts({
      db: input.db,
      dataset,
      counts,
      sourceUrl,
      sourceTag: etag(response),
      sourceHash: hash.digest("hex"),
      importedAt: checkedAt
    });
    return { state: "updated", rows: counts.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Unknown nflverse snap counts ${input.season} failure`;
    await failNflverseImport({ db: input.db, dataset, failedAt: checkedAt, message });
    throw error;
  }
}

function checkedToday(lastCheckedAt: string | null, dayKey: string): boolean {
  if (!lastCheckedAt) return false;
  const parsed = new Date(lastCheckedAt);
  return Number.isFinite(parsed.getTime()) && pacificParts(parsed).dayKey === dayKey;
}

export async function runNflverseAutomation(input: {
  db: D1Database;
  now?: Date;
  fetcher?: typeof fetch;
  allowPlayByPlay?: boolean;
}): Promise<NflverseAutomationResult> {
  const now = input.now ?? new Date();
  const fetcher: typeof fetch = input.fetcher
    ? (request, init) => input.fetcher!(request, init)
    : (request, init) => fetch(request, init);
  const currentSeason = nflSeasonForDate(now);
  const parts = pacificParts(now);
  const historyState = await getNflverseImportState(input.db, HISTORY_SCHEDULE_DATASET);
  const includeHistory = !historyState?.lastSuccessAt
    || (parts.weekday === "Tue" && parts.hour >= 6 && elapsed(historyState.lastSuccessAt, now) >= HISTORY_INTERVAL_MS);
  const schedules = await refreshSchedules({ db: input.db, now, currentSeason, includeHistory, fetcher });

  let playByPlay: NflverseAutomationResult["playByPlay"] = "skipped";
  let playByPlaySeason: number | null = null;
  let teamGameRows = 0;
  let playerStats: NflverseAutomationResult["playerStats"] = "skipped";
  let playerStatsSeason: number | null = null;
  let playerStatRows = 0;
  let snapCounts: NflverseAutomationResult["snapCounts"] = "skipped";
  let snapCountsSeason: number | null = null;
  let snapCountRows = 0;
  const nightlyPbpIsDue = parts.hour >= 1;
  if ((input.allowPlayByPlay ?? true) && nightlyPbpIsDue) {
    const currentState = await getNflverseImportState(input.db, `pbp:${currentSeason}`);
    if (!checkedToday(currentState?.lastCheckedAt ?? null, parts.dayKey)) {
      const current = await refreshPbpSeason({ db: input.db, season: currentSeason, currentSeason, now, fetcher });
      playByPlay = current.state;
      playByPlaySeason = currentSeason;
      teamGameRows = current.rows;
    }

    const states = await listNflverseImportStates(input.db);
    const imported = new Set(states.filter((state) => state.dataset.startsWith("pbp:") && state.lastSuccessAt).map((state) => state.dataset));
    const backfillSeason = Array.from(
      { length: currentSeason - structuralConfig.model.trainingStartSeason },
      (_, index) => currentSeason - 1 - index
    ).find((season) => !imported.has(`pbp:${season}`));
    if (backfillSeason !== undefined) {
      const backfill = await refreshPbpSeason({ db: input.db, season: backfillSeason, currentSeason, now, fetcher });
      playByPlay = backfill.state;
      playByPlaySeason = backfillSeason;
      teamGameRows = backfill.rows;
    }

    const currentPlayerState = await getNflverseImportState(input.db, `player_stats:${currentSeason}`);
    if (!checkedToday(currentPlayerState?.lastCheckedAt ?? null, parts.dayKey)) {
      const current = await refreshPlayerStatsSeason({ db: input.db, season: currentSeason, currentSeason, now, fetcher });
      playerStats = current.state;
      playerStatsSeason = currentSeason;
      playerStatRows = current.rows;
    }
    const refreshedStates = await listNflverseImportStates(input.db);
    const importedPlayerStats = new Set(refreshedStates
      .filter((state) => state.dataset.startsWith("player_stats:") && state.lastSuccessAt)
      .map((state) => state.dataset));
    const playerBackfillSeason = nextMissingHistoricalSeason(
      currentSeason,
      "player_stats",
      importedPlayerStats,
      currentSeason - structuralConfig.props.usageProjectionTrainingStartSeason
    );
    if (playerBackfillSeason !== null) {
      const backfill = await refreshPlayerStatsSeason({ db: input.db, season: playerBackfillSeason, currentSeason, now, fetcher });
      playerStats = backfill.state;
      playerStatsSeason = playerBackfillSeason;
      playerStatRows = backfill.rows;
    }
    const currentSnapState = await getNflverseImportState(input.db, `snap_counts:${currentSeason}`);
    if (!checkedToday(currentSnapState?.lastCheckedAt ?? null, parts.dayKey)) {
      const current = await refreshSnapCountsSeason({ db: input.db, season: currentSeason, currentSeason, now, fetcher });
      snapCounts = current.state;
      snapCountsSeason = currentSeason;
      snapCountRows = current.rows;
    }
    const snapStates = await listNflverseImportStates(input.db);
    const importedSnapCounts = new Set(snapStates
      .filter((state) => state.dataset.startsWith("snap_counts:") && state.lastSuccessAt)
      .map((state) => state.dataset));
    const snapBackfillSeason = nextMissingHistoricalSeason(currentSeason, "snap_counts", importedSnapCounts);
    if (snapBackfillSeason !== null) {
      const backfill = await refreshSnapCountsSeason({ db: input.db, season: snapBackfillSeason, currentSeason, now, fetcher });
      snapCounts = backfill.state;
      snapCountsSeason = snapBackfillSeason;
      snapCountRows = backfill.rows;
    }
  }

  return {
    currentSeason,
    schedules: schedules.state,
    scheduleRows: schedules.rows,
    playByPlay,
    playByPlaySeason,
    teamGameRows,
    playerStats,
    playerStatsSeason,
    playerStatRows,
    snapCounts,
    snapCountsSeason,
    snapCountRows
  };
}
