#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalJson,
  codePointCompare,
  OS01_STAGING_FOREIGN_KEY_CANDIDATES,
  OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES,
  OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
  OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT,
  OS01_STAGING_FOREIGN_KEYS_EXACT_BODY,
  OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256,
  OS01_STAGING_FOREIGN_KEYS_FAILURE_CATEGORIES,
  OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
  OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-foreign-keys/contract";

const RESPONSE_LIMIT_BYTES = 512 * 1024;
const QUALIFICATION_WINDOW_MILLISECONDS = 30 * 60 * 1000;
export const OS01_STAGING_FOREIGN_KEYS_UPLOAD_METHOD_IDENTITY = "sites_save_site_version_exact_local_archive";

type ForeignKeysTransport = (request: Request) => Promise<Response>;
type ObservationPhase = "pre" | "post";

export type ResponseValidationIdentity = {
  catalogHash: string;
  catalogRows: number;
  candidateRoot: string;
  normalizedForeignKeyRoot: string;
  foreignKeyConstraintCount: number;
  foreignKeyColumnRowCount: number;
};

export type ControlPlaneObservationInput = {
  phase: ObservationPhase;
  sourceCommit: string;
  sourceTree: string;
  versionId: string;
  versionNumber: number;
  deploymentId: string;
  deploymentStatus: "succeeded";
  deploymentUrl: string;
  workerSha256: string;
  manifestSha256: string;
  archiveSha256: string;
  archiveFileListRoot: string;
  archiveContentRoot: string;
  archiveFileCount: number;
  archiveBytes: number;
  uploadMethodIdentity: typeof OS01_STAGING_FOREIGN_KEYS_UPLOAD_METHOD_IDENTITY;
  remoteBuildRequested: false;
  accessRevision: number;
  ownerIdentityHash: string;
  environmentRevision: number;
  environmentKeyNames: string[];
  recordedAt: string;
};

export type PreregisteredArtifactIdentity = {
  sourceCommit: string;
  sourceTree: string;
  workerSha256: string;
  manifestSha256: string;
  archiveSha256: string;
  archiveFileListRoot: string;
  archiveContentRoot: string;
  archiveFileCount: number;
  archiveBytes: number;
  uploadMethodIdentity: typeof OS01_STAGING_FOREIGN_KEYS_UPLOAD_METHOD_IDENTITY;
  remoteBuildRequested: false;
};

export type ControlPlaneObservationWriteResult = {
  phase: ObservationPhase;
  observationHash: string;
  bytesSha256: string;
};

export type ForeignKeysControllerResult = {
  version: "engine-os.os01-staging-foreign-keys-controller-result.v2";
  status:
    | "pending_control_plane_postcheck"
    | "terminal_worker_failure"
    | "terminal_transport_uncertain"
    | "terminal_invalid_response"
    | "terminal_credential_reflection"
    | "terminal_artifact_authority_violation";
  qualificationId: string;
  qualificationEligible: boolean;
  attemptId: string;
  controllerAuthorityId: string;
  authorityBytesSha256: string;
  authorityRootIdentitySha256: string;
  authorityFileIdentitySha256: string;
  preregisteredArtifactIdentityHash: string;
  preObservationBytesSha256: string;
  requestBodySha256: string;
  responseBytesSha256: string | null;
  httpStatus: number | null;
  retryAllowed: false;
  controllerDatabaseMutationAttempted: false;
  oddsProviderPathInvoked: false;
  quotaPathInvoked: false;
  controlPlanePostcheckRequired: true;
  recordedAt: string;
  resultHash: string;
};

type ArtifactIdentity = {
  device: number;
  inode: number;
  mode: number;
  links: number;
  size: number;
};

type ControllerPaths = {
  root: string;
  authority: string;
  preObservation: string;
  intent: string;
  response: string;
  attemptResult: string;
  dispatchCompletion: string;
  terminalFence: string;
  postObservation: string;
  finalizationIntent: string;
  finalReceipt: string;
};

type ControllerCoreInput = {
  root: string;
  qualificationEligible: boolean;
  authorizationToken: string;
  transport: ForeignKeysTransport;
  now: () => Date;
  responseValidation: ResponseValidationIdentity;
};

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validHex(value: unknown, length = 64): value is string {
  return typeof value === "string" && new RegExp("^[a-f0-9]{" + length + "}$", "u").test(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort(codePointCompare);
  const wanted = [...expected].sort(codePointCompare);
  return actual.length === wanted.length && wanted.every((key, index) => key === actual[index]);
}

function artifactPaths(root: string): ControllerPaths {
  return {
    root,
    authority: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.authority),
    preObservation: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.preObservation),
    intent: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.intent),
    response: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.response),
    attemptResult: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.attemptResult),
    dispatchCompletion: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.dispatchCompletion),
    terminalFence: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.terminalFence),
    postObservation: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.postObservation),
    finalizationIntent: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.finalizationIntent),
    finalReceipt: resolve(root, OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES.finalReceipt)
  };
}

function rootIdentity(root: string): ArtifactIdentity {
  const resolved = resolve(root);
  const stat = lstatSync(resolved);
  const uid = typeof process.getuid === "function" ? process.getuid() : stat.uid;
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 ||
      stat.uid !== uid || realpathSync(resolved) !== resolved) {
    throw new Error("controller authority root is not a real owner mode-0700 directory");
  }
  return {
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode & 0o777,
    links: stat.nlink,
    size: stat.size
  };
}

function sameIdentity(left: ArtifactIdentity, right: ArtifactIdentity): boolean {
  return left.device === right.device && left.inode === right.inode && left.mode === right.mode &&
    left.links === right.links;
}

function sameSnapshotIdentity(left: ArtifactIdentity, right: ArtifactIdentity): boolean {
  return sameIdentity(left, right) && left.size === right.size;
}

function sameRootIdentity(left: ArtifactIdentity, right: ArtifactIdentity): boolean {
  return left.device === right.device && left.inode === right.inode && left.mode === right.mode;
}

function rootIdentitySha256(identity: ArtifactIdentity): string {
  return sha256(canonicalJson({
    device: identity.device,
    inode: identity.inode,
    mode: identity.mode
  }));
}

function fileIdentitySha256(identity: ArtifactIdentity): string {
  return sha256(canonicalJson({
    device: identity.device,
    inode: identity.inode,
    mode: identity.mode,
    links: identity.links,
    size: identity.size
  }));
}

function privateFileIdentity(path: string): ArtifactIdentity {
  const stat = lstatSync(path);
  const uid = typeof process.getuid === "function" ? process.getuid() : stat.uid;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 ||
      stat.uid !== uid || realpathSync(path) !== resolve(path)) {
    throw new Error("controller artifact is not a real owner mode-0600 single-link file");
  }
  return {
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode & 0o777,
    links: stat.nlink,
    size: stat.size
  };
}

function verifyIdentity(path: string, expected: ArtifactIdentity): void {
  if (!sameIdentity(privateFileIdentity(path), expected)) throw new Error("controller artifact identity changed");
}

function syncDirectory(root: string): void {
  const descriptor = openSync(root, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function reserveArtifact(path: string): { descriptor: number; identity: ArtifactIdentity } {
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
    0o600
  );
  const stat = fstatSync(descriptor);
  const identity = privateFileIdentity(path);
  if (stat.dev !== identity.device || stat.ino !== identity.inode) {
    closeSync(descriptor);
    throw new Error("controller artifact descriptor identity mismatch");
  }
  return { descriptor, identity };
}

function writeDescriptor(descriptor: number, value: Uint8Array | string): void {
  writeFileSync(descriptor, value);
  fsyncSync(descriptor);
}

function durableExclusiveJson(path: string, value: unknown): void {
  const reserved = reserveArtifact(path);
  try {
    writeDescriptor(reserved.descriptor, JSON.stringify(value, null, 2) + "\n");
  } finally {
    closeSync(reserved.descriptor);
  }
  syncDirectory(dirname(path));
  verifyIdentity(path, reserved.identity);
}

function descriptorIdentity(descriptor: number): ArtifactIdentity {
  const stat = fstatSync(descriptor);
  const uid = typeof process.getuid === "function" ? process.getuid() : stat.uid;
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.uid !== uid) {
    throw new Error("controller artifact descriptor is not an owner mode-0600 single-link file");
  }
  return {
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode & 0o777,
    links: stat.nlink,
    size: stat.size
  };
}

function readPrivateArtifact(path: string): { bytes: Uint8Array; identity: ArtifactIdentity } {
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = descriptorIdentity(descriptor);
    const pathBefore = privateFileIdentity(path);
    if (!sameSnapshotIdentity(before, pathBefore)) {
      throw new Error("controller artifact path and descriptor differ before read");
    }
    const bytes = new Uint8Array(readFileSync(descriptor));
    const after = descriptorIdentity(descriptor);
    if (!sameSnapshotIdentity(before, after) || after.size !== bytes.byteLength) {
      throw new Error("controller artifact changed during read");
    }
    const pathAfter = privateFileIdentity(path);
    if (!sameSnapshotIdentity(after, pathAfter)) {
      throw new Error("controller artifact path and descriptor differ after read");
    }
    return { bytes, identity: after };
  } finally {
    closeSync(descriptor);
  }
}

function verifyArtifactSnapshot(path: string, expected: ArtifactIdentity, expectedHash: string): void {
  const current = readPrivateArtifact(path);
  if (!sameSnapshotIdentity(current.identity, expected) || sha256(current.bytes) !== expectedHash) {
    throw new Error("controller artifact snapshot changed");
  }
}

function hashedBody<T extends Record<string, unknown>>(body: T, key: string): T & Record<string, string> {
  return { ...body, [key]: sha256(canonicalJson(body)) };
}

function timestampMilliseconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null;
  return milliseconds;
}

function validatePreregisteredArtifactIdentity(
  value: unknown
): value is PreregisteredArtifactIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const identity = value as Record<string, unknown>;
  return hasExactKeys(identity, [
    "archiveBytes", "archiveContentRoot", "archiveFileCount", "archiveFileListRoot", "archiveSha256",
    "manifestSha256", "remoteBuildRequested", "sourceCommit", "sourceTree", "uploadMethodIdentity",
    "workerSha256"
  ]) && validHex(identity.sourceCommit, 40) && validHex(identity.sourceTree, 40) &&
    validHex(identity.workerSha256) && validHex(identity.manifestSha256) &&
    validHex(identity.archiveSha256) && validHex(identity.archiveFileListRoot) &&
    validHex(identity.archiveContentRoot) && Number.isSafeInteger(identity.archiveFileCount) &&
    (identity.archiveFileCount as number) >= 1 &&
    Number.isSafeInteger(identity.archiveBytes) && (identity.archiveBytes as number) >= 1 &&
    identity.uploadMethodIdentity === OS01_STAGING_FOREIGN_KEYS_UPLOAD_METHOD_IDENTITY &&
    identity.remoteBuildRequested === false;
}

