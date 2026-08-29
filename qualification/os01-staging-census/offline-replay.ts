import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { canonicalJson, codePointCompare } from "./contract.ts";

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/u;
const REPLAY_ORDER = Object.freeze({ table: 0, view: 1, index: 2, trigger: 3 } as const);
export const OS01_GENERATION11_CATALOG_SQL = `SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE type IN ('table', 'index', 'trigger', 'view')
    ORDER BY type COLLATE BINARY, name COLLATE BINARY`;

export const OS01_DDL_OFFLINE_REPLAY_CONTRACT = Object.freeze({
  version: "engine-os.os01-staging-ddl-offline-replay-contract.v1",
  hostedResponseBytesSha256: "3fdcac828cad28ab70e274565856141a50ac5382964e04bb0047ace2854fb032",
  hostedResponseReceiptHash: "c62008d294736799865622c360ac7e581636f7f6472f5dc4efe75ee6a8b7f3a6",
  hostedFinalReceiptBytesSha256: "9253a4802a777f5a1b26fbbe1987382cf2db398f4f7d3c1c619588db15e4ec80",
  hostedFinalReceiptHash: "72e7232ae1f3abae8810976bebf2330ce5da13060a37fb0d8d16559e75618bc8",
  controllerAuthorityId: "379588dc6e7ed0e7445e2fe78788b3f7143a4947ad524c066191cdd336a002aa",
  catalogRows: 377,
  userTableCount: 94,
  replayableObjectCount: 247,
  derivedAutoIndexCount: 128,
  excludedInternalObjectCount: 2,
  catalogHash: "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
  objectSetHash: "3bece659138162dd079c341e0fcdf3ff17f161a499017faf049f007b58687969",
  replayableDdlRoot: "7c6971b4d0e39cf71527a095c66d694f5629e24ebb0a6f0c941b9fd95ba72d71",
  derivedAutoIndexSetHash: "3f9de132a92b64f8588135b3b4265f7926e31a3e0f5732e788cebd4dfba0d4fc",
  excludedInternalObjectSetHash: "5ca0e8298f10400f78f636929e13793003913248989571c689e94303928799f3",
  perTypeRoots: Object.freeze({
    table: "ec66a996a9e4d49b260eb1086b38aedb898e1c237f109bef43d962dc77d61e5f",
    index: "3c0ac40cf403c4ca2d2e0d79c2f8f967bb79278ceed0f66ea5b448c44a5ceb7c",
    trigger: "014224f960c148de5a40cdca9b5808932460df708c3a73b28a04701ff18eb396",
    view: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
  }),
  replayPasses: 2,
  generation11MaximumCandidateTables: 40,
  runtime: Object.freeze({
    node: "v24.19.0",
    sqlite: "3.53.3",
    sqliteSourceId: "2026-06-26 20:14:12 d4c0e51e4aeb96955b99185ab9cde75c339e2c29c3f3f12428d364a10d782c62",
    compileOptionsRoot: "016d81120806d6a894113dadfa48d294be1d5e6a2983bbdd630bc4aa5ac2fe8a",
    nodeExecutableSha256: "27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1",
    platform: "darwin",
    architecture: "arm64"
  }),
  expectedReplay: Object.freeze({
    replayCatalogRows: 376,
    replayCatalogHash: "1d1c7f401292c88b3ff814cb9e283788cd100a8f78713236430b10f2195ca847",
    replayOrderRoot: "a0cd79fa613e4af6e1ccd706d94a0cd861526e223a28562a04707cf51422e925",
    candidateCount: 28,
    candidateRoot: "09e6a26e0c2f3d6029e34a2fb42a8b3b550e45eab7d8e8da1aaefb69af62a09e",
    lexicalReferenceTokenCount: 51,
    foreignKeyConstraintCount: 51,
    foreignKeyColumnRowCount: 54,
    normalizedForeignKeyRoot: "bad8738dceb23141a6781540308bbd7d287ce8d7f5119913b7f3986e7e724622",
    foreignKeyStructureRoot: "09b272f6546ee78eb52b8bcb0988144003a2856861a17ac1c7a297262593168c",
    triggerProbeCount: 73,
    triggerValidationRoot: "0876fbc11e0e9dfeabbfb0306f7e6da764a483ea34ee3633a3022868fb37a66b",
    passRoot: "d6b5a667b202d64e19c93f663c83748e80883cc6a3984bd75e94843642fd50b0",
    generation11StatementArrayRoot: "69b92c28b8ef4f318cfd3d1eff15276197df695c08caa6e3e0dd61eb1c86d250",
    generation11StatementPlanRoot: "ea060788210674b616e441f790aa148e4596d9bfb485bc410aeace405f854183"
  })
} as const);

