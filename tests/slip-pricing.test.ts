import { describe, expect, it } from "vitest";
import { analyzeSlipValue, isPricedSlipApprovable, updateSlipSelections, type SlipSelectionIdentity } from "@/domain/line-board";

describe("slip pricing support", () => {
  const first = { gameId: "sea-lar", americanPrice: -110, fairProbability: 0.5 };
  const second = { gameId: "atl-tb", americanPrice: -110, fairProbability: 0.5 };

  it("allows independent priced parlays and blocks same-game correlation", () => {
    const independent = analyzeSlipValue([first, second]);
    const correlated = analyzeSlipValue([first, { ...second, gameId: first.gameId }]);
    expect(isPricedSlipApprovable({ mode: "parlay", legCount: 2, singleBook: true, standardValue: independent, teaserExpectedValuePercent: null })).toBe(true);
    expect(isPricedSlipApprovable({ mode: "parlay", legCount: 2, singleBook: true, standardValue: correlated, teaserExpectedValuePercent: null })).toBe(false);
    expect(isPricedSlipApprovable({ mode: "parlay", legCount: 2, singleBook: false, standardValue: independent, teaserExpectedValuePercent: null })).toBe(false);
  });

  it("allows multiple straights because they save separately", () => {
    expect(isPricedSlipApprovable({ mode: "straight", legCount: 3, singleBook: false, standardValue: null, teaserExpectedValuePercent: null })).toBe(true);
  });

  it("requires exactly two nonnegative-EV teaser legs", () => {
    expect(isPricedSlipApprovable({ mode: "teaser", legCount: 2, singleBook: true, standardValue: null, teaserExpectedValuePercent: 0 })).toBe(true);
    expect(isPricedSlipApprovable({ mode: "teaser", legCount: 2, singleBook: true, standardValue: null, teaserExpectedValuePercent: -0.01 })).toBe(false);
    expect(isPricedSlipApprovable({ mode: "teaser", legCount: 1, singleBook: true, standardValue: null, teaserExpectedValuePercent: 2 })).toBe(false);
  });

  it("keeps mixed-book straights but switches combined products to one book", () => {
    const mgm: SlipSelectionIdentity = { id: "mgm-side", book: "betmgm", kind: "mainline", thesisKey: "g1:spread" };
    const fanDuel: SlipSelectionIdentity = { id: "fd-total", book: "fanduel", kind: "mainline", thesisKey: "g2:total" };
    const straights = updateSlipSelections([mgm], fanDuel, "straight");
    expect(straights.legs).toEqual([mgm, fanDuel]);
    expect(straights.switchedBook).toBe(false);
    const parlay = updateSlipSelections([mgm], fanDuel, "parlay");
    expect(parlay.legs).toEqual([fanDuel]);
    expect(parlay.switchedBook).toBe(true);
  });

  it("replaces the same thesis at a better book without removing other straight picks", () => {
    const sideMgm: SlipSelectionIdentity = { id: "mgm-side", book: "betmgm", kind: "mainline", thesisKey: "g1:spread" };
    const unrelated: SlipSelectionIdentity = { id: "mgm-prop", book: "betmgm", kind: "prop", thesisKey: "g1:prop:receiving:player" };
    const sideFanDuel: SlipSelectionIdentity = { id: "fd-side", book: "fanduel", kind: "mainline", thesisKey: "g1:spread" };
    expect(updateSlipSelections([sideMgm, unrelated], sideFanDuel, "straight").legs).toEqual([unrelated, sideFanDuel]);
  });
});
