import { describe, expect, it } from "vitest";
import { matchupEvidenceProvenance } from "@/domain/evidence-provenance";

const teams = [
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
  "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
  "LV", "LAC", "LAR", "MIA", "MIN", "NE", "NO", "NYG",
  "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"
];

function rows(throughWeek: number) {
  return teams.flatMap((team, teamIndex) => Array.from({ length: 4 }, (_, index) => ({
    game_id: `${team}-${index}`, season: 2026, week: Math.max(1, throughWeek - index),
    gameDate: `2026-09-${String(10 + index).padStart(2, "0")}`, team,
    opponent: teams[(teamIndex + 1) % teams.length]
  })));
}

describe("matchup evidence provenance", () => {
  it("marks complete through-W-1 league coverage current", () => {
    expect(matchupEvidenceProvenance({
      rows: rows(4), forecastSeason: 2026, forecastWeek: 5,
      completedGames: [{ season: 2026, week: 4 }]
    })).toMatchObject({ status: "current", throughSeason: 2026, throughWeek: 4, expectedThroughWeek: 4 });
  });

  it("marks lagging features stale even when older rows exist", () => {
    expect(matchupEvidenceProvenance({
      rows: rows(3), forecastSeason: 2026, forecastWeek: 5,
      completedGames: [{ season: 2026, week: 4 }]
    })).toMatchObject({ status: "stale", throughWeek: 3, expectedThroughWeek: 4 });
  });

  it("marks partial-team coverage stale", () => {
    expect(matchupEvidenceProvenance({
      rows: rows(4).filter((row) => row.team !== "SEA"), forecastSeason: 2026, forecastWeek: 5,
      completedGames: [{ season: 2026, week: 4 }]
    }).status).toBe("stale");
  });
});
