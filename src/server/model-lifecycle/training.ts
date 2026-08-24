import { eraConfig, structuralConfig } from "@/domain/config";
import {
  designFeatureNames,
  evaluateProbabilityRows,
  fitWeightedLogistic,
  predictProbability,
  type FittedLogisticModel,
  type ModelTrainingRow
} from "@/domain/model-fit";
import { powerDevig } from "@/domain/odds";
import type { ModelMetrics } from "@/domain/types";
import { normalizeScheduleTeam } from "@/domain/weekly-slate";

export interface LifecycleGameRow {
  game_id: string;
  season: number;
  week: number;
  game_date: string;
  away_team: string;
  home_team: string;
  result: number;
  total: number | null;
  spread_line: number;
  total_line: number | null;
  away_rest: number | null;
  home_rest: number | null;
  away_moneyline: number | null;
  home_moneyline: number | null;
  away_spread_odds: number | null;
  home_spread_odds: number | null;
  under_odds: number | null;
  over_odds: number | null;
}

export interface LifecycleTeamFeatureRow {
  game_id: string;
  season: number;
  week: number;
  game_date: string;
  team: string;
  opponent: string;
  plays: number;
  epa_per_play: number;
  success_rate: number;
  explosive_rate: number;
  turnover_rate: number;
  seconds_per_play: number | null;
  pass_rate_over_expectation: number | null;
}

export type LifecycleContextGame = Pick<
  LifecycleGameRow,
  "game_id" | "season" | "week" | "game_date" | "away_team" | "home_team"
>;

export interface LifecycleTeamContext {
  sideMatchupEpa: number;
  sideMatchupSuccess: number;
  sideMatchupExplosive: number;
  sideBallSecurity: number;
  totalEpaEnvironment: number;
  totalSuccessEnvironment: number;
  totalExplosiveEnvironment: number;
  totalTurnoverEnvironment: number;
  totalPaceEnvironment: number;
  totalProeEnvironment: number;
}

interface LifecycleTeamProfile {
  games: number;
  offenseEpa: number;
  offenseSuccess: number;
  offenseExplosive: number;
  defenseEpaAllowed: number;
  defenseSuccessAllowed: number;
  defenseExplosiveAllowed: number;
  turnoverRate: number;
  secondsPerPlay: number;
  proe: number;
}

function beforeForecast(row: LifecycleTeamFeatureRow, game: LifecycleContextGame): boolean {
  return row.season < game.season || row.season === game.season && row.week < game.week;
}

function weightedAverage(
  rows: readonly LifecycleTeamFeatureRow[],
  field: "epa_per_play" | "success_rate" | "explosive_rate" | "turnover_rate" | "seconds_per_play" | "pass_rate_over_expectation"
): number | null {
  const eligible = rows.filter((row) => row[field] !== null && Number.isFinite(row[field]));
  const plays = eligible.reduce((sum, row) => sum + row.plays, 0);
  return plays ? eligible.reduce((sum, row) => sum + Number(row[field]) * row.plays, 0) / plays : null;
}

function lifecycleProfile(
  rows: readonly LifecycleTeamFeatureRow[],
  byGameTeam: ReadonlyMap<string, LifecycleTeamFeatureRow>,
  minimumGames: number
): LifecycleTeamProfile | null {
  if (rows.length < minimumGames) return null;
  const opponentRows = rows.flatMap((row) => {
    const opponent = byGameTeam.get(`${row.game_id}:${normalizeScheduleTeam(row.opponent)}`);
    return opponent ? [opponent] : [];
  });
  if (opponentRows.length < minimumGames) return null;
  return {
    games: rows.length,
    offenseEpa: weightedAverage(rows, "epa_per_play")!,
    offenseSuccess: weightedAverage(rows, "success_rate")!,
    offenseExplosive: weightedAverage(rows, "explosive_rate")!,
    defenseEpaAllowed: weightedAverage(opponentRows, "epa_per_play")!,
    defenseSuccessAllowed: weightedAverage(opponentRows, "success_rate")!,
    defenseExplosiveAllowed: weightedAverage(opponentRows, "explosive_rate")!,
    turnoverRate: weightedAverage(rows, "turnover_rate")!,
    secondsPerPlay: weightedAverage(rows, "seconds_per_play") ?? structuralConfig.matchupEvidence.coefficientFeatureScaling.centers.secondsPerPlay,
    proe: weightedAverage(rows, "pass_rate_over_expectation") ?? structuralConfig.matchupEvidence.coefficientFeatureScaling.centers.proe
  };
}

