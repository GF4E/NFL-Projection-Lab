/**
 * One-shot recovery for the 2026-08-26 production foundation drift.
 *
 * This module is intentionally not imported by the application, scheduler, or
 * provider graph. A temporary authenticated operator may use the inspection
 * function before applying migration 0017, then call the reconstruction
 * function only after the exact schema receipt and empty-table preflight pass.
 */

import { sha256Hex } from "@/domain/hash";
import foundationMigrationSql from "../../../drizzle/0017_engine_os_foundation_repair.sql?raw";

const PROVIDER = "the-odds-api";
const OBSERVED_AT = "2026-08-26T02:24:13.471Z";
const QUOTA_EPOCH = "2af18312d58955cbffc3bfe09694608ad60f509bf1c93834217a8395c57359ef";
const CREDENTIAL_GENERATION_ID = "oddsapi-20260825-owner-rotation-01";
const BOOTSTRAP_REQUEST_KEY = `bootstrap:${QUOTA_EPOCH}`;

const RECEIPTS = {
  "0013_engine_os_urgent": "sha256:6205a3dfe09c2d663bb8c50378f295accd266ff2b2018668ca5353436a6797bb",
  "0014_odds_quota_reservations": "sha256:91bc1571f8873ccaeb8a2b8a9a8c2425370b4eec3c0931f1fa3ae02ffae56da1",
  "0015_engine_os_origin_identity": "sha256:622fb472f959273563f3dd139b7dde676e27b370a52c0241d6ee4d3726e3444a",
  "0016_engine_os_interim_scheduler": "sha256:bad6665a2976440b108e1c0223d01dab3a0313283b8d2e08f0eb509ef57edcb2",
  "0017_engine_os_foundation_repair": "sha256:34ecd02bd2b0082b2fb22457ce65350fd0e8970d229ef038c323b73816eddd74"
} as const;

const PRESERVED_RECEIPT_VERSIONS = [
  "0013_engine_os_urgent",
  "0014_odds_quota_reservations",
  "0015_engine_os_origin_identity",
  "0016_engine_os_interim_scheduler"
] as const;

const FOUNDATION_TABLES = [
  "source_capture_manifests",
  "source_capture_heartbeats",
  "odds_quota_events",
  "odds_quota_state",
  "odds_quota_epochs",
  "odds_quota_control",
  "odds_quota_reservations",
  "odds_quota_reservation_events"
] as const;

const FOUNDATION_SCHEMA_OBJECTS = {
  table: FOUNDATION_TABLES,
  index: [
    "idx_source_capture_received",
    "idx_source_capture_evidence_hash",
    "idx_odds_quota_reservations_outstanding",
    "idx_odds_quota_reservation_events_request"
  ],
  trigger: [
    "source_capture_manifests_no_update",
    "source_capture_manifests_no_delete",
    "odds_quota_events_no_update",
    "odds_quota_events_no_delete",
    "odds_quota_epochs_no_update",
    "odds_quota_epochs_no_delete",
    "odds_quota_reservation_events_no_update",
    "odds_quota_reservation_events_no_delete"
  ]
} as const;

// Filled from the canonical sqlite_master representation produced by exact
// migration 0017. Tests independently regenerate this value.
const FOUNDATION_SCHEMA_FINGERPRINT = "sha256:64a7b3d45cde53a3566fd46c935ace8680eae6faa0bfe71827d1f110b6b00e93";

export const PRODUCTION_FOUNDATION_SCHEMA_REPAIR_ARTIFACT = {
  migrationVersion: "0017_engine_os_foundation_repair",
  definitionHash: RECEIPTS["0017_engine_os_foundation_repair"],
  fileHash: "sha256:a4f6bdaa22ff90161f5ac021200cfbefe3dfbfb7361f8cf12d7c92d785dfbf78",
  statementCount: 21
} as const;

const PRESERVED_ALERT = {
  alertId: "a5514f45beb8ad9c90efb03bed10bfcc2d056cc238f310187f9e91fa9370c1a0",
  alertType: "odds_quota_manual_bootstrap",
  deduplicationKey: `the-odds-api:manual-bootstrap:${QUOTA_EPOCH}`,
  severity: "warning",
  state: "open",
  createdAt: OBSERVED_AT,
  payloadJson: `{"provider":"the-odds-api","quotaEpoch":"${QUOTA_EPOCH}","credentialGenerationId":"${CREDENTIAL_GENERATION_ID}","used":38,"remaining":462}`
} as const;

