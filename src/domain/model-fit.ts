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

function boundedLogit(probability: number): number {
  const bounded = Math.max(EPSILON, Math.min(1 - EPSILON, probability));
  return Math.log(bounded / (1 - bounded));
}

/**
 * Applies only the champion's learned displacement from the market to an
 * independently produced state/model probability. A market-baseline champion
 * is therefore an exact no-op, while a promoted challenger can calibrate the
 * live forecast without erasing the automatic weekly state update.
 */
export function applyChampionMarketResidual(
  stateProbability: number,
  championProbability: number,
  marketProbability: number
): number {
  return sigmoid(
    boundedLogit(stateProbability) +
    boundedLogit(championProbability) -
    boundedLogit(marketProbability)
  );
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
    initialCoefficients?: number[];
  } = {}
): FittedLogisticModel {
  const eligible = rows.filter((row) => !row.push && row.weight > 0);
  if (!eligible.length) throw new Error("Coefficient fitting requires non-push training rows");
  const featureNames = options.featureNames ?? designFeatureNames(eligible);
  const regularization = options.regularization ?? 0.01;
  const learningRate = options.learningRate ?? 0.05;
  const iterations = options.iterations ?? 600;
  if (options.initialCoefficients && options.initialCoefficients.length !== featureNames.length) {
    throw new Error("Initial coefficient vector does not match the feature schema");
  }
  const coefficients = options.initialCoefficients
    ? [...options.initialCoefficients]
    : Array(featureNames.length).fill(0) as number[];
  const totalWeight = eligible.reduce((sum, row) => sum + row.weight, 0);
  // Model refits run in a CPU-bounded worker. Encode the immutable design matrix
  // once and retain only non-zero cells; season/market indicator columns make the
  // matrix deliberately sparse, so rebuilding dense vectors inside every gradient
  // step wastes most of the lifecycle job's CPU budget.
  const design = eligible.map((row) => {
    const vector = encodeFeatures(row, featureNames);
    const indices: number[] = [];
    const values: number[] = [];
    for (let index = 0; index < vector.length; index += 1) {
      if (vector[index] === 0) continue;
      indices.push(index);
      values.push(vector[index]);
    }
    return { indices, values, outcome: row.outcome, weight: row.weight };
  });
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = Array(featureNames.length).fill(0) as number[];
    for (const row of design) {
      let linear = 0;
      for (let cell = 0; cell < row.indices.length; cell += 1) {
        linear += coefficients[row.indices[cell]] * row.values[cell];
      }
      const weightedError = row.weight * (sigmoid(linear) - row.outcome);
      for (let cell = 0; cell < row.indices.length; cell += 1) {
        gradient[row.indices[cell]] += weightedError * row.values[cell];
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

/**
 * Fits the standard weighted logistic recalibration model
 * logit(P(Y=1)) = intercept + slope * logit(forecast).
 */
export function fitLogisticCalibration(rows: Array<{
  probability: number;
  outcome: 0 | 1;
  weight: number;
}>): { intercept: number; slope: number } {
  if (!rows.length) throw new Error("Calibration requires forecast rows");
  const eligible = rows.filter((row) => row.weight > 0 && Number.isFinite(row.probability));
  if (!eligible.length) throw new Error("Calibration requires positive-weight forecast rows");
  const totalWeight = eligible.reduce((sum, row) => sum + row.weight, 0);
  const eventRate = eligible.reduce((sum, row) => sum + row.weight * row.outcome, 0) / totalWeight;
  if (eventRate <= EPSILON || eventRate >= 1 - EPSILON) {
    return { intercept: boundedLogit(eventRate), slope: 0 };
  }
  const design = eligible.map((row) => ({
    x: boundedLogit(row.probability),
    outcome: row.outcome,
    weight: row.weight
  }));
  let intercept = 0;
  let slope = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    let scoreIntercept = 0;
    let scoreSlope = 0;
    let informationIntercept = 0;
    let informationCross = 0;
    let informationSlope = 0;
    for (const row of design) {
      const probability = sigmoid(intercept + slope * row.x);
      const residual = row.outcome - probability;
      const variance = Math.max(EPSILON, probability * (1 - probability));
      scoreIntercept += row.weight * residual;
      scoreSlope += row.weight * residual * row.x;
      informationIntercept += row.weight * variance;
      informationCross += row.weight * variance * row.x;
      informationSlope += row.weight * variance * row.x ** 2;
    }
    const determinant = informationIntercept * informationSlope - informationCross ** 2;
    if (Math.abs(determinant) < EPSILON) break;
    const interceptStep = (informationSlope * scoreIntercept - informationCross * scoreSlope) / determinant;
    const slopeStep = (-informationCross * scoreIntercept + informationIntercept * scoreSlope) / determinant;
    const boundedInterceptStep = Math.max(-2, Math.min(2, interceptStep));
    const boundedSlopeStep = Math.max(-2, Math.min(2, slopeStep));
    intercept += boundedInterceptStep;
    slope += boundedSlopeStep;
    if (Math.max(Math.abs(boundedInterceptStep), Math.abs(boundedSlopeStep)) < 1e-8) break;
  }
  return { intercept, slope };
}

export function evaluateProbabilityRows(rows: Array<{
  market: MarketKey;
  probability: number;
  outcome: 0 | 1;
  weight: number;
}>): ModelMetrics {
  if (!rows.length) throw new Error("Model evaluation requires non-push rows");
  const calibration = fitLogisticCalibration(rows);
  const weightedLogLoss = (items: typeof rows): number => {
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
      const items = rows.filter((prediction) => prediction.market === market);
      return [market, { logLoss: items.length ? weightedLogLoss(items) : 0, observations: items.length }];
    })
  ) as ModelMetrics["byMarket"];
  return {
    pooledLogLoss: weightedLogLoss(rows),
    calibrationIntercept: calibration.intercept,
    calibrationSlope: calibration.slope,
    byMarket
  };
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
  return evaluateProbabilityRows(predictions);
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seasonWeekBlockSample(rows: ModelTrainingRow[], seed: number): ModelTrainingRow[] {
  if (!rows.length) return [];
  const random = mulberry32(seed);
  const blocks = new Map<string, ModelTrainingRow[]>();
  for (const row of rows) {
    const key = `${row.season}:week${row.week}`;
    blocks.set(key, [...(blocks.get(key) ?? []), row]);
  }
  const entries = [...blocks.entries()].sort(([left], [right]) => left.localeCompare(right));
  const counts = new Map<string, number>();
  for (let draw = 0; draw < entries.length; draw += 1) {
    const key = entries[Math.floor(random() * entries.length)][0];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return entries.flatMap(([key, block]) => {
    const count = counts.get(key) ?? 0;
    return count ? block.map((row) => ({ ...row, weight: row.weight * count })) : [];
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
    const fitted = fitWeightedLogistic(seasonWeekBlockSample(input.rows, seed), {
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

export function fitWeightedBootstrapModelEnsemble(input: {
  rows: ModelTrainingRow[];
  featureNames: string[];
  initialCoefficients: number[];
  members?: number;
  seedStart?: number;
  regularization?: number;
  iterations?: number;
}): {
  seeds: number[];
  models: FittedLogisticModel[];
  configuration: { members: number; seedStart: number; regularization: number; iterations: number };
} {
  const members = input.members ?? 100;
  const seedStart = input.seedStart ?? 202600;
  const regularization = input.regularization ?? 0.01;
  const iterations = input.iterations ?? 25;
  const eligible = input.rows.filter((row) => !row.push && row.weight > 0);
  if (!eligible.length) throw new Error("Bootstrap ensemble requires non-push leakage-safe training rows");
  const seeds = Array.from({ length: members }, (_, index) => seedStart + index);
  const models = seeds.map((seed) => fitWeightedLogistic(seasonWeekBlockSample(eligible, seed), {
    featureNames: input.featureNames,
    initialCoefficients: input.initialCoefficients,
    regularization,
    iterations
  }));
  return { seeds, models, configuration: { members, seedStart, regularization, iterations } };
}

export function bootstrapResidualEdgeInterval(input: {
  models: readonly FittedLogisticModel[];
  forecastRow: Pick<ModelTrainingRow, "season" | "market" | "features">;
  centralModelProbability: number;
  marketProbability: number;
  shrinkageWeight: number;
}): { interval: [number, number]; memberEdges: number[] } | null {
  if (!input.models.length) return null;
  const memberLogits = input.models.map((model) => boundedLogit(predictProbability(model, input.forecastRow)));
  const meanLogit = memberLogits.reduce((sum, value) => sum + value, 0) / memberLogits.length;
  const centralLogit = boundedLogit(input.centralModelProbability);
  const memberEdges = memberLogits.map((memberLogit) => {
    const adjustedModel = sigmoid(centralLogit + memberLogit - meanLogit);
    const shrunk = input.shrinkageWeight * adjustedModel + (1 - input.shrinkageWeight) * input.marketProbability;
    return shrunk - input.marketProbability;
  });
  const sorted = [...memberEdges].sort((left, right) => left - right);
  return { interval: [percentile(sorted, 0.1), percentile(sorted, 0.9)], memberEdges };
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
