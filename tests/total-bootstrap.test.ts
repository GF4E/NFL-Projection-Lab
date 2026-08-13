import { describe, expect, it } from "vitest";
import { bootstrapTotalTranslation, buildTotalBootstrapIndex } from "@/domain/total-bootstrap";

describe("fixed-seed total artifact bootstrap", () => {
  const history = Array.from({ length: 180 }, (_, index) => ({
    gameId: `g${index}`,
    season: 2020 + index % 6,
    consensusTotal: 39 + index % 12,
    actualTotal: 28 + index % 34
  }));

  it("is deterministic and resamples both score translation and push mass", () => {
    const options = { referenceSeason: 2025, halfLifeSeasons: 2.5, kernelBandwidth: 6, members: 100, seedStart: 202600 };
    const input = {
      consensusTotal: 45,
      fromPoint: 48,
      toPoint: 45,
      baseProbabilityMembers: Array.from({ length: 100 }, () => 0.5),
      intervalPercentiles: [0.1, 0.9] as [number, number]
    };
    const one = bootstrapTotalTranslation({ index: buildTotalBootstrapIndex(history, options), ...input });
    const two = bootstrapTotalTranslation({ index: buildTotalBootstrapIndex(history, options), ...input });
    expect(one).toEqual(two);
    expect(one?.probabilityMembers).toHaveLength(100);
    expect(one?.pushProbabilityMembers).toHaveLength(100);
    expect(one!.probabilityInterval[1] - one!.probabilityInterval[0]).toBeGreaterThan(0.01);
    const changed = buildTotalBootstrapIndex([
      ...history,
      ...Array.from({ length: 60 }, (_, index) => ({ gameId: `over${index}`, season: 2025, consensusTotal: 45, actualTotal: 60 }))
    ], options);
    expect(bootstrapTotalTranslation({ index: changed, ...input })?.probabilityInterval).not.toEqual(one?.probabilityInterval);
  });

  it("carries the same member from projected score through the exact book point", () => {
    const options = { referenceSeason: 2025, halfLifeSeasons: 2.5, kernelBandwidth: 6, members: 100, seedStart: 202600 };
    const index = buildTotalBootstrapIndex(history, options);
    const state = bootstrapTotalTranslation({
      index, consensusTotal: 45, fromPoint: 49, toPoint: 45,
      baseProbabilityMembers: Array.from({ length: 100 }, () => 0.5),
      intervalPercentiles: [0.1, 0.9]
    })!;
    const execution = bootstrapTotalTranslation({
      index, consensusTotal: 45, fromPoint: 45, toPoint: 44.5,
      baseProbabilityMembers: state.probabilityMembers,
      intervalPercentiles: [0.1, 0.9]
    })!;
    expect(execution.probabilityInterval[1] - execution.probabilityInterval[0]).toBeGreaterThan(0.03);
  });
});
