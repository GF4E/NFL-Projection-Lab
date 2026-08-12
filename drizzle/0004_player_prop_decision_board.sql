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