function lifecycleContext(away: LifecycleTeamProfile, home: LifecycleTeamProfile): LifecycleTeamContext {
  const scaling = structuralConfig.matchupEvidence.coefficientFeatureScaling;
  const clip = (value: number) => Math.max(-scaling.clip, Math.min(scaling.clip, value));
  const homeEpa = home.offenseEpa + away.defenseEpaAllowed - scaling.centers.epaPerPlay;
  const awayEpa = away.offenseEpa + home.defenseEpaAllowed - scaling.centers.epaPerPlay;
  const homeSuccess = home.offenseSuccess + away.defenseSuccessAllowed - scaling.centers.successRate;
  const awaySuccess = away.offenseSuccess + home.defenseSuccessAllowed - scaling.centers.successRate;
  const homeExplosive = home.offenseExplosive + away.defenseExplosiveAllowed - scaling.centers.explosiveRate;
  const awayExplosive = away.offenseExplosive + home.defenseExplosiveAllowed - scaling.centers.explosiveRate;
  return {
    sideMatchupEpa: clip((homeEpa - awayEpa) / scaling.epaPerPlay),
    sideMatchupSuccess: clip((homeSuccess - awaySuccess) / scaling.successRate),
    sideMatchupExplosive: clip((homeExplosive - awayExplosive) / scaling.explosiveRate),
    sideBallSecurity: clip((away.turnoverRate - home.turnoverRate) / scaling.turnoverRate),
    totalEpaEnvironment: clip(((homeEpa + awayEpa) / 2 - scaling.centers.epaPerPlay) / scaling.epaPerPlay),
    totalSuccessEnvironment: clip(((homeSuccess + awaySuccess) / 2 - scaling.centers.successRate) / scaling.successRate),
    totalExplosiveEnvironment: clip(((homeExplosive + awayExplosive) / 2 - scaling.centers.explosiveRate) / scaling.explosiveRate),
    totalTurnoverEnvironment: clip((scaling.centers.turnoverRate - (home.turnoverRate + away.turnoverRate) / 2) / scaling.turnoverRate),
    totalPaceEnvironment: clip((scaling.centers.secondsPerPlay - (home.secondsPerPlay + away.secondsPerPlay) / 2) / scaling.secondsPerPlay),
    totalProeEnvironment: clip(((home.proe + away.proe) / 2 - scaling.centers.proe) / scaling.proe)
  };
}

export function buildLifecycleTeamContexts(
  games: readonly LifecycleContextGame[],
  features: readonly LifecycleTeamFeatureRow[],
  options: { minimumGames?: number; windowGames?: number } = {}
): Map<string, LifecycleTeamContext> {
  const minimumGames = options.minimumGames ?? structuralConfig.matchupEvidence.minimumTrainingGames;
  const windowGames = options.windowGames ?? structuralConfig.matchupEvidence.windowGames;
  const byTeam = new Map<string, LifecycleTeamFeatureRow[]>();
  const byGameTeam = new Map<string, LifecycleTeamFeatureRow>();
  for (const row of features) {
    const team = normalizeScheduleTeam(row.team);
    byTeam.set(team, [...(byTeam.get(team) ?? []), row]);
    byGameTeam.set(`${row.game_id}:${team}`, row);
  }
  for (const rows of byTeam.values()) {
    rows.sort((left, right) => right.season - left.season || right.week - left.week || right.game_date.localeCompare(left.game_date));
  }
  const output = new Map<string, LifecycleTeamContext>();
  for (const game of games) {
    const profile = (team: string) => lifecycleProfile(
      (byTeam.get(normalizeScheduleTeam(team)) ?? []).filter((row) => beforeForecast(row, game)).slice(0, windowGames),
      byGameTeam,
      minimumGames
    );
    const away = profile(game.away_team);
    const home = profile(game.home_team);
    if (!away || !home || away.games < minimumGames || home.games < minimumGames) continue;
    output.set(game.game_id, lifecycleContext(away, home));
  }
  return output;
}

