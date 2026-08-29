import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  statSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { release as osRelease, version as osVersion } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const OS01_BUILD_TOOLCHAIN_EVIDENCE_VERSION =
  "os01-build-toolchain-evidence.v4" as const;

export const OS01_SYSTEM_VERSION_PATH =
  "/System/Library/CoreServices/SystemVersion.plist" as const;

export const OS01_PYTHON_RUNTIME_ROOT =
  "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9" as const;

export const OS01_QUALIFICATION_SYSTEM_EXECUTABLES = [
  { id: "bsdtar", path: "/usr/bin/bsdtar", resourceTrees: [] },
  {
    id: "git",
    path: "/Library/Developer/CommandLineTools/usr/bin/git",
    resourceTrees: []
  },
  {
    id: "python3",
    path:
      "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3.9",
    resourceTrees: [{ id: "python3-framework", path: OS01_PYTHON_RUNTIME_ROOT }]
  }
] as const;

export const OS01_BUILD_SEED_PACKAGES = [
  "vinext",
  "vite",
  "@cloudflare/vite-plugin",
  "tsx"
] as const;

export const OS01_AUTHORITY_LOADER = {
  packageName: "tsx",
  files: ["dist/cli.mjs", "dist/loader.mjs", "dist/preflight.cjs", "package.json"]
} as const;

export const OS01_BUILD_PATCHES = [
  {
    packageId: "vinext@1.0.0-beta.2",
    path: "patches/vinext@1.0.0-beta.2.patch"
  }
] as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i;

type DependencyKind = "dependency" | "optional" | "peer";

export type BuildToolchainPatch = {
  packageId: string;
  path: string;
};

export type BuildToolchainEvidenceOptions = {
  root: string;
  nodeExecutablePath: string;
  pnpmExecutablePath: string;
  seedPackages?: readonly string[];
  mandatorySeedPackages?: readonly string[];
  patches?: readonly BuildToolchainPatch[];
  systemExecutables?: readonly BuildToolchainSystemExecutable[];
  expectedSystemExecutables?: readonly BuildToolchainSystemExecutableEvidence[];
  systemVersionPath?: string;
  expectedPlatformIdentity?: BuildToolchainPlatformIdentityEvidence;
  authorityLoader?: BuildToolchainAuthorityLoader;
};

export type BuildToolchainSystemExecutable = {
  id: string;
  path: string;
  resourceTrees?: readonly BuildToolchainResourceTree[];
};

export type BuildToolchainResourceTree = {
  id: string;
  path: string;
};

export type BuildToolchainResourceTreeEvidence = {
  bytes: number;
  fileCount: number;
  id: string;
  path: string;
  root: string;
  symlinkCount: number;
};

export type BuildToolchainPnpmRuntimeEvidence = BuildToolchainResourceTreeEvidence & {
  packageName: "@pnpm/exe";
  packageVersion: string;
};

export type BuildToolchainExecutableEvidence = {
  bytes: number;
  executable: true;
  sha256: string;
  version: string;
};

export type BuildToolchainSystemExecutableEvidence = BuildToolchainExecutableEvidence & {
  id: string;
  path: string;
  resourceTrees: BuildToolchainResourceTreeEvidence[];
};

export type BuildToolchainPlatformIdentityEvidence = {
  architecture: string;
  bytes: number;
  darwinRelease: string;
  darwinVersion: string;
  platform: NodeJS.Platform;
  productBuildVersion: string;
  productVersion: string;
  sha256: string;
  systemVersionPath: string;
};

export type BuildToolchainAuthorityLoader = {
  files: readonly string[];
  packageName: string;
};

export type BuildToolchainAuthorityLoaderEvidence = {
  fileCount: number;
  files: BuildToolchainFileEvidence[];
  packageName: string;
  root: string;
  version: string;
};

export type BuildToolchainFileEvidence = {
  bytes: number;
  executable: boolean;
  path: string;
  sha256: string;
};

export type BuildToolchainDependencyEdge = {
  alias: string;
  kind: DependencyKind;
  locator: string;
  packageName: string;
  version: string;
};

export type BuildToolchainMissingOptional = {
  alias: string;
  kind: "optional" | "peer";
  requested: string;
};

export type BuildToolchainPackageEvidence = {
  bytes: number;
  dependencies: BuildToolchainDependencyEdge[];
  fileCount: number;
  filesRoot: string;
  locator: string;
  missingOptional: BuildToolchainMissingOptional[];
  name: string;
  version: string;
};

