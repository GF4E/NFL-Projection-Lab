import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import acceptedContract from "../config/os01-migration-qualification.v1.json";
import predecessorAuthority from "../config/d1-schema-authority.v1.json";
import successorAuthority from "../config/d1-schema-authority.v2.json";
import hostedContract from "../config/os01-hosted-migration-qualification.v4.json";
import {
  buildOs01HostedMigrationHarness,
  extractCapacityProbeRequestIdentity
} from "../scripts/build_os01_hosted_migration_harness";
import { loadOs01HostedMigrationAuthority } from "../scripts/os01-hosted-migration-authority";
import {
  classifyD1PreparationFailure,
  handleOs01HostedMigrationQualification,
  hostedSha256,
  stableHostedJson,
  type Os01HostedMigrationAuthority,
  type Os01HostedMigrationSource,
  type Os01LogicalBackup
} from "../qualification/os01-hosted-migration/core";
import { splitHostedSqlStatements } from "../qualification/os01-hosted-migration/sql-statements";

type BoundValue = string | number | null | Uint8Array;

class LazyStatement {
  constructor(
    readonly sqlite: DatabaseSync,
    readonly sql: string,
    readonly bindings: readonly BoundValue[] = []
  ) {}

  bind(...bindings: unknown[]): LazyStatement {
    return new LazyStatement(this.sqlite, this.sql, bindings as BoundValue[]);
  }

  private execute(): D1Result<Record<string, unknown>> {
    const query = this.sql.trimStart();
    const readsRows = /^(?:SELECT|PRAGMA|WITH)\b/iu.test(query);
    if (readsRows) {
      const rows = this.sqlite.prepare(this.sql).all(...this.bindings) as Array<Record<string, unknown>>;
      return {
        success: true,
        results: rows,
        meta: { duration: 0, rows_read: rows.length, rows_written: 0, changes: 0 }
      } as unknown as D1Result<Record<string, unknown>>;
    }
    if (this.bindings.length) {
      const result = this.sqlite.prepare(this.sql).run(...this.bindings);
      return {
        success: true,
        results: [],
        meta: {
          duration: 0,
          rows_read: 0,
          rows_written: Number(result.changes),
          changes: Number(result.changes)
        }
      } as unknown as D1Result<Record<string, unknown>>;
    }
    this.sqlite.exec(this.sql);
    return {
      success: true,
      results: [],
      meta: { duration: 0, rows_read: 0, rows_written: 0, changes: 0 }
    } as unknown as D1Result<Record<string, unknown>>;
  }

  async all<T>(): Promise<D1Result<T>> {
    return this.execute() as D1Result<T>;
  }

  async run<T>(): Promise<D1Result<T>> {
    return this.execute() as D1Result<T>;
  }

  async first<T>(column?: string): Promise<T | null> {
    const value = this.sqlite.prepare(this.sql).get(...this.bindings) as Record<string, unknown> | undefined;
    if (!value) return null;
    return (column ? value[column] : value) as T;
  }

  async raw<T>(): Promise<T[]> {
    throw new Error("raw is not used by the OS-01 hosted harness");
  }
}

function sqliteD1(sqlite: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      if (splitHostedSqlStatements(sql).length !== 1) {
        throw new Error("D1_ERROR: You can only execute one statement at a time.");
      }
      return new LazyStatement(sqlite, sql) as unknown as D1PreparedStatement;
    },
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await (statement as unknown as LazyStatement).run<T>());
        }
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        if (sqlite.isTransaction) sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async exec() {
      throw new Error("D1 exec is not authorized by the OS-01 hosted harness");
    },
    withSession() {
      throw new Error("sessions are not used by the OS-01 hosted harness");
    },
    async dump() {
      throw new Error("database dumps are not used by the OS-01 hosted harness");
    }
  } as unknown as D1Database;
}

function database(): { sqlite: DatabaseSync; d1: D1Database } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  return { sqlite, d1: sqliteD1(sqlite) };
}

const temporaryDirectories: string[] = [];
const qualificationId = "a".repeat(64);
const restoreQualificationId = "b".repeat(64);
const exactStagingProjectId = "appgprj_6a92435d1d788191b4d6bcaff0a1525d";
let authority: Os01HostedMigrationAuthority;

