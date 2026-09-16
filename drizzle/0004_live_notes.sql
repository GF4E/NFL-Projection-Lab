CREATE TABLE IF NOT EXISTS `engine_our_notes` (
 `game_id` text PRIMARY KEY NOT NULL,
 `payload` text NOT NULL,
 `cutoff_at` integer NOT NULL
);
