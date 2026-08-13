import { createHash } from "node:crypto";
import { parseCsvStream, requireColumns, textStream } from "./csv";

export interface NflverseGame {
  gameId: string;
  season: number;
  seasonType: string;
  week: number;
  gameDate: string;
  gameTime: string | null;
  weekday: string | null;
  awayTeam: string;
  awayScore: number | null;
  homeTeam: string;
  homeScore: number | null;
  location: string | null;
  result: number | null;
  total: number | null;
  overtime: boolean;
  awayRest: number | null;
  homeRest: number | null;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  spreadLine: number | null;
  awaySpreadOdds: number | null;
  homeSpreadOdds: number | null;
  totalLine: number | null;
  underOdds: number | null;
  overOdds: number | null;
  divisionGame: boolean;
  roof: string | null;
  surface: string | null;
  temperature: number | null;
  wind: number | null;
  awayQbId: string | null;
  homeQbId: string | null;
  awayQbName: string | null;
  homeQbName: string | null;
  awayCoach: string | null;
  homeCoach: string | null;
  referee: string | null;
  stadiumId: string | null;
  stadium: string | null;
  sourceRowHash: string;
}

export interface TeamGameFeature {
  id: string;
  gameId: string;
  season: number;
  seasonType: string;
  week: number;
  gameDate: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  plays: number;
  epaPerPlay: number;
  successRate: number;
  explosiveRate: number;
  turnovers: number;
  turnoverRate: number;
  secondsPerPlay: number | null;
  dropbacks: number;
  passRate: number;
  expectedPassRate: number | null;
  passRateOverExpectation: number | null;
}

export interface PlayerWeekStat {
  id: string;
  playerId: string;
  playerName: string;
  playerDisplayName: string;
  position: string | null;
  season: number;
  week: number;
  seasonType: string;
  gameId: string;
  team: string;
  opponent: string;
  attempts: number;
  passingYards: number;
  carries: number;
  rushingYards: number;
  receptions: number;
  targets: number;
  receivingYards: number;
}

const scheduleColumns = [
  "game_id", "season", "game_type", "week", "gameday", "weekday", "gametime",
  "away_team", "away_score", "home_team", "home_score", "location", "result", "total",
  "overtime", "away_rest", "home_rest", "away_moneyline", "home_moneyline", "spread_line",
  "away_spread_odds", "home_spread_odds", "total_line", "under_odds", "over_odds", "div_game",
  "roof", "surface", "temp", "wind", "away_qb_id", "home_qb_id", "away_qb_name",
  "home_qb_name", "away_coach", "home_coach", "referee", "stadium_id", "stadium"
] as const;

const pbpColumns = [
  "game_id", "home_team", "away_team", "season", "season_type", "week", "posteam", "posteam_type",
  "defteam", "game_date", "epa", "success", "yards_gained", "qb_dropback", "qb_kneel",
  "qb_spike", "rush_attempt", "pass_attempt", "interception", "fumble_lost", "play", "xpass",
  "pass_oe", "fixed_drive", "drive_time_of_possession"
] as const;

const playerStatColumns = [
  "player_id", "player_name", "player_display_name", "position", "season", "week", "season_type",
  "game_id", "team", "opponent_team", "attempts", "passing_yards", "carries", "rushing_yards",
  "receptions", "targets", "receiving_yards"
] as const;

function value(row: readonly string[], indexes: Map<string, number>, name: string): string {
  return row[indexes.get(name) ?? -1] ?? "";
}

function nullableString(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.length ? trimmed : null;
}

