-- Isolated empty-schema rollback only. Production recovery is a verified D1
-- restore or a forward repair; it never discards populated personal-state rows.
CREATE TABLE IF NOT EXISTS `_os01_plays_rollback_guard` (`guard` integer NOT NULL);
DROP TRIGGER IF EXISTS `_os01_plays_rollback_requires_empty`;
CREATE TRIGGER `_os01_plays_rollback_requires_empty`
  BEFORE INSERT ON `_os01_plays_rollback_guard`
  WHEN
    EXISTS (SELECT 1 FROM `plays` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `play_state_audit` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `play_clv_audit` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `play_correction_audit` LIMIT 1) OR
    EXISTS (SELECT 1 FROM `play_settlement_audit` LIMIT 1)
  BEGIN
    SELECT RAISE(ABORT, 'OS-01 plays rollback requires every play and play-audit table to be empty');
  END;
INSERT INTO `_os01_plays_rollback_guard` (`guard`) VALUES (1);
DROP TRIGGER `_os01_plays_rollback_requires_empty`;
DROP TABLE `_os01_plays_rollback_guard`;

DROP TRIGGER IF EXISTS `approval_portfolio_guard_v2`;
DROP TRIGGER IF EXISTS `approval_contract_guard_v6`;
DROP TRIGGER IF EXISTS `approval_execution_state_guard_v1`;
DROP INDEX IF EXISTS `idx_plays_season_week_status`;
DROP INDEX IF EXISTS `idx_plays_created_at`;

CREATE TABLE `plays__os01_prior` (
	`id` text PRIMARY KEY NOT NULL,
	`season` integer DEFAULT 2026 NOT NULL,
	`week` integer NOT NULL,
	`play_type` text NOT NULL,
	`title` text NOT NULL,
	`legs` text DEFAULT '' NOT NULL,
	`book` text NOT NULL,
	`american_odds` integer NOT NULL,
	`stake_cents` integer NOT NULL,
	`model_edge_pp` real NOT NULL,
	`estimated_ev_percent` real NOT NULL,
	`confidence` text NOT NULL,
	`stats_case` text NOT NULL,
	`football_case` text DEFAULT 'Awaiting football read' NOT NULL,
	`status` text DEFAULT 'card' NOT NULL,
	`result` text DEFAULT 'pending' NOT NULL,
	`profit_cents` integer DEFAULT 0 NOT NULL,
	`closing_clv_cents` real,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`game_id` text DEFAULT '' NOT NULL,
	`market` text DEFAULT 'spread' NOT NULL,
	`primary_reason` text DEFAULT 'other' NOT NULL,
	`picked_by` text DEFAULT 'gabe' NOT NULL,
	`contract_json` text DEFAULT '[]' NOT NULL,
	`execution_status` text DEFAULT 'paper' NOT NULL,
	`cash_placement_confirmed` integer DEFAULT 0 NOT NULL,
	`forecast_json` text,
	CONSTRAINT `plays_play_type_check` CHECK (`play_type` IN ('single', 'parlay', 'teaser')),
	CONSTRAINT `plays_confidence_check` CHECK (`confidence` IN ('watch', 'lean', 'play', 'best')),
	CONSTRAINT `plays_status_check` CHECK (`status` IN ('research', 'card', 'placed', 'settled', 'passed')),
	CONSTRAINT `plays_result_check` CHECK (`result` IN ('pending', 'win', 'loss', 'push', 'void')),
	CONSTRAINT `plays_stake_check` CHECK (`stake_cents` >= 1250)
);
DROP TABLE `plays`;
ALTER TABLE `plays__os01_prior` RENAME TO `plays`;
CREATE INDEX `idx_plays_season_week_status` ON `plays` (`season`, `week`, `status`);
CREATE INDEX `idx_plays_created_at` ON `plays` (`created_at`);

DROP TRIGGER IF EXISTS `engine_schema_versions_no_delete`;
DELETE FROM `engine_schema_versions` WHERE `version` = '0020_engine_os_plays_reconciliation';
CREATE TRIGGER `engine_schema_versions_no_delete`
  BEFORE DELETE ON `engine_schema_versions`
  BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;
