import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import contract from "../config/d1-schema-authority.v1.json";

const EXPECTED_BASE_COMMIT = "636c419777a09380fe38dce804e6df5c4e374110";
const EXPECTED_MIGRATIONS = [
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
  "drizzle/0018_engine_os_forecast_ledger.sql"
] as const;

const EXPECTED_FORBIDDEN_DDL = [
  "CREATE",
  "ALTER",
  "DROP",
  "TRUNCATE",
  "PRAGMA_WRITE",
  "VACUUM",
  "REINDEX",
  "ATTACH",
  "DETACH"
] as const;

type SchemaAuthorityContract = typeof contract;
type Journal = {
  version: string;
  dialect: string;
  entries: Array<{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
};

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function migrationTag(path: string): string {
  return path.replace(/^drizzle\//, "").replace(/\.sql$/, "");
}

function readJournal(path: string): Journal {
  return JSON.parse(readFileSync(path, "utf8")) as Journal;
}

function validateFrozenContract(candidate: SchemaAuthorityContract): string[] {
  const errors: string[] = [];
  const paths = candidate.frozenBaseline.orderedMigrations.map((migration) => migration.path);
  if (candidate.version !== "d1-schema-authority.2026.1") errors.push("version changed");
  if (candidate.status !== "frozen_contract_not_qualified") errors.push("status overclaims qualification");
  if (candidate.baseCommit !== EXPECTED_BASE_COMMIT) errors.push("base commit changed");
  if (JSON.stringify(paths) !== JSON.stringify(EXPECTED_MIGRATIONS)) errors.push("migration order changed");
  if (new Set(paths).size !== paths.length) errors.push("migration path duplicated");
  for (const [index, migration] of candidate.frozenBaseline.orderedMigrations.entries()) {
    if (migration.order !== index) errors.push(`migration order field changed at ${index}`);
    if (migration.path !== EXPECTED_MIGRATIONS[index]) errors.push(`migration path changed at ${index}`);
    if (!/^[0-9a-f]{64}$/.test(migration.byteSha256)) errors.push(`invalid migration hash at ${index}`);
    else if (fileSha256(migration.path) !== migration.byteSha256) errors.push(`migration bytes changed at ${index}`);
  }
  const journal = candidate.frozenBaseline.journal;
  if (journal.path !== ".planning/engine-os/execution/os-01/frozen-journal-through-0018.json") {
    errors.push("journal archive path changed");
  }
  if (journal.activePath !== "drizzle/meta/_journal.json") errors.push("active journal path changed");
  if (
    journal.activeJournalPolicy !==
    "archived_entries_must_be_an_exact_immutable_prefix_successors_may_append_only"
  ) {
    errors.push("active journal append-only policy changed");
  }
  if (journal.entryCount !== EXPECTED_MIGRATIONS.length) errors.push("journal entry count changed");
  if (fileSha256(journal.path) !== journal.byteSha256) errors.push("journal archive bytes changed");
  const archivedJournal = readJournal(journal.path);
  const activeJournal = readJournal(journal.activePath);
  if (activeJournal.version !== archivedJournal.version || activeJournal.dialect !== archivedJournal.dialect) {
    errors.push("active journal header changed");
  }
  if (activeJournal.entries.length < archivedJournal.entries.length) errors.push("active journal lost frozen entries");
  if (
    JSON.stringify(activeJournal.entries.slice(0, archivedJournal.entries.length)) !==
    JSON.stringify(archivedJournal.entries)
  ) {
    errors.push("active journal frozen prefix changed");
  }
  if (activeJournal.entries.some((entry, index) => entry.idx !== index)) {
    errors.push("active journal indexes are not contiguous");
  }
  if (new Set(activeJournal.entries.map((entry) => entry.tag)).size !== activeJournal.entries.length) {
    errors.push("active journal tag duplicated");
  }
  const prestates = candidate.supportedPrestates.map((prestate) => prestate.id);
  if (JSON.stringify(prestates) !== JSON.stringify(["blank_ordered_chain", "exact_production_census"])) {
    errors.push("supported prestate set changed");
  }
  if (candidate.supportedPrestates[1]?.finalSchemaFingerprintStatus !== "not_computed") {
    errors.push("final schema fingerprint was invented");
  }
  if (JSON.stringify(candidate.runtimeDdlPolicy.forbiddenOperations) !== JSON.stringify(EXPECTED_FORBIDDEN_DDL)) {
    errors.push("runtime DDL prohibition changed");
  }
  if (candidate.runtimeDdlPolicy.runtimeSchemaCheck.runtimeRepairAllowed) errors.push("runtime repair enabled");
  if (candidate.runtimeDdlPolicy.deployableGraphMayImportMigrationSql) errors.push("runtime migration import enabled");
  if (candidate.qualification.os01Accepted || candidate.qualification.arc03Accepted) {
    errors.push("contract freeze claimed acceptance");
  }
  if (candidate.qualification.finalSchemaFingerprintRecorded || candidate.qualification.productionCensusRecorded) {
    errors.push("unproduced schema evidence claimed");
  }
  const boundary = candidate.providerAndActivationBoundary;
  if (
    boundary.providerSecretAccessAllowed || boundary.providerDispatchAllowed ||
    boundary.quotaReservationAllowed || boundary.captureActivationAllowed ||
    boundary.productionForecastChangeAllowed || boundary.expectedProviderCalls !== 0 ||
    boundary.expectedQuotaReservations !== 0 || !boundary.engineOsCaptureEnabledMustRemainAbsent
  ) {
    errors.push("provider or activation boundary opened");
  }
  return errors;
}

describe("OS-01 frozen D1 schema-authority contract", () => {
  it("pins the exact pre-OS-01 migration history without rewriting it", () => {
    expect(validateFrozenContract(contract)).toEqual([]);
    const archivedJournal = readJournal(contract.frozenBaseline.journal.path);
    const activeJournal = readJournal(contract.frozenBaseline.journal.activePath);
    expect(archivedJournal.version).toBe(contract.frozenBaseline.journal.journalVersion);
    expect(archivedJournal.dialect).toBe(contract.frozenBaseline.journal.dialect);
    expect(archivedJournal.entries).toHaveLength(EXPECTED_MIGRATIONS.length);
    expect(archivedJournal.entries.map((entry) => entry.idx))
      .toEqual(EXPECTED_MIGRATIONS.map((_, index) => index));
    expect(archivedJournal.entries.map((entry) => entry.tag))
      .toEqual(EXPECTED_MIGRATIONS.map(migrationTag));
    expect(activeJournal.entries.slice(0, archivedJournal.entries.length)).toEqual(archivedJournal.entries);
    expect(activeJournal.entries.length).toBeGreaterThanOrEqual(archivedJournal.entries.length);
    expect(activeJournal.entries.map((entry) => entry.idx))
      .toEqual(activeJournal.entries.map((_, index) => index));
    expect(contract.frozenBaseline.historyPolicy).toMatchObject({
      priorMigrationBytesMutable: false,
      priorJournalEntriesMutable: false,
      squashAllowed: false,
      renumberAllowed: false,
      retroactiveAppliedAtSynthesisAllowed: false,
      successorMigrationRequiresSuccessorContract: true,
      unknownMissingDuplicateReorderedOrHashChangedEntryBehavior: "abort_before_schema_write"
    });
  });

  it("binds the accepted production foundation without promoting it to a full census", () => {
    const foundation = contract.acceptedProductionFoundation;
    expect(fileSha256(foundation.authorityReceiptPath)).toBe(foundation.authorityReceiptByteSha256);
    const receipt = JSON.parse(readFileSync(foundation.authorityReceiptPath, "utf8")) as {
      preservedReceipts: Array<{ version: string; migrationHash: string }>;
      directVerification: {
        schemaFingerprint: string;
        schemaObjectCounts: { tables: number; indexes: number; appendOnlyTriggers: number };
        foreignKeyViolationCount: number;
        tableCounts: { odds_quota_reservations: number; odds_quota_reservation_events: number };
        bootstrap: { used: number; remaining: number };
      };
    };
    expect(receipt.preservedReceipts.map(({ version, migrationHash }) => ({ version, migrationHash })))
      .toEqual(foundation.preservedReceipts);
    expect(receipt.directVerification.schemaFingerprint).toBe(foundation.schemaFingerprint);
    expect(receipt.directVerification.schemaObjectCounts).toEqual(foundation.schemaObjectCounts);
    expect(receipt.directVerification.foreignKeyViolationCount).toBe(foundation.foreignKeyViolationCount);
    expect(receipt.directVerification.bootstrap).toMatchObject({
      used: foundation.quotaBootstrap.used,
      remaining: foundation.quotaBootstrap.remaining
    });
    expect(receipt.directVerification.tableCounts.odds_quota_reservations)
      .toBe(foundation.quotaBootstrap.outstandingReservations);
    expect(receipt.directVerification.tableCounts.odds_quota_reservation_events)
      .toBe(foundation.quotaBootstrap.reservationEvents);
    expect(contract.supportedPrestates[1]).toMatchObject({
      id: "exact_production_census",
      censusArtifactStatus: "required_not_yet_recorded",
      finalSchemaFingerprintStatus: "not_computed",
      onMismatch: "abort_without_repair_or_schema_write"
    });
    expect(contract.qualification.productionCensusRecorded).toBe(false);
    expect(contract.qualification.finalSchemaFingerprintRecorded).toBe(false);
  });

  it("requires semantic parity and fail-closed runtime schema behavior", () => {
    expect(contract.semanticManifest.tableIntrospection).toEqual([
      "pragma_table_list",
      "pragma_table_xinfo",
      "pragma_foreign_key_list",
      "pragma_index_list",
      "pragma_index_xinfo"
    ]);
    expect(contract.semanticManifest.sqlNormalization).toMatchObject({
      method: "sqlite_parser_ast_or_equivalent_token_stream",
      whitespaceOrQuoteStyleSemantic: false,
      regexParsingNestedExpressionsAllowed: false,
      preserveCheckGeneratedDeferrablePartialIndexAndTriggerSemantics: true
    });
    expect(contract.semanticManifest.parityRules).toMatchObject({
      migrationProjectionMustEqualFinalPhysicalManifest: true,
      typedProjectionMustCoverEveryApplicationTable: true,
      productionProjectionMustEqualQualifiedPrestateBeforeWrite: true,
      postMigrationProductionProjectionMustEqualFinalPhysicalManifest: true,
      missingOrExtraApplicationObjectAllowed: false,
      perObjectHashesRequired: true,
      aggregateHashRequired: true
    });
    expect(contract.semanticManifest.explicitInternalObjectExclusions.unknownObjectBehavior).toBe("drift_failure");
    expect(contract.runtimeDdlPolicy).toMatchObject({
      mode: "fail_closed",
      deployableGraphMayImportMigrationSql: false,
      initializerMayCreateAlterDropOrRepairSchema: false
    });
    expect(contract.runtimeDdlPolicy.runtimeSchemaCheck).toEqual({
      operation: "select_only_terminal_version_and_hash_assertion",
      missingOldUnknownOrMismatchedSchemaBehavior: "fail_without_write",
      runtimeRepairAllowed: false,
      publicReadMayWrite: false
    });
  });

  it("uses the frozen recovery targets and forward-only production semantics", () => {
    expect(fileSha256(contract.recovery.operatingContractPath)).toBe(contract.recovery.operatingContractByteSha256);
    const operating = JSON.parse(readFileSync(contract.recovery.operatingContractPath, "utf8")) as {
      recovery: {
        d1MetadataRpoSeconds: number;
        serviceRtoSeconds: number;
        d1BackupFrequencySeconds: number;
        restoreDrillFrequencyDays: number;
      };
      retentionDays: { recoverableBackups: number };
    };
    expect(contract.recovery).toMatchObject({
      d1MetadataRpoSeconds: operating.recovery.d1MetadataRpoSeconds,
      serviceRtoSeconds: operating.recovery.serviceRtoSeconds,
      d1BackupFrequencySeconds: operating.recovery.d1BackupFrequencySeconds,
      restoreDrillFrequencyDays: operating.recovery.restoreDrillFrequencyDays,
      recoverableBackupRetentionDays: operating.retentionDays.recoverableBackups,
      productionMigrationMode: "forward_only",
      downMigrationScope: "empty_isolated_qualification_only",
      preMigrationSnapshotRequired: true,
      r2MutationAllowed: false
    });
    expect(contract.recovery.restoreMustVerify).toEqual(expect.arrayContaining([
      "semantic_schema_fingerprint",
      "row_counts_and_content_hashes",
      "migration_receipts",
      "foreign_key_check",
      "accepted_foundation"
    ]));
  });

  it("falsifies history, prestate, runtime-DDL, acceptance, and provider-boundary mutations", () => {
    const reordered = structuredClone(contract);
    [reordered.frozenBaseline.orderedMigrations[0], reordered.frozenBaseline.orderedMigrations[1]] =
      [reordered.frozenBaseline.orderedMigrations[1]!, reordered.frozenBaseline.orderedMigrations[0]!];
    expect(validateFrozenContract(reordered)).toContain("migration order changed");

    const changedHash = structuredClone(contract);
    changedHash.frozenBaseline.orderedMigrations[0]!.byteSha256 = "0".repeat(64);
    expect(validateFrozenContract(changedHash)).toContain("migration bytes changed at 0");

    const inventedCensus = structuredClone(contract);
    inventedCensus.supportedPrestates[1]!.finalSchemaFingerprintStatus = "not_computed";
    inventedCensus.qualification.finalSchemaFingerprintRecorded = true;
    expect(validateFrozenContract(inventedCensus)).toContain("unproduced schema evidence claimed");

    const openedRuntime = structuredClone(contract);
    openedRuntime.runtimeDdlPolicy.forbiddenOperations = openedRuntime.runtimeDdlPolicy.forbiddenOperations
      .filter((operation) => operation !== "ALTER") as typeof openedRuntime.runtimeDdlPolicy.forbiddenOperations;
    expect(validateFrozenContract(openedRuntime)).toContain("runtime DDL prohibition changed");

    const overclaim = structuredClone(contract);
    overclaim.qualification.os01Accepted = true;
    expect(validateFrozenContract(overclaim)).toContain("contract freeze claimed acceptance");

    const providerOpened = structuredClone(contract);
    providerOpened.providerAndActivationBoundary.providerDispatchAllowed = true;
    expect(validateFrozenContract(providerOpened)).toContain("provider or activation boundary opened");
  });
});
