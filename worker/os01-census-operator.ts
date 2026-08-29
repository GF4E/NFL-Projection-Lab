import {
  OS01_CENSUS_SOURCE_ANCHOR,
  OS01_CENSUS_SOURCE_ANCHOR_READY
} from "./os01-census-source-anchor";

const CONTRACT_VERSION = "os01-production-census.2026.1";
const ROUTE = "/_ops/engine-os/os01-census-v1";
const MAX_REQUEST_BYTES = 4 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_IDENTIFIER_BYTES = 255;
const MAX_PAGE_ROWS = 128;
// Keep query result rows below D1's documented 2 MB row/value boundary.
const MAX_CANONICAL_PAGE_BYTES = 1_800_000;
const MAX_CANONICAL_ROW_BYTES = 1_800_000;
const MAX_OPERATOR_LIFETIME_MS = 2 * 60 * 60 * 1000;
const CONTENT_TABLE = "plays";
const INTERNAL_OBJECTS = new Set([
  "_cf_KV",
  "d1_migrations",
  "sqlite_sequence",
  "sqlite_stat1",
  "sqlite_stat4"
]);

type JsonScalar = boolean | number | string | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
type ObjectType = "index" | "table" | "trigger" | "view";

export interface Os01CensusControlBindings {
  authSha256?: string;
  buildAttestation?: string;
  expiresAt?: string;
}

export interface Os01CensusRuntimeIdentity {
  sourceAnchor: string;
  ready: boolean;
}

export type Os01CensusDatabaseResolver = () => D1Database;

type CatalogRow = {
  type: ObjectType;
  name: string;
  tbl_name: string;
  sql: string | null;
};

type ScalarRow = Record<string, boolean | number | string | null>;

type CensusRequest =
  | { operation: "begin"; passNonce: string }
  | { operation: "schema_object"; continuation: string; type: ObjectType; name: string }
  | { operation: "table_start"; continuation: string; table: string }
  | {
      operation: "table_page";
      continuation: string;
      table: string;
      columnsHash: string;
      offset: number;
      limit?: number;
    }
  | { operation: "table_finish"; continuation: string; table: string; columnsHash: string }
  | { operation: "foundation"; continuation: string };

type CursorState = {
  contractVersion: string;
  passId: string;
  passNonce: string;
  bookmark: string;
  sequence: number;
  expiresAt: string;
};

type QueryStats = {
  queries: number;
  rowsRead: number;
  rowsWritten: number;
  changes: number;
  changedDb: boolean;
};

class CensusError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

function emptyStats(): QueryStats {
  return { queries: 0, rowsRead: 0, rowsWritten: 0, changes: 0, changedDb: false };
}

function stable(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)])) as { [key: string]: JsonValue };
  }
  if (typeof value === "bigint") return value.toString();
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return value as JsonScalar;
  throw new CensusError("unsupported_json_value", 500);
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function bytes(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value);
}

function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const input = typeof value === "string" ? bytes(value) : value;
  return hex(await crypto.subtle.digest("SHA-256", input));
}

