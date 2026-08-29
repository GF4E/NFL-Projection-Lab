import {
  canonicalJson,
  codePointCompare,
  DEFAULT_STAGING_CENSUS_OPTIONS,
  STAGING_CENSUS_EXACT_BODY,
  STAGING_CENSUS_ID,
  STAGING_CENSUS_SEMANTIC_CONTRACT
} from "./contract";

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

type ForeignKeyRow = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
  on_update: string;
  on_delete: string;
  match: string;
};

type TableEvidence = {
  name: string;
  createSql: string;
  createSqlHash: string;
  rowCount: number;
  foreignKeys: ForeignKeyRow[];
};

type CensusDatabase = Pick<D1Database, "prepare">;

type CensusOptions = {
  expectedOrigin: string;
  expectedCatalogHash: string;
  expectedCatalogRows: number;
  expectedUserTableCount: number;
};

type FailureReason =
  | "catalog_read_failed"
  | "catalog_row_invalid"
  | "catalog_changed_during_census"
  | "foreign_key_read_failed"
  | "foreign_key_row_invalid"
  | "row_count_read_failed"
  | "row_count_invalid"
  | "row_count_changed_during_census"
  | "user_table_catalog_invalid";

class CensusFailure extends Error {
  constructor(readonly reason: FailureReason) {
    super(reason);
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_]+$/u.test(value)) throw new CensusFailure("user_table_catalog_invalid");
  return `"${value}"`;
}

function isInternal(row: CatalogRow): boolean {
  return INTERNAL_OBJECTS.has(row.name) || INTERNAL_OBJECTS.has(row.tbl_name) ||
    row.name.startsWith("sqlite_") || row.name.startsWith("sqlite_autoindex_");
}

async function all<T extends Record<string, unknown>>(
  db: CensusDatabase,
  sql: string,
  failure: FailureReason
): Promise<T[]> {
  try {
    const result = await db.prepare(sql).all<T>();
    if (!result.success || !Array.isArray(result.results)) throw new CensusFailure(failure);
    return result.results;
  } catch (error) {
    if (error instanceof CensusFailure) throw error;
    throw new CensusFailure(failure);
  }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

function validCatalogRow(value: unknown): value is CatalogRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.type === "string" && typeof row.name === "string" &&
    typeof row.tbl_name === "string" && (typeof row.sql === "string" || row.sql === null);
}

function normalizeForeignKey(value: Record<string, unknown>): ForeignKeyRow {
  const id = value.id;
  const seq = value.seq;
  const table = value.table;
  const from = value.from;
  const to = value.to;
  const onUpdate = value.on_update;
  const onDelete = value.on_delete;
  const match = value.match;
  if (!Number.isSafeInteger(id) || (id as number) < 0 || !Number.isSafeInteger(seq) || (seq as number) < 0 ||
      typeof table !== "string" || typeof from !== "string" ||
      (typeof to !== "string" && to !== null) || typeof onUpdate !== "string" ||
      typeof onDelete !== "string" || typeof match !== "string") {
    throw new CensusFailure("foreign_key_row_invalid");
  }
  return {
    id: id as number,
    seq: seq as number,
    table,
    from,
    to,
    on_update: onUpdate,
    on_delete: onDelete,
    match
  };
}

function foreignKeyCompare(left: ForeignKeyRow, right: ForeignKeyRow): number {
  return left.id - right.id || left.seq - right.seq || codePointCompare(left.table, right.table) ||
    codePointCompare(left.from, right.from) || codePointCompare(left.to ?? "", right.to ?? "") ||
    codePointCompare(left.on_update, right.on_update) || codePointCompare(left.on_delete, right.on_delete) ||
    codePointCompare(left.match, right.match);
}

async function readCatalog(db: CensusDatabase): Promise<CatalogRow[]> {
  const rows = await all<Record<string, unknown>>(db, `SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE type IN ('table', 'index', 'trigger', 'view')
    ORDER BY type COLLATE BINARY, name COLLATE BINARY`, "catalog_read_failed");
  if (!rows.every(validCatalogRow)) throw new CensusFailure("catalog_row_invalid");
  return rows.sort((left, right) => codePointCompare(left.type, right.type) ||
    codePointCompare(left.name, right.name) || codePointCompare(left.tbl_name, right.tbl_name));
}

async function readRowCount(db: CensusDatabase, tableName: string): Promise<number> {
  const counts = await all<{ exact_count: number }>(
    db,
    `SELECT COUNT(*) AS exact_count FROM ${quoteIdentifier(tableName)}`,
    "row_count_read_failed"
  );
  if (counts.length !== 1 || !Number.isSafeInteger(counts[0]?.exact_count) || counts[0]!.exact_count < 0) {
    throw new CensusFailure("row_count_invalid");
  }
  return counts[0]!.exact_count;
}

