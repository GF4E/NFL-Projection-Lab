import { translateTotalFairProbability } from "./total";
import type { BookKey, DiscreteTotalArtifact, TranslationResult } from "./types";

export interface TotalMarketQuote {
  book: BookKey;
  point: number;
  fairOverProbability: number;
}

export interface CanonicalTotalMarket {
  point: number;
  fairOverProbability: number | null;
  warning: TranslationResult["warning"];
}

export interface TranslatedTotalForecast {
  modelOverProbability: number | null;
  shrunkOverProbability: number | null;
  pushProbability: number | null;
  overEdgeInterval: [number, number] | null;
  warning: TranslationResult["warning"];
}

function mergeWarnings(warnings: readonly TranslationResult["warning"][]): TranslationResult["warning"] {
  if (warnings.includes("unsupported")) return "unsupported";
  if (warnings.includes("extrapolated")) return "extrapolated";
  if (warnings.includes("interpolated")) return "interpolated";
  return "none";
}

function clamp(value: number): number {
  return Math.max(0.001, Math.min(0.999, value));
}

export function canonicalTotalMarket(
  artifact: DiscreteTotalArtifact,
  quotes: readonly TotalMarketQuote[],
  fallbackPoint: number | null
): CanonicalTotalMarket | null {
  if (!quotes.length && fallbackPoint === null) return null;
  const meanPoint = quotes.length
    ? quotes.reduce((sum, quote) => sum + quote.point, 0) / quotes.length
    : fallbackPoint!;
  const point = Math.max(25, Math.min(70, Math.round(meanPoint * 2) / 2));
  if (!quotes.length) return { point, fairOverProbability: 0.5, warning: "none" };
  const translated = quotes.map((quote) => translateTotalFairProbability(
    artifact,
    point,
    quote.point,
    point,
    quote.fairOverProbability
  ));
  if (translated.some((result) => result.probability === null)) {
    return { point, fairOverProbability: null, warning: "unsupported" };
  }
  return {
    point,
    fairOverProbability: translated.reduce((sum, result) => sum + result.probability!, 0) / translated.length,
    warning: mergeWarnings(translated.map((result) => result.warning))
  };
}

export function translateCanonicalTotalForecast(input: {
  artifact: DiscreteTotalArtifact;
  consensusPoint: number;
  canonicalPoint: number;
  canonicalMarketOverProbability: number;
  canonicalModelOverProbability: number;
  canonicalShrunkOverProbability: number;
  canonicalOverEdgeInterval: [number, number];
  quote: TotalMarketQuote;
}): TranslatedTotalForecast {
  const translate = (probability: number) => translateTotalFairProbability(
    input.artifact,
    input.consensusPoint,
    input.canonicalPoint,
    input.quote.point,
    clamp(probability)
  );
  const model = translate(input.canonicalModelOverProbability);
  const shrunk = translate(input.canonicalShrunkOverProbability);
  const low = translate(input.canonicalMarketOverProbability + input.canonicalOverEdgeInterval[0]);
  const high = translate(input.canonicalMarketOverProbability + input.canonicalOverEdgeInterval[1]);
  if ([model, shrunk, low, high].some((result) => result.probability === null)) {
    return {
      modelOverProbability: null,
      shrunkOverProbability: null,
      pushProbability: null,
      overEdgeInterval: null,
      warning: "unsupported"
    };
  }
  return {
    modelOverProbability: model.probability,
    shrunkOverProbability: shrunk.probability,
    pushProbability: shrunk.pushProbability,
    overEdgeInterval: [
      low.probability! - input.quote.fairOverProbability,
      high.probability! - input.quote.fairOverProbability
    ],
    warning: mergeWarnings([model.warning, shrunk.warning, low.warning, high.warning])
  };
}
