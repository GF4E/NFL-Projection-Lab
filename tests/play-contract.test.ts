import { describe, expect, it } from "vitest";
import {
  storedLegMatchesSource,
  validateStoredPlayContract,
  type StoredPlayLeg
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
});
