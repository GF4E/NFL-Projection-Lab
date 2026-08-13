import { stableHash } from "@/domain/hash";
import { normalizeRoof, resolveVenue, stadiumConfig } from "@/domain/stadiums";
import type { WeatherInput } from "@/domain/types";
import { boardGameId, easternScheduleTimeToIso, normalizeScheduleTeam } from "@/domain/weekly-slate";
import { fetchKickoffWeather } from "@/server/providers/open-meteo";
import {
  ensureKickoffWeatherStore,
  failKickoffWeather,
  lastWeatherChecks,
  markRoofUnconfirmed,
  publishKickoffWeather
} from "./store";

interface ScheduledVenueRow {
  game_id: string;
  game_date: string;
  game_time: string | null;
  stadium: string | null;
  roof: string | null;
  away_team: string;
  home_team: string;
}

export interface WeatherAutomationResult {
  status: "updated" | "skipped" | "aborted";
  eligibleGames: number;
  updatedGames: number;
  message: string | null;
}

const HORIZON_MS = 16 * 24 * 60 * 60_000;

export function weatherRefreshIntervalMs(millisecondsToKickoff: number): number {
  if (millisecondsToKickoff <= 6 * 60 * 60_000) return 60 * 60_000;
  if (millisecondsToKickoff <= 48 * 60 * 60_000) return 6 * 60 * 60_000;
  return 24 * 60 * 60_000;
}

function isDue(lastCheckedAt: string | null, now: Date, kickoffAt: string): boolean {
  if (!lastCheckedAt) return true;
  const elapsed = now.getTime() - Date.parse(lastCheckedAt);
  return !Number.isFinite(elapsed) || elapsed >= weatherRefreshIntervalMs(Date.parse(kickoffAt) - now.getTime());
}

export async function runKickoffWeatherAutomation(input: {
  db: D1Database;
  now?: Date;
  fetcher?: typeof fetch;
  force?: boolean;
}): Promise<WeatherAutomationResult> {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  await ensureKickoffWeatherStore(input.db);
  const schedule = await input.db.prepare(`SELECT game_id, game_date, game_time, stadium, roof, away_team, home_team
    FROM nfl_games
    WHERE season = ? AND season_type = 'REG' AND game_date >= ?
    ORDER BY game_date, game_time, game_id`)
    .bind(stadiumConfig.season, checkedAt.slice(0, 10)).all<ScheduledVenueRow>();
  const checks = await lastWeatherChecks(input.db);
  const eligible = schedule.results.flatMap((row) => {
    const gameId = boardGameId(normalizeScheduleTeam(row.away_team), normalizeScheduleTeam(row.home_team));
    const kickoffAt = easternScheduleTimeToIso(row.game_date, row.game_time ?? "13:00");
    const untilKickoff = Date.parse(kickoffAt) - now.getTime();
    if (untilKickoff < 0 || untilKickoff > HORIZON_MS || (!input.force && !isDue(checks.get(gameId) ?? null, now, kickoffAt))) return [];
    return [{ row, kickoffAt, gameId }];
  });
  if (!eligible.length) return { status: "skipped", eligibleGames: 0, updatedGames: 0, message: null };

  const prepared: Array<{ gameId: string; roof: WeatherInput["roof"]; promise: Promise<WeatherInput> }> = [];
  const unconfirmed: string[] = [];
  const setupFailures: Array<{ gameId: string; roof: WeatherInput["roof"]; message: string }> = [];
  for (const { row, kickoffAt, gameId } of eligible) {
    const venue = resolveVenue(row.stadium);
    if (!venue) {
      setupFailures.push({ gameId, roof: "unconfirmed", message: `No configured coordinates for ${row.stadium ?? "unknown stadium"}` });
      continue;
    }
    const roof = normalizeRoof(row.roof, venue.defaultRoof);
    if (roof === "unconfirmed") {
      unconfirmed.push(gameId);
      continue;
    }
    prepared.push({
      gameId,
      roof,
      promise: fetchKickoffWeather({
        gameId,
        stadium: row.stadium!,
        latitude: venue.latitude,
        longitude: venue.longitude,
        roof,
        kickoffAt,
        fetcher: input.fetcher
      })
    });
  }
  const settled = await Promise.allSettled(prepared.map((item) => item.promise));
  const failures = [...setupFailures];
  const completed: Array<{ weather: WeatherInput; sourceHash: string }> = [];
  settled.forEach((result, index) => {
    const item = prepared[index];
    if (result.status === "rejected") {
      failures.push({ gameId: item.gameId, roof: item.roof, message: result.reason instanceof Error ? result.reason.message : "Kickoff weather request failed" });
      return;
    }
    completed.push({ weather: result.value, sourceHash: stableHash(result.value) });
  });
  await Promise.all(unconfirmed.map((gameId) => markRoofUnconfirmed({ db: input.db, gameId, checkedAt })));
  if (failures.length) {
    await Promise.all(failures.map((failure) => failKickoffWeather({ db: input.db, failedAt: checkedAt, ...failure })));
    return {
      status: "aborted",
      eligibleGames: eligible.length,
      updatedGames: 0,
      message: failures.map((failure) => `${failure.gameId}: ${failure.message}`).join("; ")
    };
  }
  await publishKickoffWeather({ db: input.db, snapshots: completed, checkedAt });
  return { status: "updated", eligibleGames: eligible.length, updatedGames: completed.length, message: null };
}
