import { evaluatePrequentialForecasts, type PrequentialForecastRow, type PrequentialScorecard } from "./probabilistic-evaluation";

export interface CandidateBakeoffEntry {
  family: string;
  status: "eligible" | "rejected";
  reason: string | null;
  scorecard: PrequentialScorecard | null;
  primaryImprovementVersusMarket: number | null;
}

export interface CandidateBakeoffResult {
  contractHash: string;
  gameIds: string[];
  marketFamily: string;
  winner: string | null;
  entries: CandidateBakeoffEntry[];
}

/** Compare every candidate on exactly the same games, horizons, and stale-free quotes. */
export function runForecastBakeoff(input: {
  contractHash: string;
  rows: readonly PrequentialForecastRow[];
  marketFamily: string;
  calibrationSlopeRange: [number, number];
  minimumCoverage80: number;
  maximumCoverage80: number;
  maximumLogLossRegression: number;
}): CandidateBakeoffResult {
  if (!input.contractHash || !input.rows.length) throw new Error("Forecast bakeoff requires a frozen contract and rows");
  const families = [...new Set(input.rows.map((row) => row.family))].sort();
  if (!families.includes(input.marketFamily)) throw new Error("Forecast bakeoff requires the declared market baseline");
  const byFamily = new Map(families.map((family) => [family, input.rows.filter((row) => row.family === family)]));
  const referenceIds = [...new Set(byFamily.get(input.marketFamily)!.map((row) => row.gameId))].sort();
  const referenceContracts = new Map(byFamily.get(input.marketFamily)!.map((row) => [
    `${row.gameId}:${row.forecastHorizon}`,
    `${row.homeSpreadPoint}:${row.totalPoint}:${row.actualHomeScore}:${row.actualAwayScore}`
  ]));
  const marketScorecard = evaluatePrequentialForecasts(byFamily.get(input.marketFamily)!);
  const entries = families.map<CandidateBakeoffEntry>((family) => {
    const rows = byFamily.get(family)!;
    const ids = [...new Set(rows.map((row) => row.gameId))].sort();
    const sameGames = JSON.stringify(ids) === JSON.stringify(referenceIds);
    const sameContracts = rows.length === referenceContracts.size && rows.every((row) =>
      referenceContracts.get(`${row.gameId}:${row.forecastHorizon}`) ===
        `${row.homeSpreadPoint}:${row.totalPoint}:${row.actualHomeScore}:${row.actualAwayScore}`
    );
    if (!sameGames || !sameContracts) {
      return { family, status: "rejected", reason: "candidate was not evaluated on the identical contract set", scorecard: null, primaryImprovementVersusMarket: null };
    }
    const scorecard = evaluatePrequentialForecasts(rows);
    const slope = scorecard.calibration?.slope;
    const coverage = scorecard.coverage80.margin;
    const calibrationPass = slope !== undefined && slope >= input.calibrationSlopeRange[0] && slope <= input.calibrationSlopeRange[1];
    const coveragePass = coverage >= input.minimumCoverage80 && coverage <= input.maximumCoverage80;
    const lossPass = scorecard.pooledLogLoss <= marketScorecard.pooledLogLoss + input.maximumLogLossRegression;
    const status = family === input.marketFamily || calibrationPass && coveragePass && lossPass ? "eligible" : "rejected";
    const reasons = [
      !calibrationPass && family !== input.marketFamily ? "calibration gate failed" : null,
      !coveragePass && family !== input.marketFamily ? "80% interval coverage gate failed" : null,
      !lossPass && family !== input.marketFamily ? "market log-loss gate failed" : null
    ].filter((reason): reason is string => reason !== null);
    return {
      family,
      status,
      reason: reasons.join("; ") || null,
      scorecard,
      primaryImprovementVersusMarket: marketScorecard.meanJointLogScore - scorecard.meanJointLogScore
    };
  });
  const winner = entries
    .filter((entry) => entry.status === "eligible" && entry.scorecard)
    .sort((left, right) => left.scorecard!.meanJointLogScore - right.scorecard!.meanJointLogScore)[0]?.family ?? null;
  return { contractHash: input.contractHash, gameIds: referenceIds, marketFamily: input.marketFamily, winner, entries };
}