type RepairPreflightMode = "exact_eight_object_drift" | "exact_healthy_0017";

interface SchemaObjectRow {
  type: "table" | "index" | "trigger";
  name: string;
}

interface SchemaReceiptRow {
  version: string;
  migration_hash: string;
}

interface AlertRow {
  alert_id: string;
  alert_type: string;
  deduplication_key: string;
  severity: string;
  state: string;
  created_at: string;
  resolved_at: string | null;
  payload_json: string;
}

export interface ProductionFoundationRepairInspection {
  mode: RepairPreflightMode;
  preservedReceiptVersions: typeof PRESERVED_RECEIPT_VERSIONS;
  preservedAlertId: string;
  schemaFingerprint: string | null;
}

export interface ProductionFoundationRepairReceipt {
  status: "reconstructed" | "already_reconstructed";
  migrationVersion: "0017_engine_os_foundation_repair";
  quotaEpoch: string;
  credentialGenerationId: string;
  observedAt: string;
  used: 38;
  remaining: 462;
  lastCost: 0;
  sourceCaptureRows: 0;
  reservationRows: 0;
  reservationEventRows: 0;
  providerRequestMade: false;
}

export interface ProductionFoundationSchemaRepairReceipt {
  status: "applied";
  migrationVersion: "0017_engine_os_foundation_repair";
  definitionHash: string;
  fileHash: string;
  statementCount: 21;
  schemaFingerprint: string;
  providerRequestMade: false;
}

export interface ProductionFoundationRepairVerification {
  status: "verified";
  expectedSchemaObjects: typeof FOUNDATION_SCHEMA_OBJECTS;
  schemaFingerprint: string;
  foreignKeyViolationCount: 0;
  tableCounts: FoundationTableCounts;
  bootstrap: {
    quotaEpoch: string;
    credentialGenerationId: string;
    requestKey: string;
    observedAt: string;
    used: 38;
    remaining: 462;
    lastCost: 0;
  };
  preservedAlertId: string;
  downstreamOperationalTableCounts: Record<string, 0>;
  downstreamOperationalTablesEmpty: true;
  providerRequestMade: false;
}

interface FoundationTableCounts {
  source_manifests: number;
  source_heartbeats: number;
  quota_events: number;
  quota_state: number;
  quota_epochs: number;
  quota_control: number;
  reservations: number;
  reservation_events: number;
}

async function assertAcceptedReceipts(db: D1Database): Promise<Map<string, string>> {
  const rows = await db.prepare(`SELECT version, migration_hash
    FROM engine_schema_versions
    WHERE version IN (?, ?, ?, ?, ?)
    ORDER BY version`)
    .bind(...Object.keys(RECEIPTS))
    .all<SchemaReceiptRow>();
  const found = new Map(rows.results.map((row) => [row.version, row.migration_hash]));
  for (const version of PRESERVED_RECEIPT_VERSIONS) {
    const expectedHash = RECEIPTS[version];
    if (found.get(version) !== expectedHash) {
      throw new Error(`Foundation repair refused: accepted ${version} receipt is absent or changed`);
    }
  }
  return found;
}

async function assertPreservedAlert(db: D1Database): Promise<void> {
  const alert = await db.prepare(`SELECT alert_id, alert_type, deduplication_key,
      severity, state, created_at, resolved_at, payload_json
    FROM engine_system_alerts WHERE alert_id = ?`)
    .bind(PRESERVED_ALERT.alertId)
    .first<AlertRow>();
  if (!alert ||
    alert.alert_id !== PRESERVED_ALERT.alertId ||
    alert.alert_type !== PRESERVED_ALERT.alertType ||
    alert.deduplication_key !== PRESERVED_ALERT.deduplicationKey ||
    alert.severity !== PRESERVED_ALERT.severity ||
    alert.state !== PRESERVED_ALERT.state ||
    alert.created_at !== PRESERVED_ALERT.createdAt ||
    alert.resolved_at !== null ||
    alert.payload_json !== PRESERVED_ALERT.payloadJson) {
    throw new Error("Foundation repair refused: preserved bootstrap alert is absent or changed");
  }
}

