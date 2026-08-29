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
  STAGING_CENSUS_ARTIFACT_NAMES,
  STAGING_CENSUS_CONTROLLER_ID,
  STAGING_CENSUS_CONTROLLER_ROOT,
  STAGING_CENSUS_EXACT_BODY,
  STAGING_CENSUS_EXACT_BODY_SHA256,
  STAGING_CENSUS_ID,
  STAGING_CENSUS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-census/contract";

const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const QUALIFICATION_WINDOW_MILLISECONDS = 30 * 60 * 1000;

type CensusTransport = (request: Request) => Promise<Response>;
type ObservationPhase = "pre" | "post";

export type ResponseValidationIdentity = {
  catalogHash: string;
  catalogRows: number;
  userTableCount: number;
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
  accessRevision: number;
  ownerIdentityHash: string;
  environmentRevision: number;
  environmentKeyNames: string[];
  recordedAt: string;
};

export type ControlPlaneObservationWriteResult = {
  phase: ObservationPhase;
  observationHash: string;
  bytesSha256: string;
};

export type CensusControllerResult = {
  version: "engine-os.os01-staging-census-controller-result.v2";
  status:
    | "pending_control_plane_postcheck"
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
  transport: CensusTransport;
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
    authority: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.authority),
    preObservation: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.preObservation),
    intent: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.intent),
    response: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.response),
    attemptResult: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.attemptResult),
    dispatchCompletion: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.dispatchCompletion),
    terminalFence: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.terminalFence),
    postObservation: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.postObservation),
    finalizationIntent: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.finalizationIntent),
    finalReceipt: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.finalReceipt)
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

function createAuthorityRecord(
  root: string,
  qualificationEligible: boolean,
  initializedAt: string
): Record<string, unknown> {
  if (timestampMilliseconds(initializedAt) === null) throw new Error("authority timestamp is not canonical UTC");
  const body = {
    version: "engine-os.os01-staging-census-controller-authority.v1",
    status: "initialized_no_dispatch",
    qualificationId: STAGING_CENSUS_ID,
    controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
    qualificationEligible,
    canonicalRoot: resolve(root),
    projectId: STAGING_CENSUS_SEMANTIC_CONTRACT.projectId,
    origin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
    retryAfterAnyIntentOrOutputArtifact: false,
    maximumQualificationWindowMilliseconds: QUALIFICATION_WINDOW_MILLISECONDS,
    exclusiveHostAssumption: "single_owner_no_concurrent_writer_during_controller_window",
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
    "maximumQualificationWindowMilliseconds", "origin", "projectId", "qualificationEligible",
    "qualificationId", "retryAfterAnyIntentOrOutputArtifact", "status", "version"
  ]) || !validHex(authority.authorityHash)) return false;
  const body = { ...authority };
  delete body.authorityHash;
  return sha256(canonicalJson(body)) === authority.authorityHash &&
    authority.version === "engine-os.os01-staging-census-controller-authority.v1" &&
    authority.status === "initialized_no_dispatch" && authority.qualificationId === STAGING_CENSUS_ID &&
    authority.controllerAuthorityId === STAGING_CENSUS_CONTROLLER_ID &&
    authority.qualificationEligible === qualificationEligible && authority.canonicalRoot === resolve(root) &&
    authority.projectId === STAGING_CENSUS_SEMANTIC_CONTRACT.projectId &&
    authority.origin === STAGING_CENSUS_SEMANTIC_CONTRACT.origin &&
    authority.retryAfterAnyIntentOrOutputArtifact === false &&
    authority.maximumQualificationWindowMilliseconds === QUALIFICATION_WINDOW_MILLISECONDS &&
    authority.exclusiveHostAssumption === "single_owner_no_concurrent_writer_during_controller_window" &&
    timestampMilliseconds(authority.initializedAt) !== null;
}

