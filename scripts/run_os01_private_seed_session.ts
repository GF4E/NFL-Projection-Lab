#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import {
  os01ControlPlaneContract,
  validateEnvironmentLifecycle,
  validateEnvironmentStaging,
  validatePublicProductionAccess,
  validateTrustedUploaderAssertion,
  type AccessProjection,
  type DeploymentProjection,
  type EnvironmentProjection,
  type TrustedUploaderAssertion,
  type VersionProjection
} from "./os01-control-plane-evidence";
import { publishEvidenceBytesExclusive } from "./os01-atomic-evidence";
import { Os01ProductionSessionLock } from "./os01-production-session-lock";
import {
  os01SessionFinalizationTrustRoot,
  os01SessionAcceptanceTrustRoot,
  validateOs01SessionAcceptance,
  type Os01SessionAcceptanceTrust,
  type Os01SessionFinalizationTrust
} from "./os01-session-acceptance";
import { Os01SessionPhaseLedger } from "./os01-session-phase-ledger";
import { writeDeploymentProofExclusive } from "./build_os01_deployment_proof";
import {
  ImmutableLocalArchiveSnapshot,
  OS01_QUALIFICATION_PYTHON_FLAGS,
  ProductionQualificationCoordinator,
  assertFrozenQualificationAuthorityProcess,
  assertFrozenQualificationSystemExecutable,
  configuredTrustedTarget,
  executeQualifiedCensus,
  expectedPackageManifest,
  freshBuildEvidence,
  localArchiveEvidence,
  prepareSourceAnchorEvidence,
  validateArchivePackageBinding,
  validateGitSuccessor,
  verifyQualificationArchiveBoundary,
  type DeploymentProofConstructionInput,
  type GitSuccessorEvidence,
  type LocalArchiveEvidence,
  type LocalBuildEvidence,
  type PackageManifestEvidence,
  type QualificationArchiveBoundaryEvidence,
  type QualificationPaths,
  type SourceAnchorEvidence
} from "./run_os01_production_census";

type JsonRecord = Record<string, unknown>;

const CLEAN_SOURCE_COMMIT = "e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd";
const CLEAN_VERSION_ID = "appgprj_6a7ba1bc638c819197788ab281abfbc3~appgver_1e68c8989b1c8191ba0dc533519c65b3";
const MAX_COMMAND_BYTES = 2 * 1024 * 1024;
const EXTERNAL_MUTATION_SEQUENCE = [
  "source_compare_and_swap",
  "environment_controls_single_update",
  "sites_save_exact_local_archive",
  "temporary_publish"
] as const;

function compareCodePoints(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0)!);
  const rightPoints = [...right].map((value) => value.codePointAt(0)!);
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([key, item]) => [key, stable(item)]));
  }
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return value;
  throw new Error("session evidence contains an unsupported value");
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareCodePoints);
  const wanted = [...expected].sort(compareCodePoints);
  if (stableJson(actual) !== stableJson(wanted)) throw new Error(`${label} contains unexpected fields`);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} is invalid`);
  return Number(value);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid`);
  return value;
}

