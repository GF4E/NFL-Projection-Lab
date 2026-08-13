import { describe, expect, it } from "vitest";
import { buildDiscreteTotalArtifact, translateTotalFairProbability } from "@/domain/total";
import { canonicalTotalMarket, translateCanonicalTotalForecast } from "@/domain/total-contracts";
import type { HistoricalTotalRow } from "@/domain/types";

const history: HistoricalTotalRow[] = Array.from({ length: 16 }, (_, seasonIndex) => {
  const season = 2010 + seasonIndex;
  return [38, 41, 44, 47, 50].flatMap((consensusTotal, lineIndex) =>
    [-10, -7, -3, 0, 3, 7, 10].map((residual, residualIndex) => ({
      gameId: `${season}-${lineIndex}-${residualIndex}`,
      season,
      consensusTotal,
      actualTotal: consensusTotal + residual
    }))
  );
}).flat();

const artifact = buildDiscreteTotalArtifact(history, {
  latestCompletedSeason: 2025,
  halfLifeSeasons: 2.5,
  kernelBandwidth: 6,
  generatedAt: "2026-08-13T12:00:00-07:00"
});

describe("discrete total contracts", () => {
  it("learns integer push mass and keeps half-point contracts push-free", () => {
    const integer = translateTotalFairProbability(artifact, 44, 44, 44, 0.5);
    const half = translateTotalFairProbability(artifact, 44, 44.5, 44.5, 0.5);
    expect(integer.pushProbability).toBeGreaterThan(0);
    expect(half.pushProbability).toBe(0);
  });

  it("translates over probability monotonically between different posted points", () => {
    const lower = translateTotalFairProbability(artifact, 44, 44, 43, 0.5);
    const higher = translateTotalFairProbability(artifact, 44, 44, 45, 0.5);
    expect(lower.probability).toBeGreaterThan(0.5);
    expect(higher.probability).toBeLessThan(0.5);
  });

  it("translates book totals to one canonical point before averaging", () => {
    const canonical = canonicalTotalMarket(artifact, [
      { book: "betmgm", point: 44.5, fairOverProbability: 0.5 },
      { book: "fanduel", point: 45.5, fairOverProbability: 0.5 }
    ], null)!;
    expect(canonical.point).toBe(45);
    expect(canonical.fairOverProbability).not.toBeNull();
    expect(canonical.fairOverProbability).toBeCloseTo(0.5, 1);
  });

  it("moves one canonical forecast to each exact contract with translated intervals", () => {
    const lower = translateCanonicalTotalForecast({
      artifact,
      consensusPoint: 45,
      canonicalPoint: 45,
      canonicalMarketOverProbability: 0.5,
      canonicalModelOverProbability: 0.56,
      canonicalShrunkOverProbability: 0.515,
      canonicalOverEdgeInterval: [-0.01, 0.04],
      quote: { book: "betmgm", point: 44.5, fairOverProbability: 0.52 }
    });
    const higher = translateCanonicalTotalForecast({
      artifact,
      consensusPoint: 45,
      canonicalPoint: 45,
      canonicalMarketOverProbability: 0.5,
      canonicalModelOverProbability: 0.56,
      canonicalShrunkOverProbability: 0.515,
      canonicalOverEdgeInterval: [-0.01, 0.04],
      quote: { book: "fanduel", point: 45.5, fairOverProbability: 0.48 }
    });
    expect(lower.shrunkOverProbability).toBeGreaterThan(higher.shrunkOverProbability!);
    expect(lower.overEdgeInterval).not.toBeNull();
    expect(higher.overEdgeInterval).not.toBeNull();
  });
});
