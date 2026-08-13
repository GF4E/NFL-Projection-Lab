import type {
  BaselineProjection,
  MainlineContractEvaluation,
  MoneylineProjection,
  TotalProjection
} from "./decision-board";
import type { LiveLine } from "./line-board";
import { translateFairProbability } from "./margin";
import { expectedValueWithPush, powerDevig, reapplyPowerHold } from "./odds";
import { translateTotalFairProbability } from "./total";
import type { DiscreteMarginArtifact, DiscreteTotalArtifact } from "./types";

function mergeWarning(
  ...warnings: MainlineContractEvaluation["translationWarning"][]
): MainlineContractEvaluation["translationWarning"] {
  if (warnings.includes("unsupported")) return "unsupported";
  if (warnings.includes("extrapolated")) return "extrapolated";
  if (warnings.includes("interpolated")) return "interpolated";
  return "none";
}

/**
 * Produces the exact per-book values used by the scan surface. Different
 * spread/total points are moved to one canonical contract before any price
 * delta is exposed; EV remains evaluated at each book's actual posted point.
 */
export function buildMainlineContractEvaluations(input: {
  lines: readonly LiveLine[];
  projections: readonly BaselineProjection[];
  totals: readonly TotalProjection[];
  moneylines: readonly MoneylineProjection[];
  consensusHomePoint: number | null;
  marginArtifact: DiscreteMarginArtifact | null;
  totalArtifact: DiscreteTotalArtifact;
}): MainlineContractEvaluation[] {
  const opposingQuote = (line: LiveLine): LiveLine | null => input.lines.find((candidate) =>
    candidate.book === line.book && candidate.market === line.market && candidate.id !== line.id
  ) ?? null;
  return input.lines.flatMap<MainlineContractEvaluation>((line) => {
    const opponent = opposingQuote(line);
    if (!opponent || line.fairProbability === null) return [];
    const powerExponent = powerDevig(line.americanPrice, opponent.americanPrice).exponent;
    let canonicalPoint: number | null = null;
    let translatedAmericanPrice: number | null = line.americanPrice;
    let shrunkProbability: number | null = null;
    let pushProbability: number | null = null;
    let edgeInterval: [number, number] | null = null;
    let translationWarning: MainlineContractEvaluation["translationWarning"] = "none";
    if (line.market === "spread") {
      const projection = input.projections.find((candidate) => candidate.book === line.book);
      const home = projection?.homeTeam === line.side;
      canonicalPoint = home ? input.consensusHomePoint : input.consensusHomePoint === null ? null : -input.consensusHomePoint;
      if (!projection || line.point === null || canonicalPoint === null || !input.marginArtifact) return [];
      const translated = translateFairProbability(
        input.marginArtifact, canonicalPoint, line.point, canonicalPoint, line.fairProbability
      );
      translatedAmericanPrice = translated.probability === null ? null : reapplyPowerHold(translated.probability, powerExponent);
      shrunkProbability = home ? projection.shrunkHomeProbability : projection.shrunkHomeProbability === null ? null : 1 - projection.shrunkHomeProbability;
      pushProbability = projection.pushProbability;
      edgeInterval = home || projection.edgeInterval === null
        ? projection.edgeInterval
        : [-projection.edgeInterval[1], -projection.edgeInterval[0]];
      translationWarning = mergeWarning(projection.translationWarning, translated.warning);
    } else if (line.market === "total") {
      const projection = input.totals.find((candidate) => candidate.book === line.book);
      if (!projection || line.point === null) return [];
      canonicalPoint = projection.canonicalPoint;
      const overProbability = line.side.toLowerCase() === "over" ? line.fairProbability : 1 - line.fairProbability;
      const translated = translateTotalFairProbability(
        input.totalArtifact, canonicalPoint, line.point, canonicalPoint, overProbability
      );
      const selectedProbability = line.side.toLowerCase() === "over"
        ? translated.probability
        : translated.probability === null ? null : 1 - translated.probability;
      translatedAmericanPrice = selectedProbability === null ? null : reapplyPowerHold(selectedProbability, powerExponent);
      const over = line.side.toLowerCase() === "over";
      shrunkProbability = projection.shrunkOverProbability === null
        ? null
        : over ? projection.shrunkOverProbability : 1 - projection.shrunkOverProbability;
      pushProbability = projection.marketPushProbability;
      edgeInterval = projection.overEdgeInterval === null
        ? null
        : over ? projection.overEdgeInterval : [-projection.overEdgeInterval[1], -projection.overEdgeInterval[0]];
      translationWarning = mergeWarning(projection.translationWarning, translated.warning);
    } else {
      const projection = input.moneylines.find((candidate) => candidate.book === line.book);
      if (!projection) return [];
      const home = projection.homeTeam === line.side;
      shrunkProbability = projection.shrunkHomeProbability === null
        ? null
        : home ? projection.shrunkHomeProbability : 1 - projection.shrunkHomeProbability;
      pushProbability = projection.tieProbability;
      edgeInterval = home || projection.edgeInterval === null
        ? projection.edgeInterval
        : [-projection.edgeInterval[1], -projection.edgeInterval[0]];
    }
    return [{
      sourceQuoteId: line.id,
      book: line.book,
      market: line.market,
      side: line.side,
      point: line.point,
      americanPrice: line.americanPrice,
      capturedAt: line.capturedAt,
      canonicalPoint,
      translatedAmericanPrice,
      powerExponent,
      fairProbability: line.fairProbability,
      shrunkProbability,
      pushProbability,
      expectedValue: shrunkProbability === null || pushProbability === null
        ? null
        : expectedValueWithPush(shrunkProbability, pushProbability, line.americanPrice),
      edgeInterval,
      translationWarning
    }];
  });
}
