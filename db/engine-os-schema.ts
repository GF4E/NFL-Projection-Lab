import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const engineSchemaVersions = sqliteTable("engine_schema_versions", {
  version: text("version").primaryKey(),
  migrationHash: text("migration_hash").notNull(),
  appliedAt: text("applied_at").notNull()
});

export const sourceCaptureManifests = sqliteTable("source_capture_manifests", {
  captureId: text("capture_id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull(),
  provider: text("provider").notNull(),
  dataset: text("dataset").notNull(),
  requestHash: text("request_hash").notNull(),
  responseObjectKey: text("response_object_key").notNull(),
  responseSha256: text("response_sha256").notNull(),
  responseBytes: integer("response_bytes").notNull(),
  sidecarObjectKey: text("sidecar_object_key").notNull(),
  sidecarSha256: text("sidecar_sha256").notNull(),
  providerPublishedAt: text("provider_published_at"),
  receivedAt: text("received_at").notNull(),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  sourceSchemaVersion: text("source_schema_version").notNull(),
  licenseId: text("license_id").notNull(),
  evidenceHash: text("evidence_hash").notNull()
}, (table) => [
  uniqueIndex("source_capture_idempotency_unique").on(table.provider, table.dataset, table.idempotencyKey),
  index("idx_source_capture_evidence_hash").on(table.evidenceHash),
  index("idx_source_capture_received").on(table.provider, table.dataset, table.receivedAt),
  check("source_capture_response_bytes_check", sql`${table.responseBytes} >= 0`)
]);

export const sourceCaptureManifestExtensions = sqliteTable("source_capture_manifest_extensions", {
  captureId: text("capture_id").primaryKey()
    .references(() => sourceCaptureManifests.captureId),
  contractVersion: text("contract_version").notNull(),
  contractHash: text("contract_hash").notNull(),
  profileId: text("profile_id").notNull(),
  captureClass: text("capture_class").notNull(),
  sourceKey: text("source_key").notNull(),
  sourceObservedAt: text("source_observed_at"),
  receiptCompletedAt: text("receipt_completed_at").notNull(),
  persistenceRequestedAt: text("persistence_requested_at").notNull(),
  responsePersistedAt: text("response_persisted_at").notNull(),
  sidecarPersistedAt: text("sidecar_persisted_at").notNull(),
  manifestPersistedAt: text("manifest_persisted_at").notNull(),
  contentType: text("content_type").notNull(),
  etag: text("etag"),
  usageRightsJson: text("usage_rights_json").notNull(),
  usageRightsHash: text("usage_rights_hash").notNull(),
  validationState: text("validation_state", {
    enum: ["usable", "raw_only_schema_invalid", "raw_only_partial", "raw_only_http_error"]
  }).notNull(),
  failureCodesJson: text("failure_codes_json").notNull(),
  laterImportJson: text("later_import_json").notNull(),
  laterImportHash: text("later_import_hash").notNull(),
  extensionHash: text("extension_hash").notNull()
}, (table) => [
  index("idx_source_capture_extension_source").on(
    table.sourceKey,
    table.validationState,
    table.receiptCompletedAt,
    table.captureId
  ),
  index("idx_source_capture_extension_evidence").on(table.extensionHash),
  check(
    "source_capture_extension_contract_check",
    sql`${table.contractVersion} = 'source-capture-contract.2026.7' AND
      ${table.contractHash} = '9de33c9635ac8ded218bc9f774234e653135964204b5e3699b171536be99e867'`
  ),
  check(
    "source_capture_extension_hash_check",
    sql`length(${table.captureId}) = 64 AND lower(${table.captureId}) = ${table.captureId} AND
      ${table.captureId} NOT GLOB '*[^0-9a-f]*' AND
      length(${table.usageRightsHash}) = 64 AND lower(${table.usageRightsHash}) = ${table.usageRightsHash} AND
      ${table.usageRightsHash} NOT GLOB '*[^0-9a-f]*' AND
      length(${table.laterImportHash}) = 64 AND lower(${table.laterImportHash}) = ${table.laterImportHash} AND
      ${table.laterImportHash} NOT GLOB '*[^0-9a-f]*' AND
      length(${table.extensionHash}) = 64 AND lower(${table.extensionHash}) = ${table.extensionHash} AND
      ${table.extensionHash} NOT GLOB '*[^0-9a-f]*'`
  ),
  check(
    "source_capture_extension_identity_check",
    sql`length(${table.profileId}) > 0 AND length(${table.captureClass}) > 0 AND length(${table.sourceKey}) > 0`
  ),
  check(
    "source_capture_extension_validation_check",
    sql`${table.validationState} IN (
      'usable', 'raw_only_schema_invalid', 'raw_only_partial', 'raw_only_http_error'
    )`
  ),
  check(
    "source_capture_extension_json_check",
    sql`json_valid(${table.usageRightsJson}) AND json_type(${table.usageRightsJson}) = 'object' AND
      json_valid(${table.failureCodesJson}) AND json_type(${table.failureCodesJson}) = 'array' AND
      json_valid(${table.laterImportJson}) AND json_type(${table.laterImportJson}) = 'object'`
  ),
  check(
    "source_capture_extension_rights_check",
    sql`json_extract(${table.usageRightsJson}, '$.licenseId') IS NOT NULL AND
      json_extract(${table.usageRightsJson}, '$.rightsUri') IS NOT NULL AND
      json_extract(${table.usageRightsJson}, '$.retrievedFor') IS NOT NULL AND
      json_extract(${table.usageRightsJson}, '$.redistribution') IS NOT NULL AND
      json_extract(${table.usageRightsJson}, '$.retentionClass') = 'raw_source_3650_days' AND
      json_extract(${table.usageRightsJson}, '$.reviewStatus') IS NOT NULL`
  ),
  check(
    "source_capture_extension_import_check",
    sql`json_extract(${table.laterImportJson}, '$.owner') IN ('OS-03', 'OS-04') AND
      length(json_extract(${table.laterImportJson}, '$.target')) > 0`
  ),
  check(
    "source_capture_extension_time_check",
    sql`julianday(${table.receiptCompletedAt}) IS NOT NULL AND
      julianday(${table.persistenceRequestedAt}) IS NOT NULL AND
      julianday(${table.responsePersistedAt}) IS NOT NULL AND
      julianday(${table.sidecarPersistedAt}) IS NOT NULL AND
      julianday(${table.manifestPersistedAt}) IS NOT NULL AND
      julianday(${table.receiptCompletedAt}) <= julianday(${table.persistenceRequestedAt}) AND
      julianday(${table.persistenceRequestedAt}) <= julianday(${table.responsePersistedAt}) AND
      julianday(${table.responsePersistedAt}) <= julianday(${table.sidecarPersistedAt}) AND
      julianday(${table.sidecarPersistedAt}) <= julianday(${table.manifestPersistedAt})`
  ),
  check(
    "source_capture_extension_source_time_check",
    sql`(${table.sourceObservedAt} IS NOT NULL AND julianday(${table.sourceObservedAt}) IS NOT NULL) OR
      (${table.sourceObservedAt} IS NULL AND ${table.validationState} = 'raw_only_schema_invalid')`
  ),
  check(
    "source_capture_extension_usable_check",
    sql`${table.validationState} <> 'usable' OR ${table.sourceObservedAt} IS NOT NULL`
  )
]);

export const sourceCaptureEvents = sqliteTable("source_capture_events", {
  eventId: text("event_id").primaryKey(),
  attemptToken: text("attempt_token").notNull(),
  eventType: text("event_type", {
    enum: [
      "capture_committed",
      "capture_committed_usable",
      "capture_committed_raw_only",
      "capture_deduplicated",
      "capture_failed",
      "not_modified_confirmed",
      "replay_verified",
      "freshness_stale",
      "orphan_detected",
      "orphan_removed"
    ]
  }).notNull(),
  captureId: text("capture_id").references(() => sourceCaptureManifests.captureId),
  sourceKey: text("source_key").notNull(),
  provider: text("provider").notNull(),
  dataset: text("dataset").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  occurredAt: text("occurred_at").notNull(),
  eventPayloadHash: text("event_payload_hash").notNull(),
  payloadJson: text("payload_json").notNull()
}, (table) => [
  uniqueIndex("source_capture_event_attempt_unique").on(table.attemptToken),
  index("idx_source_capture_events_source").on(table.sourceKey, table.occurredAt, table.eventType),
  index("idx_source_capture_events_capture").on(table.captureId, table.occurredAt),
  check(
    "source_capture_event_token_check",
    sql`length(${table.attemptToken}) BETWEEN 1 AND 200 AND
      ${table.attemptToken} NOT GLOB '*[^A-Za-z0-9._:-]*'`
  ),
  check(
    "source_capture_event_type_check",
    sql`${table.eventType} IN (
      'capture_committed', 'capture_committed_usable', 'capture_committed_raw_only',
      'capture_deduplicated', 'capture_failed', 'not_modified_confirmed',
      'replay_verified', 'freshness_stale', 'orphan_detected', 'orphan_removed'
    )`
  ),
  check(
    "source_capture_event_identity_check",
    sql`length(${table.sourceKey}) > 0 AND length(${table.provider}) > 0 AND
      length(${table.dataset}) > 0 AND length(${table.idempotencyKey}) > 0`
  ),
  check(
    "source_capture_event_capture_check",
    sql`${table.eventType} NOT IN (
      'capture_committed', 'capture_committed_usable', 'capture_committed_raw_only',
      'capture_deduplicated', 'not_modified_confirmed', 'replay_verified'
    ) OR ${table.captureId} IS NOT NULL`
  ),
  check(
    "source_capture_event_evidence_check",
    sql`length(${table.eventId}) = 64 AND lower(${table.eventId}) = ${table.eventId} AND
      ${table.eventId} NOT GLOB '*[^0-9a-f]*' AND
      length(${table.eventPayloadHash}) = 64 AND
      lower(${table.eventPayloadHash}) = ${table.eventPayloadHash} AND
      ${table.eventPayloadHash} NOT GLOB '*[^0-9a-f]*' AND json_valid(${table.payloadJson}) AND
      json_type(${table.payloadJson}) = 'object'`
  ),
  check("source_capture_event_time_check", sql`julianday(${table.occurredAt}) IS NOT NULL`)
]);

export const sourceCaptureHeartbeats = sqliteTable("source_capture_heartbeats", {
  sourceKey: text("source_key").primaryKey(),
  provider: text("provider").notNull(),
  dataset: text("dataset").notNull(),
  status: text("status", { enum: ["current", "stale", "partial", "unavailable"] }).notNull(),
  lastAttemptAt: text("last_attempt_at").notNull(),
  lastSuccessAt: text("last_success_at"),
  lastFailureAt: text("last_failure_at"),
  failureCode: text("failure_code"),
  latestCaptureId: text("latest_capture_id")
});

export const engineSystemAlerts = sqliteTable("engine_system_alerts", {
  alertId: text("alert_id").primaryKey(),
  alertType: text("alert_type").notNull(),
  deduplicationKey: text("deduplication_key").notNull().unique(),
  severity: text("severity", { enum: ["warning", "error", "critical"] }).notNull(),
  state: text("state", { enum: ["open", "resolved"] }).notNull(),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
  payloadJson: text("payload_json").notNull()
}, (table) => [index("idx_engine_alert_state").on(table.state, table.createdAt)]);

export const canonicalGames = sqliteTable("canonical_games", {
  gameId: text("game_id").primaryKey(),
  season: integer("season").notNull(),
  seasonType: text("season_type").notNull(),
  week: integer("week").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  identityStatus: text("identity_status", { enum: ["resolved", "unresolved"] }).notNull(),
  createdAt: text("created_at").notNull(),
  sourceCaptureId: text("source_capture_id")
}, (table) => [
  index("idx_canonical_games_season_week").on(table.season, table.seasonType, table.week),
  check("canonical_game_week_check", sql`${table.week} >= 1 AND ${table.week} <= 25`)
]);

export const gameProviderAliases = sqliteTable("game_provider_aliases", {
  aliasId: text("alias_id").primaryKey(),
  provider: text("provider").notNull(),
  providerGameId: text("provider_game_id").notNull(),
  gameId: text("game_id"),
  validFrom: text("valid_from").notNull(),
  observedAt: text("observed_at").notNull(),
  sourceCaptureId: text("source_capture_id")
}, (table) => [uniqueIndex("game_provider_alias_unique").on(table.provider, table.providerGameId, table.validFrom)]);

export const gameKickoffRevisions = sqliteTable("game_kickoff_revisions", {
  revisionId: text("revision_id").primaryKey(),
  gameId: text("game_id").notNull(),
  kickoffUtc: text("kickoff_utc").notNull(),
  localTimeZone: text("local_time_zone").notNull(),
  observedAt: text("observed_at").notNull(),
  supersedesRevisionId: text("supersedes_revision_id"),
  sourceCaptureId: text("source_capture_id")
}, (table) => [
  uniqueIndex("game_kickoff_revision_unique").on(table.gameId, table.kickoffUtc, table.observedAt),
  index("idx_game_kickoff_revision_latest").on(table.gameId, table.observedAt)
]);

export const gameScheduleRevisions = sqliteTable("game_schedule_revisions", {
  revisionId: text("revision_id").primaryKey(),
  gameId: text("game_id").notNull().references(() => canonicalGames.gameId),
  week: integer("week").notNull(),
  scheduleStatus: text("schedule_status", {
    enum: ["scheduled", "kickoff_unresolved", "postponed", "cancelled"]
  }).notNull(),
  kickoffUtc: text("kickoff_utc"),
  localTimeZone: text("local_time_zone").notNull(),
  observedAt: text("observed_at").notNull(),
  sourceCaptureId: text("source_capture_id").references(() => sourceCaptureManifests.captureId),
  sourceEvidenceHash: text("source_evidence_hash"),
  sourceRowHash: text("source_row_hash").notNull(),
  supersedesRevisionId: text("supersedes_revision_id")
}, (table) => [
  uniqueIndex("game_schedule_revision_identity_unique").on(table.revisionId, table.gameId),
  uniqueIndex("game_schedule_revision_observation_unique").on(table.gameId, table.observedAt),
  uniqueIndex("idx_game_schedule_revision_single_successor")
    .on(table.supersedesRevisionId)
    .where(sql`${table.supersedesRevisionId} IS NOT NULL`),
  index("idx_game_schedule_revision_latest").on(table.gameId, table.observedAt),
  check("game_schedule_revision_week_check", sql`${table.week} >= 1 AND ${table.week} <= 25`),
  check(
    "game_schedule_revision_status_check",
    sql`${table.scheduleStatus} IN ('scheduled', 'kickoff_unresolved', 'postponed', 'cancelled')`
  ),
  check(
    "game_schedule_revision_kickoff_check",
    sql`(
      (${table.scheduleStatus} = 'scheduled' AND ${table.kickoffUtc} IS NOT NULL AND length(${table.kickoffUtc}) > 0) OR
      (${table.scheduleStatus} IN ('kickoff_unresolved', 'postponed', 'cancelled') AND ${table.kickoffUtc} IS NULL)
    )`
  ),
  check(
    "game_schedule_revision_source_check",
    sql`(${table.sourceCaptureId} IS NOT NULL AND length(${table.sourceCaptureId}) > 0) OR
      (${table.sourceEvidenceHash} IS NOT NULL AND length(${table.sourceEvidenceHash}) = 64)`
  ),
  check("game_schedule_revision_zone_check", sql`length(${table.localTimeZone}) > 0`),
  check("game_schedule_revision_observed_check", sql`length(${table.observedAt}) > 0`),
  check(
    "game_schedule_revision_evidence_hash_check",
    sql`${table.sourceEvidenceHash} IS NULL OR length(${table.sourceEvidenceHash}) = 64`
  ),
  check("game_schedule_revision_row_hash_check", sql`length(${table.sourceRowHash}) = 64`)
]);

export const engineActivations = sqliteTable("engine_activations", {
  activationId: text("activation_id").primaryKey(),
  activatedAt: text("activated_at").notNull(),
  activationBoundary: text("activation_boundary").notNull(),
  evidenceScope: text("evidence_scope", { enum: ["full_season_shadow", "partial_season_shadow"] }).notNull(),
  operatingContractVersion: text("operating_contract_version").notNull(),
  operatingContractHash: text("operating_contract_hash").notNull(),
  researchContractVersion: text("research_contract_version").notNull(),
  researchContractHash: text("research_contract_hash").notNull(),
  lifecycleVersion: text("lifecycle_version").notNull(),
  lifecycleHash: text("lifecycle_hash").notNull(),
  firstOriginUtc: text("first_origin_utc").notNull()
}, (table) => [
  uniqueIndex("engine_activation_contract_unique").on(
    table.operatingContractHash,
    table.researchContractHash,
    table.lifecycleHash
  )
]);

export const forecastOrigins = sqliteTable("forecast_origins", {
  originId: text("origin_id").primaryKey(),
  gameId: text("game_id").notNull(),
  originKind: text("origin_kind").notNull(),
  scheduledForUtc: text("scheduled_for_utc").notNull(),
  scheduledForLocal: text("scheduled_for_local").notNull(),
  kickoffRevisionId: text("kickoff_revision_id").notNull(),
  eligible: integer("eligible", { mode: "boolean" }).notNull(),
  activationBoundary: text("activation_boundary").notNull(),
  createdAt: text("created_at").notNull()
}, (table) => [
  uniqueIndex("forecast_origin_unique").on(table.gameId, table.originKind, table.scheduledForUtc),
  uniqueIndex("forecast_origin_record_identity_unique").on(table.originId, table.gameId, table.activationBoundary),
  index("idx_forecast_origins_due").on(table.scheduledForUtc, table.eligible)
]);

export const forecastOriginVersions = sqliteTable("forecast_origin_versions", {
  originVersionId: text("origin_version_id").primaryKey(),
  logicalOriginId: text("logical_origin_id").notNull(),
  gameId: text("game_id").notNull().references(() => canonicalGames.gameId),
  horizonId: text("horizon_id", {
    enum: [
      "weekly_tuesday_0730",
      "kickoff_minus_120",
      "kickoff_minus_90",
      "kickoff_minus_60",
      "kickoff_minus_15"
    ]
  }).notNull(),
  scheduledForUtc: text("scheduled_for_utc"),
  scheduledForLocal: text("scheduled_for_local"),
  kickoffRevisionId: text("kickoff_revision_id").notNull().references(() => gameScheduleRevisions.revisionId),
  scientificEligibility: integer("scientific_eligibility", { mode: "boolean" }).notNull(),
  informationCutoff: text("information_cutoff").notNull(),
  eligible: integer("eligible", { mode: "boolean" }).notNull(),
  eligibilityReason: text("eligibility_reason", {
    enum: [
      "eligible",
      "schedule_unresolved",
      "known_after_origin",
      "pre_activation",
      "after_kickoff",
      "prior_origin_elapsed",
      "earlier_origin_prohibited"
    ]
  }).notNull(),
  activationBoundary: text("activation_boundary").notNull(),
  supersedesOriginVersionId: text("supersedes_origin_version_id"),
  createdAt: text("created_at").notNull()
}, (table) => [
  uniqueIndex("forecast_origin_version_identity_unique").on(
    table.originVersionId,
    table.logicalOriginId,
    table.gameId
  ),
  uniqueIndex("idx_forecast_origin_version_single_successor")
    .on(table.supersedesOriginVersionId)
    .where(sql`${table.supersedesOriginVersionId} IS NOT NULL`),
  index("idx_forecast_origin_version_head").on(table.gameId, table.horizonId, table.createdAt),
  index("idx_forecast_origin_version_due").on(table.scheduledForUtc, table.eligible),
  check(
    "forecast_origin_version_horizon_check",
    sql`${table.horizonId} IN (
      'weekly_tuesday_0730', 'kickoff_minus_120', 'kickoff_minus_90', 'kickoff_minus_60', 'kickoff_minus_15'
    )`
  ),
  check(
    "forecast_origin_version_boolean_check",
    sql`${table.scientificEligibility} IN (0, 1) AND ${table.eligible} IN (0, 1)`
  ),
  check(
    "forecast_origin_version_scientific_check",
    sql`(
      ${table.horizonId} = 'weekly_tuesday_0730' AND
      ${table.scientificEligibility} = 1 AND
      ${table.informationCutoff} = 'completed_games_through_week_w_minus_1_at_origin'
    ) OR (
      ${table.horizonId} IN ('kickoff_minus_120', 'kickoff_minus_90', 'kickoff_minus_60', 'kickoff_minus_15') AND
      ${table.scientificEligibility} = 0 AND
      ${table.informationCutoff} = 'forecast_time'
    )`
  ),
  check(
    "forecast_origin_version_reason_check",
    sql`${table.eligibilityReason} IN (
      'eligible', 'schedule_unresolved', 'known_after_origin', 'pre_activation', 'after_kickoff',
      'prior_origin_elapsed', 'earlier_origin_prohibited'
    )`
  ),
  check(
    "forecast_origin_version_eligibility_check",
    sql`(${table.eligible} = 1 AND ${table.eligibilityReason} = 'eligible') OR
      (${table.eligible} = 0 AND ${table.eligibilityReason} <> 'eligible')`
  ),
  check(
    "forecast_origin_version_schedule_time_check",
    sql`(
      ${table.eligibilityReason} = 'schedule_unresolved' AND ${table.eligible} = 0 AND
      ${table.scheduledForUtc} IS NULL AND ${table.scheduledForLocal} IS NULL
    ) OR (
      ${table.eligibilityReason} <> 'schedule_unresolved' AND
      ${table.scheduledForUtc} IS NOT NULL AND length(${table.scheduledForUtc}) > 0 AND
      ${table.scheduledForLocal} IS NOT NULL AND length(${table.scheduledForLocal}) > 0
    )`
  ),
  check("forecast_origin_version_id_check", sql`length(${table.originVersionId}) > 0`),
  check("forecast_origin_version_logical_id_check", sql`length(${table.logicalOriginId}) > 0`),
  check("forecast_origin_version_activation_check", sql`length(${table.activationBoundary}) > 0`),
  check("forecast_origin_version_created_check", sql`length(${table.createdAt}) > 0`)
]);

export const engineSchedulerTicksV2 = sqliteTable("engine_scheduler_ticks_v2", {
  tickKey: text("tick_key").primaryKey(),
  schedulerContractVersion: text("scheduler_contract_version").notNull(),
  schedulerContractHash: text("scheduler_contract_hash").notNull(),
  tickKeyVersion: text("tick_key_version").notNull(),
  lane: text("lane", { enum: ["dispatcher", "watchdog"] }).notNull(),
  nominalScheduledAt: text("nominal_scheduled_at").notNull(),
  invokedAt: text("invoked_at").notNull(),
  evidenceAt: text("evidence_at").notNull(),
  persistedAt: text("persisted_at").notNull(),
  state: text("state", { enum: ["running", "completed", "failed"] }).notNull(),
  attemptTokenHash: text("attempt_token_hash"),
  fenceToken: integer("fence_token").notNull(),
  leaseOwner: text("lease_owner"),
  leaseAcquiredAt: text("lease_acquired_at"),
  leaseExpiresAt: text("lease_expires_at"),
  heartbeatAt: text("heartbeat_at"),
  completedAt: text("completed_at"),
  failureCode: text("failure_code")
}, (table) => [
  uniqueIndex("engine_scheduler_tick_identity_unique").on(
    table.schedulerContractHash,
    table.lane,
    table.nominalScheduledAt
  ),
  index("idx_engine_scheduler_ticks_v2_watchdog").on(table.lane, table.nominalScheduledAt, table.state),
  index("idx_engine_scheduler_ticks_v2_lease").on(table.state, table.leaseExpiresAt),
  check("engine_scheduler_tick_contract_hash_check", sql`length(${table.schedulerContractHash}) = 64`),
  check("engine_scheduler_tick_fence_check", sql`${table.fenceToken} >= 1`)
]);

export const engineOriginJobsV2 = sqliteTable("engine_origin_jobs_v2", {
  jobKey: text("job_key").primaryKey(),
  schedulerContractVersion: text("scheduler_contract_version").notNull(),
  schedulerContractHash: text("scheduler_contract_hash").notNull(),
  jobKeyVersion: text("job_key_version").notNull(),
  jobType: text("job_type").notNull(),
  originVersionId: text("origin_version_id").notNull().unique()
    .references(() => forecastOriginVersions.originVersionId),
  scheduledTriggerAt: text("scheduled_trigger_at").notNull(),
  kickoffAt: text("kickoff_at").notNull(),
  persistenceDeadlineAt: text("persistence_deadline_at").notNull(),
  activationBoundary: text("activation_boundary").notNull(),
  state: text("state", { enum: ["pending", "running", "completed", "invalidated"] }).notNull(),
  fenceToken: integer("fence_token").notNull().default(0),
  activeAttemptTokenHash: text("active_attempt_token_hash"),
  leaseOwner: text("lease_owner"),
  leaseAcquiredAt: text("lease_acquired_at"),
  leaseExpiresAt: text("lease_expires_at"),
  heartbeatAt: text("heartbeat_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull()
}, (table) => [
  index("idx_engine_origin_jobs_v2_due").on(table.state, table.scheduledTriggerAt, table.persistenceDeadlineAt),
  index("idx_engine_origin_jobs_v2_lease").on(table.state, table.leaseExpiresAt),
  check("engine_origin_job_contract_hash_check", sql`length(${table.schedulerContractHash}) = 64`),
  check("engine_origin_job_fence_check", sql`${table.fenceToken} >= 0`)
]);

export const engineOriginAttemptsV2 = sqliteTable("engine_origin_attempts_v2", {
  attemptId: text("attempt_id").primaryKey(),
  jobKey: text("job_key").notNull().references(() => engineOriginJobsV2.jobKey),
  originVersionId: text("origin_version_id").notNull()
    .references(() => forecastOriginVersions.originVersionId),
  attemptTokenHash: text("attempt_token_hash").notNull(),
  fenceToken: integer("fence_token").notNull(),
  leaseOwner: text("lease_owner").notNull(),
  invokedAt: text("invoked_at").notNull(),
  leaseAcquiredAt: text("lease_acquired_at").notNull(),
  leaseExpiresAt: text("lease_expires_at").notNull(),
  persistedAt: text("persisted_at").notNull()
}, (table) => [
  uniqueIndex("engine_origin_attempt_job_fence_unique").on(table.jobKey, table.fenceToken),
  uniqueIndex("engine_origin_attempt_job_token_unique").on(table.jobKey, table.attemptTokenHash),
  index("idx_engine_origin_attempts_v2_origin").on(table.originVersionId, table.fenceToken),
  check("engine_origin_attempt_token_check", sql`length(${table.attemptTokenHash}) = 64`),
  check("engine_origin_attempt_fence_check", sql`${table.fenceToken} >= 1`)
]);

export const engineSchedulerEventsV2 = sqliteTable("engine_scheduler_events_v2", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  tickKey: text("tick_key").references(() => engineSchedulerTicksV2.tickKey),
  jobKey: text("job_key").references(() => engineOriginJobsV2.jobKey),
  originVersionId: text("origin_version_id").references(() => forecastOriginVersions.originVersionId),
  attemptTokenHash: text("attempt_token_hash"),
  fenceToken: integer("fence_token"),
  occurredAt: text("occurred_at").notNull(),
  evidenceAt: text("evidence_at").notNull(),
  persistedAt: text("persisted_at").notNull(),
  payloadJson: text("payload_json").notNull()
}, (table) => [
  index("idx_engine_scheduler_events_v2_tick").on(table.tickKey, table.occurredAt),
  index("idx_engine_scheduler_events_v2_job").on(table.jobKey, table.occurredAt),
  check("engine_scheduler_event_payload_check", sql`json_valid(${table.payloadJson})`)
]);

export const engineOriginRecordsV2 = sqliteTable("engine_origin_records_v2", {
  recordId: text("record_id").primaryKey(),
  decisionHash: text("decision_hash").notNull().unique(),
  jobKey: text("job_key").notNull().unique().references(() => engineOriginJobsV2.jobKey),
  originVersionId: text("origin_version_id").notNull().unique()
    .references(() => forecastOriginVersions.originVersionId),
  schedulerContractVersion: text("scheduler_contract_version").notNull(),
  schedulerContractHash: text("scheduler_contract_hash").notNull(),
  status: text("status", { enum: ["withheld"] }).notNull(),
  withholdingReason: text("withholding_reason").notNull(),
  scheduledTriggerAt: text("scheduled_trigger_at").notNull(),
  invokedAt: text("invoked_at").notNull(),
  evidenceAt: text("evidence_at").notNull(),
  generatedAt: text("generated_at").notNull(),
  persistenceRequestedAt: text("persistence_requested_at").notNull(),
  persistedAt: text("persisted_at").notNull(),
  persistenceDeadlineAt: text("persistence_deadline_at").notNull(),
  kickoffAt: text("kickoff_at").notNull(),
  timing: text("timing", { enum: ["timely", "late"] }).notNull(),
  prospectiveEligible: integer("prospective_eligible", { mode: "boolean" }).notNull(),
  captureHealth: text("capture_health", { enum: ["current", "stale", "partial", "unavailable"] }).notNull(),
  activationBoundary: text("activation_boundary").notNull(),
  attemptTokenHash: text("attempt_token_hash").notNull(),
  fenceToken: integer("fence_token").notNull(),
  qualificationOnly: integer("qualification_only", { mode: "boolean" }).notNull().default(true),
  payloadJson: text("payload_json").notNull()
}, (table) => [
  index("idx_engine_origin_records_v2_origin").on(table.originVersionId, table.persistedAt),
  check("engine_origin_record_contract_hash_check", sql`length(${table.schedulerContractHash}) = 64`),
  check("engine_origin_record_attempt_check", sql`length(${table.attemptTokenHash}) = 64 AND ${table.fenceToken} >= 1`),
  check("engine_origin_record_payload_check", sql`json_valid(${table.payloadJson})`)
]);

export const forecastLedgerQualificationsV1 = sqliteTable("forecast_ledger_qualifications_v1", {
  qualificationId: text("qualification_id").primaryKey(),
  ledgerContractVersion: text("ledger_contract_version").notNull(),
  ledgerContractHash: text("ledger_contract_hash").notNull(),
  activationBoundary: text("activation_boundary").notNull(),
  qualificationKey: text("qualification_key").notNull().unique(),
  qualificationKeyVersion: text("qualification_key_version").notNull(),
  qualificationStream: text("qualification_stream", {
    enum: ["eligible_package", "no_eligible_package"]
  }).notNull(),
  runnerHash: text("runner_hash"),
  codeHash: text("code_hash"),
  modelOrPackageHash: text("model_or_package_hash"),
  configHash: text("config_hash"),
  featureSchemaHash: text("feature_schema_hash"),
  targetSchemaHash: text("target_schema_hash"),
  qualificationStatus: text("qualification_status", { enum: ["eligible", "rejected"] }).notNull(),
  qualifiedAt: text("qualified_at").notNull(),
  qualificationEvidenceHash: text("qualification_evidence_hash").notNull()
}, (table) => [
  index("idx_forecast_ledger_qualifications_v1_status")
    .on(table.qualificationStatus, table.qualifiedAt),
  uniqueIndex("forecast_ledger_one_boundary_per_eligible_package_v1")
    .on(table.modelOrPackageHash)
    .where(sql`${table.qualificationStream} = 'eligible_package' AND ${table.qualificationStatus} = 'eligible'`),
  check(
    "forecast_ledger_qualification_stream_check",
    sql`(${table.qualificationStream} = 'eligible_package' AND ${table.runnerHash} IS NOT NULL AND
      ${table.codeHash} IS NOT NULL AND ${table.modelOrPackageHash} IS NOT NULL AND
      ${table.configHash} IS NOT NULL AND ${table.featureSchemaHash} IS NOT NULL AND
      ${table.targetSchemaHash} IS NOT NULL) OR
      (${table.qualificationStream} = 'no_eligible_package' AND ${table.runnerHash} IS NULL AND
      ${table.codeHash} IS NULL AND ${table.modelOrPackageHash} IS NULL AND
      ${table.configHash} IS NULL AND ${table.featureSchemaHash} IS NULL AND
      ${table.targetSchemaHash} IS NULL)`
  ),
  check(
    "forecast_ledger_qualification_status_check",
    sql`${table.qualificationStatus} IN ('eligible', 'rejected')`
  ),
  check(
    "forecast_ledger_qualification_identity_check",
    sql`length(${table.qualificationId}) = 64 AND lower(${table.qualificationId}) = ${table.qualificationId} AND
      ${table.qualificationId} NOT GLOB '*[^0-9a-f]*' AND
      ${table.ledgerContractVersion} = 'forecast-ledger-contract.2026.1' AND
      ${table.ledgerContractHash} = '8f6e9856512b7b14b0fba8e2367b9d09ebee3edc26a10f3660f9171ae2f3241a' AND
      length(${table.activationBoundary}) BETWEEN 1 AND 200 AND
      length(${table.qualificationKey}) = 64 AND
      lower(${table.qualificationKey}) = ${table.qualificationKey} AND
      ${table.qualificationKey} NOT GLOB '*[^0-9a-f]*' AND
      ${table.qualificationKeyVersion} = 'engine-os.forecast-qualification.v1'`
  ),
  check(
    "forecast_ledger_qualification_hash_check",
    sql`(${table.runnerHash} IS NULL OR (
        length(${table.runnerHash}) = 64 AND lower(${table.runnerHash}) = ${table.runnerHash} AND
        ${table.runnerHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.codeHash} IS NULL OR (
        length(${table.codeHash}) = 64 AND lower(${table.codeHash}) = ${table.codeHash} AND
        ${table.codeHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.modelOrPackageHash} IS NULL OR (
        length(${table.modelOrPackageHash}) = 64 AND
        lower(${table.modelOrPackageHash}) = ${table.modelOrPackageHash} AND
        ${table.modelOrPackageHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.configHash} IS NULL OR (
        length(${table.configHash}) = 64 AND lower(${table.configHash}) = ${table.configHash} AND
        ${table.configHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.featureSchemaHash} IS NULL OR (
        length(${table.featureSchemaHash}) = 64 AND
        lower(${table.featureSchemaHash}) = ${table.featureSchemaHash} AND
        ${table.featureSchemaHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.targetSchemaHash} IS NULL OR (
        length(${table.targetSchemaHash}) = 64 AND
        lower(${table.targetSchemaHash}) = ${table.targetSchemaHash} AND
        ${table.targetSchemaHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      length(${table.qualificationEvidenceHash}) = 64 AND
      lower(${table.qualificationEvidenceHash}) = ${table.qualificationEvidenceHash} AND
      ${table.qualificationEvidenceHash} NOT GLOB '*[^0-9a-f]*'`
  ),
  check("forecast_ledger_qualification_time_check", sql`julianday(${table.qualifiedAt}) IS NOT NULL`)
]);

export const forecastLedgerActivationsV1 = sqliteTable("forecast_ledger_activations_v1", {
  activationId: text("activation_id").primaryKey(),
  ledgerContractVersion: text("ledger_contract_version").notNull(),
  ledgerContractHash: text("ledger_contract_hash").notNull(),
  activationBoundary: text("activation_boundary").notNull().unique(),
  qualificationId: text("qualification_id").notNull().unique()
    .references(() => forecastLedgerQualificationsV1.qualificationId),
  evidenceScope: text("evidence_scope", {
    enum: ["full_season_shadow", "partial_season_shadow"]
  }).notNull(),
  season: integer("season").notNull(),
  firstWeek: integer("first_week").notNull(),
  activatedAt: text("activated_at").notNull(),
  firstOriginUtc: text("first_origin_utc").notNull(),
  weekOneOriginComplete: integer("week_one_origin_complete", { mode: "boolean" }).notNull(),
  qualificationOnly: integer("qualification_only", { mode: "boolean" }).notNull().default(true)
}, (table) => [
  index("idx_forecast_ledger_activations_v1_boundary").on(table.season, table.firstOriginUtc),
  check(
    "forecast_ledger_activation_scope_check",
    sql`(
      ${table.evidenceScope} = 'full_season_shadow' AND ${table.firstWeek} = 1 AND
      ${table.firstOriginUtc} = '2026-09-08T14:30:00.000Z' AND
      ${table.weekOneOriginComplete} = 1 AND
      julianday(${table.activatedAt}) <= julianday('2026-09-08T14:30:00Z')
    ) OR (
      ${table.evidenceScope} = 'partial_season_shadow' AND
      (${table.firstWeek} > 1 OR ${table.firstOriginUtc} <> '2026-09-08T14:30:00.000Z' OR
        ${table.weekOneOriginComplete} = 0 OR
        julianday(${table.activatedAt}) > julianday('2026-09-08T14:30:00Z'))
    )`
  ),
  check(
    "forecast_ledger_activation_season_check",
    sql`${table.season} >= 2026 AND ${table.firstWeek} BETWEEN 1 AND 25`
  ),
  check(
    "forecast_ledger_activation_qualification_only_check",
    sql`${table.qualificationOnly} = 1 AND ${table.weekOneOriginComplete} IN (0, 1)`
  ),
  check(
    "forecast_ledger_activation_time_check",
    sql`julianday(${table.activatedAt}) IS NOT NULL AND
      julianday(${table.firstOriginUtc}) IS NOT NULL AND
      julianday(${table.activatedAt}) <= julianday(${table.firstOriginUtc})`
  ),
  check(
    "forecast_ledger_activation_identity_check",
    sql`length(${table.activationId}) = 64 AND lower(${table.activationId}) = ${table.activationId} AND
      ${table.activationId} NOT GLOB '*[^0-9a-f]*' AND
      ${table.ledgerContractVersion} = 'forecast-ledger-contract.2026.1' AND
      ${table.ledgerContractHash} = '8f6e9856512b7b14b0fba8e2367b9d09ebee3edc26a10f3660f9171ae2f3241a' AND
      length(${table.activationBoundary}) BETWEEN 1 AND 200`
  )
]);

export const forecastLedgerJobsV1 = sqliteTable("forecast_ledger_jobs_v1", {
  jobKey: text("job_key").primaryKey(),
  jobKeyVersion: text("job_key_version").notNull(),
  ledgerContractVersion: text("ledger_contract_version").notNull(),
  ledgerContractHash: text("ledger_contract_hash").notNull(),
  activationId: text("activation_id").notNull()
    .references(() => forecastLedgerActivationsV1.activationId),
  originVersionId: text("origin_version_id").notNull()
    .references(() => forecastOriginVersions.originVersionId),
  qualificationId: text("qualification_id").notNull()
    .references(() => forecastLedgerQualificationsV1.qualificationId),
  expectedInputManifestHash: text("expected_input_manifest_hash"),
  scheduledTriggerAt: text("scheduled_trigger_at").notNull(),
  persistenceDeadlineAt: text("persistence_deadline_at").notNull(),
  kickoffAt: text("kickoff_at").notNull(),
  state: text("state", {
    enum: ["pending", "running", "completed", "invalidated"]
  }).notNull(),
  fenceToken: integer("fence_token").notNull().default(0),
  activeAttemptTokenHash: text("active_attempt_token_hash"),
  leaseOwner: text("lease_owner"),
  leaseAcquiredAt: text("lease_acquired_at"),
  leaseExpiresAt: text("lease_expires_at"),
  heartbeatAt: text("heartbeat_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull()
}, (table) => [
  uniqueIndex("forecast_ledger_job_origin_unique").on(table.activationId, table.originVersionId),
  index("idx_forecast_ledger_jobs_v1_due")
    .on(table.state, table.scheduledTriggerAt, table.persistenceDeadlineAt),
  index("idx_forecast_ledger_jobs_v1_lease").on(table.state, table.leaseExpiresAt),
  check(
    "forecast_ledger_job_state_check",
    sql`${table.state} IN ('pending', 'running', 'completed', 'invalidated')`
  ),
  check(
    "forecast_ledger_job_input_hash_check",
    sql`${table.expectedInputManifestHash} IS NULL OR (
      length(${table.expectedInputManifestHash}) = 64 AND
      lower(${table.expectedInputManifestHash}) = ${table.expectedInputManifestHash} AND
      ${table.expectedInputManifestHash} NOT GLOB '*[^0-9a-f]*'
    )`
  ),
  check(
    "forecast_ledger_job_identity_check",
    sql`length(${table.jobKey}) = 64 AND lower(${table.jobKey}) = ${table.jobKey} AND
      ${table.jobKey} NOT GLOB '*[^0-9a-f]*' AND
      ${table.jobKeyVersion} = 'engine-os.forecast-ledger-job.v1' AND
      ${table.ledgerContractVersion} = 'forecast-ledger-contract.2026.1' AND
      ${table.ledgerContractHash} = '8f6e9856512b7b14b0fba8e2367b9d09ebee3edc26a10f3660f9171ae2f3241a'`
  ),
  check(
    "forecast_ledger_job_time_check",
    sql`julianday(${table.scheduledTriggerAt}) IS NOT NULL AND
      julianday(${table.persistenceDeadlineAt}) IS NOT NULL AND
      julianday(${table.kickoffAt}) IS NOT NULL AND
      julianday(${table.createdAt}) IS NOT NULL AND
      julianday(${table.persistenceDeadlineAt}) < julianday(${table.kickoffAt})`
  ),
  check("forecast_ledger_job_fence_check", sql`${table.fenceToken} >= 0`)
]);

export const forecastLedgerAttemptsV1 = sqliteTable("forecast_ledger_attempts_v1", {
  attemptId: text("attempt_id").primaryKey(),
  jobKey: text("job_key").notNull().references(() => forecastLedgerJobsV1.jobKey),
  originVersionId: text("origin_version_id").notNull()
    .references(() => forecastOriginVersions.originVersionId),
  attemptTokenHash: text("attempt_token_hash").notNull().unique(),
  fenceToken: integer("fence_token").notNull(),
  leaseOwner: text("lease_owner").notNull(),
  invokedAt: text("invoked_at").notNull(),
  leaseAcquiredAt: text("lease_acquired_at").notNull(),
  leaseExpiresAt: text("lease_expires_at").notNull(),
  persistedAt: text("persisted_at").notNull()
}, (table) => [
  uniqueIndex("forecast_ledger_attempt_job_fence_unique").on(table.jobKey, table.fenceToken),
  index("idx_forecast_ledger_attempts_v1_origin").on(table.originVersionId, table.fenceToken),
  check(
    "forecast_ledger_attempt_identity_check",
    sql`length(${table.attemptId}) = 64 AND lower(${table.attemptId}) = ${table.attemptId} AND
      ${table.attemptId} NOT GLOB '*[^0-9a-f]*' AND
      length(${table.attemptTokenHash}) = 64 AND
      lower(${table.attemptTokenHash}) = ${table.attemptTokenHash} AND
      ${table.attemptTokenHash} NOT GLOB '*[^0-9a-f]*' AND
      ${table.fenceToken} >= 1 AND length(${table.leaseOwner}) BETWEEN 1 AND 200`
  ),
  check(
    "forecast_ledger_attempt_time_check",
    sql`julianday(${table.invokedAt}) IS NOT NULL AND
      julianday(${table.leaseAcquiredAt}) IS NOT NULL AND
      julianday(${table.leaseExpiresAt}) IS NOT NULL AND
      julianday(${table.persistedAt}) IS NOT NULL AND
      julianday(${table.invokedAt}) <= julianday(${table.leaseAcquiredAt}) AND
      julianday(${table.leaseAcquiredAt}) < julianday(${table.leaseExpiresAt}) AND
      julianday(${table.leaseAcquiredAt}) <= julianday(${table.persistedAt}) AND
      abs((julianday(${table.leaseExpiresAt}) - julianday(${table.leaseAcquiredAt})) *
        86400.0 - 120.0) < 0.001`
  )
]);

export const forecastLedgerRecordsV1 = sqliteTable("forecast_ledger_records_v1", {
  recordId: text("record_id").primaryKey(),
  recordHash: text("record_hash").notNull().unique(),
  recordKeyVersion: text("record_key_version").notNull(),
  activationId: text("activation_id").notNull()
    .references(() => forecastLedgerActivationsV1.activationId),
  jobKey: text("job_key").notNull().unique().references(() => forecastLedgerJobsV1.jobKey),
  originVersionId: text("origin_version_id").notNull()
    .references(() => forecastOriginVersions.originVersionId),
  qualificationId: text("qualification_id").notNull()
    .references(() => forecastLedgerQualificationsV1.qualificationId),
  qualificationKey: text("qualification_key").notNull(),
  qualificationStream: text("qualification_stream", {
    enum: ["eligible_package", "no_eligible_package"]
  }).notNull(),
  ledgerContractVersion: text("ledger_contract_version").notNull(),
  ledgerContractHash: text("ledger_contract_hash").notNull(),
  status: text("status", { enum: ["forecast", "withheld"] }).notNull(),
  withholdingReason: text("withholding_reason", {
    enum: [
      "no_eligible_package",
      "schedule_unavailable_at_origin",
      "required_source_stale",
      "required_source_partial",
      "required_source_unavailable",
      "schema_invalid",
      "provenance_incomplete",
      "package_hash_mismatch",
      "late_origin_excluded",
      "compute_failure"
    ]
  }),
  scheduledTriggerAt: text("scheduled_trigger_at").notNull(),
  invokedAt: text("invoked_at").notNull(),
  evidenceAt: text("evidence_at").notNull(),
  generatedAt: text("generated_at").notNull(),
  outputPublishedAt: text("output_published_at"),
  outputVerifiedAt: text("output_verified_at"),
  persistenceRequestedAt: text("persistence_requested_at").notNull(),
  persistedAt: text("persisted_at").notNull(),
  persistenceDeadlineAt: text("persistence_deadline_at").notNull(),
  kickoffAt: text("kickoff_at").notNull(),
  timing: text("timing", { enum: ["timely", "late"] }).notNull(),
  prospectiveEligible: integer("prospective_eligible", { mode: "boolean" }).notNull(),
  captureHealth: text("capture_health", {
    enum: ["current", "stale", "partial", "unavailable"]
  }).notNull(),
  activationBoundary: text("activation_boundary").notNull(),
  evidenceScope: text("evidence_scope", {
    enum: ["full_season_shadow", "partial_season_shadow"]
  }).notNull(),
  attemptTokenHash: text("attempt_token_hash").notNull(),
  fenceToken: integer("fence_token").notNull(),
  runnerHash: text("runner_hash"),
  codeHash: text("code_hash"),
  modelOrPackageHash: text("model_or_package_hash"),
  configHash: text("config_hash"),
  inputManifestHash: text("input_manifest_hash"),
  featureSchemaHash: text("feature_schema_hash"),
  targetSchemaHash: text("target_schema_hash"),
  outputObjectKey: text("output_object_key"),
  outputObjectHash: text("output_object_hash"),
  outputObjectBytes: integer("output_object_bytes"),
  payloadJson: text("payload_json").notNull(),
  payloadHash: text("payload_hash").notNull()
}, (table) => [
  uniqueIndex("forecast_ledger_record_activation_origin_unique")
    .on(table.activationId, table.originVersionId),
  index("idx_forecast_ledger_records_v1_origin").on(table.originVersionId, table.persistedAt),
  index("idx_forecast_ledger_records_v1_prospective")
    .on(table.prospectiveEligible, table.status, table.persistedAt),
  check(
    "forecast_ledger_record_identity_check",
    sql`length(${table.recordId}) = 64 AND lower(${table.recordId}) = ${table.recordId} AND
      ${table.recordId} NOT GLOB '*[^0-9a-f]*' AND
      length(${table.recordHash}) = 64 AND lower(${table.recordHash}) = ${table.recordHash} AND
      ${table.recordHash} NOT GLOB '*[^0-9a-f]*' AND
      ${table.recordKeyVersion} = 'engine-os.forecast-ledger-record.v2' AND
      ${table.ledgerContractVersion} = 'forecast-ledger-contract.2026.1' AND
      ${table.ledgerContractHash} = '8f6e9856512b7b14b0fba8e2367b9d09ebee3edc26a10f3660f9171ae2f3241a' AND
      length(${table.attemptTokenHash}) = 64 AND
      lower(${table.attemptTokenHash}) = ${table.attemptTokenHash} AND
      ${table.attemptTokenHash} NOT GLOB '*[^0-9a-f]*' AND ${table.fenceToken} >= 1`
  ),
  check(
    "forecast_ledger_record_status_check",
    sql`${table.status} IN ('forecast', 'withheld')`
  ),
  check(
    "forecast_ledger_record_reason_check",
    sql`${table.withholdingReason} IS NULL OR ${table.withholdingReason} IN (
      'no_eligible_package', 'schedule_unavailable_at_origin', 'required_source_stale',
      'required_source_partial', 'required_source_unavailable', 'schema_invalid',
      'provenance_incomplete', 'package_hash_mismatch', 'late_origin_excluded',
      'compute_failure'
    )`
  ),
  check(
    "forecast_ledger_record_shape_check",
    sql`(
      ${table.status} = 'forecast' AND ${table.withholdingReason} IS NULL AND
      ${table.qualificationStream} = 'eligible_package' AND
      ${table.runnerHash} IS NOT NULL AND ${table.codeHash} IS NOT NULL AND
      ${table.modelOrPackageHash} IS NOT NULL AND ${table.configHash} IS NOT NULL AND
      ${table.inputManifestHash} IS NOT NULL AND ${table.featureSchemaHash} IS NOT NULL AND
      ${table.targetSchemaHash} IS NOT NULL AND ${table.outputObjectKey} IS NOT NULL AND
      ${table.outputObjectHash} IS NOT NULL AND ${table.outputObjectBytes} IS NOT NULL AND
      ${table.outputPublishedAt} IS NOT NULL AND ${table.outputVerifiedAt} IS NOT NULL AND
      ${table.timing} = 'timely' AND ${table.prospectiveEligible} = 1
    ) OR (
      ${table.status} = 'withheld' AND ${table.withholdingReason} IS NOT NULL AND
      ${table.runnerHash} IS NULL AND ${table.codeHash} IS NULL AND
      ${table.modelOrPackageHash} IS NULL AND ${table.configHash} IS NULL AND
      ${table.inputManifestHash} IS NULL AND ${table.featureSchemaHash} IS NULL AND
      ${table.targetSchemaHash} IS NULL AND ${table.outputObjectKey} IS NULL AND
      ${table.outputObjectHash} IS NULL AND ${table.outputObjectBytes} IS NULL AND
      ${table.outputPublishedAt} IS NULL AND ${table.outputVerifiedAt} IS NULL
    )`
  ),
  check(
    "forecast_ledger_record_qualification_shape_check",
    sql`${table.qualificationStream} IN ('eligible_package', 'no_eligible_package')`
  ),
  check(
    "forecast_ledger_record_hash_check",
    sql`(${table.runnerHash} IS NULL OR (
        length(${table.runnerHash}) = 64 AND lower(${table.runnerHash}) = ${table.runnerHash} AND
        ${table.runnerHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.codeHash} IS NULL OR (
        length(${table.codeHash}) = 64 AND lower(${table.codeHash}) = ${table.codeHash} AND
        ${table.codeHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.modelOrPackageHash} IS NULL OR (
        length(${table.modelOrPackageHash}) = 64 AND
        lower(${table.modelOrPackageHash}) = ${table.modelOrPackageHash} AND
        ${table.modelOrPackageHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.configHash} IS NULL OR (
        length(${table.configHash}) = 64 AND lower(${table.configHash}) = ${table.configHash} AND
        ${table.configHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.inputManifestHash} IS NULL OR (
        length(${table.inputManifestHash}) = 64 AND
        lower(${table.inputManifestHash}) = ${table.inputManifestHash} AND
        ${table.inputManifestHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.featureSchemaHash} IS NULL OR (
        length(${table.featureSchemaHash}) = 64 AND
        lower(${table.featureSchemaHash}) = ${table.featureSchemaHash} AND
        ${table.featureSchemaHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.targetSchemaHash} IS NULL OR (
        length(${table.targetSchemaHash}) = 64 AND
        lower(${table.targetSchemaHash}) = ${table.targetSchemaHash} AND
        ${table.targetSchemaHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      (${table.outputObjectHash} IS NULL OR (
        length(${table.outputObjectHash}) = 64 AND
        lower(${table.outputObjectHash}) = ${table.outputObjectHash} AND
        ${table.outputObjectHash} NOT GLOB '*[^0-9a-f]*'
      )) AND
      length(${table.payloadHash}) = 64 AND lower(${table.payloadHash}) = ${table.payloadHash} AND
      ${table.payloadHash} NOT GLOB '*[^0-9a-f]*'`
  ),
  check(
    "forecast_ledger_record_output_check",
    sql`${table.outputObjectKey} IS NULL OR (
      ${table.outputObjectKey} = 'forecast-output/sha256/' || ${table.outputObjectHash} AND
      ${table.outputObjectBytes} >= 0
    )`
  ),
  check(
    "forecast_ledger_record_time_check",
    sql`julianday(${table.scheduledTriggerAt}) IS NOT NULL AND
      julianday(${table.invokedAt}) IS NOT NULL AND
      julianday(${table.evidenceAt}) IS NOT NULL AND
      julianday(${table.generatedAt}) IS NOT NULL AND
      julianday(${table.persistenceRequestedAt}) IS NOT NULL AND
      julianday(${table.persistedAt}) IS NOT NULL AND
      julianday(${table.persistenceDeadlineAt}) IS NOT NULL AND
      julianday(${table.kickoffAt}) IS NOT NULL AND
      julianday(${table.scheduledTriggerAt}) <= julianday(${table.invokedAt}) AND
      julianday(${table.invokedAt}) <= julianday(${table.generatedAt}) AND
      julianday(${table.evidenceAt}) <= julianday(${table.generatedAt}) AND
      julianday(${table.generatedAt}) <= julianday(${table.persistenceRequestedAt}) AND
      julianday(${table.persistenceRequestedAt}) <= julianday(${table.persistedAt}) AND
      julianday(${table.persistenceDeadlineAt}) < julianday(${table.kickoffAt}) AND
      (${table.outputPublishedAt} IS NULL OR (
        julianday(${table.outputPublishedAt}) IS NOT NULL AND
        julianday(${table.outputVerifiedAt}) IS NOT NULL AND
        julianday(${table.generatedAt}) <= julianday(${table.outputPublishedAt}) AND
        julianday(${table.outputPublishedAt}) <= julianday(${table.outputVerifiedAt}) AND
        julianday(${table.outputVerifiedAt}) <= julianday(${table.persistenceRequestedAt})
      ))`
  ),
  check(
    "forecast_ledger_record_timing_check",
    sql`(
      ${table.timing} = 'timely' AND ${table.prospectiveEligible} = 1 AND
      julianday(${table.persistedAt}) < julianday(${table.persistenceDeadlineAt}) AND
      julianday(${table.persistedAt}) <= julianday(${table.kickoffAt}, '-1 second') AND
      (${table.withholdingReason} IS NULL OR ${table.withholdingReason} NOT IN (
        'late_origin_excluded', 'schedule_unavailable_at_origin'
      ))
    ) OR (
      ${table.timing} = 'late' AND ${table.prospectiveEligible} = 0 AND
      ${table.withholdingReason} IN ('late_origin_excluded', 'schedule_unavailable_at_origin')
    )`
  ),
  check(
    "forecast_ledger_record_capture_check",
    sql`${table.captureHealth} IN ('current', 'stale', 'partial', 'unavailable')`
  ),
  check(
    "forecast_ledger_record_scope_check",
    sql`${table.evidenceScope} IN ('full_season_shadow', 'partial_season_shadow')`
  ),
  check(
    "forecast_ledger_record_payload_check",
    sql`json_valid(${table.payloadJson}) AND json_type(${table.payloadJson}) = 'object'`
  )
]);

export const forecastLedgerEventsV1 = sqliteTable("forecast_ledger_events_v1", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type", {
    enum: [
      "qualification_registered",
      "activation_created",
      "job_created",
      "lease_acquired",
      "lease_renewed",
      "lease_reclaimed",
      "lease_lost",
      "record_committed",
      "record_deduplicated",
      "output_publish_failed",
      "output_integrity_failed",
      "origin_superseded"
    ]
  }).notNull(),
  activationId: text("activation_id")
    .references(() => forecastLedgerActivationsV1.activationId),
  qualificationId: text("qualification_id")
    .references(() => forecastLedgerQualificationsV1.qualificationId),
  jobKey: text("job_key").references(() => forecastLedgerJobsV1.jobKey),
  originVersionId: text("origin_version_id")
    .references(() => forecastOriginVersions.originVersionId),
  attemptTokenHash: text("attempt_token_hash"),
  fenceToken: integer("fence_token"),
  occurredAt: text("occurred_at").notNull(),
  evidenceAt: text("evidence_at").notNull(),
  persistedAt: text("persisted_at").notNull(),
  payloadJson: text("payload_json").notNull(),
  payloadHash: text("payload_hash").notNull()
}, (table) => [
  index("idx_forecast_ledger_events_v1_origin").on(table.originVersionId, table.occurredAt),
  index("idx_forecast_ledger_events_v1_job").on(table.jobKey, table.occurredAt),
  check(
    "forecast_ledger_event_type_check",
    sql`${table.eventType} IN (
      'qualification_registered', 'activation_created', 'job_created', 'lease_acquired',
      'lease_renewed', 'lease_reclaimed', 'lease_lost', 'record_committed',
      'record_deduplicated', 'output_publish_failed', 'output_integrity_failed',
      'origin_superseded'
    )`
  ),
  check(
    "forecast_ledger_event_identity_check",
    sql`length(${table.eventId}) = 64 AND lower(${table.eventId}) = ${table.eventId} AND
      ${table.eventId} NOT GLOB '*[^0-9a-f]*' AND
      (${table.attemptTokenHash} IS NULL OR (
        length(${table.attemptTokenHash}) = 64 AND
        lower(${table.attemptTokenHash}) = ${table.attemptTokenHash} AND
        ${table.attemptTokenHash} NOT GLOB '*[^0-9a-f]*'
      )) AND (${table.fenceToken} IS NULL OR ${table.fenceToken} >= 1)`
  ),
  check(
    "forecast_ledger_event_time_check",
    sql`julianday(${table.occurredAt}) IS NOT NULL AND
      julianday(${table.evidenceAt}) IS NOT NULL AND
      julianday(${table.persistedAt}) IS NOT NULL AND
      julianday(${table.occurredAt}) <= julianday(${table.persistedAt}) AND
      julianday(${table.evidenceAt}) <= julianday(${table.persistedAt})`
  ),
  check(
    "forecast_ledger_event_payload_check",
    sql`json_valid(${table.payloadJson}) AND json_type(${table.payloadJson}) = 'object' AND
      length(${table.payloadHash}) = 64 AND lower(${table.payloadHash}) = ${table.payloadHash} AND
      ${table.payloadHash} NOT GLOB '*[^0-9a-f]*'`
  )
]);

