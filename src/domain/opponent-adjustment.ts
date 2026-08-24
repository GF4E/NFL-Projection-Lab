export interface OpponentMetricObservation {
  offense: string;
  defense: string;
  value: number;
  weight: number;
}

export interface OpponentAdjustedTeamRating {
  team: string;
  offense: number;
  defenseAllowed: number;
  offenseEffect: number;
  defenseEffect: number;
}

export interface OpponentAdjustmentFit {
  intercept: number;
  ridgePenalty: number;
  weightedRmse: number;
  effectiveObservations: number;
  ratings: ReadonlyMap<string, OpponentAdjustedTeamRating>;
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] | null {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let cursor = column; cursor <= size; cursor += 1) augmented[column][cursor] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (Math.abs(factor) < 1e-14) continue;
      for (let cursor = column; cursor <= size; cursor += 1) {
        augmented[row][cursor] -= factor * augmented[column][cursor];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

/**
 * Separates a team-game metric into simultaneous offense and opposing-defense
 * effects. The intercept is unpenalized; team effects receive the frozen L2
 * penalty. Observation weights are normalized so the penalty has a stable
 * meaning as the number of games grows.
 */
export function fitOpponentAdjustedRatings(
  input: readonly OpponentMetricObservation[],
  ridgePenalty: number
): OpponentAdjustmentFit | null {
  if (!Number.isFinite(ridgePenalty) || ridgePenalty <= 0) {
    throw new Error("Opponent-adjustment ridge penalty must be positive");
  }
  const observations = input.filter((row) =>
    row.offense && row.defense && Number.isFinite(row.value) && Number.isFinite(row.weight) && row.weight > 0);
  const teams = [...new Set(observations.flatMap((row) => [row.offense, row.defense]))].sort();
  if (teams.length < 2 || observations.length < teams.length * 2) return null;
  const teamIndex = new Map(teams.map((team, index) => [team, index]));
  const parameterCount = 1 + teams.length * 2;
  const matrix = Array.from({ length: parameterCount }, () => Array<number>(parameterCount).fill(0));
  const values = Array<number>(parameterCount).fill(0);
  const averageWeight = observations.reduce((sum, row) => sum + row.weight, 0) / observations.length;

  for (const row of observations) {
    const weight = row.weight / averageWeight;
    const columns = [0, 1 + teamIndex.get(row.offense)!, 1 + teams.length + teamIndex.get(row.defense)!];
    for (const left of columns) {
      values[left] += weight * row.value;
      for (const right of columns) matrix[left][right] += weight;
    }
  }
  for (let index = 1; index < parameterCount; index += 1) matrix[index][index] += ridgePenalty;
  const coefficients = solveLinearSystem(matrix, values);
  if (!coefficients) return null;
  const intercept = coefficients[0];
  const ratings = new Map(teams.map((team, index) => {
    const offenseEffect = coefficients[1 + index];
    const defenseEffect = coefficients[1 + teams.length + index];
    return [team, {
      team,
      offense: intercept + offenseEffect,
      defenseAllowed: intercept + defenseEffect,
      offenseEffect,
      defenseEffect
    }] as const;
  }));
  let squaredError = 0;
  let totalWeight = 0;
  for (const row of observations) {
    const weight = row.weight / averageWeight;
    const offense = ratings.get(row.offense)!;
    const defense = ratings.get(row.defense)!;
    const prediction = intercept + offense.offenseEffect + defense.defenseEffect;
    squaredError += weight * (row.value - prediction) ** 2;
    totalWeight += weight;
  }
  return {
    intercept,
    ridgePenalty,
    weightedRmse: Math.sqrt(squaredError / totalWeight),
    effectiveObservations: observations.length,
    ratings
  };
}

export function predictOpponentAdjustedMetric(
  fit: OpponentAdjustmentFit,
  offense: string,
  defense: string
): number | null {
  const offenseRating = fit.ratings.get(offense);
  const defenseRating = fit.ratings.get(defense);
  return offenseRating && defenseRating
    ? fit.intercept + offenseRating.offenseEffect + defenseRating.defenseEffect
    : null;
}
