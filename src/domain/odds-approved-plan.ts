import scheduleManifest from "../../config/2026-nfl-schedule.v1.json";
import { stableHash } from "./hash";
import {
  oddsQuotaRequestClass,
  oddsQuotaPeriodKeyAt,
  oddsQuotaRequestPriority,
  RESET_TIMEZONE_OFFSETS_MINUTES,
  simulateAllPublishedResetScenarios,
  type OddsQuotaRequestClass
} from "./odds-quota-budget";
import {
  scheduledSeasonMainlinePlan,
  scheduledSeasonQuotaPlanHash,
  type ScheduledGame,
  type ScheduledOddsCandidate
} from "./odds-schedule";

export interface ApprovedOddsQuotaContract {
  requestKey: string;
  requestClass: OddsQuotaRequestClass;
  reservedCost: number;
  futureReserve: number;
  quotaPlanHash: string;
  allowedAcrossResetScenarios: boolean;
  candidate: ScheduledOddsCandidate;
}

const approvedGames = scheduleManifest.games as readonly ScheduledGame[];
const normalizedGamesHash = stableHash({
  contract: "engine-os.normalized-2026-nfl-schedule.v1",
  games: approvedGames
});
const computedPlanHash = scheduledSeasonQuotaPlanHash(approvedGames);

if (normalizedGamesHash !== scheduleManifest.normalizedGamesSha256) {
  throw new Error("Pinned 2026 NFL schedule does not match its approved normalized-games hash");
}
if (computedPlanHash !== scheduleManifest.quotaPlanSha256) {
  throw new Error("Pinned 2026 Odds quota plan does not match its approved manifest hash");
}

export const APPROVED_ODDS_QUOTA_PLAN_HASH = scheduleManifest.quotaPlanSha256;

const approvedCandidates = scheduledSeasonMainlinePlan(approvedGames);
const futureReserveByKey = new Map(approvedCandidates.map((candidate) => [candidate.key, 0]));
const throttledInAnyResetScenario = new Set(
  simulateAllPublishedResetScenarios(approvedGames)
    .flatMap((scenario) => scenario.periods.flatMap((period) => period.throttledRequestKeys))
);

for (const resetOffsetMinutes of RESET_TIMEZONE_OFFSETS_MINUTES) {
  const periods = new Map<string, ScheduledOddsCandidate[]>();
  for (const candidate of approvedCandidates) {
    const periodKey = oddsQuotaPeriodKeyAt(candidate.scheduledFor, resetOffsetMinutes);
    const period = periods.get(periodKey) ?? [];
    period.push(candidate);
    periods.set(periodKey, period);
  }
  for (const period of periods.values()) {
    period.sort((left, right) =>
      right.scheduledFor.localeCompare(left.scheduledFor) || left.key.localeCompare(right.key));
    const futureCreditsByPriority = new Map<number, number>();
    for (let index = 0; index < period.length;) {
      const scheduledFor = period[index]!.scheduledFor;
      let next = index;
      while (next < period.length && period[next]!.scheduledFor === scheduledFor) next += 1;
      for (const candidate of period.slice(index, next)) {
        const priority = oddsQuotaRequestPriority(candidate.job);
        const reserve = [...futureCreditsByPriority.entries()]
          .filter(([futurePriority]) => futurePriority < priority)
          .reduce((sum, [, credits]) => sum + credits, 0);
        futureReserveByKey.set(
          candidate.key,
          Math.max(futureReserveByKey.get(candidate.key) ?? 0, reserve)
        );
      }
      for (const candidate of period.slice(index, next)) {
        const priority = oddsQuotaRequestPriority(candidate.job);
        futureCreditsByPriority.set(priority, (futureCreditsByPriority.get(priority) ?? 0) + candidate.cost);
      }
      index = next;
    }
  }
}

const approvedContracts = new Map<string, ApprovedOddsQuotaContract>();
for (const candidate of approvedCandidates) {
  const contract = Object.freeze({
    requestKey: candidate.key,
    requestClass: oddsQuotaRequestClass(candidate.job),
    reservedCost: candidate.cost,
    futureReserve: futureReserveByKey.get(candidate.key) ?? 0,
    quotaPlanHash: APPROVED_ODDS_QUOTA_PLAN_HASH,
    allowedAcrossResetScenarios: !throttledInAnyResetScenario.has(candidate.key),
    candidate: Object.freeze({ ...candidate })
  });
  if (approvedContracts.has(contract.requestKey)) {
    throw new Error(`Duplicate approved Odds quota request key: ${contract.requestKey}`);
  }
  approvedContracts.set(contract.requestKey, contract);
}

if (approvedContracts.size !== 480) {
  throw new Error(`Approved Odds quota plan must contain 480 requests, found ${approvedContracts.size}`);
}

export function approvedOddsQuotaPlan(): readonly ApprovedOddsQuotaContract[] {
  return [...approvedContracts.values()];
}

export function approvedOddsQuotaContract(requestKey: string): ApprovedOddsQuotaContract | null {
  return approvedContracts.get(requestKey) ?? null;
}

export function assertApprovedOddsQuotaReservation(input: {
  requestKey: string;
  requestClass: OddsQuotaRequestClass;
  reservedCost: number;
  futureReserve: number;
  quotaPlanHash: string;
}): ApprovedOddsQuotaContract {
  if (input.quotaPlanHash !== APPROVED_ODDS_QUOTA_PLAN_HASH) {
    throw new Error("Odds quota reservation plan hash is not the approved 2026 manifest");
  }
  const approved = approvedOddsQuotaContract(input.requestKey);
  if (!approved) {
    throw new Error("Odds quota request is absent from the approved 2026 manifest");
  }
  if (!approved.allowedAcrossResetScenarios) {
    throw new Error("Odds quota request is throttled by at least one approved reset scenario");
  }
  if (
    input.requestClass !== approved.requestClass ||
    input.reservedCost !== approved.reservedCost ||
    input.futureReserve !== approved.futureReserve
  ) {
    throw new Error("Odds quota request contract differs from the approved 2026 manifest");
  }
  return approved;
}
