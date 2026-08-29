#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

import {
  OS01_STAGING_FOREIGN_KEY_CANDIDATES,
  OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES,
  OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
  OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT,
  OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256,
  OS01_STAGING_FOREIGN_KEYS_FAILURE_CATEGORIES,
  OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
  OS01_STAGING_FOREIGN_KEYS_REQUEST_VERSION,
  OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-foreign-keys/contract";

const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

function argument(name: string): string {
  const at = process.argv.indexOf(name);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`missing ${name}`);
  return process.argv[at + 1]!;
}

function files(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    const file = join(root, entry);
    if (statSync(file).isDirectory()) result.push(...files(file));
    else result.push(file);
  }
  return result.sort();
}

export async function buildOs01StagingForeignKeys(input: {
  projectId: string;
  outDir: string;
}): Promise<{ entrySha256: string; manifestSha256: string }> {
  if (input.projectId !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId) {
    throw new Error("foreign-key package target is not exact");
  }
  const outDir = resolve(input.outDir);
  if (existsSync(outDir) && readdirSync(outDir).length !== 0) {
    throw new Error("foreign-key package output directory must be empty");
  }
  await build({
    configFile: false,
    envFile: false,
    logLevel: "warn",
    publicDir: false,
    build: {
      emptyOutDir: false,
      outDir,
      ssr: resolve("qualification/os01-staging-foreign-keys/entry.ts"),
      target: "es2022",
      rollupOptions: { output: { entryFileNames: "dist/server/index.js", format: "es" } }
    }
  });
  const entryPath = "dist/server/index.js";
  const entry = readFileSync(join(outDir, entryPath));
  const text = new TextDecoder().decode(entry);
  for (const prohibited of [
    "ODDS_API_KEY",
    "ENGINE_OS_CAPTURE_ENABLED",
    "the-odds-api.com",
    "api.the-odds-api.com",
    "source_capture_provider_request",
    "COUNT(*)",
    "rowCountRoot",
    "read_only_ddl_row_census_captured"
  ]) if (text.includes(prohibited)) throw new Error(`foreign-key package contains ${prohibited}`);
  for (const required of [
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route,
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin,
    OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogHash,
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot,
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementArrayRoot,
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementPlanRoot,
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.responseStatus,
    "engine-os.os01-staging-foreign-keys-failure.v1",
    "isolated_staging_read_only_foreign_key_evidence_only_no_row_count_or_os01_acceptance"
  ]) if (!text.includes(required)) throw new Error(`foreign-key package omits ${required}`);

  const metadata = join(outDir, ".openai");
  mkdirSync(metadata, { recursive: true });
  const hosting = `${JSON.stringify({ project_id: input.projectId, d1: "DB", r2: null }, null, 2)}\n`;
  writeFileSync(join(metadata, "hosting.json"), hosting, { encoding: "utf8", flag: "wx" });
  const payloadFiles = files(outDir).map((file) => file.slice(outDir.length + 1));
  if (JSON.stringify(payloadFiles) !== JSON.stringify([".openai/hosting.json", entryPath]) ||
      payloadFiles.some((file) => file.includes("drizzle") || file.endsWith(".sql"))) {
    throw new Error("foreign-key package contains an automatic migration path");
  }

  const manifest = {
    version: "engine-os.os01-staging-foreign-keys-package.v1",
    status: "isolated_bounded_read_only_foreign_key_qualification",
    projectId: input.projectId,
    entryPath,
    entrySha256: sha256(entry),
    semanticContract: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT,
    qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
    predecessor: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.predecessor,
    candidateIdentities: OS01_STAGING_FOREIGN_KEY_CANDIDATES,
    candidateRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
    expectedNormalizedForeignKeyRoot:
      OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot,
    request: {
      method: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.method,
      origin: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin,
      route: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route,
      query: "",
      contentType: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.contentType,
      version: OS01_STAGING_FOREIGN_KEYS_REQUEST_VERSION,
      qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
      exactBodySha256: OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256
    },
    exactBatch: {
      statementCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.maximumD1StatementsPerInvocation,
      catalogStatements: 2,
      directForeignKeyListStatements: OS01_STAGING_FOREIGN_KEY_CANDIDATES.length,
      statementArrayRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementArrayRoot,
      statementPlanRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementPlanRoot,
      singleBatchRequired: true,
      catalogBeforeAndAfterRequired: true
    },
    runtimeBindings: ["DB"],
    providerBindings: [],
    scheduledTriggers: [],
    automaticMigrations: false,
    invocationControl: {
      ...OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.invocationControl,
      controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
      canonicalControllerRoot: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT,
      fixedArtifactNames: OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES,
      receiptMustBindOwnerOnlyNoWriterBoundaryBeforeAndAfter: true,
      secondInvocationProhibitedByOperatorContract: true,
      finalAcceptanceStatus: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.finalAcceptanceStatus,
      maximumResponseBytes: 524288,
      reflectedCredentialPersistenceAllowed: false
    },
    failureContract: {
      version: "engine-os.os01-staging-foreign-keys-failure.v1",
      status: "read_only_foreign_key_capture_failed",
      workerCategories: OS01_STAGING_FOREIGN_KEYS_FAILURE_CATEGORIES,
      exactAggregateOnlySchema: true,
      selfHashed: true,
      schemaNamesOrSqlAllowed: false,
      persistenceRequiresControllerValidation: true,
      terminalAndNonFinalizable: true
    },
    boundaries: {
      databaseMutationAllowed: false,
      providerRequestAllowed: false,
      quotaReservationAllowed: false,
      productionAllowed: false,
      captureActivationAllowed: false,
      rowCountEvidenceAccepted: false,
      os01Accepted: false
    }
  } as const;
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = sha256(manifestBytes);
  writeFileSync(join(metadata, "os01-staging-foreign-keys-package.v1.json"), manifestBytes, {
    encoding: "utf8",
    flag: "wx"
  });
  writeFileSync(join(metadata, "os01-staging-foreign-keys-package.v1.sha256"),
    `${manifestSha256}  os01-staging-foreign-keys-package.v1.json\n`, { encoding: "utf8", flag: "wx" });
  const finalFiles = files(outDir).map((file) => file.slice(outDir.length + 1));
  if (JSON.stringify(finalFiles) !== JSON.stringify([
    ".openai/hosting.json",
    ".openai/os01-staging-foreign-keys-package.v1.json",
    ".openai/os01-staging-foreign-keys-package.v1.sha256",
    entryPath
  ])) throw new Error("foreign-key package final payload is not exact");
  return { entrySha256: sha256(entry), manifestSha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await buildOs01StagingForeignKeys({
    projectId: argument("--project-id"),
    outDir: argument("--out-dir")
  });
  process.stdout.write(`${basename(argument("--out-dir"))} ${result.entrySha256} ${result.manifestSha256}\n`);
}
