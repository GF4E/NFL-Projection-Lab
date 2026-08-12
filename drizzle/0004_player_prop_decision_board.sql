CREATE TABLE `player_prop_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`event_id` text NOT NULL,
	`book` text NOT NULL,
	`market` text NOT NULL,
	`player` text NOT NULL,
	`side` text NOT NULL,
	`point` real NOT NULL,
	`american_price` integer NOT NULL,
	`captured_at` text NOT NULL,
	`source_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_prop_quotes_game_book` ON `player_prop_quotes` (`game_id`,`book`);
--> statement-breakpoint
CREATE INDEX `idx_prop_quotes_contract` ON `player_prop_quotes` (`game_id`,`market`,`player`,`point`);
--> statement-breakpoint
CREATE TABLE `player_prop_scan_state` (
	`game_id` text PRIMARY KEY NOT NULL,
	`event_id` text,
	`status` text NOT NULL,
	`last_checked_at` text,
	`last_success_at` text,
	`quota_used` integer,
	`quota_remaining` integer,
	`quota_last_cost` integer,
	`message` text
);
--> statement-breakpoint
CREATE TABLE `odds_quota_state` (
	`provider` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL,
	`remaining` integer NOT NULL,
	`last_cost` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `live_line_snapshots` (
	`snapshot_key` text NOT NULL,
	`line_id` text NOT NULL,
	`game_id` text NOT NULL,
	`book` text NOT NULL,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`point` real,
	`american_price` integer NOT NULL,
	`captured_at` text NOT NULL,
	`source_event_id` text NOT NULL,
	`source_hash` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY (`snapshot_key`, `line_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_line_snapshots_game_time` ON `live_line_snapshots` (`game_id`,`fetched_at`);
--> statement-breakpoint
CREATE INDEX `idx_line_snapshots_key` ON `live_line_snapshots` (`snapshot_key`);
--> statement-breakpoint
CREATE TABLE `odds_automation_runs` (
	`snapshot_key` text PRIMARY KEY NOT NULL,
	`job` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`game_id` text,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`message` text,
	`quota_used` integer
);
--> statement-breakpoint
CREATE INDEX `idx_odds_runs_schedule` ON `odds_automation_runs` (`scheduled_for`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_odds_runs_game` ON `odds_automation_runs` (`game_id`,`scheduled_for`);
