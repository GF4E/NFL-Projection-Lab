-- Cloudflare D1 rejects ephemeral schema writes with SQLITE_AUTH.  Use an
-- ordinary guard table inside D1's implicit file transaction instead.  A
-- refused rollback unwinds its creation; a permitted rollback drops it below.
CREATE TABLE IF NOT EXISTS `_os15a_rollback_guard` (`guard` integer NOT NULL);
DROP TRIGGER IF EXISTS `_os15a_rollback_requires_empty`;
CREATE TRIGGER `_os15a_rollback_requires_empty`
  BEFORE INSERT ON `_os15a_rollback_guard`
  WHEN
    EXISTS (SELECT 1 FROM `engine_scheduler_ticks_v2` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `engine_scheduler_events_v2` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `engine_origin_jobs_v2` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `engine_origin_attempts_v2` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `engine_origin_records_v2` LIMIT 1)
  BEGIN
    SELECT RAISE(ABORT, 'OS-15A rollback requires every interim scheduler table to be empty');
  END;
INSERT INTO `_os15a_rollback_guard` (`guard`) VALUES (1);
DROP TRIGGER `_os15a_rollback_requires_empty`;
DROP TABLE `_os15a_rollback_guard`;

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
