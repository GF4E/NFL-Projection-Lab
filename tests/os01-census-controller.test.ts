import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { handleOs01CensusRequest, os01CensusContract } from "../worker/os01-census-operator";
import {
  classifySchema,
  computeSourceAnchor,
  configuredTrustedTarget,
  expectedAnchorSource,
  localArchiveEvidence,
  migrationStages,
  resolveQualificationPaths,
  validateArchivePackageBinding,
  validateAuthorityBridgeCodeRelation,
  validateBridgeImplementation,
  validateDeploymentProofFreshness,
  validateExactSourceAnchor,
  validateGitSuccessor,
  validateHostedSourceIdentity,
  validateSitesDeploymentIdentity,
  verifyCensusEntryClosure
} from "../scripts/run_os01_production_census";
import type { SchemaObject } from "../scripts/verify_d1_schema_authority";

type SqlValue = string | number | bigint | Uint8Array | null;
const temporaryDirectories: string[] = [];
const implementationCommit = "3".repeat(40);
const deploymentCommit = "4".repeat(40);
const deploymentVersion = "test-version";

const testSourceAnchor = "7".repeat(64);
const testSourceTreeAnchor = "6".repeat(64);
const testBuildInputRoot = "8".repeat(64);
const testArchiveHash = "9".repeat(64);
const testImplementationBuild = {
  builtWorkerHash: "1".repeat(64),
  distRoot: "2".repeat(64),
  archiveFileListRoot: "3".repeat(64),
  fileCount: 1,
  activeBuildGraphHash: "4".repeat(64),
  activeSourceFilesScanned: 1,
  activeBuildFilesScanned: 1,
  compiledAnchorCarrierRoot: "5".repeat(64),
  entryStaticClosureRoot: "6".repeat(64),
  entryStaticFileCount: 1,
  qualificationBuild: {
    version: "os01-vinext-qualification-build.2026.1",
    role: "implementation" as const,
    contextHash: "7".repeat(64),
    toolchainRoot: "8".repeat(64),
    nodeVersion: "v24.13.0",
    vinextVersion: "1.0.0-beta.2",
    patchSha256: "c4024d3c75af62888e0842ac583fb9bd6e4088ecf9e84eda45e2c0ed8b409958",
    targetProjectId: "test-project",
    targetAccessMode: "owner_only"
  }
};
const testAuthorityBridgeCodeRelation = {
  version: "os01-census-authority-bridge-code-relation.2026.2",
  authorityCommit: "2".repeat(40),
  implementationCommit,
  files: [
    { path: "patches/vinext@1.0.0-beta.2.patch", bytes: 1, sha256: "7".repeat(64) },
    { path: "pnpm-workspace.yaml", bytes: 1, sha256: "9".repeat(64) },
    { path: "worker/env-boundary.ts", bytes: 1, sha256: "a".repeat(64) },
    { path: "worker/os01-census-operator.ts", bytes: 1, sha256: "b".repeat(64) },
    { path: "worker/os01-census-source-anchor.ts", bytes: 1, sha256: "c".repeat(64) }
  ],
  relationRoot: "d".repeat(64)
};
const testSourceIdentity = {
  authorityEvidence: {
    authorityCommit: "2".repeat(40),
    authorityTreeObjectId: "3".repeat(40),
    authorityArchiveSha256: "4".repeat(64),
    authorityArchiveBytes: 1,
    authorityTreeRoot: "5".repeat(64)
  },
  authorityBridgeCodeRelation: testAuthorityBridgeCodeRelation,
  fullTreeIdentityVersion: "os01-census-full-tree.2026.1",
  liveBaseCommit: "e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd",
  liveBaseTreeObjectId: "2".repeat(40),
  liveBaseToImplementationNameStatus: [
    { status: "M", path: "next.config.ts" },
    { status: "A", path: "patches/vinext@1.0.0-beta.2.patch" },
    { status: "M", path: "pnpm-lock.yaml" },
    { status: "M", path: "pnpm-workspace.yaml" },
    { status: "M", path: "tests/acceptance.test.ts" },
    { status: "M", path: "tests/nflverse-importer.test.ts" },
    { status: "M", path: "tests/official-injuries.test.ts" },
    { status: "A", path: "tests/os01-census-bridge.test.ts" },
    { status: "M", path: "tests/public-runtime-boundary.test.ts" },
    { status: "M", path: "worker/env-boundary.ts" },
    { status: "M", path: "worker/index.ts" },
    { status: "A", path: "worker/os01-census-operator.ts" },
    { status: "A", path: "worker/os01-census-source-anchor.ts" },
    { status: "A", path: "worker/site-runtime.ts" }
  ],
  implementationCommit,
  deploymentCommit,
  implementationTreeObjectId: "5".repeat(40),
  deploymentTreeObjectId: "6".repeat(40),
  implementationArchiveSha256: "a".repeat(64),
  implementationArchiveBytes: 1,
  deploymentArchiveSha256: "b".repeat(64),
  deploymentArchiveBytes: 1,
  implementationToDeploymentNameStatus: [
    { status: "M", path: "worker/os01-census-source-anchor.ts" }
  ],
  successorCommitCount: 1,
  sourceTreeAnchor: testSourceTreeAnchor,
  implementationBuild: testImplementationBuild,
  sourceAnchor: testSourceAnchor,
  buildInputRoot: testBuildInputRoot
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function tableCoreHash(semantics: unknown): string | null {
  if (!semantics || typeof semantics !== "object" || Array.isArray(semantics)) return null;
  const core = { ...semantics as Record<string, unknown> };
  delete core.indexes;
  return sha256(JSON.stringify(stable(core)));
}

function evidenceFromObject(object: SchemaObject) {
  return {
    key: `${object.type}:${object.name}`,
    type: object.type,
    name: object.name,
    tableName: object.tableName,
    semanticHash: object.semanticHash,
    tableCoreHash: object.type === "table" ? tableCoreHash(object.semantics) : null
  };
}

function schemaFixture() {
  const stages = migrationStages();
  const evidence = stages.through0016.objects.map(evidenceFromObject);
  const catalog = [...evidence.map((object) => ({
    type: object.type,
    name: object.name,
    tableName: object.tableName,
    internal: false,
    sqlIsNull: false,
    sqlHash: sha256(`schema:${object.key}`)
  })), ...stages.autoindexes.through0016.map((entry) => ({
    type: "index" as const,
    name: entry.name,
    tableName: entry.tableName,
    internal: true,
    sqlIsNull: entry.sqlIsNull,
    sqlHash: entry.sqlHash
  }))];
  return { stages, evidence, catalog };
}

function recomputePayloadHash(value: Record<string, unknown>): Record<string, unknown> {
  const protectedFields = { ...value };
  delete protectedFields.continuation;
  delete protectedFields.payloadHash;
  delete protectedFields.payloadMac;
  return { ...value, payloadHash: sha256(JSON.stringify(stable(protectedFields))) };
}

function deploymentProof(origin: string): Record<string, unknown> {
  return {
    version: "os01-census-deployment-proof.2026.1",
    status: "ready_for_census",
    projectId: "test-project",
    implementationCommit,
    deploymentCommit,
    sourceAnchor: testSourceAnchor,
    sourceIdentity: testSourceIdentity,
    implementationToDeploymentDiff: ["worker/os01-census-source-anchor.ts"],
    build: {
      activeBuildGraphHash: "a".repeat(64),
      activeSourceFilesScanned: 1,
      activeBuildFilesScanned: 1,
      buildInputRoot: testBuildInputRoot,
      builtWorkerHash: "c".repeat(64),
      compiledAnchorCarrierRoot: "b".repeat(64),
      entryStaticClosureRoot: "4".repeat(64),
      entryStaticFileCount: 1,
      distRoot: "d".repeat(64),
      distFileListRoot: "e".repeat(64),
      distFileCount: 1,
      localArchiveFormat: "tar.gz",
      localArchiveSha256: "f".repeat(64),
      localArchiveBytes: 1,
      localArchiveFileListRoot: "0".repeat(64),
      localArchiveContentRoot: "1".repeat(64),
      localArchiveFileCount: 1,
      packageContentRoot: "2".repeat(64),
      packageFileListRoot: "3".repeat(64),
      packageFileCount: 1,
      qualificationBuild: {
        ...testImplementationBuild.qualificationBuild,
        role: "deployment"
      },
      sitesArchiveContentHash: `sha256:${testArchiveHash}`
    },
    sitesVersion: {
      versionId: deploymentVersion,
      versionNumber: 1,
      sourceCommit: deploymentCommit,
      archiveContentHash: `sha256:${testArchiveHash}`,
      archiveFormat: "tar",
      archiveFileCount: 1,
      archiveSizeBytes: 1
    },
    deployment: {
      deploymentId: "test-deployment",
      status: "succeeded",
      versionId: deploymentVersion,
      environmentRevision: 1,
      accessPolicyRevision: 1,
      origin
    },
    observedAt: new Date().toISOString()
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  for (const entry of journal.entries) {
    database.exec(readFileSync(`drizzle/${entry.tag}.sql`, "utf8"));
    if (entry.tag === "0016_engine_os_interim_scheduler") break;
  }
  database.prepare(`INSERT INTO odds_quota_state
    (provider, used, remaining, last_cost, updated_at)
    VALUES ('the-odds-api', 38, 462, 0, '2026-08-01T00:00:00.000Z')`).run();
  return database;
}

function d1(database: DatabaseSync): D1Database {
  let bookmark = 0;
  return {
    prepare() { throw new Error("database.prepare must not be called"); },
    async batch() { throw new Error("database.batch must not be called"); },
    async exec() { throw new Error("database.exec must not be called"); },
    withSession() {
      let current: string | null = null;
      return {
        prepare(sql: string) {
          let values: SqlValue[] = [];
          return {
            bind(...input: unknown[]) {
              values = input as SqlValue[];
              return this;
            },
            async all<T>() {
              const rows = database.prepare(sql).all(...values) as T[];
              current = `bookmark-${++bookmark}`;
              return {
                success: true as const,
                results: rows,
                meta: {
                  duration: 0,
                  size_after: 0,
                  rows_read: rows.length,
                  rows_written: 0,
                  last_row_id: 0,
                  changed_db: false,
                  changes: 0
                }
              };
            }
          } as unknown as D1PreparedStatement;
        },
        async batch() { throw new Error("session.batch must not be called"); },
        getBookmark() { return current; }
      } as D1DatabaseSession;
    },
    async dump() { throw new Error("database.dump must not be called"); }
  } as unknown as D1Database;
}

function runController(input: {
  endpoint: string;
  token: string;
  output: string;
  buildAttestation?: string;
  expectedOrigin?: string;
}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const expectedOrigin = input.expectedOrigin ?? new URL(input.endpoint).origin;
    const qualificationDirectory = resolve(input.output, "..");
    const deploymentProofPath = join(qualificationDirectory, "deployment-proof.json");
    writeFileSync(deploymentProofPath, `${JSON.stringify(deploymentProof(expectedOrigin))}\n`, "utf8");
    writeFileSync(join(qualificationDirectory, "deployment.tar.gz"), "loopback-fixture", "utf8");
    const executable = resolve("node_modules/.bin/tsx");
    const child = spawn(executable, [
      "scripts/run_os01_production_census.ts",
      "--allow-loopback-http",
      "--test-loopback-origin", expectedOrigin,
      "--expected-build-attestation", input.buildAttestation ?? testSourceAnchor,
      "--qualification-dir", qualificationDirectory,
      "--authority-commit", "2".repeat(40),
      "--implementation-commit", implementationCommit,
      "--source-commit", deploymentCommit,
      "--deployment-version", deploymentVersion
    ], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify({ endpoint: input.endpoint, censusToken: input.token }));
  });
}

