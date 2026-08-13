import { describe, expect, it } from "vitest";
import { playerPropBoardIsActionable, playerPropBoardMessage } from "@/domain/player-prop-status";

const base = {
  quotes: 12,
  freshQuotes: 12,
  availabilityConfirmed: true,
  candidates: 2,
  evidence: 8,
  stateMessage: "fresh scan"
};

describe("player prop decision status", () => {
  it("does not blame inactives when prices have not been scanned", () => {
    expect(playerPropBoardMessage({ ...base, quotes: 0, freshQuotes: 0, availabilityConfirmed: false, candidates: 0 }))
      .toBe("fresh scan");
    expect(playerPropBoardMessage({ ...base, quotes: 0, freshQuotes: 0, availabilityConfirmed: false, candidates: 0, stateMessage: null }))
      .toBe("Props have not been scanned for this game yet");
  });

  it("states the exact safety gate after prices are posted", () => {
    expect(playerPropBoardMessage({ ...base, availabilityConfirmed: false, candidates: 0 }))
      .toContain("official inactives are still pending");
    expect(playerPropBoardMessage(base)).toContain("availability gates cleared");
  });

  it("withholds stale prices before reporting any other gate", () => {
    expect(playerPropBoardMessage({ ...base, freshQuotes: 0, availabilityConfirmed: false, candidates: 0 }))
      .toContain("prices are older than");
  });

  it("keeps last-good stale numbers non-actionable", () => {
    expect(playerPropBoardIsActionable({ status: "current" })).toBe(true);
    expect(playerPropBoardIsActionable({ status: "stale" })).toBe(false);
    expect(playerPropBoardIsActionable({ status: "unavailable" })).toBe(false);
    expect(playerPropBoardIsActionable(null)).toBe(false);
  });
});
