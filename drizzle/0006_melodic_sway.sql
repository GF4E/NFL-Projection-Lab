CREATE TABLE `engine_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`stake_cents` integer NOT NULL,
	`cutoff_at` integer NOT NULL,
	`contract_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engine_tickets_contract_key_unique` ON `engine_tickets` (`contract_key`);