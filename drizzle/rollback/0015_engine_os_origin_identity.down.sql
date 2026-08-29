DROP TRIGGER IF EXISTS `forecast_origin_versions_no_delete`;
DROP TRIGGER IF EXISTS `forecast_origin_versions_no_update`;
DROP TRIGGER IF EXISTS `forecast_origin_versions_schedule_guard`;
DROP TRIGGER IF EXISTS `forecast_origin_versions_chain_guard`;
DROP INDEX IF EXISTS `idx_forecast_origin_version_due`;
DROP INDEX IF EXISTS `idx_forecast_origin_version_head`;
DROP INDEX IF EXISTS `idx_forecast_origin_version_single_successor`;
DROP TABLE IF EXISTS `forecast_origin_versions`;

DROP TRIGGER IF EXISTS `game_provider_aliases_identity_guard`;

DROP TRIGGER IF EXISTS `game_schedule_revisions_no_delete`;
DROP TRIGGER IF EXISTS `game_schedule_revisions_no_update`;
DROP TRIGGER IF EXISTS `game_schedule_revisions_chain_guard`;
DROP INDEX IF EXISTS `idx_game_schedule_revision_latest`;
DROP INDEX IF EXISTS `idx_game_schedule_revision_single_successor`;
DROP TABLE IF EXISTS `game_schedule_revisions`;

DROP TRIGGER IF EXISTS `engine_schema_versions_no_delete`;
DELETE FROM `engine_schema_versions` WHERE `version` = '0015_engine_os_origin_identity';
CREATE TRIGGER `engine_schema_versions_no_delete`
  BEFORE DELETE ON `engine_schema_versions`
  BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;
