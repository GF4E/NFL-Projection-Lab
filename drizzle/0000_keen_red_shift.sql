CREATE TABLE `plays` (
	`id` text PRIMARY KEY NOT NULL,
	`season` integer DEFAULT 2026 NOT NULL,
	`week` integer NOT NULL,
	`play_type` text NOT NULL,
	`title` text NOT NULL,
	`legs` text DEFAULT '' NOT NULL,
	`book` text NOT NULL,
	`american_odds` integer NOT NULL,
	`stake_cents` integer NOT NULL,
	`model_edge_pp` real NOT NULL,
	`estimated_ev_percent` real NOT NULL,
	`confidence` text NOT NULL,
	`stats_case` text NOT NULL,
	`football_case` text DEFAULT 'Awaiting football read' NOT NULL,
	`status` text DEFAULT 'card' NOT NULL,
	`result` text DEFAULT 'pending' NOT NULL,
	`profit_cents` integer DEFAULT 0 NOT NULL,
	`closing_clv_cents` real,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "plays_play_type_check" CHECK("plays"."play_type" in ('single', 'parlay', 'teaser')),
	CONSTRAINT "plays_confidence_check" CHECK("plays"."confidence" in ('watch', 'lean', 'play', 'best')),
	CONSTRAINT "plays_status_check" CHECK("plays"."status" in ('research', 'card', 'placed', 'settled', 'passed')),
	CONSTRAINT "plays_result_check" CHECK("plays"."result" in ('pending', 'win', 'loss', 'push', 'void')),
	CONSTRAINT "plays_stake_check" CHECK("plays"."stake_cents" >= 1250)
);
--> statement-breakpoint
CREATE INDEX `idx_plays_season_week_status` ON `plays` (`season`,`week`,`status`);--> statement-breakpoint
CREATE INDEX `idx_plays_created_at` ON `plays` (`created_at`);