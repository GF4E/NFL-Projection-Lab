import {
  canonicalJson,
  codePointCompare,
  OS01_STAGING_FOREIGN_KEY_CANDIDATES,
  OS01_STAGING_FOREIGN_KEYS_EXACT_BODY,
  OS01_STAGING_FOREIGN_KEYS_FAILURE_CATEGORIES,
  OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
  OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT
} from "./contract";
import type { Os01StagingForeignKeysFailureCategory } from "./contract";

type CatalogRow = { type: string; name: string; tbl_name: string; sql: string | null };
type RawForeignKeyRow = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
  on_update: string;
  on_delete: string;
  match: string;
};
type ForeignKeyDatabase = Pick<D1Database, "prepare" | "batch">;
type D1Result = { success?: unknown; results?: unknown };

const CATALOG_SQL = `SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE type IN ('table', 'index', 'trigger', 'view')
    ORDER BY type COLLATE BINARY, name COLLATE BINARY`;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/u;
const ROW_KEYS = Object.freeze(["from", "id", "match", "on_delete", "on_update", "seq", "table", "to"]);
const ACTIONS = new Set(["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"]);

class ForeignKeyFailure extends Error {
  constructor(readonly reason: Os01StagingForeignKeysFailureCategory) {
    super(reason);
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(codePointCompare);
  const wanted = [...expected].sort(codePointCompare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

function quoteIdentifier(value: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new ForeignKeyFailure("candidate_identity_mismatch");
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function normalizeCatalog(result: unknown): CatalogRow[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new ForeignKeyFailure("batch_shape_invalid");
  }
  const candidate = result as D1Result;
  if (candidate.success !== true || !Array.isArray(candidate.results)) {
    throw new ForeignKeyFailure("batch_read_failed");
  }
  const rows = candidate.results.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ForeignKeyFailure("batch_shape_invalid");
    }
    const row = value as Record<string, unknown>;
    if (!exactKeys(row, ["name", "sql", "tbl_name", "type"]) ||
        typeof row.type !== "string" || typeof row.name !== "string" ||
        typeof row.tbl_name !== "string" || (typeof row.sql !== "string" && row.sql !== null)) {
      throw new ForeignKeyFailure("batch_shape_invalid");
    }
    return { type: row.type, name: row.name, tbl_name: row.tbl_name, sql: row.sql } as CatalogRow;
  });
  const ordered = [...rows].sort((left, right) => codePointCompare(left.type, right.type) ||
    codePointCompare(left.name, right.name) || codePointCompare(left.tbl_name, right.tbl_name));
  if (ordered.some((row, index) => canonicalJson(row) !== canonicalJson(rows[index]))) {
    throw new ForeignKeyFailure("batch_shape_invalid");
  }
  return rows;
}

function normalizeForeignKeyRows(sourceTable: string, result: unknown): {
  rawRows: RawForeignKeyRow[];
  normalizedConstraints: Record<string, unknown>[];
} {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new ForeignKeyFailure("batch_shape_invalid");
  }
  const candidate = result as D1Result;
  if (candidate.success !== true || !Array.isArray(candidate.results)) {
    throw new ForeignKeyFailure("batch_read_failed");
  }
  const rows = candidate.results.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ForeignKeyFailure("foreign_key_row_shape_invalid");
    }
    const row = value as Record<string, unknown>;
    if (!exactKeys(row, ROW_KEYS) || !Number.isSafeInteger(row.id) || (row.id as number) < 0 ||
        !Number.isSafeInteger(row.seq) || (row.seq as number) < 0 ||
        typeof row.table !== "string" || row.table.length === 0 ||
        typeof row.from !== "string" || row.from.length === 0 ||
        (typeof row.to !== "string" && row.to !== null) ||
        !ACTIONS.has(String(row.on_update)) || !ACTIONS.has(String(row.on_delete)) ||
        row.match !== "NONE") {
      throw new ForeignKeyFailure("foreign_key_row_shape_invalid");
    }
    return {
      id: row.id,
      seq: row.seq,
      table: row.table,
      from: row.from,
      to: row.to,
      on_update: row.on_update,
      on_delete: row.on_delete,
      match: row.match
    } as RawForeignKeyRow;
  }).sort((left, right) => left.id - right.id || left.seq - right.seq ||
    codePointCompare(canonicalJson(left), canonicalJson(right)));
  if (rows.length === 0) throw new ForeignKeyFailure("foreign_key_count_mismatch");
  const rawRows = [...rows].sort((left, right) => left.id - right.id || left.seq - right.seq);
  const grouped = new Map<number, RawForeignKeyRow[]>();
  for (const row of rawRows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);
  const normalizedConstraints = [...grouped.keys()].sort((left, right) => left - right).map((id) => {
    const ordered = [...(grouped.get(id) ?? [])].sort((left, right) => left.seq - right.seq);
    const first = ordered[0];
    if (!first || ordered.some((row, index) => row.seq !== index) || ordered.some((row) =>
      row.table !== first.table || row.on_update !== first.on_update ||
      row.on_delete !== first.on_delete || row.match !== first.match)) {
      throw new ForeignKeyFailure("foreign_key_constraint_invalid");
    }
    return {
      sourceTable,
      targetTable: first.table,
      columns: ordered.map((row) => ({
        ordinal: row.seq,
        fromColumn: row.from,
        toColumn: row.to
      })),
      onUpdate: first.on_update,
      onDelete: first.on_delete,
      match: first.match
    };
  }).sort((left, right) => codePointCompare(canonicalJson(left), canonicalJson(right)));
  return { rawRows, normalizedConstraints };
}

