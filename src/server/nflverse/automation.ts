import { createHash } from "node:crypto";
import { structuralConfig } from "@/domain/config";
import { NFLVERSE_URLS } from "@/server/providers/nflverse";
import {
  acquireImportLease,
  completeUnchangedImport,
  ensureNflverseStore,
  failNflverseImport,
  getNflverseImportState,
  listNflverseImportStates,
  markImportUnavailable,
  publishSchedules,
  publishTeamGameFeatures,
  recordImportSuccess
} from "./store";
import { aggregatePbpCsv, parseScheduleCsv } from "./transform";
import { redactHttpRequest } from "@/domain/engine-os";
import {
  recordCaptureFailure,
  recordCaptureFreshnessConfirmation,
  storeRawCapture,
  storeRawCaptureStream
} from "@/server/engine-os/capture";

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
  rosterCapture: "updated" | "unavailable" | "skipped";
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

function captureFailureCode(error: unknown): "provider_unavailable" | "schema_invalid" | "storage_failure" {
  const message = error instanceof Error ? error.message : String(error);
  if (/evidence|r2|storage|capture|durably|object|sidecar/i.test(message)) return "storage_failure";
  if (/empty|schema|parse|column|csv|gzip|decompress/i.test(message)) return "schema_invalid";
  return "provider_unavailable";
}

