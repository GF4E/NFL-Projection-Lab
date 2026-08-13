import type { DataFreshness, JobState, PushDelivery, SystemAlert } from "./types";

export const JOB_SCHEDULE = [
  { name: "data_refresh", pacific: "Tuesday 06:00", essential: true },
  { name: "loop_a", pacific: "Tuesday 06:30", essential: true },
  { name: "loop_b", pacific: "Tuesday 07:00", essential: true },
  { name: "forecast_refresh", pacific: "Tuesday 07:30 + valid snapshots", essential: true },
  { name: "odds_open_sunday", pacific: "Sunday 18:00", essential: true },
  { name: "odds_open_monday", pacific: "Monday 09:00", essential: true },
  { name: "odds_daily", pacific: "Tuesday–Saturday", essential: false },
  { name: "odds_kickoff", pacific: "kickoff −120/−60/−15", essential: true },
  { name: "inactives_roof", pacific: "kickoff −90", essential: true },
  { name: "settlement", pacific: "post-slate", essential: true },
  { name: "credit_meter", pacific: "daily", essential: true }
] as const;

export function deterministicSnapshotKey(parts: {
  provider: string;
  job: string;
  scheduledFor: string;
  gameId?: string;
}): string {
  return [parts.provider, parts.job, parts.scheduledFor, parts.gameId ?? "slate"].join(":");
}

export function failImport<T>(
  state: JobState<T>,
  freshness: Exclude<DataFreshness, "current">,
  message: string,
  now: string
): JobState<T> {
  const alert: SystemAlert = {
    id: `alert:${state.key}:${now}`,
    type: "pipeline_failure",
    severity: freshness === "partial" ? "warning" : "critical",
    message,
    idempotencyKey: `pipeline_failure:${state.key}:${now}`,
    createdAt: now,
    acknowledgedAt: null
  };
  return { ...state, freshness: "stale", lastAttemptAt: now, alert };
}

export function completeImport<T>(state: JobState<T>, value: T, now: string): JobState<T> {
  return {
    ...state,
    freshness: "current",
    lastGoodValue: value,
    lastAttemptAt: now,
    lastSuccessAt: now,
    alert: null
  };
}

export interface KickoffWindow {
  kickoffAt: string;
}

export interface CreditSimulation {
  scheduledCredits: number;
  projectedCredits: number;
  throttled: string[];
  alertAt400: boolean;
  withinCeiling: boolean;
  essentialCredits: number;
}

/**
 * One Odds API request costs regions × markets. The app uses one region and three markets.
 * A billing period is simulated independently because the free quota resets monthly.
 */
export function simulateCreditPeriod(input: {
  kickoffWindows: KickoffWindow[];
  weeklySlates: number;
  weekdaysInSeason: number;
  propGames?: number;
  startingUsage?: number;
  creditCeiling?: number;
}): CreditSimulation {
  const requestCost = 3;
  const startingUsage = input.startingUsage ?? 0;
  const openerRequests = input.weeklySlates * 2;
  const dailyRequests = input.weekdaysInSeason;
  const kickoffRequests = input.kickoffWindows.length * 3;
  const propRequests = input.propGames ?? 0;
  const scheduled = startingUsage + requestCost * (openerRequests + dailyRequests + kickoffRequests + propRequests);
  let projected = scheduled;
  const throttled: string[] = [];
  const ceiling = input.creditCeiling ?? 450;
  if (projected > ceiling) {
    const removableDaily = Math.min(dailyRequests * requestCost, projected - ceiling);
    projected -= removableDaily;
    if (removableDaily > 0) throttled.push("ordinary_tuesday_saturday");
  }
  if (projected > ceiling) {
    const removable120 = Math.min(input.kickoffWindows.length * requestCost, projected - ceiling);
    projected -= removable120;
    if (removable120 > 0) throttled.push("kickoff_minus_120");
  }
  if (projected > ceiling) {
    const removableProps = Math.min(propRequests * requestCost, projected - ceiling);
    projected -= removableProps;
    if (removableProps > 0) throttled.push("player_props");
  }
  if (projected > ceiling) {
    const removable60 = Math.min(input.kickoffWindows.length * requestCost, projected - ceiling);
    projected -= removable60;
    if (removable60 > 0) throttled.push("kickoff_minus_60");
  }
  const essentialCredits = startingUsage + requestCost * (openerRequests + input.kickoffWindows.length);
  return {
    scheduledCredits: scheduled,
    projectedCredits: projected,
    throttled,
    alertAt400: scheduled >= 400,
    withinCeiling: projected <= ceiling && essentialCredits <= ceiling,
    essentialCredits
  };
}

export function assertEssentialCreditBudget(simulation: CreditSimulation): void {
  if (!simulation.withinCeiling) {
    throw new Error("Essential opener and 15-minute close snapshots exceed the 450-credit ceiling");
  }
}

const ALLOWED_PUSH_TYPES = new Set<PushDelivery["type"]>([
  "awaiting_you",
  "edge_threshold"
]);

export function createPushDelivery(input: Omit<PushDelivery, "id" | "state" | "sentAt">): PushDelivery {
  if (!ALLOWED_PUSH_TYPES.has(input.type)) {
    throw new Error("Only Awaiting You and Edge Threshold may use Web Push");
  }
  return {
    ...input,
    id: `push:${input.idempotencyKey}`,
    state: "pending",
    sentAt: null
  };
}

export function deduplicatePushes(deliveries: PushDelivery[]): PushDelivery[] {
  return [...new Map(deliveries.map((delivery) => [delivery.idempotencyKey, delivery])).values()];
}

export function edgeThresholdCrossed(previousEdge: number, currentEdge: number, threshold = 0.03): boolean {
  return Math.abs(previousEdge) < threshold && Math.abs(currentEdge) >= threshold;
}
