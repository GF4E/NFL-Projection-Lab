CREATE TABLE `nfl_games` (
	`game_id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`season_type` text NOT NULL,
	`week` integer NOT NULL,
	`game_date` text NOT NULL,
	`game_time` text,
	`weekday` text,
	`away_team` text NOT NULL,
	`away_score` integer,
	`home_team` text NOT NULL,
	`home_score` integer,
	`location` text,
	`result` real,
	`total` real,
	`overtime` integer NOT NULL,
	`away_rest` integer,
	`home_rest` integer,
	`away_moneyline` integer,
	`home_moneyline` integer,
	`spread_line` real,
	`away_spread_odds` integer,
	`home_spread_odds` integer,
	`total_line` real,
	`under_odds` integer,
	`over_odds` integer,
	`division_game` integer NOT NULL,
	`roof` text,
	`surface` text,
	`temperature` real,
	`wind` real,
	`away_qb_id` text,
	`home_qb_id` text,
	`away_qb_name` text,
	`home_qb_name` text,
	`away_coach` text,
	`home_coach` text,
	`referee` text,
	`stadium_id` text,
	`stadium` text,
	`source_row_hash` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_nfl_games_season_week` ON `nfl_games` (`season`,`season_type`,`week`);--> statement-breakpoint
CREATE INDEX `idx_nfl_games_date` ON `nfl_games` (`game_date`);--> statement-breakpoint
CREATE TABLE `nfl_team_game_features` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`season` integer NOT NULL,
	`season_type` text NOT NULL,
	`week` integer NOT NULL,
	`game_date` text NOT NULL,
	`team` text NOT NULL,
	`opponent` text NOT NULL,
	`home_away` text NOT NULL,
	`plays` integer NOT NULL,
	`epa_per_play` real NOT NULL,
	`success_rate` real NOT NULL,
	`explosive_rate` real NOT NULL,
	`turnovers` integer NOT NULL,
	`turnover_rate` real NOT NULL,
	`seconds_per_play` real,
	`dropbacks` integer NOT NULL,
	`pass_rate` real NOT NULL,
	`expected_pass_rate` real,
	`pass_rate_over_expectation` real,
	`source_hash` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_nfl_features_season_week` ON `nfl_team_game_features` (`season`,`season_type`,`week`);--> statement-breakpoint
CREATE INDEX `idx_nfl_features_team` ON `nfl_team_game_features` (`team`,`season`,`week`);--> statement-breakpoint
CREATE TABLE `nflverse_import_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_nfl_alerts_unresolved` ON `nflverse_import_alerts` (`resolved_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `nflverse_import_state` (
	`dataset` text PRIMARY KEY NOT NULL,
	`freshness` text NOT NULL,
	`source_url` text,
	`source_tag` text,
	`source_hash` text,
	`row_count` integer DEFAULT 0 NOT NULL,
	`last_checked_at` text,
	`last_success_at` text,
	`last_error` text,
	`lease_expires_at` text
);
