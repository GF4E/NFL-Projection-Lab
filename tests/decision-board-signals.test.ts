import { describe, expect, it } from "vitest";
import { matchupSignals, type TeamBaseline } from "@/domain/decision-board";

function baseline(team: string, ranks: Partial<TeamBaseline["ranks"]> = {}): TeamBaseline {
  return {
    team,
    season: 2025,
    games: 17,
    epaPerPlay: 0,
    successRate: 0.42,
    explosiveRate: 0.1,
    defenseEpaAllowed: 0,
    defenseSuccessAllowed: 0.42,
    defenseExplosiveAllowed: 0.1,
    regressedTurnoverRate: 0.024,
    secondsPerPlay: 28,
    proe: 0,
    strength: 0,
    ranks: {
      epa: 16,
      success: 16,
      explosive: 16,
      defenseEpa: 16,
      defenseSuccess: 16,
      defenseExplosive: 16,
      turnovers: 16,
      pace: 16,
      proe: 16,
      strength: 16,
      ...ranks
    }
  };
}

describe("compact matchup evidence", () => {
  it("ranks rest and market-adjusted form in the existing three-signal limit", () => {
    const signals = matchupSignals(
      baseline("SEA", { strength: 2 }),
      baseline("LAR", { strength: 25 }),
      { awayRest: 10, homeRest: 6 }
    );
    expect(signals).toHaveLength(2);
    expect(signals.map((signal) => signal.id)).toEqual(["strength", "rest"]);
    expect(signals.every((signal) => signal.lean === "SEA")).toBe(true);
  });

  it("uses pass tendency as a total-environment cue, not a side conclusion", () => {
    const signals = matchupSignals(
      baseline("ATL", { proe: 4 }),
      baseline("TB", { proe: 8 })
    );
    expect(signals).toContainEqual(expect.objectContaining({
      id: "pass_rate",
      lean: "OVER"
    }));
  });
});
