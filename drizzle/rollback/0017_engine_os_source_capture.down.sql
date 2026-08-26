-- D1 executes migrations in an implicit transaction and rejects TEMP schema
-- writes. This ordinary guard table makes a non-empty rollback fail atomically.
CREATE TABLE IF NOT EXISTS `_os03a_rollback_guard` (`guard` integer NOT NULL);
DROP TRIGGER IF EXISTS `_os03a_rollback_requires_empty`;
CREATE TRIGGER `_os03a_rollback_requires_empty`
  BEFORE INSERT ON `_os03a_rollback_guard`
  WHEN
    EXISTS (SELECT 1 FROM `source_capture_manifest_extensions` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `source_capture_events` LIMIT 1)
  BEGIN
    SELECT RAISE(ABORT, 'OS-03A rollback requires both additive source-capture tables to be empty');
  END;
INSERT INTO `_os03a_rollback_guard` (`guard`) VALUES (1);
DROP TRIGGER `_os03a_rollback_requires_empty`;
DROP TABLE `_os03a_rollback_guard`;

DROP TRIGGER IF EXISTS `source_capture_events_no_delete`;
DROP TRIGGER IF EXISTS `source_capture_events_no_update`;
DROP TRIGGER IF EXISTS `source_capture_events_insert_guard`;
DROP TRIGGER IF EXISTS `source_capture_heartbeats_os03a_update_guard`;
DROP TRIGGER IF EXISTS `source_capture_heartbeats_os03a_insert_guard`;
DROP TRIGGER IF EXISTS `source_capture_manifest_extensions_no_delete`;
DROP TRIGGER IF EXISTS `source_capture_manifest_extensions_no_update`;
DROP TRIGGER IF EXISTS `source_capture_manifest_extensions_insert_guard`;

DROP INDEX IF EXISTS `idx_source_capture_events_capture`;
DROP INDEX IF EXISTS `idx_source_capture_events_source`;
DROP TABLE IF EXISTS `source_capture_events`;
DROP INDEX IF EXISTS `idx_source_capture_extension_evidence`;
DROP INDEX IF EXISTS `idx_source_capture_extension_source`;
DROP TABLE IF EXISTS `source_capture_manifest_extensions`;

DROP TRIGGER IF EXISTS `engine_schema_versions_no_delete`;
DELETE FROM `engine_schema_versions` WHERE `version` = '0017_engine_os_source_capture';
CREATE TRIGGER `engine_schema_versions_no_delete`
  BEFORE DELETE ON `engine_schema_versions`
  BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;

-- R2 is outside D1 and is deliberately untouched. Immutable objects survive
-- every permitted rollback for later forensic recovery.
