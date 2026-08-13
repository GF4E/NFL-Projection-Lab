import { deterministicSnapshotKey } from "./automation";

export type OddsAutomationJob =
  | "open_sunday"
  | "open_monday"
  | "daily"
  | "kickoff_minus_120"
  | "kickoff_minus_60"
  | "kickoff_minus_15"
  | "props_minus_60";

export interface ScheduledOddsCandidate {
  key: string;
  job: OddsAutomationJob;
  scheduledFor: string;
  gameId: string | null;
  cost: number;
  priority: number;
}

export interface MainlineValidationResult {
  complete: boolean;
  completeGames: number;
  totalGames: number;
  missingGameIds: string[];
}

export interface MainlineCompletenessQuote {
  gameId: string;
  book: string;
  market: string;
  side?: string;
}

export interface ScheduledGame {
  id: string;
  away: string;
  home: string;
  kickoffAt: string;
}

const SLOT_WINDOW_MS = 15 * 60_000;
const PROP_RETRY_WINDOW_MS = 50 * 60_000;
const REQUEST_COST = 3;

function pacificParts(date: Date): { dayKey: string; weekday: string; minuteOfDay: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function recurringCandidate(now: Date, games: readonly ScheduledGame[]): ScheduledOddsCandidate | null {
  const firstKickoff = Math.min(...games.map((game) => Date.parse(game.kickoffAt)));
  const lastKickoff = Math.max(...games.map((game) => Date.parse(game.kickoffAt)));
  if (now.getTime() < firstKickoff - 35 * 86_400_000 || now.getTime() > lastKickoff + 86_400_000) return null;
  const pacific = pacificParts(now);
  const definition = pacific.weekday === "Sun"
    ? { job: "open_sunday" as const, minute: 18 * 60 }
    : pacific.weekday === "Mon"
      ? { job: "open_monday" as const, minute: 9 * 60 }
      : ["Tue", "Wed", "Thu", "Fri", "Sat"].includes(pacific.weekday)
        ? { job: "daily" as const, minute: 9 * 60 }
        : null;
  if (!definition || pacific.minuteOfDay < definition.minute || pacific.minuteOfDay >= definition.minute + 15) return null;
  const scheduledFor = `${pacific.dayKey}T${String(Math.floor(definition.minute / 60)).padStart(2, "0")}:${String(definition.minute % 60).padStart(2, "0")}:00[America/Los_Angeles]`;
  return {
    key: deterministicSnapshotKey({ provider: "the-odds-api", job: definition.job, scheduledFor }),
    job: definition.job,
    scheduledFor,
    gameId: null,
    cost: REQUEST_COST,
    priority: definition.job === "daily" ? 5 : 1
  };
}

function isDue(now: Date, target: number, windowMs = SLOT_WINDOW_MS): boolean {
  const delta = now.getTime() - target;
  return delta >= 0 && delta < windowMs;
}

export function scheduledMainlineCandidates(now: Date, games: readonly ScheduledGame[]): ScheduledOddsCandidate[] {
  const candidates: ScheduledOddsCandidate[] = [];
  const recurring = recurringCandidate(now, games);
  if (recurring) candidates.push(recurring);
  const windows = [
    { minutes: 120, job: "kickoff_minus_120" as const, priority: 4 },
    { minutes: 60, job: "kickoff_minus_60" as const, priority: 3 },
    { minutes: 15, job: "kickoff_minus_15" as const, priority: 0 }
  ];
  for (const window of windows) {
    const targets = [...new Set(games.map((game) => Date.parse(game.kickoffAt) - window.minutes * 60_000))];
    for (const target of targets) {
      if (!isDue(now, target)) continue;
      const scheduledFor = new Date(target).toISOString();
      candidates.push({
        key: deterministicSnapshotKey({ provider: "the-odds-api", job: window.job, scheduledFor }),
        job: window.job,
        scheduledFor,
        gameId: null,
        cost: REQUEST_COST,
        priority: window.priority
      });
    }
  }
  return candidates.sort((left, right) => left.priority - right.priority || left.scheduledFor.localeCompare(right.scheduledFor));
}

export function scheduledPropCandidates(now: Date, games: readonly ScheduledGame[]): ScheduledOddsCandidate[] {
  return games.flatMap((game) => {
    const target = Date.parse(game.kickoffAt) - 60 * 60_000;
    if (!isDue(now, target, PROP_RETRY_WINDOW_MS)) return [];
    const scheduledFor = new Date(target).toISOString();
    return [{
      key: deterministicSnapshotKey({ provider: "the-odds-api", job: "props_minus_60", scheduledFor, gameId: game.id }),
      job: "props_minus_60" as const,
      scheduledFor,
      gameId: game.id,
      cost: REQUEST_COST,
      priority: 2
    }];
  });
}

export function inspectMainlineCompleteness(lines: readonly MainlineCompletenessQuote[], gameIds: readonly string[]): MainlineValidationResult {
  const requiredMarkets = new Set(["spread", "total", "moneyline"]);
  const completeGames = new Set<string>();
  for (const gameId of gameIds) {
    const books = [...new Set(lines.filter((line) => line.gameId === gameId).map((line) => line.book))];
    if (books.some((book) => {
      const bookLines = lines.filter((line) => line.gameId === gameId && line.book === book);
      return [...requiredMarkets].every((market) => {
        const marketLines = bookLines.filter((line) => line.market === market);
        return marketLines.length === 2 && new Set(marketLines.map((line) => line.side)).size === 2;
      });
    })) completeGames.add(gameId);
  }
  return {
    complete: completeGames.size === gameIds.length,
    completeGames: completeGames.size,
    totalGames: gameIds.length,
    missingGameIds: gameIds.filter((gameId) => !completeGames.has(gameId))
  };
}
