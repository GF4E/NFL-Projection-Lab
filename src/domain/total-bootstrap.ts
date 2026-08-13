import type { HistoricalTotalRow } from "./types";

const EPSILON = 1e-6;

type Observation = {
  gameIndex: number;
  seasonWeight: number;
  consensusTotal: number;
  actualTotal: number;
};

type MemberCells = {
  decisiveOver: number[];
  push: number[];
};

export type TotalBootstrapIndex = {
  observations: Observation[];
  multipliers: number[][];
  kernelBandwidth: number;
  cache: Map<string, MemberCells>;
};

export type TotalBootstrapTranslation = {
  probabilityMembers: number[];
  pushProbabilityMembers: number[];
  probabilityInterval: [number, number];
};

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

export function buildTotalBootstrapIndex(
  history: readonly HistoricalTotalRow[],
  options: {
    referenceSeason: number;
    halfLifeSeasons: number;
    kernelBandwidth: number;
    members: number;
    seedStart: number;
  }
): TotalBootstrapIndex {
  const ordered = [...history].sort((left, right) => left.gameId.localeCompare(right.gameId));
  const observations = ordered.map((row, gameIndex) => ({
    gameIndex,
    seasonWeight: 0.5 ** ((options.referenceSeason - row.season) / options.halfLifeSeasons) *
      (row.season === 2020 ? 0.5 : 1),
    consensusTotal: row.consensusTotal,
    actualTotal: row.actualTotal
  }));
  const multipliers = Array.from({ length: options.members }, (_, member) => {
    const random = mulberry32(options.seedStart + member);
    return observations.map(() => -Math.log(Math.max(Number.EPSILON, 1 - random())));
  });
  return { observations, multipliers, kernelBandwidth: options.kernelBandwidth, cache: new Map() };
}

function memberCells(
  index: TotalBootstrapIndex,
  consensusTotal: number,
  postedPoint: number
): MemberCells {
  const cacheKey = `${consensusTotal}:${postedPoint}`;
  const cached = index.cache.get(cacheKey);
  if (cached) return cached;
  const decisiveOver: number[] = [];
  const push: number[] = [];
  for (let member = 0; member < index.multipliers.length; member += 1) {
    let overWeight = 0;
    let underWeight = 0;
    let pushWeight = 0;
    for (const row of index.observations) {
      const distance = (row.consensusTotal - consensusTotal) / index.kernelBandwidth;
      const kernelWeight = Math.exp(-0.5 * distance * distance);
      const weight = row.seasonWeight * kernelWeight * index.multipliers[member][row.gameIndex];
      if (row.actualTotal > postedPoint) overWeight += weight;
      else if (row.actualTotal < postedPoint) underWeight += weight;
      else pushWeight += weight;
    }
    const decisive = overWeight + underWeight;
    const total = decisive + pushWeight;
    decisiveOver.push(decisive > 0 ? overWeight / decisive : 0.5);
    push.push(total > 0 ? pushWeight / total : 0);
  }
  const result = { decisiveOver, push };
  index.cache.set(cacheKey, result);
  return result;
}

export function bootstrapTotalTranslation(input: {
  index: TotalBootstrapIndex;
  consensusTotal: number;
  fromPoint: number;
  toPoint: number;
  baseProbabilityMembers: readonly number[];
  intervalPercentiles: readonly [number, number];
}): TotalBootstrapTranslation | null {
  if (input.baseProbabilityMembers.length !== input.index.multipliers.length) return null;
  const from = memberCells(input.index, input.consensusTotal, input.fromPoint);
  const to = memberCells(input.index, input.consensusTotal, input.toPoint);
  const probabilityMembers = input.baseProbabilityMembers.map((base, member) => logistic(
    logit(base) + logit(to.decisiveOver[member]) - logit(from.decisiveOver[member])
  ));
  return {
    probabilityMembers,
    pushProbabilityMembers: to.push,
    probabilityInterval: [
      percentile(probabilityMembers, input.intervalPercentiles[0]),
      percentile(probabilityMembers, input.intervalPercentiles[1])
    ]
  };
}