function encodeBase64Url(value: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const item of value) binary += String.fromCharCode(item);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new CensusError("invalid_continuation", 400);
  const padded = `${value.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new CensusError("invalid_continuation", 400);
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function cursorKey(token: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    bytes(`${CONTRACT_VERSION}\u0000cursor\u0000${token}`)
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function payloadMacKey(token: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    bytes(`${CONTRACT_VERSION}\u0000payload-mac\u0000${token}`)
  );
  return crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function payloadMac(value: unknown, token: string): Promise<string> {
  return hex(await crypto.subtle.sign(
    "HMAC",
    await payloadMacKey(token),
    bytes(stableJson(value))
  ));
}

async function contentPageMac(value: unknown, token: string): Promise<string> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    bytes(`${CONTRACT_VERSION}\u0000content-page-mac\u0000${token}`)
  );
  const key = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", key, bytes(stableJson(value))));
}

async function encryptCursor(state: CursorState, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: bytes(CONTRACT_VERSION) },
    await cursorKey(token),
    bytes(stableJson(state))
  ));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return encodeBase64Url(combined);
}

async function decryptCursor(value: string, token: string): Promise<CursorState> {
  const combined = decodeBase64Url(value);
  if (combined.length < 29) throw new CensusError("invalid_continuation", 400);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: bytes(CONTRACT_VERSION) },
      await cursorKey(token),
      ciphertext
    );
  } catch {
    throw new CensusError("invalid_continuation", 400);
  }
  let state: unknown;
  try {
    state = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new CensusError("invalid_continuation", 400);
  }
  if (
    !state || typeof state !== "object" ||
    (state as CursorState).contractVersion !== CONTRACT_VERSION ||
    typeof (state as CursorState).passId !== "string" ||
    typeof (state as CursorState).passNonce !== "string" ||
    typeof (state as CursorState).bookmark !== "string" ||
    !Number.isSafeInteger((state as CursorState).sequence) ||
    typeof (state as CursorState).expiresAt !== "string"
  ) throw new CensusError("invalid_continuation", 400);
  if (Date.parse((state as CursorState).expiresAt) <= Date.now()) {
    throw new CensusError("continuation_expired", 410);
  }
  return state as CursorState;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Fa-f0-9]{64})$/u.exec(authorization);
  if (!match) throw new CensusError("not_found", 404);
  return match[1]!;
}

async function authenticate(
  request: Request,
  control: Os01CensusControlBindings,
  runtimeIdentity: Os01CensusRuntimeIdentity
): Promise<{ token: string; buildAttestation: string; expiresAt: string }> {
  const expected = control.authSha256?.toLowerCase();
  const buildAttestation = control.buildAttestation?.toLowerCase();
  const expiresAt = control.expiresAt;
  if (
    !expected || !/^[a-f0-9]{64}$/u.test(expected) ||
    !buildAttestation || !/^[a-f0-9]{64}$/u.test(buildAttestation) ||
    !runtimeIdentity.ready || !/^[a-f0-9]{64}$/u.test(runtimeIdentity.sourceAnchor) ||
    /^0{64}$/u.test(runtimeIdentity.sourceAnchor) ||
    !expiresAt
  ) {
    throw new CensusError("not_found", 404);
  }
  const expiry = Date.parse(expiresAt);
  const now = Date.now();
  if (!Number.isFinite(expiry) || expiry <= now || expiry - now > MAX_OPERATOR_LIFETIME_MS) {
    throw new CensusError("not_found", 404);
  }
  const token = bearerToken(request);
  const actual = await sha256Hex(token);
  if (!constantTimeEqual(actual, expected)) throw new CensusError("not_found", 404);
  if (!constantTimeEqual(buildAttestation, runtimeIdentity.sourceAnchor)) {
    throw new CensusError("not_found", 404);
  }
  return { token, buildAttestation: runtimeIdentity.sourceAnchor, expiresAt: new Date(expiry).toISOString() };
}

function validateIdentifier(identifier: string): void {
  if (!identifier || bytes(identifier).byteLength > MAX_IDENTIFIER_BYTES || identifier.includes("\u0000")) {
    throw new CensusError("invalid_identifier", 400);
  }
}

function quotedIdentifier(identifier: string): string {
  validateIdentifier(identifier);
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function normalizeOs01SqlTokens(sql: string | null): string[] {
  if (!sql) return [];
  const tokens: string[] = [];
  let index = 0;
  while (index < sql.length) {
    const character = sql[index]!;
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === "-" && sql[index + 1] === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && sql[index + 1] === "*") {
      index += 2;
      while (index + 1 < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (character === "'") {
      let literal = "'";
      index += 1;
      while (index < sql.length) {
        literal += sql[index]!;
        if (sql[index] === "'") {
          if (sql[index + 1] === "'") {
            literal += "'";
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      tokens.push(`string:${literal}`);
      continue;
    }
    if (character === '"' || character === "`" || character === "[") {
      const closer = character === "[" ? "]" : character;
      let identifier = "";
      index += 1;
      while (index < sql.length) {
        if (sql[index] === closer) {
          if (closer !== "]" && sql[index + 1] === closer) {
            identifier += closer;
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        identifier += sql[index]!;
        index += 1;
      }
      tokens.push(`atom:${identifier.toLowerCase()}`);
      continue;
    }
    const word = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/u)?.[0];
    if (word) {
      tokens.push(`atom:${word.toLowerCase()}`);
      index += word.length;
      continue;
    }
    const number = sql.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u)?.[0];
    if (number) {
      tokens.push(`number:${number.toLowerCase()}`);
      index += number.length;
      continue;
    }
    const operator = sql.slice(index, index + 2);
    if (["<=", ">=", "<>", "!=", "==", "||", "->", "=>"].includes(operator)) {
      tokens.push(`operator:${operator}`);
      index += 2;
      continue;
    }
    tokens.push(`symbol:${character}`);
    index += 1;
  }
  return tokens;
}

