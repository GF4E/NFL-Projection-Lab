#!/usr/bin/env node

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const tempDirectory = mkdtempSync(resolve(root, ".tmp-drizzle-schema-check-"));
const relativeOutput = relative(root, tempDirectory);

try {
  cpSync(resolve(root, "drizzle/meta"), resolve(tempDirectory, "meta"), { recursive: true });
  const result = spawnSync("pnpm", [
    "exec",
    "drizzle-kit",
    "generate",
    "--dialect",
    "sqlite",
    "--schema",
    "./db/schema.ts",
    "--out",
    relativeOutput,
    "--name",
    "schema_drift_detected"
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0 || !output.includes("No schema changes, nothing to migrate")) {
    process.stderr.write(output);
    throw new Error("Drizzle declarations differ from the committed 0020 typed-schema snapshot");
  }
  process.stdout.write(
    `Drizzle typed schema verified against ${basename("drizzle/meta/0020_snapshot.json")}\n`
  );
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
