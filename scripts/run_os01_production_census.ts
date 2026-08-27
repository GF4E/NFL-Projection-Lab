#!/usr/bin/env node

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync,
  readdirSync, realpathSync, rmSync, writeFileSync
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  buildPhysicalManifest,
  type CommittedManifest,
  type SchemaObject
} from "./verify_d1_schema_authority";

type JsonScalar = boolean | number | string | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

type SecretInput = {
  endpoint: string;
  censusToken: string;
  siteAuthorizationToken?: string;
};

export type TrustedTarget = {
  name: string;
  projectId: string;
  origin: string;
  accessMode: string;
  loopbackFixture: boolean;
};

export type GitSuccessorEvidence = {
  liveBaseCommit: string;
  liveBaseTreeObjectId: string;
  liveBaseToImplementationNameStatus: Array<{ status: string; path: string }>;
  implementationCommit: string;
  deploymentCommit: string;
  implementationTreeObjectId: string;
  deploymentTreeObjectId: string;
  implementationArchiveSha256: string;
  implementationArchiveBytes: number;
  deploymentArchiveSha256: string;
  deploymentArchiveBytes: number;
  implementationToDeploymentNameStatus: Array<{ status: string; path: string }>;
  implementationToDeploymentDiff: string[];
  successorCommitCount: number;
  sourceTreeAnchor: string;
  buildInputRoot: string;
};

export type BridgeImplementationEvidence = {
  liveBaseCommit: string;
  liveBaseTreeObjectId: string;
  liveBaseToImplementationNameStatus: Array<{ status: string; path: string }>;
  implementationCommit: string;
  implementationTreeObjectId: string;
  implementationArchiveSha256: string;
  implementationArchiveBytes: number;
  sourceTreeAnchor: string;
};

export type AuthorityEvidence = {
  authorityCommit: string;
  authorityTreeObjectId: string;
  authorityArchiveSha256: string;
  authorityArchiveBytes: number;
  authorityTreeRoot: string;
};

export type LocalBuildEvidence = {
  builtWorkerHash: string;
  distRoot: string;
  archiveFileListRoot: string;
  fileCount: number;
  activeBuildGraphHash: string;
  activeSourceFilesScanned: number;
  activeBuildFilesScanned: number;
  compiledAnchorCarrierRoot: string;
  entryStaticClosureRoot: string;
  entryStaticFileCount: number;
};

export type PackageManifestEvidence = {
  contentRoot: string;
  fileListRoot: string;
  fileCount: number;
};

export type LocalArchiveEvidence = {
  archiveSha256: string;
  archiveBytes: number;
  fileListRoot: string;
  contentRoot: string;
  fileCount: number;
};

export type AuthorityBridgeCodeRelationEvidence = {
  version: string;
  authorityCommit: string;
  implementationCommit: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  relationRoot: string;
};

type CatalogEntry = {
  type: SchemaObject["type"];
  name: string;
  tableName: string;
  internal: boolean;
  sqlIsNull: boolean;
  sqlHash: string;
};

type OperatorResponse = {
  contractVersion: string;
  buildAttestation: string;
  passId: string;
  passNonceHash: string;
  sequence: number;
  requestHash: string;
  payload: Record<string, unknown>;
  queryStats: {
    queries: number;
    rowsRead: number;
    rowsWritten: number;
    changes: number;
    changedDb: boolean;
  };
  observedAt: string;
  continuation: string;
  continuationHash: string;
  payloadHash: string;
  payloadMac: string;
};

type ExpectedStages = {
  through0016: CommittedManifest;
  through0017: CommittedManifest;
  through0018: CommittedManifest;
  through0019: CommittedManifest;
  through0020: CommittedManifest;
  autoindexes: {
    through0016: Array<{ name: string; tableName: string; sqlIsNull: true; sqlHash: string }>;
    added0019: Array<{ name: string; tableName: string; sqlIsNull: true; sqlHash: string }>;
  };
  migrationByteHashes: Array<{ tag: string; sha256: string }>;
};

type SchemaEvidence = {
  key: string;
  type: SchemaObject["type"];
  name: string;
  tableName: string;
  semanticHash: string;
  tableCoreHash: string | null;
};

type TableEvidence = {
  table: string;
  rowCount: number;
  columnsHash: string;
  schemaVersion: number;
  pageCount: number;
  pageHashes: string[];
  dataHash: string;
};

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/os01-production-census.v1.json"), "utf8")) as {
  version: string;
  route: string;
};
const prestateClasses = JSON.parse(
  readFileSync(resolve(root, "config/os01-production-prestate-classes.v1.json"), "utf8")
) as {
  version: string;
  plays: {
    ownedObjectKeys: string[];
    explicitIndexes: Record<string, string>;
    shapes: Record<string, { fullHash: string; coreHash: string; decision: string }>;
  };
  historicalTriggers: {
    recognizedHardStopMainLine: Record<string, string>;
    trackedIncompatible: Record<string, string[]>;
    requiredTableName: string;
    portfolioVersionsMutuallyExclusive: boolean;
  };
};
const attestationContract = JSON.parse(
  readFileSync(resolve(root, "config/os01-census-attestation.v1.json"), "utf8")
) as {
  version: string;
  sourceTreeIdentityVersion: string;
  sourceAnchorInputVersion: string;
  generatedAnchorPath: string;
  requiredImplementationToDeploymentDiff: string[];
  fullTrackedTreeIdentity: {
    version: string;
    gitObjectFormat: string;
    archiveFormat: string;
    successorCommitCount: number;
    requiredNameStatus: string;
  };
  bridgeFoundation: {
    version: string;
    liveBaseCommit: string;
    implementationCommitCount: number;
    requiredLiveBaseToImplementationNameStatus: Array<{ status: string; path: string }>;
    retainedRuntimeSourcePath: string;
    retainedRuntimeBridgePath: string;
  };
  authorityBridgeCodeRelation: {
    version: string;
    exactEqualPaths: string[];
  };
  buildIdentity: {
    version: string;
    distPath: string;
    builtWorkerPath: string;
    serverManifestPath: string;
    requiredServerEntry: string;
    requiredDynamicEntry: string;
    requiredDirectStaticImportNames: string[];
    forbiddenStaticMarkers: string[];
    sitesArchiveHashPrefix: string;
    localArchiveFormat: string;
    sitesArchiveFormat: string;
  };
  deploymentProofVersion: string;
  deploymentProofStatus: string;
  deploymentProofFreshness: {
    maximumAgeSeconds: number;
    maximumFutureSkewSeconds: number;
  };
  trustedTargetConfig: string;
};
const trustedTargetContract = JSON.parse(
  readFileSync(resolve(root, attestationContract.trustedTargetConfig), "utf8")
) as {
  version: string;
  targets: Record<string, {
    enabled: boolean;
    projectId: string;
    origin: string | null;
    accessMode: string;
  }>;
};
const authorityFoundation = (JSON.parse(
  readFileSync(resolve(root, "config/d1-schema-authority.v1.json"), "utf8")
) as {
  acceptedProductionFoundation: {
    preservedReceipts: Array<{ version: string; migrationHash: string }>;
    quotaBootstrap: {
      used: number;
      remaining: number;
      outstandingReservations: number;
      reservationEvents: number;
    };
  };
}).acceptedProductionFoundation;
const internalNames = new Set(["_cf_KV", "d1_migrations", "sqlite_sequence", "sqlite_stat1", "sqlite_stat4"]);
const emptySqlHash = sha256("");
const objectTypes = new Set<SchemaObject["type"]>(["index", "table", "trigger", "view"]);
const MAX_OPERATOR_RESPONSE_BYTES = 1_048_576;
const MAX_TABLE_ROWS = 100_000_000;
const MAX_DEPLOYMENT_PROOF_BYTES = 131_072;
const MAX_DEPLOYMENT_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_SECRET_INPUT_BYTES = 16_384;

