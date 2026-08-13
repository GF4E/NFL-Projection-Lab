import { describe, expect, it } from "vitest";
import { authoritativeContractExpectedValue } from "@/domain/forecast-value";
import { priceTwoTeamTeaserDecision } from "@/domain/decision-board";
import type { PlayForecastLegSnapshot } from "@/domain/play-card";

function leg(overrides: Partial<PlayForecastLegSnapshot> = {}): PlayForecastLegSnapshot {
  return {
    sourceQuoteId: "quote", gameId: "game", market: "spread", side: "SEA", point: 2.5,
    americanPrice: -110, book: "betmgm", capturedAt: "2026-09-13T18:00:00Z", sourceHash: "hash",
    marketProbability: 0.5, modelProbability: 0.6, betProbability: 0.55, pushProbability: 0,
    uncertaintyInterval: [0.52, 0.58], uncertaintyMembers: null, expectedValue: 0.05, ...overrides
  };
}

describe("authoritative combined-contract EV", () => {
  it("uses resolved probabilities for a straight and a parlay", () => {
    expect(authoritativeContractExpectedValue({ playType: "single", americanOdds: -110, legs: [leg()] })).toBe(0.05);
    const result = authoritativeContractExpectedValue({
      playType: "parlay", americanOdds: 264,
      legs: [leg({ sourceQuoteId: "q1" }), leg({ sourceQuoteId: "q2", gameId: "g2" })]
    });
    const oneLegReturn = 0.55 * (1 + 100 / 110);
    expect(result).toBeCloseTo(oneLegReturn ** 2 - 1, 10);
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

  it("recomputes teaser value from the saved combined price", () => {
    const result = authoritativeContractExpectedValue({
      playType: "teaser", americanOdds: -120,
      legs: [leg({ market: "teaser", betProbability: 0.75 }), leg({ sourceQuoteId: "q2", gameId: "g2", market: "teaser", betProbability: 0.74 })]
    });
    expect(result).toBeCloseTo(0.75 * 0.74 * (1 + 100 / 120) - 1, 10);
  });

  it("prices teaser uncertainty and Kelly from the exact combined payout", () => {
    const decision = priceTwoTeamTeaserDecision([
      { conditionalWinProbability: 0.79, pushProbability: 0.02, probabilityMembers: Array.from({ length: 100 }, (_, index) => 0.75 + index * 0.0008) },
      { conditionalWinProbability: 0.78, pushProbability: 0.01, probabilityMembers: Array.from({ length: 100 }, (_, index) => 0.74 + index * 0.0008) }
    ], -120);
    expect(decision?.edgeInterval[0]).toBeLessThan(decision!.edgeInterval[1]);
    expect(decision?.sizing.included).toBe(true);
    expect(decision?.sizing.suggestedUnits).toBeLessThanOrEqual(2);
    expect(priceTwoTeamTeaserDecision([
      { conditionalWinProbability: 0.65, pushProbability: 0, probabilityMembers: Array.from({ length: 100 }, () => 0.65) },
      { conditionalWinProbability: 0.65, pushProbability: 0, probabilityMembers: Array.from({ length: 100 }, () => 0.65) }
    ], -120)?.sizing.included).toBe(false);
  });
});
