import { engineOperatingContract } from "./engine-os-contracts";
import {
  scheduledSeasonMainlinePlan,
  type OddsAutomationJob,
  type ScheduledGame,
  type ScheduledOddsCandidate
} from "./odds-schedule";

const budget = engineOperatingContract.providerBudgets.theOddsApi;

export type OddsQuotaRequestClass =
  | "opener"
  | "scientific_origin"
  | "kickoff_minus_15"
  | "kickoff_minus_60"
  | "kickoff_minus_120"
  | "ordinary";

export interface QuotaPeriodSimulation {
  periodKey: string;
  resetOffsetMinutes: number;
  requestCount: number;
  scheduledCredits: number;
  projectedCredits: number;
  alertRequired: boolean;
  withinCeiling: boolean;
  allowedRequestKeys: string[];
  throttledRequestKeys: string[];
  throttledJobs: OddsAutomationJob[];
}

export interface QuotaScheduleSimulation {
  resetOffsetMinutes: number;
  periods: QuotaPeriodSimulation[];
  withinCeiling: boolean;
  allAlwaysPreserved: boolean;
}

const RESET_OFFSET_MINIMUM = -12 * 60;
const RESET_OFFSET_MAXIMUM = 14 * 60;
const RESET_OFFSET_STEP = 15;

export const RESET_TIMEZONE_OFFSETS_MINUTES = Array.from(
  { length: (RESET_OFFSET_MAXIMUM - RESET_OFFSET_MINIMUM) / RESET_OFFSET_STEP + 1 },
  (_, index) => RESET_OFFSET_MINIMUM + index * RESET_OFFSET_STEP
);

export function oddsQuotaRequestClass(job: OddsAutomationJob): OddsQuotaRequestClass {
  switch (job) {
    case "open_sunday":
    case "open_monday":
      return "opener";
    case "tuesday_origin":
      return "scientific_origin";
    case "kickoff_minus_15":
      return "kickoff_minus_15";
    case "kickoff_minus_60":
      return "kickoff_minus_60";
    case "kickoff_minus_120":
      return "kickoff_minus_120";
    case "daily":
      return "ordinary";
    case "props_minus_60":
      throw new Error("Player props are excluded from the urgent OS-19A quota plan");
  }
}

