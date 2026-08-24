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
  allowedRequests: {
    openers: number;
    daily: number;
    kickoffMinus120: number;
    kickoffMinus60: number;
    kickoffMinus15: number;
    props: number;
  };
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
  const kickoffWindowRequests = input.kickoffWindows.length;
  const kickoffRequests = kickoffWindowRequests * 3;
  const propRequests = input.propGames ?? 0;
  const scheduled = startingUsage + requestCost * (openerRequests + dailyRequests + kickoffRequests + propRequests);
  const ceiling = input.creditCeiling ?? 450;
  let remainingRequests = Math.max(0, Math.floor((ceiling - startingUsage) / requestCost));
  const allowedOpeners = Math.min(openerRequests, remainingRequests);
  remainingRequests -= allowedOpeners;
  const allowed15 = Math.min(kickoffWindowRequests, remainingRequests);
  remainingRequests -= allowed15;
  const allowedProps = Math.min(propRequests, remainingRequests);
  remainingRequests -= allowedProps;
  const allowed60 = Math.min(kickoffWindowRequests, remainingRequests);
  remainingRequests -= allowed60;
  const allowed120 = Math.min(kickoffWindowRequests, remainingRequests);
  remainingRequests -= allowed120;
  const allowedDaily = Math.min(dailyRequests, remainingRequests);
  const allowedRequests = {
    openers: allowedOpeners,
    daily: allowedDaily,
    kickoffMinus120: allowed120,
    kickoffMinus60: allowed60,
    kickoffMinus15: allowed15,
    props: allowedProps
  };
  const projected = startingUsage + requestCost * Object.values(allowedRequests).reduce((sum, count) => sum + count, 0);
  const throttled: string[] = [];
  if (allowedDaily < dailyRequests) throttled.push("ordinary_tuesday_saturday");
  if (allowed120 < kickoffWindowRequests) throttled.push("kickoff_minus_120");
  if (allowed60 < kickoffWindowRequests) throttled.push("kickoff_minus_60");
  if (allowedProps < propRequests) throttled.push("player_props");
  const essentialCredits = startingUsage + requestCost * (openerRequests + kickoffWindowRequests);
  return {
    scheduledCredits: scheduled,
    projectedCredits: projected,
    throttled,
    alertAt400: scheduled >= 400,
    withinCeiling: projected <= ceiling && essentialCredits <= ceiling && allowedOpeners === openerRequests && allowed15 === kickoffWindowRequests,
    essentialCredits,
    allowedRequests
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
