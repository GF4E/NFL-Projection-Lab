const ROUTE = "/__engine-os/os01-staging-census/v1";
const REQUEST_VERSION = "engine-os.os01-staging-census-request.v1";
const CENSUS_ID = "e1f160c7b5c53d59896bccd269caaebd95113190670fabe325ac336ce3b7d4c6";
const EXPECTED_CATALOG_HASH = "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea";
const EXPECTED_CATALOG_ROWS = 377;
const INTERNAL_OBJECTS = new Set([
  "_cf_KV",
  "d1_migrations",
  "sqlite_sequence",
  "sqlite_stat1",
  "sqlite_stat4"
]);

type CatalogRow = {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
};

type CensusDatabase = Pick<D1Database, "prepare">;

type CensusOptions = {
  expectedCatalogHash: string;
  expectedCatalogRows: number;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_]+$/u.test(value)) throw new Error("unsafe_catalog_identifier");
  return `"${value}"`;
}

function isInternal(row: CatalogRow): boolean {
  return INTERNAL_OBJECTS.has(row.name) || INTERNAL_OBJECTS.has(row.tbl_name) ||
    row.name.startsWith("sqlite_") || row.name.startsWith("sqlite_autoindex_");
}

async function all<T extends Record<string, unknown>>(db: CensusDatabase, sql: string): Promise<T[]> {
  const result = await db.prepare(sql).all<T>();
  if (!result.success || !Array.isArray(result.results)) throw new Error("d1_read_failed");
  return result.results;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleOs01StagingCensus(
  request: Request,
  db: CensusDatabase,
  options: CensusOptions = {
    expectedCatalogHash: EXPECTED_CATALOG_HASH,
    expectedCatalogRows: EXPECTED_CATALOG_ROWS
  }
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== ROUTE) return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (!input || typeof input !== "object") return json({ error: "invalid_request" }, 400);
  const record = input as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "censusId,version" ||
      record.version !== REQUEST_VERSION || record.censusId !== CENSUS_ID) {
    return json({ error: "invalid_request" }, 400);
  }

  try {
    const catalog = await all<CatalogRow>(db, `SELECT type, name, tbl_name, sql FROM sqlite_schema
      WHERE type IN ('table', 'index', 'trigger', 'view')
      ORDER BY type COLLATE BINARY, name COLLATE BINARY`);
    const catalogHash = await sha256(stableJson(catalog));
    if (catalog.length !== options.expectedCatalogRows || catalogHash !== options.expectedCatalogHash) {
      return json({
        error: "staging_prestate_mismatch",
        catalogRows: catalog.length,
        catalogHash,
        databaseMutationAttempted: false
      }, 409);
    }
    const userObjects = catalog.filter((row) => !isInternal(row));
    const userTables = userObjects
      .filter((row) => row.type === "table")
      .sort((left, right) => left.name.localeCompare(right.name));
    if (userTables.length === 0 || userTables.some((row) =>
      !/^[A-Za-z0-9_]+$/u.test(row.name) || row.name !== row.tbl_name || typeof row.sql !== "string")) {
      throw new Error("user_table_catalog_invalid");
    }
    const tables = [];
    for (const table of userTables) {
      const createSql = table.sql;
      if (typeof createSql !== "string") throw new Error("user_table_ddl_invalid");
      const foreignKeys = await all<Record<string, unknown>>(
        db,
        `PRAGMA foreign_key_list(${quoteIdentifier(table.name)})`
      );
      const counts = await all<{ exact_count: number }>(
        db,
        `SELECT COUNT(*) AS exact_count FROM ${quoteIdentifier(table.name)}`
      );
      if (counts.length !== 1 || !Number.isSafeInteger(counts[0]?.exact_count) || counts[0]!.exact_count < 0) {
        throw new Error("table_count_invalid");
      }
      tables.push({
        name: table.name,
        createSql,
        createSqlHash: await sha256(createSql),
        rowCount: counts[0]!.exact_count,
        foreignKeys
      });
    }
    const views = userObjects.filter((row) => row.type === "view");
    const tableSetHash = await sha256(stableJson(tables.map((table) => table.name)));
    const ddlRoot = await sha256(stableJson(tables.map((table) => ({
      name: table.name,
      createSql: table.createSql
    }))));
    const foreignKeyRoot = await sha256(stableJson(tables.map((table) => ({
      name: table.name,
      foreignKeys: table.foreignKeys
    }))));
    const rowCountRoot = await sha256(stableJson(tables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount
    }))));
    const body = {
      version: "engine-os.os01-staging-census-receipt.v1",
      status: "read_only_schema_census_captured",
      censusId: CENSUS_ID,
      catalogRows: catalog.length,
      catalogHash,
      userObjectCount: userObjects.length,
      userTableCount: tables.length,
      userViewCount: views.length,
      tableSetHash,
      ddlRoot,
      foreignKeyRoot,
      rowCountRoot,
      tables,
      views,
      databaseMutationAttempted: false,
      providerBindings: 0,
      providerSecretReads: 0,
      providerDispatches: 0,
      quotaReservations: 0,
      captureActivations: 0,
      productionReads: 0,
      productionMutations: 0,
      claimBoundary: "isolated_staging_read_only_census_only"
    } as const;
    return json({ ...body, receiptHash: await sha256(stableJson(body)) });
  } catch (error) {
    return json({
      error: "staging_census_failed",
      detail: error instanceof Error ? error.message : "unknown",
      databaseMutationAttempted: false,
      claimBoundary: "no_success_receipt"
    }, 500);
  }
}

interface CensusEnvironment {
  DB: D1Database;
}

const worker = {
  fetch(request: Request, environment: CensusEnvironment): Promise<Response> {
    return handleOs01StagingCensus(request, environment.DB);
  }
};

export default worker;