class ReadOnlySession {
  readonly stats = emptyStats();

  constructor(readonly session: D1DatabaseSession) {}

  async all<T extends Record<string, unknown>>(sql: string, bindings: readonly unknown[] = []): Promise<T[]> {
    const normalized = sql.trim().replace(/;$/u, "").trimEnd();
    if (!normalized.startsWith("SELECT ") || normalized.includes(";")) {
      throw new CensusError("non_read_query_rejected", 500);
    }
    const statement = bindings.length
      ? this.session.prepare(normalized).bind(...bindings)
      : this.session.prepare(normalized);
    const result = await statement.all<T>();
    this.stats.queries += 1;
    this.stats.rowsRead += Number(result.meta.rows_read ?? 0);
    this.stats.rowsWritten += Number(result.meta.rows_written ?? 0);
    this.stats.changes += Number(result.meta.changes ?? 0);
    this.stats.changedDb ||= result.meta.changed_db === true;
    if (this.stats.rowsWritten !== 0 || this.stats.changes !== 0 || this.stats.changedDb) {
      throw new CensusError("read_only_violation", 500);
    }
    return result.results;
  }

  async one<T extends Record<string, unknown>>(sql: string, bindings: readonly unknown[] = []): Promise<T> {
    const result = await this.all<T>(sql, bindings);
    if (result.length !== 1) throw new CensusError("unexpected_row_count", 409);
    return result[0]!;
  }
}

async function catalogRows(reader: ReadOnlySession): Promise<CatalogRow[]> {
  const result = await reader.all<CatalogRow>(`SELECT type, name, tbl_name, sql
FROM sqlite_schema
WHERE type IN ('table', 'index', 'trigger', 'view')
ORDER BY type COLLATE BINARY, name COLLATE BINARY`);
  for (const row of result) {
    if (!["table", "index", "trigger", "view"].includes(row.type)) {
      throw new CensusError("unsupported_schema_object", 409);
    }
    validateIdentifier(row.name);
    validateIdentifier(row.tbl_name);
  }
  return result;
}

async function exactCatalogObject(
  reader: ReadOnlySession,
  type: ObjectType,
  name: string
): Promise<CatalogRow> {
  validateIdentifier(name);
  const rows = await reader.all<CatalogRow>(`SELECT type, name, tbl_name, sql
FROM sqlite_schema
WHERE type = ? AND name = ?
ORDER BY type COLLATE BINARY, name COLLATE BINARY`, [type, name]);
  if (rows.length !== 1) throw new CensusError("schema_object_not_found", 409);
  return rows[0]!;
}

function sortTextRows<T extends Record<string, unknown>>(rows: T[], keys: readonly string[]): T[] {
  return rows.sort((left, right) => {
    for (const key of keys) {
      const comparison = String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
      if (comparison !== 0) return comparison;
    }
    return 0;
  });
}

function sortNumericRows<T extends Record<string, unknown>>(rows: T[], keys: readonly string[]): T[] {
  return rows.sort((left, right) => {
    for (const key of keys) {
      const comparison = Number(left[key] ?? 0) - Number(right[key] ?? 0);
      if (comparison !== 0) return comparison;
    }
    return 0;
  });
}