export type BuildToolchainEvidence = {
  architecture: string;
  authorityLoader: BuildToolchainAuthorityLoaderEvidence;
  closureRoot: string;
  lockfile: BuildToolchainFileEvidence;
  node: BuildToolchainExecutableEvidence;
  packageCount: number;
  packages: BuildToolchainPackageEvidence[];
  packageManager: string;
  patches: Array<BuildToolchainFileEvidence & { packageId: string }>;
  platform: NodeJS.Platform;
  platformIdentity: BuildToolchainPlatformIdentityEvidence;
  pnpm: BuildToolchainExecutableEvidence;
  pnpmRuntime: BuildToolchainPnpmRuntimeEvidence;
  projectManifest: BuildToolchainFileEvidence;
  seedPackages: string[];
  systemExecutables: BuildToolchainSystemExecutableEvidence[];
  version: typeof OS01_BUILD_TOOLCHAIN_EVIDENCE_VERSION;
  workspace: BuildToolchainFileEvidence;
};

type JsonObject = Record<string, unknown>;

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  version?: string;
};

function projectSeedPackages(
  manifest: PackageManifest,
  mandatorySeedPackages: readonly string[]
): string[] {
  const declarations = new Map<string, string>();
  for (const [kind, entries] of [
    ["dependency", manifest.dependencies],
    ["devDependency", manifest.devDependencies],
    ["optionalDependency", manifest.optionalDependencies]
  ] as const) {
    for (const [name, requested] of Object.entries(entries ?? {}).sort()) {
      assertPackageName(name, `project ${kind}`);
      if (typeof requested !== "string" || requested.length === 0) {
        throw new Error(`project ${kind} ${name} has an invalid request`);
      }
      const prior = declarations.get(name);
      if (prior !== undefined && prior !== requested) {
        throw new Error(`project package ${name} has conflicting declarations`);
      }
      declarations.set(name, requested);
    }
  }
  if (declarations.size === 0) throw new Error("project package declarations are empty");
  const mandatory = [...mandatorySeedPackages].sort(compareText);
  if (new Set(mandatory).size !== mandatory.length) {
    throw new Error("mandatory build seed packages must be unique");
  }
  for (const name of mandatory) {
    assertPackageName(name, "mandatory build seed package");
    if (!declarations.has(name)) {
      throw new Error(`mandatory build seed package ${name} is not declared by package.json`);
    }
  }
  return [...declarations.keys()].sort(compareText);
}

type ResolvedPackage = {
  locator: string;
  manifest: PackageManifest;
  root: string;
};

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as JsonObject;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertPlainRecord(value: unknown, label: string): asserts value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`);
  }
}

function assertPackageName(value: string, label: string): void {
  if (!PACKAGE_NAME_PATTERN.test(value)) {
    throw new Error(`${label} is not a valid package name`);
  }
}

function assertSafeRelativePath(value: string, label: string): void {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a normalized relative POSIX path`);
  }
}

function isInside(parent: string, child: string): boolean {
  const delta = relative(parent, child);
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !delta.startsWith(sep));
}

function assertDirectory(path: string, label: string): string {
  const stats = lstatSync(path, { bigint: true });
  if (!stats.isDirectory()) {
    throw new Error(`${label} must be a real directory`);
  }
  const canonical = realpathSync(path);
  if (!statSync(canonical).isDirectory()) {
    throw new Error(`${label} canonical target is not a directory`);
  }
  return canonical;
}

function readRegularFile(path: string, label: string): {
  bytes: Buffer;
  executable: boolean;
} {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile()) {
    throw new Error(`${label} must be a regular file; links and special files are forbidden`);
  }
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      before.dev !== opened.dev ||
      before.ino !== opened.ino ||
      before.size !== opened.size ||
      before.mtimeNs !== opened.mtimeNs
    ) {
      throw new Error(`${label} changed while it was opened`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      opened.dev !== after.dev ||
      opened.ino !== after.ino ||
      opened.size !== after.size ||
      opened.mtimeNs !== after.mtimeNs ||
      BigInt(bytes.byteLength) !== after.size
    ) {
      throw new Error(`${label} changed while it was read`);
    }
    return {
      bytes,
      executable: (Number(after.mode) & 0o111) !== 0
    };
  } finally {
    closeSync(descriptor);
  }
}

function fileEvidence(path: string, logicalPath: string): BuildToolchainFileEvidence {
  const file = readRegularFile(path, logicalPath);
  return {
    bytes: file.bytes.byteLength,
    executable: file.executable,
    path: logicalPath,
    sha256: sha256(file.bytes)
  };
}

