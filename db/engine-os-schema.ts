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
