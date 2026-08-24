import { deriveMainlineProbabilities, validateJointScoreDistribution, type JointScoreDistribution } from "./joint-score";

const EPSILON = 1e-12;

export interface BinaryForecastOutcome {
  probability: number;
  outcome: 0 | 1;
}

export interface CalibrationFit {
  intercept: number;
  slope: number;
  observations: number;
  converged: boolean;
}

export interface ReliabilityDecomposition {
  brier: number;
  reliability: number;
  resolution: number;
  uncertainty: number;
  bins: Array<{ lower: number; upper: number; count: number; meanProbability: number; observedRate: number }>;
}

export interface ScoreDistributionEvaluation {
  jointLogScore: number;
  marginCrps: number;
  totalCrps: number;
  homeAbsoluteError: number;
  awayAbsoluteError: number;
  marginAbsoluteError: number;
  totalAbsoluteError: number;
  homeIntervalCovered: boolean;
  awayIntervalCovered: boolean;
  marginIntervalCovered: boolean;
  totalIntervalCovered: boolean;
  pitMargin: number;
  pitTotal: number;
}

export function binaryLogLoss(rows: readonly BinaryForecastOutcome[]): number {
  if (!rows.length) throw new Error("Log loss requires forecast rows");
  return rows.reduce((sum, row) => {
    const probability = Math.max(EPSILON, Math.min(1 - EPSILON, row.probability));
    return sum - row.outcome * Math.log(probability) - (1 - row.outcome) * Math.log(1 - probability);
  }, 0) / rows.length;
}

export function reliabilityDecomposition(
  rows: readonly BinaryForecastOutcome[],
  binCount = 10
): ReliabilityDecomposition {
  if (!rows.length || !Number.isInteger(binCount) || binCount < 2) {
    throw new Error("Reliability decomposition requires rows and at least two bins");
  }
  const observedMean = rows.reduce((sum, row) => sum + row.outcome, 0) / rows.length;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const lower = index / binCount;
    const upper = (index + 1) / binCount;
    const members = rows.filter((row) => {
      const bin = Math.min(binCount - 1, Math.floor(Math.max(0, Math.min(1, row.probability)) * binCount));
      return bin === index;
    });
    return {
      lower,
      upper,
      count: members.length,
      meanProbability: members.length ? members.reduce((sum, row) => sum + row.probability, 0) / members.length : 0,
      observedRate: members.length ? members.reduce((sum, row) => sum + row.outcome, 0) / members.length : 0
    };
  }).filter((bin) => bin.count > 0);
  const reliability = bins.reduce(
    (sum, bin) => sum + bin.count / rows.length * (bin.meanProbability - bin.observedRate) ** 2,
    0
  );
  const resolution = bins.reduce(
    (sum, bin) => sum + bin.count / rows.length * (bin.observedRate - observedMean) ** 2,
    0
  );
  const uncertainty = observedMean * (1 - observedMean);
  const brier = rows.reduce((sum, row) => sum + (row.probability - row.outcome) ** 2, 0) / rows.length;
  return { brier, reliability, resolution, uncertainty, bins };
}

function boundedLogit(probability: number): number {
  const bounded = Math.max(EPSILON, Math.min(1 - EPSILON, probability));
  return Math.log(bounded / (1 - bounded));
}

function logistic(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

export function fitCalibration(rows: readonly BinaryForecastOutcome[]): CalibrationFit | null {
  if (rows.length < 10 || new Set(rows.map((row) => row.outcome)).size < 2) return null;
  const x = rows.map((row) => boundedLogit(row.probability));
  let intercept = 0;
  let slope = 1;
  let converged = false;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    let gradient0 = 0;
    let gradient1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    rows.forEach((row, index) => {
      const probability = logistic(intercept + slope * x[index]);
      const variance = Math.max(EPSILON, probability * (1 - probability));
      const residual = row.outcome - probability;
      gradient0 += residual;
      gradient1 += residual * x[index];
      h00 += variance;
      h01 += variance * x[index];
      h11 += variance * x[index] ** 2;
    });
    const determinant = h00 * h11 - h01 ** 2;
    if (Math.abs(determinant) < EPSILON) break;
    const delta0 = (gradient0 * h11 - gradient1 * h01) / determinant;
    const delta1 = (gradient1 * h00 - gradient0 * h01) / determinant;
    intercept += delta0;
    slope += delta1;
    if (Math.max(Math.abs(delta0), Math.abs(delta1)) < 1e-8) {
      converged = true;
      break;
    }
  }
  return { intercept, slope, observations: rows.length, converged };
}

function groupedDistribution(
  distribution: JointScoreDistribution,
  selector: (homeScore: number, awayScore: number) => number
): Map<number, number> {
  const grouped = new Map<number, number>();
  distribution.cells.forEach((cell) => {
    const value = selector(cell.homeScore, cell.awayScore);
    grouped.set(value, (grouped.get(value) ?? 0) + cell.probability);
  });
  return grouped;
}

