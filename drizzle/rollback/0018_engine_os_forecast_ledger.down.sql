-- Cloudflare D1 runs migrations inside its own transaction. This ordinary
-- guard table makes rollback fail closed using only persistent-schema SQL.
CREATE TABLE IF NOT EXISTS `_os13a_rollback_guard` (`guard` integer NOT NULL);
DROP TRIGGER IF EXISTS `_os13a_rollback_requires_empty`;
CREATE TRIGGER `_os13a_rollback_requires_empty`
  BEFORE INSERT ON `_os13a_rollback_guard`
  WHEN
    EXISTS (SELECT 1 FROM `forecast_ledger_events_v1` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `forecast_ledger_records_v1` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `forecast_ledger_attempts_v1` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `forecast_ledger_jobs_v1` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `forecast_ledger_activations_v1` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `forecast_ledger_qualifications_v1` LIMIT 1)
  BEGIN
    SELECT RAISE(ABORT, 'OS-13A rollback requires every forecast-ledger table to be empty');
  END;
INSERT INTO `_os13a_rollback_guard` (`guard`) VALUES (1);
DROP TRIGGER `_os13a_rollback_requires_empty`;
DROP TABLE `_os13a_rollback_guard`;

DROP TRIGGER IF EXISTS `forecast_ledger_events_v1_no_delete`;
DROP TRIGGER IF EXISTS `forecast_ledger_events_v1_no_update`;
DROP TRIGGER IF EXISTS `forecast_ledger_events_v1_identity_collision_guard`;
DROP TRIGGER IF EXISTS `forecast_ledger_records_v1_no_delete`;
DROP TRIGGER IF EXISTS `forecast_ledger_records_v1_no_update`;
DROP TRIGGER IF EXISTS `forecast_ledger_records_v1_finalize_job`;
DROP TRIGGER IF EXISTS `forecast_ledger_records_v1_publication_guard`;
DROP TRIGGER IF EXISTS `forecast_ledger_attempts_v1_no_delete`;
DROP TRIGGER IF EXISTS `forecast_ledger_attempts_v1_no_update`;
DROP TRIGGER IF EXISTS `forecast_ledger_attempts_v1_insert_guard`;
DROP TRIGGER IF EXISTS `forecast_ledger_jobs_v1_no_delete`;
DROP TRIGGER IF EXISTS `forecast_ledger_jobs_v1_update_guard`;
DROP TRIGGER IF EXISTS `forecast_ledger_jobs_v1_insert_guard`;
DROP TRIGGER IF EXISTS `forecast_ledger_activations_v1_no_delete`;
DROP TRIGGER IF EXISTS `forecast_ledger_activations_v1_no_update`;
DROP TRIGGER IF EXISTS `forecast_ledger_activations_v1_insert_guard`;
DROP TRIGGER IF EXISTS `forecast_ledger_qualifications_v1_no_delete`;
DROP TRIGGER IF EXISTS `forecast_ledger_qualifications_v1_no_update`;
DROP TRIGGER IF EXISTS `forecast_ledger_qualifications_v1_receipt_guard`;

DROP INDEX IF EXISTS `idx_forecast_ledger_events_v1_job`;
DROP INDEX IF EXISTS `idx_forecast_ledger_events_v1_origin`;
DROP TABLE IF EXISTS `forecast_ledger_events_v1`;
DROP INDEX IF EXISTS `idx_forecast_ledger_records_v1_prospective`;
DROP INDEX IF EXISTS `idx_forecast_ledger_records_v1_origin`;
DROP TABLE IF EXISTS `forecast_ledger_records_v1`;
DROP INDEX IF EXISTS `idx_forecast_ledger_attempts_v1_origin`;
DROP TABLE IF EXISTS `forecast_ledger_attempts_v1`;
DROP INDEX IF EXISTS `idx_forecast_ledger_jobs_v1_lease`;
DROP INDEX IF EXISTS `idx_forecast_ledger_jobs_v1_due`;
DROP TABLE IF EXISTS `forecast_ledger_jobs_v1`;
DROP INDEX IF EXISTS `idx_forecast_ledger_activations_v1_boundary`;
DROP TABLE IF EXISTS `forecast_ledger_activations_v1`;
DROP INDEX IF EXISTS `idx_forecast_ledger_qualifications_v1_status`;
DROP TABLE IF EXISTS `forecast_ledger_qualifications_v1`;

DROP TRIGGER IF EXISTS `engine_schema_versions_no_delete`;
DELETE FROM `engine_schema_versions` WHERE `version` = '0018_engine_os_forecast_ledger';
CREATE TRIGGER `engine_schema_versions_no_delete`
  BEFORE DELETE ON `engine_schema_versions`
  BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;