function parsePreregisteredArtifactIdentity(
  bytes: Uint8Array | string
): PreregisteredArtifactIdentity {
  const encoded = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  if (encoded.byteLength === 0 || encoded.byteLength > 16 * 1024) {
    throw new Error("preregistered artifact identity must be between 1 byte and 16 KiB");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded).toString("utf8"));
  } catch {
    throw new Error("preregistered artifact identity is not valid JSON");
  }
  if (!validatePreregisteredArtifactIdentity(parsed)) {
    throw new Error("preregistered artifact identity does not match the closed schema");
  }
  return parsed;
}

function artifactIdentityHash(identity: PreregisteredArtifactIdentity): string {
  return sha256(canonicalJson(identity));
}

function createAuthorityRecord(
  root: string,
  qualificationEligible: boolean,
  expectedArtifactIdentity: PreregisteredArtifactIdentity,
  initializedAt: string
): Record<string, unknown> {
  if (timestampMilliseconds(initializedAt) === null) throw new Error("authority timestamp is not canonical UTC");
  if (!validatePreregisteredArtifactIdentity(expectedArtifactIdentity)) {
    throw new Error("controller artifact identity preregistration is invalid");
  }
  const body = {
    version: "engine-os.os01-staging-foreign-keys-controller-authority.v2",
    status: "initialized_no_dispatch",
    qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
    controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
    qualificationEligible,
    canonicalRoot: resolve(root),
    projectId: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId,
    origin: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin,
    retryAfterAnyIntentOrOutputArtifact: false,
    maximumQualificationWindowMilliseconds: QUALIFICATION_WINDOW_MILLISECONDS,
    exclusiveHostAssumption: "single_owner_no_concurrent_writer_during_controller_window",
    expectedArtifactIdentity: { ...expectedArtifactIdentity },
    preregisteredArtifactIdentityHash: artifactIdentityHash(expectedArtifactIdentity),
    initializedAt
  };
  return hashedBody(body, "authorityHash");
}

function validateAuthority(
  value: unknown,
  root: string,
  qualificationEligible: boolean
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const authority = value as Record<string, unknown>;
  if (!hasExactKeys(authority, [
    "authorityHash", "canonicalRoot", "controllerAuthorityId", "exclusiveHostAssumption", "initializedAt",
    "expectedArtifactIdentity", "maximumQualificationWindowMilliseconds", "preregisteredArtifactIdentityHash",
    "origin", "projectId", "qualificationEligible",
    "qualificationId", "retryAfterAnyIntentOrOutputArtifact", "status", "version"
  ]) || !validHex(authority.authorityHash) ||
      !validatePreregisteredArtifactIdentity(authority.expectedArtifactIdentity) ||
      !validHex(authority.preregisteredArtifactIdentityHash)) return false;
  const body = { ...authority };
  delete body.authorityHash;
  return sha256(canonicalJson(body)) === authority.authorityHash &&
    authority.version === "engine-os.os01-staging-foreign-keys-controller-authority.v2" &&
    authority.status === "initialized_no_dispatch" && authority.qualificationId === OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID &&
    authority.controllerAuthorityId === OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID &&
    authority.qualificationEligible === qualificationEligible && authority.canonicalRoot === resolve(root) &&
    authority.projectId === OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId &&
    authority.origin === OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin &&
    authority.retryAfterAnyIntentOrOutputArtifact === false &&
    authority.maximumQualificationWindowMilliseconds === QUALIFICATION_WINDOW_MILLISECONDS &&
    authority.exclusiveHostAssumption === "single_owner_no_concurrent_writer_during_controller_window" &&
    authority.preregisteredArtifactIdentityHash ===
      artifactIdentityHash(authority.expectedArtifactIdentity as PreregisteredArtifactIdentity) &&
    timestampMilliseconds(authority.initializedAt) !== null;
}

function initializeAuthorityArtifact(
  root: string,
  qualificationEligible: boolean,
  expectedArtifactIdentity: PreregisteredArtifactIdentity,
  now: () => Date
): void {
  const paths = artifactPaths(root);
  const recordedAt = now().toISOString();
  durableExclusiveJson(
    paths.authority,
    createAuthorityRecord(root, qualificationEligible, expectedArtifactIdentity, recordedAt)
  );
}

function parseControlPlaneObservationInput(
  bytes: Uint8Array | string,
  requiredPhase: ObservationPhase
): ControlPlaneObservationInput {
  const encoded = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  if (encoded.byteLength === 0 || encoded.byteLength > 64 * 1024) {
    throw new Error("control-plane observation input must be between 1 byte and 64 KiB");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded).toString("utf8"));
  } catch {
    throw new Error("control-plane observation input is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("control-plane observation input must be one object");
  }
  const value = parsed as Record<string, unknown>;
  if (!hasExactKeys(value, [
    "accessRevision", "archiveBytes", "archiveContentRoot", "archiveFileCount", "archiveFileListRoot", "archiveSha256",
    "deploymentId", "deploymentStatus", "deploymentUrl", "environmentKeyNames", "environmentRevision",
    "manifestSha256", "ownerIdentityHash", "phase", "recordedAt", "remoteBuildRequested", "sourceCommit",
    "sourceTree", "uploadMethodIdentity", "versionId", "versionNumber", "workerSha256"
  ]) || value.phase !== requiredPhase || typeof value.sourceCommit !== "string" ||
      typeof value.sourceTree !== "string" || typeof value.versionId !== "string" ||
      !Number.isSafeInteger(value.versionNumber) || typeof value.deploymentId !== "string" ||
      value.deploymentStatus !== "succeeded" || typeof value.deploymentUrl !== "string" ||
      typeof value.workerSha256 !== "string" || typeof value.manifestSha256 !== "string" ||
      typeof value.archiveSha256 !== "string" || typeof value.archiveFileListRoot !== "string" ||
      typeof value.archiveContentRoot !== "string" || !Number.isSafeInteger(value.archiveFileCount) ||
      !Number.isSafeInteger(value.archiveBytes) || value.remoteBuildRequested !== false ||
      value.uploadMethodIdentity !== OS01_STAGING_FOREIGN_KEYS_UPLOAD_METHOD_IDENTITY ||
      !Number.isSafeInteger(value.accessRevision) ||
      typeof value.ownerIdentityHash !== "string" || !Number.isSafeInteger(value.environmentRevision) ||
      !Array.isArray(value.environmentKeyNames) ||
      value.environmentKeyNames.some((key) => typeof key !== "string") ||
      typeof value.recordedAt !== "string") {
    throw new Error("control-plane observation input does not match the closed schema");
  }
  return value as ControlPlaneObservationInput;
}

export function createOs01StagingForeignKeysControlPlaneObservation(
  input: ControlPlaneObservationInput
): Record<string, unknown> {
  if (input.environmentKeyNames.length !== 0) {
    throw new Error("isolated staging foreign-key environment key list must be empty");
  }
  const body = {
    version: "engine-os.os01-staging-foreign-keys-control-plane-observation.v1",
    phase: input.phase,
    qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
    controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
    projectId: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId,
    origin: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin,
    source: {
      commit: input.sourceCommit,
      tree: input.sourceTree
    },
    deployment: {
      versionId: input.versionId,
      versionNumber: input.versionNumber,
      deploymentId: input.deploymentId,
      status: input.deploymentStatus,
      url: input.deploymentUrl
    },
    package: {
      workerSha256: input.workerSha256,
      manifestSha256: input.manifestSha256,
      archiveSha256: input.archiveSha256,
      archiveFileListRoot: input.archiveFileListRoot,
      archiveContentRoot: input.archiveContentRoot,
      archiveFileCount: input.archiveFileCount,
      archiveBytes: input.archiveBytes,
      uploadMethodIdentity: input.uploadMethodIdentity,
      remoteBuildRequested: input.remoteBuildRequested,
      foreignKeyRoute: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route,
      mutationRoutes: 0
    },
    access: {
      mode: "custom",
      revision: input.accessRevision,
      currentUserRole: "owner",
      ownerCount: 1,
      editorCount: 0,
      viewerCount: 0,
      groupCount: 0,
      externalVisitorCount: 0,
      ownerIdentityHash: input.ownerIdentityHash
    },
    environment: {
      revision: input.environmentRevision,
      keyNames: [...input.environmentKeyNames].sort(codePointCompare),
      captureEnabledKeyPresent: false
    },
    bindings: {
      d1: "DB",
      r2: null,
      providerBindings: 0,
      scheduledTriggers: 0
    },
    exclusiveHostAssumption: "single_owner_no_concurrent_writer_during_controller_window",
    recordedAt: input.recordedAt
  };
  return hashedBody(body, "observationHash");
}

