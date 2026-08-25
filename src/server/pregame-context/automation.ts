import { stableHash } from "@/domain/hash";
import { resolveVenue } from "@/domain/stadiums";
import { boardGameId, easternScheduleTimeToIso, normalizeScheduleTeam } from "@/domain/weekly-slate";
import type { WeatherInput } from "@/domain/types";
import {
  discoverOfficialInactiveArticles,
  officialArticleSitemapUrl,
  officialGameCenterUrl,
  parseOfficialGameInactives,
  parseOfficialRoofDesignation,
  pregameSourceConfig,
  type ParsedGameInactives
} from "./parser";
import {
  acquirePregameContextLease,
  ensurePregameContextStore,
  failPregameContext,
  getPregameContextStates,
  publishPregameContext
} from "./store";
import { redactHttpRequest } from "@/domain/engine-os";
import { recordCaptureFailure, storeRawCapture } from "@/server/engine-os/capture";

const WINDOW_START_MS = 95 * 60_000;
const RETRY_INTERVAL_MS = 4 * 60_000;

interface ScheduleRow {
  game_id: string;
  season: number;
  week: number;
  game_date: string;
  game_time: string | null;
  away_team: string;
  home_team: string;
  stadium: string | null;
}

interface SourcePage {
  url: string;
  html: string;
  sourceTimestamp: string;
}

export interface PregameContextAutomationResult {
  due: number;
  updated: number;
  unavailable: number;
  skipped: number;
}

function elapsed(iso: string | null, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? now.getTime() - value : Number.POSITIVE_INFINITY;
}

export function isPregameContextDue(input: {
  kickoffAt: string;
  now: Date;
  inactivesConfirmed: boolean;
  lastCheckedAt: string | null;
}): boolean {
  if (input.inactivesConfirmed) return false;
  const untilKickoff = Date.parse(input.kickoffAt) - input.now.getTime();
  return untilKickoff > 0 && untilKickoff <= WINDOW_START_MS
    && elapsed(input.lastCheckedAt, input.now) >= RETRY_INTERVAL_MS;
}

function sourceTimestamp(response: Response, fallback: Date): string {
  const candidate = response.headers.get("last-modified") ?? response.headers.get("date");
  const parsed = candidate ? Date.parse(candidate) : Number.NaN;
  return new Date(Number.isFinite(parsed) ? parsed : fallback.getTime()).toISOString();
}

async function fetchPage(
  url: string,
  now: Date,
  fetcher: typeof fetch,
  capture: { db: D1Database; bucket: R2Bucket }
): Promise<SourcePage> {
  const idempotencyKey = `official-pregame:${stableHash(url)}:${now.toISOString()}`;
  const requestHeaders = { accept: "text/html,application/xhtml+xml" };
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      headers: requestHeaders
    });
    if (!response.ok) throw new Error(`Official NFL pregame source failed with HTTP ${response.status}`);
    const rawBytes = new Uint8Array(await response.arrayBuffer());
    const receivedAt = new Date().toISOString();
    const html = new TextDecoder().decode(rawBytes);
    if (!html.trim()) throw new Error("Official NFL pregame source returned an empty page");
    const publishedAt = sourceTimestamp(response, new Date(receivedAt));
    await storeRawCapture({
      db: capture.db,
      bucket: capture.bucket,
      idempotencyKey,
      provider: "official-nfl",
      dataset: "inactive_roof",
      request: redactHttpRequest({ url, headers: requestHeaders }),
      responseBytes: rawBytes,
      contentType: response.headers.get("content-type"),
      etag: response.headers.get("etag"),
      providerPublishedAt: publishedAt,
      receivedAt,
      validFrom: receivedAt,
      sourceSchemaVersion: "official-nfl.pregame-html.v1",
      licenseId: "official-nfl-public-page-terms"
    });
    return { url, html, sourceTimestamp: publishedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown official pregame capture failure";
    await recordCaptureFailure({
      db: capture.db,
      provider: "official-nfl",
      dataset: "inactive_roof",
      attemptedAt: new Date().toISOString(),
      failureCode: /evidence|r2|storage|capture|durably|object|sidecar/i.test(message)
        ? "storage_failure"
        : /empty|parse|complete/i.test(message) ? "schema_invalid" : "provider_unavailable",
      idempotencyKey
    });
    throw error;
  }
}

