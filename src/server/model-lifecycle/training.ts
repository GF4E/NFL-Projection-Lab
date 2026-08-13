import { eraConfig, structuralConfig } from "@/domain/config";
import {
  designFeatureNames,
  evaluateProbabilityRows,
  fitWeightedLogistic,
  predictProbability,
  type FittedLogisticModel,
  type ModelTrainingRow
} from "@/domain/model-fit";
import { powerDevig } from "@/domain/odds";
import type { ModelMetrics } from "@/domain/types";

export interface LifecycleGameRow {
  game_id: string;
  season: number;
  week: number;
  result: number;
  total: number | null;
  spread_line: number;
  total_line: number | null;
  away_rest: number | null;
  home_rest: number | null;
  away_moneyline: number | null;
  home_moneyline: number | null;
  away_spread_odds: number | null;
  home_spread_odds: number | null;
  under_odds: number | null;
  over_odds: number | null;
}

function fairFirst(first: number | null, second: number | null, fallback = 0.5): number {
  if (first === null || second === null) return fallback;
  try {
    return powerDevig(first, second).probabilities[0];
  } catch {
    return fallback;
  }
}

function logit(probability: number): number {
  const bounded = Math.max(0.02, Math.min(0.98, probability));
  return Math.log(bounded / (1 - bounded));
}

export function buildLifecycleForecastRow(input: {
  season: number;
  week: number;
  market: "spread" | "total" | "moneyline";
  marketProbability: number;
  expectedHomeMargin: number;
  totalLine: number | null;
  awayRest: number | null;
  homeRest: number | null;
  isHomeSide: boolean;
}): Pick<ModelTrainingRow, "season" | "market" | "features"> {
  return {
    season: input.season,
    market: input.market,
    features: {
      expectedHomeMargin: input.expectedHomeMargin / 14,
      restDelta: ((input.homeRest ?? 7) - (input.awayRest ?? 7)) / 7,
      totalEnvironment: ((input.totalLine ?? 44) - 44) / 10,
      marketLogit: logit(input.marketProbability),
      isHomeSide: input.isHomeSide ? 1 : 0
    }
  };
}

function seasonWeight(season: number, latestSeason: number): number {
  const era = eraConfig.eras.find((candidate) => candidate.season === season) as { trainingMultiplier?: number } | undefined;
  return 0.5 ** ((latestSeason - season) / structuralConfig.model.decayHalfLifeSeasons) * (era?.trainingMultiplier ?? 1);
}

export function buildLifecycleTrainingRows(games: readonly LifecycleGameRow[], latestSeason: number): ModelTrainingRow[] {
  return games.flatMap<ModelTrainingRow>((game) => {
    const weight = seasonWeight(game.season, latestSeason);
    const homeSpreadFair = fairFirst(game.home_spread_odds, game.away_spread_odds);
    const rows: ModelTrainingRow[] = [{
      id: `${game.game_id}:spread`,
      season: game.season,
      week: game.week,
      market: "spread",
      outcome: game.result > game.spread_line ? 1 : 0,
      push: game.result === game.spread_line,
      weight,
      features: buildLifecycleForecastRow({
        season: game.season,
        week: game.week,
        market: "spread",
        marketProbability: homeSpreadFair,
        expectedHomeMargin: game.spread_line,
        totalLine: game.total_line,
        awayRest: game.away_rest,
        homeRest: game.home_rest,
        isHomeSide: true
      }).features
    }];
    if (game.total !== null && game.total_line !== null) {
      const overFair = fairFirst(game.over_odds, game.under_odds);
      rows.push({
        id: `${game.game_id}:total`,
        season: game.season,
        week: game.week,
        market: "total",
        outcome: game.total > game.total_line ? 1 : 0,
        push: game.total === game.total_line,
        weight,
        features: buildLifecycleForecastRow({
          season: game.season,
          week: game.week,
          market: "total",
          marketProbability: overFair,
          expectedHomeMargin: game.spread_line,
          totalLine: game.total_line,
          awayRest: game.away_rest,
          homeRest: game.home_rest,
          isHomeSide: false
        }).features
      });
    }
    if (game.result !== 0) {
      const homeMoneylineFair = fairFirst(game.home_moneyline, game.away_moneyline, 1 / (1 + Math.exp(-game.spread_line / 6.5)));
      rows.push({
        id: `${game.game_id}:moneyline`,
        season: game.season,
        week: game.week,
        market: "moneyline",
        outcome: game.result > 0 ? 1 : 0,
        push: false,
        weight,
        features: buildLifecycleForecastRow({
          season: game.season,
          week: game.week,
          market: "moneyline",
          marketProbability: homeMoneylineFair,
          expectedHomeMargin: game.spread_line,
          totalLine: game.total_line,
          awayRest: game.away_rest,
          homeRest: game.home_rest,
          isHomeSide: true
        }).features
      });
    }
    return rows;
  });
}

function evaluationSeasons(rows: readonly ModelTrainingRow[], latestCompletedSeason: number): number[] {
  const observed = new Set(rows.map((row) => row.season));
  return [latestCompletedSeason - 2, latestCompletedSeason - 1, latestCompletedSeason]
    .filter((season) => observed.has(season));
}

export function fitWalkForwardModels(
  rows: ModelTrainingRow[],
  latestCompletedSeason: number,
  featureNames = designFeatureNames(rows)
): Record<string, FittedLogisticModel> {
  return Object.fromEntries(evaluationSeasons(rows, latestCompletedSeason).map((season) => {
    const training = rows.filter((row) => row.season < season);
    if (!training.length) throw new Error(`Walk-forward origin ${season} has no prior training rows`);
    return [String(season), fitWeightedLogistic(training, { featureNames, iterations: 60 })];
  }));
}

export function evaluateWalkForwardModels(
  rows: ModelTrainingRow[],
  latestCompletedSeason: number,
  models: Record<string, FittedLogisticModel>
): ModelMetrics {
  const predictions = evaluationSeasons(rows, latestCompletedSeason).flatMap((season) => {
    const model = models[String(season)];
    if (!model) throw new Error(`Champion is missing walk-forward origin ${season}`);
    return rows.filter((row) => row.season === season && !row.push).map((row) => ({
      market: row.market,
      probability: predictProbability(model, row),
      outcome: row.outcome,
      weight: row.weight
    }));
  });
  return evaluateProbabilityRows(predictions);
}

export function fitLifecycleChallenger(rows: ModelTrainingRow[], latestCompletedSeason: number): {
  model: FittedLogisticModel;
  walkForwardModels: Record<string, FittedLogisticModel>;
  metrics: ModelMetrics;
} {
  const featureNames = designFeatureNames(rows);
  const model = fitWeightedLogistic(rows, { featureNames, iterations: 100 });
  const walkForwardModels = fitWalkForwardModels(rows, latestCompletedSeason, featureNames);
  return { model, walkForwardModels, metrics: evaluateWalkForwardModels(rows, latestCompletedSeason, walkForwardModels) };
}
