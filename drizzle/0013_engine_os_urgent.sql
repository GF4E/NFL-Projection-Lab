CREATE TABLE `engine_schema_versions` (
  `version` text PRIMARY KEY NOT NULL,
  `migration_hash` text NOT NULL,
  `applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_capture_manifests` (
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
CREATE INDEX `idx_source_capture_received` ON `source_capture_manifests` (`provider`, `dataset`, `received_at`);
--> statement-breakpoint
CREATE INDEX `idx_source_capture_evidence_hash` ON `source_capture_manifests` (`evidence_hash`);
--> statement-breakpoint
CREATE TABLE `source_capture_heartbeats` (
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
CREATE TABLE `engine_system_alerts` (
  `alert_id` text PRIMARY KEY NOT NULL,
  `alert_type` text NOT NULL,
  `deduplication_key` text NOT NULL UNIQUE,
  `severity` text NOT NULL,
  `state` text NOT NULL,
  `created_at` text NOT NULL,
  `resolved_at` text,
  `payload_json` text NOT NULL,
  CONSTRAINT `engine_alert_severity_check` CHECK (`severity` IN ('warning', 'error', 'critical')),
  CONSTRAINT `engine_alert_state_check` CHECK (`state` IN ('open', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX `idx_engine_alert_state` ON `engine_system_alerts` (`state`, `created_at`);
--> statement-breakpoint
CREATE TABLE `canonical_games` (
  `game_id` text PRIMARY KEY NOT NULL,
  `season` integer NOT NULL,
  `season_type` text NOT NULL,
  `week` integer NOT NULL,
  `home_team` text NOT NULL,
  `away_team` text NOT NULL,
  `identity_status` text NOT NULL,
  `created_at` text NOT NULL,
  `source_capture_id` text,
  CONSTRAINT `canonical_game_week_check` CHECK (`week` >= 1 AND `week` <= 25),
  CONSTRAINT `canonical_game_identity_check` CHECK (`identity_status` IN ('resolved', 'unresolved')),
  FOREIGN KEY (`source_capture_id`) REFERENCES `source_capture_manifests` (`capture_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_canonical_games_season_week` ON `canonical_games` (`season`, `season_type`, `week`);
--> statement-breakpoint
CREATE TABLE `game_provider_aliases` (
  `alias_id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `provider_game_id` text NOT NULL,
  `game_id` text,
  `valid_from` text NOT NULL,
  `observed_at` text NOT NULL,
  `source_capture_id` text,
  CONSTRAINT `game_provider_alias_unique` UNIQUE (`provider`, `provider_game_id`, `valid_from`),
  FOREIGN KEY (`game_id`) REFERENCES `canonical_games` (`game_id`),
  FOREIGN KEY (`source_capture_id`) REFERENCES `source_capture_manifests` (`capture_id`)
);
--> statement-breakpoint
CREATE TABLE `game_kickoff_revisions` (
  `revision_id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `kickoff_utc` text NOT NULL,
  `local_time_zone` text NOT NULL,
  `observed_at` text NOT NULL,
  `supersedes_revision_id` text,
  `source_capture_id` text,
  CONSTRAINT `game_kickoff_revision_unique` UNIQUE (`game_id`, `kickoff_utc`, `observed_at`),
  FOREIGN KEY (`game_id`) REFERENCES `canonical_games` (`game_id`),
  FOREIGN KEY (`supersedes_revision_id`) REFERENCES `game_kickoff_revisions` (`revision_id`),
  FOREIGN KEY (`source_capture_id`) REFERENCES `source_capture_manifests` (`capture_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_game_kickoff_revision_latest` ON `game_kickoff_revisions` (`game_id`, `observed_at`);
--> statement-breakpoint
CREATE TABLE `engine_activations` (
  `activation_id` text PRIMARY KEY NOT NULL,
  `activated_at` text NOT NULL,
  `activation_boundary` text NOT NULL,
  `evidence_scope` text NOT NULL,
  `operating_contract_version` text NOT NULL,
  `operating_contract_hash` text NOT NULL,
  `research_contract_version` text NOT NULL,
  `research_contract_hash` text NOT NULL,
  `lifecycle_version` text NOT NULL,
  `lifecycle_hash` text NOT NULL,
  `first_origin_utc` text NOT NULL,
  CONSTRAINT `engine_activation_scope_check` CHECK (`evidence_scope` IN ('full_season_shadow', 'partial_season_shadow')),
  CONSTRAINT `engine_activation_contract_unique` UNIQUE (`operating_contract_hash`, `research_contract_hash`, `lifecycle_hash`)
);
--> statement-breakpoint
CREATE TABLE `forecast_origins` (
  `origin_id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `origin_kind` text NOT NULL,
  `scheduled_for_utc` text NOT NULL,
  `scheduled_for_local` text NOT NULL,
  `kickoff_revision_id` text NOT NULL,
  `eligible` integer NOT NULL,
  `activation_boundary` text NOT NULL,
  `created_at` text NOT NULL,
  CONSTRAINT `forecast_origin_unique` UNIQUE (`game_id`, `origin_kind`, `scheduled_for_utc`),
  CONSTRAINT `forecast_origin_record_identity_unique` UNIQUE (`origin_id`, `game_id`, `activation_boundary`),
  CONSTRAINT `forecast_origin_eligible_check` CHECK (`eligible` IN (0, 1)),
  FOREIGN KEY (`game_id`) REFERENCES `canonical_games` (`game_id`),
  FOREIGN KEY (`kickoff_revision_id`) REFERENCES `game_kickoff_revisions` (`revision_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_forecast_origins_due` ON `forecast_origins` (`scheduled_for_utc`, `eligible`);
--> statement-breakpoint
CREATE TABLE `engine_job_runs` (
  `job_key` text PRIMARY KEY NOT NULL,
  `job_type` text NOT NULL,
  `game_id` text,
  `origin_id` text,
  `scheduled_for` text NOT NULL,
  `state` text NOT NULL,
  `attempt` integer NOT NULL DEFAULT 1,
  `lease_owner` text,
  `lease_expires_at` text,
  `started_at` text,
  `completed_at` text,
  `heartbeat_at` text,
  `failure_code` text,
  CONSTRAINT `engine_job_state_check` CHECK (`state` IN ('pending', 'running', 'succeeded', 'failed', 'skipped', 'late')),
  CONSTRAINT `engine_job_attempt_check` CHECK (`attempt` >= 1),
  FOREIGN KEY (`game_id`) REFERENCES `canonical_games` (`game_id`),
  FOREIGN KEY (`origin_id`) REFERENCES `forecast_origins` (`origin_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_engine_job_due` ON `engine_job_runs` (`scheduled_for`, `state`);
--> statement-breakpoint
CREATE TABLE `forecast_origin_records` (
  `record_id` text PRIMARY KEY NOT NULL,
  `record_hash` text NOT NULL UNIQUE,
  `origin_id` text NOT NULL,
  `game_id` text NOT NULL,
  `status` text NOT NULL,
  `withholding_reason` text,
  `generated_at` text NOT NULL,
  `recorded_at` text NOT NULL,
  `timing` text NOT NULL,
  `prospective_eligible` integer NOT NULL,
  `capture_health` text NOT NULL,
  `activation_boundary` text NOT NULL,
  `evidence_scope` text NOT NULL,
  `qualification_key` text,
  `runner_hash` text,
  `code_hash` text,
  `package_hash` text,
  `config_hash` text,
  `input_manifest_hash` text,
  `feature_schema_hash` text,
  `target_schema_hash` text,
  `output_object_key` text,
  `output_object_hash` text,
  CONSTRAINT `forecast_record_status_check` CHECK (`status` IN ('forecast', 'withheld')),
  CONSTRAINT `forecast_record_reason_check` CHECK (
    (`status` = 'forecast' AND `withholding_reason` IS NULL) OR
    (`status` = 'withheld' AND `withholding_reason` IS NOT NULL)
  ),
  CONSTRAINT `forecast_record_timing_check` CHECK (`timing` IN ('early', 'timely', 'late')),
  CONSTRAINT `forecast_record_eligibility_check` CHECK (
    (`timing` = 'timely' AND `prospective_eligible` = 1) OR
    (`timing` <> 'timely' AND `prospective_eligible` = 0)
  ),
  CONSTRAINT `forecast_record_capture_check` CHECK (`capture_health` IN ('current', 'stale', 'partial', 'unavailable')),
  CONSTRAINT `forecast_record_scope_check` CHECK (`evidence_scope` IN ('full_season_shadow', 'partial_season_shadow')),
  CONSTRAINT `forecast_record_provenance_check` CHECK (
    `status` = 'withheld' OR (
      `qualification_key` IS NOT NULL AND length(`qualification_key`) > 0 AND
      `runner_hash` IS NOT NULL AND length(`runner_hash`) > 0 AND
      `code_hash` IS NOT NULL AND length(`code_hash`) > 0 AND
      `package_hash` IS NOT NULL AND length(`package_hash`) > 0 AND
      `config_hash` IS NOT NULL AND length(`config_hash`) > 0 AND
      `input_manifest_hash` IS NOT NULL AND length(`input_manifest_hash`) > 0 AND
      `feature_schema_hash` IS NOT NULL AND length(`feature_schema_hash`) > 0 AND
      `target_schema_hash` IS NOT NULL AND length(`target_schema_hash`) > 0 AND
      `output_object_key` IS NOT NULL AND length(`output_object_key`) > 0 AND
      `output_object_hash` IS NOT NULL AND length(`output_object_hash`) > 0
    )
  ),
  FOREIGN KEY (`origin_id`, `game_id`, `activation_boundary`)
    REFERENCES `forecast_origins` (`origin_id`, `game_id`, `activation_boundary`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_forecast_origin_one_timely` ON `forecast_origin_records` (`origin_id`) WHERE `timing` = 'timely';
--> statement-breakpoint
CREATE INDEX `idx_forecast_records_game_origin` ON `forecast_origin_records` (`game_id`, `generated_at`);
--> statement-breakpoint
CREATE TABLE `odds_quota_events` (
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
CREATE TRIGGER `engine_schema_versions_no_update` BEFORE UPDATE ON `engine_schema_versions` BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_schema_versions_no_delete` BEFORE DELETE ON `engine_schema_versions` BEGIN SELECT RAISE(ABORT, 'engine_schema_versions is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `source_capture_manifests_no_update` BEFORE UPDATE ON `source_capture_manifests` BEGIN SELECT RAISE(ABORT, 'source_capture_manifests is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `source_capture_manifests_no_delete` BEFORE DELETE ON `source_capture_manifests` BEGIN SELECT RAISE(ABORT, 'source_capture_manifests is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `canonical_games_no_update` BEFORE UPDATE ON `canonical_games` BEGIN SELECT RAISE(ABORT, 'canonical_games is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `canonical_games_no_delete` BEFORE DELETE ON `canonical_games` BEGIN SELECT RAISE(ABORT, 'canonical_games is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `game_provider_aliases_no_update` BEFORE UPDATE ON `game_provider_aliases` BEGIN SELECT RAISE(ABORT, 'game_provider_aliases is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `game_provider_aliases_no_delete` BEFORE DELETE ON `game_provider_aliases` BEGIN SELECT RAISE(ABORT, 'game_provider_aliases is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `game_kickoff_revisions_no_update` BEFORE UPDATE ON `game_kickoff_revisions` BEGIN SELECT RAISE(ABORT, 'game_kickoff_revisions is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `game_kickoff_revisions_no_delete` BEFORE DELETE ON `game_kickoff_revisions` BEGIN SELECT RAISE(ABORT, 'game_kickoff_revisions is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_activations_no_update` BEFORE UPDATE ON `engine_activations` BEGIN SELECT RAISE(ABORT, 'engine_activations is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_activations_no_delete` BEFORE DELETE ON `engine_activations` BEGIN SELECT RAISE(ABORT, 'engine_activations is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_origins_no_update` BEFORE UPDATE ON `forecast_origins` BEGIN SELECT RAISE(ABORT, 'forecast_origins is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_origins_no_delete` BEFORE DELETE ON `forecast_origins` BEGIN SELECT RAISE(ABORT, 'forecast_origins is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_origin_records_no_update` BEFORE UPDATE ON `forecast_origin_records` BEGIN SELECT RAISE(ABORT, 'forecast_origin_records is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_origin_records_no_delete` BEFORE DELETE ON `forecast_origin_records` BEGIN SELECT RAISE(ABORT, 'forecast_origin_records is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_origin_records_eligible_origin` BEFORE INSERT ON `forecast_origin_records`
WHEN NEW.`prospective_eligible` = 1 AND NOT EXISTS (
  SELECT 1 FROM `forecast_origins`
  WHERE `origin_id` = NEW.`origin_id` AND `eligible` = 1
)
BEGIN SELECT RAISE(ABORT, 'prospective forecast record requires an eligible origin'); END;
--> statement-breakpoint
CREATE TRIGGER `odds_quota_events_no_update` BEFORE UPDATE ON `odds_quota_events` BEGIN SELECT RAISE(ABORT, 'odds_quota_events is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `odds_quota_events_no_delete` BEFORE DELETE ON `odds_quota_events` BEGIN SELECT RAISE(ABORT, 'odds_quota_events is append-only'); END;
--> statement-breakpoint
INSERT INTO `engine_schema_versions` (`version`, `migration_hash`, `applied_at`)
VALUES (
  '0013_engine_os_urgent',
  'sha256:6205a3dfe09c2d663bb8c50378f295accd266ff2b2018668ca5353436a6797bb',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
