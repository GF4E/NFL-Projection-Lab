import { deterministicSnapshotKey } from "./automation";
import { tuesdayForecastOrigin } from "./engine-os";
import { stableHash } from "./hash";

export type OddsAutomationJob =
  | "open_sunday"
  | "open_monday"
  | "tuesday_origin"
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
  completeGameIds: string[];
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
  week: number;
  away: string;
  home: string;
  kickoffAt: string;
}

export type ScheduledRunStatus = "running" | "succeeded" | "failed" | "skipped";

const SLOT_WINDOW_MS = 15 * 60_000;
const PROP_RETRY_WINDOW_MS = 50 * 60_000;
const REQUEST_COST = 3;
const RECOVERY_LOOKBACK_MS = 8 * 86_400_000;
const PACIFIC_TIME_ZONE = "America/Los_Angeles";

export function scheduledSnapshotQuoteFresh(input: {
  capturedAt: string | null;
  generatedAt: string;
  kickoffAt: string;
  latestSnapshotIncludesGame: boolean;
  nearKickoffMaximumAgeMinutes: number;
  betweenSnapshotsMaximumAgeMinutes: number;
}): boolean {
  if (!input.latestSnapshotIncludesGame || input.capturedAt === null) return false;
  const generated = Date.parse(input.generatedAt);
  const captured = Date.parse(input.capturedAt);
  const kickoff = Date.parse(input.kickoffAt);
  if (![generated, captured, kickoff].every(Number.isFinite) || captured > generated) return false;
  const minutesToKickoff = (kickoff - generated) / 60_000;
  const maximumAge = minutesToKickoff <= 180
    ? input.nearKickoffMaximumAgeMinutes
    : input.betweenSnapshotsMaximumAgeMinutes;
  return (generated - captured) / 60_000 <= maximumAge;
}

function pacificParts(date: Date): { dayKey: string; weekday: string; minuteOfDay: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
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

function localDateTimeToUtc(dayKey: string, hour: number, minute: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const represented = pacificParts(new Date(candidate));
    const [representedYear, representedMonth, representedDay] = represented.dayKey.split("-").map(Number);
    const representedAsUtc = Date.UTC(
      representedYear,
      representedMonth - 1,
      representedDay,
      Math.floor(represented.minuteOfDay / 60),
      represented.minuteOfDay % 60,
      0
    );
    candidate += target - representedAsUtc;
  }
  return new Date(candidate).toISOString();
}

function shiftDay(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function mainlineCandidate(
  job: Exclude<OddsAutomationJob, "props_minus_60">,
  scheduledFor: string,
  priority: number
): ScheduledOddsCandidate {
  return {
    key: deterministicSnapshotKey({ provider: "the-odds-api", job, scheduledFor }),
    job,
    scheduledFor,
    gameId: null,
    cost: REQUEST_COST,
    priority
  };
}

/**
 * Expands the exact season schedule into one deterministic mainline request
 * manifest. Tuesday's 07:30 scientific-origin snapshot replaces that day's
 * ordinary 09:00 poll; it is not an additional request. Openers are tied to
 * the 18 NFL week origins, preventing the former pre-season pseudo-openers.
 */
export function scheduledSeasonMainlinePlan(games: readonly ScheduledGame[]): ScheduledOddsCandidate[] {
  if (!games.length) return [];
  const byWeek = new Map<number, ScheduledGame[]>();
  const gameIds = new Set<string>();
  for (const game of games) {
    if (!game.id.trim() || gameIds.has(game.id)) throw new Error(`Duplicate or blank scheduled game ID: ${game.id}`);
    gameIds.add(game.id);
    if (!Number.isInteger(game.week) || game.week < 1 || game.week > 18) {
      throw new Error(`Invalid regular-season week for ${game.id}`);
    }
    if (!game.away.trim() || !game.home.trim() || game.away === game.home) {
      throw new Error(`Invalid team identity for ${game.id}`);
    }
    const kickoff = Date.parse(game.kickoffAt);
    if (!Number.isFinite(kickoff) || new Date(kickoff).toISOString() !== game.kickoffAt) {
      throw new Error(`Invalid canonical kickoff for ${game.id}`);
    }
    const group = byWeek.get(game.week) ?? [];
    group.push(game);
    byWeek.set(game.week, group);
  }
  const plan: ScheduledOddsCandidate[] = [];
  const originDays = new Set<string>();
  for (const [week, weekGames] of [...byWeek.entries()].sort(([left], [right]) => left - right)) {
    const origins = new Set(weekGames.map((game) => tuesdayForecastOrigin(game.id, game.kickoffAt).scheduledForUtc));
    if (origins.size !== 1) throw new Error(`NFL Week ${week} does not resolve to one Tuesday origin`);
    const origin = [...origins][0]!;
    const originDay = pacificParts(new Date(origin)).dayKey;
    originDays.add(originDay);
    plan.push(
      mainlineCandidate("open_sunday", localDateTimeToUtc(shiftDay(originDay, -2), 18, 0), 0),
      mainlineCandidate("open_monday", localDateTimeToUtc(shiftDay(originDay, -1), 9, 0), 0),
      mainlineCandidate("tuesday_origin", origin, 0)
    );
  }

  const firstOriginDay = [...originDays].sort()[0]!;
  const lastKickoffDay = pacificParts(new Date(Math.max(...games.map((game) => Date.parse(game.kickoffAt))))).dayKey;
  for (let dayKey = firstOriginDay; dayKey <= lastKickoffDay; dayKey = shiftDay(dayKey, 1)) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short"
    }).format(new Date(`${dayKey}T12:00:00.000Z`));
    if (!["Tue", "Wed", "Thu", "Fri", "Sat"].includes(weekday)) continue;
    if (weekday === "Tue" && originDays.has(dayKey)) continue;
    plan.push(mainlineCandidate("daily", localDateTimeToUtc(dayKey, 9, 0), 4));
  }

  for (const definition of [
    { minutes: 120, job: "kickoff_minus_120" as const, priority: 3 },
    { minutes: 60, job: "kickoff_minus_60" as const, priority: 2 },
    { minutes: 15, job: "kickoff_minus_15" as const, priority: 0 }
  ]) {
    const targets = [...new Set(games.map((game) => Date.parse(game.kickoffAt) - definition.minutes * 60_000))];
    for (const target of targets) {
      plan.push(mainlineCandidate(definition.job, new Date(target).toISOString(), definition.priority));
    }
  }

  const unique = new Set<string>();
  for (const candidate of plan) {
    if (unique.has(candidate.key)) throw new Error(`Duplicate mainline request identity: ${candidate.key}`);
    unique.add(candidate.key);
  }
  return plan.sort((left, right) =>
    left.scheduledFor.localeCompare(right.scheduledFor) || left.priority - right.priority || left.key.localeCompare(right.key));
}

