import { describe, expect, it } from "vitest";
import {
  cashPlacementEligibilityError,
  forecastApprovalEligibilityError,
  storedLegMatchesSource,
  validateStoredPlayContract,
  validateStoredPlayPrice,
  type StoredPlayLeg,
  type WeeklyPlay
} from "@/domain/play-card";

const leg = (
  gameId: string,
  market: StoredPlayLeg["market"] = "spread",
  sourceQuoteId = `${gameId}:${market}`
): StoredPlayLeg => ({
  sourceQuoteId,
  gameId,
  market,
  side: market === "total" ? "Over" : "SEA",
  point: market === "moneyline" ? null : -2.5,
  americanPrice: -110,
  selection: `${gameId} ${market}`
});

describe("stored shared-card contract integrity", () => {
  const snapshot = (overrides: Partial<WeeklyPlay["forecastSnapshot"] extends infer T ? NonNullable<T> : never> = {}) => ({
    generatedAt: "2026-09-13T18:00:00.000Z", boardGeneratedAt: "2026-09-13T18:00:00.000Z",
    championHash: "champion", ensembleHash: "ensemble", configHash: "config", dataHash: "data", artifactHash: "artifact",
    consensusSnapshotId: "snapshot", displayedExpectedValuePercent: 2,
    authoritativeExpectedValuePercent: null, authoritativeEdgeCents: null, displayedEdgePp: 2, legs: [], ...overrides,
    authoritativeProbabilityInterval: null,
    uncertaintyConfiguration: { members: 100, seedStart: 202600, intervalPercentiles: [0.1, 0.9] as [number, number] },
    suggestedUnits: null, unitsGreyed: false
  });
  it("accepts only one exact leg for a straight", () => {
    expect(validateStoredPlayContract({
      playType: "single", market: "spread", gameId: "g1", contract: [leg("g1")]
    })).toEqual([]);
    expect(validateStoredPlayContract({
      playType: "single", market: "spread", gameId: "g1", contract: [leg("g1"), leg("g2")]
    })[0]).toMatch(/exactly one leg/i);
  });

  it("withholds standard parlay contracts that contain same-game correlation", () => {
    expect(validateStoredPlayContract({
      playType: "parlay", market: "parlay", gameId: "multi", contract: [leg("g1"), leg("g2", "prop")]
    })).toEqual([]);
    expect(validateStoredPlayContract({
      playType: "parlay", market: "parlay", gameId: "multi", contract: [leg("g1"), leg("g1", "prop")]
    })).toContain("Parlay legs must come from different games because same-game correlation is not modeled");
  });

  it("requires a two-game, two-leg teaser made only from teaser legs", () => {
    expect(validateStoredPlayContract({
      playType: "teaser", market: "teaser", gameId: "multi", contract: [leg("g1", "teaser"), leg("g2", "teaser")]
    })).toEqual([]);
    expect(validateStoredPlayContract({
      playType: "teaser", market: "teaser", gameId: "multi", contract: [leg("g1", "teaser"), leg("g1", "teaser", "g1:other")]
    })).toContain("Teaser legs must come from two different games");
  });

  it("binds the recorded payout to the exact source contracts", () => {
    expect(validateStoredPlayPrice({ playType: "single", americanOdds: -110, contract: [leg("g1")] })).toBeNull();
    expect(validateStoredPlayPrice({ playType: "single", americanOdds: -105, contract: [leg("g1")] })).toMatch(/exact source quote/i);
    expect(validateStoredPlayPrice({ playType: "parlay", americanOdds: 264, contract: [leg("g1"), leg("g2")] })).toBeNull();
    expect(validateStoredPlayPrice({ playType: "parlay", americanOdds: 300, contract: [leg("g1"), leg("g2")] })).toMatch(/component prices/i);
    expect(validateStoredPlayPrice({ playType: "teaser", americanOdds: -130, contract: [leg("g1", "teaser"), leg("g2", "teaser")] })).toBeNull();
    expect(validateStoredPlayPrice({ playType: "teaser", americanOdds: -125, contract: [leg("g1", "teaser"), leg("g2", "teaser")] })).toMatch(/selectable/i);
  });

  it("blocks stale props and negative-EV teaser prices at the approval boundary", () => {
    const propLeg = leg("g1", "prop");
    const propPlay = { playType: "single" as const, contract: [propLeg] };
    const qualifiedProp = snapshot({ legs: [{
      sourceQuoteId: propLeg.sourceQuoteId!, gameId: "g1", market: "prop", side: "SEA", point: -2.5,
      americanPrice: -110, book: "betmgm", capturedAt: "2026-09-13T18:00:00.000Z", sourceHash: "hash",
      marketProbability: 0.5, modelProbability: 0.62, betProbability: 0.56, pushProbability: 0,
      uncertaintyInterval: [0.53, 0.6], uncertaintyMembers: null, pushProbabilityMembers: null, expectedValue: 0.069
    }] });
    const qualifiedPropDecision = { ...qualifiedProp, authoritativeProbabilityInterval: [0.53, 0.6] as [number, number], suggestedUnits: 1 };
    expect(forecastApprovalEligibilityError(propPlay, qualifiedPropDecision)).toBeNull();
    expect(forecastApprovalEligibilityError(propPlay, {
      ...qualifiedPropDecision,
      generatedAt: "2026-09-13T19:16:00.000Z"
    })).toMatch(/no longer clears/i);
    expect(forecastApprovalEligibilityError(propPlay, snapshot())).toMatch(/no longer clears/i);
    expect(forecastApprovalEligibilityError(
      { playType: "teaser", contract: [leg("g1", "teaser"), leg("g2", "teaser")] },
      snapshot({ authoritativeExpectedValuePercent: -0.01 })
    )).toMatch(/negative EV/i);
    expect(forecastApprovalEligibilityError(
      { playType: "teaser", contract: [leg("g1", "teaser"), leg("g2", "teaser")] },
      snapshot({ authoritativeExpectedValuePercent: 2, authoritativeProbabilityInterval: [0.54, 0.59], suggestedUnits: 0 })
    )).toMatch(/Kelly inclusion/i);
  });

  it("blocks unsupported, negative-EV, and sub-floor parlays at the approval boundary", () => {
    const parlay = { playType: "parlay" as const, contract: [leg("g1"), leg("g2")] };
    const legs = [
      { ...snapshot().legs[0], sourceQuoteId: "g1:spread", pushProbability: 0, uncertaintyInterval: [0.55, 0.61] as [number, number] },
      { ...snapshot().legs[0], sourceQuoteId: "g2:spread", gameId: "g2", pushProbability: 0, uncertaintyInterval: [0.55, 0.61] as [number, number] }
    ];
    const qualified = {
      ...snapshot({ legs }), authoritativeExpectedValuePercent: 4,
      authoritativeProbabilityInterval: [0.3025, 0.3721] as [number, number], suggestedUnits: 0.5
    };
    expect(forecastApprovalEligibilityError(parlay, qualified)).toBeNull();
    expect(forecastApprovalEligibilityError(parlay, {
      ...qualified, legs: [{ ...legs[0], pushProbability: 0.01 }, legs[1]]
    })).toMatch(/leg can push/i);
    expect(forecastApprovalEligibilityError(parlay, {
      ...qualified, authoritativeExpectedValuePercent: -0.01
    })).toMatch(/negative EV/i);
    expect(forecastApprovalEligibilityError(parlay, {
      ...qualified, suggestedUnits: 0
    })).toMatch(/Kelly inclusion/i);
  });

  it("binds a stored leg to the same source game, book, market and side", () => {
    const stored = leg("g1");
    const source = {
      gameId: "g1", book: "betmgm", market: "spread", side: "SEA", point: -2.5, americanPrice: -110
    };
    expect(storedLegMatchesSource(stored, "BetMGM", source)).toBe(true);
    expect(storedLegMatchesSource(stored, "FanDuel", source)).toBe(false);
    expect(storedLegMatchesSource(stored, "BetMGM", { ...source, gameId: "g2" })).toBe(false);
  });

  it("confirms cash placement only for a jointly approved open card before kickoff", () => {
    const card: Pick<WeeklyPlay, "approvals" | "status" | "result" | "executionStatus" | "cashPlacementConfirmed" | "gameId" | "contract"> = {
      approvals: ["gabe", "jarrett"],
      status: "card" as const,
      result: "pending" as const,
      executionStatus: "paper" as const,
      cashPlacementConfirmed: false,
      gameId: "g1",
      contract: [leg("g1")]
    };
    const kickoffs = new Map([["g1", "2026-09-13T20:00:00.000Z"]]);
    expect(cashPlacementEligibilityError(card, "2026-09-13T19:59:59.999Z", kickoffs)).toBeNull();
    expect(cashPlacementEligibilityError({ ...card, approvals: ["gabe"] }, "2026-09-13T19:00:00.000Z", kickoffs)).toMatch(/both teammates/i);
    expect(cashPlacementEligibilityError(card, "2026-09-13T20:00:00.000Z", kickoffs)).toMatch(/before kickoff/i);
    expect(cashPlacementEligibilityError({ ...card, status: "settled", result: "win" }, "2026-09-13T19:00:00.000Z", kickoffs)).toMatch(/open/i);
    expect(cashPlacementEligibilityError({ ...card, status: "placed", executionStatus: "executed", cashPlacementConfirmed: true }, "2026-09-13T21:00:00.000Z", kickoffs)).toBeNull();
  });
});
