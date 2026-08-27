-- OS-01 additive schema closure.
--
-- This migration adopts the persistent objects formerly created by runtime
-- store initializers. CREATE ... IF NOT EXISTS is safe only after an external
-- preflight has proved that every pre-existing object has the exact canonical
-- columns, constraints, and indexes below. The migration deliberately does not
-- attempt to repair or replace a mismatched object. The canonical `plays` table
-- and its approval triggers remain isolated for migration 0020.

CREATE TABLE IF NOT EXISTS `play_state_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `play_id` text NOT NULL,
  `transition` text NOT NULL,
  `reason` text NOT NULL,
  `from_status` text NOT NULL,
  `to_status` text NOT NULL,
  `snapshot_json` text NOT NULL,
  `changed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `play_clv_audit` (
  `play_id` text PRIMARY KEY NOT NULL,
  `reference_book` text,
  `clv_cents` real,
  `clv_points` real,
  `synthetic_closing_american` real,
  `detail_json` text NOT NULL,
  `calculated_at` text NOT NULL,
  `source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `play_correction_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `play_id` text NOT NULL,
  `actor_id` text NOT NULL,
  `reason` text NOT NULL,
  `before_result` text NOT NULL,
  `before_profit_cents` integer NOT NULL,
  `after_result` text NOT NULL,
  `after_profit_cents` integer NOT NULL,
  `corrected_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_play_state_audit_play`
  ON `play_state_audit` (`play_id`, `changed_at`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_lifecycle_state` (
  `season` integer PRIMARY KEY NOT NULL,
  `loop_a_through_week` integer NOT NULL DEFAULT -1,
  `loop_a_hash` text,
  `loop_b_target_week` integer NOT NULL DEFAULT -1,
  `champion_hash` text,
  `last_loop_a_at` text,
  `last_loop_b_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `team_strength_states` (
  `season` integer NOT NULL,
  `team` text NOT NULL,
  `mean` real NOT NULL,
  `variance` real NOT NULL,
  `through_week` integer NOT NULL,
  `state_hash` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`season`, `team`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `team_strength_states_stage` (
  `run_id` text NOT NULL,
  `season` integer NOT NULL,
  `team` text NOT NULL,
  `mean` real NOT NULL,
  `variance` real NOT NULL,
  `through_week` integer NOT NULL,
  `state_hash` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`run_id`, `season`, `team`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rolling_feature_states` (
  `season` integer NOT NULL,
  `team` text NOT NULL,
  `through_week` integer NOT NULL,
  `epa` real NOT NULL,
  `success_rate` real NOT NULL,
  `explosive_rate` real NOT NULL,
  `regressed_turnovers` real NOT NULL,
  `pace` real NOT NULL,
  `proe` real NOT NULL,
  `state_hash` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`season`, `team`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rolling_feature_states_stage` (
  `run_id` text NOT NULL,
  `season` integer NOT NULL,
  `team` text NOT NULL,
  `through_week` integer NOT NULL,
  `epa` real NOT NULL,
  `success_rate` real NOT NULL,
  `explosive_rate` real NOT NULL,
  `regressed_turnovers` real NOT NULL,
  `pace` real NOT NULL,
  `proe` real NOT NULL,
  `state_hash` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`run_id`, `season`, `team`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_versions` (
  `version_hash` text PRIMARY KEY NOT NULL,
  `status` text NOT NULL,
  `model_json` text NOT NULL,
  `metrics_json` text NOT NULL,
  `training_through_season` integer NOT NULL,
  `training_through_week` integer NOT NULL,
  `data_hash` text NOT NULL,
  `config_hash` text NOT NULL,
  `feature_schema_hash` text NOT NULL,
  `code_hash` text NOT NULL,
  `created_at` text NOT NULL,
  `promoted_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_system_alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `severity` text NOT NULL,
  `message` text NOT NULL,
  `idempotency_key` text UNIQUE NOT NULL,
  `created_at` text NOT NULL,
  `acknowledged_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_versions_status`
  ON `model_versions` (`status`, `promoted_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_runs_completed`
  ON `model_run_log` (`completed_at`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `nfl_games_stage` (
  `import_id` text NOT NULL,
  `game_id` text NOT NULL,
  `season` integer NOT NULL,
  `season_type` text NOT NULL,
  `week` integer NOT NULL,
  `game_date` text NOT NULL,
  `game_time` text,
  `weekday` text,
  `away_team` text NOT NULL,
  `away_score` integer,
  `home_team` text NOT NULL,
  `home_score` integer,
  `location` text,
  `result` real,
  `total` real,
  `overtime` integer NOT NULL,
  `away_rest` integer,
  `home_rest` integer,
  `away_moneyline` integer,
  `home_moneyline` integer,
  `spread_line` real,
  `away_spread_odds` integer,
  `home_spread_odds` integer,
  `total_line` real,
  `under_odds` integer,
  `over_odds` integer,
  `division_game` integer NOT NULL,
  `roof` text,
  `surface` text,
  `temperature` real,
  `wind` real,
  `away_qb_id` text,
  `home_qb_id` text,
  `away_qb_name` text,
  `home_qb_name` text,
  `away_coach` text,
  `home_coach` text,
  `referee` text,
  `stadium_id` text,
  `stadium` text,
  `source_row_hash` text NOT NULL,
  PRIMARY KEY (`import_id`, `game_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `nfl_team_game_features_stage` (
  `import_id` text NOT NULL,
  `id` text NOT NULL,
  `game_id` text NOT NULL,
  `season` integer NOT NULL,
  `season_type` text NOT NULL,
  `week` integer NOT NULL,
  `game_date` text NOT NULL,
  `team` text NOT NULL,
  `opponent` text NOT NULL,
  `home_away` text NOT NULL,
  `plays` integer NOT NULL,
  `epa_per_play` real NOT NULL,
  `success_rate` real NOT NULL,
  `explosive_rate` real NOT NULL,
  `turnovers` integer NOT NULL,
  `turnover_rate` real NOT NULL,
  `seconds_per_play` real,
  `dropbacks` integer NOT NULL,
  `pass_rate` real NOT NULL,
  `expected_pass_rate` real,
  `pass_rate_over_expectation` real,
  PRIMARY KEY (`import_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `nfl_player_week_stats` (
  `id` text PRIMARY KEY NOT NULL,
  `player_id` text NOT NULL,
  `player_name` text NOT NULL,
  `player_display_name` text NOT NULL,
  `position` text,
  `season` integer NOT NULL,
  `week` integer NOT NULL,
  `season_type` text NOT NULL,
  `game_id` text NOT NULL,
  `team` text NOT NULL,
  `opponent_team` text NOT NULL,
  `attempts` integer NOT NULL,
  `passing_yards` real NOT NULL,
  `carries` integer NOT NULL,
  `rushing_yards` real NOT NULL,
  `receptions` integer NOT NULL,
  `targets` integer NOT NULL,
  `receiving_yards` real NOT NULL,
  `source_hash` text NOT NULL,
  `imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `nfl_player_week_stats_stage` (
  `import_id` text NOT NULL,
  `id` text NOT NULL,
  `player_id` text NOT NULL,
  `player_name` text NOT NULL,
  `player_display_name` text NOT NULL,
  `position` text,
  `season` integer NOT NULL,
  `week` integer NOT NULL,
  `season_type` text NOT NULL,
  `game_id` text NOT NULL,
  `team` text NOT NULL,
  `opponent_team` text NOT NULL,
  `attempts` integer NOT NULL,
  `passing_yards` real NOT NULL,
  `carries` integer NOT NULL,
  `rushing_yards` real NOT NULL,
  `receptions` integer NOT NULL,
  `targets` integer NOT NULL,
  `receiving_yards` real NOT NULL,
  PRIMARY KEY (`import_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `nfl_player_snap_counts` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `season` integer NOT NULL,
  `game_type` text NOT NULL,
  `week` integer NOT NULL,
  `player` text NOT NULL,
  `position` text,
  `team` text NOT NULL,
  `opponent` text NOT NULL,
  `offense_snaps` integer NOT NULL,
  `defense_snaps` integer NOT NULL,
  `special_teams_snaps` integer NOT NULL,
  `source_hash` text NOT NULL,
  `imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `nfl_player_snap_counts_stage` (
  `import_id` text NOT NULL,
  `id` text NOT NULL,
  `game_id` text NOT NULL,
  `season` integer NOT NULL,
  `game_type` text NOT NULL,
  `week` integer NOT NULL,
  `player` text NOT NULL,
  `position` text,
  `team` text NOT NULL,
  `opponent` text NOT NULL,
  `offense_snaps` integer NOT NULL,
  `defense_snaps` integer NOT NULL,
  `special_teams_snaps` integer NOT NULL,
  PRIMARY KEY (`import_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_nfl_player_stats_name`
  ON `nfl_player_week_stats` (`player_display_name`, `season`, `week`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_nfl_player_stats_game`
  ON `nfl_player_week_stats` (`game_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_nfl_snap_counts_game_player`
  ON `nfl_player_snap_counts` (`game_id`, `player`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `game_context_alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `dataset` text NOT NULL,
  `message` text NOT NULL,
  `created_at` text NOT NULL,
  `resolved_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `official_injury_import_state` (
  `dataset` text PRIMARY KEY NOT NULL,
  `freshness` text NOT NULL,
  `source_url` text NOT NULL,
  `source_tag` text,
  `source_hash` text,
  `row_count` integer NOT NULL DEFAULT 0,
  `last_checked_at` text,
  `last_success_at` text,
  `last_error` text,
  `lease_expires_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `official_injury_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `season` integer NOT NULL,
  `week` integer NOT NULL,
  `game_id` text NOT NULL,
  `team` text NOT NULL,
  `player` text NOT NULL,
  `position` text,
  `injuries` text,
  `practice_status` text,
  `game_status` text,
  `inactive` integer,
  `source_url` text NOT NULL,
  `source_timestamp` text NOT NULL,
  `raw_snapshot_hash` text NOT NULL,
  `imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `official_injury_reports_stage` (
  `import_id` text NOT NULL,
  `id` text NOT NULL,
  `season` integer NOT NULL,
  `week` integer NOT NULL,
  `game_id` text NOT NULL,
  `team` text NOT NULL,
  `player` text NOT NULL,
  `position` text,
  `injuries` text,
  `practice_status` text,
  `game_status` text,
  `source_url` text NOT NULL,
  `source_timestamp` text NOT NULL,
  `raw_snapshot_hash` text NOT NULL,
  PRIMARY KEY (`import_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `official_pregame_context_state` (
  `game_id` text PRIMARY KEY NOT NULL,
  `season` integer NOT NULL,
  `week` integer NOT NULL,
  `freshness` text NOT NULL,
  `source_url` text,
  `source_hash` text,
  `roof` text NOT NULL DEFAULT 'unconfirmed',
  `inactives_confirmed` integer NOT NULL DEFAULT 0,
  `inactive_count` integer NOT NULL DEFAULT 0,
  `last_checked_at` text,
  `last_success_at` text,
  `last_error` text,
  `lease_expires_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `official_inactives` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `season` integer NOT NULL,
  `week` integer NOT NULL,
  `team` text NOT NULL,
  `player` text NOT NULL,
  `position` text,
  `source_url` text NOT NULL,
  `source_timestamp` text NOT NULL,
  `raw_snapshot_hash` text NOT NULL,
  `imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `official_inactives_stage` (
  `import_id` text NOT NULL,
  `id` text NOT NULL,
  `game_id` text NOT NULL,
  `season` integer NOT NULL,
  `week` integer NOT NULL,
  `team` text NOT NULL,
  `player` text NOT NULL,
  `position` text,
  `source_url` text NOT NULL,
  `source_timestamp` text NOT NULL,
  `raw_snapshot_hash` text NOT NULL,
  PRIMARY KEY (`import_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `official_pregame_context_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `roof` text NOT NULL,
  `inactive_count` integer NOT NULL,
  `source_url` text NOT NULL,
  `source_timestamp` text NOT NULL,
  `raw_snapshot_hash` text NOT NULL,
  `imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_official_injuries_week`
  ON `official_injury_reports` (`season`, `week`, `game_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_official_injuries_team`
  ON `official_injury_reports` (`team`, `season`, `week`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_context_alerts_unresolved`
  ON `game_context_alerts` (`resolved_at`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_official_inactives_game`
  ON `official_inactives` (`game_id`, `team`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pregame_context_week`
  ON `official_pregame_context_state` (`season`, `week`, `game_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pregame_snapshots_game`
  ON `official_pregame_context_snapshots` (`game_id`, `imported_at`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kickoff_weather_current` (
  `game_id` text PRIMARY KEY NOT NULL,
  `stadium` text NOT NULL,
  `roof` text NOT NULL,
  `kickoff_at` text NOT NULL,
  `forecast_issued_at` text NOT NULL,
  `valid_at` text NOT NULL,
  `wind_mph` real,
  `temperature_f` real,
  `precipitation_probability` real,
  `source_hash` text NOT NULL,
  `imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kickoff_weather_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `stadium` text NOT NULL,
  `roof` text NOT NULL,
  `kickoff_at` text NOT NULL,
  `forecast_issued_at` text NOT NULL,
  `valid_at` text NOT NULL,
  `wind_mph` real,
  `temperature_f` real,
  `precipitation_probability` real,
  `source_hash` text NOT NULL,
  `imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kickoff_weather_stage` (
  `run_id` text NOT NULL,
  `game_id` text NOT NULL,
  `stadium` text NOT NULL,
  `roof` text NOT NULL,
  `kickoff_at` text NOT NULL,
  `forecast_issued_at` text NOT NULL,
  `valid_at` text NOT NULL,
  `wind_mph` real,
  `temperature_f` real,
  `precipitation_probability` real,
  `source_hash` text NOT NULL,
  `imported_at` text NOT NULL,
  PRIMARY KEY (`run_id`, `game_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kickoff_weather_state` (
  `game_id` text PRIMARY KEY NOT NULL,
  `freshness` text NOT NULL,
  `roof` text NOT NULL,
  `source_hash` text,
  `last_checked_at` text,
  `last_success_at` text,
  `last_error` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kickoff_weather_alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `message` text NOT NULL,
  `created_at` text NOT NULL,
  `resolved_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_weather_snapshots_game`
  ON `kickoff_weather_snapshots` (`game_id`, `imported_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_weather_alerts_unresolved`
  ON `kickoff_weather_alerts` (`resolved_at`, `created_at`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `player_prop_quotes_stage` (
  `import_id` text NOT NULL,
  `id` text NOT NULL,
  `game_id` text NOT NULL,
  `event_id` text NOT NULL,
  `book` text NOT NULL,
  `market` text NOT NULL,
  `player` text NOT NULL,
  `side` text NOT NULL,
  `point` real NOT NULL,
  `american_price` integer NOT NULL,
  `captured_at` text NOT NULL,
  `source_hash` text NOT NULL,
  PRIMARY KEY (`import_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `player_prop_quote_snapshots` (
  `snapshot_key` text NOT NULL,
  `line_id` text NOT NULL,
  `game_id` text NOT NULL,
  `event_id` text NOT NULL,
  `book` text NOT NULL,
  `market` text NOT NULL,
  `player` text NOT NULL,
  `side` text NOT NULL,
  `point` real NOT NULL,
  `american_price` integer NOT NULL,
  `captured_at` text NOT NULL,
  `source_hash` text NOT NULL,
  `fetched_at` text NOT NULL,
  PRIMARY KEY (`snapshot_key`, `line_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_prop_snapshots_game_time`
  ON `player_prop_quote_snapshots` (`game_id`, `fetched_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_prop_snapshots_line`
  ON `player_prop_quote_snapshots` (`line_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_prop_stage_import`
  ON `player_prop_quotes_stage` (`import_id`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `edge_notification_state` (
  `observation_key` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `book` text NOT NULL,
  `market` text NOT NULL,
  `side` text NOT NULL,
  `point` real,
  `american_price` integer NOT NULL,
  `probability_edge` real NOT NULL,
  `snapshot_key` text NOT NULL,
  `captured_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_edge_notification_game`
  ON `edge_notification_state` (`game_id`, `market`, `book`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `web_push_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `recipient_id` text NOT NULL CHECK (`recipient_id` IN ('gabe', 'jarrett')),
  `endpoint` text UNIQUE NOT NULL,
  `expiration_time` real,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `revoked_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `web_push_deliveries` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('awaiting_you', 'edge_threshold')),
  `recipient_id` text NOT NULL CHECK (`recipient_id` IN ('gabe', 'jarrett')),
  `idempotency_key` text UNIQUE NOT NULL,
  `state` text NOT NULL CHECK (`state` IN ('pending', 'sent', 'failed')),
  `payload_json` text NOT NULL,
  `created_at` text NOT NULL,
  `sent_at` text,
  `last_error` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `web_push_attempts` (
  `delivery_id` text NOT NULL,
  `subscription_id` text NOT NULL,
  `state` text NOT NULL CHECK (`state` IN ('sent', 'failed')),
  `attempted_at` text NOT NULL,
  `response_status` integer,
  `error_message` text,
  PRIMARY KEY (`delivery_id`, `subscription_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_web_push_recipient`
  ON `web_push_subscriptions` (`recipient_id`, `revoked_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_web_push_delivery_state`
  ON `web_push_deliveries` (`recipient_id`, `state`, `created_at`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `qb_model_overrides` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `team` text NOT NULL,
  `value` real NOT NULL,
  `source_url` text NOT NULL,
  `rationale` text NOT NULL,
  `author_id` text NOT NULL,
  `created_at` text NOT NULL,
  `audit_hash` text UNIQUE NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_qb_overrides_game_time`
  ON `qb_model_overrides` (`game_id`, `team`, `created_at`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `weekly_digests` (
  `id` text PRIMARY KEY NOT NULL,
  `season` integer NOT NULL,
  `week` integer NOT NULL,
  `digest_json` text NOT NULL,
  `digest_hash` text NOT NULL,
  `generated_at` text NOT NULL,
  UNIQUE (`season`, `week`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_weekly_digests_season_week`
  ON `weekly_digests` (`season`, `week`);

--> statement-breakpoint
INSERT INTO `engine_schema_versions` (`version`, `migration_hash`, `applied_at`)
VALUES (
  '0019_engine_os_schema_closure',
  'sha256:9655dbc30cc725ed1b358cdcac3fcd3a441678e7a3d45bd31fa2c2a3f124b336',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
