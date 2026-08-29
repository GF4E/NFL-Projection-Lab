#!/usr/bin/env node

import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { canonicalJson } from "../qualification/os01-staging-census/contract.ts";
import {
  qualifyOs01StagingDdlOfflineReplay,
  readStableFile
} from "../qualification/os01-staging-census/offline-replay.ts";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRoot(paths: string[]): string {
  return sha256(canonicalJson(paths.map((path) => {
    const artifact = readStableFile(path);
    return { path: path.replace(`${process.cwd()}/`, ""), bytesSha256: artifact.bytesSha256 };
  })));
}

function main(): void {
  if (process.argv.length !== 2) throw new Error("offline replay accepts no arguments");
  const root = process.cwd();
  const response = readStableFile(resolve(root,
    ".planning/engine-os/execution/os-01/generation10-hosted-authority-v1/response.json"));
  const finalReceipt = readStableFile(resolve(root,
    ".planning/engine-os/execution/os-01/generation10-hosted-authority-v1/final-receipt.json"));
  const runnerSourceSha256 = sourceRoot([
    resolve(root, "qualification/os01-staging-census/contract.ts"),
    resolve(root, "qualification/os01-staging-census/offline-replay.ts"),
    resolve(root, "scripts/os01_staging_ddl_offline_replay.ts")
  ]);
  const testSourceSha256 = sourceRoot([
    resolve(root, "tests/os01-staging-ddl-offline-replay.test.ts")
  ]);
  const receipt = qualifyOs01StagingDdlOfflineReplay({
    hostedResponseBytes: response.bytes,
    hostedFinalReceiptBytes: finalReceipt.bytes,
    runnerSourceSha256,
    testSourceSha256,
    recordedAt: new Date().toISOString()
  });
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
}

main();
