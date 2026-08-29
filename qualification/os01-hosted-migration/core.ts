import { splitHostedSqlStatements } from "./sql-statements";

const ROUTE = "/__engine-os/os01-hosted-migration/v1";
const MAX_REQUEST_BYTES = 512 * 1024;
const GUARD_TABLE = "__os01_hosted_migration_guard_v1";
const INTERNAL_OBJECTS = new Set([
  "_cf_KV",
  "d1_migrations",
  "sqlite_sequence",
  "sqlite_stat1",
  "sqlite_stat4"
]);
const INTERNAL_SQL = ["_cf_KV", "d1_migrations", "sqlite_sequence", "sqlite_stat1", "sqlite_stat4"];
const ACCEPTED_SOURCE_COMMIT = "d24db5632410894d4f82c12e7f1d0c4c256a208d";
const ACCEPTED_CONTRACT_SHA256 = "9b5da72706f18670c3ecb67763d18f109cf228b2a56c83f1ea52ff8582882e51";
const PREDECESSOR_AUTHORITY_SHA256 = "948dbfd5657c169c01d15d6a6fea08524a321d71852cc3148355c0d4210fcc0d";
const SUCCESSOR_AUTHORITY_SHA256 = "87db50ad848bdd3ee11a6bc8895b2647b5cda7ad43bc9f49f9954276ead2d04e";
const JOURNAL_SHA256 = "c2f4c41e680cc92e3eb21cb02869e45dae4862e7296e0a72880e5f1026fbe77f";
const TERMINAL_MANIFEST_SHA256 = "4ca77b123faeeb7f5287994548f969bed35e2be9c6efcf4d88c509fb3d89b47d";
const MIGRATION_BUNDLE_HASH = "b72fae202662ae4cf689c4656bc762944264e9a59e637582b9fa0b4e0a31e122";
const LEGACY_MIGRATION_BUNDLE_HASH = "ba75205577b97fc97db5b9b4eea9f8351a077390994bf6b5e2a4642a062f9a79";
const EXPECTED_PATHS = Object.freeze([
  "drizzle/0000_keen_red_shift.sql",
  "drizzle/0001_parched_hedge_knight.sql",
  "drizzle/0002_watery_patriot.sql",
  "drizzle/0003_hesitant_bloodstorm.sql",
  "drizzle/0004_player_prop_decision_board.sql",
  "drizzle/0005_structured_contract_settlement.sql",
  "drizzle/0006_execution_tracking.sql",
  "drizzle/0008_play_forecast_provenance.sql",
  "drizzle/0009_market_sentiment.sql",
  "drizzle/0010_confidence_engine.sql",
  "drizzle/0011_model_gate_evidence.sql",
  "drizzle/0012_source_snapshot_timing.sql",
  "drizzle/0013_engine_os_urgent.sql",
  "drizzle/0014_odds_quota_reservations.sql",
  "drizzle/0015_engine_os_origin_identity.sql",
  "drizzle/0016_engine_os_interim_scheduler.sql",
  "drizzle/0017_engine_os_source_capture.sql",
  "drizzle/0018_engine_os_forecast_ledger.sql",
  "drizzle/0019_engine_os_schema_closure.sql",
  "drizzle/0020_engine_os_plays_reconciliation.sql"
]);

type Scalar = string | number | null;
type ObjectType = "index" | "table" | "trigger" | "view";
type HostedAction =
  | "blank_prestate_component_probe"
  | "blank_replay"
  | "blank_prefix_probe"
  | "blank_component_probe"
  | "legacy_prepare_export"
  | "legacy_forward"
  | "restore_import"
  | "failure_probe"
  | "verify_blank_terminal"
  | "verify_legacy_terminal";

type BlankComponentProbePhase =
  | "sentinel_only"
  | "reserved_create_then_sentinel"
  | "plain_create_then_sentinel"
  | "reserved_simple_then_sentinel"
  | "reserved_schema_then_sentinel"
  | "reserved_catalog_then_sentinel"
  | "reserved_full_guard_then_sentinel";

type CatalogIdentity = {
  type: ObjectType;
  name: string;
  tableName: string;
  createTokens: string[];
  createSql: string | null;
};

type CatalogEvidence = {
  schemaVersion: number;
  counts: Record<ObjectType, number>;
  identities: CatalogIdentity[];
  fingerprint: string;
};

export type HostedRowProjection = {
  columns: string[];
  rows: Array<Record<string, Scalar>>;
  rowHashes: string[];
  contentHash: string;
};

export type HostedRowManifest = Record<string, HostedRowProjection>;

export type Os01LogicalBackup = {
  version: "engine-os.os01-hosted-logical-backup.v1";
  sourceQualificationId: string;
  migrationRange: "0000_through_0016";
  migrationBundleHash: string;
  catalogFingerprint: string;
  catalogCounts: Record<ObjectType, number>;
  rows: HostedRowManifest;
  rowsHash: string;
  backupHash: string;
};

export type HostedStateEvidence = {
  catalog: CatalogEvidence;
  rows: HostedRowManifest;
  rowsHash: string;
  foreignKeyViolations: Array<Record<string, unknown>>;
  quickCheck: Array<Record<string, unknown>>;
};

type MigrationStatement = {
  sql: string;
  bindings?: readonly Scalar[];
  migrationPath?: string;
  globalStatementIndex?: number;
};

type MigrationReceipt = {
  version: string;
  migrationHash: string;
};

type QualificationRequest = {
  version: "engine-os.os01-hosted-migration-request.v1";
  action: HostedAction;
  qualificationId: string;
  prefixStatementCount?: number;
  componentProbePhase?: BlankComponentProbePhase;
  backup?: Os01LogicalBackup;
};

type ExpectedState = {
  id: "blank" | "legacy" | "terminal";
  catalogFingerprint: string;
  counts: Record<ObjectType, number>;
};

export type HostedQualificationDiagnostic =
  | "d1_prepare_multiple_statements"
  | "d1_prepare_rejected";

export type Os01HostedMigrationSource = Readonly<{
  order: number;
  path: string;
  source: string;
  byteSha256: string;
  receipt: MigrationReceipt | null;
}>;

export type Os01HostedMigrationAuthority = Readonly<{
  version: "engine-os.os01-hosted-migration-authority.v1";
  sourceCommit: string;
  acceptedContract: {
    path: string;
    byteSha256: string;
  };
  predecessorAuthority: {
    path: string;
    byteSha256: string;
  };
  successorAuthority: {
    path: string;
    byteSha256: string;
  };
  journal: {
    path: string;
    byteSha256: string;
  };
  terminalManifest: {
    path: string;
    byteSha256: string;
    schemaFingerprint: string;
    counts: Record<ObjectType, number>;
  };
  migrations: readonly Os01HostedMigrationSource[];
  migrationBundleHash: string;
  legacyMigrationBundleHash: string;
  supportedStates: Readonly<Record<ExpectedState["id"], ExpectedState & {
    identities: readonly CatalogIdentity[];
  }>>;
  failureProbe: {
    migrationPath: "drizzle/0019_engine_os_schema_closure.sql";
    globalStatementIndex: number;
  };
  claimBoundary: string;
}>;

class HarnessError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly diagnostic?: HostedQualificationDiagnostic,
    readonly diagnosticDetail?: string
  ) {
    super(code);
  }
}