async function schemaSemantics(reader: ReadOnlySession, row: CatalogRow): Promise<unknown> {
  if (row.type === "table") {
    const tableList = await reader.all<ScalarRow>(
      "SELECT schema, name, type, ncol, wr, strict FROM pragma_table_list WHERE name = ?",
      [row.name]
    );
    const columns = sortNumericRows(
      await reader.all<ScalarRow>("SELECT * FROM pragma_table_xinfo(?)", [row.name]),
      ["cid"]
    ).map((column) => ({
      ...column,
      type: typeof column.type === "string" ? column.type.toLowerCase() : column.type,
      dflt_value: normalizeOs01SqlTokens(column.dflt_value as string | null)
    }));
    const foreignKeys = sortNumericRows(
      await reader.all<ScalarRow>("SELECT * FROM pragma_foreign_key_list(?)", [row.name]),
      ["id", "seq"]
    );
    const indexes = sortTextRows(
      await reader.all<ScalarRow>("SELECT * FROM pragma_index_list(?)", [row.name]),
      ["name"]
    );
    const detailedIndexes = [];
    for (const index of indexes) {
      detailedIndexes.push({
        ...index,
        columns: sortNumericRows(
          await reader.all<ScalarRow>("SELECT * FROM pragma_index_xinfo(?)", [String(index.name)]),
          ["seqno"]
        )
      });
    }
    return stable({
      createTokens: normalizeOs01SqlTokens(row.sql),
      tableList,
      columns,
      foreignKeys,
      indexes: detailedIndexes
    });
  }
  if (row.type === "index") {
    return stable({
      createTokens: normalizeOs01SqlTokens(row.sql),
      columns: sortNumericRows(
        await reader.all<ScalarRow>("SELECT * FROM pragma_index_xinfo(?)", [row.name]),
        ["seqno"]
      )
    });
  }
  return stable({ createTokens: normalizeOs01SqlTokens(row.sql) });
}

async function tableColumns(reader: ReadOnlySession, table: string): Promise<ScalarRow[]> {
  await exactCatalogObject(reader, "table", table);
  const columns = sortNumericRows(
    await reader.all<ScalarRow>("SELECT * FROM pragma_table_xinfo(?)", [table]),
    ["cid"]
  );
  // hidden=1 is a virtual-table implementation column and is unsupported.
  // Generated columns (hidden=2 or 3) are deterministic values and are hashed.
  if (!columns.length || columns.some((column) => Number(column.hidden ?? 0) === 1)) {
    throw new CensusError("unsupported_table_shape", 409);
  }
  return columns;
}

function canonicalExpression(tableAlias: string, column: string): string {
  const reference = `${tableAlias}.${quotedIdentifier(column)}`;
  return `CASE typeof(${reference}) ` +
    `WHEN 'null' THEN 'n:' ` +
    `WHEN 'integer' THEN 'i:' || printf('%lld', ${reference}) ` +
    `WHEN 'real' THEN 'r:' || printf('%!.17g', ${reference}) ` +
    `WHEN 'text' THEN 't:' || hex(CAST(${reference} AS BLOB)) ` +
    `WHEN 'blob' THEN 'b:' || hex(${reference}) ` +
    `ELSE 'u:' || typeof(${reference}) END`;
}

