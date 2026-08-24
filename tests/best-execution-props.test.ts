import { describe, expect, it } from "vitest";
import { rankBestExecutionProps, type PropCandidate, type PropMarketKey } from "@/domain/decision-board";

function prop(
  id: string,
  player: string,
  market: PropMarketKey,
  executionBook: PropCandidate["executionBook"],
  lowerBoundExpectedValue: number,
  expectedValue = lowerBoundExpectedValue + 0.03
): PropCandidate {
  return {
    id,
    sourceQuoteId: id,
    gameId: "sea-lar",
    executionBook,
    market,
    player,
    side: "Over",
    point: 55.5,
    americanPrice: -110,
    executionFairProbability: 0.5,
    consensusProbability: 0.54,
    betProbability: 0.56,
    modelProbability: 0.62,
    projectedValue: 63,
    sampleGames: 8,
    hitRate: 0.63,
    consensusInterval: [0.52, 0.58],
    edge: expectedValue,
    edgeInterval: [0.01, 0.08],
    expectedValue,
    lowerBoundExpectedValue,
    suggestedUnits: 0.5,
    unitsGreyed: false,
    referenceBooks: 4,
    capturedAt: "2026-09-13T18:00:00.000Z"
  };
}

describe("best execution-book prop board", () => {
  it("keeps the stronger exact contract for a player/market thesis and caps the game at three", () => {
    const ranked = rankBestExecutionProps([
      prop("mgm-wr", "Jaxon Smith-Njigba", "player_reception_yds", "betmgm", 0.02),
      prop("fd-wr", "Jaxon Smith-Njigba", "player_reception_yds", "fanduel", 0.05),
      prop("qb", "Sam Darnold", "player_pass_yds", "betmgm", 0.04),
      prop("rb", "Kenneth Walker", "player_rush_yds", "fanduel", 0.03),
      prop("fourth", "Cooper Kupp", "player_reception_yds", "betmgm", 0.01)
    ]);
    expect(ranked).toHaveLength(3);
    expect(ranked.map((candidate) => candidate.id)).toEqual(["fd-wr", "qb", "rb"]);
    expect(ranked).not.toContainEqual(expect.objectContaining({ id: "mgm-wr" }));
  });
});
