import { stableHash } from "./hash";
import type {
  DiscreteOutcomeCell,
  DiscreteTotalArtifact,
  DiscreteTotalRow,
  HistoricalTotalRow,
  TranslationResult
} from "./types";

const EPSILON = 1e-6;

function halfPointGrid(start: number, end: number): number[] {
  return Array.from({ length: Math.round((end - start) * 2) + 1 }, (_, index) => start + index * 0.5);
}

function seasonWeight(season: number, referenceSeason: number, halfLifeSeasons: number): number {
  return 0.5 ** ((referenceSeason - season) / halfLifeSeasons) * (season === 2020 ? 0.5 : 1);
}

function kernelWeight(consensusTotal: number, observedTotal: number, bandwidth: number): number {
  const distance = (observedTotal - consensusTotal) / bandwidth;
  return Math.exp(-0.5 * distance * distance);
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

function decisiveOverProbability(cell: DiscreteOutcomeCell): number {
  const decisiveMass = cell.cover + cell.loss;
  return decisiveMass <= 0 ? 0.5 : cell.cover / decisiveMass;
}

export interface BuildTotalArtifactOptions {
  latestCompletedSeason: number;
  halfLifeSeasons: number;
  kernelBandwidth: number;
  generatedAt: string;
  consensusGrid?: number[];
  totalGrid?: number[];
}

export function buildDiscreteTotalArtifact(
  history: HistoricalTotalRow[],
  options: BuildTotalArtifactOptions
): DiscreteTotalArtifact {
  const eligible = history.filter((row) => row.season >= 2010 && row.season <= options.latestCompletedSeason);
  if (!eligible.length) throw new Error("Cannot build a total artifact without valid history");
  if (!(options.kernelBandwidth > 0)) throw new Error("Total kernel bandwidth must be positive");
  const consensusGrid = options.consensusGrid ?? halfPointGrid(28, 64);
  const totalGrid = options.totalGrid ?? halfPointGrid(25, 70);
  const rows: DiscreteTotalRow[] = consensusGrid.map((consensusTotal) => ({
    consensusTotal,
    outcomes: totalGrid.map((postedPoint) => outcomeCell(eligible, consensusTotal, postedPoint, options))
  }));
  const artifactContent = {
    version: `total-${options.latestCompletedSeason}`,
    seasonRange: [2010, options.latestCompletedSeason] as [number, number],
    decay: { halfLifeSeasons: options.halfLifeSeasons, referenceSeason: options.latestCompletedSeason },
    kernelBandwidth: options.kernelBandwidth,
    consensusGrid,
    totalGrid,
    rows
  };
  return {
    ...artifactContent,
    artifactHash: stableHash(artifactContent),
    generatedAt: options.generatedAt
  };
}

function outcomeCell(
  history: readonly HistoricalTotalRow[],
  consensusTotal: number,
  postedPoint: number,
  options: BuildTotalArtifactOptions
): DiscreteOutcomeCell {
  let cover = 0;
  let push = 0;
  let loss = 0;
  for (const row of history) {
    const weight = seasonWeight(row.season, options.latestCompletedSeason, options.halfLifeSeasons) *
      kernelWeight(consensusTotal, row.consensusTotal, options.kernelBandwidth);
    if (row.actualTotal > postedPoint) cover += weight;
    else if (row.actualTotal < postedPoint) loss += weight;
    else push += weight;
  }
  const total = cover + push + loss;
  return {
    postedPoint,
    cover: total ? cover / total : 0,
    push: total ? push / total : 0,
    loss: total ? loss / total : 0,
    effectiveWeight: total
  };
}

function mergeWarning(left: TranslationResult["warning"], right: TranslationResult["warning"]): TranslationResult["warning"] {
  if (left === "unsupported" || right === "unsupported") return "unsupported";
  if (left === "extrapolated" || right === "extrapolated") return "extrapolated";
  if (left === "interpolated" || right === "interpolated") return "interpolated";
  return "none";
}

function interpolateCell(left: DiscreteOutcomeCell, right: DiscreteOutcomeCell, value: number): DiscreteOutcomeCell {
  const ratio = (value - left.postedPoint) / (right.postedPoint - left.postedPoint);
  return {
    postedPoint: value,
    cover: left.cover + ratio * (right.cover - left.cover),
    push: left.push + ratio * (right.push - left.push),
    loss: left.loss + ratio * (right.loss - left.loss),
    effectiveWeight: left.effectiveWeight + ratio * (right.effectiveWeight - left.effectiveWeight)
  };
}

function locateRow(artifact: DiscreteTotalArtifact, consensusTotal: number): {
  row: DiscreteTotalRow | null;
  warning: TranslationResult["warning"];
  sourcePoints: number[];
} {
  const exact = artifact.rows.find((row) => row.consensusTotal === consensusTotal);
  if (exact) return { row: exact, warning: "none", sourcePoints: [consensusTotal] };
  const lower = [...artifact.rows].reverse().find((row) => row.consensusTotal < consensusTotal);
  const upper = artifact.rows.find((row) => row.consensusTotal > consensusTotal);
  if (lower && upper) {
    const ratio = (consensusTotal - lower.consensusTotal) / (upper.consensusTotal - lower.consensusTotal);
    return {
      row: {
        consensusTotal,
        outcomes: artifact.totalGrid.map((postedPoint) => {
          const left = lower.outcomes.find((cell) => cell.postedPoint === postedPoint)!;
          const right = upper.outcomes.find((cell) => cell.postedPoint === postedPoint)!;
          return {
            postedPoint,
            cover: left.cover + ratio * (right.cover - left.cover),
            push: left.push + ratio * (right.push - left.push),
            loss: left.loss + ratio * (right.loss - left.loss),
            effectiveWeight: left.effectiveWeight + ratio * (right.effectiveWeight - left.effectiveWeight)
          };
        })
      },
      warning: "interpolated",
      sourcePoints: [lower.consensusTotal, upper.consensusTotal]
    };
  }
  const nearest = lower ?? upper;
  return nearest
    ? { row: nearest, warning: "extrapolated", sourcePoints: [nearest.consensusTotal] }
    : { row: null, warning: "unsupported", sourcePoints: [] };
}

function locateCell(artifact: DiscreteTotalArtifact, consensusTotal: number, postedPoint: number): {
  cell: DiscreteOutcomeCell | null;
  warning: TranslationResult["warning"];
  sourcePoints: number[];
} {
  const located = locateRow(artifact, consensusTotal);
  if (!located.row) return { cell: null, warning: "unsupported", sourcePoints: [] };
  const exact = located.row.outcomes.find((cell) => cell.postedPoint === postedPoint);
  if (exact?.effectiveWeight) return { ...located, cell: exact };
  const lower = [...located.row.outcomes].reverse().find((cell) => cell.postedPoint < postedPoint);
  const upper = located.row.outcomes.find((cell) => cell.postedPoint > postedPoint);
  if (lower && upper && lower.effectiveWeight > 0 && upper.effectiveWeight > 0) {
    return {
      cell: interpolateCell(lower, upper, postedPoint),
      warning: mergeWarning(located.warning, "interpolated"),
      sourcePoints: located.sourcePoints
    };
  }
  const nearest = lower ?? upper;
  return nearest?.effectiveWeight
    ? { cell: nearest, warning: "extrapolated", sourcePoints: located.sourcePoints }
    : { cell: null, warning: "unsupported", sourcePoints: located.sourcePoints };
}

export function translateTotalFairProbability(
  artifact: DiscreteTotalArtifact,
  consensusTotal: number,
  fromPoint: number,
  toPoint: number,
  fairOverProbability: number
): TranslationResult {
  const from = locateCell(artifact, consensusTotal, fromPoint);
  const to = locateCell(artifact, consensusTotal, toPoint);
  if (!from.cell || !to.cell) {
    return { probability: null, pushProbability: null, warning: "unsupported", sourcePoints: [] };
  }
  const probability = fromPoint === toPoint
    ? fairOverProbability
    : logistic(logit(fairOverProbability) +
      logit(decisiveOverProbability(to.cell)) - logit(decisiveOverProbability(from.cell)));
  return {
    probability,
    pushProbability: to.cell.push,
    warning: mergeWarning(from.warning, to.warning),
    sourcePoints: [...new Set([...from.sourcePoints, ...to.sourcePoints])]
  };
}

export function assertFrozenTotalArtifact(input: {
  artifact: DiscreteTotalArtifact;
  season: number;
  halfLifeSeasons: number;
  kernelBandwidth: number;
}): void {
  const content = {
    version: input.artifact.version,
    seasonRange: input.artifact.seasonRange,
    decay: input.artifact.decay,
    kernelBandwidth: input.artifact.kernelBandwidth,
    consensusGrid: input.artifact.consensusGrid,
    totalGrid: input.artifact.totalGrid,
    rows: input.artifact.rows
  };
  if (input.artifact.artifactHash !== stableHash(content)) throw new Error("Frozen total artifact hash mismatch");
  if (input.artifact.seasonRange[1] !== input.season - 1) throw new Error("Frozen total artifact is not aligned to the target season");
  if (input.artifact.decay.referenceSeason !== input.season - 1 || input.artifact.decay.halfLifeSeasons !== input.halfLifeSeasons) {
    throw new Error("Frozen total artifact decay does not match structural configuration");
  }
  if (input.artifact.kernelBandwidth !== input.kernelBandwidth) {
    throw new Error("Frozen total artifact kernel does not match structural configuration");
  }
}