async function foundationSchemaObjects(db: D1Database): Promise<SchemaObjectRow[]> {
  const names = Object.values(FOUNDATION_SCHEMA_OBJECTS).flat();
  const placeholders = names.map(() => "?").join(", ");
  const rows = await db.prepare(`SELECT type, name FROM sqlite_master
    WHERE name IN (${placeholders}) ORDER BY type, name`)
    .bind(...names)
    .all<SchemaObjectRow>();
  return rows.results;
}

function assertExactHealthyObjects(rows: SchemaObjectRow[]): void {
  const actual = new Set(rows.map((row) => `${row.type}:${row.name}`));
  const expected = new Set(Object.entries(FOUNDATION_SCHEMA_OBJECTS).flatMap(([type, names]) =>
    names.map((name) => `${type}:${name}`)));
  if (actual.size !== expected.size || [...expected].some((identity) => !actual.has(identity))) {
    throw new Error("Foundation repair refused: 0017 schema objects are incomplete or mistyped");
  }
}

function normalizeSchemaSql(sql: string): string {
  return sql.replace(/\s+/g, " ").replace(/\s*([(),])\s*/g, "$1").trim();
}

async function schemaFingerprint(db: D1Database): Promise<string> {
  const names = Object.values(FOUNDATION_SCHEMA_OBJECTS).flat();
  const placeholders = names.map(() => "?").join(", ");
  const rows = await db.prepare(`SELECT type, name, sql FROM sqlite_master
    WHERE name IN (${placeholders}) ORDER BY type, name`)
    .bind(...names)
    .all<SchemaObjectRow & { sql: string }>();
  const representation = rows.results.map((row) => ({
    type: row.type,
    name: row.name,
    sql: normalizeSchemaSql(row.sql)
  }));
  return `sha256:${sha256Hex(JSON.stringify(representation))}`;
}

/**
 * Proves either the exact pre-migration production drift or the exact healthy
 * post-0017 boundary. Any partial/mixed state is rejected.
 */
export async function inspectProductionFoundationRepair(
  db: D1Database
): Promise<ProductionFoundationRepairInspection> {
  const receipts = await assertAcceptedReceipts(db);
  await assertPreservedAlert(db);
  const objects = await foundationSchemaObjects(db);
  const presentFoundationTables = new Set(
    objects.filter((row) => row.type === "table").map((row) => row.name)
  );
  const repairedReceipt = receipts.get("0017_engine_os_foundation_repair");

  if (presentFoundationTables.size === 0) {
    if (objects.length !== 0 || repairedReceipt !== undefined) {
      throw new Error("Foundation repair refused: drift boundary is not the exact eight-object absence");
    }
    return {
      mode: "exact_eight_object_drift",
      preservedReceiptVersions: PRESERVED_RECEIPT_VERSIONS,
      preservedAlertId: PRESERVED_ALERT.alertId,
      schemaFingerprint: null
    };
  }

  if (repairedReceipt !== RECEIPTS["0017_engine_os_foundation_repair"]) {
    throw new Error("Foundation repair refused: exact 0017 receipt is absent or changed");
  }
  assertExactHealthyObjects(objects);
  const fingerprint = await schemaFingerprint(db);
  if (fingerprint !== FOUNDATION_SCHEMA_FINGERPRINT) {
    throw new Error("Foundation repair refused: 0017 schema fingerprint does not match the frozen definition");
  }
  return {
    mode: "exact_healthy_0017",
    preservedReceiptVersions: PRESERVED_RECEIPT_VERSIONS,
    preservedAlertId: PRESERVED_ALERT.alertId,
    schemaFingerprint: fingerprint
  };
}

/**
 * Applies exact migration 0017 from the bundle after the exact-drift preflight.
 * This is provider-free and avoids relying on hosting-platform migration
 * packaging during the temporary operator deployment.
 */