export const engineJobRuns = sqliteTable("engine_job_runs", {
  jobKey: text("job_key").primaryKey(),
  jobType: text("job_type").notNull(),
  gameId: text("game_id"),
  originId: text("origin_id"),
  scheduledFor: text("scheduled_for").notNull(),
  state: text("state", { enum: ["pending", "running", "succeeded", "failed", "skipped", "late"] }).notNull(),
  attempt: integer("attempt").notNull().default(1),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: text("lease_expires_at"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  heartbeatAt: text("heartbeat_at"),
  failureCode: text("failure_code")
}, (table) => [index("idx_engine_job_due").on(table.scheduledFor, table.state)]);

export const forecastOriginRecords = sqliteTable("forecast_origin_records", {
  recordId: text("record_id").primaryKey(),
  recordHash: text("record_hash").notNull().unique(),
  originId: text("origin_id").notNull(),
  gameId: text("game_id").notNull(),
  status: text("status", { enum: ["forecast", "withheld"] }).notNull(),
  withholdingReason: text("withholding_reason"),
  generatedAt: text("generated_at").notNull(),
  recordedAt: text("recorded_at").notNull(),
  timing: text("timing", { enum: ["early", "timely", "late"] }).notNull(),
  prospectiveEligible: integer("prospective_eligible", { mode: "boolean" }).notNull(),
  captureHealth: text("capture_health", { enum: ["current", "stale", "partial", "unavailable"] }).notNull(),
  activationBoundary: text("activation_boundary").notNull(),
  evidenceScope: text("evidence_scope", { enum: ["full_season_shadow", "partial_season_shadow"] }).notNull(),
  qualificationKey: text("qualification_key"),
  runnerHash: text("runner_hash"),
  codeHash: text("code_hash"),
  packageHash: text("package_hash"),
  configHash: text("config_hash"),
  inputManifestHash: text("input_manifest_hash"),
  featureSchemaHash: text("feature_schema_hash"),
  targetSchemaHash: text("target_schema_hash"),
  outputObjectKey: text("output_object_key"),
  outputObjectHash: text("output_object_hash")
}, (table) => [
  index("idx_forecast_records_game_origin").on(table.gameId, table.generatedAt),
  check("forecast_record_status_check", sql`${table.status} in ('forecast', 'withheld')`)
]);

export const oddsQuotaEvents = sqliteTable("odds_quota_events", {
  requestKey: text("request_key").primaryKey(),
  provider: text("provider").notNull(),
  used: integer("used").notNull(),
  remaining: integer("remaining").notNull(),
  lastCost: integer("last_cost").notNull(),
  capturedAt: text("captured_at").notNull(),
  responseCaptureId: text("response_capture_id")
}, (table) => [
  check("odds_quota_event_values_check", sql`${table.used} >= 0 AND ${table.remaining} >= 0 AND ${table.lastCost} >= 0`)
]);

export const oddsQuotaEpochs = sqliteTable("odds_quota_epochs", {
  quotaEpoch: text("quota_epoch").primaryKey(),
  provider: text("provider").notNull(),
  credentialGenerationId: text("credential_generation_id").notNull(),
  openedAt: text("opened_at").notNull(),
  reason: text("reason", {
    enum: ["credential_bootstrap", "stale_reconciliation", "provider_monthly_reset"]
  }).notNull(),
  initialUsed: integer("initial_used").notNull(),
  initialRemaining: integer("initial_remaining").notNull(),
  sourceRequestKey: text("source_request_key")
}, (table) => [
  check("odds_quota_epoch_provider_check", sql`${table.provider} = 'the-odds-api'`),
  check("odds_quota_epoch_counters_check", sql`${table.initialUsed} >= 0 AND ${table.initialRemaining} >= 0 AND ${table.initialUsed} + ${table.initialRemaining} = 500`)
]);

export const oddsQuotaControl = sqliteTable("odds_quota_control", {
  provider: text("provider").primaryKey(),
  quotaEpoch: text("quota_epoch").notNull().references(() => oddsQuotaEpochs.quotaEpoch),
  credentialGenerationId: text("credential_generation_id").notNull(),
  observedAt: text("observed_at").notNull()
}, (table) => [
  check("odds_quota_control_provider_check", sql`${table.provider} = 'the-odds-api'`)
]);

export const oddsQuotaReservations = sqliteTable("odds_quota_reservations", {
  requestKey: text("request_key").primaryKey(),
  provider: text("provider").notNull(),
  quotaEpoch: text("quota_epoch").notNull().references(() => oddsQuotaEpochs.quotaEpoch),
  credentialGenerationId: text("credential_generation_id").notNull(),
  requestClass: text("request_class", {
    enum: ["opener", "scientific_origin", "kickoff_minus_15", "kickoff_minus_60", "kickoff_minus_120", "ordinary"]
  }).notNull(),
  reservedCost: integer("reserved_cost").notNull(),
  futureReserve: integer("future_reserve").notNull(),
  quotaPlanHash: text("quota_plan_hash").notNull(),
  dispatchTokenHash: text("dispatch_token_hash").notNull(),
  state: text("state", {
    enum: ["reserved", "dispatched", "settled", "released_before_dispatch", "charge_unknown"]
  }).notNull(),
  reservedAt: text("reserved_at").notNull(),
  dispatchedAt: text("dispatched_at"),
  completedAt: text("completed_at"),
  quotaEventRequestKey: text("quota_event_request_key").references(() => oddsQuotaEvents.requestKey)
}, (table) => [
  index("idx_odds_quota_reservations_outstanding").on(table.provider, table.quotaEpoch, table.state, table.reservedAt),
  check("odds_quota_reservation_provider_check", sql`${table.provider} = 'the-odds-api'`),
  check("odds_quota_reservation_cost_check", sql`${table.reservedCost} > 0 AND ${table.futureReserve} >= 0`)
]);

export const oddsQuotaReservationEvents = sqliteTable("odds_quota_reservation_events", {
  eventId: text("event_id").primaryKey(),
  requestKey: text("request_key").notNull().references(() => oddsQuotaReservations.requestKey),
  eventType: text("event_type", {
    enum: ["reserved", "dispatched", "settled", "released_before_dispatch", "charge_unknown"]
  }).notNull(),
  occurredAt: text("occurred_at").notNull(),
  payloadJson: text("payload_json").notNull()
}, (table) => [index("idx_odds_quota_reservation_events_request").on(table.requestKey, table.occurredAt)]);
