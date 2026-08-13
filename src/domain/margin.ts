import type {
  DiscreteMarginArtifact,
  DiscreteMarginRow,
  DiscreteOutcomeCell,
  HistoricalMarginRow,
  TranslationResult
} from "./types";
import { stableHash } from "./hash";

const EPSILON = 1e-6;

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function weightForSeason(
  season: number,
  referenceSeason: number,
  halfLifeSeasons: number
): number {
  const decay = 0.5 ** ((referenceSeason - season) / halfLifeSeasons);
  const eraMultiplier = season === 2020 ? 0.5 : 1;
  return decay * eraMultiplier;
}

export interface BuildMarginArtifactOptions {
  latestCompletedSeason: number;
  halfLifeSeasons: number;
  boundarySeason: number;
  keyMargins: number[];
  generatedAt: string;
  spreadGrid?: number[];
}

export function buildDiscreteMarginArtifact(
  history: HistoricalMarginRow[],
  options: BuildMarginArtifactOptions
): DiscreteMarginArtifact {
  const eligible = history.filter(
    (row) => row.season >= 2010 && row.season <= options.latestCompletedSeason
  );
  if (eligible.length === 0) throw new Error("Cannot build a margin artifact without valid history");
  const grid = options.spreadGrid ?? Array.from({ length: 57 }, (_, index) => -14 + index * 0.5);
  const grouped = new Map<number, HistoricalMarginRow[]>();
  for (const row of eligible) {
    const key = roundHalf(row.consensusSpread);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const rows: DiscreteMarginRow[] = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([consensusSpread, observations]) => ({
      consensusSpread,
      outcomes: grid.map((postedPoint) => outcomeCell(observations, postedPoint, options))
    }));
  const massRows = eligible.filter((row) => row.season >= options.boundarySeason);
  const totalMassWeight = massRows.reduce(
    (sum, row) => sum + weightForSeason(row.season, options.latestCompletedSeason, options.halfLifeSeasons),
    0
  );
  const keyMarginMasses = Object.fromEntries(
    options.keyMargins.map((margin) => {
      const mass = massRows.reduce((sum, row) => {
        if (Math.abs(row.actualMargin) !== margin) return sum;
        return sum + weightForSeason(row.season, options.latestCompletedSeason, options.halfLifeSeasons);
      }, 0);
      return [String(margin), mass / totalMassWeight];
    })
  );
  const unhashed = {
    version: `margin-${options.latestCompletedSeason}`,
    seasonRange: [2010, options.latestCompletedSeason] as [number, number],
    boundarySeason: options.boundarySeason,
    decay: {
      halfLifeSeasons: options.halfLifeSeasons,
      referenceSeason: options.latestCompletedSeason
    },
    spreadGrid: grid,
    rows,
    keyMarginMasses,
    generatedAt: options.generatedAt
  };
  return { ...unhashed, artifactHash: stableHash(unhashed) };
}

function outcomeCell(
  observations: HistoricalMarginRow[],
  postedPoint: number,
  options: BuildMarginArtifactOptions
): DiscreteOutcomeCell {
  let cover = 0;
  let push = 0;
  let loss = 0;
  for (const row of observations) {
    const weight = weightForSeason(
      row.season,
      options.latestCompletedSeason,
      options.halfLifeSeasons
    );
    const outcome = row.actualMargin + postedPoint;
    if (outcome > 0) cover += weight;
    else if (outcome < 0) loss += weight;
    else push += weight;
  }
  const total = cover + push + loss;
  return {
    postedPoint,
    cover: total === 0 ? 0 : cover / total,
    push: total === 0 ? 0 : push / total,
    loss: total === 0 ? 0 : loss / total,
    effectiveWeight: total
  };
}

function clampProbability(value: number): number {
  return Math.max(EPSILON, Math.min(1 - EPSILON, value));
}

function logit(value: number): number {
  const clamped = clampProbability(value);
  return Math.log(clamped / (1 - clamped));
}

function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

/**
 * Sportsbook prices are quoted conditional on the wager not pushing: a push
 * refunds the stake rather than occupying one side of the two-way price. Keep
 * every translated probability on that same decisive-outcome scale and carry
 * push mass separately.
 */
function decisiveCoverProbability(cell: DiscreteOutcomeCell): number {
  const decisiveMass = cell.cover + cell.loss;
  return decisiveMass <= 0 ? 0.5 : cell.cover / decisiveMass;
}

interface LocatedCell {
  cell: DiscreteOutcomeCell | null;
  warning: TranslationResult["warning"];
  sourcePoints: number[];
}