function resourceTreeEvidence(
  resource: BuildToolchainResourceTree
): BuildToolchainResourceTreeEvidence {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(resource.id)) {
    throw new Error("resource-tree id is invalid");
  }
  if (
    !resource.path.startsWith("/") ||
    resolve(resource.path) !== resource.path ||
    realpathSync(resource.path) !== resource.path
  ) {
    throw new Error(`${resource.id} resource-tree path must be absolute and canonical`);
  }
  const canonicalRoot = assertDirectory(resource.path, `${resource.id} resource tree`);
  const records: Array<
    | (BuildToolchainFileEvidence & { type: "file" })
    | { path: string; target: string; type: "symlink" }
  > = [];
  const visit = (directory: string, relativeDirectory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name);
      const logicalPath = relativeDirectory === "" ? name : `${relativeDirectory}/${name}`;
      const stats = lstatSync(path, { bigint: true });
      if (stats.isDirectory()) {
        visit(path, logicalPath);
        continue;
      }
      if (stats.isFile()) {
        records.push({ ...fileEvidence(path, logicalPath), type: "file" });
        continue;
      }
      if (stats.isSymbolicLink()) {
        const target = readlinkSync(path);
        const resolvedTarget = realpathSync(path);
        if (!isInside(canonicalRoot, resolvedTarget) || resolvedTarget === canonicalRoot) {
          throw new Error(`${resource.id}/${logicalPath} symlink escapes its resource tree`);
        }
        records.push({ path: logicalPath, target, type: "symlink" });
        continue;
      }
      throw new Error(`${resource.id}/${logicalPath} is not a regular file, directory, or internal symlink`);
    }
  };
  visit(canonicalRoot, "");
  const fileRecords = records.filter(
    (record): record is BuildToolchainFileEvidence & { type: "file" } => record.type === "file"
  );
  const symlinkCount = records.length - fileRecords.length;
  if (fileRecords.length === 0) throw new Error(`${resource.id} resource tree is empty`);
  return {
    bytes: fileRecords.reduce((sum, record) => sum + record.bytes, 0),
    fileCount: fileRecords.length,
    id: resource.id,
    path: canonicalRoot,
    root: sha256(stableJson(records)),
    symlinkCount
  };
}

