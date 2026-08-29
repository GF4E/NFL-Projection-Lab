#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build, type Plugin } from "vite";

import { calculateHostedMigrationCapacity } from "./os01-hosted-migration-capacity";
import { loadOs01HostedMigrationAuthority } from "./os01-hosted-migration-authority";

const VIRTUAL_ID = "virtual:os01-hosted-migration-authority";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
const EXACT_STAGING_PROJECT_ID = "appgprj_6a92435d1d788191b4d6bcaff0a1525d";
const V1_CONTRACT_SHA256 = "d411116582a982bdbf9a86d797bfd8346ee72115b87602bf6b204c5eadc59270";
const V2_CONTRACT_SHA256 = "cd025216b156946404b5606e824575ff00e1d023f3fa40f4fa45e068a041cde6";
const V3_CONTRACT_SHA256 = "eaddbab1dd84325eac82846446fa49a1c38359abce60283341886208c87f5a9d";
const V3_FAILURE_RECEIPT_SHA256 = "d42f6829a21e02d368354a3bbd851fb4e99a77adb7a32dc5086ce25b8a76497b";
const V5_DIAGNOSTIC_CONTRACT_SHA256 = "bb81743e4b3bbe8cb73e285690e04eafda32a136a386e959b0cd10d38307a897";
const V5_DIAGNOSTIC_REJECTION_RECEIPT_SHA256 = "3962e97a65b2077f46ab2d3c84383c1fca7acfc0cdd72be7e2356a9fcd544223";
const SHARED_STATEMENT_PARSER_SHA256 = "419f97cba53ee0e95fdad8ddd29edf0a1a2a64cc359f34f85746c6ab02b43c46";
const V3_FAILURE_RECEIPT_PATH =
  ".planning/engine-os/execution/os-01/hosted-migration-v3-runtime-boundary-rejection-receipt.v1.json";
const V5_DIAGNOSTIC_REJECTION_RECEIPT_PATH =
  ".planning/engine-os/execution/os-01/hosted-migration-diagnostic-v5-live-rejection-receipt.v1.json";
const SHARED_STATEMENT_PARSER_PATH = "qualification/os01-hosted-migration/sql-statements.ts";
const CAPACITY_RECEIPT_SHA256 = "91e61351ba23848cc76e2d10f386c6a38690b9e41681f2d2387a206d0a70955c";
const CAPACITY_RESPONSE_RECEIPT_HASH = "cb7c00a83a66304430c0c61385328568b752a7122069e5cc8c170e849193ed55";
const CAPACITY_SOURCE_COMMIT = "f161104783f13ad15009fc2da4ac8f11f513c4fd";
const CAPACITY_WORKER_SHA256 = "8969879cc4c233d92d3a53d3202300b13b6e491e57dc3db031e12f309d983b05";
const CAPACITY_BUILT_WORKER_SHA256 = "e08e0c035405223072ec7c35bc6430e1e1a252cab161005f4dc5b6cde755fd84";
const CAPACITY_ARCHIVE_SHA256 = "f0720062fe21c926d367520560728a2b5d077c1b0ece017bef0155862b5565c2";
const CAPACITY_DEPLOYMENT_ID = "appgdep_6a9243901a808191ad9f6c099bc90331";
const CAPACITY_SOURCE_SNAPSHOT_PATH =
  ".planning/engine-os/execution/os-01/hosted-capacity-probe-worker.f161104.js.txt";
const CAPACITY_REQUEST_ROUTE = "/__engine-os/os01-capacity/v1";
const CAPACITY_REQUEST_VERSION = "engine-os.os01-d1-capacity-probe-request.v1";
const CAPACITY_QUALIFICATION_ID = "os01-capacity-20260829-489-readonly";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}

function files(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) result.push(...files(path));
    else result.push(path);
  }
  return result.sort();
}

function singleSourceCapture(source: string, pattern: RegExp, label: string): string {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1 || typeof matches[0]?.[1] !== "string") {
    throw new Error(`OS-01 hosted capacity source has ambiguous ${label}`);
  }
  return matches[0][1];
}

export function extractCapacityProbeRequestIdentity(source: string): {
  method: "POST";
  route: string;
  version: string;
  qualificationId: string;
  exactKeys: ["qualificationId", "version"];
} {
  if (!source.includes('request.method !== "POST"') ||
      !source.includes('Object.keys(input).sort().join(",") !== "qualificationId,version"')) {
    throw new Error("OS-01 hosted capacity source request boundary changed");
  }
  return {
    method: "POST",
    route: singleSourceCapture(source, /url\.pathname !== "([^"]+)"/gu, "request route"),
    version: singleSourceCapture(source, /const REQUEST_VERSION = "([^"]+)";/gu, "request version"),
    qualificationId: singleSourceCapture(
      source,
      /const QUALIFICATION_ID = "([^"]+)";/gu,
      "qualification id"
    ),
    exactKeys: ["qualificationId", "version"]
  };
}