function locateRow(artifact: DiscreteMarginArtifact, spread: number): {
  row: DiscreteMarginRow | null;
  warning: TranslationResult["warning"];
  sourcePoints: number[];
} {
  const exact = artifact.rows.find((row) => row.consensusSpread === spread);
  if (exact) return { row: exact, warning: "none", sourcePoints: [spread] };
  const lower = [...artifact.rows].reverse().find((row) => row.consensusSpread < spread);
  const upper = artifact.rows.find((row) => row.consensusSpread > spread);
  if (lower && upper) {
    const ratio = (spread - lower.consensusSpread) / (upper.consensusSpread - lower.consensusSpread);
    const outcomes = artifact.spreadGrid.map((postedPoint) => {
      const left = lower.outcomes.find((cell) => cell.postedPoint === postedPoint)!;
      const right = upper.outcomes.find((cell) => cell.postedPoint === postedPoint)!;
      return {
        postedPoint,
        cover: left.cover + ratio * (right.cover - left.cover),
        push: left.push + ratio * (right.push - left.push),
        loss: left.loss + ratio * (right.loss - left.loss),
        effectiveWeight: left.effectiveWeight + ratio * (right.effectiveWeight - left.effectiveWeight)
      };
    });
    return {
      row: { consensusSpread: spread, outcomes },
      warning: "interpolated",
      sourcePoints: [lower.consensusSpread, upper.consensusSpread]
    };
  }
  const nearest = lower ?? upper;
  return nearest
    ? { row: nearest, warning: "extrapolated", sourcePoints: [nearest.consensusSpread] }
    : { row: null, warning: "unsupported", sourcePoints: [] };
}

function locateCell(
  artifact: DiscreteMarginArtifact,
  consensusSpread: number,
  postedPoint: number
): LocatedCell {
  const located = locateRow(artifact, consensusSpread);
  if (!located.row) return { cell: null, warning: "unsupported", sourcePoints: [] };
  const exact = located.row.outcomes.find((cell) => cell.postedPoint === postedPoint);
  if (exact?.effectiveWeight) return { ...located, cell: exact };
  const lower = [...located.row.outcomes].reverse().find((cell) => cell.postedPoint < postedPoint);
  const upper = located.row.outcomes.find((cell) => cell.postedPoint > postedPoint);
  if (lower && upper && lower.effectiveWeight > 0 && upper.effectiveWeight > 0) {
    const ratio = (postedPoint - lower.postedPoint) / (upper.postedPoint - lower.postedPoint);
    return {
      cell: {
        postedPoint,
        cover: lower.cover + ratio * (upper.cover - lower.cover),
        push: lower.push + ratio * (upper.push - lower.push),
        loss: lower.loss + ratio * (upper.loss - lower.loss),
        effectiveWeight: lower.effectiveWeight + ratio * (upper.effectiveWeight - lower.effectiveWeight)
      },
      warning: located.warning === "none" ? "interpolated" : located.warning,
      sourcePoints: located.sourcePoints
    };
  }
  const nearest = lower ?? upper;
  return nearest && nearest.effectiveWeight > 0
    ? { cell: nearest, warning: "extrapolated", sourcePoints: located.sourcePoints }
    : { cell: null, warning: "unsupported", sourcePoints: located.sourcePoints };
}

export function translateFairProbability(
  artifact: DiscreteMarginArtifact,
  consensusSpread: number,
  fromPoint: number,
  toPoint: number,
  fairProbability: number
): TranslationResult {
  if (fromPoint === toPoint) {
    const cell = locateCell(artifact, consensusSpread, fromPoint);
    return {
      probability: fairProbability,
      pushProbability: cell.cell?.push ?? null,
      warning: cell.warning,
      sourcePoints: cell.sourcePoints
    };
  }
  const from = locateCell(artifact, consensusSpread, fromPoint);
  const to = locateCell(artifact, consensusSpread, toPoint);
  if (!from.cell || !to.cell) {
    return { probability: null, pushProbability: null, warning: "unsupported", sourcePoints: [] };
  }
  const shift = logit(decisiveCoverProbability(to.cell)) - logit(decisiveCoverProbability(from.cell));
  const warnings = [from.warning, to.warning];
  return {
    probability: logistic(logit(fairProbability) + shift),
    pushProbability: to.cell.push,
    warning: warnings.includes("extrapolated")
      ? "extrapolated"
      : warnings.includes("interpolated")
        ? "interpolated"
        : "none",
    sourcePoints: [...new Set([...from.sourcePoints, ...to.sourcePoints])]
  };
}

export function fairSpreadPointForProbability(
  artifact: DiscreteMarginArtifact,
  consensusSpread: number,
  postedPoint: number,
  targetProbability: number
): { point: number | null; warning: TranslationResult["warning"] } {
  const candidates = artifact.spreadGrid.map((fairPoint) => ({
    fairPoint,
    translated: translateFairProbability(
      artifact,
      consensusSpread,
      fairPoint,
      postedPoint,
      0.5
    )
  })).filter((candidate) => candidate.translated.probability !== null);
  if (!candidates.length) return { point: null, warning: "unsupported" };
  candidates.sort((left, right) =>
    Math.abs(left.translated.probability! - targetProbability) -
    Math.abs(right.translated.probability! - targetProbability) ||
    Math.abs(left.fairPoint - postedPoint) - Math.abs(right.fairPoint - postedPoint)
  );
  return {
    point: candidates[0].fairPoint,
    warning: candidates[0].translated.warning
  };
}
