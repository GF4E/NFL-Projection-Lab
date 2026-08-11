import type { DiscreteMarginArtifact, OddsSnapshot } from "./types";
import {
  powerDevig,
  quoteCostCents,
  reapplyPowerHold
} from "./odds";
import { translateFairProbability } from "./margin";

export interface ClvResult {
  syntheticClosingAmerican: number | null;
  priceClvCents: number | null;
  pointClv: number | null;
  translationWarning: "none" | "interpolated" | "extrapolated" | "unsupported";
}

export function calculateTranslatedClv(input: {
  entryPrice: number;
  entryPoint: number | null;
  closingQuote: OddsSnapshot;
  closingOpponentQuote: OddsSnapshot;
  consensusSpread: number;
  artifact: DiscreteMarginArtifact;
}): ClvResult {
  const { closingQuote, closingOpponentQuote } = input;
  const devig = powerDevig(closingQuote.americanPrice, closingOpponentQuote.americanPrice);
  if (input.entryPoint === null || closingQuote.point === null || closingQuote.market === "moneyline") {
    const synthetic = closingQuote.americanPrice;
    return {
      syntheticClosingAmerican: synthetic,
      priceClvCents: quoteCostCents(synthetic) - quoteCostCents(input.entryPrice),
      pointClv: null,
      translationWarning: "none"
    };
  }
  const translated = translateFairProbability(
    input.artifact,
    input.consensusSpread,
    closingQuote.point,
    input.entryPoint,
    devig.probabilities[0]
  );
  if (translated.probability === null) {
    return {
      syntheticClosingAmerican: null,
      priceClvCents: null,
      pointClv: input.entryPoint - closingQuote.point,
      translationWarning: "unsupported"
    };
  }
  const synthetic = reapplyPowerHold(translated.probability, devig.exponent);
  return {
    syntheticClosingAmerican: synthetic,
    priceClvCents: quoteCostCents(synthetic) - quoteCostCents(input.entryPrice),
    pointClv: input.entryPoint - closingQuote.point,
    translationWarning: translated.warning
  };
}

export function chooseBetterPaperClose<T extends ClvResult & { book: string }>(
  candidates: T[]
): T {
  const supported = candidates.filter((candidate) => candidate.syntheticClosingAmerican !== null);
  if (supported.length === 0) throw new Error("No valid translated closing quote is available");
  return [...supported].sort(
    (left, right) =>
      quoteCostCents(left.syntheticClosingAmerican!) -
      quoteCostCents(right.syntheticClosingAmerican!)
  )[0];
}
