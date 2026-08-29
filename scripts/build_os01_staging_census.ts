#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

const EXACT_STAGING_PROJECT_ID = "appgprj_6a92435d1d788191b4d6bcaff0a1525d";
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
    logLevel: "warn",
    build: {
      emptyOutDir: false,
      outDir,
      ssr: resolve("qualification/os01-staging-census/entry.ts"),
      target: "es2022",
      rollupOptions: { output: { entryFileNames: "server/index.js", format: "es" } }
    }
  });
  const entry = readFileSync(join(outDir, "server/index.js"));
  const text = new TextDecoder().decode(entry);
  for (const prohibited of [
    "ODDS_API_KEY",
    "ENGINE_OS_CAPTURE_ENABLED",
    "the-odds-api.com",
    "api.the-odds-api.com",
    "source_capture_provider_request"
  ]) if (text.includes(prohibited)) throw new Error(`census package contains ${prohibited}`);
  for (const required of [
    "/__engine-os/os01-staging-census/v1",
    "e1f160c7b5c53d59896bccd269caaebd95113190670fabe325ac336ce3b7d4c6",
    "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
    "isolated_staging_read_only_census_only"
  ]) if (!text.includes(required)) throw new Error(`census package omits ${required}`);

  const metadata = join(outDir, ".openai");
  mkdirSync(metadata, { recursive: true });
  const hosting = `${JSON.stringify({ project_id: input.projectId, d1: "DB", r2: null }, null, 2)}\n`;
  writeFileSync(join(metadata, "hosting.json"), hosting, { encoding: "utf8", flag: "wx" });
  if (files(outDir).some((path) => path.includes("drizzle") || path.endsWith(".sql"))) {
    throw new Error("census package contains an automatic migration path");
  }
  const manifest = {
    version: "engine-os.os01-staging-census-package.v1",
    status: "isolated_read_only_diagnostic",
    projectId: input.projectId,
    entrySha256: sha256(entry),
    expectedCatalogHash: "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
    expectedCatalogRows: 377,
    request: {
      method: "POST",
      route: "/__engine-os/os01-staging-census/v1",
      version: "engine-os.os01-staging-census-request.v1",
      censusId: "e1f160c7b5c53d59896bccd269caaebd95113190670fabe325ac336ce3b7d4c6",
      exactKeys: ["censusId", "version"]
    },
    runtimeBindings: ["DB"],
    providerBindings: [],
    scheduledTriggers: [],
    automaticMigrations: false,
    maximumRequests: 1,
    databaseMutationAllowed: false,
    productionAllowed: false,
    captureActivationAllowed: false
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSha256 = sha256(manifestBytes);
  writeFileSync(join(metadata, "os01-staging-census-package.v1.json"), manifestBytes, {
    encoding: "utf8",
    flag: "wx"
  });
  writeFileSync(join(metadata, "os01-staging-census-package.v1.sha256"),
    `${manifestSha256}  os01-staging-census-package.v1.json\n`, { encoding: "utf8", flag: "wx" });
  return { entrySha256: sha256(entry), manifestSha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await buildOs01StagingCensus({
    projectId: argument("--project-id"),
    outDir: argument("--out-dir")
  });
  process.stdout.write(`${basename(argument("--out-dir"))} ${result.entrySha256} ${result.manifestSha256}\n`);
}