export async function applyProductionFoundationSchemaRepair(
  db: D1Database
): Promise<ProductionFoundationSchemaRepairReceipt> {
  const before = await inspectProductionFoundationRepair(db);
  if (before.mode !== "exact_eight_object_drift") {
    throw new Error("Foundation schema repair refused: exact eight-object drift is not present");
  }
  const marker = "INSERT INTO `engine_schema_versions`";
  const definition = foundationMigrationSql.split(marker)[0];
  const statements = foundationMigrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (`sha256:${sha256Hex(foundationMigrationSql)}` !== PRODUCTION_FOUNDATION_SCHEMA_REPAIR_ARTIFACT.fileHash ||
    `sha256:${sha256Hex(definition)}` !== PRODUCTION_FOUNDATION_SCHEMA_REPAIR_ARTIFACT.definitionHash ||
    statements.length !== PRODUCTION_FOUNDATION_SCHEMA_REPAIR_ARTIFACT.statementCount) {
    throw new Error("Foundation schema repair refused: bundled migration artifact does not match its frozen receipt");
  }
  await db.batch(statements.map((statement) => db.prepare(statement)));
  const after = await inspectProductionFoundationRepair(db);
  if (after.mode !== "exact_healthy_0017" || !after.schemaFingerprint) {
    throw new Error("Foundation schema repair failed: exact healthy 0017 boundary was not observed");
  }
  return {
    status: "applied",
    migrationVersion: "0017_engine_os_foundation_repair",
    definitionHash: PRODUCTION_FOUNDATION_SCHEMA_REPAIR_ARTIFACT.definitionHash,
    fileHash: PRODUCTION_FOUNDATION_SCHEMA_REPAIR_ARTIFACT.fileHash,
    statementCount: PRODUCTION_FOUNDATION_SCHEMA_REPAIR_ARTIFACT.statementCount,
    schemaFingerprint: after.schemaFingerprint,
    providerRequestMade: false
  };
}

async function foundationTableCounts(db: D1Database): Promise<FoundationTableCounts> {
  const counts = await db.prepare(`SELECT
      (SELECT count(*) FROM source_capture_manifests) AS source_manifests,
      (SELECT count(*) FROM source_capture_heartbeats) AS source_heartbeats,
      (SELECT count(*) FROM odds_quota_events) AS quota_events,
      (SELECT count(*) FROM odds_quota_state) AS quota_state,
      (SELECT count(*) FROM odds_quota_epochs) AS quota_epochs,
      (SELECT count(*) FROM odds_quota_control) AS quota_control,
      (SELECT count(*) FROM odds_quota_reservations) AS reservations,
      (SELECT count(*) FROM odds_quota_reservation_events) AS reservation_events`)
    .first<FoundationTableCounts>();
  if (!counts) throw new Error("Foundation repair refused: table-count preflight returned no result");
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])) as unknown as FoundationTableCounts;
}

interface ExactBootstrapReadback {
  quota_epoch: string;
  epoch_provider: string;
  epoch_generation: string;
  opened_at: string;
  reason: string;
  initial_used: number;
  initial_remaining: number;
  source_request_key: string | null;
  control_provider: string;
  control_epoch: string;
  control_generation: string;
  observed_at: string;
  used: number;
  remaining: number;
  last_cost: number;
  updated_at: string;
  request_key: string;
  event_provider: string;
  event_used: number;
  event_remaining: number;
  event_last_cost: number;
  captured_at: string;
  response_capture_id: string | null;
}

async function exactBootstrapReadback(db: D1Database): Promise<boolean> {
  const row = await db.prepare(`SELECT
      e.quota_epoch, e.provider AS epoch_provider, e.credential_generation_id AS epoch_generation,
      e.opened_at, e.reason, e.initial_used, e.initial_remaining, e.source_request_key,
      c.provider AS control_provider, c.quota_epoch AS control_epoch,
      c.credential_generation_id AS control_generation, c.observed_at,
      s.used, s.remaining, s.last_cost, s.updated_at,
      q.request_key, q.provider AS event_provider, q.used AS event_used,
      q.remaining AS event_remaining, q.last_cost AS event_last_cost,
      q.captured_at, q.response_capture_id
    FROM odds_quota_epochs e
    JOIN odds_quota_control c ON c.quota_epoch = e.quota_epoch
    JOIN odds_quota_state s ON s.provider = c.provider
    JOIN odds_quota_events q ON q.request_key = e.source_request_key`)
    .first<ExactBootstrapReadback>();
  return Boolean(row &&
    row.quota_epoch === QUOTA_EPOCH && row.epoch_provider === PROVIDER &&
    row.epoch_generation === CREDENTIAL_GENERATION_ID && row.opened_at === OBSERVED_AT &&
    row.reason === "credential_bootstrap" && row.initial_used === 38 && row.initial_remaining === 462 &&
    row.source_request_key === BOOTSTRAP_REQUEST_KEY && row.control_provider === PROVIDER &&
    row.control_epoch === QUOTA_EPOCH && row.control_generation === CREDENTIAL_GENERATION_ID &&
    row.observed_at === OBSERVED_AT && row.used === 38 && row.remaining === 462 &&
    row.last_cost === 0 && row.updated_at === OBSERVED_AT &&
    row.request_key === BOOTSTRAP_REQUEST_KEY && row.event_provider === PROVIDER &&
    row.event_used === 38 && row.event_remaining === 462 && row.event_last_cost === 0 &&
    row.captured_at === OBSERVED_AT && row.response_capture_id === null);
}

