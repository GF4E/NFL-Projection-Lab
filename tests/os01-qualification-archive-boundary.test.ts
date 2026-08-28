import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  ProductionQualificationCoordinator,
  nestedArchiveKind,
  qualificationContextCommitment,
  verifyQualificationArchiveBoundary,
  type LocalBuildEvidence
} from "../scripts/run_os01_production_census";

const temporaryDirectories: string[] = [];
const contract = JSON.parse(readFileSync("config/os01-census-attestation.v1.json", "utf8")) as {
  buildIdentity: {
    qualificationBuild: {
      version: string;
      patchSha256: string;
      vinextVersion: string;
      vinextCredentialDomainPrefix: string;
      installedToolchainClosureRoot: string;
      installedToolchainPackageCount: number;
      nodeVersion: string;
      nodeExecutableSha256: string;
      pnpmVersion: string;
      pnpmExecutableSha256: string;
      lockfileSha256: string;
      workspaceSha256: string;
    };
  };
};

function fixture(): {
  coordinator: ProductionQualificationCoordinator;
  context: Buffer;
  evidence: LocalBuildEvidence["qualificationBuild"];
} {
  const now = new Date();
  const coordinator = ProductionQualificationCoordinator.start({ now, lifetimeMs: 60_000 });
  const transcriptHash = "a".repeat(64);
  const context = coordinator.deriveContext(transcriptHash, now.getTime() + 1_000);
  const qualification = contract.buildIdentity.qualificationBuild;
  return {
    coordinator,
    context,
    evidence: {
      version: qualification.version,
      role: "deployment",
      mode: "public_production_private_seed",
      runId: coordinator.runId,
      seedCommitment: coordinator.seedCommitment,
      contextCommitment: qualificationContextCommitment(context),
      transcriptHash,
      toolchainRoot: "b".repeat(64),
      installedToolchainClosureRoot: qualification.installedToolchainClosureRoot,
      installedToolchainPackageCount: qualification.installedToolchainPackageCount,
      nodeVersion: qualification.nodeVersion,
      nodeExecutableSha256: qualification.nodeExecutableSha256,
      pnpmVersion: qualification.pnpmVersion,
      pnpmExecutableSha256: qualification.pnpmExecutableSha256,
      lockfileSha256: qualification.lockfileSha256,
      workspaceSha256: qualification.workspaceSha256,
      vinextVersion: qualification.vinextVersion,
      patchSha256: qualification.patchSha256,
      targetProjectId: "test-production-project",
      targetAccessMode: "production"
    }
  };
}

function derivedCredential(context: Buffer): Buffer {
  const qualification = contract.buildIdentity.qualificationBuild;
  return Buffer.from(Buffer.from(createHmac("sha256", context)
    .update(Buffer.from(`${qualification.vinextCredentialDomainPrefix}\0`, "utf8"))
    .update("preview-mode-id", "utf8")
    .digest()
    .subarray(0, 16)).toString("hex"), "utf8");
}

function emptyZipBytes(): Buffer {
  return Buffer.from(`504b0506${"00".repeat(18)}`, "hex");
}

function legacyTarBytes(): Buffer {
  const bytes = Buffer.alloc(10 * 1024);
  bytes.write("nested.txt", 0, "ascii");
  bytes.write("0000644\0", 100, "ascii");
  bytes.write("0000000\0", 108, "ascii");
  bytes.write("0000000\0", 116, "ascii");
  bytes.write("00000000004\0", 124, "ascii");
  bytes.write("00000000000\0", 136, "ascii");
  bytes.fill(0x20, 148, 156);
  bytes[156] = 0x30;
  bytes.write("safe", 512, "ascii");
  const checksum = bytes.subarray(0, 512).reduce(
    (total: number, byte: number) => total + byte,
    0
  );
  bytes.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return bytes;
}

