import { describe, expect, it } from "vitest";
import { authoritativeContractExpectedValue, authoritativeEquivalentEdgeCents, priceIndependentParlayDecision } from "@/domain/forecast-value";
import { priceTwoTeamTeaserDecision } from "@/domain/decision-board";
import type { PlayForecastLegSnapshot } from "@/domain/play-card";

function leg(overrides: Partial<PlayForecastLegSnapshot> = {}): PlayForecastLegSnapshot {
  return {
    sourceQuoteId: "quote", gameId: "game", market: "spread", side: "SEA", point: 2.5,
    americanPrice: -110, book: "betmgm", capturedAt: "2026-09-13T18:00:00Z", sourceHash: "hash",
    marketProbability: 0.5, modelProbability: 0.6, betProbability: 0.55, pushProbability: 0,
    uncertaintyInterval: [0.52, 0.58], uncertaintyMembers: null, pushProbabilityMembers: null, expectedValue: 0.05, ...overrides
  };
}

describe("authoritative combined-contract EV", () => {
  it("uses resolved probabilities for a straight and a parlay", () => {
    expect(authoritativeContractExpectedValue({ playType: "single", americanOdds: -110, legs: [leg()] })).toBe(0.05);
    const result = authoritativeContractExpectedValue({
      playType: "parlay", americanOdds: 264,
      legs: [leg({ sourceQuoteId: "q1" }), leg({ sourceQuoteId: "q2", gameId: "g2" })]
    });
    expect(result).toBeCloseTo(0.55 ** 2 * (1 + 264 / 100) - 1, 10);
  });

  it("incorporates pushes and withholds incomplete parlay provenance", () => {
    const result = authoritativeContractExpectedValue({
      playType: "parlay", americanOdds: 264,
      legs: [leg({ sourceQuoteId: "q1", pushProbability: 0.05 }), leg({ sourceQuoteId: "q2", gameId: "g2" })]
    });
    expect(result).toBeCloseTo((0.05 + 0.95 * 0.55 * (1 + 100 / 110)) * (0.55 * (1 + 100 / 110)) - 1, 10);
    expect(authoritativeContractExpectedValue({
      playType: "parlay", americanOdds: 264,
      legs: [leg({ sourceQuoteId: "q1", betProbability: null }), leg({ sourceQuoteId: "q2", gameId: "g2" })]
    })).toBeNull();
  });

  it("requires positive, uncertainty-qualified binary value before approving an independent parlay", () => {
    const qualified = priceIndependentParlayDecision([
      leg({ sourceQuoteId: "q1", betProbability: 0.58, uncertaintyInterval: [0.55, 0.61] }),
      leg({ sourceQuoteId: "q2", gameId: "g2", betProbability: 0.58, uncertaintyInterval: [0.55, 0.61] })
    ], 264);
    expect(qualified?.expectedValue).toBeGreaterThan(0);
    expect(qualified?.sizing.included).toBe(true);
    expect(qualified?.probabilityInterval).toEqual([0.55 ** 2, 0.61 ** 2]);
    expect(priceIndependentParlayDecision([
      leg({ sourceQuoteId: "q1", pushProbability: 0.01 }),
      leg({ sourceQuoteId: "q2", gameId: "g2" })
    ], 264)).toBeNull();
    expect(priceIndependentParlayDecision([
      leg({ sourceQuoteId: "q1", betProbability: 0.51, uncertaintyInterval: [0.49, 0.53] }),
      leg({ sourceQuoteId: "q2", gameId: "g2", betProbability: 0.51, uncertaintyInterval: [0.49, 0.53] })
    ], 264)?.sizing.included).toBe(false);
  });

  it("derives equivalent-risk edge cents from server-resolved contract probabilities", () => {
    expect(authoritativeEquivalentEdgeCents({
      playType: "single", americanOdds: -110,
      legs: [leg({ betProbability: 0.55, marketProbability: 0.5 })]
    })).toBeCloseTo(5, 10);
    expect(authoritativeEquivalentEdgeCents({
      playType: "parlay", americanOdds: 264,
      legs: [
        leg({ sourceQuoteId: "q1", betProbability: 0.55, marketProbability: 0.5 }),
        leg({ sourceQuoteId: "q2", gameId: "g2", betProbability: 0.56, marketProbability: 0.51 })
      ]
    })).toBeCloseTo((0.55 * 0.56 - 0.5 * 0.51) * 100, 10);
    expect(authoritativeEquivalentEdgeCents({
      playType: "parlay", americanOdds: 264,
      legs: [leg({ pushProbability: 0.01 }), leg({ sourceQuoteId: "q2", gameId: "g2" })]
    })).toBeNull();
    expect(authoritativeEquivalentEdgeCents({
      playType: "teaser", americanOdds: -120,
      legs: [
        leg({ market: "teaser", betProbability: 0.75 }),
        leg({ sourceQuoteId: "q2", gameId: "g2", market: "teaser", betProbability: 0.74 })
      ]
    })).toBeCloseTo((0.75 * 0.74 - 120 / 220) * 100, 10);
  });

  it("recomputes teaser value from the saved combined price", () => {
    const result = authoritativeContractExpectedValue({
      playType: "teaser", americanOdds: -120,
      legs: [leg({ market: "teaser", betProbability: 0.75 }), leg({ sourceQuoteId: "q2", gameId: "g2", market: "teaser", betProbability: 0.74 })]
    });
    expect(result).toBeCloseTo(0.75 * 0.74 * (1 + 100 / 120) - 1, 10);
  });

  it("prices teaser uncertainty and Kelly from the exact combined payout", () => {
    const decision = priceTwoTeamTeaserDecision([
      { conditionalWinProbability: 0.79, pushProbability: 0.02, probabilityMembers: Array.from({ length: 100 }, (_, index) => 0.75 + index * 0.0008), pushProbabilityMembers: Array.from({ length: 100 }, () => 0.02) },
      { conditionalWinProbability: 0.78, pushProbability: 0.01, probabilityMembers: Array.from({ length: 100 }, (_, index) => 0.74 + index * 0.0008), pushProbabilityMembers: Array.from({ length: 100 }, () => 0.01) }
    ], -120);
    expect(decision?.edgeInterval[0]).toBeLessThan(decision!.edgeInterval[1]);
    expect(decision?.sizing.included).toBe(true);
    expect(decision?.sizing.suggestedUnits).toBeLessThanOrEqual(2);
    expect(priceTwoTeamTeaserDecision([
      { conditionalWinProbability: 0.65, pushProbability: 0, probabilityMembers: Array.from({ length: 100 }, () => 0.65), pushProbabilityMembers: Array.from({ length: 100 }, () => 0) },
      { conditionalWinProbability: 0.65, pushProbability: 0, probabilityMembers: Array.from({ length: 100 }, () => 0.65), pushProbabilityMembers: Array.from({ length: 100 }, () => 0) }
    ], -120)?.sizing.included).toBe(false);
  });
});
