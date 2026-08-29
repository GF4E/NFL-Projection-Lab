import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  OS01_BUILD_TOOLCHAIN_EVIDENCE_VERSION,
  assertBuildToolchainEvidenceUnchanged,
  authorityLoaderCommand,
  type BuildToolchainSystemExecutable,
  buildInstalledToolchainEvidence
} from "../scripts/os01-build-toolchain-evidence";

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeExecutable(path: string, version: string): void {
  writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`, { mode: 0o755 });
  chmodSync(path, 0o755);
}

function packageTarget(input: {
  dependencies?: Record<string, string>;
  name: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  root: string;
  snapshot: string;
  version: string;
}): string {
  const target = resolve(
    input.root,
    "node_modules/.pnpm",
    input.snapshot,
    "node_modules",
    ...input.name.split("/")
  );
  mkdirSync(target, { recursive: true });
  writeFileSync(
    resolve(target, "package.json"),
    `${JSON.stringify({
      dependencies: input.dependencies,
      name: input.name,
      optionalDependencies: input.optionalDependencies,
      peerDependencies: input.peerDependencies,
      peerDependenciesMeta: input.peerDependenciesMeta,
      version: input.version
    })}\n`
  );
  writeFileSync(resolve(target, "runtime.js"), `export const identity = '${input.name}';\n`);
  return target;
}

function linkPackage(nodeModulesRoot: string, name: string, target: string): void {
  const link = resolve(nodeModulesRoot, ...name.split("/"));
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(target, link);
}

function fixture(
  sharedSystemExecutables?: readonly BuildToolchainSystemExecutable[],
  sharedSystemVersionPath?: string
): {
  nodeExecutablePath: string;
  pnpmExecutablePath: string;
  root: string;
  systemVersionPath: string;
  systemExecutables: readonly BuildToolchainSystemExecutable[];
} {
  const root = mkdtempSync(join(tmpdir(), "os01-toolchain-"));
  mkdirSync(resolve(root, "node_modules/.pnpm"), { recursive: true });
  mkdirSync(resolve(root, "patches"), { recursive: true });
  const patch = "diff --git a/runtime.js b/runtime.js\n";
  writeFileSync(resolve(root, "patches/root@1.0.0.patch"), patch);
  writeFileSync(
    resolve(root, "package.json"),
    `${JSON.stringify({
      devDependencies: { root: "1.0.0" },
      packageManager: "pnpm@11.16.0"
    })}\n`
  );
  writeFileSync(
    resolve(root, "pnpm-workspace.yaml"),
    "packages:\n  - .\npatchedDependencies:\n  root@1.0.0: patches/root@1.0.0.patch\n"
  );
  writeFileSync(
    resolve(root, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'\npatchedDependencies:\n  root@1.0.0: ${sha256(patch)}\n`
  );

  const childTarget = packageTarget({
    name: "child",
    root,
    snapshot: "child@1.0.0",
    version: "1.0.0"
  });
  const peerTarget = packageTarget({
    name: "peer",
    root,
    snapshot: "peer@2.0.0",
    version: "2.0.0"
  });
  const rootTarget = packageTarget({
    dependencies: { child: "1.0.0" },
    name: "root",
    optionalDependencies: { absent: "1.0.0" },
    peerDependencies: { peer: "2.0.0", "peer-optional": "3.0.0" },
    peerDependenciesMeta: { "peer-optional": { optional: true } },
    root,
    snapshot: "root@1.0.0_peer@2.0.0",
    version: "1.0.0"
  });
  const dependencyRoot = dirname(rootTarget);
  linkPackage(dependencyRoot, "child", childTarget);
  linkPackage(dependencyRoot, "peer", peerTarget);
  linkPackage(resolve(root, "node_modules"), "root", rootTarget);

  const executableRoot = resolve(root, "executables");
  mkdirSync(executableRoot);
  const nodeExecutablePath = resolve(executableRoot, "node-exact");
  const pnpmExecutablePath = resolve(executableRoot, "pnpm-exact");
  writeExecutable(nodeExecutablePath, "v24.19.0");
  writeExecutable(pnpmExecutablePath, "11.16.0");
  mkdirSync(resolve(executableRoot, "dist"));
  writeFileSync(resolve(executableRoot, "dist/pnpm.mjs"), "export const runtime = 'pnpm';\n");
  writeFileSync(
    resolve(executableRoot, "package.json"),
    '{"name":"@pnpm/exe","version":"11.16.0"}\n'
  );
  const pythonRuntimeRoot = resolve(executableRoot, "python-runtime");
  mkdirSync(resolve(pythonRuntimeRoot, "lib"), { recursive: true });
  writeFileSync(resolve(pythonRuntimeRoot, "lib/runtime.py"), "RUNTIME = 'frozen'\n");
  symlinkSync("lib/runtime.py", resolve(pythonRuntimeRoot, "runtime-link.py"));
  const systemExecutables = sharedSystemExecutables ?? [
    { id: "bsdtar", path: resolve(executableRoot, "bsdtar-exact"), resourceTrees: [] },
    { id: "git", path: resolve(executableRoot, "git-exact"), resourceTrees: [] },
    {
      id: "python3",
      path: resolve(executableRoot, "python3-exact"),
      resourceTrees: [{ id: "python-runtime", path: pythonRuntimeRoot }]
    }
  ];
  if (sharedSystemExecutables === undefined) {
    writeExecutable(systemExecutables[0]!.path, "bsdtar test 1.0.0");
    writeExecutable(systemExecutables[1]!.path, "git version 1.0.0");
    writeExecutable(systemExecutables[2]!.path, "Python 3.9.6");
  }
  const canonicalSystemExecutables = systemExecutables.map((entry) => ({
    id: entry.id,
    path: realpathSync(entry.path),
    resourceTrees: [...(entry.resourceTrees ?? [])].map((resource) => ({
      id: resource.id,
      path: realpathSync(resource.path)
    }))
  }));
  const requestedSystemVersionPath = sharedSystemVersionPath ?? resolve(executableRoot, "SystemVersion.plist");
  if (sharedSystemVersionPath === undefined) {
    writeFileSync(requestedSystemVersionPath, [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<plist><dict>",
      "<key>ProductVersion</key><string>26.6.2</string>",
      "<key>ProductBuildVersion</key><string>25G82</string>",
      "</dict></plist>\n"
    ].join(""));
  }
  const systemVersionPath = realpathSync(requestedSystemVersionPath);
  return {
    nodeExecutablePath,
    pnpmExecutablePath,
    root,
    systemVersionPath,
    systemExecutables: canonicalSystemExecutables
  };
}

