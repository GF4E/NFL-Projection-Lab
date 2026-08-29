-- OS-01 plays reconciliation.
--
-- This migration supports only the two prestates frozen by the OS-01 contract:
-- (1) the ordered 0000-0019 replay, and (2) the exact production census in
-- which `plays` is absent. A preflight verifier must reject any other existing
-- `plays` shape before this SQL is applied. In particular, a runtime-mutated
-- table with values in the five formerly unmanaged columns is not silently
-- adopted by this static migration.

-- Materialize the common predecessor when the exact production census has no
-- legacy personal-state table. On an ordered blank replay this is a no-op.
CREATE TABLE IF NOT EXISTS `plays` (
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
--> statement-breakpoint
DROP TRIGGER IF EXISTS `approval_portfolio_guard_v1`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `approval_portfolio_guard_v2`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `approval_contract_guard_v6`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `approval_execution_state_guard_v1`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_plays_season_week_status`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_plays_created_at`;
--> statement-breakpoint
CREATE TABLE `plays__os01_next` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_key` text DEFAULT '' NOT NULL,
	`contract_json` text DEFAULT '[]' NOT NULL,
	`forecast_json` text,
	`gabe_approved` integer DEFAULT 0 NOT NULL,
	`jarrett_approved` integer DEFAULT 0 NOT NULL,
	`season` integer DEFAULT 2026 NOT NULL,
	`week` integer NOT NULL,
	`game_id` text DEFAULT '' NOT NULL,
	`play_type` text NOT NULL,
	`market` text DEFAULT 'spread' NOT NULL,
	`primary_reason` text DEFAULT 'other' NOT NULL,
	`picked_by` text DEFAULT 'gabe' NOT NULL,
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
	`execution_status` text DEFAULT 'paper' NOT NULL,
	`cash_placement_confirmed` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'card' NOT NULL,
	`result` text DEFAULT 'pending' NOT NULL,
	`profit_cents` integer DEFAULT 0 NOT NULL,
	`closing_clv_cents` real,
	`closing_clv_points` real,
	`clv_reference_book` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `plays_play_type_check` CHECK (`play_type` IN ('single', 'parlay', 'teaser')),
	CONSTRAINT `plays_confidence_check` CHECK (`confidence` IN ('watch', 'lean', 'play', 'best')),
	CONSTRAINT `plays_execution_status_check` CHECK (`execution_status` IN ('paper', 'executed')),
	CONSTRAINT `plays_status_check` CHECK (`status` IN ('research', 'card', 'placed', 'settled', 'passed')),
	CONSTRAINT `plays_result_check` CHECK (`result` IN ('pending', 'win', 'loss', 'push', 'void')),
	CONSTRAINT `plays_stake_check` CHECK (`stake_cents` >= 1250)
);
--> statement-breakpoint
INSERT INTO `plays__os01_next` (
	`id`, `contract_key`, `contract_json`, `forecast_json`, `gabe_approved`, `jarrett_approved`,
	`season`, `week`, `game_id`, `play_type`, `market`, `primary_reason`, `picked_by`, `title`,
	`legs`, `book`, `american_odds`, `stake_cents`, `model_edge_pp`, `estimated_ev_percent`,
	`confidence`, `stats_case`, `football_case`, `execution_status`, `cash_placement_confirmed`,
	`status`, `result`, `profit_cents`, `closing_clv_cents`, `closing_clv_points`,
	`clv_reference_book`, `created_by`, `created_at`, `updated_at`
)
SELECT
	`id`, '', `contract_json`, `forecast_json`, 0, 0,
	`season`, `week`, `game_id`, `play_type`, `market`, `primary_reason`, `picked_by`, `title`,
	`legs`, `book`, `american_odds`, `stake_cents`, `model_edge_pp`, `estimated_ev_percent`,
	`confidence`, `stats_case`, `football_case`, `execution_status`, `cash_placement_confirmed`,
	`status`, `result`, `profit_cents`, `closing_clv_cents`, NULL,
	NULL, `created_by`, `created_at`, `updated_at`
FROM `plays`;
--> statement-breakpoint
-- Prove exact preservation before the destructive half of the rebuild. The
-- bidirectional EXCEPT checks are stronger than a content hash: they compare
-- every common value with SQLite's NULL-aware set semantics. The replacement
-- table has already enforced all successor NOT NULL and CHECK constraints.
CREATE TABLE `_os01_plays_copy_guard` (`guard` integer NOT NULL);
--> statement-breakpoint
CREATE TRIGGER `_os01_plays_copy_must_match`
  BEFORE INSERT ON `_os01_plays_copy_guard`
  WHEN
    (SELECT COUNT(*) FROM `plays`) <> (SELECT COUNT(*) FROM `plays__os01_next`) OR
    EXISTS (
      SELECT
        `id`, `contract_json`, `forecast_json`, `season`, `week`, `game_id`, `play_type`,
        `market`, `primary_reason`, `picked_by`, `title`, `legs`, `book`, `american_odds`,
        `stake_cents`, `model_edge_pp`, `estimated_ev_percent`, `confidence`, `stats_case`,
        `football_case`, `execution_status`, `cash_placement_confirmed`, `status`, `result`,
        `profit_cents`, `closing_clv_cents`, `created_by`, `created_at`, `updated_at`
      FROM `plays`
      EXCEPT
      SELECT
        `id`, `contract_json`, `forecast_json`, `season`, `week`, `game_id`, `play_type`,
        `market`, `primary_reason`, `picked_by`, `title`, `legs`, `book`, `american_odds`,
        `stake_cents`, `model_edge_pp`, `estimated_ev_percent`, `confidence`, `stats_case`,
        `football_case`, `execution_status`, `cash_placement_confirmed`, `status`, `result`,
        `profit_cents`, `closing_clv_cents`, `created_by`, `created_at`, `updated_at`
      FROM `plays__os01_next`
    ) OR
    EXISTS (
      SELECT
        `id`, `contract_json`, `forecast_json`, `season`, `week`, `game_id`, `play_type`,
        `market`, `primary_reason`, `picked_by`, `title`, `legs`, `book`, `american_odds`,
        `stake_cents`, `model_edge_pp`, `estimated_ev_percent`, `confidence`, `stats_case`,
        `football_case`, `execution_status`, `cash_placement_confirmed`, `status`, `result`,
        `profit_cents`, `closing_clv_cents`, `created_by`, `created_at`, `updated_at`
      FROM `plays__os01_next`
      EXCEPT
      SELECT
        `id`, `contract_json`, `forecast_json`, `season`, `week`, `game_id`, `play_type`,
        `market`, `primary_reason`, `picked_by`, `title`, `legs`, `book`, `american_odds`,
        `stake_cents`, `model_edge_pp`, `estimated_ev_percent`, `confidence`, `stats_case`,
        `football_case`, `execution_status`, `cash_placement_confirmed`, `status`, `result`,
        `profit_cents`, `closing_clv_cents`, `created_by`, `created_at`, `updated_at`
      FROM `plays`
    ) OR
    EXISTS (
      SELECT 1 FROM `plays__os01_next`
      WHERE `contract_key` <> '' OR `gabe_approved` <> 0 OR `jarrett_approved` <> 0
        OR `closing_clv_points` IS NOT NULL OR `clv_reference_book` IS NOT NULL
    )
  BEGIN
    SELECT RAISE(ABORT, 'OS-01 plays copy verification failed before swap');
  END;
--> statement-breakpoint
INSERT INTO `_os01_plays_copy_guard` (`guard`) VALUES (1);
--> statement-breakpoint
DROP TRIGGER `_os01_plays_copy_must_match`;
--> statement-breakpoint
DROP TABLE `_os01_plays_copy_guard`;
--> statement-breakpoint
DROP TABLE `plays`;
--> statement-breakpoint
ALTER TABLE `plays__os01_next` RENAME TO `plays`;
--> statement-breakpoint
CREATE INDEX `idx_plays_season_week_status` ON `plays` (`season`, `week`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_plays_created_at` ON `plays` (`created_at`);
--> statement-breakpoint
CREATE TRIGGER `approval_contract_guard_v6`
  BEFORE UPDATE OF `status` ON `plays`
  WHEN OLD.`status` = 'research' AND NEW.`status` = 'card'
  BEGIN
    SELECT CASE WHEN NEW.`forecast_json` IS NULL
      OR json_valid(NEW.`forecast_json`) = 0
      OR NULLIF(json_extract(NEW.`forecast_json`, '$.configHash'), '') IS NULL
      OR NULLIF(json_extract(NEW.`forecast_json`, '$.dataHash'), '') IS NULL
      OR NULLIF(json_extract(NEW.`forecast_json`, '$.consensusSnapshotId'), '') IS NULL
      OR json_array_length(json_extract(NEW.`forecast_json`, '$.legs')) <> json_array_length(NEW.`contract_json`)
    THEN RAISE(ABORT, 'Approval requires a complete forecast and consensus snapshot') END;

    SELECT CASE WHEN json_valid(NEW.`contract_json`) = 0
      OR json_type(NEW.`contract_json`) <> 'array'
      OR json_array_length(NEW.`contract_json`) = 0
    THEN RAISE(ABORT, 'A stored contract must contain at least one leg') END;

    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM json_each(NEW.`contract_json`)
      WHERE NULLIF(TRIM(COALESCE(json_extract(value, '$.sourceQuoteId'), '')), '') IS NULL
    ) THEN RAISE(ABORT, 'Every contract leg must reference its live source quote') END;

    SELECT CASE WHEN (
      SELECT COUNT(*) FROM json_each(NEW.`contract_json`)
    ) <> (
      SELECT COUNT(DISTINCT json_extract(value, '$.sourceQuoteId')) FROM json_each(NEW.`contract_json`)
    ) THEN RAISE(ABORT, 'A source quote can appear only once in a contract') END;

    SELECT CASE WHEN NEW.`play_type` = 'single' AND (
      json_array_length(NEW.`contract_json`) <> 1
      OR NEW.`market` <> json_extract(NEW.`contract_json`, '$[0].market')
      OR NEW.`game_id` <> json_extract(NEW.`contract_json`, '$[0].gameId')
      OR json_extract(NEW.`contract_json`, '$[0].market') = 'teaser'
    ) THEN RAISE(ABORT, 'A straight contract must contain exactly one matching leg') END;

    SELECT CASE WHEN NEW.`play_type` = 'parlay' AND (
      NEW.`market` <> 'parlay'
      OR json_array_length(NEW.`contract_json`) < 2
      OR EXISTS (
        SELECT 1 FROM json_each(NEW.`contract_json`)
        WHERE json_extract(value, '$.market') = 'teaser'
      )
      OR (SELECT COUNT(DISTINCT json_extract(value, '$.gameId')) FROM json_each(NEW.`contract_json`))
        <> json_array_length(NEW.`contract_json`)
    ) THEN RAISE(ABORT, 'Parlay legs must be valid independent-game contracts') END;

    SELECT CASE WHEN NEW.`play_type` = 'teaser' AND (
      NEW.`market` <> 'teaser'
      OR json_array_length(NEW.`contract_json`) <> 2
      OR EXISTS (
        SELECT 1 FROM json_each(NEW.`contract_json`)
        WHERE json_extract(value, '$.market') <> 'teaser'
      )
      OR (SELECT COUNT(DISTINCT json_extract(value, '$.gameId')) FROM json_each(NEW.`contract_json`)) <> 2
    ) THEN RAISE(ABORT, 'Teaser legs must be valid two-game teaser contracts') END;

    SELECT CASE WHEN NEW.`play_type` = 'teaser' AND (
      json_extract(NEW.`forecast_json`, '$.authoritativeExpectedValuePercent') IS NULL
      OR json_extract(NEW.`forecast_json`, '$.authoritativeExpectedValuePercent') < 0
    ) THEN RAISE(ABORT, 'The exact two-team teaser price must have nonnegative EV') END;

    SELECT CASE WHEN NEW.`play_type` = 'parlay' AND EXISTS (
      SELECT 1 FROM json_each(json_extract(NEW.`forecast_json`, '$.legs'))
      WHERE COALESCE(json_extract(value, '$.pushProbability'), -1) <> 0
    ) THEN RAISE(ABORT, 'Parlay approval is withheld when a leg can push') END;

    SELECT CASE WHEN NEW.`play_type` = 'parlay' AND (
      json_extract(NEW.`forecast_json`, '$.authoritativeExpectedValuePercent') IS NULL
      OR json_extract(NEW.`forecast_json`, '$.authoritativeExpectedValuePercent') < 0
    ) THEN RAISE(ABORT, 'The exact independent-game parlay must have nonnegative EV') END;

    SELECT CASE WHEN NEW.`play_type` IN ('single', 'parlay') AND EXISTS (
      SELECT 1 FROM json_each(json_extract(NEW.`forecast_json`, '$.legs'))
      WHERE COALESCE(json_extract(value, '$.preferenceConflict'), 0) = 1
        AND (
          json_extract(value, '$.betProbability') IS NULL
          OR json_extract(value, '$.marketProbability') IS NULL
          OR json_extract(value, '$.betProbability') - json_extract(value, '$.marketProbability') < 0.03
        )
    ) THEN RAISE(ABORT, 'A side opposing a preferred team must clear the exceptional edge threshold') END;

    SELECT CASE WHEN NEW.`play_type` = 'teaser' AND EXISTS (
      SELECT 1 FROM json_each(json_extract(NEW.`forecast_json`, '$.legs'))
      WHERE COALESCE(json_extract(value, '$.preferenceConflict'), 0) = 1
    ) AND (
      json_extract(NEW.`forecast_json`, '$.authoritativeExpectedValuePercent') IS NULL
      OR json_extract(NEW.`forecast_json`, '$.authoritativeExpectedValuePercent') < 5
    ) THEN RAISE(ABORT, 'A teaser opposing a preferred team must clear the exceptional EV threshold') END;

    SELECT CASE WHEN NEW.`play_type` IN ('single', 'parlay', 'teaser') AND (
      json_extract(NEW.`forecast_json`, '$.authoritativeProbabilityInterval') IS NULL
      OR COALESCE(json_extract(NEW.`forecast_json`, '$.suggestedUnits'), 0) < 0.5
    ) THEN RAISE(ABORT, 'The contract must clear the uncertainty and 0.5u Kelly inclusion gates') END;

    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM json_each(NEW.`contract_json`) AS contract_leg
      WHERE json_extract(contract_leg.value, '$.market') = 'prop'
        AND NOT EXISTS (
          SELECT 1 FROM json_each(json_extract(NEW.`forecast_json`, '$.legs')) AS forecast_leg
          WHERE json_extract(forecast_leg.value, '$.sourceQuoteId') = json_extract(contract_leg.value, '$.sourceQuoteId')
            AND json_extract(forecast_leg.value, '$.market') = 'prop'
            AND json_extract(forecast_leg.value, '$.betProbability') IS NOT NULL
            AND json_extract(forecast_leg.value, '$.uncertaintyInterval') IS NOT NULL
            AND json_extract(forecast_leg.value, '$.expectedValue') >= 0.02
        )
    ) THEN RAISE(ABORT, 'Player props must retain current evidence-qualified positive EV') END;
  END;
