-- OS-01 schema-closure rollback is permitted only before any adopted table has
-- data. A production database with pre-existing runtime-owned objects requires
-- a verified restore or forward repair; this file must not delete adopted data.
-- Cloudflare D1 executes the complete file transactionally.
CREATE TABLE IF NOT EXISTS `_os01_schema_closure_rollback_guard` (`guard` integer NOT NULL);
DROP TRIGGER IF EXISTS `_os01_schema_closure_rollback_requires_0020_absent`;
CREATE TRIGGER `_os01_schema_closure_rollback_requires_0020_absent`
  BEFORE INSERT ON `_os01_schema_closure_rollback_guard`
  WHEN EXISTS (
    SELECT 1 FROM `engine_schema_versions`
    WHERE `version` = '0020_engine_os_plays_reconciliation'
  )
  BEGIN
    SELECT RAISE(ABORT, 'OS-01 schema-closure rollback requires 0020 to be rolled back first');
  END;
DROP TRIGGER IF EXISTS `_os01_schema_closure_rollback_requires_empty`;
CREATE TRIGGER `_os01_schema_closure_rollback_requires_empty`
  BEFORE INSERT ON `_os01_schema_closure_rollback_guard`
  WHEN
    EXISTS (SELECT 1 FROM `play_state_audit` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `play_clv_audit` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `play_correction_audit` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `model_lifecycle_state` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `team_strength_states` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `team_strength_states_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `rolling_feature_states` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `rolling_feature_states_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `model_versions` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `model_system_alerts` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `nfl_games_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `nfl_team_game_features_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `nfl_player_week_stats` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `nfl_player_week_stats_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `nfl_player_snap_counts` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `nfl_player_snap_counts_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `game_context_alerts` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `official_injury_import_state` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `official_injury_reports` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `official_injury_reports_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `official_pregame_context_state` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `official_inactives` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `official_inactives_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `official_pregame_context_snapshots` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `kickoff_weather_current` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `kickoff_weather_snapshots` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `kickoff_weather_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `kickoff_weather_state` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `kickoff_weather_alerts` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `player_prop_quotes_stage` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `player_prop_quote_snapshots` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `edge_notification_state` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `web_push_subscriptions` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `web_push_deliveries` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `web_push_attempts` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `qb_model_overrides` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `weekly_digests` LIMIT 1)
  BEGIN
    SELECT RAISE(ABORT, 'OS-01 schema-closure rollback requires every adopted table to be empty');
  END;
INSERT INTO `_os01_schema_closure_rollback_guard` (`guard`) VALUES (1);
DROP TRIGGER `_os01_schema_closure_rollback_requires_0020_absent`;
DROP TRIGGER `_os01_schema_closure_rollback_requires_empty`;
DROP TABLE `_os01_schema_closure_rollback_guard`;

DROP INDEX IF EXISTS `idx_weekly_digests_season_week`;
DROP TABLE IF EXISTS `weekly_digests`;
DROP INDEX IF EXISTS `idx_qb_overrides_game_time`;
DROP TABLE IF EXISTS `qb_model_overrides`;
DROP INDEX IF EXISTS `idx_web_push_delivery_state`;
DROP INDEX IF EXISTS `idx_web_push_recipient`;
DROP TABLE IF EXISTS `web_push_attempts`;
DROP TABLE IF EXISTS `web_push_deliveries`;
DROP TABLE IF EXISTS `web_push_subscriptions`;
DROP INDEX IF EXISTS `idx_edge_notification_game`;
DROP TABLE IF EXISTS `edge_notification_state`;
DROP INDEX IF EXISTS `idx_prop_stage_import`;
DROP INDEX IF EXISTS `idx_prop_snapshots_line`;
DROP INDEX IF EXISTS `idx_prop_snapshots_game_time`;
DROP TABLE IF EXISTS `player_prop_quote_snapshots`;
DROP TABLE IF EXISTS `player_prop_quotes_stage`;
DROP INDEX IF EXISTS `idx_weather_alerts_unresolved`;
DROP INDEX IF EXISTS `idx_weather_snapshots_game`;
DROP TABLE IF EXISTS `kickoff_weather_alerts`;
DROP TABLE IF EXISTS `kickoff_weather_state`;
DROP TABLE IF EXISTS `kickoff_weather_stage`;
DROP TABLE IF EXISTS `kickoff_weather_snapshots`;
DROP TABLE IF EXISTS `kickoff_weather_current`;
DROP INDEX IF EXISTS `idx_pregame_snapshots_game`;
DROP INDEX IF EXISTS `idx_pregame_context_week`;
DROP INDEX IF EXISTS `idx_official_inactives_game`;
DROP INDEX IF EXISTS `idx_context_alerts_unresolved`;
DROP INDEX IF EXISTS `idx_official_injuries_team`;
DROP INDEX IF EXISTS `idx_official_injuries_week`;
DROP TABLE IF EXISTS `official_pregame_context_snapshots`;
DROP TABLE IF EXISTS `official_inactives_stage`;
DROP TABLE IF EXISTS `official_inactives`;
DROP TABLE IF EXISTS `official_pregame_context_state`;
DROP TABLE IF EXISTS `official_injury_reports_stage`;
DROP TABLE IF EXISTS `official_injury_reports`;
DROP TABLE IF EXISTS `official_injury_import_state`;
DROP TABLE IF EXISTS `game_context_alerts`;
DROP INDEX IF EXISTS `idx_nfl_snap_counts_game_player`;
DROP INDEX IF EXISTS `idx_nfl_player_stats_game`;
DROP INDEX IF EXISTS `idx_nfl_player_stats_name`;
DROP TABLE IF EXISTS `nfl_player_snap_counts_stage`;
DROP TABLE IF EXISTS `nfl_player_snap_counts`;
DROP TABLE IF EXISTS `nfl_player_week_stats_stage`;
DROP TABLE IF EXISTS `nfl_player_week_stats`;
DROP TABLE IF EXISTS `nfl_team_game_features_stage`;
DROP TABLE IF EXISTS `nfl_games_stage`;
DROP INDEX IF EXISTS `idx_model_runs_completed`;
DROP INDEX IF EXISTS `idx_model_versions_status`;
DROP TABLE IF EXISTS `model_system_alerts`;
DROP TABLE IF EXISTS `model_versions`;
DROP TABLE IF EXISTS `rolling_feature_states_stage`;
DROP TABLE IF EXISTS `rolling_feature_states`;
DROP TABLE IF EXISTS `team_strength_states_stage`;
DROP TABLE IF EXISTS `team_strength_states`;
DROP TABLE IF EXISTS `model_lifecycle_state`;
DROP INDEX IF EXISTS `idx_play_state_audit_play`;
DROP TABLE IF EXISTS `play_correction_audit`;
DROP TABLE IF EXISTS `play_clv_audit`;
DROP TABLE IF EXISTS `play_state_audit`;

DROP TRIGGER IF EXISTS `engine_schema_versions_no_delete`;
DELETE FROM `engine_schema_versions` WHERE `version` = '0019_engine_os_schema_closure';
CREATE TRIGGER `engine_schema_versions_no_delete`
  BEFORE DELETE ON `engine_schema_versions`
  BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;