function ustarTarBytes(): Buffer {
  const bytes = legacyTarBytes();
  for (const [index, byte] of Buffer.from("ustar", "ascii").entries()) bytes[257 + index] = byte;
  bytes.fill(0x20, 148, 156);
  const checksum = bytes.subarray(0, 512).reduce(
    (total: number, byte: number) => total + byte,
    0
  );
  for (const [index, byte] of Buffer.from(
    `${checksum.toString(8).padStart(6, "0")}\0 `,
    "ascii"
  ).entries()) bytes[148 + index] = byte;
  return bytes;
}

function invalidUstarLookalikeBytes(): Buffer {
  const bytes = ustarTarBytes();
  for (const [index, byte] of Buffer.from("000000\0 ", "ascii").entries()) {
    bytes[148 + index] = byte;
  }
  return bytes;
}

function malformedTarChecksumFieldBytes(): Buffer {
  const bytes = ustarTarBytes();
  for (const [index, byte] of Buffer.from("000000\0X", "ascii").entries()) {
    bytes[148 + index] = byte;
  }
  return bytes;
}

function internalSpaceChecksumLookalikeBytes(): Buffer {
  const bytes = Buffer.alloc(512);
  bytes.fill(0xff, 0, 12);
  bytes[12] = 111;
  for (const [index, byte] of Buffer.from("00 6543\0", "ascii").entries()) {
    bytes[148 + index] = byte;
  }
  return bytes;
}

function repeatedBytes(value: string, count: number): Buffer {
  const item = Buffer.from(value, "binary");
  return Buffer.concat(Array.from({ length: count }, () => item));
}

function archive(input: { server: Uint8Array; client: Uint8Array; clientName?: string }): string {
  const directory = mkdtempSync(join(tmpdir(), "os01-archive-boundary-"));
  temporaryDirectories.push(directory);
  const dist = resolve(directory, "dist");
  mkdirSync(resolve(dist, "server"), { recursive: true });
  mkdirSync(resolve(dist, "client"), { recursive: true });
  mkdirSync(resolve(directory, ".openai"), { recursive: true });
  mkdirSync(resolve(directory, "drizzle/meta"), { recursive: true });
  writeFileSync(resolve(dist, "server/index.js"), input.server);
  writeFileSync(resolve(dist, "client", input.clientName ?? "app.js"), input.client);
  writeFileSync(resolve(directory, ".openai/hosting.json"), "{}", "utf8");
  writeFileSync(resolve(directory, "drizzle/meta/_journal.json"), "{}", "utf8");
  const path = resolve(directory, "site.tar.gz");
  execFileSync("/usr/bin/python3", [
    resolve("scripts/package_os01_site_archive.py"),
    "--repository-root", directory,
    "--output", path
  ], {
    cwd: resolve("."),
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: "/usr/bin:/bin", NODE_ENV: "test", PYTHONNOUSERSITE: "1" }
  });
  return path;
}