--> statement-breakpoint
CREATE TRIGGER `approval_execution_state_guard_v1`
  BEFORE UPDATE OF `status`, `execution_status`, `cash_placement_confirmed` ON `plays`
  BEGIN
    SELECT CASE WHEN OLD.`execution_status` <> NEW.`execution_status`
    THEN RAISE(ABORT, 'Execution status is immutable; create a new jointly approved revision') END;

    SELECT CASE WHEN OLD.`cash_placement_confirmed` = 1 AND NEW.`cash_placement_confirmed` <> 1
    THEN RAISE(ABORT, 'Cash placement confirmation is immutable') END;

    SELECT CASE WHEN OLD.`cash_placement_confirmed` = 0 AND NEW.`cash_placement_confirmed` = 1 AND (
      NEW.`execution_status` <> 'executed'
      OR NEW.`gabe_approved` <> 1
      OR NEW.`jarrett_approved` <> 1
      OR NEW.`status` <> 'placed'
      OR NEW.`result` <> 'pending'
    ) THEN RAISE(ABORT, 'Cash placement requires both approvals on a pending executed contract') END;

    SELECT CASE WHEN NEW.`status` = 'placed' AND (
      NEW.`execution_status` <> 'executed'
      OR NEW.`cash_placement_confirmed` <> 1
      OR NEW.`gabe_approved` <> 1
      OR NEW.`jarrett_approved` <> 1
      OR NEW.`result` <> 'pending'
    ) THEN RAISE(ABORT, 'Placed status requires a jointly approved pending cash contract') END;
  END;
