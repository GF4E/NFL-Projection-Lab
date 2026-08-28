#!/usr/bin/env node

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync,
  readdirSync, realpathSync, rmSync
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  buildPhysicalManifest,
  type CommittedManifest,
  type SchemaObject
} from "./verify_d1_schema_authority";
import {
  os01ControlPlaneContract,
  validateTrustedUploaderAssertion,
  validateOwnerOnlyAccess,
  validatePublicProductionAccess,
  type AccessProjection,
  type DeploymentProjection,
  type TrustedUploaderAssertion,
  type VersionProjection
} from "./os01-control-plane-evidence";
import { publishEvidenceBytesExclusive } from "./os01-atomic-evidence";
import {
  assertBuildToolchainEvidenceUnchanged,
  assertFrozenAuthorityLoaderProcess,
  buildInstalledToolchainEvidence,
  measureSystemExecutable,
  OS01_BUILD_TOOLCHAIN_EVIDENCE_VERSION,
  OS01_QUALIFICATION_SYSTEM_EXECUTABLES,
  type BuildToolchainAuthorityLoaderEvidence,
  type BuildToolchainEvidence,
  type BuildToolchainPlatformIdentityEvidence,
  type BuildToolchainSystemExecutableEvidence
} from "./os01-build-toolchain-evidence";

type JsonScalar = boolean | number | string | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export type SecretInput = {
  endpoint: string;
  censusToken: string;
  siteAuthorizationToken?: string;
};

export type TrustedTarget = {
  name: string;
  projectId: string;
  origin: string;
  accessMode: string;
  d1Binding: string | null;
  r2Binding: string | null;
  loopbackFixture: boolean;
};

export type HostingTargetEvidence = {
  projectId: string;
  d1Binding: string | null;
  r2Binding: string | null;
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
  qualificationBuild: {
    version: string;
    role: "implementation" | "deployment";
    mode: "owner_only_public_context" | "public_production_private_seed";
    runId: string | null;
    seedCommitment: string | null;
    contextCommitment: string;
    transcriptHash: string;
    toolchainRoot: string;
    installedToolchainClosureRoot: string;
    installedToolchainPackageCount: number;
    nodeVersion: string;
    nodeExecutableSha256: string;
    pnpmVersion: string;
    pnpmExecutableSha256: string;
    lockfileSha256: string;
    workspaceSha256: string;
    vinextVersion: string;
    patchSha256: string;
    targetProjectId: string;
    targetAccessMode: string;
  };
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

type LocalArchiveFileIdentity = {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
};

export type QualificationArchiveBoundaryEvidence = {
  version: string;
  archiveSha256: string;
  qualificationMode: LocalBuildEvidence["qualificationBuild"]["mode"];
  runId: string | null;
  seedCommitment: string | null;
  contextCommitment: string;
  fileCount: number;
  nonServerFileCount: number;
  rawContextLeakCount: 0;
  nonServerDerivedCredentialLeakCount: 0;
  scanRoot: string;
};

export type AuthorityBridgeCodeRelationEvidence = {
  version: string;
  authorityCommit: string;
  implementationCommit: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  relationRoot: string;
};

export type SourceAnchorEvidence = {
  authorityEvidence: AuthorityEvidence;
  authorityBridgeCodeRelation: AuthorityBridgeCodeRelationEvidence;
  bridgeImplementation: BridgeImplementationEvidence;
  implementationBuild: LocalBuildEvidence;
  sourceAnchor: string;
};

export type DeploymentProofConstructionInput = {
  target: TrustedTarget;
  observedAt: string;
  sourceAnchorEvidence: SourceAnchorEvidence;
  gitEvidence: GitSuccessorEvidence;
  deploymentBuild: LocalBuildEvidence;
  packageManifest: PackageManifestEvidence;
  localArchive: LocalArchiveEvidence;
  qualificationArchiveBoundary: QualificationArchiveBoundaryEvidence;
  sitesVersion: VersionProjection;
  deployment: DeploymentProjection;
  access: AccessProjection;
  uploader: TrustedUploaderAssertion;
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
  pageMacs: string[];
  dataMacRoot: string;
};

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/os01-production-census.v1.json"), "utf8")) as {
  version: string;
  route: string;
  contentEvidence: {
    allowedTables: string[];
    pageFingerprint: string;
    persistRawRows: boolean;
    persistUnkeyedRowHashes: boolean;
    unknownTableBehavior: string;
  };
};
if (
  stableJson(contract.contentEvidence.allowedTables) !== stableJson(["plays"]) ||
  contract.contentEvidence.pageFingerprint !== "ephemeral-token-keyed-hmac-sha256" ||
  contract.contentEvidence.persistRawRows ||
  contract.contentEvidence.persistUnkeyedRowHashes ||
  contract.contentEvidence.unknownTableBehavior !== "refuse-before-content-read"
) throw new Error("production census content-evidence policy is not fail closed");
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
    requiredImplementationCommit: string;
    requiredImplementationTreeObjectId: string;
    requiredImplementationArchiveSha256: string;
    requiredImplementationArchiveBytes: number;
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
    localArchivePackaging: {
      version: string;
      scriptPath: string;
      scriptSha256: string;
      tarFormat: string;
      gzipMtime: number;
      independentBuildCount: number;
      exactByteMatchRequired: boolean;
    };
    qualificationBuild: {
      version: string;
      modeFlag: string;
      contextDerivation: string;
      contextDomain: string;
      seedCommitmentDomain: string;
      contextCommitmentDomain: string;
      vinextCredentialDomainPrefix: string;
      derivedCredentialDomains: Array<{ domain: string; bytes: number }>;
      patchPath: string;
      patchSha256: string;
      pnpmPatchHash: string;
      vinextVersion: string;
      installedToolchainClosureVersion: string;
      installedToolchainClosureRoot: string;
      installedToolchainPackageCount: number;
      systemExecutables: BuildToolchainSystemExecutableEvidence[];
      platformIdentity: BuildToolchainPlatformIdentityEvidence;
      authorityLoader: BuildToolchainAuthorityLoaderEvidence;
      nodeVersion: string;
      nodeExecutableSha256: string;
      pnpmVersion: string;
      pnpmExecutableSha256: string;
      lockfileSha256: string;
      workspaceSha256: string;
      patchedRuntimeRoot: string;
      patchedRuntimePaths: string[];
      deterministicBuildId: string;
      deterministicDeploymentId: string;
      ownerOnlyAccessMode: string;
      productionAccessMode: string;
      productionPrivateSeedBytes: number;
      ownerOnlyPublicContextAllowed: boolean;
      productionPrivateSeedRequired: boolean;
      remoteBuildAllowed: boolean;
      rawSeedOrContextPersistenceAllowed: boolean;
      contextEncodingInOutputAllowed: boolean;
      archiveBoundaryVersion: string;
      normalBuildScriptsMayUseModeFlag: boolean;
      retirementRequiredBeforeAcceptance: boolean;
    };
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
    d1Binding: string | null;
    r2Binding: string | null;
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
const OPERATOR_REQUEST_MAX_MS = 60_000;
const MAX_SECRET_INPUT_BYTES = 16_384;

function stable(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
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

export function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0)!);
  const rightPoints = [...right].map((value) => value.codePointAt(0)!);
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

type QualificationBuildRole = "implementation" | "deployment";

const PRODUCTION_QUALIFICATION_MAX_LIFETIME_MS = 2 * 60 * 60 * 1000;

export function productionQualificationSeedCommitment(seed: Uint8Array): string {
  const qualification = attestationContract.buildIdentity.qualificationBuild;
  if (seed.byteLength !== qualification.productionPrivateSeedBytes) {
    throw new Error("production qualification seed has the wrong length");
  }
  return createHash("sha256")
    .update(qualification.seedCommitmentDomain, "utf8")
    .update(Buffer.from([0]))
    .update(seed)
    .digest("hex");
}

export function deriveProductionQualificationContext(
  seed: Uint8Array,
  transcriptHash: string
): Buffer {
  const qualification = attestationContract.buildIdentity.qualificationBuild;
  if (seed.byteLength !== qualification.productionPrivateSeedBytes || !/^[a-f0-9]{64}$/u.test(transcriptHash)) {
    throw new Error("production qualification context input is invalid");
  }
  return createHmac("sha256", seed)
    .update(Buffer.from(`${qualification.contextDomain}\0`, "utf8"))
    .update(Buffer.from(transcriptHash, "hex"))
    .digest();
}

export function qualificationContextCommitment(context: Uint8Array): string {
  const qualification = attestationContract.buildIdentity.qualificationBuild;
  if (context.byteLength !== 32) throw new Error("qualification context has the wrong length");
  return createHash("sha256")
    .update(qualification.contextCommitmentDomain, "utf8")
    .update(Buffer.from([0]))
    .update(context)
    .digest("hex");
}

function encodeHexBytes(value: Uint8Array): Buffer {
  const alphabet = Buffer.from("0123456789abcdef", "ascii");
  const output = Buffer.alloc(value.byteLength * 2);
  for (let index = 0; index < value.byteLength; index += 1) {
    const byte = value[index]!;
    output[index * 2] = alphabet[byte >>> 4]!;
    output[index * 2 + 1] = alphabet[byte & 0x0f]!;
  }
  return output;
}

function encodeBase64Bytes(value: Uint8Array): Buffer {
  const alphabet = Buffer.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "ascii");
  const output = Buffer.alloc(Math.ceil(value.byteLength / 3) * 4, "=".charCodeAt(0));
  let sourceOffset = 0;
  let outputOffset = 0;
  while (sourceOffset < value.byteLength) {
    const first = value[sourceOffset++]!;
    const hasSecond = sourceOffset < value.byteLength;
    const second = hasSecond ? value[sourceOffset++]! : 0;
    const hasThird = sourceOffset < value.byteLength;
    const third = hasThird ? value[sourceOffset++]! : 0;
    output[outputOffset++] = alphabet[first >>> 2]!;
    output[outputOffset++] = alphabet[((first & 0x03) << 4) | (second >>> 4)]!;
    if (hasSecond) output[outputOffset] = alphabet[((second & 0x0f) << 2) | (third >>> 6)]!;
    outputOffset += 1;
    if (hasThird) output[outputOffset] = alphabet[third & 0x3f]!;
    outputOffset += 1;
  }
  return output;
}

function encodeBase64UrlBytes(value: Uint8Array): Buffer {
  const standard = encodeBase64Bytes(value);
  let length = standard.byteLength;
  while (length > 0 && standard[length - 1] === "=".charCodeAt(0)) length -= 1;
  const output = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) {
    const byte = standard[index]!;
    output[index] = byte === "+".charCodeAt(0)
      ? "-".charCodeAt(0)
      : byte === "/".charCodeAt(0)
        ? "_".charCodeAt(0)
        : byte;
  }
  standard.fill(0);
  return output;
}

function upperAsciiHex(value: Uint8Array): Buffer | null {
  if (value.byteLength === 0) return null;
  const output = Buffer.alloc(value.byteLength);
  for (let index = 0; index < value.byteLength; index += 1) {
    const byte = value[index]!;
    if (byte >= 0x30 && byte <= 0x39) output[index] = byte;
    else if (byte >= 0x61 && byte <= 0x66) output[index] = byte - 0x20;
    else {
      output.fill(0);
      return null;
    }
  }
  return output;
}

function sensitiveMaterialMarkers(value: Uint8Array): Buffer[] {
  const raw = Buffer.from(value);
  const lowerHex = encodeHexBytes(value);
  const upperHex = Buffer.from(lowerHex);
  for (let index = 0; index < upperHex.byteLength; index += 1) {
    const byte = upperHex[index]!;
    if (byte >= 0x61 && byte <= 0x66) upperHex[index] = byte - 0x20;
  }
  const markers = [raw, lowerHex, upperHex, encodeBase64Bytes(value), encodeBase64UrlBytes(value)];
  const encodedAsciiUpper = upperAsciiHex(value);
  if (encodedAsciiUpper) markers.push(encodedAsciiUpper);
  return markers;
}

