CREATE TABLE `forecast_ledger_qualifications_v1` (
  `qualification_id` text PRIMARY KEY NOT NULL,
  `ledger_contract_version` text NOT NULL,
  `ledger_contract_hash` text NOT NULL,
  `activation_boundary` text NOT NULL,
  `qualification_key` text NOT NULL UNIQUE,
  `qualification_key_version` text NOT NULL,
  `qualification_stream` text NOT NULL,
  `runner_hash` text,
  `code_hash` text,
  `model_or_package_hash` text,
  `config_hash` text,
  `feature_schema_hash` text,
  `target_schema_hash` text,
  `qualification_status` text NOT NULL,
  `qualified_at` text NOT NULL,
  `qualification_evidence_hash` text NOT NULL,
  CONSTRAINT `forecast_ledger_qualification_stream_check` CHECK (
    (
      `qualification_stream` = 'eligible_package' AND `runner_hash` IS NOT NULL AND
      `code_hash` IS NOT NULL AND `model_or_package_hash` IS NOT NULL AND
      `config_hash` IS NOT NULL AND `feature_schema_hash` IS NOT NULL AND
      `target_schema_hash` IS NOT NULL
    ) OR (
      `qualification_stream` = 'no_eligible_package' AND `runner_hash` IS NULL AND
      `code_hash` IS NULL AND `model_or_package_hash` IS NULL AND `config_hash` IS NULL AND
      `feature_schema_hash` IS NULL AND `target_schema_hash` IS NULL
    )
  ),
  CONSTRAINT `forecast_ledger_qualification_status_check`
    CHECK (`qualification_status` IN ('eligible', 'rejected')),
  CONSTRAINT `forecast_ledger_qualification_identity_check` CHECK (
    length(`qualification_id`) = 64 AND lower(`qualification_id`) = `qualification_id` AND
    `qualification_id` NOT GLOB '*[^0-9a-f]*' AND
    `ledger_contract_version` = 'forecast-ledger-contract.2026.1' AND
    `ledger_contract_hash` = '8f6e9856512b7b14b0fba8e2367b9d09ebee3edc26a10f3660f9171ae2f3241a' AND
    length(`activation_boundary`) BETWEEN 1 AND 200 AND
    length(`qualification_key`) = 64 AND lower(`qualification_key`) = `qualification_key` AND
    `qualification_key` NOT GLOB '*[^0-9a-f]*' AND
    `qualification_key_version` = 'engine-os.forecast-qualification.v1'
  ),
  CONSTRAINT `forecast_ledger_qualification_hash_check` CHECK (
    (`runner_hash` IS NULL OR (
      length(`runner_hash`) = 64 AND lower(`runner_hash`) = `runner_hash` AND
      `runner_hash` NOT GLOB '*[^0-9a-f]*'
    )) AND
    (`code_hash` IS NULL OR (
      length(`code_hash`) = 64 AND lower(`code_hash`) = `code_hash` AND
      `code_hash` NOT GLOB '*[^0-9a-f]*'
    )) AND
    (`model_or_package_hash` IS NULL OR (
      length(`model_or_package_hash`) = 64 AND
      lower(`model_or_package_hash`) = `model_or_package_hash` AND
      `model_or_package_hash` NOT GLOB '*[^0-9a-f]*'
    )) AND
    (`config_hash` IS NULL OR (
      length(`config_hash`) = 64 AND lower(`config_hash`) = `config_hash` AND
      `config_hash` NOT GLOB '*[^0-9a-f]*'
    )) AND
    (`feature_schema_hash` IS NULL OR (
      length(`feature_schema_hash`) = 64 AND
      lower(`feature_schema_hash`) = `feature_schema_hash` AND
      `feature_schema_hash` NOT GLOB '*[^0-9a-f]*'
    )) AND
    (`target_schema_hash` IS NULL OR (
      length(`target_schema_hash`) = 64 AND
      lower(`target_schema_hash`) = `target_schema_hash` AND
      `target_schema_hash` NOT GLOB '*[^0-9a-f]*'
    )) AND
    length(`qualification_evidence_hash`) = 64 AND
    lower(`qualification_evidence_hash`) = `qualification_evidence_hash` AND
    `qualification_evidence_hash` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `forecast_ledger_qualification_time_check`
    CHECK (julianday(`qualified_at`) IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `idx_forecast_ledger_qualifications_v1_status`
  ON `forecast_ledger_qualifications_v1` (`qualification_status`, `qualified_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `forecast_ledger_one_boundary_per_eligible_package_v1`
  ON `forecast_ledger_qualifications_v1` (`model_or_package_hash`)
  WHERE `qualification_stream` = 'eligible_package' AND `qualification_status` = 'eligible';
--> statement-breakpoint
CREATE TABLE `forecast_ledger_activations_v1` (
  `activation_id` text PRIMARY KEY NOT NULL,
  `ledger_contract_version` text NOT NULL,
  `ledger_contract_hash` text NOT NULL,
  `activation_boundary` text NOT NULL UNIQUE,
  `qualification_id` text NOT NULL UNIQUE,
  `evidence_scope` text NOT NULL,
  `season` integer NOT NULL,
  `first_week` integer NOT NULL,
  `activated_at` text NOT NULL,
  `first_origin_utc` text NOT NULL,
  `week_one_origin_complete` integer NOT NULL,
  `qualification_only` integer NOT NULL DEFAULT 1,
  CONSTRAINT `forecast_ledger_activation_scope_check` CHECK (
    (
      `evidence_scope` = 'full_season_shadow' AND `first_week` = 1 AND
      `first_origin_utc` = '2026-09-08T14:30:00.000Z' AND
      `week_one_origin_complete` = 1 AND
      julianday(`activated_at`) <= julianday('2026-09-08T14:30:00Z')
    ) OR (
      `evidence_scope` = 'partial_season_shadow' AND
      (`first_week` > 1 OR `first_origin_utc` <> '2026-09-08T14:30:00.000Z' OR
        `week_one_origin_complete` = 0 OR
        julianday(`activated_at`) > julianday('2026-09-08T14:30:00Z'))
    )
  ),
  CONSTRAINT `forecast_ledger_activation_season_check`
    CHECK (`season` >= 2026 AND `first_week` BETWEEN 1 AND 25),
  CONSTRAINT `forecast_ledger_activation_identity_check` CHECK (
    length(`activation_id`) = 64 AND lower(`activation_id`) = `activation_id` AND
    `activation_id` NOT GLOB '*[^0-9a-f]*' AND
    `ledger_contract_version` = 'forecast-ledger-contract.2026.1' AND
    `ledger_contract_hash` = '8f6e9856512b7b14b0fba8e2367b9d09ebee3edc26a10f3660f9171ae2f3241a' AND
    length(`activation_boundary`) BETWEEN 1 AND 200
  ),
  CONSTRAINT `forecast_ledger_activation_time_check` CHECK (
    julianday(`activated_at`) IS NOT NULL AND
    julianday(`first_origin_utc`) IS NOT NULL AND
    julianday(`activated_at`) <= julianday(`first_origin_utc`)
  ),
  CONSTRAINT `forecast_ledger_activation_qualification_only_check`
    CHECK (`qualification_only` = 1 AND `week_one_origin_complete` IN (0, 1)),
  FOREIGN KEY (`qualification_id`)
    REFERENCES `forecast_ledger_qualifications_v1` (`qualification_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_forecast_ledger_activations_v1_boundary`
  ON `forecast_ledger_activations_v1` (`season`, `first_origin_utc`);
--> statement-breakpoint
CREATE TABLE `forecast_ledger_jobs_v1` (
  `job_key` text PRIMARY KEY NOT NULL,
  `job_key_version` text NOT NULL,
  `ledger_contract_version` text NOT NULL,
  `ledger_contract_hash` text NOT NULL,
  `activation_id` text NOT NULL,
  `origin_version_id` text NOT NULL,
  `qualification_id` text NOT NULL,
  `expected_input_manifest_hash` text,
  `scheduled_trigger_at` text NOT NULL,
  `persistence_deadline_at` text NOT NULL,
  `kickoff_at` text NOT NULL,
  `state` text NOT NULL,
  `fence_token` integer NOT NULL DEFAULT 0,
  `active_attempt_token_hash` text,
  `lease_owner` text,
  `lease_acquired_at` text,
  `lease_expires_at` text,
  `heartbeat_at` text,
  `completed_at` text,
  `created_at` text NOT NULL,
  CONSTRAINT `forecast_ledger_job_origin_unique`
    UNIQUE (`activation_id`, `origin_version_id`),
  CONSTRAINT `forecast_ledger_job_state_check`
    CHECK (`state` IN ('pending', 'running', 'completed', 'invalidated')),
  CONSTRAINT `forecast_ledger_job_identity_check` CHECK (
    length(`job_key`) = 64 AND lower(`job_key`) = `job_key` AND
    `job_key` NOT GLOB '*[^0-9a-f]*' AND
    `job_key_version` = 'engine-os.forecast-ledger-job.v1' AND
    `ledger_contract_version` = 'forecast-ledger-contract.2026.1' AND
    `ledger_contract_hash` = '8f6e9856512b7b14b0fba8e2367b9d09ebee3edc26a10f3660f9171ae2f3241a'
  ),
  CONSTRAINT `forecast_ledger_job_input_hash_check` CHECK (
    `expected_input_manifest_hash` IS NULL OR (
      length(`expected_input_manifest_hash`) = 64 AND
      lower(`expected_input_manifest_hash`) = `expected_input_manifest_hash` AND
      `expected_input_manifest_hash` NOT GLOB '*[^0-9a-f]*'
    )
  ),
  CONSTRAINT `forecast_ledger_job_time_check` CHECK (
    julianday(`scheduled_trigger_at`) IS NOT NULL AND
    julianday(`persistence_deadline_at`) IS NOT NULL AND
    julianday(`kickoff_at`) IS NOT NULL AND
    julianday(`created_at`) IS NOT NULL AND
    julianday(`persistence_deadline_at`) < julianday(`kickoff_at`)
  ),
  CONSTRAINT `forecast_ledger_job_fence_check`
    CHECK (`fence_token` >= 0),
  FOREIGN KEY (`activation_id`)
    REFERENCES `forecast_ledger_activations_v1` (`activation_id`),
  FOREIGN KEY (`origin_version_id`)
    REFERENCES `forecast_origin_versions` (`origin_version_id`),
  FOREIGN KEY (`qualification_id`)
    REFERENCES `forecast_ledger_qualifications_v1` (`qualification_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_forecast_ledger_jobs_v1_due`
  ON `forecast_ledger_jobs_v1` (`state`, `scheduled_trigger_at`, `persistence_deadline_at`);
--> statement-breakpoint
CREATE INDEX `idx_forecast_ledger_jobs_v1_lease`
  ON `forecast_ledger_jobs_v1` (`state`, `lease_expires_at`);
--> statement-breakpoint
CREATE TABLE `forecast_ledger_attempts_v1` (
  `attempt_id` text PRIMARY KEY NOT NULL,
  `job_key` text NOT NULL,
  `origin_version_id` text NOT NULL,
  `attempt_token_hash` text NOT NULL UNIQUE,
  `fence_token` integer NOT NULL,
  `lease_owner` text NOT NULL,
  `invoked_at` text NOT NULL,
  `lease_acquired_at` text NOT NULL,
  `lease_expires_at` text NOT NULL,
  `persisted_at` text NOT NULL,
  CONSTRAINT `forecast_ledger_attempt_job_fence_unique`
    UNIQUE (`job_key`, `fence_token`),
  CONSTRAINT `forecast_ledger_attempt_identity_check` CHECK (
    length(`attempt_id`) = 64 AND lower(`attempt_id`) = `attempt_id` AND
    `attempt_id` NOT GLOB '*[^0-9a-f]*' AND
    length(`attempt_token_hash`) = 64 AND lower(`attempt_token_hash`) = `attempt_token_hash` AND
    `attempt_token_hash` NOT GLOB '*[^0-9a-f]*' AND
    `fence_token` >= 1 AND length(`lease_owner`) BETWEEN 1 AND 200
  ),
  CONSTRAINT `forecast_ledger_attempt_time_check` CHECK (
    julianday(`invoked_at`) IS NOT NULL AND
    julianday(`lease_acquired_at`) IS NOT NULL AND
    julianday(`lease_expires_at`) IS NOT NULL AND
    julianday(`persisted_at`) IS NOT NULL AND
    julianday(`invoked_at`) <= julianday(`lease_acquired_at`) AND
    julianday(`lease_acquired_at`) < julianday(`lease_expires_at`) AND
    julianday(`lease_acquired_at`) <= julianday(`persisted_at`) AND
    abs((julianday(`lease_expires_at`) - julianday(`lease_acquired_at`)) * 86400.0 - 120.0) < 0.001
  ),
  FOREIGN KEY (`job_key`) REFERENCES `forecast_ledger_jobs_v1` (`job_key`),
  FOREIGN KEY (`origin_version_id`)
    REFERENCES `forecast_origin_versions` (`origin_version_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_forecast_ledger_attempts_v1_origin`
  ON `forecast_ledger_attempts_v1` (`origin_version_id`, `fence_token`);
--> statement-breakpoint
CREATE TABLE `forecast_ledger_records_v1` (
  `record_id` text PRIMARY KEY NOT NULL,
  `record_hash` text NOT NULL UNIQUE,
  `record_key_version` text NOT NULL,
  `activation_id` text NOT NULL,
  `job_key` text NOT NULL UNIQUE,
  `origin_version_id` text NOT NULL,
  `qualification_id` text NOT NULL,
  `qualification_key` text NOT NULL,
  `qualification_stream` text NOT NULL,
  `ledger_contract_version` text NOT NULL,
  `ledger_contract_hash` text NOT NULL,
  `status` text NOT NULL,
  `withholding_reason` text,
  `scheduled_trigger_at` text NOT NULL,
  `invoked_at` text NOT NULL,
  `evidence_at` text NOT NULL,
  `generated_at` text NOT NULL,
  `output_published_at` text,
  `output_verified_at` text,
  `persistence_requested_at` text NOT NULL,
  `persisted_at` text NOT NULL,
  `persistence_deadline_at` text NOT NULL,
  `kickoff_at` text NOT NULL,
  `timing` text NOT NULL,
  `prospective_eligible` integer NOT NULL,
  `capture_health` text NOT NULL,
  `activation_boundary` text NOT NULL,
  `evidence_scope` text NOT NULL,
  `attempt_token_hash` text NOT NULL,
  `fence_token` integer NOT NULL,
  `runner_hash` text,
  `code_hash` text,
  `model_or_package_hash` text,
  `config_hash` text,
  `input_manifest_hash` text,
  `feature_schema_hash` text,
  `target_schema_hash` text,
  `output_object_key` text,
  `output_object_hash` text,
  `output_object_bytes` integer,
  `payload_json` text NOT NULL,
  `payload_hash` text NOT NULL,
  CONSTRAINT `forecast_ledger_record_activation_origin_unique`
    UNIQUE (`activation_id`, `origin_version_id`),
  CONSTRAINT `forecast_ledger_record_identity_check` CHECK (
    length(`record_id`) = 64 AND lower(`record_id`) = `record_id` AND
    `record_id` NOT GLOB '*[^0-9a-f]*' AND
    length(`record_hash`) = 64 AND lower(`record_hash`) = `record_hash` AND
    `record_hash` NOT GLOB '*[^0-9a-f]*' AND
    `record_key_version` = 'engine-os.forecast-ledger-record.v2' AND
    `ledger_contract_version` = 'forecast-ledger-contract.2026.1' AND
    `ledger_contract_hash` = '8f6e9856512b7b14b0fba8e2367b9d09ebee3edc26a10f3660f9171ae2f3241a' AND
    length(`attempt_token_hash`) = 64 AND lower(`attempt_token_hash`) = `attempt_token_hash` AND
    `attempt_token_hash` NOT GLOB '*[^0-9a-f]*' AND
    `fence_token` >= 1
  ),
  CONSTRAINT `forecast_ledger_record_status_check`
    CHECK (`status` IN ('forecast', 'withheld')),
  CONSTRAINT `forecast_ledger_record_reason_check` CHECK (
    `withholding_reason` IS NULL OR `withholding_reason` IN (
      'no_eligible_package', 'schedule_unavailable_at_origin', 'required_source_stale',
      'required_source_partial', 'required_source_unavailable', 'schema_invalid',
      'provenance_incomplete', 'package_hash_mismatch', 'late_origin_excluded',
      'compute_failure'
    )
  ),
  CONSTRAINT `forecast_ledger_record_shape_check` CHECK (
    (
      `status` = 'forecast' AND `withholding_reason` IS NULL AND
      `qualification_stream` = 'eligible_package' AND
      `runner_hash` IS NOT NULL AND `code_hash` IS NOT NULL AND
      `model_or_package_hash` IS NOT NULL AND
      `config_hash` IS NOT NULL AND `input_manifest_hash` IS NOT NULL AND
      `feature_schema_hash` IS NOT NULL AND `target_schema_hash` IS NOT NULL AND
      `output_object_key` IS NOT NULL AND `output_object_hash` IS NOT NULL AND
      `output_object_bytes` IS NOT NULL AND
      `output_published_at` IS NOT NULL AND `output_verified_at` IS NOT NULL AND
      `timing` = 'timely' AND `prospective_eligible` = 1
    ) OR (
      `status` = 'withheld' AND `withholding_reason` IS NOT NULL AND
      `runner_hash` IS NULL AND `code_hash` IS NULL AND
      `model_or_package_hash` IS NULL AND `config_hash` IS NULL AND
      `input_manifest_hash` IS NULL AND `feature_schema_hash` IS NULL AND
      `target_schema_hash` IS NULL AND
      `output_object_key` IS NULL AND `output_object_hash` IS NULL AND
      `output_object_bytes` IS NULL AND
      `output_published_at` IS NULL AND `output_verified_at` IS NULL
    )
  ),
  CONSTRAINT `forecast_ledger_record_qualification_shape_check`
    CHECK (`qualification_stream` IN ('eligible_package', 'no_eligible_package')),
  CONSTRAINT `forecast_ledger_record_hash_check` CHECK (
    (`runner_hash` IS NULL OR (length(`runner_hash`) = 64 AND lower(`runner_hash`) = `runner_hash` AND
      `runner_hash` NOT GLOB '*[^0-9a-f]*')) AND
    (`code_hash` IS NULL OR (length(`code_hash`) = 64 AND lower(`code_hash`) = `code_hash` AND
      `code_hash` NOT GLOB '*[^0-9a-f]*')) AND
    (`model_or_package_hash` IS NULL OR (
      length(`model_or_package_hash`) = 64 AND
      lower(`model_or_package_hash`) = `model_or_package_hash` AND
      `model_or_package_hash` NOT GLOB '*[^0-9a-f]*'
    )) AND
    (`config_hash` IS NULL OR (length(`config_hash`) = 64 AND lower(`config_hash`) = `config_hash` AND
      `config_hash` NOT GLOB '*[^0-9a-f]*')) AND
    (`input_manifest_hash` IS NULL OR (length(`input_manifest_hash`) = 64 AND
      lower(`input_manifest_hash`) = `input_manifest_hash` AND
      `input_manifest_hash` NOT GLOB '*[^0-9a-f]*')) AND
    (`feature_schema_hash` IS NULL OR (length(`feature_schema_hash`) = 64 AND
      lower(`feature_schema_hash`) = `feature_schema_hash` AND
      `feature_schema_hash` NOT GLOB '*[^0-9a-f]*')) AND
    (`target_schema_hash` IS NULL OR (length(`target_schema_hash`) = 64 AND
      lower(`target_schema_hash`) = `target_schema_hash` AND
      `target_schema_hash` NOT GLOB '*[^0-9a-f]*')) AND
    (`output_object_hash` IS NULL OR (length(`output_object_hash`) = 64 AND
      lower(`output_object_hash`) = `output_object_hash` AND
      `output_object_hash` NOT GLOB '*[^0-9a-f]*')) AND
    length(`payload_hash`) = 64 AND lower(`payload_hash`) = `payload_hash` AND
    `payload_hash` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `forecast_ledger_record_output_check` CHECK (
    `output_object_key` IS NULL OR (
      `output_object_key` = 'forecast-output/sha256/' || `output_object_hash` AND
      `output_object_bytes` >= 0
    )
  ),
  CONSTRAINT `forecast_ledger_record_time_check` CHECK (
    julianday(`scheduled_trigger_at`) IS NOT NULL AND
    julianday(`invoked_at`) IS NOT NULL AND
    julianday(`evidence_at`) IS NOT NULL AND
    julianday(`generated_at`) IS NOT NULL AND
    julianday(`persistence_requested_at`) IS NOT NULL AND
    julianday(`persisted_at`) IS NOT NULL AND
    julianday(`persistence_deadline_at`) IS NOT NULL AND
    julianday(`kickoff_at`) IS NOT NULL AND
    julianday(`scheduled_trigger_at`) <= julianday(`invoked_at`) AND
    julianday(`invoked_at`) <= julianday(`generated_at`) AND
    julianday(`evidence_at`) <= julianday(`generated_at`) AND
    julianday(`generated_at`) <= julianday(`persistence_requested_at`) AND
    julianday(`persistence_requested_at`) <= julianday(`persisted_at`) AND
    julianday(`persistence_deadline_at`) < julianday(`kickoff_at`) AND
    (
      `output_published_at` IS NULL OR (
        julianday(`output_published_at`) IS NOT NULL AND
        julianday(`output_verified_at`) IS NOT NULL AND
        julianday(`generated_at`) <= julianday(`output_published_at`) AND
        julianday(`output_published_at`) <= julianday(`output_verified_at`) AND
        julianday(`output_verified_at`) <= julianday(`persistence_requested_at`)
      )
    )
  ),
  CONSTRAINT `forecast_ledger_record_timing_check` CHECK (
    (
      `timing` = 'timely' AND `prospective_eligible` = 1 AND
      julianday(`persisted_at`) < julianday(`persistence_deadline_at`) AND
      julianday(`persisted_at`) <= julianday(`kickoff_at`, '-1 second') AND
      (`withholding_reason` IS NULL OR `withholding_reason` NOT IN (
        'late_origin_excluded', 'schedule_unavailable_at_origin'
      ))
    ) OR (
      `timing` = 'late' AND `prospective_eligible` = 0 AND
      `withholding_reason` IN ('late_origin_excluded', 'schedule_unavailable_at_origin')
    )
  ),
  CONSTRAINT `forecast_ledger_record_capture_check`
    CHECK (`capture_health` IN ('current', 'stale', 'partial', 'unavailable')),
  CONSTRAINT `forecast_ledger_record_scope_check`
    CHECK (`evidence_scope` IN ('full_season_shadow', 'partial_season_shadow')),
  CONSTRAINT `forecast_ledger_record_payload_check`
    CHECK (json_valid(`payload_json`) AND json_type(`payload_json`) = 'object'),
  FOREIGN KEY (`activation_id`)
    REFERENCES `forecast_ledger_activations_v1` (`activation_id`),
  FOREIGN KEY (`job_key`) REFERENCES `forecast_ledger_jobs_v1` (`job_key`),
  FOREIGN KEY (`origin_version_id`)
    REFERENCES `forecast_origin_versions` (`origin_version_id`),
  FOREIGN KEY (`qualification_id`)
    REFERENCES `forecast_ledger_qualifications_v1` (`qualification_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_forecast_ledger_records_v1_origin`
  ON `forecast_ledger_records_v1` (`origin_version_id`, `persisted_at`);
--> statement-breakpoint
CREATE INDEX `idx_forecast_ledger_records_v1_prospective`
  ON `forecast_ledger_records_v1` (`prospective_eligible`, `status`, `persisted_at`);
--> statement-breakpoint
CREATE TABLE `forecast_ledger_events_v1` (
  `event_id` text PRIMARY KEY NOT NULL,
  `event_type` text NOT NULL,
  `activation_id` text,
  `qualification_id` text,
  `job_key` text,
  `origin_version_id` text,
  `attempt_token_hash` text,
  `fence_token` integer,
  `occurred_at` text NOT NULL,
  `evidence_at` text NOT NULL,
  `persisted_at` text NOT NULL,
  `payload_json` text NOT NULL,
  `payload_hash` text NOT NULL,
  CONSTRAINT `forecast_ledger_event_type_check` CHECK (`event_type` IN (
    'qualification_registered', 'activation_created', 'job_created', 'lease_acquired',
    'lease_renewed', 'lease_reclaimed', 'lease_lost', 'record_committed',
    'record_deduplicated', 'output_publish_failed', 'output_integrity_failed',
    'origin_superseded'
  )),
  CONSTRAINT `forecast_ledger_event_identity_check` CHECK (
    length(`event_id`) = 64 AND lower(`event_id`) = `event_id` AND
    `event_id` NOT GLOB '*[^0-9a-f]*' AND
    (`attempt_token_hash` IS NULL OR (
      length(`attempt_token_hash`) = 64 AND
      lower(`attempt_token_hash`) = `attempt_token_hash` AND
      `attempt_token_hash` NOT GLOB '*[^0-9a-f]*'
    )) AND (`fence_token` IS NULL OR `fence_token` >= 1)
  ),
  CONSTRAINT `forecast_ledger_event_time_check` CHECK (
    julianday(`occurred_at`) IS NOT NULL AND
    julianday(`evidence_at`) IS NOT NULL AND
    julianday(`persisted_at`) IS NOT NULL AND
    julianday(`occurred_at`) <= julianday(`persisted_at`) AND
    julianday(`evidence_at`) <= julianday(`persisted_at`)
  ),
  CONSTRAINT `forecast_ledger_event_payload_check` CHECK (
    json_valid(`payload_json`) AND json_type(`payload_json`) = 'object' AND
    length(`payload_hash`) = 64 AND lower(`payload_hash`) = `payload_hash` AND
    `payload_hash` NOT GLOB '*[^0-9a-f]*'
  ),
  FOREIGN KEY (`activation_id`)
    REFERENCES `forecast_ledger_activations_v1` (`activation_id`),
  FOREIGN KEY (`qualification_id`)
    REFERENCES `forecast_ledger_qualifications_v1` (`qualification_id`),
  FOREIGN KEY (`job_key`) REFERENCES `forecast_ledger_jobs_v1` (`job_key`),
  FOREIGN KEY (`origin_version_id`)
    REFERENCES `forecast_origin_versions` (`origin_version_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_forecast_ledger_events_v1_origin`
  ON `forecast_ledger_events_v1` (`origin_version_id`, `occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_forecast_ledger_events_v1_job`
  ON `forecast_ledger_events_v1` (`job_key`, `occurred_at`);
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_qualifications_v1_receipt_guard`
  BEFORE INSERT ON `forecast_ledger_qualifications_v1`
  WHEN abs((julianday(NEW.`qualified_at`) - julianday('now' /* os13a-authoritative-clock */)) * 86400.0) > 5.0
  BEGIN SELECT RAISE(ABORT, 'forecast qualification time must be contemporaneous with D1'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_qualifications_v1_no_update`
  BEFORE UPDATE ON `forecast_ledger_qualifications_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_qualifications_v1 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_qualifications_v1_no_delete`
  BEFORE DELETE ON `forecast_ledger_qualifications_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_qualifications_v1 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_activations_v1_insert_guard`
  BEFORE INSERT ON `forecast_ledger_activations_v1`
  WHEN
    abs((julianday(NEW.`activated_at`) - julianday('now' /* os13a-authoritative-clock */)) * 86400.0) > 5.0 OR
    NOT EXISTS (
      SELECT 1 FROM `forecast_ledger_qualifications_v1` qualification
      WHERE qualification.`qualification_id` = NEW.`qualification_id`
        AND qualification.`qualification_status` = 'eligible'
        AND qualification.`ledger_contract_version` = NEW.`ledger_contract_version`
        AND qualification.`ledger_contract_hash` = NEW.`ledger_contract_hash`
        AND qualification.`activation_boundary` = NEW.`activation_boundary`
        AND julianday(qualification.`qualified_at`) <= julianday(NEW.`activated_at`)
    )
  BEGIN SELECT RAISE(ABORT, 'activation requires contemporaneous D1 time and an eligible immutable qualification stream'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_activations_v1_no_update`
  BEFORE UPDATE ON `forecast_ledger_activations_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_activations_v1 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_activations_v1_no_delete`
  BEFORE DELETE ON `forecast_ledger_activations_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_activations_v1 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_jobs_v1_insert_guard`
  BEFORE INSERT ON `forecast_ledger_jobs_v1`
  WHEN NOT (
    NEW.`state` = 'pending' AND NEW.`fence_token` = 0 AND
    NEW.`active_attempt_token_hash` IS NULL AND NEW.`lease_owner` IS NULL AND
    NEW.`lease_acquired_at` IS NULL AND NEW.`lease_expires_at` IS NULL AND
    NEW.`heartbeat_at` IS NULL AND NEW.`completed_at` IS NULL AND
    EXISTS (
      SELECT 1
      FROM `forecast_ledger_activations_v1` activation
      JOIN `forecast_ledger_qualifications_v1` qualification
        ON qualification.`qualification_id` = activation.`qualification_id`
      JOIN `forecast_origin_versions` origin
        ON origin.`origin_version_id` = NEW.`origin_version_id`
      JOIN `canonical_games` game
        ON game.`game_id` = origin.`game_id`
      JOIN `game_schedule_revisions` schedule
        ON schedule.`revision_id` = origin.`kickoff_revision_id`
      WHERE activation.`activation_id` = NEW.`activation_id`
        AND activation.`ledger_contract_version` = NEW.`ledger_contract_version`
        AND activation.`ledger_contract_hash` = NEW.`ledger_contract_hash`
        AND activation.`qualification_id` = NEW.`qualification_id`
        AND qualification.`qualification_status` = 'eligible'
        AND game.`season` = activation.`season`
        AND game.`season_type` = 'REG'
        AND (
          (qualification.`qualification_stream` = 'eligible_package' AND
            NEW.`expected_input_manifest_hash` IS NOT NULL) OR
          (qualification.`qualification_stream` = 'no_eligible_package' AND
            NEW.`expected_input_manifest_hash` IS NULL)
        )
        AND origin.`horizon_id` IN (
          'weekly_tuesday_0730', 'kickoff_minus_120', 'kickoff_minus_90',
          'kickoff_minus_60', 'kickoff_minus_15'
        )
        AND (
          (origin.`eligible` = 1 AND origin.`eligibility_reason` = 'eligible') OR
          (origin.`eligible` = 0 AND origin.`eligibility_reason` IN (
            'known_after_origin', 'pre_activation', 'after_kickoff',
            'prior_origin_elapsed', 'earlier_origin_prohibited'
          ))
        )
        AND origin.`scheduled_for_utc` = NEW.`scheduled_trigger_at`
        AND schedule.`schedule_status` = 'scheduled'
        AND schedule.`kickoff_utc` = NEW.`kickoff_at`
        AND julianday(NEW.`persistence_deadline_at`) = min(
          julianday(NEW.`scheduled_trigger_at`, CASE origin.`horizon_id`
            WHEN 'kickoff_minus_15' THEN '+300 seconds'
            ELSE '+600 seconds'
          END),
          julianday(NEW.`kickoff_at`, '-1 second')
        )
        AND (
          origin.`eligibility_reason` <> 'eligible' OR
          julianday(NEW.`scheduled_trigger_at`) < julianday(NEW.`persistence_deadline_at`)
        )
        AND julianday(activation.`first_origin_utc`) <= julianday(NEW.`scheduled_trigger_at`)
        AND NOT EXISTS (
          SELECT 1 FROM `forecast_origin_versions` child
          WHERE child.`supersedes_origin_version_id` = origin.`origin_version_id`
        )
    )
  )
  BEGIN SELECT RAISE(ABORT, 'ledger job requires one current eligible canonical origin under its activation'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_jobs_v1_update_guard`
  BEFORE UPDATE ON `forecast_ledger_jobs_v1`
  WHEN NOT (
    NEW.`job_key` = OLD.`job_key` AND
    NEW.`job_key_version` = OLD.`job_key_version` AND
    NEW.`ledger_contract_version` = OLD.`ledger_contract_version` AND
    NEW.`ledger_contract_hash` = OLD.`ledger_contract_hash` AND
    NEW.`activation_id` = OLD.`activation_id` AND
    NEW.`origin_version_id` = OLD.`origin_version_id` AND
    NEW.`qualification_id` IS OLD.`qualification_id` AND
    NEW.`expected_input_manifest_hash` IS OLD.`expected_input_manifest_hash` AND
    NEW.`scheduled_trigger_at` = OLD.`scheduled_trigger_at` AND
    NEW.`persistence_deadline_at` = OLD.`persistence_deadline_at` AND
    NEW.`kickoff_at` = OLD.`kickoff_at` AND
    NEW.`created_at` = OLD.`created_at` AND
    (
      (
        OLD.`state` = 'pending' AND NEW.`state` = 'running' AND
        NEW.`fence_token` = 1 AND NEW.`active_attempt_token_hash` IS NOT NULL AND
        length(NEW.`active_attempt_token_hash`) = 64 AND NEW.`lease_owner` IS NOT NULL AND
        NEW.`lease_acquired_at` IS NOT NULL AND NEW.`lease_expires_at` IS NOT NULL AND
        NEW.`heartbeat_at` = NEW.`lease_acquired_at` AND NEW.`completed_at` IS NULL AND
        julianday('now' /* os13a-authoritative-clock */) >= julianday(OLD.`scheduled_trigger_at`) AND
        abs((julianday(NEW.`lease_acquired_at`) -
          julianday('now' /* os13a-authoritative-clock */)) * 86400.0) <= 5.0 AND
        abs((julianday(NEW.`lease_expires_at`) -
          julianday(NEW.`lease_acquired_at`)) * 86400.0 - 120.0) < 0.001
      ) OR (
        OLD.`state` = 'running' AND NEW.`state` = 'running' AND
        (
          (
            NEW.`fence_token` = OLD.`fence_token` AND
            NEW.`active_attempt_token_hash` = OLD.`active_attempt_token_hash` AND
            NEW.`lease_owner` = OLD.`lease_owner` AND
            NEW.`lease_acquired_at` = OLD.`lease_acquired_at` AND
            julianday(NEW.`heartbeat_at`) >= julianday(OLD.`heartbeat_at`) AND
            julianday(NEW.`lease_expires_at`) > julianday(OLD.`lease_expires_at`) AND
            NEW.`completed_at` IS NULL AND
            julianday('now' /* os13a-authoritative-clock */) >= julianday(OLD.`scheduled_trigger_at`) AND
            abs((julianday(NEW.`heartbeat_at`) -
              julianday('now' /* os13a-authoritative-clock */)) * 86400.0) <= 5.0 AND
            abs((julianday(NEW.`lease_expires_at`) -
              julianday(NEW.`heartbeat_at`)) * 86400.0 - 120.0) < 0.001
          ) OR (
            NEW.`fence_token` = OLD.`fence_token` + 1 AND
            NEW.`active_attempt_token_hash` IS NOT NULL AND
            NEW.`active_attempt_token_hash` <> OLD.`active_attempt_token_hash` AND
            NEW.`lease_owner` IS NOT NULL AND NEW.`lease_acquired_at` IS NOT NULL AND
            NEW.`lease_expires_at` IS NOT NULL AND
            NEW.`heartbeat_at` = NEW.`lease_acquired_at` AND NEW.`completed_at` IS NULL AND
            julianday(NEW.`lease_acquired_at`) >= julianday(OLD.`lease_expires_at`) AND
            julianday(OLD.`lease_expires_at`) <=
              julianday('now' /* os13a-authoritative-clock */) AND
            julianday('now' /* os13a-authoritative-clock */) >= julianday(OLD.`scheduled_trigger_at`) AND
            abs((julianday(NEW.`lease_acquired_at`) -
              julianday('now' /* os13a-authoritative-clock */)) * 86400.0) <= 5.0 AND
            abs((julianday(NEW.`lease_expires_at`) -
              julianday(NEW.`lease_acquired_at`)) * 86400.0 - 120.0) < 0.001
          )
        )
      ) OR (
        OLD.`state` = 'running' AND NEW.`state` = 'completed' AND
        NEW.`fence_token` = OLD.`fence_token` AND
        NEW.`active_attempt_token_hash` IS NULL AND NEW.`lease_owner` IS NULL AND
        NEW.`lease_acquired_at` IS NULL AND NEW.`lease_expires_at` IS NULL AND
        NEW.`heartbeat_at` = OLD.`heartbeat_at` AND NEW.`completed_at` IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM `forecast_ledger_records_v1` record
          WHERE record.`job_key` = OLD.`job_key`
            AND record.`attempt_token_hash` = OLD.`active_attempt_token_hash`
            AND record.`fence_token` = OLD.`fence_token`
            AND record.`persisted_at` = NEW.`completed_at`
        )
      ) OR (
        OLD.`state` IN ('pending', 'running') AND NEW.`state` = 'invalidated' AND
        NEW.`fence_token` = OLD.`fence_token` AND
        NEW.`active_attempt_token_hash` IS NULL AND NEW.`lease_owner` IS NULL AND
        NEW.`lease_acquired_at` IS NULL AND NEW.`lease_expires_at` IS NULL AND
        NEW.`heartbeat_at` = coalesce(OLD.`heartbeat_at`, NEW.`completed_at`) AND
        NEW.`completed_at` IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM `forecast_origin_versions` child
          WHERE child.`supersedes_origin_version_id` = OLD.`origin_version_id`
        )
      )
    )
  )
  BEGIN SELECT RAISE(ABORT, 'ledger job update violates immutable identity or lease fencing'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_jobs_v1_no_delete`
  BEFORE DELETE ON `forecast_ledger_jobs_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_jobs_v1 cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_attempts_v1_insert_guard`
  BEFORE INSERT ON `forecast_ledger_attempts_v1`
  WHEN NOT EXISTS (
    SELECT 1 FROM `forecast_ledger_jobs_v1` job
    WHERE job.`job_key` = NEW.`job_key`
      AND job.`origin_version_id` = NEW.`origin_version_id`
      AND job.`state` = 'running'
      AND job.`active_attempt_token_hash` = NEW.`attempt_token_hash`
      AND job.`fence_token` = NEW.`fence_token`
      AND job.`lease_owner` = NEW.`lease_owner`
      AND job.`lease_acquired_at` = NEW.`lease_acquired_at`
      AND job.`lease_expires_at` = NEW.`lease_expires_at`
      AND abs((julianday(NEW.`invoked_at`) -
        julianday('now' /* os13a-authoritative-clock */)) * 86400.0) <= 5.0
      AND abs((julianday(NEW.`lease_acquired_at`) -
        julianday('now' /* os13a-authoritative-clock */)) * 86400.0) <= 5.0
      AND abs((julianday(NEW.`persisted_at`) -
        julianday('now' /* os13a-authoritative-clock */)) * 86400.0) <= 5.0
  )
  BEGIN SELECT RAISE(ABORT, 'ledger attempt must bind the exact current fenced lease'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_attempts_v1_no_update`
  BEFORE UPDATE ON `forecast_ledger_attempts_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_attempts_v1 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_attempts_v1_no_delete`
  BEFORE DELETE ON `forecast_ledger_attempts_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_attempts_v1 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_records_v1_publication_guard`
  BEFORE INSERT ON `forecast_ledger_records_v1`
  WHEN NOT EXISTS (
    SELECT 1
    FROM `forecast_ledger_jobs_v1` job
    JOIN `forecast_ledger_activations_v1` activation
      ON activation.`activation_id` = job.`activation_id`
    JOIN `forecast_origin_versions` origin
      ON origin.`origin_version_id` = job.`origin_version_id`
    JOIN `forecast_ledger_attempts_v1` attempt
      ON attempt.`job_key` = job.`job_key`
      AND attempt.`origin_version_id` = job.`origin_version_id`
      AND attempt.`attempt_token_hash` = NEW.`attempt_token_hash`
      AND attempt.`fence_token` = NEW.`fence_token`
    LEFT JOIN `forecast_ledger_qualifications_v1` qualification
      ON qualification.`qualification_id` = activation.`qualification_id`
    WHERE job.`job_key` = NEW.`job_key`
      AND job.`activation_id` = NEW.`activation_id`
      AND job.`origin_version_id` = NEW.`origin_version_id`
      AND job.`ledger_contract_version` = NEW.`ledger_contract_version`
      AND job.`ledger_contract_hash` = NEW.`ledger_contract_hash`
      AND job.`scheduled_trigger_at` = NEW.`scheduled_trigger_at`
      AND job.`persistence_deadline_at` = NEW.`persistence_deadline_at`
      AND job.`kickoff_at` = NEW.`kickoff_at`
      AND job.`state` = 'running'
      AND job.`active_attempt_token_hash` = NEW.`attempt_token_hash`
      AND job.`fence_token` = NEW.`fence_token`
      AND attempt.`lease_owner` = job.`lease_owner`
      AND attempt.`lease_acquired_at` = job.`lease_acquired_at`
      AND julianday(attempt.`lease_expires_at`) <= julianday(job.`lease_expires_at`)
      AND NEW.`invoked_at` = attempt.`invoked_at`
      AND julianday('now' /* os13a-authoritative-clock */) >=
        julianday(NEW.`scheduled_trigger_at`)
      AND julianday(NEW.`persisted_at`) <=
        julianday('now' /* os13a-authoritative-clock */)
      AND (julianday('now' /* os13a-authoritative-clock */) -
        julianday(NEW.`persisted_at`)) * 86400.0 <= 5.0
      AND julianday(job.`lease_acquired_at`) <= julianday(NEW.`invoked_at`)
      AND julianday(job.`lease_expires_at`) > julianday(NEW.`persisted_at`)
      AND julianday(job.`lease_expires_at`) >
        julianday('now' /* os13a-authoritative-clock */)
      AND activation.`activation_boundary` = NEW.`activation_boundary`
      AND activation.`evidence_scope` = NEW.`evidence_scope`
      AND activation.`qualification_id` = job.`qualification_id`
      AND activation.`qualification_id` = NEW.`qualification_id`
      AND qualification.`qualification_key` = NEW.`qualification_key`
      AND qualification.`qualification_stream` = NEW.`qualification_stream`
      AND (
        NEW.`withholding_reason` IS NULL OR
        NEW.`withholding_reason` <> 'no_eligible_package' OR
        qualification.`qualification_stream` = 'no_eligible_package'
      )
      AND (
        (
          NEW.`status` = 'forecast' AND qualification.`qualification_stream` = 'eligible_package' AND
          qualification.`qualification_status` = 'eligible' AND
          qualification.`runner_hash` = NEW.`runner_hash` AND
          qualification.`code_hash` = NEW.`code_hash` AND
          qualification.`model_or_package_hash` = NEW.`model_or_package_hash` AND
          qualification.`config_hash` = NEW.`config_hash` AND
          job.`expected_input_manifest_hash` = NEW.`input_manifest_hash` AND
          qualification.`feature_schema_hash` = NEW.`feature_schema_hash` AND
          qualification.`target_schema_hash` = NEW.`target_schema_hash`
        ) OR NEW.`status` = 'withheld'
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM `forecast_origin_versions` child
          WHERE child.`supersedes_origin_version_id` = origin.`origin_version_id`
        )
      )
      AND (
        (
          NEW.`timing` = 'timely' AND origin.`eligible` = 1 AND
          origin.`eligibility_reason` = 'eligible' AND
          julianday(activation.`activated_at`) <= julianday(NEW.`scheduled_trigger_at`) AND
          julianday(NEW.`persisted_at`) < julianday(NEW.`persistence_deadline_at`) AND
          julianday(NEW.`persisted_at`) <= julianday(NEW.`kickoff_at`, '-1 second') AND
          julianday('now' /* os13a-authoritative-clock */) <
            julianday(NEW.`persistence_deadline_at`) AND
          julianday('now' /* os13a-authoritative-clock */) <=
            julianday(NEW.`kickoff_at`, '-1 second')
        ) OR (
          NEW.`timing` = 'late' AND NEW.`withholding_reason` = 'late_origin_excluded' AND
          origin.`eligible` = 1 AND origin.`eligibility_reason` = 'eligible' AND
          (
            julianday(activation.`activated_at`) > julianday(NEW.`scheduled_trigger_at`) OR
            (
              (
                julianday(NEW.`persisted_at`) >= julianday(NEW.`persistence_deadline_at`) OR
                julianday(NEW.`persisted_at`) > julianday(NEW.`kickoff_at`, '-1 second')
              ) AND (
                julianday('now' /* os13a-authoritative-clock */) >=
                  julianday(NEW.`persistence_deadline_at`) OR
                julianday('now' /* os13a-authoritative-clock */) >
                  julianday(NEW.`kickoff_at`, '-1 second')
              )
            )
          )
        ) OR (
          NEW.`timing` = 'late' AND
          NEW.`withholding_reason` = 'schedule_unavailable_at_origin' AND
          origin.`eligible` = 0 AND origin.`eligibility_reason` = 'known_after_origin'
        ) OR (
          NEW.`timing` = 'late' AND NEW.`withholding_reason` = 'late_origin_excluded' AND
          origin.`eligible` = 0 AND origin.`eligibility_reason` IN (
            'pre_activation', 'after_kickoff', 'prior_origin_elapsed',
            'earlier_origin_prohibited'
          )
        )
      )
  )
  BEGIN SELECT RAISE(ABORT, 'ledger publication requires exact provenance and the live fenced origin claim'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_records_v1_finalize_job`
  AFTER INSERT ON `forecast_ledger_records_v1`
  BEGIN
    UPDATE `forecast_ledger_jobs_v1`
    SET `state` = 'completed',
        `active_attempt_token_hash` = NULL,
        `lease_owner` = NULL,
        `lease_acquired_at` = NULL,
        `lease_expires_at` = NULL,
        `completed_at` = NEW.`persisted_at`
    WHERE `job_key` = NEW.`job_key`
      AND `state` = 'running'
      AND `active_attempt_token_hash` = NEW.`attempt_token_hash`
      AND `fence_token` = NEW.`fence_token`;
  END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_records_v1_no_update`
  BEFORE UPDATE ON `forecast_ledger_records_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_records_v1 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_records_v1_no_delete`
  BEFORE DELETE ON `forecast_ledger_records_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_records_v1 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_events_v1_identity_collision_guard`
  BEFORE INSERT ON `forecast_ledger_events_v1`
  WHEN EXISTS (
    SELECT 1 FROM `forecast_ledger_events_v1` existing
    WHERE existing.`event_id` = NEW.`event_id`
      AND NOT (
        existing.`event_type` IS NEW.`event_type` AND
        existing.`activation_id` IS NEW.`activation_id` AND
        existing.`qualification_id` IS NEW.`qualification_id` AND
        existing.`job_key` IS NEW.`job_key` AND
        existing.`origin_version_id` IS NEW.`origin_version_id` AND
        existing.`attempt_token_hash` IS NEW.`attempt_token_hash` AND
        existing.`fence_token` IS NEW.`fence_token` AND
        existing.`occurred_at` IS NEW.`occurred_at` AND
        existing.`evidence_at` IS NEW.`evidence_at` AND
        existing.`persisted_at` IS NEW.`persisted_at` AND
        existing.`payload_json` IS NEW.`payload_json` AND
        existing.`payload_hash` IS NEW.`payload_hash`
      )
  )
  BEGIN SELECT RAISE(ABORT, 'forecast ledger event identity collision'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_events_v1_no_update`
  BEFORE UPDATE ON `forecast_ledger_events_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_events_v1 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_ledger_events_v1_no_delete`
  BEFORE DELETE ON `forecast_ledger_events_v1`
  BEGIN SELECT RAISE(ABORT, 'forecast_ledger_events_v1 is append-only'); END;
--> statement-breakpoint
INSERT INTO `engine_schema_versions` (`version`, `migration_hash`, `applied_at`)
VALUES (
  '0018_engine_os_forecast_ledger',
  'sha256:851f66b3ad07afe61be346b09f853875e675d25512f989b0f4337f6c64a1c293',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