type CatalogRow = { type: string; name: string; tbl_name: string; sql: string | null };
type ReplayableObject = {
  type: "table" | "index" | "trigger" | "view";
  name: string;
  tblName: string;
  createSql: string;
  createSqlHash: string;
};
type PhysicalObject = {
  type: string;
  name: string;
  tblName: string;
  createSql: string | null;
  createSqlHash: string | null;
};
type RuntimeIdentity = {
  node: string;
  sqlite: string;
  sqliteSourceId: string;
  compileOptionsRoot: string;
  nodeExecutableSha256: string;
  platform: string;
  architecture: string;
};

export type StableFile = {
  path: string;
  bytes: Buffer;
  bytesSha256: string;
  mode: number;
  links: number;
  device: number;
  inode: number;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as Record<string, unknown>;
}

function exactArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
}

function hashedBodyMatches(value: Record<string, unknown>, hashKey: string): boolean {
  const stored = value[hashKey];
  if (typeof stored !== "string" || !SHA256.test(stored)) return false;
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== hashKey));
  return sha256(canonicalJson(body)) === stored;
}

export function readStableFile(path: string): StableFile {
  const requestedPath = lstatSync(path);
  if (requestedPath.isSymbolicLink()) throw new Error("qualification input path must not be a symlink");
  const requested = realpathSync(path);
  const beforePath = lstatSync(requested);
  if (!beforePath.isFile() || beforePath.isSymbolicLink() || beforePath.nlink !== 1) {
    throw new Error("qualification input must be one regular single-link file");
  }
  const descriptor = openSync(requested, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1 || before.dev !== beforePath.dev || before.ino !== beforePath.ino) {
      throw new Error("qualification input identity changed before read");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const afterPath = lstatSync(requested);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.nlink !== 1 ||
        afterPath.dev !== before.dev || afterPath.ino !== before.ino || afterPath.nlink !== 1) {
      throw new Error("qualification input identity changed during read");
    }
    return {
      path: requested,
      bytes,
      bytesSha256: sha256(bytes),
      mode: before.mode & 0o777,
      links: before.nlink,
      device: before.dev,
      inode: before.ino
    };
  } finally {
    closeSync(descriptor);
  }
}

function codePointSorted<T extends { type: string; name: string; tblName: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => codePointCompare(left.type, right.type) ||
    codePointCompare(left.name, right.name) || codePointCompare(left.tblName, right.tblName));
}

function validateCatalogRow(value: unknown): CatalogRow {
  const row = exactObject(value, "catalog row");
  if (typeof row.type !== "string" || typeof row.name !== "string" || typeof row.tbl_name !== "string" ||
      (typeof row.sql !== "string" && row.sql !== null)) throw new Error("catalog row shape is invalid");
  return { type: row.type, name: row.name, tbl_name: row.tbl_name, sql: row.sql as string | null };
}

function validatePhysicalObject(value: unknown, replayable: boolean): PhysicalObject {
  const row = exactObject(value, "physical object");
  if (typeof row.type !== "string" || typeof row.name !== "string" || typeof row.tblName !== "string" ||
      (typeof row.createSql !== "string" && row.createSql !== null) ||
      (typeof row.createSqlHash !== "string" && row.createSqlHash !== null)) {
    throw new Error("physical object shape is invalid");
  }
  if (!SAFE_IDENTIFIER.test(row.name) || !SAFE_IDENTIFIER.test(row.tblName)) {
    throw new Error("physical object identifier is invalid");
  }
  const createSql = row.createSql as string | null;
  const createSqlHash = row.createSqlHash as string | null;
  if (replayable && (createSql === null || createSqlHash === null)) throw new Error("replayable SQL is missing");
  if (createSqlHash !== null && sha256(createSql ?? "") !== createSqlHash) throw new Error("object SQL hash mismatch");
  return { type: row.type, name: row.name, tblName: row.tblName, createSql, createSqlHash };
}