function qualificationDerivedCredentialMarkers(context: Buffer): Buffer[] {
  const qualification = attestationContract.buildIdentity.qualificationBuild;
  const prefix = Buffer.from(`${qualification.vinextCredentialDomainPrefix}\0`, "utf8");
  return qualification.derivedCredentialDomains.map(({ domain, bytes }) => {
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 32 || domain.length === 0) {
      throw new Error("qualification credential-domain contract is invalid");
    }
    const digest = Buffer.from(createHmac("sha256", context)
      .update(prefix)
      .update(domain, "utf8")
      .digest());
    try {
      return encodeHexBytes(digest.subarray(0, bytes));
    } finally {
      digest.fill(0);
    }
  });
}

function containsByteSequence(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.byteLength === 0 || needle.byteLength > haystack.byteLength) return false;
  const finalOffset = haystack.byteLength - needle.byteLength;
  for (let offset = 0; offset <= finalOffset; offset += 1) {
    let matches = true;
    for (let index = 0; index < needle.byteLength; index += 1) {
      if (haystack[offset + index] !== needle[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

export class ProductionQualificationCoordinator {
  readonly runId: string;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly seedCommitment: string;
  #seed: Buffer | null;
  readonly #transcriptHashes = new Set<string>();
  readonly #additionalSensitiveMaterial: Buffer[] = [];

  private constructor(seed: Buffer, now: Date, lifetimeMs: number) {
    if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs <= 0 || lifetimeMs > PRODUCTION_QUALIFICATION_MAX_LIFETIME_MS) {
      seed.fill(0);
      throw new Error("production qualification lifetime is invalid");
    }
    this.#seed = seed;
    this.runId = randomUUID();
    this.startedAt = now.toISOString();
    this.expiresAt = new Date(now.getTime() + lifetimeMs).toISOString();
    this.seedCommitment = productionQualificationSeedCommitment(seed);
  }

  static start(input: { now?: Date; lifetimeMs?: number } = {}): ProductionQualificationCoordinator {
    return new ProductionQualificationCoordinator(
      randomBytes(attestationContract.buildIdentity.qualificationBuild.productionPrivateSeedBytes),
      input.now ?? new Date(),
      input.lifetimeMs ?? PRODUCTION_QUALIFICATION_MAX_LIFETIME_MS
    );
  }

  deriveContext(transcriptHash: string, nowMs = Date.now()): Buffer {
    this.assertActive(nowMs);
    this.#transcriptHashes.add(transcriptHash);
    const seed = this.#seed!;
    return deriveProductionQualificationContext(seed, transcriptHash);
  }

  registerSensitiveMaterial(value: Uint8Array, nowMs = Date.now()): void {
    this.assertActive(nowMs);
    if (value.byteLength < 16 || value.byteLength > 4096) {
      throw new Error("production qualification sensitive material has an invalid length");
    }
    this.#additionalSensitiveMaterial.push(Buffer.from(value));
  }

  assertActive(nowMs = Date.now()): void {
    if (this.#seed === null) throw new Error("production qualification coordinator is closed");
    if (nowMs >= Date.parse(this.expiresAt)) throw new Error("production qualification coordinator expired");
  }

  assertEvidenceBytesSafe(
    bytes: Uint8Array,
    label: string,
    nowMs = Date.now(),
    options: { allowExpired?: boolean; allowDerivedQualificationCredential?: boolean } = {}
  ): void {
    if (options.allowExpired) {
      if (this.#seed === null) throw new Error("production qualification coordinator is closed");
    } else {
      this.assertActive(nowMs);
    }
    const seed = this.#seed!;
    const markers: Buffer[] = sensitiveMaterialMarkers(seed);
    try {
      for (const material of this.#additionalSensitiveMaterial) {
        markers.push(...sensitiveMaterialMarkers(material));
      }
      for (const transcriptHash of this.#transcriptHashes) {
        const context = deriveProductionQualificationContext(seed, transcriptHash);
        const contextMarkers = sensitiveMaterialMarkers(context);
        const derivedMarkers = options.allowDerivedQualificationCredential
          ? []
          : qualificationDerivedCredentialMarkers(context)
            .flatMap((marker) => {
              const encoded = sensitiveMaterialMarkers(marker);
              marker.fill(0);
              return encoded;
            });
        context.fill(0);
        markers.push(...contextMarkers, ...derivedMarkers);
      }
      if (markers.some((marker) => containsByteSequence(bytes, marker))) {
        throw new Error(`${label} exposes qualification material`);
      }
    } finally {
      markers.forEach((marker) => marker.fill(0));
    }
  }

  close(): void {
    this.#seed?.fill(0);
    this.#seed = null;
    this.#additionalSensitiveMaterial.forEach((material) => material.fill(0));
    this.#additionalSensitiveMaterial.length = 0;
    this.#transcriptHashes.clear();
  }
}

function isCanonicalTarChecksumField(
  checksumField: Uint8Array,
  digitCount: 6 | 7
): boolean {
  if (checksumField.byteLength !== 8) return false;
  const digits = checksumField.subarray(0, digitCount);
  if (!digits.every(
    (byte: number) => byte === 0x20 || (byte >= 0x30 && byte <= 0x37)
  )) return false;
  if (checksumField[digitCount] !== 0) return false;
  return digitCount === 7 || checksumField[7] === 0 || checksumField[7] === 0x20;
}

function looksLikeTarHeaderAt(bytes: Uint8Array, offset: number): boolean {
  if (offset < 0 || offset + 512 > bytes.byteLength) return false;
  const header = bytes.subarray(offset, offset + 512);
  if (!header.some((byte) => byte !== 0)) return false;
  const checksumField = Buffer.from(header.subarray(148, 156));
  if (
    !isCanonicalTarChecksumField(checksumField, 6) &&
    !isCanonicalTarChecksumField(checksumField, 7)
  ) return false;
  const checksumText = checksumField
    .toString("ascii")
    .replace(/^[\0 ]+|[\0 ]+$/gu, "");
  if (!/^[0-7]+$/u.test(checksumText)) return false;
  const recorded = Number.parseInt(checksumText, 8);
  let unsigned = 8 * 0x20;
  let signed = 8 * 0x20;
  for (let index = 0; index < header.byteLength; index += 1) {
    if (index >= 148 && index < 156) continue;
    const byte = header[index] ?? 0;
    unsigned += byte;
    signed += byte < 128 ? byte : byte - 256;
  }
  return recorded === unsigned || recorded === signed;
}

function containsTarHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 512) return false;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 148;
  let candidates = 0;
  while (cursor < buffer.byteLength) {
    const terminator = buffer.indexOf(0, cursor);
    if (terminator < 0) break;
    for (const digitCount of [6, 7]) {
      const checksumStart = terminator - digitCount;
      const headerOffset = checksumStart - 148;
      if (headerOffset < 0 || headerOffset + 512 > buffer.byteLength) continue;
      if (!isCanonicalTarChecksumField(
        buffer.subarray(checksumStart, checksumStart + 8),
        digitCount as 6 | 7
      )) continue;
      candidates += 1;
      if (candidates > 4096) return true;
      if (looksLikeTarHeaderAt(buffer, headerOffset)) return true;
    }
    cursor = terminator + 1;
  }
  return false;
}

export function nestedArchiveKind(path: string, bytes: Uint8Array): string | null {
  const lowerPath = path.replace(/[A-Z]/gu, (character) => character.toLowerCase());
  const suffixes = [
    ".7z", ".br", ".bz2", ".gz", ".rar", ".tar", ".tgz", ".txz", ".xz", ".zip", ".zst", ".zstd"
  ];
  const suffix = suffixes.find((value) => lowerPath.endsWith(value));
  if (suffix) return suffix.slice(1);
  if (containsTarHeader(bytes)) return "tar";
  const signatures: ReadonlyArray<readonly [kind: string, signature: Uint8Array]> = [
    // A gzip member includes the fixed DEFLATE compression-method byte.  A
    // two-byte prefix alone occurs naturally in compressed fonts and images.
    ["gzip", Buffer.from([0x1f, 0x8b, 0x08])],
    ["zip", Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    ["zip", Buffer.from([0x50, 0x4b, 0x05, 0x06])],
    ["zip", Buffer.from([0x50, 0x4b, 0x07, 0x08])],
    ...Array.from({ length: 9 }, (_unused, index) => [
      "bzip2",
      Buffer.from([0x42, 0x5a, 0x68, 0x31 + index])
    ] as const),
    ["xz", Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])],
    ["7z", Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
    ["rar", Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])],
    ["rar", Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])],
    ["zstd", Buffer.from([0x28, 0xb5, 0x2f, 0xfd])]
  ];
  for (const [kind, signature] of signatures) {
    if (containsByteSequence(bytes, signature)) return kind;
  }
  return null;
}

function exactOccurrenceCount(source: string, expected: string): number {
  if (expected.length === 0) throw new Error("empty exact-occurrence marker");
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(expected, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + expected.length;
  }
}

export function validateHostingTargetDocument(
  value: unknown,
  target: TrustedTarget
): HostingTargetEvidence {
  const hosting = requireRecord(value, "Sites hosting document");
  exactKeys(hosting, ["d1", "project_id", "r2"], "Sites hosting document");
  const projectId = requireString(hosting.project_id, "Sites hosting project id");
  const d1Binding = hosting.d1 === null ? null : requireString(hosting.d1, "Sites D1 binding");
  const r2Binding = hosting.r2 === null ? null : requireString(hosting.r2, "Sites R2 binding");
  if (
    projectId !== target.projectId ||
    d1Binding !== target.d1Binding ||
    r2Binding !== target.r2Binding
  ) throw new Error("Sites hosting document does not match the trusted target");
  return { projectId, d1Binding, r2Binding };
}

export function validateTrackedHostingTarget(
  repositoryRoot: string,
  target: TrustedTarget
): HostingTargetEvidence {
  const canonicalRoot = realpathSync(repositoryRoot);
  const hostingRelativePath = ".openai/hosting.json";
  const hostingPath = resolve(canonicalRoot, hostingRelativePath);
  if (!hostingPath.startsWith(`${canonicalRoot}${sep}`)) {
    throw new Error("Sites hosting path escapes its worktree");
  }
  const metadata = lstatSync(hostingPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(hostingPath) !== hostingPath) {
    throw new Error("Sites hosting document is not a canonical regular file");
  }
  let trackedPath: string;
  try {
    trackedPath = gitText(canonicalRoot, ["ls-files", "--error-unmatch", "--", hostingRelativePath]);
  } catch {
    throw new Error("Sites hosting document is not tracked");
  }
  if (trackedPath !== hostingRelativePath) {
    throw new Error("Sites hosting document is not tracked");
  }
  return validateHostingTargetDocument(
    JSON.parse(readFileSync(hostingPath, "utf8")) as unknown,
    target
  );
}