function initializeAuthorityArtifact(root: string, qualificationEligible: boolean, now: () => Date): void {
  const paths = artifactPaths(root);
  const recordedAt = now().toISOString();
  durableExclusiveJson(paths.authority, createAuthorityRecord(root, qualificationEligible, recordedAt));
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
    "accessRevision", "archiveSha256", "deploymentId", "deploymentStatus", "deploymentUrl",
    "environmentKeyNames", "environmentRevision", "manifestSha256", "ownerIdentityHash", "phase",
    "recordedAt", "sourceCommit", "sourceTree", "versionId", "versionNumber", "workerSha256"
  ]) || value.phase !== requiredPhase || typeof value.sourceCommit !== "string" ||
      typeof value.sourceTree !== "string" || typeof value.versionId !== "string" ||
      !Number.isSafeInteger(value.versionNumber) || typeof value.deploymentId !== "string" ||
      value.deploymentStatus !== "succeeded" || typeof value.deploymentUrl !== "string" ||
      typeof value.workerSha256 !== "string" || typeof value.manifestSha256 !== "string" ||
      typeof value.archiveSha256 !== "string" || !Number.isSafeInteger(value.accessRevision) ||
      typeof value.ownerIdentityHash !== "string" || !Number.isSafeInteger(value.environmentRevision) ||
      !Array.isArray(value.environmentKeyNames) ||
      value.environmentKeyNames.some((key) => typeof key !== "string") ||
      typeof value.recordedAt !== "string") {
    throw new Error("control-plane observation input does not match the closed schema");
  }
  return value as ControlPlaneObservationInput;
}

