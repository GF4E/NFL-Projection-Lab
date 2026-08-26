DROP TRIGGER IF EXISTS `engine_origin_records_v2_no_delete`;
DROP TRIGGER IF EXISTS `engine_origin_records_v2_no_update`;
DROP TRIGGER IF EXISTS `engine_origin_records_v2_finalize_job`;
DROP TRIGGER IF EXISTS `engine_origin_records_v2_publication_guard`;
DROP TRIGGER IF EXISTS `engine_scheduler_events_v2_no_delete`;
DROP TRIGGER IF EXISTS `engine_scheduler_events_v2_no_update`;
DROP TRIGGER IF EXISTS `engine_origin_attempts_v2_no_delete`;
DROP TRIGGER IF EXISTS `engine_origin_attempts_v2_no_update`;
DROP TRIGGER IF EXISTS `engine_origin_jobs_v2_attempt_log`;
DROP TRIGGER IF EXISTS `engine_origin_jobs_v2_no_delete`;
DROP TRIGGER IF EXISTS `engine_origin_jobs_v2_update_guard`;
DROP TRIGGER IF EXISTS `engine_origin_jobs_v2_insert_guard`;
DROP TRIGGER IF EXISTS `engine_scheduler_ticks_v2_no_delete`;
DROP TRIGGER IF EXISTS `engine_scheduler_ticks_v2_update_guard`;
DROP TRIGGER IF EXISTS `engine_scheduler_ticks_v2_insert_guard`;

DROP INDEX IF EXISTS `idx_engine_origin_records_v2_origin`;
DROP TABLE IF EXISTS `engine_origin_records_v2`;
DROP INDEX IF EXISTS `idx_engine_scheduler_events_v2_job`;
DROP INDEX IF EXISTS `idx_engine_scheduler_events_v2_tick`;
DROP TABLE IF EXISTS `engine_scheduler_events_v2`;
DROP INDEX IF EXISTS `idx_engine_origin_attempts_v2_origin`;
DROP TABLE IF EXISTS `engine_origin_attempts_v2`;
DROP INDEX IF EXISTS `idx_engine_origin_jobs_v2_lease`;
DROP INDEX IF EXISTS `idx_engine_origin_jobs_v2_due`;
DROP TABLE IF EXISTS `engine_origin_jobs_v2`;
DROP INDEX IF EXISTS `idx_engine_scheduler_ticks_v2_lease`;
DROP INDEX IF EXISTS `idx_engine_scheduler_ticks_v2_watchdog`;
DROP TABLE IF EXISTS `engine_scheduler_ticks_v2`;

DROP TRIGGER IF EXISTS `engine_schema_versions_no_delete`;
DELETE FROM `engine_schema_versions` WHERE `version` = '0016_engine_os_interim_scheduler';
CREATE TRIGGER `engine_schema_versions_no_delete`
  BEFORE DELETE ON `engine_schema_versions`
  BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;