async function operationPayload(
  request: CensusRequest,
  reader: ReadOnlySession,
  token: string
): Promise<Record<string, unknown>> {
  if (request.operation === "begin") {
    const schemaVersion = await reader.one<{ schema_version: number }>(
      "SELECT schema_version FROM pragma_schema_version"
    );
    const catalog = await catalogRows(reader);
    const entries = await Promise.all(catalog.map(async (row) => ({
      type: row.type,
      name: row.name,
      tableName: row.tbl_name,
      internal: INTERNAL_OBJECTS.has(row.name) || row.name.startsWith("sqlite_"),
      sqlIsNull: row.sql === null,
      sqlHash: await sha256Hex(row.sql ?? "")
    })));
    return {
      operation: request.operation,
      schemaVersion: Number(schemaVersion.schema_version),
      catalog: entries,
      catalogHash: await sha256Hex(stableJson(entries))
    };
  }
  if (request.operation === "schema_object") {
    const row = await exactCatalogObject(reader, request.type, request.name);
    const semantics = await schemaSemantics(reader, row);
    return {
      operation: request.operation,
      type: row.type,
      name: row.name,
      tableName: row.tbl_name,
      semantics,
      semanticHash: await sha256Hex(stableJson(semantics))
    };
  }
  if (
    (request.operation === "table_start" || request.operation === "table_page" ||
      request.operation === "table_finish") && request.table !== CONTENT_TABLE
  ) {
    throw new CensusError("content_table_not_authorized", 403);
  }
  if (request.operation === "table_start" || request.operation === "table_finish") {
    const columns = await tableColumns(reader, request.table);
    const columnsHash = await sha256Hex(stableJson(columns));
    if (request.operation === "table_finish" && request.columnsHash !== columnsHash) {
      throw new CensusError("table_schema_changed", 409);
    }
    const count = await reader.one<{ row_count: number }>(
      `SELECT COUNT(*) AS row_count FROM ${quotedIdentifier(request.table)}`
    );
    const schemaVersion = await reader.one<{ schema_version: number }>(
      "SELECT schema_version FROM pragma_schema_version"
    );
    return {
      operation: request.operation,
      table: request.table,
      rowCount: Number(count.row_count),
      columns,
      columnsHash,
      schemaVersion: Number(schemaVersion.schema_version)
    };
  }
  if (request.operation === "table_page") {
    if (!Number.isSafeInteger(request.offset) || request.offset < 0) {
      throw new CensusError("invalid_offset", 400);
    }
    const limit = request.limit ?? MAX_PAGE_ROWS;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_ROWS) {
      throw new CensusError("invalid_limit", 400);
    }
    const columns = await tableColumns(reader, request.table);
    const columnsHash = await sha256Hex(stableJson(columns));
    if (request.columnsHash !== columnsHash) throw new CensusError("table_schema_changed", 409);
    const expressions = columns.map((column, index) =>
      `${canonicalExpression("source", String(column.name))} AS ${quotedIdentifier(`c${index}`)}`
    );
    const order = columns.map((column) => `${canonicalExpression("source", String(column.name))} COLLATE BINARY`);
    const rows = await reader.all<Record<string, string>>(
      `SELECT ${expressions.join(", ")} FROM ${quotedIdentifier(request.table)} AS source ` +
      `ORDER BY ${order.join(", ")} LIMIT ? OFFSET ?`,
      [limit, request.offset]
    );
    const canonicalRows: string[] = [];
    let canonicalBytes = 0;
    for (const row of rows) {
      const values = columns.map((_, index) => row[`c${index}`]!);
      const rowJson = stableJson(values);
      const rowBytes = bytes(rowJson).byteLength;
      if (rowBytes > MAX_CANONICAL_ROW_BYTES) throw new CensusError("canonical_row_too_large", 413);
      canonicalBytes += rowBytes;
      if (canonicalBytes > MAX_CANONICAL_PAGE_BYTES) throw new CensusError("canonical_page_too_large", 413);
      canonicalRows.push(rowJson);
    }
    const pageMac = await contentPageMac({
      table: request.table,
      columnsHash,
      offset: request.offset,
      rows: canonicalRows
    }, token);
    return {
      operation: request.operation,
      table: request.table,
      offset: request.offset,
      limit,
      rowCount: rows.length,
      done: rows.length < limit,
      columnsHash,
      canonicalBytes,
      pageMac
    };
  }
  const receipts = await reader.all<{
    version: string;
    migration_hash: string;
    applied_at: string;
  }>("SELECT version, migration_hash, applied_at FROM engine_schema_versions ORDER BY version COLLATE BINARY");
  const quota = await reader.all<{
    provider: string;
    used: number;
    remaining: number;
    last_cost: number;
    updated_at: string;
  }>("SELECT provider, used, remaining, last_cost, updated_at FROM odds_quota_state ORDER BY provider COLLATE BINARY");
  const outstanding = await reader.one<{ row_count: number }>(`SELECT COUNT(*) AS row_count
FROM odds_quota_reservations
WHERE state IN ('reserved', 'dispatched', 'charge_unknown')`);
  const reservationEvents = await reader.one<{ row_count: number }>(
    "SELECT COUNT(*) AS row_count FROM odds_quota_reservation_events"
  );
  const foreignKeyViolations = await reader.all<ScalarRow>("SELECT * FROM pragma_foreign_key_check");
  const quickCheck = await reader.all<{ quick_check: string }>("SELECT quick_check FROM pragma_quick_check");
  return {
    operation: request.operation,
    receipts,
    receiptsHash: await sha256Hex(stableJson(receipts)),
    quota,
    quotaHash: await sha256Hex(stableJson(quota)),
    outstandingReservations: Number(outstanding.row_count),
    reservationEvents: Number(reservationEvents.row_count),
    foreignKeyViolationCount: foreignKeyViolations.length,
    foreignKeyViolationHash: await sha256Hex(stableJson(foreignKeyViolations)),
    quickCheck
  };
}

