import { stableHash } from "./hash";

const MIN_PROBABILITY = 1e-15;

export type ScoreModelFamily =
  | "market_anchored_discrete"
  | "correlated_negative_binomial"
  | "possession_simulation";

export interface ScoreCell {
  homeScore: number;
  awayScore: number;
  probability: number;
}

export interface JointScoreDistribution {
  family: ScoreModelFamily;
  cells: ScoreCell[];
  expectedHomeScore: number;
  expectedAwayScore: number;
  homeScoreVariance: number;
  awayScoreVariance: number;
  scoreCovariance: number;
  maxScore: number;
  generatedAt: string;
  modelHash: string;
  provenanceHash: string;
  distributionHash: string;
}

export interface MainlineProbabilities {
  moneyline: { home: number; away: number; tie: number };
  spread: { homeCover: number; awayCover: number; push: number; homePoint: number };
  total: { over: number; under: number; push: number; point: number };
  expectedHomeScore: number;
  expectedAwayScore: number;
  expectedMargin: number;
  expectedTotal: number;
  homeScoreInterval80: [number, number];
  awayScoreInterval80: [number, number];
  marginInterval80: [number, number];
  totalInterval80: [number, number];
}

export interface HistoricalScoreTrainingRow {
  gameId: string;
  season: number;
  actualHomeScore: number;
  actualAwayScore: number;
  expectedHomeMargin: number;
  expectedTotal: number;
  weight: number;
}

export interface FittedJointScoreParameters {
  homeDispersion: number;
  awayDispersion: number;
  dependence: number;
  trainingGames: number;
  effectiveGames: number;
  trainingHash: string;
}

/**
 * Learns count dispersion and residual score dependence from market-anchored,
 * point-in-time rows. No NFL score or key-number percentage is encoded here.
 */
export function fitJointScoreParameters(
  rows: readonly HistoricalScoreTrainingRow[]
): FittedJointScoreParameters {
  const eligible = rows.filter((row) => row.weight > 0 && row.expectedTotal > Math.abs(row.expectedHomeMargin) &&
    Number.isInteger(row.actualHomeScore) && Number.isInteger(row.actualAwayScore) &&
    row.actualHomeScore >= 0 && row.actualAwayScore >= 0);
  if (eligible.length < 32) throw new Error("Joint-score parameter fit requires at least 32 valid games");
  let totalWeight = 0;
  let squaredWeight = 0;
  let homeExcessVariance = 0;
  let awayExcessVariance = 0;
  let homeMeanSquared = 0;
  let awayMeanSquared = 0;
  let residualProduct = 0;
  let homeResidualSquared = 0;
  let awayResidualSquared = 0;
  eligible.forEach((row) => {
    const homeMean = (row.expectedTotal + row.expectedHomeMargin) / 2;
    const awayMean = (row.expectedTotal - row.expectedHomeMargin) / 2;
    const homeResidual = row.actualHomeScore - homeMean;
    const awayResidual = row.actualAwayScore - awayMean;
    totalWeight += row.weight;
    squaredWeight += row.weight ** 2;
    homeMeanSquared += row.weight * homeMean ** 2;
    awayMeanSquared += row.weight * awayMean ** 2;
    homeExcessVariance += row.weight * Math.max(0, homeResidual ** 2 - homeMean);
    awayExcessVariance += row.weight * Math.max(0, awayResidual ** 2 - awayMean);
    residualProduct += row.weight * homeResidual * awayResidual;
    homeResidualSquared += row.weight * homeResidual ** 2;
    awayResidualSquared += row.weight * awayResidual ** 2;
  });
  const maximumFiniteDispersion = 1_000_000;
  const homeDispersion = homeExcessVariance > 0
    ? Math.max(0.1, Math.min(maximumFiniteDispersion, homeMeanSquared / homeExcessVariance))
    : maximumFiniteDispersion;
  const awayDispersion = awayExcessVariance > 0
    ? Math.max(0.1, Math.min(maximumFiniteDispersion, awayMeanSquared / awayExcessVariance))
    : maximumFiniteDispersion;
  const residualCorrelation = residualProduct /
    Math.max(Number.EPSILON, Math.sqrt(homeResidualSquared * awayResidualSquared));
  const dependence = Math.max(-0.35, Math.min(0.35, residualCorrelation));
  return {
    homeDispersion,
    awayDispersion,
    dependence,
    trainingGames: eligible.length,
    effectiveGames: totalWeight ** 2 / squaredWeight,
    trainingHash: stableHash(eligible.map((row) => ({
      gameId: row.gameId,
      season: row.season,
      actualHomeScore: row.actualHomeScore,
      actualAwayScore: row.actualAwayScore,
      expectedHomeMargin: row.expectedHomeMargin,
      expectedTotal: row.expectedTotal,
      weight: row.weight
    })))
  };
}

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019571e-6, 1.5056327351493116e-7
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const shifted = value - 1;
  let sum = 0.9999999999998099;
  coefficients.forEach((coefficient, index) => {
    sum += coefficient / (shifted + index + 1);
  });
  const t = shifted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

