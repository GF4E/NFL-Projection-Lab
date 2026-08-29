ALTER TABLE `plays` ADD `contract_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `play_settlement_audit` (
	`play_id` text NOT NULL,
	`final_hash` text NOT NULL,
	`result` text NOT NULL,
	`settled_at` text NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`play_id`, `final_hash`)
);
