-- Repair only foundation objects whose accepted 0013/0014 receipts can exist
-- even when their DDL is absent. Every definition below is the idempotent form
-- of its owning migration; no application, model, provider, or capture path is
-- activated here.
CREATE TABLE IF NOT EXISTS `source_capture_manifests` (
  `capture_id` text PRIMARY KEY NOT NULL,
  `idempotency_key` text NOT NULL,
  `provider` text NOT NULL,
  `dataset` text NOT NULL,
  `request_hash` text NOT NULL,
  `response_object_key` text NOT NULL,
  `response_sha256` text NOT NULL,
  `response_bytes` integer NOT NULL,
  `sidecar_object_key` text NOT NULL,
  `sidecar_sha256` text NOT NULL,
  `provider_published_at` text,
  `received_at` text NOT NULL,
  `valid_from` text,
  `valid_to` text,
  `source_schema_version` text NOT NULL,
  `license_id` text NOT NULL,
  `evidence_hash` text NOT NULL,
  CONSTRAINT `source_capture_response_bytes_check` CHECK (`response_bytes` >= 0),
  CONSTRAINT `source_capture_idempotency_unique` UNIQUE (`provider`, `dataset`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_capture_received`
  ON `source_capture_manifests` (`provider`, `dataset`, `received_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_source_capture_evidence_hash`
  ON `source_capture_manifests` (`evidence_hash`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `source_capture_heartbeats` (
  `source_key` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `dataset` text NOT NULL,
  `status` text NOT NULL,
  `last_attempt_at` text NOT NULL,
  `last_success_at` text,
  `last_failure_at` text,
  `failure_code` text,
  `latest_capture_id` text,
  CONSTRAINT `source_capture_heartbeat_status_check` CHECK (`status` IN ('current', 'stale', 'partial', 'unavailable')),
  FOREIGN KEY (`latest_capture_id`) REFERENCES `source_capture_manifests` (`capture_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `odds_quota_state` (
  `provider` text PRIMARY KEY NOT NULL,
  `used` integer NOT NULL,
  `remaining` integer NOT NULL,
  `last_cost` integer NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `odds_quota_events` (
  `request_key` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `used` integer NOT NULL,
  `remaining` integer NOT NULL,
  `last_cost` integer NOT NULL,
  `captured_at` text NOT NULL,
  `response_capture_id` text,
  CONSTRAINT `odds_quota_event_values_check` CHECK (`used` >= 0 AND `remaining` >= 0 AND `last_cost` >= 0),
  FOREIGN KEY (`response_capture_id`) REFERENCES `source_capture_manifests` (`capture_id`)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `source_capture_manifests_no_update`
  BEFORE UPDATE ON `source_capture_manifests`
  BEGIN SELECT RAISE(ABORT, 'source_capture_manifests is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `source_capture_manifests_no_delete`
  BEFORE DELETE ON `source_capture_manifests`
  BEGIN SELECT RAISE(ABORT, 'source_capture_manifests is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `odds_quota_events_no_update`
  BEFORE UPDATE ON `odds_quota_events`
  BEGIN SELECT RAISE(ABORT, 'odds_quota_events is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `odds_quota_events_no_delete`
  BEFORE DELETE ON `odds_quota_events`
  BEGIN SELECT RAISE(ABORT, 'odds_quota_events is append-only'); END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `odds_quota_epochs` (
  `quota_epoch` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `credential_generation_id` text NOT NULL,
  `opened_at` text NOT NULL,
  `reason` text NOT NULL,
  `initial_used` integer NOT NULL,
  `initial_remaining` integer NOT NULL,
  `source_request_key` text,
  CONSTRAINT `odds_quota_epoch_provider_check` CHECK (`provider` = 'the-odds-api'),
  CONSTRAINT `odds_quota_epoch_generation_check` CHECK (length(`credential_generation_id`) > 0),
  CONSTRAINT `odds_quota_epoch_opened_check` CHECK (length(`opened_at`) > 0),
  CONSTRAINT `odds_quota_epoch_reason_check` CHECK (`reason` IN (
    'credential_bootstrap', 'stale_reconciliation', 'provider_monthly_reset'
  )),
  CONSTRAINT `odds_quota_epoch_counters_check` CHECK (
    `initial_used` >= 0 AND `initial_remaining` >= 0 AND `initial_used` + `initial_remaining` = 500
  )
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `odds_quota_epochs_no_update`
  BEFORE UPDATE ON `odds_quota_epochs`
  BEGIN SELECT RAISE(ABORT, 'odds_quota_epochs is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `odds_quota_epochs_no_delete`
  BEFORE DELETE ON `odds_quota_epochs`
  BEGIN SELECT RAISE(ABORT, 'odds_quota_epochs is append-only'); END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `odds_quota_control` (
  `provider` text PRIMARY KEY NOT NULL,
  `quota_epoch` text NOT NULL,
  `credential_generation_id` text NOT NULL,
  `observed_at` text NOT NULL,
  CONSTRAINT `odds_quota_control_provider_check` CHECK (`provider` = 'the-odds-api'),
  CONSTRAINT `odds_quota_control_epoch_check` CHECK (length(`quota_epoch`) > 0),
  CONSTRAINT `odds_quota_control_generation_check` CHECK (length(`credential_generation_id`) > 0),
  CONSTRAINT `odds_quota_control_observed_check` CHECK (length(`observed_at`) > 0),
  FOREIGN KEY (`quota_epoch`) REFERENCES `odds_quota_epochs` (`quota_epoch`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `odds_quota_reservations` (
  `request_key` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `quota_epoch` text NOT NULL,
  `credential_generation_id` text NOT NULL,
  `request_class` text NOT NULL,
  `reserved_cost` integer NOT NULL,
  `future_reserve` integer NOT NULL,
  `quota_plan_hash` text NOT NULL,
  `dispatch_token_hash` text NOT NULL,
  `state` text NOT NULL,
  `reserved_at` text NOT NULL,
  `dispatched_at` text,
  `completed_at` text,
  `quota_event_request_key` text,
  CONSTRAINT `odds_quota_reservation_provider_check` CHECK (`provider` = 'the-odds-api'),
  CONSTRAINT `odds_quota_reservation_class_check` CHECK (`request_class` IN (
    'opener', 'scientific_origin', 'kickoff_minus_15', 'kickoff_minus_60', 'kickoff_minus_120', 'ordinary'
  )),
  CONSTRAINT `odds_quota_reservation_cost_check` CHECK (`reserved_cost` > 0 AND `future_reserve` >= 0),
  CONSTRAINT `odds_quota_reservation_plan_hash_check` CHECK (length(`quota_plan_hash`) = 64),
  CONSTRAINT `odds_quota_reservation_token_check` CHECK (length(`dispatch_token_hash`) = 64),
  CONSTRAINT `odds_quota_reservation_state_check` CHECK (`state` IN (
    'reserved', 'dispatched', 'settled', 'released_before_dispatch', 'charge_unknown'
  )),
  CONSTRAINT `odds_quota_reservation_timestamps_check` CHECK (
    (`state` = 'reserved' AND `dispatched_at` IS NULL AND `completed_at` IS NULL AND `quota_event_request_key` IS NULL) OR
    (`state` = 'dispatched' AND `dispatched_at` IS NOT NULL AND `completed_at` IS NULL AND `quota_event_request_key` IS NULL) OR
    (`state` = 'charge_unknown' AND `dispatched_at` IS NOT NULL AND `completed_at` IS NOT NULL AND `quota_event_request_key` IS NULL) OR
    (`state` = 'released_before_dispatch' AND `dispatched_at` IS NULL AND `completed_at` IS NOT NULL AND `quota_event_request_key` IS NULL) OR
    (`state` = 'settled' AND `dispatched_at` IS NOT NULL AND `completed_at` IS NOT NULL AND `quota_event_request_key` IS NOT NULL)
  ),
  CONSTRAINT `odds_quota_reservation_reserved_at_check` CHECK (length(`reserved_at`) > 0),
  FOREIGN KEY (`quota_epoch`) REFERENCES `odds_quota_epochs` (`quota_epoch`),
  FOREIGN KEY (`quota_event_request_key`) REFERENCES `odds_quota_events` (`request_key`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_odds_quota_reservations_outstanding`
  ON `odds_quota_reservations` (`provider`, `quota_epoch`, `state`, `reserved_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `odds_quota_reservation_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `request_key` text NOT NULL,
  `event_type` text NOT NULL,
  `occurred_at` text NOT NULL,
  `payload_json` text NOT NULL,
  CONSTRAINT `odds_quota_reservation_event_type_check` CHECK (`event_type` IN (
    'reserved', 'dispatched', 'settled', 'released_before_dispatch', 'charge_unknown'
  )),
  CONSTRAINT `odds_quota_reservation_event_time_check` CHECK (length(`occurred_at`) > 0),
  CONSTRAINT `odds_quota_reservation_event_payload_check` CHECK (json_valid(`payload_json`)),
  FOREIGN KEY (`request_key`) REFERENCES `odds_quota_reservations` (`request_key`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_odds_quota_reservation_events_request`
  ON `odds_quota_reservation_events` (`request_key`, `occurred_at`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `odds_quota_reservation_events_no_update`
  BEFORE UPDATE ON `odds_quota_reservation_events`
  BEGIN SELECT RAISE(ABORT, 'odds_quota_reservation_events is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `odds_quota_reservation_events_no_delete`
  BEFORE DELETE ON `odds_quota_reservation_events`
  BEGIN SELECT RAISE(ABORT, 'odds_quota_reservation_events is append-only'); END;
--> statement-breakpoint
-- This ordered migration is intentionally schema-only. Accepted production
-- operational state is reconstructed only by the separately guarded one-shot
-- operator repair after exact drift and empty-table preflights pass.
INSERT INTO `engine_schema_versions` (`version`, `migration_hash`, `applied_at`)
VALUES (
  '0017_engine_os_foundation_repair',
  'sha256:34ecd02bd2b0082b2fb22457ce65350fd0e8970d229ef038c323b73816eddd74',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
