import { powerDevig } from "./odds";
import {
  buildCorrelatedNegativeBinomialDistribution,
  buildMarketAnchoredScoreDistribution,
  buildPossessionSimulationDistribution,
  type FittedJointScoreParameters,
  type JointScoreDistribution,
  type PossessionTeamParameters
} from "./joint-score";

export interface SrsGame {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homeMargin: number;
  homeFieldPoints: number;
  completedAt: string;
}

export interface SrsRating {
  team: string;
  games: number;
  averageAdjustedMargin: number;
  scheduleStrength: number;
  rating: number;
}

export function fitSimpleRatingSystem(
  games: readonly SrsGame[],
  options: { iterations?: number; tolerance?: number } = {}
): SrsRating[] {
  if (!games.length) throw new Error("SRS requires completed games");
  const teams = [...new Set(games.flatMap((game) => [game.homeTeam, game.awayTeam]))].sort();
  const margins = new Map(teams.map((team) => [team, [] as Array<{ opponent: string; margin: number }>]));
  games.forEach((game) => {
    const neutralized = game.homeMargin - game.homeFieldPoints;
    margins.get(game.homeTeam)!.push({ opponent: game.awayTeam, margin: neutralized });
    margins.get(game.awayTeam)!.push({ opponent: game.homeTeam, margin: -neutralized });
  });
  let ratings = new Map(teams.map((team) => [team, 0]));
  const iterations = options.iterations ?? 1_000;
  const tolerance = options.tolerance ?? 1e-10;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Map<string, number>();
    teams.forEach((team) => {
      const rows = margins.get(team)!;
      next.set(team, rows.reduce((sum, row) => sum + row.margin + (ratings.get(row.opponent) ?? 0), 0) / rows.length);
    });
    const center = teams.reduce((sum, team) => sum + next.get(team)!, 0) / teams.length;
    teams.forEach((team) => next.set(team, next.get(team)! - center));
    const maximumChange = Math.max(...teams.map((team) => Math.abs(next.get(team)! - ratings.get(team)!)));
    ratings = next;
    if (maximumChange < tolerance) break;
  }
  return teams.map((team) => {
    const rows = margins.get(team)!;
    const averageAdjustedMargin = rows.reduce((sum, row) => sum + row.margin, 0) / rows.length;
    const scheduleStrength = rows.reduce((sum, row) => sum + (ratings.get(row.opponent) ?? 0), 0) / rows.length;
    return {
      team,
      games: rows.length,
      averageAdjustedMargin,
      scheduleStrength,
      rating: ratings.get(team)!
    };
  });
}

export function predictSrsHomeMargin(input: {
  ratings: readonly SrsRating[];
  homeTeam: string;
  awayTeam: string;
  homeFieldPoints: number;
}): number | null {
  const home = input.ratings.find((rating) => rating.team === input.homeTeam);
  const away = input.ratings.find((rating) => rating.team === input.awayTeam);
  return home && away ? home.rating - away.rating + input.homeFieldPoints : null;
}

export interface QbEloState {
  team: string;
  teamRating: number;
  quarterbackId: string | null;
  quarterbackRating: number;
  games: number;
  updatedAt: string;
}

export interface QbEloGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeQuarterbackId: string | null;
  awayQuarterbackId: string | null;
  homeMargin: number;
  expectedHomeMargin: number;
  completedAt: string;
}

export function qbAdjustedHomeWinProbability(input: {
  home: QbEloState;
  away: QbEloState;
  homeFieldElo: number;
  quarterbackWeight: number;
}): number {
  const difference = input.home.teamRating - input.away.teamRating + input.homeFieldElo +
    input.quarterbackWeight * (input.home.quarterbackRating - input.away.quarterbackRating);
  return 1 / (1 + 10 ** (-difference / 400));
}