function validateObservation(value: unknown, phase: ObservationPhase): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const observation = value as Record<string, unknown>;
  if (!hasExactKeys(observation, [
    "access", "bindings", "controllerAuthorityId", "deployment", "environment", "exclusiveHostAssumption",
    "observationHash", "origin", "package", "phase", "projectId", "qualificationId", "recordedAt", "source",
    "version"
  ]) || !validHex(observation.observationHash)) return false;
  const body = { ...observation };
  delete body.observationHash;
  if (sha256(canonicalJson(body)) !== observation.observationHash ||
      observation.version !== "engine-os.os01-staging-foreign-keys-control-plane-observation.v1" ||
      observation.phase !== phase || observation.qualificationId !== OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID ||
      observation.controllerAuthorityId !== OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID ||
      observation.projectId !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId ||
      observation.origin !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin ||
      observation.exclusiveHostAssumption !== "single_owner_no_concurrent_writer_during_controller_window" ||
      timestampMilliseconds(observation.recordedAt) === null) {
    return false;
  }
  const source = observation.source;
  const deployment = observation.deployment;
  const pkg = observation.package;
  const access = observation.access;
  const environment = observation.environment;
  const bindings = observation.bindings;
  if (!source || typeof source !== "object" || Array.isArray(source) ||
      !deployment || typeof deployment !== "object" || Array.isArray(deployment) ||
      !pkg || typeof pkg !== "object" || Array.isArray(pkg) ||
      !access || typeof access !== "object" || Array.isArray(access) ||
      !environment || typeof environment !== "object" || Array.isArray(environment) ||
      !bindings || typeof bindings !== "object" || Array.isArray(bindings)) return false;
  const sourceRow = source as Record<string, unknown>;
  const deploymentRow = deployment as Record<string, unknown>;
  const packageRow = pkg as Record<string, unknown>;
  const accessRow = access as Record<string, unknown>;
  const environmentRow = environment as Record<string, unknown>;
  const bindingRow = bindings as Record<string, unknown>;
  if (!hasExactKeys(sourceRow, ["commit", "tree"]) ||
      !validHex(sourceRow.commit, 40) || !validHex(sourceRow.tree, 40) ||
      !hasExactKeys(deploymentRow, ["deploymentId", "status", "url", "versionId", "versionNumber"]) ||
      typeof deploymentRow.deploymentId !== "string" ||
      !/^appgdep_[a-f0-9]{32}$/u.test(deploymentRow.deploymentId) ||
      deploymentRow.status !== "succeeded" ||
      deploymentRow.url !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin ||
      typeof deploymentRow.versionId !== "string" ||
      !new RegExp("^" + OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId + "~appgver_[a-f0-9]{32}$", "u")
        .test(deploymentRow.versionId) ||
      !Number.isSafeInteger(deploymentRow.versionNumber) ||
      (deploymentRow.versionNumber as number) < 1 ||
      !hasExactKeys(packageRow, [
        "archiveBytes", "archiveContentRoot", "archiveFileCount", "archiveFileListRoot", "archiveSha256",
        "foreignKeyRoute", "manifestSha256", "mutationRoutes", "remoteBuildRequested", "uploadMethodIdentity",
        "workerSha256"
      ]) ||
      !validHex(packageRow.archiveSha256) || !validHex(packageRow.manifestSha256) ||
      !validHex(packageRow.workerSha256) || !validHex(packageRow.archiveFileListRoot) ||
      !validHex(packageRow.archiveContentRoot) || !Number.isSafeInteger(packageRow.archiveFileCount) ||
      (packageRow.archiveFileCount as number) < 1 ||
      !Number.isSafeInteger(packageRow.archiveBytes) || (packageRow.archiveBytes as number) < 1 ||
      packageRow.uploadMethodIdentity !== OS01_STAGING_FOREIGN_KEYS_UPLOAD_METHOD_IDENTITY ||
      packageRow.remoteBuildRequested !== false ||
      packageRow.foreignKeyRoute !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route ||
      packageRow.mutationRoutes !== 0 ||
      !hasExactKeys(accessRow, [
        "currentUserRole", "editorCount", "externalVisitorCount", "groupCount", "mode", "ownerCount",
        "ownerIdentityHash", "revision", "viewerCount"
      ]) || accessRow.mode !== "custom" || accessRow.currentUserRole !== "owner" ||
      accessRow.ownerCount !== 1 || accessRow.editorCount !== 0 || accessRow.viewerCount !== 0 ||
      accessRow.groupCount !== 0 || accessRow.externalVisitorCount !== 0 ||
      !validHex(accessRow.ownerIdentityHash) || !Number.isSafeInteger(accessRow.revision) ||
      (accessRow.revision as number) < 0 ||
      !hasExactKeys(environmentRow, ["captureEnabledKeyPresent", "keyNames", "revision"]) ||
      environmentRow.captureEnabledKeyPresent !== false || !Array.isArray(environmentRow.keyNames) ||
      environmentRow.keyNames.length !== 0 ||
      (environmentRow.keyNames as unknown[]).some((key) => typeof key !== "string") ||
      new Set(environmentRow.keyNames as unknown[]).size !== (environmentRow.keyNames as unknown[]).length ||
      [...environmentRow.keyNames as string[]].sort(codePointCompare)
        .some((key, index) => key !== (environmentRow.keyNames as string[])[index]) ||
      !Number.isSafeInteger(environmentRow.revision) || (environmentRow.revision as number) < 0 ||
      !hasExactKeys(bindingRow, ["d1", "providerBindings", "r2", "scheduledTriggers"]) ||
      bindingRow.d1 !== "DB" || bindingRow.r2 !== null || bindingRow.providerBindings !== 0 ||
      bindingRow.scheduledTriggers !== 0) {
    return false;
  }
  return true;
}

function observationMatchesPreregisteredArtifactIdentity(
  observation: Record<string, unknown>,
  expected: PreregisteredArtifactIdentity
): boolean {
  const source = observation.source;
  const pkg = observation.package;
  if (!source || typeof source !== "object" || Array.isArray(source) ||
      !pkg || typeof pkg !== "object" || Array.isArray(pkg)) return false;
  const sourceRow = source as Record<string, unknown>;
  const packageRow = pkg as Record<string, unknown>;
  return sourceRow.commit === expected.sourceCommit && sourceRow.tree === expected.sourceTree &&
    packageRow.workerSha256 === expected.workerSha256 &&
    packageRow.manifestSha256 === expected.manifestSha256 &&
    packageRow.archiveSha256 === expected.archiveSha256 &&
    packageRow.archiveFileListRoot === expected.archiveFileListRoot &&
    packageRow.archiveContentRoot === expected.archiveContentRoot &&
    packageRow.archiveFileCount === expected.archiveFileCount &&
    packageRow.archiveBytes === expected.archiveBytes &&
    packageRow.uploadMethodIdentity === expected.uploadMethodIdentity &&
    packageRow.remoteBuildRequested === expected.remoteBuildRequested;
}

function observationIdentity(value: Record<string, unknown>): string {
  const copy = { ...value };
  delete copy.phase;
  delete copy.recordedAt;
  delete copy.observationHash;
  return canonicalJson(copy);
}

function writeControlPlaneObservationCore(
  root: string,
  qualificationEligible: boolean,
  input: ControlPlaneObservationInput
): ControlPlaneObservationWriteResult {
  const rootBefore = rootIdentity(root);
  const paths = artifactPaths(root);
  const authorityArtifact = readPrivateArtifact(paths.authority);
  const authority = JSON.parse(Buffer.from(authorityArtifact.bytes).toString("utf8")) as unknown;
  if (!validateAuthority(authority, root, qualificationEligible)) {
    throw new Error("control-plane observation authority is invalid");
  }
  const forbidden = input.phase === "pre"
    ? [paths.preObservation, paths.intent, paths.response, paths.attemptResult, paths.dispatchCompletion,
        paths.terminalFence, paths.postObservation, paths.finalizationIntent, paths.finalReceipt]
    : [paths.postObservation, paths.finalizationIntent, paths.finalReceipt, paths.terminalFence];
  if (forbidden.some((path) => existsSync(path))) {
    throw new Error("control-plane observation phase is already terminal or out of order");
  }
  if (input.phase === "post") {
    for (const required of [paths.preObservation, paths.intent, paths.response, paths.attemptResult,
      paths.dispatchCompletion]) {
      if (!existsSync(required)) throw new Error("post observation requires a completed dispatch");
    }
  }
  const observation = createOs01StagingForeignKeysControlPlaneObservation(input);
  if (!validateObservation(observation, input.phase)) {
    throw new Error("control-plane observation input failed semantic validation");
  }
  const expectedArtifactIdentity = authority.expectedArtifactIdentity as PreregisteredArtifactIdentity;
  if (!observationMatchesPreregisteredArtifactIdentity(observation, expectedArtifactIdentity)) {
    throw new Error("control-plane observation does not match the preregistered artifact identity");
  }
  if (input.phase === "post") {
    const preArtifact = readPrivateArtifact(paths.preObservation);
    const pre = JSON.parse(Buffer.from(preArtifact.bytes).toString("utf8")) as unknown;
    if (!validateObservation(pre, "pre") || observationIdentity(pre) !== observationIdentity(observation)) {
      throw new Error("post observation does not match the pre-dispatch control plane");
    }
  }
  const destination = input.phase === "pre" ? paths.preObservation : paths.postObservation;
  durableExclusiveJson(destination, observation);
  if (!sameRootIdentity(rootBefore, rootIdentity(root))) throw new Error("controller root identity changed");
  verifyArtifactSnapshot(
    paths.authority,
    authorityArtifact.identity,
    sha256(authorityArtifact.bytes)
  );
  const persisted = readPrivateArtifact(destination);
  return {
    phase: input.phase,
    observationHash: String(observation.observationHash),
    bytesSha256: sha256(persisted.bytes)
  };
}