function nullableNumber(input: string): number | null {
  if (!input.trim()) return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(input: string, name: string): number {
  const parsed = Number(input);
  if (!Number.isInteger(parsed)) throw new Error(`nflverse row validation failed: ${name} is invalid`);
  return parsed;
}

function digest(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function parseScheduleCsv(
  csv: string,
  options: { trainingStartSeason: number; currentSeason: number }
): Promise<NflverseGame[]> {
  const iterator = parseCsvStream(textStream(csv));
  const first = await iterator.next();
  if (first.done) throw new Error("nflverse schedules import returned no header");
  const indexes = requireColumns(first.value, scheduleColumns);
  const games: NflverseGame[] = [];
  const ids = new Set<string>();

  for await (const row of iterator) {
    const season = integer(value(row, indexes, "season"), "season");
    if (season < options.trainingStartSeason) continue;
    const gameId = value(row, indexes, "game_id");
    const homeTeam = value(row, indexes, "home_team");
    const awayTeam = value(row, indexes, "away_team");
    const gameDate = value(row, indexes, "gameday");
    if (!gameId || !homeTeam || !awayTeam || !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
      throw new Error("nflverse schedules row validation failed: required game identity is invalid");
    }
    if (ids.has(gameId)) throw new Error(`nflverse schedules validation failed: duplicate ${gameId}`);
    ids.add(gameId);
    const selected = scheduleColumns.map((column) => value(row, indexes, column));
    games.push({
      gameId,
      season,
      seasonType: value(row, indexes, "game_type"),
      week: integer(value(row, indexes, "week"), "week"),
      gameDate,
      gameTime: nullableString(value(row, indexes, "gametime")),
      weekday: nullableString(value(row, indexes, "weekday")),
      awayTeam,
      awayScore: nullableNumber(value(row, indexes, "away_score")),
      homeTeam,
      homeScore: nullableNumber(value(row, indexes, "home_score")),
      location: nullableString(value(row, indexes, "location")),
      result: nullableNumber(value(row, indexes, "result")),
      total: nullableNumber(value(row, indexes, "total")),
      overtime: value(row, indexes, "overtime") === "1",
      awayRest: nullableNumber(value(row, indexes, "away_rest")),
      homeRest: nullableNumber(value(row, indexes, "home_rest")),
      awayMoneyline: nullableNumber(value(row, indexes, "away_moneyline")),
      homeMoneyline: nullableNumber(value(row, indexes, "home_moneyline")),
      spreadLine: nullableNumber(value(row, indexes, "spread_line")),
      awaySpreadOdds: nullableNumber(value(row, indexes, "away_spread_odds")),
      homeSpreadOdds: nullableNumber(value(row, indexes, "home_spread_odds")),
      totalLine: nullableNumber(value(row, indexes, "total_line")),
      underOdds: nullableNumber(value(row, indexes, "under_odds")),
      overOdds: nullableNumber(value(row, indexes, "over_odds")),
      divisionGame: value(row, indexes, "div_game") === "1",
      roof: nullableString(value(row, indexes, "roof")),
      surface: nullableString(value(row, indexes, "surface")),
      temperature: nullableNumber(value(row, indexes, "temp")),
      wind: nullableNumber(value(row, indexes, "wind")),
      awayQbId: nullableString(value(row, indexes, "away_qb_id")),
      homeQbId: nullableString(value(row, indexes, "home_qb_id")),
      awayQbName: nullableString(value(row, indexes, "away_qb_name")),
      homeQbName: nullableString(value(row, indexes, "home_qb_name")),
      awayCoach: nullableString(value(row, indexes, "away_coach")),
      homeCoach: nullableString(value(row, indexes, "home_coach")),
      referee: nullableString(value(row, indexes, "referee")),
      stadiumId: nullableString(value(row, indexes, "stadium_id")),
      stadium: nullableString(value(row, indexes, "stadium")),
      sourceRowHash: digest(selected)
    });
  }

  if (games.length < 4_000) {
    throw new Error(`nflverse schedules row-count validation failed: received ${games.length}`);
  }
  const currentRegular = games.filter((game) => game.season === options.currentSeason && game.seasonType === "REG");
  if (currentRegular.length > 0 && currentRegular.length !== 272) {
    throw new Error(`nflverse current schedule validation failed: expected 272 regular games, received ${currentRegular.length}`);
  }
  return games;
}

interface MutableTeamGame {
  gameId: string;
  season: number;
  seasonType: string;
  week: number;
  gameDate: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  plays: number;
  epa: number;
  successes: number;
  explosives: number;
  turnovers: number;
  dropbacks: number;
  passAttempts: number;
  rushAttempts: number;
  expectedPass: number;
  expectedPassCount: number;
  passOe: number;
  passOeCount: number;
  drives: Map<string, number>;
}

function possessionSeconds(input: string): number | null {
  const match = /^(\d+):(\d{2})$/.exec(input.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export async function aggregatePbpCsv(
  stream: ReadableStream<Uint8Array>,
  options: { season: number; currentSeason: number }
): Promise<TeamGameFeature[]> {
  const iterator = parseCsvStream(stream);
  const first = await iterator.next();
  if (first.done) throw new Error(`nflverse play-by-play ${options.season} returned no header`);
  const indexes = requireColumns(first.value, pbpColumns);
  const aggregates = new Map<string, MutableTeamGame>();
  let sourceRows = 0;

  for await (const row of iterator) {
    sourceRows += 1;
    if (integer(value(row, indexes, "season"), "season") !== options.season) {
      throw new Error(`nflverse play-by-play season validation failed for ${options.season}`);
    }
    if (value(row, indexes, "play") !== "1") continue;
    if (value(row, indexes, "qb_kneel") === "1" || value(row, indexes, "qb_spike") === "1") continue;
    const team = value(row, indexes, "posteam");
    const opponent = value(row, indexes, "defteam");
    const gameId = value(row, indexes, "game_id");
    const epa = nullableNumber(value(row, indexes, "epa"));
    if (!team || !opponent || !gameId || epa === null) continue;
    const homeTeam = value(row, indexes, "home_team");
    const awayTeam = value(row, indexes, "away_team");
    const homeAway = team === homeTeam ? "home" : team === awayTeam ? "away" : null;
    if (!homeAway) throw new Error(`nflverse play-by-play row validation failed for ${gameId}`);
    const key = `${gameId}:${team}`;
    const aggregate = aggregates.get(key) ?? {
      gameId,
      season: options.season,
      seasonType: value(row, indexes, "season_type"),
      week: integer(value(row, indexes, "week"), "week"),
      gameDate: value(row, indexes, "game_date"),
      team,
      opponent,
      homeAway,
      plays: 0,
      epa: 0,
      successes: 0,
      explosives: 0,
      turnovers: 0,
      dropbacks: 0,
      passAttempts: 0,
      rushAttempts: 0,
      expectedPass: 0,
      expectedPassCount: 0,
      passOe: 0,
      passOeCount: 0,
      drives: new Map<string, number>()
    };
    aggregate.plays += 1;
    aggregate.epa += epa;
    aggregate.successes += value(row, indexes, "success") === "1" ? 1 : 0;
    const yards = nullableNumber(value(row, indexes, "yards_gained")) ?? 0;
    const passAttempt = value(row, indexes, "pass_attempt") === "1";
    const rushAttempt = value(row, indexes, "rush_attempt") === "1";
    aggregate.explosives += (passAttempt && yards >= 20) || (rushAttempt && yards >= 10) ? 1 : 0;
    aggregate.turnovers += (nullableNumber(value(row, indexes, "interception")) ?? 0)
      + (nullableNumber(value(row, indexes, "fumble_lost")) ?? 0);
    aggregate.dropbacks += value(row, indexes, "qb_dropback") === "1" ? 1 : 0;
    aggregate.passAttempts += passAttempt ? 1 : 0;
    aggregate.rushAttempts += rushAttempt ? 1 : 0;
    const expectedPass = nullableNumber(value(row, indexes, "xpass"));
    if (expectedPass !== null) {
      aggregate.expectedPass += expectedPass;
      aggregate.expectedPassCount += 1;
    }
    const passOe = nullableNumber(value(row, indexes, "pass_oe"));
    if (passOe !== null) {
      aggregate.passOe += passOe / 100;
      aggregate.passOeCount += 1;
    }
    const drive = value(row, indexes, "fixed_drive");
    const driveSeconds = possessionSeconds(value(row, indexes, "drive_time_of_possession"));
    if (drive && driveSeconds !== null) aggregate.drives.set(drive, driveSeconds);
    aggregates.set(key, aggregate);
  }

  if (sourceRows === 0) throw new Error(`nflverse play-by-play ${options.season} returned no plays`);
  const minimumTeamGames = options.season < options.currentSeason ? 500 : 2;
  if (aggregates.size < minimumTeamGames) {
    throw new Error(`nflverse play-by-play ${options.season} row-count validation failed: ${aggregates.size} team-games`);
  }

  return [...aggregates.values()].map((aggregate) => {
    const possession = [...aggregate.drives.values()].reduce((sum, seconds) => sum + seconds, 0);
    const neutralPlayCalls = aggregate.dropbacks + aggregate.rushAttempts;
    return {
      id: `${aggregate.gameId}:${aggregate.team}`,
      gameId: aggregate.gameId,
      season: aggregate.season,
      seasonType: aggregate.seasonType,
      week: aggregate.week,
      gameDate: aggregate.gameDate,
      team: aggregate.team,
      opponent: aggregate.opponent,
      homeAway: aggregate.homeAway,
      plays: aggregate.plays,
      epaPerPlay: aggregate.epa / aggregate.plays,
      successRate: aggregate.successes / aggregate.plays,
      explosiveRate: aggregate.explosives / aggregate.plays,
      turnovers: aggregate.turnovers,
      turnoverRate: aggregate.turnovers / aggregate.plays,
      secondsPerPlay: possession > 0 ? possession / aggregate.plays : null,
      dropbacks: aggregate.dropbacks,
      passRate: neutralPlayCalls ? aggregate.dropbacks / neutralPlayCalls : aggregate.passAttempts / aggregate.plays,
      expectedPassRate: aggregate.expectedPassCount ? aggregate.expectedPass / aggregate.expectedPassCount : null,
      passRateOverExpectation: aggregate.passOeCount ? aggregate.passOe / aggregate.passOeCount : null
    };
  });
}

export async function parsePlayerStatsCsv(
  stream: ReadableStream<Uint8Array>,
  options: { season: number; currentSeason: number }
): Promise<PlayerWeekStat[]> {
  const iterator = parseCsvStream(stream);
  const first = await iterator.next();
  if (first.done) throw new Error(`nflverse player stats ${options.season} returned no header`);
  const indexes = requireColumns(first.value, playerStatColumns);
  const stats: PlayerWeekStat[] = [];
  const ids = new Set<string>();
  for await (const row of iterator) {
    const season = integer(value(row, indexes, "season"), "season");
    if (season !== options.season) throw new Error(`nflverse player stats season validation failed for ${options.season}`);
    const playerId = value(row, indexes, "player_id");
    const gameId = value(row, indexes, "game_id");
    const team = value(row, indexes, "team");
    const playerDisplayName = value(row, indexes, "player_display_name");
    if (!playerId || !gameId || !team || !playerDisplayName) continue;
    const id = `${gameId}:${playerId}`;
    if (ids.has(id)) throw new Error(`nflverse player stats validation failed: duplicate ${id}`);
    ids.add(id);
    stats.push({
      id,
      playerId,
      playerName: value(row, indexes, "player_name"),
      playerDisplayName,
      position: nullableString(value(row, indexes, "position")),
      season,
      week: integer(value(row, indexes, "week"), "week"),
      seasonType: value(row, indexes, "season_type"),
      gameId,
      team,
      opponent: value(row, indexes, "opponent_team"),
      attempts: nullableNumber(value(row, indexes, "attempts")) ?? 0,
      passingYards: nullableNumber(value(row, indexes, "passing_yards")) ?? 0,
      carries: nullableNumber(value(row, indexes, "carries")) ?? 0,
      rushingYards: nullableNumber(value(row, indexes, "rushing_yards")) ?? 0,
      receptions: nullableNumber(value(row, indexes, "receptions")) ?? 0,
      targets: nullableNumber(value(row, indexes, "targets")) ?? 0,
      receivingYards: nullableNumber(value(row, indexes, "receiving_yards")) ?? 0
    });
  }
  const minimumRows = options.season < options.currentSeason ? 1_000 : 1;
  if (stats.length < minimumRows) {
    throw new Error(`nflverse player stats ${options.season} row-count validation failed: ${stats.length}`);
  }
  return stats;
}