function plistString(source: string, key: string): string {
  const escapedKey = escapeRegExp(key);
  const match = source.match(
    new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<string>([^<]+)</string>`, "u")
  );
  if (!match || match[1].length === 0 || match[1].length > 256) {
    throw new Error(`SystemVersion.plist omits ${key}`);
  }
  return match[1];
}

function platformIdentityEvidence(
  systemVersionPath: string
): BuildToolchainPlatformIdentityEvidence {
  if (
    !systemVersionPath.startsWith("/") ||
    resolve(systemVersionPath) !== systemVersionPath ||
    realpathSync(systemVersionPath) !== systemVersionPath
  ) {
    throw new Error("SystemVersion.plist path must be absolute and canonical");
  }
  const file = readRegularFile(systemVersionPath, "SystemVersion.plist");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
  const productVersion = plistString(source, "ProductVersion");
  const productBuildVersion = plistString(source, "ProductBuildVersion");
  if (!/^\d+\.\d+(?:\.\d+)?$/u.test(productVersion) || !/^[A-Z0-9]+$/u.test(productBuildVersion)) {
    throw new Error("SystemVersion.plist contains an invalid product identity");
  }
  return {
    architecture: process.arch,
    bytes: file.bytes.byteLength,
    darwinRelease: osRelease(),
    darwinVersion: osVersion(),
    platform: process.platform,
    productBuildVersion,
    productVersion,
    sha256: sha256(file.bytes),
    systemVersionPath
  };
}

function executableEvidence(path: string, label: string): BuildToolchainExecutableEvidence {
  const file = readRegularFile(path, label);
  if (!file.executable) {
    throw new Error(`${label} must have an executable mode bit`);
  }
  const invocation = spawnSync(path, ["--version"], {
    encoding: "utf8",
    env: {
      LANG: "C",
      LC_ALL: "C",
      NODE_ENV: "production",
      PATH: "/usr/bin:/bin"
    },
    maxBuffer: 64 * 1024,
    timeout: 10_000
  });
  if (invocation.error || invocation.status !== 0 || invocation.signal !== null) {
    throw new Error(`${label} failed its exact-path --version check`);
  }
  if (invocation.stderr !== "") {
    throw new Error(`${label} emitted unexpected stderr during --version`);
  }
  const version = invocation.stdout.trim();
  if (!/^(?:v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.test(version)) {
    throw new Error(`${label} returned an invalid version string`);
  }
  return {
    bytes: file.bytes.byteLength,
    executable: true,
    sha256: sha256(file.bytes),
    version
  };
}

function pnpmRuntimeEvidence(pnpmExecutablePath: string): BuildToolchainPnpmRuntimeEvidence {
  const packageRoot = realpathSync(dirname(pnpmExecutablePath));
  const manifest = parseManifest(resolve(packageRoot, "package.json"), "pnpm runtime package.json");
  if (
    manifest.name !== "@pnpm/exe" ||
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(manifest.version)
  ) {
    throw new Error("pnpm runtime package identity is invalid");
  }
  const executable = realpathSync(pnpmExecutablePath);
  if (!isInside(packageRoot, executable) || executable === packageRoot) {
    throw new Error("pnpm executable escapes its runtime package");
  }
  return {
    ...resourceTreeEvidence({ id: "pnpm-runtime", path: packageRoot }),
    packageName: "@pnpm/exe",
    packageVersion: manifest.version
  };
}

export function measureSystemExecutable(
  executable: BuildToolchainSystemExecutable,
  expected?: BuildToolchainSystemExecutableEvidence
): BuildToolchainSystemExecutableEvidence {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(executable.id)) {
    throw new Error("system executable id is invalid");
  }
  if (
    !executable.path.startsWith("/") ||
    resolve(executable.path) !== executable.path ||
    realpathSync(executable.path) !== executable.path
  ) {
    throw new Error(`${executable.id} system executable path must be absolute and canonical`);
  }
  const label = `${executable.id} system executable`;
  const file = readRegularFile(executable.path, label);
  if (!file.executable) {
    throw new Error(`${label} must have an executable mode bit`);
  }
  const resourceSpecs = [...(executable.resourceTrees ?? [])].sort((left, right) =>
    compareText(left.id, right.id)
  );
  if (
    new Set(resourceSpecs.map((entry) => entry.id)).size !== resourceSpecs.length ||
    new Set(resourceSpecs.map((entry) => entry.path)).size !== resourceSpecs.length
  ) {
    throw new Error(`${label} resource trees must have unique ids and paths`);
  }
  const resourceTrees = resourceSpecs.map(resourceTreeEvidence);
  const measuredFile = {
    bytes: file.bytes.byteLength,
    executable: true as const,
    id: executable.id,
    path: executable.path,
    resourceTrees,
    sha256: sha256(file.bytes)
  };
  if (
    expected !== undefined &&
    stableJson(measuredFile) !== stableJson({
      bytes: expected.bytes,
      executable: expected.executable,
      id: expected.id,
      path: expected.path,
      resourceTrees: expected.resourceTrees,
      sha256: expected.sha256
    })
  ) {
    throw new Error(`${label} bytes differ from the frozen evidence`);
  }
  const invocation = spawnSync(executable.path, ["--version"], {
    encoding: "utf8",
    env: {
      LANG: "C",
      LC_ALL: "C",
      NODE_ENV: "production",
      PATH: "/dev/null"
    },
    maxBuffer: 64 * 1024,
    timeout: 10_000
  });
  if (invocation.error || invocation.status !== 0 || invocation.signal !== null) {
    throw new Error(`${label} failed its exact-path --version check`);
  }
  if (invocation.stderr !== "") {
    throw new Error(`${label} emitted unexpected stderr during --version`);
  }
  const version = invocation.stdout.trim();
  if (version.length === 0 || version.length > 1024 || /[\0\r]/u.test(version)) {
    throw new Error(`${label} returned an invalid version string`);
  }
  const evidence = { ...measuredFile, version };
  if (expected !== undefined && stableJson(evidence) !== stableJson(expected)) {
    throw new Error(`${label} differs from the frozen evidence`);
  }
  return evidence;
}

export function assertBuildToolchainEvidenceUnchanged(
  before: BuildToolchainEvidence,
  after: BuildToolchainEvidence
): void {
  if (stableJson(before) !== stableJson(after)) {
    throw new Error("installed build-toolchain closure changed between measurement and use");
  }
}

function parseManifest(path: string, label: string): PackageManifest {
  const source = readRegularFile(path, label).bytes;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  assertPlainRecord(parsed, label);
  return parsed as PackageManifest;
}

function packagePath(nodeModulesRoot: string, packageName: string): string {
  assertPackageName(packageName, "package name");
  return resolve(nodeModulesRoot, ...packageName.split("/"));
}

function nearestNodeModulesRoot(packageRoot: string): string {
  let current = dirname(packageRoot);
  while (current !== dirname(current)) {
    if (basename(current) === "node_modules") return current;
    current = dirname(current);
  }
  throw new Error(`package root ${packageRoot} is not inside node_modules`);
}

function resolveInstalledPackage(input: {
  alias: string;
  candidate: string;
  virtualStoreRoot: string;
}): ResolvedPackage | null {
  let candidateStats;
  try {
    candidateStats = lstatSync(input.candidate, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!candidateStats.isSymbolicLink() && !candidateStats.isDirectory()) {
    throw new Error(`installed package ${input.alias} must be a directory link or directory`);
  }
  const root = realpathSync(input.candidate);
  if (!isInside(input.virtualStoreRoot, root) || root === input.virtualStoreRoot) {
    throw new Error(`installed package ${input.alias} escapes the pinned virtual store`);
  }
  const rootStats = lstatSync(root, { bigint: true });
  if (!rootStats.isDirectory()) {
    throw new Error(`installed package ${input.alias} target must be a real directory`);
  }
  const locator = relative(input.virtualStoreRoot, root).split(sep).join("/");
  assertSafeRelativePath(locator, `installed package ${input.alias} locator`);
  const manifest = parseManifest(resolve(root, "package.json"), `${locator}/package.json`);
  if (typeof manifest.name !== "string" || !PACKAGE_NAME_PATTERN.test(manifest.name)) {
    throw new Error(`installed package ${input.alias} has an invalid manifest name`);
  }
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error(`installed package ${input.alias} has an invalid manifest version`);
  }
  return { locator, manifest, root };
}

function packageOwnFiles(packageRoot: string, locator: string): BuildToolchainFileEvidence[] {
  const files: BuildToolchainFileEvidence[] = [];
  const visit = (directory: string, relativeDirectory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name);
      const logicalPath = relativeDirectory === "" ? name : `${relativeDirectory}/${name}`;
      const stats = lstatSync(path, { bigint: true });
      if (relativeDirectory === "" && name === "node_modules") {
        if (!stats.isDirectory()) {
          throw new Error(`${locator}/node_modules must be a real directory when present`);
        }
        continue;
      }
      if (stats.isDirectory()) {
        visit(path, logicalPath);
        continue;
      }
      if (!stats.isFile()) {
        throw new Error(`${locator}/${logicalPath} is not a regular package-owned file`);
      }
      files.push(fileEvidence(path, logicalPath));
    }
  };
  visit(packageRoot, "");
  if (files.length === 0) {
    throw new Error(`installed package ${locator} contains no package-owned files`);
  }
  return files.sort((left, right) => compareText(left.path, right.path));
}

function dependencyDeclarations(manifest: PackageManifest): Array<{
  alias: string;
  kind: DependencyKind;
  optional: boolean;
  requested: string;
}> {
  const declarations = new Map<string, {
    alias: string;
    kind: DependencyKind;
    optional: boolean;
    requested: string;
  }>();
  for (const [alias, requested] of Object.entries(manifest.dependencies ?? {}).sort()) {
    assertPackageName(alias, "dependency alias");
    if (typeof requested !== "string" || requested.length === 0) {
      throw new Error(`dependency ${alias} has an invalid request`);
    }
    declarations.set(alias, { alias, kind: "dependency", optional: false, requested });
  }
  for (const [alias, requested] of Object.entries(manifest.optionalDependencies ?? {}).sort()) {
    assertPackageName(alias, "optional dependency alias");
    if (typeof requested !== "string" || requested.length === 0) {
      throw new Error(`optional dependency ${alias} has an invalid request`);
    }
    declarations.set(alias, { alias, kind: "optional", optional: true, requested });
  }
  for (const [alias, requested] of Object.entries(manifest.peerDependencies ?? {}).sort()) {
    if (declarations.has(alias)) continue;
    assertPackageName(alias, "peer dependency alias");
    if (typeof requested !== "string" || requested.length === 0) {
      throw new Error(`peer dependency ${alias} has an invalid request`);
    }
    declarations.set(alias, {
      alias,
      kind: "peer",
      optional: manifest.peerDependenciesMeta?.[alias]?.optional === true,
      requested
    });
  }
  return [...declarations.values()].sort((left, right) => compareText(left.alias, right.alias));
}

function assertAliasMatchesPackage(alias: string, requested: string, actualName: string): void {
  if (alias === actualName) return;
  if (requested.startsWith("npm:")) return;
  throw new Error(`installed dependency ${alias} resolved to unexpected package ${actualName}`);
}

function matchesLine(source: string, pattern: RegExp, label: string): void {
  if (!pattern.test(source)) throw new Error(`${label} is missing`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildInstalledToolchainEvidence(
  options: BuildToolchainEvidenceOptions
): BuildToolchainEvidence {
  const canonicalRoot = assertDirectory(options.root, "repository root");
  const virtualStoreRoot = assertDirectory(
    resolve(canonicalRoot, "node_modules/.pnpm"),
    "pnpm virtual store"
  );
  if (!isInside(canonicalRoot, virtualStoreRoot) || virtualStoreRoot === canonicalRoot) {
    throw new Error("pnpm virtual store must be inside the repository root");
  }

  const patches = [...(options.patches ?? OS01_BUILD_PATCHES)].sort((left, right) =>
    compareText(left.packageId, right.packageId)
  );
  if (patches.length === 0 || new Set(patches.map((patch) => patch.packageId)).size !== patches.length) {
    throw new Error("build patch identities must be a non-empty unique set");
  }

  const projectManifestEvidence = fileEvidence(resolve(canonicalRoot, "package.json"), "package.json");
  const projectManifest = parseManifest(resolve(canonicalRoot, "package.json"), "package.json");
  const seedPackages = options.seedPackages === undefined
    ? projectSeedPackages(
      projectManifest,
      options.mandatorySeedPackages ?? OS01_BUILD_SEED_PACKAGES
    )
    : [...options.seedPackages].sort(compareText);
  if (seedPackages.length === 0 || new Set(seedPackages).size !== seedPackages.length) {
    throw new Error("build seed packages must be a non-empty unique set");
  }
  seedPackages.forEach((seed) => assertPackageName(seed, "build seed package"));
  const packageManager = (projectManifest as JsonObject).packageManager;
  if (typeof packageManager !== "string" || !/^pnpm@\d+\.\d+\.\d+$/.test(packageManager)) {
    throw new Error("package.json must pin an exact pnpm packageManager version");
  }
  const node = executableEvidence(options.nodeExecutablePath, "Node executable");
  if (!node.version.startsWith("v")) {
    throw new Error("Node executable must report a v-prefixed semantic version");
  }
  const pnpm = executableEvidence(options.pnpmExecutablePath, "pnpm executable");
  if (`pnpm@${pnpm.version}` !== packageManager) {
    throw new Error("pnpm executable version does not match package.json packageManager");
  }
  const pnpmRuntime = pnpmRuntimeEvidence(options.pnpmExecutablePath);
  const systemExecutableSpecs = [
    ...(options.systemExecutables ?? OS01_QUALIFICATION_SYSTEM_EXECUTABLES)
  ].sort((left, right) => compareText(left.id, right.id));
  if (
    systemExecutableSpecs.length === 0 ||
    new Set(systemExecutableSpecs.map((entry) => entry.id)).size !== systemExecutableSpecs.length ||
    new Set(systemExecutableSpecs.map((entry) => entry.path)).size !== systemExecutableSpecs.length
  ) {
    throw new Error("system executables must be a non-empty set with unique ids and paths");
  }
  const expectedSystemExecutables = options.expectedSystemExecutables === undefined
    ? undefined
    : [...options.expectedSystemExecutables].sort((left, right) => compareText(left.id, right.id));
  if (
    expectedSystemExecutables !== undefined &&
    stableJson(expectedSystemExecutables.map((entry) => ({
      id: entry.id,
      path: entry.path,
      resourceTrees: entry.resourceTrees.map((resource) => ({ id: resource.id, path: resource.path }))
    }))) !==
      stableJson(systemExecutableSpecs.map((entry) => ({
        id: entry.id,
        path: entry.path,
        resourceTrees: [...(entry.resourceTrees ?? [])]
          .sort((left, right) => compareText(left.id, right.id))
      })))
  ) {
    throw new Error("expected system executable identities differ from the measured set");
  }
  const systemExecutables = systemExecutableSpecs.map((entry, index) =>
    measureSystemExecutable(entry, expectedSystemExecutables?.[index]));
  const platformIdentity = platformIdentityEvidence(
    options.systemVersionPath ?? OS01_SYSTEM_VERSION_PATH
  );
  if (
    options.expectedPlatformIdentity !== undefined &&
    stableJson(platformIdentity) !== stableJson(options.expectedPlatformIdentity)
  ) {
    throw new Error("platform identity differs from the frozen evidence");
  }

  const lockfile = fileEvidence(resolve(canonicalRoot, "pnpm-lock.yaml"), "pnpm-lock.yaml");
  const workspace = fileEvidence(resolve(canonicalRoot, "pnpm-workspace.yaml"), "pnpm-workspace.yaml");
  const lockSource = new TextDecoder("utf-8", { fatal: true }).decode(
    readRegularFile(resolve(canonicalRoot, lockfile.path), lockfile.path).bytes
  );
  const workspaceSource = new TextDecoder("utf-8", { fatal: true }).decode(
    readRegularFile(resolve(canonicalRoot, workspace.path), workspace.path).bytes
  );
  const patchEvidence = patches.map((patch) => {
    assertSafeRelativePath(patch.path, `patch path for ${patch.packageId}`);
    if (!/^[A-Za-z0-9@._/+~-]+$/.test(patch.packageId)) {
      throw new Error("patch package identity is invalid");
    }
    const evidence = fileEvidence(resolve(canonicalRoot, patch.path), patch.path);
    matchesLine(
      workspaceSource,
      new RegExp(`^\\s*${escapeRegExp(patch.packageId)}:\\s*${escapeRegExp(patch.path)}\\s*$`, "m"),
      `workspace patch mapping for ${patch.packageId}`
    );
    matchesLine(
      lockSource,
      new RegExp(`^\\s*${escapeRegExp(patch.packageId)}:\\s*${evidence.sha256}\\s*$`, "m"),
      `lockfile patch hash for ${patch.packageId}`
    );
    return { ...evidence, packageId: patch.packageId };
  });

  const rootNodeModules = assertDirectory(resolve(canonicalRoot, "node_modules"), "root node_modules");
  const packageQueue: ResolvedPackage[] = [];
  const resolvedByLocator = new Map<string, ResolvedPackage>();
  for (const seed of seedPackages) {
    const resolvedSeed = resolveInstalledPackage({
      alias: seed,
      candidate: packagePath(rootNodeModules, seed),
      virtualStoreRoot
    });
    if (!resolvedSeed) throw new Error(`build seed package ${seed} is not installed`);
    assertAliasMatchesPackage(seed, "", resolvedSeed.manifest.name!);
    if (!resolvedByLocator.has(resolvedSeed.locator)) {
      resolvedByLocator.set(resolvedSeed.locator, resolvedSeed);
      packageQueue.push(resolvedSeed);
    }
  }

  const packageEvidence = new Map<string, BuildToolchainPackageEvidence>();
  while (packageQueue.length > 0) {
    const current = packageQueue.shift()!;
    if (packageEvidence.has(current.locator)) continue;
    const ownFiles = packageOwnFiles(current.root, current.locator);
    const dependencies: BuildToolchainDependencyEdge[] = [];
    const missingOptional: BuildToolchainMissingOptional[] = [];
    const dependencyRoot = nearestNodeModulesRoot(current.root);
    for (const declaration of dependencyDeclarations(current.manifest)) {
      const dependency = resolveInstalledPackage({
        alias: declaration.alias,
        candidate: packagePath(dependencyRoot, declaration.alias),
        virtualStoreRoot
      });
      if (!dependency) {
        if (!declaration.optional) {
          throw new Error(
            `${current.locator} is missing required ${declaration.kind} ${declaration.alias}`
          );
        }
        missingOptional.push({
          alias: declaration.alias,
          kind: declaration.kind === "peer" ? "peer" : "optional",
          requested: declaration.requested
        });
        continue;
      }
      assertAliasMatchesPackage(declaration.alias, declaration.requested, dependency.manifest.name!);
      dependencies.push({
        alias: declaration.alias,
        kind: declaration.kind,
        locator: dependency.locator,
        packageName: dependency.manifest.name!,
        version: dependency.manifest.version!
      });
      if (!resolvedByLocator.has(dependency.locator)) {
        resolvedByLocator.set(dependency.locator, dependency);
        packageQueue.push(dependency);
      }
    }
    const fileRootInput = ownFiles.map((file) => ({
      bytes: file.bytes,
      executable: file.executable,
      path: file.path,
      sha256: file.sha256
    }));
    packageEvidence.set(current.locator, {
      bytes: ownFiles.reduce((sum, file) => sum + file.bytes, 0),
      dependencies: dependencies.sort((left, right) =>
        compareText(`${left.alias}\u0000${left.locator}`, `${right.alias}\u0000${right.locator}`)
      ),
      fileCount: ownFiles.length,
      filesRoot: sha256(stableJson(fileRootInput)),
      locator: current.locator,
      missingOptional: missingOptional.sort((left, right) => compareText(left.alias, right.alias)),
      name: current.manifest.name!,
      version: current.manifest.version!
    });
  }

  const packages = [...packageEvidence.values()].sort((left, right) =>
    compareText(left.locator, right.locator)
  );
  for (const pkg of packages) {
    for (const edge of pkg.dependencies) {
      if (!packageEvidence.has(edge.locator)) {
        throw new Error(`${pkg.locator} has an unclosed dependency edge to ${edge.locator}`);
      }
    }
    if (!SHA256_PATTERN.test(pkg.filesRoot)) {
      throw new Error(`${pkg.locator} has an invalid file root`);
    }
  }

  const authorityLoaderSpec = options.authorityLoader ?? OS01_AUTHORITY_LOADER;
  assertPackageName(authorityLoaderSpec.packageName, "authority-loader package");
  if (!seedPackages.includes(authorityLoaderSpec.packageName)) {
    throw new Error("authority-loader package must be an explicit build seed");
  }
  if (
    authorityLoaderSpec.files.length === 0 ||
    new Set(authorityLoaderSpec.files).size !== authorityLoaderSpec.files.length
  ) {
    throw new Error("authority-loader files must be a non-empty unique set");
  }
  const authorityPackage = resolveInstalledPackage({
    alias: authorityLoaderSpec.packageName,
    candidate: packagePath(rootNodeModules, authorityLoaderSpec.packageName),
    virtualStoreRoot
  });
  if (!authorityPackage) throw new Error("authority-loader package is not installed");
  if (!packageEvidence.has(authorityPackage.locator)) {
    throw new Error("authority-loader package is outside the closed dependency graph");
  }
  const authorityFiles = [...authorityLoaderSpec.files].sort(compareText).map((logicalPath) => {
    assertSafeRelativePath(logicalPath, "authority-loader file");
    const path = resolve(authorityPackage.root, logicalPath);
    if (!isInside(authorityPackage.root, path) || path === authorityPackage.root) {
      throw new Error("authority-loader file escapes its package");
    }
    return fileEvidence(path, logicalPath);
  });
  const authorityLoader: BuildToolchainAuthorityLoaderEvidence = {
    fileCount: authorityFiles.length,
    files: authorityFiles,
    packageName: authorityPackage.manifest.name!,
    root: sha256(stableJson(authorityFiles)),
    version: authorityPackage.manifest.version!
  };

  const rootMaterial = {
    architecture: process.arch,
    authorityLoader,
    lockfile,
    node,
    packageManager,
    packages,
    patches: patchEvidence,
    platform: process.platform,
    platformIdentity,
    pnpm,
    pnpmRuntime,
    projectManifest: projectManifestEvidence,
    seedPackages,
    systemExecutables,
    version: OS01_BUILD_TOOLCHAIN_EVIDENCE_VERSION,
    workspace
  };
  const closureRoot = sha256(stableJson(rootMaterial));
  return {
    ...rootMaterial,
    closureRoot,
    packageCount: packages.length
  };
}

function verifyAuthorityLoaderFiles(
  root: string,
  expected: BuildToolchainAuthorityLoaderEvidence
): { cli: string; loader: string; preflight: string } {
  const packageRoot = realpathSync(
    resolve(root, "node_modules", ...expected.packageName.split("/"))
  );
  const measuredFiles = expected.files.map((file) => {
    const path = resolve(packageRoot, file.path);
    if (!isInside(packageRoot, path) || path === packageRoot) {
      throw new Error("authority-loader file escapes its package");
    }
    return fileEvidence(path, file.path);
  });
  if (
    measuredFiles.length !== expected.fileCount ||
    sha256(stableJson(measuredFiles)) !== expected.root ||
    stableJson(measuredFiles) !== stableJson(expected.files)
  ) {
    throw new Error("authority-loader files differ from the frozen evidence");
  }
  const required = (path: string): string => {
    if (!expected.files.some((file) => file.path === path)) {
      throw new Error(`authority-loader evidence omits ${path}`);
    }
    return resolve(packageRoot, path);
  };
  return {
    cli: required("dist/cli.mjs"),
    loader: required("dist/loader.mjs"),
    preflight: required("dist/preflight.cjs")
  };
}

export function authorityLoaderCommand(input: {
  root: string;
  nodeExecutablePath: string;
  authorityLoader: BuildToolchainAuthorityLoaderEvidence;
  scriptPath: string;
  args?: readonly string[];
}): string[] {
  const node = readRegularFile(input.nodeExecutablePath, "authority Node executable");
  if (!node.executable) throw new Error("authority Node executable is not executable");
  const paths = verifyAuthorityLoaderFiles(input.root, input.authorityLoader);
  return [input.nodeExecutablePath, paths.cli, input.scriptPath, ...(input.args ?? [])];
}

export function assertFrozenAuthorityLoaderProcess(input: {
  root: string;
  nodeExecutableSha256: string;
  authorityLoader: BuildToolchainAuthorityLoaderEvidence;
}): void {
  const node = readRegularFile(process.execPath, "running authority Node executable");
  if (!node.executable || sha256(node.bytes) !== input.nodeExecutableSha256) {
    throw new Error("running authority Node executable differs from the frozen evidence");
  }
  const paths = verifyAuthorityLoaderFiles(input.root, input.authorityLoader);
  const expectedExecArgv = [
    "--require",
    paths.preflight,
    "--import",
    pathToFileURL(paths.loader).href
  ];
  if (stableJson(process.execArgv) !== stableJson(expectedExecArgv)) {
    throw new Error("running authority TypeScript loader differs from the frozen direct-loader contract");
  }
}

function cliArgument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length || process.argv[index + 1].startsWith("--")) {
    throw new Error(`${name} is required`);
  }
  return process.argv[index + 1];
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const evidence = buildInstalledToolchainEvidence({
    nodeExecutablePath: cliArgument("--node-executable"),
    pnpmExecutablePath: cliArgument("--pnpm-executable"),
    root: cliArgument("--root")
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
