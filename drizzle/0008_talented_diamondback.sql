CREATE TABLE IF NOT EXISTS `engine_projection_entries` (
	`game_id` text NOT NULL,
	`post_lock` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`game_id`, `post_lock`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `engine_projection_publication` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`checked_at` integer NOT NULL
);