function validateResponse(bytes: Uint8Array, expected: ResponseValidationIdentity): boolean {
  let parsed: unknown;
  const text = new TextDecoder().decode(bytes);
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const receipt = parsed as Record<string, unknown>;
  if (text !== JSON.stringify(receipt)) return false;
  if (!hasExactKeys(receipt, [
    "batchCatalogPairMatch", "candidateCount", "candidateEvidence", "candidateEvidenceRoot",
    "candidateIdentities", "candidateRoot", "captureActivations",
    "catalogHash", "catalogRows", "claimBoundary", "d1StatementCount", "databaseMutationAttempted",
    "firstCatalogHash", "foreignKeyClaimsAccepted", "foreignKeyColumnRowCount", "foreignKeyConstraintCount",
    "normalizedForeignKeyRoot", "normalizedForeignKeys", "predecessor", "productionMutations",
    "productionReads", "providerBindings", "providerDispatches", "providerSecretReads", "qualificationId",
    "quotaReservations", "receiptHash", "requestBudgetClaim", "rowCountClaimsAccepted", "rowCountEvidence",
    "rowCountEvidenceWithheld", "secondCatalogHash", "snapshotClaim", "statementArrayRoot", "statementPlanRoot",
    "status", "version"
  ])) return false;
  const claimedHash = receipt.receiptHash;
  if (!validHex(claimedHash)) return false;
  const body = { ...receipt };
  delete body.receiptHash;
  if (sha256(canonicalJson(body)) !== claimedHash ||
      receipt.version !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.responseVersion ||
      receipt.status !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.responseStatus ||
      receipt.qualificationId !== OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID ||
      receipt.catalogRows !== expected.catalogRows || receipt.catalogHash !== expected.catalogHash ||
      receipt.firstCatalogHash !== expected.catalogHash || receipt.secondCatalogHash !== expected.catalogHash ||
      receipt.batchCatalogPairMatch !== true ||
      receipt.candidateCount !== OS01_STAGING_FOREIGN_KEY_CANDIDATES.length ||
      receipt.candidateRoot !== expected.candidateRoot ||
      !validHex(receipt.candidateEvidenceRoot) ||
      receipt.d1StatementCount !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.maximumD1StatementsPerInvocation ||
      receipt.statementArrayRoot !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementArrayRoot ||
      receipt.statementPlanRoot !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementPlanRoot ||
      receipt.foreignKeyConstraintCount !== expected.foreignKeyConstraintCount ||
      receipt.foreignKeyColumnRowCount !== expected.foreignKeyColumnRowCount ||
      receipt.normalizedForeignKeyRoot !== expected.normalizedForeignKeyRoot ||
      receipt.foreignKeyClaimsAccepted !== true ||
      receipt.snapshotClaim !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.consistencyClaim ||
      receipt.rowCountEvidence !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.rowCountEvidence ||
      receipt.rowCountEvidenceWithheld !== true ||
      receipt.rowCountClaimsAccepted !== OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.rowCountClaimsAccepted ||
      receipt.requestBudgetClaim !== "controller_enforced_single_invocation_not_runtime_durable" ||
      receipt.databaseMutationAttempted !== false || receipt.providerBindings !== 0 ||
      receipt.providerSecretReads !== 0 || receipt.providerDispatches !== 0 ||
      receipt.quotaReservations !== 0 || receipt.captureActivations !== 0 ||
      receipt.productionReads !== 0 || receipt.productionMutations !== 0 ||
      receipt.claimBoundary !==
        "isolated_staging_read_only_foreign_key_evidence_only_no_row_count_or_os01_acceptance") return false;
  if (canonicalJson(receipt.predecessor) !==
      canonicalJson(OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.predecessor) ||
      !Array.isArray(receipt.candidateIdentities) ||
      canonicalJson(receipt.candidateIdentities) !== canonicalJson(OS01_STAGING_FOREIGN_KEY_CANDIDATES) ||
      sha256(canonicalJson(receipt.candidateIdentities)) !== expected.candidateRoot ||
      !Array.isArray(receipt.candidateEvidence) ||
      receipt.candidateEvidence.length !== OS01_STAGING_FOREIGN_KEY_CANDIDATES.length ||
      sha256(canonicalJson(receipt.candidateEvidence)) !== receipt.candidateEvidenceRoot ||
      !Array.isArray(receipt.normalizedForeignKeys)) return false;

  const recomputedFromRaw: Record<string, unknown>[] = [];
  let recomputedRawRowCount = 0;
  for (let candidateIndex = 0; candidateIndex < OS01_STAGING_FOREIGN_KEY_CANDIDATES.length;
    candidateIndex += 1) {
    const expectedCandidate = OS01_STAGING_FOREIGN_KEY_CANDIDATES[candidateIndex]!;
    const value = receipt.candidateEvidence[candidateIndex];
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const evidence = value as Record<string, unknown>;
    if (!hasExactKeys(evidence, [
      "normalizedConstraintCount", "normalizedConstraintRoot", "normalizedConstraints", "rawRowCount",
      "rawRows", "rawRowsHash", "sourceCreateSqlHash", "sourceTable"
    ]) || evidence.sourceTable !== expectedCandidate.sourceTable ||
        evidence.sourceCreateSqlHash !== expectedCandidate.sourceCreateSqlHash ||
        !Number.isSafeInteger(evidence.rawRowCount) || (evidence.rawRowCount as number) <= 0 ||
        !validHex(evidence.rawRowsHash) || !Array.isArray(evidence.rawRows) ||
        evidence.rawRows.length !== evidence.rawRowCount ||
        sha256(canonicalJson(evidence.rawRows)) !== evidence.rawRowsHash ||
        !Number.isSafeInteger(evidence.normalizedConstraintCount) ||
        (evidence.normalizedConstraintCount as number) <= 0 ||
        !validHex(evidence.normalizedConstraintRoot) || !Array.isArray(evidence.normalizedConstraints)) {
      return false;
    }
    const groups = new Map<number, Array<Record<string, unknown>>>();
    let previousId = -1;
    let previousSeq = -1;
    for (const rawValue of evidence.rawRows) {
      if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) return false;
      const row = rawValue as Record<string, unknown>;
      if (!hasExactKeys(row, ["from", "id", "match", "on_delete", "on_update", "seq", "table", "to"]) ||
          !Number.isSafeInteger(row.id) || (row.id as number) < 0 || !Number.isSafeInteger(row.seq) ||
          (row.seq as number) < 0 || typeof row.table !== "string" || row.table.length === 0 ||
          typeof row.from !== "string" || row.from.length === 0 ||
          (typeof row.to !== "string" && row.to !== null) || row.match !== "NONE" ||
          typeof row.on_update !== "string" || typeof row.on_delete !== "string" ||
          !["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"].includes(row.on_update) ||
          !["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"].includes(row.on_delete)) {
        return false;
      }
      const id = row.id as number;
      const seq = row.seq as number;
      if (id < previousId || (id === previousId && seq <= previousSeq)) return false;
      previousId = id;
      previousSeq = seq;
      groups.set(id, [...(groups.get(id) ?? []), row]);
    }
    const ids = [...groups.keys()].sort((left, right) => left - right);
    const localConstraints = ids.map((id) => {
      const rows = groups.get(id)!;
      const first = rows[0]!;
      if (rows.some((row, index) => row.seq !== index) || rows.some((row) =>
        row.table !== first.table || row.on_update !== first.on_update ||
        row.on_delete !== first.on_delete || row.match !== first.match)) return null;
      return {
        sourceTable: expectedCandidate.sourceTable,
        targetTable: first.table,
        columns: rows.map((row) => ({ ordinal: row.seq, fromColumn: row.from, toColumn: row.to })),
        onUpdate: first.on_update,
        onDelete: first.on_delete,
        match: first.match
      };
    });
    if (localConstraints.some((constraint) => constraint === null)) return false;
    const normalizedLocal = (localConstraints as Record<string, unknown>[]).sort((left, right) =>
      codePointCompare(canonicalJson(left), canonicalJson(right)));
    if (evidence.normalizedConstraintCount !== normalizedLocal.length ||
        canonicalJson(evidence.normalizedConstraints) !== canonicalJson(normalizedLocal) ||
        sha256(canonicalJson(normalizedLocal)) !== evidence.normalizedConstraintRoot) return false;
    recomputedRawRowCount += evidence.rawRows.length;
    recomputedFromRaw.push(...normalizedLocal);
  }
  recomputedFromRaw.sort((left, right) => codePointCompare(canonicalJson(left), canonicalJson(right)));
  if (recomputedRawRowCount !== expected.foreignKeyColumnRowCount ||
      canonicalJson(receipt.normalizedForeignKeys) !== canonicalJson(recomputedFromRaw)) return false;

  const sourceTables = new Set(OS01_STAGING_FOREIGN_KEY_CANDIDATES.map((item) => item.sourceTable));
  const normalized: Record<string, unknown>[] = [];
  let columnRows = 0;
  for (const value of receipt.normalizedForeignKeys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const constraint = value as Record<string, unknown>;
    if (!hasExactKeys(constraint, ["columns", "match", "onDelete", "onUpdate", "sourceTable", "targetTable"]) ||
        typeof constraint.sourceTable !== "string" || !sourceTables.has(constraint.sourceTable) ||
        typeof constraint.targetTable !== "string" || !/^[A-Za-z0-9_]+$/u.test(constraint.targetTable) ||
        typeof constraint.onUpdate !== "string" || typeof constraint.onDelete !== "string" ||
        !["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"].includes(constraint.onUpdate) ||
        !["NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT", "CASCADE"].includes(constraint.onDelete) ||
        constraint.match !== "NONE" || !Array.isArray(constraint.columns) || constraint.columns.length === 0) {
      return false;
    }
    const columns: Record<string, unknown>[] = [];
    for (const value of constraint.columns) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const column = value as Record<string, unknown>;
      if (!hasExactKeys(column, ["fromColumn", "ordinal", "toColumn"]) ||
          !Number.isSafeInteger(column.ordinal) || column.ordinal !== columns.length ||
          typeof column.fromColumn !== "string" || column.fromColumn.length === 0 ||
          (typeof column.toColumn !== "string" && column.toColumn !== null)) return false;
      columns.push({ ordinal: column.ordinal, fromColumn: column.fromColumn, toColumn: column.toColumn });
    }
    columnRows += columns.length;
    normalized.push({
      sourceTable: constraint.sourceTable,
      targetTable: constraint.targetTable,
      columns,
      onUpdate: constraint.onUpdate,
      onDelete: constraint.onDelete,
      match: constraint.match
    });
  }
  const sorted = [...normalized].sort((left, right) =>
    codePointCompare(canonicalJson(left), canonicalJson(right)));
  return normalized.length === expected.foreignKeyConstraintCount &&
    columnRows === expected.foreignKeyColumnRowCount &&
    sorted.every((value, index) => canonicalJson(value) === canonicalJson(normalized[index])) &&
    OS01_STAGING_FOREIGN_KEY_CANDIDATES.every((candidate) =>
      normalized.some((constraint) => constraint.sourceTable === candidate.sourceTable)) &&
    sha256(canonicalJson(normalized)) === expected.normalizedForeignKeyRoot;
}

function validateWorkerFailureResponse(bytes: Uint8Array): boolean {
  let parsed: unknown;
  const text = new TextDecoder().decode(bytes);
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const receipt = parsed as Record<string, unknown>;
  if (!hasExactKeys(receipt, [
    "claimBoundary", "databaseMutationAttempted", "failureCategory", "qualificationId", "receiptHash",
    "status", "version"
  ]) || text !== JSON.stringify(receipt) || !validHex(receipt.receiptHash)) return false;
  const body = { ...receipt };
  delete body.receiptHash;
  return sha256(canonicalJson(body)) === receipt.receiptHash &&
    receipt.version === "engine-os.os01-staging-foreign-keys-failure.v1" &&
    receipt.status === "read_only_foreign_key_capture_failed" &&
    receipt.qualificationId === OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID &&
    typeof receipt.failureCategory === "string" &&
    OS01_STAGING_FOREIGN_KEYS_FAILURE_CATEGORIES.includes(receipt.failureCategory as never) &&
    receipt.databaseMutationAttempted === false &&
    receipt.claimBoundary === "terminal_read_only_diagnostic_not_foreign_key_receipt";
}

function credentialReflectionVariants(token: string): Set<string> {
  const variants = [
    token,
    "Bearer " + token,
    Buffer.from(token, "utf8").toString("base64"),
    encodeURIComponent(token)
  ];
  return new Set([...variants, ...variants.map((value) => value.toLowerCase())]);
}

function containsCredentialReflection(value: string, variants: Set<string>): boolean {
  return [...variants].some((variant) => variant.length > 0 && value.includes(variant));
}

function credentialHeaderReflectionScan(headers: Headers, token: string): {
  complete: boolean;
  reflected: boolean;
} {
  const variants = credentialReflectionVariants(token);
  let count = 0;
  let bytes = 0;
  for (const [name, value] of headers) {
    count += 1;
    bytes += Buffer.byteLength(name, "utf8") + Buffer.byteLength(value, "utf8");
    if (count > 1_000 || bytes > 256 * 1024) return { complete: false, reflected: false };
    if (containsCredentialReflection(name, variants) || containsCredentialReflection(value, variants)) {
      return { complete: true, reflected: true };
    }
  }
  return { complete: true, reflected: false };
}

function credentialReflectionScan(bytes: Uint8Array, token: string): {
  complete: boolean;
  reflected: boolean;
} {
  const text = new TextDecoder().decode(bytes);
  const variants = credentialReflectionVariants(token);
  if (containsCredentialReflection(text, variants)) return { complete: true, reflected: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { complete: true, reflected: false };
  }
  const pending: Array<{ depth: number; value: unknown }> = [{ depth: 0, value: parsed }];
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    visited += 1;
    if (visited > 100_000 || current.depth > 128) return { complete: false, reflected: false };
    if (typeof current.value === "string") {
      if (containsCredentialReflection(current.value, variants)) return { complete: true, reflected: true };
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      for (const item of current.value) pending.push({ depth: current.depth + 1, value: item });
      continue;
    }
    for (const [key, value] of Object.entries(current.value as Record<string, unknown>)) {
      if (containsCredentialReflection(key, variants)) return { complete: true, reflected: true };
      pending.push({ depth: current.depth + 1, value: key });
      pending.push({ depth: current.depth + 1, value });
    }
  }
  return { complete: true, reflected: false };
}

