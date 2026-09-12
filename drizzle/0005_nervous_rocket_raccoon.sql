CREATE TABLE `engine_suit_entries` (
	`game_id` text NOT NULL,
	`person` text NOT NULL,
	`payload` text NOT NULL,
	`cutoff_at` integer NOT NULL,
	PRIMARY KEY(`game_id`, `person`)
);
--> statement-breakpoint
CREATE TABLE `engine_suit_publication` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
