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
  if (!/^appgprj_[a-f0-9]{32}$/u.test(input.projectId)) {
    throw new Error("OS-01 hosted harness requires an exact staging Sites project id");
  }
  const workspaceRoot = resolve(input.workspaceRoot ?? process.cwd());
  const outDir = resolve(input.outDir);
  if (existsSync(outDir) && readdirSync(outDir).length !== 0) {
    throw new Error("OS-01 hosted harness output directory must be empty");
  }
  const qualificationContractPath = resolve(
    workspaceRoot,
    "config/os01-hosted-migration-qualification.v1.json"
  );
  const qualificationContractBytes = readFileSync(qualificationContractPath);
  const qualificationContract = JSON.parse(
    new TextDecoder().decode(qualificationContractBytes)
  ) as { version?: unknown; authority?: { sourceCommit?: unknown }; executionBoundary?: { productionAllowed?: unknown } };
  if (qualificationContract.version !== "os01-hosted-migration-qualification.2026.1" ||
      qualificationContract.authority?.sourceCommit !== "d24db5632410894d4f82c12e7f1d0c4c256a208d" ||
      qualificationContract.executionBoundary?.productionAllowed !== false) {
    throw new Error("OS-01 hosted qualification contract is not the frozen staging contract");
  }
  const authority = loadOs01HostedMigrationAuthority(workspaceRoot);
  const capacity = calculateHostedMigrationCapacity(authority);
  if (capacity.blankReplayInvocationQueries !== 489 || capacity.blankReplayBatchStatements !== 295) {
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
      return id === RESOLVED_VIRTUAL_ID ? `export default ${authorityJson};` : null;
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
    version: "engine-os.os01-hosted-migration-package.v1",
    qualificationOnly: true,
    projectId: input.projectId,
    entryPath: "server/index.js",
    entrySha256: sha256(entry),
    hostingSha256: sha256(hostingBytes),
    authoritySha256,
    qualificationContract: {
      path: "config/os01-hosted-migration-qualification.v1.json",
      sha256: sha256(qualificationContractBytes)
    },
    sourceAuthorityCommit: authority.sourceCommit,
    migrationBundleHash: authority.migrationBundleHash,
    legacyMigrationBundleHash: authority.legacyMigrationBundleHash,
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
      activePredeployProbeIncluded: false,
      capacityQualificationStatus: "blocked_no_authoritative_sites_effective_limit_or_duration_proof"
    },
    deploymentAllowed: false,
    ownerOnlyAccessRequiredBeforeDeploy: true,
    captureActivationAllowed: false,
    productionAllowed: false,
    outputFiles: [
      ...outputFiles,
      ".openai/os01-hosted-migration-package.v1.json",
      ".openai/os01-hosted-migration-package.v1.sha256"
    ].sort()
  };
  const manifestPath = join(metadataRoot, "os01-hosted-migration-package.v1.json");
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = sha256(manifestBytes);
  writeFileSync(manifestPath, manifestBytes, { encoding: "utf8", flag: "wx" });
  writeFileSync(
    join(metadataRoot, "os01-hosted-migration-package.v1.sha256"),
    `${manifestSha256}  os01-hosted-migration-package.v1.json\n`,
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
