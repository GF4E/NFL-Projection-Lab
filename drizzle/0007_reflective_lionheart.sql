CREATE TABLE IF NOT EXISTS `engine_shared_entries` (
	`game_id` text NOT NULL,
	`post_lock` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`game_id`, `post_lock`)
);
