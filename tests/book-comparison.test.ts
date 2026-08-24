import { describe, expect, it } from "vitest";
import { buildMainlineContractEvaluations } from "@/domain/book-comparison";
import { buildDiscreteTotalArtifact } from "@/domain/total";
import type { BaselineProjection } from "@/domain/decision-board";
import type { LiveLine } from "@/domain/line-board";
import { artifact, history } from "./fixtures";

const capturedAt = "2026-09-13T18:00:00.000Z";

function line(
  id: string,
  book: LiveLine["book"],
  side: string,
  point: number,
  americanPrice: number,
  fairProbability: number
): LiveLine {
  return {
    id, gameId: "ne-sea", book, market: "spread", side, point, americanPrice,
    capturedAt, sourceEventId: "event", sourceHash: id, fairProbability,
    marketVigPercent: 4.5
  };
}

function projection(
  book: LiveLine["book"],
  marketHomePoint: number,
  marketHomeProbability: number,
  shrunkHomeProbability: number
): BaselineProjection {
  return {
    gameId: "ne-sea", book, homeTeam: "SEA", marketHomePoint,
    projectedHomePoint: -4.5, homeCoverProbability: 0.64, shrunkHomeProbability,
    pushProbability: 0.02, edgeInterval: [0.02, 0.1], marketHomeProbability,
    marketSource: "book", translationWarning: "none"
  };
}

describe("translated execution-book comparisons", () => {
  it("retains raw contracts but moves both fair prices to the same canonical spread before comparison", () => {
    const rows = history.map((row) => ({
      gameId: row.gameId, season: row.season, consensusTotal: 44.5,
      actualTotal: 44.5 + row.actualMargin
    }));
    const totalArtifact = buildDiscreteTotalArtifact(rows, {
      latestCompletedSeason: 2025, halfLifeSeasons: 2.5, kernelBandwidth: 6,
      generatedAt: "2026-02-01T00:00:00.000Z"
    });
    const evaluations = buildMainlineContractEvaluations({
      lines: [
        line("mgm-sea", "betmgm", "SEA", -2.5, -115, 0.51),
        line("mgm-ne", "betmgm", "NE", 2.5, -105, 0.49),
        line("fd-sea", "fanduel", "SEA", -3.5, 105, 0.48),
        line("fd-ne", "fanduel", "NE", 3.5, -125, 0.52)
      ],
      projections: [
        projection("betmgm", -2.5, 0.51, 0.57),
        projection("fanduel", -3.5, 0.48, 0.54)
      ],
      totals: [], moneylines: [], consensusHomePoint: -3,
      marginArtifact: artifact, totalArtifact
    });
    const sea = evaluations.filter((item) => item.side === "SEA");
    expect(sea).toHaveLength(2);
    expect(sea.map((item) => item.point)).toEqual([-2.5, -3.5]);
    expect(new Set(sea.map((item) => item.canonicalPoint))).toEqual(new Set([-3]));
    expect(sea.every((item) => item.translatedAmericanPrice !== null)).toBe(true);
    expect(sea[0].translatedAmericanPrice).not.toBe(sea[0].americanPrice);
    expect(sea[1].translatedAmericanPrice).not.toBe(sea[1].americanPrice);
    expect(sea.every((item) => item.expectedValue !== null)).toBe(true);
  });
});