function inspectArchiveWithPython(path: string): void {
  execFileSync(
    "/usr/bin/python3",
    [resolve("scripts/inspect_site_archive.py"), "--stdin"],
    {
      cwd: resolve("."),
      input: readFileSync(path),
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin", NODE_ENV: "test", PYTHONNOUSERSITE: "1" }
    }
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("OS-01 qualification archive boundary", () => {
  it("permits derived credentials only in server bytes", () => {
    const value = fixture();
    try {
      const result = verifyQualificationArchiveBoundary({
        path: archive({ server: derivedCredential(value.context), client: Buffer.from("public", "utf8") }),
        qualificationBuild: value.evidence,
        productionCoordinator: value.coordinator
      });
      expect(result).toMatchObject({
        rawContextLeakCount: 0,
        nonServerDerivedCredentialLeakCount: 0,
        fileCount: 4,
        nonServerFileCount: 3
      });
    } finally {
      value.context.fill(0);
      value.coordinator.close();
    }
  });

  it("rejects derived credentials outside server and raw context anywhere", () => {
    const derived = fixture();
    try {
      expect(() => verifyQualificationArchiveBoundary({
        path: archive({ server: Buffer.from("server"), client: derivedCredential(derived.context) }),
        qualificationBuild: derived.evidence,
        productionCoordinator: derived.coordinator
      })).toThrow(/exposes qualification material|credential leaked outside the server archive/u);
    } finally {
      derived.context.fill(0);
      derived.coordinator.close();
    }

    const raw = fixture();
    try {
      expect(() => verifyQualificationArchiveBoundary({
        path: archive({ server: raw.context, client: Buffer.from("public") }),
        qualificationBuild: raw.evidence,
        productionCoordinator: raw.coordinator
      })).toThrow(/exposes qualification material|context leaked into archive member/u);
    } finally {
      raw.context.fill(0);
      raw.coordinator.close();
    }
  });

  it("rejects qualification material in member names without echoing the name", () => {
    const value = fixture();
    const secretName = `${Buffer.from(value.context).toString("hex").toUpperCase()}.js`;
    try {
      let error = "";
      try {
        verifyQualificationArchiveBoundary({
          path: archive({
            server: Buffer.from("server", "utf8"),
            client: Buffer.from("public", "utf8"),
            clientName: secretName
          }),
          qualificationBuild: value.evidence,
          productionCoordinator: value.coordinator
        });
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      expect(error).toMatch(/exposes qualification material/u);
      expect(error).not.toContain(secretName);
    } finally {
      value.context.fill(0);
      value.coordinator.close();
    }
  });

  it("rejects nested compressed payloads before qualification", () => {
    const value = fixture();
    try {
      expect(() => verifyQualificationArchiveBoundary({
        path: archive({
          server: Buffer.from("server", "utf8"),
          client: gzipSync(Buffer.from("opaque", "utf8"))
        }),
        qualificationBuild: value.evidence,
        productionCoordinator: value.coordinator
      })).toThrow(/nested compressed or archive payload/u);
    } finally {
      value.context.fill(0);
      value.coordinator.close();
    }
  });

  it("classifies nested signatures anywhere, including across streaming chunk boundaries", () => {
    expect(nestedArchiveKind(
      "dist/client/opaque.bin",
      Buffer.concat([Buffer.alloc(513, 0x61), emptyZipBytes()])
    )).toBe("zip");
    expect(nestedArchiveKind(
      "dist/client/opaque.bin",
      Buffer.concat([Buffer.alloc(16 * 1024 - 1, 0x61), gzipSync(Buffer.from("nested", "utf8"))])
    )).toBe("gzip");
    expect(nestedArchiveKind(
      "dist/client/opaque.bin",
      Buffer.concat([Buffer.from("prefix", "utf8"), Buffer.from("Rar!\x1a\x07\x00", "binary")])
    )).toBe("rar");
    expect(nestedArchiveKind(
      "dist/client/opaque.bin",
      Buffer.concat([Buffer.alloc(16 * 1024 - 3, 0x61), Buffer.from("Rar!\x1a\x07\x01\x00", "binary")])
    )).toBe("rar");
    expect(nestedArchiveKind("dist/client/payload.RAR", Buffer.from("ordinary"))).toBe("rar");
  });

  it("does not mistake partial magic bytes in legitimate binary assets for nested containers", () => {
    const legitimateBinary = Buffer.from([
      0x77, 0x4f, 0x46, 0x32, 0x00, 0x1f, 0x8b, 0x00, 0x89, 0x50, 0x4e, 0x47
    ]);
    expect(nestedArchiveKind("dist/client/font.woff2", legitimateBinary)).toBeNull();
    expect(nestedArchiveKind("dist/client/copy.js", Buffer.from("mustard", "utf8"))).toBeNull();

    const value = fixture();
    try {
      expect(verifyQualificationArchiveBoundary({
        path: archive({ server: Buffer.from("server"), client: legitimateBinary }),
        qualificationBuild: value.evidence,
        productionCoordinator: value.coordinator
      })).toMatchObject({ fileCount: 4, nonServerFileCount: 3 });
    } finally {
      value.context.fill(0);
      value.coordinator.close();
    }
  });

  it.each([
    [".7z", "7z"],
    [".br", "br"],
    [".bz2", "bz2"],
    [".gz", "gz"],
    [".rar", "rar"],
    [".tar", "tar"],
    [".tar.br", "br"],
    [".tar.bz2", "bz2"],
    [".tar.gz", "gz"],
    [".tar.xz", "xz"],
    [".tar.zst", "zst"],
    [".tgz", "tgz"],
    [".txz", "txz"],
    [".xz", "xz"],
    [".zip", "zip"],
    [".zst", "zst"],
    [".zstd", "zstd"]
  ])("keeps the TypeScript suffix policy aligned for %s", (suffix, expectedKind) => {
    expect(nestedArchiveKind(`dist/client/opaque${suffix}`, Buffer.from("ordinary")))
      .toBe(expectedKind);
  });

  it("uses ASCII-only case folding for deterministic cross-language suffix matching", () => {
    expect(nestedArchiveKind("dist/client/asset.ZSTD", Buffer.from("ordinary"))).toBe("zstd");
    expect(nestedArchiveKind("dist/client/asset.zſtd", Buffer.from("ordinary"))).toBeNull();
  });

  it("rejects prefixed RAR4 and RAR5 payloads in the canonical archive inspector", () => {
    for (const signature of [
      Buffer.from("Rar!\x1a\x07\x00", "binary"),
      Buffer.from("Rar!\x1a\x07\x01\x00", "binary")
    ]) {
      const value = fixture();
      try {
        expect(() => verifyQualificationArchiveBoundary({
          path: archive({
            server: Buffer.from("server", "utf8"),
            client: Buffer.concat([Buffer.from("prefixed", "utf8"), signature])
          }),
          qualificationBuild: value.evidence,
          productionCoordinator: value.coordinator
        })).toThrow(/nested compressed or archive payload/u);
      } finally {
        value.context.fill(0);
        value.coordinator.close();
      }
    }
  });

  it("rejects a renamed checksum-valid legacy TAR without a ustar marker", () => {
    const nested = legacyTarBytes();
    expect(Buffer.compare(nested.subarray(257, 262), Buffer.from("ustar", "ascii"))).not.toBe(0);
    expect(nestedArchiveKind("dist/client/opaque.bin", nested)).toBe("tar");
    expect(nestedArchiveKind(
      "dist/client/prefixed.bin",
      Buffer.concat([Buffer.from("prefix"), nested])
    )).toBe("tar");
    expect(nestedArchiveKind(
      "dist/client/prefixed-ustar.bin",
      Buffer.concat([Buffer.from("prefix"), ustarTarBytes()])
    )).toBe("tar");

    const value = fixture();
    try {
      expect(() => verifyQualificationArchiveBoundary({
        path: archive({ server: Buffer.from("server"), client: nested }),
        qualificationBuild: value.evidence,
        productionCoordinator: value.coordinator
      })).toThrow(/nested compressed or archive payload|forbidden nested tar/u);
      expect(() => verifyQualificationArchiveBoundary({
        path: archive({
          server: Buffer.from("server"),
          client: Buffer.concat([Buffer.from("prefix"), nested])
        }),
        qualificationBuild: value.evidence,
        productionCoordinator: value.coordinator
      })).toThrow(/nested compressed or archive payload|forbidden nested tar/u);
    } finally {
      value.context.fill(0);
      value.coordinator.close();
    }
  });

  it("does not classify a ustar marker with an invalid header checksum as TAR", () => {
    const invalid = invalidUstarLookalikeBytes();
    expect(Buffer.from(invalid.subarray(257, 262)).toString("ascii")).toBe("ustar");
    expect(nestedArchiveKind("dist/client/opaque.bin", invalid)).toBeNull();

    const value = fixture();
    try {
      expect(verifyQualificationArchiveBoundary({
        path: archive({ server: Buffer.from("server"), client: invalid }),
        qualificationBuild: value.evidence,
        productionCoordinator: value.coordinator
      })).toMatchObject({ fileCount: 4, nonServerFileCount: 3 });
    } finally {
      value.context.fill(0);
      value.coordinator.close();
    }
  });

  it("requires the canonical TAR checksum-field terminator in both verifiers", () => {
    const malformed = malformedTarChecksumFieldBytes();
    expect(nestedArchiveKind("dist/client/opaque.bin", malformed)).toBeNull();

    const value = fixture();
    try {
      expect(verifyQualificationArchiveBoundary({
        path: archive({ server: Buffer.from("server"), client: malformed }),
        qualificationBuild: value.evidence,
        productionCoordinator: value.coordinator
      })).toMatchObject({ fileCount: 4, nonServerFileCount: 3 });
    } finally {
      value.context.fill(0);
      value.coordinator.close();
    }
  });

  it("does not remove internal checksum-field spaces before parsing", () => {
    const lookalike = internalSpaceChecksumLookalikeBytes();
    expect(nestedArchiveKind("dist/client/opaque.bin", lookalike)).toBeNull();

    const value = fixture();
    try {
      expect(verifyQualificationArchiveBoundary({
        path: archive({ server: Buffer.from("server"), client: lookalike }),
        qualificationBuild: value.evidence,
        productionCoordinator: value.coordinator
      })).toMatchObject({ fileCount: 4, nonServerFileCount: 3 });
    } finally {
      value.context.fill(0);
      value.coordinator.close();
    }
  });

  it("counts only canonical checksum fields against the bounded TAR-candidate budget", () => {
    const malformedFlood = repeatedBytes("000000\0X", 5_000);
    const canonicalWrongChecksums = repeatedBytes("0000000\0", 2_300);
    const ambiguousOverflow = repeatedBytes("0000000\0", 4_300);
    expect(nestedArchiveKind("dist/client/malformed.bin", malformedFlood)).toBeNull();
    expect(nestedArchiveKind("dist/client/wrong.bin", canonicalWrongChecksums)).toBeNull();
    expect(nestedArchiveKind("dist/client/ambiguous.bin", ambiguousOverflow)).toBe("tar");

    for (const accepted of [malformedFlood, canonicalWrongChecksums]) {
      const value = fixture();
      try {
        const acceptedPath = archive({ server: Buffer.from("server"), client: accepted });
        expect(() => inspectArchiveWithPython(acceptedPath)).not.toThrow();
        expect(verifyQualificationArchiveBoundary({
          path: acceptedPath,
          qualificationBuild: value.evidence,
          productionCoordinator: value.coordinator
        })).toMatchObject({ fileCount: 4, nonServerFileCount: 3 });
      } finally {
        value.context.fill(0);
        value.coordinator.close();
      }
    }

    const rejected = fixture();
    try {
      const rejectedPath = archive({ server: Buffer.from("server"), client: ambiguousOverflow });
      expect(() => inspectArchiveWithPython(rejectedPath))
        .toThrow(/nested compressed or archive payload/u);
      expect(() => verifyQualificationArchiveBoundary({
        path: rejectedPath,
        qualificationBuild: rejected.evidence,
        productionCoordinator: rejected.coordinator
      })).toThrow(/nested compressed or archive payload|forbidden nested tar/u);
    } finally {
      rejected.context.fill(0);
      rejected.coordinator.close();
    }
  });

  it("rejects bsdtar selection-pattern metacharacters in member paths", () => {
    for (const clientName of ["foo?.js", "foo*.js", "[a].js", "back\\slash.js"]) {
      const value = fixture();
      try {
        expect(() => verifyQualificationArchiveBoundary({
          path: archive({ server: Buffer.from("server"), client: Buffer.from("unique"), clientName }),
          qualificationBuild: value.evidence,
          productionCoordinator: value.coordinator
        })).toThrow(/invalid path/u);
      } finally {
        value.context.fill(0);
        value.coordinator.close();
      }
    }
  });
});
