import { stableHash } from "@/domain/hash";
import type { HumanJudgmentAdjustment } from "@/domain/human-judgment";
import type { JointScoreDistribution, MainlineProbabilities } from "@/domain/joint-score";
import { assertFeatureRowLeakageSafe, type PointInTimeFeatureRow, type SourceObservation } from "@/domain/point-in-time";
import type { PrequentialForecastRow, ScoreDistributionEvaluation } from "@/domain/probabilistic-evaluation";
import type { RegisteredExperiment, ExperimentDecision } from "@/domain/research-registry";
import type { ScenarioDecisionDossier } from "@/domain/scenarios";
import type { ResearchQuestionAnswer } from "@/domain/research-questions";

export interface ImmutableForecastArtifact {
  forecastHash: string;
  gameId: string;
  sourceGameId: string;
  season: number;
  week: number;
  forecastHorizon: string;
  generatedAt: string;
  modelFamily: string;
  modelHash: string;
  configHash: string;
  dataHash: string;
  featureRowHash: string;
  homeSpreadPoint: number;
  totalPoint: number;
  marketHomeWinProbability: number;
  marketHomeCoverProbability: number;
  marketOverProbability: number;
  quoteFresh: boolean;
  distribution: JointScoreDistribution;
  mainline: MainlineProbabilities;
  dossier: ScenarioDecisionDossier;
}

