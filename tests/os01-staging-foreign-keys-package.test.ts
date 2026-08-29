import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  OS01_STAGING_FOREIGN_KEY_CANDIDATES,
  OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
  OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
  OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-foreign-keys/contract";
import { buildOs01StagingForeignKeys } from "../scripts/build_os01_staging_foreign_keys";

const created: string[] = [];
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "os01-staging-fk-package-"));
  created.push(root);
  return root;
}

describe("OS-01 Generation 11 foreign-key package", () => {
  it("builds two byte-identical DB-only packages with no migration or provider path", async () => {
    const root = temporaryRoot();
    const firstDir = join(root, "first");
    const secondDir = join(root, "second");
    const first = await buildOs01StagingForeignKeys({
      projectId: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId,
      outDir: firstDir
    });
    const second = await buildOs01StagingForeignKeys({
      projectId: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId,
      outDir: secondDir
    });
    expect(second).toEqual(first);
    const entry = readFileSync(join(firstDir, "dist/server/index.js"));
    const manifestBytes = readFileSync(join(
      firstDir, ".openai/os01-staging-foreign-keys-package.v1.json"
    ));
    expect(sha256(entry)).toBe(first.entrySha256);
    expect(sha256(manifestBytes)).toBe(first.manifestSha256);
    expect(sha256(readFileSync(join(secondDir, "dist/server/index.js")))).toBe(sha256(entry));
    expect(sha256(readFileSync(join(
      secondDir, ".openai/os01-staging-foreign-keys-package.v1.json"
    )))).toBe(sha256(manifestBytes));
    expect(readdirSync(join(firstDir, ".openai")).sort()).toEqual([
      "hosting.json",
      "os01-staging-foreign-keys-package.v1.json",
      "os01-staging-foreign-keys-package.v1.sha256"
    ]);
    expect(readdirSync(join(firstDir, "dist/server"))).toEqual(["index.js"]);
    const text = new TextDecoder().decode(entry);
    for (const prohibited of [
      "ODDS_API_KEY", "ENGINE_OS_CAPTURE_ENABLED", "the-odds-api.com", "COUNT(*)",
      "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "scheduled("
    ]) expect(text).not.toContain(prohibited);
  });

  it("binds the exact predecessor, 28 candidates, controller, and bounded claims", async () => {
    const root = temporaryRoot();
    const outDir = join(root, "package");
    await buildOs01StagingForeignKeys({
      projectId: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId,
      outDir
    });
    const manifest = JSON.parse(readFileSync(join(
      outDir, ".openai/os01-staging-foreign-keys-package.v1.json"
    ), "utf8")) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      version: "engine-os.os01-staging-foreign-keys-package.v1",
      status: "isolated_bounded_read_only_foreign_key_qualification",
      qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
      candidateRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
      expectedNormalizedForeignKeyRoot:
        OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot,
      runtimeBindings: ["DB"],
      providerBindings: [],
      scheduledTriggers: [],
      automaticMigrations: false
    });
    expect(manifest.candidateIdentities).toEqual(OS01_STAGING_FOREIGN_KEY_CANDIDATES);
    expect(manifest.predecessor).toEqual(OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.predecessor);
    expect(manifest.invocationControl).toMatchObject({
      controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
      requestBudget: 1,
      retryAfterIntent: false,
      secondInvocationProhibitedByOperatorContract: true
    });
    expect(manifest.boundaries).toEqual({
      databaseMutationAllowed: false,
      providerRequestAllowed: false,
      quotaReservationAllowed: false,
      productionAllowed: false,
      captureActivationAllowed: false,
      rowCountEvidenceAccepted: false,
      os01Accepted: false
    });
  });

  it("rejects any target other than the frozen isolated staging project", async () => {
    const root = temporaryRoot();
    await expect(buildOs01StagingForeignKeys({
      projectId: "appgprj_" + "0".repeat(32),
      outDir: join(root, "wrong")
    })).rejects.toThrow("target is not exact");
  });
});