function bootstrapCountsExact(counts: FoundationTableCounts): boolean {
  return counts.source_manifests === 0 && counts.source_heartbeats === 0 &&
    counts.quota_events === 1 && counts.quota_state === 1 && counts.quota_epochs === 1 &&
    counts.quota_control === 1 && counts.reservations === 0 && counts.reservation_events === 0;
}

function foundationCountsEmpty(counts: FoundationTableCounts): boolean {
  return Object.values(counts).every((count) => count === 0);
}

function repairReceipt(status: ProductionFoundationRepairReceipt["status"]): ProductionFoundationRepairReceipt {
  return {
    status,
    migrationVersion: "0017_engine_os_foundation_repair",
    quotaEpoch: QUOTA_EPOCH,
    credentialGenerationId: CREDENTIAL_GENERATION_ID,
    observedAt: OBSERVED_AT,
    used: 38,
    remaining: 462,
    lastCost: 0,
    sourceCaptureRows: 0,
    reservationRows: 0,
    reservationEventRows: 0,
    providerRequestMade: false
  };
}

/**
 * Reconstructs only the exact accepted OS-19A bootstrap state. This is a
 * one-shot production operator action; it never dispatches or authenticates a
 * provider request and refuses any pre-existing source/quota data.
 */
export async function reconstructProductionFoundationBootstrap(
  db: D1Database
): Promise<ProductionFoundationRepairReceipt> {
  const inspection = await inspectProductionFoundationRepair(db);
  if (inspection.mode !== "exact_healthy_0017") {
    throw new Error("Foundation repair refused: apply exact migration 0017 before bootstrap reconstruction");
  }
  const before = await foundationTableCounts(db);
  if (bootstrapCountsExact(before)) {
    if (!await exactBootstrapReadback(db)) {
      throw new Error("Foundation repair refused: existing bootstrap state conflicts with the accepted receipt");
    }
    return repairReceipt("already_reconstructed");
  }
  if (!foundationCountsEmpty(before)) {
    throw new Error("Foundation repair refused: repaired source and quota tables are partial or nonempty");
  }

  try {
    await db.batch([
      db.prepare(`INSERT INTO odds_quota_epochs (
        quota_epoch, provider, credential_generation_id, opened_at, reason,
        initial_used, initial_remaining, source_request_key
      ) VALUES (?, ?, ?, ?, 'credential_bootstrap', 38, 462, ?)`)
        .bind(QUOTA_EPOCH, PROVIDER, CREDENTIAL_GENERATION_ID, OBSERVED_AT, BOOTSTRAP_REQUEST_KEY),
      db.prepare(`INSERT INTO odds_quota_events (
        request_key, provider, used, remaining, last_cost, captured_at, response_capture_id
      ) VALUES (?, ?, 38, 462, 0, ?, NULL)`)
        .bind(BOOTSTRAP_REQUEST_KEY, PROVIDER, OBSERVED_AT),
      db.prepare(`INSERT INTO odds_quota_control (
        provider, quota_epoch, credential_generation_id, observed_at
      ) VALUES (?, ?, ?, ?)`)
        .bind(PROVIDER, QUOTA_EPOCH, CREDENTIAL_GENERATION_ID, OBSERVED_AT),
      db.prepare(`INSERT INTO odds_quota_state (
        provider, used, remaining, last_cost, updated_at
      ) VALUES (?, 38, 462, 0, ?)`)
        .bind(PROVIDER, OBSERVED_AT)
    ]);
  } catch (error) {
    const afterRace = await foundationTableCounts(db);
    if (bootstrapCountsExact(afterRace) && await exactBootstrapReadback(db)) {
      return repairReceipt("already_reconstructed");
    }
    throw error;
  }

  const after = await foundationTableCounts(db);
  if (!bootstrapCountsExact(after) || !await exactBootstrapReadback(db)) {
    throw new Error("Foundation repair failed: reconstructed bootstrap readback is not exact");
  }
  return repairReceipt("reconstructed");
}