export interface ConfidenceModelRegistryEntry {
  modelHash: string;
  family: string;
  status: "baseline" | "champion" | "challenger" | "rejected";
  configHash: string;
  artifact: Record<string, unknown>;
  registeredAt: string;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS source_snapshot_manifest (
    source_hash text PRIMARY KEY NOT NULL,
    provider text NOT NULL,
    dataset text NOT NULL,
    source_record_id text NOT NULL,
    observation_kind text NOT NULL,
    published_at text NOT NULL,
    provider_updated_at text,
    requested_at text NOT NULL,
    received_at text NOT NULL,
    captured_at text NOT NULL,
    availability_basis text NOT NULL,
    valid_at text NOT NULL,
    valid_to text,
    schema_version text NOT NULL,
    import_run_id text NOT NULL,
    license text NOT NULL,
    freshness text NOT NULL,
    source_url text,
    observation_json text NOT NULL,
    created_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS point_in_time_feature_rows (
    row_hash text PRIMARY KEY NOT NULL,
    game_id text NOT NULL,
    season integer NOT NULL,
    week integer NOT NULL,
    forecast_at text NOT NULL,
    maximum_source_time text NOT NULL,
    game_data_through_season integer NOT NULL,
    game_data_through_week integer NOT NULL,
    upstream_snapshot_hash text NOT NULL,
    transformation_version text NOT NULL,
    imputation_policy text NOT NULL,
    features_json text NOT NULL,
    observation_hashes_json text NOT NULL,
    created_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS confidence_forecast_artifacts (
    forecast_hash text PRIMARY KEY NOT NULL,
    game_id text NOT NULL,
    source_game_id text NOT NULL,
    season integer NOT NULL,
    week integer NOT NULL,
    forecast_horizon text NOT NULL,
    generated_at text NOT NULL,
    model_family text NOT NULL,
    model_hash text NOT NULL,
    config_hash text NOT NULL,
    data_hash text NOT NULL,
    feature_row_hash text NOT NULL,
    distribution_json text NOT NULL,
    mainline_json text NOT NULL,
    dossier_json text NOT NULL,
    home_spread_point real NOT NULL,
    total_point real NOT NULL,
    market_home_win_probability real NOT NULL,
    market_home_cover_probability real NOT NULL,
    market_over_probability real NOT NULL,
    quote_fresh integer NOT NULL,
    settled_at text,
    FOREIGN KEY (feature_row_hash) REFERENCES point_in_time_feature_rows(row_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS confidence_model_registry (
    model_hash text PRIMARY KEY NOT NULL,
    family text NOT NULL,
    status text NOT NULL,
    config_hash text NOT NULL,
    artifact_json text NOT NULL,
    registered_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS confidence_forecast_evaluations (
    forecast_hash text PRIMARY KEY NOT NULL,
    game_id text NOT NULL,
    actual_home_score integer NOT NULL,
    actual_away_score integer NOT NULL,
    evaluation_json text NOT NULL,
    evaluated_at text NOT NULL,
    FOREIGN KEY (forecast_hash) REFERENCES confidence_forecast_artifacts(forecast_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS confidence_experiment_registry (
    experiment_id text PRIMARY KEY NOT NULL,
    registry_hash text UNIQUE NOT NULL,
    status text NOT NULL,
    experiment_json text NOT NULL,
    registered_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS confidence_experiment_decisions (
    decision_hash text PRIMARY KEY NOT NULL,
    experiment_id text NOT NULL,
    decision text NOT NULL,
    decision_json text NOT NULL,
    decided_at text NOT NULL,
    FOREIGN KEY (experiment_id) REFERENCES confidence_experiment_registry(experiment_id)
  )`,
  `CREATE TABLE IF NOT EXISTS confidence_human_adjustments (
    adjustment_hash text PRIMARY KEY NOT NULL,
    forecast_hash text NOT NULL,
    adjustment_json text NOT NULL,
    training_eligible integer NOT NULL CHECK (training_eligible = 0),
    created_at text NOT NULL,
    FOREIGN KEY (forecast_hash) REFERENCES confidence_forecast_artifacts(forecast_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS confidence_research_answers (
    answer_hash text PRIMARY KEY NOT NULL,
    question_id text NOT NULL,
    decision text NOT NULL,
    answer_json text NOT NULL,
    recorded_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS confidence_engine_alerts (
    id text PRIMARY KEY NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    idempotency_key text UNIQUE NOT NULL,
    created_at text NOT NULL,
    resolved_at text
  )`,
  "CREATE INDEX IF NOT EXISTS idx_confidence_forecasts_game_time ON confidence_forecast_artifacts (game_id, generated_at)",
  "CREATE INDEX IF NOT EXISTS idx_confidence_forecasts_horizon ON confidence_forecast_artifacts (season, week, forecast_horizon)",
  "CREATE INDEX IF NOT EXISTS idx_confidence_evaluations_time ON confidence_forecast_evaluations (evaluated_at)"
] as const;

export async function ensureConfidenceEngineStore(db: D1Database): Promise<void> {
  await db.batch(schema.map((statement) => db.prepare(statement)));
}

async function assertImmutableInsert(db: D1Database, input: {
  table: string;
  keyColumn: string;
  key: string;
  jsonColumn: string;
  expectedJson: string;
}): Promise<void> {
  const row = await db.prepare(`SELECT ${input.jsonColumn} AS value FROM ${input.table} WHERE ${input.keyColumn} = ?`)
    .bind(input.key).first<{ value: string }>();
  if (row && row.value !== input.expectedJson) {
    throw new Error(`Immutable ${input.table} artifact conflicts with existing ${input.keyColumn}`);
  }
}

export async function publishSourceObservations(
  db: D1Database,
  observations: readonly SourceObservation[],
  createdAt: string
): Promise<void> {
  await ensureConfidenceEngineStore(db);
  for (const observation of observations) {
    const json = JSON.stringify(observation);
    await assertImmutableInsert(db, {
      table: "source_snapshot_manifest", keyColumn: "source_hash", key: observation.sourceHash,
      jsonColumn: "observation_json", expectedJson: json
    });
    await db.prepare(`INSERT OR IGNORE INTO source_snapshot_manifest
      (source_hash, provider, dataset, source_record_id, observation_kind, published_at, provider_updated_at,
       requested_at, received_at, captured_at, availability_basis, valid_at, valid_to, schema_version,
       import_run_id, license, freshness, source_url, observation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        observation.sourceHash, observation.provider, observation.dataset, observation.sourceRecordId,
        observation.kind, observation.publishedAt, observation.providerUpdatedAt, observation.requestedAt,
        observation.receivedAt, observation.capturedAt, observation.availabilityBasis, observation.validAt,
        observation.validTo, observation.schemaVersion, observation.importRunId, observation.licenseTag, observation.freshness,
        observation.sourceUrl ?? null, json, createdAt
      ).run();
  }
}

export async function publishPointInTimeFeatureRow(db: D1Database, row: PointInTimeFeatureRow): Promise<void> {
  assertFeatureRowLeakageSafe(row);
  await ensureConfidenceEngineStore(db);
  await publishSourceObservations(db, row.observations, row.generatedAt);
  const featuresJson = JSON.stringify({ values: row.values, missingness: row.missingness });
  await assertImmutableInsert(db, {
    table: "point_in_time_feature_rows", keyColumn: "row_hash", key: row.rowHash,
    jsonColumn: "features_json", expectedJson: featuresJson
  });
  await db.prepare(`INSERT OR IGNORE INTO point_in_time_feature_rows
    (row_hash, game_id, season, week, forecast_at, maximum_source_time, game_data_through_season,
     game_data_through_week, upstream_snapshot_hash, transformation_version, imputation_policy,
     features_json, observation_hashes_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      row.rowHash, row.gameId, row.season, row.targetWeek, row.generatedAt,
      row.maximumSourceTime, row.season, row.inputsThroughWeek, row.upstreamSnapshotHash,
      row.transformationVersion, row.imputationPolicy,
      featuresJson, JSON.stringify(row.observations.map((item) => item.sourceHash)), row.generatedAt
    ).run();
}

function forecastContent(input: Omit<ImmutableForecastArtifact, "forecastHash">): unknown {
  return input;
}

export function createForecastArtifact(
  input: Omit<ImmutableForecastArtifact, "forecastHash">
): ImmutableForecastArtifact {
  if (!Number.isFinite(Date.parse(input.generatedAt)) || !input.gameId || !input.modelHash || !input.dataHash) {
    throw new Error("Forecast artifact is missing identity or timestamp metadata");
  }
  return { ...input, forecastHash: stableHash(forecastContent(input)) };
}

export async function publishForecastArtifact(input: {
  db: D1Database;
  featureRow: PointInTimeFeatureRow;
  artifact: ImmutableForecastArtifact;
}): Promise<void> {
  assertFeatureRowLeakageSafe(input.featureRow);
  if (input.artifact.featureRowHash !== input.featureRow.rowHash) throw new Error("Forecast feature-row hash mismatch");
  const { forecastHash, ...content } = input.artifact;
  if (forecastHash !== stableHash(forecastContent(content))) throw new Error("Forecast artifact hash mismatch");
  if (Date.parse(input.artifact.generatedAt) < Date.parse(input.featureRow.generatedAt)) {
    throw new Error("Forecast cannot predate its feature row");
  }
  await ensureConfidenceEngineStore(input.db);
  const registered = await input.db.prepare(`SELECT model_hash FROM confidence_model_registry
    WHERE model_hash = ? AND config_hash = ? AND status IN ('baseline', 'champion')`)
    .bind(input.artifact.modelHash, input.artifact.configHash).first<{ model_hash: string }>();
  if (!registered) throw new Error("Forecasting from an unregistered or unapproved confidence model is prohibited");
  await publishPointInTimeFeatureRow(input.db, input.featureRow);
  const distributionJson = JSON.stringify(input.artifact.distribution);
  await assertImmutableInsert(input.db, {
    table: "confidence_forecast_artifacts", keyColumn: "forecast_hash", key: forecastHash,
    jsonColumn: "distribution_json", expectedJson: distributionJson
  });
  await input.db.prepare(`INSERT OR IGNORE INTO confidence_forecast_artifacts
    (forecast_hash, game_id, source_game_id, season, week, forecast_horizon, generated_at, model_family, model_hash,
     config_hash, data_hash, feature_row_hash, distribution_json, mainline_json, dossier_json,
     home_spread_point, total_point, market_home_win_probability, market_home_cover_probability,
     market_over_probability, quote_fresh)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      forecastHash, input.artifact.gameId, input.artifact.sourceGameId, input.artifact.season, input.artifact.week,
      input.artifact.forecastHorizon, input.artifact.generatedAt, input.artifact.modelFamily,
      input.artifact.modelHash, input.artifact.configHash, input.artifact.dataHash,
      input.artifact.featureRowHash, distributionJson, JSON.stringify(input.artifact.mainline),
      JSON.stringify(input.artifact.dossier), input.artifact.homeSpreadPoint, input.artifact.totalPoint,
      input.artifact.marketHomeWinProbability, input.artifact.marketHomeCoverProbability,
      input.artifact.marketOverProbability, Number(input.artifact.quoteFresh)
    ).run();
}

export async function registerConfidenceModel(db: D1Database, entry: ConfidenceModelRegistryEntry): Promise<void> {
  await ensureConfidenceEngineStore(db);
  if (!entry.modelHash || !entry.configHash || !Number.isFinite(Date.parse(entry.registeredAt))) {
    throw new Error("Confidence model registry entry is incomplete");
  }
  const json = JSON.stringify(entry.artifact);
  await assertImmutableInsert(db, {
    table: "confidence_model_registry", keyColumn: "model_hash", key: entry.modelHash,
    jsonColumn: "artifact_json", expectedJson: json
  });
  await db.prepare(`INSERT OR IGNORE INTO confidence_model_registry
    (model_hash, family, status, config_hash, artifact_json, registered_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(entry.modelHash, entry.family, entry.status, entry.configHash, json, entry.registeredAt).run();
}

export async function hasForecastInputVersion(db: D1Database, input: {
  gameId: string;
  forecastHorizon: string;
  dataHash: string;
  modelHash: string;
}): Promise<boolean> {
  await ensureConfidenceEngineStore(db);
  const row = await db.prepare(`SELECT forecast_hash FROM confidence_forecast_artifacts
    WHERE game_id = ? AND forecast_horizon = ? AND data_hash = ? AND model_hash = ? LIMIT 1`)
    .bind(input.gameId, input.forecastHorizon, input.dataHash, input.modelHash).first<{ forecast_hash: string }>();
  return Boolean(row);
}

export async function publishConfidenceEngineAlert(db: D1Database, input: {
  type: string;
  message: string;
  idempotencyKey: string;
  createdAt: string;
}): Promise<void> {
  await ensureConfidenceEngineStore(db);
  await db.prepare(`INSERT OR IGNORE INTO confidence_engine_alerts
    (id, type, message, idempotency_key, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, NULL)`)
    .bind(stableHash(input), input.type, input.message, input.idempotencyKey, input.createdAt).run();
}

export async function resolveConfidenceEngineAlerts(
  db: D1Database,
  idempotencyPrefix: string,
  resolvedAt: string
): Promise<void> {
  await ensureConfidenceEngineStore(db);
  await db.prepare(`UPDATE confidence_engine_alerts SET resolved_at = ?
    WHERE resolved_at IS NULL AND idempotency_key LIKE ?`)
    .bind(resolvedAt, `${idempotencyPrefix}%`).run();
}

interface PendingEvaluationRow {
  forecast_hash: string;
  game_id: string;
  source_game_id: string;
  season: number;
  week: number;
  forecast_horizon: string;
  generated_at: string;
  model_family: string;
  model_hash: string;
  data_hash: string;
  distribution_json: string;
  home_spread_point: number;
  total_point: number;
  market_home_win_probability: number;
  market_home_cover_probability: number;
  market_over_probability: number;
  quote_fresh: number;
  result: number;
  total: number;
}

export async function listPendingPrequentialForecasts(db: D1Database): Promise<PrequentialForecastRow[]> {
  await ensureConfidenceEngineStore(db);
  const rows = await db.prepare(`SELECT f.forecast_hash, f.game_id, f.source_game_id, f.season, f.week,
      f.forecast_horizon, f.generated_at, f.model_family, f.model_hash, f.data_hash, f.distribution_json,
      f.home_spread_point, f.total_point, f.market_home_win_probability,
      f.market_home_cover_probability, f.market_over_probability, f.quote_fresh, g.result, g.total
    FROM confidence_forecast_artifacts f
    JOIN nfl_games g ON g.game_id = f.source_game_id
    LEFT JOIN confidence_forecast_evaluations e ON e.forecast_hash = f.forecast_hash
    WHERE e.forecast_hash IS NULL AND g.result IS NOT NULL AND g.total IS NOT NULL`)
    .all<PendingEvaluationRow>();
  return rows.results.flatMap((row) => {
    const actualHomeScore = (row.total + row.result) / 2;
    const actualAwayScore = (row.total - row.result) / 2;
    if (!Number.isInteger(actualHomeScore) || !Number.isInteger(actualAwayScore)) return [];
    return [{
      id: row.forecast_hash,
      gameId: row.game_id,
      season: row.season,
      week: row.week,
      forecastHorizon: row.forecast_horizon,
      generatedAt: row.generated_at,
      family: row.model_family,
      modelHash: row.model_hash,
      dataHash: row.data_hash,
      distribution: JSON.parse(row.distribution_json) as JointScoreDistribution,
      homeSpreadPoint: row.home_spread_point,
      totalPoint: row.total_point,
      actualHomeScore,
      actualAwayScore,
      marketHomeWinProbability: row.market_home_win_probability,
      marketHomeCoverProbability: row.market_home_cover_probability,
      marketOverProbability: row.market_over_probability,
      quoteFresh: Boolean(row.quote_fresh)
    }];
  });
}

export async function recordForecastEvaluation(input: {
  db: D1Database;
  forecast: PrequentialForecastRow;
  evaluation: ScoreDistributionEvaluation;
  evaluatedAt: string;
}): Promise<void> {
  await ensureConfidenceEngineStore(input.db);
  const json = JSON.stringify(input.evaluation);
  await assertImmutableInsert(input.db, {
    table: "confidence_forecast_evaluations", keyColumn: "forecast_hash", key: input.forecast.id,
    jsonColumn: "evaluation_json", expectedJson: json
  });
  await input.db.prepare(`INSERT OR IGNORE INTO confidence_forecast_evaluations
    (forecast_hash, game_id, actual_home_score, actual_away_score, evaluation_json, evaluated_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(input.forecast.id, input.forecast.gameId, input.forecast.actualHomeScore,
      input.forecast.actualAwayScore, json, input.evaluatedAt).run();
  await input.db.prepare("UPDATE confidence_forecast_artifacts SET settled_at = ? WHERE forecast_hash = ?")
    .bind(input.evaluatedAt, input.forecast.id).run();
}

export async function storeRegisteredExperiment(db: D1Database, experiment: RegisteredExperiment): Promise<void> {
  await ensureConfidenceEngineStore(db);
  const json = JSON.stringify(experiment);
  await assertImmutableInsert(db, {
    table: "confidence_experiment_registry", keyColumn: "experiment_id", key: experiment.id,
    jsonColumn: "experiment_json", expectedJson: json
  });
  await db.prepare(`INSERT OR IGNORE INTO confidence_experiment_registry
    (experiment_id, registry_hash, status, experiment_json, registered_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(experiment.id, experiment.registryHash, "preregistered", json, experiment.preregisteredAt).run();
}

export async function storeExperimentDecision(db: D1Database, decision: ExperimentDecision): Promise<void> {
  await ensureConfidenceEngineStore(db);
  const json = JSON.stringify(decision);
  await assertImmutableInsert(db, {
    table: "confidence_experiment_decisions", keyColumn: "decision_hash", key: decision.decisionHash,
    jsonColumn: "decision_json", expectedJson: json
  });
  await db.prepare(`INSERT OR IGNORE INTO confidence_experiment_decisions
    (decision_hash, experiment_id, decision, decision_json, decided_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(decision.decisionHash, decision.experimentId, decision.decision, json, decision.decidedAt).run();
  await db.prepare("UPDATE confidence_experiment_registry SET status = ? WHERE experiment_id = ?")
    .bind(decision.decision, decision.experimentId).run();
}

export async function storeHumanJudgment(db: D1Database, adjustment: HumanJudgmentAdjustment): Promise<void> {
  if (adjustment.trainingEligible !== false) throw new Error("Human judgment can never be training eligible");
  await ensureConfidenceEngineStore(db);
  const json = JSON.stringify(adjustment);
  await assertImmutableInsert(db, {
    table: "confidence_human_adjustments", keyColumn: "adjustment_hash", key: adjustment.adjustmentHash,
    jsonColumn: "adjustment_json", expectedJson: json
  });
  await db.prepare(`INSERT OR IGNORE INTO confidence_human_adjustments
    (adjustment_hash, forecast_hash, adjustment_json, training_eligible, created_at) VALUES (?, ?, ?, 0, ?)`)
    .bind(adjustment.adjustmentHash, adjustment.forecastHash, json, adjustment.createdAt).run();
}

export async function storeResearchQuestionAnswer(db: D1Database, answer: ResearchQuestionAnswer): Promise<void> {
  await ensureConfidenceEngineStore(db);
  const json = JSON.stringify(answer);
  await assertImmutableInsert(db, {
    table: "confidence_research_answers", keyColumn: "answer_hash", key: answer.answerHash,
    jsonColumn: "answer_json", expectedJson: json
  });
  await db.prepare(`INSERT OR IGNORE INTO confidence_research_answers
    (answer_hash, question_id, decision, answer_json, recorded_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(answer.answerHash, answer.questionId, answer.decision, json, answer.recordedAt).run();
}

export async function getConfidenceEngineHealth(db: D1Database): Promise<{
  forecasts: number;
  evaluated: number;
  latestForecastAt: string | null;
  unevaluated: number;
  openAlerts: number;
}> {
  const [forecasts, evaluations, alerts] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count, MAX(generated_at) AS latest
      FROM confidence_forecast_artifacts`).first<{ count: number; latest: string | null }>(),
    db.prepare("SELECT COUNT(*) AS count FROM confidence_forecast_evaluations").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM confidence_engine_alerts WHERE resolved_at IS NULL").first<{ count: number }>()
  ]);
  const forecastCount = forecasts?.count ?? 0;
  const evaluated = evaluations?.count ?? 0;
  return {
    forecasts: forecastCount,
    evaluated,
    latestForecastAt: forecasts?.latest ?? null,
    unevaluated: Math.max(0, forecastCount - evaluated),
    openAlerts: alerts?.count ?? 0
  };
}
