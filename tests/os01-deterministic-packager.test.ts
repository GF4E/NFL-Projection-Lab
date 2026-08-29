import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  expectedPackageManifest,
  ImmutableLocalArchiveSnapshot,
  localArchiveEvidence
} from "../scripts/run_os01_production_census";

const directories: string[] = [];

function fixture(name: string, content = "worker"): string {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  directories.push(root);
  mkdirSync(join(root, "dist/server"), { recursive: true });
  mkdirSync(join(root, ".openai"), { recursive: true });
  mkdirSync(join(root, "drizzle/meta"), { recursive: true });
  writeFileSync(join(root, "dist/server/index.js"), content, "utf8");
  writeFileSync(join(root, ".openai/hosting.json"), "{}", "utf8");
  writeFileSync(join(root, "drizzle/meta/_journal.json"), "{}", "utf8");
  return root;
}

function packageArchive(root: string, name: string): Buffer {
  const output = join(root, name);
  execFileSync("/usr/bin/python3", [
    resolve("scripts/package_os01_site_archive.py"),
    "--repository-root", root,
    "--output", output
  ], {
    cwd: resolve("."),
    env: { PATH: "/usr/bin:/bin", NODE_ENV: "test", PYTHONNOUSERSITE: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  return readFileSync(output);
}

function emptyZipBytes(): Buffer {
  return Buffer.from(`504b0506${"00".repeat(18)}`, "hex");
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("OS-01 deterministic local Sites packager", () => {
  it("reproduces exact archive bytes across roots and source mtimes", () => {
    const first = fixture("os01-package-first");
    const second = fixture("os01-package-second");
    utimesSync(join(first, "dist/server/index.js"), new Date(1_000), new Date(1_000));
    utimesSync(join(second, "dist/server/index.js"), new Date(9_000_000), new Date(9_000_000));
    const left = packageArchive(first, "first.tar.gz");
    const right = packageArchive(second, "second.tar.gz");
    expect(createHash("sha256").update(left).digest("hex")).toBe(
      createHash("sha256").update(right).digest("hex")
    );
    expect(left.byteLength).toBe(right.byteLength);
    const archive = localArchiveEvidence(join(first, "first.tar.gz"));
    expect(expectedPackageManifest(first)).toEqual({
      contentRoot: archive.contentRoot,
      fileListRoot: archive.fileListRoot,
      fileCount: archive.fileCount
    });
  });

  it("changes the archive when a qualified input byte changes", () => {
    const first = fixture("os01-package-change-a", "worker-a");
    const second = fixture("os01-package-change-b", "worker-b");
    expect(createHash("sha256").update(packageArchive(first, "a.tar.gz")).digest("hex")).not.toBe(
      createHash("sha256").update(packageArchive(second, "b.tar.gz")).digest("hex")
    );
  });

  it("deduplicates a byte-identical generated hosting document", () => {
    const root = fixture("os01-package-identical-hosting");
    mkdirSync(join(root, "dist/.openai"), { recursive: true });
    writeFileSync(join(root, "dist/.openai/hosting.json"), "{}", "utf8");
    packageArchive(root, "identical-hosting.tar.gz");
    const archive = localArchiveEvidence(join(root, "identical-hosting.tar.gz"));
    expect(expectedPackageManifest(root)).toEqual({
      contentRoot: archive.contentRoot,
      fileListRoot: archive.fileListRoot,
      fileCount: archive.fileCount
    });
  });

  it("rejects a conflicting generated hosting document", () => {
    const root = fixture("os01-package-conflicting-hosting");
    mkdirSync(join(root, "dist/.openai"), { recursive: true });
    writeFileSync(join(root, "dist/.openai/hosting.json"), "{\"different\":true}", "utf8");
    expect(() => packageArchive(root, "conflicting-hosting.tar.gz")).toThrow(
      /archive path collision contains different bytes/u
    );
    expect(() => expectedPackageManifest(root)).toThrow(
      /package path collision contains different bytes/u
    );
  });

  it("rejects symbolic-link inputs and refuses archive overwrite", () => {
    const root = fixture("os01-package-link");
    symlinkSync("index.js", join(root, "dist/server/link.js"));
    expect(() => packageArchive(root, "link.tar.gz")).toThrow();
    rmSync(join(root, "dist/server/link.js"));
    packageArchive(root, "once.tar.gz");
    expect(() => packageArchive(root, "once.tar.gz")).toThrow();
  });

  it("rejects bytes after the sole gzip member and concatenated gzip members", () => {
    const root = fixture("os01-package-envelope");
    const canonical = packageArchive(root, "canonical.tar.gz");
    const trailingPath = join(root, "trailing.tar.gz");
    writeFileSync(trailingPath, Buffer.concat([canonical, Buffer.from("tail", "utf8")]));
    expect(() => localArchiveEvidence(trailingPath)).toThrow(
      /trailing bytes or concatenated gzip members/u
    );

    const concatenatedPath = join(root, "concatenated.tar.gz");
    writeFileSync(concatenatedPath, Buffer.concat([canonical, canonical]));
    expect(() => localArchiveEvidence(concatenatedPath)).toThrow(
      /trailing bytes or concatenated gzip members/u
    );
  });

  it("rejects a non-canonical gzip header and nested compressed bytes", () => {
    const root = fixture("os01-package-noncanonical");
    const canonical = packageArchive(root, "canonical.tar.gz");
    const noncanonical = Buffer.from(canonical);
    noncanonical[9] = 3;
    const noncanonicalPath = join(root, "noncanonical.tar.gz");
    writeFileSync(noncanonicalPath, noncanonical);
    expect(() => localArchiveEvidence(noncanonicalPath)).toThrow(
      /gzip header is not canonical/u
    );

    mkdirSync(join(root, "dist/client"), { recursive: true });
    writeFileSync(join(root, "dist/client/opaque.bin"), gzipSync(Buffer.from("nested", "utf8")));
    packageArchive(root, "nested.tar.gz");
    expect(() => localArchiveEvidence(join(root, "nested.tar.gz"))).toThrow(
      /nested compressed or archive payload/u
    );
  });

  it("rejects a valid ZIP payload after a 513-byte opaque prefix", () => {
    const root = fixture("os01-package-prefixed-zip");
    mkdirSync(join(root, "dist/client"), { recursive: true });
    writeFileSync(
      join(root, "dist/client/opaque.bin"),
      Buffer.concat([Buffer.alloc(513, 0x61), emptyZipBytes()])
    );
    packageArchive(root, "prefixed-zip.tar.gz");
    expect(() => localArchiveEvidence(join(root, "prefixed-zip.tar.gz"))).toThrow(
      /nested compressed or archive payload/u
    );
  });

  it("rejects a nested signature split across archive-member read chunks", () => {
    const root = fixture("os01-package-cross-chunk-gzip");
    mkdirSync(join(root, "dist/client"), { recursive: true });
    writeFileSync(
      join(root, "dist/client/opaque.bin"),
      Buffer.concat([Buffer.alloc(16 * 1024 - 1, 0x61), gzipSync(Buffer.from("nested", "utf8"))])
    );
    packageArchive(root, "cross-chunk-gzip.tar.gz");
    expect(() => localArchiveEvidence(join(root, "cross-chunk-gzip.tar.gz"))).toThrow(
      /nested compressed or archive payload/u
    );
  });

  it("rejects non-canonical tar padding inside a single valid gzip member", () => {
    const root = fixture("os01-package-tar-padding");
    const canonical = packageArchive(root, "canonical.tar.gz");
    const paddedTar = Buffer.concat([gunzipSync(canonical), Buffer.alloc(10_240)]);
    const noncanonical = gzipSync(paddedTar, { level: 9 });
    Buffer.from("1f8b08000000000002ff", "hex").copy(noncanonical, 0);
    const path = join(root, "padded.tar.gz");
    writeFileSync(path, noncanonical);
    expect(() => localArchiveEvidence(path)).toThrow(/non-canonical zero padding/u);
  });

  it.each([
    ["same bytes", false],
    ["different bytes", true]
  ])("rejects a same-path replacement containing %s", (_label, changeBytes) => {
    const root = fixture(`os01-package-swap-${changeBytes ? "different" : "same"}`);
    packageArchive(root, "snapshot.tar.gz");
    const path = join(root, "snapshot.tar.gz");
    const originalBytes = readFileSync(path);
    const snapshot = ImmutableLocalArchiveSnapshot.open(path);
    try {
      renameSync(path, join(root, "snapshot.original.tar.gz"));
      const replacement = changeBytes
        ? Buffer.concat([originalBytes, Buffer.from("replacement", "utf8")])
        : originalBytes;
      writeFileSync(path, replacement, { mode: 0o600 });
      expect(() => snapshot.assertUnchanged()).toThrow(/identity changed/u);
      expect(() => localArchiveEvidence(snapshot)).toThrow(/identity changed/u);
    } finally {
      snapshot.close();
      originalBytes.fill(0);
    }
  });
});
