import migrationSql from "../../../drizzle/0015_engine_os_origin_identity.sql?raw";

export const ORIGIN_IDENTITY_MIGRATION_VERSION = "0015_engine_os_origin_identity";
export const ORIGIN_IDENTITY_MIGRATION_HASH =
  "sha256:622fb472f959273563f3dd139b7dde676e27b370a52c0241d6ee4d3726e3444a";

const REQUIRED_TABLES = ["game_schedule_revisions", "forecast_origin_versions"] as const;
const REQUIRED_TRIGGERS = [
  "game_schedule_revisions_chain_guard",
  "game_schedule_revisions_no_update",
  "game_schedule_revisions_no_delete",
  "game_provider_aliases_identity_guard",
  "forecast_origin_versions_chain_guard",
  "forecast_origin_versions_schedule_guard",
  "forecast_origin_versions_no_update",
  "forecast_origin_versions_no_delete"
] as const;

interface SchemaVersionRow {
  version: string;
  migration_hash: string;
}

export interface OriginIdentityMigrationResult {
  status: "applied" | "already_applied";
  version: string;
  migrationHash: string;
  statementCount: number;
  tableCount: number;
  triggerCount: number;
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
    .bind(ORIGIN_IDENTITY_MIGRATION_VERSION)
    .first<SchemaVersionRow>();
}

function assertExpectedVersion(row: SchemaVersionRow): void {
  if (
    row.version !== ORIGIN_IDENTITY_MIGRATION_VERSION ||
    row.migration_hash !== ORIGIN_IDENTITY_MIGRATION_HASH
  ) {
    throw new Error("Origin identity migration receipt does not match the frozen definition hash");
  }
}

async function schemaObjects(
  db: D1Database,
  type: "table" | "trigger",
  expected: readonly string[]
): Promise<Set<string>> {
  const placeholders = expected.map(() => "?").join(", ");
  const result = await db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = ? AND name IN (${placeholders}) ORDER BY name`)
    .bind(type, ...expected)
    .all<{ name: string }>();
  return new Set(result.results.map((row) => row.name));
}

async function assertNoPartialSchema(db: D1Database): Promise<void> {
  const [tables, triggers] = await Promise.all([
    schemaObjects(db, "table", REQUIRED_TABLES),
    schemaObjects(db, "trigger", REQUIRED_TRIGGERS)
  ]);
  if (tables.size > 0 || triggers.size > 0) {
    throw new Error("Origin identity schema objects exist without the immutable 0015 receipt");
  }
}

async function assertRequiredSchema(db: D1Database): Promise<void> {
  const [tables, triggers] = await Promise.all([
    schemaObjects(db, "table", REQUIRED_TABLES),
    schemaObjects(db, "trigger", REQUIRED_TRIGGERS)
  ]);
  if (
    REQUIRED_TABLES.some((name) => !tables.has(name)) ||
    REQUIRED_TRIGGERS.some((name) => !triggers.has(name))
  ) {
    throw new Error("Origin identity migration receipt exists without every required schema object");
  }
}

/** Temporary, authenticated Sites bridge removed immediately after live proof. */
export async function applyOriginIdentityMigration(db: D1Database): Promise<OriginIdentityMigrationResult> {
  const statements = migrationStatements();
  const installed = await readInstalledVersion(db);
  if (installed) {
    assertExpectedVersion(installed);
    await assertRequiredSchema(db);
    return {
      status: "already_applied",
      version: installed.version,
      migrationHash: installed.migration_hash,
      statementCount: statements.length,
      tableCount: REQUIRED_TABLES.length,
      triggerCount: REQUIRED_TRIGGERS.length
    };
  }

  await assertNoPartialSchema(db);
  await db.batch(statements.map((statement) => db.prepare(statement)));
  const verified = await readInstalledVersion(db);
  if (!verified) throw new Error("Origin identity migration completed without an immutable schema receipt");
  assertExpectedVersion(verified);
  await assertRequiredSchema(db);
  return {
    status: "applied",
    version: verified.version,
    migrationHash: verified.migration_hash,
    statementCount: statements.length,
    tableCount: REQUIRED_TABLES.length,
    triggerCount: REQUIRED_TRIGGERS.length
  };
}