function statements(): string[] {
  return [
    CATALOG_SQL,
    ...OS01_STAGING_FOREIGN_KEY_CANDIDATES.map((candidate) =>
      `PRAGMA foreign_key_list(${quoteIdentifier(candidate.sourceTable)})`),
    CATALOG_SQL
  ];
}

export async function handleOs01StagingForeignKeys(
  request: Request,
  db: ForeignKeyDatabase
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route) {
    return json({ error: "not_found" }, 404);
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (url.origin !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin || url.search !== "" ||
      url.hash !== "" || request.headers.get("content-type") !== "application/json") {
    return json({ error: "invalid_request" }, 400);
  }
  let body: string;
  try {
    body = await request.text();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (body !== OS01_STAGING_FOREIGN_KEYS_EXACT_BODY) return json({ error: "invalid_request" }, 400);

  try {
    const queryPlan = statements();
    const statementPlan = queryPlan.map((sql, ordinal) => ({
      ordinal,
      kind: ordinal === 0 || ordinal === queryPlan.length - 1 ? "catalog" : "foreign_key_list",
      sourceTable: ordinal === 0 || ordinal === queryPlan.length - 1
        ? null
        : OS01_STAGING_FOREIGN_KEY_CANDIDATES[ordinal - 1]?.sourceTable ?? null,
      sqlSha256: ""
    }));
    for (const item of statementPlan) item.sqlSha256 = await sha256(queryPlan[item.ordinal] ?? "");
    if (queryPlan.length !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.maximumD1StatementsPerInvocation ||
        await sha256(canonicalJson(queryPlan)) !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementArrayRoot ||
        await sha256(canonicalJson(statementPlan)) !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementPlanRoot ||
        await sha256(canonicalJson(OS01_STAGING_FOREIGN_KEY_CANDIDATES)) !==
          OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot) {
      throw new ForeignKeyFailure("candidate_identity_mismatch");
    }
    let batch: unknown;
    try {
      batch = await db.batch(queryPlan.map((sql) => db.prepare(sql)));
    } catch {
      throw new ForeignKeyFailure("batch_read_failed");
    }
    if (!Array.isArray(batch) || batch.length !== queryPlan.length) {
      throw new ForeignKeyFailure("batch_shape_invalid");
    }
    const before = normalizeCatalog(batch[0]);
    const after = normalizeCatalog(batch[batch.length - 1]);
    const firstCatalogHash = await sha256(canonicalJson(before));
    const secondCatalogHash = await sha256(canonicalJson(after));
    if (before.length !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogRows ||
        firstCatalogHash !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogHash) {
      throw new ForeignKeyFailure("catalog_identity_mismatch");
    }
    if (canonicalJson(before) !== canonicalJson(after) || secondCatalogHash !== firstCatalogHash) {
      throw new ForeignKeyFailure("catalog_changed");
    }
    const tableSqlHashes = new Map<string, string>();
    for (const row of before) {
      if (row.type === "table" && row.name === row.tbl_name && typeof row.sql === "string") {
        tableSqlHashes.set(row.name, await sha256(row.sql));
      }
    }
    if (OS01_STAGING_FOREIGN_KEY_CANDIDATES.some((candidate) =>
      tableSqlHashes.get(candidate.sourceTable) !== candidate.sourceCreateSqlHash)) {
      throw new ForeignKeyFailure("candidate_identity_mismatch");
    }
    const normalizedForeignKeys: Record<string, unknown>[] = [];
    const candidateEvidence: Record<string, unknown>[] = [];
    let foreignKeyColumnRowCount = 0;
    for (let index = 0; index < OS01_STAGING_FOREIGN_KEY_CANDIDATES.length; index += 1) {
      const result = batch[index + 1] as D1Result;
      const candidate = OS01_STAGING_FOREIGN_KEY_CANDIDATES[index]!;
      const evidence = normalizeForeignKeyRows(candidate.sourceTable, result);
      foreignKeyColumnRowCount += evidence.rawRows.length;
      normalizedForeignKeys.push(...evidence.normalizedConstraints);
      candidateEvidence.push({
        sourceTable: candidate.sourceTable,
        sourceCreateSqlHash: candidate.sourceCreateSqlHash,
        rawRowCount: evidence.rawRows.length,
        rawRowsHash: await sha256(canonicalJson(evidence.rawRows)),
        rawRows: evidence.rawRows,
        normalizedConstraintCount: evidence.normalizedConstraints.length,
        normalizedConstraintRoot: await sha256(canonicalJson(evidence.normalizedConstraints)),
        normalizedConstraints: evidence.normalizedConstraints
      });
    }
    normalizedForeignKeys.sort((left, right) => codePointCompare(canonicalJson(left), canonicalJson(right)));
    const normalizedForeignKeyRoot = await sha256(canonicalJson(normalizedForeignKeys));
    if (foreignKeyColumnRowCount !==
          OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyColumnRowCount ||
        normalizedForeignKeys.length !==
          OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyConstraintCount) {
      throw new ForeignKeyFailure("foreign_key_count_mismatch");
    }
    if (normalizedForeignKeyRoot !==
        OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot) {
      throw new ForeignKeyFailure("foreign_key_root_mismatch");
    }
    const receiptBody = {
      version: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.responseVersion,
      status: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.responseStatus,
      qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
      predecessor: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.predecessor,
      catalogRows: before.length,
      catalogHash: firstCatalogHash,
      firstCatalogHash,
      secondCatalogHash,
      batchCatalogPairMatch: true,
      candidateCount: OS01_STAGING_FOREIGN_KEY_CANDIDATES.length,
      candidateRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
      candidateIdentities: OS01_STAGING_FOREIGN_KEY_CANDIDATES,
      candidateEvidenceRoot: await sha256(canonicalJson(candidateEvidence)),
      candidateEvidence,
      d1StatementCount: queryPlan.length,
      statementArrayRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementArrayRoot,
      statementPlanRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementPlanRoot,
      foreignKeyConstraintCount: normalizedForeignKeys.length,
      foreignKeyColumnRowCount,
      normalizedForeignKeyRoot,
      normalizedForeignKeys,
      foreignKeyClaimsAccepted: true,
      rowCountEvidence: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.rowCountEvidence,
      rowCountEvidenceWithheld: true,
      rowCountClaimsAccepted: false,
      snapshotClaim: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.consistencyClaim,
      requestBudgetClaim: "controller_enforced_single_invocation_not_runtime_durable",
      databaseMutationAttempted: false,
      providerBindings: 0,
      providerSecretReads: 0,
      providerDispatches: 0,
      quotaReservations: 0,
      captureActivations: 0,
      productionReads: 0,
      productionMutations: 0,
      claimBoundary:
        "isolated_staging_read_only_foreign_key_evidence_only_no_row_count_or_os01_acceptance"
    } as const;
    return json({ ...receiptBody, receiptHash: await sha256(canonicalJson(receiptBody)) });
  } catch (error) {
    const failureCategory: Os01StagingForeignKeysFailureCategory = error instanceof ForeignKeyFailure &&
      OS01_STAGING_FOREIGN_KEYS_FAILURE_CATEGORIES.includes(error.reason)
      ? error.reason
      : "internal_worker_failure";
    const failureBody = {
      version: "engine-os.os01-staging-foreign-keys-failure.v1",
      status: "read_only_foreign_key_capture_failed",
      qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
      failureCategory,
      databaseMutationAttempted: false,
      claimBoundary: "terminal_read_only_diagnostic_not_foreign_key_receipt"
    } as const;
    return json({ ...failureBody, receiptHash: await sha256(canonicalJson(failureBody)) }, 500);
  }
}

interface ForeignKeyEnvironment { DB: D1Database }

const worker = {
  fetch(request: Request, environment: ForeignKeyEnvironment): Promise<Response> {
    return handleOs01StagingForeignKeys(request, environment.DB);
  }
};

export const os01StagingForeignKeysTestOnly = Object.freeze({
  catalogSql: CATALOG_SQL,
  statements,
  normalizeForeignKeyRows
});

export default worker;