export function createOs01StagingCensusControlPlaneObservation(
  input: ControlPlaneObservationInput
): Record<string, unknown> {
  if (input.environmentKeyNames.length !== 0) {
    throw new Error("isolated staging census environment key list must be empty");
  }
  const body = {
    version: "engine-os.os01-staging-census-control-plane-observation.v1",
    phase: input.phase,
    qualificationId: STAGING_CENSUS_ID,
    controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
    projectId: STAGING_CENSUS_SEMANTIC_CONTRACT.projectId,
    origin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
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
      censusRoute: STAGING_CENSUS_SEMANTIC_CONTRACT.route,
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
      observation.version !== "engine-os.os01-staging-census-control-plane-observation.v1" ||
      observation.phase !== phase || observation.qualificationId !== STAGING_CENSUS_ID ||
      observation.controllerAuthorityId !== STAGING_CENSUS_CONTROLLER_ID ||
      observation.projectId !== STAGING_CENSUS_SEMANTIC_CONTRACT.projectId ||
      observation.origin !== STAGING_CENSUS_SEMANTIC_CONTRACT.origin ||
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
      deploymentRow.url !== STAGING_CENSUS_SEMANTIC_CONTRACT.origin ||
      typeof deploymentRow.versionId !== "string" ||
      !new RegExp("^" + STAGING_CENSUS_SEMANTIC_CONTRACT.projectId + "~appgver_[a-f0-9]{32}$", "u")
        .test(deploymentRow.versionId) ||
      !Number.isSafeInteger(deploymentRow.versionNumber) ||
      (deploymentRow.versionNumber as number) < 1 ||
      !hasExactKeys(packageRow, ["archiveSha256", "censusRoute", "manifestSha256", "mutationRoutes", "workerSha256"]) ||
      !validHex(packageRow.archiveSha256) || !validHex(packageRow.manifestSha256) ||
      !validHex(packageRow.workerSha256) || packageRow.censusRoute !== STAGING_CENSUS_SEMANTIC_CONTRACT.route ||
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
  const observation = createOs01StagingCensusControlPlaneObservation(input);
  if (!validateObservation(observation, input.phase)) {
    throw new Error("control-plane observation input failed semantic validation");
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

function compareForeignKeys(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return (left.id as number) - (right.id as number) || (left.seq as number) - (right.seq as number) ||
    codePointCompare(left.table as string, right.table as string) ||
    codePointCompare(left.from as string, right.from as string) ||
    codePointCompare((left.to as string | null) ?? "", (right.to as string | null) ?? "") ||
    codePointCompare(left.on_update as string, right.on_update as string) ||
    codePointCompare(left.on_delete as string, right.on_delete as string) ||
    codePointCompare(left.match as string, right.match as string);
}

function validateResponse(bytes: Uint8Array, expected: ResponseValidationIdentity): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const receipt = parsed as Record<string, unknown>;
  if (!hasExactKeys(receipt, [
    "captureActivations", "catalogHash", "catalogRows", "censusId", "claimBoundary",
    "databaseMutationAttempted", "ddlRoot", "foreignKeyRoot", "prePostCatalogMatch",
    "prePostRowCountsMatch", "productionMutations", "productionReads", "providerBindings",
    "providerDispatches", "providerSecretReads", "quotaReservations", "receiptHash",
    "requestBudgetClaim", "rowCountRoot", "snapshotClaim", "status", "tableSetHash",
    "tables", "userObjectCount", "userTableCount", "userViewCount", "version",
    "viewNames", "viewSetHash"
  ])) return false;
  const claimedHash = receipt.receiptHash;
  if (!validHex(claimedHash)) return false;
  const body = { ...receipt };
  delete body.receiptHash;
  if (sha256(canonicalJson(body)) !== claimedHash ||
      receipt.version !== STAGING_CENSUS_SEMANTIC_CONTRACT.responseVersion ||
      receipt.status !== "read_only_schema_census_captured" ||
      receipt.censusId !== STAGING_CENSUS_ID ||
      receipt.catalogRows !== expected.catalogRows || receipt.catalogHash !== expected.catalogHash ||
      receipt.userTableCount !== expected.userTableCount ||
      !Number.isSafeInteger(receipt.userObjectCount) ||
      (receipt.userObjectCount as number) < expected.userTableCount ||
      receipt.prePostCatalogMatch !== true || receipt.prePostRowCountsMatch !== true ||
      receipt.snapshotClaim !== STAGING_CENSUS_SEMANTIC_CONTRACT.consistencyClaim ||
      receipt.requestBudgetClaim !== "controller_enforced_single_invocation_not_runtime_durable" ||
      receipt.databaseMutationAttempted !== false || receipt.providerBindings !== 0 ||
      receipt.providerSecretReads !== 0 || receipt.providerDispatches !== 0 ||
      receipt.quotaReservations !== 0 || receipt.captureActivations !== 0 ||
      receipt.productionReads !== 0 || receipt.productionMutations !== 0 ||
      receipt.claimBoundary !== "isolated_staging_read_only_census_only") return false;
  if (!Array.isArray(receipt.tables) || receipt.tables.length !== expected.userTableCount ||
      !Array.isArray(receipt.viewNames) || receipt.userViewCount !== receipt.viewNames.length) return false;

  const normalizedTables: Array<{ name: string; createSql: string; rowCount: number; foreignKeys: unknown[] }> = [];
  for (const value of receipt.tables) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const table = value as Record<string, unknown>;
    if (!hasExactKeys(table, ["createSql", "createSqlHash", "foreignKeys", "name", "rowCount"]) ||
        typeof table.name !== "string" || !/^[A-Za-z0-9_]+$/u.test(table.name) ||
        typeof table.createSql !== "string" || table.createSqlHash !== sha256(table.createSql) ||
        !Number.isSafeInteger(table.rowCount) || (table.rowCount as number) < 0 ||
        !Array.isArray(table.foreignKeys)) return false;
    for (const foreignKey of table.foreignKeys) {
      if (!foreignKey || typeof foreignKey !== "object" || Array.isArray(foreignKey)) return false;
      const row = foreignKey as Record<string, unknown>;
      if (!hasExactKeys(row, ["from", "id", "match", "on_delete", "on_update", "seq", "table", "to"]) ||
          !Number.isSafeInteger(row.id) || (row.id as number) < 0 ||
          !Number.isSafeInteger(row.seq) || (row.seq as number) < 0 ||
          typeof row.table !== "string" || typeof row.from !== "string" ||
          (typeof row.to !== "string" && row.to !== null) || typeof row.on_update !== "string" ||
          typeof row.on_delete !== "string" || typeof row.match !== "string") return false;
    }
    const foreignKeys = table.foreignKeys as Array<Record<string, unknown>>;
    if ([...foreignKeys].sort(compareForeignKeys).some((row, index) => row !== foreignKeys[index])) return false;
    normalizedTables.push({
      name: table.name,
      createSql: table.createSql,
      rowCount: table.rowCount as number,
      foreignKeys: table.foreignKeys
    });
  }
  const tableNames = normalizedTables.map((table) => table.name);
  if (new Set(tableNames).size !== tableNames.length ||
      [...tableNames].sort(codePointCompare).some((name, index) => name !== tableNames[index])) return false;
  const viewNames = receipt.viewNames as unknown[];
  if (viewNames.some((name) => typeof name !== "string" || !/^[A-Za-z0-9_]+$/u.test(name)) ||
      new Set(viewNames).size !== viewNames.length ||
      [...viewNames].sort((left, right) => codePointCompare(String(left), String(right)))
        .some((name, index) => name !== viewNames[index])) return false;
  return validHex(receipt.tableSetHash) && validHex(receipt.viewSetHash) && validHex(receipt.ddlRoot) &&
    validHex(receipt.foreignKeyRoot) && validHex(receipt.rowCountRoot) &&
    receipt.tableSetHash === sha256(canonicalJson(tableNames)) &&
    receipt.viewSetHash === sha256(canonicalJson(viewNames)) &&
    receipt.ddlRoot === sha256(canonicalJson(normalizedTables.map((table) => ({
      name: table.name,
      createSql: table.createSql
    })))) &&
    receipt.foreignKeyRoot === sha256(canonicalJson(normalizedTables.map((table) => ({
      name: table.name,
      foreignKeys: table.foreignKeys
    })))) &&
    receipt.rowCountRoot === sha256(canonicalJson(normalizedTables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount
    }))));
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
  body: Omit<CensusControllerResult, "resultHash">
): CensusControllerResult {
  return { ...body, resultHash: sha256(canonicalJson(body)) };
}

