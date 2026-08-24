import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import creditConfig from "../config/2026-credit-simulation.json";
import eraConfig from "../config/era.config.json";
import frozenMarginArtifact from "../config/discrete-margin-2026.json";
import frozenTotalArtifact from "../config/discrete-total-2026.json";
import { structuralConfig } from "@/domain/config";
import {
  buildDiscreteMarginArtifact,
  fairSpreadPointForProbability,
  translateFairProbability
} from "@/domain/margin";
import {
  evaluateBook,
  expectedValueWithPush,
  powerDevig,
  shrinkProbability,
  translatedPriceDeltaCents
} from "@/domain/odds";
import { sizeKelly } from "@/domain/sizing";
import { updateTeamStates, runPromotionGate, validateForecastLeakage } from "@/domain/model-lifecycle";
import { completeImport, createPushDelivery, deduplicatePushes, failImport, simulateCreditPeriod } from "@/domain/automation";
import { createQuarterbackOverride, normalizeOfficialInjuries, validateHistoricalInjurySeason, validateInactivesTiming } from "@/domain/injuries";
import { approveRevision, applyKickoffLock, editRevision, revisionHash } from "@/domain/approval";
import { calculateTranslatedClv, chooseBetterPaperClose } from "@/domain/clv";
import { dualRecordSummaries } from "@/domain/records";
import { isPacificSunday, kickoffCountdown, refreshSundayDraft, snapshotAgeMs, todayOnly } from "@/domain/sunday-mode";
import { authorize, assertNoUnauthenticatedApi } from "@/domain/security";
import { correctSettlement, gradePick, gradeStoredPlay, profitForResult } from "@/domain/settlement";
import { applyChampionMarketResidual, fitWeightedLogistic, type ModelTrainingRow } from "@/domain/model-fit";
import { draftExpirationReason, earliestPlayKickoff, estimatedEvFromEdge, exactContractApprovalRequest, storedLegMatchesQuote, summarizeTeamCardPortfolio, teamCardPortfolioBatchConflicts, trackerRecordSummaries, trackerSummary, validateTeamCardPortfolio } from "@/domain/play-card";
import { analyzeSlipValue, enrichWithPowerDevig, type SlipLeg } from "@/domain/line-board";
import { assertCompletePropQuotePairs, buildPlayerPropEvidence, completeLeaguePropEfficiencyPrior, crossedKeyNumbers, isClassicWongPoint, isPropPlayerUnavailable, marginVersusConsensusResidual, nflverseExpectedMarginToHomePoint, normalizeNflverseTeam, priceTwoTeamTeaser, propPlayerLookupPattern, rankTeaserPairs, scanMarketConfirmedProps, summarizeGameAvailability, type RawPropQuote, type TeaserCandidate } from "@/domain/decision-board";
import { rehearsalPlays } from "@/lib/play-data";
import { pickReasons, weekOneKickoffs, weekOneMatchups } from "@/lib/week-one-data";
import { fetchWeekOneLiveOdds } from "@/server/week-one-live-odds";
import { deterministicRecoveryCandidate, inspectMainlineCompleteness, latestExpectedMainlineCandidate, scheduledMainlineCandidates, scheduledPropCandidates, type ScheduledGame, type ScheduledOddsCandidate } from "@/domain/odds-schedule";
import { plannedOddsThrottleReason } from "@/domain/odds-credit-plan";
import { boardGameId, chooseActiveWeek, easternScheduleTimeToIso, normalizeScheduleTeam } from "@/domain/weekly-slate";
import type { BookEvaluation, DiscreteMarginArtifact, JobState, PushDelivery, SettledPick } from "@/domain/types";
import { artifact, forecast, history, metrics, pick, quote, settled } from "./fixtures";

