DROP TRIGGER IF EXISTS `odds_quota_events_no_delete`;
DROP TRIGGER IF EXISTS `odds_quota_events_no_update`;
DROP TRIGGER IF EXISTS `forecast_origin_records_eligible_origin`;
DROP TRIGGER IF EXISTS `forecast_origin_records_no_delete`;
DROP TRIGGER IF EXISTS `forecast_origin_records_no_update`;
DROP TRIGGER IF EXISTS `forecast_origins_no_delete`;
DROP TRIGGER IF EXISTS `forecast_origins_no_update`;
DROP TRIGGER IF EXISTS `engine_activations_no_delete`;
DROP TRIGGER IF EXISTS `engine_activations_no_update`;
DROP TRIGGER IF EXISTS `game_kickoff_revisions_no_delete`;
DROP TRIGGER IF EXISTS `game_kickoff_revisions_no_update`;
DROP TRIGGER IF EXISTS `game_provider_aliases_no_delete`;
DROP TRIGGER IF EXISTS `game_provider_aliases_no_update`;
DROP TRIGGER IF EXISTS `canonical_games_no_delete`;
DROP TRIGGER IF EXISTS `canonical_games_no_update`;
DROP TRIGGER IF EXISTS `source_capture_manifests_no_delete`;
DROP TRIGGER IF EXISTS `source_capture_manifests_no_update`;
DROP TRIGGER IF EXISTS `engine_schema_versions_no_delete`;
DROP TRIGGER IF EXISTS `engine_schema_versions_no_update`;
DROP TABLE IF EXISTS `odds_quota_events`;
DROP TABLE IF EXISTS `forecast_origin_records`;
DROP TABLE IF EXISTS `engine_job_runs`;
DROP TABLE IF EXISTS `forecast_origins`;
DROP TABLE IF EXISTS `engine_activations`;
DROP TABLE IF EXISTS `game_kickoff_revisions`;
DROP TABLE IF EXISTS `game_provider_aliases`;
DROP TABLE IF EXISTS `canonical_games`;
DROP TABLE IF EXISTS `engine_system_alerts`;
DROP TABLE IF EXISTS `source_capture_heartbeats`;
DROP TABLE IF EXISTS `source_capture_manifests`;
DROP TABLE IF EXISTS `engine_schema_versions`;

-- R2 objects are deliberately untouched. A rollback removes only D1 pointers
-- and urgent scheduler state, so immutable source evidence remains recoverable.
