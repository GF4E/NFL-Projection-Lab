import { describe, expect, it } from "vitest";
import { assertFrozenMarginArtifact, buildDiscreteMarginArtifact } from "@/domain/margin";
import { canonicalSpreadMarket, translateCanonicalSpreadForecast } from "@/domain/spread-contracts";

const artifact = buildDiscreteMarginArtifact(
  [-3, -2.5, -2, 0].flatMap((consensusSpread, spreadIndex) =>
    [-7, -3, 0, 3, 3, 3, 6, 7, 10, 14].flatMap((actualMargin, marginIndex) =>
      Array.from({ length: 12 }, (_, repeat) => ({
        gameId: `g-${spreadIndex}-${marginIndex}-${repeat}`,
        season: 2015 + repeat % 11,
        consensusSpread,
        actualMargin
      }))
    )
  ),
  { latestCompletedSeason: 2025, halfLifeSeasons: 2.5, boundarySeason: 2015, keyMargins: [3, 6, 7, 10, 14], generatedAt: "2026-02-01" }
);

describe("canonical spread contract", () => {
  it("rejects a mutated frozen artifact before runtime pricing", () => {
    expect(() => assertFrozenMarginArtifact({
      artifact: { ...artifact, keyMarginMasses: { ...artifact.keyMarginMasses, "3": 0.99 } },
      season: 2026,
      halfLifeSeasons: 2.5,
      boundarySeason: 2015,
      keyMargins: [3, 6, 7, 10, 14]
    })).toThrow(/hash mismatch/);
  });

  it("translates different points before forming one market baseline", () => {
    const market = canonicalSpreadMarket(artifact, [
      { book: "betmgm", point: -2.5, fairProbability: 0.5 },
      { book: "fanduel", point: -3, fairProbability: 0.5 }
    ], null)!;
    expect(market.point * 2).toBe(Math.round(market.point * 2));
    expect(market.fairProbability).not.toBeNull();
  });

  it("moves the same canonical shrunk forecast to each exact book contract", () => {
    const market = canonicalSpreadMarket(artifact, [
      { book: "betmgm", point: -2.5, fairProbability: 0.5 },
      { book: "fanduel", point: -3, fairProbability: 0.5 }
    ], null)!;
    const translate = (book: "betmgm" | "fanduel", point: number) => translateCanonicalSpreadForecast({
      artifact,
      consensusPoint: market.point,
      canonicalPoint: market.point,
      canonicalMarketProbability: market.fairProbability!,
      canonicalModelProbability: 0.58,
      canonicalShrunkProbability: 0.52,
      canonicalEdgeInterval: [-0.01, 0.05],
      quote: { book, point, fairProbability: 0.5 }
    });
    const mgm = translate("betmgm", -2.5);
    const fanduel = translate("fanduel", -3);
    expect(mgm.shrunkProbability).not.toBe(fanduel.shrunkProbability);
    expect(mgm.edgeInterval).not.toEqual(fanduel.edgeInterval);
    expect(mgm.shrunkProbability).not.toBeNull();
    expect(fanduel.shrunkProbability).not.toBeNull();
  });
});
