import type { MarketKey, ModelMetrics } from "./types";

const EPSILON = 1e-9;

export interface ModelTrainingRow {
  id: string;
  season: number;
  week: number;
  market: MarketKey;
  outcome: 0 | 1;
  push: boolean;
  weight: number;
  features: Record<string, number>;
}

export interface FittedLogisticModel {
  featureNames: string[];
  coefficients: number[];
  regularization: number;
  trainingRows: number;
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

export function designFeatureNames(rows: ModelTrainingRow[]): string[] {
  const base = [...new Set(rows.flatMap((row) => Object.keys(row.features)))].sort();
  const seasons = [...new Set(rows.map((row) => row.season))].sort();
  return [
    "intercept",
    ...base,
    ...seasons.map((season) => `hfa_season_${season}`),
    ...seasons.map((season) => `scoring_season_${season}`),
    "market_spread",
    "market_total",
    "market_moneyline"
  ];
}

export function encodeFeatures(
  row: Pick<ModelTrainingRow, "season" | "market" | "features">,
  featureNames: string[]
): number[] {
  return featureNames.map((name) => {
    if (name === "intercept") return 1;
    if (name === `market_${row.market}`) return 1;
    if (name.startsWith("market_")) return 0;
    if (name === `hfa_season_${row.season}`) return row.features.isHomeSide ?? 0;
    if (name.startsWith("hfa_season_")) return 0;
    if (name === `scoring_season_${row.season}`) return row.market === "total" ? 1 : 0;
    if (name.startsWith("scoring_season_")) return 0;
    return row.features[name] ?? 0;
  });
}

export function fitWeightedLogistic(
  rows: ModelTrainingRow[],
  options: {
    regularization?: number;
    learningRate?: number;
    iterations?: number;
    featureNames?: string[];
  } = {}
): FittedLogisticModel {
  const eligible = rows.filter((row) => !row.push && row.weight > 0);
  if (!eligible.length) throw new Error("Coefficient fitting requires non-push training rows");
  const featureNames = options.featureNames ?? designFeatureNames(eligible);
  const regularization = options.regularization ?? 0.01;
  const learningRate = options.learningRate ?? 0.05;
  const iterations = options.iterations ?? 600;
  const coefficients = Array(featureNames.length).fill(0) as number[];
  const totalWeight = eligible.reduce((sum, row) => sum + row.weight, 0);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = Array(featureNames.length).fill(0) as number[];
    for (const row of eligible) {
      const vector = encodeFeatures(row, featureNames);
      const error = sigmoid(dot(coefficients, vector)) - row.outcome;
      for (let index = 0; index < gradient.length; index += 1) {
        gradient[index] += row.weight * error * vector[index];
      }
    }
    for (let index = 0; index < coefficients.length; index += 1) {
      const penalty = index === 0 ? 0 : regularization * coefficients[index];
      coefficients[index] -= learningRate * (gradient[index] / totalWeight + penalty);
    }
  }
  return { featureNames, coefficients, regularization, trainingRows: eligible.length };
}

export function predictProbability(
  model: FittedLogisticModel,
  row: Pick<ModelTrainingRow, "season" | "market" | "features">
): number {
  return sigmoid(dot(model.coefficients, encodeFeatures(row, model.featureNames)));
}

function calibrationSlope(rows: Array<{ probability: number; outcome: 0 | 1; weight: number }>): number {
  const logits = rows.map((row) => Math.log(
    Math.max(EPSILON, Math.min(1 - EPSILON, row.probability)) /
      (1 - Math.max(EPSILON, Math.min(1 - EPSILON, row.probability)))
  ));
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const meanX = rows.reduce((sum, row, index) => sum + row.weight * logits[index], 0) / totalWeight;
  const meanY = rows.reduce((sum, row) => sum + row.weight * row.outcome, 0) / totalWeight;
  const covariance = rows.reduce(
    (sum, row, index) => sum + row.weight * (logits[index] - meanX) * (row.outcome - meanY),
    0
  );
  const variance = rows.reduce(
    (sum, row, index) => sum + row.weight * (logits[index] - meanX) ** 2,
    0
  );
  if (variance < EPSILON) return 0;
  // The Bernoulli variance correction maps the weighted linear slope to the logistic scale.
  return covariance / variance / Math.max(EPSILON, meanY * (1 - meanY));
}

export function evaluateFittedModel(
  model: FittedLogisticModel,
  rows: ModelTrainingRow[]
): ModelMetrics {
  const eligible = rows.filter((row) => !row.push);
  const predictions = eligible.map((row) => ({
    market: row.market,
    probability: predictProbability(model, row),
    outcome: row.outcome,
    weight: row.weight
  }));
  const weightedLogLoss = (items: typeof predictions): number => {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    return items.reduce((sum, item) => {
      const probability = Math.max(EPSILON, Math.min(1 - EPSILON, item.probability));
      return sum - item.weight * (
        item.outcome * Math.log(probability) + (1 - item.outcome) * Math.log(1 - probability)
      );
    }, 0) / total;
  };
  const byMarket = Object.fromEntries(
    (["spread", "total", "moneyline"] as MarketKey[]).map((market) => {
      const items = predictions.filter((prediction) => prediction.market === market);
      return [market, {
        logLoss: items.length ? weightedLogLoss(items) : 0,
        observations: items.length
      }];
    })
  ) as ModelMetrics["byMarket"];
  return {
    pooledLogLoss: weightedLogLoss(predictions),
    calibrationSlope: calibrationSlope(predictions),
    byMarket
  };
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedSample(rows: ModelTrainingRow[], seed: number): ModelTrainingRow[] {
  const random = mulberry32(seed);
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  return Array.from({ length: rows.length }, () => {
    let target = random() * totalWeight;
    for (const row of rows) {
      target -= row.weight;
      if (target <= 0) return row;
    }
    return rows[rows.length - 1];
  });
}

function percentile(sorted: number[], probability: number): number {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower]);
}

export function fitBootstrapEnsemble(input: {
  rows: ModelTrainingRow[];
  forecastRow: Pick<ModelTrainingRow, "season" | "market" | "features">;
  marketProbability: number;
  members?: number;
  seedStart?: number;
  regularization?: number;
}): {
  seeds: number[];
  modelProbabilities: number[];
  edgeInterval: [number, number];
  configuration: { members: number; seedStart: number; regularization: number };
} {
  const members = input.members ?? 100;
  const seedStart = input.seedStart ?? 202600;
  const regularization = input.regularization ?? 0.01;
  const featureNames = designFeatureNames(input.rows);
  const seeds = Array.from({ length: members }, (_, index) => seedStart + index);
  const modelProbabilities = seeds.map((seed) => {
    const fitted = fitWeightedLogistic(weightedSample(input.rows, seed), {
      featureNames,
      regularization,
      iterations: 250
    });
    return predictProbability(fitted, input.forecastRow);
  });
  const edges = modelProbabilities
    .map((probability) => probability - input.marketProbability)
    .sort((left, right) => left - right);
  return {
    seeds,
    modelProbabilities,
    edgeInterval: [percentile(edges, 0.1), percentile(edges, 0.9)],
    configuration: { members, seedStart, regularization }
  };
}

export function rollingOriginRows(
  rows: ModelTrainingRow[],
  targetSeason: number,
  trailingSeasons = 3
): ModelTrainingRow[] {
  return rows.filter(
    (row) => row.season >= targetSeason - trailingSeasons && row.season < targetSeason
  );
}