function stable(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)])) as { [key: string]: JsonValue };
  }
  if (typeof value === "bigint") return value.toString();
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return value as JsonScalar;
  throw new Error("unsupported stable JSON value");
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readStableFile(path: string, maximumBytes: number, label: string): Uint8Array {
  const descriptor = openSync(path, "r");
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size <= 0 || before.size > maximumBytes) {
      throw new Error(`${label} is not a bounded nonempty regular file`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      bytes.byteLength !== before.size || after.size !== before.size ||
      after.dev !== before.dev || after.ino !== before.ino || after.mtimeMs !== before.mtimeMs
    ) throw new Error(`${label} changed while reading`);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function readBoundedStdin(maximumBytes: number): string {
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const buffer = Buffer.allocUnsafe(Math.min(4096, maximumBytes + 1 - total));
    const count = readSync(0, buffer, 0, buffer.byteLength, null);
    if (count === 0) break;
    total += count;
    if (total > maximumBytes) throw new Error("secret input exceeds byte limit");
    chunks.push(buffer.subarray(0, count));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function gitText(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function gitBytes(repositoryRoot: string, args: string[]): Uint8Array {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "buffer",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function requireGitObjectId(value: string, context: string): string {
  const pattern = attestationContract.fullTrackedTreeIdentity.gitObjectFormat === "sha1"
    ? /^[a-f0-9]{40}$/u
    : /^[a-f0-9]{64}$/u;
  if (!pattern.test(value)) throw new Error(`${context} is not a valid Git object id`);
  return value;
}

export function validateBridgeImplementation(
  repositoryRoot: string,
  implementationCommitInput: string,
  bridgeFoundation = attestationContract.bridgeFoundation
): BridgeImplementationEvidence {
  const liveBaseCommit = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${bridgeFoundation.liveBaseCommit}^{commit}`]),
    "bridge live-base commit"
  );
  if (liveBaseCommit !== bridgeFoundation.liveBaseCommit) {
    throw new Error("bridge live-base commit is not canonical");
  }
  const implementationCommit = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${implementationCommitInput}^{commit}`]),
    "implementation commit"
  );
  if (implementationCommit !== implementationCommitInput) throw new Error("implementation commit input is not canonical");
  const implementationCommitCount = Number(gitText(repositoryRoot, [
    "rev-list", "--count", `${liveBaseCommit}..${implementationCommit}`
  ]));
  const implementationParent = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${implementationCommit}^1`]),
    "bridge implementation parent"
  );
  if (
    implementationCommitCount !== bridgeFoundation.implementationCommitCount ||
    implementationParent !== liveBaseCommit
  ) throw new Error("bridge implementation is not the frozen direct live-base successor");
  const rawBridgeNameStatus = gitText(repositoryRoot, [
    "diff", "--name-status", "--no-renames", liveBaseCommit, implementationCommit
  ]);
  const liveBaseToImplementationNameStatus = rawBridgeNameStatus === "" ? [] : rawBridgeNameStatus.split("\n").map((line) => {
    const [status, path, unexpected] = line.split("\t");
    if (!status || !path || unexpected !== undefined) throw new Error("bridge implementation diff is not canonical");
    return { status, path };
  });
  if (stableJson(liveBaseToImplementationNameStatus) !== stableJson(
    bridgeFoundation.requiredLiveBaseToImplementationNameStatus
  )) throw new Error("bridge implementation changed outside the frozen boundary");
  const retainedRuntime = gitBytes(repositoryRoot, [
    "show", `${liveBaseCommit}:${bridgeFoundation.retainedRuntimeSourcePath}`
  ]);
  const bridgedRuntime = gitBytes(repositoryRoot, [
    "show", `${implementationCommit}:${bridgeFoundation.retainedRuntimeBridgePath}`
  ]);
  if (sha256(retainedRuntime) !== sha256(bridgedRuntime)) {
    throw new Error("bridge does not preserve the live runtime byte-for-byte");
  }
  const c0AnchorSource = gitBytes(repositoryRoot, [
    "show", `${implementationCommit}:${attestationContract.generatedAnchorPath}`
  ]);
  validateExactSourceAnchor(
    new TextDecoder().decode(c0AnchorSource),
    "0".repeat(64),
    false,
    "bridge implementation anchor"
  );
  const implementationTreeObjectId = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${implementationCommit}^{tree}`]),
    "implementation tree"
  );
  const liveBaseTreeObjectId = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${liveBaseCommit}^{tree}`]),
    "bridge live-base tree"
  );
  const implementationArchive = gitBytes(repositoryRoot, [
    "archive", `--format=${attestationContract.fullTrackedTreeIdentity.archiveFormat}`, implementationCommit
  ]);
  const implementationArchiveSha256 = sha256(implementationArchive);
  const sourceTreeAnchor = sha256(stableJson({
    version: attestationContract.sourceTreeIdentityVersion,
    bridgeFoundationVersion: bridgeFoundation.version,
    liveBaseCommit,
    liveBaseTreeObjectId,
    liveBaseToImplementationNameStatus,
    fullTreeIdentityVersion: attestationContract.fullTrackedTreeIdentity.version,
    implementationCommit,
    implementationTreeObjectId,
    implementationArchiveSha256,
    implementationArchiveBytes: implementationArchive.byteLength
  }));
  return {
    liveBaseCommit,
    liveBaseTreeObjectId,
    liveBaseToImplementationNameStatus,
    implementationCommit,
    implementationTreeObjectId,
    implementationArchiveSha256,
    implementationArchiveBytes: implementationArchive.byteLength,
    sourceTreeAnchor
  };
}

export function validateGitSuccessor(
  repositoryRoot: string,
  implementationCommitInput: string,
  deploymentCommitInput: string,
  bridgeFoundation = attestationContract.bridgeFoundation
): GitSuccessorEvidence {
  const liveBaseCommit = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${bridgeFoundation.liveBaseCommit}^{commit}`]),
    "bridge live-base commit"
  );
  if (liveBaseCommit !== bridgeFoundation.liveBaseCommit) {
    throw new Error("bridge live-base commit is not canonical");
  }
  const implementationCommit = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${implementationCommitInput}^{commit}`]),
    "implementation commit"
  );
  const deploymentCommit = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${deploymentCommitInput}^{commit}`]),
    "deployment commit"
  );
  if (implementationCommit !== implementationCommitInput || deploymentCommit !== deploymentCommitInput) {
    throw new Error("Git commit input is not canonical");
  }
  const implementationCommitCount = Number(gitText(repositoryRoot, [
    "rev-list", "--count", `${liveBaseCommit}..${implementationCommit}`
  ]));
  const implementationParent = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${implementationCommit}^1`]),
    "bridge implementation parent"
  );
  if (
    implementationCommitCount !== bridgeFoundation.implementationCommitCount ||
    implementationParent !== liveBaseCommit
  ) throw new Error("bridge implementation is not the frozen direct live-base successor");
  const rawBridgeNameStatus = gitText(repositoryRoot, [
    "diff", "--name-status", "--no-renames", liveBaseCommit, implementationCommit
  ]);
  const liveBaseToImplementationNameStatus = rawBridgeNameStatus === "" ? [] : rawBridgeNameStatus.split("\n").map((line) => {
    const [status, path, unexpected] = line.split("\t");
    if (!status || !path || unexpected !== undefined) throw new Error("bridge implementation diff is not canonical");
    return { status, path };
  });
  if (stableJson(liveBaseToImplementationNameStatus) !== stableJson(
    bridgeFoundation.requiredLiveBaseToImplementationNameStatus
  )) throw new Error("bridge implementation changed outside the frozen boundary");
  const retainedRuntime = gitBytes(repositoryRoot, [
    "show", `${liveBaseCommit}:${bridgeFoundation.retainedRuntimeSourcePath}`
  ]);
  const bridgedRuntime = gitBytes(repositoryRoot, [
    "show", `${implementationCommit}:${bridgeFoundation.retainedRuntimeBridgePath}`
  ]);
  if (sha256(retainedRuntime) !== sha256(bridgedRuntime)) {
    throw new Error("bridge does not preserve the live runtime byte-for-byte");
  }
  const c0AnchorSource = gitBytes(repositoryRoot, [
    "show", `${implementationCommit}:${attestationContract.generatedAnchorPath}`
  ]);
  validateExactSourceAnchor(
    new TextDecoder().decode(c0AnchorSource),
    "0".repeat(64),
    false,
    "bridge implementation anchor"
  );
  const head = requireGitObjectId(gitText(repositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"]), "HEAD");
  if (head !== deploymentCommit) throw new Error("current HEAD is not the deployment commit");
  if (gitText(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("qualification worktree is not clean");
  }
  const successorCommitCount = Number(gitText(repositoryRoot, [
    "rev-list", "--count", `${implementationCommit}..${deploymentCommit}`
  ]));
  if (successorCommitCount !== attestationContract.fullTrackedTreeIdentity.successorCommitCount) {
    throw new Error("deployment is not the required one-commit successor");
  }
  const deploymentParent = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${deploymentCommit}^1`]),
    "deployment parent"
  );
  if (deploymentParent !== implementationCommit) throw new Error("deployment parent is not the implementation commit");
  const rawNameStatus = gitText(repositoryRoot, [
    "diff", "--name-status", "--no-renames", implementationCommit, deploymentCommit
  ]);
  const implementationToDeploymentNameStatus = rawNameStatus === "" ? [] : rawNameStatus.split("\n").map((line) => {
    const [status, path, unexpected] = line.split("\t");
    if (!status || !path || unexpected !== undefined) throw new Error("successor diff is not canonical");
    return { status, path };
  });
  const expectedNameStatus = attestationContract.requiredImplementationToDeploymentDiff.map((path) => ({
    status: attestationContract.fullTrackedTreeIdentity.requiredNameStatus,
    path
  }));
  if (stableJson(implementationToDeploymentNameStatus) !== stableJson(expectedNameStatus)) {
    throw new Error("deployment successor diff is not anchor-only");
  }
  const implementationTreeObjectId = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${implementationCommit}^{tree}`]),
    "implementation tree"
  );
  const deploymentTreeObjectId = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${deploymentCommit}^{tree}`]),
    "deployment tree"
  );
  const liveBaseTreeObjectId = requireGitObjectId(
    gitText(repositoryRoot, ["rev-parse", "--verify", `${liveBaseCommit}^{tree}`]),
    "bridge live-base tree"
  );
  const implementationArchive = gitBytes(repositoryRoot, [
    "archive", `--format=${attestationContract.fullTrackedTreeIdentity.archiveFormat}`, implementationCommit
  ]);
  const deploymentArchive = gitBytes(repositoryRoot, [
    "archive", `--format=${attestationContract.fullTrackedTreeIdentity.archiveFormat}`, deploymentCommit
  ]);
  const implementationArchiveSha256 = sha256(implementationArchive);
  const deploymentArchiveSha256 = sha256(deploymentArchive);
  const sourceTreeAnchor = sha256(stableJson({
    version: attestationContract.sourceTreeIdentityVersion,
    bridgeFoundationVersion: bridgeFoundation.version,
    liveBaseCommit,
    liveBaseTreeObjectId,
    liveBaseToImplementationNameStatus,
    fullTreeIdentityVersion: attestationContract.fullTrackedTreeIdentity.version,
    implementationCommit,
    implementationTreeObjectId,
    implementationArchiveSha256,
    implementationArchiveBytes: implementationArchive.byteLength
  }));
  const buildInputRoot = sha256(stableJson({
    version: attestationContract.buildIdentity.version,
    deploymentCommit,
    deploymentTreeObjectId,
    deploymentArchiveSha256,
    deploymentArchiveBytes: deploymentArchive.byteLength
  }));
  return {
    liveBaseCommit,
    liveBaseTreeObjectId,
    liveBaseToImplementationNameStatus,
    implementationCommit,
    deploymentCommit,
    implementationTreeObjectId,
    deploymentTreeObjectId,
    implementationArchiveSha256,
    implementationArchiveBytes: implementationArchive.byteLength,
    deploymentArchiveSha256,
    deploymentArchiveBytes: deploymentArchive.byteLength,
    implementationToDeploymentNameStatus,
    implementationToDeploymentDiff: implementationToDeploymentNameStatus.map((entry) => entry.path),
    successorCommitCount,
    sourceTreeAnchor,
    buildInputRoot
  };
}

export function validateAuthorityBridgeCodeRelation(input: {
  authorityRepositoryRoot: string;
  authorityCommit: string;
  implementationRepositoryRoot: string;
  implementationCommit: string;
  relation?: { version: string; exactEqualPaths: string[] };
}): AuthorityBridgeCodeRelationEvidence {
  const relation = input.relation ?? attestationContract.authorityBridgeCodeRelation;
  if (
    typeof relation.version !== "string" || relation.version.length === 0 ||
    !Array.isArray(relation.exactEqualPaths) || relation.exactEqualPaths.length === 0 ||
    new Set(relation.exactEqualPaths).size !== relation.exactEqualPaths.length
  ) throw new Error("authority-to-bridge code relation contract is invalid");
  for (const path of relation.exactEqualPaths) {
    if (
      typeof path !== "string" || path.length === 0 || path.startsWith("/") ||
      path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
    ) throw new Error("authority-to-bridge code relation path is invalid");
  }
  const authorityCommit = requireGitObjectId(
    gitText(input.authorityRepositoryRoot, ["rev-parse", "--verify", `${input.authorityCommit}^{commit}`]),
    "authority code-relation commit"
  );
  const implementationCommit = requireGitObjectId(
    gitText(input.implementationRepositoryRoot, ["rev-parse", "--verify", `${input.implementationCommit}^{commit}`]),
    "bridge code-relation commit"
  );
  if (authorityCommit !== input.authorityCommit || implementationCommit !== input.implementationCommit) {
    throw new Error("authority-to-bridge code relation commit is not canonical");
  }
  const files = [...relation.exactEqualPaths].sort().map((path) => {
    const authorityBytes = gitBytes(input.authorityRepositoryRoot, ["show", `${authorityCommit}:${path}`]);
    const implementationBytes = gitBytes(input.implementationRepositoryRoot, ["show", `${implementationCommit}:${path}`]);
    const authorityHash = sha256(authorityBytes);
    if (
      authorityBytes.byteLength !== implementationBytes.byteLength ||
      authorityHash !== sha256(implementationBytes)
    ) throw new Error(`authority-to-bridge code mismatch: ${path}`);
    return { path, bytes: authorityBytes.byteLength, sha256: authorityHash };
  });
  const relationRoot = sha256(stableJson({
    version: relation.version,
    authorityCommit,
    implementationCommit,
    files
  }));
  return { version: relation.version, authorityCommit, implementationCommit, files, relationRoot };
}

export function validateAuthorityExecutionRoot(
  controllerRoot: string,
  authorityCommit: string
): AuthorityEvidence {
  const canonicalControllerRoot = realpathSync(controllerRoot);
  const gitRoot = realpathSync(gitText(canonicalControllerRoot, ["rev-parse", "--show-toplevel"]));
  const head = requireGitObjectId(
    gitText(canonicalControllerRoot, ["rev-parse", "--verify", "HEAD^{commit}"]),
    "controller HEAD"
  );
  if (gitRoot !== canonicalControllerRoot || head !== authorityCommit) {
    throw new Error("controller worktree is not the exact authority commit");
  }
  if (gitText(canonicalControllerRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("controller implementation worktree is not clean");
  }
  for (const path of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    if (existsSync(resolve(canonicalControllerRoot, path))) {
      throw new Error("controller worktree contains a prohibited credential input");
    }
  }
  const authorityTreeObjectId = requireGitObjectId(
    gitText(canonicalControllerRoot, ["rev-parse", "--verify", `${authorityCommit}^{tree}`]),
    "authority tree"
  );
  const authorityArchive = gitBytes(canonicalControllerRoot, [
    "archive", `--format=${attestationContract.fullTrackedTreeIdentity.archiveFormat}`, authorityCommit
  ]);
  const authorityArchiveSha256 = sha256(authorityArchive);
  return {
    authorityCommit,
    authorityTreeObjectId,
    authorityArchiveSha256,
    authorityArchiveBytes: authorityArchive.byteLength,
    authorityTreeRoot: sha256(stableJson({
      version: "os01-census-authority-tree.2026.1",
      authorityCommit,
      authorityTreeObjectId,
      authorityArchiveSha256,
      authorityArchiveBytes: authorityArchive.byteLength
    }))
  };
}

function localBuildEvidence(
  repositoryRoot: string,
  activeBuildGraph: {
    hash: string;
    sourceFilesScanned: number;
    buildFilesScanned: number;
  },
  compiledAnchorCarrierRoot: string,
  entryStaticClosure: { root: string; fileCount: number }
): LocalBuildEvidence {
  const distRootPath = resolve(repositoryRoot, attestationContract.buildIdentity.distPath);
  const records: Array<{ path: string; bytes: number; sha256: string }> = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name);
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) throw new Error("build output contains a symbolic link");
      if (metadata.isDirectory()) {
        visit(path);
      } else if (metadata.isFile()) {
        const relativePath = relative(distRootPath, path).split(sep).join("/");
        if (relativePath.startsWith("../") || relativePath === "") throw new Error("invalid build output path");
        const bytes = readFileSync(path);
        records.push({ path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) });
      } else {
        throw new Error("build output contains a non-file entry");
      }
    }
  };
  visit(distRootPath);
  if (records.length === 0) throw new Error("build output is empty");
  const builtWorkerPath = resolve(repositoryRoot, attestationContract.buildIdentity.builtWorkerPath);
  const builtWorkerRelative = relative(distRootPath, builtWorkerPath).split(sep).join("/");
  const builtWorker = records.find((entry) => entry.path === builtWorkerRelative);
  if (!builtWorker) throw new Error("built worker is absent from build output");
  return {
    builtWorkerHash: builtWorker.sha256,
    distRoot: sha256(stableJson(records)),
    archiveFileListRoot: sha256(stableJson(records.map((entry) => entry.path))),
    fileCount: records.length,
    activeBuildGraphHash: activeBuildGraph.hash,
    activeSourceFilesScanned: activeBuildGraph.sourceFilesScanned,
    activeBuildFilesScanned: activeBuildGraph.buildFilesScanned,
    compiledAnchorCarrierRoot,
    entryStaticClosureRoot: entryStaticClosure.root,
    entryStaticFileCount: entryStaticClosure.fileCount
  };
}

