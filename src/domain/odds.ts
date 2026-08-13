import type {
  BookEvaluation,
  DiscreteMarginArtifact,
  OddsSnapshot
} from "./types";
import { translateFairProbability } from "./margin";

const EPSILON = 1e-9;

export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) {
    throw new Error("American odds must be finite and non-zero");
  }
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function americanToImplied(american: number): number {
  return 1 / americanToDecimal(american);
}

export function impliedToAmerican(probability: number): number {
  if (!(probability > 0 && probability < 1)) {
    throw new Error("Probability must be strictly between zero and one");
  }
  const decimal = 1 / probability;
  const american = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
  return Math.round(american * 100) / 100;
}

export interface PowerDevigResult {
  probabilities: [number, number];
  exponent: number;
  rawImplied: [number, number];
}

export function powerDevig(firstAmerican: number, secondAmerican: number): PowerDevigResult {
  const raw: [number, number] = [
    americanToImplied(firstAmerican),
    americanToImplied(secondAmerican)
  ];
  const f = (k: number) => raw[0] ** k + raw[1] ** k - 1;
  let low = 0.01;
  let high = 20;
  if (f(low) < 0 || f(high) > 0) {
    throw new Error("Power-method root is not bracketed for this market");
  }
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2;
    if (f(middle) > 0) low = middle;
    else high = middle;
  }
  const exponent = (low + high) / 2;
  const powered: [number, number] = [raw[0] ** exponent, raw[1] ** exponent];
  const sum = powered[0] + powered[1];
  return {
    probabilities: [powered[0] / sum, powered[1] / sum],
    exponent,
    rawImplied: raw
  };
}

export function reapplyPowerHold(fairProbability: number, exponent: number): number {
  const rawImplied = Math.max(EPSILON, Math.min(1 - EPSILON, fairProbability)) ** (1 / exponent);
  return impliedToAmerican(rawImplied);
}

export function shrinkProbability(
  modelProbability: number,
  marketProbability: number,
  weight: number
): number {
  if (weight < 0 || weight > 1) throw new Error("Shrinkage weight must be in [0, 1]");
  return weight * modelProbability + (1 - weight) * marketProbability;
}

export function expectedValue(probability: number, americanPrice: number): number {
  return probability * americanToDecimal(americanPrice) - 1;
}

export function expectedValueWithPush(
  conditionalWinProbability: number,
  pushProbability: number,
  americanPrice: number
): number {
  if (pushProbability < 0 || pushProbability >= 1) {
    throw new Error("Push probability must be in [0, 1)");
  }
  return (1 - pushProbability) * expectedValue(conditionalWinProbability, americanPrice);
}

export function quoteCostCents(americanPrice: number): number {
  return americanToImplied(americanPrice) * 100;
}

export interface BookEvaluationInput {
  quote: OddsSnapshot;
  opposingQuote: OddsSnapshot;
  canonicalPoint: number | null;
  consensusSpread: number;
  canonicalShrunkProbability: number;
  canonicalMarketProbability: number;
  uncertaintyInterval: [number, number];
  artifact: DiscreteMarginArtifact;
}

export function evaluateBook(input: BookEvaluationInput): BookEvaluation {
  const { quote, opposingQuote } = input;
  if (quote.book !== opposingQuote.book || quote.market !== opposingQuote.market) {
    throw new Error("Power de-vig requires the opposing side of the same book and market");
  }
  const devig = powerDevig(quote.americanPrice, opposingQuote.americanPrice);
  const point = quote.point;
  if (point === null || input.canonicalPoint === null || quote.market === "moneyline") {
    const probability = quote.market === "moneyline" ? input.canonicalShrunkProbability : null;
    return {
      book: quote.book,
      rawQuote: quote,
      opposingQuote,
      canonicalPoint: input.canonicalPoint,
      translatedAmericanPrice: quote.market === "moneyline" ? quote.americanPrice : null,
      powerExponent: devig.exponent,
      fairProbability: devig.probabilities[0],
      shrunkProbability: probability,
      expectedValue: probability === null ? null : expectedValue(probability, quote.americanPrice),
      edge: probability === null ? null : probability - devig.probabilities[0],
      uncertaintyInterval: probability === null ? null : input.uncertaintyInterval,
      translationWarning: probability === null ? "unsupported" : "none"
    };
  }
  const fairToCanonical = translateFairProbability(
    input.artifact,
    input.consensusSpread,
    point,
    input.canonicalPoint,
    devig.probabilities[0]
  );
  const shrunkToBook = translateFairProbability(
    input.artifact,
    input.consensusSpread,
    input.canonicalPoint,
    point,
    input.canonicalShrunkProbability
  );
  const intervalLow = translateFairProbability(
    input.artifact,
    input.consensusSpread,
    input.canonicalPoint,
    point,
    input.uncertaintyInterval[0]
  );
  const intervalHigh = translateFairProbability(
    input.artifact,
    input.consensusSpread,
    input.canonicalPoint,
    point,
    input.uncertaintyInterval[1]
  );
  const translatedPrice = fairToCanonical.probability === null
    ? null
    : reapplyPowerHold(fairToCanonical.probability, devig.exponent);
  const translatedShrunk = shrunkToBook.probability;
  return {
    book: quote.book,
    rawQuote: quote,
    opposingQuote,
    canonicalPoint: input.canonicalPoint,
    translatedAmericanPrice: translatedPrice,
    powerExponent: devig.exponent,
    fairProbability: devig.probabilities[0],
    shrunkProbability: translatedShrunk,
    expectedValue: translatedShrunk === null ? null : expectedValue(translatedShrunk, quote.americanPrice),
    edge: translatedShrunk === null ? null : translatedShrunk - devig.probabilities[0],
    uncertaintyInterval:
      intervalLow.probability === null || intervalHigh.probability === null
        ? null
        : [intervalLow.probability - devig.probabilities[0], intervalHigh.probability - devig.probabilities[0]],
    translationWarning: mergeWarnings([
      fairToCanonical.warning,
      shrunkToBook.warning,
      intervalLow.warning,
      intervalHigh.warning
    ])
  };
}

function mergeWarnings(warnings: BookEvaluation["translationWarning"][]): BookEvaluation["translationWarning"] {
  if (warnings.includes("unsupported")) return "unsupported";
  if (warnings.includes("extrapolated")) return "extrapolated";
  if (warnings.includes("interpolated")) return "interpolated";
  return "none";
}

export function translatedPriceDeltaCents(
  first: BookEvaluation,
  second: BookEvaluation
): number | null {
  if (first.translatedAmericanPrice === null || second.translatedAmericanPrice === null) return null;
  if (first.canonicalPoint !== second.canonicalPoint) {
    throw new Error("Price delta is prohibited until both quotes share a canonical point");
  }
  return Math.abs(
    quoteCostCents(first.translatedAmericanPrice) - quoteCostCents(second.translatedAmericanPrice)
  );
}