function hex(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} is invalid`);
  return result;
}

function assertContemporaneous(
  observedAt: string,
  label: string,
  input: { notBeforeMs: number; notAfterMs: number }
): void {
  const observedMs = Date.parse(timestamp(observedAt, `${label} observation time`));
  if (observedMs < input.notBeforeMs || observedMs > input.notAfterMs) {
    throw new Error(`${label} observation is outside the required lifecycle interval`);
  }
  const ageMs = Date.now() - observedMs;
  if (
    ageMs > os01ControlPlaneContract.observationMaximumAgeSeconds * 1000 ||
    ageMs < -os01ControlPlaneContract.observationMaximumFutureSkewSeconds * 1000
  ) throw new Error(`${label} observation is not fresh`);
}

function decodeCanonicalBase64(value: unknown, label: string, maximumBytes = 1_000_000): Buffer {
  const encoded = text(value, label);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
    throw new Error(`${label} is not canonical base64`);
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength > maximumBytes || decoded.toString("base64") !== encoded) {
    decoded.fill(0);
    throw new Error(`${label} is invalid or exceeds its byte limit`);
  }
  return decoded;
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function encodeHex(value: Uint8Array): Buffer {
  const alphabet = Buffer.from("0123456789abcdef", "ascii");
  const output = Buffer.alloc(value.byteLength * 2);
  for (let index = 0; index < value.byteLength; index += 1) {
    const byte = value[index]!;
    output[index * 2] = alphabet[byte >>> 4]!;
    output[index * 2 + 1] = alphabet[byte & 0x0f]!;
  }
  return output;
}

function emit(value: JsonRecord): void {
  writeFileSync(1, `${stableJson(value)}\n`, { encoding: "utf8" });
}

function canonicalDirectory(input: string, label: string): string {
  const requested = resolve(input);
  const metadata = lstatSync(requested);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error(`${label} is not a canonical directory`);
  const canonical = realpathSync(requested);
  if (canonical !== requested) throw new Error(`${label} is not a canonical directory`);
  return canonical;
}

function packageArchive(authorityRoot: string, repositoryRoot: string, archivePath: string): void {
  if (existsSync(archivePath)) throw new Error("qualification archive already exists");
  const attestation = record(JSON.parse(
    readFileSync(resolve(authorityRoot, "config/os01-census-attestation.v1.json"), "utf8")
  ) as unknown, "census attestation contract");
  const buildIdentity = record(attestation.buildIdentity, "census build-identity contract");
  const packaging = record(buildIdentity.localArchivePackaging, "local archive-packaging contract");
  exactKeys(packaging, [
    "exactByteMatchRequired", "gzipMtime", "independentBuildCount", "scriptPath", "scriptSha256",
    "tarFormat", "version"
  ], "local archive-packaging contract");
  const scriptPath = resolve(authorityRoot, text(packaging.scriptPath, "archive packager path"));
  if (
    !scriptPath.startsWith(`${authorityRoot}${sep}`) || realpathSync(scriptPath) !== scriptPath ||
    sha256(readFileSync(scriptPath)) !== hex(packaging.scriptSha256, "archive packager hash") ||
    packaging.version !== "os01-local-archive-packaging.2026.2" ||
    packaging.tarFormat !== "pax" || integer(packaging.gzipMtime, "archive gzip mtime") !== 0 ||
    integer(packaging.independentBuildCount, "archive build count") !== 2 ||
    boolean(packaging.exactByteMatchRequired, "archive byte-match requirement") !== true
  ) throw new Error("local archive-packaging contract is invalid");
  const pythonExecutable = assertFrozenQualificationSystemExecutable("python3");
  execFileSync(pythonExecutable, [...OS01_QUALIFICATION_PYTHON_FLAGS,
    scriptPath,
    "--repository-root", repositoryRoot,
    "--output", archivePath
  ], {
    cwd: authorityRoot,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: "/usr/bin:/bin", NODE_ENV: "production", PYTHONNOUSERSITE: "1" }
  });
}

function validateEnvironmentProjection(value: EnvironmentProjection, label: string): void {
  const projection = record(value, label);
  exactKeys(projection, [
    "allMetadataRoot", "captureGatePresent", "controlsAllSecret", "controlsPresent", "entryCount",
    "observedAt", "projectId", "revision", "unrelatedEntryCount", "unrelatedMetadataRoot",
    "unrelatedValuePreservationBasis", "updatedAt", "valueObservation", "version"
  ], label);
  if (
    value.version !== os01ControlPlaneContract.version ||
    value.projectId.length === 0 || !Number.isFinite(Date.parse(value.observedAt)) ||
    !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !Array.isArray(value.controlsPresent) || typeof value.controlsAllSecret !== "boolean" ||
    typeof value.captureGatePresent !== "boolean" || !/^[a-f0-9]{64}$/u.test(value.unrelatedMetadataRoot) ||
    !/^[a-f0-9]{64}$/u.test(value.allMetadataRoot) ||
    value.valueObservation !== os01ControlPlaneContract.environmentValueObservation ||
    value.unrelatedValuePreservationBasis !== os01ControlPlaneContract.unrelatedValuePreservationBasis
  ) throw new Error(`${label} is invalid`);
}

function validateAccessProjection(value: AccessProjection, label: string): void {
  exactKeys(record(value, label), [
    "accessMode", "allowedAccountUserCount", "allowedUserCount", "currentUserRole", "editorCount",
    "externalVisitorCount", "groupCount", "nonOwnerUserCount", "observedAt", "origin",
    "ownerRoleCount", "principalRoot", "projectId", "revision", "tenantGroupCount", "version",
    "workspaceGroupCount"
  ], label);
  validatePublicProductionAccess(value);
}

function validateVersionProjection(value: VersionProjection, label: string): void {
  exactKeys(record(value, label), [
    "archiveContentHash", "archiveFileCount", "archiveFormat", "archiveSizeBytes", "observedAt",
    "projectId", "sourceCommit", "version", "versionId", "versionNumber"
  ], label);
  if (
    value.version !== os01ControlPlaneContract.version ||
    !Number.isFinite(Date.parse(value.observedAt)) || value.projectId.length === 0 || value.versionId.length === 0 ||
    !Number.isSafeInteger(value.versionNumber) || value.versionNumber < 1 ||
    !/^sha256:[a-f0-9]{64}$/u.test(value.archiveContentHash)
  ) throw new Error(`${label} is invalid`);
}

function validateDeploymentProjection(value: DeploymentProjection, label: string): void {
  exactKeys(record(value, label), [
    "deploymentId", "environmentRevision", "observedAt", "origin", "projectId", "status", "type",
    "updatedAt", "version", "versionId"
  ], label);
  if (
    value.version !== os01ControlPlaneContract.version || value.status !== "succeeded" || value.type !== "publish" ||
    !Number.isFinite(Date.parse(value.observedAt)) || !Number.isFinite(Date.parse(value.updatedAt)) ||
    !Number.isSafeInteger(value.environmentRevision) || value.environmentRevision < 0
  ) throw new Error(`${label} is invalid`);
}

export function validateCleanupHttpObservations(input: {
  value: unknown;
  origin: string;
  censusRoute: string;
  notBeforeMs: number;
  notAfterMs: number;
  scan: (bytes: Uint8Array, label: string) => void;
}): Array<Record<string, unknown>> {
  if (!Array.isArray(input.value) || input.value.length !== 3) {
    throw new Error("cleanup HTTP observations are incomplete");
  }
  const expected = new Map([
    ["sunday", { method: "GET", url: `${input.origin}/sunday`, status: 200 }],
    ["census_get", { method: "GET", url: `${input.origin}${input.censusRoute}`, status: 404 }],
    ["census_post", { method: "POST", url: `${input.origin}${input.censusRoute}`, status: 405 }]
  ]);
  const seen = new Set<string>();
  const projected = input.value.map((candidate, index) => {
    const value = record(candidate, `cleanup HTTP observation ${index}`);
    exactKeys(value, ["bodyBase64", "bodySha256", "method", "name", "observedAt", "status", "url"],
      `cleanup HTTP observation ${index}`);
    const name = text(value.name, `cleanup HTTP observation ${index} name`);
    const contract = expected.get(name);
    if (!contract || seen.has(name)) throw new Error("cleanup HTTP observation identity is invalid");
    seen.add(name);
    const observedAt = timestamp(value.observedAt, `${name} observation time`);
    assertContemporaneous(observedAt, name, input);
    const bytes = decodeCanonicalBase64(value.bodyBase64, `${name} response body`);
    try {
      if (
        text(value.method, `${name} method`) !== contract.method ||
        text(value.url, `${name} URL`) !== contract.url ||
        integer(value.status, `${name} status`) !== contract.status ||
        hex(value.bodySha256, `${name} response hash`) !== sha256(bytes)
      ) throw new Error(`${name} response observation is invalid`);
      input.scan(bytes, `${name} public response bytes`);
      return {
        name,
        method: contract.method,
        url: contract.url,
        status: contract.status,
        observedAt,
        bodySha256: sha256(bytes),
        bodyBytes: bytes.byteLength
      };
    } finally {
      bytes.fill(0);
    }
  });
  if (seen.size !== expected.size) throw new Error("cleanup HTTP observations are incomplete");
  return projected;
}

export function validateBindingObservation(
  valueInput: unknown,
  input: { projectId: string; notBeforeMs: number; notAfterMs: number }
): Record<string, unknown> {
  const value = record(valueInput, "cleanup binding observation");
  exactKeys(value, ["d1Bindings", "observedAt", "projectId", "projectionComplete", "r2Bindings"],
    "cleanup binding observation");
  const observedAt = timestamp(value.observedAt, "cleanup binding observation time");
  assertContemporaneous(observedAt, "cleanup bindings", input);
  const d1 = value.d1Bindings;
  const r2 = value.r2Bindings;
  if (
    text(value.projectId, "cleanup binding project") !== input.projectId ||
    boolean(value.projectionComplete, "cleanup binding projection") !== true ||
    !Array.isArray(d1) || d1.length !== 1 || d1[0] !== "DB" ||
    !Array.isArray(r2) || r2.length !== 1 || r2[0] !== "EVIDENCE"
  ) throw new Error("clean binding observation does not match production");
  return { observedAt, projectId: input.projectId, projectionComplete: true, d1Bindings: ["DB"], r2Bindings: ["EVIDENCE"] };
}

export function validateProviderStateObservation(
  valueInput: unknown,
  input: { notBeforeMs: number; notAfterMs: number }
): Record<string, unknown> {
  const value = record(valueInput, "provider-state observation");
  exactKeys(value, [
    "lastCost", "observedAt", "outstandingReservations", "projectionComplete", "remaining",
    "source", "stateRoot", "used"
  ], "provider-state observation");
  const observedAt = timestamp(value.observedAt, "provider-state observation time");
  assertContemporaneous(observedAt, "provider state", input);
  const committedState = {
    source: "production_d1_read_only_quota_metadata",
    projectionComplete: true,
    used: 38,
    remaining: 462,
    lastCost: 0,
    outstandingReservations: 0
  };
  if (
    text(value.source, "provider-state source") !== "production_d1_read_only_quota_metadata" ||
    boolean(value.projectionComplete, "provider-state projection") !== true ||
    integer(value.used, "provider used") !== 38 || integer(value.remaining, "provider remaining") !== 462 ||
    integer(value.lastCost, "provider last cost") !== 0 ||
    integer(value.outstandingReservations, "provider outstanding reservations") !== 0 ||
    hex(value.stateRoot, "provider-state root") !== sha256(stableJson(committedState))
  ) throw new Error("provider-state observation is invalid");
  return {
    observedAt,
    ...committedState,
    stateRoot: sha256(stableJson(committedState))
  };
}

export function validateSourceRestorationObservation(
  valueInput: unknown,
  input: {
    deploymentCommit: string;
    deploymentTreeObjectId: string;
    cleanTreeObjectId: string;
    notBeforeMs: number;
    notAfterMs: number;
  }
): Record<string, unknown> {
  const value = record(valueInput, "source restoration observation");
  exactKeys(value, [
    "branch", "compareAndSwapApplied", "expectedOldHead", "observedAt", "postRestoreHead",
    "postRestoreTreeObjectId", "preRestoreHead", "preRestoreTreeObjectId", "projectionComplete", "restoredHead"
  ], "source restoration observation");
  const observedAt = timestamp(value.observedAt, "source restoration observation time");
  assertContemporaneous(observedAt, "source restoration", input);
  if (
    text(value.branch, "source restoration branch") !== "main" ||
    boolean(value.compareAndSwapApplied, "source restoration compare-and-swap") !== true ||
    boolean(value.projectionComplete, "source restoration projection") !== true ||
    text(value.preRestoreHead, "pre-restore source head") !== input.deploymentCommit ||
    text(value.preRestoreTreeObjectId, "pre-restore source tree") !== input.deploymentTreeObjectId ||
    text(value.expectedOldHead, "expected old source head") !== input.deploymentCommit ||
    text(value.restoredHead, "restored source head") !== CLEAN_SOURCE_COMMIT ||
    text(value.postRestoreHead, "post-restore source head") !== CLEAN_SOURCE_COMMIT ||
    text(value.postRestoreTreeObjectId, "post-restore source tree") !== input.cleanTreeObjectId
  ) throw new Error("source restoration did not use the frozen compare-and-swap boundary");
  return {
    observedAt,
    branch: "main",
    preRestoreHead: input.deploymentCommit,
    preRestoreTreeObjectId: input.deploymentTreeObjectId,
    expectedOldHead: input.deploymentCommit,
    restoredHead: CLEAN_SOURCE_COMMIT,
    postRestoreHead: CLEAN_SOURCE_COMMIT,
    postRestoreTreeObjectId: input.cleanTreeObjectId,
    compareAndSwapApplied: true,
    projectionComplete: true
  };
}

export function constructExternalMutationIntent(input: {
  command: JsonRecord;
  target: { projectId: string; origin: string };
  runId: string;
  seedCommitment: string;
  sourceAnchor: string;
  authorityCommit: string;
  implementationCommit: string;
  deploymentCommit: string;
  coordinatorStartedAt: string;
  coordinatorExpiresAt: string;
  censusAuthSha256: string;
  productionSessionLockIdentityHash: string;
  localArchive: LocalArchiveEvidence;
  localPackageContentRoot: string;
}): {
  intent: Record<string, unknown>;
  intentHash: string;
  environmentBefore: EnvironmentProjection;
  accessBefore: AccessProjection;
  observedAt: string;
} {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.runId) ||
    !/^[a-f0-9]{40}$/u.test(input.authorityCommit) ||
    !/^[a-f0-9]{40}$/u.test(input.implementationCommit) ||
    !/^[a-f0-9]{40}$/u.test(input.deploymentCommit) ||
    input.target.projectId.length === 0 || !input.target.origin.startsWith("https://")
  ) throw new Error("external-mutation session identity is invalid");
  hex(input.seedCommitment, "external-mutation seed commitment");
  hex(input.sourceAnchor, "external-mutation source anchor");
  hex(input.censusAuthSha256, "external-mutation auth hash");
  hex(input.productionSessionLockIdentityHash, "external-mutation session-lock hash");
  hex(input.localArchive.archiveSha256, "external-mutation local archive hash");
  hex(input.localArchive.fileListRoot, "external-mutation local archive file-list root");
  hex(input.localPackageContentRoot, "external-mutation package content root");
  if (
    integer(input.localArchive.archiveBytes, "external-mutation local archive bytes") < 1 ||
    integer(input.localArchive.fileCount, "external-mutation local archive file count") < 1
  ) throw new Error("external-mutation local archive is empty");
  const startedAt = timestamp(input.coordinatorStartedAt, "external-mutation coordinator start");
  const expiresAt = timestamp(input.coordinatorExpiresAt, "external-mutation coordinator expiry");
  if (Date.parse(expiresAt) <= Date.parse(startedAt) || Date.now() >= Date.parse(expiresAt)) {
    throw new Error("external-mutation coordinator interval is invalid");
  }
  const command = input.command;
  exactKeys(command, [
    "accessBefore", "command", "environmentBefore", "mutationSequence", "observedAt",
    "sourceHeadAfter", "sourceHeadBefore", "sourcePushExpectedOld", "temporaryControlAuthSha256",
    "temporaryControlBuildAttestation", "temporaryControlExpiresAt"
  ], "arm_external_mutation");
  if (text(command.command, "external-mutation command") !== "arm_external_mutation") {
    throw new Error("external-mutation command identity is invalid");
  }
  const observedAt = timestamp(command.observedAt, "external-mutation intent observation time");
  if (Date.parse(observedAt) >= Date.parse(expiresAt)) {
    throw new Error("external-mutation intent is not before coordinator expiry");
  }
  assertContemporaneous(observedAt, "external-mutation intent", {
    notBeforeMs: Date.parse(input.coordinatorStartedAt),
    notAfterMs: Date.now() + os01ControlPlaneContract.observationMaximumFutureSkewSeconds * 1000
  });
  const before = command.environmentBefore as EnvironmentProjection;
  const access = command.accessBefore as AccessProjection;
  validateEnvironmentProjection(before, "environment before external mutation");
  validateAccessProjection(access, "production access before external mutation");
  assertContemporaneous(before.observedAt, "environment before external mutation", {
    notBeforeMs: Date.parse(input.coordinatorStartedAt),
    notAfterMs: Date.parse(observedAt)
  });
  assertContemporaneous(access.observedAt, "access before external mutation", {
    notBeforeMs: Date.parse(input.coordinatorStartedAt),
    notAfterMs: Date.parse(observedAt)
  });
  if (
    before.projectId !== input.target.projectId || access.projectId !== input.target.projectId ||
    access.origin !== input.target.origin ||
    before.revision >= Number.MAX_SAFE_INTEGER ||
    text(command.sourceHeadBefore, "source head before external mutation") !== CLEAN_SOURCE_COMMIT ||
    text(command.sourcePushExpectedOld, "source compare-and-swap precondition") !== CLEAN_SOURCE_COMMIT ||
    text(command.sourceHeadAfter, "source head after external mutation") !== input.deploymentCommit ||
    timestamp(command.temporaryControlExpiresAt, "temporary-control expiry") !== input.coordinatorExpiresAt ||
    hex(command.temporaryControlAuthSha256, "temporary-control auth hash") !== input.censusAuthSha256 ||
    hex(command.temporaryControlBuildAttestation, "temporary-control build attestation") !== input.sourceAnchor ||
    stableJson(command.mutationSequence) !== stableJson(EXTERNAL_MUTATION_SEQUENCE)
  ) throw new Error("external-mutation intent does not match the frozen session boundary");
  const intent = {
    version: "os01-external-mutation-intent.2026.1",
    status: "armed_cleanup_required_before_external_mutation",
    runId: input.runId,
    seedCommitment: input.seedCommitment,
    targetProjectId: input.target.projectId,
    targetOrigin: input.target.origin,
    sourceAnchor: input.sourceAnchor,
    authorityCommit: input.authorityCommit,
    implementationCommit: input.implementationCommit,
    deploymentCommit: input.deploymentCommit,
    productionSessionLockIdentityHash: input.productionSessionLockIdentityHash,
    localArchiveSha256: input.localArchive.archiveSha256,
    localArchiveBytes: input.localArchive.archiveBytes,
    localArchiveFileListRoot: input.localArchive.fileListRoot,
    localArchiveFileCount: input.localArchive.fileCount,
    localPackageContentRoot: input.localPackageContentRoot,
    environmentBefore: before,
    accessBefore: access,
    sourceHeadBefore: CLEAN_SOURCE_COMMIT,
    sourcePushExpectedOld: CLEAN_SOURCE_COMMIT,
    sourceHeadAfter: input.deploymentCommit,
    temporaryControls: [...os01ControlPlaneContract.temporaryControls],
    temporaryControlsSingleUpdate: true,
    temporaryControlExpiresAt: input.coordinatorExpiresAt,
    temporaryControlAuthSha256: input.censusAuthSha256,
    temporaryControlBuildAttestation: input.sourceAnchor,
    temporaryControlEnvironmentRevisionBefore: before.revision,
    temporaryControlEnvironmentRevisionStaged: before.revision + 1,
    mutationSequence: [...EXTERNAL_MUTATION_SEQUENCE],
    observedAt
  };
  return { intent, intentHash: sha256(stableJson(intent)), environmentBefore: before, accessBefore: access, observedAt };
}

async function main(): Promise<void> {
  if (process.argv.includes("--target") || process.argv.includes("--provider")) {
    throw new Error("the private-seed session has one fixed provider-independent production target");
  }
  const authorityRoot = realpathSync(process.cwd());
  assertFrozenQualificationAuthorityProcess(authorityRoot);
  const target = configuredTrustedTarget("production");
  const routeContract = JSON.parse(
    readFileSync(resolve(authorityRoot, "config/os01-production-census.v1.json"), "utf8")
  ) as { route: string };
  if (typeof routeContract.route !== "string" || !routeContract.route.startsWith("/")) {
    throw new Error("production census route contract is invalid");
  }
  const qualificationDirectory = canonicalDirectory(argument("--qualification-dir"), "qualification directory");
  const authorityCommit = text(argument("--authority-commit"), "authority commit");
  const implementationCommit = text(argument("--implementation-commit"), "implementation commit");
  const pnpmExecutablePath = realpathSync(argument("--pnpm-executable"));
  const implementationRoots = [
    canonicalDirectory(argument("--implementation-worktree-a"), "first implementation worktree"),
    canonicalDirectory(argument("--implementation-worktree-b"), "second implementation worktree")
  ] as const;
  if (implementationRoots[0] === implementationRoots[1]) throw new Error("implementation worktrees must differ");
  for (const name of [
    "deployment-proof.json", "deployment.tar.gz", "deployment-a.tar.gz", "deployment-b.tar.gz",
    "census-receipt-reservation.json", "census-receipt.json", "session-receipt.json",
    "session-acceptance.json", "session-acceptance-failure.json", "session-lock-release.json",
    "session-rejection-receipt.json", "external-mutation-intent.json", "session-phase-ledger.jsonl"
  ]) {
    if (existsSync(resolve(qualificationDirectory, name))) throw new Error(`qualification output already exists: ${name}`);
  }

  const coordinator = ProductionQualificationCoordinator.start();
  const tokenEntropy = randomBytes(32);
  const tokenBytes = encodeHex(tokenEntropy);
  tokenEntropy.fill(0);
  coordinator.registerSensitiveMaterial(tokenBytes);
  let sessionLock: Os01ProductionSessionLock | null = null;
  let phaseLedger: Os01SessionPhaseLedger | null = null;
  let archiveSnapshot: ImmutableLocalArchiveSnapshot | null = null;
  let externalMutationIntentBytes: Buffer | null = null;
  let closed = false;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let signalRejector: (() => void) | null = null;
  const closeSecrets = (): void => {
    if (closed) return;
    closed = true;
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    expiryTimer = null;
    archiveSnapshot?.close();
    archiveSnapshot = null;
    externalMutationIntentBytes?.fill(0);
    externalMutationIntentBytes = null;
    phaseLedger?.close();
    sessionLock?.close();
    coordinator.close();
    tokenBytes.fill(0);
  };
  process.once("exit", closeSecrets);
  process.once("SIGINT", () => {
    try { signalRejector?.(); } finally { closeSecrets(); process.exit(130); }
  });
  process.once("SIGTERM", () => {
    try { signalRejector?.(); } finally { closeSecrets(); process.exit(143); }
  });

  try {
    sessionLock = Os01ProductionSessionLock.acquire({
      targetProjectId: target.projectId,
      runId: coordinator.runId,
      seedCommitment: coordinator.seedCommitment,
      startedAt: coordinator.startedAt,
      expiresAt: coordinator.expiresAt
    });
    phaseLedger = Os01SessionPhaseLedger.create(
      resolve(qualificationDirectory, "session-phase-ledger.jsonl"),
      coordinator.runId
    );
    phaseLedger.advance("session_lock_acquired", coordinator.startedAt);
    const sourceAnchorEvidence: SourceAnchorEvidence = prepareSourceAnchorEvidence({
      authorityRepositoryRoot: authorityRoot,
      authorityCommit,
      implementationRepositoryRoots: implementationRoots,
      implementationCommit,
      pnpmExecutablePath,
      target,
      productionCoordinator: coordinator
    });
    const censusAuthSha256 = sha256(tokenBytes);
    phaseLedger.advance("source_anchor_ready");
    emit({
      event: "source_anchor_ready",
      version: "os01-private-seed-session.2026.1",
      runId: coordinator.runId,
      seedCommitment: coordinator.seedCommitment,
      expiresAt: coordinator.expiresAt,
      sourceAnchor: sourceAnchorEvidence.sourceAnchor,
      censusAuthSha256,
      productionSessionLockIdentityHash: sessionLock.evidence.lockIdentityHash
    });

    let gitEvidence: GitSuccessorEvidence | null = null;
    let deploymentBuild: LocalBuildEvidence | null = null;
    let packageManifest: PackageManifestEvidence | null = null;
    let localArchive: LocalArchiveEvidence | null = null;
    let qualificationArchiveBoundary: QualificationArchiveBoundaryEvidence | null = null;
    let environmentBefore: EnvironmentProjection | null = null;
    let environmentStaged: EnvironmentProjection | null = null;
    let accessBefore: AccessProjection | null = null;
    let uploaderAssertion: TrustedUploaderAssertion | null = null;
    let censusResult: { status: string; receiptHash: string; output: string } | null = null;
    let cleanupNotBeforeMs: number | null = null;
    let deploymentVersionId: string | null = null;
    let deploymentRoots: readonly [string, string] | null = null;
    let externalMutationIntentHash: string | null = null;
    let externalMutationIntent: Record<string, unknown> | null = null;
    let acceptanceTrust: Os01SessionAcceptanceTrust | null = null;
    let finalizationTrust: Os01SessionFinalizationTrust | null = null;
    let controlsStaged = false;
    let cleanupVerified = false;
    let terminalFailure = false;
    let acceptanceCommitStarted = false;
    let acceptancePublished = false;
    let currentPhase = "awaiting_deployment_build";
    let lastCommandHash: string | null = null;
    let commandChain = Promise.resolve();
    let pendingCommandCount = 0;
    const interface_ = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
    const requireSessionLock = (): Os01ProductionSessionLock => {
      if (sessionLock === null) throw new Error("OS-01 production-session lock is unavailable");
      return sessionLock;
    };
    const requirePhaseLedger = (): Os01SessionPhaseLedger => {
      if (phaseLedger === null) throw new Error("OS-01 session phase ledger is unavailable");
      return phaseLedger;
    };

    const publishRejection = (): void => {
      if (terminalFailure) return;
      terminalFailure = true;
      try {
        const rejectionPhase = requireSessionLock().externalMutationArmed
          ? cleanupVerified
            ? "session_rejected_after_verified_cleanup"
            : "session_rejected_cleanup_required"
          : "session_rejected_before_external_mutation";
        requirePhaseLedger().advance(rejectionPhase);
        const phaseLedgerEvidence = requirePhaseLedger().snapshot();
        const disposition = requireSessionLock().terminalDisposition();
        const status = disposition.cleanupRequired
          ? "rejected_cleanup_required"
          : cleanupVerified
            ? "rejected_after_verified_cleanup"
            : "rejected_before_external_mutation";
        const receipt = {
          version: "os01-private-seed-session-rejection.2026.1",
          status,
          runId: coordinator.runId,
          seedCommitment: coordinator.seedCommitment,
          sourceAnchor: sourceAnchorEvidence.sourceAnchor,
          authorityCommit,
          implementationCommit,
          failurePhase: currentPhase,
          lastCommandHash,
          controlsStaged,
          externalMutationArmed: requireSessionLock().externalMutationArmed,
          externalMutationIntentHash,
          cleanupVerified,
          productionSessionLockIdentityHash: requireSessionLock().evidence.lockIdentityHash,
          productionSessionLockDisposition: disposition.lockDisposition,
          productionSessionLockRelease: disposition.release,
          phaseLedger: phaseLedgerEvidence,
          providerSecretReads: 0,
          providerRequests: 0,
          quotaReservations: 0,
          rejectedAt: new Date().toISOString()
        };
        const receiptHash = sha256(stableJson(receipt));
        const receiptBytes = Buffer.from(`${JSON.stringify({ ...receipt, receiptHash }, null, 2)}\n`, "utf8");
        coordinator.assertEvidenceBytesSafe(
          receiptBytes,
          "private-seed rejection receipt",
          Date.now(),
          { allowExpired: true }
        );
        publishEvidenceBytesExclusive(
          resolve(qualificationDirectory, "session-rejection-receipt.json"),
          receiptBytes
        );
        emit({
          event: disposition.cleanupRequired ? "cleanup_required" : "session_rejected",
          status: receipt.status,
          runId: coordinator.runId,
          failurePhase: currentPhase,
          receiptHash,
          rejectionEvidence: "published"
        });
      } catch {
        emit({
          event: requireSessionLock().externalMutationArmed ? "cleanup_required" : "session_rejected",
          status: requireSessionLock().externalMutationArmed
            ? "rejected_cleanup_required"
            : "rejected_before_external_mutation",
          runId: coordinator.runId,
          failurePhase: currentPhase,
          rejectionEvidence: "publication_failed"
        });
        throw new Error("private-seed rejection evidence publication failed");
      } finally {
        interface_.close();
        closeSecrets();
      }
    };
    const publishAcceptanceFailure = (): void => {
      if (terminalFailure) return;
      terminalFailure = true;
      try {
        const disposition = requireSessionLock().terminalDisposition();
        const receipt = {
          version: "os01-private-seed-session-acceptance-failure.2026.1",
          status: "unaccepted_acceptance_commit_failed_lock_retained",
          runId: coordinator.runId,
          seedCommitment: coordinator.seedCommitment,
          sourceAnchor: sourceAnchorEvidence.sourceAnchor,
          authorityCommit,
          implementationCommit,
          failurePhase: currentPhase,
          lastCommandHash,
          cleanupVerified,
          acceptanceCommitStarted,
          acceptancePublished,
          productionSessionLockIdentityHash: requireSessionLock().evidence.lockIdentityHash,
          productionSessionLockDisposition: disposition.lockDisposition,
          phaseLedger: requirePhaseLedger().snapshot(),
          providerSecretReads: 0,
          providerRequests: 0,
          quotaReservations: 0,
          failedAt: new Date().toISOString()
        };
        const failureHash = sha256(stableJson(receipt));
        const receiptBytes = Buffer.from(`${JSON.stringify({ ...receipt, failureHash }, null, 2)}\n`, "utf8");
        coordinator.assertEvidenceBytesSafe(
          receiptBytes,
          "private-seed acceptance-failure receipt",
          Date.now(),
          { allowExpired: true }
        );
        publishEvidenceBytesExclusive(
          resolve(qualificationDirectory, "session-acceptance-failure.json"),
          receiptBytes
        );
        emit({
          event: "session_unaccepted",
          status: receipt.status,
          runId: coordinator.runId,
          failureHash,
          productionSessionLockDisposition: disposition.lockDisposition
        });
      } catch {
        emit({
          event: "session_unaccepted",
          status: "unaccepted_acceptance_commit_failed_lock_retained",
          runId: coordinator.runId,
          failureEvidence: "publication_failed"
        });
      } finally {
        interface_.close();
        closeSecrets();
      }
    };
    signalRejector = publishRejection;
    expiryTimer = setTimeout(() => {
      currentPhase = "session_expired";
      publishRejection();
    }, Math.max(1, Date.parse(coordinator.expiresAt) - Date.now()));

    const handleCommandUnsafe = async (line: string): Promise<void> => {
      if (Buffer.byteLength(line, "utf8") > MAX_COMMAND_BYTES) throw new Error("session command exceeds byte limit");
      coordinator.assertActive();
      lastCommandHash = sha256(line);
      const command = record(JSON.parse(line) as unknown, "session command");
      const name = text(command.command, "session command name");
      currentPhase = name;
      coordinator.assertEvidenceBytesSafe(Buffer.from(line, "utf8"), "private-seed control-plane command");
      if (name === "build_deployment") {
        exactKeys(command, ["command", "deploymentCommit", "deploymentWorktreeA", "deploymentWorktreeB"], name);
        if (gitEvidence !== null) throw new Error("deployment build is already qualified");
        const deploymentCommit = text(command.deploymentCommit, "deployment commit");
        const roots = [
          canonicalDirectory(text(command.deploymentWorktreeA, "first deployment worktree"), "first deployment worktree"),
          canonicalDirectory(text(command.deploymentWorktreeB, "second deployment worktree"), "second deployment worktree")
        ] as const;
        if (roots[0] === roots[1]) throw new Error("deployment worktrees must differ");
        const firstGit = validateGitSuccessor(roots[0], implementationCommit, deploymentCommit);
        const secondGit = validateGitSuccessor(roots[1], implementationCommit, deploymentCommit);
        if (stableJson(firstGit) !== stableJson(secondGit)) throw new Error("deployment successor evidence differs");
        const firstBuild = freshBuildEvidence(
          roots[0], deploymentCommit, "first private-seed C1 build", sourceAnchorEvidence.sourceAnchor,
          true, target, "deployment", pnpmExecutablePath, coordinator
        );
        const secondBuild = freshBuildEvidence(
          roots[1], deploymentCommit, "second private-seed C1 build", sourceAnchorEvidence.sourceAnchor,
          true, target, "deployment", pnpmExecutablePath, coordinator
        );
        if (stableJson(firstBuild) !== stableJson(secondBuild)) throw new Error("private-seed C1 builds differ");
        const firstPackage = expectedPackageManifest(roots[0], target);
        const secondPackage = expectedPackageManifest(roots[1], target);
        if (stableJson(firstPackage) !== stableJson(secondPackage)) throw new Error("private-seed package manifests differ");
        const archivePath = resolve(qualificationDirectory, "deployment.tar.gz");
        const firstArchivePath = resolve(qualificationDirectory, "deployment-a.tar.gz");
        const secondArchivePath = resolve(qualificationDirectory, "deployment-b.tar.gz");
        if (dirname(archivePath) !== qualificationDirectory || !archivePath.startsWith(`${qualificationDirectory}${sep}`)) {
          throw new Error("qualification archive escapes its directory");
        }
        packageArchive(authorityRoot, roots[0], firstArchivePath);
        packageArchive(authorityRoot, roots[1], secondArchivePath);
        const firstArchiveSnapshot = ImmutableLocalArchiveSnapshot.open(firstArchivePath);
        const secondArchiveSnapshot = ImmutableLocalArchiveSnapshot.open(secondArchivePath);
        let finalArchiveSnapshot: ImmutableLocalArchiveSnapshot | null = null;
        try {
          firstArchiveSnapshot.assertUnchanged();
          secondArchiveSnapshot.assertUnchanged();
          if (!firstArchiveSnapshot.hasExactBytes(secondArchiveSnapshot)) {
            throw new Error("private-seed deployment archives are not byte-reproducible");
          }
          renameSync(firstArchivePath, archivePath);
          finalArchiveSnapshot = ImmutableLocalArchiveSnapshot.open(archivePath);
          if (
            !finalArchiveSnapshot.sameFileObject(firstArchiveSnapshot) ||
            !finalArchiveSnapshot.hasExactBytes(firstArchiveSnapshot)
          ) throw new Error("private-seed deployment archive changed during finalization");
          secondArchiveSnapshot.close();
          rmSync(secondArchivePath, { force: true });
          archiveSnapshot = finalArchiveSnapshot;
          finalArchiveSnapshot = null;
        } finally {
          firstArchiveSnapshot.close();
          secondArchiveSnapshot.close();
          finalArchiveSnapshot?.close();
        }
        const archive = localArchiveEvidence(archiveSnapshot);
        validateArchivePackageBinding({
          archive,
          packageManifest: firstPackage,
          proofBuild: {
            localArchiveSha256: archive.archiveSha256,
            localArchiveBytes: archive.archiveBytes,
            localArchiveFileListRoot: archive.fileListRoot,
            localArchiveContentRoot: archive.contentRoot,
            localArchiveFileCount: archive.fileCount,
            packageContentRoot: firstPackage.contentRoot,
            packageFileListRoot: firstPackage.fileListRoot,
            packageFileCount: firstPackage.fileCount
          }
        });
        const boundary = verifyQualificationArchiveBoundary({
          path: archivePath,
          snapshot: archiveSnapshot,
          qualificationBuild: firstBuild.qualificationBuild,
          productionCoordinator: coordinator
        });
        gitEvidence = firstGit;
        deploymentBuild = firstBuild;
        packageManifest = firstPackage;
        localArchive = archive;
        qualificationArchiveBoundary = boundary;
        deploymentRoots = roots;
        requirePhaseLedger().advance("deployment_archive_ready");
        emit({
          event: "deployment_archive_ready",
          runId: coordinator.runId,
          deploymentCommit,
          archiveSha256: archive.archiveSha256,
          archiveBytes: archive.archiveBytes,
          archiveFileCount: archive.fileCount,
          archiveBoundaryRoot: boundary.scanRoot
        });
        return;
      }

      if (name === "arm_external_mutation") {
        if (!gitEvidence || !deploymentBuild || !packageManifest || !localArchive ||
          !archiveSnapshot || !qualificationArchiveBoundary || !deploymentRoots) {
          throw new Error("deployment archive is not qualified");
        }
        archiveSnapshot.assertUnchanged();
        if (externalMutationIntentHash !== null || externalMutationIntent !== null) {
          throw new Error("external mutation is already armed");
        }
        const {
          intent,
          intentHash,
          environmentBefore: before,
          accessBefore: access,
          observedAt
        } = constructExternalMutationIntent({
          command,
          target,
          runId: coordinator.runId,
          seedCommitment: coordinator.seedCommitment,
          sourceAnchor: sourceAnchorEvidence.sourceAnchor,
          authorityCommit,
          implementationCommit,
          deploymentCommit: gitEvidence.deploymentCommit,
          coordinatorStartedAt: coordinator.startedAt,
          coordinatorExpiresAt: coordinator.expiresAt,
          censusAuthSha256,
          productionSessionLockIdentityHash: requireSessionLock().evidence.lockIdentityHash,
          localArchive,
          localPackageContentRoot: packageManifest.contentRoot
        });
        const intentBytes = Buffer.from(`${JSON.stringify({ ...intent, intentHash }, null, 2)}\n`, "utf8");
        coordinator.assertEvidenceBytesSafe(intentBytes, "external-mutation intent receipt");
        requireSessionLock().armExternalMutation(intentHash);
        try {
          publishEvidenceBytesExclusive(
            resolve(qualificationDirectory, "external-mutation-intent.json"),
            intentBytes
          );
          externalMutationIntent = intent;
          externalMutationIntentHash = intentHash;
          externalMutationIntentBytes = Buffer.from(intentBytes);
        } finally {
          intentBytes.fill(0);
        }
        environmentBefore = before;
        accessBefore = access;
        requirePhaseLedger().advance("external_mutation_armed", observedAt);
        emit({
          event: "external_mutation_armed",
          runId: coordinator.runId,
          intentHash,
          expiresAt: coordinator.expiresAt,
          productionSessionLockIdentityHash: requireSessionLock().evidence.lockIdentityHash
        });
        return;
      }

      if (name === "proof_and_census") {
        exactKeys(command, [
          "access", "command", "deployment", "environmentBefore", "environmentStaged",
          "mutationIntentHash", "observedAt", "sitesVersion", "uploader"
        ], name);
        if (!gitEvidence || !deploymentBuild || !packageManifest || !localArchive ||
          !archiveSnapshot || !qualificationArchiveBoundary || !deploymentRoots) {
          throw new Error("deployment archive is not qualified");
        }
        archiveSnapshot.assertUnchanged();
        if (censusResult !== null) throw new Error("census already ran");
        if (externalMutationIntentHash === null || externalMutationIntent === null ||
          hex(command.mutationIntentHash, "external-mutation intent hash") !== externalMutationIntentHash) {
          throw new Error("proof and census require the live external-mutation intent");
        }
        requireSessionLock().assertExternalMutationIntent(externalMutationIntentHash);
        const access = command.access as AccessProjection;
        const sitesVersion = command.sitesVersion as VersionProjection;
        const deployment = command.deployment as DeploymentProjection;
        const before = command.environmentBefore as EnvironmentProjection;
        const staged = command.environmentStaged as EnvironmentProjection;
        const uploader = command.uploader as TrustedUploaderAssertion;
        validateAccessProjection(access, "production access");
        validateVersionProjection(sitesVersion, "temporary Sites version");
        validateDeploymentProjection(deployment, "temporary deployment");
        validateEnvironmentProjection(before, "environment before");
        validateEnvironmentProjection(staged, "environment staged");
        validateEnvironmentStaging(before, staged);
        controlsStaged = true;
        if (
          stableJson(before) !== stableJson(environmentBefore) || stableJson(access) !== stableJson(accessBefore) ||
          before.projectId !== target.projectId || staged.projectId !== target.projectId ||
          deployment.environmentRevision !== staged.revision
        ) {
          throw new Error("deployment is not bound to the staged environment revision");
        }
        const observedAt = text(command.observedAt, "proof observation time");
        const observedMs = Date.parse(timestamp(observedAt, "proof observation time"));
        const notBeforeMs = Date.parse(coordinator.startedAt);
        for (const [label, projectedAt] of [
          ["access", access.observedAt],
          ["version", sitesVersion.observedAt],
          ["deployment", deployment.observedAt],
          ["deployment update", deployment.updatedAt],
          ["environment before", before.observedAt],
          ["environment staged", staged.observedAt],
          ["uploader", uploader.observedAt]
        ] as const) assertContemporaneous(projectedAt, label, { notBeforeMs, notAfterMs: observedMs });
        if (staged.updatedAt === null) throw new Error("staged environment update time is absent");
        assertContemporaneous(staged.updatedAt, "staged environment update", { notBeforeMs, notAfterMs: observedMs });
        validateTrustedUploaderAssertion(uploader, sitesVersion, {
          archiveSha256: localArchive.archiveSha256,
          archiveBytes: localArchive.archiveBytes,
          fileListRoot: localArchive.fileListRoot,
          fileCount: localArchive.fileCount,
          packageContentRoot: packageManifest.contentRoot
        });
        if (
          uploader.sourceHeadBefore !== CLEAN_SOURCE_COMMIT ||
          uploader.sourcePushExpectedOld !== CLEAN_SOURCE_COMMIT ||
          uploader.sourceHeadAfter !== gitEvidence.deploymentCommit ||
          uploader.mutationIntentHash !== externalMutationIntentHash ||
          uploader.temporaryControlExpiresAt !== coordinator.expiresAt ||
          uploader.temporaryControlAuthSha256 !== censusAuthSha256 ||
          uploader.temporaryControlBuildAttestation !== sourceAnchorEvidence.sourceAnchor ||
          uploader.temporaryControlEnvironmentRevisionBefore !== before.revision ||
          uploader.temporaryControlEnvironmentRevisionStaged !== staged.revision ||
          uploader.temporaryControlsSingleUpdate !== true ||
          stableJson(uploader.externalMutationSequence) !== stableJson(EXTERNAL_MUTATION_SEQUENCE)
        ) throw new Error("trusted uploader does not bind the immutable external-mutation intent");
        const proofInput: DeploymentProofConstructionInput = {
          target,
          observedAt,
          sourceAnchorEvidence,
          gitEvidence,
          deploymentBuild,
          packageManifest,
          localArchive,
          qualificationArchiveBoundary,
          sitesVersion,
          deployment,
          access,
          uploader
        };
        const proofPath = resolve(qualificationDirectory, "deployment-proof.json");
        writeDeploymentProofExclusive(
          proofPath,
          proofInput,
          (bytes, label) => coordinator.assertEvidenceBytesSafe(bytes, label)
        );
        if (externalMutationIntentBytes === null) {
          throw new Error("external-mutation intent bytes are unavailable");
        }
        const deploymentProofBytes = readFileSync(proofPath);
        try {
          coordinator.assertEvidenceBytesSafe(deploymentProofBytes, "private-seed trusted deployment proof");
          acceptanceTrust = Object.freeze({
            version: "os01-session-acceptance-trust.2026.1",
            runId: coordinator.runId,
            seedCommitment: coordinator.seedCommitment,
            targetProjectId: target.projectId,
            targetOrigin: target.origin,
            authorityCommit,
            implementationCommit,
            deploymentCommit: gitEvidence.deploymentCommit,
            sourceAnchor: sourceAnchorEvidence.sourceAnchor,
            deploymentProofHash: sha256(deploymentProofBytes),
            externalMutationIntentHash,
            externalMutationIntentBytesSha256: sha256(externalMutationIntentBytes),
            archiveSha256: localArchive.archiveSha256,
            archiveBytes: localArchive.archiveBytes,
            archiveFileListRoot: localArchive.fileListRoot,
            archiveContentRoot: localArchive.contentRoot,
            archiveFileCount: localArchive.fileCount,
            localPackageContentRoot: packageManifest.contentRoot,
            productionSessionLockIdentityHash: requireSessionLock().evidence.lockIdentityHash
          });
        } finally {
          deploymentProofBytes.fill(0);
        }
        const paths: QualificationPaths = {
          directory: qualificationDirectory,
          deploymentProof: proofPath,
          deploymentArchive: resolve(qualificationDirectory, "deployment.tar.gz"),
          output: resolve(qualificationDirectory, "census-receipt.json")
        };
        const result = await executeQualifiedCensus({
          target,
          qualificationPaths: paths,
          authorityRepositoryRoot: authorityRoot,
          implementationRepositoryRoots: implementationRoots,
          repositoryRoots: deploymentRoots,
          archivePath: paths.deploymentArchive,
          archiveSnapshot,
          authorityCommit,
          implementationCommit,
          sourceCommit: gitEvidence.deploymentCommit,
          deploymentVersion: sitesVersion.versionId,
          expectedBuildAttestation: sourceAnchorEvidence.sourceAnchor,
          pnpmExecutablePath,
          secrets: {
            endpoint: `${target.origin}${routeContract.route}`,
            censusToken: Buffer.from(tokenBytes).toString("ascii")
          },
          productionCoordinator: coordinator
        });
        coordinator.assertActive();
        if (result.status !== "accepted_two_identical_read_only_passes") {
          throw new Error("production census did not produce the required accepted two-pass result");
        }
        environmentBefore = before;
        environmentStaged = staged;
        accessBefore = access;
        uploaderAssertion = uploader;
        censusResult = result;
        deploymentVersionId = sitesVersion.versionId;
        const proofAndCensusCompletedAt = new Date().toISOString();
        requirePhaseLedger().advance("proof_and_census_complete", proofAndCensusCompletedAt);
        cleanupNotBeforeMs = Date.parse(proofAndCensusCompletedAt);
        emit({ event: "census_complete", status: result.status, receiptHash: result.receiptHash });
        return;
      }

      if (name === "cleanup") {
        if (pendingCommandCount !== 1) {
          throw new Error("cleanup must be the only remaining session command");
        }
        interface_.removeAllListeners("line");
        interface_.pause();
        exactKeys(command, [
          "accessAfter", "bindings", "cleanDeployment", "cleanVersion", "command", "environmentAfter",
          "http", "observedAt", "providerState", "sourceRestoration"
        ], name);
        if (!censusResult || !environmentBefore || !environmentStaged || !accessBefore || !deploymentVersionId ||
          !gitEvidence || !deploymentBuild || !packageManifest || !localArchive || !archiveSnapshot ||
          !qualificationArchiveBoundary ||
          !uploaderAssertion || cleanupNotBeforeMs === null || externalMutationIntentHash === null ||
          externalMutationIntent === null || externalMutationIntentBytes === null || acceptanceTrust === null) {
          throw new Error("census is not complete");
        }
        archiveSnapshot.assertUnchanged();
        coordinator.assertActive();
        const cleanupObservedAt = timestamp(command.observedAt, "cleanup observation time");
        const cleanupObservedAtMs = Date.parse(cleanupObservedAt);
        assertContemporaneous(cleanupObservedAt, "cleanup", {
          notBeforeMs: cleanupNotBeforeMs,
          notAfterMs: Date.now() + os01ControlPlaneContract.observationMaximumFutureSkewSeconds * 1000
        });
        const environmentAfter = command.environmentAfter as EnvironmentProjection;
        const accessAfter = command.accessAfter as AccessProjection;
        const cleanVersion = command.cleanVersion as VersionProjection;
        const cleanDeployment = command.cleanDeployment as DeploymentProjection;
        validateEnvironmentProjection(environmentAfter, "environment after");
        validateEnvironmentLifecycle(environmentBefore, environmentStaged, environmentAfter);
        validateAccessProjection(accessAfter, "production access after cleanup");
        validateVersionProjection(cleanVersion, "clean Sites version");
        validateDeploymentProjection(cleanDeployment, "clean deployment");
        if (environmentAfter.projectId !== target.projectId) {
          throw new Error("clean environment project does not match production");
        }
        for (const [label, projectedAt] of [
          ["environment after", environmentAfter.observedAt],
          ["access after", accessAfter.observedAt],
          ["clean version", cleanVersion.observedAt],
          ["clean deployment", cleanDeployment.observedAt],
          ["clean deployment update", cleanDeployment.updatedAt]
        ] as const) assertContemporaneous(projectedAt, label, {
          notBeforeMs: cleanupNotBeforeMs,
          notAfterMs: cleanupObservedAtMs
        });
        if (environmentAfter.updatedAt === null) throw new Error("clean environment update time is absent");
        assertContemporaneous(environmentAfter.updatedAt, "clean environment update", {
          notBeforeMs: cleanupNotBeforeMs,
          notAfterMs: cleanupObservedAtMs
        });
        const cleanHttp = validateCleanupHttpObservations({
          value: command.http,
          origin: target.origin,
          censusRoute: routeContract.route,
          notBeforeMs: cleanupNotBeforeMs,
          notAfterMs: cleanupObservedAtMs,
          scan: (bytes, label) => coordinator.assertEvidenceBytesSafe(bytes, label)
        });
        const bindings = validateBindingObservation(command.bindings, {
          projectId: target.projectId,
          notBeforeMs: cleanupNotBeforeMs,
          notAfterMs: cleanupObservedAtMs
        });
        const providerState = validateProviderStateObservation(command.providerState, {
          notBeforeMs: cleanupNotBeforeMs,
          notAfterMs: cleanupObservedAtMs
        });
        const sourceRestoration = validateSourceRestorationObservation(command.sourceRestoration, {
          deploymentCommit: gitEvidence.deploymentCommit,
          deploymentTreeObjectId: gitEvidence.deploymentTreeObjectId,
          cleanTreeObjectId: gitEvidence.liveBaseTreeObjectId,
          notBeforeMs: cleanupNotBeforeMs,
          notAfterMs: cleanupObservedAtMs
        });
        if (
          accessAfter.revision !== accessBefore.revision ||
          accessAfter.principalRoot !== accessBefore.principalRoot ||
          accessAfter.projectId !== target.projectId || accessAfter.origin !== target.origin ||
          cleanVersion.versionId !== CLEAN_VERSION_ID || cleanVersion.sourceCommit !== CLEAN_SOURCE_COMMIT ||
          cleanVersion.projectId !== target.projectId ||
          cleanDeployment.versionId !== CLEAN_VERSION_ID || cleanDeployment.status !== "succeeded" ||
          cleanDeployment.projectId !== target.projectId || cleanDeployment.origin !== target.origin ||
          cleanDeployment.environmentRevision !== environmentAfter.revision
        ) throw new Error("clean production restoration does not match the frozen boundary");
        coordinator.assertActive();
        requireSessionLock().assertExternalMutationIntent(externalMutationIntentHash);
        cleanupVerified = true;
        requirePhaseLedger().advance("cleanup_verified", cleanupObservedAt);
        const receipt = {
          version: "os01-private-seed-session-receipt.2026.4",
          status: "verified_cleanup_pending_acceptance_marker",
          runId: coordinator.runId,
          seedCommitment: coordinator.seedCommitment,
          sourceAnchor: sourceAnchorEvidence.sourceAnchor,
          authorityCommit,
          implementationCommit,
          deploymentCommit: gitEvidence.deploymentCommit,
          temporaryDeploymentVersionId: deploymentVersionId,
          qualificationBuild: deploymentBuild.qualificationBuild,
          archive: localArchive,
          qualificationArchiveBoundary,
          censusStatus: censusResult.status,
          censusReceiptHash: censusResult.receiptHash,
          uploaderAssertionRoot: sha256(stableJson(uploaderAssertion)),
          externalMutationIntentHash,
          externalMutationIntentRoot: sha256(stableJson(externalMutationIntent)),
          productionSessionLock: requireSessionLock().evidence,
          productionSessionLockIdentityHash: requireSessionLock().evidence.lockIdentityHash,
          productionSessionLockDisposition: "retained_until_acceptance_publication",
          phaseLedgerAtCleanup: requirePhaseLedger().snapshot(),
          environment: { before: environmentBefore, staged: environmentStaged, after: environmentAfter },
          access: { before: accessBefore, after: accessAfter },
          cleanVersion,
          cleanDeployment,
          sourceRestoration,
          cleanHttp,
          bindings,
          providerState,
          providerSecretReads: 0,
          providerRequests: 0,
          quotaReservations: 0,
          completedAt: cleanupObservedAt
        };
        const receiptHash = sha256(stableJson(receipt));
        const receiptBytes = Buffer.from(`${JSON.stringify({ ...receipt, receiptHash }, null, 2)}\n`, "utf8");
        coordinator.assertActive();
        coordinator.assertEvidenceBytesSafe(receiptBytes, "private-seed session receipt");
        acceptanceCommitStarted = true;
        requireSessionLock().assertOwned();
        requirePhaseLedger().advance("session_complete", cleanupObservedAt);
        const finalPhaseLedger = requirePhaseLedger().snapshot();
        const phaseLedgerBytes = readFileSync(requirePhaseLedger().path);
        const censusReceiptBytes = readFileSync(censusResult.output);
        coordinator.assertEvidenceBytesSafe(phaseLedgerBytes, "private-seed terminal phase ledger");
        coordinator.assertEvidenceBytesSafe(censusReceiptBytes, "private-seed bound census receipt");
        const censusReceipt = record(
          JSON.parse(Buffer.from(censusReceiptBytes).toString("utf8")) as unknown,
          "private-seed bound census receipt"
        );
        const censusStartedAt = timestamp(censusReceipt.startedAt, "census receipt start");
        const censusCompletedAt = timestamp(censusReceipt.completedAt, "census receipt completion");
        const trustBoundaryRoot = os01SessionAcceptanceTrustRoot(acceptanceTrust);
        finalizationTrust = Object.freeze({
          version: "os01-session-finalization-trust.2026.1",
          acceptanceTrustRoot: trustBoundaryRoot,
          runId: coordinator.runId,
          seedCommitment: coordinator.seedCommitment,
          targetProjectId: target.projectId,
          sourceAnchor: sourceAnchorEvidence.sourceAnchor,
          productionSessionLockIdentityHash: requireSessionLock().evidence.lockIdentityHash,
          censusReceiptBytesSha256: sha256(censusReceiptBytes),
          censusReceiptHash: censusResult.receiptHash,
          sessionReceiptBytesSha256: sha256(receiptBytes),
          sessionReceiptHash: receiptHash,
          phaseLedgerBytesSha256: sha256(phaseLedgerBytes),
          phaseLedgerEntryCount: finalPhaseLedger.entryCount,
          phaseLedgerLastEntryHash: finalPhaseLedger.lastEntryHash,
          censusStartedAt,
          censusCompletedAt,
          completedAt: cleanupObservedAt
        });
        const finalizationTrustRoot = os01SessionFinalizationTrustRoot(
          finalizationTrust,
          acceptanceTrust
        );
        const acceptance = {
          version: "os01-private-seed-session-acceptance.2026.4",
          status: "clean_public_production_census_session_accepted",
          runId: coordinator.runId,
          seedCommitment: coordinator.seedCommitment,
          sourceAnchor: sourceAnchorEvidence.sourceAnchor,
          sessionReceiptHash: receiptHash,
          trustBoundaryRoot,
          finalizationTrustRoot,
          productionSessionLockIdentityHash: requireSessionLock().evidence.lockIdentityHash,
          phaseLedger: finalPhaseLedger,
          acceptedAt: cleanupObservedAt
        };
        const acceptanceHash = sha256(stableJson(acceptance));
        const acceptanceBytes = Buffer.from(
          `${JSON.stringify({ ...acceptance, acceptanceHash }, null, 2)}\n`,
          "utf8"
        );
        coordinator.assertActive();
        coordinator.assertEvidenceBytesSafe(acceptanceBytes, "private-seed session acceptance marker");
        try {
          validateOs01SessionAcceptance({
            sessionReceiptBytes: receiptBytes,
            censusReceiptBytes,
            externalMutationIntentBytes,
            acceptanceBytes,
            phaseLedgerBytes,
            trustedBoundary: acceptanceTrust,
            trustedFinalization: finalizationTrust,
            rejectionReceiptPresent: existsSync(resolve(qualificationDirectory, "session-rejection-receipt.json")),
            acceptanceFailureReceiptPresent: existsSync(
              resolve(qualificationDirectory, "session-acceptance-failure.json")
            )
          });
          publishEvidenceBytesExclusive(resolve(qualificationDirectory, "session-receipt.json"), receiptBytes);
          requireSessionLock().publishAcceptanceMarkerExclusive(
            resolve(qualificationDirectory, "session-acceptance.json"),
            acceptanceBytes
          );
          const recoveredReceipt = readFileSync(resolve(qualificationDirectory, "session-receipt.json"));
          const recoveredCensusReceipt = readFileSync(censusResult.output);
          const recoveredAcceptance = readFileSync(resolve(qualificationDirectory, "session-acceptance.json"));
          const recoveredPhaseLedger = readFileSync(requirePhaseLedger().path);
          const recoveredExternalMutationIntent = readFileSync(
            resolve(qualificationDirectory, "external-mutation-intent.json")
          );
          try {
            validateOs01SessionAcceptance({
              sessionReceiptBytes: recoveredReceipt,
              censusReceiptBytes: recoveredCensusReceipt,
              externalMutationIntentBytes: recoveredExternalMutationIntent,
              acceptanceBytes: recoveredAcceptance,
              phaseLedgerBytes: recoveredPhaseLedger,
              trustedBoundary: acceptanceTrust,
              trustedFinalization: finalizationTrust,
              rejectionReceiptPresent: existsSync(resolve(qualificationDirectory, "session-rejection-receipt.json")),
              acceptanceFailureReceiptPresent: existsSync(
                resolve(qualificationDirectory, "session-acceptance-failure.json")
              )
            });
          } finally {
            recoveredReceipt.fill(0);
            recoveredCensusReceipt.fill(0);
            recoveredAcceptance.fill(0);
            recoveredPhaseLedger.fill(0);
            recoveredExternalMutationIntent.fill(0);
          }
        } finally {
          phaseLedgerBytes.fill(0);
          censusReceiptBytes.fill(0);
          externalMutationIntentBytes.fill(0);
        }
        acceptancePublished = true;
        let lockReleaseStatus = "retained_after_acceptance_publication";
        let lockReleaseHash: string | null = null;
        try {
          const productionSessionLockRelease = requireSessionLock().releaseAfterVerifiedCleanup(
            externalMutationIntentHash,
            cleanupObservedAt
          );
          const releaseReceipt = {
            version: "os01-private-seed-session-lock-release-receipt.2026.1",
            status: "released_after_accepted_verified_cleanup",
            runId: coordinator.runId,
            sessionReceiptHash: receiptHash,
            acceptanceHash,
            productionSessionLockRelease
          };
          lockReleaseHash = sha256(stableJson(releaseReceipt));
          const releaseBytes = Buffer.from(
            `${JSON.stringify({ ...releaseReceipt, lockReleaseHash }, null, 2)}\n`,
            "utf8"
          );
          coordinator.assertEvidenceBytesSafe(
            releaseBytes,
            "private-seed post-acceptance lock-release receipt",
            Date.now(),
            { allowExpired: true }
          );
          publishEvidenceBytesExclusive(
            resolve(qualificationDirectory, "session-lock-release.json"),
            releaseBytes
          );
          lockReleaseStatus = "released_and_evidenced_after_acceptance_publication";
        } catch {
          lockReleaseStatus = requireSessionLock().released
            ? "released_but_release_evidence_unavailable"
            : "retained_fail_closed_after_acceptance_publication";
        }
        emit({
          event: "session_complete",
          status: acceptance.status,
          receiptHash,
          acceptanceHash,
          phaseLedger: finalPhaseLedger,
          lockReleaseStatus,
          lockReleaseHash
        });
        closeSecrets();
        interface_.close();
        return;
      }
      throw new Error("unsupported private-seed session command");
    };

    const handleCommand = async (line: string): Promise<void> => {
      if (terminalFailure) throw new Error("private-seed session is already rejected");
      try {
        await handleCommandUnsafe(line);
      } catch {
        if (acceptanceCommitStarted && !acceptancePublished) {
          publishAcceptanceFailure();
          throw new Error("private-seed acceptance commit failed; the session remains unaccepted and locked");
        }
        publishRejection();
        throw new Error("private-seed session command rejected; inspect the immutable rejection receipt");
      }
    };

    await new Promise<void>((resolveSession, rejectSessionPromise) => {
      interface_.on("line", (line) => {
        pendingCommandCount += 1;
        commandChain = commandChain.then(async () => {
          try {
            await handleCommand(line);
          } finally {
            pendingCommandCount -= 1;
          }
        });
        commandChain.catch(rejectSessionPromise);
      });
      interface_.once("close", () => {
        commandChain.then(() => {
          if (!acceptancePublished) {
            if (!terminalFailure) {
              currentPhase = "input_closed_before_verified_cleanup";
              publishRejection();
            }
            rejectSessionPromise(new Error("private-seed input closed without accepted terminal evidence"));
            return;
          }
          resolveSession();
        }, rejectSessionPromise);
      });
      interface_.once("error", (error) => {
        currentPhase = "input_error";
        try {
          publishRejection();
        } catch (publicationError: unknown) {
          rejectSessionPromise(publicationError);
          return;
        }
        rejectSessionPromise(error);
      });
    });
    if (!acceptancePublished) throw new Error("private-seed session ended without accepted terminal evidence");
  } finally {
    closeSecrets();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("OS-01 private-seed session terminated without acceptance.\n");
    process.exitCode = 1;
  });
}