export function expectedAnchorSource(anchor: string, ready: boolean): string {
  return `// Qualification builds replace only this literal after the implementation
// commit is frozen. The production census route refuses to serve unless its
// control-plane binding matches this compiled value exactly.
export const OS01_CENSUS_SOURCE_ANCHOR =
  "${anchor}";
export const OS01_CENSUS_SOURCE_ANCHOR_READY = ${ready ? "true" : "false"};
`;
}

export function validateExactSourceAnchor(
  source: string,
  expectedSourceAnchor: string,
  expectedReady: boolean,
  label = "source anchor"
): void {
  if (source !== expectedAnchorSource(expectedSourceAnchor, expectedReady)) {
    throw new Error(`${label} file is not the frozen exact template`);
  }
}

export function expectedPackageManifest(repositoryRoot: string): PackageManifestEvidence {
  const records = new Map<string, { path: string; bytes: number; sha256: string }>();
  const addTree = (treeRoot: string, outputPrefix: string): void => {
    const visit = (directory: string): void => {
      for (const name of readdirSync(directory).sort()) {
        const path = resolve(directory, name);
        const metadata = lstatSync(path);
        if (metadata.isSymbolicLink()) throw new Error("package input contains a symbolic link");
        if (metadata.isDirectory()) visit(path);
        else if (metadata.isFile()) {
          const localPath = relative(treeRoot, path).split(sep).join("/");
          if (localPath.startsWith("../") || localPath === "") throw new Error("invalid package input path");
          const outputPath = outputPrefix === "" ? localPath : `${outputPrefix}/${localPath}`;
          const bytes = readFileSync(path);
          records.set(outputPath, { path: outputPath, bytes: bytes.byteLength, sha256: sha256(bytes) });
        } else {
          throw new Error("package input contains a non-file entry");
        }
      }
    };
    visit(treeRoot);
  };
  const distRoot = resolve(repositoryRoot, attestationContract.buildIdentity.distPath);
  addTree(distRoot, "");
  const hostingPath = resolve(repositoryRoot, ".openai/hosting.json");
  const hostingBytes = readFileSync(hostingPath);
  records.set(".openai/hosting.json", {
    path: ".openai/hosting.json",
    bytes: hostingBytes.byteLength,
    sha256: sha256(hostingBytes)
  });
  const drizzleRoot = resolve(repositoryRoot, "drizzle");
  if (existsSync(drizzleRoot)) addTree(drizzleRoot, ".openai/drizzle");
  const sorted = [...records.values()].sort((left, right) => left.path.localeCompare(right.path));
  for (const requiredPath of [
    "server/index.js",
    ".openai/hosting.json",
    ".openai/drizzle/meta/_journal.json"
  ]) {
    if (!sorted.some((entry) => entry.path === requiredPath)) {
      throw new Error(`package manifest omits ${requiredPath}`);
    }
  }
  return {
    contentRoot: sha256(stableJson(sorted)),
    fileListRoot: sha256(stableJson(sorted.map((entry) => entry.path))),
    fileCount: sorted.length
  };
}

export function verifyCensusEntryClosure(repositoryRoot: string): { root: string; fileCount: number } {
  const manifestPath = resolve(repositoryRoot, attestationContract.buildIdentity.serverManifestPath);
  const manifest = requireRecord(JSON.parse(readFileSync(manifestPath, "utf8")), "server build manifest");
  const entryKey = attestationContract.buildIdentity.requiredServerEntry;
  const entry = requireRecord(manifest[entryKey], "server build entry");
  if (entry.isEntry !== true || entry.src !== entryKey || typeof entry.file !== "string") {
    throw new Error("server build entry identity mismatch");
  }
  const directImports = Array.isArray(entry.imports) ? entry.imports : [];
  const directImportNames = directImports.map((key, index) => {
    if (typeof key !== "string") throw new Error(`server entry import ${index} is invalid`);
    const imported = requireRecord(manifest[key], `server entry import ${key}`);
    return requireString(imported.name, `server entry import ${key} name`);
  }).sort();
  if (stableJson(directImportNames) !== stableJson([...attestationContract.buildIdentity.requiredDirectStaticImportNames].sort())) {
    throw new Error("server entry static imports exceed the census bridge boundary");
  }
  const dynamicImports = Array.isArray(entry.dynamicImports) ? entry.dynamicImports : [];
  if (stableJson(dynamicImports) !== stableJson([attestationContract.buildIdentity.requiredDynamicEntry])) {
    throw new Error("server entry dynamic runtime boundary mismatch");
  }
  const dynamicEntry = requireRecord(
    manifest[attestationContract.buildIdentity.requiredDynamicEntry],
    "server dynamic runtime entry"
  );
  if (dynamicEntry.isDynamicEntry !== true || dynamicEntry.src !== attestationContract.buildIdentity.requiredDynamicEntry) {
    throw new Error("server dynamic runtime identity mismatch");
  }
  const staticKeys = new Set<string>();
  const pending = [entryKey];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (staticKeys.has(key)) continue;
    staticKeys.add(key);
    const record = requireRecord(manifest[key], `static server chunk ${key}`);
    if (Array.isArray(record.imports)) {
      for (const child of record.imports) {
        if (typeof child !== "string") throw new Error("static server import key is invalid");
        pending.push(child);
      }
    }
  }
  if (staticKeys.has(attestationContract.buildIdentity.requiredDynamicEntry)) {
    throw new Error("normal site runtime entered the static census closure");
  }
  const serverRoot = resolve(
    repositoryRoot,
    dirname(dirname(attestationContract.buildIdentity.serverManifestPath))
  );
  const records = [...staticKeys].sort().map((key) => {
    const record = requireRecord(manifest[key], `static server chunk ${key}`);
    const file = requireString(record.file, `static server chunk ${key} file`);
    const path = resolve(serverRoot, file);
    if (!path.startsWith(`${serverRoot}${sep}`)) throw new Error("static server chunk escapes build root");
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("static server chunk is not a regular file");
    const bytes = readFileSync(path);
    for (const marker of attestationContract.buildIdentity.forbiddenStaticMarkers) {
      if (bytes.includes(Buffer.from(marker, "utf8"))) {
        throw new Error(`static census closure contains forbidden marker: ${marker}`);
      }
    }
    return { key, file, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
  return { root: sha256(stableJson(records)), fileCount: records.length };
}

export function freshBuildEvidence(
  repositoryRoot: string,
  expectedCommit: string,
  label: string,
  expectedSourceAnchor: string,
  expectedReady: boolean
): LocalBuildEvidence {
  const canonicalRoot = realpathSync(repositoryRoot);
  const gitRoot = realpathSync(gitText(canonicalRoot, ["rev-parse", "--show-toplevel"]));
  if (gitRoot !== canonicalRoot) throw new Error(`${label} worktree root is not canonical`);
  const head = requireGitObjectId(gitText(canonicalRoot, ["rev-parse", "--verify", "HEAD^{commit}"]), `${label} HEAD`);
  if (head !== expectedCommit) throw new Error(`${label} worktree is at the wrong commit`);
  if (gitText(canonicalRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error(`${label} worktree is not clean`);
  }
  const prohibitedBuildInputs = [".env", ".env.local", ".env.production", ".env.production.local"];
  if (prohibitedBuildInputs.some((path) => existsSync(resolve(canonicalRoot, path)))) {
    throw new Error(`${label} worktree contains a prohibited untracked build input`);
  }
  const anchorSource = readFileSync(resolve(canonicalRoot, attestationContract.generatedAnchorPath), "utf8");
  validateExactSourceAnchor(anchorSource, expectedSourceAnchor, expectedReady, `${label} source anchor`);
  const distPath = resolve(canonicalRoot, attestationContract.buildIdentity.distPath);
  if (!distPath.startsWith(`${canonicalRoot}${sep}`)) throw new Error(`${label} dist path escapes its worktree`);
  rmSync(distPath, { recursive: true, force: true });
  execFileSync(resolve(canonicalRoot, "node_modules/.bin/vinext"), ["build"], {
    cwd: canonicalRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      NODE_ENV: "production",
      CI: "1",
      WRANGLER_LOG_PATH: ".wrangler/wrangler.log"
    }
  });
  if (gitText(canonicalRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error(`${label} build changed tracked or untracked source state`);
  }
  const activeBuildGraphBytes = execFileSync("/usr/bin/python3", [
    resolve(canonicalRoot, "scripts/verify_active_build_graph.py"),
    "--repo-root", canonicalRoot,
    "--build-root", distPath,
    "--json"
  ], {
    cwd: canonicalRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: "/usr/bin:/bin", NODE_ENV: "production", PYTHONNOUSERSITE: "1" }
  });
  const activeBuildGraph = requireRecord(JSON.parse(activeBuildGraphBytes), `${label} active build graph`);
  exactKeys(activeBuildGraph, ["buildFilesScanned", "errors", "sourceFilesScanned", "status"], `${label} active build graph`);
  if (activeBuildGraph.status !== "pass" || !Array.isArray(activeBuildGraph.errors) || activeBuildGraph.errors.length !== 0) {
    throw new Error(`${label} active build graph failed`);
  }
  const sourceFilesScanned = requireSafeInteger(activeBuildGraph.sourceFilesScanned, `${label} active source files`, 1);
  const buildFilesScanned = requireSafeInteger(activeBuildGraph.buildFilesScanned, `${label} active build files`, 1);
  const distPathRoot = resolve(canonicalRoot, attestationContract.buildIdentity.distPath);
  const builtWorkerPath = resolve(canonicalRoot, attestationContract.buildIdentity.builtWorkerPath);
  const builtWorkerBytes = readFileSync(builtWorkerPath);
  if (!builtWorkerBytes.includes(Buffer.from(expectedSourceAnchor, "utf8"))) {
    throw new Error(`${label} compiled worker entry omits the source anchor`);
  }
  if (expectedReady && builtWorkerBytes.includes(Buffer.from("0".repeat(64), "utf8"))) {
    throw new Error(`${label} compiled worker entry retains the unready placeholder`);
  }
  const entryCarrier = {
    path: relative(distPathRoot, builtWorkerPath).split(sep).join("/"),
    sha256: sha256(builtWorkerBytes),
    sourceAnchor: expectedSourceAnchor,
    ready: expectedReady
  };
  const entryStaticClosure = verifyCensusEntryClosure(canonicalRoot);
  return localBuildEvidence(canonicalRoot, {
    hash: sha256(activeBuildGraphBytes),
    sourceFilesScanned,
    buildFilesScanned
  }, sha256(stableJson(entryCarrier)), entryStaticClosure);
}

export function computeSourceAnchor(
  gitEvidence: Pick<GitSuccessorEvidence, "sourceTreeAnchor">,
  implementationBuild: LocalBuildEvidence,
  authorityEvidence: AuthorityEvidence,
  authorityBridgeCodeRelation: AuthorityBridgeCodeRelationEvidence
): string {
  return sha256(stableJson({
    version: attestationContract.sourceAnchorInputVersion,
    authorityEvidence,
    authorityBridgeCodeRelation,
    sourceTreeAnchor: gitEvidence.sourceTreeAnchor,
    implementationBuild
  }));
}

export function prepareSourceAnchorEvidence(input: {
  authorityRepositoryRoot: string;
  authorityCommit: string;
  implementationRepositoryRoots: readonly [string, string];
  implementationCommit: string;
}): {
  authorityEvidence: AuthorityEvidence;
  authorityBridgeCodeRelation: AuthorityBridgeCodeRelationEvidence;
  bridgeImplementation: BridgeImplementationEvidence;
  implementationBuild: LocalBuildEvidence;
  sourceAnchor: string;
} {
  const authorityEvidence = validateAuthorityExecutionRoot(
    input.authorityRepositoryRoot,
    input.authorityCommit
  );
  const [firstRoot, secondRoot] = input.implementationRepositoryRoots
    .map((path) => realpathSync(path)) as [string, string];
  if (firstRoot === secondRoot) throw new Error("implementation reproducibility worktrees must be distinct");
  const firstBridge = validateBridgeImplementation(firstRoot, input.implementationCommit);
  const secondBridge = validateBridgeImplementation(secondRoot, input.implementationCommit);
  if (stableJson(firstBridge) !== stableJson(secondBridge)) {
    throw new Error("independent bridge implementation evidence differs");
  }
  const authorityBridgeCodeRelation = validateAuthorityBridgeCodeRelation({
    authorityRepositoryRoot: input.authorityRepositoryRoot,
    authorityCommit: input.authorityCommit,
    implementationRepositoryRoot: firstRoot,
    implementationCommit: input.implementationCommit
  });
  const placeholderAnchor = "0".repeat(64);
  const firstBuild = freshBuildEvidence(
    firstRoot,
    input.implementationCommit,
    "first C0 preparation build",
    placeholderAnchor,
    false
  );
  const secondBuild = freshBuildEvidence(
    secondRoot,
    input.implementationCommit,
    "second C0 preparation build",
    placeholderAnchor,
    false
  );
  if (stableJson(firstBuild) !== stableJson(secondBuild)) {
    throw new Error("independent C0 preparation build manifests differ");
  }
  return {
    authorityEvidence,
    authorityBridgeCodeRelation,
    bridgeImplementation: firstBridge,
    implementationBuild: firstBuild,
    sourceAnchor: computeSourceAnchor(
      firstBridge,
      firstBuild,
      authorityEvidence,
      authorityBridgeCodeRelation
    )
  };
}

export function validateHostedSourceIdentity(input: {
  sourceIdentity: Record<string, unknown>;
  gitEvidence: GitSuccessorEvidence;
  implementationBuild: LocalBuildEvidence;
  authorityEvidence: AuthorityEvidence;
  authorityBridgeCodeRelation: AuthorityBridgeCodeRelationEvidence;
}): string {
  const qualifiedSourceAnchor = computeSourceAnchor(
    input.gitEvidence,
    input.implementationBuild,
    input.authorityEvidence,
    input.authorityBridgeCodeRelation
  );
  const expectedSourceIdentity = {
    authorityEvidence: input.authorityEvidence,
    authorityBridgeCodeRelation: input.authorityBridgeCodeRelation,
    fullTreeIdentityVersion: attestationContract.fullTrackedTreeIdentity.version,
    liveBaseCommit: input.gitEvidence.liveBaseCommit,
    liveBaseTreeObjectId: input.gitEvidence.liveBaseTreeObjectId,
    liveBaseToImplementationNameStatus: input.gitEvidence.liveBaseToImplementationNameStatus,
    implementationCommit: input.gitEvidence.implementationCommit,
    deploymentCommit: input.gitEvidence.deploymentCommit,
    implementationTreeObjectId: input.gitEvidence.implementationTreeObjectId,
    deploymentTreeObjectId: input.gitEvidence.deploymentTreeObjectId,
    implementationArchiveSha256: input.gitEvidence.implementationArchiveSha256,
    implementationArchiveBytes: input.gitEvidence.implementationArchiveBytes,
    deploymentArchiveSha256: input.gitEvidence.deploymentArchiveSha256,
    deploymentArchiveBytes: input.gitEvidence.deploymentArchiveBytes,
    implementationToDeploymentNameStatus: input.gitEvidence.implementationToDeploymentNameStatus,
    successorCommitCount: input.gitEvidence.successorCommitCount,
    sourceTreeAnchor: input.gitEvidence.sourceTreeAnchor,
    implementationBuild: input.implementationBuild,
    sourceAnchor: qualifiedSourceAnchor,
    buildInputRoot: input.gitEvidence.buildInputRoot
  };
  if (stableJson(input.sourceIdentity) !== stableJson(expectedSourceIdentity)) {
    throw new Error("deployment proof full-tree identity mismatch");
  }
  return qualifiedSourceAnchor;
}

export function validateDeploymentProofFreshness(observedAt: unknown, nowMs = Date.now()): void {
  if (typeof observedAt !== "string") throw new Error("deployment proof observation time is invalid");
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs)) {
    throw new Error("deployment proof observation time is invalid");
  }
  const ageMs = nowMs - observedMs;
  if (ageMs > attestationContract.deploymentProofFreshness.maximumAgeSeconds * 1000) {
    throw new Error("deployment proof observation is stale");
  }
  if (ageMs < -attestationContract.deploymentProofFreshness.maximumFutureSkewSeconds * 1000) {
    throw new Error("deployment proof observation is too far in the future");
  }
}

