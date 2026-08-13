import { describe, expect, it } from "vitest";
import { runPromotionGate, updateTeamStates } from "@/domain/model-lifecycle";
import { aggregateRollingFeatureStates } from "@/server/model-lifecycle/automation";
import { buildLifecycleTrainingRows, fitLifecycleChallenger, type LifecycleGameRow } from "@/server/model-lifecycle/training";

describe("persisted weekly model lifecycle", () => {
  it("updates strength in season order and derives rolling state only through the completed week", () => {
    const states = updateTeamStates([], [
      { gameId: "new", season: 2025, week: 1, homeTeam: "SEA", awayTeam: "SF", actualHomeMargin: 8, consensusHomeExpectedMargin: 3, completedAt: "2025-09-01" },
      { gameId: "old", season: 2024, week: 18, homeTeam: "SEA", awayTeam: "SF", actualHomeMargin: -2, consensusHomeExpectedMargin: 1, completedAt: "2025-01-01" }
    ], 0.2);
    expect(states.find((state) => state.team === "SEA")?.mean).toBeCloseTo(0.2);

    const features = aggregateRollingFeatureStates(Array.from({ length: 20 }, (_, index) => ({
      season: index < 3 ? 2024 : 2025,
      week: index + 1,
      team: "SEA",
      plays: 60,
      epa_per_play: index,
      success_rate: 0.4,
      explosive_rate: 0.1,
      turnover_rate: 0.02,
      seconds_per_play: 28,
      pass_rate_over_expectation: 0.03
    })), 2026, 0);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({ team: "SEA", season: 2026, throughWeek: 0 });
    expect(features[0].epa).toBeGreaterThan(10);
  });

  it("builds all three non-pick outcome markets and fits leakage-safe season origins", () => {
    const games: LifecycleGameRow[] = [];
    for (let season = 2020; season <= 2025; season += 1) {
      for (let index = 0; index < 64; index += 1) {
        const expected = index % 7 - 3;
        const noise = (index * 11 + season) % 9 - 4;
        games.push({
          game_id: `${season}-${index}`,
          season,
          week: index % 18 + 1,
          result: expected + noise,
          total: 42 + (index % 8),
          spread_line: expected,
          total_line: 44.5,
          away_rest: 7,
          home_rest: 7 + index % 2,
          away_moneyline: 120,
          home_moneyline: -140,
          away_spread_odds: -105,
          home_spread_odds: -115,
          under_odds: -110,
          over_odds: -110
        });
      }
    }
    const rows = buildLifecycleTrainingRows(games, 2025);
    expect(new Set(rows.map((row) => row.market))).toEqual(new Set(["spread", "total", "moneyline"]));
    expect(rows.some((row) => row.push)).toBe(true);
    const challenger = fitLifecycleChallenger(rows, 2025);
    expect(Object.keys(challenger.walkForwardModels)).toEqual(["2023", "2024", "2025"]);
    expect(challenger.metrics.byMarket.spread.observations).toBeGreaterThan(0);
    expect(Number.isFinite(challenger.metrics.pooledLogLoss)).toBe(true);
  });

  it("uses the configured calibration range as a hard promotion gate", () => {
    const metrics = {
      pooledLogLoss: 0.68,
      calibrationSlope: 0.79,
      byMarket: {
        spread: { logLoss: 0.68, observations: 10 },
        total: { logLoss: 0.68, observations: 10 },
        moneyline: { logLoss: 0.68, observations: 10 }
      }
    };
    const result = runPromotionGate({
      runId: "gate", championHash: "champion", challengerHash: "challenger",
      championMetrics: { ...metrics, calibrationSlope: 1 }, challengerMetrics: metrics,
      dataHash: "data", configHash: "config", featureSchemaHash: "features", codeHash: "code",
      startedAt: "2026-09-15T14:00:00Z", completedAt: "2026-09-15T14:01:00Z",
      calibrationSlopeRange: [0.8, 1.2]
    });
    expect(result.run.gateDecision).toBe("retain");
    expect(result.alert?.type).toBe("gate_rejection");
  });
});