async function readBoundedResponse(response: Response): Promise<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > RESPONSE_LIMIT_BYTES)) {
    throw new Error("response exceeds controller limit");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > RESPONSE_LIMIT_BYTES) {
      await reader.cancel();
      throw new Error("response exceeds controller limit");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function resultWithHash(
  body: Omit<ForeignKeysControllerResult, "resultHash">
): ForeignKeysControllerResult {
  return { ...body, resultHash: sha256(canonicalJson(body)) };
}

function createDispatchCompletion(input: {
  qualificationEligible: boolean;
  attemptId: string;
  preregisteredArtifactIdentityHash: string;
  intentBytesSha256: string;
  responseBytesSha256: string;
  resultBytesSha256: string;
  recordedAt: string;
}): Record<string, unknown> {
  const body = {
    version: "engine-os.os01-staging-foreign-keys-dispatch-completion.v1",
    status: "sealed_after_authority_verification",
    qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
    controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
    qualificationEligible: input.qualificationEligible,
    attemptId: input.attemptId,
    preregisteredArtifactIdentityHash: input.preregisteredArtifactIdentityHash,
    intentBytesSha256: input.intentBytesSha256,
    responseBytesSha256: input.responseBytesSha256,
    resultBytesSha256: input.resultBytesSha256,
    retryAllowed: false,
    recordedAt: input.recordedAt
  };
  return hashedBody(body, "completionHash");
}

function validateDispatchCompletion(
  bytes: Uint8Array,
  qualificationEligible: boolean
): Record<string, unknown> | null {
  const completion = parseHashedRecord(bytes, "completionHash");
  if (!completion || !hasExactKeys(completion, [
    "attemptId", "completionHash", "controllerAuthorityId", "intentBytesSha256", "qualificationEligible", "qualificationId",
    "preregisteredArtifactIdentityHash", "recordedAt", "responseBytesSha256", "resultBytesSha256", "retryAllowed",
    "status", "version"
  ])) return null;
  return completion.version === "engine-os.os01-staging-foreign-keys-dispatch-completion.v1" &&
    completion.status === "sealed_after_authority_verification" &&
    completion.qualificationId === OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID &&
    completion.controllerAuthorityId === OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID &&
    completion.qualificationEligible === qualificationEligible && typeof completion.attemptId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(completion.attemptId) &&
    validHex(completion.preregisteredArtifactIdentityHash) && validHex(completion.intentBytesSha256) &&
    validHex(completion.responseBytesSha256) &&
    validHex(completion.resultBytesSha256) && completion.retryAllowed === false &&
    timestampMilliseconds(completion.recordedAt) !== null ? completion : null;
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(label + " is not JSON");
  }
}

function verifyReservedArtifact(
  path: string,
  reserved: { descriptor: number; identity: ArtifactIdentity },
  expectedHash: string,
  expectedSize: number
): void {
  const descriptor = descriptorIdentity(reserved.descriptor);
  if (!sameIdentity(descriptor, reserved.identity) || descriptor.size !== expectedSize) {
    throw new Error("reserved controller artifact descriptor changed");
  }
  const artifact = readPrivateArtifact(path);
  if (!sameIdentity(artifact.identity, reserved.identity) || artifact.identity.size !== expectedSize ||
      sha256(artifact.bytes) !== expectedHash) {
    throw new Error("reserved controller artifact path changed");
  }
}

function verifyRunAuthority(input: {
  paths: ControllerPaths;
  rootBefore: ArtifactIdentity;
  authority: { bytes: Uint8Array; identity: ArtifactIdentity };
  pre: { bytes: Uint8Array; identity: ArtifactIdentity };
  intentReserved: { descriptor: number; identity: ArtifactIdentity };
  intentBytes: Uint8Array;
  responseReserved: { descriptor: number; identity: ArtifactIdentity };
  responseHash: string;
  responseSize: number;
  resultReserved: { descriptor: number; identity: ArtifactIdentity };
  resultHash: string;
  resultSize: number;
  completionReserved: { descriptor: number; identity: ArtifactIdentity };
  completionHash: string;
  completionSize: number;
}): void {
  if (!sameRootIdentity(input.rootBefore, rootIdentity(input.paths.root))) {
    throw new Error("controller root identity changed");
  }
  verifyArtifactSnapshot(input.paths.authority, input.authority.identity, sha256(input.authority.bytes));
  verifyArtifactSnapshot(input.paths.preObservation, input.pre.identity, sha256(input.pre.bytes));
  verifyReservedArtifact(
    input.paths.intent, input.intentReserved, sha256(input.intentBytes), input.intentBytes.byteLength
  );
  verifyReservedArtifact(
    input.paths.response, input.responseReserved, input.responseHash, input.responseSize
  );
  verifyReservedArtifact(input.paths.attemptResult, input.resultReserved, input.resultHash, input.resultSize);
  verifyReservedArtifact(
    input.paths.dispatchCompletion, input.completionReserved, input.completionHash, input.completionSize
  );
  if (existsSync(input.paths.terminalFence) || existsSync(input.paths.postObservation) ||
      existsSync(input.paths.finalizationIntent) || existsSync(input.paths.finalReceipt)) {
    throw new Error("terminal, postcheck, or finalization artifact appeared during dispatch");
  }
}

