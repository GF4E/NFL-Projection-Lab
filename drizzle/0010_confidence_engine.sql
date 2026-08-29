CREATE TABLE IF NOT EXISTS source_snapshot_manifest (
  source_hash text PRIMARY KEY NOT NULL, provider text NOT NULL, dataset text NOT NULL,
  source_record_id text NOT NULL, observation_kind text NOT NULL, published_at text NOT NULL,
  captured_at text NOT NULL, valid_at text NOT NULL, valid_to text, schema_version text NOT NULL,
  import_run_id text NOT NULL,
  license text NOT NULL, freshness text NOT NULL, source_url text, observation_json text NOT NULL,
  created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS point_in_time_feature_rows (
  row_hash text PRIMARY KEY NOT NULL, game_id text NOT NULL, season integer NOT NULL,
  week integer NOT NULL, forecast_at text NOT NULL, maximum_source_time text NOT NULL,
  game_data_through_season integer NOT NULL,
  game_data_through_week integer NOT NULL, upstream_snapshot_hash text NOT NULL,
  transformation_version text NOT NULL, imputation_policy text NOT NULL,
  features_json text NOT NULL, observation_hashes_json text NOT NULL, created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS confidence_forecast_artifacts (
  forecast_hash text PRIMARY KEY NOT NULL, game_id text NOT NULL, source_game_id text NOT NULL, season integer NOT NULL,
  week integer NOT NULL, forecast_horizon text NOT NULL, generated_at text NOT NULL,
  model_family text NOT NULL, model_hash text NOT NULL, config_hash text NOT NULL,
  data_hash text NOT NULL, feature_row_hash text NOT NULL, distribution_json text NOT NULL,
  mainline_json text NOT NULL, dossier_json text NOT NULL, home_spread_point real NOT NULL,
  total_point real NOT NULL, market_home_win_probability real NOT NULL,
  market_home_cover_probability real NOT NULL, market_over_probability real NOT NULL,
  quote_fresh integer NOT NULL, settled_at text,
  FOREIGN KEY (feature_row_hash) REFERENCES point_in_time_feature_rows(row_hash)
);

CREATE TABLE IF NOT EXISTS confidence_model_registry (
  model_hash text PRIMARY KEY NOT NULL, family text NOT NULL, status text NOT NULL,
  config_hash text NOT NULL, artifact_json text NOT NULL, registered_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS confidence_forecast_evaluations (
  forecast_hash text PRIMARY KEY NOT NULL, game_id text NOT NULL, actual_home_score integer NOT NULL,
  actual_away_score integer NOT NULL, evaluation_json text NOT NULL, evaluated_at text NOT NULL,
  FOREIGN KEY (forecast_hash) REFERENCES confidence_forecast_artifacts(forecast_hash)
);

CREATE TABLE IF NOT EXISTS confidence_experiment_registry (
  experiment_id text PRIMARY KEY NOT NULL, registry_hash text UNIQUE NOT NULL,
  status text NOT NULL, experiment_json text NOT NULL, registered_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS confidence_experiment_decisions (
  decision_hash text PRIMARY KEY NOT NULL, experiment_id text NOT NULL, decision text NOT NULL,
  decision_json text NOT NULL, decided_at text NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES confidence_experiment_registry(experiment_id)
);

CREATE TABLE IF NOT EXISTS confidence_human_adjustments (
  adjustment_hash text PRIMARY KEY NOT NULL, forecast_hash text NOT NULL,
  adjustment_json text NOT NULL, training_eligible integer NOT NULL CHECK (training_eligible = 0),
  created_at text NOT NULL,
  FOREIGN KEY (forecast_hash) REFERENCES confidence_forecast_artifacts(forecast_hash)
);

CREATE TABLE IF NOT EXISTS confidence_research_answers (
  answer_hash text PRIMARY KEY NOT NULL, question_id text NOT NULL, decision text NOT NULL,
  answer_json text NOT NULL, recorded_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS confidence_engine_alerts (
  id text PRIMARY KEY NOT NULL, type text NOT NULL, message text NOT NULL,
  idempotency_key text UNIQUE NOT NULL, created_at text NOT NULL, resolved_at text
);

CREATE INDEX IF NOT EXISTS idx_confidence_forecasts_game_time
  ON confidence_forecast_artifacts (game_id, generated_at);
CREATE INDEX IF NOT EXISTS idx_confidence_forecasts_horizon
  ON confidence_forecast_artifacts (season, week, forecast_horizon);
CREATE INDEX IF NOT EXISTS idx_confidence_evaluations_time
  ON confidence_forecast_evaluations (evaluated_at);