/** Final read-only verification payload for the temporary operator receipt. */
export async function verifyProductionFoundationRepair(
  db: D1Database
): Promise<ProductionFoundationRepairVerification> {
  const inspection = await inspectProductionFoundationRepair(db);
  if (inspection.mode !== "exact_healthy_0017" || !inspection.schemaFingerprint) {
    throw new Error("Foundation repair verification requires exact healthy migration 0017");
  }
  const counts = await foundationTableCounts(db);
  if (!bootstrapCountsExact(counts) || !await exactBootstrapReadback(db)) {
    throw new Error("Foundation repair verification failed: bootstrap state is not exact");
  }
  const foreignKeyRows = await db.prepare("PRAGMA foreign_key_check").all<Record<string, unknown>>();
  if (foreignKeyRows.results.length !== 0) {
    throw new Error("Foundation repair verification failed: foreign-key violations exist");
  }
  const operationalTables = [
    "canonical_games",
    "game_provider_aliases",
    "game_kickoff_revisions",
    "forecast_origins",
    "game_schedule_revisions",
    "forecast_origin_versions",
    "engine_activations",
    "engine_scheduler_ticks_v2",
    "engine_scheduler_events_v2",
    "engine_origin_jobs_v2",
    "engine_origin_attempts_v2",
    "engine_origin_records_v2"
  ] as const;
  const operationalCountRow = await db.prepare(`SELECT
      (SELECT count(*) FROM canonical_games) AS canonical_games,
      (SELECT count(*) FROM game_provider_aliases) AS game_provider_aliases,
      (SELECT count(*) FROM game_kickoff_revisions) AS game_kickoff_revisions,
      (SELECT count(*) FROM forecast_origins) AS forecast_origins,
      (SELECT count(*) FROM game_schedule_revisions) AS game_schedule_revisions,
      (SELECT count(*) FROM forecast_origin_versions) AS forecast_origin_versions,
      (SELECT count(*) FROM engine_activations) AS engine_activations,
      (SELECT count(*) FROM engine_scheduler_ticks_v2) AS engine_scheduler_ticks_v2,
      (SELECT count(*) FROM engine_scheduler_events_v2) AS engine_scheduler_events_v2,
      (SELECT count(*) FROM engine_origin_jobs_v2) AS engine_origin_jobs_v2,
      (SELECT count(*) FROM engine_origin_attempts_v2) AS engine_origin_attempts_v2,
      (SELECT count(*) FROM engine_origin_records_v2) AS engine_origin_records_v2`)
    .first<Record<(typeof operationalTables)[number], number>>();
  if (!operationalCountRow || operationalTables.some((table) => Number(operationalCountRow[table]) !== 0)) {
    throw new Error("Foundation repair verification failed: origin, activation, or v2 scheduler tables are nonempty");
  }
  const downstreamOperationalTableCounts = Object.fromEntries(
    operationalTables.map((table) => [table, Number(operationalCountRow[table]) as 0])
  );
  return {
    status: "verified",
    expectedSchemaObjects: FOUNDATION_SCHEMA_OBJECTS,
    schemaFingerprint: inspection.schemaFingerprint,
    foreignKeyViolationCount: 0,
    tableCounts: counts,
    bootstrap: {
      quotaEpoch: QUOTA_EPOCH,
      credentialGenerationId: CREDENTIAL_GENERATION_ID,
      requestKey: BOOTSTRAP_REQUEST_KEY,
      observedAt: OBSERVED_AT,
      used: 38,
      remaining: 462,
      lastCost: 0
    },
    preservedAlertId: PRESERVED_ALERT.alertId,
    downstreamOperationalTableCounts,
    downstreamOperationalTablesEmpty: true,
    providerRequestMade: false
  };
}