export function negativeBinomialProbability(score: number, mean: number, dispersion: number): number {
  if (!Number.isInteger(score) || score < 0) return 0;
  if (!(mean > 0) || !(dispersion > 0)) throw new Error("Negative-binomial parameters must be positive");
  const success = dispersion / (dispersion + mean);
  const logProbability = logGamma(score + dispersion) - logGamma(dispersion) - logGamma(score + 1) +
    dispersion * Math.log(success) + score * Math.log(1 - success);
  return Math.exp(logProbability);
}

function summarizeDistribution(input: {
  family: ScoreModelFamily;
  cells: ScoreCell[];
  maxScore: number;
  generatedAt: string;
  modelHash: string;
  provenanceHash: string;
}): JointScoreDistribution {
  const total = input.cells.reduce((sum, cell) => sum + cell.probability, 0);
  if (!(total > 0)) throw new Error("Joint score distribution has no probability mass");
  const cells = input.cells
    .map((cell) => ({ ...cell, probability: cell.probability / total }))
    .filter((cell) => cell.probability >= MIN_PROBABILITY)
    .sort((left, right) => left.homeScore - right.homeScore || left.awayScore - right.awayScore);
  const expectedHomeScore = cells.reduce((sum, cell) => sum + cell.homeScore * cell.probability, 0);
  const expectedAwayScore = cells.reduce((sum, cell) => sum + cell.awayScore * cell.probability, 0);
  const homeScoreVariance = cells.reduce(
    (sum, cell) => sum + (cell.homeScore - expectedHomeScore) ** 2 * cell.probability,
    0
  );
  const awayScoreVariance = cells.reduce(
    (sum, cell) => sum + (cell.awayScore - expectedAwayScore) ** 2 * cell.probability,
    0
  );
  const scoreCovariance = cells.reduce(
    (sum, cell) => sum + (cell.homeScore - expectedHomeScore) *
      (cell.awayScore - expectedAwayScore) * cell.probability,
    0
  );
  const distributionHash = stableHash({
    family: input.family,
    cells,
    maxScore: input.maxScore,
    modelHash: input.modelHash,
    provenanceHash: input.provenanceHash
  });
  return {
    ...input,
    cells,
    expectedHomeScore,
    expectedAwayScore,
    homeScoreVariance,
    awayScoreVariance,
    scoreCovariance,
    distributionHash
  };
}

