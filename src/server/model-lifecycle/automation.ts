import { eraConfig, structuralConfig } from "@/domain/config";
import { stableHash } from "@/domain/hash";
import { runPromotionGate, updateTeamStates } from "@/domain/model-lifecycle";
import { designFeatureNames, fitWeightedLogistic, type FittedLogisticModel, type ModelTrainingRow } from "@/domain/model-fit";
import { normalizeNflverseTeam } from "@/domain/decision-board";
import type { CompletedGame, RollingFeatures, TeamState } from "@/domain/types";
import {
  ensureModelLifecycleStore,
  getModelArtifact,
  getModelLifecycleState,
  publishModelSystemAlert,
  publishLoopA,
  publishLoopB,
  resolveModelSystemAlerts,
  type StoredModelArtifact
} from "./store";
import {
  buildLifecycleTeamContexts,
  buildLifecycleTrainingRows,
  evaluateWalkForwardModels,
  fitLifecycleChallenger,
  type LifecycleGameRow,
  type LifecycleTeamFeatureRow
} from "./training";

interface CompletedGameRow extends LifecycleGameRow {
  game_date: string;
  away_team: string;
  home_team: string;
}

type FeatureRow = LifecycleTeamFeatureRow;

export interface ModelLifecycleAutomationResult {
  status: "updated" | "skipped" | "aborted";
  throughWeek: number;
  targetWeek: number;
  loopA: "updated" | "skipped";
  loopB: "promoted" | "retained" | "skipped";
  championHash: string | null;
  message: string | null;
}