export async function handleOs01StagingCensus(
  request: Request,
  db: CensusDatabase,
  options: CensusOptions = DEFAULT_STAGING_CENSUS_OPTIONS
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== STAGING_CENSUS_SEMANTIC_CONTRACT.route) return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (url.origin !== options.expectedOrigin || url.search !== "" || url.hash !== "" ||
      request.headers.get("content-type") !== "application/json") {
    return json({ error: "invalid_request" }, 400);
  }
  let requestBody: string;
  try {
    requestBody = await request.text();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (requestBody !== STAGING_CENSUS_EXACT_BODY) return json({ error: "invalid_request" }, 400);

  try {
    const catalogBefore = await readCatalog(db);
    const catalogHash = await sha256(canonicalJson(catalogBefore));
    if (catalogBefore.length !== options.expectedCatalogRows || catalogHash !== options.expectedCatalogHash) {
      return json({
        error: "staging_prestate_mismatch",
        catalogRows: catalogBefore.length,
        catalogHash,
        databaseMutationAttempted: false
      }, 409);
    }
    const userObjects = catalogBefore.filter((row) => !isInternal(row));
    const userTables = userObjects
      .filter((row) => row.type === "table")
      .sort((left, right) => codePointCompare(left.name, right.name));
    if (userTables.length !== options.expectedUserTableCount || userTables.some((row) =>
      !/^[A-Za-z0-9_]+$/u.test(row.name) || row.name !== row.tbl_name || typeof row.sql !== "string")) {
      throw new CensusFailure("user_table_catalog_invalid");
    }

    const tables: TableEvidence[] = [];
    for (const table of userTables) {
      const createSql = table.sql;
      if (typeof createSql !== "string") throw new CensusFailure("user_table_catalog_invalid");
      const foreignKeys = (await all<Record<string, unknown>>(
        db,
        `PRAGMA foreign_key_list(${quoteIdentifier(table.name)})`,
        "foreign_key_read_failed"
      )).map(normalizeForeignKey).sort(foreignKeyCompare);
      tables.push({
        name: table.name,
        createSql,
        createSqlHash: await sha256(createSql),
        rowCount: await readRowCount(db, table.name),
        foreignKeys
      });
    }

    const rowCountsAfter = [];
    for (const table of userTables) rowCountsAfter.push({ name: table.name, rowCount: await readRowCount(db, table.name) });
    if (rowCountsAfter.some((row, index) => row.rowCount !== tables[index]!.rowCount)) {
      throw new CensusFailure("row_count_changed_during_census");
    }
    const catalogAfter = await readCatalog(db);
    if (await sha256(canonicalJson(catalogAfter)) !== catalogHash || catalogAfter.length !== catalogBefore.length) {
      throw new CensusFailure("catalog_changed_during_census");
    }

    const views = userObjects
      .filter((row) => row.type === "view")
      .map((row) => row.name)
      .sort(codePointCompare);
    const tableSetHash = await sha256(canonicalJson(tables.map((table) => table.name)));
    const viewSetHash = await sha256(canonicalJson(views));
    const ddlRoot = await sha256(canonicalJson(tables.map((table) => ({
      name: table.name,
      createSql: table.createSql
    }))));
    const foreignKeyRoot = await sha256(canonicalJson(tables.map((table) => ({
      name: table.name,
      foreignKeys: table.foreignKeys
    }))));
    const rowCountRoot = await sha256(canonicalJson(tables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount
    }))));
    const body = {
      version: STAGING_CENSUS_SEMANTIC_CONTRACT.responseVersion,
      status: "read_only_schema_census_captured",
      censusId: STAGING_CENSUS_ID,
      catalogRows: catalogBefore.length,
      catalogHash,
      userObjectCount: userObjects.length,
      userTableCount: tables.length,
      userViewCount: views.length,
      tableSetHash,
      viewSetHash,
      ddlRoot,
      foreignKeyRoot,
      rowCountRoot,
      tables,
      viewNames: views,
      prePostCatalogMatch: true,
      prePostRowCountsMatch: true,
      snapshotClaim: STAGING_CENSUS_SEMANTIC_CONTRACT.consistencyClaim,
      requestBudgetClaim: "controller_enforced_single_invocation_not_runtime_durable",
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
    return json({ ...body, receiptHash: await sha256(canonicalJson(body)) });
  } catch (error) {
    return json({
      error: "staging_census_failed",
      reason: error instanceof CensusFailure ? error.reason : "catalog_read_failed",
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