export function validateSitesDeploymentIdentity(input: {
  proof: Record<string, unknown>;
  target: TrustedTarget;
  deploymentCommit: string;
  deploymentVersion: string;
  nowMs?: number;
}): Record<string, unknown> {
  const sitesVersion = requireRecord(input.proof.sitesVersion, "Sites version proof");
  exactKeys(sitesVersion, [
    "archiveContentHash", "archiveFileCount", "archiveFormat", "archiveSizeBytes",
    "sourceCommit", "versionId", "versionNumber"
  ], "Sites version proof");
  if (
    sitesVersion.sourceCommit !== input.deploymentCommit ||
    sitesVersion.versionId !== input.deploymentVersion ||
    !new RegExp(`^${attestationContract.buildIdentity.sitesArchiveHashPrefix}[a-f0-9]{64}$`, "u")
      .test(requireString(sitesVersion.archiveContentHash, "Sites archive content hash"))
  ) throw new Error("Sites version binding mismatch");
  if (requireString(sitesVersion.archiveFormat, "Sites archive format") !== attestationContract.buildIdentity.sitesArchiveFormat) {
    throw new Error("Sites archive format mismatch");
  }
  requireString(sitesVersion.versionId, "Sites version id");
  requireSafeInteger(sitesVersion.versionNumber, "Sites version number", 1);
  requireSafeInteger(sitesVersion.archiveFileCount, "Sites archive file count", 1);
  requireSafeInteger(sitesVersion.archiveSizeBytes, "Sites archive size bytes", 1);

  const deployment = requireRecord(input.proof.deployment, "Sites deployment proof");
  exactKeys(deployment, [
    "accessPolicyRevision", "deploymentId", "environmentRevision", "origin", "status", "versionId"
  ], "Sites deployment proof");
  if (
    deployment.status !== "succeeded" || deployment.versionId !== sitesVersion.versionId ||
    deployment.origin !== input.target.origin
  ) throw new Error("Sites deployment state mismatch");
  requireString(deployment.deploymentId, "Sites deployment id");
  requireSafeInteger(deployment.environmentRevision, "Sites environment revision", 1);
  requireSafeInteger(deployment.accessPolicyRevision, "Sites access policy revision", 1);
  if (requireString(input.proof.projectId, "Sites project id") !== input.target.projectId) {
    throw new Error("Sites project is not the trusted census target");
  }
  validateDeploymentProofFreshness(input.proof.observedAt, input.nowMs ?? Date.now());
  return sitesVersion;
}

export function validateArchivePackageBinding(input: {
  archive: LocalArchiveEvidence;
  packageManifest: PackageManifestEvidence;
  proofBuild: Record<string, unknown>;
}): void {
  const localArchiveBytes = requireSafeInteger(
    input.proofBuild.localArchiveBytes,
    "local deployment archive bytes",
    1
  );
  const localArchiveFileCount = requireSafeInteger(
    input.proofBuild.localArchiveFileCount,
    "local deployment archive file count",
    1
  );
  const packageFileCount = requireSafeInteger(
    input.proofBuild.packageFileCount,
    "deployment package file count",
    1
  );
  if (
    input.proofBuild.localArchiveSha256 !== input.archive.archiveSha256 ||
    localArchiveBytes !== input.archive.archiveBytes ||
    input.proofBuild.localArchiveFileListRoot !== input.archive.fileListRoot ||
    input.proofBuild.localArchiveContentRoot !== input.archive.contentRoot ||
    input.proofBuild.packageContentRoot !== input.packageManifest.contentRoot ||
    input.proofBuild.packageFileListRoot !== input.packageManifest.fileListRoot ||
    packageFileCount !== input.packageManifest.fileCount ||
    input.archive.contentRoot !== input.packageManifest.contentRoot ||
    input.archive.fileListRoot !== input.packageManifest.fileListRoot ||
    localArchiveFileCount !== input.archive.fileCount ||
    localArchiveFileCount !== packageFileCount
  ) throw new Error("deployment archive and package manifest mismatch");
}

export function localArchiveEvidence(path: string): LocalArchiveEvidence {
  const canonicalPath = realpathSync(path);
  const bytes = readStableFile(canonicalPath, MAX_DEPLOYMENT_ARCHIVE_BYTES, "deployment archive");
  const inspectionBytes = execFileSync("/usr/bin/python3", [
    resolve(root, "scripts/inspect_site_archive.py"),
    "--stdin"
  ], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    input: bytes,
    env: { PATH: "/usr/bin:/bin", NODE_ENV: "production", PYTHONNOUSERSITE: "1" }
  });
  const inspection = requireRecord(JSON.parse(inspectionBytes), "deployment archive inspection");
  exactKeys(inspection, ["records"], "deployment archive inspection");
  if (!Array.isArray(inspection.records) || inspection.records.length === 0) {
    throw new Error("deployment archive content manifest is empty");
  }
  const records = inspection.records.map((value, index) => {
    const record = requireRecord(value, `deployment archive record ${index}`);
    exactKeys(record, ["bytes", "path", "sha256"], `deployment archive record ${index}`);
    return {
      path: requireString(record.path, `deployment archive record ${index} path`),
      bytes: requireSafeInteger(record.bytes, `deployment archive record ${index} bytes`, 0),
      sha256: requireHex(record.sha256, `deployment archive record ${index} hash`)
    };
  });
  return {
    archiveSha256: sha256(bytes),
    archiveBytes: bytes.byteLength,
    fileListRoot: sha256(stableJson(records.map((entry) => entry.path))),
    contentRoot: sha256(stableJson(records)),
    fileCount: records.length
  };
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalArgument(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

type QualificationPaths = {
  directory: string;
  deploymentProof: string;
  deploymentArchive: string;
  output: string;
};

export function resolveQualificationPaths(directoryInput: string): QualificationPaths {
  if (!["--deployment-proof", "--deployment-archive", "--output"].every((name) => !process.argv.includes(name))) {
    throw new Error("caller-controlled qualification file paths are prohibited");
  }
  const requestedDirectory = resolve(directoryInput);
  const directoryMetadata = lstatSync(requestedDirectory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    throw new Error("qualification directory must be a non-symlink directory");
  }
  const directory = realpathSync(requestedDirectory);
  const deploymentProof = resolve(directory, "deployment-proof.json");
  const deploymentArchive = resolve(directory, "deployment.tar.gz");
  const output = resolve(directory, "census-receipt.json");
  for (const [label, path] of [
    ["deployment proof", deploymentProof],
    ["deployment archive", deploymentArchive]
  ] as const) {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(path) !== path || dirname(path) !== directory) {
      throw new Error(`${label} must be a canonical non-symlink regular file in the qualification directory`);
    }
  }
  if (existsSync(output)) throw new Error("qualification receipt path already exists");
  return { directory, deploymentProof, deploymentArchive, output };
}

export function configuredTrustedTarget(targetName: string): TrustedTarget {
  const configured = trustedTargetContract.targets[targetName];
  if (!configured || !configured.enabled || configured.origin === null) {
    throw new Error("trusted census target is unavailable");
  }
  const origin = new URL(configured.origin);
  if (
    configured.origin !== origin.origin || origin.protocol !== "https:" || origin.port !== "" ||
    origin.pathname !== "/" || origin.search !== "" || origin.hash !== "" ||
    origin.username !== "" || origin.password !== ""
  ) throw new Error("trusted census target configuration is invalid");
  return {
    name: targetName,
    projectId: configured.projectId,
    origin: origin.origin,
    accessMode: configured.accessMode,
    loopbackFixture: false
  };
}

function resolveTrustedTarget(): TrustedTarget {
  if (process.argv.includes("--expected-origin")) throw new Error("caller-controlled census origins are prohibited");
  const loopbackAllowed = process.argv.includes("--allow-loopback-http");
  const loopbackOriginInput = optionalArgument("--test-loopback-origin");
  const targetName = optionalArgument("--target");
  if (loopbackAllowed || loopbackOriginInput !== null) {
    if (!loopbackAllowed || loopbackOriginInput === null || targetName !== null) {
      throw new Error("loopback fixture target arguments are incomplete or conflicting");
    }
    const origin = new URL(loopbackOriginInput);
    if (
      origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.port === "" ||
      origin.pathname !== "/" || origin.search !== "" || origin.hash !== "" ||
      origin.username !== "" || origin.password !== "" || loopbackOriginInput !== origin.origin
    ) throw new Error("loopback fixture origin is invalid");
    return {
      name: "loopback_fixture",
      projectId: "test-project",
      origin: origin.origin,
      accessMode: "explicit_loopback_fixture",
      loopbackFixture: true
    };
  }
  if (targetName === null) throw new Error("--target is required");
  return configuredTrustedTarget(targetName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${context} is not an object`);
  return value;
}

function requireHex(value: unknown, context: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${context} is not a sha256 hex value`);
  }
  return value;
}

function requireSafeInteger(value: unknown, context: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${context} is not a bounded safe integer`);
  }
  return Number(value);
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${context} is not a string`);
  return value;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], context: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (stableJson(actual) !== stableJson(expected)) throw new Error(`${context} contains unexpected fields`);
}

function readSecretInput(expectedOriginInput: string): SecretInput {
  const raw = readBoundedStdin(MAX_SECRET_INPUT_BYTES);
  const value = JSON.parse(raw) as Record<string, unknown>;
  const allowed = value.siteAuthorizationToken === undefined
    ? ["endpoint", "censusToken"]
    : ["endpoint", "censusToken", "siteAuthorizationToken"];
  exactKeys(value, allowed, "secret input");
  const loopbackAllowed = process.argv.includes("--allow-loopback-http");
  let endpointAllowed = false;
  if (typeof value.endpoint === "string") {
    try {
      const expectedOrigin = new URL(expectedOriginInput);
      const endpoint = new URL(value.endpoint);
      const expectedIsLoopback = expectedOrigin.protocol === "http:" && expectedOrigin.hostname === "127.0.0.1";
      const productionShape = expectedOrigin.protocol === "https:" && expectedOrigin.port === "";
      const loopbackShape = loopbackAllowed && expectedIsLoopback && expectedOrigin.port !== "";
      endpointAllowed =
        expectedOriginInput === expectedOrigin.origin &&
        (productionShape || loopbackShape) &&
        endpoint.origin === expectedOrigin.origin &&
        endpoint.pathname === contract.route &&
        endpoint.search === "" && endpoint.hash === "" &&
        endpoint.username === "" && endpoint.password === "" &&
        ((productionShape && endpoint.protocol === "https:" && endpoint.port === "") ||
          (loopbackShape && endpoint.protocol === "http:" && endpoint.hostname === "127.0.0.1"));
    } catch {
      endpointAllowed = false;
    }
  }
  if (
    !endpointAllowed ||
    typeof value.censusToken !== "string" || !/^[a-f0-9]{64}$/u.test(value.censusToken) ||
    (value.siteAuthorizationToken !== undefined && typeof value.siteAuthorizationToken !== "string")
  ) throw new Error("invalid secret input");
  return value as SecretInput;
}