function inactivesFromSources(game: ScheduleRow, sources: readonly SourcePage[]): {
  inactives: ParsedGameInactives;
  source: SourcePage;
} | null {
  for (const source of sources) {
    if (source.url.includes("/news/") && !new RegExp(`by-week/reg-${game.week}(?:#|[^0-9])`, "i").test(source.html)) continue;
    const inactives = parseOfficialGameInactives({
      html: source.html,
      gameId: contextGameId(game),
      awayTeam: game.away_team,
      homeTeam: game.home_team
    });
    if (inactives) return { inactives, source };
  }
  return null;
}

function contextGameId(game: ScheduleRow): string {
  return boardGameId(normalizeScheduleTeam(game.away_team), normalizeScheduleTeam(game.home_team));
}

async function articleSources(input: {
  games: readonly ScheduleRow[];
  now: Date;
  fetcher: typeof fetch;
  capture: { db: D1Database; bucket: R2Bucket };
}): Promise<SourcePage[]> {
  if (!input.games.length) return [];
  const sitemap = await fetchPage(officialArticleSitemapUrl(input.now), input.now, input.fetcher, input.capture);
  const links = discoverOfficialInactiveArticles({
    html: sitemap.html,
    season: input.games[0].season,
    week: input.games[0].week
  });
  const sources: SourcePage[] = [];
  for (const url of links) {
    try {
      const page = await fetchPage(url, input.now, input.fetcher, input.capture);
      sources.push(page);
      const covered = input.games.every((game) => inactivesFromSources(game, sources));
      if (covered) break;
    } catch {
      // A single article must not block later official candidates in the same sitemap.
    }
  }
  return sources;
}

async function confirmedRoof(input: {
  game: ScheduleRow;
  now: Date;
  fetcher: typeof fetch;
  capture: { db: D1Database; bucket: R2Bucket };
}): Promise<{ roof: WeatherInput["roof"]; source: SourcePage | null }> {
  const venue = resolveVenue(input.game.stadium);
  if (!venue) throw new Error(`No stadium configuration exists for ${input.game.stadium ?? "unknown venue"}`);
  if (venue.defaultRoof !== "unconfirmed") return { roof: venue.defaultRoof, source: null };
  const url = officialGameCenterUrl({
    awayTeam: input.game.away_team,
    homeTeam: input.game.home_team,
    season: input.game.season,
    week: input.game.week
  });
  const source = await fetchPage(url, input.now, input.fetcher, input.capture);
  const roof = parseOfficialRoofDesignation(source.html);
  if (roof !== "open" && roof !== "closed") {
    throw new Error("Official retractable-roof designation is not yet published");
  }
  return { roof, source };
}

