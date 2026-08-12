export const NFL_TEAM_NAMES: Record<string, string> = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills",
  CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
  HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs",
  LV: "Las Vegas Raiders", LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams", MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
  NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders"
};

export interface WeeklyMatchup {
  id: string;
  sourceGameId: string;
  season: number;
  week: number;
  kickoffAt: string;
  day: string;
  away: string;
  awayName: string;
  home: string;
  homeName: string;
  venue: string;
  network: string;
  consensusHomePoint: number | null;
}

export interface WeeklySlate {
  season: number;
  week: number;
  generatedAt: string;
  games: WeeklyMatchup[];
}

export function normalizeScheduleTeam(team: string): string {
  return team === "LA" ? "LAR" : team;
}

export function boardGameId(away: string, home: string): string {
  return `${normalizeScheduleTeam(away).toLowerCase()}-${normalizeScheduleTeam(home).toLowerCase()}`;
}

function zonedParts(date: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

export function easternScheduleTimeToIso(gameDate: string, gameTime: string): string {
  const [year, month, day] = gameDate.split("-").map(Number);
  const [hour, minute] = gameTime.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) throw new Error("Invalid nflverse kickoff timestamp");
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = targetAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = zonedParts(new Date(candidate), "America/New_York");
    const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    candidate += targetAsUtc - representedAsUtc;
  }
  return new Date(candidate).toISOString();
}

export function chooseActiveWeek(weeks: Array<{ week: number; lastGameDate: string }>, today: string): number {
  if (!weeks.length) throw new Error("The regular-season schedule is empty");
  const ordered = [...weeks].sort((left, right) => left.week - right.week);
  return ordered.find((row) => row.lastGameDate >= today)?.week ?? ordered.at(-1)!.week;
}