function buildFixture(
  input: ReturnType<typeof fixture>,
  expectedSystemExecutables?: ReturnType<typeof buildInstalledToolchainEvidence>["systemExecutables"]
) {
  return buildInstalledToolchainEvidence({
    ...input,
    expectedSystemExecutables,
    authorityLoader: { packageName: "root", files: ["package.json", "runtime.js"] },
    patches: [{ packageId: "root@1.0.0", path: "patches/root@1.0.0.patch" }],
    seedPackages: ["root"],
    systemVersionPath: input.systemVersionPath
  });
}

function buildFixtureFromProjectDeclarations(input: ReturnType<typeof fixture>) {
  return buildInstalledToolchainEvidence({
    ...input,
    authorityLoader: { packageName: "root", files: ["package.json", "runtime.js"] },
    mandatorySeedPackages: ["root"],
    patches: [{ packageId: "root@1.0.0", path: "patches/root@1.0.0.patch" }],
    systemVersionPath: input.systemVersionPath
  });
}

describe("OS-01 installed build-toolchain evidence", () => {
  it("closes and deterministically hashes dependencies, peers, optional absences, files, and executables", () => {
    const input = fixture();
    const first = buildFixture(input);
    const second = buildFixture(input);
    const pathIndependentInput = fixture(input.systemExecutables, input.systemVersionPath);
    pathIndependentInput.pnpmExecutablePath = input.pnpmExecutablePath;
    const pathIndependent = buildFixture(pathIndependentInput);

    expect(second).toEqual(first);
    expect(pathIndependent.closureRoot).toBe(first.closureRoot);
    expect(first.version).toBe(OS01_BUILD_TOOLCHAIN_EVIDENCE_VERSION);
    expect(first.packageCount).toBe(3);
    expect(first.seedPackages).toEqual(["root"]);
    expect(first.node.version).toBe("v24.19.0");
    expect(first.pnpm.version).toBe("11.16.0");
    expect(first.pnpmRuntime).toEqual(expect.objectContaining({
      id: "pnpm-runtime",
      fileCount: expect.any(Number),
      symlinkCount: expect.any(Number)
    }));
    expect(first.systemExecutables.map((entry) => entry.id)).toEqual([
      "bsdtar",
      "git",
      "python3"
    ]);
    expect(first.systemExecutables.find((entry) => entry.id === "python3")?.resourceTrees)
      .toEqual([expect.objectContaining({ fileCount: 1, symlinkCount: 1 })]);
    expect(first.platformIdentity.productBuildVersion).toBe("25G82");
    expect(first.authorityLoader.packageName).toBe("root");
    expect(first.projectManifest.path).toBe("package.json");
    expect(first.closureRoot).toMatch(/^[0-9a-f]{64}$/);
    const rootPackage = first.packages.find((pkg) => pkg.name === "root")!;
    expect(rootPackage.dependencies.map((edge) => [edge.alias, edge.kind])).toEqual([
      ["child", "dependency"],
      ["peer", "peer"]
    ]);
    expect(rootPackage.missingOptional.map((dependency) => dependency.alias)).toEqual([
      "absent",
      "peer-optional"
    ]);
  });

  it("derives roots from every project dependency declaration and binds application packages", () => {
    const input = fixture();
    const applicationTarget = packageTarget({
      name: "application-runtime",
      root: input.root,
      snapshot: "application-runtime@1.0.0",
      version: "1.0.0"
    });
    linkPackage(resolve(input.root, "node_modules"), "application-runtime", applicationTarget);
    const manifestPath = resolve(input.root, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.dependencies = { "application-runtime": "1.0.0" };
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);

    const first = buildFixtureFromProjectDeclarations(input);
    expect(first.seedPackages).toEqual(["application-runtime", "root"]);
    expect(first.packages.map((pkg) => pkg.name)).toEqual(expect.arrayContaining([
      "application-runtime", "root"
    ]));

    writeFileSync(
      resolve(input.root, "node_modules/application-runtime/runtime.js"),
      "export const identity = 'application-runtime-corrupt';\n"
    );
    expect(buildFixtureFromProjectDeclarations(input).closureRoot).not.toBe(first.closureRoot);

    const omitted = fixture();
    const omittedManifestPath = resolve(omitted.root, "package.json");
    const omittedManifest = JSON.parse(readFileSync(omittedManifestPath, "utf8"));
    omittedManifest.dependencies = { "application-runtime": "1.0.0" };
    writeFileSync(omittedManifestPath, `${JSON.stringify(omittedManifest)}\n`);
    expect(() => buildFixtureFromProjectDeclarations(omitted))
      .toThrow(/build seed package application-runtime is not installed/);
  });

  it("changes the root when package-owned bytes change", () => {
    const input = fixture();
    const before = buildFixture(input);
    const rootPackage = resolve(input.root, "node_modules/root/runtime.js");
    writeFileSync(rootPackage, "export const identity = 'changed';\n");
    const after = buildFixture(input);
    expect(after.closureRoot).not.toBe(before.closureRoot);
  });

  it("binds the complete adjacent pnpm runtime even when launcher bytes and version are unchanged", () => {
    const input = fixture();
    const before = buildFixture(input);
    const launcherBefore = readFileSync(input.pnpmExecutablePath);
    writeFileSync(
      resolve(dirname(input.pnpmExecutablePath), "dist/pnpm.mjs"),
      "export const runtime = 'pnpm-corrupt';\n"
    );
    const after = buildFixture(input);
    expect(readFileSync(input.pnpmExecutablePath)).toEqual(launcherBefore);
    expect(after.pnpm).toEqual(before.pnpm);
    expect(after.pnpmRuntime.root).not.toBe(before.pnpmRuntime.root);
    expect(after.closureRoot).not.toBe(before.closureRoot);
  });

  it("changes the root on Python resource or platform drift and rejects external resource links", () => {
    const runtimeInput = fixture();
    const runtimeBefore = buildFixture(runtimeInput);
    const pythonTree = runtimeInput.systemExecutables.find((entry) => entry.id === "python3")!
      .resourceTrees![0]!.path;
    writeFileSync(resolve(pythonTree, "lib/runtime.py"), "RUNTIME = 'changed'\n");
    expect(buildFixture(runtimeInput).closureRoot).not.toBe(runtimeBefore.closureRoot);

    const platformInput = fixture();
    const platformBefore = buildFixture(platformInput);
    writeFileSync(
      platformInput.systemVersionPath,
      "<plist><dict><key>ProductVersion</key><string>26.6.2</string>" +
        "<key>ProductBuildVersion</key><string>25G83</string></dict></plist>\n"
    );
    expect(buildFixture(platformInput).closureRoot).not.toBe(platformBefore.closureRoot);

    const linkInput = fixture();
    const linkTree = linkInput.systemExecutables.find((entry) => entry.id === "python3")!
      .resourceTrees![0]!.path;
    symlinkSync("/usr/bin/true", resolve(linkTree, "external-link"));
    expect(() => buildFixture(linkInput)).toThrow(/symlink escapes its resource tree/);
  });

  it("rejects dependency or executable swaps between measurement and use", () => {
    const dependencyInput = fixture();
    const dependencyBefore = buildFixture(dependencyInput);
    writeFileSync(
      resolve(dependencyInput.root, "node_modules/root/runtime.js"),
      "export const identity = 'changed-between-measurement-and-use';\n"
    );
    const dependencyAfter = buildFixture(dependencyInput);
    expect(() =>
      assertBuildToolchainEvidenceUnchanged(dependencyBefore, dependencyAfter)
    ).toThrow(/changed between measurement and use/);

    const executableInput = fixture();
    const executableBefore = buildFixture(executableInput);
    const gitExecutable = executableInput.systemExecutables.find((entry) => entry.id === "git")!;
    const invocationMarker = resolve(executableInput.root, "changed-git-was-invoked");
    writeFileSync(
      gitExecutable.path,
      `#!/bin/sh\n/usr/bin/touch '${invocationMarker}'\nprintf '%s\\n' 'git version 1.0.0'\n`,
      { mode: 0o755 }
    );
    chmodSync(gitExecutable.path, 0o755);
    expect(() =>
      buildFixture(executableInput, executableBefore.systemExecutables)
    ).toThrow(/bytes differ from the frozen evidence/);
    expect(existsSync(invocationMarker)).toBe(false);
  });

  it("fails closed on external package links, package-owned links, missing required dependencies, and patch mismatches", () => {
    const externalInput = fixture();
    const outside = mkdtempSync(join(tmpdir(), "os01-toolchain-outside-"));
    writeFileSync(resolve(outside, "package.json"), '{"name":"outside","version":"1.0.0"}\n');
    const externalLink = resolve(externalInput.root, "node_modules/external");
    symlinkSync(outside, externalLink);
    expect(() =>
      buildInstalledToolchainEvidence({
        ...externalInput,
        patches: [{ packageId: "root@1.0.0", path: "patches/root@1.0.0.patch" }],
        seedPackages: ["external"]
      })
    ).toThrow(/escapes the pinned virtual store/);

    const linkedInput = fixture();
    const ownedLink = resolve(linkedInput.root, "node_modules/root/linked.js");
    symlinkSync(resolve(linkedInput.root, "node_modules/root/runtime.js"), ownedLink);
    expect(() => buildFixture(linkedInput)).toThrow(/not a regular package-owned file/);

    const missingInput = fixture();
    const manifestPath = resolve(missingInput.root, "node_modules/root/package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.dependencies.missing = "1.0.0";
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    expect(() => buildFixture(missingInput)).toThrow(/missing required dependency missing/);

    const patchInput = fixture();
    writeFileSync(resolve(patchInput.root, "patches/root@1.0.0.patch"), "changed\n");
    expect(() => buildFixture(patchInput)).toThrow(/lockfile patch hash/);
  });

  it("fails closed when the pnpm executable does not match packageManager", () => {
    const input = fixture();
    writeExecutable(input.pnpmExecutablePath, "11.15.0");
    expect(() => buildFixture(input)).toThrow(/does not match package.json packageManager/);
  });

  it("pins the effective authority loader and passes the direct Node plus tsx process contract", () => {
    const attestation = JSON.parse(
      readFileSync("config/os01-census-attestation.v1.json", "utf8")
    ) as {
      buildIdentity: {
        qualificationBuild: {
          authorityLoader: ReturnType<typeof buildInstalledToolchainEvidence>["authorityLoader"];
          nodeExecutableSha256: string;
        };
      };
    };
    const qualification = attestation.buildIdentity.qualificationBuild;
    const evidencePath = resolve(mkdtempSync(join(tmpdir(), "os01-authority-loader-")), "evidence.json");
    writeFileSync(evidencePath, `${JSON.stringify({
      authorityLoader: qualification.authorityLoader,
      nodeExecutableSha256: qualification.nodeExecutableSha256
    })}\n`);
    const command = authorityLoaderCommand({
      root: process.cwd(),
      nodeExecutablePath: process.execPath,
      authorityLoader: qualification.authorityLoader,
      scriptPath: resolve("tests/fixtures/os01-authority-loader-process.ts"),
      args: [evidencePath]
    });
    expect(command[0]).toBe(process.execPath);
    expect(command[1]).toContain("/tsx@4.23.12/node_modules/tsx/dist/cli.mjs");
    const result = spawnSync(command[0]!, command.slice(1), {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { LANG: "C", LC_ALL: "C", NODE_ENV: "production", PATH: "/dev/null" }
    });
    expect(result).toMatchObject({ status: 0, signal: null, stderr: "", stdout: "authority-loader-ok\n" });
  });
});