--> statement-breakpoint
CREATE TRIGGER `approval_portfolio_guard_v2`
  BEFORE UPDATE OF `status` ON `plays`
  WHEN OLD.`status` = 'research' AND NEW.`status` = 'card'
  BEGIN
    SELECT CASE WHEN (
      SELECT COALESCE(SUM(`stake_cents`), 0) FROM `plays`
      WHERE `id` <> NEW.`id` AND `season` = NEW.`season` AND `week` = NEW.`week`
        AND `status` IN ('card', 'placed', 'settled')
    ) + NEW.`stake_cents` > 25000
    THEN RAISE(ABORT, 'Weekly exposure cannot exceed 10u') END;

    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT json_extract(value, '$.gameId') AS game_id FROM json_each(NEW.`contract_json`)
      ) AS proposed_games
      WHERE (
        SELECT COALESCE(SUM(existing.`stake_cents`), 0) FROM `plays` AS existing
        WHERE existing.`id` <> NEW.`id` AND existing.`season` = NEW.`season`
          AND existing.`week` = NEW.`week` AND existing.`status` IN ('card', 'placed', 'settled')
          AND EXISTS (
            SELECT 1 FROM json_each(existing.`contract_json`) AS existing_leg
            WHERE json_extract(existing_leg.value, '$.gameId') = proposed_games.game_id
          )
      ) + NEW.`stake_cents` > 7500
    ) THEN RAISE(ABORT, 'Game exposure cannot exceed 3u') END;

    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM (
        SELECT json_extract(value, '$.gameId') AS game_id,
          SUM(CASE WHEN json_extract(value, '$.market') IN ('spread', 'moneyline', 'teaser') THEN 1 ELSE 0 END) AS side_count
        FROM json_each(NEW.`contract_json`) GROUP BY json_extract(value, '$.gameId')
      ) AS proposed_games
      WHERE proposed_games.side_count + (
        SELECT COUNT(*) FROM `plays` AS existing, json_each(existing.`contract_json`) AS existing_leg
        WHERE existing.`id` <> NEW.`id` AND existing.`season` = NEW.`season`
          AND existing.`week` = NEW.`week` AND existing.`status` IN ('card', 'placed', 'settled')
          AND json_extract(existing_leg.value, '$.gameId') = proposed_games.game_id
          AND json_extract(existing_leg.value, '$.market') IN ('spread', 'moneyline', 'teaser')
      ) > 1
    ) THEN RAISE(ABORT, 'Only one side position is permitted per game') END;

    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM (
        SELECT json_extract(value, '$.gameId') AS game_id,
          SUM(CASE WHEN json_extract(value, '$.market') = 'total' THEN 1 ELSE 0 END) AS total_count
        FROM json_each(NEW.`contract_json`) GROUP BY json_extract(value, '$.gameId')
      ) AS proposed_games
      WHERE proposed_games.total_count + (
        SELECT COUNT(*) FROM `plays` AS existing, json_each(existing.`contract_json`) AS existing_leg
        WHERE existing.`id` <> NEW.`id` AND existing.`season` = NEW.`season`
          AND existing.`week` = NEW.`week` AND existing.`status` IN ('card', 'placed', 'settled')
          AND json_extract(existing_leg.value, '$.gameId') = proposed_games.game_id
          AND json_extract(existing_leg.value, '$.market') = 'total'
      ) > 1
    ) THEN RAISE(ABORT, 'Only one total is permitted per game') END;
  END;
--> statement-breakpoint
INSERT INTO `engine_schema_versions` (`version`, `migration_hash`, `applied_at`)
VALUES (
  '0020_engine_os_plays_reconciliation',
  'sha256:ad9cdf8d26293ecc3720bb08c8c1bd8a04df14d72159f4a04684b19debc83247',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
