import { describe, expect, it } from "vitest";
import type { DecisionBoardPayload } from "@/domain/decision-board";
import type { LiveLine } from "@/domain/line-board";
import type { WeeklyMatchup } from "@/domain/weekly-slate";
import { assertSafePushEndpoint } from "@/server/push/store";
import { collectMainlineEdgeObservations } from "@/server/push/edge-notifications";

const capturedAt = "2026-09-13T18:00:00.000Z";

function line(id: string, market: LiveLine["market"], side: string, point: number | null): LiveLine {
  return {
    id, gameId: "sea-lar", book: "betmgm", market, side, point, americanPrice: -110,
    capturedAt, sourceEventId: "event", sourceHash: "hash", fairProbability: 0.5,
    marketVigPercent: 4.76
  };
}

const matchup: WeeklyMatchup = {
  id: "sea-lar", sourceGameId: "2026_01_SEA_LA", season: 2026, week: 1,
  kickoffAt: "2026-09-13T20:00:00.000Z", day: "Sunday", away: "SEA",
  awayName: "Seattle Seahawks", home: "LAR", homeName: "Los Angeles Rams",
  venue: "SoFi Stadium", network: "FOX", consensusHomePoint: -2.5,
  totalLine: 45.5, awayRest: 7, homeRest: 7
};

function board(homeEdge = 0.05): DecisionBoardPayload {
  return {
    generatedAt: capturedAt, season: 2026, week: 1, basisSeason: 2025,
    artifactHash: "artifact", configHash: "config", dataHash: "data", championHash: "champion", ensembleHash: "ensemble", championStatus: "compatible", teaserPairs: [], marketCoverage: [], method: "test",
    games: [{
      gameId: "sea-lar", away: null, home: null,
      projections: [{
        gameId: "sea-lar", book: "betmgm", homeTeam: "LAR", marketHomePoint: -2.5,
        projectedHomePoint: -4, homeCoverProbability: 0.68,
        shrunkHomeProbability: 0.5 + homeEdge, pushProbability: 0,
        edgeInterval: [0.01, 0.08], marketHomeProbability: 0.5,
        marketSource: "book", translationWarning: "none"
      }],
      totals: [{
        gameId: "sea-lar", book: "betmgm", canonicalPoint: 45.5, marketPoint: 45.5,
        projectedTotal: 48, shrunkOverProbability: 0.54, marketPushProbability: 0,
        overEdgeInterval: [0.01, 0.07], lean: "Over", pointEdge: 2.5, fairProbability: 0.5,
        shrunkProbability: 0.54, pushProbability: 0, expectedValue: 0.03,
        edgeInterval: [0.01, 0.07], translationWarning: "none"
      }],
      moneylines: [], contractEvaluations: [], teasers: [], signals: [], movements: [], sentiment: [],
      evidence: { status: "current", provider: "nflverse", throughSeason: 2025, throughWeek: 18, throughDate: "2026-01-04", expectedThroughSeason: 2025, expectedThroughWeek: 18, featureGames: 544 },
      availability: {
        status: "pending", reportedPlayers: 0, inactivesConfirmed: false,
        inactivePlayers: 0, out: 0, doubtful: 0, questionable: 0,
        qbListed: 0, qbOutOrDoubtful: 0, qbInactive: 0, capturedAt: null
      },
      weather: {
        status: "pending", roof: "unconfirmed", windMph: null, temperatureF: null,
        precipitationProbability: null, capturedAt: null, totalAdjustmentPoints: 0,
        trainingGames: null
      },
      quarterbacks: {
        configStatus: "validated_withheld_no_holdout_improvement",
        forecastHandling: "market_only",
        away: { team: "SEA", referenceStarter: "Sam Darnold", referenceSource: "latest_completed_start", availability: "unconfirmed", backupTier: null, learnedPointPrior: null, ownerOverridePoints: null, appliedTeamMarginPoints: 0, sourceTimestamp: null, auditHash: "away-qb" },
        home: { team: "LAR", referenceStarter: "Matthew Stafford", referenceSource: "latest_completed_start", availability: "unconfirmed", backupTier: null, learnedPointPrior: null, ownerOverridePoints: null, appliedTeamMarginPoints: 0, sourceTimestamp: null, auditHash: "home-qb" }
      }
    }]
  };
}

describe("production Web Push wiring", () => {
  it("accepts public HTTPS push services and rejects local or credential-bearing endpoints", () => {
    expect(assertSafePushEndpoint("https://fcm.googleapis.com/fcm/send/abc").hostname).toBe("fcm.googleapis.com");
    expect(() => assertSafePushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toThrow(/public HTTPS/);
    expect(() => assertSafePushEndpoint("https://127.0.0.1/push")).toThrow(/public HTTPS/);
    expect(() => assertSafePushEndpoint("https://user:pass@example.com/push")).toThrow(/public HTTPS/);
  });

  it("observes the shrunk-probability edge on exact mainline contracts", () => {
    const lines = [
      line("spread-home", "spread", "LAR", -2.5), line("spread-away", "spread", "SEA", 2.5),
      line("total-over", "total", "Over", 45.5), line("total-under", "total", "Under", 45.5)
    ];
    const observations = collectMainlineEdgeObservations({ board: board(), lines, matchups: [matchup] });
    expect(observations).toHaveLength(2);
    expect(observations.map((item) => [item.market, item.side])).toEqual(expect.arrayContaining([
      ["spread", "LAR"], ["total", "Over"]
    ]));
    expect(observations.find((item) => item.market === "spread")?.probabilityEdge).toBeCloseTo(0.05, 10);
  });

  it("keeps the same edge identity when a book moves the point", () => {
    const before = collectMainlineEdgeObservations({
      board: board(0.02),
      lines: [line("before-home", "spread", "LAR", -2.5), line("before-away", "spread", "SEA", 2.5)],
      matchups: [matchup]
    })[0];
    const after = collectMainlineEdgeObservations({
      board: board(0.04),
      lines: [line("after-home", "spread", "LAR", -3), line("after-away", "spread", "SEA", 3)],
      matchups: [matchup]
    })[0];
    expect(before.key).toBe(after.key);
    expect(before.point).not.toBe(after.point);
  });
});