const LEGACY_PLAY_COLUMNS = [
  "id", "season", "week", "play_type", "title", "legs", "book", "american_odds",
  "stake_cents", "model_edge_pp", "estimated_ev_percent", "confidence", "stats_case",
  "football_case", "status", "result", "profit_cents", "closing_clv_cents", "created_by",
  "created_at", "updated_at", "game_id", "market", "primary_reason", "picked_by",
  "contract_json", "execution_status", "cash_placement_confirmed", "forecast_json"
] as const;

const LEGACY_PLAY_ROW: Record<(typeof LEGACY_PLAY_COLUMNS)[number], Scalar> = {
  id: "os01-hosted-legacy-preserved",
  season: 2026,
  week: 4,
  play_type: "single",
  title: "OS-01 hosted preservation fixture",
  legs: "SEA -2.5",
  book: "FanDuel",
  american_odds: -105,
  stake_cents: 2500,
  model_edge_pp: 0.04,
  estimated_ev_percent: 3.2,
  confidence: "play",
  stats_case: "deterministic fixture stats",
  football_case: "deterministic fixture context",
  status: "settled",
  result: "win",
  profit_cents: 2381,
  closing_clv_cents: 4.5,
  created_by: "os01-qualification",
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-21T00:00:00.000Z",
  game_id: "os01-hosted-game-1",
  market: "spread",
  primary_reason: "model_edge",
  picked_by: "fixture",
  contract_json: "[{\"gameId\":\"os01-hosted-game-1\",\"market\":\"spread\",\"sourceQuoteId\":\"fixture-quote\"}]",
  execution_status: "paper",
  cash_placement_confirmed: 0,
  forecast_json: "{\"configHash\":\"fixture-config\",\"consensusSnapshotId\":\"fixture-snapshot\",\"dataHash\":\"fixture-data\",\"legs\":[]}"
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

export function stableHostedJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

export async function hostedSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Match the frozen schema-authority tokenizer without importing Node-only code. */
export function normalizeHostedSqlTokens(sql: string | null): string[] {
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
    if (character === "\"" || character === "`" || character === "[") {
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

function quote(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(identifier)) throw new HarnessError("invalid_identifier", 500);
  return `"${identifier}"`;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function all<T extends Record<string, unknown>>(
  db: D1Database,
  sql: string,
  bindings: readonly Scalar[] = []
): Promise<T[]> {
  const prepared = bindings.length ? db.prepare(sql).bind(...bindings) : db.prepare(sql);
  const result = await prepared.all<T>();
  return result.results;
}

function countIdentities(identities: readonly CatalogIdentity[]): Record<ObjectType, number> {
  const counts = { table: 0, index: 0, trigger: 0, view: 0 };
  for (const identity of identities) counts[identity.type] += 1;
  return counts;
}

async function captureCatalog(db: D1Database): Promise<CatalogEvidence> {
  const rows = await all<{ type: ObjectType; name: string; tbl_name: string; sql: string | null }>(db,
    `SELECT type, name, tbl_name, sql FROM sqlite_schema
      WHERE type IN ('table', 'index', 'trigger', 'view')
      ORDER BY type COLLATE BINARY, name COLLATE BINARY`);
  const identities = rows
    .filter((row) => !row.name.startsWith("sqlite_") && !INTERNAL_OBJECTS.has(row.name))
    .map((row) => ({
      type: row.type,
      name: row.name,
      tableName: row.tbl_name,
      createTokens: normalizeHostedSqlTokens(row.sql),
      createSql: row.sql
    }));
  const schemaVersionRow = await all<{ schema_version: number }>(db,
    "SELECT schema_version FROM pragma_schema_version");
  if (schemaVersionRow.length !== 1) throw new HarnessError("schema_version_unavailable", 500);
  return {
    schemaVersion: Number(schemaVersionRow[0]!.schema_version),
    counts: countIdentities(identities),
    identities,
    fingerprint: await hostedSha256(stableHostedJson(identities.map((identity) => ({
      type: identity.type,
      name: identity.name,
      tableName: identity.tableName,
      createTokens: identity.createTokens
    }))))
  };
}

async function captureRows(db: D1Database, catalog: CatalogEvidence): Promise<{
  rows: HostedRowManifest;
  rowsHash: string;
}> {
  const rows: HostedRowManifest = {};
  for (const table of catalog.identities.filter((identity) => identity.type === "table")
    .map((identity) => identity.name).sort((left, right) => left.localeCompare(right))) {
    const columns = (await all<{ cid: number; name: string; hidden: number }>(db,
      "SELECT cid, name, hidden FROM pragma_table_xinfo(?) ORDER BY cid", [table]))
      .filter((column) => column.cid >= 0 && Number(column.hidden) === 0)
      .map((column) => String(column.name));
    if (columns.length === 0) throw new HarnessError("unsupported_table_shape", 500);
    const selected = columns.map(quote).join(", ");
    const tableRows = await all<Record<string, Scalar>>(db, `SELECT ${selected} FROM ${quote(table)}`);
    const orderedRows = tableRows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])))
      .sort((left, right) => stableHostedJson(left).localeCompare(stableHostedJson(right)));
    const rowHashes = await Promise.all(orderedRows.map((row) => hostedSha256(stableHostedJson(row))));
    rows[table] = {
      columns,
      rows: orderedRows,
      rowHashes: [...rowHashes].sort(),
      contentHash: await hostedSha256(stableHostedJson({ columns, rowHashes: [...rowHashes].sort() }))
    };
  }
  return { rows, rowsHash: await hostedSha256(stableHostedJson(rows)) };
}

export async function captureHostedState(db: D1Database): Promise<HostedStateEvidence> {
  const catalog = await captureCatalog(db);
  const { rows, rowsHash } = await captureRows(db, catalog);
  return {
    catalog,
    rows,
    rowsHash,
    foreignKeyViolations: await all(db, "SELECT * FROM pragma_foreign_key_check"),
    quickCheck: await all(db, "SELECT quick_check FROM pragma_quick_check")
  };
}

function splitStatements(migration: Os01HostedMigrationSource): MigrationStatement[] {
  return migration.source
    .split("--> statement-breakpoint")
    .flatMap((entry) => splitHostedSqlStatements(entry))
    .map((sql) => ({ sql, migrationPath: migration.path }));
}