export function updateQbAdjustedElo(input: {
  states: readonly QbEloState[];
  games: readonly QbEloGame[];
  teamK: number;
  quarterbackK: number;
  offseasonRegression?: number;
}): QbEloState[] {
  if (input.teamK < 0 || input.quarterbackK < 0) throw new Error("Elo update sizes cannot be negative");
  const states = new Map(input.states.map((state) => [state.team, { ...state }]));
  const ordered = [...input.games].sort((left, right) =>
    left.completedAt.localeCompare(right.completedAt) || left.gameId.localeCompare(right.gameId)
  );
  const stateFor = (team: string, quarterbackId: string | null, completedAt: string): QbEloState => {
    const current = states.get(team);
    if (current) {
      if (quarterbackId !== null) current.quarterbackId = quarterbackId;
      return current;
    }
    const created: QbEloState = {
      team,
      teamRating: 1_500,
      quarterbackId,
      quarterbackRating: 0,
      games: 0,
      updatedAt: completedAt
    };
    states.set(team, created);
    return created;
  };
  ordered.forEach((game) => {
    const home = stateFor(game.homeTeam, game.homeQuarterbackId, game.completedAt);
    const away = stateFor(game.awayTeam, game.awayQuarterbackId, game.completedAt);
    const residual = game.homeMargin - game.expectedHomeMargin;
    home.teamRating += input.teamK * residual;
    away.teamRating -= input.teamK * residual;
    home.quarterbackRating += input.quarterbackK * residual;
    away.quarterbackRating -= input.quarterbackK * residual;
    home.games += 1;
    away.games += 1;
    home.updatedAt = game.completedAt;
    away.updatedAt = game.completedAt;
  });
  const regression = input.offseasonRegression ?? 0;
  if (regression < 0 || regression > 1) throw new Error("Offseason regression must be between zero and one");
  if (regression > 0) {
    states.forEach((state) => {
      state.teamRating = 1_500 + (state.teamRating - 1_500) * (1 - regression);
      state.quarterbackRating *= 1 - regression;
    });
  }
  return [...states.values()].sort((left, right) => left.team.localeCompare(right.team));
}

export interface MarketBaselineInput {
  homeMoneyline: number;
  awayMoneyline: number;
  homeSpreadPoint: number;
  totalPoint: number;
  expectedHomeMargin: number;
  generatedAt: string;
  modelHash: string;
  provenanceHash: string;
  homeDispersion: number;
  awayDispersion: number;
  dependence: number;
}

export function buildPowerDeviggedMarketBaseline(input: MarketBaselineInput): {
  homeWinProbability: number;
  awayWinProbability: number;
  holdExponent: number;
  distribution: JointScoreDistribution;
} {
  const devig = powerDevig(input.homeMoneyline, input.awayMoneyline);
  return {
    homeWinProbability: devig.probabilities[0],
    awayWinProbability: devig.probabilities[1],
    holdExponent: devig.exponent,
    distribution: buildMarketAnchoredScoreDistribution({
      expectedHomeMargin: input.expectedHomeMargin,
      expectedTotal: input.totalPoint,
      homeDispersion: input.homeDispersion,
      awayDispersion: input.awayDispersion,
      dependence: input.dependence,
      generatedAt: input.generatedAt,
      modelHash: input.modelHash,
      provenanceHash: input.provenanceHash
    })
  };
}

export function buildScoreModelCandidateSet(input: {
  expectedMarketHomeMargin: number;
  expectedMarketTotal: number;
  independentExpectedHomeScore: number;
  independentExpectedAwayScore: number;
  fittedCountParameters: FittedJointScoreParameters;
  possessionHome: PossessionTeamParameters;
  possessionAway: PossessionTeamParameters;
  possessionSimulations: number;
  possessionSeed: number;
  maxScore: number;
  generatedAt: string;
  provenanceHash: string;
  modelHashes: {
    marketAnchored: string;
    correlatedCount: string;
    possession: string;
  };
}): [JointScoreDistribution, JointScoreDistribution, JointScoreDistribution] {
  if (input.possessionSimulations < 1_000) throw new Error("Possession candidate requires at least 1,000 fixed-seed simulations");
  const market = buildMarketAnchoredScoreDistribution({
    expectedHomeMargin: input.expectedMarketHomeMargin,
    expectedTotal: input.expectedMarketTotal,
    homeDispersion: input.fittedCountParameters.homeDispersion,
    awayDispersion: input.fittedCountParameters.awayDispersion,
    dependence: input.fittedCountParameters.dependence,
    maxScore: input.maxScore,
    generatedAt: input.generatedAt,
    modelHash: input.modelHashes.marketAnchored,
    provenanceHash: input.provenanceHash
  });
  const count = buildCorrelatedNegativeBinomialDistribution({
    expectedHomeScore: input.independentExpectedHomeScore,
    expectedAwayScore: input.independentExpectedAwayScore,
    homeDispersion: input.fittedCountParameters.homeDispersion,
    awayDispersion: input.fittedCountParameters.awayDispersion,
    dependence: input.fittedCountParameters.dependence,
    maxScore: input.maxScore,
    generatedAt: input.generatedAt,
    modelHash: input.modelHashes.correlatedCount,
    provenanceHash: input.provenanceHash
  });
  const possession = buildPossessionSimulationDistribution({
    home: input.possessionHome,
    away: input.possessionAway,
    simulations: input.possessionSimulations,
    seed: input.possessionSeed,
    maxScore: input.maxScore,
    generatedAt: input.generatedAt,
    modelHash: input.modelHashes.possession,
    provenanceHash: input.provenanceHash
  });
  return [market, count, possession];
}