function validateHostedEvidence(responseBytes: Uint8Array, finalReceiptBytes: Uint8Array): {
  response: Record<string, unknown>;
  catalog: CatalogRow[];
  objects: ReplayableObject[];
  autoIndexes: PhysicalObject[];
  internalObjects: PhysicalObject[];
} {
  const contract = OS01_DDL_OFFLINE_REPLAY_CONTRACT;
  if (sha256(responseBytes) !== contract.hostedResponseBytesSha256) throw new Error("hosted response byte hash mismatch");
  if (sha256(finalReceiptBytes) !== contract.hostedFinalReceiptBytesSha256) {
    throw new Error("hosted final receipt byte hash mismatch");
  }
  const response = exactObject(JSON.parse(Buffer.from(responseBytes).toString("utf8")), "hosted response");
  const finalReceipt = exactObject(JSON.parse(Buffer.from(finalReceiptBytes).toString("utf8")), "hosted final receipt");
  if (!hashedBodyMatches(response, "receiptHash") || response.receiptHash !== contract.hostedResponseReceiptHash) {
    throw new Error("hosted response receipt hash mismatch");
  }
  if (!hashedBodyMatches(finalReceipt, "finalReceiptHash") ||
      finalReceipt.finalReceiptHash !== contract.hostedFinalReceiptHash ||
      finalReceipt.controllerAuthorityId !== contract.controllerAuthorityId ||
      finalReceipt.status !== "accepted_bounded_read_only_ddl_catalog_census_after_control_plane_postcheck" ||
      finalReceipt.offlineDdlReplayEligible !== true) {
    throw new Error("hosted final receipt is not replay-eligible");
  }
  if (response.catalogRows !== contract.catalogRows || response.userTableCount !== contract.userTableCount ||
      response.replayableObjectCount !== contract.replayableObjectCount ||
      response.derivedAutoIndexCount !== contract.derivedAutoIndexCount ||
      response.excludedInternalObjectCount !== contract.excludedInternalObjectCount ||
      response.catalogHash !== contract.catalogHash || response.firstCatalogHash !== contract.catalogHash ||
      response.secondCatalogHash !== contract.catalogHash || response.batchCatalogPairMatch !== true ||
      response.objectSetHash !== contract.objectSetHash || response.replayableDdlRoot !== contract.replayableDdlRoot ||
      response.derivedAutoIndexSetHash !== contract.derivedAutoIndexSetHash ||
      response.excludedInternalObjectSetHash !== contract.excludedInternalObjectSetHash ||
      canonicalJson(response.perTypeRoots) !== canonicalJson(contract.perTypeRoots) ||
      response.databaseMutationAttempted !== false || response.providerSecretReads !== 0 ||
      response.providerDispatches !== 0 || response.quotaReservations !== 0 || response.productionReads !== 0 ||
      response.productionMutations !== 0 || response.captureActivations !== 0 ||
      response.foreignKeyEvidenceWithheld !== true || response.rowCountEvidenceWithheld !== true) {
    throw new Error("hosted response contract mismatch");
  }
  const catalog = exactArray(response.catalog, "catalog").map(validateCatalogRow);
  if (catalog.length !== contract.catalogRows || sha256(canonicalJson(catalog)) !== contract.catalogHash) {
    throw new Error("catalog identity mismatch");
  }
  const objects = exactArray(response.objects, "objects")
    .map((row) => validatePhysicalObject(row, true)) as ReplayableObject[];
  const autoIndexes = exactArray(response.derivedAutoIndexes, "derived autoindexes")
    .map((row) => validatePhysicalObject(row, false));
  const internalObjects = exactArray(response.excludedInternalObjects, "internal objects")
    .map((row) => validatePhysicalObject(row, false));
  if (objects.length !== contract.replayableObjectCount || autoIndexes.length !== contract.derivedAutoIndexCount ||
      internalObjects.length !== contract.excludedInternalObjectCount ||
      sha256(canonicalJson(codePointSorted(objects))) !== contract.replayableDdlRoot ||
      sha256(canonicalJson([...autoIndexes].sort((a, b) => codePointCompare(a.name, b.name) ||
        codePointCompare(a.tblName, b.tblName)))) !== contract.derivedAutoIndexSetHash ||
      sha256(canonicalJson(codePointSorted(internalObjects))) !== contract.excludedInternalObjectSetHash) {
    throw new Error("hosted object partition identity mismatch");
  }
  const physical = codePointSorted([...objects, ...autoIndexes]);
  if (sha256(canonicalJson(physical.map(({ type, name, tblName }) => ({ type, name, tblName })))) !==
      contract.objectSetHash) throw new Error("hosted object-set root mismatch");
  for (const type of ["table", "index", "trigger", "view"] as const) {
    if (sha256(canonicalJson(physical.filter((row) => row.type === type))) !== contract.perTypeRoots[type]) {
      throw new Error(`hosted ${type} root mismatch`);
    }
  }
  return { response, catalog, objects, autoIndexes, internalObjects };
}

