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
  STAGING_CENSUS_CONTROLLER_ROOT,
  STAGING_CENSUS_EXACT_BODY,
  STAGING_CENSUS_EXACT_BODY_SHA256,
  STAGING_CENSUS_ID,
  STAGING_CENSUS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-census/contract";

const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;

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
  preObservation: string;
  intent: string;
  response: string;
  attemptResult: string;
  postObservation: string;
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
    preObservation: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.preObservation),
    intent: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.intent),
    response: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.response),
    attemptResult: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.attemptResult),
    postObservation: resolve(root, STAGING_CENSUS_ARTIFACT_NAMES.postObservation),
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

function sameRootIdentity(left: ArtifactIdentity, right: ArtifactIdentity): boolean {
  return left.device === right.device && left.inode === right.inode && left.mode === right.mode;
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

function readPrivateBytes(path: string): Uint8Array {
  privateFileIdentity(path);
  return new Uint8Array(readFileSync(path));
}

function hashedBody<T extends Record<string, unknown>>(body: T, key: string): T & Record<string, string> {
  return { ...body, [key]: sha256(canonicalJson(body)) };
}

export function createOs01StagingCensusControlPlaneObservation(
  input: ControlPlaneObservationInput
): Record<string, unknown> {
  const body = {
    version: "engine-os.os01-staging-census-control-plane-observation.v1",
    phase: input.phase,
    qualificationId: STAGING_CENSUS_ID,
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
    "access", "bindings", "deployment", "environment", "exclusiveHostAssumption", "observationHash",
    "origin", "package", "phase", "projectId", "qualificationId", "recordedAt", "source", "version"
  ]) || !validHex(observation.observationHash)) return false;
  const body = { ...observation };
  delete body.observationHash;
  if (sha256(canonicalJson(body)) !== observation.observationHash ||
      observation.version !== "engine-os.os01-staging-census-control-plane-observation.v1" ||
      observation.phase !== phase || observation.qualificationId !== STAGING_CENSUS_ID ||
      observation.projectId !== STAGING_CENSUS_SEMANTIC_CONTRACT.projectId ||
      observation.origin !== STAGING_CENSUS_SEMANTIC_CONTRACT.origin ||
      observation.exclusiveHostAssumption !== "single_owner_no_concurrent_writer_during_controller_window" ||
      typeof observation.recordedAt !== "string" || !Number.isFinite(Date.parse(observation.recordedAt))) {
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
      typeof deploymentRow.deploymentId !== "string" || deploymentRow.status !== "succeeded" ||
      deploymentRow.url !== STAGING_CENSUS_SEMANTIC_CONTRACT.origin ||
      typeof deploymentRow.versionId !== "string" || !Number.isSafeInteger(deploymentRow.versionNumber) ||
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

function verifyRootAndIntent(
  paths: ControllerPaths,
  rootBefore: ArtifactIdentity,
  intentIdentity: ArtifactIdentity
): void {
  if (!sameRootIdentity(rootBefore, rootIdentity(paths.root))) throw new Error("controller root identity changed");
  verifyIdentity(paths.intent, intentIdentity);
}

async function runControllerCore(input: ControllerCoreInput): Promise<CensusControllerResult> {
  const paths = artifactPaths(input.root);
  const rootBefore = rootIdentity(paths.root);
  const preBytes = readPrivateBytes(paths.preObservation);
  let pre: unknown;
  try {
    pre = JSON.parse(new TextDecoder().decode(preBytes));
  } catch {
    throw new Error("control-plane pre-observation is not JSON");
  }
  if (!validateObservation(pre, "pre")) throw new Error("control-plane pre-observation is invalid");
  if (!input.authorizationToken || /[\r\n]/u.test(input.authorizationToken)) {
    throw new Error("one ephemeral Sites authorization token is required");
  }
  const attemptId = randomUUID();
  const intentBody = {
    version: "engine-os.os01-staging-census-controller-intent.v2",
    status: "reserved_before_transport_no_retry",
    qualificationId: STAGING_CENSUS_ID,
    qualificationEligible: input.qualificationEligible,
    attemptId,
    projectId: STAGING_CENSUS_SEMANTIC_CONTRACT.projectId,
    origin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
    method: STAGING_CENSUS_SEMANTIC_CONTRACT.method,
    route: STAGING_CENSUS_SEMANTIC_CONTRACT.route,
    contentType: STAGING_CENSUS_SEMANTIC_CONTRACT.contentType,
    requestBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256,
    preObservationBytesSha256: sha256(preBytes),
    credentialKind: "ephemeral_sites_siwe_not_persisted",
    retryAllowedAfterReservation: false,
    controlPlanePostcheckRequired: true,
    exclusiveHostAssumption: "single_owner_no_concurrent_writer_during_controller_window",
    recordedAt: input.now().toISOString()
  };
  const intent = hashedBody(intentBody, "intentHash");
  let intentReserved: ReturnType<typeof reserveArtifact> | null = null;
  let responseReserved: ReturnType<typeof reserveArtifact> | null = null;
  let resultReserved: ReturnType<typeof reserveArtifact> | null = null;
  try {
    intentReserved = reserveArtifact(paths.intent);
    responseReserved = reserveArtifact(paths.response);
    resultReserved = reserveArtifact(paths.attemptResult);
    writeDescriptor(intentReserved.descriptor, JSON.stringify(intent, null, 2) + "\n");
    fsyncSync(responseReserved.descriptor);
    fsyncSync(resultReserved.descriptor);
    syncDirectory(paths.root);
    verifyRootAndIntent(paths, rootBefore, intentReserved.identity);
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
        qualificationEligible: input.qualificationEligible,
        attemptId,
        preObservationBytesSha256: sha256(preBytes),
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
      writeDescriptor(resultReserved.descriptor, JSON.stringify(terminal, null, 2) + "\n");
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
        preObservationBytesSha256: sha256(preBytes),
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
      writeDescriptor(resultReserved.descriptor, JSON.stringify(terminal, null, 2) + "\n");
      return terminal;
    }
    verifyRootAndIntent(paths, rootBefore, intentReserved.identity);
    const responseHash = sha256(bytes);
    const reflected = new TextDecoder().decode(bytes).includes(input.authorizationToken);
    if (!reflected) writeDescriptor(responseReserved.descriptor, bytes);
    const valid = !reflected && response.status === 200 &&
      response.headers.get("content-type")?.toLowerCase() === "application/json" &&
      validateResponse(bytes, input.responseValidation);
    const status = reflected ? "terminal_credential_reflection" :
      valid ? "pending_control_plane_postcheck" : "terminal_invalid_response";
    const result = resultWithHash({
      version: "engine-os.os01-staging-census-controller-result.v2",
      status,
      qualificationId: STAGING_CENSUS_ID,
      qualificationEligible: input.qualificationEligible,
      attemptId,
      preObservationBytesSha256: sha256(preBytes),
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
    writeDescriptor(resultReserved.descriptor, JSON.stringify(result, null, 2) + "\n");
    verifyRootAndIntent(paths, rootBefore, intentReserved.identity);
    return result;
  } catch (error) {
    if (resultReserved) {
      const terminal = resultWithHash({
        version: "engine-os.os01-staging-census-controller-result.v2",
        status: "terminal_artifact_authority_violation",
        qualificationId: STAGING_CENSUS_ID,
        qualificationEligible: input.qualificationEligible,
        attemptId,
        preObservationBytesSha256: sha256(preBytes),
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
        writeDescriptor(resultReserved.descriptor, JSON.stringify(terminal, null, 2) + "\n");
      } catch {
        // The durable intent remains the terminal no-retry evidence.
      }
    }
    throw error;
  } finally {
    for (const reserved of [intentReserved, responseReserved, resultReserved]) {
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

function finalizeCore(root: string, qualificationEligible: boolean, now: () => Date): Record<string, unknown> {
  const paths = artifactPaths(root);
  const rootBefore = rootIdentity(root);
  if (existsSync(paths.finalReceipt)) throw new Error("staging census final receipt already exists");
  const preBytes = readPrivateBytes(paths.preObservation);
  const postBytes = readPrivateBytes(paths.postObservation);
  const intentBytes = readPrivateBytes(paths.intent);
  const responseBytes = readPrivateBytes(paths.response);
  const resultBytes = readPrivateBytes(paths.attemptResult);
  let pre: unknown;
  let post: unknown;
  try {
    pre = JSON.parse(new TextDecoder().decode(preBytes));
    post = JSON.parse(new TextDecoder().decode(postBytes));
  } catch {
    throw new Error("control-plane observation is not JSON");
  }
  const intent = parseHashedRecord(intentBytes, "intentHash");
  const result = parseHashedRecord(resultBytes, "resultHash");
  if (!validateObservation(pre, "pre") || !validateObservation(post, "post") || !intent || !result) {
    throw new Error("staging census finalization evidence is invalid");
  }
  const identitiesMatch = observationIdentity(pre) === observationIdentity(post);
  const responseIdentity = {
    catalogHash: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
    catalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
    userTableCount: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount
  };
  const accepted = qualificationEligible && identitiesMatch &&
    intent.qualificationEligible === true && result.qualificationEligible === true &&
    result.status === "pending_control_plane_postcheck" &&
    result.preObservationBytesSha256 === sha256(preBytes) &&
    result.responseBytesSha256 === sha256(responseBytes) &&
    validateResponse(responseBytes, responseIdentity);
  const body = {
    version: "engine-os.os01-staging-census-final-receipt.v1",
    status: accepted ? "accepted_read_only_census_after_control_plane_postcheck" :
      qualificationEligible ? "terminal_control_plane_or_evidence_mismatch" : "test_only_postcheck_verified",
    qualificationId: STAGING_CENSUS_ID,
    qualificationEligible,
    identitiesMatch,
    artifacts: {
      preObservationBytesSha256: sha256(preBytes),
      intentBytesSha256: sha256(intentBytes),
      responseBytesSha256: sha256(responseBytes),
      attemptResultBytesSha256: sha256(resultBytes),
      postObservationBytesSha256: sha256(postBytes)
    },
    exactSourceDeploymentAccessEnvironmentAndBindingsMatch: identitiesMatch,
    workerReadOnlyReceiptVerified: validateResponse(responseBytes, responseIdentity),
    retryAllowed: false,
    providerSecretRead: false,
    oddsProviderPathInvoked: false,
    quotaPathInvoked: false,
    databaseMutationAuthorized: false,
    claimBoundary: "isolated_staging_read_only_census_only_not_os01_acceptance",
    recordedAt: now().toISOString()
  };
  const receipt = hashedBody(body, "finalReceiptHash");
  if (!sameRootIdentity(rootBefore, rootIdentity(root))) throw new Error("controller root identity changed");
  durableExclusiveJson(paths.finalReceipt, receipt);
  return receipt;
}

export function initializeOs01StagingCensusControllerAuthority(): string {
  if (existsSync(STAGING_CENSUS_CONTROLLER_ROOT)) throw new Error("canonical census controller root already exists");
  mkdirSync(STAGING_CENSUS_CONTROLLER_ROOT, { mode: 0o700 });
  rootIdentity(STAGING_CENSUS_CONTROLLER_ROOT);
  syncDirectory(dirname(STAGING_CENSUS_CONTROLLER_ROOT));
  return STAGING_CENSUS_CONTROLLER_ROOT;
}

export async function runOs01StagingCensusController(input: {
  authorizationToken: string;
  transport?: CensusTransport;
  now?: () => Date;
}): Promise<CensusControllerResult> {
  if (resolve(STAGING_CENSUS_CONTROLLER_ROOT) !== STAGING_CENSUS_CONTROLLER_ROOT ||
      basename(STAGING_CENSUS_CONTROLLER_ROOT) !== "engine-os-os01-staging-census-" + STAGING_CENSUS_ID) {
    throw new Error("canonical staging census controller root is invalid");
  }
  return runControllerCore({
    root: STAGING_CENSUS_CONTROLLER_ROOT,
    qualificationEligible: true,
    authorizationToken: input.authorizationToken,
    transport: input.transport ?? fetch,
    now: input.now ?? (() => new Date()),
    responseValidation: {
      catalogHash: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
      catalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
      userTableCount: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount
    }
  });
}

export function finalizeOs01StagingCensusController(now: () => Date = () => new Date()): Record<string, unknown> {
  return finalizeCore(STAGING_CENSUS_CONTROLLER_ROOT, true, now);
}

export const os01StagingCensusControllerTestOnly = Object.freeze({
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
  finalize(root: string, now: () => Date = () => new Date()): Record<string, unknown> {
    return finalizeCore(root, false, now);
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[process.argv.indexOf("--action") + 1];
  if (action === "init") {
    process.stdout.write(initializeOs01StagingCensusControllerAuthority() + "\n");
  } else if (action === "run") {
    const token = readFileSync(0, "utf8").trimEnd();
    const result = await runOs01StagingCensusController({ authorizationToken: token });
    process.stdout.write(result.status + "\n");
    if (result.status !== "pending_control_plane_postcheck") process.exitCode = 1;
  } else if (action === "finalize") {
    const receipt = finalizeOs01StagingCensusController();
    process.stdout.write(String(receipt.status) + "\n");
    if (receipt.status !== "accepted_read_only_census_after_control_plane_postcheck") process.exitCode = 1;
  } else {
    throw new Error("expected --action init, run, or finalize");
  }
}