function fairFirst(first: number | null, second: number | null, fallback = 0.5): number {
  if (first === null || second === null) return fallback;
  try {
    return powerDevig(first, second).probabilities[0];
  } catch {
    return fallback;
  }
}

function logit(probability: number): number {
  const bounded = Math.max(0.02, Math.min(0.98, probability));
  return Math.log(bounded / (1 - bounded));
}

export function buildLifecycleForecastRow(input: {
  season: number;
  week: number;
  market: "spread" | "total" | "moneyline";
  marketProbability: number;
  expectedHomeMargin: number;
  totalLine: number | null;
  awayRest: number | null;
  homeRest: number | null;
  isHomeSide: boolean;
  teamContext?: LifecycleTeamContext | null;
}): Pick<ModelTrainingRow, "season" | "market" | "features"> {
  const sideMarket = input.market === "spread" || input.market === "moneyline";
  const totalMarket = input.market === "total";
  const context = input.teamContext;
  return {
    season: input.season,
    market: input.market,
    features: {
      expectedHomeMargin: input.expectedHomeMargin / 14,
      restDelta: ((input.homeRest ?? 7) - (input.awayRest ?? 7)) / 7,
      totalEnvironment: ((input.totalLine ?? 44) - 44) / 10,
      marketLogit: logit(input.marketProbability),
      isHomeSide: input.isHomeSide ? 1 : 0,
      sideMatchupEpa: sideMarket ? context?.sideMatchupEpa ?? 0 : 0,
      sideMatchupSuccess: sideMarket ? context?.sideMatchupSuccess ?? 0 : 0,
      sideMatchupExplosive: sideMarket ? context?.sideMatchupExplosive ?? 0 : 0,
      sideBallSecurity: sideMarket ? context?.sideBallSecurity ?? 0 : 0,
      totalEpaEnvironment: totalMarket ? context?.totalEpaEnvironment ?? 0 : 0,
      totalSuccessEnvironment: totalMarket ? context?.totalSuccessEnvironment ?? 0 : 0,
      totalExplosiveEnvironment: totalMarket ? context?.totalExplosiveEnvironment ?? 0 : 0,
      totalTurnoverEnvironment: totalMarket ? context?.totalTurnoverEnvironment ?? 0 : 0,
      totalPaceEnvironment: totalMarket ? context?.totalPaceEnvironment ?? 0 : 0,
      totalProeEnvironment: totalMarket ? context?.totalProeEnvironment ?? 0 : 0
    }
  };
}

function seasonWeight(season: number, latestSeason: number): number {
  const era = eraConfig.eras.find((candidate) => candidate.season === season) as { trainingMultiplier?: number } | undefined;
  return 0.5 ** ((latestSeason - season) / structuralConfig.model.decayHalfLifeSeasons) * (era?.trainingMultiplier ?? 1);
}

