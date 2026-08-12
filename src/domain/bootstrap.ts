export interface WeightedTrainingRow {
  edge: number;
  weight: number;
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function cumulativeWeights(rows: readonly WeightedTrainingRow[]): { cumulative: number[]; total: number } {
  const cumulative: number[] = [];
  let total = 0;
  for (const row of rows) {
    total += row.weight;
    cumulative.push(total);
  }
  return { cumulative, total };
}

function weightedDraw(
  rows: readonly WeightedTrainingRow[],
  cumulative: readonly number[],
  total: number,
  random: () => number
): WeightedTrainingRow {
  const target = random() * total;
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (target < cumulative[middle]) high = middle;
    else low = middle + 1;
  }
  return rows[low];
}

function percentile(sorted: number[], probability: number): number {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower]);
}

export function bootstrapEdgeInterval(
  rows: WeightedTrainingRow[],
  members = 100,
  seedStart = 202600
): { interval: [number, number]; seeds: number[]; memberEdges: number[] } {
  if (!rows.length) throw new Error("Bootstrap requires leakage-safe training rows");
  if (rows.some((row) => !Number.isFinite(row.weight) || row.weight <= 0)) throw new Error("Bootstrap weights must be positive");
  const weights = cumulativeWeights(rows);
  const seeds = Array.from({ length: members }, (_, index) => seedStart + index);
  const memberEdges = seeds.map((seed) => {
    const random = mulberry32(seed);
    const sample = Array.from({ length: rows.length }, () => weightedDraw(rows, weights.cumulative, weights.total, random));
    return sample.reduce((sum, row) => sum + row.edge, 0) / sample.length;
  });
  const sorted = [...memberEdges].sort((left, right) => left - right);
  return { interval: [percentile(sorted, 0.1), percentile(sorted, 0.9)], seeds, memberEdges };
}
