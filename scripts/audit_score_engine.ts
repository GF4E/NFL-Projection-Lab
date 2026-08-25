import { stableHash } from "../src/domain/hash";
import {
  buildCorrelatedNegativeBinomialDistribution,
  buildMarketAnchoredScoreDistribution,
  fitJointScoreParameters,
  type JointScoreDistribution
} from "../src/domain/joint-score";
import { blockBootstrapLossImprovement, evaluateScoreDistribution } from "../src/domain/probabilistic-evaluation";
import { parseScheduleCsv, type NflverseGame } from "../src/server/nflverse/transform";

const SOURCE_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv";
const EVALUATION_SEASONS = [2023, 2024, 2025] as const;
const GENERATED_AT = "2026-08-24T00:00:00.000Z";

interface AuditedGame extends NflverseGame {
  homeScore: number;
  awayScore: number;
  spreadLine: number;
  totalLine: number;
}

function isAuditedGame(game: NflverseGame): game is AuditedGame {
  return game.seasonType === "REG" && game.season >= 2010 && game.season <= 2025 &&
    game.homeScore !== null && game.awayScore !== null && game.spreadLine !== null && game.totalLine !== null;
}

function trainingWeight(season: number, origin: number): number {
  const timeDecay = 0.5 ** ((origin - 1 - season) / 2.5);
  return timeDecay * (season === 2020 ? 0.5 : 1);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Schedule source returned HTTP ${response.status}`);
const csv = await response.text();
const games = (await parseScheduleCsv(csv, { trainingStartSeason: 2010, currentSeason: 2026 })).filter(isAuditedGame);
const scoreRows: Array<{
  gameId: string;
  blockId: string;
  family: string;
  jointLogScore: number;
  marginCrps: number;
  totalCrps: number;
  homeCovered: boolean;
  awayCovered: boolean;
  marginCovered: boolean;
  totalCovered: boolean;
}> = [];
const parameters: Record<string, ReturnType<typeof fitJointScoreParameters>> = {};

for (const origin of EVALUATION_SEASONS) {
  const training = games.filter((game) => game.season < origin).map((game) => ({
    gameId: game.gameId,
    season: game.season,
    actualHomeScore: game.homeScore,
    actualAwayScore: game.awayScore,
    expectedHomeMargin: game.spreadLine,
    expectedTotal: game.totalLine,
    weight: trainingWeight(game.season, origin)
  }));
  const fitted = fitJointScoreParameters(training);
  parameters[String(origin)] = fitted;
  for (const game of games.filter((candidate) => candidate.season === origin)) {
    const homeMean = (game.totalLine + game.spreadLine) / 2;
    const awayMean = (game.totalLine - game.spreadLine) / 2;
    const distributions: Array<[string, JointScoreDistribution]> = [
      ["poisson", buildCorrelatedNegativeBinomialDistribution({
        family: "correlated_negative_binomial", expectedHomeScore: homeMean, expectedAwayScore: awayMean,
        homeDispersion: 1_000_000, awayDispersion: 1_000_000, dependence: 0, maxScore: 70,
        generatedAt: GENERATED_AT, modelHash: "poisson", provenanceHash: game.sourceRowHash
      })],
      ["independent_negative_binomial", buildMarketAnchoredScoreDistribution({
        expectedHomeMargin: game.spreadLine, expectedTotal: game.totalLine,
        homeDispersion: fitted.homeDispersion, awayDispersion: fitted.awayDispersion, maxScore: 70,
        generatedAt: GENERATED_AT, modelHash: "independent-nb", provenanceHash: game.sourceRowHash
      })],
      ["correlation_tilt_shadow", buildCorrelatedNegativeBinomialDistribution({
        expectedHomeScore: homeMean, expectedAwayScore: awayMean,
        homeDispersion: fitted.homeDispersion, awayDispersion: fitted.awayDispersion,
        dependence: fitted.dependence, maxScore: 70, generatedAt: GENERATED_AT,
        modelHash: "tilted-nb", provenanceHash: game.sourceRowHash
      })]
    ];
    for (const [family, distribution] of distributions) {
      const score = evaluateScoreDistribution({
        distribution,
        actualHomeScore: game.homeScore,
        actualAwayScore: game.awayScore,
        homeSpreadPoint: -game.spreadLine,
        totalPoint: game.totalLine
      });
      scoreRows.push({
        gameId: game.gameId,
        blockId: `${game.season}:week${game.week}`,
        family,
        jointLogScore: score.jointLogScore,
        marginCrps: score.marginCrps,
        totalCrps: score.totalCrps,
        homeCovered: score.homeIntervalCovered,
        awayCovered: score.awayIntervalCovered,
        marginCovered: score.marginIntervalCovered,
        totalCovered: score.totalIntervalCovered
      });
    }
  }
}

const families = [...new Set(scoreRows.map((row) => row.family))];
const scorecards = Object.fromEntries(families.map((family) => {
  const rows = scoreRows.filter((row) => row.family === family);
  return [family, {
    games: rows.length,
    meanJointLogScore: mean(rows.map((row) => row.jointLogScore)),
    meanMarginCrps: mean(rows.map((row) => row.marginCrps)),
    meanTotalCrps: mean(rows.map((row) => row.totalCrps)),
    coverage80: {
      home: mean(rows.map((row) => Number(row.homeCovered))),
      away: mean(rows.map((row) => Number(row.awayCovered))),
      margin: mean(rows.map((row) => Number(row.marginCovered))),
      total: mean(rows.map((row) => Number(row.totalCovered)))
    }
  }];
}));

function comparison(metric: "jointLogScore" | "marginCrps" | "totalCrps") {
  const baseline = scoreRows.filter((row) => row.family === "independent_negative_binomial");
  const shadow = scoreRows.filter((row) => row.family === "correlation_tilt_shadow");
  const shadowByGame = new Map(shadow.map((row) => [row.gameId, row]));
  const rows = baseline.map((row) => {
    const candidate = shadowByGame.get(row.gameId)!;
    return { blockId: row.blockId, baselineLoss: row[metric], candidateLoss: candidate[metric] };
  });
  return blockBootstrapLossImprovement({
    rows, members: 5_000, seed: 20260824, intervalPercentiles: [0.025, 0.975]
  });
}

process.stdout.write(`${JSON.stringify({
  auditedAt: new Date().toISOString(),
  source: { url: SOURCE_URL, contentHash: stableHash(csv), role: "compiled historical input, not an NFL primary publication" },
  historicalGames2010Through2025: games.length,
  evaluationSeasons: EVALUATION_SEASONS,
  evaluationGames: games.filter((game) => EVALUATION_SEASONS.includes(game.season as typeof EVALUATION_SEASONS[number])).length,
  parameters,
  scorecards,
  independentVersusCorrelationTilt: {
    jointLogScore: comparison("jointLogScore"),
    marginCrps: comparison("marginCrps"),
    totalCrps: comparison("totalCrps")
  }
}, null, 2)}\n`);
