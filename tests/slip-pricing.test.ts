import { describe, expect, it } from "vitest";
import { analyzeSlipValue, isPricedSlipApprovable } from "@/domain/line-board";

describe("slip pricing support", () => {
  const first = { gameId: "sea-lar", americanPrice: -110, fairProbability: 0.5 };
  const second = { gameId: "atl-tb", americanPrice: -110, fairProbability: 0.5 };

  it("allows independent priced parlays and blocks same-game correlation", () => {
    const independent = analyzeSlipValue([first, second]);
    const correlated = analyzeSlipValue([first, { ...second, gameId: first.gameId }]);
    expect(isPricedSlipApprovable({ mode: "parlay", legCount: 2, standardValue: independent, teaserExpectedValuePercent: null })).toBe(true);
    expect(isPricedSlipApprovable({ mode: "parlay", legCount: 2, standardValue: correlated, teaserExpectedValuePercent: null })).toBe(false);
  });

  it("allows multiple straights because they save separately", () => {
    expect(isPricedSlipApprovable({ mode: "straight", legCount: 3, standardValue: null, teaserExpectedValuePercent: null })).toBe(true);
  });

  it("requires exactly two nonnegative-EV teaser legs", () => {
    expect(isPricedSlipApprovable({ mode: "teaser", legCount: 2, standardValue: null, teaserExpectedValuePercent: 0 })).toBe(true);
    expect(isPricedSlipApprovable({ mode: "teaser", legCount: 2, standardValue: null, teaserExpectedValuePercent: -0.01 })).toBe(false);
    expect(isPricedSlipApprovable({ mode: "teaser", legCount: 1, standardValue: null, teaserExpectedValuePercent: 2 })).toBe(false);
  });
});
