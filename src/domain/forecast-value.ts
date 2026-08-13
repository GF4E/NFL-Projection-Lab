import { americanToDecimal } from "./odds";
import { priceTwoTeamTeaser } from "./decision-board";
import type { PlayForecastLegSnapshot, WeeklyPlay } from "./play-card";

/** Recomputes combined value from server-resolved contract legs, never UI-supplied EV. */
export function authoritativeContractExpectedValue(input: {
  playType: WeeklyPlay["playType"];
  americanOdds: number;
  legs: readonly PlayForecastLegSnapshot[];
}): number | null {
  if (input.playType === "teaser") {
    return priceTwoTeamTeaser(input.legs.map((leg) => ({
      conditionalWinProbability: leg.betProbability ?? Number.NaN,
      pushProbability: leg.pushProbability ?? Number.NaN
    })), input.americanOdds)?.expectedValue ?? null;
  }
  if (input.playType === "single") return input.legs.length === 1 ? input.legs[0].expectedValue : null;
  if (input.legs.length < 2 || input.legs.some((leg) => leg.betProbability === null || leg.pushProbability === null)) {
    return null;
  }
  return input.legs.reduce((expectedReturn, leg) => expectedReturn * (
    leg.pushProbability! +
    (1 - leg.pushProbability!) * leg.betProbability! * americanToDecimal(leg.americanPrice)
  ), 1) - 1;
}
