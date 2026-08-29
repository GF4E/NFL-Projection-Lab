import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

import { OS01_STAGING_FOREIGN_KEY_CANDIDATES, OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT } from
  "../../qualification/os01-staging-foreign-keys/contract";
import { OS01_STAGING_FOREIGN_KEYS_UPLOAD_METHOD_IDENTITY } from
  "../../scripts/os01_staging_foreign_keys_controller";
import type {
  ControlPlaneObservationInput,
  PreregisteredArtifactIdentity,
  ResponseValidationIdentity
} from "../../scripts/os01_staging_foreign_keys_controller";

type Prepared = { sql: string };
type BatchResult = { success: true; results: Array<Record<string, unknown>> };

export function os01ForeignKeyHostedResponse(): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(
    ".planning/engine-os/execution/os-01/generation10-hosted-authority-v1/response.json"
  ), "utf8")) as Record<string, unknown>;
}

function replayRows(): Map<string, Array<Record<string, unknown>>> {
  const objects = os01ForeignKeyHostedResponse().objects as Array<{
    type: string;
    name: string;
    tblName: string;
    createSql: string;
  }>;
  const priority: Record<string, number> = { table: 0, view: 1, index: 2, trigger: 3 };
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE");
    for (const object of [...objects].sort((left, right) =>
      (priority[left.type] ?? 99) - (priority[right.type] ?? 99) ||
      left.name.localeCompare(right.name) || left.tblName.localeCompare(right.tblName))) {
      database.exec(object.createSql);
    }
    database.exec("COMMIT");
    return new Map(OS01_STAGING_FOREIGN_KEY_CANDIDATES.map((candidate) => [
      candidate.sourceTable,
      database.prepare(`PRAGMA foreign_key_list("${candidate.sourceTable}")`).all() as Array<Record<string, unknown>>
    ]));
  } finally {
    database.close();
  }
}

export function os01ForeignKeyDatabase(mutate?: (
  sql: string,
  ordinal: number,
  result: BatchResult
) => BatchResult): {
  prepare(sql: string): Prepared;
  batch(values: Prepared[]): Promise<BatchResult[]>;
} {
  const catalog = os01ForeignKeyHostedResponse().catalog as Array<Record<string, unknown>>;
  const foreignKeys = replayRows();
  return {
    prepare(sql: string) { return { sql }; },
    async batch(values: Prepared[]) {
      return values.map((value, ordinal) => {
        const match = /^PRAGMA foreign_key_list\("([A-Za-z0-9_]+)"\)$/u.exec(value.sql);
        const result = {
          success: true as const,
          results: match ? structuredClone(foreignKeys.get(match[1]!) ?? []) : structuredClone(catalog)
        };
        return mutate ? mutate(value.sql, ordinal, result) : result;
      });
    }
  };
}

export const os01ForeignKeyResponseIdentity: ResponseValidationIdentity = Object.freeze({
  catalogHash: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogHash,
  catalogRows: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogRows,
  candidateRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
  normalizedForeignKeyRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot,
  foreignKeyConstraintCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyConstraintCount,
  foreignKeyColumnRowCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyColumnRowCount
});

export function os01ForeignKeyObservationInput(phase: "pre" | "post"): ControlPlaneObservationInput {
  return {
    phase,
    sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    versionId: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId + "~appgver_" + "2".repeat(32),
    versionNumber: 21,
    deploymentId: "appgdep_" + "3".repeat(32),
    deploymentStatus: "succeeded",
    deploymentUrl: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin,
    workerSha256: "c".repeat(64),
    manifestSha256: "d".repeat(64),
    archiveSha256: "e".repeat(64),
    archiveFileListRoot: "1".repeat(64),
    archiveContentRoot: "2".repeat(64),
    archiveFileCount: 4,
    archiveBytes: 8_192,
    uploadMethodIdentity: OS01_STAGING_FOREIGN_KEYS_UPLOAD_METHOD_IDENTITY,
    remoteBuildRequested: false,
    accessRevision: 1,
    ownerIdentityHash: "f".repeat(64),
    environmentRevision: 0,
    environmentKeyNames: [],
    recordedAt: phase === "pre" ? "2026-08-29T08:00:00.000Z" : "2026-08-29T08:01:00.000Z"
  };
}

export function os01ForeignKeyArtifactIdentity(
  input = os01ForeignKeyObservationInput("pre")
): PreregisteredArtifactIdentity {
  return {
    sourceCommit: input.sourceCommit,
    sourceTree: input.sourceTree,
    workerSha256: input.workerSha256,
    manifestSha256: input.manifestSha256,
    archiveSha256: input.archiveSha256,
    archiveFileListRoot: input.archiveFileListRoot,
    archiveContentRoot: input.archiveContentRoot,
    archiveFileCount: input.archiveFileCount,
    archiveBytes: input.archiveBytes,
    uploadMethodIdentity: input.uploadMethodIdentity,
    remoteBuildRequested: false
  };
}
