import { describe, expect, it } from "vitest";
import { fitOpponentAdjustedRatings, predictOpponentAdjustedMetric } from "@/domain/opponent-adjustment";

describe("opponent-adjusted matchup evidence", () => {
  it("separates simultaneous offense and defense effects", () => {
    const teams = ["A", "B", "C", "D"];
    const offense = new Map([["A", 0.18], ["B", 0.07], ["C", -0.07], ["D", -0.18]]);
    const defense = new Map([["A", -0.12], ["B", -0.04], ["C", 0.04], ["D", 0.12]]);
    const observations = teams.flatMap((offenseTeam) => teams
      .filter((defenseTeam) => defenseTeam !== offenseTeam)
      .map((defenseTeam) => ({
        offense: offenseTeam,
        defense: defenseTeam,
        value: 0.05 + offense.get(offenseTeam)! + defense.get(defenseTeam)!,
        weight: 60
      })));
    const fit = fitOpponentAdjustedRatings(observations, 0.01);
    expect(fit).not.toBeNull();
    expect(fit!.ratings.get("A")!.offense).toBeGreaterThan(fit!.ratings.get("D")!.offense);
    expect(fit!.ratings.get("A")!.defenseAllowed).toBeLessThan(fit!.ratings.get("D")!.defenseAllowed);
    expect(predictOpponentAdjustedMetric(fit!, "A", "D")).toBeCloseTo(0.35, 2);
    expect(fit!.weightedRmse).toBeLessThan(0.002);
  });

  it("fails closed on an undersized or invalid fit", () => {
    expect(fitOpponentAdjustedRatings([{ offense: "A", defense: "B", value: 0.1, weight: 50 }], 1)).toBeNull();
    expect(() => fitOpponentAdjustedRatings([], 0)).toThrow(/positive/);
  });
});