describe("NFL Projection Lab v1.1 acceptance suite", () => {
  it("1. derives key masses from data and translates different points before comparison", () => {
    expect(Object.keys(artifact.keyMarginMasses)).toEqual(["3", "6", "7", "10", "14"]);
    const changed = buildDiscreteMarginArtifact(
      [...history, ...Array.from({ length: 25 }, (_, index) => ({
        gameId: `extra-${index}`, season: 2025, consensusSpread: 0, actualMargin: 3
      }))],
      { latestCompletedSeason: 2025, halfLifeSeasons: 2.5, boundarySeason: 2015, keyMargins: [3, 6, 7, 10, 14], generatedAt: "2026-02-01T12:00:00.000Z" }
    );
    expect(changed.keyMarginMasses["3"]).toBeGreaterThan(artifact.keyMarginMasses["3"]);
    const translated = translateFairProbability(artifact, -3, -2.5, -3, 0.54);
    expect(translated.probability).not.toBe(0.54);
    const fairPointProbability = translateFairProbability(artifact, -3, -2.5, -3, 0.5).probability!;
    const inferred = fairSpreadPointForProbability(artifact, -3, -3, fairPointProbability);
    expect(inferred.point).toBe(-2.5);
    const evaluation = (canonicalPoint: number): BookEvaluation => ({
      book: "betmgm", rawQuote: quote(), opposingQuote: quote({ side: "NYJ +2.5" }), canonicalPoint,
      translatedAmericanPrice: -108, powerExponent: 1.1, fairProbability: 0.51,
      shrunkProbability: 0.54, pushProbability: 0, expectedValue: 0.03, edge: 0.03, uncertaintyInterval: [0.01, 0.05], translationWarning: "none"
    });
    expect(() => translatedPriceDeltaCents(evaluation(-2.5), { ...evaluation(-3), book: "fanduel" })).toThrow(/prohibited/);
  });

  it("1b. keeps translated price probability conditional on no push and carries push mass separately", () => {
    const pushArtifact: DiscreteMarginArtifact = {
      version: "push-contract",
      seasonRange: [2015, 2025],
      boundarySeason: 2015,
      decay: { halfLifeSeasons: 2.5, referenceSeason: 2025 },
      spreadGrid: [-3, -2.5],
      rows: [{
        consensusSpread: 0,
        outcomes: [
          { postedPoint: -3, cover: 0.45, push: 0.1, loss: 0.45, effectiveWeight: 100 },
          { postedPoint: -2.5, cover: 0.5, push: 0, loss: 0.5, effectiveWeight: 100 }
        ]
      }],
      keyMarginMasses: { "3": 0.1 },
      artifactHash: "push-contract-hash",
      generatedAt: "2026-02-01T00:00:00.000Z"
    };
    const translated = translateFairProbability(pushArtifact, 0, -2.5, -3, 0.62);
    expect(translated.probability).toBeCloseTo(0.62, 10);
    expect(translated.pushProbability).toBeCloseTo(0.1, 10);

    const evaluation = evaluateBook({
      quote: quote({ point: -3, americanPrice: -110 }),
      opposingQuote: quote({ id: "push-opp", side: "NYJ +3", point: 3, americanPrice: -110 }),
      canonicalPoint: -3,
      consensusSpread: 0,
      canonicalShrunkProbability: 0.62,
      canonicalMarketProbability: 0.5,
      uncertaintyInterval: [0.58, 0.66],
      artifact: pushArtifact
    });
    expect(evaluation.pushProbability).toBeCloseTo(0.1, 10);
    expect(evaluation.expectedValue).toBeCloseTo(expectedValueWithPush(0.62, 0.1, -110), 10);
  });

  it("1c. hashes the discrete artifact from data and structural settings, not wall-clock generation time", () => {
    const options = {
      latestCompletedSeason: 2025,
      halfLifeSeasons: 2.5,
      boundarySeason: 2015,
      keyMargins: [3, 6, 7, 10, 14]
    };
    const first = buildDiscreteMarginArtifact(history, { ...options, generatedAt: "2026-02-01T00:00:00.000Z" });
    const repeated = buildDiscreteMarginArtifact(history, { ...options, generatedAt: "2026-08-13T05:00:00.000Z" });
    const changed = buildDiscreteMarginArtifact([...history, {
      gameId: "new-result", season: 2025, consensusSpread: 0, actualMargin: 3
    }], { ...options, generatedAt: "2026-08-13T05:00:00.000Z" });
    expect(repeated.artifactHash).toBe(first.artifactHash);
    expect(changed.artifactHash).not.toBe(first.artifactHash);
    expect(repeated.generatedAt).not.toBe(first.generatedAt);
  });

  it("1d. freezes the offseason margin artifact for every in-season forecast and settlement", () => {
    expect(frozenMarginArtifact.frozenForSeason).toBe(2026);
    expect(frozenMarginArtifact.seasonRange).toEqual([2010, 2025]);
    expect(frozenMarginArtifact.source.gameRows).toBe(4_175);
    expect(structuralConfig.model.discreteMarginArtifact).toBe("discrete-margin-2026.json");
    const board = readFileSync("src/server/decision-board.ts", "utf8");
    const settlement = readFileSync("src/server/automatic-settlement.ts", "utf8");
    expect(board).toContain("frozenMarginArtifact");
    expect(settlement).toContain("frozenMarginArtifact");
    expect(board).not.toContain("buildDiscreteMarginArtifact(historicalRows");
    expect(settlement).not.toContain("buildDiscreteMarginArtifact(marginRows");
  });

  it("1e. publishes execution-book market coverage separately from consensus fallbacks", () => {
    const board = readFileSync("src/server/decision-board.ts", "utf8");
    const surface = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(board).toContain("marketCoverage");
    expect(board).toContain('status: completeGames === slate.games.length ? "complete"');
    expect(board).toContain('marketSource: "nflverse_consensus"');
    expect(surface).toContain("activeMarketCoverage");
    expect(surface).toContain("POSTED</small>");
    expect(surface).toContain("ALL 3 MARKETS POSTED");
  });

  it("1e1. publishes per-book raw contracts, translated equivalent prices, and exact-point EV", () => {
    const board = readFileSync("src/server/decision-board.ts", "utf8");
    const comparison = readFileSync("src/domain/book-comparison.ts", "utf8");
    const surface = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(board).toContain("buildMainlineContractEvaluations");
    expect(comparison).toContain("translatedAmericanPrice");
    expect(comparison).toContain("reapplyPowerHold");
    expect(comparison).toContain("expectedValueWithPush");
    expect(surface).toContain("alternateEvaluation.expectedValue");
    expect(surface).toContain("selectedEvaluation.canonicalPoint === alternateEvaluation.canonicalPoint");
    expect(surface).toContain("quoteCostCents");
  });

  it("1e2. freezes validated total translation and integer push mass for pricing and CLV", () => {
    expect(frozenTotalArtifact.frozenForSeason).toBe(2026);
    expect(frozenTotalArtifact.seasonRange).toEqual([2010, 2025]);
    expect(frozenTotalArtifact.source.gameRows).toBe(4_175);
    expect(structuralConfig.model.discreteTotalArtifact).toBe("discrete-total-2026.json");
    expect(structuralConfig.model.totalTranslationValidationArtifact).toBe("total-translation-validation.json");
    const board = readFileSync("src/server/decision-board.ts", "utf8");
    const settlement = readFileSync("src/server/automatic-settlement.ts", "utf8");
    const closing = readFileSync("src/server/closing-value.ts", "utf8");
    expect(board).toContain("frozenTotalArtifact");
    expect(settlement).toContain("frozenTotalArtifact");
    expect(closing).toContain("totalArtifact");
  });

  it("1f. never applies coefficient residuals from a champion logged under another config", () => {
    const board = readFileSync("src/server/decision-board.ts", "utf8");
    const automation = readFileSync("src/server/model-lifecycle/automation.ts", "utf8");
    expect(board).toContain('championStatus === "compatible"');
    expect(board).toContain("coefficient residual withheld pending a config-compatible logged champion");
    expect(automation).toContain("preseasonConfigRunDue");
    expect(automation).toContain("currentSeasonGames.length > 0 && championConfigMismatch");
    expect(automation).toContain("frozen structural configuration changed after the regular season began");
  });

  it("2. uses the power method for spread, total, favorite, underdog, and near-even markets", () => {
    for (const pair of [[-110, -110], [-105, -115], [-200, 170], [170, -200], [-101, -101]] as const) {
      const result = powerDevig(pair[0], pair[1]);
      expect(result.probabilities[0] + result.probabilities[1]).toBeCloseTo(1, 10);
      expect(result.rawImplied[0] ** result.exponent + result.rawImplied[1] ** result.exponent).toBeCloseTo(1, 10);
    }
    const favorite = powerDevig(-200, 170);
    const proportional = favorite.rawImplied[0] / (favorite.rawImplied[0] + favorite.rawImplied[1]);
    expect(favorite.probabilities[0]).not.toBeCloseTo(proportional, 5);
  });

  it("3. sizes only the shrunk probability with the 0.5u floor and 2u cap", () => {
    expect(shrinkProbability(0.6, 0.52, 0.25)).toBeCloseTo(0.54);
    const config = { referenceBankrollUnits: 100, kellyFraction: 0.25, increment: 0.5, minimum: 0.5, maximum: 2 };
    expect(sizeKelly(0.523, -110, [0.001, 0.02], config).suggestedUnits).toBe(0);
    expect(sizeKelly(0.55, -110, [0.01, 0.05], config).suggestedUnits).toBeGreaterThanOrEqual(0.5);
    expect(sizeKelly(0.9, 100, [0.2, 0.4], config).suggestedUnits).toBe(2);
  });

  it("3b. enforces the 10u week, 3u game, one-side, and one-total limits on official cards", () => {
    const position = (gameId: string, market: "spread" | "moneyline" | "total" | "prop" | "teaser", units: number, week = 1) => ({
      week, gameId, market, stakeCents: units * 2_500,
      contract: [{ gameId, market, side: market === "total" ? "Over" : "SEA", point: market === "moneyline" ? null : -2.5, americanPrice: -110, selection: "selection" }]
    });
    expect(validateTeamCardPortfolio([position("g1", "spread", 1)], position("g1", "moneyline", 1))).toContain("Only one side position is permitted per game");
    expect(validateTeamCardPortfolio([position("g1", "total", 1)], position("g1", "total", 1))).toContain("Only one total is permitted per game");
    expect(validateTeamCardPortfolio([position("g1", "prop", 2)], position("g1", "prop", 1.5))).toContain("Game exposure cannot exceed 3u");
    expect(validateTeamCardPortfolio(Array.from({ length: 5 }, (_, index) => position(`g${index}`, "prop", 2)), position("g9", "prop", 0.5))).toContain("Weekly exposure cannot exceed 10u");
    expect(validateTeamCardPortfolio([], position("g1", "prop", 2.5))).toContain("A pick must be between 0.5u and 2u");
    const summary = summarizeTeamCardPortfolio([position("g1", "spread", 1), position("g2", "prop", 2)], 1);
    expect(summary).toMatchObject({ officialPicks: 2, usedUnits: 3, remainingUnits: 7 });
    expect(summary.games.find((game) => game.gameId === "g1")).toMatchObject({ units: 1, sidePositions: 1, totalPositions: 0 });
    const batch = teamCardPortfolioBatchConflicts([], [position("g1", "spread", 1), position("g1", "moneyline", 1)]);
    expect(batch).toContainEqual(expect.objectContaining({ proposalIndex: 1, code: "side_slot", gameId: "g1" }));
    const store = readFileSync("src/server/play-store.ts", "utf8");
    expect(readFileSync("src/domain/portfolio-trigger.ts", "utf8")).toContain("approval_portfolio_guard_v2");
    expect(store).toContain("status IN ('card', 'placed', 'settled')");
    expect(store).toContain("DROP TRIGGER IF EXISTS approval_portfolio_guard_v1");
    expect(store).toContain("assertPortfolioAvailable");
    expect(readFileSync("src/app/api/plays/route.ts", "utf8")).toContain("stakeDollars: z.number().min(12.5).max(50)");
  });

  it("4. greys units when uncertainty spans zero without changing the numerical suggestion", () => {
    const config = { referenceBankrollUnits: 100, kellyFraction: 0.25, increment: 0.5, minimum: 0.5, maximum: 2 };
    const result = sizeKelly(0.56, -110, [-0.01, 0.06], config);
    expect(result.greyed).toBe(true);
    expect(result.suggestedUnits).toBeGreaterThanOrEqual(0.5);
  });

  it("4b. applies a promoted champion's market residual without erasing weekly state", () => {
    expect(applyChampionMarketResidual(0.57, 0.52, 0.52)).toBeCloseTo(0.57, 10);
    expect(applyChampionMarketResidual(0.57, 0.55, 0.52)).toBeGreaterThan(0.57);
  });

  it("5. replays consecutive weeks through state updates without implicit coefficient changes", () => {
    const initial = [{ team: "BUF", mean: 0, variance: 1, throughWeek: 0 }, { team: "NYJ", mean: 0, variance: 1, throughWeek: 0 }];
    const week1 = updateTeamStates(initial, [{ gameId: "g1", season: 2025, week: 1, homeTeam: "BUF", awayTeam: "NYJ", actualHomeMargin: 10, consensusHomeExpectedMargin: 3, completedAt: "2025-09-07" }], 0.18);
    const week2 = updateTeamStates(week1, [{ gameId: "g2", season: 2025, week: 2, homeTeam: "NYJ", awayTeam: "BUF", actualHomeMargin: -7, consensusHomeExpectedMargin: 1, completedAt: "2025-09-14" }], 0.18);
    expect(week1.find((row) => row.team === "BUF")?.mean).not.toBe(0);
    expect(week2.find((row) => row.team === "BUF")?.mean).not.toBe(week1.find((row) => row.team === "BUF")?.mean);
  });

  it("6. rejects a degraded challenger, alerts, and logs no promotion", () => {
    const result = runPromotionGate({ runId: "run", championHash: "champ", challengerHash: "bad", championMetrics: metrics, challengerMetrics: { ...metrics, pooledLogLoss: 0.75, calibrationSlope: 1.4 }, dataHash: "data", configHash: "config", featureSchemaHash: "schema", codeHash: "code", startedAt: "2026-09-15T14:00:00Z", completedAt: "2026-09-15T14:15:00Z" });
    expect(result.run.gateDecision).toBe("retain");
    expect(result.run.promotedAt).toBeNull();
    expect(result.alert?.type).toBe("gate_rejection");
  });

  it("7. aborts stale imports and preserves the last good values", () => {
    const state: JobState<number[]> = { key: "nflverse:tuesday", freshness: "current", lastGoodValue: [1, 2, 3], lastAttemptAt: "2026-09-08", lastSuccessAt: "2026-09-08", alert: null };
    const failed = failImport(state, "unavailable", "Missing Tuesday update", "2026-09-15");
    expect(failed.lastGoodValue).toEqual([1, 2, 3]);
    expect(failed.freshness).toBe("stale");
    expect(failed.alert).not.toBeNull();
    expect(completeImport(failed, [4], "2026-09-16").freshness).toBe("current");
    expect(readFileSync("src/app/api/nflverse/route.ts", "utf8")).toContain("Public access is read-only");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(worker).toContain("runModelLifecycleAutomation");
    expect(worker).toContain("scheduledMaintenanceLane");
  });

  it("8. rejects W+ data and forecast-time source leakage", () => {
    expect(validateForecastLeakage(forecast(), [{ completedWeek: 1 }])).toEqual([]);
    const errors = validateForecastLeakage(forecast({ inputsThroughWeek: 2, oddsCapturedAt: "2026-09-15T15:00:00.000Z" }), [{ completedWeek: 2 }]);
    expect(errors).toHaveLength(3);
  });

  it("9. keeps era handling in config, estimates distinct 2020 HFA, and rebuilds key mass from 2015", () => {
    expect(eraConfig.eras.find((era) => era.season === 2020)?.trainingMultiplier).toBe(0.5);
    const rows: ModelTrainingRow[] = [];
    for (const season of [2019, 2020, 2021]) for (let index = 0; index < 20; index += 1) rows.push({ id: `${season}-${index}`, season, week: index + 1, market: "spread", outcome: season === 2020 ? 0 : 1, push: false, weight: season === 2020 ? 0.5 : 1, features: { isHomeSide: 1, epa: index / 100 } });
    const model = fitWeightedLogistic(rows, { iterations: 300 });
    const coefficient = (name: string) => model.coefficients[model.featureNames.indexOf(name)];
    expect(coefficient("hfa_season_2020")).not.toBeCloseTo(coefficient("hfa_season_2019"), 3);
    const boundaryArtifact = buildDiscreteMarginArtifact([{ gameId: "old", season: 2014, consensusSpread: 0, actualMargin: 3 }, { gameId: "new", season: 2015, consensusSpread: 0, actualMargin: 7 }], { latestCompletedSeason: 2015, halfLifeSeasons: 2.5, boundarySeason: 2015, keyMargins: [3, 7], generatedAt: "2026-02-01" });
    expect(boundaryArtifact.keyMarginMasses["3"]).toBe(0);
    expect(boundaryArtifact.keyMarginMasses["7"]).toBe(1);
  });

  it("10. simulates the actual 2026 kickoff windows, alerts at 400, and remains at or below 450", () => {
    const simulations = creditConfig.billingPeriods.map((period) => simulateCreditPeriod({ kickoffWindows: Array.from({ length: period.kickoffWindows }, (_, index) => ({ kickoffAt: `${period.month}-${String((index % 27) + 1).padStart(2, "0")}T20:00:00Z` })), weeklySlates: period.weeklySlates, weekdaysInSeason: period.ordinaryWeekdaySnapshots, propGames: period.propGames }));
    expect(simulations.every((simulation) => simulation.withinCeiling)).toBe(true);
    expect(Math.max(...simulations.map((simulation) => simulation.projectedCredits))).toBe(450);
    expect(simulations.some((simulation) => simulation.alertAt400)).toBe(true);
    expect(simulations.every((simulation, index) => simulation.allowedRequests.props === creditConfig.billingPeriods[index].propGames)).toBe(true);
    expect(simulations.some((simulation) => simulation.throttled.includes("kickoff_minus_60"))).toBe(true);
    expect(simulations.every((simulation) => !simulation.throttled.includes("player_props"))).toBe(true);
    const novemberGames: ScheduledGame[] = Array.from({ length: 71 }, (_, index) => ({
      id: `nov-${index}`,
      away: "A",
      home: "H",
      kickoffAt: `2026-11-${String(index % 28 + 1).padStart(2, "0")}T${String(17 + Math.floor(index / 28) * 3).padStart(2, "0")}:00:00.000Z`
    }));
    const lastPropGame = [...novemberGames].sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt) || left.id.localeCompare(right.id)).at(-1)!;
    const lastProp: ScheduledOddsCandidate = {
      key: "last-prop", job: "props_minus_60", gameId: lastPropGame.id, cost: 3, priority: 2,
      scheduledFor: new Date(Date.parse(lastPropGame.kickoffAt) - 60 * 60_000).toISOString()
    };
    expect(plannedOddsThrottleReason(lastProp, novemberGames, 399)).toBeNull();
    const distinctSixtyWindows = [...new Set(novemberGames.map((game) => new Date(Date.parse(game.kickoffAt) - 60 * 60_000).toISOString()))].sort();
    const lastSixty: ScheduledOddsCandidate = {
      key: "last-60", job: "kickoff_minus_60", gameId: null, cost: 3, priority: 3,
      scheduledFor: distinctSixtyWindows.at(-1)!
    };
    expect(plannedOddsThrottleReason(lastSixty, novemberGames, 399)).toMatch(/reservation plan/);
  });

  it("10b. keeps the documented busiest-period ceiling aligned with the executable reservation plan", async () => {
    const readme = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../README.md", import.meta.url), "utf8"));
    const projected = creditConfig.billingPeriods.map((period) => simulateCreditPeriod({
      kickoffWindows: Array.from({ length: period.kickoffWindows }, () => ({ kickoffAt: `${period.month}-01T20:00:00Z` })),
      weeklySlates: period.weeklySlates,
      weekdaysInSeason: period.ordinaryWeekdaySnapshots,
      propGames: period.propGames
    }).projectedCredits);
    expect(Math.max(...projected)).toBe(450);
    expect(readme).toContain("October, November, and December each reach the enforced 450-credit ceiling");
    expect(readme).not.toContain("busiest projected billing period at 408 credits");
  });

  it("11. enforces historical/current injury boundaries, 90-minute flags, failure behavior, and QB audit", () => {
    expect(() => validateHistoricalInjurySeason(2025)).toThrow(/through 2024/);
    const normalized = normalizeOfficialInjuries([{ player: "Starter", team: "BUF", gameId: "g", gameStatus: "Questionable" }], "https://www.buffalobills.com/team/injury-report/", "2026-09-13T17:00:00Z", ["BUF"]);
    expect(normalized[0].rawSnapshotHash).toHaveLength(64);
    expect(() => normalizeOfficialInjuries(normalized, "https://nfl.com", "2026-09-13", ["BUF", "NYJ"])).toThrow(/Partial/);
    expect(validateInactivesTiming("2026-09-13T20:00:00Z", "2026-09-13T18:30:00Z")).toBe(true);
    expect(() => createQuarterbackOverride({ value: -3, sourceUrl: "https://nfl.com/report", rationale: "Starter inactive", authorId: "future-teammate", createdAt: "2026-09-13" }, "teammate")).toThrow(/owner/);
  });

  it("12. binds both approvals to an unchanged contract and refreshes changed quotes", () => {
    const members = [{ id: "analyst_a", displayName: "Analyst A", email: "analyst_a@example.com", role: "owner" as const }, { id: "future-teammate", displayName: "Future teammate", email: "future@example.com", role: "teammate" as const }] as const;
    const current = pick({ executionStatus: "executed" });
    const refreshed = approveRevision(current, members[0], members, quote({ point: -3, americanPrice: 102 }), "2026-09-13T18:00:00Z");
    expect(refreshed.refreshedBecauseQuoteChanged).toBe(true);
    expect(refreshed.revision.approvals).toEqual([]);
    const first = approveRevision(current, members[0], members, quote(), "2026-09-13T18:00:00Z").revision;
    expect(() => approveRevision(first, members[1], members, quote(), "2026-09-13T18:01:00Z", false)).toThrow(/cash/);
    const second = approveRevision(first, members[1], members, quote(), "2026-09-13T18:01:00Z", true).revision;
    expect(second.status).toBe("approved");
    expect(new Set(second.approvals.map((approval) => approval.revisionHash))).toEqual(new Set([revisionHash(current)]));
  });

  it("12b. freezes server-derived forecast and consensus provenance at approval", () => {
    const store = readFileSync("src/server/play-store.ts", "utf8");
    const provenance = readFileSync("src/server/play-provenance.ts", "utf8");
    const trigger = readFileSync("src/domain/portfolio-trigger.ts", "utf8");
    expect(store).toContain("capturePlayForecastSnapshot");
    expect(store).toContain("forecast_json = ?");
    expect(provenance).toContain("buildDecisionBoard(db");
    expect(provenance).toContain("consensusSnapshotId");
    expect(provenance).toContain("dataHash: board.dataHash");
    expect(trigger).toContain("Approval requires a complete forecast and consensus snapshot");
  });

  it("13. displays full and executed-only records separately", () => {
    const records = dualRecordSummaries([settled("executed", 1, 3), settled("paper", -0.5, 2)]);
    expect(records.full.picks).toBe(2);
    expect(records.executedOnly.picks).toBe(1);
    expect(records.full.profitDollars).toBe(12.5);
    expect(records.executedOnly.profitDollars).toBe(25);
  });

  it("14. calculates same-point and translated-point cents plus directional point CLV", () => {
    const opponent = quote({ id: "opp", side: "NYJ +3", point: 3, americanPrice: -110 });
    const different = calculateTranslatedClv({ entryPrice: -110, entryPoint: -2.5, closingQuote: quote({ point: -3, side: "Buffalo -3" }), closingOpponentQuote: opponent, consensusSpread: -3, artifact });
    expect(different.syntheticClosingAmerican).not.toBeNull();
    expect(different.pointClv).toBe(0.5);
    const same = calculateTranslatedClv({ entryPrice: -105, entryPoint: -3, closingQuote: quote({ point: -3, side: "Buffalo -3" }), closingOpponentQuote: opponent, consensusSpread: -3, artifact });
    expect(same.priceClvCents).not.toBeNull();
    const better = chooseBetterPaperClose([{ ...same, book: "betmgm" }, { ...different, book: "fanduel" }]);
    expect(["betmgm", "fanduel"]).toContain(better.book);
  });

  it("15. filters Sunday today, exposes countdown/age/flags, expires drafts, and never auto-approves", () => {
    const games = [{ kickoffAt: "2026-09-13T20:00:00Z", payload: "today" }, { kickoffAt: "2026-09-14T20:00:00Z", payload: "tomorrow" }];
    expect(isPacificSunday("2026-09-13T18:00:00Z")).toBe(true);
    expect(isPacificSunday("2026-09-14T20:00:00Z")).toBe(false);
    expect(todayOnly(games, "2026-09-13T18:00:00Z").map((game) => game.payload)).toEqual(["today"]);
    expect(kickoffCountdown(games[0].kickoffAt, "2026-09-13T19:00:00Z")).toBe(3_600_000);
    expect(snapshotAgeMs("2026-09-13T18:59:00Z", "2026-09-13T19:00:00Z")).toBe(60_000);
    const refreshed = refreshSundayDraft({ revision: pick(), latestQuote: quote(), latestEdge: -0.01, now: "2026-09-14T02:00:00Z" });
    expect(refreshed.revision.revision).toBe(2);
    expect(refreshed.revision.status).toBe("draft");
    expect(refreshed.edgeGone).toBe(true);
    expect(applyKickoffLock(pick({ status: "awaiting_approval" }), "2026-09-13T20:00:00Z").status).toBe("void");
    const surface = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(surface).toContain("visibleMatchups");
    expect(surface).toContain("INACTIVES ✓");
    expect(surface).not.toContain("EDGE GONE · REFRESH");
    expect(surface).toContain("stores no selections");
  });

  it("16. allows exactly two idempotent Web Push event types", () => {
    const waiting = createPushDelivery({ type: "awaiting_you", recipientId: "future-teammate", idempotencyKey: "r1:t", createdAt: "2026-09-13" });
    const edge = createPushDelivery({ type: "edge_threshold", recipientId: "analyst_a", idempotencyKey: "snap1:g", createdAt: "2026-09-13" });
    expect(deduplicatePushes([waiting, waiting, edge])).toHaveLength(2);
    expect(() => createPushDelivery({ type: "pipeline_failure" as PushDelivery["type"], recipientId: "analyst_a", idempotencyKey: "bad", createdAt: "2026-09-13" })).toThrow(/Only/);
  });

  it("17. enforces permissions, kickoff locks, complete grading, and correction audit", () => {
    expect(authorize("teammate", "approve_candidate")).toBe(true);
    expect(authorize("teammate", "qb_override")).toBe(false);
    expect(() => assertNoUnauthenticatedApi(null)).toThrow(/prohibited/);
    expect(gradePick(pick(), { actualSelectionMargin: 3, totalPoints: 44, gameCompleted: true })).toBe("win");
    expect(gradePick(pick({ market: "total", selection: "Under 44", frozenPoint: 44 }), { actualSelectionMargin: 0, totalPoints: 44, gameCompleted: true })).toBe("push");
    expect(gradePick(pick({ market: "moneyline", frozenPoint: null }), { actualSelectionMargin: -1, totalPoints: 44, gameCompleted: true })).toBe("loss");
    expect(gradePick(pick(), { actualSelectionMargin: 0, totalPoints: 0, gameCompleted: false })).toBe("void");
    expect(profitForResult("win", 1, 150)).toBe(1.5);
    const base = settled("executed", -1, 1) as SettledPick;
    expect(() => correctSettlement(base, { result: "win", profitUnits: 1, reason: "Official correction", actorId: "future-teammate", correctedAt: "2026-09-14" }, "teammate")).toThrow(/owner/);
    const corrected = correctSettlement(base, { result: "win", profitUnits: 1, reason: "Official correction", actorId: "analyst_a", correctedAt: "2026-09-14" }, "owner");
    expect(corrected.audit.action).toBe("settlement_corrected");
    const correctionRoute = readFileSync("src/app/api/plays/[id]/correction/route.ts", "utf8");
    const correctionStore = readFileSync("src/server/settlement-corrections.ts", "utf8");
    expect(correctionRoute).toContain('member.actor !== "analyst_a"');
    expect(correctionStore).toContain("play_correction_audit");
    expect(correctionStore).toContain("Only a settled play can be corrected");
    expect(editRevision(pick(), { frozenPrice: -105 }, "future-teammate", "2026-09-13T13:00:00Z").approvals).toEqual([]);
    const securityMigration = readFileSync("supabase/migrations/202608110002_operational_guards.sql", "utf8");
    expect(securityMigration).toContain("approval_contract_guard");
    expect(securityMigration).toContain("claim_projection_lab_invite");
    expect(securityMigration).toContain("enable row level security");
    expect(securityMigration).toContain("drop policy if exists member_update_pick_state");
  });

  it("18. loads the complete Week 1 schedule and the shared research taxonomy", () => {
    expect(weekOneMatchups).toHaveLength(16);
    expect(new Set(weekOneMatchups.flatMap((game) => [game.away, game.home])).size).toBe(32);
    expect(weekOneMatchups[0]).toMatchObject({ away: "NE", home: "SEA", day: "Wednesday" });
    expect(new Set(weekOneMatchups.map((game) => game.day))).toEqual(new Set(["Wednesday", "Thursday", "Sunday", "Monday"]));
    expect(new Set(pickReasons.map((reason) => reason.lane))).toEqual(new Set(["Quant", "Football", "Situational", "Market", "Open"]));
    const page = readFileSync("src/app/(dashboard)/sunday/page.tsx", "utf8");
    expect(page).not.toContain("target");
    expect(page).not.toContain("Build the card");
  });

  it("19. converts the simple intake edge and price into an explicit EV estimate", () => {
    expect(estimatedEvFromEdge(-110, 0)).toBeCloseTo(0, 10);
    expect(estimatedEvFromEdge(-110, 3.4)).toBeGreaterThan(0);
    expect(estimatedEvFromEdge(138, -5)).toBeLessThan(0);
  });

  it("20. keeps settlement accounting inside the separate bet tracker", () => {
    const rows = rehearsalPlays.slice(0, 2).map((play, index) => ({
      ...play,
      status: "settled" as const,
      result: index === 0 ? "win" as const : "loss" as const,
      profitCents: index === 0 ? 4_545 : -5_000,
      closingClvCents: index === 0 ? 3.2 : -1.1
    }));
    const summary = trackerSummary(rows);
    expect(summary.settledCount).toBe(2);
    expect(summary.winCount).toBe(1);
    expect(summary.lossCount).toBe(1);
    expect(summary.profitCents).toBe(-455);
    expect(summary.averageClvCents).toBeCloseTo(1.05);
    expect(summary.clvCount).toBe(2);
    expect(summary.maximumDrawdownCents).toBe(5000);
    const records = trackerRecordSummaries([
      { ...rows[0], executionStatus: "executed", cashPlacementConfirmed: true },
      { ...rows[1], executionStatus: "paper", cashPlacementConfirmed: false }
    ]);
    expect(records.full.settledCount).toBe(2);
    expect(records.executedOnly.settledCount).toBe(1);
    expect(records.executedOnly.profitCents).toBe(4545);
  });

  it("21. power-de-vigs visible price pairs and shows cumulative parlay value lost", () => {
    const raw = [
      { id: "ne-sea:betmgm:spread:ne", gameId: "ne-sea", book: "betmgm" as const, market: "spread" as const, side: "NE", point: 2.5, americanPrice: -110, capturedAt: "2026-08-11", sourceEventId: "event-1", sourceHash: "hash" },
      { id: "ne-sea:betmgm:spread:sea", gameId: "ne-sea", book: "betmgm" as const, market: "spread" as const, side: "SEA", point: -2.5, americanPrice: -110, capturedAt: "2026-08-11", sourceEventId: "event-1", sourceHash: "hash" },
      { id: "den-kc:betmgm:spread:den", gameId: "den-kc", book: "betmgm" as const, market: "spread" as const, side: "DEN", point: 3, americanPrice: -110, capturedAt: "2026-08-11", sourceEventId: "event-2", sourceHash: "hash" },
      { id: "den-kc:betmgm:spread:kc", gameId: "den-kc", book: "betmgm" as const, market: "spread" as const, side: "KC", point: -3, americanPrice: -110, capturedAt: "2026-08-11", sourceEventId: "event-2", sourceHash: "hash" }
    ];
    const enriched = enrichWithPowerDevig(raw);
    expect(enriched[0].fairProbability).toBeCloseTo(0.5, 10);
    expect(enriched[0].marketVigPercent).toBeCloseTo(4.7619, 3);
    const legs: SlipLeg[] = [
      { ...enriched[0], matchup: "NE @ SEA", selection: "NE +2.5" },
      { ...enriched[2], matchup: "DEN @ KC", selection: "DEN +3" }
    ];
    const value = analyzeSlipValue(legs);
    expect(value?.offeredAmerican).toBe(264);
    expect(value?.fairAmerican).toBe(300);
    expect(value?.vigDragPercent).toBeCloseTo(8.88, 1);
    expect(value?.lossPerUnitDollars).toBeCloseTo(2.22, 1);
    expect(analyzeSlipValue([legs[0], { ...legs[1], gameId: "ne-sea" }])).toBeNull();
  });

  it("22. maps the provider's BetMGM and FanDuel books onto the Week 1 board", async () => {
    const event = {
      id: "provider-ne-sea",
      commence_time: "2026-09-10T00:20:00Z",
      home_team: "Seattle Seahawks",
      away_team: "New England Patriots",
      bookmakers: ["betmgm", "fanduel"].map((key) => ({
        key,
        last_update: "2026-08-11T20:00:00Z",
        markets: [
          { key: "spreads", outcomes: [{ name: "New England Patriots", point: 2.5, price: -110 }, { name: "Seattle Seahawks", point: -2.5, price: -110 }] },
          { key: "totals", outcomes: [{ name: "Over", point: 44.5, price: -105 }, { name: "Under", point: 44.5, price: -115 }] },
          { key: "h2h", outcomes: [{ name: "New England Patriots", price: 125 }, { name: "Seattle Seahawks", price: -145 }] }
        ]
      }))
    };
    const fetcher = async () => new Response(JSON.stringify([event]), { status: 200, headers: { "x-requests-used": "3", "x-requests-remaining": "497", "x-requests-last": "3" } });
    const result = await fetchWeekOneLiveOdds("test-key", fetcher as typeof fetch);
    expect(result.lines).toHaveLength(12);
    expect(new Set(result.lines.map((line) => line.book))).toEqual(new Set(["betmgm", "fanduel"]));
    expect(result.lines.find((line) => line.book === "fanduel" && line.side === "SEA")?.americanPrice).toBe(-110);
  });

  it("23. confirms props only across three independent books at the exact same point", () => {
    const quotePair = (book: string, point: number, over: number, under: number, player = "Quarterback"): RawPropQuote[] => ([
      { id: `${book}:${player}:over:${point}`, gameId: "ne-sea", eventId: "event", book, market: "player_pass_yds", player, side: "Over", point, americanPrice: over, capturedAt: "2026-09-09T18:00:00Z", sourceHash: "hash" },
      { id: `${book}:${player}:under:${point}`, gameId: "ne-sea", eventId: "event", book, market: "player_pass_yds", player, side: "Under", point, americanPrice: under, capturedAt: "2026-09-09T18:00:00Z", sourceHash: "hash" }
    ]);
    const exact = [
      ...quotePair("betmgm", 249.5, 120, -150),
      ...quotePair("draftkings", 249.5, -135, 105),
      ...quotePair("fanduel", 249.5, -130, 100),
      ...quotePair("bovada", 249.5, -125, -105),
      ...quotePair("fanduel", 59.5, 120, -150, "Running Back"),
      ...quotePair("betmgm", 59.5, -135, 105, "Running Back"),
      ...quotePair("draftkings", 59.5, -130, 100, "Running Back"),
      ...quotePair("bovada", 59.5, -125, -105, "Running Back")
    ];
    const candidates = scanMarketConfirmedProps(exact);
    expect(candidates).toHaveLength(2);
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ executionBook: "betmgm", side: "Over", point: 249.5, referenceBooks: 3 }),
      expect.objectContaining({ executionBook: "fanduel", side: "Over", point: 59.5, referenceBooks: 3 })
    ]));
    expect(candidates.every((candidate) => candidate.expectedValue > 0.02)).toBe(true);
    expect(candidates.every((candidate) => candidate.suggestedUnits >= 0.5 && candidate.suggestedUnits <= 2)).toBe(true);
    expect(candidates.every((candidate) => candidate.edgeInterval[0] > 0)).toBe(true);
    const mismatched = exact.map((row) => row.book === "bovada" ? { ...row, point: 250.5 } : row);
    expect(scanMarketConfirmedProps(mismatched)).toEqual([]);
  });

  it("23b. requires independent player history and time-aligned references for production prop cards", () => {
    const pair = (book: string, capturedAt = "2026-09-09T18:00:00Z", player = "Quarterback Jr."): RawPropQuote[] => ([
      { id: `${book}:over`, gameId: "ne-sea", eventId: "event", book, market: "player_pass_yds", player, side: "Over", point: 249.5, americanPrice: book === "betmgm" ? 120 : -130, capturedAt, sourceHash: "hash" },
      { id: `${book}:under`, gameId: "ne-sea", eventId: "event", book, market: "player_pass_yds", player, side: "Under", point: 249.5, americanPrice: book === "betmgm" ? -150 : 100, capturedAt, sourceHash: "hash" }
    ]);
    const quotes = [
      ...pair("betmgm"),
      ...pair("fanduel", undefined, "Quarterback"),
      ...pair("draftkings", undefined, "Quarterback II"),
      ...pair("bovada", undefined, "Quarterback.")
    ];
    const history = [288, 274, 305, 260, 281, 267, 292, 255].map((value, index) => ({
      player: "Quarterback",
      market: "player_pass_yds" as const,
      season: 2025,
      week: 18 - index,
      value,
      opportunities: 30
    }));
    const evidence = buildPlayerPropEvidence(history, { player: "Quarterback Jr.", market: "player_pass_yds", side: "Over", point: 249.5 });
    expect(evidence).toMatchObject({ sampleGames: 8, side: "Over" });
    expect(evidence!.projectedValue).toBeGreaterThan(249.5);
    const candidates = scanMarketConfirmedProps(quotes, { evidence: [evidence!], requireEvidence: true, maximumSnapshotSkewMs: 10 * 60_000 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ executionBook: "betmgm", sampleGames: 8 });
    expect(candidates[0].betProbability).toBeGreaterThan(candidates[0].consensusProbability);
    expect(scanMarketConfirmedProps(quotes, {
      evidence: [evidence!], requireEvidence: true, requireConfirmedAvailability: true,
      availabilityConfirmed: false
    })).toEqual([]);
    expect(scanMarketConfirmedProps(quotes, {
      evidence: [evidence!], requireEvidence: true, requireConfirmedAvailability: true,
      availabilityConfirmed: true, unavailablePlayers: ["Quarterback"]
    })).toEqual([]);
    expect(scanMarketConfirmedProps(quotes, {
      evidence: [evidence!], requireEvidence: true, requireConfirmedAvailability: true,
      availabilityConfirmed: true, unavailablePlayers: []
    })).toHaveLength(1);
    expect(isPropPlayerUnavailable("Out")).toBe(true);
    expect(isPropPlayerUnavailable("Doubtful")).toBe(true);
    expect(isPropPlayerUnavailable("Questionable")).toBe(false);
    expect(isPropPlayerUnavailable(null, true)).toBe(true);
    const stale = [...pair("betmgm"), ...pair("fanduel"), ...pair("draftkings"), ...pair("bovada", "2026-09-09T17:00:00Z")];
    expect(scanMarketConfirmedProps(stale, { evidence: [evidence!], requireEvidence: true, maximumSnapshotSkewMs: 10 * 60_000 })).toEqual([]);
    expect(scanMarketConfirmedProps(quotes, {
      evidence: [evidence!], requireEvidence: true,
      maximumQuoteAgeMs: 75 * 60_000, now: "2026-09-09T19:16:00Z"
    })).toEqual([]);
    expect(scanMarketConfirmedProps(quotes, {
      evidence: [evidence!], requireEvidence: true,
      maximumQuoteAgeMs: 75 * 60_000, now: "2026-09-09T19:15:00Z"
    })).toHaveLength(1);
  });

  it("23c. counts snap-confirmed zero-opportunity games and returns distinct prop theses", () => {
    expect(propPlayerLookupPattern("D.J. Moore Jr.")).toBe("%moore%");
    const history = [
      { player: "Receiver", market: "player_reception_yds" as const, season: 2025, week: 18, value: 0, opportunities: 0, participated: true },
      ...[82, 74, 69, 91, 77, 88, 71].map((value, index) => ({
        player: "Receiver", market: "player_reception_yds" as const, season: 2025, week: 17 - index,
        value, opportunities: 7
      }))
    ];
    const evidence = buildPlayerPropEvidence(
      history,
      { player: "Receiver", market: "player_reception_yds", side: "Over", point: 60.5 },
      { leagueYardsPerOpportunity: { player_reception_yds: 10.8 } }
    );
    expect(evidence).toMatchObject({ sampleGames: 8 });
    expect(evidence!.hitRate).toBeLessThan(1);

    const pair = (book: string, point: number, over: number, under: number): RawPropQuote[] => ([
      { id: `${book}:${point}:over`, gameId: "ne-sea", eventId: "event", book, market: "player_pass_yds", player: "Quarterback", side: "Over", point, americanPrice: over, capturedAt: "2026-09-09T18:00:00Z", sourceHash: "hash" },
      { id: `${book}:${point}:under`, gameId: "ne-sea", eventId: "event", book, market: "player_pass_yds", player: "Quarterback", side: "Under", point, americanPrice: under, capturedAt: "2026-09-09T18:00:00Z", sourceHash: "hash" }
    ]);
    const quotes = [249.5, 250.5].flatMap((point, index) => [
      ...pair("betmgm", point, index === 0 ? 150 : 140, -240),
      ...pair("fanduel", point, -140, 110),
      ...pair("draftkings", point, -145, 115),
      ...pair("bovada", point, -135, 105)
    ]);
    const candidates = scanMarketConfirmedProps(quotes, { maximumPerBook: 3 });
    const betmgm = candidates.filter((candidate) => candidate.executionBook === "betmgm");
    expect(betmgm).toHaveLength(1);
    expect(betmgm[0]).toMatchObject({ player: "Quarterback", market: "player_pass_yds", point: 249.5 });
  });

  it("23d. rejects an unvalidated second opponent adjustment for props", () => {
    const validation = JSON.parse(readFileSync("config/prop-matchup-validation.json", "utf8")) as {
      decision: string;
      results: Array<{ relativeMaeImprovementPercent: number; seasonallyConsistent: boolean }>;
    };
    expect(validation.decision).toBe("rejected");
    expect(validation.results.every((row) => row.relativeMaeImprovementPercent < 1)).toBe(true);
    expect(validation.results.every((row) => !row.seasonallyConsistent)).toBe(true);
    expect(structuralConfig.props.matchupAdjustment).toBe("market_consensus_only");
    expect(structuralConfig.props.matchupValidationArtifact).toBe("prop-matchup-validation.json");
  });

  it("23f. rejects partial prop payloads before replacing the last good board", () => {
    const over: RawPropQuote = {
      id: "betmgm:over", gameId: "ne-sea", eventId: "event", book: "betmgm",
      market: "player_pass_yds", player: "Quarterback", side: "Over", point: 249.5,
      americanPrice: -110, capturedAt: "2026-09-09T18:00:00Z", sourceHash: "hash"
    };
    expect(() => assertCompletePropQuotePairs([over])).toThrow(/partial.*incomplete/i);
    expect(() => assertCompletePropQuotePairs([over, { ...over, id: "betmgm:under", side: "Under" }])).not.toThrow();
    const importer = readFileSync("src/server/player-props.ts", "utf8");
    expect(importer.indexOf("assertCompletePropQuotePairs(quotes)")).toBeLessThan(
      importer.indexOf('DELETE FROM player_prop_quotes_stage WHERE import_id = ?')
    );
  });

  it("23e. promotes usage forecasts only where untouched holdout data passes the gate", () => {
    const validation = JSON.parse(readFileSync("config/prop-usage-validation.json", "utf8")) as {
      results: Array<{
        market: string;
        decision: string;
        holdoutRelativeMaeImprovementPercent: number;
        blockBootstrap80PercentMeanAbsoluteErrorImprovement: [number, number];
      }>;
    };
    expect(validation.results.find((row) => row.market === "player_pass_yds")?.decision).toBe("rejected");
    for (const market of ["player_rush_yds", "player_reception_yds"] as const) {
      const result = validation.results.find((row) => row.market === market)!;
      expect(result.decision).toBe("promoted");
      expect(result.holdoutRelativeMaeImprovementPercent).toBeGreaterThan(0);
      expect(result.blockBootstrap80PercentMeanAbsoluteErrorImprovement[0]).toBeGreaterThan(0);
      expect(structuralConfig.props.projectionByMarket[market].method).toBe("usage_efficiency");
    }
    expect(structuralConfig.props.projectionByMarket.player_pass_yds.method).toBe("weighted_yardage_mean");
    expect(structuralConfig.props.usageProjectionValidationArtifact).toBe("prop-usage-validation.json");

    const leagueTotals = {
      seasons: 6, passingYards: 150_000, attempts: 4_500,
      rushingYards: 75_000, carries: 17_000, receivingYards: 145_000, targets: 13_500
    };
    expect(completeLeaguePropEfficiencyPrior({ ...leagueTotals, seasons: 5 }, 6)).toBeNull();
    expect(completeLeaguePropEfficiencyPrior(leagueTotals, 6)).toEqual({
      player_pass_yds: 150_000 / 4_500,
      player_rush_yds: 75_000 / 17_000,
      player_reception_yds: 145_000 / 13_500
    });

    const history = [
      [18, 72, 15], [17, 48, 12], [16, 80, 16], [15, 30, 8],
      [14, 55, 11], [13, 44, 10], [12, 68, 14], [11, 36, 9]
    ].map(([week, value, opportunities]) => ({
      player: "Runner", market: "player_rush_yds" as const, season: 2025, week, value, opportunities
    }));
    const contract = { player: "Runner", market: "player_rush_yds" as const, side: "Over" as const, point: 49.5 };
    expect(buildPlayerPropEvidence(history, contract)).toBeNull();
    const evidence = buildPlayerPropEvidence(history, contract, {
      leagueYardsPerOpportunity: { player_rush_yds: 4.2 }
    });
    const valueWeights = history.map((_, index) => 0.85 ** index);
    const usageWeights = history.map((_, index) => 0.75 ** index);
    const weightedYards = history.reduce((sum, row, index) => sum + row.value * valueWeights[index], 0);
    const weightedOpportunities = history.reduce((sum, row, index) => sum + row.opportunities * valueWeights[index], 0);
    const projectedOpportunities = history.reduce((sum, row, index) => sum + row.opportunities * usageWeights[index], 0) /
      usageWeights.reduce((sum, weight) => sum + weight, 0);
    const expected = projectedOpportunities * (weightedYards + 40 * 4.2) / (weightedOpportunities + 40);
    expect(evidence?.projectedValue).toBeCloseTo(expected, 10);
  });

  it("24. identifies classic Wong paths and derives crossed key numbers", () => {
    expect(isClassicWongPoint(2.5)).toBe(true);
    expect(isClassicWongPoint(-8)).toBe(true);
    expect(isClassicWongPoint(3)).toBe(false);
    expect(crossedKeyNumbers(-8, -2)).toEqual([3, 6, 7]);
    expect(crossedKeyNumbers(2.5, 8.5)).toEqual([3, 6, 7]);
  });

  it("25. keeps methodology and team-room exposition behind the compact weekly screen", () => {
    const nav = readFileSync("src/components/nav-links.tsx", "utf8");
    expect(nav).not.toContain("Research");
    expect(nav).not.toContain("Team room");
    expect(readFileSync("src/app/(dashboard)/model/page.tsx", "utf8")).toContain('redirect("/sunday")');
    expect(readFileSync("src/app/(dashboard)/team/page.tsx", "utf8")).toContain('redirect("/sunday")');
  });

  it("26. converts nflverse expected home margin into the sportsbook point without reversing residuals", () => {
    expect(nflverseExpectedMarginToHomePoint(3.5)).toBe(-3.5);
    expect(nflverseExpectedMarginToHomePoint(-2.5)).toBe(2.5);
    expect(marginVersusConsensusResidual(8, 3)).toBe(5);
    expect(marginVersusConsensusResidual(-4, -2.5)).toBe(-1.5);
    expect(normalizeNflverseTeam("LA")).toBe("LAR");
    expect(normalizeNflverseTeam("STL")).toBe("LAR");
    expect(normalizeNflverseTeam("SD")).toBe("LAC");
    expect(normalizeNflverseTeam("OAK")).toBe("LV");
  });

  it("27. schedules idempotent opener and kickoff snapshots without duplicate kickoff windows", () => {
    const games: ScheduledGame[] = weekOneMatchups.map((game) => ({ id: game.id, away: game.away, home: game.home, kickoffAt: weekOneKickoffs[game.id] }));
    const sundayOpen = scheduledMainlineCandidates(new Date("2026-09-07T01:05:00.000Z"), games);
    expect(sundayOpen.map((candidate) => candidate.job)).toEqual(["open_sunday"]);
    const oneHourBeforeSundayEarly = scheduledMainlineCandidates(new Date("2026-09-13T16:05:00.000Z"), games);
    expect(oneHourBeforeSundayEarly.filter((candidate) => candidate.job === "kickoff_minus_60")).toHaveLength(1);
    expect(new Set(oneHourBeforeSundayEarly.map((candidate) => candidate.key)).size).toBe(oneHourBeforeSundayEarly.length);
    const props = scheduledPropCandidates(new Date("2026-09-13T16:05:00.000Z"), games);
    expect(props.map((candidate) => candidate.gameId).sort()).toEqual([
      "atl-pit", "bal-ind", "buf-hou", "chi-car", "cle-jax", "no-det", "nyj-ten", "tb-cin"
    ]);
    expect(scheduledPropCandidates(new Date("2026-09-13T16:40:00.000Z"), games).map((candidate) => candidate.gameId)).toContain("atl-pit");
    expect(scheduledPropCandidates(new Date("2026-09-13T16:51:00.000Z"), games).map((candidate) => candidate.gameId)).not.toContain("atl-pit");
    expect(readFileSync("src/server/odds-automation.ts", "utf8")).toContain("getPlayerPropAvailability");
    const missedSaturday = latestExpectedMainlineCandidate(new Date("2026-08-16T23:50:00.000Z"), games);
    expect(missedSaturday).toMatchObject({ job: "daily", scheduledFor: "2026-08-15T09:00:00[America/Los_Angeles]" });
    const sundayOpener = latestExpectedMainlineCandidate(new Date("2026-08-17T01:05:00.000Z"), games);
    expect(sundayOpener).toMatchObject({ job: "open_sunday", scheduledFor: "2026-08-16T18:00:00[America/Los_Angeles]" });
    expect(deterministicRecoveryCandidate(sundayOpener!, null)?.key).toBe(sundayOpener?.key);
    expect(deterministicRecoveryCandidate(sundayOpener!, "failed")?.key).toBe(`${sundayOpener?.key}:recovery-v2`);
    expect(deterministicRecoveryCandidate(sundayOpener!, "succeeded")).toBeNull();
    expect(readFileSync("src/app/api/lines/route.ts", "utf8")).toContain("lines refresh automatically");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(worker).toContain('url.pathname === "/api/lines"');
    expect(worker).toContain('request.method === "GET"');
    expect(worker).toContain("allowCatchup: true");
    expect(worker).toContain('request.headers.has("oai-authenticated-user-email")');
  });

  it("28. partitions a partial mainline payload at the whole-game boundary", () => {
    const partial = [{ gameId: "ne-sea", book: "betmgm", market: "total" }] as Awaited<ReturnType<typeof fetchWeekOneLiveOdds>>["lines"];
    const result = inspectMainlineCompleteness(partial, weekOneMatchups.map((game) => game.id));
    expect(result).toMatchObject({ complete: false, completeGames: 0, totalGames: 16 });
    expect(result.missingGameIds).toContain("ne-sea");
    const oneSided = (["spread", "total", "moneyline"] as const).map((market) => ({
      gameId: "ne-sea", book: "betmgm", market, side: market === "total" ? "Over" : "SEA"
    }));
    expect(inspectMainlineCompleteness(oneSided, ["ne-sea"]).complete).toBe(false);
    const betmgmPaired = oneSided.flatMap((quote) => [quote, {
      ...quote,
      side: quote.market === "total" ? "Under" : "NE"
    }]);
    expect(inspectMainlineCompleteness(betmgmPaired, ["ne-sea"]).complete).toBe(false);
    const bothBooksPaired = [
      ...betmgmPaired,
      ...betmgmPaired.map((quote) => ({ ...quote, book: "fanduel" }))
    ];
    expect(inspectMainlineCompleteness(bothBooksPaired, ["ne-sea", "sf-lar"])).toMatchObject({
      complete: false,
      completeGames: 1,
      completeGameIds: ["ne-sea"],
      missingGameIds: ["sf-lar"]
    });
    const automation = readFileSync("src/server/odds-automation.ts", "utf8");
    const store = readFileSync("src/server/live-line-store.ts", "utf8");
    expect(automation).toContain("publishableCompleteGameLines");
    expect(automation).toContain("last good prices preserved for");
    expect(store).toContain("A single game is the publication boundary");
  });

  it("29. derives the active week and Pacific-ready kickoff from the nflverse schedule", () => {
    const weeks = [{ week: 1, lastGameDate: "2026-09-14" }, { week: 2, lastGameDate: "2026-09-21" }];
    expect(chooseActiveWeek(weeks, "2026-09-14")).toBe(1);
    expect(chooseActiveWeek(weeks, "2026-09-15")).toBe(2);
    expect(chooseActiveWeek(weeks, "2026-10-01")).toBe(2);
    expect(easternScheduleTimeToIso("2026-09-09", "20:20")).toBe("2026-09-10T00:20:00.000Z");
    expect(easternScheduleTimeToIso("2026-12-06", "13:00")).toBe("2026-12-06T18:00:00.000Z");
    expect(normalizeScheduleTeam("LA")).toBe("LAR");
    expect(boardGameId("LA", "SEA")).toBe("lar-sea");
  });

  it("30. keeps the automatic rollover and refresh plumbing behind the compact card", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(board).toContain('fetch("/api/weekly-slate")');
    expect(board).toContain("slateData.week");
    expect(board).not.toContain("Refresh lines");
    expect(board).not.toContain("weekOneMatchups");
    expect(board).toContain('method: "GET"');
    expect(board).not.toContain('fetch(`/api/props?gameId=${encodeURIComponent(next)}`, { method: "POST" })');
    expect(readFileSync("src/server/player-props.ts", "utf8")).toContain("seasonSchedule");
  });

  it("31. ranks non-Wong teaser pairs only when push-adjusted EV clears the offered price", () => {
    const teaser = (gameId: string, team: string, opponent: string, fairProbability: number, pushProbability = 0): TeaserCandidate => ({
      gameId, book: "betmgm", team, opponent, originalPoint: 4.5, teasedPoint: 10.5,
      fairProbability, pushProbability, probabilityInterval: [fairProbability - 0.02, fairProbability + 0.02],
      probabilityMembers: Array.from({ length: 100 }, (_, index) => fairProbability - 0.02 + index * 0.0004),
      pushProbabilityMembers: Array.from({ length: 100 }, () => pushProbability),
      fairAmerican: -300, classification: "ordinary", crossedKeys: [6, 7, 10], warning: "none"
    });
    const ordinaryPair = rankTeaserPairs([
      teaser("g1", "PIT", "BAL", 0.75),
      teaser("g2", "KC", "DEN", 0.74)
    ], { offeredAmerican: -120 });
    expect(ordinaryPair).toHaveLength(1);
    expect(ordinaryPair[0].expectedValue).toBeGreaterThan(0);
    expect(ordinaryPair[0].legs.every((leg) => leg.classification === "ordinary")).toBe(true);
    expect(ordinaryPair[0].translationWarning).toBe("none");
    expect(rankTeaserPairs([teaser("g1", "PIT", "BAL", 0.7), teaser("g2", "KC", "DEN", 0.7)], { offeredAmerican: -120 })).toEqual([]);
    const pushAdjusted = rankTeaserPairs([teaser("g1", "PIT", "BAL", 0.78, 0.08), teaser("g2", "KC", "DEN", 0.78, 0.08)], { offeredAmerican: -120 });
    expect(pushAdjusted).toHaveLength(1);
    expect(pushAdjusted[0].pushProbability).toBeCloseTo(0.121216, 6);
    expect(pushAdjusted[0].expectedValue).toBeGreaterThan(0);
    const exactBoundary = priceTwoTeamTeaser([
      { conditionalWinProbability: 0.78, pushProbability: 0.08 },
      { conditionalWinProbability: 0.78, pushProbability: 0.08 }
    ], pushAdjusted[0].playToAmerican);
    expect(exactBoundary?.expectedValue).toBeGreaterThanOrEqual(0);
    expect(priceTwoTeamTeaser([{ conditionalWinProbability: 0.7, pushProbability: 0 }, { conditionalWinProbability: 0.7, pushProbability: 0 }], -120)?.expectedValue).toBeLessThan(0);
    expect(priceTwoTeamTeaser([{ conditionalWinProbability: 0.7, pushProbability: 0.08 }], -120)).toBeNull();
    expect(rankTeaserPairs([teaser("g1", "NE", "SEA", 0.75), teaser("g2", "KC", "DEN", 0.74)], { offeredAmerican: -120 })).toHaveLength(1);
    const compactBoard = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(compactBoard).toContain("PLAY TO");
    expect(compactBoard).toContain('teaserPairIsWong ? "WONG" : "EV PAIR"');
    expect(compactBoard).toContain('leg.teasedPoint)}`).join(" + ")');
    expect(compactBoard).toContain("teaserPair.unitsGreyed ? \" · UNCERTAIN\" : \"\"");
    expect(compactBoard).not.toContain("PASS · TEAM");
    expect(compactBoard).toContain("neutralPreferences");
    expect(compactBoard).not.toContain("PAIR READY");
  });

  it("31a. orients teaser translations from the canonical spread instead of averaging posted points", () => {
    const board = readFileSync("src/server/decision-board.ts", "utf8");
    expect(board).toContain("const consensusPoint = isHome ? consensusHomePoint");
    expect(board).not.toContain("sideLines.reduce");
  });

  it("31b. settles two-team teaser pushes and reduces parlay pushes using each stored leg price", () => {
    const games = new Map([
      ["g1", { gameId: "g1", awayTeam: "B", homeTeam: "A", awayScore: 17, homeScore: 20 }],
      ["g2", { gameId: "g2", awayTeam: "D", homeTeam: "C", awayScore: 17, homeScore: 24 }]
    ]);
    const contract = [
      { gameId: "g1", market: "teaser" as const, side: "A", point: -3, americanPrice: -110, selection: "A -3" },
      { gameId: "g2", market: "teaser" as const, side: "C", point: -3, americanPrice: -110, selection: "C -3" }
    ];
    expect(gradeStoredPlay({ playType: "teaser", americanOdds: -120, stakeCents: 10_000, contract }, games)).toEqual({ result: "push", profitCents: 0 });
    expect(gradeStoredPlay({ playType: "parlay", americanOdds: 264, stakeCents: 10_000, contract }, games)).toEqual({ result: "win", profitCents: 9091 });

    const propLeg = { gameId: "g2", market: "prop" as const, side: "Over", point: 55.5, americanPrice: -110, selection: "Receiver Over 55.5", sourceQuoteId: "prop-void" };
    const propOutcomes = new Map([["prop-void", {
      sourceQuoteId: "prop-void", gameId: "g2", player: "Receiver", market: "player_reception_yds" as const,
      value: null, sourceHash: "snap-hash", voided: true
    }]]);
    expect(gradeStoredPlay({ playType: "single", americanOdds: -110, stakeCents: 10_000, contract: [propLeg] }, games, propOutcomes))
      .toEqual({ result: "void", profitCents: 0 });
    expect(gradeStoredPlay({ playType: "parlay", americanOdds: 264, stakeCents: 10_000, contract: [contract[1], propLeg] }, games, propOutcomes))
      .toEqual({ result: "win", profitCents: 9091 });
  });

  it("32. co-locates movement and rolling matchup evidence inside the existing Picks drawer", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(board).toContain("OPEN → NOW");
    expect(board).toContain("MATCHUP EVIDENCE");
    expect(board).toContain("addTeaserPair");
    expect(readFileSync("src/server/decision-board.ts", "utf8")).toContain("ROW_NUMBER() OVER (PARTITION BY team");
  });

  it("33. uses the two free execution feeds and keeps the record season-wide without inventing CLV", () => {
    expect(structuralConfig.executionBooks).toEqual(["betmgm", "fanduel"]);
    const tracker = readFileSync("src/components/play-tracker.tsx", "utf8");
    const store = readFileSync("src/server/play-store.ts", "utf8");
    expect(tracker).toContain('fetch("/api/plays")');
    expect(tracker).not.toContain("closingClvCents:");
    expect(tracker).not.toContain("closingClvCents: result ===");
    expect(readFileSync("src/server/closing-value.ts", "utf8")).toContain("last complete pre-kickoff");
    expect(store).toContain("week === undefined");
    expect(store).toContain("ORDER BY week, created_at ASC");
  });

  it("34. exposes a read-only public board with no team record workflow", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(board).not.toContain('fetch("/api/plays"');
    expect(board).not.toContain("Approve team card");
    expect(board).toContain("VALUE LAB");
    expect(worker).toContain("This public analytics site has no accounts or shared records");
  });

  it("35. withholds unpublished availability and surfaces only complete last-good official snapshots", () => {
    expect(summarizeGameAvailability({ freshness: "unavailable", lastSuccessAt: null })).toMatchObject({
      status: "pending", reportedPlayers: 0, capturedAt: null
    });
    expect(summarizeGameAvailability({
      freshness: "stale",
      lastSuccessAt: "2026-09-10T20:00:00.000Z",
      counts: {
        reportedPlayers: 7, out: 1, doubtful: 0, questionable: 2,
        qbListed: 1, qbOutOrDoubtful: 0, sourceTimestamp: "2026-09-10T19:55:00.000Z"
      }
    })).toEqual({
      status: "stale", reportedPlayers: 7, inactivesConfirmed: false, inactivePlayers: 0,
      out: 1, doubtful: 0, questionable: 2, qbListed: 1, qbOutOrDoubtful: 0,
      qbInactive: 0, capturedAt: "2026-09-10T19:55:00.000Z"
    });
  });

  it("35. gives posted totals a leakage-safe projected number and carries its edge into the value lab", () => {
    const server = readFileSync("src/server/decision-board.ts", "utf8");
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(server).toContain("weightedLeagueScoring");
    expect(server).toContain("season < ? OR week < ?");
    expect(server).toContain("const totals = totalProjections(");
    expect(server).toContain("championModel");
    expect(server).toContain("applyChampionMarketResidual");
    expect(board).toContain('`TOTAL ${totalProjection.projectedTotal}`');
    expect(board).toContain('line.market === "total"');
    expect(board).toContain("legExpectedValuePercent");
    expect(board).toContain("straightEv");
    expect(board).toContain("shrunk bet probability");
  });

  it("36. leaves only the public slate and methodology visible", () => {
    const navigation = readFileSync("src/components/nav-links.tsx", "utf8");
    expect(navigation).toContain('["/sunday"');
    expect(navigation).toContain('["/methodology"');
    expect(navigation).not.toContain('["/records"');
    for (const route of ["digest", "settings", "model", "team"]) {
      expect(readFileSync(`src/app/(dashboard)/${route}/page.tsx`, "utf8")).toContain('redirect("/sunday")');
    }
    expect(readFileSync("src/app/setup/page.tsx", "utf8")).toContain('redirect("/sunday")');
  });

  it("37. freezes the strength update size selected by rolling-origin residual validation", () => {
    const validation = JSON.parse(readFileSync("config/strength-state-validation.json", "utf8")) as {
      selectedK: number;
      selectionMetric: string;
      results: Array<{ k: number; pooledRmse: number }>;
    };
    expect(validation.selectionMetric).toBe("pooled rolling-origin residual RMSE");
    expect(structuralConfig.model.strengthK).toBe(validation.selectedK);
    const selected = validation.results.find((row) => row.k === validation.selectedK)!;
    const market = validation.results.find((row) => row.k === 0)!;
    const previous = validation.results.find((row) => row.k === 0.18)!;
    expect(selected.pooledRmse).toBeLessThan(market.pooledRmse);
    expect(previous.pooledRmse).toBeGreaterThan(market.pooledRmse * 2);
    const store = readFileSync("src/server/model-lifecycle/store.ts", "utf8");
    expect(store).toContain("team_strength_states_stage");
    expect(store).toContain("rolling_feature_states_stage");
    const decisionBoard = readFileSync("src/server/decision-board.ts", "utf8");
    expect(decisionBoard).toContain("season_type = 'REG'");
    expect(decisionBoard).toContain("loopAStateMatchesRevision");
    expect(decisionBoard).toContain("strengthStates(gameResult.results)");
    const weatherStore = readFileSync("src/server/weather/store.ts", "utf8");
    const weatherAutomation = readFileSync("src/server/weather/automation.ts", "utf8");
    expect(weatherStore).toContain("kickoff_weather_stage");
    expect(weatherAutomation).toContain("eligible.map(({ gameId }) => gameId)");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(worker).toContain("runBackgroundMaintenance");
    expect(worker).toContain("runModelLifecycleAutomation");
    expect(worker).toContain("scheduledMaintenanceLane(scheduledAt)");
  });

  it("36. highlights a better book only on an identical side and point", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(board).toContain("candidate.point === line.point");
    expect(board).toContain("line.americanPrice > comparable.americanPrice");
    expect(board).toContain("best-exact-price");
    expect(board).not.toContain("candidate.point !== line.point && candidate.americanPrice");
  });

  it("36b. carries a prop's execution baseline and consensus edge into the slip exactly once", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(board).toContain("fairProbability: prop.executionFairProbability");
    expect(board).toContain("edge: prop.edge");
    expect(board).not.toContain("setStake(prop.suggestedUnits * 25)");
    expect(board).not.toContain("fairProbability: prop.consensusProbability");
  });

  it("36c. has no authenticated approver or personal picker", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(board).not.toContain('aria-label="Authenticated approver"');
    expect(board).not.toContain("setPicker");
    expect(proxy).toContain("NextResponse.next");
  });

  it("36d. rechecks every source quote before a second approval can freeze the contract", () => {
    const spreadLeg = { gameId: "g1", market: "spread" as const, side: "SEA", point: -3, americanPrice: -110, selection: "SEA -3" };
    expect(storedLegMatchesQuote(spreadLeg, { point: -3, americanPrice: -110 })).toBe(true);
    expect(storedLegMatchesQuote(spreadLeg, { point: -2.5, americanPrice: -110 })).toBe(false);
    expect(storedLegMatchesQuote(spreadLeg, { point: -3, americanPrice: -115 })).toBe(false);
    const teaserLeg = { ...spreadLeg, market: "teaser" as const, point: 3 };
    expect(storedLegMatchesQuote(teaserLeg, { point: -3, americanPrice: -120 })).toBe(true);
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    const route = readFileSync("src/app/api/plays/route.ts", "utf8");
    const store = readFileSync("src/server/play-store.ts", "utf8");
    expect(board).toContain("sourceQuoteId: line.id");
    expect(route).toContain("sourceQuoteId: z.string()");
    expect(store).toContain("assertApprovalContractCurrent");
    expect(store).toContain("player_prop_quotes WHERE id = ?");
    expect(store).toContain("live_lines WHERE id = ?");
    expect(store).toContain("both approvals must restart");
  });

  it("36d-2. lets the missing authenticated teammate approve the exact saved contract directly", () => {
    const pending = {
      ...rehearsalPlays[0],
      approvals: ["analyst_a" as const],
      contract: [{
        sourceQuoteId: "quote-sea-spread",
        gameId: rehearsalPlays[0].gameId,
        market: "spread" as const,
        side: "BUF",
        point: -2.5,
        americanPrice: -110,
        selection: "BUF -2.5"
      }]
    };
    const request = exactContractApprovalRequest(pending);
    expect(request).toMatchObject({
      week: pending.week,
      gameId: pending.gameId,
      playType: pending.playType,
      market: pending.market,
      book: pending.book,
      americanOdds: pending.americanOdds,
      stakeDollars: pending.stakeCents / 100,
      contract: pending.contract,
      executionStatus: pending.executionStatus,
      cashPlacementConfirmed: false,
      status: "card"
    });
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(board).not.toContain("approvePending(play)");
    expect(board).not.toContain("exactContractApprovalRequest");
    expect(board).not.toContain("awaitingMe &&");
  });

  it("36e. expires incomplete drafts after 12 hours and closes approval at the earliest kickoff", () => {
    const play = {
      gameId: "multi-week-1",
      contract: [
        { gameId: "late", market: "spread" as const, side: "KC", point: -2.5, americanPrice: -110, selection: "KC -2.5" },
        { gameId: "early", market: "spread" as const, side: "SEA", point: -2.5, americanPrice: -110, selection: "SEA -2.5" }
      ],
      createdAt: "2026-09-13T06:00:00.000Z"
    };
    const kickoffs = new Map([["early", "2026-09-13T20:00:00.000Z"], ["late", "2026-09-14T00:00:00.000Z"]]);
    expect(earliestPlayKickoff(play, kickoffs)).toBe("2026-09-13T20:00:00.000Z");
    expect(draftExpirationReason(play, "2026-09-13T17:59:59.999Z", kickoffs)).toBeNull();
    expect(draftExpirationReason(play, "2026-09-13T18:00:00.000Z", kickoffs)).toBe("stale");
    expect(draftExpirationReason({ ...play, createdAt: "2026-09-13T19:30:00.000Z" }, "2026-09-13T20:00:00.000Z", kickoffs)).toBe("kickoff");
    const store = readFileSync("src/server/play-store.ts", "utf8");
    const worker = readFileSync("worker/index.ts", "utf8");
    const maintenance = readFileSync("src/server/background-maintenance.ts", "utf8");
    expect(store).toContain("play_state_audit");
    expect(store).toContain("expireStaleTeamDrafts");
    expect(store).toContain("Approval is closed because this contract has kicked off");
    expect(worker).toContain("runBackgroundMaintenance");
    expect(maintenance).toContain("expireStaleTeamDrafts(input.db, now)");
  });

  it("37. connects the fixed-seed 80% interval and quarter-Kelly sizing to every live card", () => {
    const server = readFileSync("src/server/decision-board.ts", "utf8");
    const lifecycle = readFileSync("src/server/model-lifecycle/automation.ts", "utf8");
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(server).toContain("bootstrapResidualEdgeInterval");
    expect(server).toContain("ensembleModels");
    expect(lifecycle).toContain("fitWeightedBootstrapModelEnsemble");
    expect(lifecycle).toContain("structuralConfig.model.bootstrapMembers");
    expect(lifecycle).toContain("structuralConfig.model.bootstrapSeedStart");
    expect(lifecycle).toContain("structuralConfig.model.bootstrapFitIterations");
    expect(structuralConfig.model.bootstrapMembers).toBe(100);
    expect(server).toContain("ensembleHash");
    expect(server).toContain("edgeInterval");
    expect(board).toContain("sizeKelly");
    expect(board).toContain("currentBookDecision.sizing");
    expect(board).toContain("decisionUnit.suggestedUnits");
    expect(board).toContain("decisionUnit?.greyed");
    expect(board).toContain("total: gameIntel?.totals.find");
  });

  it("38. models moneylines through the logged champion and prices NFL ties as pushes", () => {
    const decisiveEv = 0.55 * (1 + 100 / 110) - 1;
    expect(expectedValueWithPush(0.55, 0.05, -110)).toBeCloseTo(decisiveEv * 0.95, 10);
    const noPush = analyzeSlipValue([{ gameId: "g1", americanPrice: -110, fairProbability: 0.5 }]);
    const tieAware = analyzeSlipValue([{ gameId: "g1", americanPrice: -110, fairProbability: 0.5, pushProbability: 0.05 }]);
    expect(tieAware!.vigDragPercent).toBeLessThan(noPush!.vigDragPercent);
    const server = readFileSync("src/server/decision-board.ts", "utf8");
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(server).toContain('market: "moneyline"');
    expect(server).toContain("expectedValueWithPush");
    expect(server).toContain("ensembleMoneyline");
    expect(server).toContain("bootstrapResidualEdgeInterval");
    expect(server).toContain("bootstrapMarginTranslation");
    expect(server).toContain("homeProbabilityMembers");
    expect(server).toContain("consensusHomeProbability");
    expect(board).toContain("gameIntel?.moneylines.find");
    expect(board).toContain("pushProbability = moneylineProjection.tieProbability");
  });

  it("39. snapshots prop contracts idempotently and grades them only with current player and snap data", () => {
    const props = readFileSync("src/server/player-props.ts", "utf8");
    const settlement = readFileSync("src/server/automatic-settlement.ts", "utf8");
    expect(props).toContain("player_prop_quote_snapshots");
    expect(props).toContain("INSERT OR IGNORE INTO player_prop_quote_snapshots");
    expect(props).toContain("props:${input.gameId}:${sourceHash.slice(0, 16)}");
    expect(settlement).toContain('snapState?.freshness === "current"');
    expect(settlement).toContain("offense_snaps + snap.defense_snaps + snap.special_teams_snaps > 0");
    expect(settlement).toContain("propOutcomes");
  });

  it("40. schedule-adjusts matchup evidence with a frozen, rolling-origin-validated ridge fit", () => {
    const validation = JSON.parse(readFileSync("config/opponent-adjustment-validation.json", "utf8")) as {
      selectedPenalty: number; relativeRmseImprovementPercent: number; weightedForecastObservations: number;
    };
    expect(structuralConfig.matchupEvidence.opponentAdjustmentMethod).toBe("play_weighted_ridge");
    expect(structuralConfig.matchupEvidence.ridgePenalty).toBe(validation.selectedPenalty);
    expect(validation.relativeRmseImprovementPercent).toBeGreaterThan(0);
    expect(validation.weightedForecastObservations).toBe(323_964);
    const server = readFileSync("src/server/decision-board.ts", "utf8");
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(server).toContain("fitOpponentAdjustedRatings");
    expect(server).toContain("structuralConfig.matchupEvidence.ridgePenalty");
    expect(server).toContain("structuralConfig.matchupEvidence.windowGames");
    expect(board).toContain("MATCHUP EVIDENCE");
    expect(board).not.toContain("Opponent adjustment methodology");
  });

  it("41. shows exact-price model bets inside the existing Picks drawer", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    const recommendations = readFileSync("src/domain/mainline-recommendations.ts", "utf8");
    expect(board).toContain("MODEL BETS");
    expect(board).toContain("BE {formatPercent(candidate.breakEvenProbability)}");
    expect(board).toContain("candidate.expectedValue");
    expect(board).toContain("rankMainlineRecommendations");
    expect(recommendations).toContain("expectedValueWithPush");
    expect(recommendations).toContain("americanToImplied");
    expect(recommendations).toContain("sideCandidates.sort");
    expect(board).not.toContain("BEST SIDE SIGNAL");
  });

  it("42. removes personal identities and opens the analytics surface", () => {
    const teamConfig = JSON.parse(readFileSync("config/team.config.example.json", "utf8")) as {
      members: { analyst_a: { email: string }; analyst_b: { email: string } };
    };
    const proxy = readFileSync("src/proxy.ts", "utf8");
    const login = readFileSync("src/app/login/page.tsx", "utf8");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(teamConfig.members.analyst_a.email).toBe("owner@example.invalid");
    expect(teamConfig.members.analyst_b.email).toBe("collaborator@example.invalid");
    expect(proxy).not.toContain("supabase");
    expect(login).toContain('redirect("/sunday")');
    expect(worker).toContain('url.pathname === "/api/plays"');
    expect(worker).toContain("Public access is read-only");
  });

  it("43. ties compact matchup context to the exact model bet and teaser leg without double-counting it", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    const alignment = readFileSync("src/domain/evidence-alignment.ts", "utf8");
    expect(board).toContain("alignMatchupEvidence(gameIntel?.signals ?? [], candidate.market, candidate.line.side)");
    expect(board).toContain('alignMatchupEvidence(gameIntel?.signals ?? [], "teaser", candidate.team)');
    expect(board).toContain("compactEvidenceLabel(context)");
    expect(board).toContain("not added to EV or sizing twice");
    expect(board).toContain("contractSignals.map");
    expect(board).toContain('className="contract-signal"');
    expect(board).toContain("signalInterpretation(signal)");
    expect(alignment).toContain("explanation layer only");
    expect(alignment).not.toContain("expectedValue");
    expect(alignment).not.toContain("sizeKelly");
  });

  it("44. surfaces no more than three props and the best exact mainline contracts across both books", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    const mainlines = readFileSync("src/domain/mainline-recommendations.ts", "utf8");
    const props = readFileSync("src/domain/decision-board.ts", "utf8");
    const importer = readFileSync("src/server/player-props.ts", "utf8");
    expect(board).toContain("rankBestBookMainlineRecommendations");
    expect(board).toContain("rankBestExecutionProps");
    expect(board).toContain("bookNames[candidate.line.book]");
    expect(board).toContain("bookNames[prop.executionBook]");
    expect(board).toContain("FAIR {formatPercent(prop.executionFairProbability)} · BET {formatPercent(prop.betProbability)}");
    expect(board).toContain("FAIR {formatPercent(alternateEvaluation.fairProbability)} · BET {formatPercent(alternateEvaluation.shrunkProbability)}");
    expect(mainlines).toContain("compares contract EV rather than raw prices");
    expect(mainlines).not.toContain("americanPrice -");
    expect(props).toContain("function deviggedQuotes");
    expect(props).toContain("powerDevig(over.americanPrice, under.americanPrice)");
    expect(props).toContain("onePerBook.length < minimumReferenceBooks");
    expect(props).toContain("lowerBoundExpectedValue <= 0");
    expect(props).toContain("if (!sizing.included) continue");
    expect(importer).toContain("requireConfirmedAvailability: true");
    expect(importer).toContain("maximumPerBook: quotes.length");
  });

  it("45. withholds synthetic same-game parlay pricing in the temporary value lab", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(board).not.toContain("isPricedSlipApprovable");
    expect(board).not.toContain("Approve team card");
    expect(board).toContain('slipMode === "straight" ? slip.length === 1 ? formatOdds(slip[0].americanPrice) : "EACH"');
    expect(board).toContain('slipValue ? formatOdds(combinedAmerican(slip)) : "—"');
    expect(board).toContain("Same-game or incomplete pair: withheld");
    expect(board).toContain("This public tool stores no selections");
  });

  it("46. confirms executed status only on a jointly approved contract before kickoff", () => {
    const route = readFileSync("src/app/api/plays/[id]/route.ts", "utf8");
    const store = readFileSync("src/server/play-store.ts", "utf8");
    expect(route).toContain("cashPlacementEligibilityError");
    expect(route).toContain("seasonSchedule");
    expect(route).toContain("status: 409");
    expect(route).toContain("confirmCashPlacement");
    expect(store).toContain("status = 'card' AND result = 'pending' AND execution_status = 'executed'");
    expect(store).toContain("analyst_a_approved = 1 AND analyst_b_approved = 1");
    expect(store).toContain("cash_placement_confirmed = 1");
  });

  it("46b. removes execution status and saved-book selection from the public surface", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    const route = readFileSync("src/app/api/plays/route.ts", "utf8");
    const store = readFileSync("src/server/play-store.ts", "utf8");
    const provenance = readFileSync("src/server/play-provenance.ts", "utf8");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(board).not.toContain('RECORD AS');
    expect(board).not.toContain('executionStatus, cashPlacementConfirmed: false');
    expect(board).not.toContain('Paper card moved to the highest-EV supported book contract');
    expect(worker).toContain("This public analytics site has no accounts or shared records");
    expect(route).toContain('executionStatus: z.enum(["paper", "executed"])');
    expect(route).toContain('executionStatus: input.executionStatus');
    expect(store).toContain('executionApprovalConfirmationError');
    expect(store).toContain('Execution status changed. Create a new revision');
    expect(provenance).toContain('higherEvPaperAlternative');
    expect(provenance).toContain('Paper entries use the higher-EV available');
  });

  it("47. preserves each best-book straight while keeping parlays and teasers single-book", () => {
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    const lineBoard = readFileSync("src/domain/line-board.ts", "utf8");
    expect(board).toContain("updateSlipSelections(current, leg, mode)");
    expect(board).toContain('addLeg(propLeg(prop, matchup), "straight")');
    expect(board).not.toContain("book: bookNames[leg.book]");
    expect(board).not.toContain("primaryReason");
    expect(lineBoard).toContain('if (mode === "straight") return');
    expect(lineBoard).toContain("withoutSameThesis.filter((item) => item.book === leg.book)");
  });

  it("48. stores real subscriptions and emits only the two permitted idempotent push events", () => {
    const route = readFileSync("src/app/api/push-subscription/route.ts", "utf8");
    const store = readFileSync("src/server/push/store.ts", "utf8");
    const edge = readFileSync("src/server/push/edge-notifications.ts", "utf8");
    const serviceWorker = readFileSync("public/sw.js", "utf8");
    const plays = readFileSync("src/server/play-store.ts", "utf8");
    expect(route).toContain("requestTeamMember(request)");
    expect(route).toContain("upsertPushSubscription");
    expect(store).toContain("UNIQUE");
    expect(store).toContain("CHECK (type IN ('awaiting_you', 'edge_threshold'))");
    expect(store).toContain("prior?.state === \"sent\"");
    expect(edge).toContain("edgeThresholdCrossed");
    expect(edge).toContain("structuralConfig.monitoring.pushEdgeThreshold");
    expect(plays).toContain('type: "awaiting_you"');
    expect(plays).toContain('idempotencyKey: `awaiting_you:${play.id}:${recipientId}`');
    expect(serviceWorker).toContain('["awaiting_you", "edge_threshold"]');
    expect(serviceWorker).not.toContain("pipeline_failure");
  });

  it("49. labels the exact matchup-evidence window and withholds signals when it is stale", () => {
    const server = readFileSync("src/server/decision-board.ts", "utf8");
    const board = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(server).toContain("matchupEvidenceProvenance");
    expect(server).toContain('signals: evidence.status === "current"');
    expect(board).toContain("NFLVERSE THROUGH ${gameIntel.evidence.throughSeason} W${gameIntel.evidence.throughWeek}");
    expect(board).toContain("EVIDENCE STALE · WITHHELD");
    expect(board).not.toContain('"rolling 17 games"');
  });
});