function parseRequest(value: unknown): CensusRequest {
  if (!value || typeof value !== "object") throw new CensusError("invalid_request", 400);
  const record = value as Record<string, unknown>;
  const operation = record.operation;
  const allowed = ["begin", "schema_object", "table_start", "table_page", "table_finish", "foundation"];
  if (typeof operation !== "string" || !allowed.includes(operation)) {
    throw new CensusError("invalid_request", 400);
  }
  const validOperation = operation as CensusRequest["operation"];
  const requireExactKeys = (keys: readonly string[]): void => {
    const actual = Object.keys(record).sort();
    const expected = [...keys].sort();
    if (stableJson(actual) !== stableJson(expected)) throw new CensusError("invalid_request", 400);
  };
  if (validOperation === "begin") {
    requireExactKeys(["operation", "passNonce"]);
    if (typeof record.passNonce !== "string" || !/^[a-f0-9]{32,64}$/u.test(record.passNonce)) {
      throw new CensusError("invalid_request", 400);
    }
    return { operation: validOperation, passNonce: record.passNonce };
  }
  if (typeof record.continuation !== "string") throw new CensusError("invalid_request", 400);
  if (validOperation === "foundation") {
    requireExactKeys(["operation", "continuation"]);
    return { operation: validOperation, continuation: record.continuation };
  }
  if (validOperation === "schema_object") {
    requireExactKeys(["operation", "continuation", "type", "name"]);
    if (!["table", "index", "trigger", "view"].includes(String(record.type)) || typeof record.name !== "string") {
      throw new CensusError("invalid_request", 400);
    }
    return {
      operation: validOperation,
      continuation: record.continuation,
      type: record.type as ObjectType,
      name: record.name
    };
  }
  if (typeof record.table !== "string") throw new CensusError("invalid_request", 400);
  if (validOperation === "table_start") {
    requireExactKeys(["operation", "continuation", "table"]);
    return { operation: validOperation, continuation: record.continuation, table: record.table };
  }
  if (typeof record.columnsHash !== "string" || !/^[a-f0-9]{64}$/u.test(record.columnsHash)) {
    throw new CensusError("invalid_request", 400);
  }
  if (validOperation === "table_finish") {
    requireExactKeys(["operation", "continuation", "table", "columnsHash"]);
    return {
      operation: validOperation,
      continuation: record.continuation,
      table: record.table,
      columnsHash: record.columnsHash
    };
  }
  requireExactKeys(record.limit === undefined
    ? ["operation", "continuation", "table", "columnsHash", "offset"]
    : ["operation", "continuation", "table", "columnsHash", "offset", "limit"]);
  if (typeof record.offset !== "number" || !Number.isSafeInteger(record.offset) || record.offset < 0) {
    throw new CensusError("invalid_offset", 400);
  }
  if (
    record.limit !== undefined &&
    (typeof record.limit !== "number" || !Number.isSafeInteger(record.limit) ||
      record.limit < 1 || record.limit > MAX_PAGE_ROWS)
  ) {
    throw new CensusError("invalid_limit", 400);
  }
  return {
    operation: validOperation,
    continuation: record.continuation,
    table: record.table,
    columnsHash: record.columnsHash,
    offset: record.offset,
    limit: record.limit
  };
}