async function operatorServer(input: {
  database: DatabaseSync;
  token: string;
  mutate?: (value: Record<string, unknown>) => Record<string, unknown>;
}): Promise<{ endpoint: string; requestCount: () => number; close: () => Promise<void> }> {
  const binding = d1(input.database);
  const digestBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.token));
  const digest = [...new Uint8Array(digestBuffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
  let requests = 0;
  const server: Server = createServer(async (incoming, outgoing) => {
    requests += 1;
    const chunks: Uint8Array[] = [];
    for await (const chunk of incoming) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);
    const request = new Request(`http://127.0.0.1${incoming.url ?? os01CensusContract.route}`, {
      method: incoming.method,
      headers: incoming.headers as Record<string, string>,
      body: body.length ? body : undefined
    });
    const response = await handleOs01CensusRequest(
      request,
      {
        authSha256: digest,
        buildAttestation: testSourceAnchor,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      },
      () => binding,
      { sourceAnchor: testSourceAnchor, ready: true }
    );
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    const original = Buffer.from(await response.arrayBuffer());
    if (input.mutate && response.ok) {
      const value = input.mutate(JSON.parse(original.toString("utf8")) as Record<string, unknown>);
      outgoing.end(JSON.stringify(value));
    } else {
      outgoing.end(original);
    }
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}${os01CensusContract.route}`,
    requestCount: () => requests,
    close: () => new Promise<void>((resolveClose, reject) =>
      server.close((error) => error ? reject(error) : resolveClose())
    )
  };
}

function temporaryOutput(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), "os01-census-controller-"));
  temporaryDirectories.push(directory);
  const qualificationDirectory = join(directory, name);
  mkdirSync(qualificationDirectory);
  return join(qualificationDirectory, "census-receipt.json");
}

function git(directory: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function successorRepository(input: { mutateNonAnchor?: boolean } = {}): {
  directory: string;
  liveBase: string;
  implementation: string;
  deployment: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "os01-census-git-"));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, "worker"), { recursive: true });
  writeFileSync(join(directory, "worker/env-boundary.ts"), "export const boundary = 1;\n", "utf8");
  writeFileSync(join(directory, "worker/index.ts"), "export const runtime = 1;\n", "utf8");
  writeFileSync(join(directory, "worker/os01-census-operator.ts"), "export const operator = 1;\n", "utf8");
  writeFileSync(join(directory, "worker/other.ts"), "export const value = 1;\n", "utf8");
  git(directory, ["init", "--quiet"]);
  git(directory, ["add", "--", "worker"]);
  git(directory, [
    "-c", "user.name=OS01 Test", "-c", "user.email=os01-test@example.invalid",
    "commit", "--quiet", "-m", "live base"
  ]);
  const liveBase = git(directory, ["rev-parse", "HEAD"]);
  writeFileSync(join(directory, "worker/site-runtime.ts"), "export const runtime = 1;\n", "utf8");
  writeFileSync(
    join(directory, "worker/os01-census-source-anchor.ts"),
    `// Qualification builds replace only this literal after the implementation
// commit is frozen. The production census route refuses to serve unless its
// control-plane binding matches this compiled value exactly.
export const OS01_CENSUS_SOURCE_ANCHOR =
  "${"0".repeat(64)}";
export const OS01_CENSUS_SOURCE_ANCHOR_READY = false;
`,
    "utf8"
  );
  git(directory, ["add", "--", "worker/os01-census-source-anchor.ts", "worker/site-runtime.ts"]);
  git(directory, [
    "-c", "user.name=OS01 Test", "-c", "user.email=os01-test@example.invalid",
    "commit", "--quiet", "-m", "implementation"
  ]);
  const implementation = git(directory, ["rev-parse", "HEAD"]);
  writeFileSync(
    join(directory, "worker/os01-census-source-anchor.ts"),
    `// Qualification builds replace only this literal after the implementation
// commit is frozen. The production census route refuses to serve unless its
// control-plane binding matches this compiled value exactly.
export const OS01_CENSUS_SOURCE_ANCHOR =
  "${"a".repeat(64)}";
export const OS01_CENSUS_SOURCE_ANCHOR_READY = true;
`,
    "utf8"
  );
  if (input.mutateNonAnchor) {
    writeFileSync(join(directory, "worker/other.ts"), "export const value = 2;\n", "utf8");
  }
  git(directory, ["add", "--", "worker/os01-census-source-anchor.ts", "worker/other.ts"]);
  git(directory, [
    "-c", "user.name=OS01 Test", "-c", "user.email=os01-test@example.invalid",
    "commit", "--quiet", "-m", "deployment"
  ]);
  return { directory, liveBase, implementation, deployment: git(directory, ["rev-parse", "HEAD"]) };
}

function authorityRepositoryFor(
  bridge: ReturnType<typeof successorRepository>,
  mutatePath?: string
): { directory: string; commit: string } {
  const directory = mkdtempSync(join(tmpdir(), "os01-census-authority-"));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, "worker"), { recursive: true });
  for (const path of [
    "worker/env-boundary.ts",
    "worker/os01-census-operator.ts",
    "worker/os01-census-source-anchor.ts"
  ]) {
    const bytes = execFileSync("git", ["show", `${bridge.implementation}:${path}`], {
      cwd: bridge.directory,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"]
    });
    writeFileSync(join(directory, path), bytes);
  }
  if (mutatePath) writeFileSync(join(directory, mutatePath), "export const altered = true;\n", "utf8");
  git(directory, ["init", "--quiet"]);
  git(directory, ["add", "--", "worker"]);
  git(directory, [
    "-c", "user.name=OS01 Test", "-c", "user.email=os01-test@example.invalid",
    "commit", "--quiet", "-m", "authority"
  ]);
  return { directory, commit: git(directory, ["rev-parse", "HEAD"]) };
}

function entryClosureRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), "os01-entry-closure-"));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, "dist/server/.vite"), { recursive: true });
  writeFileSync(join(directory, "dist/server/index.js"), "entry", "utf8");
  writeFileSync(join(directory, "dist/server/env.js"), "boundary", "utf8");
  writeFileSync(join(directory, "dist/server/site.js"), "site", "utf8");
  writeFileSync(join(directory, "dist/server/.vite/manifest.json"), JSON.stringify({
    "virtual:cloudflare/worker-entry": {
      file: "index.js",
      name: "index",
      src: "virtual:cloudflare/worker-entry",
      isEntry: true,
      imports: ["_env.js"],
      dynamicImports: ["worker/site-runtime.ts"]
    },
    "_env.js": { file: "env.js", name: "env-boundary", imports: [] },
    "worker/site-runtime.ts": {
      file: "site.js",
      name: "site-runtime",
      src: "worker/site-runtime.ts",
      isDynamicEntry: true
    }
  }), "utf8");
  return directory;
}

function testBridgeFoundation(repository: ReturnType<typeof successorRepository>) {
  return {
    version: "test-bridge-foundation",
    liveBaseCommit: repository.liveBase,
    implementationCommitCount: 1,
    requiredLiveBaseToImplementationNameStatus: [
      { status: "A", path: "worker/os01-census-source-anchor.ts" },
      { status: "A", path: "worker/site-runtime.ts" }
    ],
    retainedRuntimeSourcePath: "worker/index.ts",
    retainedRuntimeBridgePath: "worker/site-runtime.ts"
  };
}

describe("OS-01 production census controller", () => {
  it("requires the exact source-anchor file and rejects executable text smuggled beside the literal", () => {
    const anchor = "a".repeat(64);
    const exact = expectedAnchorSource(anchor, true);
    expect(() => validateExactSourceAnchor(exact, anchor, true, "test anchor")).not.toThrow();
    expect(() => validateExactSourceAnchor(
      `${exact}export const hidden = fetch(\"https://example.invalid\");\n`,
      anchor,
      true,
      "test anchor"
    )).toThrow("test anchor file is not the frozen exact template");
    expect(() => validateExactSourceAnchor(
      exact.replace("READY = true", "READY = false"),
      anchor,
      true,
      "test anchor"
    )).toThrow("test anchor file is not the frozen exact template");
  });

  it("pins the server entry static closure and excludes provider markers and the dynamic site runtime", () => {
    const directory = entryClosureRepository();
    expect(verifyCensusEntryClosure(directory)).toMatchObject({ fileCount: 2 });

    writeFileSync(join(directory, "dist/server/env.js"), "ODDS_API_KEY", "utf8");
    expect(() => verifyCensusEntryClosure(directory)).toThrow(/forbidden marker: ODDS_API_KEY/u);
    writeFileSync(join(directory, "dist/server/env.js"), "boundary", "utf8");

    const manifestPath = join(directory, "dist/server/.vite/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, Record<string, unknown>>;
    manifest["_env.js"]!.imports = ["worker/site-runtime.ts"];
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
    expect(() => verifyCensusEntryClosure(directory)).toThrow("normal site runtime entered the static census closure");

    manifest["_env.js"]!.imports = [];
    manifest["virtual:cloudflare/worker-entry"]!.dynamicImports = [];
    writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
    expect(() => verifyCensusEntryClosure(directory)).toThrow("server entry dynamic runtime boundary mismatch");
  });

  it("binds every regular archive member to a canonical byte manifest", () => {
    const directory = mkdtempSync(join(tmpdir(), "os01-archive-good-"));
    temporaryDirectories.push(directory);
    const packageRoot = join(directory, "package");
    mkdirSync(join(packageRoot, "dist/server"), { recursive: true });
    mkdirSync(join(packageRoot, "dist/.openai/drizzle/meta"), { recursive: true });
    writeFileSync(join(packageRoot, "dist/server/index.js"), "worker-bytes", "utf8");
    writeFileSync(join(packageRoot, "dist/.openai/hosting.json"), "{}", "utf8");
    writeFileSync(join(packageRoot, "dist/.openai/drizzle/meta/_journal.json"), "{}", "utf8");
    const archive = join(directory, "deployment.tar.gz");
    execFileSync("/usr/bin/tar", ["-czf", archive, "dist"], {
      cwd: packageRoot,
      env: { COPYFILE_DISABLE: "1", NODE_ENV: "test" }
    });

    const evidence = localArchiveEvidence(archive);
    const records = [
      { path: ".openai/drizzle/meta/_journal.json", bytes: 2, sha256: sha256("{}") },
      { path: ".openai/hosting.json", bytes: 2, sha256: sha256("{}") },
      { path: "server/index.js", bytes: 12, sha256: sha256("worker-bytes") }
    ];
    expect(evidence.fileCount).toBe(3);
    expect(evidence.fileListRoot).toBe(sha256(JSON.stringify(records.map(({ path }) => path))));
    expect(evidence.contentRoot).toBe(sha256(JSON.stringify(stable(records))));
  });

  it("rejects any archive/package byte-manifest mismatch", () => {
    const archive = {
      archiveSha256: "1".repeat(64),
      archiveBytes: 100,
      fileListRoot: "2".repeat(64),
      contentRoot: "3".repeat(64),
      fileCount: 4
    };
    const packageManifest = {
      contentRoot: archive.contentRoot,
      fileListRoot: archive.fileListRoot,
      fileCount: archive.fileCount
    };
    const proofBuild = {
      localArchiveSha256: archive.archiveSha256,
      localArchiveBytes: archive.archiveBytes,
      localArchiveFileListRoot: archive.fileListRoot,
      localArchiveContentRoot: archive.contentRoot,
      localArchiveFileCount: archive.fileCount,
      packageContentRoot: packageManifest.contentRoot,
      packageFileListRoot: packageManifest.fileListRoot,
      packageFileCount: packageManifest.fileCount
    };
    expect(() => validateArchivePackageBinding({ archive, packageManifest, proofBuild })).not.toThrow();
    expect(() => validateArchivePackageBinding({
      archive,
      packageManifest: { ...packageManifest, contentRoot: "4".repeat(64) },
      proofBuild
    })).toThrow("deployment archive and package manifest mismatch");
    expect(() => validateArchivePackageBinding({
      archive: { ...archive, archiveBytes: 101 },
      packageManifest,
      proofBuild
    })).toThrow("deployment archive and package manifest mismatch");
  });

  it("confines proof, archive, and append-only receipt to one qualification directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "os01-qualified-paths-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "deployment-proof.json"), "{}", "utf8");
    writeFileSync(join(directory, "deployment.tar.gz"), "archive", "utf8");
    const canonicalDirectory = realpathSync(directory);
    expect(resolveQualificationPaths(directory)).toEqual({
      directory: canonicalDirectory,
      deploymentProof: resolve(canonicalDirectory, "deployment-proof.json"),
      deploymentArchive: resolve(canonicalDirectory, "deployment.tar.gz"),
      output: resolve(canonicalDirectory, "census-receipt.json")
    });
    writeFileSync(join(directory, "census-receipt.json"), "existing", "utf8");
    expect(() => resolveQualificationPaths(directory)).toThrow(/already exists/u);
  });

  it("rejects missing entrypoints and link or special archive members", () => {
    const directory = mkdtempSync(join(tmpdir(), "os01-archive-invalid-"));
    temporaryDirectories.push(directory);
    const missingRoot = join(directory, "missing");
    mkdirSync(join(missingRoot, "dist/server"), { recursive: true });
    writeFileSync(join(missingRoot, "dist/server/index.js"), "worker", "utf8");
    const missingArchive = join(directory, "missing.tar.gz");
    execFileSync("/usr/bin/tar", ["-czf", missingArchive, "dist"], {
      cwd: missingRoot,
      env: { COPYFILE_DISABLE: "1", NODE_ENV: "test" }
    });
    expect(() => localArchiveEvidence(missingArchive)).toThrow(/omits required build entries/u);

    const linkRoot = join(directory, "link");
    mkdirSync(join(linkRoot, "dist/server"), { recursive: true });
    mkdirSync(join(linkRoot, "dist/.openai/drizzle/meta"), { recursive: true });
    writeFileSync(join(linkRoot, "dist/server/index.js"), "worker", "utf8");
    writeFileSync(join(linkRoot, "dist/.openai/hosting.json"), "{}", "utf8");
    writeFileSync(join(linkRoot, "dist/.openai/drizzle/meta/_journal.json"), "{}", "utf8");
    execFileSync("/bin/ln", ["-s", "index.js", join(linkRoot, "dist/server/link.js")]);
    const linkArchive = join(directory, "link.tar.gz");
    execFileSync("/usr/bin/tar", ["-czf", linkArchive, "dist"], {
      cwd: linkRoot,
      env: { COPYFILE_DISABLE: "1", NODE_ENV: "test" }
    });
    expect(() => localArchiveEvidence(linkArchive)).toThrow(/link or special/u);
  });

  it("trust-roots both hosted destinations in versioned configuration", () => {
    expect(configuredTrustedTarget("production")).toMatchObject({
      projectId: "appgprj_6a7ba1bc638c819197788ab281abfbc3",
      origin: "https://nfl-projection-lab-2026.psoiawesome.chatgpt.site",
      loopbackFixture: false
    });
    expect(configuredTrustedTarget("staging")).toMatchObject({
      projectId: "appgprj_6a90219f9cb081918f5123f29c82bcbf",
      origin: "https://nfl-engine-os01-census-20260827.psoiawesome.chatgpt.site",
      accessMode: "owner_only",
      loopbackFixture: false
    });
    expect(() => configuredTrustedTarget("caller-controlled")).toThrow("trusted census target is unavailable");
  });

  it("requires fresh Sites proof bound to the exact project, version, deployment, and origin", () => {
    const origin = "https://trusted.example.invalid";
    const target = {
      name: "test",
      projectId: "test-project",
      origin,
      accessMode: "owner_only",
      loopbackFixture: false
    };
    const proof = deploymentProof(origin);
    const nowMs = Date.parse(String(proof.observedAt));
    expect(validateSitesDeploymentIdentity({
      proof,
      target,
      deploymentCommit,
      deploymentVersion,
      nowMs
    })).toMatchObject({ sourceCommit: deploymentCommit, versionId: deploymentVersion });
    expect(() => validateSitesDeploymentIdentity({
      proof: { ...proof, projectId: "untrusted-project" },
      target,
      deploymentCommit,
      deploymentVersion,
      nowMs
    })).toThrow("Sites project is not the trusted census target");
    expect(() => validateSitesDeploymentIdentity({
      proof: {
        ...proof,
        deployment: { ...(proof.deployment as Record<string, unknown>), origin: "https://wrong.example.invalid" }
      },
      target,
      deploymentCommit,
      deploymentVersion,
      nowMs
    })).toThrow("Sites deployment state mismatch");
    expect(() => validateSitesDeploymentIdentity({
      proof,
      target,
      deploymentCommit,
      deploymentVersion: "wrong-version",
      nowMs
    })).toThrow("Sites version binding mismatch");

    expect(() => validateDeploymentProofFreshness(
      new Date(nowMs - 600_001).toISOString(),
      nowMs
    )).toThrow("deployment proof observation is stale");
    expect(() => validateDeploymentProofFreshness(
      new Date(nowMs + 120_001).toISOString(),
      nowMs
    )).toThrow("deployment proof observation is too far in the future");
  });

  it("binds the clean one-commit anchor successor to both full Git trees and archives", () => {
    const repository = successorRepository();
    const bridge = validateBridgeImplementation(
      repository.directory,
      repository.implementation,
      testBridgeFoundation(repository)
    );
    const evidence = validateGitSuccessor(
      repository.directory,
      repository.implementation,
      repository.deployment,
      testBridgeFoundation(repository)
    );
    expect(evidence).toMatchObject({
      implementationCommit: repository.implementation,
      deploymentCommit: repository.deployment,
      successorCommitCount: 1,
      implementationToDeploymentNameStatus: [
        { status: "M", path: "worker/os01-census-source-anchor.ts" }
      ]
    });
    expect(evidence.implementationTreeObjectId).toMatch(/^[a-f0-9]{40}$/u);
    expect(evidence.deploymentTreeObjectId).toMatch(/^[a-f0-9]{40}$/u);
    expect(evidence.implementationArchiveSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(evidence.deploymentArchiveSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(evidence.sourceTreeAnchor).toMatch(/^[a-f0-9]{64}$/u);
    expect(evidence.buildInputRoot).toMatch(/^[a-f0-9]{64}$/u);
    expect(bridge).toMatchObject({
      liveBaseCommit: repository.liveBase,
      implementationCommit: repository.implementation,
      sourceTreeAnchor: evidence.sourceTreeAnchor
    });
  });

  it("binds the authority controller to C0 through exact shared-code bytes and the source anchor", () => {
    const repository = successorRepository();
    const authority = authorityRepositoryFor(repository);
    const relation = validateAuthorityBridgeCodeRelation({
      authorityRepositoryRoot: authority.directory,
      authorityCommit: authority.commit,
      implementationRepositoryRoot: repository.directory,
      implementationCommit: repository.implementation,
      relation: {
        version: "test-authority-bridge-relation",
        exactEqualPaths: [
          "worker/env-boundary.ts",
          "worker/os01-census-operator.ts",
          "worker/os01-census-source-anchor.ts"
        ]
      }
    });
    expect(relation.files.map(({ path }) => path)).toEqual([
      "worker/env-boundary.ts",
      "worker/os01-census-operator.ts",
      "worker/os01-census-source-anchor.ts"
    ]);
    expect(relation.relationRoot).toMatch(/^[a-f0-9]{64}$/u);

    const gitEvidence = validateGitSuccessor(
      repository.directory,
      repository.implementation,
      repository.deployment,
      testBridgeFoundation(repository)
    );
    const authorityEvidence = {
      authorityCommit: authority.commit,
      authorityTreeObjectId: "1".repeat(40),
      authorityArchiveSha256: "2".repeat(64),
      authorityArchiveBytes: 1,
      authorityTreeRoot: "3".repeat(64)
    };
    const sourceAnchor = computeSourceAnchor(
      gitEvidence,
      testImplementationBuild,
      authorityEvidence,
      relation
    );
    const sourceIdentity = {
      authorityEvidence,
      authorityBridgeCodeRelation: relation,
      fullTreeIdentityVersion: "os01-census-full-tree.2026.1",
      liveBaseCommit: gitEvidence.liveBaseCommit,
      liveBaseTreeObjectId: gitEvidence.liveBaseTreeObjectId,
      liveBaseToImplementationNameStatus: gitEvidence.liveBaseToImplementationNameStatus,
      implementationCommit: gitEvidence.implementationCommit,
      deploymentCommit: gitEvidence.deploymentCommit,
      implementationTreeObjectId: gitEvidence.implementationTreeObjectId,
      deploymentTreeObjectId: gitEvidence.deploymentTreeObjectId,
      implementationArchiveSha256: gitEvidence.implementationArchiveSha256,
      implementationArchiveBytes: gitEvidence.implementationArchiveBytes,
      deploymentArchiveSha256: gitEvidence.deploymentArchiveSha256,
      deploymentArchiveBytes: gitEvidence.deploymentArchiveBytes,
      implementationToDeploymentNameStatus: gitEvidence.implementationToDeploymentNameStatus,
      successorCommitCount: gitEvidence.successorCommitCount,
      sourceTreeAnchor: gitEvidence.sourceTreeAnchor,
      implementationBuild: testImplementationBuild,
      sourceAnchor,
      buildInputRoot: gitEvidence.buildInputRoot
    };
    expect(validateHostedSourceIdentity({
      sourceIdentity,
      gitEvidence,
      implementationBuild: testImplementationBuild,
      authorityEvidence,
      authorityBridgeCodeRelation: relation
    })).toBe(sourceAnchor);
    expect(() => validateHostedSourceIdentity({
      sourceIdentity: {
        ...sourceIdentity,
        authorityBridgeCodeRelation: { ...relation, relationRoot: "f".repeat(64) }
      },
      gitEvidence,
      implementationBuild: testImplementationBuild,
      authorityEvidence,
      authorityBridgeCodeRelation: relation
    })).toThrow("deployment proof full-tree identity mismatch");

    const mismatchedAuthority = authorityRepositoryFor(repository, "worker/os01-census-operator.ts");
    expect(() => validateAuthorityBridgeCodeRelation({
      authorityRepositoryRoot: mismatchedAuthority.directory,
      authorityCommit: mismatchedAuthority.commit,
      implementationRepositoryRoot: repository.directory,
      implementationCommit: repository.implementation,
      relation: {
        version: "test-authority-bridge-relation",
        exactEqualPaths: [
          "worker/env-boundary.ts",
          "worker/os01-census-operator.ts",
          "worker/os01-census-source-anchor.ts"
        ]
      }
    })).toThrow("authority-to-bridge code mismatch: worker/os01-census-operator.ts");
  });

  it("rejects a dirty successor or any non-anchor C0-to-C1 change", () => {
    const dirty = successorRepository();
    writeFileSync(join(dirty.directory, "worker/other.ts"), "export const value = 3;\n", "utf8");
    expect(() => validateGitSuccessor(
      dirty.directory, dirty.implementation, dirty.deployment, testBridgeFoundation(dirty)
    ))
      .toThrow("qualification worktree is not clean");

    const widened = successorRepository({ mutateNonAnchor: true });
    expect(() => validateGitSuccessor(
      widened.directory, widened.implementation, widened.deployment, testBridgeFoundation(widened)
    ))
      .toThrow("deployment successor diff is not anchor-only");

    const wrongBase = successorRepository();
    expect(() => validateGitSuccessor(
      wrongBase.directory,
      wrongBase.implementation,
      wrongBase.deployment,
      { ...testBridgeFoundation(wrongBase), liveBaseCommit: wrongBase.implementation }
    )).toThrow("bridge implementation is not the frozen direct live-base successor");
  });

  it("classifies every registered plays shape without collapsing hard stops into support", () => {
    const fixture = schemaFixture();
    const classes = JSON.parse(readFileSync("config/os01-production-prestate-classes.v1.json", "utf8")) as {
      plays: { shapes: Record<string, { fullHash: string; coreHash: string; decision: string }> };
    };
    for (const [name, shape] of Object.entries(classes.plays.shapes)) {
      const evidence = fixture.evidence.map((object) => object.key === "table:plays"
        ? { ...object, semanticHash: shape.fullHash, tableCoreHash: shape.coreHash }
        : object);
      const result = classifySchema(fixture.catalog, evidence, fixture.stages);
      expect(result.expectedSummary).toMatchObject({ playsShape: name, playsDecision: shape.decision });
      expect(result.accepted).toBe(shape.decision === "supported");
    }
  });

  it("treats every recognized historical trigger as an explicit reconciliation hard stop", () => {
    const fixture = schemaFixture();
    const classes = JSON.parse(readFileSync("config/os01-production-prestate-classes.v1.json", "utf8")) as {
      historicalTriggers: {
        recognizedHardStopMainLine: Record<string, string>;
        trackedIncompatible: Record<string, string[]>;
      };
    };
    const [name, semanticHash] = Object.entries(classes.historicalTriggers.recognizedHardStopMainLine)[0]!;
    const trigger = {
      key: `trigger:${name}`,
      type: "trigger" as const,
      name,
      tableName: "plays",
      semanticHash,
      tableCoreHash: null
    };
    const catalog = [...fixture.catalog, {
      type: "trigger" as const,
      name,
      tableName: "plays",
      internal: false,
      sqlIsNull: false,
      sqlHash: sha256(`trigger:${name}`)
    }];
    const recognized = classifySchema(catalog, [...fixture.evidence, trigger], fixture.stages);
    expect(recognized.accepted).toBe(false);
    expect(recognized.findings).toContainEqual(expect.objectContaining({
      code: "recognized_historical_trigger_requires_reconciliation",
      key: `trigger:${name}`
    }));

    const trackedName = Object.keys(classes.historicalTriggers.trackedIncompatible)[0]!;
    const trackedHash = classes.historicalTriggers.trackedIncompatible[trackedName]![0]!;
    const tracked = classifySchema(
      [...fixture.catalog, { ...catalog.at(-1)!, name: trackedName }],
      [...fixture.evidence, { ...trigger, key: `trigger:${trackedName}`, name: trackedName, semanticHash: trackedHash }],
      fixture.stages
    );
    expect(tracked.findings).toContainEqual(expect.objectContaining({
      severity: "block",
      code: "tracked_incompatible_historical_trigger"
    }));
  });

  it("hard-stops unreceipted 0017/0018 objects and accepts only exact optional 0019 objects", () => {
    const fixture = schemaFixture();
    const objectKeys = (objects: SchemaObject[]) => new Set(objects.map((object) => `${object.type}:${object.name}`));
    const through16 = objectKeys(fixture.stages.through0016.objects);
    const through17 = objectKeys(fixture.stages.through0017.objects);
    const added17 = fixture.stages.through0017.objects.filter((object) => !through16.has(`${object.type}:${object.name}`));
    const added18 = fixture.stages.through0018.objects.filter((object) => !through17.has(`${object.type}:${object.name}`));
    const through18 = objectKeys(fixture.stages.through0018.objects);
    const added19 = fixture.stages.through0019.objects.filter((object) => !through18.has(`${object.type}:${object.name}`));
    expect(added17.length).toBeGreaterThan(0);
    expect(added18.length).toBeGreaterThan(0);
    expect(added19.length).toBeGreaterThan(0);

    for (const object of [added17[0]!, added18[0]!]) {
      const evidence = evidenceFromObject(object);
      const result = classifySchema(
        [...fixture.catalog, {
          type: object.type,
          name: object.name,
          tableName: object.tableName,
          internal: false,
          sqlIsNull: false,
          sqlHash: sha256(`schema:${evidence.key}`)
        }],
        [...fixture.evidence, evidence],
        fixture.stages
      );
      expect(result.accepted).toBe(false);
      expect(result.findings).toContainEqual(expect.objectContaining({ code: "unreceipted_0017_or_0018_object" }));
    }

    const exact19 = added19.map(evidenceFromObject);
    const catalog19 = exact19.map((object) => ({
      type: object.type,
      name: object.name,
      tableName: object.tableName,
      internal: false,
      sqlIsNull: false,
      sqlHash: sha256(`schema:${object.key}`)
    }));
    const catalog19Autoindexes = fixture.stages.autoindexes.added0019.map((entry) => ({
      type: "index" as const,
      name: entry.name,
      tableName: entry.tableName,
      internal: true,
      sqlIsNull: entry.sqlIsNull,
      sqlHash: entry.sqlHash
    }));
    expect(classifySchema(
      [...fixture.catalog, ...catalog19, ...catalog19Autoindexes],
      [...fixture.evidence, ...exact19],
      fixture.stages
    ).accepted).toBe(true);
    const drifted = exact19.map((object, index) => index === 0
      ? { ...object, semanticHash: "f".repeat(64), tableCoreHash: object.type === "table" ? "e".repeat(64) : null }
      : object);
    expect(classifySchema(
      [...fixture.catalog, ...catalog19, ...catalog19Autoindexes],
      [...fixture.evidence, ...drifted],
      fixture.stages
    ).findings).toContainEqual(expect.objectContaining({ code: "0019_adoption_semantic_drift" }));
  });

  it("rejects unknown application/internal objects and validates SQLite autoindex evidence exactly", () => {
    const fixture = schemaFixture();
    const unknown = {
      key: "table:unregistered_engine_table",
      type: "table" as const,
      name: "unregistered_engine_table",
      tableName: "unregistered_engine_table",
      semanticHash: "a".repeat(64),
      tableCoreHash: "b".repeat(64)
    };
    const unknownResult = classifySchema(
      [...fixture.catalog, {
        type: "table" as const,
        name: unknown.name,
        tableName: unknown.tableName,
        internal: false,
        sqlIsNull: false,
        sqlHash: sha256("unknown")
      }],
      [...fixture.evidence, unknown],
      fixture.stages
    );
    expect(unknownResult.findings).toContainEqual(expect.objectContaining({
      code: "unknown_application_object",
      key: unknown.key
    }));

    const autoindex = fixture.catalog.find((entry) => entry.name === "sqlite_autoindex_engine_schema_versions_1")!;
    expect(classifySchema(fixture.catalog, fixture.evidence, fixture.stages).accepted).toBe(true);
    for (const invalid of [
      { ...autoindex, sqlIsNull: false },
      { ...autoindex, sqlHash: sha256("not-empty") },
      { ...autoindex, tableName: "missing_owner" },
      { ...autoindex, name: "sqlite_unrecognized_internal" }
    ]) {
      const catalog = fixture.catalog.map((entry) => entry.name === autoindex.name ? invalid : entry);
      const result = classifySchema(catalog, fixture.evidence, fixture.stages);
      expect(result.accepted).toBe(false);
      expect(result.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ severity: "block" })
      ]));
    }
    const extra = { ...autoindex, name: "sqlite_autoindex_engine_schema_versions_99" };
    expect(classifySchema([...fixture.catalog, extra], fixture.evidence, fixture.stages).findings)
      .toContainEqual(expect.objectContaining({ code: "unknown_internal_object" }));
  });

  it("requires two identical read-only passes and emits only hashed row evidence", async () => {
    const database = migratedDatabase();
    const token = "c".repeat(64);
    const server = await operatorServer({ database, token });
    try {
      const output = temporaryOutput("receipt.json");
      const result = await runController({ endpoint: server.endpoint, token, output });
      expect(result, result.stderr).toMatchObject({ code: 0, stderr: "" });
      const receipt = JSON.parse(readFileSync(output, "utf8")) as Record<string, unknown>;
      expect(receipt.status).toBe("accepted_two_identical_read_only_passes");
      expect(receipt.commonPassRoot).toMatch(/^[a-f0-9]{64}$/u);
      expect(receipt.buildAttestation).toBe(testSourceAnchor);
      expect(receipt.providerSecretReads).toBe(0);
      expect(receipt.providerRequests).toBe(0);
      expect(receipt.quotaReservations).toBe(0);
      expect(JSON.stringify(receipt)).not.toContain("the-odds-api', 38");
      expect(JSON.stringify(receipt)).not.toContain("continuation");
      expect(JSON.stringify(receipt)).not.toContain("rowHashes");
    } finally {
      await server.close();
      database.close();
    }
  }, 120_000);

  it("supports only the all-or-nothing absent plays prestate", async () => {
    const database = migratedDatabase();
    database.exec("DROP INDEX idx_plays_created_at; DROP INDEX idx_plays_season_week_status; DROP TABLE plays;");
    const token = "d".repeat(64);
    const server = await operatorServer({ database, token });
    try {
      const output = temporaryOutput("absent.json");
      const result = await runController({ endpoint: server.endpoint, token, output });
      expect(result, result.stderr).toMatchObject({ code: 0, stderr: "" });
      const receipt = JSON.parse(readFileSync(output, "utf8")) as {
        status: string;
        classification: { expectedSummary: { playsShape: string } };
      };
      expect(receipt.status).toBe("accepted_two_identical_read_only_passes");
      expect(receipt.classification.expectedSummary.playsShape).toBe("absent");
    } finally {
      await server.close();
      database.close();
    }
  }, 120_000);

  it("recognizes the runtime-mutated plays shape but hard-stops before content", async () => {
    const database = migratedDatabase();
    database.exec(`
      ALTER TABLE plays ADD COLUMN contract_key text DEFAULT '' NOT NULL;
      ALTER TABLE plays ADD COLUMN gabe_approved integer DEFAULT 0 NOT NULL;
      ALTER TABLE plays ADD COLUMN jarrett_approved integer DEFAULT 0 NOT NULL;
      ALTER TABLE plays ADD COLUMN closing_clv_points real;
      ALTER TABLE plays ADD COLUMN clv_reference_book text;
    `);
    const token = "e".repeat(64);
    const server = await operatorServer({ database, token });
    try {
      const output = temporaryOutput("runtime.json");
      const result = await runController({ endpoint: server.endpoint, token, output });
      expect(result, result.stderr).toMatchObject({ code: 0, stderr: "" });
      const receipt = JSON.parse(readFileSync(output, "utf8")) as {
        status: string;
        contentTablesScanned: number;
        classification: { expectedSummary: { playsShape: string; playsDecision: string } };
      };
      expect(receipt.status).toBe("blocked_before_content_scan");
      expect(receipt.contentTablesScanned).toBe(0);
      expect(receipt.classification.expectedSummary).toMatchObject({
        playsShape: "runtime_mutated_gabe_jarrett_34",
        playsDecision: "hard_stop_information_loss"
      });
    } finally {
      await server.close();
      database.close();
    }
  }, 120_000);

  it("rejects a tampered authenticated payload", async () => {
    const database = migratedDatabase();
    const token = "f".repeat(64);
    const server = await operatorServer({
      database,
      token,
      mutate: (value) => ({ ...value, payloadHash: "0".repeat(64) })
    });
    try {
      const output = temporaryOutput("tampered.json");
      const result = await runController({ endpoint: server.endpoint, token, output });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("operator payload hash mismatch");
      expect(readFileSync(output)).toHaveLength(0);
    } finally {
      await server.close();
      database.close();
    }
  });

  it("rejects a rehashed benign field mutation specifically at the operator MAC", async () => {
    const database = migratedDatabase();
    const token = sha256("token:observed-at-mac");
    let mutated = false;
    const server = await operatorServer({
      database,
      token,
      mutate: (value) => {
        if (mutated) return value;
        mutated = true;
        return recomputePayloadHash({
          ...value,
          observedAt: new Date(Date.parse(String(value.observedAt)) + 1).toISOString()
        });
      }
    });
    try {
      const output = temporaryOutput("rehashed-benign-mac.json");
      const result = await runController({ endpoint: server.endpoint, token, output });
      expect(mutated).toBe(true);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("operator payload MAC mismatch");
      expect(readFileSync(output)).toHaveLength(0);
    } finally {
      await server.close();
      database.close();
    }
  });

  it("rejects rehashed request, continuation, sequence, table, offset, and page tampering with a stale MAC", async () => {
    const cases: Array<{ name: string; mutate: (value: Record<string, unknown>) => boolean }> = [
      {
        name: "request",
        mutate: (value) => {
          value.requestHash = "0".repeat(64);
          return true;
        }
      },
      {
        name: "continuation",
        mutate: (value) => {
          value.continuationHash = "0".repeat(64);
          return true;
        }
      },
      {
        name: "sequence",
        mutate: (value) => {
          value.sequence = Number(value.sequence) + 1;
          return true;
        }
      },
      {
        name: "table",
        mutate: (value) => {
          const payload = value.payload as Record<string, unknown>;
          if (payload.operation !== "schema_object") return false;
          payload.name = "tampered_table";
          return true;
        }
      },
      {
        name: "offset",
        mutate: (value) => {
          const payload = value.payload as Record<string, unknown>;
          if (payload.operation !== "table_page") return false;
          payload.offset = Number(payload.offset) + 1;
          return true;
        }
      },
      {
        name: "page",
        mutate: (value) => {
          const payload = value.payload as Record<string, unknown>;
          if (payload.operation !== "table_page") return false;
          payload.pageHash = "0".repeat(64);
          return true;
        }
      }
    ];
    for (const tamper of cases) {
      const database = migratedDatabase();
      const token = sha256(`token:${tamper.name}`);
      let mutated = false;
      const server = await operatorServer({
        database,
        token,
        mutate: (value) => {
          if (!mutated && tamper.mutate(value)) {
            mutated = true;
            return recomputePayloadHash(value);
          }
          return value;
        }
      });
      try {
        const output = temporaryOutput(`rehashed-${tamper.name}.json`);
        const result = await runController({ endpoint: server.endpoint, token, output });
        expect(mutated, tamper.name).toBe(true);
        expect(result.code, `${tamper.name}: ${result.stderr}`).not.toBe(0);
        expect(readFileSync(output), tamper.name).toHaveLength(0);
      } finally {
        await server.close();
        database.close();
      }
    }
  }, 120_000);

  it("pins the exact origin and route before sending either token", async () => {
    const output = temporaryOutput("wrong-origin.json");
    const result = await runController({
      endpoint: `https://wrong.example${os01CensusContract.route}`,
      expectedOrigin: "http://127.0.0.1:65534",
      token: "1".repeat(64),
      output
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("invalid secret input");
    expect(readFileSync(output)).toHaveLength(0);
  });

  it("reserves receipt identity before any network call and never overwrites", async () => {
    const database = migratedDatabase();
    const token = "2".repeat(64);
    const server = await operatorServer({ database, token });
    try {
      const output = temporaryOutput("existing.json");
      writeFileSync(output, "immutable\n", "utf8");
      const result = await runController({ endpoint: server.endpoint, token, output });
      expect(result.code).not.toBe(0);
      expect(readFileSync(output, "utf8")).toBe("immutable\n");
      expect(server.requestCount()).toBe(0);
    } finally {
      await server.close();
      database.close();
    }
  });
});
