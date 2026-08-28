#!/usr/bin/env node

import { readSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  constructDeploymentProof,
  type DeploymentProofConstructionInput
} from "./run_os01_production_census";
import { publishEvidenceBytesExclusive } from "./os01-atomic-evidence";

const MAX_SANITIZED_INPUT_BYTES = 1_048_576;

function readBoundedInput(): string {
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const chunk = Buffer.allocUnsafe(16_384);
    const count = readSync(0, chunk, 0, chunk.byteLength, null);
    if (count === 0) break;
    total += count;
    if (total > MAX_SANITIZED_INPUT_BYTES) {
      throw new Error("sanitized deployment-proof input exceeds its byte limit");
    }
    chunks.push(chunk.subarray(0, count));
  }
  if (total === 0) throw new Error("sanitized deployment-proof input is empty");
  return Buffer.concat(chunks, total).toString("utf8");
}

export function writeDeploymentProofExclusive(
  outputInput: string,
  input: DeploymentProofConstructionInput,
  assertSafe?: (bytes: Uint8Array, label: string) => void
): string {
  const requested = resolve(outputInput);
  const proof = constructDeploymentProof(input);
  const proofBytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`, "utf8");
  assertSafe?.(proofBytes, "deployment proof");
  return publishEvidenceBytesExclusive(requested, proofBytes);
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function main(): void {
  if (process.argv.length !== 4 || process.argv[2] !== "--output") {
    throw new Error("usage: build_os01_deployment_proof.ts --output PATH");
  }
  const input = JSON.parse(readBoundedInput()) as DeploymentProofConstructionInput;
  const output = writeDeploymentProofExclusive(argument("--output"), input);
  process.stdout.write(`${output}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    process.stderr.write(
      `OS-01 deployment-proof builder failed: ${error instanceof Error ? error.message : "unknown error"}\n`
    );
    process.exitCode = 1;
  }
}