function responseHeaders(): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
  };
}

function errorResponse(error: unknown): Response {
  const status = error instanceof CensusError ? error.status : 500;
  const code = error instanceof CensusError ? error.code : "census_failed";
  return new Response(JSON.stringify({ error: code }), { status, headers: responseHeaders() });
}

export function isOs01CensusRoute(request: Request): boolean {
  return new URL(request.url).pathname === ROUTE;
}

export async function handleOs01CensusRequest(
  request: Request,
  control: Os01CensusControlBindings,
  database: Os01CensusDatabaseResolver,
  runtimeIdentity: Os01CensusRuntimeIdentity = {
    sourceAnchor: OS01_CENSUS_SOURCE_ANCHOR,
    ready: OS01_CENSUS_SOURCE_ANCHOR_READY
  }
): Promise<Response> {
  try {
    if (!isOs01CensusRoute(request)) throw new CensusError("not_found", 404);
    if (request.method !== "POST") throw new CensusError("not_found", 404);
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
      throw new CensusError("request_too_large", 413);
    }
    const authentication = await authenticate(request, control, runtimeIdentity);
    const text = await request.text();
    if (bytes(text).byteLength > MAX_REQUEST_BYTES) throw new CensusError("request_too_large", 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new CensusError("invalid_request", 400);
    }
    const input = parseRequest(parsed);
    let cursor: CursorState | null = null;
    if (input.operation !== "begin") cursor = await decryptCursor(input.continuation, authentication.token);
    const d1 = database();
    const session = d1.withSession(cursor?.bookmark ?? "first-primary");
    const reader = new ReadOnlySession(session);
    const payload = await operationPayload(input, reader, authentication.token);
    const bookmark = session.getBookmark();
    if (!bookmark) throw new CensusError("bookmark_unavailable", 503);
    let state: CursorState;
    if (cursor) {
      state = { ...cursor, bookmark, sequence: cursor.sequence + 1 };
    } else {
      if (input.operation !== "begin") throw new CensusError("invalid_continuation", 400);
      state = {
        contractVersion: CONTRACT_VERSION,
        passId: crypto.randomUUID(),
        passNonce: input.passNonce,
        bookmark,
        sequence: 0,
        expiresAt: authentication.expiresAt
      };
    }
    const continuation = await encryptCursor(state, authentication.token);
    const observedAt = new Date().toISOString();
    const continuationHash = await sha256Hex(continuation);
    const protectedPayload = {
      contractVersion: CONTRACT_VERSION,
      buildAttestation: authentication.buildAttestation,
      passId: state.passId,
      passNonceHash: await sha256Hex(state.passNonce),
      sequence: state.sequence,
      requestHash: await sha256Hex(stableJson(input)),
      payload,
      queryStats: reader.stats,
      observedAt,
      continuationHash
    };
    const response = {
      ...protectedPayload,
      continuation,
      payloadHash: await sha256Hex(stableJson(protectedPayload)),
      payloadMac: await payloadMac(protectedPayload, authentication.token)
    };
    const body = JSON.stringify(response);
    if (bytes(body).byteLength > MAX_RESPONSE_BYTES) {
      throw new CensusError("response_too_large", 413);
    }
    return new Response(body, { status: 200, headers: responseHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

export const os01CensusContract = Object.freeze({
  version: CONTRACT_VERSION,
  route: ROUTE,
  limits: Object.freeze({
    requestBytes: MAX_REQUEST_BYTES,
    responseBytes: MAX_RESPONSE_BYTES,
    identifierBytes: MAX_IDENTIFIER_BYTES,
    pageRows: MAX_PAGE_ROWS,
    canonicalPageBytes: MAX_CANONICAL_PAGE_BYTES,
    canonicalRowBytes: MAX_CANONICAL_ROW_BYTES
  }),
  operations: Object.freeze([
    "begin",
    "schema_object",
    "table_start",
    "table_page",
    "table_finish",
    "foundation"
  ]),
  contentTables: Object.freeze([CONTENT_TABLE]),
  contentEvidence: "ephemeral-token-keyed-hmac-sha256"
});
