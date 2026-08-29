import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique
} from "drizzle-orm/sqlite-core";

// Migration-backed confidence and model-gate tables that predate the Engine OS
// schema module.
export const sourceSnapshotManifest = sqliteTable("source_snapshot_manifest", {
  sourceHash: text("source_hash").primaryKey(),
  provider: text("provider").notNull(),
  dataset: text("dataset").notNull(),
  sourceRecordId: text("source_record_id").notNull(),
  observationKind: text("observation_kind").notNull(),
  publishedAt: text("published_at").notNull(),
  capturedAt: text("captured_at").notNull(),
  validAt: text("valid_at").notNull(),
  validTo: text("valid_to"),
  schemaVersion: text("schema_version").notNull(),
  importRunId: text("import_run_id").notNull(),
  license: text("license").notNull(),
  freshness: text("freshness").notNull(),
  sourceUrl: text("source_url"),
  observationJson: text("observation_json").notNull(),
  createdAt: text("created_at").notNull(),
  providerUpdatedAt: text("provider_updated_at"),
  requestedAt: text("requested_at").notNull().default(""),
  receivedAt: text("received_at").notNull().default(""),
  availabilityBasis: text("availability_basis").notNull().default("received_only")
});

export const pointInTimeFeatureRows = sqliteTable("point_in_time_feature_rows", {
  rowHash: text("row_hash").primaryKey(),
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  forecastAt: text("forecast_at").notNull(),
  maximumSourceTime: text("maximum_source_time").notNull(),
  gameDataThroughSeason: integer("game_data_through_season").notNull(),
  gameDataThroughWeek: integer("game_data_through_week").notNull(),
  upstreamSnapshotHash: text("upstream_snapshot_hash").notNull(),
  transformationVersion: text("transformation_version").notNull(),
  imputationPolicy: text("imputation_policy").notNull(),
  featuresJson: text("features_json").notNull(),
  observationHashesJson: text("observation_hashes_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const confidenceForecastArtifacts = sqliteTable("confidence_forecast_artifacts", {
  forecastHash: text("forecast_hash").primaryKey(),
  gameId: text("game_id").notNull(),
  sourceGameId: text("source_game_id").notNull(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  forecastHorizon: text("forecast_horizon").notNull(),
  generatedAt: text("generated_at").notNull(),
  modelFamily: text("model_family").notNull(),
  modelHash: text("model_hash").notNull(),
  configHash: text("config_hash").notNull(),
  dataHash: text("data_hash").notNull(),
  featureRowHash: text("feature_row_hash").notNull()
    .references(() => pointInTimeFeatureRows.rowHash),
  distributionJson: text("distribution_json").notNull(),
  mainlineJson: text("mainline_json").notNull(),
  dossierJson: text("dossier_json").notNull(),
  homeSpreadPoint: real("home_spread_point").notNull(),
  totalPoint: real("total_point").notNull(),
  marketHomeWinProbability: real("market_home_win_probability").notNull(),
  marketHomeCoverProbability: real("market_home_cover_probability").notNull(),
  marketOverProbability: real("market_over_probability").notNull(),
  quoteFresh: integer("quote_fresh").notNull(),
  settledAt: text("settled_at")
}, (table) => [
  index("idx_confidence_forecasts_game_time").on(table.gameId, table.generatedAt),
  index("idx_confidence_forecasts_horizon").on(table.season, table.week, table.forecastHorizon)
]);

export const confidenceModelRegistry = sqliteTable("confidence_model_registry", {
  modelHash: text("model_hash").primaryKey(),
  family: text("family").notNull(),
  status: text("status").notNull(),
  configHash: text("config_hash").notNull(),
  artifactJson: text("artifact_json").notNull(),
  registeredAt: text("registered_at").notNull()
});

export const confidenceForecastEvaluations = sqliteTable("confidence_forecast_evaluations", {
  forecastHash: text("forecast_hash").primaryKey()
    .references(() => confidenceForecastArtifacts.forecastHash),
  gameId: text("game_id").notNull(),
  actualHomeScore: integer("actual_home_score").notNull(),
  actualAwayScore: integer("actual_away_score").notNull(),
  evaluationJson: text("evaluation_json").notNull(),
  evaluatedAt: text("evaluated_at").notNull()
}, (table) => [
  index("idx_confidence_evaluations_time").on(table.evaluatedAt)
]);

export const confidenceExperimentRegistry = sqliteTable("confidence_experiment_registry", {
  experimentId: text("experiment_id").primaryKey(),
  registryHash: text("registry_hash").notNull(),
  status: text("status").notNull(),
  experimentJson: text("experiment_json").notNull(),
  registeredAt: text("registered_at").notNull()
}, (table) => [unique().on(table.registryHash)]);

export const confidenceExperimentDecisions = sqliteTable("confidence_experiment_decisions", {
  decisionHash: text("decision_hash").primaryKey(),
  experimentId: text("experiment_id").notNull()
    .references(() => confidenceExperimentRegistry.experimentId),
  decision: text("decision").notNull(),
  decisionJson: text("decision_json").notNull(),
  decidedAt: text("decided_at").notNull()
});

export const confidenceHumanAdjustments = sqliteTable("confidence_human_adjustments", {
  adjustmentHash: text("adjustment_hash").primaryKey(),
  forecastHash: text("forecast_hash").notNull()
    .references(() => confidenceForecastArtifacts.forecastHash),
  adjustmentJson: text("adjustment_json").notNull(),
  trainingEligible: integer("training_eligible").notNull(),
  createdAt: text("created_at").notNull()
}, (table) => [
  check("confidence_human_adjustments_training_check", sql`${table.trainingEligible} = 0`)
]);

export const confidenceResearchAnswers = sqliteTable("confidence_research_answers", {
  answerHash: text("answer_hash").primaryKey(),
  questionId: text("question_id").notNull(),
  decision: text("decision").notNull(),
  answerJson: text("answer_json").notNull(),
  recordedAt: text("recorded_at").notNull()
});

export const confidenceEngineAlerts = sqliteTable("confidence_engine_alerts", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at")
}, (table) => [unique().on(table.idempotencyKey)]);

export const modelRunLog = sqliteTable("model_run_log", {
  id: text("id").primaryKey(),
  championHash: text("champion_hash").notNull(),
  challengerHash: text("challenger_hash").notNull(),
  championMetricsJson: text("champion_metrics_json").notNull(),
  challengerMetricsJson: text("challenger_metrics_json").notNull(),
  gateDecision: text("gate_decision").notNull(),
  dataHash: text("data_hash").notNull(),
  configHash: text("config_hash").notNull(),
  featureSchemaHash: text("feature_schema_hash").notNull(),
  codeHash: text("code_hash").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
  promotedAt: text("promoted_at"),
  pairedImprovement: real("paired_improvement").notNull().default(0),
  pairedIntervalJson: text("paired_interval_json").notNull().default("[0,0]"),
  pairedBlocks: integer("paired_blocks").notNull().default(0)
}, (table) => [
  index("idx_model_runs_completed").on(table.completedAt)
]);

// Tables adopted from runtime initialization by migration 0019.
export const playStateAudit = sqliteTable("play_state_audit", {
  id: text("id").primaryKey(),
  playId: text("play_id").notNull(),
  transition: text("transition").notNull(),
  reason: text("reason").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  changedAt: text("changed_at").notNull()
}, (table) => [
  index("idx_play_state_audit_play").on(table.playId, table.changedAt)
]);

export const playClvAudit = sqliteTable("play_clv_audit", {
  playId: text("play_id").primaryKey(),
  referenceBook: text("reference_book"),
  clvCents: real("clv_cents"),
  clvPoints: real("clv_points"),
  syntheticClosingAmerican: real("synthetic_closing_american"),
  detailJson: text("detail_json").notNull(),
  calculatedAt: text("calculated_at").notNull(),
  source: text("source").notNull()
});

export const playCorrectionAudit = sqliteTable("play_correction_audit", {
  id: text("id").primaryKey(),
  playId: text("play_id").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason").notNull(),
  beforeResult: text("before_result").notNull(),
  beforeProfitCents: integer("before_profit_cents").notNull(),
  afterResult: text("after_result").notNull(),
  afterProfitCents: integer("after_profit_cents").notNull(),
  correctedAt: text("corrected_at").notNull()
});

export const modelLifecycleState = sqliteTable("model_lifecycle_state", {
  season: integer("season").primaryKey(),
  loopAThroughWeek: integer("loop_a_through_week").notNull().default(-1),
  loopAHash: text("loop_a_hash"),
  loopBTargetWeek: integer("loop_b_target_week").notNull().default(-1),
  championHash: text("champion_hash"),
  lastLoopAAt: text("last_loop_a_at"),
  lastLoopBAt: text("last_loop_b_at")
});

export const teamStrengthStates = sqliteTable("team_strength_states", {
  season: integer("season").notNull(),
  team: text("team").notNull(),
  mean: real("mean").notNull(),
  variance: real("variance").notNull(),
  throughWeek: integer("through_week").notNull(),
  stateHash: text("state_hash").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [primaryKey({ columns: [table.season, table.team] })]);

export const teamStrengthStatesStage = sqliteTable("team_strength_states_stage", {
  runId: text("run_id").notNull(),
  season: integer("season").notNull(),
  team: text("team").notNull(),
  mean: real("mean").notNull(),
  variance: real("variance").notNull(),
  throughWeek: integer("through_week").notNull(),
  stateHash: text("state_hash").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [primaryKey({ columns: [table.runId, table.season, table.team] })]);

export const rollingFeatureStates = sqliteTable("rolling_feature_states", {
  season: integer("season").notNull(),
  team: text("team").notNull(),
  throughWeek: integer("through_week").notNull(),
  epa: real("epa").notNull(),
  successRate: real("success_rate").notNull(),
  explosiveRate: real("explosive_rate").notNull(),
  regressedTurnovers: real("regressed_turnovers").notNull(),
  pace: real("pace").notNull(),
  proe: real("proe").notNull(),
  stateHash: text("state_hash").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [primaryKey({ columns: [table.season, table.team] })]);

export const rollingFeatureStatesStage = sqliteTable("rolling_feature_states_stage", {
  runId: text("run_id").notNull(),
  season: integer("season").notNull(),
  team: text("team").notNull(),
  throughWeek: integer("through_week").notNull(),
  epa: real("epa").notNull(),
  successRate: real("success_rate").notNull(),
  explosiveRate: real("explosive_rate").notNull(),
  regressedTurnovers: real("regressed_turnovers").notNull(),
  pace: real("pace").notNull(),
  proe: real("proe").notNull(),
  stateHash: text("state_hash").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [primaryKey({ columns: [table.runId, table.season, table.team] })]);

export const modelVersions = sqliteTable("model_versions", {
  versionHash: text("version_hash").primaryKey(),
  status: text("status").notNull(),
  modelJson: text("model_json").notNull(),
  metricsJson: text("metrics_json").notNull(),
  trainingThroughSeason: integer("training_through_season").notNull(),
  trainingThroughWeek: integer("training_through_week").notNull(),
  dataHash: text("data_hash").notNull(),
  configHash: text("config_hash").notNull(),
  featureSchemaHash: text("feature_schema_hash").notNull(),
  codeHash: text("code_hash").notNull(),
  createdAt: text("created_at").notNull(),
  promotedAt: text("promoted_at")
}, (table) => [index("idx_model_versions_status").on(table.status, table.promotedAt)]);

export const modelSystemAlerts = sqliteTable("model_system_alerts", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: text("created_at").notNull(),
  acknowledgedAt: text("acknowledged_at")
}, (table) => [unique().on(table.idempotencyKey)]);

export const nflGamesStage = sqliteTable("nfl_games_stage", {
  importId: text("import_id").notNull(),
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  seasonType: text("season_type").notNull(),
  week: integer("week").notNull(),
  gameDate: text("game_date").notNull(),
  gameTime: text("game_time"),
  weekday: text("weekday"),
  awayTeam: text("away_team").notNull(),
  awayScore: integer("away_score"),
  homeTeam: text("home_team").notNull(),
  homeScore: integer("home_score"),
  location: text("location"),
  result: real("result"),
  total: real("total"),
  overtime: integer("overtime").notNull(),
  awayRest: integer("away_rest"),
  homeRest: integer("home_rest"),
  awayMoneyline: integer("away_moneyline"),
  homeMoneyline: integer("home_moneyline"),
  spreadLine: real("spread_line"),
  awaySpreadOdds: integer("away_spread_odds"),
  homeSpreadOdds: integer("home_spread_odds"),
  totalLine: real("total_line"),
  underOdds: integer("under_odds"),
  overOdds: integer("over_odds"),
  divisionGame: integer("division_game").notNull(),
  roof: text("roof"),
  surface: text("surface"),
  temperature: real("temperature"),
  wind: real("wind"),
  awayQbId: text("away_qb_id"),
  homeQbId: text("home_qb_id"),
  awayQbName: text("away_qb_name"),
  homeQbName: text("home_qb_name"),
  awayCoach: text("away_coach"),
  homeCoach: text("home_coach"),
  referee: text("referee"),
  stadiumId: text("stadium_id"),
  stadium: text("stadium"),
  sourceRowHash: text("source_row_hash").notNull()
}, (table) => [primaryKey({ columns: [table.importId, table.gameId] })]);

export const nflTeamGameFeaturesStage = sqliteTable("nfl_team_game_features_stage", {
  importId: text("import_id").notNull(),
  id: text("id").notNull(),
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  seasonType: text("season_type").notNull(),
  week: integer("week").notNull(),
  gameDate: text("game_date").notNull(),
  team: text("team").notNull(),
  opponent: text("opponent").notNull(),
  homeAway: text("home_away").notNull(),
  plays: integer("plays").notNull(),
  epaPerPlay: real("epa_per_play").notNull(),
  successRate: real("success_rate").notNull(),
  explosiveRate: real("explosive_rate").notNull(),
  turnovers: integer("turnovers").notNull(),
  turnoverRate: real("turnover_rate").notNull(),
  secondsPerPlay: real("seconds_per_play"),
  dropbacks: integer("dropbacks").notNull(),
  passRate: real("pass_rate").notNull(),
  expectedPassRate: real("expected_pass_rate"),
  passRateOverExpectation: real("pass_rate_over_expectation")
}, (table) => [primaryKey({ columns: [table.importId, table.id] })]);

export const nflPlayerWeekStats = sqliteTable("nfl_player_week_stats", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  playerName: text("player_name").notNull(),
  playerDisplayName: text("player_display_name").notNull(),
  position: text("position"),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  seasonType: text("season_type").notNull(),
  gameId: text("game_id").notNull(),
  team: text("team").notNull(),
  opponentTeam: text("opponent_team").notNull(),
  attempts: integer("attempts").notNull(),
  passingYards: real("passing_yards").notNull(),
  carries: integer("carries").notNull(),
  rushingYards: real("rushing_yards").notNull(),
  receptions: integer("receptions").notNull(),
  targets: integer("targets").notNull(),
  receivingYards: real("receiving_yards").notNull(),
  sourceHash: text("source_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [
  index("idx_nfl_player_stats_name").on(table.playerDisplayName, table.season, table.week),
  index("idx_nfl_player_stats_game").on(table.gameId)
]);

export const nflPlayerWeekStatsStage = sqliteTable("nfl_player_week_stats_stage", {
  importId: text("import_id").notNull(),
  id: text("id").notNull(),
  playerId: text("player_id").notNull(),
  playerName: text("player_name").notNull(),
  playerDisplayName: text("player_display_name").notNull(),
  position: text("position"),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  seasonType: text("season_type").notNull(),
  gameId: text("game_id").notNull(),
  team: text("team").notNull(),
  opponentTeam: text("opponent_team").notNull(),
  attempts: integer("attempts").notNull(),
  passingYards: real("passing_yards").notNull(),
  carries: integer("carries").notNull(),
  rushingYards: real("rushing_yards").notNull(),
  receptions: integer("receptions").notNull(),
  targets: integer("targets").notNull(),
  receivingYards: real("receiving_yards").notNull()
}, (table) => [primaryKey({ columns: [table.importId, table.id] })]);

export const nflPlayerSnapCounts = sqliteTable("nfl_player_snap_counts", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  gameType: text("game_type").notNull(),
  week: integer("week").notNull(),
  player: text("player").notNull(),
  position: text("position"),
  team: text("team").notNull(),
  opponent: text("opponent").notNull(),
  offenseSnaps: integer("offense_snaps").notNull(),
  defenseSnaps: integer("defense_snaps").notNull(),
  specialTeamsSnaps: integer("special_teams_snaps").notNull(),
  sourceHash: text("source_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [index("idx_nfl_snap_counts_game_player").on(table.gameId, table.player)]);

export const nflPlayerSnapCountsStage = sqliteTable("nfl_player_snap_counts_stage", {
  importId: text("import_id").notNull(),
  id: text("id").notNull(),
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  gameType: text("game_type").notNull(),
  week: integer("week").notNull(),
  player: text("player").notNull(),
  position: text("position"),
  team: text("team").notNull(),
  opponent: text("opponent").notNull(),
  offenseSnaps: integer("offense_snaps").notNull(),
  defenseSnaps: integer("defense_snaps").notNull(),
  specialTeamsSnaps: integer("special_teams_snaps").notNull()
}, (table) => [primaryKey({ columns: [table.importId, table.id] })]);

export const gameContextAlerts = sqliteTable("game_context_alerts", {
  id: text("id").primaryKey(),
  dataset: text("dataset").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at")
}, (table) => [index("idx_context_alerts_unresolved").on(table.resolvedAt, table.createdAt)]);

export const officialInjuryImportState = sqliteTable("official_injury_import_state", {
  dataset: text("dataset").primaryKey(),
  freshness: text("freshness").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceTag: text("source_tag"),
  sourceHash: text("source_hash"),
  rowCount: integer("row_count").notNull().default(0),
  lastCheckedAt: text("last_checked_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  leaseExpiresAt: text("lease_expires_at")
});

export const officialInjuryReports = sqliteTable("official_injury_reports", {
  id: text("id").primaryKey(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  gameId: text("game_id").notNull(),
  team: text("team").notNull(),
  player: text("player").notNull(),
  position: text("position"),
  injuries: text("injuries"),
  practiceStatus: text("practice_status"),
  gameStatus: text("game_status"),
  inactive: integer("inactive"),
  sourceUrl: text("source_url").notNull(),
  sourceTimestamp: text("source_timestamp").notNull(),
  rawSnapshotHash: text("raw_snapshot_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [
  index("idx_official_injuries_week").on(table.season, table.week, table.gameId),
  index("idx_official_injuries_team").on(table.team, table.season, table.week)
]);

export const officialInjuryReportsStage = sqliteTable("official_injury_reports_stage", {
  importId: text("import_id").notNull(),
  id: text("id").notNull(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  gameId: text("game_id").notNull(),
  team: text("team").notNull(),
  player: text("player").notNull(),
  position: text("position"),
  injuries: text("injuries"),
  practiceStatus: text("practice_status"),
  gameStatus: text("game_status"),
  sourceUrl: text("source_url").notNull(),
  sourceTimestamp: text("source_timestamp").notNull(),
  rawSnapshotHash: text("raw_snapshot_hash").notNull()
}, (table) => [primaryKey({ columns: [table.importId, table.id] })]);

export const officialPregameContextState = sqliteTable("official_pregame_context_state", {
  gameId: text("game_id").primaryKey(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  freshness: text("freshness").notNull(),
  sourceUrl: text("source_url"),
  sourceHash: text("source_hash"),
  roof: text("roof").notNull().default("unconfirmed"),
  inactivesConfirmed: integer("inactives_confirmed").notNull().default(0),
  inactiveCount: integer("inactive_count").notNull().default(0),
  lastCheckedAt: text("last_checked_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  leaseExpiresAt: text("lease_expires_at")
}, (table) => [index("idx_pregame_context_week").on(table.season, table.week, table.gameId)]);

export const officialInactives = sqliteTable("official_inactives", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  team: text("team").notNull(),
  player: text("player").notNull(),
  position: text("position"),
  sourceUrl: text("source_url").notNull(),
  sourceTimestamp: text("source_timestamp").notNull(),
  rawSnapshotHash: text("raw_snapshot_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [index("idx_official_inactives_game").on(table.gameId, table.team)]);

export const officialInactivesStage = sqliteTable("official_inactives_stage", {
  importId: text("import_id").notNull(),
  id: text("id").notNull(),
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  team: text("team").notNull(),
  player: text("player").notNull(),
  position: text("position"),
  sourceUrl: text("source_url").notNull(),
  sourceTimestamp: text("source_timestamp").notNull(),
  rawSnapshotHash: text("raw_snapshot_hash").notNull()
}, (table) => [primaryKey({ columns: [table.importId, table.id] })]);

export const officialPregameContextSnapshots = sqliteTable("official_pregame_context_snapshots", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  roof: text("roof").notNull(),
  inactiveCount: integer("inactive_count").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceTimestamp: text("source_timestamp").notNull(),
  rawSnapshotHash: text("raw_snapshot_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [index("idx_pregame_snapshots_game").on(table.gameId, table.importedAt)]);

export const kickoffWeatherCurrent = sqliteTable("kickoff_weather_current", {
  gameId: text("game_id").primaryKey(),
  stadium: text("stadium").notNull(),
  roof: text("roof").notNull(),
  kickoffAt: text("kickoff_at").notNull(),
  forecastIssuedAt: text("forecast_issued_at").notNull(),
  validAt: text("valid_at").notNull(),
  windMph: real("wind_mph"),
  temperatureF: real("temperature_f"),
  precipitationProbability: real("precipitation_probability"),
  sourceHash: text("source_hash").notNull(),
  importedAt: text("imported_at").notNull()
});

export const kickoffWeatherSnapshots = sqliteTable("kickoff_weather_snapshots", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  stadium: text("stadium").notNull(),
  roof: text("roof").notNull(),
  kickoffAt: text("kickoff_at").notNull(),
  forecastIssuedAt: text("forecast_issued_at").notNull(),
  validAt: text("valid_at").notNull(),
  windMph: real("wind_mph"),
  temperatureF: real("temperature_f"),
  precipitationProbability: real("precipitation_probability"),
  sourceHash: text("source_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [index("idx_weather_snapshots_game").on(table.gameId, table.importedAt)]);

export const kickoffWeatherStage = sqliteTable("kickoff_weather_stage", {
  runId: text("run_id").notNull(),
  gameId: text("game_id").notNull(),
  stadium: text("stadium").notNull(),
  roof: text("roof").notNull(),
  kickoffAt: text("kickoff_at").notNull(),
  forecastIssuedAt: text("forecast_issued_at").notNull(),
  validAt: text("valid_at").notNull(),
  windMph: real("wind_mph"),
  temperatureF: real("temperature_f"),
  precipitationProbability: real("precipitation_probability"),
  sourceHash: text("source_hash").notNull(),
  importedAt: text("imported_at").notNull()
}, (table) => [primaryKey({ columns: [table.runId, table.gameId] })]);

export const kickoffWeatherState = sqliteTable("kickoff_weather_state", {
  gameId: text("game_id").primaryKey(),
  freshness: text("freshness").notNull(),
  roof: text("roof").notNull(),
  sourceHash: text("source_hash"),
  lastCheckedAt: text("last_checked_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error")
});

export const kickoffWeatherAlerts = sqliteTable("kickoff_weather_alerts", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at")
}, (table) => [index("idx_weather_alerts_unresolved").on(table.resolvedAt, table.createdAt)]);

export const playerPropQuotesStage = sqliteTable("player_prop_quotes_stage", {
  importId: text("import_id").notNull(),
  id: text("id").notNull(),
  gameId: text("game_id").notNull(),
  eventId: text("event_id").notNull(),
  book: text("book").notNull(),
  market: text("market").notNull(),
  player: text("player").notNull(),
  side: text("side").notNull(),
  point: real("point").notNull(),
  americanPrice: integer("american_price").notNull(),
  capturedAt: text("captured_at").notNull(),
  sourceHash: text("source_hash").notNull()
}, (table) => [
  primaryKey({ columns: [table.importId, table.id] }),
  index("idx_prop_stage_import").on(table.importId)
]);

export const playerPropQuoteSnapshots = sqliteTable("player_prop_quote_snapshots", {
  snapshotKey: text("snapshot_key").notNull(),
  lineId: text("line_id").notNull(),
  gameId: text("game_id").notNull(),
  eventId: text("event_id").notNull(),
  book: text("book").notNull(),
  market: text("market").notNull(),
  player: text("player").notNull(),
  side: text("side").notNull(),
  point: real("point").notNull(),
  americanPrice: integer("american_price").notNull(),
  capturedAt: text("captured_at").notNull(),
  sourceHash: text("source_hash").notNull(),
  fetchedAt: text("fetched_at").notNull()
}, (table) => [
  primaryKey({ columns: [table.snapshotKey, table.lineId] }),
  index("idx_prop_snapshots_game_time").on(table.gameId, table.fetchedAt),
  index("idx_prop_snapshots_line").on(table.lineId)
]);

export const edgeNotificationState = sqliteTable("edge_notification_state", {
  observationKey: text("observation_key").primaryKey(),
  gameId: text("game_id").notNull(),
  book: text("book").notNull(),
  market: text("market").notNull(),
  side: text("side").notNull(),
  point: real("point"),
  americanPrice: integer("american_price").notNull(),
  probabilityEdge: real("probability_edge").notNull(),
  snapshotKey: text("snapshot_key").notNull(),
  capturedAt: text("captured_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [index("idx_edge_notification_game").on(table.gameId, table.market, table.book)]);

export const webPushSubscriptions = sqliteTable("web_push_subscriptions", {
  id: text("id").primaryKey(),
  recipientId: text("recipient_id").notNull(),
  endpoint: text("endpoint").notNull(),
  expirationTime: real("expiration_time"),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revokedAt: text("revoked_at")
}, (table) => [
  unique().on(table.endpoint),
  index("idx_web_push_recipient").on(table.recipientId, table.revokedAt),
  check("web_push_subscriptions_recipient_check", sql`${table.recipientId} IN ('gabe', 'jarrett')`)
]);

export const webPushDeliveries = sqliteTable("web_push_deliveries", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  recipientId: text("recipient_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  state: text("state").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
  sentAt: text("sent_at"),
  lastError: text("last_error")
}, (table) => [
  unique().on(table.idempotencyKey),
  index("idx_web_push_delivery_state").on(table.recipientId, table.state, table.createdAt),
  check("web_push_deliveries_type_check", sql`${table.type} IN ('awaiting_you', 'edge_threshold')`),
  check("web_push_deliveries_recipient_check", sql`${table.recipientId} IN ('gabe', 'jarrett')`),
  check("web_push_deliveries_state_check", sql`${table.state} IN ('pending', 'sent', 'failed')`)
]);

export const webPushAttempts = sqliteTable("web_push_attempts", {
  deliveryId: text("delivery_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  state: text("state").notNull(),
  attemptedAt: text("attempted_at").notNull(),
  responseStatus: integer("response_status"),
  errorMessage: text("error_message")
}, (table) => [
  primaryKey({ columns: [table.deliveryId, table.subscriptionId] }),
  check("web_push_attempts_state_check", sql`${table.state} IN ('sent', 'failed')`)
]);

export const qbModelOverrides = sqliteTable("qb_model_overrides", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  team: text("team").notNull(),
  value: real("value").notNull(),
  sourceUrl: text("source_url").notNull(),
  rationale: text("rationale").notNull(),
  authorId: text("author_id").notNull(),
  createdAt: text("created_at").notNull(),
  auditHash: text("audit_hash").notNull()
}, (table) => [
  unique().on(table.auditHash),
  index("idx_qb_overrides_game_time").on(table.gameId, table.team, table.createdAt)
]);

export const weeklyDigests = sqliteTable("weekly_digests", {
  id: text("id").primaryKey(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  digestJson: text("digest_json").notNull(),
  digestHash: text("digest_hash").notNull(),
  generatedAt: text("generated_at").notNull()
}, (table) => [
  unique().on(table.season, table.week),
  index("idx_weekly_digests_season_week").on(table.season, table.week)
]);
