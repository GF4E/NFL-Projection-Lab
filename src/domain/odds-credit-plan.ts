import creditConfig from "../../config/2026-credit-simulation.json";
import { simulateCreditPeriod } from "./automation";
import type { ScheduledGame, ScheduledOddsCandidate } from "./odds-schedule";

function scheduledOrdinal(candidate: ScheduledOddsCandidate, games: readonly ScheduledGame[]): number {
  const month = candidate.scheduledFor.slice(0, 7);
  if (candidate.job === "props_minus_60") {
    return games.map((game) => ({
      scheduledFor: new Date(Date.parse(game.kickoffAt) - 60 * 60_000).toISOString(),
      gameId: game.id
    })).filter((item) => item.scheduledFor.startsWith(month))
      .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor) || left.gameId.localeCompare(right.gameId))
      .findIndex((item) => item.scheduledFor === candidate.scheduledFor && item.gameId === candidate.gameId);
  }
  if (candidate.job === "kickoff_minus_60" || candidate.job === "kickoff_minus_120") {
    const minutes = candidate.job === "kickoff_minus_60" ? 60 : 120;
    const windows = [...new Set(games.map((game) => new Date(Date.parse(game.kickoffAt) - minutes * 60_000).toISOString()))]
      .filter((scheduledFor) => scheduledFor.startsWith(month))
      .sort();
    return windows.indexOf(candidate.scheduledFor);
  }
  return 0;
}

export function plannedOddsThrottleReason(
  candidate: ScheduledOddsCandidate,
  games: readonly ScheduledGame[],
  used: number
): string | null {
  const period = creditConfig.billingPeriods.find((item) => candidate.scheduledFor.startsWith(item.month));
  if (period) {
    const allocation = simulateCreditPeriod({
      kickoffWindows: Array.from({ length: period.kickoffWindows }, () => ({ kickoffAt: `${period.month}-01T00:00:00Z` })),
      weeklySlates: period.weeklySlates,
      weekdaysInSeason: period.ordinaryWeekdaySnapshots,
      propGames: period.propGames
    }).allowedRequests;
    const allowance = candidate.job === "daily" ? allocation.daily
      : candidate.job === "kickoff_minus_120" ? allocation.kickoffMinus120
        : candidate.job === "kickoff_minus_60" ? allocation.kickoffMinus60
          : candidate.job === "props_minus_60" ? allocation.props
            : Number.POSITIVE_INFINITY;
    const ordinal = scheduledOrdinal(candidate, games);
    if (ordinal < 0 || ordinal >= allowance) return `Skipped by the ${period.month} credit reservation plan`;
  }
  if (used >= 400 && (candidate.job === "daily" || candidate.job === "kickoff_minus_120")) {
    return "Skipped by the 400-credit throttle";
  }
  if (used + candidate.cost > 450) return "Skipped to preserve the 50-credit reserve";
  return null;
}
