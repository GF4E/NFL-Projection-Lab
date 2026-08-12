ALTER TABLE `plays` ADD `execution_status` text DEFAULT 'paper' NOT NULL;
--> statement-breakpoint
ALTER TABLE `plays` ADD `cash_placement_confirmed` integer DEFAULT 0 NOT NULL;
