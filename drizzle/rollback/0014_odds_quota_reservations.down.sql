DROP TRIGGER IF EXISTS `odds_quota_reservation_events_no_delete`;
DROP TRIGGER IF EXISTS `odds_quota_reservation_events_no_update`;
DROP TABLE IF EXISTS `odds_quota_reservation_events`;
DROP TABLE IF EXISTS `odds_quota_reservations`;
DROP TABLE IF EXISTS `odds_quota_control`;
DROP TRIGGER IF EXISTS `odds_quota_epochs_no_delete`;
DROP TRIGGER IF EXISTS `odds_quota_epochs_no_update`;
DROP TABLE IF EXISTS `odds_quota_epochs`;

DROP TRIGGER IF EXISTS `engine_schema_versions_no_delete`;
DELETE FROM `engine_schema_versions` WHERE `version` = '0014_odds_quota_reservations';
CREATE TRIGGER `engine_schema_versions_no_delete`
  BEFORE DELETE ON `engine_schema_versions`
  BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;
