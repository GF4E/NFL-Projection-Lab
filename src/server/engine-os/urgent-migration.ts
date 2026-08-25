import migrationSql from "../../../drizzle/0013_engine_os_urgent.sql?raw";

export const URGENT_ENGINE_OS_MIGRATION_VERSION = "0013_engine_os_urgent";
export const URGENT_ENGINE_OS_MIGRATION_HASH =
  "sha256:6205a3dfe09c2d663bb8c50378f295accd266ff2b2018668ca5353436a6797bb";

interface SchemaVersionRow {
  version: string;
  migration_hash: string;
}

export interface UrgentMigrationResult {
  status: "applied" | "already_applied";
  version: string;
  migrationHash: string;
  statementCount: number;
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function authorizedUrgentMigrationRequest(request: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 48 || request.method !== "POST") return false;
  const authorization = request.headers.get("authorization");
  return Boolean(authorization) && constantTimeEqual(authorization!, `Bearer ${secret}`);
}

function migrationStatements(): string[] {
  return migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function readInstalledVersion(db: D1Database): Promise<SchemaVersionRow | null> {
  const schemaTable = await db.prepare(`
    SELECT name
    FROM sqlite_schema
    WHERE type = 'table' AND name = 'engine_schema_versions'
  `).first<{ name: string }>();
  if (!schemaTable) return null;

  const version = await db.prepare(`
    SELECT version, migration_hash
    FROM engine_schema_versions
    WHERE version = ?
  `).bind(URGENT_ENGINE_OS_MIGRATION_VERSION).first<SchemaVersionRow>();
  if (!version) {
    throw new Error(
      "engine_schema_versions exists without the urgent migration receipt; refusing a partial or ambiguous migration"
    );
  }
  return version;
}

function assertExpectedVersion(row: SchemaVersionRow): void {
  if (
    row.version !== URGENT_ENGINE_OS_MIGRATION_VERSION ||
    row.migration_hash !== URGENT_ENGINE_OS_MIGRATION_HASH
  ) {
    throw new Error(
      `urgent migration receipt mismatch: expected ${URGENT_ENGINE_OS_MIGRATION_VERSION} ${URGENT_ENGINE_OS_MIGRATION_HASH}`
    );
  }
}

/**
 * One-shot production bridge for Sites, which exposes D1 inspection but no
 * operator migration command. The authenticated Worker gate that calls this function is
 * removed immediately after the receipt is independently verified.
 */
export async function applyUrgentEngineOsMigration(db: D1Database): Promise<UrgentMigrationResult> {
  const statements = migrationStatements();
  const installed = await readInstalledVersion(db);
  if (installed) {
    assertExpectedVersion(installed);
    return {
      status: "already_applied",
      version: installed.version,
      migrationHash: installed.migration_hash,
      statementCount: statements.length
    };
  }

  await db.batch(statements.map((statement) => db.prepare(statement)));
  const verified = await readInstalledVersion(db);
  if (!verified) throw new Error("urgent migration completed without an append-only schema receipt");
  assertExpectedVersion(verified);

  return {
    status: "applied",
    version: verified.version,
    migrationHash: verified.migration_hash,
    statementCount: statements.length
  };
}
