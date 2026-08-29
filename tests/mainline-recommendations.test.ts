import { describe, expect, it } from "vitest";
import type { BaselineProjection, MoneylineProjection, TotalProjection } from "@/domain/decision-board";
import type { LineMarketKey, LiveLine } from "@/domain/line-board";
import { bestCoveredExecutionBook } from "@/domain/line-board";
import { rankBestBookMainlineRecommendations, rankMainlineRecommendations, rankWeeklyMainlineRecommendations } from "@/domain/mainline-recommendations";

const capturedAt = "2026-09-13T18:00:00.000Z";

function line(
  id: string,
  market: LineMarketKey,
  side: string,
  point: number | null,
  americanPrice = -110,
  fairProbability = 0.5
): LiveLine {
  return {
    id, gameId: "sea-lar", book: "betmgm", market, side, point, americanPrice, capturedAt,
    sourceEventId: "event", sourceHash: "hash", fairProbability, marketVigPercent: 4.76
  };
}

function spread(overrides: Partial<BaselineProjection> = {}): BaselineProjection {
  return {
    gameId: "sea-lar", book: "betmgm", homeTeam: "LAR", marketHomePoint: -2.5,
    projectedHomePoint: -4, homeCoverProbability: 0.68, shrunkHomeProbability: 0.55,
    pushProbability: 0.01, edgeInterval: [0.01, 0.08], marketHomeProbability: 0.5,
    marketSource: "book", translationWarning: "none", ...overrides
  };
}

function total(overrides: Partial<TotalProjection> = {}): TotalProjection {
  return {
    gameId: "sea-lar", book: "betmgm", canonicalPoint: 45.5, marketPoint: 45.5, projectedTotal: 48,
    shrunkOverProbability: 0.55, marketPushProbability: 0, overEdgeInterval: [0.01, 0.08],
    lean: "Over", pointEdge: 2.5, fairProbability: 0.5, shrunkProbability: 0.55,
    pushProbability: 0, expectedValue: 0.05, edgeInterval: [0.01, 0.08], translationWarning: "none", ...overrides
  };
}

function moneyline(overrides: Partial<MoneylineProjection> = {}): MoneylineProjection {
  return {
    gameId: "sea-lar", book: "betmgm", homeTeam: "LAR", marketHomeProbability: 0.5,
    consensusHomeProbability: 0.5, modelHomeProbability: 0.54, shrunkHomeProbability: 0.51,
    tieProbability: 0.01, homeExpectedValue: -0.02, awayExpectedValue: -0.01,
    edgeInterval: [-0.02, 0.04], ...overrides
  };
}