export function migrationStages(): ExpectedStages {
  const journal = JSON.parse(readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const requiredTags = [
    "0016_engine_os_interim_scheduler",
    "0017_engine_os_source_capture",
    "0018_engine_os_forecast_ledger",
    "0019_engine_os_schema_closure",
    "0020_engine_os_plays_reconciliation"
  ];
  const indexes = Object.fromEntries(requiredTags.map((tag) => {
    const index = journal.entries.findIndex((entry) => entry.tag === tag);
    if (index < 0) throw new Error(`missing migration ${tag}`);
    return [tag, index];
  })) as Record<string, number>;
  const migrationByteHashes = journal.entries.map((entry) => {
    const path = resolve(root, `drizzle/${entry.tag}.sql`);
    return { tag: entry.tag, sha256: sha256(readFileSync(path)) };
  });
  function replayTo(tag: string): {
    manifest: CommittedManifest;
    autoindexes: Array<{ name: string; tableName: string; sqlIsNull: true; sqlHash: string }>;
  } {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    const terminal = indexes[tag]!;
    for (let index = 0; index <= terminal; index += 1) {
      const entry = journal.entries[index]!;
      database.exec(readFileSync(resolve(root, `drizzle/${entry.tag}.sql`), "utf8"));
    }
    const migrationSetHash = sha256(stableJson(migrationByteHashes.slice(0, terminal + 1)));
    const manifest = buildPhysicalManifest(database, migrationSetHash);
    const autoindexes = database.prepare(`SELECT name, tbl_name AS tableName, sql
      FROM sqlite_schema
      WHERE type = 'index' AND name LIKE 'sqlite_autoindex_%'
      ORDER BY name`).all().map((row) => {
      const candidate = row as { name: unknown; tableName: unknown; sql: unknown };
      if (typeof candidate.name !== "string" || typeof candidate.tableName !== "string" || candidate.sql !== null) {
        throw new Error("migration replay produced an invalid SQLite autoindex");
      }
      return { name: candidate.name, tableName: candidate.tableName, sqlIsNull: true as const, sqlHash: emptySqlHash };
    });
    database.close();
    return { manifest, autoindexes };
  }
  const stage16 = replayTo(requiredTags[0]!);
  const stage17 = replayTo(requiredTags[1]!);
  const stage18 = replayTo(requiredTags[2]!);
  const stage19 = replayTo(requiredTags[3]!);
  const stage20 = replayTo(requiredTags[4]!);
  const through18AutoindexNames = new Set(stage18.autoindexes.map((entry) => entry.name));
  return {
    through0016: stage16.manifest,
    through0017: stage17.manifest,
    through0018: stage18.manifest,
    through0019: stage19.manifest,
    through0020: stage20.manifest,
    autoindexes: {
      through0016: stage16.autoindexes,
      added0019: stage19.autoindexes.filter((entry) => !through18AutoindexNames.has(entry.name))
    },
    migrationByteHashes
  };
}

function validateDeploymentProof(input: {
  path: string;
  target: TrustedTarget;
  authorityRepositoryRoot: string;
  implementationRepositoryRoots: readonly [string, string];
  repositoryRoots: readonly [string, string];
  archivePath: string;
  authorityEvidence: AuthorityEvidence | null;
  expectedBuildAttestation: string;
  expectedImplementationCommit: string;
  sourceCommit: string;
  deploymentVersion: string;
}): { proof: Record<string, unknown>; proofHash: string; gitEvidence: GitSuccessorEvidence | null } {
  const bytes = readStableFile(input.path, MAX_DEPLOYMENT_PROOF_BYTES, "deployment proof");
  const proof = requireRecord(JSON.parse(new TextDecoder().decode(bytes)), "deployment proof");
  exactKeys(proof, [
    "build",
    "deployment",
    "deploymentCommit",
    "implementationCommit",
    "implementationToDeploymentDiff",
    "observedAt",
    "projectId",
    "sitesVersion",
    "sourceAnchor",
    "sourceIdentity",
    "status",
    "version"
  ], "deployment proof");
  if (proof.version !== attestationContract.deploymentProofVersion || proof.status !== attestationContract.deploymentProofStatus) {
    throw new Error("deployment proof contract mismatch");
  }
  const implementationCommit = requireString(proof.implementationCommit, "implementation commit");
  const deploymentCommit = requireString(proof.deploymentCommit, "deployment commit");
  if (!/^[a-f0-9]{40}$/u.test(implementationCommit) || !/^[a-f0-9]{40}$/u.test(deploymentCommit)) {
    throw new Error("deployment proof commit is invalid");
  }
  if (implementationCommit !== input.expectedImplementationCommit) {
    throw new Error("deployment proof implementation commit mismatch");
  }
  if (deploymentCommit !== input.sourceCommit || implementationCommit === deploymentCommit) {
    throw new Error("deployment proof commit binding mismatch");
  }
  if (stableJson(proof.implementationToDeploymentDiff) !== stableJson(attestationContract.requiredImplementationToDeploymentDiff)) {
    throw new Error("deployment proof successor diff mismatch");
  }
  const sourceIdentity = requireRecord(proof.sourceIdentity, "deployment source identity");
  exactKeys(sourceIdentity, [
    "authorityBridgeCodeRelation",
    "authorityEvidence",
    "buildInputRoot",
    "deploymentArchiveBytes",
    "deploymentArchiveSha256",
    "deploymentCommit",
    "deploymentTreeObjectId",
    "fullTreeIdentityVersion",
    "implementationArchiveBytes",
    "implementationArchiveSha256",
    "implementationCommit",
    "implementationToDeploymentNameStatus",
    "implementationTreeObjectId",
    "implementationBuild",
    "liveBaseCommit",
    "liveBaseToImplementationNameStatus",
    "liveBaseTreeObjectId",
    "sourceAnchor",
    "sourceTreeAnchor",
    "successorCommitCount"
  ], "deployment source identity");
  const primaryRepositoryRoot = input.repositoryRoots[0];
  const gitEvidence = input.target.loopbackFixture
    ? null
    : validateGitSuccessor(primaryRepositoryRoot, implementationCommit, deploymentCommit);
  let authorityBridgeCodeRelation: AuthorityBridgeCodeRelationEvidence | null = null;
  let implementationBuild: LocalBuildEvidence | null = null;
  if (gitEvidence !== null) {
    if (input.authorityEvidence === null) throw new Error("hosted census authority evidence is absent");
    authorityBridgeCodeRelation = validateAuthorityBridgeCodeRelation({
      authorityRepositoryRoot: input.authorityRepositoryRoot,
      authorityCommit: input.authorityEvidence.authorityCommit,
      implementationRepositoryRoot: primaryRepositoryRoot,
      implementationCommit
    });
    const [firstRoot, secondRoot] = input.implementationRepositoryRoots
      .map((path) => realpathSync(path)) as [string, string];
    if (firstRoot === secondRoot) throw new Error("implementation reproducibility worktrees must be distinct");
    const placeholderAnchor = "0".repeat(64);
    const firstBuild = freshBuildEvidence(firstRoot, implementationCommit, "first C0 build", placeholderAnchor, false);
    const secondBuild = freshBuildEvidence(secondRoot, implementationCommit, "second C0 build", placeholderAnchor, false);
    if (stableJson(firstBuild) !== stableJson(secondBuild)) {
      throw new Error("independent C0 build manifests differ");
    }
    implementationBuild = firstBuild;
  }
  if (gitEvidence !== null) {
    validateHostedSourceIdentity({
      sourceIdentity,
      gitEvidence,
      implementationBuild: implementationBuild!,
      authorityEvidence: input.authorityEvidence!,
      authorityBridgeCodeRelation: authorityBridgeCodeRelation!
    });
  } else {
    const loopbackAuthority = requireRecord(sourceIdentity.authorityEvidence, "loopback authority evidence");
    exactKeys(loopbackAuthority, [
      "authorityArchiveBytes", "authorityArchiveSha256", "authorityCommit",
      "authorityTreeObjectId", "authorityTreeRoot"
    ], "loopback authority evidence");
    requireGitObjectId(requireString(loopbackAuthority.authorityCommit, "authority commit"), "authority commit");
    requireGitObjectId(requireString(loopbackAuthority.authorityTreeObjectId, "authority tree"), "authority tree");
    requireHex(loopbackAuthority.authorityArchiveSha256, "authority archive hash");
    requireHex(loopbackAuthority.authorityTreeRoot, "authority tree root");
    requireSafeInteger(loopbackAuthority.authorityArchiveBytes, "authority archive bytes", 1);
    const loopbackCodeRelation = requireRecord(
      sourceIdentity.authorityBridgeCodeRelation,
      "loopback authority-to-bridge code relation"
    );
    exactKeys(loopbackCodeRelation, [
      "authorityCommit", "files", "implementationCommit", "relationRoot", "version"
    ], "loopback authority-to-bridge code relation");
    if (
      loopbackCodeRelation.version !== attestationContract.authorityBridgeCodeRelation.version ||
      loopbackCodeRelation.authorityCommit !== loopbackAuthority.authorityCommit ||
      loopbackCodeRelation.implementationCommit !== implementationCommit ||
      !Array.isArray(loopbackCodeRelation.files) ||
      loopbackCodeRelation.files.length !== attestationContract.authorityBridgeCodeRelation.exactEqualPaths.length
    ) throw new Error("loopback authority-to-bridge code relation mismatch");
    requireHex(loopbackCodeRelation.relationRoot, "loopback authority-to-bridge relation root");
    const loopbackRelationPaths = loopbackCodeRelation.files.map((value, index) => {
      const file = requireRecord(value, `loopback authority-to-bridge file ${index}`);
      exactKeys(file, ["bytes", "path", "sha256"], `loopback authority-to-bridge file ${index}`);
      requireSafeInteger(file.bytes, `loopback authority-to-bridge file ${index} bytes`, 1);
      requireHex(file.sha256, `loopback authority-to-bridge file ${index} hash`);
      return requireString(file.path, `loopback authority-to-bridge file ${index} path`);
    });
    if (stableJson(loopbackRelationPaths) !== stableJson(
      [...attestationContract.authorityBridgeCodeRelation.exactEqualPaths].sort()
    )) throw new Error("loopback authority-to-bridge code relation paths mismatch");
    if (
      sourceIdentity.fullTreeIdentityVersion !== attestationContract.fullTrackedTreeIdentity.version ||
      sourceIdentity.liveBaseCommit !== attestationContract.bridgeFoundation.liveBaseCommit ||
      stableJson(sourceIdentity.liveBaseToImplementationNameStatus) !== stableJson(
        attestationContract.bridgeFoundation.requiredLiveBaseToImplementationNameStatus
      ) ||
      sourceIdentity.implementationCommit !== implementationCommit ||
      sourceIdentity.deploymentCommit !== deploymentCommit ||
      sourceIdentity.sourceTreeAnchor === sourceIdentity.sourceAnchor ||
      stableJson(sourceIdentity.implementationToDeploymentNameStatus) !== stableJson(
        attestationContract.requiredImplementationToDeploymentDiff.map((path) => ({
          status: attestationContract.fullTrackedTreeIdentity.requiredNameStatus,
          path
        }))
      ) ||
      Number(sourceIdentity.successorCommitCount) !== attestationContract.fullTrackedTreeIdentity.successorCommitCount
    ) throw new Error("loopback deployment source identity mismatch");
    requireGitObjectId(requireString(sourceIdentity.implementationTreeObjectId, "implementation tree"), "implementation tree");
    requireGitObjectId(requireString(sourceIdentity.deploymentTreeObjectId, "deployment tree"), "deployment tree");
    requireGitObjectId(requireString(sourceIdentity.liveBaseTreeObjectId, "live-base tree"), "live-base tree");
    for (const key of [
      "implementationArchiveSha256", "deploymentArchiveSha256", "sourceTreeAnchor", "sourceAnchor", "buildInputRoot"
    ] as const) requireHex(sourceIdentity[key], `deployment source identity ${key}`);
    const loopbackImplementationBuild = requireRecord(sourceIdentity.implementationBuild, "loopback implementation build");
    exactKeys(loopbackImplementationBuild, [
      "activeBuildFilesScanned", "activeBuildGraphHash", "activeSourceFilesScanned",
      "archiveFileListRoot", "builtWorkerHash", "compiledAnchorCarrierRoot", "distRoot",
      "entryStaticClosureRoot", "entryStaticFileCount", "fileCount"
    ], "loopback implementation build");
    for (const key of [
      "activeBuildGraphHash", "archiveFileListRoot", "builtWorkerHash", "compiledAnchorCarrierRoot", "distRoot",
      "entryStaticClosureRoot"
    ] as const) {
      requireHex(loopbackImplementationBuild[key], `loopback implementation build ${key}`);
    }
    requireSafeInteger(loopbackImplementationBuild.fileCount, "loopback implementation build file count", 1);
    requireSafeInteger(loopbackImplementationBuild.activeSourceFilesScanned, "loopback active source files", 1);
    requireSafeInteger(loopbackImplementationBuild.activeBuildFilesScanned, "loopback active build files", 1);
    requireSafeInteger(loopbackImplementationBuild.entryStaticFileCount, "loopback entry static files", 1);
    requireSafeInteger(sourceIdentity.implementationArchiveBytes, "implementation archive bytes", 1);
    requireSafeInteger(sourceIdentity.deploymentArchiveBytes, "deployment archive bytes", 1);
  }
  const qualifiedSourceAnchor = requireHex(sourceIdentity.sourceAnchor, "deployment source anchor");
  if (
    proof.sourceAnchor !== qualifiedSourceAnchor ||
    !equalHex(qualifiedSourceAnchor, input.expectedBuildAttestation)
  ) throw new Error("deployment proof source anchor mismatch");

  const sitesVersion = validateSitesDeploymentIdentity({
    proof,
    target: input.target,
    deploymentCommit,
    deploymentVersion: input.deploymentVersion
  });

  const build = requireRecord(proof.build, "deployment build proof");
  exactKeys(build, [
    "activeBuildFilesScanned", "activeBuildGraphHash", "activeSourceFilesScanned",
    "buildInputRoot", "builtWorkerHash", "compiledAnchorCarrierRoot", "distFileCount", "distFileListRoot", "distRoot",
    "entryStaticClosureRoot", "entryStaticFileCount",
    "localArchiveBytes", "localArchiveFileCount", "localArchiveFileListRoot", "localArchiveFormat",
    "localArchiveContentRoot", "localArchiveSha256", "packageContentRoot", "packageFileCount",
    "packageFileListRoot", "sitesArchiveContentHash"
  ], "deployment build proof");
  for (const key of [
    "activeBuildGraphHash", "buildInputRoot", "builtWorkerHash", "compiledAnchorCarrierRoot", "distFileListRoot", "distRoot",
    "entryStaticClosureRoot", "localArchiveFileListRoot",
    "localArchiveContentRoot", "localArchiveSha256", "packageContentRoot", "packageFileListRoot"
  ] as const) {
    requireHex(build[key], `deployment build ${key}`);
  }
  const distFileCount = requireSafeInteger(build.distFileCount, "deployment dist file count", 1);
  const activeSourceFilesScanned = requireSafeInteger(build.activeSourceFilesScanned, "deployment active source files", 1);
  const activeBuildFilesScanned = requireSafeInteger(build.activeBuildFilesScanned, "deployment active build files", 1);
  const entryStaticFileCount = requireSafeInteger(build.entryStaticFileCount, "deployment entry static files", 1);
  requireSafeInteger(build.localArchiveBytes, "local deployment archive bytes", 1);
  const localArchiveFileCount = requireSafeInteger(build.localArchiveFileCount, "local deployment archive file count", 1);
  const packageFileCount = requireSafeInteger(build.packageFileCount, "deployment package file count", 1);
  if (
    build.localArchiveFormat !== attestationContract.buildIdentity.localArchiveFormat ||
    build.sitesArchiveContentHash !== sitesVersion.archiveContentHash ||
    localArchiveFileCount !== sitesVersion.archiveFileCount || packageFileCount !== localArchiveFileCount ||
    build.buildInputRoot !== sourceIdentity.buildInputRoot
  ) throw new Error("deployment build and Sites archive are not cross-linked");
  if (gitEvidence !== null) {
    const [firstRoot, secondRoot] = input.repositoryRoots
      .map((path) => realpathSync(path)) as [string, string];
    if (firstRoot === secondRoot) throw new Error("deployment reproducibility worktrees must be distinct");
    const localBuild = freshBuildEvidence(firstRoot, deploymentCommit, "first C1 build", qualifiedSourceAnchor, true);
    const replicaBuild = freshBuildEvidence(secondRoot, deploymentCommit, "second C1 build", qualifiedSourceAnchor, true);
    if (stableJson(localBuild) !== stableJson(replicaBuild)) {
      throw new Error("independent C1 build manifests differ");
    }
    const localPackage = expectedPackageManifest(firstRoot);
    const replicaPackage = expectedPackageManifest(secondRoot);
    if (stableJson(localPackage) !== stableJson(replicaPackage)) {
      throw new Error("independent C1 package manifests differ");
    }
    const localArchive = localArchiveEvidence(input.archivePath);
    validateArchivePackageBinding({
      archive: localArchive,
      packageManifest: localPackage,
      proofBuild: build
    });
    if (
      build.buildInputRoot !== gitEvidence.buildInputRoot ||
      build.builtWorkerHash !== localBuild.builtWorkerHash ||
      build.distRoot !== localBuild.distRoot ||
      build.distFileListRoot !== localBuild.archiveFileListRoot ||
      distFileCount !== localBuild.fileCount ||
      build.activeBuildGraphHash !== localBuild.activeBuildGraphHash ||
      activeSourceFilesScanned !== localBuild.activeSourceFilesScanned ||
      activeBuildFilesScanned !== localBuild.activeBuildFilesScanned ||
      build.compiledAnchorCarrierRoot !== localBuild.compiledAnchorCarrierRoot ||
      build.entryStaticClosureRoot !== localBuild.entryStaticClosureRoot ||
      entryStaticFileCount !== localBuild.entryStaticFileCount
    ) throw new Error("deployment build proof does not match local build outputs");
  }
  return { proof, proofHash: sha256(bytes), gitEvidence };
}

function mapObjects(manifest: CommittedManifest): Map<string, SchemaObject> {
  return new Map(manifest.objects.map((object) => [`${object.type}:${object.name}`, object]));
}

function tableCoreHash(semantics: unknown): string | null {
  if (!semantics || typeof semantics !== "object" || Array.isArray(semantics)) return null;
  const core = { ...semantics as Record<string, unknown> };
  delete core.indexes;
  return sha256(stableJson(core));
}

function expectedObjectHash(object: SchemaObject): string {
  return object.type === "table" ? tableCoreHash(object.semantics)! : object.semanticHash;
}

export function classifySchema(
  catalog: readonly CatalogEntry[],
  evidence: readonly SchemaEvidence[],
  stages: ExpectedStages
): { accepted: boolean; findings: Array<Record<string, unknown>>; expectedSummary: Record<string, unknown> } {
  const findings: Array<Record<string, unknown>> = [];
  const actual = new Map(evidence.map((object) => [object.key, object]));
  const stage16 = mapObjects(stages.through0016);
  const stage17 = mapObjects(stages.through0017);
  const stage18 = mapObjects(stages.through0018);
  const stage19 = mapObjects(stages.through0019);
  const stage20 = mapObjects(stages.through0020);
  const added17 = new Set([...stage17.keys()].filter((key) => !stage16.has(key)));
  const added18 = new Set([...stage18.keys()].filter((key) => !stage17.has(key)));
  const added19 = new Set([...stage19.keys()].filter((key) => !stage18.has(key)));
  const playsOwned = new Set(prestateClasses.plays.ownedObjectKeys);
  const allowed = new Set([
    ...[...stage16.keys()].filter((key) => !playsOwned.has(key)),
    ...added19
  ]);

  const legacyExpected = stage16.get("table:plays");
  const canonicalExpected = stage20.get("table:plays");
  const legacyClass = prestateClasses.plays.shapes.legacy_29;
  const canonicalClass = prestateClasses.plays.shapes.canonical_0020;
  if (
    !legacyExpected || !canonicalExpected || !legacyClass || !canonicalClass ||
    legacyExpected.semanticHash !== legacyClass.fullHash || expectedObjectHash(legacyExpected) !== legacyClass.coreHash ||
    canonicalExpected.semanticHash !== canonicalClass.fullHash || expectedObjectHash(canonicalExpected) !== canonicalClass.coreHash
  ) throw new Error("prestate class configuration does not match migration manifests");
  for (const [name, expectedHash] of Object.entries(prestateClasses.plays.explicitIndexes)) {
    if (stage16.get(`index:${name}`)?.semanticHash !== expectedHash) {
      throw new Error(`prestate class index does not match migration manifest: ${name}`);
    }
  }

  for (const [key, expected] of stage16) {
    if (playsOwned.has(key)) continue;
    const candidate = actual.get(key);
    if (!candidate) {
      findings.push({ severity: "block", code: "missing_0016_foundation_object", key });
      continue;
    }
    const candidateHash = candidate.type === "table" ? candidate.tableCoreHash : candidate.semanticHash;
    const expectedHash = expectedObjectHash(expected);
    if (candidateHash !== expectedHash) {
      findings.push({
        severity: "block",
        code: "0016_foundation_semantic_drift",
        key,
        expectedHash,
        actualHash: candidateHash
      });
    }
  }
  for (const key of [...added17, ...added18]) {
    if (actual.has(key)) findings.push({ severity: "block", code: "unreceipted_0017_or_0018_object", key });
  }
  for (const key of added19) {
    const candidate = actual.get(key);
    if (!candidate) continue;
    const expected = stage19.get(key)!;
    const candidateHash = candidate.type === "table" ? candidate.tableCoreHash : candidate.semanticHash;
    const expectedHash = expectedObjectHash(expected);
    if (candidateHash !== expectedHash) {
      findings.push({
        severity: "block",
        code: "0019_adoption_semantic_drift",
        key,
        expectedHash,
        actualHash: candidateHash
      });
    }
  }

  const recognizedTriggerNames = new Set([
    ...Object.keys(prestateClasses.historicalTriggers.recognizedHardStopMainLine),
    ...Object.keys(prestateClasses.historicalTriggers.trackedIncompatible)
  ]);
  const historicalTriggers = evidence.filter((object) =>
    object.type === "trigger" && recognizedTriggerNames.has(object.name)
  );
  for (const trigger of historicalTriggers) {
    allowed.add(trigger.key);
    const recognizedHardStopHash = prestateClasses.historicalTriggers.recognizedHardStopMainLine[trigger.name];
    const incompatibleHashes = prestateClasses.historicalTriggers.trackedIncompatible[trigger.name] ?? [];
    if (trigger.tableName !== prestateClasses.historicalTriggers.requiredTableName) {
      findings.push({ severity: "block", code: "historical_trigger_wrong_owner", key: trigger.key });
    } else if (trigger.semanticHash === recognizedHardStopHash) {
      findings.push({ severity: "block", code: "recognized_historical_trigger_requires_reconciliation", key: trigger.key });
    } else if (incompatibleHashes.includes(trigger.semanticHash)) {
      findings.push({ severity: "block", code: "tracked_incompatible_historical_trigger", key: trigger.key });
    } else {
      findings.push({
        severity: "block",
        code: "historical_trigger_semantic_drift",
        key: trigger.key,
        actualHash: trigger.semanticHash
      });
    }
  }
  if (
    prestateClasses.historicalTriggers.portfolioVersionsMutuallyExclusive &&
    actual.has("trigger:approval_portfolio_guard_v1") && actual.has("trigger:approval_portfolio_guard_v2")
  ) findings.push({ severity: "block", code: "mutually_exclusive_portfolio_triggers_coexist" });

  const plays = actual.get("table:plays");
  let playsShape = "absent";
  let playsDecision = "supported";
  if (!plays) {
    const ownedCatalogObjects = catalog.filter((entry) => entry.tableName === "plays" || playsOwned.has(`${entry.type}:${entry.name}`));
    if (ownedCatalogObjects.length > 0 || historicalTriggers.length > 0) {
      findings.push({
        severity: "block",
        code: "absent_plays_has_owned_objects",
        keys: ownedCatalogObjects.map((entry) => `${entry.type}:${entry.name}`).sort()
      });
    } else {
      findings.push({ severity: "info", code: "supported_absent_plays_prestate" });
    }
  } else {
    const shapeEntry = Object.entries(prestateClasses.plays.shapes).find(([, shape]) =>
      shape.fullHash === plays.semanticHash && shape.coreHash === plays.tableCoreHash
    );
    if (!shapeEntry) {
      playsShape = "unknown";
      playsDecision = "hard_stop_unknown_shape";
      findings.push({
        severity: "block",
        code: "unsupported_unknown_plays_shape",
        fullHash: plays.semanticHash,
        coreHash: plays.tableCoreHash
      });
    } else {
      [playsShape, { decision: playsDecision }] = shapeEntry;
      if (playsDecision === "supported") {
        findings.push({ severity: "info", code: "supported_legacy_plays_prestate", shape: playsShape });
      } else {
        findings.push({
          severity: "block",
          code: `unsupported_${playsShape}`,
          decision: playsDecision,
          fullHash: plays.semanticHash,
          coreHash: plays.tableCoreHash
        });
      }
    }
    allowed.add("table:plays");
    for (const [name, expectedHash] of Object.entries(prestateClasses.plays.explicitIndexes)) {
      const key = `index:${name}`;
      const index = actual.get(key);
      allowed.add(key);
      if (!index || index.type !== "index" || index.tableName !== "plays" || index.semanticHash !== expectedHash) {
        findings.push({ severity: "block", code: "plays_explicit_index_mismatch", key });
      }
    }
  }

  for (const object of evidence) {
    if (!allowed.has(object.key)) findings.push({ severity: "block", code: "unknown_application_object", key: object.key });
  }
  const internalCatalog = catalog.filter((entry) => entry.internal);
  const catalogTables = new Set(catalog.filter((entry) => entry.type === "table").map((entry) => entry.name));
  const expectedAutoindexes = [
    ...stages.autoindexes.through0016.filter((entry) => entry.tableName !== "plays" || Boolean(plays)),
    ...stages.autoindexes.added0019.filter((entry) => catalogTables.has(entry.tableName))
  ];
  const expectedAutoindexByName = new Map(expectedAutoindexes.map((entry) => [entry.name, entry]));
  const actualAutoindexByName = new Map(internalCatalog
    .filter((entry) => entry.type === "index" && entry.name.startsWith("sqlite_autoindex_"))
    .map((entry) => [entry.name, entry]));
  for (const expected of expectedAutoindexes) {
    const candidate = actualAutoindexByName.get(expected.name);
    if (!candidate || candidate.tableName !== expected.tableName || !candidate.sqlIsNull || candidate.sqlHash !== expected.sqlHash) {
      findings.push({ severity: "block", code: "missing_or_mismatched_sqlite_autoindex", name: expected.name });
    }
  }
  for (const entry of internalCatalog) {
    const expectedAutoindex = expectedAutoindexByName.get(entry.name);
    const permittedAutoIndex = Boolean(expectedAutoindex) &&
      entry.type === "index" && entry.tableName === expectedAutoindex?.tableName && entry.sqlIsNull &&
      entry.sqlHash === expectedAutoindex?.sqlHash;
    const permittedExact =
      internalNames.has(entry.name) && entry.type === "table" && entry.tableName === entry.name;
    if (!permittedAutoIndex && !permittedExact) {
      findings.push({ severity: "block", code: "unknown_internal_object", key: `${entry.type}:${entry.name}` });
    }
  }
  return {
    accepted: findings.every((finding) => finding.severity !== "block"),
    findings,
    expectedSummary: {
      through0016: {
        counts: stages.through0016.counts,
        fingerprint: stages.through0016.schemaFingerprint,
        migrationSetHash: stages.through0016.migrationSetHash
      },
      optional0019ObjectCount: added19.size,
      forbidden0017ObjectCount: added17.size,
      forbidden0018ObjectCount: added18.size,
      prestateClassVersion: prestateClasses.version,
      playsShape,
      playsDecision,
      legacyPlaysHash: expectedObjectHash(legacyExpected),
      canonicalPlaysHash: expectedObjectHash(canonicalExpected),
      expectedAutoindexCount: expectedAutoindexes.length
    }
  };
}

function hmacPayload(value: unknown, token: string): string {
  const key = createHash("sha256")
    .update(`${contract.version}\u0000payload-mac\u0000${token}`)
    .digest();
  return createHmac("sha256", key).update(stableJson(value)).digest("hex");
}

function equalHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.body) throw new Error("operator response body missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > MAX_OPERATOR_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("operator response exceeded byte limit");
    }
    chunks.push(result.value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(joined));
  } catch {
    throw new Error("operator returned invalid JSON");
  }
  return requireRecord(parsed, "operator response");
}