export function tokenizeSql(sql: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  const length = sql.length;
  const skipDelimited = (close: string, doubled: boolean, label: string): void => {
    index += 1;
    while (index < length) {
      if (sql[index] === close) {
        if (doubled && sql[index + 1] === close) {
          index += 2;
          continue;
        }
        index += 1;
        return;
      }
      index += 1;
    }
    throw new Error(`unterminated ${label}`);
  };
  while (index < length) {
    const char = sql[index];
    const next = sql[index + 1];
    if (/\s/u.test(char)) index += 1;
    else if (char === "-" && next === "-") {
      index += 2;
      while (index < length && sql[index] !== "\n" && sql[index] !== "\r") index += 1;
    } else if (char === "/" && next === "*") {
      index += 2;
      const close = sql.indexOf("*/", index);
      if (close < 0) throw new Error("unterminated block comment");
      index = close + 2;
    } else if (char === "'") skipDelimited("'", true, "string literal");
    else if (char === "\"") skipDelimited("\"", true, "quoted identifier");
    else if (char === "`") skipDelimited("`", true, "quoted identifier");
    else if (char === "[") skipDelimited("]", false, "bracket identifier");
    else if (/[A-Za-z_]/u.test(char)) {
      const start = index;
      index += 1;
      while (index < length && /[A-Za-z0-9_$]/u.test(sql[index])) index += 1;
      tokens.push(sql.slice(start, index).toUpperCase());
    } else {
      tokens.push(char);
      index += 1;
    }
  }
  return tokens;
}

export function hasForeignKeyClause(sql: string): boolean {
  const tokens = tokenizeSql(sql);
  return tokens.some((token, index) => token === "REFERENCES" ||
    (token === "FOREIGN" && tokens[index + 1] === "KEY"));
}

function quoteIdentifier(value: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error("unsafe replay identifier");
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

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

const FOREIGN_KEY_ROW_KEYS = Object.freeze([
  "from", "id", "match", "on_delete", "on_update", "seq", "table", "to"
]);
const FOREIGN_KEY_ACTIONS = new Set(["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"]);

function normalizeForeignKeys(childTable: string, rows: ForeignKeyRow[]): Record<string, unknown>[] {
  const grouped = new Map<number, ForeignKeyRow[]>();
  for (const row of rows) {
    if (canonicalJson(Object.keys(row).sort(codePointCompare)) !== canonicalJson(FOREIGN_KEY_ROW_KEYS) ||
        !Number.isSafeInteger(row.id) || row.id < 0 || !Number.isSafeInteger(row.seq) || row.seq < 0 ||
        typeof row.table !== "string" || row.table.length === 0 ||
        typeof row.from !== "string" || (typeof row.to !== "string" && row.to !== null) ||
        !FOREIGN_KEY_ACTIONS.has(row.on_update) || !FOREIGN_KEY_ACTIONS.has(row.on_delete) || row.match !== "NONE") {
      throw new Error("foreign-key row shape is invalid");
    }
    const values = grouped.get(row.id) ?? [];
    values.push(row);
    grouped.set(row.id, values);
  }
  return [...grouped.values()].map((group) => {
    const ordered = [...group].sort((a, b) => a.seq - b.seq);
    if (ordered.some((row, index) => row.seq !== index) ||
        ordered.some((row) => row.table !== ordered[0].table || row.on_update !== ordered[0].on_update ||
          row.on_delete !== ordered[0].on_delete || row.match !== ordered[0].match)) {
      throw new Error("foreign-key constraint rows are inconsistent");
    }
    return {
      sourceTable: childTable,
      targetTable: ordered[0].table,
      columns: ordered.map((row) => ({
        ordinal: row.seq,
        fromColumn: row.from,
        toColumn: row.to
      })),
      onUpdate: ordered[0].on_update,
      onDelete: ordered[0].on_delete,
      match: ordered[0].match
    };
  }).sort((left, right) => codePointCompare(canonicalJson(left), canonicalJson(right)));
}

function enforceCandidateLimit(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0 ||
      count > OS01_DDL_OFFLINE_REPLAY_CONTRACT.generation11MaximumCandidateTables) {
    throw new Error("foreign-key candidate set exceeds the Generation 11 one-batch limit");
  }
}

