import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import successor from "../config/d1-schema-authority.v2.json";

type Contract = typeof successor;

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function deepClone(value: Contract): Contract {
  return JSON.parse(JSON.stringify(value)) as Contract;
}

function validate(candidate: Contract): string[] {
  const errors: string[] = [];
  if (candidate.version !== "d1-schema-authority.2026.2") errors.push("version");
  if (candidate.status !== "local_candidate_not_production_qualified") errors.push("status");
  if (fileSha256(candidate.predecessorContract.path) !== candidate.predecessorContract.byteSha256) {
    errors.push("predecessor hash");
  }
  const history = candidate.orderedHistory;
  if (fileSha256(history.predecessorJournalArchive.path) !== history.predecessorJournalArchive.byteSha256) {
    errors.push("frozen journal hash");
  }
  if (fileSha256(history.activeJournal.path) !== history.activeJournal.byteSha256) {
    errors.push("active journal hash");
  }
  const journal = JSON.parse(readFileSync(history.activeJournal.path, "utf8")) as {
    version: string;
    dialect: string;
    entries: Array<{ idx: number; tag: string }>;
  };
  if (journal.version !== history.activeJournal.journalVersion) errors.push("journal version");
  if (journal.dialect !== history.activeJournal.dialect) errors.push("journal dialect");
  if (journal.entries.length !== history.activeJournal.entryCount) errors.push("journal length");
  if (journal.entries.some((entry, index) => entry.idx !== index)) errors.push("journal order");
  const successorTags = journal.entries.slice(history.activeJournal.frozenPrefixEntryCount).map((entry) => entry.tag);
  if (JSON.stringify(successorTags) !== JSON.stringify(history.activeJournal.successorTags)) {
    errors.push("successor tags");
  }
  const migrations = history.successorMigrations;
  if (migrations.length !== 2) errors.push("migration count");
  if (new Set(migrations.map((migration) => migration.path)).size !== migrations.length) errors.push("duplicate migration");
  for (const [index, migration] of migrations.entries()) {
    if (migration.order !== history.activeJournal.frozenPrefixEntryCount + index) errors.push(`migration order ${index}`);
    if (migration.receiptVersion !== history.activeJournal.successorTags[index]) errors.push(`migration tag ${index}`);
    if (fileSha256(migration.path) !== migration.byteSha256) errors.push(`migration hash ${index}`);
    const sql = readFileSync(migration.path, "utf8");
    if (!sql.includes(`'${migration.receiptVersion}'`) || !sql.includes(`'sha256:${migration.receiptDefinitionSha256}'`)) {
      errors.push(`receipt binding ${index}`);
    }
  }
  for (const [index, rollback] of history.successorRollbacks.entries()) {
    if (fileSha256(rollback.path) !== rollback.byteSha256) errors.push(`rollback hash ${index}`);
    if (rollback.scope !== "empty_isolated_qualification_only") errors.push(`rollback scope ${index}`);
  }
  if (fileSha256(candidate.typedProjection.rootPath) !== candidate.typedProjection.rootByteSha256) {
    errors.push("typed root hash");
  }
  for (const component of candidate.typedProjection.componentFiles) {
    if (fileSha256(component.path) !== component.byteSha256) errors.push(`typed component ${component.path}`);
  }
  if (fileSha256(candidate.typedProjection.snapshot.path) !== candidate.typedProjection.snapshot.byteSha256) {
    errors.push("snapshot hash");
  }
  if (fileSha256(candidate.typedProjection.parityTest.path) !== candidate.typedProjection.parityTest.byteSha256) {
    errors.push("parity test hash");
  }
  const manifestBinding = candidate.physicalProjection.manifest;
  if (fileSha256(manifestBinding.path) !== manifestBinding.byteSha256) errors.push("manifest hash");
  const manifest = JSON.parse(readFileSync(manifestBinding.path, "utf8")) as {
    migrationSetHash: string;
    schemaFingerprint: string;
    counts: Record<string, number>;
  };
  if (manifest.migrationSetHash !== manifestBinding.migrationSetSha256) errors.push("migration set");
  if (manifest.schemaFingerprint !== manifestBinding.schemaFingerprintSha256) errors.push("schema fingerprint");
  if (JSON.stringify(manifest.counts) !== JSON.stringify(manifestBinding.objectCounts)) errors.push("object counts");
  const ownership = candidate.physicalProjection.ownershipRegistry;
  if (fileSha256(ownership.path) !== ownership.byteSha256) errors.push("ownership hash");
  if (candidate.runtimeBoundary.terminalReceiptVersion !== migrations[1]?.receiptVersion) errors.push("runtime version");
  if (candidate.runtimeBoundary.terminalReceiptDefinitionSha256 !== migrations[1]?.receiptDefinitionSha256) {
    errors.push("runtime receipt hash");
  }
  for (const artifact of candidate.runtimeBoundary.implementationArtifacts) {
    if (fileSha256(artifact.path) !== artifact.byteSha256) errors.push(`runtime artifact ${artifact.path}`);
  }
  const cleanBuild = candidate.qualifiedLocalEvidence.cleanBuildReceipt;
  if (fileSha256(cleanBuild.path) !== cleanBuild.byteSha256) errors.push("clean build receipt hash");
  const cleanBuildReceipt = JSON.parse(readFileSync(cleanBuild.path, "utf8")) as {
    sourceIsolation: { buildRelevantInputSha256: string };
    verification: { buildAggregateSha256: string };
  };
  if (cleanBuildReceipt.sourceIsolation.buildRelevantInputSha256 !== cleanBuild.buildRelevantInputSha256) {
    errors.push("clean build source hash");
  }
  if (cleanBuildReceipt.verification.buildAggregateSha256 !== cleanBuild.buildAggregateSha256) {
    errors.push("clean build output hash");
  }
  if (candidate.scope.providerSecretAccessAllowed || candidate.scope.providerDispatchAllowed ||
    candidate.scope.quotaReservationAllowed || candidate.scope.captureActivationAllowed ||
    candidate.scope.productionForecastChangeAllowed) errors.push("forbidden boundary opened");
  if (candidate.qualification.os01Accepted || candidate.qualification.arc03Accepted ||
    candidate.qualification.productionMigrationApplied || candidate.qualification.productionActivationPresent ||
    candidate.qualification.prospectiveEvidenceClaimed) errors.push("acceptance overclaim");
  return errors;
}

