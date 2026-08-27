import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import {
  configuredTrustedTarget,
  qualificationBuildContext
} from "../scripts/run_os01_production_census";

type QualificationEntropyModule = {
  qualificationBuildHex(domain: string): string | undefined;
  runWithQualificationBuildContext<T>(context: Buffer, callback: () => T | Promise<T>): Promise<T>;
};

type PreviewCredentialsModule = {
  createPreviewBuildCredentials(): { id: string; signingKey: string; encryptionKey: string };
};

const contract = JSON.parse(readFileSync("config/os01-census-attestation.v1.json", "utf8")) as {
  buildIdentity: {
    qualificationBuild: {
      modeFlag: string;
      patchPath: string;
      patchSha256: string;
      pnpmPatchHash: string;
      vinextVersion: string;
      patchedRuntimeRoot: string;
      patchedRuntimePaths: string[];
      normalBuildScriptsMayUseModeFlag: boolean;
      publicOrProductionDeploymentAllowed: boolean;
      targetAccessRequired: string;
    };
  };
};

const qualification = contract.buildIdentity.qualificationBuild;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function loadQualificationEntropy(): Promise<QualificationEntropyModule> {
  const path = resolve("node_modules/vinext/dist/build/qualification-entropy.js");
  return await import(pathToFileURL(path).href) as QualificationEntropyModule;
}

async function loadPreviewCredentials(): Promise<PreviewCredentialsModule> {
  const path = resolve("node_modules/vinext/dist/build/preview-credentials.js");
  return await import(pathToFileURL(path).href) as PreviewCredentialsModule;
}