export async function runOfficialPregameContextAutomation(input: {
  db: D1Database;
  now?: Date;
  fetcher?: typeof fetch;
  force?: boolean;
  evidenceBucket?: R2Bucket;
}): Promise<PregameContextAutomationResult> {
  const now = input.now ?? new Date();
  await ensurePregameContextStore(input.db);
  const fetcher = input.fetcher ?? fetch;
  const schedule = await input.db.prepare(`SELECT game_id, season, week, game_date, game_time,
    away_team, home_team, stadium FROM nfl_games
    WHERE season_type = 'REG' AND game_date BETWEEN date(?, '-1 day') AND date(?, '+1 day')
    ORDER BY game_date, game_time, game_id`).bind(now.toISOString(), now.toISOString()).all<ScheduleRow>();
  const states = new Map((await getPregameContextStates(input.db, schedule.results.map(contextGameId)))
    .map((state) => [state.gameId, state]));
  const unresolvedKickoffs = schedule.results.filter((game) => game.game_time === null);
  if (unresolvedKickoffs.length) {
    await Promise.all(unresolvedKickoffs.map((game) => recordCaptureFailure({
      db: input.db,
      provider: "official-nfl",
      dataset: "inactive_roof",
      attemptedAt: new Date().toISOString(),
      failureCode: "schema_invalid",
      idempotencyKey: `official-pregame:${contextGameId(game)}:unresolved-kickoff:${now.toISOString()}`,
      sourceKey: `official-nfl:inactive_roof:${contextGameId(game)}`
    })));
    await Promise.all(unresolvedKickoffs.map((game) => failPregameContext({
      db: input.db,
      gameId: contextGameId(game),
      season: game.season,
      week: game.week,
      failedAt: now.toISOString(),
      message: "Kickoff time is unresolved; pregame context was withheld"
    })));
  }
  const due = schedule.results.filter((game) => {
    if (game.game_time === null) return false;
    const state = states.get(contextGameId(game));
    return input.force || isPregameContextDue({
      kickoffAt: easternScheduleTimeToIso(game.game_date, game.game_time),
      now,
      inactivesConfirmed: state?.inactivesConfirmed ?? false,
      lastCheckedAt: state?.lastCheckedAt ?? null
    });
  });
  if (!due.length) {
    return {
      due: unresolvedKickoffs.length,
      updated: 0,
      unavailable: unresolvedKickoffs.length,
      skipped: schedule.results.length - unresolvedKickoffs.length
    };
  }

  const acquired: ScheduleRow[] = [];
  for (const game of due) {
    const gameId = contextGameId(game);
    if (await acquirePregameContextLease({
      db: input.db,
      gameId,
      season: game.season,
      week: game.week,
      checkedAt: now.toISOString()
    })) acquired.push(game);
  }
  if (!acquired.length) {
    return {
      due: due.length + unresolvedKickoffs.length,
      updated: 0,
      unavailable: unresolvedKickoffs.length,
      skipped: due.length
    };
  }

  if (!input.evidenceBucket) {
    const failureMessage = "Immutable evidence storage is unavailable for official pregame context";
    await recordCaptureFailure({
      db: input.db,
      provider: "official-nfl",
      dataset: "inactive_roof",
      attemptedAt: new Date().toISOString(),
      failureCode: "storage_failure",
      idempotencyKey: `official-pregame:missing-storage:${now.toISOString()}`
    });
    await Promise.all(acquired.map((game) => failPregameContext({
      db: input.db,
      gameId: contextGameId(game),
      season: game.season,
      week: game.week,
      failedAt: now.toISOString(),
      message: failureMessage
    })));
    return {
      due: due.length + unresolvedKickoffs.length,
      updated: 0,
      unavailable: acquired.length + unresolvedKickoffs.length,
      skipped: due.length - acquired.length
    };
  }

  let landing: SourcePage | null = null;
  let articles: SourcePage[] = [];
  const capture = { db: input.db, bucket: input.evidenceBucket };
  try {
    landing = await fetchPage(pregameSourceConfig.inactivesLanding, now, fetcher, capture);
  } catch {
    // The official article index remains the primary fallback.
  }
  const unresolved = acquired.filter((game) => !landing || !inactivesFromSources(game, [landing]));
  try {
    articles = await articleSources({ games: unresolved, now, fetcher, capture });
  } catch {
    // Each game below is marked unavailable without replacing its last good snapshot.
  }
  const sources = landing ? [landing, ...articles] : articles;
  let updated = 0;
  let unavailable = 0;
  for (const game of acquired) {
    try {
      const inactiveResult = inactivesFromSources(game, sources);
      if (!inactiveResult) throw new Error("Complete official two-team inactive lists are not yet published");
      const roofResult = await confirmedRoof({ game, now, fetcher, capture });
      const sourceHash = stableHash({
        configVersion: pregameSourceConfig.version,
        inactives: inactiveResult.inactives.rawSnapshotHash,
        roof: roofResult.source ? stableHash(roofResult.source.html) : roofResult.roof
      });
      await publishPregameContext({
        db: input.db,
        season: game.season,
        week: game.week,
        inactives: inactiveResult.inactives,
        roof: roofResult.roof,
        inactivesSourceUrl: inactiveResult.source.url,
        sourceUrl: [inactiveResult.source.url, roofResult.source?.url].filter(Boolean).join(" | "),
        sourceTimestamp: [inactiveResult.source.sourceTimestamp, roofResult.source?.sourceTimestamp]
          .filter(Boolean).sort().at(-1)!,
        sourceHash,
        importedAt: now.toISOString()
      });
      updated += 1;
    } catch (error) {
      await recordCaptureFailure({
        db: input.db,
        provider: "official-nfl",
        dataset: "inactive_roof",
        attemptedAt: new Date().toISOString(),
        failureCode: "partial_import",
        idempotencyKey: `official-pregame:${contextGameId(game)}:${now.toISOString()}`
      });
      await failPregameContext({
        db: input.db,
        gameId: contextGameId(game),
        season: game.season,
        week: game.week,
        failedAt: now.toISOString(),
        message: error instanceof Error ? error.message : "Unknown official pregame context failure"
      });
      unavailable += 1;
    }
  }
  return {
    due: due.length + unresolvedKickoffs.length,
    updated,
    unavailable: unavailable + unresolvedKickoffs.length,
    skipped: due.length - acquired.length
  };
}