describe("OS-01 local successor schema-authority contract", () => {
  it("binds the immutable predecessor and exact 0019/0020 candidate", () => {
    expect(validate(successor)).toEqual([]);
  });

  it.each([
    ["missing", (candidate: Contract) => { candidate.orderedHistory.successorMigrations.pop(); }],
    ["duplicate", (candidate: Contract) => { candidate.orderedHistory.successorMigrations[1] = candidate.orderedHistory.successorMigrations[0]!; }],
    ["reordered", (candidate: Contract) => { candidate.orderedHistory.successorMigrations.reverse(); }],
    ["hash", (candidate: Contract) => { candidate.orderedHistory.successorMigrations[0]!.byteSha256 = "0".repeat(64); }]
  ])("rejects a %s successor migration mutation", (_label, mutate) => {
    const candidate = deepClone(successor);
    mutate(candidate);
    expect(validate(candidate).length).toBeGreaterThan(0);
  });

  it("keeps all external and production gates explicitly closed", () => {
    expect(successor.supportedProductionPrestate).toMatchObject({
      readOnlyCensusStatus: "pending",
      rowPreservationManifestStatus: "pending",
      preMigrationBackupStatus: "pending",
      unknownOrMismatchedPrestateBehavior: "abort_without_schema_write"
    });
    expect(successor.remainingQualificationGates).toContain("exact_production_semantic_census");
    expect(successor.remainingQualificationGates).toContain("backup_restore_drill");
    expect(successor.remainingQualificationGates).not.toContain("fresh_sanitized_build_and_built_output_scan");
    expect(successor.qualification).toMatchObject({
      currentResult: "not_run",
      os01Accepted: false,
      arc03Accepted: false,
      productionMigrationApplied: false,
      providerCalls: 0,
      quotaReservations: 0
    });
  });
});
