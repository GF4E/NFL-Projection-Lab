CREATE TABLE `source_capture_manifest_extensions` (
  `capture_id` text PRIMARY KEY NOT NULL,
  `contract_version` text NOT NULL,
  `contract_hash` text NOT NULL,
  `profile_id` text NOT NULL,
  `capture_class` text NOT NULL,
  `source_key` text NOT NULL,
  `source_observed_at` text,
  `receipt_completed_at` text NOT NULL,
  `persistence_requested_at` text NOT NULL,
  `response_persisted_at` text NOT NULL,
  `sidecar_persisted_at` text NOT NULL,
  `manifest_persisted_at` text NOT NULL,
  `content_type` text NOT NULL,
  `etag` text,
  `usage_rights_json` text NOT NULL,
  `usage_rights_hash` text NOT NULL,
  `validation_state` text NOT NULL,
  `failure_codes_json` text NOT NULL,
  `later_import_json` text NOT NULL,
  `later_import_hash` text NOT NULL,
  `extension_hash` text NOT NULL,
  CONSTRAINT `source_capture_extension_contract_check` CHECK (
    `contract_version` = 'source-capture-contract.2026.7' AND
    `contract_hash` = '9de33c9635ac8ded218bc9f774234e653135964204b5e3699b171536be99e867'
  ),
  CONSTRAINT `source_capture_extension_hash_check` CHECK (
    length(`capture_id`) = 64 AND lower(`capture_id`) = `capture_id` AND
    `capture_id` NOT GLOB '*[^0-9a-f]*' AND
    length(`usage_rights_hash`) = 64 AND lower(`usage_rights_hash`) = `usage_rights_hash` AND
    `usage_rights_hash` NOT GLOB '*[^0-9a-f]*' AND
    length(`later_import_hash`) = 64 AND lower(`later_import_hash`) = `later_import_hash` AND
    `later_import_hash` NOT GLOB '*[^0-9a-f]*' AND
    length(`extension_hash`) = 64 AND lower(`extension_hash`) = `extension_hash` AND
    `extension_hash` NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT `source_capture_extension_identity_check` CHECK (
    length(`profile_id`) > 0 AND length(`capture_class`) > 0 AND length(`source_key`) > 0
  ),
  CONSTRAINT `source_capture_extension_validation_check` CHECK (`validation_state` IN (
    'usable', 'raw_only_schema_invalid', 'raw_only_partial', 'raw_only_http_error'
  )),
  CONSTRAINT `source_capture_extension_json_check` CHECK (
    json_valid(`usage_rights_json`) AND json_type(`usage_rights_json`) = 'object' AND
    json_valid(`failure_codes_json`) AND json_type(`failure_codes_json`) = 'array' AND
    json_valid(`later_import_json`) AND json_type(`later_import_json`) = 'object'
  ),
  CONSTRAINT `source_capture_extension_rights_check` CHECK (
    json_extract(`usage_rights_json`, '$.licenseId') IS NOT NULL AND
    json_extract(`usage_rights_json`, '$.rightsUri') IS NOT NULL AND
    json_extract(`usage_rights_json`, '$.retrievedFor') IS NOT NULL AND
    json_extract(`usage_rights_json`, '$.redistribution') IS NOT NULL AND
    json_extract(`usage_rights_json`, '$.retentionClass') = 'raw_source_3650_days' AND
    json_extract(`usage_rights_json`, '$.reviewStatus') IS NOT NULL
  ),
  CONSTRAINT `source_capture_extension_import_check` CHECK (
    json_extract(`later_import_json`, '$.owner') IN ('OS-03', 'OS-04') AND
    length(json_extract(`later_import_json`, '$.target')) > 0
  ),
  CONSTRAINT `source_capture_extension_time_check` CHECK (
    julianday(`receipt_completed_at`) IS NOT NULL AND
    julianday(`persistence_requested_at`) IS NOT NULL AND
    julianday(`response_persisted_at`) IS NOT NULL AND
    julianday(`sidecar_persisted_at`) IS NOT NULL AND
    julianday(`manifest_persisted_at`) IS NOT NULL AND
    julianday(`receipt_completed_at`) <= julianday(`persistence_requested_at`) AND
    julianday(`persistence_requested_at`) <= julianday(`response_persisted_at`) AND
    julianday(`response_persisted_at`) <= julianday(`sidecar_persisted_at`) AND
    julianday(`sidecar_persisted_at`) <= julianday(`manifest_persisted_at`)
  ),
  CONSTRAINT `source_capture_extension_source_time_check` CHECK (
    (`source_observed_at` IS NOT NULL AND julianday(`source_observed_at`) IS NOT NULL) OR
    (`source_observed_at` IS NULL AND `validation_state` = 'raw_only_schema_invalid')
  ),
  CONSTRAINT `source_capture_extension_usable_check` CHECK (
    `validation_state` <> 'usable' OR `source_observed_at` IS NOT NULL
  ),
  FOREIGN KEY (`capture_id`) REFERENCES `source_capture_manifests` (`capture_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_source_capture_extension_source`
  ON `source_capture_manifest_extensions`
    (`source_key`, `validation_state`, `receipt_completed_at`, `capture_id`);
--> statement-breakpoint
CREATE INDEX `idx_source_capture_extension_evidence`
  ON `source_capture_manifest_extensions` (`extension_hash`);
--> statement-breakpoint
CREATE TABLE `source_capture_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `attempt_token` text NOT NULL,
  `event_type` text NOT NULL,
  `capture_id` text,
  `source_key` text NOT NULL,
  `provider` text NOT NULL,
  `dataset` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `occurred_at` text NOT NULL,
  `event_payload_hash` text NOT NULL,
  `payload_json` text NOT NULL,
  CONSTRAINT `source_capture_event_attempt_unique` UNIQUE (`attempt_token`),
  CONSTRAINT `source_capture_event_token_check` CHECK (
    length(`attempt_token`) BETWEEN 1 AND 200 AND
    `attempt_token` NOT GLOB '*[^A-Za-z0-9._:-]*'
  ),
  CONSTRAINT `source_capture_event_type_check` CHECK (`event_type` IN (
    'capture_committed', 'capture_committed_usable', 'capture_committed_raw_only',
    'capture_deduplicated', 'capture_failed', 'not_modified_confirmed',
    'replay_verified', 'freshness_stale', 'orphan_detected', 'orphan_removed'
  )),
  CONSTRAINT `source_capture_event_identity_check` CHECK (
    length(`source_key`) > 0 AND length(`provider`) > 0 AND
    length(`dataset`) > 0 AND length(`idempotency_key`) > 0
  ),
  CONSTRAINT `source_capture_event_capture_check` CHECK (
    `event_type` NOT IN (
      'capture_committed', 'capture_committed_usable', 'capture_committed_raw_only',
      'capture_deduplicated', 'not_modified_confirmed', 'replay_verified'
    ) OR `capture_id` IS NOT NULL
  ),
  CONSTRAINT `source_capture_event_evidence_check` CHECK (
    length(`event_id`) = 64 AND lower(`event_id`) = `event_id` AND
    `event_id` NOT GLOB '*[^0-9a-f]*' AND
    length(`event_payload_hash`) = 64 AND lower(`event_payload_hash`) = `event_payload_hash` AND
    `event_payload_hash` NOT GLOB '*[^0-9a-f]*' AND json_valid(`payload_json`) AND
    json_type(`payload_json`) = 'object'
  ),
  CONSTRAINT `source_capture_event_time_check` CHECK (julianday(`occurred_at`) IS NOT NULL),
  FOREIGN KEY (`capture_id`) REFERENCES `source_capture_manifests` (`capture_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_source_capture_events_source`
  ON `source_capture_events` (`source_key`, `occurred_at`, `event_type`);
--> statement-breakpoint
CREATE INDEX `idx_source_capture_events_capture`
  ON `source_capture_events` (`capture_id`, `occurred_at`);
--> statement-breakpoint
CREATE TRIGGER `source_capture_manifest_extensions_insert_guard`
  BEFORE INSERT ON `source_capture_manifest_extensions`
  WHEN NOT EXISTS (
    SELECT 1
    FROM `source_capture_manifests` base
    WHERE base.`capture_id` = NEW.`capture_id`
      AND base.`received_at` = NEW.`receipt_completed_at`
      AND base.`license_id` = json_extract(NEW.`usage_rights_json`, '$.licenseId')
      AND NEW.`source_key` = base.`provider` || ':' || base.`dataset` || ':' || NEW.`profile_id`
      AND (
        NEW.`validation_state` <> 'usable' OR
        (base.`provider_published_at` IS NOT NULL AND julianday(base.`provider_published_at`) IS NOT NULL)
      )
      AND (
        (NEW.`source_observed_at` IS NOT NULL AND base.`provider_published_at` IS NOT NULL) OR
        NEW.`validation_state` = 'raw_only_schema_invalid'
      )
  )
  BEGIN
    SELECT RAISE(ABORT, 'OS-03A extension must bind the exact base manifest identity and usable source times');
  END;
--> statement-breakpoint
CREATE TRIGGER `source_capture_manifest_extensions_no_update`
  BEFORE UPDATE ON `source_capture_manifest_extensions`
  BEGIN SELECT RAISE(ABORT, 'source_capture_manifest_extensions is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `source_capture_manifest_extensions_no_delete`
  BEFORE DELETE ON `source_capture_manifest_extensions`
  BEGIN SELECT RAISE(ABORT, 'source_capture_manifest_extensions is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `source_capture_events_insert_guard`
  BEFORE INSERT ON `source_capture_events`
  WHEN NEW.`capture_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM `source_capture_manifests` base
    JOIN `source_capture_manifest_extensions` extension
      ON extension.`capture_id` = base.`capture_id`
    WHERE base.`capture_id` = NEW.`capture_id`
      AND base.`provider` = NEW.`provider`
      AND base.`dataset` = NEW.`dataset`
      AND extension.`source_key` = NEW.`source_key`
      AND json_extract(NEW.`payload_json`, '$.captureId') = NEW.`capture_id`
      AND json_extract(NEW.`payload_json`, '$.evidenceHash') = base.`evidence_hash`
      AND (
        NEW.`event_type` = 'not_modified_confirmed' OR
        base.`idempotency_key` = NEW.`idempotency_key`
      )
      AND (
        NEW.`event_type` NOT IN (
          'capture_committed', 'capture_committed_usable', 'capture_committed_raw_only'
        ) OR json_extract(NEW.`payload_json`, '$.extensionHash') = extension.`extension_hash`
      )
      AND (
        NEW.`event_type` NOT IN (
          'capture_committed', 'capture_committed_usable', 'capture_committed_raw_only',
          'capture_deduplicated', 'replay_verified'
        ) OR (
          json_extract(NEW.`payload_json`, '$.responseSha256') = base.`response_sha256` AND
          json_extract(NEW.`payload_json`, '$.sidecarSha256') = base.`sidecar_sha256`
        )
      )
      AND (
        NEW.`event_type` <> 'capture_committed_usable' OR
        (
          extension.`validation_state` = 'usable' AND
          julianday(NEW.`occurred_at`) >= julianday(extension.`manifest_persisted_at`) AND
          NOT EXISTS (
            SELECT 1 FROM `source_capture_events` failed
            WHERE failed.`source_key` = extension.`source_key`
              AND failed.`event_type` = 'capture_failed'
              AND json_extract(failed.`payload_json`, '$.failureCode') = 'corrupt_object'
              AND json_extract(failed.`payload_json`, '$.context.captureId') = base.`capture_id`
              AND json_extract(failed.`payload_json`, '$.context.phase') =
                'post_manifest_pre_pointer_r2_verification'
          )
        )
      )
      AND (
        NEW.`event_type` <> 'capture_committed_raw_only' OR
        extension.`validation_state` <> 'usable'
      )
      AND (
        NEW.`event_type` <> 'not_modified_confirmed' OR NOT EXISTS (
          SELECT 1 FROM `source_capture_events` failed
          WHERE failed.`source_key` = extension.`source_key`
            AND failed.`event_type` = 'capture_failed'
            AND json_extract(failed.`payload_json`, '$.failureCode') = 'corrupt_object'
            AND json_extract(failed.`payload_json`, '$.context.captureId') = base.`capture_id`
            AND json_extract(failed.`payload_json`, '$.context.phase') =
              'post_manifest_pre_pointer_r2_verification'
        )
      )
  )
  BEGIN
    SELECT RAISE(ABORT, 'OS-03A event must bind the exact immutable capture identity');
  END;
--> statement-breakpoint
CREATE TRIGGER `source_capture_events_no_update`
  BEFORE UPDATE ON `source_capture_events`
  BEGIN SELECT RAISE(ABORT, 'source_capture_events is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `source_capture_events_no_delete`
  BEFORE DELETE ON `source_capture_events`
  BEGIN SELECT RAISE(ABORT, 'source_capture_events is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `source_capture_heartbeats_os03a_insert_guard`
  BEFORE INSERT ON `source_capture_heartbeats`
  WHEN NEW.`latest_capture_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM `source_capture_manifests` base
    JOIN `source_capture_manifest_extensions` extension
      ON extension.`capture_id` = base.`capture_id`
    WHERE base.`capture_id` = NEW.`latest_capture_id`
      AND base.`provider` = NEW.`provider`
      AND base.`dataset` = NEW.`dataset`
      AND extension.`source_key` = NEW.`source_key`
      AND extension.`validation_state` = 'usable'
      AND NOT EXISTS (
        SELECT 1 FROM `source_capture_events` failed
        WHERE failed.`source_key` = extension.`source_key`
          AND failed.`event_type` = 'capture_failed'
          AND json_extract(failed.`payload_json`, '$.failureCode') = 'corrupt_object'
          AND json_extract(failed.`payload_json`, '$.context.captureId') = base.`capture_id`
          AND json_extract(failed.`payload_json`, '$.context.phase') =
            'post_manifest_pre_pointer_r2_verification'
      )
      AND EXISTS (
        SELECT 1 FROM `source_capture_events` event
        WHERE event.`capture_id` = base.`capture_id`
          AND event.`source_key` = NEW.`source_key`
          AND event.`provider` = NEW.`provider`
          AND event.`dataset` = NEW.`dataset`
          AND event.`idempotency_key` = base.`idempotency_key`
          AND event.`event_type` = 'capture_committed_usable'
      )
  )
  BEGIN
    SELECT RAISE(ABORT, 'OS-03A latest-good pointer must bind an exact usable immutable capture');
  END;
--> statement-breakpoint
CREATE TRIGGER `source_capture_heartbeats_os03a_update_guard`
  BEFORE UPDATE ON `source_capture_heartbeats`
  WHEN
    (OLD.`latest_capture_id` IS NOT NULL AND NEW.`latest_capture_id` IS NULL) OR
    (
      NEW.`latest_capture_id` IS NOT NULL AND NOT (
        (
          NEW.`latest_capture_id` = OLD.`latest_capture_id` AND
          NEW.`status` <> 'current' AND
          NEW.`last_success_at` IS OLD.`last_success_at` AND
          NEW.`source_key` = OLD.`source_key` AND
          NEW.`provider` = OLD.`provider` AND
          NEW.`dataset` = OLD.`dataset` AND
          julianday(NEW.`last_attempt_at`) >= julianday(OLD.`last_attempt_at`) AND
          EXISTS (
            SELECT 1 FROM `source_capture_events` failed
            WHERE failed.`source_key` = NEW.`source_key`
              AND failed.`event_type` = 'capture_failed'
              AND json_extract(failed.`payload_json`, '$.failureCode') = 'corrupt_object'
              AND json_extract(failed.`payload_json`, '$.context.captureId') =
                NEW.`latest_capture_id`
              AND json_extract(failed.`payload_json`, '$.context.phase') =
                'post_manifest_pre_pointer_r2_verification'
          )
        ) OR EXISTS (
        SELECT 1
        FROM `source_capture_manifests` candidate_base
        JOIN `source_capture_manifest_extensions` candidate_extension
          ON candidate_extension.`capture_id` = candidate_base.`capture_id`
        WHERE candidate_base.`capture_id` = NEW.`latest_capture_id`
          AND candidate_base.`provider` = NEW.`provider`
          AND candidate_base.`dataset` = NEW.`dataset`
          AND candidate_extension.`source_key` = NEW.`source_key`
          AND candidate_extension.`validation_state` = 'usable'
          AND NOT EXISTS (
            SELECT 1 FROM `source_capture_events` failed
            WHERE failed.`source_key` = candidate_extension.`source_key`
              AND failed.`event_type` = 'capture_failed'
              AND json_extract(failed.`payload_json`, '$.failureCode') = 'corrupt_object'
              AND json_extract(failed.`payload_json`, '$.context.captureId') = candidate_base.`capture_id`
              AND json_extract(failed.`payload_json`, '$.context.phase') =
                'post_manifest_pre_pointer_r2_verification'
          )
          AND EXISTS (
            SELECT 1 FROM `source_capture_events` event
            WHERE event.`capture_id` = candidate_base.`capture_id`
              AND event.`source_key` = NEW.`source_key`
              AND event.`provider` = NEW.`provider`
              AND event.`dataset` = NEW.`dataset`
              AND event.`idempotency_key` = candidate_base.`idempotency_key`
              AND event.`event_type` = 'capture_committed_usable'
          )
          AND (
            NEW.`latest_capture_id` = OLD.`latest_capture_id` OR
            OLD.`latest_capture_id` IS NULL OR
            EXISTS (
              SELECT 1
              FROM `source_capture_manifest_extensions` current_extension
              WHERE current_extension.`capture_id` = OLD.`latest_capture_id`
                AND (
                  julianday(candidate_extension.`receipt_completed_at`) >
                    julianday(current_extension.`receipt_completed_at`) OR
                  (
                    candidate_extension.`receipt_completed_at` = current_extension.`receipt_completed_at` AND
                    candidate_extension.`capture_id` > current_extension.`capture_id`
                  )
                )
            )
          )
        )
      )
    )
  BEGIN
    SELECT RAISE(ABORT, 'OS-03A latest-good pointer cannot clear, cross-wire, or move backward');
  END;
--> statement-breakpoint
INSERT INTO `engine_schema_versions` (`version`, `migration_hash`, `applied_at`)
VALUES (
  '0017_engine_os_source_capture',
  'sha256:66a447e310fd4918943c7157ca8263712692d99756acbce40e76d1a76dce0a5e',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
