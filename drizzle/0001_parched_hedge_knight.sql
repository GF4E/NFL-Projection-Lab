ALTER TABLE `plays` ADD `game_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `plays` ADD `market` text DEFAULT 'spread' NOT NULL;--> statement-breakpoint
ALTER TABLE `plays` ADD `primary_reason` text DEFAULT 'other' NOT NULL;