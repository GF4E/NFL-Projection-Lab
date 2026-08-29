import {
  canonicalJson,
  codePointCompare,
  DEFAULT_STAGING_CENSUS_OPTIONS,
  STAGING_CENSUS_COUNT_DIAGNOSTIC_MAX_TABLE_ROWS,
  STAGING_CENSUS_COUNT_DIAGNOSTIC_STATUSES,
  STAGING_CENSUS_COUNT_DIAGNOSTIC_VERSION,
  STAGING_CENSUS_EXACT_BODY,
  STAGING_CENSUS_FAILURE_CATEGORIES,
  STAGING_CENSUS_ID,
  STAGING_CENSUS_SEMANTIC_CONTRACT
} from "./contract";
import type { StagingCensusFailureCategory } from "./contract";

const INTERNAL_TABLES = new Set<string>(STAGING_CENSUS_SEMANTIC_CONTRACT.internalTableNames);
const REPLAYABLE_OBJECT_TYPES = new Set<string>(STAGING_CENSUS_SEMANTIC_CONTRACT.replayableObjectTypes);
const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/u;

type CatalogRow = {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
};

type ReplayableObjectEvidence = {
  type: "table" | "index" | "trigger" | "view";
  name: string;
  tblName: string;
  createSql: string;
  createSqlHash: string;
};

type DerivedAutoIndexEvidence = {
  type: "index";
  name: string;
  tblName: string;
  createSql: null;
  createSqlHash: string;
};

type InternalObjectEvidence = {
  type: string;
  name: string;
  tblName: string;
  createSql: string | null;
  createSqlHash: string | null;
};

type CensusDatabase = Pick<D1Database, "prepare" | "batch">;

type CensusOptions = {
  expectedOrigin: string;
  expectedCatalogHash: string;
  expectedCatalogRows: number;
  expectedUserTableCount: number;
};

type FailureReason = StagingCensusFailureCategory;

