CREATE TABLE IF NOT EXISTS `market_sentiment_import_state` (
	`dataset` text PRIMARY KEY NOT NULL,
	`freshness` text NOT NULL,
	`source_url` text,
	`source_hash` text,
	`row_count` integer DEFAULT 0 NOT NULL,
	`last_checked_at` text,
	`last_success_at` text,
	`last_error` text,
	`lease_expires_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_sentiment_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`provider_game_id` text NOT NULL,
	`game_id` text NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`tickets_percent` real NOT NULL,
	`money_percent` real,
	`sample_bets` integer NOT NULL,
	`source_url` text NOT NULL,
	`source_timestamp` text NOT NULL,
	`source_hash` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_market_sentiment_game_time` ON `market_sentiment_snapshots` (`game_id`,`source_timestamp`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_market_sentiment_dataset_hash` ON `market_sentiment_snapshots` (`dataset`,`source_hash`);
