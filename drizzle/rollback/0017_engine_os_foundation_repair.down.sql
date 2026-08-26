-- Migration 0017 repairs objects owned by accepted migrations 0004, 0013, and 0014.
-- Its rollback therefore removes only its own receipt. Repaired schema and
-- accepted owner-attested bootstrap state are deliberately preserved.
DROP TRIGGER IF EXISTS `engine_schema_versions_no_delete`;
DELETE FROM `engine_schema_versions`
WHERE `version` = '0017_engine_os_foundation_repair';
CREATE TRIGGER `engine_schema_versions_no_delete`
  BEFORE DELETE ON `engine_schema_versions`
  BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;
