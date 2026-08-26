CREATE TABLE `game_schedule_revisions` (
  `revision_id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `week` integer NOT NULL,
  `schedule_status` text NOT NULL,
  `kickoff_utc` text,
  `local_time_zone` text NOT NULL,
  `observed_at` text NOT NULL,
  `source_capture_id` text,
  `source_evidence_hash` text,
  `source_row_hash` text NOT NULL,
  `supersedes_revision_id` text,
  CONSTRAINT `game_schedule_revision_identity_unique` UNIQUE (`revision_id`, `game_id`),
  CONSTRAINT `game_schedule_revision_observation_unique` UNIQUE (`game_id`, `observed_at`),
  CONSTRAINT `game_schedule_revision_week_check` CHECK (`week` >= 1 AND `week` <= 25),
  CONSTRAINT `game_schedule_revision_status_check` CHECK (`schedule_status` IN (
    'scheduled', 'kickoff_unresolved', 'postponed', 'cancelled'
  )),
  CONSTRAINT `game_schedule_revision_kickoff_check` CHECK (
    (`schedule_status` = 'scheduled' AND `kickoff_utc` IS NOT NULL AND length(`kickoff_utc`) > 0) OR
    (`schedule_status` IN ('kickoff_unresolved', 'postponed', 'cancelled') AND `kickoff_utc` IS NULL)
  ),
  CONSTRAINT `game_schedule_revision_zone_check` CHECK (length(`local_time_zone`) > 0),
  CONSTRAINT `game_schedule_revision_observed_check` CHECK (length(`observed_at`) > 0),
  CONSTRAINT `game_schedule_revision_source_check` CHECK (
    (`source_capture_id` IS NOT NULL AND length(`source_capture_id`) > 0) OR
    (`source_evidence_hash` IS NOT NULL AND length(`source_evidence_hash`) = 64)
  ),
  CONSTRAINT `game_schedule_revision_evidence_hash_check` CHECK (
    `source_evidence_hash` IS NULL OR length(`source_evidence_hash`) = 64
  ),
  CONSTRAINT `game_schedule_revision_row_hash_check` CHECK (length(`source_row_hash`) = 64),
  FOREIGN KEY (`game_id`) REFERENCES `canonical_games` (`game_id`),
  FOREIGN KEY (`source_capture_id`) REFERENCES `source_capture_manifests` (`capture_id`),
  FOREIGN KEY (`supersedes_revision_id`) REFERENCES `game_schedule_revisions` (`revision_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_game_schedule_revision_single_successor`
  ON `game_schedule_revisions` (`supersedes_revision_id`)
  WHERE `supersedes_revision_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_game_schedule_revision_latest`
  ON `game_schedule_revisions` (`game_id`, `observed_at`);
--> statement-breakpoint
CREATE TRIGGER `game_schedule_revisions_chain_guard`
  BEFORE INSERT ON `game_schedule_revisions`
  WHEN
    (
      NEW.`supersedes_revision_id` IS NULL AND
      EXISTS (
        SELECT 1 FROM `game_schedule_revisions` prior
        WHERE prior.`game_id` = NEW.`game_id`
      )
    ) OR
    (
      NEW.`supersedes_revision_id` IS NOT NULL AND
      NOT EXISTS (
        SELECT 1
        FROM `game_schedule_revisions` prior
        WHERE prior.`revision_id` = NEW.`supersedes_revision_id`
          AND prior.`game_id` = NEW.`game_id`
          AND NEW.`observed_at` > prior.`observed_at`
          AND NOT EXISTS (
            SELECT 1 FROM `game_schedule_revisions` child
            WHERE child.`supersedes_revision_id` = prior.`revision_id`
          )
      )
    )
  BEGIN
    SELECT RAISE(ABORT, 'schedule revision must chronologically supersede the same game current head');
  END;
--> statement-breakpoint
CREATE TRIGGER `game_schedule_revisions_no_update`
  BEFORE UPDATE ON `game_schedule_revisions`
  BEGIN SELECT RAISE(ABORT, 'game_schedule_revisions is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `game_schedule_revisions_no_delete`
  BEFORE DELETE ON `game_schedule_revisions`
  BEGIN SELECT RAISE(ABORT, 'game_schedule_revisions is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `game_provider_aliases_identity_guard`
  BEFORE INSERT ON `game_provider_aliases`
  WHEN NEW.`game_id` IS NOT NULL AND EXISTS (
    SELECT 1
    FROM `game_provider_aliases` prior
    WHERE prior.`provider` = NEW.`provider`
      AND prior.`provider_game_id` = NEW.`provider_game_id`
      AND prior.`game_id` IS NOT NULL
      AND prior.`game_id` <> NEW.`game_id`
  )
  BEGIN
    SELECT RAISE(ABORT, 'provider game identity cannot be reassigned to a different canonical game');
  END;
--> statement-breakpoint
CREATE TABLE `forecast_origin_versions` (
  `origin_version_id` text PRIMARY KEY NOT NULL,
  `logical_origin_id` text NOT NULL,
  `game_id` text NOT NULL,
  `horizon_id` text NOT NULL,
  `scheduled_for_utc` text,
  `scheduled_for_local` text,
  `kickoff_revision_id` text NOT NULL,
  `scientific_eligibility` integer NOT NULL,
  `information_cutoff` text NOT NULL,
  `eligible` integer NOT NULL,
  `eligibility_reason` text NOT NULL,
  `activation_boundary` text NOT NULL,
  `supersedes_origin_version_id` text,
  `created_at` text NOT NULL,
  CONSTRAINT `forecast_origin_version_identity_unique` UNIQUE (
    `origin_version_id`, `logical_origin_id`, `game_id`
  ),
  CONSTRAINT `forecast_origin_version_horizon_check` CHECK (`horizon_id` IN (
    'weekly_tuesday_0730',
    'kickoff_minus_120',
    'kickoff_minus_90',
    'kickoff_minus_60',
    'kickoff_minus_15'
  )),
  CONSTRAINT `forecast_origin_version_boolean_check` CHECK (
    `scientific_eligibility` IN (0, 1) AND `eligible` IN (0, 1)
  ),
  CONSTRAINT `forecast_origin_version_scientific_check` CHECK (
    (
      `horizon_id` = 'weekly_tuesday_0730' AND
      `scientific_eligibility` = 1 AND
      `information_cutoff` = 'completed_games_through_week_w_minus_1_at_origin'
    ) OR
    (
      `horizon_id` IN ('kickoff_minus_120', 'kickoff_minus_90', 'kickoff_minus_60', 'kickoff_minus_15') AND
      `scientific_eligibility` = 0 AND
      `information_cutoff` = 'forecast_time'
    )
  ),
  CONSTRAINT `forecast_origin_version_reason_check` CHECK (`eligibility_reason` IN (
    'eligible',
    'schedule_unresolved',
    'known_after_origin',
    'pre_activation',
    'after_kickoff',
    'prior_origin_elapsed',
    'earlier_origin_prohibited'
  )),
  CONSTRAINT `forecast_origin_version_eligibility_check` CHECK (
    (`eligible` = 1 AND `eligibility_reason` = 'eligible') OR
    (`eligible` = 0 AND `eligibility_reason` <> 'eligible')
  ),
  CONSTRAINT `forecast_origin_version_schedule_time_check` CHECK (
    (
      `eligibility_reason` = 'schedule_unresolved' AND
      `eligible` = 0 AND
      `scheduled_for_utc` IS NULL AND
      `scheduled_for_local` IS NULL
    ) OR
    (
      `eligibility_reason` <> 'schedule_unresolved' AND
      `scheduled_for_utc` IS NOT NULL AND length(`scheduled_for_utc`) > 0 AND
      `scheduled_for_local` IS NOT NULL AND length(`scheduled_for_local`) > 0
    )
  ),
  CONSTRAINT `forecast_origin_version_logical_id_check` CHECK (length(`logical_origin_id`) > 0),
  CONSTRAINT `forecast_origin_version_id_check` CHECK (length(`origin_version_id`) > 0),
  CONSTRAINT `forecast_origin_version_activation_check` CHECK (length(`activation_boundary`) > 0),
  CONSTRAINT `forecast_origin_version_created_check` CHECK (length(`created_at`) > 0),
  FOREIGN KEY (`game_id`) REFERENCES `canonical_games` (`game_id`),
  FOREIGN KEY (`kickoff_revision_id`, `game_id`)
    REFERENCES `game_schedule_revisions` (`revision_id`, `game_id`),
  FOREIGN KEY (`supersedes_origin_version_id`)
    REFERENCES `forecast_origin_versions` (`origin_version_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_forecast_origin_version_single_successor`
  ON `forecast_origin_versions` (`supersedes_origin_version_id`)
  WHERE `supersedes_origin_version_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_forecast_origin_version_head`
  ON `forecast_origin_versions` (`game_id`, `horizon_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_forecast_origin_version_due`
  ON `forecast_origin_versions` (`scheduled_for_utc`, `eligible`);
--> statement-breakpoint
CREATE TRIGGER `forecast_origin_versions_chain_guard`
  BEFORE INSERT ON `forecast_origin_versions`
  WHEN
    (
      NEW.`supersedes_origin_version_id` IS NULL AND
      EXISTS (
        SELECT 1 FROM `forecast_origin_versions` prior
        WHERE prior.`game_id` = NEW.`game_id`
          AND prior.`horizon_id` = NEW.`horizon_id`
      )
    ) OR
    (
      NEW.`supersedes_origin_version_id` IS NOT NULL AND
      NOT EXISTS (
        SELECT 1
        FROM `forecast_origin_versions` prior
        WHERE prior.`origin_version_id` = NEW.`supersedes_origin_version_id`
          AND prior.`game_id` = NEW.`game_id`
          AND prior.`horizon_id` = NEW.`horizon_id`
          AND NEW.`created_at` > prior.`created_at`
          AND NOT EXISTS (
            SELECT 1 FROM `forecast_origin_versions` child
            WHERE child.`supersedes_origin_version_id` = prior.`origin_version_id`
          )
      )
    )
  BEGIN
    SELECT RAISE(ABORT, 'origin version must chronologically supersede the same game and horizon current head');
  END;
--> statement-breakpoint
CREATE TRIGGER `forecast_origin_versions_schedule_guard`
  BEFORE INSERT ON `forecast_origin_versions`
  WHEN NOT EXISTS (
    SELECT 1
    FROM `game_schedule_revisions` schedule
    WHERE schedule.`revision_id` = NEW.`kickoff_revision_id`
      AND schedule.`game_id` = NEW.`game_id`
      AND NEW.`created_at` >= schedule.`observed_at`
      AND (
        (
          schedule.`schedule_status` = 'scheduled' AND
          NEW.`eligibility_reason` <> 'schedule_unresolved' AND
          (
            (
              NEW.`eligibility_reason` = 'after_kickoff' AND
              NEW.`scheduled_for_utc` >= schedule.`kickoff_utc`
            ) OR
            (
              NEW.`eligibility_reason` <> 'after_kickoff' AND
              NEW.`scheduled_for_utc` < schedule.`kickoff_utc`
            )
          ) AND
          (
            NEW.`eligibility_reason` <> 'known_after_origin' OR
            schedule.`observed_at` > NEW.`scheduled_for_utc`
          ) AND
          (
            NEW.`eligible` = 0 OR
            schedule.`observed_at` <= NEW.`scheduled_for_utc`
          )
        ) OR
        (
          schedule.`schedule_status` IN ('kickoff_unresolved', 'postponed', 'cancelled') AND
          NEW.`eligible` = 0 AND
          NEW.`eligibility_reason` = 'schedule_unresolved'
        )
      )
  )
  BEGIN
    SELECT RAISE(ABORT, 'origin eligibility must agree with its immutable schedule evidence');
  END;
--> statement-breakpoint
CREATE TRIGGER `forecast_origin_versions_no_update`
  BEFORE UPDATE ON `forecast_origin_versions`
  BEGIN SELECT RAISE(ABORT, 'forecast_origin_versions is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `forecast_origin_versions_no_delete`
  BEFORE DELETE ON `forecast_origin_versions`
  BEGIN SELECT RAISE(ABORT, 'forecast_origin_versions is append-only'); END;
--> statement-breakpoint
INSERT INTO `engine_schema_versions` (`version`, `migration_hash`, `applied_at`)
VALUES (
  '0015_engine_os_origin_identity',
  'sha256:622fb472f959273563f3dd139b7dde676e27b370a52c0241d6ee4d3726e3444a',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
