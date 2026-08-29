#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

import {
  STAGING_CENSUS_ARTIFACT_NAMES,
  STAGING_CENSUS_CONTROLLER_ID,
  STAGING_CENSUS_CONTROLLER_ROOT,
  STAGING_CENSUS_EXACT_BODY_SHA256,
  STAGING_CENSUS_FAILURE_CATEGORIES,
  STAGING_CENSUS_ID,
  STAGING_CENSUS_PERSISTABLE_DIAGNOSTIC_CATEGORIES,
  STAGING_CENSUS_REQUEST_VERSION,
  STAGING_CENSUS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-census/contract";

const EXACT_STAGING_PROJECT_ID = STAGING_CENSUS_SEMANTIC_CONTRACT.projectId;
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

function argument(name: string): string {
  const at = process.argv.indexOf(name);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`missing ${name}`);
  return process.argv[at + 1]!;
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

export async function buildOs01StagingCensus(input: { projectId: string; outDir: string }): Promise<{
  entrySha256: string;
  manifestSha256: string;
}> {
  if (input.projectId !== EXACT_STAGING_PROJECT_ID) throw new Error("census package target is not exact");
  const outDir = resolve(input.outDir);
  if (existsSync(outDir) && readdirSync(outDir).length !== 0) {
    throw new Error("census package output directory must be empty");
  }
  await build({
    configFile: false,
    envFile: false,
    logLevel: "warn",
    publicDir: false,
    build: {
      emptyOutDir: false,
      outDir,
      ssr: resolve("qualification/os01-staging-census/entry.ts"),
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
    "source_capture_provider_request"
  ]) if (text.includes(prohibited)) throw new Error(`census package contains ${prohibited}`);
  for (const required of [
    STAGING_CENSUS_SEMANTIC_CONTRACT.route,
    STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
    STAGING_CENSUS_ID,
    STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
    "controller_enforced_single_invocation_not_runtime_durable",
    STAGING_CENSUS_SEMANTIC_CONTRACT.consistencyClaim,
    "isolated_staging_read_only_census_only",
    "engine-os.os01-staging-census-failure.v1",
    "terminal_read_only_diagnostic_not_census_receipt"
  ]) if (!text.includes(required)) throw new Error(`census package omits ${required}`);

  const metadata = join(outDir, ".openai");
  mkdirSync(metadata, { recursive: true });
  const hosting = `${JSON.stringify({ project_id: input.projectId, d1: "DB", r2: null }, null, 2)}\n`;
  writeFileSync(join(metadata, "hosting.json"), hosting, { encoding: "utf8", flag: "wx" });
  const payloadFiles = files(outDir).map((path) => path.slice(outDir.length + 1));
  if (JSON.stringify(payloadFiles) !== JSON.stringify([".openai/hosting.json", entryPath]) ||
      payloadFiles.some((path) => path.includes("drizzle") || path.endsWith(".sql"))) {
    throw new Error("census package contains an automatic migration path");
  }
  const manifest = {
    version: "engine-os.os01-staging-census-package.v2",
    status: "isolated_read_only_diagnostic",
    projectId: input.projectId,
    entryPath,
    entrySha256: sha256(entry),
    semanticContract: STAGING_CENSUS_SEMANTIC_CONTRACT,
    qualificationId: STAGING_CENSUS_ID,
    expectedCatalogHash: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
    expectedCatalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
    expectedUserTableCount: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount,
    request: {
      method: STAGING_CENSUS_SEMANTIC_CONTRACT.method,
      origin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
      route: STAGING_CENSUS_SEMANTIC_CONTRACT.route,
      query: "",
      contentType: STAGING_CENSUS_SEMANTIC_CONTRACT.contentType,
      version: STAGING_CENSUS_REQUEST_VERSION,
      censusId: STAGING_CENSUS_ID,
      exactBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256
    },
    runtimeBindings: ["DB"],
    providerBindings: [],
    scheduledTriggers: [],
    automaticMigrations: false,
    invocationControl: {
      ...STAGING_CENSUS_SEMANTIC_CONTRACT.invocationControl,
      controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
      canonicalControllerRoot: STAGING_CENSUS_CONTROLLER_ROOT,
      fixedArtifactNames: STAGING_CENSUS_ARTIFACT_NAMES,
      receiptMustBindOwnerOnlyNoWriterBoundaryBeforeAndAfter: true,
      secondInvocationProhibitedByOperatorContract: true,
      validWorkerResponseStatus: "pending_control_plane_postcheck",
      finalAcceptanceStatus: "accepted_read_only_census_after_control_plane_postcheck",
      maximumResponseBytes: 2097152,
      reflectedCredentialPersistenceAllowed: false
    },
    consistencyClaim: STAGING_CENSUS_SEMANTIC_CONTRACT.consistencyClaim,
    viewEvidence: STAGING_CENSUS_SEMANTIC_CONTRACT.viewEvidence,
    failureContract: {
      version: "engine-os.os01-staging-census-failure.v1",
      status: "read_only_census_failed",
      workerCategories: STAGING_CENSUS_FAILURE_CATEGORIES,
      controllerPersistableCategories: STAGING_CENSUS_PERSISTABLE_DIAGNOSTIC_CATEGORIES,
      exactAggregateOnlySchema: true,
      selfHashed: true,
      schemaNamesOrSqlAllowed: false,
      persistenceRequiresControllerValidation: true,
      terminalAndNonFinalizable: true
    },
    databaseMutationAllowed: false,
    productionAllowed: false,
    captureActivationAllowed: false
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = sha256(manifestBytes);
  writeFileSync(join(metadata, "os01-staging-census-package.v2.json"), manifestBytes, {
    encoding: "utf8",
    flag: "wx"
  });
  writeFileSync(join(metadata, "os01-staging-census-package.v2.sha256"),
    `${manifestSha256}  os01-staging-census-package.v2.json\n`, { encoding: "utf8", flag: "wx" });
  const finalPayloadFiles = files(outDir).map((path) => path.slice(outDir.length + 1));
  if (JSON.stringify(finalPayloadFiles) !== JSON.stringify([
    ".openai/hosting.json",
    ".openai/os01-staging-census-package.v2.json",
    ".openai/os01-staging-census-package.v2.sha256",
    entryPath
  ])) {
    throw new Error("census package final payload is not exact");
  }
  return { entrySha256: sha256(entry), manifestSha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await buildOs01StagingCensus({
    projectId: argument("--project-id"),
    outDir: argument("--out-dir")
  });
  process.stdout.write(`${basename(argument("--out-dir"))} ${result.entrySha256} ${result.manifestSha256}\n`);
}