async function runControllerCore(input: ControllerCoreInput): Promise<ForeignKeysControllerResult> {
  const paths = artifactPaths(input.root);
  const rootBefore = rootIdentity(paths.root);
  const authorityArtifact = readPrivateArtifact(paths.authority);
  const authority = parseJson(authorityArtifact.bytes, "controller authority");
  if (!validateAuthority(authority, paths.root, input.qualificationEligible)) {
    throw new Error("controller authority is invalid");
  }
  const preArtifact = readPrivateArtifact(paths.preObservation);
  const pre = parseJson(preArtifact.bytes, "control-plane pre-observation");
  if (!validateObservation(pre, "pre") || !observationMatchesPreregisteredArtifactIdentity(
    pre,
    authority.expectedArtifactIdentity as PreregisteredArtifactIdentity
  )) {
    throw new Error("control-plane pre-observation is invalid or not preregistered");
  }
  if ([
    paths.intent, paths.response, paths.attemptResult, paths.dispatchCompletion, paths.terminalFence,
    paths.postObservation, paths.finalizationIntent, paths.finalReceipt
  ]
    .some((path) => existsSync(path))) {
    throw new Error("canonical controller authority has already been consumed or postchecked");
  }
  if (!input.authorizationToken || input.authorizationToken.trim() !== input.authorizationToken ||
      /[\u0000-\u0020\u007f]/u.test(input.authorizationToken)) {
    throw new Error("one ephemeral Sites authorization token is required");
  }
  const attemptId = randomUUID();
  const intentRecordedAt = input.now().toISOString();
  const authorityMilliseconds = timestampMilliseconds(authority.initializedAt);
  const preMilliseconds = timestampMilliseconds(pre.recordedAt);
  const intentMilliseconds = timestampMilliseconds(intentRecordedAt);
  if (authorityMilliseconds === null || preMilliseconds === null || intentMilliseconds === null ||
      authorityMilliseconds > preMilliseconds || preMilliseconds > intentMilliseconds ||
      intentMilliseconds - authorityMilliseconds > QUALIFICATION_WINDOW_MILLISECONDS) {
    throw new Error("controller authority, pre-observation, and intent timestamps are not ordered in-window");
  }
  const intentBody = {
    version: "engine-os.os01-staging-foreign-keys-controller-intent.v2",
    status: "reserved_before_transport_no_retry",
    qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
    qualificationEligible: input.qualificationEligible,
    attemptId,
    controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
    authorityBytesSha256: sha256(authorityArtifact.bytes),
    authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
    authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
    preregisteredArtifactIdentityHash: String(authority.preregisteredArtifactIdentityHash),
    projectId: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId,
    origin: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin,
    method: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.method,
    route: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route,
    contentType: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.contentType,
    requestBodySha256: OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256,
    preObservationBytesSha256: sha256(preArtifact.bytes),
    credentialKind: "ephemeral_sites_siwc_not_persisted",
    retryAllowedAfterReservation: false,
    controlPlanePostcheckRequired: true,
    exclusiveHostAssumption: "single_owner_no_concurrent_writer_during_controller_window",
    recordedAt: intentRecordedAt
  };
  const intent = hashedBody(intentBody, "intentHash");
  const intentBytes = new TextEncoder().encode(JSON.stringify(intent, null, 2) + "\n");
  let intentReserved: ReturnType<typeof reserveArtifact> | null = null;
  let responseReserved: ReturnType<typeof reserveArtifact> | null = null;
  let resultReserved: ReturnType<typeof reserveArtifact> | null = null;
  let completionReserved: ReturnType<typeof reserveArtifact> | null = null;
  try {
    intentReserved = reserveArtifact(paths.intent);
    writeDescriptor(intentReserved.descriptor, intentBytes);
    syncDirectory(paths.root);
    verifyArtifactSnapshot(paths.authority, authorityArtifact.identity, sha256(authorityArtifact.bytes));
    verifyArtifactSnapshot(paths.preObservation, preArtifact.identity, sha256(preArtifact.bytes));
    verifyReservedArtifact(paths.intent, intentReserved, sha256(intentBytes), intentBytes.byteLength);
    responseReserved = reserveArtifact(paths.response);
    resultReserved = reserveArtifact(paths.attemptResult);
    completionReserved = reserveArtifact(paths.dispatchCompletion);
    fsyncSync(responseReserved.descriptor);
    fsyncSync(resultReserved.descriptor);
    fsyncSync(completionReserved.descriptor);
    syncDirectory(paths.root);
    verifyRunAuthority({
      paths,
      rootBefore,
      authority: authorityArtifact,
      pre: preArtifact,
      intentReserved,
      intentBytes,
      responseReserved,
      responseHash: sha256(new Uint8Array()),
      responseSize: 0,
      resultReserved,
      resultHash: sha256(new Uint8Array()),
      resultSize: 0,
      completionReserved,
      completionHash: sha256(new Uint8Array()),
      completionSize: 0
    });
    let response: Response;
    try {
      response = await input.transport(new Request(
        OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin + OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route,
        {
          method: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.method,
          headers: {
            "OAI-Sites-Authorization": "Bearer " + input.authorizationToken,
            "Content-Type": OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.contentType
          },
          body: OS01_STAGING_FOREIGN_KEYS_EXACT_BODY,
          redirect: "error"
        }
      ));
    } catch {
      const terminal = resultWithHash({
        version: "engine-os.os01-staging-foreign-keys-controller-result.v2",
        status: "terminal_transport_uncertain",
        qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
        controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
        qualificationEligible: input.qualificationEligible,
        attemptId,
        authorityBytesSha256: sha256(authorityArtifact.bytes),
        authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
        authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
        preregisteredArtifactIdentityHash: String(authority.preregisteredArtifactIdentityHash),
        preObservationBytesSha256: sha256(preArtifact.bytes),
        requestBodySha256: OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256,
        responseBytesSha256: null,
        httpStatus: null,
        retryAllowed: false,
        controllerDatabaseMutationAttempted: false,
        oddsProviderPathInvoked: false,
        quotaPathInvoked: false,
        controlPlanePostcheckRequired: true,
        recordedAt: input.now().toISOString()
      });
      const terminalBytes = new TextEncoder().encode(JSON.stringify(terminal, null, 2) + "\n");
      writeDescriptor(resultReserved.descriptor, terminalBytes);
      syncDirectory(paths.root);
      verifyRunAuthority({
        paths,
        rootBefore,
        authority: authorityArtifact,
        pre: preArtifact,
        intentReserved,
        intentBytes,
        responseReserved,
        responseHash: sha256(new Uint8Array()),
        responseSize: 0,
        resultReserved,
        resultHash: sha256(terminalBytes),
        resultSize: terminalBytes.byteLength,
        completionReserved,
        completionHash: sha256(new Uint8Array()),
        completionSize: 0
      });
      return terminal;
    }
    const headerReflectionScan = credentialHeaderReflectionScan(response.headers, input.authorizationToken);
    if (!headerReflectionScan.complete || headerReflectionScan.reflected) {
      try {
        await response.body?.cancel();
      } catch {
        // Header evidence already makes the response terminal and nonpersistable.
      }
      const terminal = resultWithHash({
        version: "engine-os.os01-staging-foreign-keys-controller-result.v2",
        status: headerReflectionScan.reflected ? "terminal_credential_reflection" : "terminal_invalid_response",
        qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
        qualificationEligible: input.qualificationEligible,
        attemptId,
        controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
        authorityBytesSha256: sha256(authorityArtifact.bytes),
        authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
        authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
        preregisteredArtifactIdentityHash: String(authority.preregisteredArtifactIdentityHash),
        preObservationBytesSha256: sha256(preArtifact.bytes),
        requestBodySha256: OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256,
        responseBytesSha256: null,
        httpStatus: response.status,
        retryAllowed: false,
        controllerDatabaseMutationAttempted: false,
        oddsProviderPathInvoked: false,
        quotaPathInvoked: false,
        controlPlanePostcheckRequired: true,
        recordedAt: input.now().toISOString()
      });
      const terminalBytes = new TextEncoder().encode(JSON.stringify(terminal, null, 2) + "\n");
      writeDescriptor(resultReserved.descriptor, terminalBytes);
      syncDirectory(paths.root);
      verifyRunAuthority({
        paths,
        rootBefore,
        authority: authorityArtifact,
        pre: preArtifact,
        intentReserved,
        intentBytes,
        responseReserved,
        responseHash: sha256(new Uint8Array()),
        responseSize: 0,
        resultReserved,
        resultHash: sha256(terminalBytes),
        resultSize: terminalBytes.byteLength,
        completionReserved,
        completionHash: sha256(new Uint8Array()),
        completionSize: 0
      });
      return terminal;
    }
    let bytes: Uint8Array;
    try {
      bytes = await readBoundedResponse(response);
    } catch {
      const terminal = resultWithHash({
        version: "engine-os.os01-staging-foreign-keys-controller-result.v2",
        status: "terminal_transport_uncertain",
        qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
        qualificationEligible: input.qualificationEligible,
        attemptId,
        controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
        authorityBytesSha256: sha256(authorityArtifact.bytes),
        authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
        authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
        preregisteredArtifactIdentityHash: String(authority.preregisteredArtifactIdentityHash),
        preObservationBytesSha256: sha256(preArtifact.bytes),
        requestBodySha256: OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256,
        responseBytesSha256: null,
        httpStatus: response.status,
        retryAllowed: false,
        controllerDatabaseMutationAttempted: false,
        oddsProviderPathInvoked: false,
        quotaPathInvoked: false,
        controlPlanePostcheckRequired: true,
        recordedAt: input.now().toISOString()
      });
      const terminalBytes = new TextEncoder().encode(JSON.stringify(terminal, null, 2) + "\n");
      writeDescriptor(resultReserved.descriptor, terminalBytes);
      syncDirectory(paths.root);
      verifyRunAuthority({
        paths,
        rootBefore,
        authority: authorityArtifact,
        pre: preArtifact,
        intentReserved,
        intentBytes,
        responseReserved,
        responseHash: sha256(new Uint8Array()),
        responseSize: 0,
        resultReserved,
        resultHash: sha256(terminalBytes),
        resultSize: terminalBytes.byteLength,
        completionReserved,
        completionHash: sha256(new Uint8Array()),
        completionSize: 0
      });
      return terminal;
    }
    verifyRunAuthority({
      paths,
      rootBefore,
      authority: authorityArtifact,
      pre: preArtifact,
      intentReserved,
      intentBytes,
      responseReserved,
      responseHash: sha256(new Uint8Array()),
      responseSize: 0,
      resultReserved,
      resultHash: sha256(new Uint8Array()),
      resultSize: 0,
      completionReserved,
      completionHash: sha256(new Uint8Array()),
      completionSize: 0
    });
    const responseHash = sha256(bytes);
    const reflectionScan = credentialReflectionScan(bytes, input.authorizationToken);
    const reflected = reflectionScan.reflected;
    const jsonContentType = response.headers.get("content-type")?.toLowerCase() === "application/json";
    const valid = reflectionScan.complete && !reflected && response.status === 200 && jsonContentType &&
      validateResponse(bytes, input.responseValidation);
    const workerFailureValid = reflectionScan.complete && !reflected && response.status === 500 &&
      jsonContentType && validateWorkerFailureResponse(bytes);
    const persistResponse = valid || workerFailureValid;
    if (persistResponse) writeDescriptor(responseReserved.descriptor, bytes);
    const status = reflected ? "terminal_credential_reflection" :
      valid ? "pending_control_plane_postcheck" :
        workerFailureValid ? "terminal_worker_failure" : "terminal_invalid_response";
    const result = resultWithHash({
      version: "engine-os.os01-staging-foreign-keys-controller-result.v2",
      status,
      qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
      qualificationEligible: input.qualificationEligible,
      attemptId,
      controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
      authorityBytesSha256: sha256(authorityArtifact.bytes),
      authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
      authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
      preregisteredArtifactIdentityHash: String(authority.preregisteredArtifactIdentityHash),
      preObservationBytesSha256: sha256(preArtifact.bytes),
      requestBodySha256: OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256,
      responseBytesSha256: responseHash,
      httpStatus: response.status,
      retryAllowed: false,
      controllerDatabaseMutationAttempted: false,
      oddsProviderPathInvoked: false,
      quotaPathInvoked: false,
      controlPlanePostcheckRequired: true,
      recordedAt: input.now().toISOString()
    });
    const resultBytes = new TextEncoder().encode(JSON.stringify(result, null, 2) + "\n");
    writeDescriptor(resultReserved.descriptor, resultBytes);
    syncDirectory(paths.root);
    verifyRunAuthority({
      paths,
      rootBefore,
      authority: authorityArtifact,
      pre: preArtifact,
      intentReserved,
      intentBytes,
      responseReserved,
      responseHash: persistResponse ? responseHash : sha256(new Uint8Array()),
      responseSize: persistResponse ? bytes.byteLength : 0,
      resultReserved,
      resultHash: sha256(resultBytes),
      resultSize: resultBytes.byteLength,
      completionReserved,
      completionHash: sha256(new Uint8Array()),
      completionSize: 0
    });
    if (!valid) return result;
    const completion = createDispatchCompletion({
      qualificationEligible: input.qualificationEligible,
      attemptId,
      preregisteredArtifactIdentityHash: String(authority.preregisteredArtifactIdentityHash),
      intentBytesSha256: sha256(intentBytes),
      responseBytesSha256: responseHash,
      resultBytesSha256: sha256(resultBytes),
      recordedAt: input.now().toISOString()
    });
    const completionBytes = new TextEncoder().encode(JSON.stringify(completion, null, 2) + "\n");
    writeDescriptor(completionReserved.descriptor, completionBytes);
    syncDirectory(paths.root);
    verifyRunAuthority({
      paths,
      rootBefore,
      authority: authorityArtifact,
      pre: preArtifact,
      intentReserved,
      intentBytes,
      responseReserved,
      responseHash,
      responseSize: bytes.byteLength,
      resultReserved,
      resultHash: sha256(resultBytes),
      resultSize: resultBytes.byteLength,
      completionReserved,
      completionHash: sha256(completionBytes),
      completionSize: completionBytes.byteLength
    });
    return result;
  } catch (error) {
    if (resultReserved) {
      const terminal = resultWithHash({
        version: "engine-os.os01-staging-foreign-keys-controller-result.v2",
        status: "terminal_artifact_authority_violation",
        qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
        controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
        qualificationEligible: input.qualificationEligible,
        attemptId,
        authorityBytesSha256: sha256(authorityArtifact.bytes),
        authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
        authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
        preregisteredArtifactIdentityHash: String(authority.preregisteredArtifactIdentityHash),
        preObservationBytesSha256: sha256(preArtifact.bytes),
        requestBodySha256: OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256,
        responseBytesSha256: null,
        httpStatus: null,
        retryAllowed: false,
        controllerDatabaseMutationAttempted: false,
        oddsProviderPathInvoked: false,
        quotaPathInvoked: false,
        controlPlanePostcheckRequired: true,
        recordedAt: input.now().toISOString()
      });
      try {
        if (descriptorIdentity(resultReserved.descriptor).size === 0 &&
            sameIdentity(privateFileIdentity(paths.attemptResult), resultReserved.identity)) {
          writeDescriptor(resultReserved.descriptor, JSON.stringify(terminal, null, 2) + "\n");
        }
      } catch {
        // The durable intent remains the terminal no-retry evidence.
      }
    }
    if (intentReserved && !existsSync(paths.terminalFence)) {
      const fenceBody = {
        version: "engine-os.os01-staging-foreign-keys-terminal-fence.v1",
        status: "terminal_artifact_authority_violation",
        qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
        controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
        qualificationEligible: input.qualificationEligible,
        attemptId,
        intentBytesSha256: sha256(intentBytes),
        retryAllowed: false,
        recordedAt: input.now().toISOString()
      };
      try {
        durableExclusiveJson(paths.terminalFence, hashedBody(fenceBody, "fenceHash"));
      } catch {
        // Existing or untrusted terminal state remains fail-closed.
      }
    }
    throw error;
  } finally {
    for (const reserved of [intentReserved, responseReserved, resultReserved, completionReserved]) {
      if (reserved) {
        try {
          closeSync(reserved.descriptor);
        } catch {
          // Preserve the original result; descriptors are process-scoped.
        }
      }
    }
    try {
      syncDirectory(paths.root);
    } catch {
      // A changed authority root cannot become accepted by the finalizer.
    }
  }
}