function discreteCrps(probabilities: ReadonlyMap<number, number>, observation: number): number {
  const support = [...probabilities.keys(), observation];
  const minimum = Math.min(...support);
  const maximum = Math.max(...support);
  let cdf = 0;
  let score = 0;
  for (let threshold = minimum; threshold <= maximum; threshold += 1) {
    cdf += probabilities.get(threshold) ?? 0;
    const observedCdf = observation <= threshold ? 1 : 0;
    score += (cdf - observedCdf) ** 2;
  }
  return score;
}

function deterministicPit(probabilities: ReadonlyMap<number, number>, observation: number, tieFraction = 0.5): number {
  const lower = [...probabilities.entries()]
    .filter(([value]) => value < observation)
    .reduce((sum, [, probability]) => sum + probability, 0);
  return lower + tieFraction * (probabilities.get(observation) ?? 0);
}

export function evaluateScoreDistribution(input: {
  distribution: JointScoreDistribution;
  actualHomeScore: number;
  actualAwayScore: number;
  homeSpreadPoint: number;
  totalPoint: number;
}): ScoreDistributionEvaluation {
  validateJointScoreDistribution(input.distribution);
  const actualCellProbability = input.distribution.cells.find((cell) =>
    cell.homeScore === input.actualHomeScore && cell.awayScore === input.actualAwayScore
  )?.probability ?? EPSILON;
  const margin = input.actualHomeScore - input.actualAwayScore;
  const total = input.actualHomeScore + input.actualAwayScore;
  const marginDistribution = groupedDistribution(input.distribution, (home, away) => home - away);
  const totalDistribution = groupedDistribution(input.distribution, (home, away) => home + away);
  const mainline = deriveMainlineProbabilities(input.distribution, {
    homeSpreadPoint: input.homeSpreadPoint,
    totalPoint: input.totalPoint
  });
  const covered = (interval: [number, number], value: number): boolean => value >= interval[0] && value <= interval[1];
  return {
    jointLogScore: -Math.log(Math.max(EPSILON, actualCellProbability)),
    marginCrps: discreteCrps(marginDistribution, margin),
    totalCrps: discreteCrps(totalDistribution, total),
    homeAbsoluteError: Math.abs(input.distribution.expectedHomeScore - input.actualHomeScore),
    awayAbsoluteError: Math.abs(input.distribution.expectedAwayScore - input.actualAwayScore),
    marginAbsoluteError: Math.abs(mainline.expectedMargin - margin),
    totalAbsoluteError: Math.abs(mainline.expectedTotal - total),
    homeIntervalCovered: covered(mainline.homeScoreInterval80, input.actualHomeScore),
    awayIntervalCovered: covered(mainline.awayScoreInterval80, input.actualAwayScore),
    marginIntervalCovered: covered(mainline.marginInterval80, margin),
    totalIntervalCovered: covered(mainline.totalInterval80, total),
    pitMargin: deterministicPit(marginDistribution, margin),
    pitTotal: deterministicPit(totalDistribution, total)
  };
}

export interface PrequentialForecastRow {
  id: string;
  gameId: string;
  season: number;
  week: number;
  forecastHorizon: string;
  generatedAt: string;
  family: string;
  modelHash: string;
  dataHash: string;
  distribution: JointScoreDistribution;
  homeSpreadPoint: number;
  totalPoint: number;
  actualHomeScore: number;
  actualAwayScore: number;
  marketHomeWinProbability: number;
  marketHomeCoverProbability: number;
  marketOverProbability: number;
  quoteFresh: boolean;
}

export interface PrequentialScorecard {
  rows: number;
  games: number;
  meanJointLogScore: number;
  meanMarginCrps: number;
  meanTotalCrps: number;
  pooledLogLoss: number;
  marketPooledLogLoss: number;
  brier: ReliabilityDecomposition;
  marketBrier: ReliabilityDecomposition;
  calibration: CalibrationFit | null;
  marketCalibration: CalibrationFit | null;
  coverage80: {
    home: number;
    away: number;
    margin: number;
    total: number;
  };
}

