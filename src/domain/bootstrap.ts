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

function weightedDraw(rows: WeightedTrainingRow[], random: () => number): WeightedTrainingRow {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let cursor = random() * total;
  for (const row of rows) {
    cursor -= row.weight;
    if (cursor <= 0) return row;
  }
  return rows[rows.length - 1];
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
  const seeds = Array.from({ length: members }, (_, index) => seedStart + index);
  const memberEdges = seeds.map((seed) => {
    const random = mulberry32(seed);
    const sample = Array.from({ length: rows.length }, () => weightedDraw(rows, random));
    return sample.reduce((sum, row) => sum + row.edge, 0) / sample.length;
  });
  const sorted = [...memberEdges].sort((left, right) => left - right);
  return { interval: [percentile(sorted, 0.1), percentile(sorted, 0.9)], seeds, memberEdges };
}
