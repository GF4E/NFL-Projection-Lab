import { describe, expect, it } from "vitest";
import { bootstrapMarginTranslation, buildMarginBootstrapIndex } from "@/domain/margin-bootstrap";

describe("fixed-seed margin artifact bootstrap", () => {
  const history = Array.from({ length: 120 }, (_, index) => ({
    gameId: `g${index}`,
    season: 2020 + index % 6,
    consensusSpread: -2.5,
    actualMargin: [-14, -7, -3, 0, 3, 6, 7, 10, 14][index % 9]
  }));

  it("is deterministic, data-derived, and widens a translated key-number contract", () => {
    const options = { referenceSeason: 2025, halfLifeSeasons: 2.5, members: 100, seedStart: 202600 };
    const first = buildMarginBootstrapIndex(history, options);
    const second = buildMarginBootstrapIndex(history, options);
    const input = {
      consensusSpread: -2.5,
      fromPoint: -2.5,
      toPoint: 3.5,
      baseProbabilityMembers: Array.from({ length: 100 }, () => 0.5),
      intervalPercentiles: [0.1, 0.9] as [number, number]
    };
    const one = bootstrapMarginTranslation({ index: first, ...input });
    const two = bootstrapMarginTranslation({ index: second, ...input });
    expect(one).toEqual(two);
    expect(one?.probabilityMembers).toHaveLength(100);
    expect(one?.pushProbabilityMembers).toHaveLength(100);
    expect(one!.probabilityInterval[1] - one!.probabilityInterval[0]).toBeGreaterThan(0.01);
    const changed = buildMarginBootstrapIndex([
      ...history,
      ...Array.from({ length: 60 }, (_, index) => ({ gameId: `cover${index}`, season: 2025, consensusSpread: -2.5, actualMargin: 7 }))
    ], options);
    expect(bootstrapMarginTranslation({ index: changed, ...input })?.probabilityInterval).not.toEqual(one?.probabilityInterval);
  });
});