class CensusFailure extends Error {
  constructor(readonly reason: FailureReason) {
    super(reason);
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isInternal(row: CatalogRow): boolean {
  return row.type === "table" && row.name === row.tbl_name && INTERNAL_TABLES.has(row.name);
}

function isDerivedAutoIndex(row: CatalogRow): boolean {
  const prefix = `sqlite_autoindex_${row.tbl_name}_`;
  return row.type === "index" && row.sql === null && row.name.startsWith(prefix) &&
    /^[0-9]+$/u.test(row.name.slice(prefix.length));
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

const CATALOG_SQL = `SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE type IN ('table', 'index', 'trigger', 'view')
    ORDER BY type COLLATE BINARY, name COLLATE BINARY`;

function normalizeCatalog(value: unknown): CatalogRow[] {
  if (!value || typeof value !== "object") throw new CensusFailure("catalog_read_failed");
  const result = value as { success?: unknown; results?: unknown };
  if (result.success !== true || !Array.isArray(result.results)) {
    throw new CensusFailure("catalog_read_failed");
  }
  const rows = result.results;
  if (!rows.every(validCatalogRow)) throw new CensusFailure("catalog_shape_invalid");
  return rows.sort((left, right) => codePointCompare(left.type, right.type) ||
    codePointCompare(left.name, right.name) || codePointCompare(left.tbl_name, right.tbl_name));
}

async function readCatalogPair(db: CensusDatabase): Promise<[CatalogRow[], CatalogRow[]]> {
  try {
    const results = await db.batch([db.prepare(CATALOG_SQL), db.prepare(CATALOG_SQL)]);
    if (!Array.isArray(results) || results.length !== 2) throw new CensusFailure("catalog_read_failed");
    return [normalizeCatalog(results[0]), normalizeCatalog(results[1])];
  } catch (error) {
    if (error instanceof CensusFailure) throw error;
    throw new CensusFailure("catalog_read_failed");
  }
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
    const [catalogBefore, catalogAfter] = await readCatalogPair(db);
    const firstCatalogHash = await sha256(canonicalJson(catalogBefore));
    const secondCatalogHash = await sha256(canonicalJson(catalogAfter));
    if (catalogBefore.length !== options.expectedCatalogRows || firstCatalogHash !== options.expectedCatalogHash) {
      throw new CensusFailure("catalog_identity_mismatch");
    }
    if (catalogAfter.length !== catalogBefore.length || secondCatalogHash !== firstCatalogHash) {
      throw new CensusFailure("catalog_changed");
    }
    const internalRows = catalogBefore.filter(isInternal);
    const userRows = catalogBefore.filter((row) => !isInternal(row));
    const rawTables = catalogBefore.filter((row) => row.type === "table");
    const userTables = userRows
      .filter((row) => row.type === "table")
      .sort((left, right) => codePointCompare(left.name, right.name));
    if (rawTables.length > STAGING_CENSUS_COUNT_DIAGNOSTIC_MAX_TABLE_ROWS) {
      throw new CensusFailure("catalog_shape_invalid");
    }
    if (userTables.length !== options.expectedUserTableCount) {
      const diagnostic = {
        version: STAGING_CENSUS_COUNT_DIAGNOSTIC_VERSION,
        status: STAGING_CENSUS_COUNT_DIAGNOSTIC_STATUSES[1],
        censusId: STAGING_CENSUS_ID,
        expectedUserTableCount: options.expectedUserTableCount,
        rawTableRowCount: rawTables.length,
        excludedInternalTableRowCount: rawTables.length - userTables.length,
        observedUserTableCount: userTables.length,
        databaseMutationAttempted: false,
        claimBoundary: "terminal_read_only_count_diagnostic_not_census_receipt"
      } as const;
      return json({ ...diagnostic, receiptHash: await sha256(canonicalJson(diagnostic)) }, 500);
    }
    if (userRows.some((row) => !REPLAYABLE_OBJECT_TYPES.has(row.type))) {
      throw new CensusFailure("user_object_type_invalid");
    }
    if (userRows.some((row) =>
      (row.name.startsWith("sqlite_") && !row.name.startsWith("sqlite_autoindex_")) ||
      row.tbl_name.startsWith("sqlite_"))) {
      throw new CensusFailure("unknown_internal_object");
    }
    if (userRows.some((row) => !SAFE_IDENTIFIER.test(row.name) || !SAFE_IDENTIFIER.test(row.tbl_name))) {
      throw new CensusFailure("user_object_identifier_shape_invalid");
    }
    if (new Set(userRows.map((row) => `${row.type}\u0000${row.name}\u0000${row.tbl_name}`)).size !==
        userRows.length) {
      throw new CensusFailure("user_object_identifier_shape_invalid");
    }
    const tableNames = new Set(userTables.map((row) => row.name));
    if (userTables.some((row) => row.name !== row.tbl_name) || userRows.some((row) =>
      (row.type === "view" && row.name !== row.tbl_name) ||
      ((row.type === "index" || row.type === "trigger") && !tableNames.has(row.tbl_name)))) {
      throw new CensusFailure("user_object_name_binding_invalid");
    }

    const objects: ReplayableObjectEvidence[] = [];
    const autoIndexes: DerivedAutoIndexEvidence[] = [];
    for (const row of userRows) {
      if (isDerivedAutoIndex(row)) {
        if (!SAFE_IDENTIFIER.test(row.name) || !tableNames.has(row.tbl_name)) {
          throw new CensusFailure("derived_autoindex_shape_invalid");
        }
        autoIndexes.push({
          type: "index",
          name: row.name,
          tblName: row.tbl_name,
          createSql: null,
          createSqlHash: await sha256("")
        });
        continue;
      }
      if (row.name.startsWith("sqlite_autoindex_")) {
        throw new CensusFailure("derived_autoindex_shape_invalid");
      }
      const createSql = row.sql;
      if (typeof createSql !== "string") throw new CensusFailure("user_object_create_sql_missing");
      objects.push({
        type: row.type as ReplayableObjectEvidence["type"],
        name: row.name,
        tblName: row.tbl_name,
        createSql,
        createSqlHash: await sha256(createSql)
      });
    }
    objects.sort((left, right) => codePointCompare(left.type, right.type) ||
      codePointCompare(left.name, right.name) || codePointCompare(left.tblName, right.tblName));
    autoIndexes.sort((left, right) => codePointCompare(left.name, right.name) ||
      codePointCompare(left.tblName, right.tblName));

    const internalObjects: InternalObjectEvidence[] = [];
    for (const row of internalRows) {
      internalObjects.push({
        type: row.type,
        name: row.name,
        tblName: row.tbl_name,
        createSql: row.sql,
        createSqlHash: typeof row.sql === "string" ? await sha256(row.sql) : null
      });
    }
    internalObjects.sort((left, right) => codePointCompare(left.type, right.type) ||
      codePointCompare(left.name, right.name) || codePointCompare(left.tblName, right.tblName));

    const physicalObjects = [...objects, ...autoIndexes].sort((left, right) =>
      codePointCompare(left.type, right.type) || codePointCompare(left.name, right.name) ||
      codePointCompare(left.tblName, right.tblName));
    const objectTypeCounts = Object.fromEntries(STAGING_CENSUS_SEMANTIC_CONTRACT.replayableObjectTypes
      .map((type) => [type, physicalObjects.filter((object) => object.type === type).length]));
    const perTypeRoots: Record<string, string> = {};
    for (const type of STAGING_CENSUS_SEMANTIC_CONTRACT.replayableObjectTypes) {
      perTypeRoots[type] = await sha256(canonicalJson(physicalObjects.filter((object) => object.type === type)));
    }
    const objectSetHash = await sha256(canonicalJson(physicalObjects.map((object) => ({
      type: object.type,
      name: object.name,
      tblName: object.tblName
    }))));
    const replayableDdlRoot = await sha256(canonicalJson(objects));
    const autoIndexSetHash = await sha256(canonicalJson(autoIndexes));
    const internalObjectSetHash = await sha256(canonicalJson(internalObjects));
    const body = {
      version: STAGING_CENSUS_SEMANTIC_CONTRACT.responseVersion,
      status: STAGING_CENSUS_SEMANTIC_CONTRACT.responseStatus,
      censusId: STAGING_CENSUS_ID,
      catalogRows: catalogBefore.length,
      catalogHash: firstCatalogHash,
      firstCatalogHash,
      secondCatalogHash,
      catalog: catalogBefore,
      userObjectCount: userRows.length,
      userTableCount: userTables.length,
      replayableObjectCount: objects.length,
      objectTypeCounts,
      objectSetHash,
      replayableDdlRoot,
      perTypeRoots,
      objects,
      derivedAutoIndexCount: autoIndexes.length,
      derivedAutoIndexSetHash: autoIndexSetHash,
      derivedAutoIndexes: autoIndexes,
      excludedInternalObjectCount: internalObjects.length,
      excludedInternalObjectSetHash: internalObjectSetHash,
      excludedInternalObjects: internalObjects,
      batchCatalogPairMatch: true,
      snapshotClaim: STAGING_CENSUS_SEMANTIC_CONTRACT.consistencyClaim,
      d1QueryCount: STAGING_CENSUS_SEMANTIC_CONTRACT.maximumD1QueriesPerInvocation,
      foreignKeyEvidence: STAGING_CENSUS_SEMANTIC_CONTRACT.foreignKeyEvidence,
      foreignKeyEvidenceWithheld: true,
      foreignKeyClaimsAccepted: STAGING_CENSUS_SEMANTIC_CONTRACT.foreignKeyClaimsAccepted,
      rowCountEvidence: STAGING_CENSUS_SEMANTIC_CONTRACT.rowCountEvidence,
      rowCountEvidenceWithheld: true,
      rowCountClaimsAccepted: STAGING_CENSUS_SEMANTIC_CONTRACT.rowCountClaimsAccepted,
      requestBudgetClaim: "controller_enforced_single_invocation_not_runtime_durable",
      databaseMutationAttempted: false,
      providerBindings: 0,
      providerSecretReads: 0,
      providerDispatches: 0,
      quotaReservations: 0,
      captureActivations: 0,
      productionReads: 0,
      productionMutations: 0,
      claimBoundary: "isolated_staging_read_only_ddl_catalog_census_only_no_row_count_or_foreign_key_claim"
    } as const;
    return json({ ...body, receiptHash: await sha256(canonicalJson(body)) });
  } catch (error) {
    const failureCategory: StagingCensusFailureCategory = error instanceof CensusFailure &&
      STAGING_CENSUS_FAILURE_CATEGORIES.includes(error.reason)
      ? error.reason
      : "internal_worker_failure";
    const body = {
      version: "engine-os.os01-staging-census-failure.v1",
      status: "read_only_census_failed",
      censusId: STAGING_CENSUS_ID,
      failureCategory,
      databaseMutationAttempted: false,
      claimBoundary: "terminal_read_only_diagnostic_not_census_receipt"
    } as const;
    return json({ ...body, receiptHash: await sha256(canonicalJson(body)) }, 500);
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