function pacificParts(now: Date): { weekday: string; hour: number; minute: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { weekday: parts.weekday, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function leagueMean(rows: readonly FeatureRow[], field: "turnover_rate" | "seconds_per_play" | "pass_rate_over_expectation"): number {
  let weight = 0;
  let total = 0;
  for (const row of rows) {
    const value = row[field];
    if (value === null || !Number.isFinite(value)) continue;
    weight += row.plays;
    total += value * row.plays;
  }
  return weight ? total / weight : 0;
}

export function aggregateRollingFeatureStates(rows: readonly FeatureRow[], season: number, throughWeek: number): RollingFeatures[] {
  const ordered = [...rows].sort((left, right) => right.season - left.season || right.week - left.week);
  const leagueTurnovers = leagueMean(ordered, "turnover_rate");
  const leaguePace = leagueMean(ordered, "seconds_per_play");
  const leagueProe = leagueMean(ordered, "pass_rate_over_expectation");
  const byTeam = new Map<string, FeatureRow[]>();
  for (const row of ordered) {
    const team = normalizeNflverseTeam(row.team);
    const current = byTeam.get(team) ?? [];
    if (current.length < 17) current.push(row);
    byTeam.set(team, current);
  }
  return [...byTeam.entries()].map(([team, games]) => {
    const plays = games.reduce((sum, game) => sum + game.plays, 0);
    const weighted = (field: "epa_per_play" | "success_rate" | "explosive_rate") =>
      games.reduce((sum, game) => sum + game[field] * game.plays, 0) / Math.max(1, plays);
    const paceRows = games.filter((game) => game.seconds_per_play !== null);
    const proeRows = games.filter((game) => game.pass_rate_over_expectation !== null);
    const pacePlays = paceRows.reduce((sum, game) => sum + game.plays, 0);
    const proePlays = proeRows.reduce((sum, game) => sum + game.plays, 0);
    const turnovers = games.reduce((sum, game) => sum + game.turnover_rate * game.plays, 0);
    return {
      team,
      season,
      throughWeek,
      epa: weighted("epa_per_play"),
      successRate: weighted("success_rate"),
      explosiveRate: weighted("explosive_rate"),
      regressedTurnovers: (turnovers + leagueTurnovers * 200) / Math.max(1, plays + 200),
      pace: pacePlays ? paceRows.reduce((sum, game) => sum + game.seconds_per_play! * game.plays, 0) / pacePlays : leaguePace,
      proe: proePlays ? proeRows.reduce((sum, game) => sum + game.pass_rate_over_expectation! * game.plays, 0) / proePlays : leagueProe
    };
  }).sort((left, right) => left.team.localeCompare(right.team));
}

export function missingLifecycleFeatureSeasons(
  games: readonly Pick<LifecycleGameRow, "game_id" | "season" | "away_team" | "home_team">[],
  features: readonly Pick<LifecycleTeamFeatureRow, "game_id" | "season" | "team">[]
): number[] {
  const expected = new Map<number, Set<string>>();
  const covered = new Map<number, Set<string>>();
  for (const game of games) {
    const contracts = expected.get(game.season) ?? new Set<string>();
    contracts.add(`${game.game_id}:${normalizeNflverseTeam(game.away_team)}`);
    contracts.add(`${game.game_id}:${normalizeNflverseTeam(game.home_team)}`);
    expected.set(game.season, contracts);
  }
  for (const feature of features) {
    const contracts = covered.get(feature.season) ?? new Set<string>();
    contracts.add(`${feature.game_id}:${normalizeNflverseTeam(feature.team)}`);
    covered.set(feature.season, contracts);
  }
  return [...expected.entries()]
    .filter(([season, contracts]) => [...contracts].some((contract) => !covered.get(season)?.has(contract)))
    .map(([season]) => season)
    .sort((left, right) => left - right);
}

function predictionMetricsForChampion(rows: ModelTrainingRow[], latestCompletedSeason: number, artifact: StoredModelArtifact) {
  const origins = [latestCompletedSeason - 2, latestCompletedSeason - 1, latestCompletedSeason]
    .filter((season) => rows.some((row) => row.season === season));
  const models = { ...artifact.walkForwardModels };
  for (const origin of origins) {
    if (models[String(origin)]) continue;
    const priorRows = rows.filter((row) => row.season < origin);
    if (!priorRows.length) throw new Error(`Champion has no training rows before walk-forward origin ${origin}`);
    models[String(origin)] = fitWeightedLogistic(priorRows, {
      featureNames: artifact.model.featureNames,
      regularization: artifact.model.regularization,
      iterations: 60
    });
  }
  return evaluateWalkForwardModels(rows, latestCompletedSeason, models);
}

export async function runModelLifecycleAutomation(input: {
  db: D1Database;
  now?: Date;
  force?: boolean;
}): Promise<ModelLifecycleAutomationResult> {
  const now = input.now ?? new Date();
  const season = structuralConfig.season;
  const startedAt = now.toISOString();
  await ensureModelLifecycleStore(input.db);
  const importState = await input.db.prepare("SELECT freshness, last_success_at FROM nflverse_import_state WHERE dataset = 'schedules:history'")
    .first<{ freshness: string; last_success_at: string | null }>();
  if (!importState?.last_success_at || importState.freshness === "stale" || importState.freshness === "unavailable") {
    return { status: "aborted", throughWeek: 0, targetWeek: 1, loopA: "skipped", loopB: "skipped", championHash: null, message: "Historical nflverse schedule snapshot is not current" };
  }
  const completed = await input.db.prepare(`SELECT game_id, season, week, game_date, away_team, home_team,
      result, total, spread_line, total_line, away_rest, home_rest, away_moneyline, home_moneyline,
      away_spread_odds, home_spread_odds, under_odds, over_odds
    FROM nfl_games
    WHERE season BETWEEN ? AND ? AND season_type = 'REG' AND result IS NOT NULL AND spread_line IS NOT NULL
      AND (season < ? OR game_date <= ?)
    ORDER BY season, week, game_date, game_id`)
    .bind(structuralConfig.model.trainingStartSeason, season, season, startedAt.slice(0, 10)).all<CompletedGameRow>();
  if (!completed.results.length) {
    return { status: "aborted", throughWeek: 0, targetWeek: 1, loopA: "skipped", loopB: "skipped", championHash: null, message: "No completed leakage-safe games are available" };
  }
  const currentSeasonGames = completed.results.filter((game) => game.season === season);
  const throughWeek = currentSeasonGames.length ? Math.max(...currentSeasonGames.map((game) => game.week)) : 0;
  const targetWeek = Math.min(18, throughWeek + 1);
  const lifecycle = await getModelLifecycleState(input.db, season);
  const clock = pacificParts(now);
  const initialize = !lifecycle?.championHash;
  const tuesday = clock.weekday === "Tue";
  const loopADue = input.force || initialize || (tuesday && (clock.hour > 6 || clock.hour === 6 && clock.minute >= 30) && (lifecycle?.loopAThroughWeek ?? -1) < throughWeek);
  const loopBDue = input.force || initialize || (tuesday && clock.hour >= 7 && (lifecycle?.loopBTargetWeek ?? -1) < targetWeek);
  let loopA: ModelLifecycleAutomationResult["loopA"] = "skipped";
  let loopB: ModelLifecycleAutomationResult["loopB"] = "skipped";
  let championHash = lifecycle?.championHash ?? null;

  if (loopADue) {
    const completedGames: CompletedGame[] = completed.results.map((game) => ({
      gameId: game.game_id,
      season: game.season,
      week: game.week,
      homeTeam: normalizeNflverseTeam(game.home_team),
      awayTeam: normalizeNflverseTeam(game.away_team),
      actualHomeMargin: game.result,
      consensusHomeExpectedMargin: game.spread_line,
      completedAt: game.game_date
    }));
    const states: TeamState[] = updateTeamStates([], completedGames, structuralConfig.model.strengthK)
      .map((state) => ({ ...state, throughWeek }));
    const featuresResult = await input.db.prepare(`SELECT game_id, season, week, game_date, team, opponent, plays,
        epa_per_play, success_rate, explosive_rate, turnover_rate, seconds_per_play, pass_rate_over_expectation
      FROM nfl_team_game_features
      WHERE season_type = 'REG' AND (season < ? OR (season = ? AND week <= ?))
      ORDER BY season DESC, week DESC, game_date DESC`)
      .bind(season, season, throughWeek).all<FeatureRow>();
    const features = aggregateRollingFeatureStates(featuresResult.results, season, throughWeek);
    if (features.length < 28) throw new Error("Loop A aborted: rolling feature import is incomplete");
    const stateHash = stableHash({ completedGames, features, k: structuralConfig.model.strengthK });
    await publishLoopA({ db: input.db, season, throughWeek, states, features, stateHash, updatedAt: startedAt });
    loopA = "updated";
  }

  if (loopBDue) {
    const latestCompletedSeason = Math.max(...completed.results.map((game) => game.season));
    const trainingFeatures = await input.db.prepare(`SELECT game_id, season, week, game_date, team, opponent, plays,
        epa_per_play, success_rate, explosive_rate, turnover_rate, seconds_per_play, pass_rate_over_expectation
      FROM nfl_team_game_features
      WHERE season_type = 'REG' AND season BETWEEN ? AND ?
        AND (season < ? OR (season = ? AND week <= ?))
      ORDER BY season, week, game_date, game_id, team`)
      .bind(structuralConfig.model.trainingStartSeason, season, season, season, throughWeek).all<FeatureRow>();
    const missingFeatureSeasons = missingLifecycleFeatureSeasons(completed.results, trainingFeatures.results);
    if (missingFeatureSeasons.length) {
      const message = `Loop B retained the champion: leakage-safe team features are still backfilling for ${missingFeatureSeasons.join(", ")}`;
      await publishModelSystemAlert(input.db, {
        id: `model-feature-coverage:${season}:week${targetWeek}`,
        type: "pipeline_failure",
        severity: "warning",
        message,
        idempotencyKey: `model-feature-coverage:${season}:week${targetWeek}`,
        createdAt: startedAt,
        acknowledgedAt: null
      });
      return {
        status: "aborted",
        throughWeek,
        targetWeek,
        loopA,
        loopB: "skipped",
        championHash,
        message
      };
    }
    const teamContexts = buildLifecycleTeamContexts(completed.results, trainingFeatures.results);
    const rows = buildLifecycleTrainingRows(completed.results, latestCompletedSeason, teamContexts);
    if (rows.length < 3_000) throw new Error("Loop B aborted: model training rows are incomplete");
    const challenger = fitLifecycleChallenger(rows, Math.min(latestCompletedSeason, season - 1));
    const dataHash = stableHash(rows.map((row) => ({ id: row.id, outcome: row.outcome, push: row.push, weight: row.weight, features: row.features })));
    const configHash = stableHash({ structuralConfig, eraConfig });
    const featureSchemaHash = stableHash(designFeatureNames(rows));
    const codeHash = stableHash("nfl-projection-lab:model-lifecycle:2026.2");
    const artifact: StoredModelArtifact = {
      model: challenger.model,
      walkForwardModels: challenger.walkForwardModels,
      trainingThroughSeason: latestCompletedSeason,
      trainingThroughWeek: latestCompletedSeason === season ? throughWeek : 18
    };
    const challengerHash = stableHash({ artifact, dataHash, configHash, featureSchemaHash, codeHash });
    const existingChampion = championHash ? await getModelArtifact(input.db, championHash) : null;
    let bootstrapVersion: { hash: string; artifact: StoredModelArtifact; metrics: ReturnType<typeof evaluateWalkForwardModels> } | undefined;
    if (!championHash || !existingChampion) {
      const featureNames = designFeatureNames(rows);
      const marketIndex = featureNames.indexOf("marketLogit");
      const baselineModel: FittedLogisticModel = {
        featureNames,
        coefficients: featureNames.map((_, index) => index === marketIndex ? 1 : 0),
        regularization: 0,
        trainingRows: 0
      };
      const baselineArtifact: StoredModelArtifact = {
        model: baselineModel,
        walkForwardModels: Object.fromEntries(Object.keys(challenger.walkForwardModels).map((origin) => [origin, baselineModel])),
        trainingThroughSeason: structuralConfig.model.trainingStartSeason - 1,
        trainingThroughWeek: 0
      };
      const baselineMetrics = evaluateWalkForwardModels(rows, Math.min(latestCompletedSeason, season - 1), baselineArtifact.walkForwardModels);
      const baselineHash = stableHash({ baselineArtifact, configHash, featureSchemaHash, codeHash, type: "power-devigged-market-baseline" });
      bootstrapVersion = { hash: baselineHash, artifact: baselineArtifact, metrics: baselineMetrics };
      championHash = baselineHash;
    }
    const champion = existingChampion ?? (bootstrapVersion ? { artifact: bootstrapVersion.artifact, metrics: bootstrapVersion.metrics } : null);
    if (!champion || !championHash) throw new Error("Loop B could not establish a logged champion");
    const championMetrics = await predictionMetricsForChampion(rows, Math.min(latestCompletedSeason, season - 1), champion.artifact);
    const completedAt = new Date().toISOString();
    const gated = runPromotionGate({
      runId: `model:${season}:week${targetWeek}:${dataHash.slice(0, 12)}`,
      championHash: championHash ?? challengerHash,
      challengerHash,
      championMetrics,
      challengerMetrics: challenger.metrics,
      dataHash,
      configHash,
      featureSchemaHash,
      codeHash,
      startedAt,
      completedAt,
      tolerance: structuralConfig.model.promotionLogLossTolerance,
      calibrationSlopeRange: structuralConfig.model.promotionCalibrationSlope as [number, number]
    });
    await publishLoopB({
      db: input.db,
      season,
      targetWeek,
      challengerHash,
      artifact,
      challengerMetrics: challenger.metrics,
      run: gated.run,
      alert: gated.alert,
      retainedChampionHash: championHash,
      bootstrapVersion
    });
    await resolveModelSystemAlerts(input.db, `model-feature-coverage:${season}:`, completedAt);
    if (gated.run.gateDecision === "promote") championHash = challengerHash;
    loopB = gated.run.gateDecision === "promote" ? "promoted" : "retained";
  }

  return {
    status: loopA === "updated" || loopB !== "skipped" ? "updated" : "skipped",
    throughWeek,
    targetWeek,
    loopA,
    loopB,
    championHash,
    message: null
  };
}