export function validateJointScoreDistribution(distribution: JointScoreDistribution): void {
  const probability = distribution.cells.reduce((sum, cell) => sum + cell.probability, 0);
  if (Math.abs(probability - 1) > 1e-9) throw new Error("Joint score probabilities do not sum to one");
  const keys = new Set<string>();
  distribution.cells.forEach((cell) => {
    if (!Number.isInteger(cell.homeScore) || !Number.isInteger(cell.awayScore) ||
      cell.homeScore < 0 || cell.awayScore < 0 ||
      cell.homeScore > distribution.maxScore || cell.awayScore > distribution.maxScore) {
      throw new Error("Joint score distribution contains invalid score support");
    }
    if (!Number.isFinite(cell.probability) || cell.probability < 0) {
      throw new Error("Joint score distribution contains invalid probability mass");
    }
    const key = `${cell.homeScore}:${cell.awayScore}`;
    if (keys.has(key)) throw new Error(`Joint score distribution contains duplicate cell ${key}`);
    keys.add(key);
  });
  if (distribution.distributionHash !== stableHash({
    family: distribution.family,
    cells: distribution.cells,
    maxScore: distribution.maxScore,
    modelHash: distribution.modelHash,
    provenanceHash: distribution.provenanceHash
  })) throw new Error("Joint score distribution hash is invalid");
}

export function buildCorrelatedNegativeBinomialDistribution(input: {
  family?: "market_anchored_discrete" | "correlated_negative_binomial";
  expectedHomeScore: number;
  expectedAwayScore: number;
  homeDispersion: number;
  awayDispersion: number;
  dependence: number;
  maxScore?: number;
  generatedAt: string;
  modelHash: string;
  provenanceHash: string;
  /** Optional data-derived exact-score weights; percentages are never hardcoded here. */
  scoreWeights?: Readonly<Record<string, number>>;
}): JointScoreDistribution {
  const maxScore = input.maxScore ?? 70;
  if (input.expectedHomeScore <= 0 || input.expectedAwayScore <= 0) {
    throw new Error("Expected team scores must be positive");
  }
  if (Math.abs(input.dependence) > 0.35) throw new Error("Count dependence must be between -0.35 and 0.35");
  const homeVariance = input.expectedHomeScore + input.expectedHomeScore ** 2 / input.homeDispersion;
  const awayVariance = input.expectedAwayScore + input.expectedAwayScore ** 2 / input.awayDispersion;
  const homeMarginal = Array.from(
    { length: maxScore + 1 },
    (_, score) => negativeBinomialProbability(score, input.expectedHomeScore, input.homeDispersion)
  );
  const awayMarginal = Array.from(
    { length: maxScore + 1 },
    (_, score) => negativeBinomialProbability(score, input.expectedAwayScore, input.awayDispersion)
  );
  const cells: ScoreCell[] = [];
  for (let homeScore = 0; homeScore <= maxScore; homeScore += 1) {
    for (let awayScore = 0; awayScore <= maxScore; awayScore += 1) {
      const standardizedProduct =
        (homeScore - input.expectedHomeScore) / Math.sqrt(homeVariance) *
        (awayScore - input.expectedAwayScore) / Math.sqrt(awayVariance);
      const dependenceTilt = Math.exp(Math.max(-6, Math.min(6, input.dependence * standardizedProduct)));
      const dataWeight = input.scoreWeights?.[`${homeScore}:${awayScore}`] ?? 1;
      if (!(dataWeight >= 0)) throw new Error("Data-derived score weights cannot be negative");
      cells.push({
        homeScore,
        awayScore,
        probability: homeMarginal[homeScore] * awayMarginal[awayScore] * dependenceTilt * dataWeight
      });
    }
  }
  const distribution = summarizeDistribution({
    family: input.family ?? "correlated_negative_binomial",
    cells,
    maxScore,
    generatedAt: input.generatedAt,
    modelHash: input.modelHash,
    provenanceHash: input.provenanceHash
  });
  validateJointScoreDistribution(distribution);
  return distribution;
}

