import type { HistoricalMarginRow } from "./types";

const EPSILON = 1e-6;

type Observation = {
  gameIndex: number;
  actualMargin: number;
  weight: number;
};

export type MarginBootstrapIndex = {
  rows: Map<number, Observation[]>;
  rowPoints: number[];
  multipliers: number[][];
};

export type MarginBootstrapTranslation = {
  probabilityMembers: number[];
  pushProbabilityMembers: number[];
  probabilityInterval: [number, number];
};

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function seasonWeight(season: number, referenceSeason: number, halfLifeSeasons: number): number {
  return 0.5 ** ((referenceSeason - season) / halfLifeSeasons) * (season === 2020 ? 0.5 : 1);
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values: readonly number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

export function buildMarginBootstrapIndex(
  history: readonly HistoricalMarginRow[],
  options: {
    referenceSeason: number;
    halfLifeSeasons: number;
    members: number;
    seedStart: number;
  }
): MarginBootstrapIndex {
  const gameIds = [...new Set(history.map((row) => row.gameId))].sort();
  const gameIndex = new Map(gameIds.map((gameId, index) => [gameId, index]));
  const rows = new Map<number, Observation[]>();
  for (const row of history) {
    const point = roundHalf(row.consensusSpread);
    rows.set(point, [...(rows.get(point) ?? []), {
      gameIndex: gameIndex.get(row.gameId)!,
      actualMargin: row.actualMargin,
      weight: seasonWeight(row.season, options.referenceSeason, options.halfLifeSeasons)
    }]);
  }
  const multipliers = Array.from({ length: options.members }, (_, member) => {
    const random = mulberry32(options.seedStart + member);
    // Bayesian-bootstrap Exp(1) weights. The same game draw is reused across
    // every line context so shared artifact uncertainty remains correlated.
    return gameIds.map(() => -Math.log(Math.max(Number.EPSILON, 1 - random())));
  });
  return { rows, rowPoints: [...rows.keys()].sort((left, right) => left - right), multipliers };
}

function cell(
  observations: readonly Observation[],
  postedPoint: number,
  memberWeights: readonly number[]
): { cover: number; push: number; loss: number } | null {
  let cover = 0;
  let push = 0;
  let loss = 0;
  for (const row of observations) {
    const weight = row.weight * memberWeights[row.gameIndex];
    const result = row.actualMargin + postedPoint;
    if (result > 0) cover += weight;
    else if (result < 0) loss += weight;
    else push += weight;
  }
  const total = cover + push + loss;
  return total > 0 ? { cover: cover / total, push: push / total, loss: loss / total } : null;
}

function interpolatedCell(
  index: MarginBootstrapIndex,
  consensusSpread: number,
  postedPoint: number,
  memberWeights: readonly number[]
): { cover: number; push: number; loss: number } | null {
  const exact = index.rows.get(consensusSpread);
  if (exact) return cell(exact, postedPoint, memberWeights);
  const lower = [...index.rowPoints].reverse().find((point) => point < consensusSpread);
  const upper = index.rowPoints.find((point) => point > consensusSpread);
  if (lower === undefined && upper === undefined) return null;
  if (lower === undefined || upper === undefined) {
    return cell(index.rows.get(lower ?? upper!)!, postedPoint, memberWeights);
  }
  const left = cell(index.rows.get(lower)!, postedPoint, memberWeights);
  const right = cell(index.rows.get(upper)!, postedPoint, memberWeights);
  if (!left || !right) return null;
  const ratio = (consensusSpread - lower) / (upper - lower);
  return {
    cover: left.cover + ratio * (right.cover - left.cover),
    push: left.push + ratio * (right.push - left.push),
    loss: left.loss + ratio * (right.loss - left.loss)
  };
}

function decisiveCover(cellValue: { cover: number; loss: number }): number {
  const decisive = cellValue.cover + cellValue.loss;
  return decisive <= 0 ? 0.5 : cellValue.cover / decisive;
}

function clampProbability(value: number): number {
  return Math.max(EPSILON, Math.min(1 - EPSILON, value));
}

function logit(value: number): number {
  const probability = clampProbability(value);
  return Math.log(probability / (1 - probability));
}

function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export function bootstrapMarginTranslation(input: {
  index: MarginBootstrapIndex;
  consensusSpread: number;
  fromPoint: number;
  toPoint: number;
  baseProbabilityMembers: readonly number[];
  intervalPercentiles: readonly [number, number];
}): MarginBootstrapTranslation | null {
  if (input.baseProbabilityMembers.length !== input.index.multipliers.length) return null;
  const probabilityMembers: number[] = [];
  const pushProbabilityMembers: number[] = [];
  for (let member = 0; member < input.index.multipliers.length; member += 1) {
    const weights = input.index.multipliers[member];
    const from = interpolatedCell(input.index, input.consensusSpread, input.fromPoint, weights);
    const to = interpolatedCell(input.index, input.consensusSpread, input.toPoint, weights);
    if (!from || !to) return null;
    const shift = logit(decisiveCover(to)) - logit(decisiveCover(from));
    probabilityMembers.push(logistic(logit(input.baseProbabilityMembers[member]) + shift));
    pushProbabilityMembers.push(to.push);
  }
  return {
    probabilityMembers,
    pushProbabilityMembers,
    probabilityInterval: [
      percentile(probabilityMembers, input.intervalPercentiles[0]),
      percentile(probabilityMembers, input.intervalPercentiles[1])
    ]
  };
}
