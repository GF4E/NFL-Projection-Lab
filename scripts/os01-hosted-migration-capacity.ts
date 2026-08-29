#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

import { loadOs01HostedMigrationAuthority } from "./os01-hosted-migration-authority";
import type { Os01HostedMigrationAuthority } from "../qualification/os01-hosted-migration/core";
import { splitHostedSqlStatements } from "../qualification/os01-hosted-migration/sql-statements";

export { splitHostedSqlStatements as splitSqlStatements };

export type HostedMigrationCapacity = {
  version: "engine-os.os01-hosted-migration-capacity.v1";
  migrationStatements: number;
  guardStatements: 4;
  blankReplayBatchStatements: number;
  blankPrestateQueries: 4;
  blankTerminalQueries: number;
  blankReplayInvocationQueries: number;
  successorMigrationStatements: number;
  successorBatchStatements: number;
  embeddedMultiStatementEntries: Array<{
    path: string;
    breakpointEntry: number;
    statements: number;
  }>;
};

export function calculateHostedMigrationCapacity(
  authority: Os01HostedMigrationAuthority
): HostedMigrationCapacity {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const embeddedMultiStatementEntries: HostedMigrationCapacity["embeddedMultiStatementEntries"] = [];
  let migrationStatements = 0;
  let successorMigrationStatements = 0;
  try {
    database.exec("BEGIN IMMEDIATE");
    for (const migration of authority.migrations) {
      const entries = migration.source.split("--> statement-breakpoint");
      let migrationCount = 0;
      for (const [entryIndex, entry] of entries.entries()) {
        const parsed = splitHostedSqlStatements(entry);
        if (parsed.length > 1) {
          embeddedMultiStatementEntries.push({
            path: migration.path,
            breakpointEntry: entryIndex,
            statements: parsed.length
          });
        }
        for (const statement of parsed) {
          database.exec(statement);
          migrationCount += 1;
        }
      }
      migrationStatements += migrationCount;
      if (migration.order >= 16) successorMigrationStatements += migrationCount;
    }
    database.exec("ROLLBACK");
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
  const guardStatements = 4 as const;
  const blankPrestateQueries = 4 as const;
  const blankTerminalQueries = 4 + authority.terminalManifest.counts.table * 2;
  const blankReplayBatchStatements = migrationStatements + guardStatements;
  return {
    version: "engine-os.os01-hosted-migration-capacity.v1",
    migrationStatements,
    guardStatements,
    blankReplayBatchStatements,
    blankPrestateQueries,
    blankTerminalQueries,
    blankReplayInvocationQueries: blankPrestateQueries + blankReplayBatchStatements + blankTerminalQueries,
    successorMigrationStatements,
    successorBatchStatements: successorMigrationStatements + guardStatements,
    embeddedMultiStatementEntries
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const authority = loadOs01HostedMigrationAuthority(process.cwd());
  process.stdout.write(`${JSON.stringify(calculateHostedMigrationCapacity(authority), null, 2)}\n`);
}