class OperatorClient {
  private continuation: string | null = null;
  private passId: string | null = null;
  private passNonceHash: string | null = null;
  private sequence = -1;
  readonly payloadHashes: string[] = [];
  readonly queryStats = { queries: 0, rowsRead: 0, rowsWritten: 0, changes: 0, changedDb: false };

  constructor(
    private readonly secrets: SecretInput,
    private readonly expectedBuildAttestation: string
  ) {}

  async call(input: Record<string, unknown>): Promise<OperatorResponse> {
    const operation = requireString(input.operation, "operator request operation");
    if (this.continuation === null) {
      if (operation !== "begin") throw new Error("first operator request must begin a pass");
      const passNonce = requireString(input.passNonce, "operator pass nonce");
      this.passNonceHash = sha256(passNonce);
    } else if (operation === "begin") {
      throw new Error("operator pass cannot restart through an existing client");
    }
    const body = this.continuation === null ? input : { ...input, continuation: this.continuation };
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.secrets.censusToken}`,
      "content-type": "application/json"
    };
    if (this.secrets.siteAuthorizationToken) {
      headers["OAI-Sites-Authorization"] = this.secrets.siteAuthorizationToken;
    }
    const response = await fetch(this.secrets.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error"
    });
    const json = await boundedJson(response);
    if (!response.ok) throw new Error(`operator_${response.status}_${String(json.error ?? "unknown")}`);
    exactKeys(json, [
      "buildAttestation",
      "continuation",
      "continuationHash",
      "contractVersion",
      "observedAt",
      "passId",
      "passNonceHash",
      "payload",
      "payloadHash",
      "payloadMac",
      "queryStats",
      "requestHash",
      "sequence"
    ], "operator response");
    const value = json as unknown as OperatorResponse;
    if (value.contractVersion !== contract.version) throw new Error("operator contract version mismatch");
    if (!equalHex(requireHex(value.buildAttestation, "operator build attestation"), this.expectedBuildAttestation)) {
      throw new Error("operator build attestation mismatch");
    }
    if (!this.passNonceHash || !equalHex(requireHex(value.passNonceHash, "operator pass nonce hash"), this.passNonceHash)) {
      throw new Error("operator pass nonce mismatch");
    }
    const payload = requireRecord(value.payload, "operator payload");
    if (payload.operation !== operation) throw new Error("operator operation echo mismatch");
    const queryStats = requireRecord(value.queryStats, "operator query stats");
    exactKeys(queryStats, ["changedDb", "changes", "queries", "rowsRead", "rowsWritten"], "operator query stats");
    if (typeof queryStats.changedDb !== "boolean") throw new Error("operator query changedDb is invalid");
    for (const key of ["changes", "queries", "rowsRead", "rowsWritten"] as const) {
      requireSafeInteger(queryStats[key], `operator query ${key}`);
    }
    const passId = requireString(value.passId, "operator pass id");
    const sequence = requireSafeInteger(value.sequence, "operator sequence");
    const continuation = requireString(value.continuation, "operator continuation");
    if (continuation.length > 16_384 || !/^[A-Za-z0-9_-]+$/u.test(continuation)) {
      throw new Error("operator continuation is invalid");
    }
    if (!equalHex(requireHex(value.continuationHash, "operator continuation hash"), sha256(continuation))) {
      throw new Error("operator continuation hash mismatch");
    }
    if (!equalHex(requireHex(value.requestHash, "operator request hash"), sha256(stableJson(body)))) {
      throw new Error("operator request hash mismatch");
    }
    if (typeof value.observedAt !== "string" || !Number.isFinite(Date.parse(value.observedAt))) {
      throw new Error("operator observation time is invalid");
    }
    const protectedPayload = {
      contractVersion: value.contractVersion,
      buildAttestation: value.buildAttestation,
      passId,
      passNonceHash: value.passNonceHash,
      sequence,
      requestHash: value.requestHash,
      payload,
      queryStats,
      observedAt: value.observedAt,
      continuationHash: value.continuationHash
    };
    if (!equalHex(requireHex(value.payloadHash, "operator payload hash"), sha256(stableJson(protectedPayload)))) {
      throw new Error("operator payload hash mismatch");
    }
    if (!equalHex(requireHex(value.payloadMac, "operator payload MAC"), hmacPayload(protectedPayload, this.secrets.censusToken))) {
      throw new Error("operator payload MAC mismatch");
    }
    if (value.queryStats.rowsWritten !== 0 || value.queryStats.changes !== 0 || value.queryStats.changedDb) {
      throw new Error("operator reported a database mutation");
    }
    if (this.passId === null) this.passId = passId;
    if (passId !== this.passId || sequence !== this.sequence + 1) {
      throw new Error("operator continuation sequence mismatch");
    }
    this.sequence = sequence;
    this.continuation = continuation;
    this.payloadHashes.push(value.payloadHash);
    this.queryStats.queries += value.queryStats.queries;
    this.queryStats.rowsRead += value.queryStats.rowsRead;
    this.queryStats.rowsWritten += value.queryStats.rowsWritten;
    this.queryStats.changes += value.queryStats.changes;
    this.queryStats.changedDb ||= value.queryStats.changedDb;
    return value;
  }
}

function validateFoundation(payload: Record<string, unknown>): void {
  exactKeys(payload, [
    "foreignKeyViolationCount",
    "foreignKeyViolationHash",
    "operation",
    "outstandingReservations",
    "quickCheck",
    "quota",
    "quotaHash",
    "receipts",
    "receiptsHash",
    "reservationEvents"
  ], "foundation payload");
  if (payload.operation !== "foundation") throw new Error("foundation operation echo mismatch");
  if (!Array.isArray(payload.receipts) || !Array.isArray(payload.quota)) {
    throw new Error("foundation arrays are invalid");
  }
  if (!equalHex(requireHex(payload.receiptsHash, "foundation receipts hash"), sha256(stableJson(payload.receipts)))) {
    throw new Error("foundation receipts hash mismatch");
  }
  if (!equalHex(requireHex(payload.quotaHash, "foundation quota hash"), sha256(stableJson(payload.quota)))) {
    throw new Error("foundation quota hash mismatch");
  }
  requireHex(payload.foreignKeyViolationHash, "foundation foreign key violation hash");
  const receipts = payload.receipts as Array<{ version: string; migration_hash: string }>;
  const actualReceipts = receipts.map((row) => ({
    version: row.version,
    migrationHash: row.migration_hash
  })).sort((left, right) => left.version.localeCompare(right.version));
  const expectedReceipts = [...authorityFoundation.preservedReceipts]
    .sort((left, right) => left.version.localeCompare(right.version));
  if (stableJson(actualReceipts) !== stableJson(expectedReceipts)) {
    throw new Error("accepted production receipt foundation mismatch");
  }
  const quota = payload.quota as Array<{
    provider: string;
    used: number;
    remaining: number;
    last_cost: number;
  }>;
  const expectedQuota = authorityFoundation.quotaBootstrap;
  if (
    quota.length !== 1 || quota[0]?.provider !== "the-odds-api" ||
    Number(quota[0]?.used) !== expectedQuota.used ||
    Number(quota[0]?.remaining) !== expectedQuota.remaining ||
    Number(quota[0]?.last_cost) !== 0 ||
    Number(payload.outstandingReservations) !== expectedQuota.outstandingReservations ||
    Number(payload.reservationEvents) !== expectedQuota.reservationEvents ||
    Number(payload.foreignKeyViolationCount) !== 0 ||
    stableJson(payload.quickCheck) !== stableJson([{ quick_check: "ok" }])
  ) throw new Error("accepted production foundation mismatch");
}

async function schemaPass(
  secrets: SecretInput,
  stages: ExpectedStages,
  expectedBuildAttestation: string
): Promise<{
  client: OperatorClient;
  catalog: CatalogEntry[];
  catalogHash: string;
  schemaVersion: number;
  schema: SchemaEvidence[];
  classification: ReturnType<typeof classifySchema>;
}> {
  const client = new OperatorClient(secrets, expectedBuildAttestation);
  const begin = await client.call({ operation: "begin", passNonce: randomUUID().replaceAll("-", "") });
  const beginPayload = requireRecord(begin.payload, "begin payload") as {
    operation: string;
    catalog: CatalogEntry[];
    catalogHash: string;
    schemaVersion: number;
  };
  exactKeys(beginPayload, ["catalog", "catalogHash", "operation", "schemaVersion"], "begin payload");
  if (beginPayload.operation !== "begin" || !Array.isArray(beginPayload.catalog)) {
    throw new Error("begin payload is invalid");
  }
  const seenCatalogKeys = new Set<string>();
  for (const [index, candidate] of beginPayload.catalog.entries()) {
    const entry = requireRecord(candidate, `catalog entry ${index}`);
    exactKeys(entry, ["internal", "name", "sqlHash", "sqlIsNull", "tableName", "type"], `catalog entry ${index}`);
    if (!objectTypes.has(entry.type as SchemaObject["type"])) throw new Error("catalog object type is invalid");
    requireString(entry.name, "catalog object name");
    requireString(entry.tableName, "catalog table name");
    requireHex(entry.sqlHash, "catalog SQL hash");
    if (typeof entry.internal !== "boolean" || typeof entry.sqlIsNull !== "boolean") {
      throw new Error("catalog flags are invalid");
    }
    const key = `${String(entry.type)}:${String(entry.name)}`;
    if (seenCatalogKeys.has(key)) throw new Error("catalog contains a duplicate object");
    seenCatalogKeys.add(key);
  }
  const sortedCatalog = [...beginPayload.catalog].sort((left, right) =>
    left.type.localeCompare(right.type) || left.name.localeCompare(right.name)
  );
  if (stableJson(sortedCatalog) !== stableJson(beginPayload.catalog)) throw new Error("catalog order is not canonical");
  if (!equalHex(requireHex(beginPayload.catalogHash, "catalog hash"), sha256(stableJson(beginPayload.catalog)))) {
    throw new Error("catalog hash mismatch");
  }
  requireSafeInteger(beginPayload.schemaVersion, "schema version");
  const schema: SchemaEvidence[] = [];
  for (const entry of beginPayload.catalog.filter((object) => !object.internal)) {
    const response = await client.call({
      operation: "schema_object",
      type: entry.type,
      name: entry.name
    });
    const payload = requireRecord(response.payload, `schema payload ${entry.type}:${entry.name}`) as {
      operation: string;
      type: SchemaObject["type"];
      name: string;
      tableName: string;
      semantics: unknown;
      semanticHash: string;
    };
    exactKeys(payload, ["name", "operation", "semanticHash", "semantics", "tableName", "type"], "schema payload");
    if (
      payload.operation !== "schema_object" || payload.type !== entry.type ||
      payload.name !== entry.name || payload.tableName !== entry.tableName
    ) throw new Error(`schema object echo mismatch: ${entry.type}:${entry.name}`);
    if (!equalHex(requireHex(payload.semanticHash, "schema semantic hash"), sha256(stableJson(payload.semantics)))) {
      throw new Error(`schema semantic hash mismatch: ${entry.type}:${entry.name}`);
    }
    schema.push({
      key: `${payload.type}:${payload.name}`,
      type: payload.type,
      name: payload.name,
      tableName: payload.tableName,
      semanticHash: payload.semanticHash,
      tableCoreHash: payload.type === "table" ? tableCoreHash(payload.semantics) : null
    });
  }
  schema.sort((left, right) => left.key.localeCompare(right.key));
  return {
    client,
    catalog: beginPayload.catalog,
    catalogHash: beginPayload.catalogHash,
    schemaVersion: Number(beginPayload.schemaVersion),
    schema,
    classification: classifySchema(beginPayload.catalog, schema, stages)
  };
}

async function completePass(
  initial: Awaited<ReturnType<typeof schemaPass>>,
  passNumber: number
): Promise<Record<string, unknown>> {
  const tables = initial.catalog
    .filter((entry) => entry.type === "table" && !entry.internal)
    .map((entry) => entry.name)
    .sort();
  const tableEvidence: TableEvidence[] = [];
  for (const table of tables) {
    const start = await initial.client.call({ operation: "table_start", table });
    const startPayload = requireRecord(start.payload, `table start payload ${table}`) as {
      operation: string;
      table: string;
      rowCount: number;
      columns: unknown[];
      columnsHash: string;
      schemaVersion: number;
    };
    exactKeys(startPayload, ["columns", "columnsHash", "operation", "rowCount", "schemaVersion", "table"], "table start payload");
    if (startPayload.operation !== "table_start" || startPayload.table !== table || !Array.isArray(startPayload.columns)) {
      throw new Error(`table start echo mismatch: ${table}`);
    }
    if (!equalHex(requireHex(startPayload.columnsHash, `columns hash ${table}`), sha256(stableJson(startPayload.columns)))) {
      throw new Error(`columns hash mismatch: ${table}`);
    }
    const tableRowCount = requireSafeInteger(startPayload.rowCount, `table row count ${table}`, 0, MAX_TABLE_ROWS);
    if (requireSafeInteger(startPayload.schemaVersion, `table schema version ${table}`) !== initial.schemaVersion) {
      throw new Error(`schema version changed before ${table}`);
    }
    const pageHashes: string[] = [];
    let offset = 0;
    const maximumPages = Math.floor(tableRowCount / 128) + 1;
    while (true) {
      if (pageHashes.length >= maximumPages) throw new Error(`page limit exceeded for ${table}`);
      const page = await initial.client.call({
        operation: "table_page",
        table,
        columnsHash: startPayload.columnsHash,
        offset,
        limit: 128
      });
      const payload = requireRecord(page.payload, `table page payload ${table}`) as {
        operation: string;
        table: string;
        offset: number;
        limit: number;
        rowCount: number;
        done: boolean;
        columnsHash: string;
        canonicalBytes: number;
        rowHashes: string[];
        pageHash: string;
      };
      exactKeys(payload, [
        "canonicalBytes", "columnsHash", "done", "limit", "offset", "operation",
        "pageHash", "rowCount", "rowHashes", "table"
      ], "table page payload");
      if (
        payload.operation !== "table_page" || payload.table !== table || payload.offset !== offset ||
        payload.limit !== 128 || payload.columnsHash !== startPayload.columnsHash ||
        typeof payload.done !== "boolean" || !Array.isArray(payload.rowHashes)
      ) throw new Error(`table page echo mismatch: ${table}`);
      const pageRowCount = requireSafeInteger(payload.rowCount, `page row count ${table}`, 0, 128);
      requireSafeInteger(payload.canonicalBytes, `page canonical bytes ${table}`, 0, 1_800_000);
      if (payload.rowHashes.length !== pageRowCount) throw new Error(`page row-hash count mismatch: ${table}`);
      for (const rowHash of payload.rowHashes) requireHex(rowHash, `page row hash ${table}`);
      if (!equalHex(requireHex(payload.pageHash, `page hash ${table}`), sha256(stableJson(payload.rowHashes)))) {
        throw new Error(`page hash mismatch: ${table}`);
      }
      const remaining = tableRowCount - offset;
      const expectedPageRows = Math.min(128, remaining);
      if (pageRowCount !== expectedPageRows || payload.done !== (pageRowCount < 128)) {
        throw new Error(`page cardinality mismatch: ${table}`);
      }
      pageHashes.push(payload.pageHash);
      offset += pageRowCount;
      if (payload.done) break;
    }
    const finish = await initial.client.call({
      operation: "table_finish",
      table,
      columnsHash: startPayload.columnsHash
    });
    const finishPayload = requireRecord(finish.payload, `table finish payload ${table}`) as {
      operation: string;
      table: string;
      rowCount: number;
      columns: unknown[];
      columnsHash: string;
      schemaVersion: number;
    };
    exactKeys(finishPayload, ["columns", "columnsHash", "operation", "rowCount", "schemaVersion", "table"], "table finish payload");
    if (
      finishPayload.operation !== "table_finish" || finishPayload.table !== table ||
      !Array.isArray(finishPayload.columns) ||
      !equalHex(requireHex(finishPayload.columnsHash, `finish columns hash ${table}`), sha256(stableJson(finishPayload.columns))) ||
      Number(finishPayload.rowCount) !== tableRowCount ||
      finishPayload.columnsHash !== startPayload.columnsHash ||
      Number(finishPayload.schemaVersion) !== initial.schemaVersion ||
      offset !== tableRowCount
    ) throw new Error(`table changed during scan: ${table}`);
    tableEvidence.push({
      table,
      rowCount: tableRowCount,
      columnsHash: startPayload.columnsHash,
      schemaVersion: Number(startPayload.schemaVersion),
      pageCount: pageHashes.length,
      pageHashes,
      dataHash: sha256(stableJson({
        table,
        rowCount: tableRowCount,
        columnsHash: startPayload.columnsHash,
        pageHashes
      }))
    });
  }
  const foundation = await initial.client.call({ operation: "foundation" });
  validateFoundation(foundation.payload);
  const immutable = {
    contractVersion: contract.version,
    passNumber,
    catalogHash: initial.catalogHash,
    schemaVersion: initial.schemaVersion,
    schema: initial.schema,
    tables: tableEvidence,
    foundation: foundation.payload
  };
  return {
    ...immutable,
    passRoot: sha256(stableJson({ ...immutable, passNumber: null })),
    queryStats: initial.client.queryStats,
    operationPayloadRoot: sha256(stableJson(initial.client.payloadHashes))
  };
}

async function main(): Promise<void> {
  const target = resolveTrustedTarget();
  const qualificationPaths = resolveQualificationPaths(argument("--qualification-dir"));
  const output = qualificationPaths.output;
  const implementationRepositoryRoots = target.loopbackFixture
    ? [root, root] as const
    : [resolve(argument("--implementation-worktree-a")), resolve(argument("--implementation-worktree-b"))] as const;
  const repositoryRoots = target.loopbackFixture
    ? [root, root] as const
    : [resolve(argument("--deployment-worktree-a")), resolve(argument("--deployment-worktree-b"))] as const;
  const archivePath = target.loopbackFixture ? root : qualificationPaths.deploymentArchive;
  const authorityCommit = argument("--authority-commit");
  const implementationCommit = argument("--implementation-commit");
  const sourceCommit = argument("--source-commit");
  const authorityEvidence = target.loopbackFixture ? null : validateAuthorityExecutionRoot(root, authorityCommit);
  const deploymentVersion = argument("--deployment-version");
  const expectedBuildAttestation = requireHex(
    argument("--expected-build-attestation").toLowerCase(),
    "expected build attestation"
  );
  const deploymentEvidence = validateDeploymentProof({
    path: qualificationPaths.deploymentProof,
    target,
    authorityRepositoryRoot: root,
    implementationRepositoryRoots,
    repositoryRoots,
    archivePath,
    authorityEvidence,
    expectedBuildAttestation,
    expectedImplementationCommit: implementationCommit,
    sourceCommit,
    deploymentVersion
  });
  const operatorSourceHash = sha256(readFileSync(resolve(root, "worker/os01-census-operator.ts")));
  const deployedOperatorSourceHash = sha256(readFileSync(resolve(repositoryRoots[0], "worker/os01-census-operator.ts")));
  if (!target.loopbackFixture && deployedOperatorSourceHash !== operatorSourceHash) {
    throw new Error("deployed census operator source differs from the qualified controller source");
  }
  const outputFile = openSync(output, "wx", 0o600);
  const secrets = readSecretInput(target.origin);
  const stages = migrationStages();
  const contractHash = sha256(readFileSync(resolve(root, "config/os01-production-census.v1.json")));
  const attestationContractHash = sha256(readFileSync(resolve(root, "config/os01-census-attestation.v1.json")));
  const trustedTargetContractHash = sha256(readFileSync(resolve(root, attestationContract.trustedTargetConfig)));
  const prestateClassHash = sha256(readFileSync(resolve(root, "config/os01-production-prestate-classes.v1.json")));
  const startedAt = new Date().toISOString();
  const first = await schemaPass(secrets, stages, expectedBuildAttestation);
  const firstClassification = first.classification;
  let receipt: Record<string, unknown>;
  if (!firstClassification.accepted) {
    receipt = {
      version: "os01-production-census-receipt.2026.1",
      status: "blocked_before_content_scan",
      startedAt,
      completedAt: new Date().toISOString(),
      sourceCommit,
      deploymentVersion,
      target: {
        name: target.name,
        projectId: target.projectId,
        origin: target.origin,
        accessMode: target.accessMode,
        loopbackFixture: target.loopbackFixture
      },
      buildAttestation: expectedBuildAttestation,
      attestationContractHash,
      trustedTargetContractHash,
      deploymentProofHash: deploymentEvidence.proofHash,
      deploymentProof: deploymentEvidence.proof,
      contractVersion: contract.version,
      contractHash,
      prestateClassHash,
      operatorSourceHash,
      deployedOperatorSourceHash,
      migrationByteHashes: stages.migrationByteHashes,
      catalogHash: first.catalogHash,
      schemaVersion: first.schemaVersion,
      objectCount: first.catalog.length,
      schema: first.schema,
      classification: firstClassification,
      queryStats: first.client.queryStats,
      providerSecretReads: 0,
      providerRequests: 0,
      quotaReservations: 0,
      contentTablesScanned: 0
    };
  } else {
    const firstPass = await completePass(first, 1);
    const second = await schemaPass(secrets, stages, expectedBuildAttestation);
    if (!second.classification.accepted) throw new Error("second-pass classification changed");
    const secondPass = await completePass(second, 2);
    if (firstPass.passRoot !== secondPass.passRoot) throw new Error("independent census pass roots differ");
    receipt = {
      version: "os01-production-census-receipt.2026.1",
      status: "accepted_two_identical_read_only_passes",
      startedAt,
      completedAt: new Date().toISOString(),
      sourceCommit,
      deploymentVersion,
      target: {
        name: target.name,
        projectId: target.projectId,
        origin: target.origin,
        accessMode: target.accessMode,
        loopbackFixture: target.loopbackFixture
      },
      buildAttestation: expectedBuildAttestation,
      attestationContractHash,
      trustedTargetContractHash,
      deploymentProofHash: deploymentEvidence.proofHash,
      deploymentProof: deploymentEvidence.proof,
      contractVersion: contract.version,
      contractHash,
      prestateClassHash,
      operatorSourceHash,
      deployedOperatorSourceHash,
      migrationByteHashes: stages.migrationByteHashes,
      classification: firstClassification,
      firstPass,
      secondPass,
      commonPassRoot: firstPass.passRoot,
      providerSecretReads: 0,
      providerRequests: 0,
      quotaReservations: 0
    };
  }
  const receiptHash = sha256(stableJson(receipt));
  writeFileSync(outputFile, `${JSON.stringify({ ...receipt, receiptHash }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  closeSync(outputFile);
  process.stdout.write(`${String(receipt.status)} ${receiptHash}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`OS-01 census controller failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