function parseHashedRecord(bytes: Uint8Array, hashKey: string): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const claimed = record[hashKey];
  if (!validHex(claimed)) return null;
  const body = { ...record };
  delete body[hashKey];
  return sha256(canonicalJson(body)) === claimed ? record : null;
}

function validateIntentRecord(
  bytes: Uint8Array,
  qualificationEligible: boolean
): Record<string, unknown> | null {
  const intent = parseHashedRecord(bytes, "intentHash");
  if (!intent || !hasExactKeys(intent, [
    "attemptId", "authorityBytesSha256", "authorityFileIdentitySha256", "authorityRootIdentitySha256",
    "contentType", "controlPlanePostcheckRequired", "controllerAuthorityId", "credentialKind",
    "exclusiveHostAssumption", "intentHash", "method", "origin", "preObservationBytesSha256",
    "preregisteredArtifactIdentityHash", "projectId", "qualificationEligible", "qualificationId", "recordedAt", "requestBodySha256",
    "retryAllowedAfterReservation", "route", "status", "version"
  ])) return null;
  return intent.version === "engine-os.os01-staging-foreign-keys-controller-intent.v2" &&
    intent.status === "reserved_before_transport_no_retry" && intent.qualificationId === OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID &&
    intent.controllerAuthorityId === OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID &&
    intent.qualificationEligible === qualificationEligible && typeof intent.attemptId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(intent.attemptId) &&
    validHex(intent.authorityBytesSha256) && validHex(intent.authorityRootIdentitySha256) &&
    validHex(intent.authorityFileIdentitySha256) && validHex(intent.preregisteredArtifactIdentityHash) &&
    intent.projectId === OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId &&
    intent.origin === OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin &&
    intent.method === OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.method &&
    intent.route === OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route &&
    intent.contentType === OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.contentType &&
    intent.requestBodySha256 === OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256 &&
    validHex(intent.preObservationBytesSha256) &&
    intent.credentialKind === "ephemeral_sites_siwc_not_persisted" &&
    intent.retryAllowedAfterReservation === false && intent.controlPlanePostcheckRequired === true &&
    intent.exclusiveHostAssumption === "single_owner_no_concurrent_writer_during_controller_window" &&
    timestampMilliseconds(intent.recordedAt) !== null ? intent : null;
}

function validateResultRecord(
  bytes: Uint8Array,
  qualificationEligible: boolean
): Record<string, unknown> | null {
  const result = parseHashedRecord(bytes, "resultHash");
  if (!result || !hasExactKeys(result, [
    "attemptId", "authorityBytesSha256", "authorityFileIdentitySha256", "authorityRootIdentitySha256",
    "controlPlanePostcheckRequired", "controllerAuthorityId", "controllerDatabaseMutationAttempted", "httpStatus",
    "oddsProviderPathInvoked", "preObservationBytesSha256", "preregisteredArtifactIdentityHash",
    "qualificationEligible", "qualificationId",
    "quotaPathInvoked", "recordedAt", "requestBodySha256", "responseBytesSha256", "resultHash",
    "retryAllowed", "status", "version"
  ])) return null;
  const statuses = new Set([
    "pending_control_plane_postcheck", "terminal_worker_failure", "terminal_transport_uncertain", "terminal_invalid_response",
    "terminal_credential_reflection", "terminal_artifact_authority_violation"
  ]);
  return result.version === "engine-os.os01-staging-foreign-keys-controller-result.v2" &&
    statuses.has(String(result.status)) && result.qualificationId === OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID &&
    result.controllerAuthorityId === OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID &&
    result.qualificationEligible === qualificationEligible && typeof result.attemptId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(result.attemptId) &&
    validHex(result.authorityBytesSha256) && validHex(result.authorityRootIdentitySha256) &&
    validHex(result.authorityFileIdentitySha256) && validHex(result.preregisteredArtifactIdentityHash) &&
    validHex(result.preObservationBytesSha256) && result.requestBodySha256 === OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256 &&
    (result.responseBytesSha256 === null || validHex(result.responseBytesSha256)) &&
    (result.httpStatus === null || (Number.isSafeInteger(result.httpStatus) &&
      (result.httpStatus as number) >= 100 && (result.httpStatus as number) <= 599)) &&
    result.retryAllowed === false && result.controllerDatabaseMutationAttempted === false &&
    result.oddsProviderPathInvoked === false && result.quotaPathInvoked === false &&
    result.controlPlanePostcheckRequired === true && timestampMilliseconds(result.recordedAt) !== null ? result : null;
}

function finalizeCore(
  root: string,
  qualificationEligible: boolean,
  now: () => Date,
  responseIdentity: ResponseValidationIdentity
): Record<string, unknown> {
  const paths = artifactPaths(root);
  const rootBefore = rootIdentity(root);
  if (existsSync(paths.finalizationIntent) || existsSync(paths.finalReceipt)) {
    throw new Error("staging foreign-key finalization authority already consumed");
  }
  const authorityArtifact = readPrivateArtifact(paths.authority);
  const authority = parseJson(authorityArtifact.bytes, "controller authority");
  if (!validateAuthority(authority, root, qualificationEligible)) {
    throw new Error("staging foreign-key finalization authority is invalid");
  }
  const preregisteredArtifactIdentityHash = String(authority.preregisteredArtifactIdentityHash);
  const finalizationRecordedAt = now().toISOString();
  const finalizationBody = {
    version: "engine-os.os01-staging-foreign-keys-finalization-intent.v1",
    status: "reserved_before_evidence_validation_no_retry",
    qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
    controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
    qualificationEligible,
    canonicalRoot: resolve(root),
    preregisteredArtifactIdentityHash,
    retryAllowed: false,
    recordedAt: finalizationRecordedAt
  };
  const finalizationIntent = hashedBody(finalizationBody, "finalizationIntentHash");
  durableExclusiveJson(paths.finalizationIntent, finalizationIntent);
  const finalizationArtifact = readPrivateArtifact(paths.finalizationIntent);
  const expectedFinalizationBytes = new TextEncoder().encode(JSON.stringify(finalizationIntent, null, 2) + "\n");
  if (sha256(finalizationArtifact.bytes) !== sha256(expectedFinalizationBytes)) {
    throw new Error("staging foreign-key finalization intent changed after reservation");
  }
  if (existsSync(paths.terminalFence)) {
    throw new Error("staging foreign-key dispatch is terminally fenced");
  }
  const preArtifact = readPrivateArtifact(paths.preObservation);
  const postArtifact = readPrivateArtifact(paths.postObservation);
  const intentArtifact = readPrivateArtifact(paths.intent);
  const responseArtifact = readPrivateArtifact(paths.response);
  const resultArtifact = readPrivateArtifact(paths.attemptResult);
  const completionArtifact = readPrivateArtifact(paths.dispatchCompletion);
  const pre = parseJson(preArtifact.bytes, "control-plane pre-observation");
  const post = parseJson(postArtifact.bytes, "control-plane post-observation");
  const intent = validateIntentRecord(intentArtifact.bytes, qualificationEligible);
  const result = validateResultRecord(resultArtifact.bytes, qualificationEligible);
  const completion = validateDispatchCompletion(completionArtifact.bytes, qualificationEligible);
  if (!validateAuthority(authority, root, qualificationEligible) ||
      !validateObservation(pre, "pre") || !validateObservation(post, "post") || !intent || !result ||
      !completion) {
    throw new Error("staging foreign-key finalization evidence is invalid");
  }
  const expectedArtifactIdentity = authority.expectedArtifactIdentity as PreregisteredArtifactIdentity;
  const observationsMatchPreregisteredArtifactIdentity =
    observationMatchesPreregisteredArtifactIdentity(pre, expectedArtifactIdentity) &&
    observationMatchesPreregisteredArtifactIdentity(post, expectedArtifactIdentity);
  const identitiesMatch = observationIdentity(pre) === observationIdentity(post);
  const finalRecordedAt = finalizationRecordedAt;
  const authorityMilliseconds = timestampMilliseconds(authority.initializedAt);
  const preMilliseconds = timestampMilliseconds(pre.recordedAt);
  const intentMilliseconds = timestampMilliseconds(intent.recordedAt);
  const resultMilliseconds = timestampMilliseconds(result.recordedAt);
  const completionMilliseconds = timestampMilliseconds(completion.recordedAt);
  const postMilliseconds = timestampMilliseconds(post.recordedAt);
  const finalMilliseconds = timestampMilliseconds(finalRecordedAt);
  const temporalOrderValid = authorityMilliseconds !== null && preMilliseconds !== null &&
    intentMilliseconds !== null && resultMilliseconds !== null && completionMilliseconds !== null &&
    postMilliseconds !== null &&
    finalMilliseconds !== null && authorityMilliseconds <= preMilliseconds &&
    preMilliseconds <= intentMilliseconds && intentMilliseconds <= resultMilliseconds &&
    resultMilliseconds <= completionMilliseconds && completionMilliseconds <= postMilliseconds &&
    postMilliseconds <= finalMilliseconds &&
    finalMilliseconds - authorityMilliseconds <= QUALIFICATION_WINDOW_MILLISECONDS;
  const preHash = sha256(preArtifact.bytes);
  const responseHash = sha256(responseArtifact.bytes);
  const authorityHash = sha256(authorityArtifact.bytes);
  const liveRootIdentityHash = rootIdentitySha256(rootBefore);
  const liveAuthorityFileIdentityHash = fileIdentitySha256(authorityArtifact.identity);
  const authorityBindingVerified = intent.authorityBytesSha256 === authorityHash &&
    result.authorityBytesSha256 === authorityHash &&
    intent.authorityRootIdentitySha256 === liveRootIdentityHash &&
    result.authorityRootIdentitySha256 === liveRootIdentityHash &&
    intent.authorityFileIdentitySha256 === liveAuthorityFileIdentityHash &&
    result.authorityFileIdentitySha256 === liveAuthorityFileIdentityHash;
  const crossRecordBindingsVerified = intent.attemptId === result.attemptId &&
    intent.qualificationId === result.qualificationId &&
    authorityBindingVerified &&
    intent.requestBodySha256 === result.requestBodySha256 &&
    intent.requestBodySha256 === OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256 &&
    intent.preObservationBytesSha256 === preHash && result.preObservationBytesSha256 === preHash &&
    result.responseBytesSha256 === responseHash && result.httpStatus === 200 && result.retryAllowed === false &&
    result.status === "pending_control_plane_postcheck" && completion.attemptId === intent.attemptId &&
    completion.qualificationId === intent.qualificationId &&
    completion.intentBytesSha256 === sha256(intentArtifact.bytes) &&
    completion.responseBytesSha256 === responseHash &&
    completion.resultBytesSha256 === sha256(resultArtifact.bytes) && completion.retryAllowed === false;
  const artifactIdentityBindingVerified = observationsMatchPreregisteredArtifactIdentity &&
    intent.preregisteredArtifactIdentityHash === preregisteredArtifactIdentityHash &&
    result.preregisteredArtifactIdentityHash === preregisteredArtifactIdentityHash &&
    completion.preregisteredArtifactIdentityHash === preregisteredArtifactIdentityHash &&
    finalizationIntent.preregisteredArtifactIdentityHash === preregisteredArtifactIdentityHash;
  const workerReceiptVerified = validateResponse(responseArtifact.bytes, responseIdentity);
  const evidenceValid = identitiesMatch && artifactIdentityBindingVerified && temporalOrderValid &&
    crossRecordBindingsVerified && workerReceiptVerified;
  const accepted = qualificationEligible && evidenceValid;
  const body = {
    version: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.finalReceiptVersion,
    status: accepted ? OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.finalAcceptanceStatus :
      qualificationEligible ? "terminal_control_plane_or_evidence_mismatch" :
        evidenceValid ? "test_only_postcheck_verified" : "test_only_postcheck_rejected",
    qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
    controllerAuthorityId: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
    qualificationEligible,
    authorityVerified: authorityBindingVerified,
    artifactIdentityBindingVerified,
    preregisteredArtifactIdentityHash,
    identitiesMatch,
    temporalOrderValid,
    crossRecordBindingsVerified,
    artifacts: {
      authorityBytesSha256: sha256(authorityArtifact.bytes),
      preObservationBytesSha256: preHash,
      intentBytesSha256: sha256(intentArtifact.bytes),
      responseBytesSha256: responseHash,
      attemptResultBytesSha256: sha256(resultArtifact.bytes),
      dispatchCompletionBytesSha256: sha256(completionArtifact.bytes),
      postObservationBytesSha256: sha256(postArtifact.bytes),
      finalizationIntentBytesSha256: sha256(finalizationArtifact.bytes)
    },
    exactSourceDeploymentAccessEnvironmentAndBindingsMatch: identitiesMatch,
    workerReadOnlyReceiptVerified: workerReceiptVerified,
    boundedForeignKeyReceiptVerified: workerReceiptVerified,
    predecessorBindings: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.predecessor,
    candidateRoot: responseIdentity.candidateRoot,
    normalizedForeignKeyRoot: responseIdentity.normalizedForeignKeyRoot,
    foreignKeyConstraintCount: responseIdentity.foreignKeyConstraintCount,
    foreignKeyColumnRowCount: responseIdentity.foreignKeyColumnRowCount,
    hostedForeignKeyEvidenceAccepted: accepted,
    foreignKeyClaimsAccepted: accepted,
    rowCountEvidenceWithheld: true,
    rowCountClaimsAccepted: false,
    generation12RowCountEligible: accepted,
    retryAllowed: false,
    providerSecretRead: false,
    oddsProviderPathInvoked: false,
    quotaPathInvoked: false,
    databaseMutationAuthorized: false,
    claimBoundary:
      "bounded_isolated_staging_foreign_key_evidence_only_no_row_count_or_os01_acceptance",
    recordedAt: finalRecordedAt
  };
  const receipt = hashedBody(body, "finalReceiptHash");
  if (!sameRootIdentity(rootBefore, rootIdentity(root))) throw new Error("controller root identity changed");
  verifyArtifactSnapshot(paths.authority, authorityArtifact.identity, sha256(authorityArtifact.bytes));
  verifyArtifactSnapshot(paths.preObservation, preArtifact.identity, preHash);
  verifyArtifactSnapshot(paths.postObservation, postArtifact.identity, sha256(postArtifact.bytes));
  verifyArtifactSnapshot(paths.intent, intentArtifact.identity, sha256(intentArtifact.bytes));
  verifyArtifactSnapshot(paths.response, responseArtifact.identity, responseHash);
  verifyArtifactSnapshot(paths.attemptResult, resultArtifact.identity, sha256(resultArtifact.bytes));
  verifyArtifactSnapshot(
    paths.dispatchCompletion, completionArtifact.identity, sha256(completionArtifact.bytes)
  );
  verifyArtifactSnapshot(
    paths.finalizationIntent, finalizationArtifact.identity, sha256(finalizationArtifact.bytes)
  );
  if (existsSync(paths.terminalFence)) throw new Error("staging foreign-key dispatch became terminally fenced");
  durableExclusiveJson(paths.finalReceipt, receipt);
  return receipt;
}