export function evaluatePrequentialForecasts(rows: readonly PrequentialForecastRow[]): PrequentialScorecard {
  if (!rows.length) throw new Error("Prequential evaluation requires forecast rows");
  if (rows.some((row) => !row.quoteFresh)) throw new Error("Prequential evaluation cannot mix stale market baselines");
  const distributions = rows.map((row) => evaluateScoreDistribution(row));
  const modelBinary: BinaryForecastOutcome[] = [];
  const marketBinary: BinaryForecastOutcome[] = [];
  rows.forEach((row) => {
    const mainline = deriveMainlineProbabilities(row.distribution, row);
    const margin = row.actualHomeScore - row.actualAwayScore;
    const total = row.actualHomeScore + row.actualAwayScore;
    const outcomes: Array<{ model: number; market: number; outcome: 0 | 1; push: boolean }> = [
      { model: mainline.moneyline.home, market: row.marketHomeWinProbability, outcome: margin > 0 ? 1 : 0, push: margin === 0 },
      { model: mainline.spread.homeCover, market: row.marketHomeCoverProbability, outcome: margin + row.homeSpreadPoint > 0 ? 1 : 0, push: margin + row.homeSpreadPoint === 0 },
      { model: mainline.total.over, market: row.marketOverProbability, outcome: total > row.totalPoint ? 1 : 0, push: total === row.totalPoint }
    ];
    outcomes.filter((outcome) => !outcome.push).forEach((outcome) => {
      modelBinary.push({ probability: outcome.model, outcome: outcome.outcome });
      marketBinary.push({ probability: outcome.market, outcome: outcome.outcome });
    });
  });
  const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    rows: rows.length,
    games: new Set(rows.map((row) => row.gameId)).size,
    meanJointLogScore: mean(distributions.map((score) => score.jointLogScore)),
    meanMarginCrps: mean(distributions.map((score) => score.marginCrps)),
    meanTotalCrps: mean(distributions.map((score) => score.totalCrps)),
    pooledLogLoss: binaryLogLoss(modelBinary),
    marketPooledLogLoss: binaryLogLoss(marketBinary),
    brier: reliabilityDecomposition(modelBinary),
    marketBrier: reliabilityDecomposition(marketBinary),
    calibration: fitCalibration(modelBinary),
    marketCalibration: fitCalibration(marketBinary),
    coverage80: {
      home: mean(distributions.map((score) => Number(score.homeIntervalCovered))),
      away: mean(distributions.map((score) => Number(score.awayIntervalCovered))),
      margin: mean(distributions.map((score) => Number(score.marginIntervalCovered))),
      total: mean(distributions.map((score) => Number(score.totalIntervalCovered)))
    }
  };
}

export function scenarioBrierScore(input: {
  branchProbabilities: Readonly<Record<string, number>>;
  resolvedBranchId: string;
}): number {
  const entries = Object.entries(input.branchProbabilities);
  if (!entries.length || !entries.some(([id]) => id === input.resolvedBranchId)) {
    throw new Error("Scenario score requires the resolved branch in the probability set");
  }
  const total = entries.reduce((sum, [, probability]) => sum + probability, 0);
  if (Math.abs(total - 1) > 1e-9 || entries.some(([, probability]) => probability < 0 || probability > 1)) {
    throw new Error("Scenario probabilities must be valid and sum to one");
  }
  return entries.reduce(
    (sum, [id, probability]) => sum + (probability - Number(id === input.resolvedBranchId)) ** 2,
    0
  );
}

export interface BlockBootstrapComparison {
  meanImprovement: number;
  interval: [number, number];
  probabilityOfImprovement: number;
  uniqueBlocks: number;
  members: number;
  seed: number;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function quantile(values: readonly number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

/** Positive improvement means the candidate's preregistered loss is lower. */
export function blockBootstrapLossImprovement(input: {
  rows: readonly { blockId: string; baselineLoss: number; candidateLoss: number }[];
  members: number;
  seed: number;
  intervalPercentiles?: [number, number];
}): BlockBootstrapComparison {
  if (input.members < 100 || !input.rows.length) throw new Error("Block bootstrap requires rows and at least 100 members");
  const blocks = [...new Set(input.rows.map((row) => row.blockId))].sort();
  if (blocks.length < 2) throw new Error("Block bootstrap requires at least two independent blocks");
  const rowsByBlock = new Map(blocks.map((block) => [block, input.rows.filter((row) => row.blockId === block)]));
  const random = seededRandom(input.seed);
  const draws = Array.from({ length: input.members }, () => {
    const sampled = Array.from({ length: blocks.length }, () => blocks[Math.floor(random() * blocks.length)]);
    const values = sampled.flatMap((block) => rowsByBlock.get(block)!)
      .map((row) => row.baselineLoss - row.candidateLoss);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });
  const observed = input.rows.reduce((sum, row) => sum + row.baselineLoss - row.candidateLoss, 0) / input.rows.length;
  const percentiles = input.intervalPercentiles ?? [0.1, 0.9];
  return {
    meanImprovement: observed,
    interval: [quantile(draws, percentiles[0]), quantile(draws, percentiles[1])],
    probabilityOfImprovement: draws.filter((draw) => draw > 0).length / draws.length,
    uniqueBlocks: blocks.length,
    members: input.members,
    seed: input.seed
  };
}