export function buildLifecycleTrainingRows(
  games: readonly LifecycleGameRow[],
  latestSeason: number,
  contexts: ReadonlyMap<string, LifecycleTeamContext> = new Map()
): ModelTrainingRow[] {
  return games.flatMap<ModelTrainingRow>((game) => {
    const weight = seasonWeight(game.season, latestSeason);
    const homeSpreadFair = fairFirst(game.home_spread_odds, game.away_spread_odds);
    const teamContext = contexts.get(game.game_id) ?? null;
    const rows: ModelTrainingRow[] = [{
      id: `${game.game_id}:spread`,
      season: game.season,
      week: game.week,
      market: "spread",
      outcome: game.result > game.spread_line ? 1 : 0,
      push: game.result === game.spread_line,
      weight,
      features: buildLifecycleForecastRow({
        season: game.season,
        week: game.week,
        market: "spread",
        marketProbability: homeSpreadFair,
        expectedHomeMargin: game.spread_line,
        totalLine: game.total_line,
        awayRest: game.away_rest,
        homeRest: game.home_rest,
        isHomeSide: true,
        teamContext
      }).features
    }];
    if (game.total !== null && game.total_line !== null) {
      const overFair = fairFirst(game.over_odds, game.under_odds);
      rows.push({
        id: `${game.game_id}:total`,
        season: game.season,
        week: game.week,
        market: "total",
        outcome: game.total > game.total_line ? 1 : 0,
        push: game.total === game.total_line,
        weight,
        features: buildLifecycleForecastRow({
          season: game.season,
          week: game.week,
          market: "total",
          marketProbability: overFair,
          expectedHomeMargin: game.spread_line,
          totalLine: game.total_line,
          awayRest: game.away_rest,
          homeRest: game.home_rest,
          isHomeSide: false,
          teamContext
        }).features
      });
    }
    if (game.result !== 0) {
      const homeMoneylineFair = fairFirst(game.home_moneyline, game.away_moneyline, 1 / (1 + Math.exp(-game.spread_line / 6.5)));
      rows.push({
        id: `${game.game_id}:moneyline`,
        season: game.season,
        week: game.week,
        market: "moneyline",
        outcome: game.result > 0 ? 1 : 0,
        push: false,
        weight,
        features: buildLifecycleForecastRow({
          season: game.season,
          week: game.week,
          market: "moneyline",
          marketProbability: homeMoneylineFair,
          expectedHomeMargin: game.spread_line,
          totalLine: game.total_line,
          awayRest: game.away_rest,
          homeRest: game.home_rest,
          isHomeSide: true,
          teamContext
        }).features
      });
    }
    return rows;
  });
}

function evaluationSeasons(rows: readonly ModelTrainingRow[], latestCompletedSeason: number): number[] {
  const observed = new Set(rows.map((row) => row.season));
  return [latestCompletedSeason - 2, latestCompletedSeason - 1, latestCompletedSeason]
    .filter((season) => observed.has(season));
}

export function fitWalkForwardModels(
  rows: ModelTrainingRow[],
  latestCompletedSeason: number,
  featureNames = designFeatureNames(rows)
): Record<string, FittedLogisticModel> {
  return Object.fromEntries(evaluationSeasons(rows, latestCompletedSeason).map((season) => {
    const training = rows.filter((row) => row.season < season);
    if (!training.length) throw new Error(`Walk-forward origin ${season} has no prior training rows`);
    return [String(season), fitWeightedLogistic(training, { featureNames, iterations: 60 })];
  }));
}

export function evaluateWalkForwardModels(
  rows: ModelTrainingRow[],
  latestCompletedSeason: number,
  models: Record<string, FittedLogisticModel>
): ModelMetrics {
  const predictions = evaluationSeasons(rows, latestCompletedSeason).flatMap((season) => {
    const model = models[String(season)];
    if (!model) throw new Error(`Champion is missing walk-forward origin ${season}`);
    return rows.filter((row) => row.season === season && !row.push).map((row) => ({
      market: row.market,
      probability: predictProbability(model, row),
      outcome: row.outcome,
      weight: row.weight
    }));
  });
  return evaluateProbabilityRows(predictions);
}

export function fitLifecycleChallenger(rows: ModelTrainingRow[], latestCompletedSeason: number): {
  model: FittedLogisticModel;
  walkForwardModels: Record<string, FittedLogisticModel>;
  metrics: ModelMetrics;
} {
  const featureNames = designFeatureNames(rows);
  const model = fitWeightedLogistic(rows, { featureNames, iterations: 100 });
  const walkForwardModels = fitWalkForwardModels(rows, latestCompletedSeason, featureNames);
  return { model, walkForwardModels, metrics: evaluateWalkForwardModels(rows, latestCompletedSeason, walkForwardModels) };
}
