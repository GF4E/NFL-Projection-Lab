import { structuralConfig } from "./config";
import { americanToDecimal } from "./odds";
import { priceTwoTeamTeaser } from "./decision-board";
import { sizeKelly } from "./sizing";
import type { PlayForecastLegSnapshot, WeeklyPlay } from "./play-card";

export interface IndependentParlayDecision {
  betProbability: number;
  probabilityInterval: [number, number];
  edgeInterval: [number, number];
  expectedValue: number;
  sizing: ReturnType<typeof sizeKelly>;
}

/**
 * Prices only different-game parlay legs with no push path. This keeps the
 * combined contract binary, so quarter-Kelly remains defined by the same
 * shrunk-probability rule used for a straight. Correlated and push-path
 * parlays are deliberately withheld until those outcome trees are validated.
 */
export function priceIndependentParlayDecision(
  legs: readonly Pick<PlayForecastLegSnapshot, "betProbability" | "pushProbability" | "uncertaintyInterval">[],
  offeredAmerican: number
): IndependentParlayDecision | null {
  if (legs.length < 2 || legs.some((leg) =>
    leg.betProbability === null || leg.pushProbability !== 0 || leg.uncertaintyInterval === null ||
    !Number.isFinite(leg.betProbability) || leg.betProbability <= 0 || leg.betProbability >= 1 ||
    leg.uncertaintyInterval.some((probability) => !Number.isFinite(probability) || probability <= 0 || probability >= 1) ||
    leg.uncertaintyInterval[0] > leg.uncertaintyInterval[1] ||
    leg.betProbability < leg.uncertaintyInterval[0] || leg.betProbability > leg.uncertaintyInterval[1]
  )) return null;
  const betProbability = legs.reduce((product, leg) => product * leg.betProbability!, 1);
  const probabilityInterval: [number, number] = [
    legs.reduce((product, leg) => product * leg.uncertaintyInterval![0], 1),
    legs.reduce((product, leg) => product * leg.uncertaintyInterval![1], 1)
  ];
  const decimal = americanToDecimal(offeredAmerican);
  const breakEvenProbability = 1 / decimal;
  const edgeInterval: [number, number] = [
    probabilityInterval[0] - breakEvenProbability,
    probabilityInterval[1] - breakEvenProbability
  ];
  return {
    betProbability,
    probabilityInterval,
    edgeInterval,
    expectedValue: betProbability * decimal - 1,
    sizing: sizeKelly(betProbability, offeredAmerican, edgeInterval, {
      referenceBankrollUnits: structuralConfig.sizing.referenceBankrollUnits,
      kellyFraction: structuralConfig.sizing.kellyFraction,
      increment: structuralConfig.sizing.roundDownUnits,
      minimum: structuralConfig.sizing.minimumUnits,
      maximum: structuralConfig.sizing.maximumUnits
    })
  };
}

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
  if (input.legs.every((leg) => leg.pushProbability === 0)) {
    const betProbability = input.legs.reduce((product, leg) => product * leg.betProbability!, 1);
    return betProbability * americanToDecimal(input.americanOdds) - 1;
  }
  return input.legs.reduce((expectedReturn, leg) => expectedReturn * (
    leg.pushProbability! +
    (1 - leg.pushProbability!) * leg.betProbability! * americanToDecimal(leg.americanPrice)
  ), 1) - 1;
}
