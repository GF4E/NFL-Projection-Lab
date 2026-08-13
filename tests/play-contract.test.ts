import { describe, expect, it } from "vitest";
import {
  cashPlacementEligibilityError,
  storedLegMatchesSource,
  validateStoredPlayContract,
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