function validateForeignKeyStructure(
  db: DatabaseSync,
  constraints: Record<string, unknown>[],
  tableNames: Set<string>
): Record<string, unknown>[] {
  const tableColumnCache = new Map<string, Array<Record<string, unknown>>>();
  const columnsFor = (table: string): Array<Record<string, unknown>> => {
    const cached = tableColumnCache.get(table);
    if (cached) return cached;
    const columns = db.prepare(`PRAGMA table_xinfo(${quoteIdentifier(table)})`).all() as Array<Record<string, unknown>>;
    tableColumnCache.set(table, columns);
    return columns;
  };
  const probes: Record<string, unknown>[] = [];
  const parentTables = new Set<string>();
  for (const constraint of constraints) {
    const sourceTable = String(constraint.sourceTable);
    const targetTable = String(constraint.targetTable);
    const columns = constraint.columns as Array<Record<string, unknown>>;
    if (!tableNames.has(sourceTable) || !tableNames.has(targetTable) || !Array.isArray(columns) || columns.length === 0) {
      throw new Error("foreign-key table binding is invalid");
    }
    const sourceColumns = new Set(columnsFor(sourceTable).map((row) => String(row.name)));
    const targetInfo = columnsFor(targetTable);
    const targetColumns = new Set(targetInfo.map((row) => String(row.name)));
    const from = columns.map((row) => String(row.fromColumn));
    const explicitTo = columns.map((row) => row.toColumn === null ? null : String(row.toColumn));
    if (from.some((column) => !sourceColumns.has(column)) || explicitTo.some((column) => column !== null && !targetColumns.has(column))) {
      throw new Error("foreign-key column binding is invalid");
    }
    const primaryKey = targetInfo.filter((row) => Number(row.pk) > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk)).map((row) => String(row.name));
    const resolvedTo = explicitTo.every((column) => column === null) ? primaryKey : explicitTo;
    if (resolvedTo.length !== from.length || resolvedTo.some((column) => column === null)) {
      throw new Error("foreign-key parent-key arity is invalid");
    }
    const indexRows = db.prepare(`PRAGMA index_list(${quoteIdentifier(targetTable)})`).all() as Array<Record<string, unknown>>;
    const uniqueKeys = indexRows.filter((row) => Number(row.unique) === 1 && Number(row.partial) === 0 &&
      typeof row.name === "string").map((row) => {
      const indexColumns = db.prepare(`PRAGMA index_xinfo(${quoteIdentifier(String(row.name))})`).all() as Array<Record<string, unknown>>;
      return indexColumns.filter((column) => Number(column.key) === 1).sort((left, right) => Number(left.seqno) - Number(right.seqno))
        .map((column) => column.name === null ? null : String(column.name));
    });
    const parentKey = resolvedTo as string[];
    const eligible = canonicalJson(primaryKey) === canonicalJson(parentKey) ||
      uniqueKeys.some((key) => canonicalJson(key) === canonicalJson(parentKey));
    if (!eligible) throw new Error("foreign-key parent key is not primary or unique");
    db.prepare(`EXPLAIN INSERT INTO ${quoteIdentifier(sourceTable)} DEFAULT VALUES`).all();
    parentTables.add(targetTable);
    probes.push({ sourceTable, targetTable, fromColumns: from, toColumns: parentKey, eligibleParentKey: true });
  }
  for (const parent of [...parentTables].sort(codePointCompare)) {
    db.prepare(`EXPLAIN DELETE FROM ${quoteIdentifier(parent)}`).all();
  }
  return probes.sort((left, right) => codePointCompare(canonicalJson(left), canonicalJson(right)));
}

function triggerEvent(createSql: string): "INSERT" | "UPDATE" | "DELETE" {
  const tokens = tokenizeSql(createSql);
  const onIndex = tokens.indexOf("ON");
  if (onIndex < 0) throw new Error("trigger event is not recognized");
  for (let index = 0; index < onIndex; index += 1) {
    if (tokens[index] === "BEFORE" || tokens[index] === "AFTER" ||
        (tokens[index] === "INSTEAD" && tokens[index + 1] === "OF")) {
      const eventIndex = tokens[index] === "INSTEAD" ? index + 2 : index + 1;
      const event = tokens[eventIndex];
      if (event === "INSERT" || event === "UPDATE" || event === "DELETE") return event;
    }
  }
  throw new Error("trigger event is not recognized");
}

function compileTriggerProbe(db: DatabaseSync, trigger: ReplayableObject): Record<string, unknown> {
  const event = triggerEvent(trigger.createSql);
  const table = quoteIdentifier(trigger.tblName);
  let statement: string;
  if (event === "INSERT") statement = `EXPLAIN INSERT INTO ${table} DEFAULT VALUES`;
  else if (event === "DELETE") statement = `EXPLAIN DELETE FROM ${table}`;
  else {
    const columns = db.prepare(`PRAGMA table_xinfo(${table})`).all() as Array<Record<string, unknown>>;
    const writable = columns.find((row) => Number(row.hidden ?? 0) === 0 && typeof row.name === "string");
    if (!writable || typeof writable.name !== "string") throw new Error("trigger target has no writable column");
    const column = quoteIdentifier(writable.name);
    statement = `EXPLAIN UPDATE ${table} SET ${column} = ${column}`;
  }
  db.prepare(statement).all();
  return { name: trigger.name, table: trigger.tblName, event, createSqlHash: trigger.createSqlHash };
}