function migrationReceipt(migration: Os01HostedMigrationSource): MigrationReceipt | null {
  const matches = [...migration.source.matchAll(
    /INSERT\s+INTO\s+[`"]engine_schema_versions[`"]\s*\([\s\S]*?\)\s*VALUES\s*\(\s*'([^']+)'\s*,\s*'sha256:([a-f0-9]{64})'/giu
  )];
  if (migration.order < 12) {
    if (matches.length !== 0) throw new HarnessError("unexpected_migration_receipt", 500);
    return null;
  }
  if (matches.length !== 1) throw new HarnessError("migration_receipt_not_exact", 500);
  return { version: matches[0]![1]!, migrationHash: `sha256:${matches[0]![2]!}` };
}

async function verifiedMigrations(
  authority: Os01HostedMigrationAuthority
): Promise<Os01HostedMigrationSource[]> {
  if (authority.version !== "engine-os.os01-hosted-migration-authority.v1" ||
      authority.sourceCommit !== ACCEPTED_SOURCE_COMMIT ||
      authority.acceptedContract.byteSha256 !== ACCEPTED_CONTRACT_SHA256 ||
      authority.predecessorAuthority.byteSha256 !== PREDECESSOR_AUTHORITY_SHA256 ||
      authority.successorAuthority.byteSha256 !== SUCCESSOR_AUTHORITY_SHA256 ||
      authority.journal.byteSha256 !== JOURNAL_SHA256 ||
      authority.terminalManifest.byteSha256 !== TERMINAL_MANIFEST_SHA256 ||
      authority.migrationBundleHash !== MIGRATION_BUNDLE_HASH ||
      authority.legacyMigrationBundleHash !== LEGACY_MIGRATION_BUNDLE_HASH ||
      authority.migrations.length !== 20) {
    throw new HarnessError("migration_count_mismatch", 500);
  }
  const result: Os01HostedMigrationSource[] = [];
  for (const [index, migration] of authority.migrations.entries()) {
    const actualHash = await hostedSha256(migration.source);
    if (migration.order !== index || EXPECTED_PATHS[index] !== migration.path ||
        migration.byteSha256 !== actualHash ||
        stableHostedJson(migration.receipt) !== stableHostedJson(migrationReceipt(migration))) {
      throw new HarnessError("migration_byte_mismatch", 500);
    }
    result.push(migration);
  }
  const bundleHash = await hostedSha256(stableHostedJson(result.map(({ order, path, byteSha256 }) => ({
    order,
    path,
    byteSha256
  }))));
  if (bundleHash !== MIGRATION_BUNDLE_HASH ||
      await hostedSha256(stableHostedJson(result.slice(0, 16).map(({ order, path, byteSha256 }) => ({
        order,
        path,
        byteSha256
      })))) !== LEGACY_MIGRATION_BUNDLE_HASH) {
    throw new HarnessError("migration_bundle_mismatch", 500);
  }
  return result;
}

function assertHealthy(state: HostedStateEvidence): void {
  if (state.foreignKeyViolations.length !== 0 || state.quickCheck.length !== 1 ||
      state.quickCheck[0]?.quick_check !== "ok") {
    throw new HarnessError("database_integrity_failure", 409);
  }
}

function assertState(state: HostedStateEvidence, expected: ExpectedState): void {
  assertHealthy(state);
  if (state.catalog.fingerprint !== expected.catalogFingerprint ||
      stableHostedJson(state.catalog.counts) !== stableHostedJson(expected.counts)) {
    throw new HarnessError("unsupported_database_state", 409);
  }
}

function classifyState(
  state: HostedStateEvidence,
  authority: Os01HostedMigrationAuthority
): ExpectedState["id"] | "unknown" {
  for (const expected of Object.values(authority.supportedStates)) {
    if (state.catalog.fingerprint === expected.catalogFingerprint &&
        stableHostedJson(state.catalog.counts) === stableHostedJson(expected.counts)) return expected.id;
  }
  return "unknown";
}

function guardCatalogPredicate(
  catalog: Pick<CatalogEvidence, "identities">,
  excludeGuard: boolean
): { sql: string; bindings: Scalar[] } {
  const expected = catalog.identities.map((identity) => [
    identity.type,
    identity.name,
    identity.tableName,
    identity.createSql
  ]);
  const internalLiterals = INTERNAL_SQL.map(literal).join(", ");
  const guardClause = excludeGuard ? "AND name <> ?" : "";
  const base = `type IN ('table', 'index', 'trigger', 'view')
    AND name NOT LIKE 'sqlite_%'
    AND name NOT IN (${internalLiterals}) ${guardClause}`;
  return {
    sql: `COALESCE((
      SELECT json_group_array(json(identity)) FROM (
        SELECT json_array(type, name, tbl_name, sql) AS identity
        FROM sqlite_schema WHERE ${base}
        ORDER BY type COLLATE BINARY, name COLLATE BINARY, tbl_name COLLATE BINARY
      )
    ), json('[]')) = json(?)`,
    bindings: [
      ...(excludeGuard ? [GUARD_TABLE] : []),
      stableHostedJson(expected)
    ]
  };
}

function guardRowsPredicate(rows: HostedRowManifest): { sql: string; bindings: Scalar[] } {
  const predicates: string[] = [];
  const bindings: Scalar[] = [];
  const entries = Object.entries(rows).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const countQueries = entries.map(([table]) =>
    `SELECT ${literal(table)} AS table_name, (SELECT COUNT(*) FROM ${quote(table)}) AS row_count`);
  const countProjection = entries.map(([table, projection]) => [table, projection.rows.length]);
  if (countQueries.length) {
    predicates.push(`COALESCE((
      SELECT json_group_array(json_array(table_name, row_count)) FROM (
        ${countQueries.join(" UNION ALL ")}
        ORDER BY table_name COLLATE BINARY
      )
    ), json('[]')) = json(?)`);
    bindings.push(stableHostedJson(countProjection));
  }
  for (const [table, projection] of entries) {
    for (const row of projection.rows) {
      const comparisons = projection.columns.map((column) => `${quote(column)} IS ?`).join(" AND ");
      predicates.push(`EXISTS (SELECT 1 FROM ${quote(table)} WHERE ${comparisons})`);
      for (const column of projection.columns) bindings.push(row[column] ?? null);
    }
  }
  return { sql: predicates.length ? predicates.join(" AND ") : "1 = 1", bindings };
}

function guardInsert(
  state: HostedStateEvidence,
  options: { checkSchemaVersion: boolean; excludeGuard: boolean }
): MigrationStatement {
  const catalog = guardCatalogPredicate(state.catalog, options.excludeGuard);
  const rows = guardRowsPredicate(state.rows);
  const schemaSql = options.checkSchemaVersion
    ? "(SELECT schema_version FROM pragma_schema_version) = ? AND"
    : "";
  const schemaBindings = options.checkSchemaVersion
    ? [state.catalog.schemaVersion + (options.excludeGuard ? 1 : 0)]
    : [];
  return {
    sql: `INSERT INTO ${quote(GUARD_TABLE)} (exact)
      SELECT CASE WHEN ${schemaSql} ${catalog.sql} AND ${rows.sql} THEN 1 ELSE 0 END`,
    bindings: [...schemaBindings, ...catalog.bindings, ...rows.bindings]
  };
}

function tableIdentitiesFromTerminalManifest(authority: Os01HostedMigrationAuthority): CatalogIdentity[] {
  return [...authority.supportedStates.terminal.identities];
}

async function expectedTerminalRows(
  authority: Os01HostedMigrationAuthority,
  migrations: Os01HostedMigrationSource[],
  legacyRow: Record<string, Scalar> | null
): Promise<HostedRowManifest> {
  const tableNames = tableIdentitiesFromTerminalManifest(authority)
    .filter((identity) => identity.type === "table")
    .map((identity) => identity.name)
    .sort((left, right) => left.localeCompare(right));
  const rows = Object.fromEntries(tableNames.map((table) => [table, {
    columns: [] as string[],
    rows: [] as Array<Record<string, Scalar>>,
    rowHashes: [] as string[],
    contentHash: ""
  }])) as HostedRowManifest;
  const receipts = migrations.map((migration) => migration.receipt).filter((receipt): receipt is MigrationReceipt =>
    receipt !== null);
  rows.engine_schema_versions = {
    columns: ["version", "migration_hash", "applied_at"],
    rows: receipts.map((receipt) => ({
      version: receipt.version,
      migration_hash: receipt.migrationHash,
      // The terminal in-batch guard checks version and hash separately because
      // D1 supplies this timestamp while executing the reviewed migration.
      applied_at: null
    })),
    rowHashes: [],
    contentHash: ""
  };
  if (legacyRow) {
    rows.plays = {
      columns: [...LEGACY_PLAY_COLUMNS],
      rows: [legacyRow],
      rowHashes: [],
      contentHash: ""
    };
  }
  return rows;
}

function terminalGuardRowsPredicate(rows: HostedRowManifest): { sql: string; bindings: Scalar[] } {
  const predicates: string[] = [];
  const bindings: Scalar[] = [];
  const entries = Object.entries(rows).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const countQueries = entries.map(([table]) =>
    `SELECT ${literal(table)} AS table_name, (SELECT COUNT(*) FROM ${quote(table)}) AS row_count`);
  const countProjection = entries.map(([table, projection]) => [table, projection.rows.length]);
  predicates.push(`COALESCE((
    SELECT json_group_array(json_array(table_name, row_count)) FROM (
      ${countQueries.join(" UNION ALL ")}
      ORDER BY table_name COLLATE BINARY
    )
  ), json('[]')) = json(?)`);
  bindings.push(stableHostedJson(countProjection));
  for (const [table, projection] of entries) {
    if (table === "engine_schema_versions") {
      for (const row of projection.rows) {
        predicates.push(`EXISTS (SELECT 1 FROM engine_schema_versions
          WHERE version IS ? AND migration_hash IS ? AND julianday(applied_at) IS NOT NULL)`);
        bindings.push(row.version ?? null, row.migration_hash ?? null);
      }
      continue;
    }
    for (const row of projection.rows) {
      const comparisons = projection.columns.map((column) => `${quote(column)} IS ?`).join(" AND ");
      predicates.push(`EXISTS (SELECT 1 FROM ${quote(table)} WHERE ${comparisons})`);
      for (const column of projection.columns) bindings.push(row[column] ?? null);
    }
  }
  return { sql: predicates.join(" AND "), bindings };
}

function terminalGuardInsert(
  authority: Os01HostedMigrationAuthority,
  migrations: Os01HostedMigrationSource[],
  legacyRow: Record<string, Scalar> | null
): Promise<MigrationStatement> {
  return expectedTerminalRows(authority, migrations, legacyRow).then((rows) => {
    const terminalCatalog: CatalogEvidence = {
      schemaVersion: 0,
      counts: authority.terminalManifest.counts,
      identities: tableIdentitiesFromTerminalManifest(authority),
      fingerprint: authority.terminalManifest.schemaFingerprint
    };
    const catalog = guardCatalogPredicate(terminalCatalog, true);
    const rowPredicate = terminalGuardRowsPredicate(rows);
    return {
      sql: `INSERT INTO ${quote(GUARD_TABLE)} (exact)
        SELECT CASE WHEN ${catalog.sql} AND ${rowPredicate.sql}
          AND NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check)
          AND (SELECT quick_check FROM pragma_quick_check LIMIT 1) = 'ok'
          THEN 1 ELSE 0 END`,
      bindings: [...catalog.bindings, ...rowPredicate.bindings]
    };
  });
}

function createGuard(): MigrationStatement {
  return {
    sql: `CREATE TABLE ${quote(GUARD_TABLE)} (
      exact integer NOT NULL CHECK (exact = 1)
    )`
  };
}

function dropGuard(): MigrationStatement {
  return { sql: `DROP TABLE ${quote(GUARD_TABLE)}` };
}

function d1FailureText(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

function isD1MultipleStatementFailure(error: unknown): boolean {
  const text = d1FailureText(error);
  return text.includes("only execute one statement at a time") ||
    text.includes("multiple statements") ||
    text.includes("more than one statement");
}

export function classifyD1PreparationFailure(error: unknown): HostedQualificationDiagnostic {
  return isD1MultipleStatementFailure(error)
    ? "d1_prepare_multiple_statements"
    : "d1_prepare_rejected";
}

async function executeAtomicBatch(db: D1Database, statements: readonly MigrationStatement[]): Promise<void> {
  let prepared: D1PreparedStatement[];
  try {
    prepared = statements.map((statement) => {
      const query = db.prepare(statement.sql);
      return statement.bindings?.length ? query.bind(...statement.bindings) : query;
    });
  } catch (error) {
    throw new HarnessError(
      "qualification_failed",
      500,
      classifyD1PreparationFailure(error)
    );
  }
  try {
    await db.batch(prepared);
  } catch (error) {
    if (isD1MultipleStatementFailure(error)) {
      throw new HarnessError("qualification_failed", 500, "d1_prepare_multiple_statements");
    }
    if (d1FailureText(error).includes("__os01_intentional_missing_table_v1")) {
      throw error;
    }
    // Diagnostic-only successor for the isolated owner-only harness. The v4
    // response deliberately collapsed batch failures to a generic code, which
    // made the second atomic rollback impossible to reduce. This log contains
    // only the D1-generated SQL error for the blank fixture; the staging worker
    // has no provider bindings or credential inputs.
    globalThis.console.error(stableHostedJson({
      event: "os01_hosted_blank_batch_rejected",
      message: d1FailureText(error).slice(0, 2_048)
    }));
    throw new HarnessError(
      "qualification_failed",
      500,
      "d1_prepare_rejected",
      d1FailureText(error).slice(0, 2_048)
    );
  }
}

async function migrationStatementsForRange(
  migrations: Os01HostedMigrationSource[],
  from: number,
  toExclusive: number,
  injectFailureAfterGlobalIndex?: number
): Promise<MigrationStatement[]> {
  const statements: MigrationStatement[] = [];
  let globalStatementIndex = 0;
  for (const migration of migrations.slice(from, toExclusive)) {
    for (const statement of splitStatements(migration)) {
      statements.push({ ...statement, globalStatementIndex });
      if (globalStatementIndex === injectFailureAfterGlobalIndex) {
        statements.push({ sql: "SELECT value FROM __os01_intentional_missing_table_v1" });
      }
      globalStatementIndex += 1;
    }
  }
  if (injectFailureAfterGlobalIndex !== undefined &&
      !statements.some((statement) => statement.sql.includes("__os01_intentional_missing_table_v1"))) {
    throw new HarnessError("failure_injection_point_invalid", 500);
  }
  return statements;
}

function legacyCatalogFromContract(authority: Os01HostedMigrationAuthority): CatalogEvidence {
  const identities = [...authority.supportedStates.legacy.identities];
  return {
    schemaVersion: 0,
    counts: countIdentities(identities),
    identities,
    fingerprint: authority.supportedStates.legacy.catalogFingerprint
  };
}

async function expectedLegacyRows(
  authority: Os01HostedMigrationAuthority,
  migrations: Os01HostedMigrationSource[],
  playRow: Record<string, Scalar>
): Promise<HostedRowManifest> {
  const rows = Object.fromEntries(legacyCatalogFromContract(authority).identities
    .filter((identity) => identity.type === "table")
    .map((identity) => [identity.name, {
      columns: [] as string[],
      rows: [] as Array<Record<string, Scalar>>,
      rowHashes: [] as string[],
      contentHash: ""
    }])) as HostedRowManifest;
  rows.engine_schema_versions = {
    columns: ["version", "migration_hash", "applied_at"],
    rows: migrations.slice(0, 16).map((migration) => migration.receipt)
      .filter((receipt): receipt is MigrationReceipt => receipt !== null)
      .map((receipt) => ({ version: receipt.version, migration_hash: receipt.migrationHash, applied_at: null })),
    rowHashes: [],
    contentHash: ""
  };
  rows.plays = {
    columns: [...LEGACY_PLAY_COLUMNS],
    rows: [playRow],
    rowHashes: [],
    contentHash: ""
  };
  return rows;
}

function assertExpectedRows(state: HostedStateEvidence, expected: HostedRowManifest): void {
  if (stableHostedJson(Object.keys(state.rows).sort()) !== stableHostedJson(Object.keys(expected).sort())) {
    throw new HarnessError("row_state_table_mismatch", 409);
  }
  for (const [table, projection] of Object.entries(expected)) {
    const actual = state.rows[table];
    if (!actual || actual.rows.length !== projection.rows.length) {
      throw new HarnessError("row_state_count_mismatch", 409);
    }
    if (table === "engine_schema_versions") {
      const actualReceipts = actual.rows.map((row) => ({
        version: row.version ?? null,
        migration_hash: row.migration_hash ?? null
      })).sort((left, right) => stableHostedJson(left).localeCompare(stableHostedJson(right)));
      const expectedReceipts = projection.rows.map((row) => ({
        version: row.version ?? null,
        migration_hash: row.migration_hash ?? null
      })).sort((left, right) => stableHostedJson(left).localeCompare(stableHostedJson(right)));
      if (stableHostedJson(actualReceipts) !== stableHostedJson(expectedReceipts) ||
          actual.rows.some((row) => typeof row.applied_at !== "string" ||
            !Number.isFinite(Date.parse(row.applied_at)))) {
        throw new HarnessError("migration_receipt_state_mismatch", 409);
      }
      continue;
    }
    const actualRows = actual.rows.map((row) => Object.fromEntries(
      projection.columns.map((column) => [column, row[column] ?? null])
    )).sort((left, right) => stableHostedJson(left).localeCompare(stableHostedJson(right)));
    if (stableHostedJson(actualRows) !== stableHostedJson(projection.rows)) {
      throw new HarnessError("row_state_projection_mismatch", 409);
    }
  }
}

async function legacyGuardInsert(
  authority: Os01HostedMigrationAuthority,
  migrations: Os01HostedMigrationSource[],
  playRow: Record<string, Scalar>
): Promise<MigrationStatement> {
  const catalog = guardCatalogPredicate(legacyCatalogFromContract(authority), true);
  const rows = terminalGuardRowsPredicate(await expectedLegacyRows(authority, migrations, playRow));
  return {
    sql: `INSERT INTO ${quote(GUARD_TABLE)} (exact)
      SELECT CASE WHEN ${catalog.sql} AND ${rows.sql}
        AND NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check)
        AND (SELECT quick_check FROM pragma_quick_check LIMIT 1) = 'ok'
        THEN 1 ELSE 0 END`,
    bindings: [...catalog.bindings, ...rows.bindings]
  };
}

function insertPlay(row: Record<string, Scalar>): MigrationStatement {
  const placeholders = LEGACY_PLAY_COLUMNS.map(() => "?").join(", ");
  return {
    sql: `INSERT INTO plays (${LEGACY_PLAY_COLUMNS.map(quote).join(", ")}) VALUES (${placeholders})`,
    bindings: LEGACY_PLAY_COLUMNS.map((column) => row[column] ?? null)
  };
}

async function applyBlankReplay(
  db: D1Database,
  before: HostedStateEvidence,
  authority: Os01HostedMigrationAuthority,
  migrations: Os01HostedMigrationSource[]
): Promise<HostedStateEvidence> {
  assertState(before, authority.supportedStates.blank);
  const statements = [
    createGuard(),
    guardInsert(before, { checkSchemaVersion: true, excludeGuard: true }),
    ...(await migrationStatementsForRange(migrations, 0, 20)),
    await terminalGuardInsert(authority, migrations, null),
    dropGuard()
  ];
  await executeAtomicBatch(db, statements);
  const after = await captureHostedState(db);
  assertState(after, authority.supportedStates.terminal);
  assertExpectedRows(after, await expectedTerminalRows(authority, migrations, null));
  return after;
}

async function prepareLegacy(
  db: D1Database,
  before: HostedStateEvidence,
  authority: Os01HostedMigrationAuthority,
  migrations: Os01HostedMigrationSource[],
  playRow: Record<string, Scalar>,
  receiptTimeRestore: readonly MigrationStatement[] = []
): Promise<HostedStateEvidence> {
  assertState(before, authority.supportedStates.blank);
  const statements = [
    createGuard(),
    guardInsert(before, { checkSchemaVersion: true, excludeGuard: true }),
    ...(await migrationStatementsForRange(migrations, 0, 16)),
    ...receiptTimeRestore,
    insertPlay(playRow),
    await legacyGuardInsert(authority, migrations, playRow),
    dropGuard()
  ];
  await executeAtomicBatch(db, statements);
  const after = await captureHostedState(db);
  assertState(after, authority.supportedStates.legacy);
  assertExpectedRows(after, await expectedLegacyRows(authority, migrations, playRow));
  return after;
}

async function applyLegacyForward(
  db: D1Database,
  before: HostedStateEvidence,
  authority: Os01HostedMigrationAuthority,
  migrations: Os01HostedMigrationSource[],
  playRow: Record<string, Scalar>
): Promise<HostedStateEvidence> {
  assertState(before, authority.supportedStates.legacy);
  const statements = [
    createGuard(),
    guardInsert(before, { checkSchemaVersion: true, excludeGuard: true }),
    ...(await migrationStatementsForRange(migrations, 16, 20)),
    await terminalGuardInsert(authority, migrations, playRow),
    dropGuard()
  ];
  await executeAtomicBatch(db, statements);
  const after = await captureHostedState(db);
  assertState(after, authority.supportedStates.terminal);
  assertExpectedRows(after, await expectedTerminalRows(authority, migrations, playRow));
  return after;
}

async function runFailureProbe(
  db: D1Database,
  before: HostedStateEvidence,
  authority: Os01HostedMigrationAuthority,
  migrations: Os01HostedMigrationSource[],
  playRow: Record<string, Scalar>
): Promise<{ beforeHash: string; afterHash: string; injectionIndex: number }> {
  assertState(before, authority.supportedStates.legacy);
  const injectionIndex = authority.failureProbe.globalStatementIndex;
  const statements = [
    createGuard(),
    guardInsert(before, { checkSchemaVersion: true, excludeGuard: true }),
    ...(await migrationStatementsForRange(migrations, 16, 20, injectionIndex)),
    await terminalGuardInsert(authority, migrations, playRow),
    dropGuard()
  ];
  let rejected = false;
  try {
    await executeAtomicBatch(db, statements);
  } catch (error) {
    if (!(error instanceof Error) ||
        !error.message.includes("__os01_intentional_missing_table_v1")) {
      throw new HarnessError("failure_probe_wrong_failure", 500);
    }
    rejected = true;
  }
  if (!rejected) throw new HarnessError("failure_probe_did_not_fail", 500);
  const after = await captureHostedState(db);
  assertState(after, authority.supportedStates.legacy);
  const beforeHash = await hostedSha256(stableHostedJson(before));
  const afterHash = await hostedSha256(stableHostedJson(after));
  if (beforeHash !== afterHash) throw new HarnessError("partial_failure_committed_state", 500);
  return { beforeHash, afterHash, injectionIndex };
}

async function buildBackup(
  state: HostedStateEvidence,
  sourceQualificationId: string,
  authority: Os01HostedMigrationAuthority
): Promise<Os01LogicalBackup> {
  assertState(state, authority.supportedStates.legacy);
  const body = {
    version: "engine-os.os01-hosted-logical-backup.v1" as const,
    sourceQualificationId,
    migrationRange: "0000_through_0016" as const,
    migrationBundleHash: authority.legacyMigrationBundleHash,
    catalogFingerprint: state.catalog.fingerprint,
    catalogCounts: state.catalog.counts,
    rows: state.rows,
    rowsHash: state.rowsHash
  };
  return { ...body, backupHash: await hostedSha256(stableHostedJson(body)) };
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return stableHostedJson(Object.keys(value).sort()) === stableHostedJson([...expected].sort());
}

async function validateBackup(
  value: unknown,
  authority: Os01HostedMigrationAuthority
): Promise<Os01LogicalBackup> {
  if (!value || typeof value !== "object") throw new HarnessError("backup_invalid", 400);
  const backup = value as unknown as Os01LogicalBackup;
  if (!exactKeys(backup as unknown as Record<string, unknown>, [
    "backupHash", "catalogCounts", "catalogFingerprint", "migrationBundleHash", "migrationRange",
    "rows", "rowsHash", "sourceQualificationId", "version"
  ]) || backup.version !== "engine-os.os01-hosted-logical-backup.v1" ||
      !/^[a-f0-9]{64}$/u.test(backup.sourceQualificationId) ||
      backup.migrationRange !== "0000_through_0016" ||
      backup.migrationBundleHash !== authority.legacyMigrationBundleHash ||
      backup.catalogFingerprint !== authority.supportedStates.legacy.catalogFingerprint ||
      stableHostedJson(backup.catalogCounts) !== stableHostedJson(authority.supportedStates.legacy.counts) ||
      !/^[a-f0-9]{64}$/u.test(backup.rowsHash) || !/^[a-f0-9]{64}$/u.test(backup.backupHash)) {
    throw new HarnessError("backup_invalid", 400);
  }
  const body = {
    version: backup.version,
    sourceQualificationId: backup.sourceQualificationId,
    migrationRange: backup.migrationRange,
    migrationBundleHash: backup.migrationBundleHash,
    catalogFingerprint: backup.catalogFingerprint,
    catalogCounts: backup.catalogCounts,
    rows: backup.rows,
    rowsHash: backup.rowsHash
  };
  if (await hostedSha256(stableHostedJson(backup.rows)) !== backup.rowsHash ||
      await hostedSha256(stableHostedJson(body)) !== backup.backupHash) {
    throw new HarnessError("backup_hash_mismatch", 409);
  }
  const plays = backup.rows.plays;
  if (!plays || stableHostedJson(plays.columns) !== stableHostedJson(LEGACY_PLAY_COLUMNS) ||
      plays.rows.length !== 1 || stableHostedJson(plays.rows[0]) !== stableHostedJson(LEGACY_PLAY_ROW)) {
    throw new HarnessError("backup_fixture_mismatch", 409);
  }
  const receiptRows = backup.rows.engine_schema_versions?.rows ?? [];
  if (receiptRows.length !== 4 || receiptRows.some((row) =>
    typeof row.version !== "string" || typeof row.migration_hash !== "string" ||
    typeof row.applied_at !== "string")) {
    throw new HarnessError("backup_receipts_invalid", 409);
  }
  for (const [table, projection] of Object.entries(backup.rows)) {
    if (table !== "engine_schema_versions" && table !== "plays" && projection.rows.length !== 0) {
      throw new HarnessError("backup_contains_unexpected_rows", 409);
    }
  }
  return backup;
}

async function verifyLegacyProjection(
  state: HostedStateEvidence,
  backup: Os01LogicalBackup
): Promise<void> {
  for (const [table, expected] of Object.entries(backup.rows)) {
    const actual = state.rows[table];
    if (!actual) throw new HarnessError("preserved_table_missing", 409);
    const expectedVersions = table === "engine_schema_versions"
      ? new Set(expected.rows.map((row) => row.version))
      : null;
    const projectedRows = actual.rows
      .filter((row) => expectedVersions ? expectedVersions.has(row.version) : true)
      .map((row) => Object.fromEntries(expected.columns.map((column) => [column, row[column] ?? null])))
      .sort((left, right) => stableHostedJson(left).localeCompare(stableHostedJson(right)));
    if (stableHostedJson(projectedRows) !== stableHostedJson(expected.rows)) {
      throw new HarnessError("row_preservation_mismatch", 409);
    }
  }
}

function requestKeys(action: HostedAction): readonly string[] {
  const base = ["action", "qualificationId", "version"];
  if (action === "blank_prefix_probe") return [...base, "prefixStatementCount"];
  if (action === "blank_component_probe") return [...base, "componentProbePhase"];
  if (["legacy_forward", "restore_import", "failure_probe", "verify_legacy_terminal"].includes(action)) {
    return [...base, "backup"];
  }
  return base;
}

function parseQualificationRequest(value: unknown): QualificationRequest {
  if (!value || typeof value !== "object") throw new HarnessError("invalid_request", 400);
  const record = value as Record<string, unknown>;
  const actions: HostedAction[] = [
    "blank_prestate_component_probe",
    "blank_replay",
    "blank_prefix_probe",
    "blank_component_probe",
    "legacy_prepare_export",
    "legacy_forward",
    "restore_import",
    "failure_probe",
    "verify_blank_terminal",
    "verify_legacy_terminal"
  ];
  if (record.version !== "engine-os.os01-hosted-migration-request.v1" ||
      typeof record.action !== "string" || !actions.includes(record.action as HostedAction) ||
      typeof record.qualificationId !== "string" || !/^[a-f0-9]{64}$/u.test(record.qualificationId)) {
    throw new HarnessError("invalid_request", 400);
  }
  const action = record.action as HostedAction;
  if (!exactKeys(record, requestKeys(action))) throw new HarnessError("invalid_request", 400);
  if (action === "blank_prefix_probe" &&
      (!Number.isInteger(record.prefixStatementCount) ||
        Number(record.prefixStatementCount) < 0 || Number(record.prefixStatementCount) > 291)) {
    throw new HarnessError("invalid_request", 400);
  }
  const componentProbePhases: BlankComponentProbePhase[] = [
    "sentinel_only",
    "reserved_create_then_sentinel",
    "plain_create_then_sentinel",
    "reserved_simple_then_sentinel",
    "reserved_schema_then_sentinel",
    "reserved_catalog_then_sentinel",
    "reserved_full_guard_then_sentinel"
  ];
  if (action === "blank_component_probe" &&
      (typeof record.componentProbePhase !== "string" ||
        !componentProbePhases.includes(record.componentProbePhase as BlankComponentProbePhase))) {
    throw new HarnessError("invalid_request", 400);
  }
  return {
    version: record.version,
    action,
    qualificationId: record.qualificationId,
    ...(action === "blank_prefix_probe"
      ? { prefixStatementCount: Number(record.prefixStatementCount) }
      : {}),
    ...(action === "blank_component_probe"
      ? { componentProbePhase: record.componentProbePhase as BlankComponentProbePhase }
      : {}),
    ...(record.backup === undefined ? {} : { backup: record.backup as Os01LogicalBackup })
  };
}

async function receipt<T extends Record<string, unknown>>(
  request: QualificationRequest,
  payload: T
): Promise<T & {
  version: "engine-os.os01-hosted-migration-receipt.v1";
  qualificationId: string;
  action: HostedAction;
  status: "passed";
  providerDispatches: 0;
  providerBindingReads: 0;
  captureActivations: 0;
  receiptHash: string;
}> {
  const body = {
    version: "engine-os.os01-hosted-migration-receipt.v1" as const,
    qualificationId: request.qualificationId,
    action: request.action,
    status: "passed" as const,
    providerDispatches: 0 as const,
    providerBindingReads: 0 as const,
    captureActivations: 0 as const,
    ...payload
  };
  return { ...body, receiptHash: await hostedSha256(stableHostedJson(body)) };
}

function terminalSummary(state: HostedStateEvidence): Record<string, unknown> {
  return {
    catalogFingerprint: state.catalog.fingerprint,
    catalogCounts: state.catalog.counts,
    rowsHash: state.rowsHash,
    foreignKeyViolationCount: state.foreignKeyViolations.length,
    quickCheck: state.quickCheck
  };
}

async function performAction(
  db: D1Database,
  request: QualificationRequest,
  authority: Os01HostedMigrationAuthority
): Promise<Record<string, unknown>> {
  if (request.action === "blank_prestate_component_probe") {
    const probes = [
      { component: "select_literal", sql: "SELECT 1 AS exact" },
      {
        component: "sqlite_schema_catalog",
        sql: `SELECT type, name, tbl_name, sql FROM sqlite_schema
          WHERE type IN ('table', 'index', 'trigger', 'view')
          ORDER BY type COLLATE BINARY, name COLLATE BINARY`
      },
      { component: "pragma_schema_version", sql: "SELECT schema_version FROM pragma_schema_version" },
      { component: "pragma_foreign_key_check", sql: "SELECT * FROM pragma_foreign_key_check" },
      { component: "pragma_quick_check", sql: "SELECT quick_check FROM pragma_quick_check" }
    ] as const;
    const components: Array<Record<string, unknown>> = [];
    for (const probe of probes) {
      try {
        const rows = await all<Record<string, unknown>>(db, probe.sql);
        components.push({
          component: probe.component,
          status: "allowed",
          rowCount: rows.length,
          resultHash: await hostedSha256(stableHostedJson(rows))
        });
      } catch (error) {
        const failure = d1FailureText(error);
        components.push({
          component: probe.component,
          status: "rejected",
          failureClass: failure.includes("sqlite_auth") ? "sqlite_auth" : "d1_read_rejected"
        });
      }
    }
    return receipt(request, {
      result: "blank_prestate_component_probe_completed",
      components,
      allComponentsAllowed: components.every((component) => component.status === "allowed"),
      databaseMutationAttempted: false,
      sharedPrestateCaptureInvoked: false,
      migrationVerificationInvoked: false,
      claimBoundary: "diagnostic_only_not_qualification_evidence"
    });
  }
  const migrations = await verifiedMigrations(authority);
  const initial = await captureHostedState(db);
  const state = classifyState(initial, authority);
  if (state === "unknown") throw new HarnessError("unsupported_database_state", 409);

  if (request.action === "blank_prefix_probe") {
    assertState(initial, authority.supportedStates.blank);
    const migrationStatements = await migrationStatementsForRange(migrations, 0, 20);
    const prefixStatementCount = request.prefixStatementCount!;
    const prefix = migrationStatements.slice(0, prefixStatementCount);
    const intentionalRollbackTable = "__os01_intentional_missing_table_v1";
    let failureDetail = "";
    try {
      await executeAtomicBatch(db, [
        createGuard(),
        guardInsert(initial, { checkSchemaVersion: true, excludeGuard: true }),
        ...prefix,
        { sql: `SELECT value FROM ${intentionalRollbackTable}` }
      ]);
    } catch (error) {
      failureDetail = error instanceof HarnessError
        ? error.diagnosticDetail ?? error.message
        : d1FailureText(error);
    }
    if (!failureDetail) throw new HarnessError("prefix_probe_did_not_rollback", 500);
    const after = await captureHostedState(db);
    assertState(after, authority.supportedStates.blank);
    const beforeHash = await hostedSha256(stableHostedJson(initial));
    const afterHash = await hostedSha256(stableHostedJson(after));
    if (beforeHash !== afterHash) throw new HarnessError("prefix_probe_changed_state", 500);
    const last = prefix.at(-1);
    const authorizedPrefix = failureDetail.includes(intentionalRollbackTable);
    return receipt(request, {
      result: "blank_migration_prefix_rolled_back",
      prefixStatementCount,
      authorizedPrefix,
      failureClass: authorizedPrefix
        ? "intentional_rollback"
        : failureDetail.includes("sqlite_auth") ? "sqlite_auth" : "other",
      lastMigrationPath: last?.migrationPath ?? null,
      lastGlobalStatementIndex: last?.globalStatementIndex ?? null,
      stateUnchanged: true,
      beforeStateHash: beforeHash,
      afterStateHash: afterHash,
      claimBoundary: "diagnostic_only_not_qualification_evidence"
    });
  }

  if (request.action === "blank_component_probe") {
    assertState(initial, authority.supportedStates.blank);
    const phase = request.componentProbePhase!;
    const intentionalRollbackTable = "__os01_intentional_missing_table_v1";
    const plainGuardTable = "os01_hosted_migration_guard_probe_v1";
    const catalog = guardCatalogPredicate(initial.catalog, true);
    const sentinel: MigrationStatement = { sql: `SELECT value FROM ${intentionalRollbackTable}` };
    const phaseStatements: Record<BlankComponentProbePhase, MigrationStatement[]> = {
      sentinel_only: [sentinel],
      reserved_create_then_sentinel: [createGuard(), sentinel],
      plain_create_then_sentinel: [
        { sql: `CREATE TABLE ${quote(plainGuardTable)} (exact integer NOT NULL CHECK (exact = 1))` },
        sentinel
      ],
      reserved_simple_then_sentinel: [
        createGuard(),
        { sql: `INSERT INTO ${quote(GUARD_TABLE)} (exact) VALUES (1)` },
        sentinel
      ],
      reserved_schema_then_sentinel: [
        createGuard(),
        {
          sql: `INSERT INTO ${quote(GUARD_TABLE)} (exact)
            SELECT CASE WHEN (SELECT schema_version FROM pragma_schema_version) = ? THEN 1 ELSE 0 END`,
          bindings: [initial.catalog.schemaVersion + 1]
        },
        sentinel
      ],
      reserved_catalog_then_sentinel: [
        createGuard(),
        {
          sql: `INSERT INTO ${quote(GUARD_TABLE)} (exact)
            SELECT CASE WHEN ${catalog.sql} THEN 1 ELSE 0 END`,
          bindings: catalog.bindings
        },
        sentinel
      ],
      reserved_full_guard_then_sentinel: [
        createGuard(),
        guardInsert(initial, { checkSchemaVersion: true, excludeGuard: true }),
        sentinel
      ]
    };
    let failureDetail = "";
    try {
      await executeAtomicBatch(db, phaseStatements[phase]);
    } catch (error) {
      failureDetail = error instanceof HarnessError
        ? error.diagnosticDetail ?? error.message
        : d1FailureText(error);
    }
    const authorizedPhase = failureDetail.includes(intentionalRollbackTable);
    const after = await captureHostedState(db);
    assertState(after, authority.supportedStates.blank);
    const beforeHash = await hostedSha256(stableHostedJson(initial));
    const afterHash = await hostedSha256(stableHostedJson(after));
    if (beforeHash !== afterHash) throw new HarnessError("component_probe_changed_state", 500);
    return receipt(request, {
      result: "blank_component_probe_state_unchanged",
      componentProbePhase: phase,
      authorizedPhase,
      failureClass: authorizedPhase
        ? "intentional_rollback"
        : failureDetail.includes("sqlite_auth") ? "sqlite_auth" : "other",
      stateUnchanged: true,
      beforeStateHash: beforeHash,
      afterStateHash: afterHash,
      claimBoundary: "diagnostic_only_not_qualification_evidence"
    });
  }

  if (request.action === "blank_replay") {
    const terminal = state === "blank" ? await applyBlankReplay(db, initial, authority, migrations) : initial;
    if (classifyState(terminal, authority) !== "terminal") {
      throw new HarnessError("blank_replay_state_invalid", 409);
    }
    assertExpectedRows(terminal, await expectedTerminalRows(authority, migrations, null));
    return receipt(request, {
      result: "blank_0000_through_0020_replay_verified",
      authorizedRange: "0000_through_0020",
      migrationBundleHash: authority.migrationBundleHash,
      migrationPaths: migrations.map((migration) => migration.path),
      ...terminalSummary(terminal),
      claimBoundary: authority.claimBoundary
    });
  }

  if (request.action === "legacy_prepare_export") {
    const legacy = state === "blank"
      ? await prepareLegacy(db, initial, authority, migrations, LEGACY_PLAY_ROW)
      : initial;
    if (classifyState(legacy, authority) !== "legacy") {
      throw new HarnessError("legacy_prepare_state_invalid", 409);
    }
    assertExpectedRows(legacy, await expectedLegacyRows(authority, migrations, LEGACY_PLAY_ROW));
    const backup = await buildBackup(legacy, request.qualificationId, authority);
    return receipt(request, {
      result: "legacy_0000_through_0016_fixture_and_backup_verified",
      authorizedRange: "0000_through_0016_fixture_only",
      backup,
      ...terminalSummary(legacy),
      claimBoundary: authority.claimBoundary
    });
  }

  if (request.action === "verify_blank_terminal") {
    assertState(initial, authority.supportedStates.terminal);
    assertExpectedRows(initial, await expectedTerminalRows(authority, migrations, null));
    return receipt(request, {
      result: "blank_terminal_state_reverified",
      ...terminalSummary(initial),
      claimBoundary: authority.claimBoundary
    });
  }

  const backup = await validateBackup(request.backup, authority);
  const playRow = backup.rows.plays!.rows[0]!;

  if (request.action === "restore_import") {
    throw new HarnessError("exact_distinct_restore_unavailable", 409);
  }

  if (request.action === "failure_probe") {
    if (state !== "legacy" || initial.rowsHash !== backup.rowsHash) {
      throw new HarnessError("failure_probe_prestate_mismatch", 409);
    }
    const failure = await runFailureProbe(db, initial, authority, migrations, playRow);
    return receipt(request, {
      result: "actual_owner_gated_d1_batch_failure_rolled_back",
      backupHash: backup.backupHash,
      failureInjection: {
        migrationPath: authority.failureProbe.migrationPath,
        globalStatementIndex: failure.injectionIndex,
        statement: "qualification_only_missing_table_read"
      },
      beforeStateHash: failure.beforeHash,
      afterStateHash: failure.afterHash,
      stateUnchanged: failure.beforeHash === failure.afterHash,
      claimBoundary: authority.claimBoundary
    });
  }

  if (request.action === "legacy_forward") {
    let terminal = initial;
    if (state === "legacy") {
      if (initial.rowsHash !== backup.rowsHash) throw new HarnessError("forward_prestate_mismatch", 409);
      terminal = await applyLegacyForward(db, initial, authority, migrations, playRow);
    }
    assertState(terminal, authority.supportedStates.terminal);
    assertExpectedRows(terminal, await expectedTerminalRows(authority, migrations, playRow));
    await verifyLegacyProjection(terminal, backup);
    return receipt(request, {
      result: "legacy_0017_through_0020_forward_verified",
      authorizedRange: "0017_through_0020",
      backupHash: backup.backupHash,
      migrationPaths: migrations.slice(16).map((migration) => migration.path),
      legacyRowsPreserved: true,
      ...terminalSummary(terminal),
      claimBoundary: authority.claimBoundary
    });
  }

  if (request.action === "verify_legacy_terminal") {
    assertState(initial, authority.supportedStates.terminal);
    assertExpectedRows(initial, await expectedTerminalRows(authority, migrations, playRow));
    await verifyLegacyProjection(initial, backup);
    return receipt(request, {
      result: "legacy_terminal_state_reverified",
      backupHash: backup.backupHash,
      legacyRowsPreserved: true,
      ...terminalSummary(initial),
      claimBoundary: authority.claimBoundary
    });
  }

  throw new HarnessError("invalid_request", 400);
}

function headers(): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
  };
}

