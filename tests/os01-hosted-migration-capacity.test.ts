import { describe, expect, it } from "vitest";

import {
  calculateHostedMigrationCapacity,
  splitSqlStatements
} from "../scripts/os01-hosted-migration-capacity";
import { loadOs01HostedMigrationAuthority } from "../scripts/os01-hosted-migration-authority";

describe("OS-01 hosted migration capacity accounting", () => {
  it("does not split comments, strings, quoted identifiers, or trigger bodies", () => {
    const source = `
      -- a comment with ; semicolons ;
      CREATE TABLE "quoted;table" (id integer, value text DEFAULT 'a;b');
      /* another ; comment */
      CREATE TRIGGER trigger_with_case AFTER INSERT ON "quoted;table"
      BEGIN
        SELECT CASE WHEN NEW.id < 0 THEN RAISE(ABORT, 'bad;id') END;
        UPDATE "quoted;table" SET value = 'still;one' WHERE id = NEW.id;
      END;
      SELECT '[not;a;boundary]', [also;quoted];
    `;
    const statements = splitSqlStatements(source);
    expect(statements).toHaveLength(3);
    expect(statements[1]).toContain("CREATE TRIGGER");
    expect(statements[1]).toContain("UPDATE");
  });

  it("rejects unterminated strings, comments, and trigger bodies", () => {
    expect(() => splitSqlStatements("SELECT 'unterminated")).toThrow("unterminated SQLite single quote");
    expect(() => splitSqlStatements("SELECT 1; /* unterminated")).toThrow("unterminated SQLite block comment");
    expect(() => splitSqlStatements("CREATE TRIGGER t AFTER INSERT ON x BEGIN SELECT 1;"))
      .toThrow("unterminated SQLite trigger body");
  });

  it("proves the frozen migrations require 489 D1 queries for blank replay", () => {
    const authority = loadOs01HostedMigrationAuthority(process.cwd());
    const capacity = calculateHostedMigrationCapacity(authority);
    expect(capacity).toEqual({
      version: "engine-os.os01-hosted-migration-capacity.v1",
      migrationStatements: 291,
      guardStatements: 4,
      blankReplayBatchStatements: 295,
      blankPrestateQueries: 4,
      blankTerminalQueries: 190,
      blankReplayInvocationQueries: 489,
      successorMigrationStatements: 133,
      successorBatchStatements: 137,
      embeddedMultiStatementEntries: [
        {
          path: "drizzle/0010_confidence_engine.sql",
          breakpointEntry: 0,
          statements: 13
        },
        {
          path: "drizzle/0011_model_gate_evidence.sql",
          breakpointEntry: 0,
          statements: 4
        },
        {
          path: "drizzle/0012_source_snapshot_timing.sql",
          breakpointEntry: 0,
          statements: 5
        }
      ]
    });
    const breakpointCount = authority.migrations.reduce((total, migration) =>
      total + migration.source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean).length,
    0);
    expect(breakpointCount).toBe(272);
    expect(capacity.migrationStatements - breakpointCount).toBe(19);
    expect(authority.migrationBundleHash)
      .toBe("b72fae202662ae4cf689c4656bc762944264e9a59e637582b9fa0b4e0a31e122");
  });
});