export function initializeOs01StagingForeignKeysControllerAuthority(
  expectedArtifactIdentity: PreregisteredArtifactIdentity
): string {
  if (!validatePreregisteredArtifactIdentity(expectedArtifactIdentity)) {
    throw new Error("controller artifact identity preregistration is invalid");
  }
  if (existsSync(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT)) throw new Error("canonical foreign-key controller root already exists");
  mkdirSync(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT, { mode: 0o700 });
  rootIdentity(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT);
  syncDirectory(dirname(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT));
  initializeAuthorityArtifact(
    OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT,
    true,
    expectedArtifactIdentity,
    () => new Date()
  );
  return OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT;
}

export function writeOs01StagingForeignKeysControlPlaneObservation(
  input: ControlPlaneObservationInput
): ControlPlaneObservationWriteResult {
  if (resolve(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT) !== OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT ||
      basename(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT) !== "engine-os-os01-staging-foreign-keys-" +
        OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID) {
    throw new Error("canonical staging foreign-key controller root is invalid");
  }
  return writeControlPlaneObservationCore(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT, true, input);
}

export async function runOs01StagingForeignKeysController(input: {
  authorizationToken: string;
}): Promise<ForeignKeysControllerResult> {
  if (resolve(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT) !== OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT ||
      basename(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT) !== "engine-os-os01-staging-foreign-keys-" +
        OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID) {
    throw new Error("canonical staging foreign-key controller root is invalid");
  }
  return runControllerCore({
    root: OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT,
    qualificationEligible: true,
    authorizationToken: input.authorizationToken,
    transport: fetch,
    now: () => new Date(),
    responseValidation: {
      catalogHash: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogHash,
      catalogRows: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogRows,
      candidateRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
      normalizedForeignKeyRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot,
      foreignKeyConstraintCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyConstraintCount,
      foreignKeyColumnRowCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyColumnRowCount
    }
  });
}

export function finalizeOs01StagingForeignKeysController(): Record<string, unknown> {
  return finalizeCore(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT, true, () => new Date(), {
    catalogHash: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogHash,
    catalogRows: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogRows,
    candidateRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
    normalizedForeignKeyRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot,
    foreignKeyConstraintCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyConstraintCount,
    foreignKeyColumnRowCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyColumnRowCount
  });
}

type ControllerCliOperations = {
  initialize: (expectedArtifactIdentity: PreregisteredArtifactIdentity) => string;
  writeObservation: (input: ControlPlaneObservationInput) => ControlPlaneObservationWriteResult;
  run: (input: { authorizationToken: string }) => Promise<ForeignKeysControllerResult>;
  finalize: () => Record<string, unknown>;
};

async function executeControllerCli(
  action: string | undefined,
  readStdin: () => Uint8Array | string,
  operations: ControllerCliOperations
): Promise<{ stdout: string; exitCode: number }> {
  if (action === "init") {
    const identity = parsePreregisteredArtifactIdentity(readStdin());
    return { stdout: operations.initialize(identity) + "\n", exitCode: 0 };
  }
  if (action === "write-pre-observation" || action === "write-post-observation") {
    const phase = action === "write-pre-observation" ? "pre" : "post";
    const input = parseControlPlaneObservationInput(readStdin(), phase);
    const result = operations.writeObservation(input);
    return { stdout: result.phase + ":" + result.observationHash + "\n", exitCode: 0 };
  }
  if (action === "run") {
    const tokenBytes = readStdin();
    const rawToken = typeof tokenBytes === "string" ? tokenBytes : Buffer.from(tokenBytes).toString("utf8");
    const token = rawToken.endsWith("\r\n") ? rawToken.slice(0, -2) :
      rawToken.endsWith("\n") ? rawToken.slice(0, -1) : rawToken;
    const result = await operations.run({ authorizationToken: token });
    return {
      stdout: result.status + "\n",
      exitCode: result.status === "pending_control_plane_postcheck" ? 0 : 1
    };
  }
  if (action === "finalize") {
    const receipt = operations.finalize();
    return {
      stdout: String(receipt.status) + "\n",
      exitCode: receipt.status === OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.finalAcceptanceStatus ? 0 : 1
    };
  }
  throw new Error("expected --action init, write-pre-observation, run, write-post-observation, or finalize");
}

export const os01StagingForeignKeysControllerTestOnly = Object.freeze({
  initialize(
    root: string,
    expectedArtifactIdentity: PreregisteredArtifactIdentity,
    now: () => Date = () => new Date()
  ): void {
    rootIdentity(root);
    initializeAuthorityArtifact(root, false, expectedArtifactIdentity, now);
  },
  parsePreregisteredArtifactIdentity(bytes: Uint8Array | string): PreregisteredArtifactIdentity {
    return parsePreregisteredArtifactIdentity(bytes);
  },
  parseObservationInput(
    bytes: Uint8Array | string,
    phase: ObservationPhase
  ): ControlPlaneObservationInput {
    return parseControlPlaneObservationInput(bytes, phase);
  },
  writeObservation(
    root: string,
    input: ControlPlaneObservationInput
  ): ControlPlaneObservationWriteResult {
    return writeControlPlaneObservationCore(root, false, input);
  },
  async executeCli(input: {
    action: string | undefined;
    stdin: Uint8Array | string;
    operations: ControllerCliOperations;
  }): Promise<{ stdout: string; exitCode: number }> {
    return executeControllerCli(input.action, () => input.stdin, input.operations);
  },
  async run(input: {
    root: string;
    authorizationToken: string;
    transport: ForeignKeysTransport;
    now?: () => Date;
    responseValidation: ResponseValidationIdentity;
  }): Promise<ForeignKeysControllerResult> {
    return runControllerCore({
      ...input,
      qualificationEligible: false,
      now: input.now ?? (() => new Date())
    });
  },
  finalize(
    root: string,
    now: () => Date = () => new Date(),
    responseValidation: ResponseValidationIdentity = {
      catalogHash: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogHash,
      catalogRows: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogRows,
      candidateRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
      normalizedForeignKeyRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot,
      foreignKeyConstraintCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyConstraintCount,
      foreignKeyColumnRowCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyColumnRowCount
    }
  ): Record<string, unknown> {
    return finalizeCore(root, false, now, responseValidation);
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[process.argv.indexOf("--action") + 1];
  const result = await executeControllerCli(action, () => readFileSync(0), {
    initialize: initializeOs01StagingForeignKeysControllerAuthority,
    writeObservation: writeOs01StagingForeignKeysControlPlaneObservation,
    run: runOs01StagingForeignKeysController,
    finalize: finalizeOs01StagingForeignKeysController
  });
  process.stdout.write(result.stdout);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