function errorResponse(error: unknown): Response {
  const status = error instanceof HarnessError ? error.status : 500;
  const code = error instanceof HarnessError ? error.code : "qualification_failed";
  const diagnostic = error instanceof HarnessError ? error.diagnostic : undefined;
  const diagnosticDetail = error instanceof HarnessError
    ? error.diagnosticDetail
    : d1FailureText(error).slice(0, 2_048);
  return new Response(stableHostedJson({
    error: code,
    ...(diagnostic ? { diagnostic } : {}),
    ...(diagnosticDetail ? { diagnosticDetail } : {})
  }), { status, headers: headers() });
}

export async function handleOs01HostedMigrationQualification(
  request: Request,
  db: D1Database,
  authority: Os01HostedMigrationAuthority
): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.pathname !== ROUTE || request.method !== "POST") throw new HarnessError("not_found", 404);
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
      throw new HarnessError("request_too_large", 413);
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
      throw new HarnessError("request_too_large", 413);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new HarnessError("invalid_request", 400);
    }
    const body = stableHostedJson(await performAction(db, parseQualificationRequest(parsed), authority));
    return new Response(body, { status: 200, headers: headers() });
  } catch (error) {
    return errorResponse(error);
  }
}

export const os01HostedMigrationHarnessContract = Object.freeze({
  route: ROUTE,
  requestVersion: "engine-os.os01-hosted-migration-request.v1",
  receiptVersion: "engine-os.os01-hosted-migration-receipt.v1",
  actions: Object.freeze([
    "blank_prestate_component_probe",
    "blank_replay",
    "blank_prefix_probe",
    "blank_component_probe",
    "legacy_prepare_export",
    "legacy_forward",
    "restore_import",
    "failure_probe",
    "verify_blank_terminal",
    "verify_legacy_terminal"
  ]),
  maxRequestBytes: MAX_REQUEST_BYTES,
  qualificationOnly: true,
  providerBindings: Object.freeze([]),
  captureActivationAllowed: false,
  productionAllowed: false
});
