import { copyFileSync, mkdtempSync, rmSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import authorityV1 from "../config/d1-schema-authority.v1.json";
import authorityV2 from "../config/d1-schema-authority.v2.json";
import terminalManifest from "../config/d1-schema-manifest.v1.json";
import qualificationContract from "../config/os01-migration-qualification.v1.json";
import {
  applyQualifiedMigrationRange,
  applyUnqualifiedFixtureMigrations,
  captureDatabaseEvidence,
  migrationPaths,
  preflightClaim,
  stableJson,
  type DatabaseEvidence,
  type MigrationRunOptions
} from "../scripts/os01-migration-qualification";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const paths = migrationPaths();
const through0016 = paths.slice(0, 16);
const successors = paths.slice(16);
const expectedHashes = Object.fromEntries([
  ...authorityV1.frozenBaseline.orderedMigrations.map((migration) => [
    migration.path,
    migration.byteSha256
  ]),
  ...authorityV2.orderedHistory.successorMigrations.map((migration) => [
    migration.path,
    migration.byteSha256
  ])
]);
const allReceiptAdditions = [
  ...authorityV1.acceptedProductionFoundation.preservedReceipts,
  {
    version: "0017_engine_os_source_capture",
    migrationHash: "sha256:d25f6119f4d0735247489623e5775cb185c866d7a3f1ebbb791c5f5cfaeac0e7"
  },
  {
    version: "0018_engine_os_forecast_ledger",
    migrationHash: "sha256:851f66b3ad07afe61be346b09f853875e675d25512f989b0f4337f6c64a1c293"
  },
  ...authorityV2.orderedHistory.successorMigrations.map((migration) => ({
    version: migration.receiptVersion,
    migrationHash: `sha256:${migration.receiptDefinitionSha256}`
  }))
];
const successorReceiptAdditions = allReceiptAdditions.slice(-4);
const blankPrestate = qualificationContract.supportedPrestates[0]!;
const legacyPrestate = qualificationContract.supportedPrestates[1]!;

function options(
  prestate: typeof blankPrestate | typeof legacyPrestate,
  receiptAdditions: MigrationRunOptions["expectedReceiptAdditions"],
  overrides: Partial<MigrationRunOptions> = {}
): MigrationRunOptions {
  return {
    expectedPrestate: {
      id: prestate.id,
      schemaFingerprint: prestate.schemaFingerprint,
      objectCounts: prestate.objectCounts
    },
    expectedFinalManifest: terminalManifest,
    expectedMigrationPaths: prestate.id === "blank_ordered_chain" ? paths : successors,
    expectedMigrationByteHashes: expectedHashes,
    expectedReceiptAdditions: receiptAdditions,
    ...overrides
  } as MigrationRunOptions;
}

function legacyDatabase(path = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  applyUnqualifiedFixtureMigrations(db, through0016);
  return db;
}

function seedLegacyRows(db: DatabaseSync): void {
  db.prepare(`INSERT INTO plays (
    id, season, week, play_type, title, legs, book, american_odds, stake_cents,
    model_edge_pp, estimated_ev_percent, confidence, stats_case, football_case,
    status, result, profit_cents, closing_clv_cents, created_by, created_at,
    updated_at, game_id, market, primary_reason, picked_by, contract_json,
    execution_status, cash_placement_confirmed, forecast_json
  ) VALUES (
    ?, 2026, 4, 'single', 'fixture', 'SEA -2.5', 'FanDuel', -105, 2500,
    0.04, 3.2, 'play', 'fixture stats', 'fixture context', 'settled', 'win',
    2381, 4.5, 'fixture-owner', '2026-08-20T00:00:00Z', '2026-08-21T00:00:00Z',
    'game-1', 'spread', 'model_edge', 'gabe', ?, 'paper', 0, ?
  )`).run(
    "legacy-preserved",
    '[{"gameId":"game-1","market":"spread","sourceQuoteId":"fixture-quote"}]',
    '{"configHash":"c","dataHash":"d","consensusSnapshotId":"s","legs":[]}'
  );
}

function evidence(db: DatabaseSync, label: string): DatabaseEvidence {
  return captureDatabaseEvidence(db, label);
}

function schemaAndRows(db: DatabaseSync, label: string): string {
  const captured = evidence(db, label);
  return stableJson({
    schemaFingerprint: captured.schema.schemaFingerprint,
    counts: captured.schema.counts,
    rows: captured.rows,
    foreignKeyViolations: captured.foreignKeyViolations
  });
}

describe("OS-01 isolated migration qualification path", () => {
  it("binds exactly the blank and ordered-through-0016 fixture prestates", () => {
    expect(paths).toHaveLength(20);
    expect(successors).toEqual([
      "drizzle/0017_engine_os_source_capture.sql",
      "drizzle/0018_engine_os_forecast_ledger.sql",
      "drizzle/0019_engine_os_schema_closure.sql",
      "drizzle/0020_engine_os_plays_reconciliation.sql"
    ]);

    const blank = new DatabaseSync(":memory:");
    const blankEvidence = evidence(blank, "blank");
    expect(blankEvidence.schema.schemaFingerprint).toBe(blankPrestate.schemaFingerprint);
    expect(blankEvidence.schema.counts).toEqual(blankPrestate.objectCounts);
    blank.close();

    const legacy = legacyDatabase();
    const legacyEvidence = evidence(legacy, "legacy");
    expect(legacyEvidence.schema.schemaFingerprint).toBe(legacyPrestate.schemaFingerprint);
    expect(legacyEvidence.schema.counts).toEqual(legacyPrestate.objectCounts);
    expect((legacy.prepare("PRAGMA table_xinfo('plays')").all() as Array<{ name: string }>))
      .toHaveLength(29);
    legacy.close();
  });

  it("replays the exact blank 0000-0020 chain atomically to 93/80/76", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    const before = evidence(db, "blank");
    const result = applyQualifiedMigrationRange(
      db,
      preflightClaim(before, "blank_ordered_chain"),
      paths,
      options(blankPrestate, allReceiptAdditions)
    );
    expect(result.appliedMigrationPaths).toEqual(paths);
    expect(result.appliedStatementCount).toBeGreaterThan(100);
    expect(result.finalSchemaFingerprint).toBe(terminalManifest.schemaFingerprint);
    expect(result.finalCounts).toEqual({ table: 93, index: 80, trigger: 76, view: 0 });
    expect(result.foreignKeyViolationCount).toBe(0);
    db.close();
  });

  it("replays the exact production-shaped legacy fixture through 0017-0020 and preserves rows", () => {
    const db = legacyDatabase();
    seedLegacyRows(db);
    const before = evidence(db, "legacy");
    const originalPlay = db.prepare("SELECT * FROM plays WHERE id = 'legacy-preserved'").get() as
      Record<string, unknown>;
    const result = applyQualifiedMigrationRange(
      db,
      preflightClaim(before, "ordered_through_0016_legacy_29"),
      successors,
      options(legacyPrestate, successorReceiptAdditions)
    );
    const migratedPlay = db.prepare("SELECT * FROM plays WHERE id = 'legacy-preserved'").get() as
      Record<string, unknown>;
    for (const [column, value] of Object.entries(originalPlay)) {
      expect(migratedPlay[column], column).toEqual(value);
    }
    expect(migratedPlay).toMatchObject({
      contract_key: "",
      gabe_approved: 0,
      jarrett_approved: 0,
      closing_clv_points: null,
      clv_reference_book: null
    });
    expect(result.finalSchemaFingerprint).toBe(terminalManifest.schemaFingerprint);
    expect(result.finalCounts).toEqual({ table: 93, index: 80, trigger: 76, view: 0 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });

  it("rejects an unknown object before any successor schema write", () => {
    const db = legacyDatabase();
    const qualified = evidence(db, "legacy");
    const claim = preflightClaim(qualified, "ordered_through_0016_legacy_29");
    db.exec("CREATE TABLE unexpected_object (id text PRIMARY KEY)");
    const before = schemaAndRows(db, "mutated");
    expect(() => applyQualifiedMigrationRange(
      db,
      claim,
      successors,
      options(legacyPrestate, successorReceiptAdditions)
    )).toThrow(/preflight claim does not match/u);
    expect(schemaAndRows(db, "mutated")).toBe(before);
    expect(db.prepare(`SELECT name FROM sqlite_schema
      WHERE name = 'source_capture_manifest_extensions'`).get()).toBeUndefined();
    db.close();
  });

  it("rejects a reordered migration range before BEGIN IMMEDIATE", () => {
    const db = legacyDatabase();
    const before = evidence(db, "legacy");
    const beforeState = schemaAndRows(db, "legacy");
    const reordered = [successors[1]!, successors[0]!, ...successors.slice(2)];
    expect(() => applyQualifiedMigrationRange(
      db,
      preflightClaim(before, "ordered_through_0016_legacy_29"),
      reordered,
      options(legacyPrestate, successorReceiptAdditions)
    )).toThrow(/missing, duplicated, or out of order/u);
    expect(schemaAndRows(db, "legacy")).toBe(beforeState);
    expect(db.isTransaction).toBe(false);
    db.close();
  });

  it("revalidates under BEGIN IMMEDIATE and rolls back a just-in-time prestate mutation", () => {
    const db = legacyDatabase();
    const before = evidence(db, "legacy");
    const beforeState = schemaAndRows(db, "legacy");
    expect(() => applyQualifiedMigrationRange(
      db,
      preflightClaim(before, "ordered_through_0016_legacy_29"),
      successors,
      options(legacyPrestate, successorReceiptAdditions, {
        afterQuiesce: () => db.exec("CREATE TABLE raced_object (id integer)")
      })
    )).toThrow(/immediate pre-write revalidation failed|exact supported prestate/u);
    expect(schemaAndRows(db, "legacy")).toBe(beforeState);
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'raced_object'").get())
      .toBeUndefined();
    db.close();
  });

  it("holds the write lock from revalidation through commit", () => {
    const directory = mkdtempSync(join(tmpdir(), "os01-quiescence-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "quiescence.sqlite");
    const db = legacyDatabase(databasePath);
    const contender = new DatabaseSync(databasePath);
    contender.exec("PRAGMA busy_timeout = 0");
    const before = evidence(db, "legacy");
    let contenderBlocked = false;
    applyQualifiedMigrationRange(
      db,
      preflightClaim(before, "ordered_through_0016_legacy_29"),
      successors,
      options(legacyPrestate, successorReceiptAdditions, {
        afterQuiesce: () => {
          try {
            contender.exec("CREATE TABLE concurrent_writer (id integer)");
          } catch (error) {
            contenderBlocked = /locked|busy/u.test(String(error));
          }
          if (!contenderBlocked) throw new Error("concurrent writer was not fenced");
        }
      })
    );
    expect(contenderBlocked).toBe(true);
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'concurrent_writer'").get())
      .toBeUndefined();
    contender.close();
    db.close();
  });

  it("rolls back the actual 0017-0020 path when a partial failure is injected", () => {
    const db = legacyDatabase();
    seedLegacyRows(db);
    const before = evidence(db, "legacy");
    const beforeState = schemaAndRows(db, "legacy");
    expect(() => applyQualifiedMigrationRange(
      db,
      preflightClaim(before, "ordered_through_0016_legacy_29"),
      successors,
      options(legacyPrestate, successorReceiptAdditions, {
        afterStatement: ({ migrationPath, statementIndex }) => {
          if (migrationPath.endsWith("0019_engine_os_schema_closure.sql") && statementIndex === 12) {
            throw new Error("injected isolated D1-equivalent failure");
          }
        }
      })
    )).toThrow(/injected isolated/u);
    expect(schemaAndRows(db, "legacy")).toBe(beforeState);
    expect(db.prepare(`SELECT version FROM engine_schema_versions
      WHERE version IN ('0017_engine_os_source_capture', '0018_engine_os_forecast_ledger',
        '0019_engine_os_schema_closure', '0020_engine_os_plays_reconciliation')`).all())
      .toEqual([]);
    expect(db.prepare("SELECT profit_cents FROM plays WHERE id = 'legacy-preserved'").get())
      .toEqual({ profit_cents: 2381 });
    db.close();
  });

  it("performs no fallible database evidence read after COMMIT", () => {
    const db = legacyDatabase();
    const before = evidence(db, "legacy");
    const originalExec = db.exec.bind(db);
    Object.defineProperty(db, "exec", {
      configurable: true,
      value: (statement: string) => {
        originalExec(statement);
        if (statement === "COMMIT") db.close();
      }
    });
    const result = applyQualifiedMigrationRange(
      db,
      preflightClaim(before, "ordered_through_0016_legacy_29"),
      successors,
      options(legacyPrestate, successorReceiptAdditions)
    );
    expect(result.finalSchemaFingerprint).toBe(terminalManifest.schemaFingerprint);
    expect(result.finalCounts).toEqual({ table: 93, index: 80, trigger: 76, view: 0 });
  });

  it("proves an online backup restores the exact prestate and rejects corrupt backup bytes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "os01-backup-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "source.sqlite");
    const backupPath = join(directory, "backup.sqlite");
    const restoredPath = join(directory, "restored.sqlite");
    const corruptPath = join(directory, "corrupt.sqlite");
    const db = legacyDatabase(databasePath);
    seedLegacyRows(db);
    const before = evidence(db, "legacy");
    const beforeComparable = schemaAndRows(db, "legacy");

    expect(await backup(db, backupPath)).toBeGreaterThan(0);
    applyQualifiedMigrationRange(
      db,
      preflightClaim(before, "ordered_through_0016_legacy_29"),
      successors,
      options(legacyPrestate, successorReceiptAdditions)
    );
    db.close();

    copyFileSync(backupPath, restoredPath);
    const restored = new DatabaseSync(restoredPath);
    expect(schemaAndRows(restored, "legacy")).toBe(beforeComparable);
    expect(restored.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    restored.close();

    copyFileSync(backupPath, corruptPath);
    truncateSync(corruptPath, 512);
    expect(() => {
      const corrupt = new DatabaseSync(corruptPath, { readOnly: true });
      try {
        captureDatabaseEvidence(corrupt, "legacy");
      } finally {
        corrupt.close();
      }
    }).toThrow();
  });
});
