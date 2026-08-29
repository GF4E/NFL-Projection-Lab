import { translateFairProbability } from "./margin";
import type { BookKey, DiscreteMarginArtifact, TranslationResult } from "./types";

export interface SpreadMarketQuote {
  book: BookKey;
  point: number;
  fairProbability: number;
}

export interface CanonicalSpreadMarket {
  point: number;
  fairProbability: number | null;
  warning: TranslationResult["warning"];
}

export interface TranslatedSpreadForecast {
  modelProbability: number | null;
  shrunkProbability: number | null;
  pushProbability: number | null;
  edgeInterval: [number, number] | null;
  warning: TranslationResult["warning"];
}

function mergeWarnings(warnings: readonly TranslationResult["warning"][]): TranslationResult["warning"] {
  if (warnings.includes("unsupported")) return "unsupported";
  if (warnings.includes("extrapolated")) return "extrapolated";
  if (warnings.includes("interpolated")) return "interpolated";
  return "none";
}

function clampProbability(value: number): number {
  return Math.max(0.001, Math.min(0.999, value));
}

/**
 * Creates the one half-point consensus contract used for market blending. Raw
 * probabilities are translated to this point before they are averaged.
 */
export function canonicalSpreadMarket(
  artifact: DiscreteMarginArtifact,
  quotes: readonly SpreadMarketQuote[],
  fallbackPoint: number | null
): CanonicalSpreadMarket | null {
  if (!quotes.length && fallbackPoint === null) return null;
  const meanPoint = quotes.length
    ? quotes.reduce((sum, quote) => sum + quote.point, 0) / quotes.length
    : fallbackPoint!;
  const point = Math.max(-14, Math.min(14, Math.round(meanPoint * 2) / 2));
  if (!quotes.length) return { point, fairProbability: 0.5, warning: "none" };
  const translated = quotes.map((quote) => translateFairProbability(
    artifact,
    point,
    quote.point,
    point,
    quote.fairProbability
  ));
  if (translated.some((item) => item.probability === null)) {
    return { point, fairProbability: null, warning: "unsupported" };
  }
  return {
    point,
    fairProbability: translated.reduce((sum, item) => sum + item.probability!, 0) / translated.length,
    warning: mergeWarnings(translated.map((item) => item.warning))
  };
}

/**
 * Moves the single canonical model, shrunk probability, and uncertainty band
 * to one book's exact posted spread. This prevents a book-specific re-blend
 * from changing the underlying forecast merely because its point differs.
 */
export function translateCanonicalSpreadForecast(input: {
  artifact: DiscreteMarginArtifact;
  consensusPoint: number;
  canonicalPoint: number;
  canonicalMarketProbability: number;
  canonicalModelProbability: number;
  canonicalShrunkProbability: number;
  canonicalEdgeInterval: [number, number];
  quote: SpreadMarketQuote;
}): TranslatedSpreadForecast {
  const translate = (probability: number) => translateFairProbability(
    input.artifact,
    input.consensusPoint,
    input.canonicalPoint,
    input.quote.point,
    clampProbability(probability)
  );
  const model = translate(input.canonicalModelProbability);
  const shrunk = translate(input.canonicalShrunkProbability);
  const low = translate(input.canonicalMarketProbability + input.canonicalEdgeInterval[0]);
  const high = translate(input.canonicalMarketProbability + input.canonicalEdgeInterval[1]);
  const probabilities = [model.probability, shrunk.probability, low.probability, high.probability];
  if (probabilities.some((probability) => probability === null)) {
    return {
      modelProbability: null,
      shrunkProbability: null,
      pushProbability: null,
      edgeInterval: null,
      warning: "unsupported"
    };
  }
  return {
    modelProbability: model.probability,
    shrunkProbability: shrunk.probability,
    pushProbability: shrunk.pushProbability,
    edgeInterval: [
      low.probability! - input.quote.fairProbability,
      high.probability! - input.quote.fairProbability
    ],
    warning: mergeWarnings([model.warning, shrunk.warning, low.warning, high.warning])
  };
}