function replayOnce(objects: ReplayableObject[], catalog: CatalogRow[], pass: number): Record<string, unknown> {
  const ordered = [...objects].sort((left, right) =>
    REPLAY_ORDER[left.type] - REPLAY_ORDER[right.type] || codePointCompare(left.name, right.name) ||
    codePointCompare(left.tblName, right.tblName));
  const replayTrace = ordered.map((row, ordinal) => ({
    ordinal, type: row.type, name: row.name, tblName: row.tblName, createSqlHash: row.createSqlHash
  }));
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    if (Number((db.prepare("PRAGMA foreign_keys").get() as Record<string, unknown>).foreign_keys) !== 1) {
      throw new Error("foreign-key enforcement did not enable");
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const object of ordered) db.exec(object.createSql);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const actualCatalog = (db.prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE type IN ('table','index','trigger','view')"
    ).all() as Array<Record<string, unknown>>).map(validateCatalogRow).sort((left, right) =>
      codePointCompare(left.type, right.type) || codePointCompare(left.name, right.name) ||
      codePointCompare(left.tbl_name, right.tbl_name));
    const expectedCatalog = catalog.filter((row) => row.name !== "_cf_KV").sort((left, right) =>
      codePointCompare(left.type, right.type) || codePointCompare(left.name, right.name) ||
      codePointCompare(left.tbl_name, right.tbl_name));
    if (canonicalJson(actualCatalog) !== canonicalJson(expectedCatalog)) {
      throw new Error("offline replay catalog differs from hosted catalog");
    }
    const integrityRows = db.prepare("PRAGMA integrity_check").all() as Array<Record<string, unknown>>;
    if (integrityRows.length !== 1 || integrityRows[0].integrity_check !== "ok") {
      throw new Error("offline replay integrity check failed");
    }
    if ((db.prepare("PRAGMA foreign_key_check").all() as unknown[]).length !== 0) {
      throw new Error("offline replay foreign-key check failed");
    }
    const tables = ordered.filter((row) => row.type === "table");
    const scannerCandidates = tables.filter((row) => hasForeignKeyClause(row.createSql)).map((row) => row.name)
      .sort(codePointCompare);
    const candidateIdentities = tables.filter((row) => hasForeignKeyClause(row.createSql)).map((row) => ({
      sourceTable: row.name,
      sourceCreateSqlHash: row.createSqlHash
    })).sort((left, right) => codePointCompare(left.sourceTable, right.sourceTable));
    const lexicalReferenceTokenCount = tables.reduce((total, row) =>
      total + tokenizeSql(row.createSql).filter((token) => token === "REFERENCES").length, 0);
    const pragmaCandidates: string[] = [];
    const normalizedConstraints: Record<string, unknown>[] = [];
    let foreignKeyColumnRows = 0;
    for (const tableObject of tables) {
      const rows = db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableObject.name)})`).all() as ForeignKeyRow[];
      if (rows.length > 0) {
        pragmaCandidates.push(tableObject.name);
        foreignKeyColumnRows += rows.length;
        normalizedConstraints.push(...normalizeForeignKeys(tableObject.name, rows));
      }
    }
    pragmaCandidates.sort(codePointCompare);
    normalizedConstraints.sort((left, right) => codePointCompare(canonicalJson(left), canonicalJson(right)));
    if (canonicalJson(scannerCandidates) !== canonicalJson(pragmaCandidates)) {
      throw new Error("SQL scanner and replayed foreign-key candidates disagree");
    }
    enforceCandidateLimit(scannerCandidates.length);
    const foreignKeyStructureProbes = validateForeignKeyStructure(
      db,
      normalizedConstraints,
      new Set(tables.map((row) => row.name))
    );
    const triggerProbes = ordered.filter((row) => row.type === "trigger")
      .map((trigger) => compileTriggerProbe(db, trigger));
    if (ordered.some((row) => row.type === "view")) throw new Error("Generation 10 unexpectedly contains a view");
    const autoIndexes = actualCatalog.filter((row) => row.type === "index" && row.sql === null).map((row) => ({
      type: "index", name: row.name, tblName: row.tbl_name, createSql: null, createSqlHash: sha256("")
    })).sort((left, right) => codePointCompare(left.name, right.name) || codePointCompare(left.tblName, right.tblName));
    const sqliteSequence = actualCatalog.find((row) => row.type === "table" && row.name === "sqlite_sequence");
    if (!sqliteSequence || sqliteSequence.sql !== "CREATE TABLE sqlite_sequence(name,seq)") {
      throw new Error("sqlite_sequence was not regenerated exactly");
    }
    if (actualCatalog.some((row) => row.name === "_cf_KV")) throw new Error("platform-only _cf_KV was replayed");
    const passEvidence = {
      replayTrace, actualCatalog, autoIndexes, candidateIdentities, normalizedConstraints,
      foreignKeyStructureProbes, triggerProbes,
      integrityCheck: "ok", foreignKeyCheckViolationCount: 0
    };
    return {
      pass,
      replayOrderRoot: sha256(canonicalJson(replayTrace)),
      replayCatalogRows: actualCatalog.length,
      replayCatalogHash: sha256(canonicalJson(actualCatalog)),
      derivedAutoIndexCount: autoIndexes.length,
      derivedAutoIndexSetHash: sha256(canonicalJson(autoIndexes)),
      integrityCheck: "ok",
      foreignKeyCheckViolationCount: 0,
      scannerCandidates,
      candidateIdentities,
      candidateRoot: sha256(canonicalJson(candidateIdentities)),
      lexicalReferenceTokenCount,
      foreignKeyConstraintCount: normalizedConstraints.length,
      foreignKeyColumnRowCount: foreignKeyColumnRows,
      normalizedForeignKeyRoot: sha256(canonicalJson(normalizedConstraints)),
      foreignKeyStructureProbeCount: foreignKeyStructureProbes.length,
      foreignKeyStructureRoot: sha256(canonicalJson(foreignKeyStructureProbes)),
      triggerProbeCount: triggerProbes.length,
      triggerValidationRoot: sha256(canonicalJson(triggerProbes)),
      viewCount: 0,
      platformOnlyInternalObjects: ["_cf_KV"],
      regeneratedInternalObjects: ["sqlite_sequence"],
      passRoot: sha256(canonicalJson(passEvidence))
    };
  } finally {
    db.close();
  }
}

export function currentRuntimeIdentity(): RuntimeIdentity {
  const db = new DatabaseSync(":memory:");
  try {
    const sqliteSourceId = String((db.prepare("SELECT sqlite_source_id() AS sourceId").get() as Record<string, unknown>).sourceId);
    const compileOptions = (db.prepare("PRAGMA compile_options").all() as Array<Record<string, unknown>>)
      .map((row) => String(row.compile_options)).sort(codePointCompare);
    return {
      node: process.version,
      sqlite: String(process.versions.sqlite),
      sqliteSourceId,
      compileOptionsRoot: sha256(canonicalJson(compileOptions)),
      nodeExecutableSha256: sha256(readFileSync(process.execPath)),
      platform: process.platform,
      architecture: process.arch
    };
  } finally {
    db.close();
  }
}

function assertRuntime(runtime: RuntimeIdentity): void {
  if (canonicalJson(runtime) !== canonicalJson(OS01_DDL_OFFLINE_REPLAY_CONTRACT.runtime)) {
    throw new Error("offline replay runtime identity mismatch");
  }
}

export function qualifyOs01StagingDdlOfflineReplay(input: {
  hostedResponseBytes: Uint8Array;
  hostedFinalReceiptBytes: Uint8Array;
  runnerSourceSha256: string;
  testSourceSha256: string;
  recordedAt: string;
}): Record<string, unknown> {
  if (!SHA256.test(input.runnerSourceSha256) || !SHA256.test(input.testSourceSha256)) {
    throw new Error("offline replay source identity is invalid");
  }
  if (!Number.isFinite(Date.parse(input.recordedAt))) throw new Error("offline replay time is invalid");
  const runtime = currentRuntimeIdentity();
  assertRuntime(runtime);
  const evidence = validateHostedEvidence(input.hostedResponseBytes, input.hostedFinalReceiptBytes);
  const passes = [1, 2].map((pass) => replayOnce(evidence.objects, evidence.catalog, pass));
  const comparablePasses = passes.map((pass) => Object.fromEntries(Object.entries(pass).filter(([key]) => key !== "pass")));
  if (canonicalJson(comparablePasses[0]) !== canonicalJson(comparablePasses[1])) {
    throw new Error("offline replay passes disagree");
  }
  const first = passes[0];
  const candidateTables = first.scannerCandidates as string[];
  const expected = OS01_DDL_OFFLINE_REPLAY_CONTRACT.expectedReplay;
  const frozenReplay = {
    replayCatalogRows: first.replayCatalogRows,
    replayCatalogHash: first.replayCatalogHash,
    replayOrderRoot: first.replayOrderRoot,
    candidateCount: candidateTables.length,
    candidateRoot: first.candidateRoot,
    lexicalReferenceTokenCount: first.lexicalReferenceTokenCount,
    foreignKeyConstraintCount: first.foreignKeyConstraintCount,
    foreignKeyColumnRowCount: first.foreignKeyColumnRowCount,
    normalizedForeignKeyRoot: first.normalizedForeignKeyRoot,
    foreignKeyStructureRoot: first.foreignKeyStructureRoot,
    triggerProbeCount: first.triggerProbeCount,
    triggerValidationRoot: first.triggerValidationRoot,
    passRoot: first.passRoot
  };
  const generation11Statements = [
    OS01_GENERATION11_CATALOG_SQL,
    ...candidateTables.map((table) => `PRAGMA foreign_key_list(${quoteIdentifier(table)})`),
    OS01_GENERATION11_CATALOG_SQL
  ];
  const generation11Plan = generation11Statements.map((sql, ordinal) => ({
    ordinal,
    kind: ordinal === 0 || ordinal === generation11Statements.length - 1 ? "catalog" : "foreign_key_list",
    sourceTable: ordinal === 0 || ordinal === generation11Statements.length - 1 ? null : candidateTables[ordinal - 1],
    sqlSha256: sha256(sql)
  }));
  const statementArrayRoot = sha256(canonicalJson(generation11Statements));
  const statementPlanRoot = sha256(canonicalJson(generation11Plan));
  if (canonicalJson(frozenReplay) !== canonicalJson(Object.fromEntries(
    Object.entries(expected).filter(([key]) => !key.startsWith("generation11"))
  )) || statementArrayRoot !== expected.generation11StatementArrayRoot ||
      statementPlanRoot !== expected.generation11StatementPlanRoot) {
    throw new Error("offline replay differs from the frozen acceptance identity");
  }
  const body = {
    version: "engine-os.os01-staging-ddl-offline-replay-receipt.v1",
    status: "accepted_bounded_two_pass_offline_ddl_replay_and_fk_candidate_freeze",
    contractVersion: OS01_DDL_OFFLINE_REPLAY_CONTRACT.version,
    source: {
      hostedResponseBytesSha256: OS01_DDL_OFFLINE_REPLAY_CONTRACT.hostedResponseBytesSha256,
      hostedResponseReceiptHash: OS01_DDL_OFFLINE_REPLAY_CONTRACT.hostedResponseReceiptHash,
      hostedFinalReceiptBytesSha256: OS01_DDL_OFFLINE_REPLAY_CONTRACT.hostedFinalReceiptBytesSha256,
      hostedFinalReceiptHash: OS01_DDL_OFFLINE_REPLAY_CONTRACT.hostedFinalReceiptHash,
      controllerAuthorityId: OS01_DDL_OFFLINE_REPLAY_CONTRACT.controllerAuthorityId,
      runnerSourceSha256: input.runnerSourceSha256,
      testSourceSha256: input.testSourceSha256
    },
    runtime,
    passes,
    crossPassEqual: true,
    candidateTables,
    candidateIdentities: first.candidateIdentities,
    candidateCount: candidateTables.length,
    candidateRoot: first.candidateRoot,
    normalizedForeignKeyRoot: first.normalizedForeignKeyRoot,
    foreignKeyConstraintCount: first.foreignKeyConstraintCount,
    foreignKeyColumnRowCount: first.foreignKeyColumnRowCount,
    generation11: {
      status: "eligible_for_preregistered_single_batch_candidate",
      maximumCandidateTables: OS01_DDL_OFFLINE_REPLAY_CONTRACT.generation11MaximumCandidateTables,
      candidateCount: candidateTables.length,
      plannedD1StatementCount: candidateTables.length + 2,
      catalogStatements: 2,
      directForeignKeyListStatements: candidateTables.length,
      statementArrayRoot,
      statementPlanRoot
    },
    boundaries: {
      exactDdlReplayAccepted: true,
      foreignKeyCandidateFreezeAccepted: true,
      hostedForeignKeyEvidenceAccepted: false,
      rowCountEvidenceAccepted: false,
      rowContentPreservationAccepted: false,
      productionSemanticParityAccepted: false,
      os01Accepted: false,
      cleanupAuthorized: false,
      migrationAuthorized: false,
      productionAuthorized: false,
      providerSecretRead: false,
      providerPathInvoked: false,
      quotaPathInvoked: false,
      captureActivated: false
    },
    recordedAt: input.recordedAt
  } as const;
  return { ...body, receiptHash: sha256(canonicalJson(body)) };
}

export const os01DdlOfflineReplayTestOnly = Object.freeze({
  sha256, validateHostedEvidence, replayOnce, normalizeForeignKeys, triggerEvent, enforceCandidateLimit, assertRuntime
});
