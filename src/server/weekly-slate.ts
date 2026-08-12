import {
  NFL_TEAM_NAMES,
  boardGameId,
  chooseActiveWeek,
  easternScheduleTimeToIso,
  normalizeScheduleTeam,
  type WeeklyMatchup,
  type WeeklySlate
} from "@/domain/weekly-slate";
import { weekOneMatchups } from "@/lib/week-one-data";
import { getD1 } from "../../db";

interface ScheduleRow {
  game_id: string;
  season: number;
  week: number;
  game_date: string;
  game_time: string | null;
  away_team: string;
  home_team: string;
  stadium: string | null;
  spread_line: number | null;
}

function pacificDate(now: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function networkFor(game: { week: number; away: string; home: string }): string {
  if (game.week !== 1) return "";
  return weekOneMatchups.find((matchup) => matchup.away === game.away && matchup.home === game.home)?.network ?? "";
}

function rowToMatchup(row: ScheduleRow): WeeklyMatchup {
  const away = normalizeScheduleTeam(row.away_team);
  const home = normalizeScheduleTeam(row.home_team);
  const kickoffAt = easternScheduleTimeToIso(row.game_date, row.game_time ?? "13:00");
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long" }).format(new Date(kickoffAt));
  return {
    id: boardGameId(away, home),
    sourceGameId: row.game_id,
    season: row.season,
    week: row.week,
    kickoffAt,
    day,
    away,
    awayName: NFL_TEAM_NAMES[away] ?? away,
    home,
    homeName: NFL_TEAM_NAMES[home] ?? home,
    venue: row.stadium ?? "",
    network: networkFor({ week: row.week, away, home }),
    consensusHomePoint: row.spread_line === null ? null : -row.spread_line
  };
}

export async function activeWeek(input: { db?: D1Database; season?: number; now?: Date } = {}): Promise<number> {
  const db = input.db ?? getD1();
  const season = input.season ?? 2026;
  const result = await db.prepare(`SELECT week, MAX(game_date) AS last_game_date
    FROM nfl_games WHERE season = ? AND season_type = 'REG'
    GROUP BY week ORDER BY week`).bind(season).all<{ week: number; last_game_date: string }>();
  return chooseActiveWeek(result.results.map((row) => ({ week: row.week, lastGameDate: row.last_game_date })), pacificDate(input.now ?? new Date()));
}

export async function weeklySlate(input: { db?: D1Database; season?: number; week?: number; now?: Date } = {}): Promise<WeeklySlate> {
  const db = input.db ?? getD1();
  const season = input.season ?? 2026;
  const week = input.week ?? await activeWeek({ db, season, now: input.now });
  const result = await db.prepare(`SELECT game_id, season, week, game_date, game_time, away_team, home_team, stadium, spread_line
    FROM nfl_games WHERE season = ? AND season_type = 'REG' AND week = ?
    ORDER BY game_date, game_time, game_id`).bind(season, week).all<ScheduleRow>();
  if (!result.results.length) throw new Error(`No nflverse schedule is available for Week ${week}`);
  return { season, week, generatedAt: new Date().toISOString(), games: result.results.map(rowToMatchup) };
}

export async function seasonSchedule(input: { db?: D1Database; season?: number } = {}): Promise<WeeklyMatchup[]> {
  const db = input.db ?? getD1();
  const season = input.season ?? 2026;
  const result = await db.prepare(`SELECT game_id, season, week, game_date, game_time, away_team, home_team, stadium, spread_line
    FROM nfl_games WHERE season = ? AND season_type = 'REG'
    ORDER BY game_date, game_time, game_id`).bind(season).all<ScheduleRow>();
  return result.results.map(rowToMatchup);
}
