import type { DiscreteMarginArtifact, DiscreteTotalArtifact, OddsSnapshot } from "./types";
import {
  powerDevig,
  quoteCostCents,
  reapplyPowerHold
} from "./odds";
import { translateFairProbability } from "./margin";
import { translateTotalFairProbability } from "./total";

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
  totalArtifact?: DiscreteTotalArtifact;
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
  const translated = closingQuote.market === "total" && input.totalArtifact
    ? translateTotalFairProbability(
        input.totalArtifact,
        input.consensusSpread,
        closingQuote.point,
        input.entryPoint,
        closingQuote.side.toLowerCase() === "over" ? devig.probabilities[0] : devig.probabilities[1]
      )
    : translateFairProbability(
        input.artifact,
        input.consensusSpread,
        closingQuote.point,
        input.entryPoint,
        devig.probabilities[0]
      );
  if (translated.probability === null) {
    const pointClv = closingQuote.market === "total"
      ? closingQuote.side.toLowerCase() === "over"
        ? closingQuote.point - input.entryPoint
        : input.entryPoint - closingQuote.point
      : input.entryPoint - closingQuote.point;
    return {
      syntheticClosingAmerican: null,
      priceClvCents: null,
      pointClv,
      translationWarning: "unsupported"
    };
  }
  const selectedProbability = closingQuote.market === "total" && input.totalArtifact && closingQuote.side.toLowerCase() === "under"
    ? 1 - translated.probability
    : translated.probability;
  const synthetic = reapplyPowerHold(selectedProbability, devig.exponent);
  const pointClv = closingQuote.market === "total"
    ? closingQuote.side.toLowerCase() === "over"
      ? closingQuote.point - input.entryPoint
      : input.entryPoint - closingQuote.point
    : input.entryPoint - closingQuote.point;
  return {
    syntheticClosingAmerican: synthetic,
    priceClvCents: quoteCostCents(synthetic) - quoteCostCents(input.entryPrice),
    pointClv,
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
