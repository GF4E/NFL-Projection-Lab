import {
  futurePriorityReserveCredits,
  requestAllowedAcrossResetScenarios
} from "./odds-quota-budget";
import type { ScheduledGame, ScheduledOddsCandidate } from "./odds-schedule";

/**
 * Applies the schedule-derived OS-19A reservation plan before the atomic D1
 * reservation. Unplanned pseudo-openers and player-prop work fail closed.
 */
export function plannedOddsThrottleReason(
  candidate: ScheduledOddsCandidate,
  games: readonly ScheduledGame[],
  used: number
): string | null {
  if (candidate.job === "props_minus_60") {
    return "Player props are outside the urgent OS-19A quota plan";
  }
  if (!requestAllowedAcrossResetScenarios({ candidate, games })) {
    return "Skipped by the actual-schedule quota reservation plan";
  }
  if (used >= 400 && (candidate.job === "daily" || candidate.job === "kickoff_minus_120")) {
    return "Skipped by the 400-credit throttle";
  }
  if (used + candidate.cost > 450) return "Skipped to preserve the 50-credit reserve";
  return null;
}

export function plannedOddsFutureReserveCredits(
  candidate: ScheduledOddsCandidate,
  games: readonly ScheduledGame[]
): number {
  if (candidate.job === "props_minus_60") return Number.POSITIVE_INFINITY;
  return futurePriorityReserveCredits({ candidate, games });
}