export function oddsQuotaPeriodKeyAt(instant: string, resetOffsetMinutes: number): string {
  const parsed = Date.parse(instant);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid quota request instant: ${instant}`);
  return new Date(parsed + resetOffsetMinutes * 60_000).toISOString().slice(0, 7);
}

function alwaysPreserved(job: OddsAutomationJob): boolean {
  return job === "open_sunday" || job === "open_monday" ||
    job === "tuesday_origin" || job === "kickoff_minus_15";
}

export function oddsQuotaRequestPriority(job: OddsAutomationJob): number {
  switch (job) {
    case "open_sunday":
    case "open_monday":
    case "tuesday_origin":
    case "kickoff_minus_15":
      return 0;
    case "kickoff_minus_60":
      return 1;
    case "kickoff_minus_120":
      return 2;
    case "daily":
      return 3;
    case "props_minus_60":
      throw new Error("Player props are excluded from the urgent OS-19A quota plan");
  }
}

function sameCandidateContract(left: ScheduledOddsCandidate, right: ScheduledOddsCandidate): boolean {
  return left.key === right.key && left.job === right.job && left.scheduledFor === right.scheduledFor &&
    left.gameId === right.gameId && left.cost === right.cost && left.priority === right.priority;
}

function simulatePeriod(
  periodKey: string,
  requests: readonly ScheduledOddsCandidate[],
  resetOffsetMinutes: number,
  startingUsage: number
): QuotaPeriodSimulation {
  const unique = new Map(requests.map((request) => [request.key, request]));
  if (unique.size !== requests.length) throw new Error(`Duplicate quota request identity in ${periodKey}`);
  const ordered = [...requests].sort((left, right) =>
    oddsQuotaRequestPriority(left.job) - oddsQuotaRequestPriority(right.job) ||
    left.scheduledFor.localeCompare(right.scheduledFor) || left.key.localeCompare(right.key));
  const allowedRequestKeys: string[] = [];
  const throttledRequestKeys: string[] = [];
  let projectedCredits = startingUsage;
  for (const request of ordered) {
    const classCeiling = oddsQuotaRequestPriority(request.job) >= 2
      ? budget.alertAtCredits
      : budget.hardCeilingCredits;
    if (projectedCredits + request.cost <= classCeiling) {
      projectedCredits += request.cost;
      allowedRequestKeys.push(request.key);
    } else {
      throttledRequestKeys.push(request.key);
    }
  }
  const allowed = new Set(allowedRequestKeys);
  const throttledJobs = [...new Set(ordered.filter((request) => !allowed.has(request.key)).map((request) => request.job))];
  const scheduledCredits = startingUsage + ordered.reduce((sum, request) => sum + request.cost, 0);
  const allAlwaysPreserved = ordered.filter((request) => alwaysPreserved(request.job))
    .every((request) => allowed.has(request.key));
  return {
    periodKey,
    resetOffsetMinutes,
    requestCount: ordered.length,
    scheduledCredits,
    projectedCredits,
    alertRequired: projectedCredits >= budget.alertAtCredits || scheduledCredits >= budget.alertAtCredits,
    withinCeiling: projectedCredits <= budget.hardCeilingCredits && allAlwaysPreserved,
    allowedRequestKeys,
    throttledRequestKeys,
    throttledJobs
  };
}

export function simulateQuotaSchedule(input: {
  plan: readonly ScheduledOddsCandidate[];
  resetOffsetMinutes: number;
  startingUsageByPeriod?: Readonly<Record<string, number>>;
}): QuotaScheduleSimulation {
  const periods = new Map<string, ScheduledOddsCandidate[]>();
  for (const request of input.plan) {
    if (request.job === "props_minus_60") {
      throw new Error("Player props are excluded from the urgent OS-19A quota plan");
    }
    const periodKey = oddsQuotaPeriodKeyAt(request.scheduledFor, input.resetOffsetMinutes);
    const rows = periods.get(periodKey) ?? [];
    rows.push(request);
    periods.set(periodKey, rows);
  }
  const simulations = [...periods.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([periodKey, requests]) => simulatePeriod(
      periodKey,
      requests,
      input.resetOffsetMinutes,
      input.startingUsageByPeriod?.[periodKey] ?? 0
    ));
  return {
    resetOffsetMinutes: input.resetOffsetMinutes,
    periods: simulations,
    withinCeiling: simulations.every((period) => period.withinCeiling),
    allAlwaysPreserved: simulations.every((period) =>
      period.withinCeiling && !period.throttledJobs.some((job) => alwaysPreserved(job)))
  };
}

export function simulateAllPublishedResetScenarios(
  games: readonly ScheduledGame[]
): QuotaScheduleSimulation[] {
  const plan = scheduledSeasonMainlinePlan(games);
  return RESET_TIMEZONE_OFFSETS_MINUTES.map((resetOffsetMinutes) =>
    simulateQuotaSchedule({ plan, resetOffsetMinutes }));
}

export function requestAllowedAcrossResetScenarios(input: {
  candidate: ScheduledOddsCandidate;
  games: readonly ScheduledGame[];
}): boolean {
  const plan = scheduledSeasonMainlinePlan(input.games);
  const canonical = plan.find((request) => sameCandidateContract(request, input.candidate));
  if (!canonical) return false;
  return RESET_TIMEZONE_OFFSETS_MINUTES.every((resetOffsetMinutes) => {
    const simulation = simulateQuotaSchedule({ plan, resetOffsetMinutes });
    const periodKey = oddsQuotaPeriodKeyAt(canonical.scheduledFor, resetOffsetMinutes);
    return simulation.periods.find((period) => period.periodKey === periodKey)
      ?.allowedRequestKeys.includes(canonical.key) === true;
  });
}

/**
 * Capacity that must remain available for later, higher-priority work in the
 * candidate's provider-reset period. We take the maximum across every
 * 15-minute UTC offset because the provider documents first-of-month resets
 * but does not publish the reset timezone.
 */
export function futurePriorityReserveCredits(input: {
  candidate: ScheduledOddsCandidate;
  games: readonly ScheduledGame[];
}): number {
  const plan = scheduledSeasonMainlinePlan(input.games);
  const canonical = plan.find((request) => sameCandidateContract(request, input.candidate));
  if (!canonical) throw new Error("Unplanned Odds API request cannot consume reserved capacity");
  const candidatePriority = oddsQuotaRequestPriority(input.candidate.job);
  let maximum = 0;
  for (const resetOffsetMinutes of RESET_TIMEZONE_OFFSETS_MINUTES) {
    const periodKey = oddsQuotaPeriodKeyAt(input.candidate.scheduledFor, resetOffsetMinutes);
    const reserve = plan.filter((request) =>
      oddsQuotaPeriodKeyAt(request.scheduledFor, resetOffsetMinutes) === periodKey &&
      request.scheduledFor > input.candidate.scheduledFor &&
      oddsQuotaRequestPriority(request.job) < candidatePriority)
      .reduce((sum, request) => sum + request.cost, 0);
    maximum = Math.max(maximum, reserve);
  }
  return maximum;
}