describe("pinned Vinext qualification build mode", () => {
  it("binds the exact patch, lock mapping, runtime closure, and owner-only policy", () => {
    const patch = readFileSync(qualification.patchPath);
    expect(sha256(patch)).toBe(qualification.patchSha256);
    expect(qualification.pnpmPatchHash).toBe(qualification.patchSha256);
    const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
    const lock = readFileSync("pnpm-lock.yaml", "utf8");
    expect(workspace.match(new RegExp(
      `vinext@${qualification.vinextVersion.replaceAll(".", "\\.")}: ${qualification.patchPath.replaceAll(".", "\\.")}`,
      "gu"
    ))).toHaveLength(1);
    expect(lock.match(new RegExp(
      `vinext@${qualification.vinextVersion.replaceAll(".", "\\.")}: ${qualification.pnpmPatchHash}`,
      "gu"
    ))).toHaveLength(1);
    const installedRoot = resolve("node_modules/vinext");
    const runtimeRecords = qualification.patchedRuntimePaths.map((path) => {
      const bytes = readFileSync(resolve(installedRoot, path));
      return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
    });
    const stableRecords = runtimeRecords.map((record) => ({
      bytes: record.bytes,
      path: record.path,
      sha256: record.sha256
    }));
    expect(sha256(JSON.stringify(stableRecords))).toBe(qualification.patchedRuntimeRoot);
    expect(qualification.targetAccessRequired).toBe("owner_only");
    expect(qualification.publicOrProductionDeploymentAllowed).toBe(false);
    expect(qualification.normalBuildScriptsMayUseModeFlag).toBe(false);
    expect(readFileSync("package.json", "utf8")).not.toContain(qualification.modeFlag);
  });

  it("derives six separated domains and leaves ordinary calls random", async () => {
    const entropy = await loadQualificationEntropy();
    const preview = await loadPreviewCredentials();
    const context = createHash("sha256").update("qualification-fixture-a", "utf8").digest();
    const domains = [
      ["pages-client-assets-build-session", 16],
      ["prerender-secret", 32],
      ["preview-mode-encryption-key", 32],
      ["preview-mode-id", 16],
      ["preview-mode-signing-key", 32],
      ["shared-revalidate-secret", 32]
    ] as const;
    const derived = await entropy.runWithQualificationBuildContext(context, () => Object.fromEntries(
      domains.map(([domain]) => [domain, entropy.qualificationBuildHex(domain)])
    ));
    for (const [domain, length] of domains) {
      const expected = Buffer.from(createHmac("sha256", context)
        .update(Buffer.from("vinext/qualification-build/v1\0", "utf8"))
        .update(domain, "utf8")
        .digest())
        .subarray(0, length)
        .toString("hex");
      expect(derived[domain]).toBe(expected);
      expect(derived[domain]).toHaveLength(length * 2);
    }
    expect(new Set(Object.values(derived)).size).toBe(domains.length);
    expect(entropy.qualificationBuildHex("preview-mode-id")).toBeUndefined();
    const ordinaryA = preview.createPreviewBuildCredentials();
    const ordinaryB = preview.createPreviewBuildCredentials();
    expect(ordinaryA).not.toEqual(ordinaryB);
    expect(ordinaryA.id).toMatch(/^[a-f0-9]{32}$/u);
    expect(ordinaryA.signingKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(ordinaryA.encryptionKey).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("changes every derived domain when the public package context changes", async () => {
    const entropy = await loadQualificationEntropy();
    const domains = [
      "pages-client-assets-build-session",
      "prerender-secret",
      "preview-mode-encryption-key",
      "preview-mode-id",
      "preview-mode-signing-key",
      "shared-revalidate-secret"
    ];
    const first = await entropy.runWithQualificationBuildContext(
      createHash("sha256").update("qualification-fixture-a", "utf8").digest(),
      () => domains.map((domain) => entropy.qualificationBuildHex(domain))
    );
    const second = await entropy.runWithQualificationBuildContext(
      createHash("sha256").update("qualification-fixture-b", "utf8").digest(),
      () => domains.map((domain) => entropy.qualificationBuildHex(domain))
    );
    expect(first.every((value, index) => value !== second[index])).toBe(true);
  });

  it("rejects malformed, duplicate, nested, and non-build activation", async () => {
    const entropy = await loadQualificationEntropy();
    await expect(entropy.runWithQualificationBuildContext(Buffer.alloc(31), () => undefined))
      .rejects.toThrow("exactly 32 bytes");
    await expect(entropy.runWithQualificationBuildContext(Buffer.alloc(32), async () => {
      await entropy.runWithQualificationBuildContext(Buffer.alloc(32), () => undefined);
    })).rejects.toThrow("already active");

    const cli = resolve("node_modules/vinext/dist/cli.js");
    const minimalEnvironment = {
      PATH: `${resolve(process.execPath, "..")}:/usr/bin:/bin`,
      NODE_ENV: "production",
      CI: "1"
    } as const;
    const malformed = spawnSync(process.execPath, [cli, "build", qualification.modeFlag], {
      cwd: resolve("."),
      input: Buffer.alloc(31),
      encoding: "utf8",
      env: minimalEnvironment
    });
    expect(malformed.status).not.toBe(0);
    expect(malformed.stderr).toContain("exactly 32 bytes");

    const duplicate = spawnSync(process.execPath, [
      cli, "build", qualification.modeFlag, qualification.modeFlag
    ], {
      cwd: resolve("."),
      input: Buffer.alloc(32),
      encoding: "utf8",
      env: minimalEnvironment
    });
    expect(duplicate.status).not.toBe(0);
    expect(duplicate.stderr).toContain("exactly once");

    const wrongCommand = spawnSync(process.execPath, [cli, "check", qualification.modeFlag], {
      cwd: resolve("."),
      input: Buffer.alloc(32),
      encoding: "utf8",
      env: minimalEnvironment
    });
    expect(wrongCommand.status).not.toBe(0);
    expect(wrongCommand.stderr).toContain("valid only for the build command");
  });

  it("rejects the deterministic qualification mode for the public production target", () => {
    expect(() => qualificationBuildContext({
      repositoryRoot: resolve("."),
      expectedCommit: "0".repeat(40),
      role: "deployment",
      target: configuredTrustedTarget("production")
    })).toThrow("restricted to the retired owner-only census lane");
  });
});