export async function buildOs01HostedMigrationHarness(input: {
  projectId: string;
  outDir: string;
  workspaceRoot?: string;
}): Promise<{
  entrySha256: string;
  authoritySha256: string;
  manifestPath: string;
  manifestSha256: string;
}> {
  if (input.projectId !== EXACT_STAGING_PROJECT_ID) {
    throw new Error("OS-01 hosted harness v4 is restricted to the capacity-qualified staging Sites project");
  }
  const workspaceRoot = resolve(input.workspaceRoot ?? process.cwd());
  const outDir = resolve(input.outDir);
  if (existsSync(outDir) && readdirSync(outDir).length !== 0) {
    throw new Error("OS-01 hosted harness output directory must be empty");
  }
  const qualificationContractPath = resolve(
    workspaceRoot,
    "config/os01-hosted-migration-qualification.v4.json"
  );
  const qualificationContractBytes = readFileSync(qualificationContractPath);
  const qualificationContract = JSON.parse(
    new TextDecoder().decode(qualificationContractBytes)
  ) as {
    version?: unknown;
    authority?: { sourceCommit?: unknown };
    predecessor?: { sha256?: unknown };
    predecessorRejectionReceipt?: { path?: unknown; sha256?: unknown };
    historicalRejections?: Array<{ sha256?: unknown; status?: unknown }>;
    capacityQualification?: {
      receipt?: { path?: unknown; sha256?: unknown };
      sourceSnapshot?: { path?: unknown; sha256?: unknown };
      projectId?: unknown;
      deploymentId?: unknown;
      sourceCommit?: unknown;
      workerSha256?: unknown;
      builtWorkerSha256?: unknown;
      archiveSha256?: unknown;
      requestMethod?: unknown;
      requestRoute?: unknown;
      requestVersion?: unknown;
      requestQualificationId?: unknown;
      queryCount?: unknown;
      batchCount?: unknown;
      resultCount?: unknown;
      elapsedMilliseconds?: unknown;
      databaseMutations?: unknown;
      providerCalls?: unknown;
      providerSecretReads?: unknown;
      captureActivations?: unknown;
      ownerOnly?: unknown;
      responseReceiptHash?: unknown;
      status?: unknown;
    };
    executionBoundary?: {
      exactTemporarySitesProjectId?: unknown;
      productionAllowed?: unknown;
      providerAccessAllowed?: unknown;
      captureActivationAllowed?: unknown;
      freshOwnerOnlyAndBindingRefreshRequiredBeforeDeploy?: unknown;
      authorizedActionAfterLocalAcceptanceAndFreshRefresh?: unknown;
      underThirtySecondMutatingMigrationProof?: unknown;
      predecessorPostFailureD1Observation?: { tableCount?: unknown; tables?: unknown };
    };
    runtimeStatementBoundary?: {
      parser?: { path?: unknown; sha256?: unknown; consumers?: unknown };
      statementBreakpointEntries?: unknown;
      migrationStatements?: unknown;
      guardStatements?: unknown;
      blankReplayBatchStatements?: unknown;
      blankReplayInvocationQueries?: unknown;
      singleBatchRequired?: unknown;
      singleStatementPerPrepareRequired?: unknown;
      diagnosticVocabulary?: unknown;
    };
    package?: { deploymentAllowed?: unknown };
  };
  const predecessorDiagnosticContractBytes = readFileSync(resolve(
    workspaceRoot,
    "config/os01-hosted-migration-diagnostic.v5.json"
  ));
  if (sha256(predecessorDiagnosticContractBytes) !== V5_DIAGNOSTIC_CONTRACT_SHA256 ||
      sha256(readFileSync(resolve(workspaceRoot, V5_DIAGNOSTIC_REJECTION_RECEIPT_PATH))) !==
        V5_DIAGNOSTIC_REJECTION_RECEIPT_SHA256) {
    throw new Error("OS-01 hosted v5 diagnostic rejection evidence changed");
  }
  const diagnosticContractBytes = readFileSync(resolve(
    workspaceRoot,
    "config/os01-hosted-migration-diagnostic.v6.json"
  ));
  const diagnosticContract = JSON.parse(
    new TextDecoder().decode(diagnosticContractBytes)
  ) as {
    version?: unknown;
    status?: unknown;
    predecessorSourceCommit?: unknown;
    predecessorReceipt?: unknown;
    predecessorReceiptSha256?: unknown;
    exactTemporarySitesProjectId?: unknown;
    authorizedAction?: unknown;
    requestIdentity?: unknown;
    maximumHostedProbeRequests?: unknown;
    readOnlyComponents?: unknown;
    acceptedEvidenceAllowed?: unknown;
    databaseMutationAllowed?: unknown;
    providerAccessAllowed?: unknown;
    captureActivationAllowed?: unknown;
    productionAllowed?: unknown;
  };
  if (qualificationContract.version !== "os01-hosted-migration-qualification.2026.4" ||
      qualificationContract.authority?.sourceCommit !== "d24db5632410894d4f82c12e7f1d0c4c256a208d" ||
      qualificationContract.predecessor?.sha256 !== V3_CONTRACT_SHA256 ||
      qualificationContract.predecessorRejectionReceipt?.path !== V3_FAILURE_RECEIPT_PATH ||
      qualificationContract.predecessorRejectionReceipt?.sha256 !== V3_FAILURE_RECEIPT_SHA256 ||
      qualificationContract.historicalRejections?.[0]?.sha256 !== V2_CONTRACT_SHA256 ||
      qualificationContract.historicalRejections?.[1]?.sha256 !== V1_CONTRACT_SHA256 ||
      qualificationContract.executionBoundary?.exactTemporarySitesProjectId !== EXACT_STAGING_PROJECT_ID ||
      qualificationContract.executionBoundary?.freshOwnerOnlyAndBindingRefreshRequiredBeforeDeploy !== true ||
      qualificationContract.executionBoundary?.productionAllowed !== false ||
      qualificationContract.executionBoundary?.providerAccessAllowed !== false ||
      qualificationContract.executionBoundary?.captureActivationAllowed !== false ||
      qualificationContract.executionBoundary?.authorizedActionAfterLocalAcceptanceAndFreshRefresh !==
        "one blank_replay request using a newly generated qualification id" ||
      qualificationContract.executionBoundary?.underThirtySecondMutatingMigrationProof !==
        "pending_hosted_blank_replay_v4" ||
      qualificationContract.executionBoundary?.predecessorPostFailureD1Observation?.tableCount !== 0 ||
      JSON.stringify(qualificationContract.executionBoundary?.predecessorPostFailureD1Observation?.tables) !== "[]" ||
      qualificationContract.runtimeStatementBoundary?.parser?.path !== SHARED_STATEMENT_PARSER_PATH ||
      qualificationContract.runtimeStatementBoundary?.parser?.sha256 !== SHARED_STATEMENT_PARSER_SHA256 ||
      JSON.stringify(qualificationContract.runtimeStatementBoundary?.parser?.consumers) !== JSON.stringify([
        "qualification/os01-hosted-migration/core.ts",
        "scripts/os01-hosted-migration-capacity.ts"
      ]) ||
      qualificationContract.runtimeStatementBoundary?.statementBreakpointEntries !== 272 ||
      qualificationContract.runtimeStatementBoundary?.migrationStatements !== 291 ||
      qualificationContract.runtimeStatementBoundary?.guardStatements !== 4 ||
      qualificationContract.runtimeStatementBoundary?.blankReplayBatchStatements !== 295 ||
      qualificationContract.runtimeStatementBoundary?.blankReplayInvocationQueries !== 489 ||
      qualificationContract.runtimeStatementBoundary?.singleBatchRequired !== true ||
      qualificationContract.runtimeStatementBoundary?.singleStatementPerPrepareRequired !== true ||
      JSON.stringify(qualificationContract.runtimeStatementBoundary?.diagnosticVocabulary) !== JSON.stringify([
        "d1_prepare_multiple_statements",
        "d1_prepare_rejected"
      ]) ||
      qualificationContract.package?.deploymentAllowed !== true) {
    throw new Error("OS-01 hosted qualification v4 contract is not the frozen candidate contract");
  }
  const expectedReadOnlyComponents = [
    "select_literal",
    "sqlite_schema_catalog",
    "pragma_schema_version",
    "pragma_foreign_key_check",
    "pragma_quick_check"
  ];
  if (diagnosticContract.version !== "os01-hosted-migration-diagnostic.2026.6" ||
      diagnosticContract.status !== "diagnostic_only_not_qualification_evidence" ||
      diagnosticContract.predecessorSourceCommit !== "36ee949dd1d71bc06d4deb1784a93133bb21763e" ||
      diagnosticContract.predecessorReceipt !== V5_DIAGNOSTIC_REJECTION_RECEIPT_PATH ||
      diagnosticContract.predecessorReceiptSha256 !== V5_DIAGNOSTIC_REJECTION_RECEIPT_SHA256 ||
      diagnosticContract.exactTemporarySitesProjectId !== EXACT_STAGING_PROJECT_ID ||
      diagnosticContract.authorizedAction !==
        "one_read_only_prestate_component_probe_after_fresh_owner_only_db_only_zero_table_refresh" ||
      JSON.stringify(diagnosticContract.requestIdentity) !== JSON.stringify({
        method: "POST",
        route: "/__engine-os/os01-hosted-migration/v1",
        version: "engine-os.os01-hosted-migration-request.v1",
        action: "blank_prestate_component_probe",
        exactKeys: ["action", "qualificationId", "version"]
      }) ||
      diagnosticContract.maximumHostedProbeRequests !== 1 ||
      JSON.stringify(diagnosticContract.readOnlyComponents) !== JSON.stringify(expectedReadOnlyComponents) ||
      diagnosticContract.acceptedEvidenceAllowed !== false ||
      diagnosticContract.databaseMutationAllowed !== false ||
      diagnosticContract.providerAccessAllowed !== false ||
      diagnosticContract.captureActivationAllowed !== false ||
      diagnosticContract.productionAllowed !== false) {
    throw new Error("OS-01 hosted v6 diagnostic contract is invalid");
  }
  const v1ContractBytes = readFileSync(resolve(
    workspaceRoot,
    "config/os01-hosted-migration-qualification.v1.json"
  ));
  if (sha256(v1ContractBytes) !== V1_CONTRACT_SHA256) {
    throw new Error("OS-01 hosted qualification v1 rejection contract changed");
  }
  const v2ContractBytes = readFileSync(resolve(
    workspaceRoot,
    "config/os01-hosted-migration-qualification.v2.json"
  ));
  if (sha256(v2ContractBytes) !== V2_CONTRACT_SHA256) {
    throw new Error("OS-01 hosted qualification v2 rejection contract changed");
  }
  const v3ContractBytes = readFileSync(resolve(
    workspaceRoot,
    "config/os01-hosted-migration-qualification.v3.json"
  ));
  if (sha256(v3ContractBytes) !== V3_CONTRACT_SHA256) {
    throw new Error("OS-01 hosted qualification v3 rejection contract changed");
  }
  const v3FailureReceiptBytes = readFileSync(resolve(workspaceRoot, V3_FAILURE_RECEIPT_PATH));
  if (sha256(v3FailureReceiptBytes) !== V3_FAILURE_RECEIPT_SHA256) {
    throw new Error("OS-01 hosted qualification v3 rejection receipt changed");
  }
  const v3FailureReceipt = JSON.parse(new TextDecoder().decode(v3FailureReceiptBytes)) as {
    result?: unknown;
    hostedAttempt?: {
      projectId?: unknown;
      response?: { httpStatus?: unknown; sha256?: unknown };
      postFailureD1Observation?: { tableCount?: unknown; tables?: unknown };
    };
    defect?: {
      capacityParserMigrationStatements?: unknown;
      runtimeBreakpointEntries?: unknown;
      missingRuntimeStatementBoundaries?: unknown;
    };
    securityAndActivation?: {
      providerCalls?: unknown;
      providerSecretReads?: unknown;
      quotaReservations?: unknown;
      captureActivations?: unknown;
      productionMutations?: unknown;
    };
    claims?: { v3Accepted?: unknown; v3RetryAuthorized?: unknown };
  };
  if (v3FailureReceipt.result !== "rejected_runtime_statement_boundary_mismatch" ||
      v3FailureReceipt.hostedAttempt?.projectId !== EXACT_STAGING_PROJECT_ID ||
      v3FailureReceipt.hostedAttempt?.response?.httpStatus !== 500 ||
      v3FailureReceipt.hostedAttempt?.response?.sha256 !==
        "02bc538377738a19dda7d8c6bfabb2cf6e56be98008e976c216a470e9055a98a" ||
      v3FailureReceipt.hostedAttempt?.postFailureD1Observation?.tableCount !== 0 ||
      JSON.stringify(v3FailureReceipt.hostedAttempt?.postFailureD1Observation?.tables) !== "[]" ||
      v3FailureReceipt.defect?.capacityParserMigrationStatements !== 291 ||
      v3FailureReceipt.defect?.runtimeBreakpointEntries !== 272 ||
      v3FailureReceipt.defect?.missingRuntimeStatementBoundaries !== 19 ||
      v3FailureReceipt.securityAndActivation?.providerCalls !== 0 ||
      v3FailureReceipt.securityAndActivation?.providerSecretReads !== 0 ||
      v3FailureReceipt.securityAndActivation?.quotaReservations !== 0 ||
      v3FailureReceipt.securityAndActivation?.captureActivations !== 0 ||
      v3FailureReceipt.securityAndActivation?.productionMutations !== 0 ||
      v3FailureReceipt.claims?.v3Accepted !== false ||
      v3FailureReceipt.claims?.v3RetryAuthorized !== false) {
    throw new Error("OS-01 hosted qualification v3 rejection receipt is not the exact failed attempt");
  }
  const sharedParserBytes = readFileSync(resolve(workspaceRoot, SHARED_STATEMENT_PARSER_PATH));
  if (sha256(sharedParserBytes) !== SHARED_STATEMENT_PARSER_SHA256) {
    throw new Error("OS-01 hosted shared SQL statement parser changed");
  }
  const runtimeCore = readFileSync(resolve(
    workspaceRoot,
    "qualification/os01-hosted-migration/core.ts"
  ), "utf8");
  const capacityCounter = readFileSync(resolve(
    workspaceRoot,
    "scripts/os01-hosted-migration-capacity.ts"
  ), "utf8");
  if (!runtimeCore.includes('import { splitHostedSqlStatements } from "./sql-statements";') ||
      !runtimeCore.includes(".flatMap((entry) => splitHostedSqlStatements(entry))") ||
      !capacityCounter.includes(
        'import { splitHostedSqlStatements } from "../qualification/os01-hosted-migration/sql-statements";'
      ) ||
      !capacityCounter.includes("const parsed = splitHostedSqlStatements(entry);")) {
    throw new Error("OS-01 hosted runtime and capacity accounting do not share the frozen SQL parser");
  }
  const capacityReceiptPath = resolve(
    workspaceRoot,
    ".planning/engine-os/execution/os-01/hosted-capacity-probe-receipt.v3.json"
  );
  const capacityReceiptBytes = readFileSync(capacityReceiptPath);
  if (sha256(capacityReceiptBytes) !== CAPACITY_RECEIPT_SHA256 ||
      qualificationContract.capacityQualification?.receipt?.path !==
        ".planning/engine-os/execution/os-01/hosted-capacity-probe-receipt.v3.json" ||
      qualificationContract.capacityQualification?.receipt?.sha256 !== CAPACITY_RECEIPT_SHA256) {
    throw new Error("OS-01 hosted capacity receipt does not match the frozen v4 contract");
  }
  const capacitySourceSnapshotBytes = readFileSync(resolve(workspaceRoot, CAPACITY_SOURCE_SNAPSHOT_PATH));
  if (sha256(capacitySourceSnapshotBytes) !== CAPACITY_WORKER_SHA256 ||
      qualificationContract.capacityQualification?.sourceSnapshot?.path !== CAPACITY_SOURCE_SNAPSHOT_PATH ||
      qualificationContract.capacityQualification?.sourceSnapshot?.sha256 !== CAPACITY_WORKER_SHA256) {
    throw new Error("OS-01 hosted capacity source snapshot does not match the frozen v4 contract");
  }
  const sourceRequestIdentity = extractCapacityProbeRequestIdentity(
    new TextDecoder().decode(capacitySourceSnapshotBytes)
  );
  if (sourceRequestIdentity.method !== "POST" ||
      sourceRequestIdentity.route !== CAPACITY_REQUEST_ROUTE ||
      sourceRequestIdentity.version !== CAPACITY_REQUEST_VERSION ||
      sourceRequestIdentity.qualificationId !== CAPACITY_QUALIFICATION_ID) {
    throw new Error("OS-01 hosted capacity source request identity changed");
  }
  const capacityReceipt = JSON.parse(new TextDecoder().decode(capacityReceiptBytes)) as {
    result?: unknown;
    sites?: { projectId?: unknown; deploymentId?: unknown; access?: { ownerOnly?: unknown }; bindings?: { d1?: unknown; providerBindings?: unknown[]; scheduledTriggers?: unknown[] } };
    source?: { commit?: unknown; workerSha256?: unknown; builtWorkerSha256?: unknown; archiveSha256?: unknown };
    request?: {
      method?: unknown;
      route?: unknown;
      version?: unknown;
      qualificationId?: unknown;
      exactKeys?: unknown;
      queryCount?: unknown;
      batchCount?: unknown;
      readOnly?: unknown;
    };
    response?: {
      httpStatus?: unknown;
      queryCount?: unknown;
      batchCount?: unknown;
      resultCount?: unknown;
      elapsedMilliseconds?: unknown;
      underThirtySeconds?: unknown;
      databaseMutations?: unknown;
      providerCalls?: unknown;
      providerSecretReads?: unknown;
      captureActivations?: unknown;
      receiptHash?: unknown;
    };
  };
  if (capacityReceipt.result !== "passed_bounded_read_only_capacity_probe" ||
      capacityReceipt.sites?.projectId !== EXACT_STAGING_PROJECT_ID ||
      capacityReceipt.sites?.deploymentId !== CAPACITY_DEPLOYMENT_ID ||
      capacityReceipt.sites?.access?.ownerOnly !== true ||
      capacityReceipt.sites?.bindings?.d1 !== "DB" ||
      capacityReceipt.sites?.bindings?.providerBindings?.length !== 0 ||
      capacityReceipt.sites?.bindings?.scheduledTriggers?.length !== 0 ||
      capacityReceipt.source?.commit !== CAPACITY_SOURCE_COMMIT ||
      capacityReceipt.source?.workerSha256 !== CAPACITY_WORKER_SHA256 ||
      capacityReceipt.source?.builtWorkerSha256 !== CAPACITY_BUILT_WORKER_SHA256 ||
      capacityReceipt.source?.archiveSha256 !== CAPACITY_ARCHIVE_SHA256 ||
      capacityReceipt.request?.method !== sourceRequestIdentity.method ||
      capacityReceipt.request?.route !== sourceRequestIdentity.route ||
      capacityReceipt.request?.version !== sourceRequestIdentity.version ||
      capacityReceipt.request?.qualificationId !== sourceRequestIdentity.qualificationId ||
      JSON.stringify(capacityReceipt.request?.exactKeys) !== JSON.stringify(sourceRequestIdentity.exactKeys) ||
      capacityReceipt.request?.queryCount !== 489 ||
      capacityReceipt.request?.batchCount !== 1 ||
      capacityReceipt.request?.readOnly !== true ||
      capacityReceipt.response?.httpStatus !== 200 ||
      capacityReceipt.response?.queryCount !== 489 ||
      capacityReceipt.response?.batchCount !== 1 ||
      capacityReceipt.response?.resultCount !== 489 ||
      capacityReceipt.response?.elapsedMilliseconds !== 588 ||
      capacityReceipt.response?.underThirtySeconds !== true ||
      capacityReceipt.response?.databaseMutations !== 0 ||
      capacityReceipt.response?.providerCalls !== 0 ||
      capacityReceipt.response?.providerSecretReads !== 0 ||
      capacityReceipt.response?.captureActivations !== 0 ||
      capacityReceipt.response?.receiptHash !== CAPACITY_RESPONSE_RECEIPT_HASH) {
    throw new Error("OS-01 hosted capacity receipt failed exact validation");
  }
  if (qualificationContract.capacityQualification?.projectId !== EXACT_STAGING_PROJECT_ID ||
      qualificationContract.capacityQualification?.deploymentId !== CAPACITY_DEPLOYMENT_ID ||
      qualificationContract.capacityQualification?.sourceCommit !== CAPACITY_SOURCE_COMMIT ||
      qualificationContract.capacityQualification?.workerSha256 !== CAPACITY_WORKER_SHA256 ||
      qualificationContract.capacityQualification?.builtWorkerSha256 !== CAPACITY_BUILT_WORKER_SHA256 ||
      qualificationContract.capacityQualification?.archiveSha256 !== CAPACITY_ARCHIVE_SHA256 ||
      qualificationContract.capacityQualification?.requestMethod !== sourceRequestIdentity.method ||
      qualificationContract.capacityQualification?.requestRoute !== sourceRequestIdentity.route ||
      qualificationContract.capacityQualification?.requestVersion !== sourceRequestIdentity.version ||
      qualificationContract.capacityQualification?.requestQualificationId !== sourceRequestIdentity.qualificationId ||
      qualificationContract.capacityQualification?.queryCount !== 489 ||
      qualificationContract.capacityQualification?.batchCount !== 1 ||
      qualificationContract.capacityQualification?.resultCount !== 489 ||
      qualificationContract.capacityQualification?.elapsedMilliseconds !== 588 ||
      qualificationContract.capacityQualification?.databaseMutations !== 0 ||
      qualificationContract.capacityQualification?.providerCalls !== 0 ||
      qualificationContract.capacityQualification?.providerSecretReads !== 0 ||
      qualificationContract.capacityQualification?.captureActivations !== 0 ||
      qualificationContract.capacityQualification?.ownerOnly !== true ||
      qualificationContract.capacityQualification?.responseReceiptHash !== CAPACITY_RESPONSE_RECEIPT_HASH ||
      qualificationContract.capacityQualification?.status !==
        "passed_bounded_read_only_probe_with_source_bound_request_identity") {
    throw new Error("OS-01 hosted capacity qualification summary does not match the exact receipt");
  }
  const authority = loadOs01HostedMigrationAuthority(workspaceRoot);
  const capacity = calculateHostedMigrationCapacity(authority);
  const statementBreakpointEntries = authority.migrations.reduce((total, migration) =>
    total + migration.source.split("--> statement-breakpoint")
      .map((entry) => entry.trim())
      .filter(Boolean).length,
  0);
  if (statementBreakpointEntries !== 272 ||
      capacity.migrationStatements !== 291 ||
      capacity.guardStatements !== 4 ||
      capacity.blankReplayInvocationQueries !== 489 ||
      capacity.blankReplayBatchStatements !== 295) {
    throw new Error("OS-01 hosted harness capacity accounting no longer matches the frozen migration set");
  }
  const authorityJson = JSON.stringify(authority);
  const authoritySha256 = sha256(authorityJson);
  const authorityPlugin: Plugin = {
    name: "os01-hosted-migration-authority",
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    load(id) {
      return id === RESOLVED_VIRTUAL_ID
        ? `export const authorizedActions = Object.freeze(["blank_prestate_component_probe"]); export default ${authorityJson};`
        : null;
    }
  };
  await build({
    configFile: false,
    root: workspaceRoot,
    publicDir: false,
    plugins: [authorityPlugin],
    build: {
      target: "es2022",
      ssr: true,
      minify: false,
      sourcemap: false,
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(workspaceRoot, "qualification/os01-hosted-migration/entry.ts"),
        output: { format: "es", entryFileNames: "server/index.js" }
      }
    }
  });
  const entryPath = join(outDir, "server/index.js");
  const entry = readFileSync(entryPath);
  const entryText = new TextDecoder().decode(entry);
  for (const prohibited of [
    "ODDS_API_KEY",
    "ENGINE_OS_CAPTURE_ENABLED",
    "the-odds-api.com",
    "api.the-odds-api.com",
    "source_capture_provider_request"
  ]) {
    if (entryText.includes(prohibited)) throw new Error(`OS-01 hosted bundle contains ${prohibited}`);
  }
  if (!entryText.includes("/__engine-os/os01-hosted-migration/v1")) {
    throw new Error("OS-01 hosted bundle does not contain the qualification route");
  }
  if (!entryText.includes("action_not_authorized") ||
      !entryText.includes('Object.freeze(["blank_prestate_component_probe"])')) {
    throw new Error("OS-01 hosted bundle does not enforce the singleton runtime action allowlist");
  }
  const metadataRoot = join(outDir, ".openai");
  mkdirSync(metadataRoot, { recursive: true });
  const hosting = {
    project_id: input.projectId,
    d1: "DB",
    r2: null
  };
  const hostingBytes = `${JSON.stringify(hosting, null, 2)}\n`;
  writeFileSync(join(metadataRoot, "hosting.json"), hostingBytes, { encoding: "utf8", flag: "wx" });
  const outputFiles = files(outDir).map((path) => path.slice(outDir.length + 1));
  if (outputFiles.some((path) => path.includes("drizzle") || path.endsWith(".sql"))) {
    throw new Error("OS-01 hosted bundle contains an automatic migration path");
  }
  const manifest = {
    version: "engine-os.os01-hosted-migration-package.v4",
    qualificationOnly: true,
    projectId: input.projectId,
    entryPath: "server/index.js",
    entrySha256: sha256(entry),
    hostingSha256: sha256(hostingBytes),
    authoritySha256,
    qualificationContract: {
      path: "config/os01-hosted-migration-qualification.v4.json",
      sha256: sha256(qualificationContractBytes)
    },
    diagnosticContract: {
      path: "config/os01-hosted-migration-diagnostic.v6.json",
      sha256: sha256(diagnosticContractBytes),
      status: "diagnostic_only_not_qualification_evidence",
      authorizedAction: "blank_prestate_component_probe",
      readOnlyComponents: expectedReadOnlyComponents
    },
    rejectedDiagnosticPredecessor: {
      contractPath: "config/os01-hosted-migration-diagnostic.v5.json",
      contractSha256: V5_DIAGNOSTIC_CONTRACT_SHA256,
      receiptPath: V5_DIAGNOSTIC_REJECTION_RECEIPT_PATH,
      receiptSha256: V5_DIAGNOSTIC_REJECTION_RECEIPT_SHA256,
      status: "shared_prestate_path_rejected_before_component_isolation"
    },
    rejectedPredecessorContract: {
      path: "config/os01-hosted-migration-qualification.v3.json",
      sha256: V3_CONTRACT_SHA256,
      status: "rejected_runtime_statement_boundary_mismatch"
    },
    rejectedPredecessorReceipt: {
      path: V3_FAILURE_RECEIPT_PATH,
      sha256: V3_FAILURE_RECEIPT_SHA256,
      hostedHttpStatus: 500,
      hostedResponseSha256: "02bc538377738a19dda7d8c6bfabb2cf6e56be98008e976c216a470e9055a98a",
      postFailureD1TableCount: 0
    },
    rejectedRequestIdentityPredecessorContract: {
      path: "config/os01-hosted-migration-qualification.v2.json",
      sha256: V2_CONTRACT_SHA256,
      status: "rejected_request_identity_mismatch"
    },
    historicalCapacityRejectionContract: {
      path: "config/os01-hosted-migration-qualification.v1.json",
      sha256: V1_CONTRACT_SHA256,
      status: "terminal_capacity_blocked_not_deployable"
    },
    capacityProbe: {
      path: ".planning/engine-os/execution/os-01/hosted-capacity-probe-receipt.v3.json",
      sha256: CAPACITY_RECEIPT_SHA256,
      exactProjectId: EXACT_STAGING_PROJECT_ID,
      deploymentId: CAPACITY_DEPLOYMENT_ID,
      sourceCommit: CAPACITY_SOURCE_COMMIT,
      workerSha256: CAPACITY_WORKER_SHA256,
      builtWorkerSha256: CAPACITY_BUILT_WORKER_SHA256,
      archiveSha256: CAPACITY_ARCHIVE_SHA256,
      sourceSnapshot: {
        path: CAPACITY_SOURCE_SNAPSHOT_PATH,
        sha256: CAPACITY_WORKER_SHA256
      },
      requestIdentity: sourceRequestIdentity,
      queryCount: 489,
      batchCount: 1,
      resultCount: 489,
      elapsedMilliseconds: 588,
      readOnly: true,
      databaseMutations: 0,
      providerCalls: 0,
      providerSecretReads: 0,
      captureActivations: 0,
      responseReceiptHash: CAPACITY_RESPONSE_RECEIPT_HASH,
      status: "passed_bounded_read_only_probe_with_source_bound_request_identity"
    },
    sourceAuthorityCommit: authority.sourceCommit,
    migrationBundleHash: authority.migrationBundleHash,
    legacyMigrationBundleHash: authority.legacyMigrationBundleHash,
    runtimeStatementBoundary: {
      parserPath: SHARED_STATEMENT_PARSER_PATH,
      parserSha256: SHARED_STATEMENT_PARSER_SHA256,
      consumers: [
        "qualification/os01-hosted-migration/core.ts",
        "scripts/os01-hosted-migration-capacity.ts"
      ],
      statementBreakpointEntries,
      migrationStatements: capacity.migrationStatements,
      embeddedStatementDifference: capacity.migrationStatements - statementBreakpointEntries,
      singleStatementPerPrepareRequired: true,
      diagnosticVocabulary: ["d1_prepare_multiple_statements", "d1_prepare_rejected"]
    },
    deploymentArchiveIncludesDrizzle: false,
    runtimeBindings: ["DB"],
    providerBindings: [],
    scheduledTriggers: [],
    terminalPhysicalManifestParityAccepted: false,
    d1QualificationBudget: {
      accountingVersion: capacity.version,
      requiredQueriesPerWorkerInvocation: capacity.blankReplayInvocationQueries,
      blankReplayMigrationStatements: capacity.migrationStatements,
      blankReplayBatchStatements: capacity.blankReplayBatchStatements,
      blankPrestateQueries: capacity.blankPrestateQueries,
      blankTerminalQueries: capacity.blankTerminalQueries,
      successorMigrationBatchStatements: capacity.successorBatchStatements,
      maximumBatchDurationSeconds: 30,
      activePredeployProbeIncluded: true,
      capacityQualificationStatus: "passed_489_read_only_queries_in_one_batch_588ms_source_bound_request_identity",
      mutatingMigrationDurationQualificationStatus: "pending_hosted_blank_replay_v4"
    },
    deploymentAllowed: true,
    deploymentTargetRestriction: `exact_project:${EXACT_STAGING_PROJECT_ID}`,
    authorizedHostedAction: "one_read_only_prestate_component_probe_only",
    runtimeAuthorizedActions: ["blank_prestate_component_probe"],
    acceptedEvidenceAllowed: false,
    migrationQualificationAllowed: false,
    predecessorPostFailureD1TableCount: 0,
    stillBlankRefreshRequiredBeforeDeploy: true,
    freshOwnerOnlyAndBindingRefreshRequiredBeforeDeploy: true,
    ownerOnlyAccessRequiredBeforeDeploy: true,
    captureActivationAllowed: false,
    productionAllowed: false,
    outputFiles: [
      ...outputFiles,
      ".openai/os01-hosted-migration-package.v4.json",
      ".openai/os01-hosted-migration-package.v4.sha256"
    ].sort()
  };
  const manifestPath = join(metadataRoot, "os01-hosted-migration-package.v4.json");
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = sha256(manifestBytes);
  writeFileSync(manifestPath, manifestBytes, { encoding: "utf8", flag: "wx" });
  writeFileSync(
    join(metadataRoot, "os01-hosted-migration-package.v4.sha256"),
    `${manifestSha256}  os01-hosted-migration-package.v4.json\n`,
    { encoding: "utf8", flag: "wx" }
  );
  return { entrySha256: manifest.entrySha256, authoritySha256, manifestPath, manifestSha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await buildOs01HostedMigrationHarness({
    projectId: argument("--project-id"),
    outDir: argument("--out-dir")
  });
  process.stdout.write(`${basename(result.manifestPath)} ${result.entrySha256}\n`);
}