export function scheduledSeasonQuotaPlanHash(games: readonly ScheduledGame[]): string {
  const scheduleIdentity = [...games].map((game) => ({
    id: game.id,
    week: game.week,
    kickoffAt: game.kickoffAt
  })).sort((left, right) => left.id.localeCompare(right.id));
  return stableHash({
    contract: "engine-os.2026-odds-quota-plan.v1",
    scheduleIdentity,
    requests: scheduledSeasonMainlinePlan(games)
  });
}

function isDue(now: Date, target: number, windowMs = SLOT_WINDOW_MS): boolean {
  const delta = now.getTime() - target;
  return delta >= 0 && delta < windowMs;
}

export function scheduledMainlineCandidates(now: Date, games: readonly ScheduledGame[]): ScheduledOddsCandidate[] {
  const candidates = scheduledSeasonMainlinePlan(games)
    .filter((candidate) => isDue(now, Date.parse(candidate.scheduledFor)));
  return candidates.sort((left, right) => left.priority - right.priority || left.scheduledFor.localeCompare(right.scheduledFor));
}

/**
 * Finds the most recent mainline snapshot the production schedule should have
 * completed. The five-minute background runner uses this to repair a missed
 * cron tick without creating a second polling cadence or duplicate requests.
 */
export function latestExpectedMainlineCandidate(
  now: Date,
  games: readonly ScheduledGame[]
): ScheduledOddsCandidate | null {
  if (!games.length) return null;
  const firstKickoff = Math.min(...games.map((game) => Date.parse(game.kickoffAt)));
  const lastKickoff = Math.max(...games.map((game) => Date.parse(game.kickoffAt)));
  const nowMs = now.getTime();
  if (nowMs < firstKickoff - 35 * 86_400_000 || nowMs > lastKickoff + 86_400_000) return null;

  const earliest = Math.max(firstKickoff - 35 * 86_400_000, nowMs - RECOVERY_LOOKBACK_MS);
  return scheduledSeasonMainlinePlan(games)
    .filter((candidate) => {
      const scheduled = Date.parse(candidate.scheduledFor);
      return scheduled >= earliest && scheduled <= nowMs;
    })
    .sort((left, right) => right.scheduledFor.localeCompare(left.scheduledFor) ||
      left.priority - right.priority || left.key.localeCompare(right.key))[0] ?? null;
}

export function deterministicRecoveryCandidate(
  candidate: ScheduledOddsCandidate,
  existingStatus: ScheduledRunStatus | null
): ScheduledOddsCandidate | null {
  // A never-started canonical slot may be caught up under its original key.
  // Failed/ambiguous requests are not retried in the urgent lane because an
  // alternate key is absent from the frozen 2026 quota simulation.
  return existingStatus === null ? candidate : null;
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
  const requiredBooks = ["betmgm", "fanduel"] as const;
  const completeGames = new Set<string>();
  for (const gameId of gameIds) {
    if (requiredBooks.every((book) => {
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
    completeGameIds: gameIds.filter((gameId) => completeGames.has(gameId)),
    missingGameIds: gameIds.filter((gameId) => !completeGames.has(gameId))
  };
}