async function hasCapturedSource(
  db: D1Database,
  dataset: "schedule" | "play_by_play" | "roster",
  sourceKey = `nflverse:${dataset}`
): Promise<boolean> {
  const row = await db.prepare(`SELECT latest_capture_id FROM source_capture_heartbeats
    WHERE source_key = ? LIMIT 1`).bind(sourceKey).first<{ latest_capture_id: string | null }>();
  return Boolean(row?.latest_capture_id);
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

async function aggregateAndCapturePbp(input: {
  response: Response;
  compressed: boolean;
  season: number;
  currentSeason: number;
  sourceUrl: string;
  idempotencyKey: string;
  db: D1Database;
  evidenceBucket: R2Bucket;
}): Promise<{ features: Awaited<ReturnType<typeof aggregatePbpCsv>>; sourceHash: string }> {
  if (!input.response.body) throw new Error(`nflverse play-by-play ${input.season} returned an empty body`);
  const [modelBody, evidenceBody] = input.response.body.tee();
  const responseForModel = new Response(modelBody, {
    status: input.response.status,
    statusText: input.response.statusText,
    headers: input.response.headers
  });
  const [aggregate, capture] = await Promise.allSettled([
    aggregatePbpResponse({
      response: responseForModel,
      compressed: input.compressed,
      season: input.season,
      currentSeason: input.currentSeason
    }),
    storeRawCaptureStream({
      db: input.db,
      bucket: input.evidenceBucket,
      idempotencyKey: input.idempotencyKey,
      provider: "nflverse",
      dataset: "play_by_play",
      request: redactHttpRequest({ url: input.sourceUrl }),
      responseStream: evidenceBody,
      contentType: input.response.headers.get("content-type"),
      etag: input.response.headers.get("etag"),
      providerPublishedAt: input.response.headers.get("last-modified"),
      validFromAtReceipt: true,
      sourceSchemaVersion: input.compressed ? "nflverse.pbp-csv-gzip.v1" : "nflverse.pbp-csv.v1",
      licenseId: "nflverse-source-terms",
      heartbeatSourceKey: `nflverse:play_by_play:${input.season}`
    })
  ]);
  if (capture.status === "rejected") throw capture.reason;
  if (aggregate.status === "rejected") throw aggregate.reason;
  if (capture.value.manifest.responseSha256 !== aggregate.value.sourceHash) {
    throw new Error("Play-by-play parser and immutable capture hashes disagree");
  }
  return aggregate.value;
}

async function refreshSchedules(input: {
  db: D1Database;
  now: Date;
  currentSeason: number;
  includeHistory: boolean;
  fetcher: typeof fetch;
  evidenceBucket?: R2Bucket;
}): Promise<{ state: "updated" | "unchanged" | "skipped"; rows: number }> {
  const checkedAt = input.now.toISOString();
  const captureKey = `nflverse:schedules:${checkedAt}`;
  const sourceUrl = NFLVERSE_URLS.schedules;
  const liveState = await getNflverseImportState(input.db, LIVE_SCHEDULE_DATASET);
  const acquireLive = elapsed(liveState?.lastCheckedAt ?? null, input.now) >= SCHEDULE_INTERVAL_MS
    && await acquireImportLease({ db: input.db, dataset: LIVE_SCHEDULE_DATASET, sourceUrl, checkedAt });
  const acquireHistory = input.includeHistory
    && await acquireImportLease({ db: input.db, dataset: HISTORY_SCHEDULE_DATASET, sourceUrl, checkedAt });
  if (!acquireLive && !acquireHistory) return { state: "skipped", rows: 0 };

  try {
    if (!input.evidenceBucket) throw new Error("Immutable evidence storage is unavailable for nflverse schedules");
    const headers = new Headers();
    if (!acquireHistory && liveState?.sourceTag && await hasCapturedSource(input.db, "schedule")) {
      headers.set("if-none-match", liveState.sourceTag);
    }
    const response = await input.fetcher(sourceUrl, { cache: "no-store", headers });
    if (response.status === 304) {
      await recordCaptureFreshnessConfirmation({
        db: input.db,
        provider: "nflverse",
        dataset: "schedule",
        confirmedAt: new Date().toISOString()
      });
      if (acquireLive) await completeUnchangedImport({ db: input.db, dataset: LIVE_SCHEDULE_DATASET, checkedAt, sourceTag: liveState?.sourceTag ?? null });
      if (acquireHistory) await completeUnchangedImport({ db: input.db, dataset: HISTORY_SCHEDULE_DATASET, checkedAt, sourceTag: null });
      return { state: "unchanged", rows: liveState?.rowCount ?? 0 };
    }
    if (!response.ok) throw new Error(`nflverse schedules fetch failed with HTTP ${response.status}`);
    const rawBytes = new Uint8Array(await response.arrayBuffer());
    const receivedAt = new Date().toISOString();
    const csv = new TextDecoder().decode(rawBytes);
    if (!csv.length) throw new Error("nflverse schedules import returned an empty response");
    await storeRawCapture({
      db: input.db,
      bucket: input.evidenceBucket,
      idempotencyKey: captureKey,
      provider: "nflverse",
      dataset: "schedule",
      request: redactHttpRequest({ url: sourceUrl, headers }),
      responseBytes: rawBytes,
      contentType: response.headers.get("content-type"),
      etag: response.headers.get("etag"),
      providerPublishedAt: response.headers.get("last-modified"),
      receivedAt,
      validFrom: receivedAt,
      sourceSchemaVersion: "nflverse.schedules.csv.v1",
      licenseId: "nflverse-source-terms"
    });
    const sourceHash = createHash("sha256").update(rawBytes).digest("hex");
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
    await recordCaptureFailure({
      db: input.db,
      provider: "nflverse",
      dataset: "schedule",
      attemptedAt: new Date().toISOString(),
      failureCode: captureFailureCode(error),
      idempotencyKey: captureKey
    });
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
  evidenceBucket?: R2Bucket;
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
  const compressedCaptureKey = `nflverse:pbp:${input.season}:gzip:${checkedAt}`;

  try {
    if (!input.evidenceBucket) throw new Error("Immutable evidence storage is unavailable for nflverse play-by-play");
    const headers = new Headers();
    const heartbeatSourceKey = `nflverse:play_by_play:${input.season}`;
    if (previous?.sourceTag && await hasCapturedSource(input.db, "play_by_play", heartbeatSourceKey)) {
      headers.set("if-none-match", previous.sourceTag);
    }
    const response = await input.fetcher(sourceUrl, { cache: "no-store", headers });
    if (response.status === 304) {
      await recordCaptureFreshnessConfirmation({
        db: input.db,
        provider: "nflverse",
        dataset: "play_by_play",
        confirmedAt: new Date().toISOString(),
        sourceKey: heartbeatSourceKey
      });
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
      await recordCaptureFailure({
        db: input.db,
        provider: "nflverse",
        dataset: "play_by_play",
        attemptedAt: new Date().toISOString(),
        failureCode: "provider_unavailable",
        idempotencyKey: compressedCaptureKey,
        sourceKey: heartbeatSourceKey
      });
      return { state: "unavailable", rows: 0 };
    }
    if (!response.ok) throw new Error(`nflverse play-by-play ${input.season} fetch failed with HTTP ${response.status}`);

    let usedResponse = response;
    let usedSourceUrl = sourceUrl;
    let aggregate;
    try {
      aggregate = await aggregateAndCapturePbp({
        response,
        compressed: true,
        season: input.season,
        currentSeason: input.currentSeason,
        sourceUrl,
        idempotencyKey: compressedCaptureKey,
        db: input.db,
        evidenceBucket: input.evidenceBucket
      });
    } catch (error) {
      if (!shouldRetryUncompressedPbp(error)) throw error;
      usedSourceUrl = NFLVERSE_URLS.pbpCsvPlain(input.season);
      usedResponse = await input.fetcher(usedSourceUrl, { cache: "no-store" });
      if (!usedResponse.ok) {
        throw new Error(`nflverse uncompressed play-by-play ${input.season} fallback failed with HTTP ${usedResponse.status}`);
      }
      aggregate = await aggregateAndCapturePbp({
        response: usedResponse,
        compressed: false,
        season: input.season,
        currentSeason: input.currentSeason,
        sourceUrl: usedSourceUrl,
        idempotencyKey: `nflverse:pbp:${input.season}:plain:${checkedAt}`,
        db: input.db,
        evidenceBucket: input.evidenceBucket
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
    await recordCaptureFailure({
      db: input.db,
      provider: "nflverse",
      dataset: "play_by_play",
      attemptedAt: new Date().toISOString(),
      failureCode: captureFailureCode(error),
      idempotencyKey: compressedCaptureKey,
      sourceKey: `nflverse:play_by_play:${input.season}`
    });
    await failNflverseImport({ db: input.db, dataset, failedAt: checkedAt, message });
    throw error;
  }
}

async function refreshRosterCapture(input: {
  db: D1Database;
  season: number;
  now: Date;
  fetcher: typeof fetch;
  evidenceBucket?: R2Bucket;
}): Promise<"updated" | "unavailable" | "skipped"> {
  const sourceUrl = NFLVERSE_URLS.rosters(input.season);
  const dayKey = pacificParts(input.now).dayKey;
  const idempotencyKey = `nflverse:roster:${input.season}:${dayKey}`;
  const heartbeat = await input.db.prepare(`SELECT last_success_at FROM source_capture_heartbeats
    WHERE source_key = 'nflverse:roster' LIMIT 1`).first<{ last_success_at: string | null }>();
  if (checkedToday(heartbeat?.last_success_at ?? null, dayKey)) return "skipped";
  try {
    if (!input.evidenceBucket) throw new Error("Immutable evidence storage is unavailable for nflverse rosters");
    const response = await input.fetcher(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`nflverse rosters ${input.season} fetch failed with HTTP ${response.status}`);
    if (!response.body) throw new Error(`nflverse rosters ${input.season} returned an empty body`);
    await storeRawCaptureStream({
      db: input.db,
      bucket: input.evidenceBucket,
      idempotencyKey,
      provider: "nflverse",
      dataset: "roster",
      request: redactHttpRequest({ url: sourceUrl }),
      responseStream: response.body,
      contentType: response.headers.get("content-type"),
      etag: response.headers.get("etag"),
      providerPublishedAt: response.headers.get("last-modified"),
      validFromAtReceipt: true,
      sourceSchemaVersion: "nflverse.roster-csv.v1",
      licenseId: "nflverse-source-terms"
    });
    return "updated";
  } catch (error) {
    await recordCaptureFailure({
      db: input.db,
      provider: "nflverse",
      dataset: "roster",
      attemptedAt: new Date().toISOString(),
      failureCode: captureFailureCode(error),
      idempotencyKey
    });
    return "unavailable";
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
  evidenceBucket?: R2Bucket;
}): Promise<NflverseAutomationResult> {
  const now = input.now ?? new Date();
  await ensureNflverseStore(input.db);
  const fetcher: typeof fetch = input.fetcher
    ? (request, init) => input.fetcher!(request, init)
    : (request, init) => fetch(request, init);
  const currentSeason = nflSeasonForDate(now);
  const parts = pacificParts(now);
  const historyState = await getNflverseImportState(input.db, HISTORY_SCHEDULE_DATASET);
  const includeHistory = !historyState?.lastSuccessAt
    || (parts.weekday === "Tue" && parts.hour >= 6 && elapsed(historyState.lastSuccessAt, now) >= HISTORY_INTERVAL_MS);
  const schedules = await refreshSchedules({
    db: input.db,
    now,
    currentSeason,
    includeHistory,
    fetcher,
    evidenceBucket: input.evidenceBucket
  });

  let playByPlay: NflverseAutomationResult["playByPlay"] = "skipped";
  let playByPlaySeason: number | null = null;
  let teamGameRows = 0;
  const playerStats: NflverseAutomationResult["playerStats"] = "skipped";
  const playerStatsSeason: number | null = null;
  const playerStatRows = 0;
  const snapCounts: NflverseAutomationResult["snapCounts"] = "skipped";
  const snapCountsSeason: number | null = null;
  const snapCountRows = 0;
  let rosterCapture: NflverseAutomationResult["rosterCapture"] = "skipped";
  const nightlyPbpIsDue = parts.hour >= 1;
  if ((input.allowPlayByPlay ?? true) && nightlyPbpIsDue) {
    const currentState = await getNflverseImportState(input.db, `pbp:${currentSeason}`);
    if (!checkedToday(currentState?.lastCheckedAt ?? null, parts.dayKey)) {
      const current = await refreshPbpSeason({
        db: input.db, season: currentSeason, currentSeason, now, fetcher,
        evidenceBucket: input.evidenceBucket
      });
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
      const backfill = await refreshPbpSeason({
        db: input.db, season: backfillSeason, currentSeason, now, fetcher,
        evidenceBucket: input.evidenceBucket
      });
      playByPlay = backfill.state;
      playByPlaySeason = backfillSeason;
      teamGameRows = backfill.rows;
    }

    rosterCapture = await refreshRosterCapture({
      db: input.db,
      season: currentSeason,
      now,
      fetcher,
      evidenceBucket: input.evidenceBucket
    });

    // Player-stat and snap-count publication remains disabled until those
    // provider responses use the same exact-byte R2 contract. Publishing an
    // uncaptured derivative would make later replay unverifiable.
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
    snapCountRows,
    rosterCapture
  };
}
