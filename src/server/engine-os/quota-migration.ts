import migrationSql from "../../../drizzle/0014_odds_quota_reservations.sql?raw";

export const ODDS_QUOTA_MIGRATION_VERSION = "0014_odds_quota_reservations";
export const ODDS_QUOTA_MIGRATION_HASH =
  "sha256:91bc1571f8873ccaeb8a2b8a9a8c2425370b4eec3c0931f1fa3ae02ffae56da1";

const REQUIRED_OBJECTS = [
  "odds_quota_epochs",
  "odds_quota_control",
  "odds_quota_reservations",
  "odds_quota_reservation_events"
] as const;

interface SchemaVersionRow {
  version: string;
  migration_hash: string;
}

export interface OddsQuotaMigrationResult {
  status: "applied" | "already_applied";
  version: string;
  migrationHash: string;
  statementCount: number;
}

function migrationStatements(): string[] {
  return migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function readInstalledVersion(db: D1Database): Promise<SchemaVersionRow | null> {
  return db.prepare(`SELECT version, migration_hash
    FROM engine_schema_versions WHERE version = ?`)
    .bind(ODDS_QUOTA_MIGRATION_VERSION)
    .first<SchemaVersionRow>();
}

function assertExpectedVersion(row: SchemaVersionRow): void {
  if (row.version !== ODDS_QUOTA_MIGRATION_VERSION || row.migration_hash !== ODDS_QUOTA_MIGRATION_HASH) {
    throw new Error("Odds quota migration receipt does not match the frozen definition hash");
  }
}

async function assertNoPartialSchema(db: D1Database): Promise<void> {
  const placeholders = REQUIRED_OBJECTS.map(() => "?").join(", ");
  const partial = await db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name IN (${placeholders}) ORDER BY name`)
    .bind(...REQUIRED_OBJECTS)
    .all<{ name: string }>();
  if (partial.results.length > 0) {
    throw new Error("Odds quota schema objects exist without the immutable 0014 receipt");
  }
}

async function assertRequiredObjects(db: D1Database): Promise<void> {
  const placeholders = REQUIRED_OBJECTS.map(() => "?").join(", ");
  const result = await db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name IN (${placeholders}) ORDER BY name`)
    .bind(...REQUIRED_OBJECTS)
    .all<{ name: string }>();
  const present = new Set(result.results.map((row) => row.name));
  if (REQUIRED_OBJECTS.some((name) => !present.has(name))) {
    throw new Error("Odds quota migration receipt exists without every required schema object");
  }
}

/**
 * Temporary scheduled bridge for Sites, whose connector can inspect D1 but
 * cannot execute migrations. The caller gate is removed immediately after the
 * immutable receipt and table set are independently verified.
 */
export async function applyOddsQuotaMigration(db: D1Database): Promise<OddsQuotaMigrationResult> {
  const statements = migrationStatements();
  const installed = await readInstalledVersion(db);
  if (installed) {
    assertExpectedVersion(installed);
    await assertRequiredObjects(db);
    return {
      status: "already_applied",
      version: installed.version,
      migrationHash: installed.migration_hash,
      statementCount: statements.length
    };
  }

  await assertNoPartialSchema(db);
  await db.batch(statements.map((statement) => db.prepare(statement)));
  const verified = await readInstalledVersion(db);
  if (!verified) throw new Error("Odds quota migration completed without an immutable schema receipt");
  assertExpectedVersion(verified);
  await assertRequiredObjects(db);
  return {
    status: "applied",
    version: verified.version,
    migrationHash: verified.migration_hash,
    statementCount: statements.length
  };
}