beforeAll(() => {
  authority = loadOs01HostedMigrationAuthority(process.cwd());
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function invoke(
  d1: D1Database,
  action: string,
  id = qualificationId,
  backup?: Os01LogicalBackup,
  selectedAuthority = authority
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const request = new Request("https://owner-only.example.test/__engine-os/os01-hosted-migration/v1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: "engine-os.os01-hosted-migration-request.v1",
      action,
      qualificationId: id,
      ...(backup ? { backup } : {})
    })
  });
  const response = await handleOs01HostedMigrationQualification(request, d1, selectedAuthority);
  return { response, body: await response.json() as Record<string, unknown> };
}

async function legacyBackup(d1: D1Database, id = qualificationId): Promise<Os01LogicalBackup> {
  const prepared = await invoke(d1, "legacy_prepare_export", id);
  expect(prepared.response.status).toBe(200);
  return prepared.body.backup as Os01LogicalBackup;
}

describe("OS-01 standalone hosted migration harness", () => {
  it("reproduces the v3 D1 preparation failure and classifies it without leaking SQL", () => {
    const migration = authority.migrations.find((item) =>
      item.path === "drizzle/0010_confidence_engine.sql"
    )!;
    const breakpointEntry = migration.source.split("--> statement-breakpoint")[0]!;
    expect(splitHostedSqlStatements(breakpointEntry)).toHaveLength(13);
    const { sqlite, d1 } = database();
    let failure: unknown;
    try {
      d1.prepare(breakpointEntry);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(classifyD1PreparationFailure(failure)).toBe("d1_prepare_multiple_statements");
    expect(stableHostedJson({
      error: "qualification_failed",
      diagnostic: classifyD1PreparationFailure(failure)
    })).toBe('{"diagnostic":"d1_prepare_multiple_statements","error":"qualification_failed"}');
    expect(sqlite.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get())
      .toEqual({ count: 0 });
    sqlite.close();
  });

  it("prepares 291 individual migration statements and submits one 295-statement atomic batch", async () => {
    const { sqlite, d1 } = database();
    const batchSizes: number[] = [];
    const recording = new Proxy(d1, {
      get(target, property) {
        if (property === "batch") {
          return async <T>(statements: D1PreparedStatement[]) => {
            batchSizes.push(statements.length);
            return target.batch<T>(statements);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const result = await invoke(recording, "blank_replay");
    expect(result.response.status, stableHostedJson(result.body)).toBe(200);
    expect(batchSizes).toEqual([295]);
    sqlite.close();
  });

  it("returns only the closed diagnostic when D1 rejects a prepared multi-statement entry", async () => {
    const { sqlite, d1 } = database();
    let injected = false;
    const rejecting = new Proxy(d1, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => {
            if (!injected && sql.includes("__os01_hosted_migration_guard_v1")) {
              injected = true;
              throw new Error("D1_ERROR: You can only execute one statement at a time. SQL omitted");
            }
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const result = await invoke(rejecting, "blank_replay");
    expect(result.response.status).toBe(500);
    expect(result.body).toEqual({
      diagnostic: "d1_prepare_multiple_statements",
      error: "qualification_failed"
    });
    expect(stableHostedJson(result.body)).not.toContain("D1_ERROR");
    expect(stableHostedJson(result.body)).not.toContain("SQL omitted");
    expect(sqlite.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get())
      .toEqual({ count: 0 });
    sqlite.close();
  });

  it("derives its exact order, byte hashes, and ranges from the accepted d24 authority", async () => {
    expect(authority.sourceCommit).toBe("d24db5632410894d4f82c12e7f1d0c4c256a208d");
    expect(authority.acceptedContract.byteSha256).toBe(
      "9b5da72706f18670c3ecb67763d18f109cf228b2a56c83f1ea52ff8582882e51"
    );
    expect(authority.migrations.map(({ path }) => path))
      .toEqual(acceptedContract.authorizedRanges[0]!.migrationPaths);
    expect(authority.migrations.slice(16).map(({ path }) => path))
      .toEqual(acceptedContract.authorizedRanges[1]!.migrationPaths);
    const expectedHashes = Object.fromEntries([
      ...predecessorAuthority.frozenBaseline.orderedMigrations,
      ...successorAuthority.orderedHistory.successorMigrations
    ].map(({ path, byteSha256 }) => [path, byteSha256]));
    for (const migration of authority.migrations) {
      expect(await hostedSha256(migration.source), migration.path).toBe(expectedHashes[migration.path]);
      expect(migration.byteSha256, migration.path).toBe(expectedHashes[migration.path]);
    }
  });

  it("replays blank 0000-0020 once, converges on retry, and reaches 93/80/76", async () => {
    const { sqlite, d1 } = database();
    const first = await invoke(d1, "blank_replay");
    const second = await invoke(d1, "blank_replay");
    const verified = await invoke(d1, "verify_blank_terminal");
    expect(first.response.status, stableHostedJson(first.body)).toBe(200);
    expect(second.response.status, stableHostedJson(second.body)).toBe(200);
    expect(verified.response.status, stableHostedJson(verified.body)).toBe(200);
    expect(verified.body).toMatchObject({ result: "blank_terminal_state_reverified" });
    expect(first.body).toEqual(second.body);
    expect(first.body).toMatchObject({
      result: "blank_0000_through_0020_replay_verified",
      catalogCounts: { table: 93, index: 80, trigger: 76, view: 0 },
      foreignKeyViolationCount: 0,
      providerDispatches: 0,
      providerBindingReads: 0,
      captureActivations: 0
    });
    expect(sqlite.prepare("SELECT count(*) AS count FROM plays").get()).toEqual({ count: 0 });
    sqlite.close();
  });

  it("exports a deterministic legacy backup and preserves its exact row projection through 0017-0020", async () => {
    const { sqlite, d1 } = database();
    const backup = await legacyBackup(d1);
    const retry = await invoke(d1, "legacy_prepare_export");
    expect(retry.body.backup).toEqual(backup);
    const forward = await invoke(d1, "legacy_forward", qualificationId, backup);
    const verify = await invoke(d1, "verify_legacy_terminal", qualificationId, backup);
    expect(forward.response.status, stableHostedJson(forward.body)).toBe(200);
    expect(verify.response.status).toBe(200);
    expect(forward.body).toMatchObject({
      result: "legacy_0017_through_0020_forward_verified",
      backupHash: backup.backupHash,
      legacyRowsPreserved: true,
      catalogCounts: { table: 93, index: 80, trigger: 76, view: 0 }
    });
    const wrongLane = await invoke(d1, "blank_replay");
    expect(wrongLane.response.status).toBe(409);
    expect(wrongLane.body).toEqual({ error: "row_state_count_mismatch" });
    expect(sqlite.prepare(`SELECT id, profit_cents, contract_key, gabe_approved, jarrett_approved,
      closing_clv_points, clv_reference_book FROM plays`).get()).toEqual({
      id: "os01-hosted-legacy-preserved",
      profit_cents: 2381,
      contract_key: "",
      gabe_approved: 0,
      jarrett_approved: 0,
      closing_clv_points: null,
      clv_reference_book: null
    });
    sqlite.close();
  });

  it("rejects corruption and blocks a non-exact distinct restore before writing", async () => {
    const source = database();
    const backup = await legacyBackup(source.d1);
    source.sqlite.close();

    const corrupt = database();
    const tampered = structuredClone(backup);
    tampered.rows.plays!.rows[0]!.profit_cents = 9999;
    const rejected = await invoke(corrupt.d1, "restore_import", restoreQualificationId, tampered);
    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toEqual({ error: "backup_hash_mismatch" });
    expect(corrupt.sqlite.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get())
      .toEqual({ count: 0 });
    corrupt.sqlite.close();

    const restored = database();
    const blocked = await invoke(restored.d1, "restore_import", restoreQualificationId, backup);
    expect(blocked.response.status).toBe(409);
    expect(blocked.body).toEqual({ error: "exact_distinct_restore_unavailable" });
    expect(restored.sqlite.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get())
      .toEqual({ count: 0 });
    restored.sqlite.close();
  });

  it("rejects terminal and legacy retries after an unexpected receipt row is inserted", async () => {
    const terminal = database();
    expect((await invoke(terminal.d1, "blank_replay")).response.status).toBe(200);
    terminal.sqlite.prepare(`INSERT INTO engine_schema_versions (version, migration_hash, applied_at)
      VALUES (?, ?, ?)`).run("unexpected_terminal_receipt", `sha256:${"c".repeat(64)}`, "2026-08-28T00:00:00Z");
    const terminalRetry = await invoke(terminal.d1, "blank_replay");
    expect(terminalRetry.response.status).toBe(409);
    expect(terminalRetry.body).toEqual({ error: "row_state_count_mismatch" });
    terminal.sqlite.close();

    const legacy = database();
    await legacyBackup(legacy.d1);
    legacy.sqlite.prepare(`INSERT INTO engine_schema_versions (version, migration_hash, applied_at)
      VALUES (?, ?, ?)`).run("unexpected_legacy_receipt", `sha256:${"d".repeat(64)}`, "2026-08-28T00:00:00Z");
    const legacyRetry = await invoke(legacy.d1, "legacy_prepare_export");
    expect(legacyRetry.response.status).toBe(409);
    expect(legacyRetry.body).toEqual({ error: "row_state_count_mismatch" });
    legacy.sqlite.close();
  });

  it("injects a failure into the actual successor D1 batch and leaves the exact fixture prestate", async () => {
    const restored = database();
    const backup = await legacyBackup(restored.d1, restoreQualificationId);
    const before = stableHostedJson(restored.sqlite.prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name"
    ).all());
    const failure = await invoke(restored.d1, "failure_probe", restoreQualificationId, backup);
    const after = stableHostedJson(restored.sqlite.prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name"
    ).all());
    expect(failure.response.status).toBe(200);
    expect(failure.body).toMatchObject({
      result: "actual_owner_gated_d1_batch_failure_rolled_back",
      stateUnchanged: true,
      failureInjection: {
        migrationPath: "drizzle/0019_engine_os_schema_closure.sql",
        statement: "qualification_only_missing_table_read"
      }
    });
    expect(after).toBe(before);
    expect(restored.sqlite.prepare(
      "SELECT count(*) AS count FROM engine_schema_versions WHERE version LIKE '0017%' OR version LIKE '0018%' OR version LIKE '0019%' OR version LIKE '0020%'"
    ).get()).toEqual({ count: 0 });
    const forward = await invoke(restored.d1, "legacy_forward", restoreQualificationId, backup);
    expect(forward.response.status, stableHostedJson(forward.body)).toBe(200);
    expect(forward.body).toMatchObject({
      result: "legacy_0017_through_0020_forward_verified",
      legacyRowsPreserved: true
    });
    restored.sqlite.close();
  });

  it("does not mistake an earlier platform failure for the intentional failure probe", async () => {
    const { sqlite, d1 } = database();
    const backup = await legacyBackup(d1, restoreQualificationId);
    const earlyFailure = new Proxy(d1, {
      get(target, property) {
        if (property === "batch") {
          return async () => { throw new Error("simulated platform query limit"); };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const rejected = await invoke(earlyFailure, "failure_probe", restoreQualificationId, backup);
    expect(rejected.response.status).toBe(500);
    expect(rejected.body).toEqual({ error: "failure_probe_wrong_failure" });
    expect(sqlite.prepare(
      "SELECT count(*) AS count FROM engine_schema_versions WHERE version LIKE '0017%' OR version LIKE '0018%' OR version LIKE '0019%' OR version LIKE '0020%'"
    ).get()).toEqual({ count: 0 });
    sqlite.close();
  });

  it.each([
    ["reorder", (candidate: { migrations: Os01HostedMigrationSource[] }) => {
      [candidate.migrations[0], candidate.migrations[1]] = [candidate.migrations[1]!, candidate.migrations[0]!];
    }],
    ["substitute", (candidate: { migrations: Os01HostedMigrationSource[] }) => {
      candidate.migrations[16] = { ...candidate.migrations[16]!, source: `${candidate.migrations[16]!.source}\n-- changed` };
    }]
  ])("rejects a %s attack before the first database write", async (_label, mutate) => {
    const candidate = structuredClone(authority) as unknown as { migrations: Os01HostedMigrationSource[] };
    mutate(candidate);
    const { sqlite, d1 } = database();
    const rejected = await invoke(
      d1,
      "blank_replay",
      qualificationId,
      undefined,
      candidate as unknown as Os01HostedMigrationAuthority
    );
    expect(rejected.response.status).toBe(500);
    expect(rejected.body).toMatchObject({ error: expect.stringMatching(/migration_/u) });
    expect(sqlite.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get())
      .toEqual({ count: 0 });
    sqlite.close();
  });

  it("rolls back when same-name terminal DDL differs from the build-time authority", async () => {
    const candidate = structuredClone(authority) as unknown as {
      supportedStates: { terminal: { identities: Array<{ createSql: string | null }> } };
    };
    const identity = candidate.supportedStates.terminal.identities.find((item) => item.createSql !== null)!;
    identity.createSql = `${identity.createSql} `;
    const { sqlite, d1 } = database();
    const rejected = await invoke(
      d1,
      "blank_replay",
      qualificationId,
      undefined,
      candidate as unknown as Os01HostedMigrationAuthority
    );
    expect(rejected.response.status).toBe(500);
    expect(rejected.body).toEqual({
      error: "qualification_failed",
      diagnostic: "d1_prepare_rejected",
      diagnosticDetail: "check constraint failed: exact = 1"
    });
    expect(sqlite.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get())
      .toEqual({ count: 0 });
    sqlite.close();
  });

  it("builds a Sites-compatible DB-only archive without automatic migrations or production reachability", async () => {
    const directory = mkdtempSync(join(tmpdir(), "os01-hosted-build-"));
    const secondDirectory = mkdtempSync(join(tmpdir(), "os01-hosted-build-"));
    const occupiedDirectory = mkdtempSync(join(tmpdir(), "os01-hosted-build-"));
    temporaryDirectories.push(directory);
    temporaryDirectories.push(secondDirectory, occupiedDirectory);
    const result = await buildOs01HostedMigrationHarness({
      projectId: exactStagingProjectId,
      outDir: directory
    });
    const second = await buildOs01HostedMigrationHarness({
      projectId: exactStagingProjectId,
      outDir: secondDirectory
    });
    const hosting = JSON.parse(readFileSync(join(directory, ".openai/hosting.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    const entry = readFileSync(join(directory, "server/index.js"), "utf8");
    expect(hosting).toEqual({ project_id: exactStagingProjectId, d1: "DB", r2: null });
    expect(manifest).toMatchObject({
      version: "engine-os.os01-hosted-migration-package.v4",
      qualificationOnly: true,
      projectId: exactStagingProjectId,
      deploymentArchiveIncludesDrizzle: false,
      runtimeBindings: ["DB"],
      providerBindings: [],
      scheduledTriggers: [],
      terminalPhysicalManifestParityAccepted: false,
      d1QualificationBudget: {
        accountingVersion: "engine-os.os01-hosted-migration-capacity.v1",
        requiredQueriesPerWorkerInvocation: 489,
        blankReplayMigrationStatements: 291,
        blankReplayBatchStatements: 295,
        blankPrestateQueries: 4,
        blankTerminalQueries: 190,
        successorMigrationBatchStatements: 137,
        maximumBatchDurationSeconds: 30,
        activePredeployProbeIncluded: true,
        capacityQualificationStatus: "passed_489_read_only_queries_in_one_batch_588ms_source_bound_request_identity",
        mutatingMigrationDurationQualificationStatus: "pending_hosted_blank_replay_v4"
      },
      capacityProbe: {
        path: ".planning/engine-os/execution/os-01/hosted-capacity-probe-receipt.v3.json",
        sha256: "91e61351ba23848cc76e2d10f386c6a38690b9e41681f2d2387a206d0a70955c",
        exactProjectId: exactStagingProjectId,
        deploymentId: "appgdep_6a9243901a808191ad9f6c099bc90331",
        sourceCommit: "f161104783f13ad15009fc2da4ac8f11f513c4fd",
        workerSha256: "8969879cc4c233d92d3a53d3202300b13b6e491e57dc3db031e12f309d983b05",
        builtWorkerSha256: "e08e0c035405223072ec7c35bc6430e1e1a252cab161005f4dc5b6cde755fd84",
        archiveSha256: "f0720062fe21c926d367520560728a2b5d077c1b0ece017bef0155862b5565c2",
        sourceSnapshot: {
          path: ".planning/engine-os/execution/os-01/hosted-capacity-probe-worker.f161104.js.txt",
          sha256: "8969879cc4c233d92d3a53d3202300b13b6e491e57dc3db031e12f309d983b05"
        },
        requestIdentity: {
          method: "POST",
          route: "/__engine-os/os01-capacity/v1",
          version: "engine-os.os01-d1-capacity-probe-request.v1",
          qualificationId: "os01-capacity-20260829-489-readonly",
          exactKeys: ["qualificationId", "version"]
        },
        queryCount: 489,
        batchCount: 1,
        resultCount: 489,
        elapsedMilliseconds: 588,
        readOnly: true,
        databaseMutations: 0,
        providerCalls: 0,
        providerSecretReads: 0,
        captureActivations: 0,
        responseReceiptHash: "cb7c00a83a66304430c0c61385328568b752a7122069e5cc8c170e849193ed55",
        status: "passed_bounded_read_only_probe_with_source_bound_request_identity"
      },
      deploymentAllowed: true,
      deploymentTargetRestriction: `exact_project:${exactStagingProjectId}`,
      freshOwnerOnlyAndBindingRefreshRequiredBeforeDeploy: true,
      ownerOnlyAccessRequiredBeforeDeploy: true,
      authorizedHostedAction: "one_blank_replay_with_new_qualification_id",
      predecessorPostFailureD1TableCount: 0,
      stillBlankRefreshRequiredBeforeDeploy: true,
      qualificationContract: {
        path: "config/os01-hosted-migration-qualification.v4.json",
        sha256: await hostedSha256(readFileSync(
          "config/os01-hosted-migration-qualification.v4.json",
          "utf8"
        ))
      },
      rejectedPredecessorContract: {
        path: "config/os01-hosted-migration-qualification.v3.json",
        sha256: "eaddbab1dd84325eac82846446fa49a1c38359abce60283341886208c87f5a9d",
        status: "rejected_runtime_statement_boundary_mismatch"
      },
      rejectedPredecessorReceipt: {
        path: ".planning/engine-os/execution/os-01/hosted-migration-v3-runtime-boundary-rejection-receipt.v1.json",
        sha256: "d42f6829a21e02d368354a3bbd851fb4e99a77adb7a32dc5086ce25b8a76497b",
        hostedHttpStatus: 500,
        hostedResponseSha256: "02bc538377738a19dda7d8c6bfabb2cf6e56be98008e976c216a470e9055a98a",
        postFailureD1TableCount: 0
      },
      rejectedRequestIdentityPredecessorContract: {
        path: "config/os01-hosted-migration-qualification.v2.json",
        sha256: "cd025216b156946404b5606e824575ff00e1d023f3fa40f4fa45e068a041cde6",
        status: "rejected_request_identity_mismatch"
      },
      runtimeStatementBoundary: {
        parserPath: "qualification/os01-hosted-migration/sql-statements.ts",
        parserSha256: "419f97cba53ee0e95fdad8ddd29edf0a1a2a64cc359f34f85746c6ab02b43c46",
        consumers: [
          "qualification/os01-hosted-migration/core.ts",
          "scripts/os01-hosted-migration-capacity.ts"
        ],
        statementBreakpointEntries: 272,
        migrationStatements: 291,
        embeddedStatementDifference: 19,
        singleStatementPerPrepareRequired: true,
        diagnosticVocabulary: ["d1_prepare_multiple_statements", "d1_prepare_rejected"]
      },
      historicalCapacityRejectionContract: {
        path: "config/os01-hosted-migration-qualification.v1.json",
        sha256: "d411116582a982bdbf9a86d797bfd8346ee72115b87602bf6b204c5eadc59270",
        status: "terminal_capacity_blocked_not_deployable"
      },
      productionAllowed: false,
      outputFiles: [
        ".openai/hosting.json",
        ".openai/os01-hosted-migration-package.v4.json",
        ".openai/os01-hosted-migration-package.v4.sha256",
        "server/index.js"
      ]
    });
    expect(hostedContract.executionBoundary.productionAllowed).toBe(false);
    expect({
      entrySha256: result.entrySha256,
      authoritySha256: result.authoritySha256,
      manifestSha256: result.manifestSha256
    }).toEqual({
      entrySha256: second.entrySha256,
      authoritySha256: second.authoritySha256,
      manifestSha256: second.manifestSha256
    });
    expect(readFileSync(result.manifestPath, "utf8"))
      .toBe(readFileSync(second.manifestPath, "utf8"));
    expect(readFileSync(join(directory, ".openai/os01-hosted-migration-package.v4.sha256"), "utf8"))
      .toBe(`${result.manifestSha256}  os01-hosted-migration-package.v4.json\n`);
    expect(entry).toContain("/__engine-os/os01-hosted-migration/v1");
    expect(entry).not.toMatch(/ODDS_API_KEY|ENGINE_OS_CAPTURE_ENABLED|the-odds-api\.com/u);
    expect(readFileSync("worker/index.ts", "utf8")).not.toContain("os01-hosted-migration");
    writeFileSync(join(occupiedDirectory, "existing"), "preserve", "utf8");
    await expect(buildOs01HostedMigrationHarness({
      projectId: exactStagingProjectId,
      outDir: occupiedDirectory
    })).rejects.toThrow("output directory must be empty");
  });

  it("preserves every rejected predecessor and rejects every non-qualified deployment target", async () => {
    expect(await hostedSha256(readFileSync(
      "config/os01-hosted-migration-qualification.v1.json",
      "utf8"
    ))).toBe("d411116582a982bdbf9a86d797bfd8346ee72115b87602bf6b204c5eadc59270");
    expect(await hostedSha256(readFileSync(
      "config/os01-hosted-migration-qualification.v2.json",
      "utf8"
    ))).toBe("cd025216b156946404b5606e824575ff00e1d023f3fa40f4fa45e068a041cde6");
    expect(await hostedSha256(readFileSync(
      ".planning/engine-os/execution/os-01/hosted-capacity-probe-receipt.v2.json",
      "utf8"
    ))).toBe("d24b4f3d68c1b34e6852779b538fe40331f2b4714df18b2e6c91d63e7ec68b47");
    expect(await hostedSha256(readFileSync(
      "config/os01-hosted-migration-qualification.v3.json",
      "utf8"
    ))).toBe("eaddbab1dd84325eac82846446fa49a1c38359abce60283341886208c87f5a9d");
    expect(await hostedSha256(readFileSync(
      ".planning/engine-os/execution/os-01/hosted-migration-v3-runtime-boundary-rejection-receipt.v1.json",
      "utf8"
    ))).toBe("d42f6829a21e02d368354a3bbd851fb4e99a77adb7a32dc5086ce25b8a76497b");
    expect(hostedContract.status)
      .toBe("candidate_corrected_runtime_boundaries_staging_retryable_after_refresh");
    expect(hostedContract.executionBoundary.exactTemporarySitesProjectId).toBe(exactStagingProjectId);
    expect(hostedContract.executionBoundary.productionAllowed).toBe(false);
    expect(hostedContract.executionBoundary.providerAccessAllowed).toBe(false);
    expect(hostedContract.executionBoundary.captureActivationAllowed).toBe(false);
    expect(hostedContract.package.deploymentAllowed).toBe(true);
    expect(hostedContract.executionBoundary.freshOwnerOnlyAndBindingRefreshRequiredBeforeDeploy).toBe(true);
    expect(hostedContract.executionBoundary.predecessorPostFailureD1Observation.tables).toEqual([]);
    expect(hostedContract.runtimeStatementBoundary).toMatchObject({
      statementBreakpointEntries: 272,
      migrationStatements: 291,
      blankReplayBatchStatements: 295,
      blankReplayInvocationQueries: 489,
      singleStatementPerPrepareRequired: true
    });
    const directory = mkdtempSync(join(tmpdir(), "os01-hosted-build-wrong-target-"));
    temporaryDirectories.push(directory);
    await expect(buildOs01HostedMigrationHarness({
      projectId: `appgprj_${"0".repeat(32)}`,
      outDir: directory
    })).rejects.toThrow("restricted to the capacity-qualified staging Sites project");
  });

  it("binds the corrected capacity receipt request identity to the exact frozen probe source", async () => {
    const sourcePath =
      ".planning/engine-os/execution/os-01/hosted-capacity-probe-worker.f161104.js.txt";
    const source = readFileSync(sourcePath, "utf8");
    const receipt = JSON.parse(readFileSync(
      ".planning/engine-os/execution/os-01/hosted-capacity-probe-receipt.v3.json",
      "utf8"
    ));
    const rejectedReceipt = JSON.parse(readFileSync(
      ".planning/engine-os/execution/os-01/hosted-capacity-probe-receipt.v2.json",
      "utf8"
    ));
    expect(await hostedSha256(source)).toBe(
      "8969879cc4c233d92d3a53d3202300b13b6e491e57dc3db031e12f309d983b05"
    );
    const identity = extractCapacityProbeRequestIdentity(source);
    expect(identity).toEqual({
      method: receipt.request.method,
      route: receipt.request.route,
      version: receipt.request.version,
      qualificationId: receipt.request.qualificationId,
      exactKeys: receipt.request.exactKeys
    });
    expect(identity).toEqual({
      method: "POST",
      route: "/__engine-os/os01-capacity/v1",
      version: "engine-os.os01-d1-capacity-probe-request.v1",
      qualificationId: "os01-capacity-20260829-489-readonly",
      exactKeys: ["qualificationId", "version"]
    });
    expect(rejectedReceipt.request.route).not.toBe(identity.route);
    expect(receipt.source.snapshotPath).toBe(sourcePath);
  });

  it("preserves the exact failed v3 hosted attempt as rejected, zero-table evidence", async () => {
    const receiptPath =
      ".planning/engine-os/execution/os-01/hosted-migration-v3-runtime-boundary-rejection-receipt.v1.json";
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(await hostedSha256(readFileSync(receiptPath, "utf8")))
      .toBe("d42f6829a21e02d368354a3bbd851fb4e99a77adb7a32dc5086ce25b8a76497b");
    expect(receipt).toMatchObject({
      result: "rejected_runtime_statement_boundary_mismatch",
      rejectedCandidate: {
        deployedSourceCommit: "5093b82f615c2ab8cfadbfc84597afec684e63f7",
        deployedSourceTree: "63a4372e1d22ce5ea89c7f78a4bff633f1e8a6a1"
      },
      hostedAttempt: {
        projectId: exactStagingProjectId,
        savedVersionId:
          "appgprj_6a92435d1d788191b4d6bcaff0a1525d~appgver_6626ff193a68819198bd663cda6f964f",
        deploymentId: "appgdep_6a924cd321a88191a349aee27a233a56",
        request: {
          method: "POST",
          route: "/__engine-os/os01-hosted-migration/v1",
          sha256: "dde6ebba8e2b11c5ad170c92aa070862bee710fdc1ca7ff95874fece595c9af6",
          authenticationHeader: "OAI-Sites-Authorization"
        },
        response: {
          httpStatus: 500,
          body: { error: "qualification_failed" },
          sha256: "02bc538377738a19dda7d8c6bfabb2cf6e56be98008e976c216a470e9055a98a",
          capturedHeadersFileSha256:
            "458999932b258401552dd24cd160b7a46308818b7cfb86ccc64ba8e9bced9af6",
          rawHeadersRetained: false
        },
        workerRequestId: "d90ad9a5740765a154ddc6bf0b23d352",
        workerWallMilliseconds: 213,
        workerCpuMilliseconds: 12,
        postFailureD1Observation: { tables: [], tableCount: 0, atomicFailurePreservedBlankState: true },
        excludedGatewayAttempts: { count: 2, httpStatus: 401, reachedWorker: false }
      },
      defect: {
        capacityParserMigrationStatements: 291,
        runtimeBreakpointEntries: 272,
        missingRuntimeStatementBoundaries: 19
      },
      securityAndActivation: {
        providerCalls: 0,
        providerSecretReads: 0,
        quotaReservations: 0,
        captureActivations: 0,
        productionMutations: 0
      },
      claims: { v3Accepted: false, v3RetryAuthorized: false }
    });
  });

  it("rejects non-POST, extra request keys, and wrong routes without touching D1", async () => {
    const { sqlite, d1 } = database();
    const requests = [
      new Request("https://owner-only.example.test/__engine-os/os01-hosted-migration/v1"),
      new Request("https://owner-only.example.test/wrong", { method: "POST", body: "{}" }),
      new Request("https://owner-only.example.test/__engine-os/os01-hosted-migration/v1", {
        method: "POST",
        body: JSON.stringify({
          version: "engine-os.os01-hosted-migration-request.v1",
          action: "blank_replay",
          qualificationId,
          unexpected: true
        })
      })
    ];
    for (const request of requests) {
      const response = await handleOs01HostedMigrationQualification(request, d1, authority);
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(sqlite.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get())
      .toEqual({ count: 0 });
    sqlite.close();
  });
});