function createDispatchCompletion(input: {
  qualificationEligible: boolean;
  attemptId: string;
  intentBytesSha256: string;
  responseBytesSha256: string;
  resultBytesSha256: string;
  recordedAt: string;
}): Record<string, unknown> {
  const body = {
    version: "engine-os.os01-staging-census-dispatch-completion.v1",
    status: "sealed_after_authority_verification",
    qualificationId: STAGING_CENSUS_ID,
    controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
    qualificationEligible: input.qualificationEligible,
    attemptId: input.attemptId,
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
    "recordedAt", "responseBytesSha256", "resultBytesSha256", "retryAllowed", "status", "version"
  ])) return null;
  return completion.version === "engine-os.os01-staging-census-dispatch-completion.v1" &&
    completion.status === "sealed_after_authority_verification" &&
    completion.qualificationId === STAGING_CENSUS_ID &&
    completion.controllerAuthorityId === STAGING_CENSUS_CONTROLLER_ID &&
    completion.qualificationEligible === qualificationEligible && typeof completion.attemptId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(completion.attemptId) &&
    validHex(completion.intentBytesSha256) && validHex(completion.responseBytesSha256) &&
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

async function runControllerCore(input: ControllerCoreInput): Promise<CensusControllerResult> {
  const paths = artifactPaths(input.root);
  const rootBefore = rootIdentity(paths.root);
  const authorityArtifact = readPrivateArtifact(paths.authority);
  const authority = parseJson(authorityArtifact.bytes, "controller authority");
  if (!validateAuthority(authority, paths.root, input.qualificationEligible)) {
    throw new Error("controller authority is invalid");
  }
  const preArtifact = readPrivateArtifact(paths.preObservation);
  const pre = parseJson(preArtifact.bytes, "control-plane pre-observation");
  if (!validateObservation(pre, "pre")) throw new Error("control-plane pre-observation is invalid");
  if ([
    paths.intent, paths.response, paths.attemptResult, paths.dispatchCompletion, paths.terminalFence,
    paths.postObservation, paths.finalizationIntent, paths.finalReceipt
  ]
    .some((path) => existsSync(path))) {
    throw new Error("canonical controller authority has already been consumed or postchecked");
  }
  if (!input.authorizationToken || /[\r\n]/u.test(input.authorizationToken)) {
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
    version: "engine-os.os01-staging-census-controller-intent.v2",
    status: "reserved_before_transport_no_retry",
    qualificationId: STAGING_CENSUS_ID,
    qualificationEligible: input.qualificationEligible,
    attemptId,
    controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
    authorityBytesSha256: sha256(authorityArtifact.bytes),
    authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
    authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
    projectId: STAGING_CENSUS_SEMANTIC_CONTRACT.projectId,
    origin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
    method: STAGING_CENSUS_SEMANTIC_CONTRACT.method,
    route: STAGING_CENSUS_SEMANTIC_CONTRACT.route,
    contentType: STAGING_CENSUS_SEMANTIC_CONTRACT.contentType,
    requestBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256,
    preObservationBytesSha256: sha256(preArtifact.bytes),
    credentialKind: "ephemeral_sites_siwe_not_persisted",
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
        STAGING_CENSUS_SEMANTIC_CONTRACT.origin + STAGING_CENSUS_SEMANTIC_CONTRACT.route,
        {
          method: STAGING_CENSUS_SEMANTIC_CONTRACT.method,
          headers: {
            Authorization: "Bearer " + input.authorizationToken,
            "Content-Type": STAGING_CENSUS_SEMANTIC_CONTRACT.contentType
          },
          body: STAGING_CENSUS_EXACT_BODY,
          redirect: "error"
        }
      ));
    } catch {
      const terminal = resultWithHash({
        version: "engine-os.os01-staging-census-controller-result.v2",
        status: "terminal_transport_uncertain",
        qualificationId: STAGING_CENSUS_ID,
        controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
        qualificationEligible: input.qualificationEligible,
        attemptId,
        authorityBytesSha256: sha256(authorityArtifact.bytes),
        authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
        authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
        preObservationBytesSha256: sha256(preArtifact.bytes),
        requestBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256,
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
    let bytes: Uint8Array;
    try {
      bytes = await readBoundedResponse(response);
    } catch {
      const terminal = resultWithHash({
        version: "engine-os.os01-staging-census-controller-result.v2",
        status: "terminal_transport_uncertain",
        qualificationId: STAGING_CENSUS_ID,
        qualificationEligible: input.qualificationEligible,
        attemptId,
        controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
        authorityBytesSha256: sha256(authorityArtifact.bytes),
        authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
        authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
        preObservationBytesSha256: sha256(preArtifact.bytes),
        requestBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256,
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
    const reflected = new TextDecoder().decode(bytes).includes(input.authorizationToken);
    const valid = !reflected && response.status === 200 &&
      response.headers.get("content-type")?.toLowerCase() === "application/json" &&
      validateResponse(bytes, input.responseValidation);
    if (valid) writeDescriptor(responseReserved.descriptor, bytes);
    const status = reflected ? "terminal_credential_reflection" :
      valid ? "pending_control_plane_postcheck" : "terminal_invalid_response";
    const result = resultWithHash({
      version: "engine-os.os01-staging-census-controller-result.v2",
      status,
      qualificationId: STAGING_CENSUS_ID,
      qualificationEligible: input.qualificationEligible,
      attemptId,
      controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
      authorityBytesSha256: sha256(authorityArtifact.bytes),
      authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
      authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
      preObservationBytesSha256: sha256(preArtifact.bytes),
      requestBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256,
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
      responseHash: valid ? responseHash : sha256(new Uint8Array()),
      responseSize: valid ? bytes.byteLength : 0,
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
        version: "engine-os.os01-staging-census-controller-result.v2",
        status: "terminal_artifact_authority_violation",
        qualificationId: STAGING_CENSUS_ID,
        controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
        qualificationEligible: input.qualificationEligible,
        attemptId,
        authorityBytesSha256: sha256(authorityArtifact.bytes),
        authorityRootIdentitySha256: rootIdentitySha256(rootBefore),
        authorityFileIdentitySha256: fileIdentitySha256(authorityArtifact.identity),
        preObservationBytesSha256: sha256(preArtifact.bytes),
        requestBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256,
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
        version: "engine-os.os01-staging-census-terminal-fence.v1",
        status: "terminal_artifact_authority_violation",
        qualificationId: STAGING_CENSUS_ID,
        controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
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
    "projectId", "qualificationEligible", "qualificationId", "recordedAt", "requestBodySha256",
    "retryAllowedAfterReservation", "route", "status", "version"
  ])) return null;
  return intent.version === "engine-os.os01-staging-census-controller-intent.v2" &&
    intent.status === "reserved_before_transport_no_retry" && intent.qualificationId === STAGING_CENSUS_ID &&
    intent.controllerAuthorityId === STAGING_CENSUS_CONTROLLER_ID &&
    intent.qualificationEligible === qualificationEligible && typeof intent.attemptId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(intent.attemptId) &&
    validHex(intent.authorityBytesSha256) && validHex(intent.authorityRootIdentitySha256) &&
    validHex(intent.authorityFileIdentitySha256) &&
    intent.projectId === STAGING_CENSUS_SEMANTIC_CONTRACT.projectId &&
    intent.origin === STAGING_CENSUS_SEMANTIC_CONTRACT.origin &&
    intent.method === STAGING_CENSUS_SEMANTIC_CONTRACT.method &&
    intent.route === STAGING_CENSUS_SEMANTIC_CONTRACT.route &&
    intent.contentType === STAGING_CENSUS_SEMANTIC_CONTRACT.contentType &&
    intent.requestBodySha256 === STAGING_CENSUS_EXACT_BODY_SHA256 &&
    validHex(intent.preObservationBytesSha256) &&
    intent.credentialKind === "ephemeral_sites_siwe_not_persisted" &&
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
    "oddsProviderPathInvoked", "preObservationBytesSha256", "qualificationEligible", "qualificationId",
    "quotaPathInvoked", "recordedAt", "requestBodySha256", "responseBytesSha256", "resultHash",
    "retryAllowed", "status", "version"
  ])) return null;
  const statuses = new Set([
    "pending_control_plane_postcheck", "terminal_transport_uncertain", "terminal_invalid_response",
    "terminal_credential_reflection", "terminal_artifact_authority_violation"
  ]);
  return result.version === "engine-os.os01-staging-census-controller-result.v2" &&
    statuses.has(String(result.status)) && result.qualificationId === STAGING_CENSUS_ID &&
    result.controllerAuthorityId === STAGING_CENSUS_CONTROLLER_ID &&
    result.qualificationEligible === qualificationEligible && typeof result.attemptId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(result.attemptId) &&
    validHex(result.authorityBytesSha256) && validHex(result.authorityRootIdentitySha256) &&
    validHex(result.authorityFileIdentitySha256) &&
    validHex(result.preObservationBytesSha256) && result.requestBodySha256 === STAGING_CENSUS_EXACT_BODY_SHA256 &&
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
    throw new Error("staging census finalization authority already consumed");
  }
  const finalizationRecordedAt = now().toISOString();
  const finalizationBody = {
    version: "engine-os.os01-staging-census-finalization-intent.v1",
    status: "reserved_before_evidence_validation_no_retry",
    qualificationId: STAGING_CENSUS_ID,
    controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
    qualificationEligible,
    canonicalRoot: resolve(root),
    retryAllowed: false,
    recordedAt: finalizationRecordedAt
  };
  const finalizationIntent = hashedBody(finalizationBody, "finalizationIntentHash");
  durableExclusiveJson(paths.finalizationIntent, finalizationIntent);
  const finalizationArtifact = readPrivateArtifact(paths.finalizationIntent);
  const expectedFinalizationBytes = new TextEncoder().encode(JSON.stringify(finalizationIntent, null, 2) + "\n");
  if (sha256(finalizationArtifact.bytes) !== sha256(expectedFinalizationBytes)) {
    throw new Error("staging census finalization intent changed after reservation");
  }
  if (existsSync(paths.terminalFence)) {
    throw new Error("staging census dispatch is terminally fenced");
  }
  const authorityArtifact = readPrivateArtifact(paths.authority);
  const preArtifact = readPrivateArtifact(paths.preObservation);
  const postArtifact = readPrivateArtifact(paths.postObservation);
  const intentArtifact = readPrivateArtifact(paths.intent);
  const responseArtifact = readPrivateArtifact(paths.response);
  const resultArtifact = readPrivateArtifact(paths.attemptResult);
  const completionArtifact = readPrivateArtifact(paths.dispatchCompletion);
  const authority = parseJson(authorityArtifact.bytes, "controller authority");
  const pre = parseJson(preArtifact.bytes, "control-plane pre-observation");
  const post = parseJson(postArtifact.bytes, "control-plane post-observation");
  const intent = validateIntentRecord(intentArtifact.bytes, qualificationEligible);
  const result = validateResultRecord(resultArtifact.bytes, qualificationEligible);
  const completion = validateDispatchCompletion(completionArtifact.bytes, qualificationEligible);
  if (!validateAuthority(authority, root, qualificationEligible) ||
      !validateObservation(pre, "pre") || !validateObservation(post, "post") || !intent || !result ||
      !completion) {
    throw new Error("staging census finalization evidence is invalid");
  }
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
    intent.requestBodySha256 === STAGING_CENSUS_EXACT_BODY_SHA256 &&
    intent.preObservationBytesSha256 === preHash && result.preObservationBytesSha256 === preHash &&
    result.responseBytesSha256 === responseHash && result.httpStatus === 200 && result.retryAllowed === false &&
    result.status === "pending_control_plane_postcheck" && completion.attemptId === intent.attemptId &&
    completion.qualificationId === intent.qualificationId &&
    completion.intentBytesSha256 === sha256(intentArtifact.bytes) &&
    completion.responseBytesSha256 === responseHash &&
    completion.resultBytesSha256 === sha256(resultArtifact.bytes) && completion.retryAllowed === false;
  const workerReceiptVerified = validateResponse(responseArtifact.bytes, responseIdentity);
  const evidenceValid = identitiesMatch && temporalOrderValid && crossRecordBindingsVerified &&
    workerReceiptVerified;
  const accepted = qualificationEligible && evidenceValid;
  const body = {
    version: "engine-os.os01-staging-census-final-receipt.v1",
    status: accepted ? "accepted_read_only_census_after_control_plane_postcheck" :
      qualificationEligible ? "terminal_control_plane_or_evidence_mismatch" :
        evidenceValid ? "test_only_postcheck_verified" : "test_only_postcheck_rejected",
    qualificationId: STAGING_CENSUS_ID,
    controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
    qualificationEligible,
    authorityVerified: authorityBindingVerified,
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
    retryAllowed: false,
    providerSecretRead: false,
    oddsProviderPathInvoked: false,
    quotaPathInvoked: false,
    databaseMutationAuthorized: false,
    claimBoundary: "isolated_staging_read_only_census_only_not_os01_acceptance",
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
  if (existsSync(paths.terminalFence)) throw new Error("staging census dispatch became terminally fenced");
  durableExclusiveJson(paths.finalReceipt, receipt);
  return receipt;
}

export function initializeOs01StagingCensusControllerAuthority(): string {
  if (existsSync(STAGING_CENSUS_CONTROLLER_ROOT)) throw new Error("canonical census controller root already exists");
  mkdirSync(STAGING_CENSUS_CONTROLLER_ROOT, { mode: 0o700 });
  rootIdentity(STAGING_CENSUS_CONTROLLER_ROOT);
  syncDirectory(dirname(STAGING_CENSUS_CONTROLLER_ROOT));
  initializeAuthorityArtifact(STAGING_CENSUS_CONTROLLER_ROOT, true, () => new Date());
  return STAGING_CENSUS_CONTROLLER_ROOT;
}

export function writeOs01StagingCensusControlPlaneObservation(
  input: ControlPlaneObservationInput
): ControlPlaneObservationWriteResult {
  if (resolve(STAGING_CENSUS_CONTROLLER_ROOT) !== STAGING_CENSUS_CONTROLLER_ROOT ||
      basename(STAGING_CENSUS_CONTROLLER_ROOT) !== "engine-os-os01-staging-census-" +
        STAGING_CENSUS_CONTROLLER_ID) {
    throw new Error("canonical staging census controller root is invalid");
  }
  return writeControlPlaneObservationCore(STAGING_CENSUS_CONTROLLER_ROOT, true, input);
}

export async function runOs01StagingCensusController(input: {
  authorizationToken: string;
}): Promise<CensusControllerResult> {
  if (resolve(STAGING_CENSUS_CONTROLLER_ROOT) !== STAGING_CENSUS_CONTROLLER_ROOT ||
      basename(STAGING_CENSUS_CONTROLLER_ROOT) !== "engine-os-os01-staging-census-" +
        STAGING_CENSUS_CONTROLLER_ID) {
    throw new Error("canonical staging census controller root is invalid");
  }
  return runControllerCore({
    root: STAGING_CENSUS_CONTROLLER_ROOT,
    qualificationEligible: true,
    authorizationToken: input.authorizationToken,
    transport: fetch,
    now: () => new Date(),
    responseValidation: {
      catalogHash: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
      catalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
      userTableCount: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount
    }
  });
}

export function finalizeOs01StagingCensusController(): Record<string, unknown> {
  return finalizeCore(STAGING_CENSUS_CONTROLLER_ROOT, true, () => new Date(), {
    catalogHash: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
    catalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
    userTableCount: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount
  });
}

type ControllerCliOperations = {
  initialize: () => string;
  writeObservation: (input: ControlPlaneObservationInput) => ControlPlaneObservationWriteResult;
  run: (input: { authorizationToken: string }) => Promise<CensusControllerResult>;
  finalize: () => Record<string, unknown>;
};

async function executeControllerCli(
  action: string | undefined,
  readStdin: () => Uint8Array | string,
  operations: ControllerCliOperations
): Promise<{ stdout: string; exitCode: number }> {
  if (action === "init") return { stdout: operations.initialize() + "\n", exitCode: 0 };
  if (action === "write-pre-observation" || action === "write-post-observation") {
    const phase = action === "write-pre-observation" ? "pre" : "post";
    const input = parseControlPlaneObservationInput(readStdin(), phase);
    const result = operations.writeObservation(input);
    return { stdout: result.phase + ":" + result.observationHash + "\n", exitCode: 0 };
  }
  if (action === "run") {
    const tokenBytes = readStdin();
    const token = (typeof tokenBytes === "string" ? tokenBytes : Buffer.from(tokenBytes).toString("utf8"))
      .trimEnd();
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
      exitCode: receipt.status === "accepted_read_only_census_after_control_plane_postcheck" ? 0 : 1
    };
  }
  throw new Error("expected --action init, write-pre-observation, run, write-post-observation, or finalize");
}

export const os01StagingCensusControllerTestOnly = Object.freeze({
  initialize(root: string, now: () => Date = () => new Date()): void {
    rootIdentity(root);
    initializeAuthorityArtifact(root, false, now);
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
    transport: CensusTransport;
    now?: () => Date;
    responseValidation: ResponseValidationIdentity;
  }): Promise<CensusControllerResult> {
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
      catalogHash: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
      catalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
      userTableCount: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount
    }
  ): Record<string, unknown> {
    return finalizeCore(root, false, now, responseValidation);
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[process.argv.indexOf("--action") + 1];
  const result = await executeControllerCli(action, () => readFileSync(0), {
    initialize: initializeOs01StagingCensusControllerAuthority,
    writeObservation: writeOs01StagingCensusControlPlaneObservation,
    run: runOs01StagingCensusController,
    finalize: finalizeOs01StagingCensusController
  });
  process.stdout.write(result.stdout);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