export function buildMarketAnchoredScoreDistribution(input: {
  expectedHomeMargin: number;
  expectedTotal: number;
  homeDispersion: number;
  awayDispersion: number;
  dependence: number;
  maxScore?: number;
  generatedAt: string;
  modelHash: string;
  provenanceHash: string;
  scoreWeights?: Readonly<Record<string, number>>;
}): JointScoreDistribution {
  const expectedHomeScore = (input.expectedTotal + input.expectedHomeMargin) / 2;
  const expectedAwayScore = (input.expectedTotal - input.expectedHomeMargin) / 2;
  return buildCorrelatedNegativeBinomialDistribution({
    ...input,
    family: "market_anchored_discrete",
    expectedHomeScore,
    expectedAwayScore
  });
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

function sampleCategorical(random: () => number, probabilities: readonly number[]): number {
  const total = probabilities.reduce((sum, probability) => sum + probability, 0);
  if (!(total > 0)) throw new Error("Possession outcome probabilities require positive mass");
  const draw = random() * total;
  let cumulative = 0;
  for (let index = 0; index < probabilities.length; index += 1) {
    cumulative += probabilities[index];
    if (draw <= cumulative) return index;
  }
  return probabilities.length - 1;
}

export interface PossessionTeamParameters {
  expectedPossessions: number;
  possessionStandardDeviation: number;
  scoringOutcomes: Array<{ points: number; probability: number }>;
}

export function buildPossessionSimulationDistribution(input: {
  home: PossessionTeamParameters;
  away: PossessionTeamParameters;
  simulations: number;
  seed: number;
  maxScore?: number;
  generatedAt: string;
  modelHash: string;
  provenanceHash: string;
}): JointScoreDistribution {
  if (!Number.isInteger(input.simulations) || input.simulations < 1_000) {
    throw new Error("Possession simulation requires at least 1,000 fixed-seed trials");
  }
  const maxScore = input.maxScore ?? 70;
  const random = seededRandom(input.seed);
  const counts = new Map<string, number>();
  const simulateTeam = (parameters: PossessionTeamParameters): number => {
    if (!(parameters.expectedPossessions > 0) || parameters.possessionStandardDeviation < 0) {
      throw new Error("Possession count parameters are invalid");
    }
    if (!parameters.scoringOutcomes.length || parameters.scoringOutcomes.some((outcome) =>
      !Number.isInteger(outcome.points) || outcome.points < 0 ||
      !Number.isFinite(outcome.probability) || outcome.probability < 0
    )) {
      throw new Error("Possession scoring outcomes must be non-negative integer scores with valid probability mass");
    }
    const centeredNoise = Array.from({ length: 6 }, () => random()).reduce((sum, value) => sum + value, 0) - 3;
    const possessions = Math.max(1, Math.round(
      parameters.expectedPossessions + centeredNoise * parameters.possessionStandardDeviation
    ));
    const probabilities = parameters.scoringOutcomes.map((outcome) => outcome.probability);
    let score = 0;
    for (let possession = 0; possession < possessions; possession += 1) {
      score += parameters.scoringOutcomes[sampleCategorical(random, probabilities)].points;
    }
    return Math.min(maxScore, score);
  };
  for (let simulation = 0; simulation < input.simulations; simulation += 1) {
    const homeScore = simulateTeam(input.home);
    const awayScore = simulateTeam(input.away);
    const key = `${homeScore}:${awayScore}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells = [...counts.entries()].map(([key, count]) => {
    const [homeScore, awayScore] = key.split(":").map(Number);
    return { homeScore, awayScore, probability: count / input.simulations };
  });
  const distribution = summarizeDistribution({
    family: "possession_simulation",
    cells,
    maxScore,
    generatedAt: input.generatedAt,
    modelHash: input.modelHash,
    provenanceHash: input.provenanceHash
  });
  validateJointScoreDistribution(distribution);
  return distribution;
}

function weightedQuantile(values: Array<{ value: number; probability: number }>, quantile: number): number {
  const grouped = new Map<number, number>();
  values.forEach(({ value, probability }) => grouped.set(value, (grouped.get(value) ?? 0) + probability));
  const ordered = [...grouped.entries()].sort((left, right) => left[0] - right[0]);
  let cumulative = 0;
  for (const [value, probability] of ordered) {
    cumulative += probability;
    if (cumulative >= quantile) return value;
  }
  return ordered.at(-1)?.[0] ?? 0;
}

export function deriveMainlineProbabilities(
  distribution: JointScoreDistribution,
  contract: { homeSpreadPoint: number; totalPoint: number }
): MainlineProbabilities {
  validateJointScoreDistribution(distribution);
  let home = 0;
  let away = 0;
  let tie = 0;
  let homeCover = 0;
  let awayCover = 0;
  let spreadPush = 0;
  let over = 0;
  let under = 0;
  let totalPush = 0;
  for (const cell of distribution.cells) {
    const margin = cell.homeScore - cell.awayScore;
    const total = cell.homeScore + cell.awayScore;
    if (margin > 0) home += cell.probability;
    else if (margin < 0) away += cell.probability;
    else tie += cell.probability;
    const adjustedMargin = margin + contract.homeSpreadPoint;
    if (adjustedMargin > 0) homeCover += cell.probability;
    else if (adjustedMargin < 0) awayCover += cell.probability;
    else spreadPush += cell.probability;
    if (total > contract.totalPoint) over += cell.probability;
    else if (total < contract.totalPoint) under += cell.probability;
    else totalPush += cell.probability;
  }
  const interval = (selector: (cell: ScoreCell) => number): [number, number] => [
    weightedQuantile(distribution.cells.map((cell) => ({ value: selector(cell), probability: cell.probability })), 0.1),
    weightedQuantile(distribution.cells.map((cell) => ({ value: selector(cell), probability: cell.probability })), 0.9)
  ];
  return {
    moneyline: { home, away, tie },
    spread: { homeCover, awayCover, push: spreadPush, homePoint: contract.homeSpreadPoint },
    total: { over, under, push: totalPush, point: contract.totalPoint },
    expectedHomeScore: distribution.expectedHomeScore,
    expectedAwayScore: distribution.expectedAwayScore,
    expectedMargin: distribution.expectedHomeScore - distribution.expectedAwayScore,
    expectedTotal: distribution.expectedHomeScore + distribution.expectedAwayScore,
    homeScoreInterval80: interval((cell) => cell.homeScore),
    awayScoreInterval80: interval((cell) => cell.awayScore),
    marginInterval80: interval((cell) => cell.homeScore - cell.awayScore),
    totalInterval80: interval((cell) => cell.homeScore + cell.awayScore)
  };
}

export function mixJointScoreDistributions(input: {
  branches: Array<{ weight: number; distribution: JointScoreDistribution }>;
  family: ScoreModelFamily;
  generatedAt: string;
  modelHash: string;
  provenanceHash: string;
}): JointScoreDistribution {
  if (!input.branches.length) throw new Error("Scenario mixture requires at least one branch");
  const totalWeight = input.branches.reduce((sum, branch) => sum + branch.weight, 0);
  if (Math.abs(totalWeight - 1) > 1e-9 || input.branches.some((branch) => branch.weight < 0)) {
    throw new Error("Scenario branch weights must be non-negative and sum to one");
  }
  const probabilities = new Map<string, number>();
  input.branches.forEach((branch) => {
    validateJointScoreDistribution(branch.distribution);
    branch.distribution.cells.forEach((cell) => {
      const key = `${cell.homeScore}:${cell.awayScore}`;
      probabilities.set(key, (probabilities.get(key) ?? 0) + branch.weight * cell.probability);
    });
  });
  return summarizeDistribution({
    ...input,
    maxScore: Math.max(...input.branches.map((branch) => branch.distribution.maxScore)),
    cells: [...probabilities.entries()].map(([key, probability]) => {
      const [homeScore, awayScore] = key.split(":").map(Number);
      return { homeScore, awayScore, probability };
    })
  });
}
