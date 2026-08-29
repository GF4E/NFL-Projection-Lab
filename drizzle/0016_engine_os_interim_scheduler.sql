CREATE TABLE `engine_scheduler_ticks_v2` (
  `tick_key` text PRIMARY KEY NOT NULL,
  `scheduler_contract_version` text NOT NULL,
  `scheduler_contract_hash` text NOT NULL,
  `tick_key_version` text NOT NULL,
  `lane` text NOT NULL,
  `nominal_scheduled_at` text NOT NULL,
  `invoked_at` text NOT NULL,
  `evidence_at` text NOT NULL,
  `persisted_at` text NOT NULL,
  `state` text NOT NULL,
  `attempt_token_hash` text,
  `fence_token` integer NOT NULL,
  `lease_owner` text,
  `lease_acquired_at` text,
  `lease_expires_at` text,
  `heartbeat_at` text,
  `completed_at` text,
  `failure_code` text,
  CONSTRAINT `engine_scheduler_tick_contract_hash_check`
    CHECK (length(`scheduler_contract_hash`) = 64),
  CONSTRAINT `engine_scheduler_tick_key_version_check`
    CHECK (`tick_key_version` = 'engine-os.scheduler-tick.v1'),
  CONSTRAINT `engine_scheduler_tick_lane_check`
    CHECK (`lane` IN ('dispatcher', 'watchdog')),
  CONSTRAINT `engine_scheduler_tick_state_check`
    CHECK (`state` IN ('running', 'completed', 'failed')),
  CONSTRAINT `engine_scheduler_tick_fence_check`
    CHECK (`fence_token` >= 1),
  CONSTRAINT `engine_scheduler_tick_time_check`
    CHECK (
      length(`nominal_scheduled_at`) > 0 AND
      length(`invoked_at`) > 0 AND
      length(`evidence_at`) > 0 AND
      length(`persisted_at`) > 0 AND
      julianday(`nominal_scheduled_at`) IS NOT NULL AND
      julianday(`invoked_at`) IS NOT NULL AND
      julianday(`evidence_at`) IS NOT NULL AND
      julianday(`persisted_at`) IS NOT NULL AND
      julianday(`nominal_scheduled_at`) <= julianday(`invoked_at`) AND
      julianday(`evidence_at`) <= julianday(`persisted_at`) AND
      julianday(`invoked_at`) <= julianday(`persisted_at`)
    ),
  CONSTRAINT `engine_scheduler_tick_lease_check`
    CHECK (
      (
        `state` = 'running' AND
        `attempt_token_hash` IS NOT NULL AND length(`attempt_token_hash`) = 64 AND
        `lease_owner` IS NOT NULL AND length(`lease_owner`) > 0 AND
        `lease_acquired_at` IS NOT NULL AND
        `lease_expires_at` IS NOT NULL AND
        `heartbeat_at` IS NOT NULL AND
        julianday(`lease_acquired_at`) IS NOT NULL AND
        julianday(`lease_expires_at`) IS NOT NULL AND
        julianday(`heartbeat_at`) IS NOT NULL AND
        julianday(`lease_acquired_at`) <= julianday(`heartbeat_at`) AND
        julianday(`heartbeat_at`) < julianday(`lease_expires_at`) AND
        `completed_at` IS NULL
      ) OR
      (
        `state` IN ('completed', 'failed') AND
        `attempt_token_hash` IS NULL AND
        `lease_owner` IS NULL AND
        `lease_acquired_at` IS NULL AND
        `lease_expires_at` IS NULL AND
        `heartbeat_at` IS NOT NULL AND
        `completed_at` IS NOT NULL AND
        julianday(`heartbeat_at`) IS NOT NULL AND
        julianday(`completed_at`) IS NOT NULL AND
        julianday(`heartbeat_at`) <= julianday(`completed_at`)
      )
    ),
  CONSTRAINT `engine_scheduler_tick_failure_check`
    CHECK (
      (`state` = 'failed' AND `failure_code` IS NOT NULL AND length(`failure_code`) > 0) OR
      (`state` <> 'failed' AND `failure_code` IS NULL)
    ),
  CONSTRAINT `engine_scheduler_tick_identity_unique`
    UNIQUE (`scheduler_contract_hash`, `lane`, `nominal_scheduled_at`)
);
--> statement-breakpoint
CREATE INDEX `idx_engine_scheduler_ticks_v2_watchdog`
  ON `engine_scheduler_ticks_v2` (`lane`, `nominal_scheduled_at`, `state`);
