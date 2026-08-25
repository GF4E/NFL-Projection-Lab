CREATE TABLE IF NOT EXISTS model_run_log (
  id text PRIMARY KEY NOT NULL,
  champion_hash text NOT NULL,
  challenger_hash text NOT NULL,
  champion_metrics_json text NOT NULL,
  challenger_metrics_json text NOT NULL,
  gate_decision text NOT NULL,
  data_hash text NOT NULL,
  config_hash text NOT NULL,
  feature_schema_hash text NOT NULL,
  code_hash text NOT NULL,
  started_at text NOT NULL,
  completed_at text NOT NULL,
  promoted_at text
);

ALTER TABLE model_run_log ADD COLUMN paired_improvement real NOT NULL DEFAULT 0;
ALTER TABLE model_run_log ADD COLUMN paired_interval_json text NOT NULL DEFAULT '[0,0]';
ALTER TABLE model_run_log ADD COLUMN paired_blocks integer NOT NULL DEFAULT 0;
