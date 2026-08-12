import { stableHash } from "@/domain/hash";
import { NFL_TEAM_NAMES, normalizeScheduleTeam } from "@/domain/weekly-slate";

export interface InjuryScheduleGame {
  gameId: string;
  awayTeam: string;
  homeTeam: string;
}

export interface ParsedOfficialInjury {
  id: string;
  gameId: string;
  team: string;
  player: string;
  position: string | null;
  injuries: string | null;
  practiceStatus: string | null;
  gameStatus: string | null;
}

export interface ParsedOfficialInjuryReport {
  season: number;
  week: number;
  coveredTeams: string[];
  gameIds: string[];
  injuries: ParsedOfficialInjury[];
  rawSnapshotHash: string;
}

const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

function decodeHtml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return namedEntities[entity.toLowerCase()] ?? match;
  });
}

function text(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function nullable(value: string): string | null {
  const cleaned = text(value);
  return cleaned.length ? cleaned : null;
}

function units(html: string): string[] {
  const starts = [...html.matchAll(/<section\b[^>]*class=["'][^"']*\bnfl-o-injury-report__unit\b[^"']*["'][^>]*>/gi)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 0);
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function teamFromTitle(title: string): string | null {
  const normalized = text(title).toLowerCase();
  const match = Object.entries(NFL_TEAM_NAMES).find(([, fullName]) => {
    const name = fullName.toLowerCase();
    return normalized === name || normalized === name.split(" ").at(-1);
  });
  return match?.[0] ?? null;
}

function teamTables(unit: string): Array<{ team: string | null; body: string }> {
  const titles = [...unit.matchAll(/<div\b[^>]*class=["'][^"']*\bd3-o-section-sub-title\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi)];
  return titles.flatMap((title, index) => {
    const start = (title.index ?? 0) + title[0].length;
    const end = titles[index + 1]?.index ?? unit.length;
    const table = unit.slice(start, end).match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    return table ? [{ team: teamFromTitle(title[1]), body: table[1] }] : [];
  });
}

function rows(body: string): string[][] {
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1])
  ).filter((cells) => cells.length >= 5);
}

function normalizedPair(teams: readonly string[]): string {
  return teams.map(normalizeScheduleTeam).sort().join(":");
}

export function parseOfficialNflInjuryHtml(input: {
  html: string;
  season: number;
  week: number;
  schedule: readonly InjuryScheduleGame[];
}): ParsedOfficialInjuryReport {
  const heading = input.html.match(/Injuries\s*-\s*WEEK\s+(\d+)/i)
    ?? input.html.match(/Official NFL Injury Report[^<]*Week\s+(\d+)/i);
  if (!heading || Number(heading[1]) !== input.week) {
    throw new Error(`Official NFL injury page does not contain Week ${input.week}`);
  }

  const scheduleByPair = new Map(input.schedule.map((game) => [
    normalizedPair([game.awayTeam, game.homeTeam]),
    { ...game, awayTeam: normalizeScheduleTeam(game.awayTeam), homeTeam: normalizeScheduleTeam(game.homeTeam) }
  ]));
  const foundGames = new Set<string>();
  const coveredTeams = new Set<string>();
  const injuries: ParsedOfficialInjury[] = [];

  for (const unit of units(input.html)) {
    const abbreviations = [...unit.matchAll(/nfl-c-matchup-strip__team-abbreviation[^>]*>\s*([A-Z]{2,3})\s*</gi)]
      .map((match) => normalizeScheduleTeam(match[1]));
    if (abbreviations.length !== 2) throw new Error("Official NFL injury matchup is missing a complete team pair");
    const game = scheduleByPair.get(normalizedPair(abbreviations));
    if (!game) throw new Error(`Official NFL injury matchup is not on the imported schedule: ${abbreviations.join(" at ")}`);
    foundGames.add(game.gameId);
    abbreviations.forEach((team) => coveredTeams.add(team));

    for (const [index, report] of teamTables(unit).entries()) {
      const team = report.team && abbreviations.includes(report.team)
        ? report.team
        : abbreviations[index] ?? null;
      if (!team) throw new Error("Official NFL injury table cannot be assigned to a scheduled team");
      for (const cells of rows(report.body)) {
        const player = text(cells[0]);
        if (!player) throw new Error("Official NFL injury row is missing a player");
        injuries.push({
          id: stableHash({ season: input.season, week: input.week, gameId: game.gameId, team, player }),
          gameId: game.gameId,
          team,
          player,
          position: nullable(cells[1]),
          injuries: nullable(cells[2]),
          practiceStatus: nullable(cells[3]),
          gameStatus: nullable(cells[4])
        });
      }
    }
  }

  const expectedGames = new Set(input.schedule.map((game) => game.gameId));
  const expectedTeams = new Set(input.schedule.flatMap((game) => [
    normalizeScheduleTeam(game.awayTeam),
    normalizeScheduleTeam(game.homeTeam)
  ]));
  if (!foundGames.size) throw new Error(`Official NFL injury reports are not published for Week ${input.week}`);
  if ([...expectedGames].some((gameId) => !foundGames.has(gameId)) || [...expectedTeams].some((team) => !coveredTeams.has(team))) {
    throw new Error("Partial official injury imports are prohibited; preserve the last good snapshot");
  }

  return {
    season: input.season,
    week: input.week,
    coveredTeams: [...coveredTeams].sort(),
    gameIds: [...foundGames].sort(),
    injuries,
    rawSnapshotHash: stableHash(input.html)
  };
}
