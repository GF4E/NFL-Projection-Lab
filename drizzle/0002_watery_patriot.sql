CREATE TABLE `live_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`book` text NOT NULL,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`point` real,
	`american_price` integer NOT NULL,
	`captured_at` text NOT NULL,
	`source_event_id` text NOT NULL,
	`source_hash` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_live_lines_game_book_market` ON `live_lines` (`game_id`,`book`,`market`);--> statement-breakpoint
CREATE INDEX `idx_live_lines_captured_at` ON `live_lines` (`captured_at`);--> statement-breakpoint
ALTER TABLE `plays` ADD `picked_by` text DEFAULT 'analyst_a' NOT NULL;