export function qualificationBuildContext(input: {
  repositoryRoot: string;
  pnpmExecutablePath: string;
  expectedCommit: string;
  expectedSourceAnchor: string;
  expectedReady: boolean;
  role: QualificationBuildRole;
  target: TrustedTarget;
  productionCoordinator?: ProductionQualificationCoordinator;
}): {
  context: Buffer;
  evidence: LocalBuildEvidence["qualificationBuild"];
  installedToolchain: BuildToolchainEvidence;
} {
  const qualification = attestationContract.buildIdentity.qualificationBuild;
  if (
    !qualification.ownerOnlyPublicContextAllowed ||
    !qualification.productionPrivateSeedRequired ||
    qualification.remoteBuildAllowed ||
    qualification.rawSeedOrContextPersistenceAllowed ||
    qualification.contextEncodingInOutputAllowed ||
    qualification.normalBuildScriptsMayUseModeFlag ||
    !qualification.retirementRequiredBeforeAcceptance ||
    input.target.loopbackFixture
  ) throw new Error("qualification build policy is not fail closed");
  const ownerOnlyMode = input.target.accessMode === qualification.ownerOnlyAccessMode &&
    input.productionCoordinator === undefined;
  const productionMode = input.target.accessMode === qualification.productionAccessMode &&
    input.productionCoordinator !== undefined;
  if (!ownerOnlyMode && !productionMode) {
    throw new Error("qualification build target and entropy mode do not match");
  }
  const canonicalRoot = realpathSync(input.repositoryRoot);
  validateTrackedHostingTarget(canonicalRoot, input.target);
  const patchPath = resolve(canonicalRoot, qualification.patchPath);
  if (!patchPath.startsWith(`${canonicalRoot}${sep}`)) throw new Error("qualification patch escapes its worktree");
  const patchMetadata = lstatSync(patchPath);
  if (!patchMetadata.isFile() || patchMetadata.isSymbolicLink()) {
    throw new Error("qualification patch is not a regular tracked file");
  }
  const patchSha256 = sha256(readFileSync(patchPath));
  if (patchSha256 !== qualification.patchSha256 || patchSha256 !== qualification.pnpmPatchHash) {
    throw new Error("qualification patch hash does not match the frozen contract");
  }
  const workspaceSource = readFileSync(resolve(canonicalRoot, "pnpm-workspace.yaml"), "utf8");
  const lockSource = readFileSync(resolve(canonicalRoot, "pnpm-lock.yaml"), "utf8");
  const workspaceMapping = `vinext@${qualification.vinextVersion}: ${qualification.patchPath}`;
  const lockMapping = `vinext@${qualification.vinextVersion}: ${qualification.pnpmPatchHash}`;
  if (
    exactOccurrenceCount(workspaceSource, workspaceMapping) !== 1 ||
    exactOccurrenceCount(lockSource, lockMapping) !== 1
  ) throw new Error("qualification patch mapping is not uniquely frozen");
  const packageSource = readFileSync(resolve(canonicalRoot, "package.json"), "utf8");
  if (packageSource.includes(qualification.modeFlag)) {
    throw new Error("normal package scripts enable the qualification build mode");
  }
  const nextConfigSource = readFileSync(resolve(canonicalRoot, "next.config.ts"), "utf8");
  if (
    exactOccurrenceCount(
      nextConfigSource,
      `generateBuildId: async () => "${qualification.deterministicBuildId}"`
    ) !== 1 ||
    exactOccurrenceCount(
      nextConfigSource,
      `deploymentId: "${qualification.deterministicDeploymentId}"`
    ) !== 1
  ) throw new Error("qualification bridge does not freeze supported build identities");
  const installedRoot = realpathSync(resolve(canonicalRoot, "node_modules/vinext"));
  const runtimeRecords = qualification.patchedRuntimePaths.map((relativePath) => {
    const path = resolve(installedRoot, relativePath);
    if (!path.startsWith(`${installedRoot}${sep}`)) throw new Error("patched runtime path escapes Vinext");
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("patched runtime path is not a regular file");
    const bytes = readFileSync(path);
    return { path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
  const patchedRuntimeRoot = sha256(stableJson(runtimeRecords));
  if (patchedRuntimeRoot !== qualification.patchedRuntimeRoot) {
    throw new Error("installed Vinext qualification runtime differs from the pinned patch");
  }
  const installedPackage = JSON.parse(readFileSync(resolve(installedRoot, "package.json"), "utf8")) as {
    name?: unknown;
    version?: unknown;
  };
  if (installedPackage.name !== "vinext" || installedPackage.version !== qualification.vinextVersion) {
    throw new Error("installed Vinext package identity mismatch");
  }
  const vinextCliPath = resolve(installedRoot, "dist/cli.js");
  const vinextCliMetadata = lstatSync(vinextCliPath);
  if (!vinextCliMetadata.isFile() || vinextCliMetadata.isSymbolicLink()) {
    throw new Error("installed Vinext CLI is not a regular file");
  }
  const installedToolchain = buildInstalledToolchainEvidence({
    root: canonicalRoot,
    nodeExecutablePath: process.execPath,
    pnpmExecutablePath: input.pnpmExecutablePath,
    expectedSystemExecutables: qualification.systemExecutables,
    expectedPlatformIdentity: qualification.platformIdentity
  });
  if (
    qualification.installedToolchainClosureVersion !== OS01_BUILD_TOOLCHAIN_EVIDENCE_VERSION ||
    installedToolchain.version !== qualification.installedToolchainClosureVersion ||
    installedToolchain.closureRoot !== qualification.installedToolchainClosureRoot ||
    installedToolchain.packageCount !== qualification.installedToolchainPackageCount ||
    stableJson(installedToolchain.systemExecutables) !== stableJson(qualification.systemExecutables) ||
    stableJson(installedToolchain.platformIdentity) !== stableJson(qualification.platformIdentity) ||
    stableJson(installedToolchain.authorityLoader) !== stableJson(qualification.authorityLoader) ||
    installedToolchain.node.version !== qualification.nodeVersion ||
    installedToolchain.node.sha256 !== qualification.nodeExecutableSha256 ||
    installedToolchain.pnpm.version !== qualification.pnpmVersion ||
    installedToolchain.pnpm.sha256 !== qualification.pnpmExecutableSha256 ||
    installedToolchain.lockfile.sha256 !== qualification.lockfileSha256 ||
    installedToolchain.workspace.sha256 !== qualification.workspaceSha256 ||
    installedToolchain.patches.length !== 1 ||
    installedToolchain.patches[0]?.sha256 !== patchSha256
  ) throw new Error("installed build-toolchain closure differs from the frozen contract");
  const toolchainRoot = sha256(stableJson({
    version: qualification.version,
    installedToolchainClosureRoot: installedToolchain.closureRoot,
    vinextVersion: qualification.vinextVersion,
    patchSha256,
    patchedRuntimeRoot,
    pnpmPatchHash: qualification.pnpmPatchHash
  }));
  const transcriptHash = sha256(stableJson({
    version: qualification.version,
    derivation: qualification.contextDerivation,
    domain: qualification.contextDomain,
    role: input.role,
    expectedCommit: input.expectedCommit,
    expectedSourceAnchor: input.expectedSourceAnchor,
    expectedReady: input.expectedReady,
    authorityAttestationHash: sha256(readFileSync(resolve(root, "config/os01-census-attestation.v1.json"))),
    target: {
      projectId: input.target.projectId,
      origin: input.target.origin,
      accessMode: input.target.accessMode
    },
    deterministicBuildId: qualification.deterministicBuildId,
    deterministicDeploymentId: qualification.deterministicDeploymentId,
    toolchainRoot,
    coordinatorRunId: input.productionCoordinator?.runId ?? null
  }));
  const context = productionMode
    ? input.productionCoordinator!.deriveContext(transcriptHash)
    : createHash("sha256")
      .update(qualification.contextDomain, "utf8")
      .update(Buffer.from([0]))
      .update(Buffer.from(transcriptHash, "hex"))
      .digest();
  const mode = productionMode ? "public_production_private_seed" : "owner_only_public_context";
  return {
    context,
    installedToolchain,
    evidence: {
      version: qualification.version,
      role: input.role,
      mode,
      runId: input.productionCoordinator?.runId ?? null,
      seedCommitment: input.productionCoordinator?.seedCommitment ?? null,
      contextCommitment: qualificationContextCommitment(context),
      transcriptHash,
      toolchainRoot,
      installedToolchainClosureRoot: installedToolchain.closureRoot,
      installedToolchainPackageCount: installedToolchain.packageCount,
      nodeVersion: installedToolchain.node.version,
      nodeExecutableSha256: installedToolchain.node.sha256,
      pnpmVersion: installedToolchain.pnpm.version,
      pnpmExecutableSha256: installedToolchain.pnpm.sha256,
      lockfileSha256: installedToolchain.lockfile.sha256,
      workspaceSha256: installedToolchain.workspace.sha256,
      vinextVersion: qualification.vinextVersion,
      patchSha256,
      targetProjectId: input.target.projectId,
      targetAccessMode: input.target.accessMode
    }
  };
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

function localArchiveIdentity(metadata: {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}): LocalArchiveFileIdentity {
  return {
    dev: metadata.dev,
    ino: metadata.ino,
    size: metadata.size,
    mtimeNs: metadata.mtimeNs,
    ctimeNs: metadata.ctimeNs
  };
}

function sameLocalArchiveIdentity(
  left: LocalArchiveFileIdentity,
  right: LocalArchiveFileIdentity
): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function readExactDescriptorBytes(
  descriptor: number,
  expectedBytes: number,
  label: string
): Buffer {
  const bytes = Buffer.allocUnsafe(expectedBytes);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
    if (count === 0) {
      bytes.fill(0);
      throw new Error(`${label} ended before its bound size`);
    }
    offset += count;
  }
  const trailing = Buffer.alloc(1);
  try {
    if (readSync(descriptor, trailing, 0, 1, expectedBytes) !== 0) {
      bytes.fill(0);
      throw new Error(`${label} grew beyond its bound size`);
    }
  } finally {
    trailing.fill(0);
  }
  return bytes;
}

function equalLocalArchiveBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

/**
 * One process-held archive object. All qualification consumers receive copies
 * of these exact bytes, while pathname and descriptor identity remain fenced.
 */
export class ImmutableLocalArchiveSnapshot {
  readonly path: string;
  readonly archiveBytes: number;
  readonly archiveSha256: string;
  readonly #identity: LocalArchiveFileIdentity;
  readonly #snapshotBytes: Buffer;
  #descriptor: number;

  private constructor(input: {
    path: string;
    descriptor: number;
    identity: LocalArchiveFileIdentity;
    bytes: Buffer;
  }) {
    this.path = input.path;
    this.#descriptor = input.descriptor;
    this.#identity = input.identity;
    this.#snapshotBytes = input.bytes;
    this.archiveBytes = input.bytes.byteLength;
    this.archiveSha256 = sha256(input.bytes);
  }

  static open(pathInput: string): ImmutableLocalArchiveSnapshot {
    const requestedInput = resolve(pathInput);
    const inputMetadata = lstatSync(requestedInput, { bigint: true });
    if (!inputMetadata.isFile() || inputMetadata.isSymbolicLink()) {
      throw new Error("deployment archive is not a canonical regular file");
    }
    const requested = realpathSync(requestedInput);
    const before = lstatSync(requested, { bigint: true });
    if (
      !before.isFile() || before.isSymbolicLink() ||
      !sameLocalArchiveIdentity(localArchiveIdentity(inputMetadata), localArchiveIdentity(before))
    ) {
      throw new Error("deployment archive is not a canonical regular file");
    }
    const descriptor = openSync(requested, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = fstatSync(descriptor, { bigint: true });
      const beforeIdentity = localArchiveIdentity(before);
      const openedIdentity = localArchiveIdentity(opened);
      if (
        !opened.isFile() || !sameLocalArchiveIdentity(beforeIdentity, openedIdentity) ||
        opened.size <= 0n || opened.size > BigInt(MAX_DEPLOYMENT_ARCHIVE_BYTES)
      ) throw new Error("deployment archive changed while it was opened");
      const firstRead = readExactDescriptorBytes(descriptor, Number(opened.size), "deployment archive");
      const secondRead = readExactDescriptorBytes(descriptor, Number(opened.size), "deployment archive");
      if (!equalLocalArchiveBytes(firstRead, secondRead)) {
        firstRead.fill(0);
        secondRead.fill(0);
        throw new Error("deployment archive changed while it was snapshotted");
      }
      secondRead.fill(0);
      const after = fstatSync(descriptor, { bigint: true });
      const pathAfter = lstatSync(requested, { bigint: true });
      if (
        !sameLocalArchiveIdentity(openedIdentity, localArchiveIdentity(after)) ||
        !sameLocalArchiveIdentity(openedIdentity, localArchiveIdentity(pathAfter)) ||
        realpathSync(requested) !== requested
      ) {
        firstRead.fill(0);
        throw new Error("deployment archive changed while it was snapshotted");
      }
      return new ImmutableLocalArchiveSnapshot({
        path: requested,
        descriptor,
        identity: openedIdentity,
        bytes: firstRead
      });
    } catch (error: unknown) {
      closeSync(descriptor);
      throw error;
    }
  }

  assertUnchanged(): void {
    if (this.#descriptor < 0) throw new Error("deployment archive snapshot is closed");
    const opened = fstatSync(this.#descriptor, { bigint: true });
    const pathname = lstatSync(this.path, { bigint: true });
    if (
      !opened.isFile() || !pathname.isFile() || pathname.isSymbolicLink() ||
      !sameLocalArchiveIdentity(this.#identity, localArchiveIdentity(opened)) ||
      !sameLocalArchiveIdentity(this.#identity, localArchiveIdentity(pathname)) ||
      realpathSync(this.path) !== this.path
    ) throw new Error("deployment archive snapshot path or file identity changed");
    const current = readExactDescriptorBytes(this.#descriptor, this.archiveBytes, "deployment archive snapshot");
    try {
      if (!equalLocalArchiveBytes(current, this.#snapshotBytes)) {
        throw new Error("deployment archive snapshot bytes changed");
      }
    } finally {
      current.fill(0);
    }
  }

  consumeExactBytes<T>(consumer: (bytes: Buffer) => T): T {
    this.assertUnchanged();
    const bytes = Buffer.from(this.#snapshotBytes);
    try {
      return consumer(bytes);
    } finally {
      bytes.fill(0);
      this.assertUnchanged();
    }
  }

  sameFileObject(other: ImmutableLocalArchiveSnapshot): boolean {
    if (this.#descriptor < 0 || other.#descriptor < 0) {
      throw new Error("deployment archive snapshot is closed");
    }
    const left = localArchiveIdentity(fstatSync(this.#descriptor, { bigint: true }));
    const right = localArchiveIdentity(fstatSync(other.#descriptor, { bigint: true }));
    return left.dev === right.dev && left.ino === right.ino;
  }

  hasExactBytes(other: ImmutableLocalArchiveSnapshot): boolean {
    if (this.#descriptor < 0 || other.#descriptor < 0) {
      throw new Error("deployment archive snapshot is closed");
    }
    return equalLocalArchiveBytes(this.#snapshotBytes, other.#snapshotBytes);
  }

  close(): void {
    if (this.#descriptor < 0) return;
    closeSync(this.#descriptor);
    this.#descriptor = -1;
    this.#snapshotBytes.fill(0);
  }
}

function withLocalArchiveSnapshot<T>(
  input: string | ImmutableLocalArchiveSnapshot,
  consumer: (snapshot: ImmutableLocalArchiveSnapshot) => T
): T {
  if (input instanceof ImmutableLocalArchiveSnapshot) {
    input.assertUnchanged();
    return consumer(input);
  }
  const snapshot = ImmutableLocalArchiveSnapshot.open(input);
  try {
    return consumer(snapshot);
  } finally {
    snapshot.close();
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

export function assertFrozenQualificationSystemExecutable(
  id: (typeof OS01_QUALIFICATION_SYSTEM_EXECUTABLES)[number]["id"]
): string {
  const specification = OS01_QUALIFICATION_SYSTEM_EXECUTABLES.find((entry) => entry.id === id);
  const frozen = attestationContract.buildIdentity.qualificationBuild.systemExecutables.find(
    (entry) => entry.id === id
  );
  if (
    specification === undefined ||
    frozen === undefined ||
    stableJson(
      attestationContract.buildIdentity.qualificationBuild.systemExecutables.map(
        (entry) => ({
          id: entry.id,
          path: entry.path,
          resourceTrees: entry.resourceTrees.map((resource) => ({ id: resource.id, path: resource.path }))
        })
      )
    ) !== stableJson(OS01_QUALIFICATION_SYSTEM_EXECUTABLES.map((entry) => ({
      id: entry.id,
      path: entry.path,
      resourceTrees: [...entry.resourceTrees]
    }))) ||
    stableJson(measureSystemExecutable(specification, frozen)) !== stableJson(frozen)
  ) {
    throw new Error(`${id} system executable differs from the frozen qualification contract`);
  }
  return specification.path;
}

export function assertFrozenQualificationAuthorityProcess(repositoryRoot: string): void {
  const qualification = attestationContract.buildIdentity.qualificationBuild;
  assertFrozenAuthorityLoaderProcess({
    root: repositoryRoot,
    nodeExecutableSha256: qualification.nodeExecutableSha256,
    authorityLoader: qualification.authorityLoader
  });
}

export const OS01_QUALIFICATION_PYTHON_FLAGS = Object.freeze([
  "-I", "-S", "-B", "-X", "utf8"
]);

const QUALIFICATION_GIT_ENVIRONMENT = Object.freeze({
  GIT_ATTR_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_EXEC_PATH: "/dev/null/os01-no-git-helpers",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_PAGER: "",
  GIT_TERMINAL_PROMPT: "0",
  HOME: "/var/empty",
  LANG: "C",
  LC_ALL: "C",
  NODE_ENV: "production",
  PATH: "/dev/null",
  TZ: "UTC",
  XDG_CONFIG_HOME: "/var/empty"
});

const QUALIFICATION_GIT_ARGUMENT_PREFIX = Object.freeze([
  "--exec-path=/dev/null/os01-no-git-helpers",
  "--no-pager",
  "-c", "core.fsmonitor=false",
  "-c", "core.hooksPath=/dev/null"
]);

function qualificationGitArguments(args: string[]): string[] {
  const commandArguments = args[0] === "diff"
    ? ["diff", "--no-ext-diff", ...args.slice(1)]
    : args;
  return [...QUALIFICATION_GIT_ARGUMENT_PREFIX, ...commandArguments];
}

function gitText(repositoryRoot: string, args: string[]): string {
  const gitExecutable = assertFrozenQualificationSystemExecutable("git");
  return execFileSync(gitExecutable, qualificationGitArguments(args), {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: QUALIFICATION_GIT_ENVIRONMENT,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function gitBytes(repositoryRoot: string, args: string[]): Uint8Array {
  const gitExecutable = assertFrozenQualificationSystemExecutable("git");
  return execFileSync(gitExecutable, qualificationGitArguments(args), {
    cwd: repositoryRoot,
    encoding: "buffer",
    env: QUALIFICATION_GIT_ENVIRONMENT,
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
  if (
    implementationCommit !== implementationCommitInput ||
    implementationCommit !== bridgeFoundation.requiredImplementationCommit
  ) throw new Error("implementation commit is not the exact frozen C0 bridge");
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
  if (
    implementationTreeObjectId !== bridgeFoundation.requiredImplementationTreeObjectId ||
    implementationArchiveSha256 !== bridgeFoundation.requiredImplementationArchiveSha256 ||
    implementationArchive.byteLength !== bridgeFoundation.requiredImplementationArchiveBytes
  ) throw new Error("implementation tree bytes are not the exact frozen C0 bridge");
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
  if (
    implementationCommit !== implementationCommitInput ||
    implementationCommit !== bridgeFoundation.requiredImplementationCommit ||
    deploymentCommit !== deploymentCommitInput
  ) {
    throw new Error("Git commit input is not the exact frozen C0/C1 chain");
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
  if (
    implementationTreeObjectId !== bridgeFoundation.requiredImplementationTreeObjectId ||
    implementationArchiveSha256 !== bridgeFoundation.requiredImplementationArchiveSha256 ||
    implementationArchive.byteLength !== bridgeFoundation.requiredImplementationArchiveBytes
  ) throw new Error("implementation tree bytes are not the exact frozen C0 bridge");
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
  entryStaticClosure: { root: string; fileCount: number },
  qualificationBuild: LocalBuildEvidence["qualificationBuild"],
  forbiddenContextMarkers: readonly Buffer[],
  clientForbiddenDerivedMarkers: readonly Buffer[]
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
        if (forbiddenContextMarkers.some((marker) => containsByteSequence(bytes, marker))) {
          throw new Error("qualification build context leaked into output bytes");
        }
        if (relativePath.startsWith("client/") &&
          clientForbiddenDerivedMarkers.some((marker) => containsByteSequence(bytes, marker))) {
          throw new Error("qualification-derived server credential leaked into public client bytes");
        }
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
    entryStaticFileCount: entryStaticClosure.fileCount,
    qualificationBuild
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

export function expectedPackageManifest(
  repositoryRoot: string,
  target?: TrustedTarget
): PackageManifestEvidence {
  if (target !== undefined) validateTrackedHostingTarget(repositoryRoot, target);
  const records = new Map<string, { path: string; bytes: number; sha256: string }>();
  const addRecord = (outputPath: string, bytes: Buffer): void => {
    const record = { path: outputPath, bytes: bytes.byteLength, sha256: sha256(bytes) };
    const existing = records.get(outputPath);
    if (existing !== undefined) {
      if (stableJson(existing) !== stableJson(record)) {
        throw new Error(`package path collision contains different bytes: ${outputPath}`);
      }
      return;
    }
    records.set(outputPath, record);
  };
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
          addRecord(outputPath, bytes);
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
  addRecord(".openai/hosting.json", hostingBytes);
  const drizzleRoot = resolve(repositoryRoot, "drizzle");
  if (existsSync(drizzleRoot)) addTree(drizzleRoot, ".openai/drizzle");
  const sorted = [...records.values()].sort((left, right) => compareUnicodeCodePoints(left.path, right.path));
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
  expectedReady: boolean,
  target: TrustedTarget,
  role: QualificationBuildRole,
  pnpmExecutablePath: string,
  productionCoordinator?: ProductionQualificationCoordinator
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
  const qualification = qualificationBuildContext({
    repositoryRoot: canonicalRoot,
    pnpmExecutablePath,
    expectedCommit,
    expectedSourceAnchor,
    expectedReady,
    role,
    target,
    productionCoordinator
  });
  const vinextCliPath = resolve(canonicalRoot, "node_modules/vinext/dist/cli.js");
  const contextMarkers = [
    Buffer.from(qualification.context),
    encodeHexBytes(qualification.context),
    encodeBase64Bytes(qualification.context)
  ];
  const derivedCredentialMarkers = qualificationDerivedCredentialMarkers(qualification.context);
  try {
    const installedToolchainBeforeBuild = buildInstalledToolchainEvidence({
      root: canonicalRoot,
      nodeExecutablePath: process.execPath,
      pnpmExecutablePath,
      expectedSystemExecutables:
        attestationContract.buildIdentity.qualificationBuild.systemExecutables,
      expectedPlatformIdentity:
        attestationContract.buildIdentity.qualificationBuild.platformIdentity
    });
    assertBuildToolchainEvidenceUnchanged(
      qualification.installedToolchain,
      installedToolchainBeforeBuild
    );
    const build = spawnSync(
      process.execPath,
      [vinextCliPath, "build", attestationContract.buildIdentity.qualificationBuild.modeFlag],
      {
        cwd: canonicalRoot,
        input: qualification.context,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
          NODE_ENV: "production",
          CI: "1",
          WRANGLER_LOG_PATH: "/dev/null"
        }
      }
    );
    qualification.context.fill(0);
    const installedToolchainAfterBuild = buildInstalledToolchainEvidence({
      root: canonicalRoot,
      nodeExecutablePath: process.execPath,
      pnpmExecutablePath,
      expectedSystemExecutables:
        attestationContract.buildIdentity.qualificationBuild.systemExecutables,
      expectedPlatformIdentity:
        attestationContract.buildIdentity.qualificationBuild.platformIdentity
    });
    assertBuildToolchainEvidenceUnchanged(
      installedToolchainBeforeBuild,
      installedToolchainAfterBuild
    );
    const stdout = build.stdout instanceof Uint8Array ? build.stdout : Buffer.alloc(0);
    const stderr = build.stderr instanceof Uint8Array ? build.stderr : Buffer.alloc(0);
    const persistedMarkers = [...contextMarkers, ...derivedCredentialMarkers];
    if (persistedMarkers.some((marker) =>
      containsByteSequence(stdout, marker) || containsByteSequence(stderr, marker))) {
      throw new Error(`${label} build log exposed qualification entropy`);
    }
    if (build.error || build.status !== 0 || build.signal !== null) {
      throw new Error(`${label} qualification build failed without publishing its captured output`);
    }
    if (gitText(canonicalRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
      throw new Error(`${label} build changed tracked or untracked source state`);
    }
    const pythonExecutable = assertFrozenQualificationSystemExecutable("python3");
    const activeBuildGraphBytes = execFileSync(pythonExecutable, [...OS01_QUALIFICATION_PYTHON_FLAGS,
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
    }, sha256(stableJson(entryCarrier)), entryStaticClosure, qualification.evidence,
    contextMarkers, derivedCredentialMarkers);
  } finally {
    qualification.context.fill(0);
    contextMarkers.forEach((marker) => marker.fill(0));
    derivedCredentialMarkers.forEach((marker) => marker.fill(0));
  }
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
  pnpmExecutablePath: string;
  target: TrustedTarget;
  productionCoordinator?: ProductionQualificationCoordinator;
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
    false,
    input.target,
    "implementation",
    input.pnpmExecutablePath,
    input.productionCoordinator
  );
  const secondBuild = freshBuildEvidence(
    secondRoot,
    input.implementationCommit,
    "second C0 preparation build",
    placeholderAnchor,
    false,
    input.target,
    "implementation",
    input.pnpmExecutablePath,
    input.productionCoordinator
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

export function constructDeploymentProof(
  input: DeploymentProofConstructionInput
): Record<string, unknown> {
  exactKeys(requireRecord(input, "deployment proof input"), [
    "access", "deployment", "deploymentBuild", "gitEvidence", "localArchive",
    "observedAt", "packageManifest", "qualificationArchiveBoundary", "sitesVersion",
    "sourceAnchorEvidence", "target", "uploader"
  ], "deployment proof input");
  exactKeys(requireRecord(input.access, "access projection"), [
    "accessMode", "allowedAccountUserCount", "allowedUserCount", "currentUserRole",
    "editorCount", "externalVisitorCount", "groupCount", "nonOwnerUserCount",
    "observedAt", "origin", "ownerRoleCount", "principalRoot", "projectId", "revision",
    "tenantGroupCount", "version", "workspaceGroupCount"
  ], "access projection");
  exactKeys(requireRecord(input.sitesVersion, "version projection"), [
    "archiveContentHash", "archiveFileCount", "archiveFormat", "archiveSizeBytes",
    "observedAt", "projectId", "sourceCommit", "version", "versionId", "versionNumber"
  ], "version projection");
  exactKeys(requireRecord(input.deployment, "deployment projection"), [
    "deploymentId", "environmentRevision", "observedAt", "origin", "projectId", "status",
    "type", "updatedAt", "version", "versionId"
  ], "deployment projection");
  exactKeys(requireRecord(input.sourceAnchorEvidence, "source-anchor evidence"), [
    "authorityBridgeCodeRelation", "authorityEvidence", "bridgeImplementation",
    "implementationBuild", "sourceAnchor"
  ], "source-anchor evidence");

  const observedAt = requireString(input.observedAt, "deployment proof observation time");
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) throw new Error("deployment proof observation time is invalid");
  for (const [label, projectedAt] of [
    ["access", input.access.observedAt],
    ["version", input.sitesVersion.observedAt],
    ["deployment", input.deployment.observedAt],
    ["uploader", input.uploader.observedAt]
  ] as const) {
    try {
      validateDeploymentProofFreshness(projectedAt, observedMs);
    } catch {
      throw new Error(`${label} projection is not contemporaneous with the deployment proof`);
    }
  }
  if (input.target.loopbackFixture) {
    throw new Error("deployment proof target cannot be a loopback fixture");
  }
  const qualificationPolicy = attestationContract.buildIdentity.qualificationBuild;
  if (input.target.accessMode === qualificationPolicy.ownerOnlyAccessMode) {
    validateOwnerOnlyAccess(input.access);
  } else if (input.target.accessMode === qualificationPolicy.productionAccessMode) {
    validatePublicProductionAccess(input.access);
  } else {
    throw new Error("deployment proof target has an unsupported access mode");
  }
  if (
    input.access.version !== os01ControlPlaneContract.version ||
    input.sitesVersion.version !== os01ControlPlaneContract.version ||
    input.deployment.version !== os01ControlPlaneContract.version ||
    input.access.projectId !== input.target.projectId ||
    input.access.origin !== input.target.origin ||
    input.sitesVersion.projectId !== input.target.projectId ||
    input.deployment.projectId !== input.target.projectId ||
    input.deployment.origin !== input.target.origin ||
    input.sitesVersion.sourceCommit !== input.gitEvidence.deploymentCommit ||
    input.deployment.versionId !== input.sitesVersion.versionId ||
    input.deployment.status !== "succeeded" ||
    input.deployment.type !== "publish"
  ) throw new Error("sanitized control-plane projections do not match the trusted deployment");

  const expectedBridgeImplementation: BridgeImplementationEvidence = {
    liveBaseCommit: input.gitEvidence.liveBaseCommit,
    liveBaseTreeObjectId: input.gitEvidence.liveBaseTreeObjectId,
    liveBaseToImplementationNameStatus: input.gitEvidence.liveBaseToImplementationNameStatus,
    implementationCommit: input.gitEvidence.implementationCommit,
    implementationTreeObjectId: input.gitEvidence.implementationTreeObjectId,
    implementationArchiveSha256: input.gitEvidence.implementationArchiveSha256,
    implementationArchiveBytes: input.gitEvidence.implementationArchiveBytes,
    sourceTreeAnchor: input.gitEvidence.sourceTreeAnchor
  };
  if (stableJson(input.sourceAnchorEvidence.bridgeImplementation) !== stableJson(expectedBridgeImplementation)) {
    throw new Error("source-anchor bridge evidence does not match the deployment successor");
  }
  const computedSourceAnchor = computeSourceAnchor(
    input.gitEvidence,
    input.sourceAnchorEvidence.implementationBuild,
    input.sourceAnchorEvidence.authorityEvidence,
    input.sourceAnchorEvidence.authorityBridgeCodeRelation
  );
  if (computedSourceAnchor !== input.sourceAnchorEvidence.sourceAnchor) {
    throw new Error("source-anchor evidence does not recompute");
  }
  if (stableJson(input.gitEvidence.implementationToDeploymentDiff) !== stableJson(
    attestationContract.requiredImplementationToDeploymentDiff
  )) throw new Error("deployment successor diff does not match the frozen contract");

  validateQualificationBuildEvidence(
    input.sourceAnchorEvidence.implementationBuild.qualificationBuild,
    "implementation qualification build",
    "implementation",
    input.target
  );
  validateQualificationBuildEvidence(
    input.deploymentBuild.qualificationBuild,
    "deployment qualification build",
    "deployment",
    input.target
  );
  const implementationQualification = input.sourceAnchorEvidence.implementationBuild.qualificationBuild;
  const deploymentQualification = input.deploymentBuild.qualificationBuild;
  const qualificationArchiveBoundary = validateQualificationArchiveBoundaryEvidence(
    input.qualificationArchiveBoundary,
    input.localArchive,
    deploymentQualification
  );
  if (deploymentQualification.contextCommitment === implementationQualification.contextCommitment) {
    throw new Error("implementation and deployment qualification contexts are not domain-separated");
  }
  if (
    deploymentQualification.mode !== implementationQualification.mode ||
    deploymentQualification.runId !== implementationQualification.runId ||
    deploymentQualification.seedCommitment !== implementationQualification.seedCommitment
  ) throw new Error("implementation and deployment builds do not share one qualification session");
  if (deploymentQualification.transcriptHash === implementationQualification.transcriptHash) {
    throw new Error("implementation and deployment transcripts are not role-separated");
  }
  if (input.deploymentBuild.fileCount < 1 || input.packageManifest.fileCount < 1 || input.localArchive.fileCount < 1) {
    throw new Error("deployment build or package evidence is empty");
  }
  for (const [label, value] of [
    ["deployment build input root", input.gitEvidence.buildInputRoot],
    ["deployment dist root", input.deploymentBuild.distRoot],
    ["deployment dist file-list root", input.deploymentBuild.archiveFileListRoot],
    ["local archive hash", input.localArchive.archiveSha256],
    ["local archive content root", input.localArchive.contentRoot],
    ["local archive file-list root", input.localArchive.fileListRoot],
    ["package content root", input.packageManifest.contentRoot],
    ["package file-list root", input.packageManifest.fileListRoot]
  ] as const) requireHex(value, label);

  const sourceIdentity = {
    authorityEvidence: input.sourceAnchorEvidence.authorityEvidence,
    authorityBridgeCodeRelation: input.sourceAnchorEvidence.authorityBridgeCodeRelation,
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
    implementationBuild: input.sourceAnchorEvidence.implementationBuild,
    sourceAnchor: computedSourceAnchor,
    buildInputRoot: input.gitEvidence.buildInputRoot
  };
  validateHostedSourceIdentity({
    sourceIdentity,
    gitEvidence: input.gitEvidence,
    implementationBuild: input.sourceAnchorEvidence.implementationBuild,
    authorityEvidence: input.sourceAnchorEvidence.authorityEvidence,
    authorityBridgeCodeRelation: input.sourceAnchorEvidence.authorityBridgeCodeRelation
  });

  const build = {
    activeBuildGraphHash: input.deploymentBuild.activeBuildGraphHash,
    activeSourceFilesScanned: input.deploymentBuild.activeSourceFilesScanned,
    activeBuildFilesScanned: input.deploymentBuild.activeBuildFilesScanned,
    buildInputRoot: input.gitEvidence.buildInputRoot,
    builtWorkerHash: input.deploymentBuild.builtWorkerHash,
    compiledAnchorCarrierRoot: input.deploymentBuild.compiledAnchorCarrierRoot,
    entryStaticClosureRoot: input.deploymentBuild.entryStaticClosureRoot,
    entryStaticFileCount: input.deploymentBuild.entryStaticFileCount,
    distRoot: input.deploymentBuild.distRoot,
    distFileListRoot: input.deploymentBuild.archiveFileListRoot,
    distFileCount: input.deploymentBuild.fileCount,
    localArchiveFormat: attestationContract.buildIdentity.localArchiveFormat,
    localArchiveSha256: input.localArchive.archiveSha256,
    localArchiveBytes: input.localArchive.archiveBytes,
    localArchiveFileListRoot: input.localArchive.fileListRoot,
    localArchiveContentRoot: input.localArchive.contentRoot,
    localArchiveFileCount: input.localArchive.fileCount,
    packageContentRoot: input.packageManifest.contentRoot,
    packageFileListRoot: input.packageManifest.fileListRoot,
    packageFileCount: input.packageManifest.fileCount,
    qualificationBuild: input.deploymentBuild.qualificationBuild,
    qualificationArchiveBoundary,
    sitesArchiveContentHash: input.sitesVersion.archiveContentHash
  };
  validateArchivePackageBinding({
    archive: input.localArchive,
    packageManifest: input.packageManifest,
    proofBuild: build
  });
  if (
    input.sitesVersion.archiveFileCount !== input.packageManifest.fileCount ||
    input.sitesVersion.archiveFormat !== attestationContract.buildIdentity.sitesArchiveFormat
  ) throw new Error("Sites archive projection does not match the local package manifest");
  validateTrustedUploaderAssertion(input.uploader, input.sitesVersion, {
    archiveSha256: input.localArchive.archiveSha256,
    archiveBytes: input.localArchive.archiveBytes,
    fileListRoot: input.localArchive.fileListRoot,
    fileCount: input.localArchive.fileCount,
    packageContentRoot: input.packageManifest.contentRoot
  });
  if (
    input.uploader.sourceHeadBefore !== input.gitEvidence.liveBaseCommit ||
    input.uploader.sourcePushExpectedOld !== input.gitEvidence.liveBaseCommit ||
    input.uploader.sourceHeadAfter !== input.gitEvidence.deploymentCommit
  ) throw new Error("trusted uploader assertion does not bind the source-head compare-and-swap");

  const proof: Record<string, unknown> = {
    version: attestationContract.deploymentProofVersion,
    status: attestationContract.deploymentProofStatus,
    projectId: input.target.projectId,
    implementationCommit: input.gitEvidence.implementationCommit,
    deploymentCommit: input.gitEvidence.deploymentCommit,
    sourceAnchor: computedSourceAnchor,
    sourceIdentity,
    implementationToDeploymentDiff: input.gitEvidence.implementationToDeploymentDiff,
    build,
    sitesVersion: {
      versionId: input.sitesVersion.versionId,
      versionNumber: input.sitesVersion.versionNumber,
      sourceCommit: input.sitesVersion.sourceCommit,
      archiveContentHash: input.sitesVersion.archiveContentHash,
      archiveFormat: input.sitesVersion.archiveFormat,
      archiveFileCount: input.sitesVersion.archiveFileCount,
      archiveSizeBytes: input.sitesVersion.archiveSizeBytes
    },
    uploader: input.uploader,
    deployment: {
      deploymentId: input.deployment.deploymentId,
      status: input.deployment.status,
      versionId: input.deployment.versionId,
      environmentRevision: input.deployment.environmentRevision,
      accessPolicyRevision: input.access.revision,
      origin: input.deployment.origin
    },
    observedAt
  };
  validateSitesDeploymentIdentity({
    proof,
    target: input.target,
    deploymentCommit: input.gitEvidence.deploymentCommit,
    deploymentVersion: input.sitesVersion.versionId,
    nowMs: observedMs
  });
  return proof;
}

function localArchiveEvidenceFromBytes(bytes: Uint8Array): LocalArchiveEvidence {
  const pythonExecutable = assertFrozenQualificationSystemExecutable("python3");
  const inspectionBytes = execFileSync(pythonExecutable, [...OS01_QUALIFICATION_PYTHON_FLAGS,
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

export function localArchiveEvidence(
  input: string | ImmutableLocalArchiveSnapshot
): LocalArchiveEvidence {
  return withLocalArchiveSnapshot(input, (snapshot) =>
    snapshot.consumeExactBytes(localArchiveEvidenceFromBytes));
}

export function verifyQualificationArchiveBoundary(input: {
  path: string;
  snapshot?: ImmutableLocalArchiveSnapshot;
  qualificationBuild: LocalBuildEvidence["qualificationBuild"];
  productionCoordinator?: ProductionQualificationCoordinator;
}): QualificationArchiveBoundaryEvidence {
  const qualification = validateQualificationBuildEvidence(
    input.qualificationBuild,
    "qualification archive build evidence",
    "deployment"
  );
  let context: Buffer;
  if (qualification.mode === "public_production_private_seed") {
    if (
      input.productionCoordinator === undefined ||
      qualification.runId !== input.productionCoordinator.runId ||
      qualification.seedCommitment !== input.productionCoordinator.seedCommitment
    ) throw new Error("qualification archive is outside the live production session");
    context = input.productionCoordinator.deriveContext(qualification.transcriptHash);
  } else {
    if (input.productionCoordinator !== undefined) {
      throw new Error("owner-only qualification archive cannot use a production coordinator");
    }
    context = createHash("sha256")
      .update(attestationContract.buildIdentity.qualificationBuild.contextDomain, "utf8")
      .update(Buffer.from([0]))
      .update(Buffer.from(qualification.transcriptHash, "hex"))
      .digest();
  }
  if (qualificationContextCommitment(context) !== qualification.contextCommitment) {
    context.fill(0);
    throw new Error("qualification archive context commitment does not verify");
  }
  const contextMarkers = sensitiveMaterialMarkers(context);
  const derivedMarkers = qualificationDerivedCredentialMarkers(context).flatMap((marker) => {
    const encoded = sensitiveMaterialMarkers(marker);
    marker.fill(0);
    return encoded;
  });
  try {
    const source = input.snapshot ?? input.path;
    if (input.snapshot !== undefined && input.snapshot.path !== realpathSync(input.path)) {
      throw new Error("qualification archive snapshot path mismatch");
    }
    return withLocalArchiveSnapshot(source, (snapshot) =>
      snapshot.consumeExactBytes((archiveBytes) => {
    const archive = localArchiveEvidenceFromBytes(archiveBytes);
    const bsdtarExecutable = assertFrozenQualificationSystemExecutable("bsdtar");
    const listing = execFileSync(bsdtarExecutable, ["-tzf", "-"], {
      encoding: "utf8",
      input: archiveBytes,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin", NODE_ENV: "production" }
    });
    const paths = listing.split("\n").filter((path) => path.length > 0 && !path.endsWith("/"));
    if (new Set(paths).size !== paths.length || paths.length !== archive.fileCount) {
      throw new Error("qualification archive file listing is not canonical");
    }
    let nonServerFileCount = 0;
    const scanRecords = paths.map((path, index) => {
      const memberLabel = `qualification archive member ${index}`;
      if (
        !path.startsWith("dist/") || path.includes("../") || path.includes("\0") ||
        /[*?[\]\\]/u.test(path)
      ) {
        throw new Error("qualification archive contains an invalid path");
      }
      const pathBytes = Buffer.from(path, "utf8");
      if (input.productionCoordinator) {
        input.productionCoordinator.assertEvidenceBytesSafe(pathBytes, `${memberLabel} path`);
      } else if (
        contextMarkers.some((marker) => containsByteSequence(pathBytes, marker)) ||
        derivedMarkers.some((marker) => containsByteSequence(pathBytes, marker))
      ) {
        throw new Error("qualification material leaked into an archive member path");
      }
      const bsdtarExecutable = assertFrozenQualificationSystemExecutable("bsdtar");
      const bytes = execFileSync(bsdtarExecutable, ["-xOzf", "-", path], {
        encoding: "buffer",
        input: archiveBytes,
        maxBuffer: MAX_DEPLOYMENT_ARCHIVE_BYTES,
        stdio: ["pipe", "pipe", "pipe"],
        env: { PATH: "/usr/bin:/bin", NODE_ENV: "production" }
      });
      const serverOnly = path.startsWith("dist/server/");
      const nestedKind = nestedArchiveKind(path, bytes);
      if (nestedKind !== null) {
        throw new Error(`${memberLabel} is a forbidden nested ${nestedKind} container`);
      }
      if (input.productionCoordinator) {
        input.productionCoordinator.assertEvidenceBytesSafe(bytes, memberLabel, Date.now(), {
          allowDerivedQualificationCredential: serverOnly
        });
      }
      if (contextMarkers.some((marker) => containsByteSequence(bytes, marker))) {
        throw new Error("qualification context leaked into an archive member");
      }
      if (!serverOnly) {
        nonServerFileCount += 1;
        if (derivedMarkers.some((marker) => containsByteSequence(bytes, marker))) {
          throw new Error("qualification-derived server credential leaked outside the server archive");
        }
      }
      return { path, bytes: bytes.byteLength, sha256: sha256(bytes), serverOnly };
    }).sort((left, right) => compareUnicodeCodePoints(left.path, right.path));
    return {
      version: attestationContract.buildIdentity.qualificationBuild.archiveBoundaryVersion,
      archiveSha256: archive.archiveSha256,
      qualificationMode: qualification.mode,
      runId: qualification.runId,
      seedCommitment: qualification.seedCommitment,
      contextCommitment: qualification.contextCommitment,
      fileCount: scanRecords.length,
      nonServerFileCount,
      rawContextLeakCount: 0,
      nonServerDerivedCredentialLeakCount: 0,
      scanRoot: sha256(stableJson(scanRecords))
    };
      }));
  } finally {
    context.fill(0);
    contextMarkers.forEach((marker) => marker.fill(0));
    derivedMarkers.forEach((marker) => marker.fill(0));
  }
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

export type QualificationPaths = {
  directory: string;
  deploymentProof: string;
  deploymentArchive: string;
  output: string;
};

export function censusReservationPath(outputInput: string): string {
  const output = resolve(outputInput);
  const parent = realpathSync(dirname(output));
  return resolve(parent, "census-receipt-reservation.json");
}

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
  const reservation = censusReservationPath(output);
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
  if (existsSync(reservation)) throw new Error("qualification receipt reservation already exists");
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
    d1Binding: configured.d1Binding,
    r2Binding: configured.r2Binding,
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
      d1Binding: null,
      r2Binding: null,
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

function validateQualificationBuildEvidence(
  value: unknown,
  context: string,
  expectedRole: QualificationBuildRole,
  expectedTarget?: TrustedTarget
): LocalBuildEvidence["qualificationBuild"] {
  const evidence = requireRecord(value, context);
  exactKeys(evidence, [
    "contextCommitment", "installedToolchainClosureRoot", "installedToolchainPackageCount",
    "lockfileSha256", "mode", "nodeExecutableSha256", "nodeVersion", "patchSha256",
    "pnpmExecutableSha256", "pnpmVersion", "role", "runId", "seedCommitment",
    "targetAccessMode", "targetProjectId", "toolchainRoot", "transcriptHash", "version",
    "vinextVersion", "workspaceSha256"
  ], context);
  const qualification = attestationContract.buildIdentity.qualificationBuild;
  const runId = evidence.runId === null
    ? null
    : requireString(evidence.runId, `${context} run id`);
  if (runId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(runId)) {
    throw new Error(`${context} run id is invalid`);
  }
  const seedCommitment = evidence.seedCommitment === null
    ? null
    : requireHex(evidence.seedCommitment, `${context} seed commitment`);
  const parsed = {
    version: requireString(evidence.version, `${context} version`),
    role: requireString(evidence.role, `${context} role`) as QualificationBuildRole,
    mode: requireString(evidence.mode, `${context} mode`) as LocalBuildEvidence["qualificationBuild"]["mode"],
    runId,
    seedCommitment,
    contextCommitment: requireHex(evidence.contextCommitment, `${context} context commitment`),
    transcriptHash: requireHex(evidence.transcriptHash, `${context} transcript hash`),
    toolchainRoot: requireHex(evidence.toolchainRoot, `${context} toolchain root`),
    installedToolchainClosureRoot: requireHex(
      evidence.installedToolchainClosureRoot,
      `${context} installed toolchain closure root`
    ),
    installedToolchainPackageCount: requireSafeInteger(
      evidence.installedToolchainPackageCount,
      `${context} installed toolchain package count`,
      1
    ),
    nodeVersion: requireString(evidence.nodeVersion, `${context} Node version`),
    nodeExecutableSha256: requireHex(evidence.nodeExecutableSha256, `${context} Node executable hash`),
    pnpmVersion: requireString(evidence.pnpmVersion, `${context} pnpm version`),
    pnpmExecutableSha256: requireHex(evidence.pnpmExecutableSha256, `${context} pnpm executable hash`),
    lockfileSha256: requireHex(evidence.lockfileSha256, `${context} lockfile hash`),
    workspaceSha256: requireHex(evidence.workspaceSha256, `${context} workspace hash`),
    vinextVersion: requireString(evidence.vinextVersion, `${context} Vinext version`),
    patchSha256: requireHex(evidence.patchSha256, `${context} patch hash`),
    targetProjectId: requireString(evidence.targetProjectId, `${context} target project`),
    targetAccessMode: requireString(evidence.targetAccessMode, `${context} target access`)
  };
  const ownerOnlyEvidence =
    parsed.mode === "owner_only_public_context" &&
    parsed.runId === null &&
    parsed.seedCommitment === null &&
    parsed.targetAccessMode === qualification.ownerOnlyAccessMode;
  const productionEvidence =
    parsed.mode === "public_production_private_seed" &&
    parsed.runId !== null &&
    parsed.seedCommitment !== null &&
    parsed.targetAccessMode === qualification.productionAccessMode;
  if (
    parsed.version !== qualification.version || parsed.role !== expectedRole ||
    parsed.vinextVersion !== qualification.vinextVersion ||
    parsed.patchSha256 !== qualification.patchSha256 ||
    parsed.installedToolchainClosureRoot !== qualification.installedToolchainClosureRoot ||
    parsed.installedToolchainPackageCount !== qualification.installedToolchainPackageCount ||
    parsed.nodeVersion !== qualification.nodeVersion ||
    parsed.nodeExecutableSha256 !== qualification.nodeExecutableSha256 ||
    parsed.pnpmVersion !== qualification.pnpmVersion ||
    parsed.pnpmExecutableSha256 !== qualification.pnpmExecutableSha256 ||
    parsed.lockfileSha256 !== qualification.lockfileSha256 ||
    parsed.workspaceSha256 !== qualification.workspaceSha256 ||
    (!ownerOnlyEvidence && !productionEvidence) ||
    (expectedTarget !== undefined && (
      parsed.targetProjectId !== expectedTarget.projectId ||
      parsed.targetAccessMode !== expectedTarget.accessMode
    ))
  ) throw new Error(`${context} does not match the frozen qualification build policy`);
  return parsed;
}

function validateQualificationArchiveBoundaryEvidence(
  value: unknown,
  archive: LocalArchiveEvidence,
  qualificationBuild: LocalBuildEvidence["qualificationBuild"]
): QualificationArchiveBoundaryEvidence {
  const evidence = requireRecord(value, "qualification archive boundary evidence");
  exactKeys(evidence, [
    "archiveSha256", "contextCommitment", "fileCount", "nonServerDerivedCredentialLeakCount",
    "nonServerFileCount", "qualificationMode", "rawContextLeakCount", "runId",
    "scanRoot", "seedCommitment", "version"
  ], "qualification archive boundary evidence");
  const parsed: QualificationArchiveBoundaryEvidence = {
    version: requireString(evidence.version, "qualification archive boundary version"),
    archiveSha256: requireHex(evidence.archiveSha256, "qualification archive hash"),
    qualificationMode: requireString(
      evidence.qualificationMode,
      "qualification archive mode"
    ) as QualificationArchiveBoundaryEvidence["qualificationMode"],
    runId: evidence.runId === null ? null : requireString(evidence.runId, "qualification archive run id"),
    seedCommitment: evidence.seedCommitment === null
      ? null
      : requireHex(evidence.seedCommitment, "qualification archive seed commitment"),
    contextCommitment: requireHex(evidence.contextCommitment, "qualification archive context commitment"),
    fileCount: requireSafeInteger(evidence.fileCount, "qualification archive file count", 1),
    nonServerFileCount: requireSafeInteger(
      evidence.nonServerFileCount,
      "qualification archive non-server file count",
      1
    ),
    rawContextLeakCount: requireSafeInteger(
      evidence.rawContextLeakCount,
      "qualification archive raw-context leak count",
      0,
      0
    ) as 0,
    nonServerDerivedCredentialLeakCount: requireSafeInteger(
      evidence.nonServerDerivedCredentialLeakCount,
      "qualification archive derived-credential leak count",
      0,
      0
    ) as 0,
    scanRoot: requireHex(evidence.scanRoot, "qualification archive scan root")
  };
  if (
    parsed.version !== attestationContract.buildIdentity.qualificationBuild.archiveBoundaryVersion ||
    parsed.archiveSha256 !== archive.archiveSha256 ||
    parsed.fileCount !== archive.fileCount ||
    parsed.nonServerFileCount > parsed.fileCount ||
    parsed.qualificationMode !== qualificationBuild.mode ||
    parsed.runId !== qualificationBuild.runId ||
    parsed.seedCommitment !== qualificationBuild.seedCommitment ||
    parsed.contextCommitment !== qualificationBuild.contextCommitment
  ) throw new Error("qualification archive boundary does not match the build and archive");
  return parsed;
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

export function validateDeploymentProof(input: {
  path: string;
  target: TrustedTarget;
  authorityRepositoryRoot: string;
  implementationRepositoryRoots: readonly [string, string];
  repositoryRoots: readonly [string, string];
  archivePath: string;
  archiveSnapshot?: ImmutableLocalArchiveSnapshot;
  authorityEvidence: AuthorityEvidence | null;
  expectedBuildAttestation: string;
  expectedImplementationCommit: string;
  sourceCommit: string;
  deploymentVersion: string;
  pnpmExecutablePath: string;
  productionCoordinator?: ProductionQualificationCoordinator;
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
    "uploader",
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
    const firstBuild = freshBuildEvidence(
      firstRoot, implementationCommit, "first C0 build", placeholderAnchor, false, input.target, "implementation",
      input.pnpmExecutablePath,
      input.productionCoordinator
    );
    const secondBuild = freshBuildEvidence(
      secondRoot, implementationCommit, "second C0 build", placeholderAnchor, false, input.target, "implementation",
      input.pnpmExecutablePath,
      input.productionCoordinator
    );
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
      "entryStaticClosureRoot", "entryStaticFileCount", "fileCount", "qualificationBuild"
    ], "loopback implementation build");
    for (const key of [
      "entryStaticClosureRoot"
    ] as const) {
      requireHex(loopbackImplementationBuild[key], `loopback implementation build ${key}`);
    }
    requireSafeInteger(loopbackImplementationBuild.fileCount, "loopback implementation build file count", 1);
    requireSafeInteger(loopbackImplementationBuild.activeSourceFilesScanned, "loopback active source files", 1);
    requireSafeInteger(loopbackImplementationBuild.activeBuildFilesScanned, "loopback active build files", 1);
    requireSafeInteger(loopbackImplementationBuild.entryStaticFileCount, "loopback entry static files", 1);
    validateQualificationBuildEvidence(
      loopbackImplementationBuild.qualificationBuild,
      "loopback implementation qualification build",
      "implementation"
    );
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
  const sitesVersionRecord = requireRecord(proof.sitesVersion, "Sites version projection");
  const sitesVersionId = requireString(sitesVersion.versionId, "Sites version id");
  const sitesArchiveContentHash = requireString(sitesVersion.archiveContentHash, "Sites archive content hash");
  const sitesArchiveFileCount = requireSafeInteger(sitesVersion.archiveFileCount, "Sites archive file count", 1);
  const uploader = proof.uploader as TrustedUploaderAssertion;
  validateDeploymentProofFreshness(
    uploader.observedAt,
    Date.parse(requireString(proof.observedAt, "deployment proof observation time"))
  );
  validateTrustedUploaderAssertion(uploader, {
    version: os01ControlPlaneContract.version,
    observedAt: requireString(proof.observedAt, "Sites version observation time"),
    projectId: input.target.projectId,
    versionId: sitesVersionId,
    versionNumber: requireSafeInteger(
      sitesVersionRecord.versionNumber,
      "Sites version number",
      1
    ),
    sourceCommit: deploymentCommit,
    archiveContentHash: sitesArchiveContentHash,
    archiveFormat: requireString(
      sitesVersionRecord.archiveFormat,
      "Sites archive format"
    ),
    archiveFileCount: requireSafeInteger(
      sitesVersionRecord.archiveFileCount,
      "Sites archive file count",
      1
    ),
    archiveSizeBytes: requireSafeInteger(
      sitesVersionRecord.archiveSizeBytes,
      "Sites archive bytes",
      1
    )
  });
  if (gitEvidence !== null && (
    uploader.sourceHeadBefore !== gitEvidence.liveBaseCommit ||
    uploader.sourcePushExpectedOld !== gitEvidence.liveBaseCommit ||
    uploader.sourceHeadAfter !== gitEvidence.deploymentCommit
  )) throw new Error("trusted uploader source compare-and-swap does not reproduce");

  const build = requireRecord(proof.build, "deployment build proof");
  exactKeys(build, [
    "activeBuildFilesScanned", "activeBuildGraphHash", "activeSourceFilesScanned",
    "buildInputRoot", "builtWorkerHash", "compiledAnchorCarrierRoot", "distFileCount", "distFileListRoot", "distRoot",
    "entryStaticClosureRoot", "entryStaticFileCount",
    "localArchiveBytes", "localArchiveFileCount", "localArchiveFileListRoot", "localArchiveFormat",
    "localArchiveContentRoot", "localArchiveSha256", "packageContentRoot", "packageFileCount",
    "packageFileListRoot", "qualificationArchiveBoundary", "qualificationBuild", "sitesArchiveContentHash"
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
  const proofQualificationBuild = validateQualificationBuildEvidence(
    build.qualificationBuild,
    "deployment qualification build",
    "deployment",
    input.target.loopbackFixture ? undefined : input.target
  );
  requireSafeInteger(build.localArchiveBytes, "local deployment archive bytes", 1);
  const localArchiveFileCount = requireSafeInteger(build.localArchiveFileCount, "local deployment archive file count", 1);
  const packageFileCount = requireSafeInteger(build.packageFileCount, "deployment package file count", 1);
  if (
    build.localArchiveFormat !== attestationContract.buildIdentity.localArchiveFormat ||
    build.sitesArchiveContentHash !== sitesArchiveContentHash ||
    localArchiveFileCount !== sitesArchiveFileCount || packageFileCount !== localArchiveFileCount ||
    build.buildInputRoot !== sourceIdentity.buildInputRoot
  ) throw new Error("deployment build and Sites archive are not cross-linked");
  if (gitEvidence !== null) {
    const [firstRoot, secondRoot] = input.repositoryRoots
      .map((path) => realpathSync(path)) as [string, string];
    if (firstRoot === secondRoot) throw new Error("deployment reproducibility worktrees must be distinct");
    const localBuild = freshBuildEvidence(
      firstRoot, deploymentCommit, "first C1 build", qualifiedSourceAnchor, true, input.target, "deployment",
      input.pnpmExecutablePath,
      input.productionCoordinator
    );
    const replicaBuild = freshBuildEvidence(
      secondRoot, deploymentCommit, "second C1 build", qualifiedSourceAnchor, true, input.target, "deployment",
      input.pnpmExecutablePath,
      input.productionCoordinator
    );
    if (stableJson(localBuild) !== stableJson(replicaBuild)) {
      throw new Error("independent C1 build manifests differ");
    }
    const localPackage = expectedPackageManifest(firstRoot, input.target);
    const replicaPackage = expectedPackageManifest(secondRoot, input.target);
    if (stableJson(localPackage) !== stableJson(replicaPackage)) {
      throw new Error("independent C1 package manifests differ");
    }
    const ownsArchiveSnapshot = input.archiveSnapshot === undefined;
    const archiveSnapshot = input.archiveSnapshot ?? ImmutableLocalArchiveSnapshot.open(input.archivePath);
    if (archiveSnapshot.path !== realpathSync(input.archivePath)) {
      if (ownsArchiveSnapshot) archiveSnapshot.close();
      throw new Error("deployment proof archive snapshot path mismatch");
    }
    try {
    const localArchive = localArchiveEvidence(archiveSnapshot);
    const proofArchiveBoundary = validateQualificationArchiveBoundaryEvidence(
      build.qualificationArchiveBoundary,
      localArchive,
      proofQualificationBuild
    );
    const recomputedArchiveBoundary = verifyQualificationArchiveBoundary({
      path: input.archivePath,
      snapshot: archiveSnapshot,
      qualificationBuild: localBuild.qualificationBuild,
      productionCoordinator: input.productionCoordinator
    });
    if (stableJson(proofArchiveBoundary) !== stableJson(recomputedArchiveBoundary)) {
      throw new Error("deployment proof qualification archive boundary does not reproduce");
    }
    validateArchivePackageBinding({
      archive: localArchive,
      packageManifest: localPackage,
      proofBuild: build
    });
    validateTrustedUploaderAssertion(uploader, {
      version: os01ControlPlaneContract.version,
      observedAt: requireString(proof.observedAt, "deployment proof observation time"),
      projectId: input.target.projectId,
      versionId: sitesVersionId,
      versionNumber: requireSafeInteger(
        sitesVersionRecord.versionNumber,
        "Sites version number",
        1
      ),
      sourceCommit: deploymentCommit,
      archiveContentHash: sitesArchiveContentHash,
      archiveFormat: requireString(
        sitesVersionRecord.archiveFormat,
        "Sites archive format"
      ),
      archiveFileCount: sitesArchiveFileCount,
      archiveSizeBytes: requireSafeInteger(
        sitesVersionRecord.archiveSizeBytes,
        "Sites archive bytes",
        1
      )
    }, {
      archiveSha256: localArchive.archiveSha256,
      archiveBytes: localArchive.archiveBytes,
      fileListRoot: localArchive.fileListRoot,
      fileCount: localArchive.fileCount,
      packageContentRoot: localPackage.contentRoot
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
      entryStaticFileCount !== localBuild.entryStaticFileCount ||
      stableJson(proofQualificationBuild) !== stableJson(localBuild.qualificationBuild)
    ) throw new Error("deployment build proof does not match local build outputs");
    } finally {
      if (ownsArchiveSnapshot) archiveSnapshot.close();
    }
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

async function boundedJson(
  response: Response,
  evidenceScanner?: (bytes: Uint8Array, label: string) => void
): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type")?.trim().toLowerCase() ?? "";
  if (!response.body) throw new Error("operator response body missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let scanTail = new Uint8Array(0);
  const scanOverlapBytes = 8_192;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    if (evidenceScanner) {
      const scanWindow = new Uint8Array(scanTail.byteLength + result.value.byteLength);
      scanWindow.set(scanTail, 0);
      scanWindow.set(result.value, scanTail.byteLength);
      evidenceScanner(scanWindow, "public census response chunk");
      scanTail = scanWindow.slice(Math.max(0, scanWindow.byteLength - scanOverlapBytes));
    }
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
  evidenceScanner?.(joined, "public census response");
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/u.test(contentType)) {
    throw new Error("operator response content type is not canonical JSON");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch {
    throw new Error("operator returned invalid UTF-8 JSON");
  }
  return requireRecord(parsed, "operator response");
}

export class OperatorClient {
  private continuation: string | null = null;
  private passId: string | null = null;
  private passNonceHash: string | null = null;
  private sequence = -1;
  readonly payloadHashes: string[] = [];
  readonly queryStats = { queries: 0, rowsRead: 0, rowsWritten: 0, changes: 0, changedDb: false };

  constructor(
    private readonly secrets: SecretInput,
    private readonly expectedBuildAttestation: string,
    private readonly evidenceScanner?: (bytes: Uint8Array, label: string) => void,
    private readonly deadlineMs?: number
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
    const remainingMs = this.deadlineMs === undefined
      ? OPERATOR_REQUEST_MAX_MS
      : Math.min(OPERATOR_REQUEST_MAX_MS, this.deadlineMs - Date.now());
    if (remainingMs <= 0) throw new Error("operator request deadline expired");
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), remainingMs);
    let response: Response;
    let json: Record<string, unknown>;
    try {
      response = await fetch(this.secrets.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        signal: abort.signal
      });
      json = await boundedJson(response, this.evidenceScanner);
    } finally {
      clearTimeout(timeout);
    }
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
  })).sort((left, right) => compareUnicodeCodePoints(left.version, right.version));
  const expectedReceipts = [...authorityFoundation.preservedReceipts]
    .sort((left, right) => compareUnicodeCodePoints(left.version, right.version));
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
  expectedBuildAttestation: string,
  evidenceScanner?: (bytes: Uint8Array, label: string) => void,
  deadlineMs?: number
): Promise<{
  client: OperatorClient;
  catalog: CatalogEntry[];
  catalogHash: string;
  schemaVersion: number;
  schema: SchemaEvidence[];
  classification: ReturnType<typeof classifySchema>;
}> {
  const client = new OperatorClient(secrets, expectedBuildAttestation, evidenceScanner, deadlineMs);
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
    compareUnicodeCodePoints(left.type, right.type) || compareUnicodeCodePoints(left.name, right.name)
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
  schema.sort((left, right) => compareUnicodeCodePoints(left.key, right.key));
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
    .filter((entry) =>
      entry.type === "table" && !entry.internal && contract.contentEvidence.allowedTables.includes(entry.name)
    )
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
    const pageMacs: string[] = [];
    let offset = 0;
    const maximumPages = Math.floor(tableRowCount / 128) + 1;
    while (true) {
      if (pageMacs.length >= maximumPages) throw new Error(`page limit exceeded for ${table}`);
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
        pageMac: string;
      };
      exactKeys(payload, [
        "canonicalBytes", "columnsHash", "done", "limit", "offset", "operation",
        "pageMac", "rowCount", "table"
      ], "table page payload");
      if (
        payload.operation !== "table_page" || payload.table !== table || payload.offset !== offset ||
        payload.limit !== 128 || payload.columnsHash !== startPayload.columnsHash ||
        typeof payload.done !== "boolean"
      ) throw new Error(`table page echo mismatch: ${table}`);
      const pageRowCount = requireSafeInteger(payload.rowCount, `page row count ${table}`, 0, 128);
      requireSafeInteger(payload.canonicalBytes, `page canonical bytes ${table}`, 0, 1_800_000);
      requireHex(payload.pageMac, `page MAC ${table}`);
      const remaining = tableRowCount - offset;
      const expectedPageRows = Math.min(128, remaining);
      if (pageRowCount !== expectedPageRows || payload.done !== (pageRowCount < 128)) {
        throw new Error(`page cardinality mismatch: ${table}`);
      }
      pageMacs.push(payload.pageMac);
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
      pageCount: pageMacs.length,
      pageMacs,
      dataMacRoot: sha256(stableJson({
        table,
        rowCount: tableRowCount,
        columnsHash: startPayload.columnsHash,
        pageMacs
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

export async function executeQualifiedCensus(input: {
  target: TrustedTarget;
  qualificationPaths: QualificationPaths;
  authorityRepositoryRoot: string;
  implementationRepositoryRoots: readonly [string, string];
  repositoryRoots: readonly [string, string];
  archivePath: string;
  archiveSnapshot?: ImmutableLocalArchiveSnapshot;
  authorityCommit: string;
  implementationCommit: string;
  sourceCommit: string;
  deploymentVersion: string;
  expectedBuildAttestation: string;
  pnpmExecutablePath: string;
  secrets: SecretInput;
  productionCoordinator?: ProductionQualificationCoordinator;
}): Promise<{ status: string; receiptHash: string; output: string }> {
  const target = input.target;
  const qualificationPaths = input.qualificationPaths;
  const output = qualificationPaths.output;
  const implementationRepositoryRoots = input.implementationRepositoryRoots;
  const repositoryRoots = input.repositoryRoots;
  const archivePath = input.archivePath;
  const authorityCommit = input.authorityCommit;
  const implementationCommit = input.implementationCommit;
  const sourceCommit = input.sourceCommit;
  const authorityRepositoryRoot = realpathSync(input.authorityRepositoryRoot);
  const authorityEvidence = target.loopbackFixture
    ? null
    : validateAuthorityExecutionRoot(authorityRepositoryRoot, authorityCommit);
  const deploymentVersion = input.deploymentVersion;
  const expectedBuildAttestation = requireHex(
    input.expectedBuildAttestation.toLowerCase(),
    "expected build attestation"
  );
  if (
    target.accessMode === attestationContract.buildIdentity.qualificationBuild.productionAccessMode &&
    input.productionCoordinator === undefined
  ) throw new Error("production census execution requires the live private-seed coordinator");
  const deploymentEvidence = validateDeploymentProof({
    path: qualificationPaths.deploymentProof,
    target,
    authorityRepositoryRoot,
    implementationRepositoryRoots,
    repositoryRoots,
    archivePath,
    archiveSnapshot: input.archiveSnapshot,
    authorityEvidence,
    expectedBuildAttestation,
    expectedImplementationCommit: implementationCommit,
    sourceCommit,
    deploymentVersion,
    pnpmExecutablePath: input.pnpmExecutablePath,
    productionCoordinator: input.productionCoordinator
  });
  const operatorSourceHash = sha256(readFileSync(resolve(authorityRepositoryRoot, "worker/os01-census-operator.ts")));
  const deployedOperatorSourceHash = sha256(readFileSync(resolve(repositoryRoots[0], "worker/os01-census-operator.ts")));
  if (!target.loopbackFixture && deployedOperatorSourceHash !== operatorSourceHash) {
    throw new Error("deployed census operator source differs from the qualified controller source");
  }
  const secrets = input.secrets;
  const stages = migrationStages();
  const contractHash = sha256(readFileSync(resolve(root, "config/os01-production-census.v1.json")));
  const attestationContractHash = sha256(readFileSync(resolve(root, "config/os01-census-attestation.v1.json")));
  const trustedTargetContractHash = sha256(readFileSync(resolve(root, attestationContract.trustedTargetConfig)));
  const prestateClassHash = sha256(readFileSync(resolve(root, "config/os01-production-prestate-classes.v1.json")));
  const startedAt = new Date().toISOString();
  const reservation = {
    version: "os01-production-census-reservation.2026.1",
    status: "reserved_before_network",
    targetName: target.name,
    projectId: target.projectId,
    origin: target.origin,
    authorityCommit,
    implementationCommit,
    sourceCommit,
    deploymentVersion,
    buildAttestation: expectedBuildAttestation,
    coordinatorRunId: input.productionCoordinator?.runId ?? null,
    startedAt
  };
  const reservationHash = sha256(stableJson(reservation));
  const reservationBytes = Buffer.from(
    `${JSON.stringify({ ...reservation, reservationHash }, null, 2)}\n`,
    "utf8"
  );
  input.productionCoordinator?.assertActive();
  input.productionCoordinator?.assertEvidenceBytesSafe(
    reservationBytes,
    "production census receipt reservation"
  );
  publishEvidenceBytesExclusive(censusReservationPath(output), reservationBytes);
  const evidenceScanner = input.productionCoordinator
    ? (bytes: Uint8Array, label: string): void => input.productionCoordinator!.assertEvidenceBytesSafe(bytes, label)
    : undefined;
  input.productionCoordinator?.assertActive();
  const deadlineMs = input.productionCoordinator ? Date.parse(input.productionCoordinator.expiresAt) : undefined;
  const first = await schemaPass(secrets, stages, expectedBuildAttestation, evidenceScanner, deadlineMs);
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
      reservationHash,
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
    const second = await schemaPass(secrets, stages, expectedBuildAttestation, evidenceScanner, deadlineMs);
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
      reservationHash,
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
  const receiptBytes = Buffer.from(`${JSON.stringify({ ...receipt, receiptHash }, null, 2)}\n`, "utf8");
  input.productionCoordinator?.assertActive();
  input.productionCoordinator?.assertEvidenceBytesSafe(receiptBytes, "production census receipt");
  publishEvidenceBytesExclusive(output, receiptBytes);
  return { status: String(receipt.status), receiptHash, output };
}

async function main(): Promise<void> {
  const target = resolveTrustedTarget();
  if (
    !target.loopbackFixture &&
    target.accessMode === attestationContract.buildIdentity.qualificationBuild.productionAccessMode
  ) {
    throw new Error("production census must run through the private-seed session coordinator");
  }
  const qualificationPaths = resolveQualificationPaths(argument("--qualification-dir"));
  const implementationRepositoryRoots = target.loopbackFixture
    ? [root, root] as const
    : [resolve(argument("--implementation-worktree-a")), resolve(argument("--implementation-worktree-b"))] as const;
  const repositoryRoots = target.loopbackFixture
    ? [root, root] as const
    : [resolve(argument("--deployment-worktree-a")), resolve(argument("--deployment-worktree-b"))] as const;
  const archivePath = target.loopbackFixture ? root : qualificationPaths.deploymentArchive;
  const expectedBuildAttestation = requireHex(
    argument("--expected-build-attestation").toLowerCase(),
    "expected build attestation"
  );
  const secrets = readSecretInput(target.origin);
  const result = await executeQualifiedCensus({
    target,
    qualificationPaths,
    authorityRepositoryRoot: root,
    implementationRepositoryRoots,
    repositoryRoots,
    archivePath,
    authorityCommit: argument("--authority-commit"),
    implementationCommit: argument("--implementation-commit"),
    sourceCommit: argument("--source-commit"),
    deploymentVersion: argument("--deployment-version"),
    expectedBuildAttestation,
    pnpmExecutablePath: target.loopbackFixture ? process.execPath : realpathSync(argument("--pnpm-executable")),
    secrets
  });
  process.stdout.write(`${result.status} ${result.receiptHash}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`OS-01 census controller failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