--> statement-breakpoint
CREATE INDEX `idx_engine_scheduler_ticks_v2_lease`
  ON `engine_scheduler_ticks_v2` (`state`, `lease_expires_at`);
--> statement-breakpoint
CREATE TABLE `engine_origin_jobs_v2` (
  `job_key` text PRIMARY KEY NOT NULL,
  `scheduler_contract_version` text NOT NULL,
  `scheduler_contract_hash` text NOT NULL,
  `job_key_version` text NOT NULL,
  `job_type` text NOT NULL,
  `origin_version_id` text NOT NULL UNIQUE,
  `scheduled_trigger_at` text NOT NULL,
  `kickoff_at` text NOT NULL,
  `persistence_deadline_at` text NOT NULL,
  `activation_boundary` text NOT NULL,
  `state` text NOT NULL,
  `fence_token` integer NOT NULL DEFAULT 0,
  `active_attempt_token_hash` text,
  `lease_owner` text,
  `lease_acquired_at` text,
  `lease_expires_at` text,
  `heartbeat_at` text,
  `completed_at` text,
  `created_at` text NOT NULL,
  CONSTRAINT `engine_origin_job_contract_hash_check`
    CHECK (length(`scheduler_contract_hash`) = 64),
  CONSTRAINT `engine_origin_job_key_version_check`
    CHECK (`job_key_version` = 'engine-os.scheduler-job.v2'),
  CONSTRAINT `engine_origin_job_type_check`
    CHECK (`job_type` = 'forecast_or_withholding'),
  CONSTRAINT `engine_origin_job_state_check`
    CHECK (`state` IN ('pending', 'running', 'completed', 'invalidated')),
  CONSTRAINT `engine_origin_job_fence_check`
    CHECK (`fence_token` >= 0),
  CONSTRAINT `engine_origin_job_time_check`
    CHECK (
      length(`scheduled_trigger_at`) > 0 AND
      length(`kickoff_at`) > 0 AND
      length(`persistence_deadline_at`) > 0 AND
      length(`activation_boundary`) > 0 AND
      length(`created_at`) > 0 AND
      julianday(`scheduled_trigger_at`) IS NOT NULL AND
      julianday(`kickoff_at`) IS NOT NULL AND
      julianday(`persistence_deadline_at`) IS NOT NULL AND
      julianday(`created_at`) IS NOT NULL AND
      julianday(`persistence_deadline_at`) < julianday(`kickoff_at`)
    ),
  CONSTRAINT `engine_origin_job_lease_check`
    CHECK (
      (
        `state` = 'pending' AND `fence_token` = 0 AND
        `active_attempt_token_hash` IS NULL AND `lease_owner` IS NULL AND
        `lease_acquired_at` IS NULL AND `lease_expires_at` IS NULL AND
        `heartbeat_at` IS NULL AND `completed_at` IS NULL
      ) OR
      (
        `state` = 'running' AND `fence_token` >= 1 AND
        `active_attempt_token_hash` IS NOT NULL AND length(`active_attempt_token_hash`) = 64 AND
        `lease_owner` IS NOT NULL AND length(`lease_owner`) > 0 AND
        `lease_acquired_at` IS NOT NULL AND `lease_expires_at` IS NOT NULL AND
        `heartbeat_at` IS NOT NULL AND
        julianday(`lease_acquired_at`) IS NOT NULL AND
        julianday(`lease_expires_at`) IS NOT NULL AND
        julianday(`heartbeat_at`) IS NOT NULL AND
        julianday(`lease_acquired_at`) <= julianday(`heartbeat_at`) AND
        julianday(`heartbeat_at`) < julianday(`lease_expires_at`) AND `completed_at` IS NULL
      ) OR
      (
        `state` IN ('completed', 'invalidated') AND
        `active_attempt_token_hash` IS NULL AND `lease_owner` IS NULL AND
        `lease_acquired_at` IS NULL AND `lease_expires_at` IS NULL AND
        `heartbeat_at` IS NOT NULL AND `completed_at` IS NOT NULL AND
        julianday(`heartbeat_at`) IS NOT NULL AND
        julianday(`completed_at`) IS NOT NULL AND
        julianday(`heartbeat_at`) <= julianday(`completed_at`)
      )
    ),
  FOREIGN KEY (`origin_version_id`) REFERENCES `forecast_origin_versions` (`origin_version_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_engine_origin_jobs_v2_due`
  ON `engine_origin_jobs_v2` (`state`, `scheduled_trigger_at`, `persistence_deadline_at`);
--> statement-breakpoint
CREATE INDEX `idx_engine_origin_jobs_v2_lease`
  ON `engine_origin_jobs_v2` (`state`, `lease_expires_at`);
--> statement-breakpoint
CREATE TABLE `engine_origin_attempts_v2` (
  `attempt_id` text PRIMARY KEY NOT NULL,
  `job_key` text NOT NULL,
  `origin_version_id` text NOT NULL,
  `attempt_token_hash` text NOT NULL,
  `fence_token` integer NOT NULL,
  `lease_owner` text NOT NULL,
  `invoked_at` text NOT NULL,
  `lease_acquired_at` text NOT NULL,
  `lease_expires_at` text NOT NULL,
  `persisted_at` text NOT NULL,
  CONSTRAINT `engine_origin_attempt_token_check` CHECK (length(`attempt_token_hash`) = 64),
  CONSTRAINT `engine_origin_attempt_fence_check` CHECK (`fence_token` >= 1),
  CONSTRAINT `engine_origin_attempt_owner_check` CHECK (length(`lease_owner`) > 0),
  CONSTRAINT `engine_origin_attempt_time_check` CHECK (
    julianday(`invoked_at`) IS NOT NULL AND
    julianday(`lease_acquired_at`) IS NOT NULL AND
    julianday(`lease_expires_at`) IS NOT NULL AND
    julianday(`persisted_at`) IS NOT NULL AND
    julianday(`invoked_at`) <= julianday(`persisted_at`) AND
    julianday(`lease_acquired_at`) <= julianday(`persisted_at`) AND
    julianday(`persisted_at`) < julianday(`lease_expires_at`)
  ),
  CONSTRAINT `engine_origin_attempt_job_fence_unique` UNIQUE (`job_key`, `fence_token`),
  CONSTRAINT `engine_origin_attempt_job_token_unique` UNIQUE (`job_key`, `attempt_token_hash`),
  FOREIGN KEY (`job_key`) REFERENCES `engine_origin_jobs_v2` (`job_key`),
  FOREIGN KEY (`origin_version_id`) REFERENCES `forecast_origin_versions` (`origin_version_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_engine_origin_attempts_v2_origin`
  ON `engine_origin_attempts_v2` (`origin_version_id`, `fence_token`);
--> statement-breakpoint
CREATE TABLE `engine_scheduler_events_v2` (
  `event_id` text PRIMARY KEY NOT NULL,
  `event_type` text NOT NULL,
  `tick_key` text,
  `job_key` text,
  `origin_version_id` text,
  `attempt_token_hash` text,
  `fence_token` integer,
  `occurred_at` text NOT NULL,
  `evidence_at` text NOT NULL,
  `persisted_at` text NOT NULL,
  `payload_json` text NOT NULL,
  CONSTRAINT `engine_scheduler_event_type_check` CHECK (`event_type` IN (
    'tick_claimed', 'tick_reclaimed', 'tick_renewed', 'tick_completed', 'tick_failed',
    'job_claimed', 'job_reclaimed', 'job_renewed', 'job_completed', 'job_invalidated',
    'missed_tick_detected', 'watchdog_recovery_checkpoint',
    'schedule_unresolved_observed', 'operational_alert'
  )),
  CONSTRAINT `engine_scheduler_event_subject_check` CHECK (
    (`tick_key` IS NOT NULL AND `job_key` IS NULL) OR
    (`tick_key` IS NULL AND `job_key` IS NOT NULL)
  ),
  CONSTRAINT `engine_scheduler_event_attempt_check` CHECK (
    (`attempt_token_hash` IS NULL AND `fence_token` IS NULL) OR
    (`attempt_token_hash` IS NOT NULL AND length(`attempt_token_hash`) = 64 AND `fence_token` >= 1)
  ),
  CONSTRAINT `engine_scheduler_event_time_check` CHECK (
    length(`occurred_at`) > 0 AND length(`evidence_at`) > 0 AND length(`persisted_at`) > 0 AND
    julianday(`occurred_at`) IS NOT NULL AND
    julianday(`evidence_at`) IS NOT NULL AND
    julianday(`persisted_at`) IS NOT NULL AND
    julianday(`occurred_at`) <= julianday(`persisted_at`) AND
    julianday(`evidence_at`) <= julianday(`persisted_at`)
  ),
  CONSTRAINT `engine_scheduler_event_payload_check` CHECK (json_valid(`payload_json`)),
  FOREIGN KEY (`tick_key`) REFERENCES `engine_scheduler_ticks_v2` (`tick_key`),
  FOREIGN KEY (`job_key`) REFERENCES `engine_origin_jobs_v2` (`job_key`),
  FOREIGN KEY (`origin_version_id`) REFERENCES `forecast_origin_versions` (`origin_version_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_engine_scheduler_events_v2_tick`
  ON `engine_scheduler_events_v2` (`tick_key`, `occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_engine_scheduler_events_v2_job`
  ON `engine_scheduler_events_v2` (`job_key`, `occurred_at`);
--> statement-breakpoint
CREATE TABLE `engine_origin_records_v2` (
  `record_id` text PRIMARY KEY NOT NULL,
  `decision_hash` text NOT NULL UNIQUE,
  `job_key` text NOT NULL UNIQUE,
  `origin_version_id` text NOT NULL UNIQUE,
  `scheduler_contract_version` text NOT NULL,
  `scheduler_contract_hash` text NOT NULL,
  `status` text NOT NULL,
  `withholding_reason` text NOT NULL,
  `scheduled_trigger_at` text NOT NULL,
  `invoked_at` text NOT NULL,
  `evidence_at` text NOT NULL,
  `generated_at` text NOT NULL,
  `persistence_requested_at` text NOT NULL,
  `persisted_at` text NOT NULL,
  `persistence_deadline_at` text NOT NULL,
  `kickoff_at` text NOT NULL,
  `timing` text NOT NULL,
  `prospective_eligible` integer NOT NULL,
  `capture_health` text NOT NULL,
  `activation_boundary` text NOT NULL,
  `attempt_token_hash` text NOT NULL,
  `fence_token` integer NOT NULL,
  `qualification_only` integer NOT NULL DEFAULT 1,
  `payload_json` text NOT NULL,
  CONSTRAINT `engine_origin_record_contract_hash_check`
    CHECK (length(`scheduler_contract_hash`) = 64 AND length(`decision_hash`) = 64),
  CONSTRAINT `engine_origin_record_status_check`
    CHECK (`status` = 'withheld'),
  CONSTRAINT `engine_origin_record_reason_check` CHECK (`withholding_reason` IN (
    'no_eligible_package', 'schedule_unavailable_at_origin', 'required_source_stale',
    'required_source_partial', 'required_source_unavailable', 'schema_invalid',
    'provenance_incomplete', 'package_hash_mismatch', 'late_origin_excluded', 'compute_failure'
  )),
  CONSTRAINT `engine_origin_record_timing_check` CHECK (
    (
      `timing` = 'timely' AND `prospective_eligible` = 1 AND
      `withholding_reason` NOT IN ('late_origin_excluded', 'schedule_unavailable_at_origin') AND
      julianday(`persisted_at`) < julianday(`persistence_deadline_at`) AND
      julianday(`persisted_at`) < julianday(`kickoff_at`)
    ) OR
    (
      `timing` = 'late' AND `prospective_eligible` = 0 AND
      (
        `withholding_reason` = 'late_origin_excluded' OR
        `withholding_reason` = 'schedule_unavailable_at_origin'
      )
    )
  ),
  CONSTRAINT `engine_origin_record_time_check` CHECK (
    julianday(`scheduled_trigger_at`) IS NOT NULL AND
    julianday(`invoked_at`) IS NOT NULL AND
    julianday(`evidence_at`) IS NOT NULL AND
    julianday(`generated_at`) IS NOT NULL AND
    julianday(`persistence_requested_at`) IS NOT NULL AND
    julianday(`persisted_at`) IS NOT NULL AND
    julianday(`persistence_deadline_at`) IS NOT NULL AND
    julianday(`kickoff_at`) IS NOT NULL AND
    julianday(`scheduled_trigger_at`) <= julianday(`invoked_at`) AND
    julianday(`scheduled_trigger_at`) <= julianday(`generated_at`) AND
    julianday(`invoked_at`) <= julianday(`persisted_at`) AND
    julianday(`evidence_at`) <= julianday(`generated_at`) AND
    julianday(`generated_at`) <= julianday(`persistence_requested_at`) AND
    julianday(`persistence_requested_at`) <= julianday(`persisted_at`) AND
    julianday(`persistence_deadline_at`) < julianday(`kickoff_at`)
  ),
  CONSTRAINT `engine_origin_record_capture_check`
    CHECK (`capture_health` IN ('current', 'stale', 'partial', 'unavailable')),
  CONSTRAINT `engine_origin_record_attempt_check`
    CHECK (length(`attempt_token_hash`) = 64 AND `fence_token` >= 1),
  CONSTRAINT `engine_origin_record_qualification_check`
    CHECK (`qualification_only` = 1),
  CONSTRAINT `engine_origin_record_payload_check`
    CHECK (json_valid(`payload_json`)),
  FOREIGN KEY (`job_key`) REFERENCES `engine_origin_jobs_v2` (`job_key`),
  FOREIGN KEY (`origin_version_id`) REFERENCES `forecast_origin_versions` (`origin_version_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_engine_origin_records_v2_origin`
  ON `engine_origin_records_v2` (`origin_version_id`, `persisted_at`);
--> statement-breakpoint
CREATE TRIGGER `engine_scheduler_ticks_v2_insert_guard`
  BEFORE INSERT ON `engine_scheduler_ticks_v2`
  WHEN NOT (
    NEW.`state` = 'running' AND NEW.`fence_token` = 1 AND
    NEW.`attempt_token_hash` IS NOT NULL AND NEW.`lease_owner` IS NOT NULL AND
    NEW.`lease_acquired_at` IS NOT NULL AND NEW.`lease_expires_at` IS NOT NULL AND
    NEW.`heartbeat_at` = NEW.`lease_acquired_at` AND NEW.`completed_at` IS NULL AND
    NEW.`failure_code` IS NULL
  )
  BEGIN SELECT RAISE(ABORT, 'scheduler tick must begin as one live fenced attempt'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_scheduler_ticks_v2_update_guard`
  BEFORE UPDATE ON `engine_scheduler_ticks_v2`
  WHEN NOT (
    NEW.`tick_key` = OLD.`tick_key` AND
    NEW.`scheduler_contract_version` = OLD.`scheduler_contract_version` AND
    NEW.`scheduler_contract_hash` = OLD.`scheduler_contract_hash` AND
    NEW.`tick_key_version` = OLD.`tick_key_version` AND
    NEW.`lane` = OLD.`lane` AND
    NEW.`nominal_scheduled_at` = OLD.`nominal_scheduled_at` AND
    NEW.`invoked_at` = OLD.`invoked_at` AND
    NEW.`evidence_at` = OLD.`evidence_at` AND
    NEW.`persisted_at` = OLD.`persisted_at` AND
    NEW.`fence_token` >= OLD.`fence_token` AND
    (
      (
        OLD.`state` = 'running' AND NEW.`state` = 'running' AND
        (
          (
            NEW.`fence_token` = OLD.`fence_token` AND
            NEW.`attempt_token_hash` = OLD.`attempt_token_hash` AND
            NEW.`lease_owner` = OLD.`lease_owner` AND
            NEW.`lease_acquired_at` = OLD.`lease_acquired_at` AND
            julianday(NEW.`heartbeat_at`) > julianday(OLD.`heartbeat_at`) AND
            julianday(NEW.`heartbeat_at`) < julianday(OLD.`lease_expires_at`) AND
            julianday(NEW.`lease_expires_at`) > julianday(OLD.`lease_expires_at`)
          ) OR
          (
            NEW.`fence_token` = OLD.`fence_token` + 1 AND
            julianday(OLD.`lease_expires_at`) <= julianday(NEW.`lease_acquired_at`) AND
            NEW.`attempt_token_hash` <> OLD.`attempt_token_hash` AND
            NEW.`heartbeat_at` = NEW.`lease_acquired_at` AND
            julianday(NEW.`lease_expires_at`) > julianday(NEW.`lease_acquired_at`)
          )
        )
      ) OR
      (
        OLD.`state` = 'running' AND NEW.`state` IN ('completed', 'failed') AND
        NEW.`fence_token` = OLD.`fence_token` AND
        NEW.`attempt_token_hash` IS NULL AND NEW.`lease_owner` IS NULL AND
        NEW.`lease_acquired_at` IS NULL AND NEW.`lease_expires_at` IS NULL AND
        NEW.`heartbeat_at` = OLD.`heartbeat_at` AND
        julianday(NEW.`completed_at`) >= julianday(OLD.`heartbeat_at`) AND
        julianday(NEW.`completed_at`) < julianday(OLD.`lease_expires_at`)
      )
    )
  )
  BEGIN SELECT RAISE(ABORT, 'scheduler tick lease transition violates fencing contract'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_scheduler_ticks_v2_no_delete`
  BEFORE DELETE ON `engine_scheduler_ticks_v2`
  BEGIN SELECT RAISE(ABORT, 'engine_scheduler_ticks_v2 coordination history cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_origin_jobs_v2_insert_guard`
  BEFORE INSERT ON `engine_origin_jobs_v2`
  WHEN NEW.`state` <> 'pending' OR NEW.`fence_token` <> 0 OR NOT EXISTS (
    SELECT 1
    FROM `forecast_origin_versions` origin
    JOIN `game_schedule_revisions` schedule
      ON schedule.`revision_id` = origin.`kickoff_revision_id`
      AND schedule.`game_id` = origin.`game_id`
    JOIN `canonical_games` game
      ON game.`game_id` = origin.`game_id`
      AND game.`season` = 2026
      AND game.`season_type` = 'REG'
    WHERE origin.`origin_version_id` = NEW.`origin_version_id`
      AND origin.`scheduled_for_utc` IS NOT NULL
      AND origin.`eligibility_reason` <> 'schedule_unresolved'
      AND NOT EXISTS (
        SELECT 1 FROM `forecast_origin_versions` child
        WHERE child.`supersedes_origin_version_id` = origin.`origin_version_id`
      )
      AND NEW.`scheduled_trigger_at` = origin.`scheduled_for_utc`
      AND NEW.`activation_boundary` = origin.`activation_boundary`
      AND NEW.`kickoff_at` = schedule.`kickoff_utc`
      AND (
        julianday(NEW.`scheduled_trigger_at`) < julianday(NEW.`kickoff_at`) OR
        origin.`eligibility_reason` = 'after_kickoff'
      )
      AND CAST(strftime('%s', NEW.`persistence_deadline_at`) AS integer) = min(
        CAST(strftime('%s', origin.`scheduled_for_utc`) AS integer) +
          CASE origin.`horizon_id`
            WHEN 'kickoff_minus_15' THEN 300
            ELSE 600
          END,
        CAST(strftime('%s', schedule.`kickoff_utc`) AS integer) - 1
      )
  )
  BEGIN SELECT RAISE(ABORT, 'scheduler job must bind to a current timed origin and its effective deadline'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_origin_jobs_v2_update_guard`
  BEFORE UPDATE ON `engine_origin_jobs_v2`
  WHEN NOT (
    NEW.`job_key` = OLD.`job_key` AND
    NEW.`scheduler_contract_version` = OLD.`scheduler_contract_version` AND
    NEW.`scheduler_contract_hash` = OLD.`scheduler_contract_hash` AND
    NEW.`job_key_version` = OLD.`job_key_version` AND
    NEW.`job_type` = OLD.`job_type` AND
    NEW.`origin_version_id` = OLD.`origin_version_id` AND
    NEW.`scheduled_trigger_at` = OLD.`scheduled_trigger_at` AND
    NEW.`kickoff_at` = OLD.`kickoff_at` AND
    NEW.`persistence_deadline_at` = OLD.`persistence_deadline_at` AND
    NEW.`activation_boundary` = OLD.`activation_boundary` AND
    NEW.`created_at` = OLD.`created_at` AND
    NEW.`fence_token` >= OLD.`fence_token` AND
    (
      (
        NEW.`state` = 'running' AND NEW.`fence_token` = OLD.`fence_token` + 1 AND
        (
          OLD.`state` = 'pending' OR
          (OLD.`state` = 'running' AND
            julianday(OLD.`lease_expires_at`) <= julianday(NEW.`lease_acquired_at`))
        ) AND
        NEW.`active_attempt_token_hash` IS NOT NULL AND
        NEW.`active_attempt_token_hash` <> coalesce(OLD.`active_attempt_token_hash`, '') AND
        NEW.`lease_owner` IS NOT NULL AND
        NEW.`heartbeat_at` = NEW.`lease_acquired_at` AND
        julianday(NEW.`lease_expires_at`) > julianday(NEW.`lease_acquired_at`) AND
        NEW.`completed_at` IS NULL
      ) OR
      (
        OLD.`state` = 'running' AND NEW.`state` = 'running' AND
        NEW.`fence_token` = OLD.`fence_token` AND
        NEW.`active_attempt_token_hash` = OLD.`active_attempt_token_hash` AND
        NEW.`lease_owner` = OLD.`lease_owner` AND
        NEW.`lease_acquired_at` = OLD.`lease_acquired_at` AND
        julianday(NEW.`heartbeat_at`) > julianday(OLD.`heartbeat_at`) AND
        julianday(NEW.`heartbeat_at`) < julianday(OLD.`lease_expires_at`) AND
        julianday(NEW.`lease_expires_at`) > julianday(OLD.`lease_expires_at`) AND
        NEW.`completed_at` IS NULL
      ) OR
      (
        OLD.`state` = 'running' AND NEW.`state` = 'completed' AND
        NEW.`fence_token` = OLD.`fence_token` AND
        NEW.`active_attempt_token_hash` IS NULL AND NEW.`lease_owner` IS NULL AND
        NEW.`lease_acquired_at` IS NULL AND NEW.`lease_expires_at` IS NULL AND
        NEW.`heartbeat_at` = OLD.`heartbeat_at` AND NEW.`completed_at` IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM `engine_origin_records_v2` record
          WHERE record.`job_key` = OLD.`job_key`
            AND record.`fence_token` = OLD.`fence_token`
            AND record.`persisted_at` = NEW.`completed_at`
        )
      ) OR
      (
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
  BEGIN SELECT RAISE(ABORT, 'scheduler job transition violates fencing contract'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_origin_jobs_v2_no_delete`
  BEFORE DELETE ON `engine_origin_jobs_v2`
  BEGIN SELECT RAISE(ABORT, 'engine_origin_jobs_v2 coordination history cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_origin_jobs_v2_attempt_log`
  AFTER UPDATE ON `engine_origin_jobs_v2`
  WHEN NEW.`state` = 'running' AND NEW.`fence_token` = OLD.`fence_token` + 1
  BEGIN
    INSERT INTO `engine_origin_attempts_v2` (
      `attempt_id`, `job_key`, `origin_version_id`, `attempt_token_hash`, `fence_token`,
      `lease_owner`, `invoked_at`, `lease_acquired_at`, `lease_expires_at`, `persisted_at`
    ) VALUES (
      NEW.`job_key` || ':fence:' || NEW.`fence_token`, NEW.`job_key`, NEW.`origin_version_id`,
      NEW.`active_attempt_token_hash`, NEW.`fence_token`, NEW.`lease_owner`,
      NEW.`lease_acquired_at`, NEW.`lease_acquired_at`, NEW.`lease_expires_at`, NEW.`lease_acquired_at`
    );
  END;
--> statement-breakpoint
CREATE TRIGGER `engine_origin_attempts_v2_no_update`
  BEFORE UPDATE ON `engine_origin_attempts_v2`
  BEGIN SELECT RAISE(ABORT, 'engine_origin_attempts_v2 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_origin_attempts_v2_no_delete`
  BEFORE DELETE ON `engine_origin_attempts_v2`
  BEGIN SELECT RAISE(ABORT, 'engine_origin_attempts_v2 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_scheduler_events_v2_no_update`
  BEFORE UPDATE ON `engine_scheduler_events_v2`
  BEGIN SELECT RAISE(ABORT, 'engine_scheduler_events_v2 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_scheduler_events_v2_no_delete`
  BEFORE DELETE ON `engine_scheduler_events_v2`
  BEGIN SELECT RAISE(ABORT, 'engine_scheduler_events_v2 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_origin_records_v2_publication_guard`
  BEFORE INSERT ON `engine_origin_records_v2`
  WHEN NOT EXISTS (
    SELECT 1
    FROM `engine_origin_jobs_v2` job
    JOIN `forecast_origin_versions` origin
      ON origin.`origin_version_id` = job.`origin_version_id`
    WHERE job.`job_key` = NEW.`job_key`
      AND job.`origin_version_id` = NEW.`origin_version_id`
      AND job.`scheduler_contract_version` = NEW.`scheduler_contract_version`
      AND job.`scheduler_contract_hash` = NEW.`scheduler_contract_hash`
      AND job.`activation_boundary` = NEW.`activation_boundary`
      AND job.`scheduled_trigger_at` = NEW.`scheduled_trigger_at`
      AND job.`kickoff_at` = NEW.`kickoff_at`
      AND job.`persistence_deadline_at` = NEW.`persistence_deadline_at`
      AND job.`state` = 'running'
      AND job.`active_attempt_token_hash` = NEW.`attempt_token_hash`
      AND job.`fence_token` = NEW.`fence_token`
      AND julianday(job.`lease_expires_at`) > julianday(NEW.`persisted_at`)
      AND julianday(job.`lease_acquired_at`) <= julianday(NEW.`invoked_at`)
      AND julianday(NEW.`scheduled_trigger_at`) <= julianday(NEW.`invoked_at`)
      AND NOT EXISTS (
        SELECT 1 FROM `forecast_origin_versions` child
        WHERE child.`supersedes_origin_version_id` = origin.`origin_version_id`
      )
      AND (
        (
          NEW.`timing` = 'timely' AND NEW.`prospective_eligible` = 1 AND
          origin.`eligible` = 1 AND origin.`eligibility_reason` = 'eligible' AND
          julianday(NEW.`persisted_at`) < julianday(NEW.`persistence_deadline_at`)
        ) OR
        (
          NEW.`timing` = 'late' AND NEW.`prospective_eligible` = 0 AND
          (
            (
              NEW.`withholding_reason` = 'late_origin_excluded' AND
              (
                julianday(NEW.`persisted_at`) >= julianday(NEW.`persistence_deadline_at`) OR
                (
                  origin.`eligible` = 0 AND origin.`eligibility_reason` IN (
                    'pre_activation', 'after_kickoff', 'prior_origin_elapsed',
                    'earlier_origin_prohibited'
                  )
                )
              )
            ) OR
            (
              NEW.`withholding_reason` = 'schedule_unavailable_at_origin' AND
              origin.`eligible` = 0 AND origin.`eligibility_reason` = 'known_after_origin'
            )
          )
        )
      )
  )
  BEGIN SELECT RAISE(ABORT, 'terminal publication requires the current head and exact live fenced lease'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_origin_records_v2_finalize_job`
  AFTER INSERT ON `engine_origin_records_v2`
  BEGIN
    UPDATE `engine_origin_jobs_v2`
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
CREATE TRIGGER `engine_origin_records_v2_no_update`
  BEFORE UPDATE ON `engine_origin_records_v2`
  BEGIN SELECT RAISE(ABORT, 'engine_origin_records_v2 is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `engine_origin_records_v2_no_delete`
  BEFORE DELETE ON `engine_origin_records_v2`
  BEGIN SELECT RAISE(ABORT, 'engine_origin_records_v2 is append-only'); END;
--> statement-breakpoint
INSERT INTO `engine_schema_versions` (`version`, `migration_hash`, `applied_at`)
VALUES (
  '0016_engine_os_interim_scheduler',
  'sha256:bad6665a2976440b108e1c0223d01dab3a0313283b8d2e08f0eb509ef57edcb2',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