describe("exact-price mainline recommendations", () => {
  it("defaults to the execution book with the most complete two-sided market coverage", () => {
    const betmgm = [
      line("mgm-home-ml", "moneyline", "LAR", null, -140, 0.58),
      line("mgm-away-ml", "moneyline", "SEA", null, 120, 0.42)
    ];
    const fanduel = [
      ...betmgm.map((item) => ({ ...item, id: `fd:${item.id}`, book: "fanduel" as const })),
      { ...line("fd-home-spread", "spread", "LAR", -2.5, -110, 0.5), book: "fanduel" as const },
      { ...line("fd-away-spread", "spread", "SEA", 2.5, -110, 0.5), book: "fanduel" as const }
    ];
    expect(bestCoveredExecutionBook([...betmgm, ...fanduel])).toBe("fanduel");
    expect(bestCoveredExecutionBook(betmgm)).toBe("betmgm");
    expect(bestCoveredExecutionBook([...betmgm, ...fanduel.slice(0, 2)])).toBe("betmgm");
  });

  it("co-locates the best side and total with break-even, EV, and Kelly sizing", () => {
    const candidates = rankMainlineRecommendations({
      gameId: "sea-lar", awayTeam: "SEA", homeTeam: "LAR", book: "betmgm",
      lines: [
        line("spread-home", "spread", "LAR", -2.5),
        line("spread-away", "spread", "SEA", 2.5),
        line("total-over", "total", "Over", 45.5, -105, 0.49),
        line("total-under", "total", "Under", 45.5, -115, 0.51)
      ],
      spread: spread(), total: total({ fairProbability: 0.49 }), moneyline: null,
      preferredTeams: new Set(["SEA", "ATL"])
    });
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.market)).toEqual(expect.arrayContaining(["spread", "total"]));
    const totalCandidate = candidates.find((candidate) => candidate.market === "total")!;
    expect(totalCandidate.breakEvenProbability).toBeCloseTo(105 / 205, 10);
    expect(totalCandidate.expectedValue).toBeCloseTo(0.55 * (1 + 100 / 105) - 1, 10);
    expect(totalCandidate.sizing.suggestedUnits).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps only the better spread-or-moneyline side contract", () => {
    const candidates = rankMainlineRecommendations({
      gameId: "sea-lar", awayTeam: "SEA", homeTeam: "LAR", book: "betmgm",
      lines: [
        line("spread-home", "spread", "LAR", -2.5),
        line("spread-away", "spread", "SEA", 2.5),
        line("ml-home", "moneyline", "LAR", null, 100, 0.48),
        line("ml-away", "moneyline", "SEA", null, -120, 0.52)
      ],
      spread: spread(), total: null,
      moneyline: moneyline({ shrunkHomeProbability: 0.58, edgeInterval: [0.04, 0.12], homeExpectedValue: 0.15 }),
      preferredTeams: new Set()
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].market).toBe("moneyline");
    expect(candidates[0].line.side).toBe("LAR");
  });

  it("blocks a small edge against a preferred team but permits an exceptional one", () => {
    const input = {
      gameId: "sea-lar", awayTeam: "SEA", homeTeam: "LAR", book: "betmgm" as const,
      lines: [line("spread-home", "spread", "LAR", -2.5, 110), line("spread-away", "spread", "SEA", 2.5, -130)],
      total: null, moneyline: null, preferredTeams: new Set(["SEA"]), exceptionalProbabilityEdge: 0.03
    };
    const small = rankMainlineRecommendations({ ...input, spread: spread({ shrunkHomeProbability: 0.52, edgeInterval: [0.005, 0.03] }) })[0];
    expect(small.sizing.included).toBe(true);
    expect(small.preferenceConflict).toBe(true);
    expect(small.actionable).toBe(false);
    const exceptional = rankMainlineRecommendations({ ...input, spread: spread({ shrunkHomeProbability: 0.54, edgeInterval: [0.02, 0.06] }) })[0];
    expect(exceptional.actionable).toBe(true);
  });

  it("withholds integer totals when push mass is unavailable", () => {
    const candidates = rankMainlineRecommendations({
      gameId: "sea-lar", awayTeam: "SEA", homeTeam: "LAR", book: "betmgm",
      lines: [line("total-over", "total", "Over", 46), line("total-under", "total", "Under", 46)],
      spread: null, total: total({ marketPoint: 46, pushProbability: null, expectedValue: null, edgeInterval: null }),
      moneyline: null, preferredTeams: new Set()
    });
    expect(candidates).toEqual([]);
  });

  it("surfaces the highest-EV exact side and total contracts across both books", () => {
    const betmgm = rankMainlineRecommendations({
      gameId: "sea-lar", awayTeam: "SEA", homeTeam: "LAR", book: "betmgm",
      lines: [line("mgm-spread", "spread", "LAR", -2.5, -115, 0.5), line("mgm-total", "total", "Over", 45.5, -115, 0.5)],
      spread: spread({ shrunkHomeProbability: 0.56 }), total: total({ shrunkProbability: 0.56 }), moneyline: null,
      preferredTeams: new Set()
    });
    const fanduel = rankMainlineRecommendations({
      gameId: "sea-lar", awayTeam: "SEA", homeTeam: "LAR", book: "fanduel",
      lines: [
        { ...line("fd-spread", "spread", "LAR", -3, -105, 0.49), book: "fanduel" },
        { ...line("fd-total", "total", "Over", 45.5, -105, 0.49), book: "fanduel" }
      ],
      spread: spread({ book: "fanduel", marketHomePoint: -3, marketHomeProbability: 0.49, shrunkHomeProbability: 0.57 }),
      total: total({ book: "fanduel", marketPoint: 45.5, fairProbability: 0.49, shrunkProbability: 0.57 }),
      moneyline: null,
      preferredTeams: new Set()
    });
    const best = rankBestBookMainlineRecommendations([...betmgm, ...fanduel]);
    expect(best).toHaveLength(2);
    expect(best.every((candidate) => candidate.line.book === "fanduel")).toBe(true);
    expect(best.map((candidate) => candidate.line.point)).toEqual(expect.arrayContaining([-3, 45.5]));
  });

  it("ranks translated exact total contracts even when the posted points differ", () => {
    const betmgm = buildCandidateForCrossBookTotal("betmgm", 45.5, 0.06);
    const fanduel = buildCandidateForCrossBookTotal("fanduel", 46.5, 0.08);
    expect(rankBestBookMainlineRecommendations([betmgm, { ...fanduel, actionable: false }]))
      .toEqual([betmgm]);
    expect(rankBestBookMainlineRecommendations([betmgm, fanduel]).map((candidate) => candidate.line.book))
      .toEqual(["fanduel"]);
  });

  it("builds a compact weekly queue from only the best actionable exact contracts", () => {
    const sameGameMgm = buildCandidateForCrossBookTotal("betmgm", 45.5, 0.06);
    const sameGameFanDuel = { ...buildCandidateForCrossBookTotal("fanduel", 46.5, 0.08), edgeInterval: [0.03, 0.1] as [number, number] };
    const otherGame = {
      ...buildCandidateForCrossBookTotal("betmgm", 42.5, 0.07),
      line: { ...sameGameMgm.line, id: "other-game-total", gameId: "atl-tb", point: 42.5 },
      edgeInterval: [-0.01, 0.09] as [number, number],
      sizing: { ...sameGameMgm.sizing, greyed: true }
    };
    const blocked = {
      ...buildCandidateForCrossBookTotal("betmgm", 40.5, 0.2),
      line: { ...sameGameMgm.line, id: "blocked-total", gameId: "chi-gb", point: 40.5 },
      actionable: false
    };
    const queue = rankWeeklyMainlineRecommendations([sameGameMgm, sameGameFanDuel, otherGame, blocked], 5);
    expect(queue.map((candidate) => candidate.line.id)).toEqual([sameGameFanDuel.line.id, "other-game-total"]);
    expect(queue.every((candidate) => candidate.actionable)).toBe(true);
    expect(rankWeeklyMainlineRecommendations(queue, 1)).toEqual([sameGameFanDuel]);
  });

  it("keeps the highest-EV exact book contract within a thesis before uncertainty ordering", () => {
    const higherEv = {
      ...buildCandidateForCrossBookTotal("betmgm", 45.5, 0.09),
      edgeInterval: [-0.01, 0.12] as [number, number],
      sizing: { ...buildCandidateForCrossBookTotal("betmgm", 45.5, 0.09).sizing, greyed: true }
    };
    const clearerButWorse = {
      ...buildCandidateForCrossBookTotal("fanduel", 46.5, 0.06),
      edgeInterval: [0.03, 0.08] as [number, number]
    };
    expect(rankWeeklyMainlineRecommendations([clearerButWorse, higherEv]))
      .toEqual([higherEv]);
  });
});

function buildCandidateForCrossBookTotal(book: "betmgm" | "fanduel", point: number, expectedValue: number) {
  const base = rankMainlineRecommendations({
    gameId: "sea-lar", awayTeam: "SEA", homeTeam: "LAR", book,
    lines: [{ ...line(`${book}-over`, "total", "Over", point, -110, 0.5), book }],
    spread: null,
    total: total({ book, marketPoint: point, shrunkProbability: 0.55 + expectedValue / 10 }),
    moneyline: null,
    preferredTeams: new Set()
  })[0];
  if (!base) throw new Error("expected total candidate");
  return { ...base, expectedValue };
}
