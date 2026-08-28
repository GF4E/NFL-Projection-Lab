import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

import {
  os01ControlPlaneContract,
  type AccessProjection,
  type DeploymentProjection,
  type EnvironmentProjection,
  type VersionProjection,
  validateEnvironmentLifecycle,
  validatePublicProductionAccess
} from "./os01-control-plane-evidence";

type JsonRecord = Record<string, unknown>;

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_EVIDENCE_BYTES = 16 * 1024 * 1024;
const EXPECTED_PHASES = [
  "session_lock_acquired",
  "source_anchor_ready",
  "deployment_archive_ready",
  "external_mutation_armed",
  "session_rejected_cleanup_required"
] as const;
const TEMPORARY_CONTROLS = [...os01ControlPlaneContract.temporaryControls].sort(compareCodePoints);

export type Os01RejectedSessionRecoveryAuthority = {
  version: "os01-rejected-session-recovery-authority.2026.1";
  status: "authorized_exact_rejected_session_recovery";
  targetProjectId: string;
  targetOrigin: string;
  runId: string;
  seedCommitment: string;
  sourceAnchor: string;
  authorityCommit: string;
  implementationCommit: string;
  expectedFailurePhase: string;
  expectedLastCommandHash: string | null;
  productionSessionLockIdentityHash: string;
  lock: {
    bytesSha256: string;
    device: string;
    inode: string;
    mode: 384;
  };
  artifacts: {
    rejectionReceiptBytesSha256: string;
    phaseLedgerBytesSha256: string;
    externalMutationIntentBytesSha256: string;
    manualCleanupBytesSha256: string;
    manualHttpBytesSha256: string;
  };
  source: {
    temporaryCommit: string;
    temporaryTreeObjectId: string;
    cleanCommit: string;
    cleanTreeObjectId: string;
  };
  environment: {
    beforeRevision: number;
    stagedRevision: number;
    afterRevision: number;
    stagedAllMetadataRoot: string;
    cleanAllMetadataRoot: string;
  };
  access: {
    revision: number;
    principalRoot: string;
  };
  cleanVersion: {
    versionId: string;
    versionNumber: number;
  };
  cleanDeploymentId: string;
  httpBodySha256: {
    sunday: string;
    censusGet: string;
    censusPost: string;
  };
  providerStateRoot: string;
  authorityHash: string;
};

export type Os01RejectedSessionManualCleanupEvidence = {
  version: "os01-rejected-session-manual-cleanup.2026.1";
  status: "verified_manual_cleanup_provider_zero";
  runId: string;
  targetProjectId: string;
  targetOrigin: string;
  productionSessionLockIdentityHash: string;
  externalMutationIntentHash: string;
  sourceRestoration: {
    branch: "main";
    preRestoreHead: string;
    preRestoreTreeObjectId: string;
    expectedOldHead: string;
    restoredHead: string;
    postRestoreHead: string;
    postRestoreTreeObjectId: string;
    remoteReadbackHead: string;
    remoteReadbackTreeObjectId: string;
    compareAndSwapApplied: true;
    projectionComplete: true;
    observedAt: string;
    remoteReadbackObservedAt: string;
  };
  environment: {
    before: EnvironmentProjection;
    staged: EnvironmentProjection;
    after: EnvironmentProjection;
  };
  access: {
    before: AccessProjection;
    after: AccessProjection;
  };
  cleanVersion: VersionProjection;
  cleanDeployment: DeploymentProjection;
  bindings: {
    projectId: string;
    d1Bindings: ["DB"];
    r2Bindings: ["EVIDENCE"];
    projectionComplete: true;
    observedAt: string;
  };
  providerState: {
    source: "production_d1_read_only_quota_metadata";
    projectionComplete: true;
    used: 38;
    remaining: 462;
    lastCost: 0;
    outstandingReservations: 0;
    stateRoot: string;
    observedAt: string;
  };
  providerActivity: {
    providerSecretReads: 0;
    providerRequests: 0;
    quotaReservations: 0;
  };
  manualHttpBytesSha256: string;
  observedAt: string;
  receiptHash: string;
};

export type Os01RejectedSessionRecoveryReceipt = {
  version: "os01-rejected-session-recovery.2026.1";
  status: "expired_rejected_session_lock_recovered_after_verified_manual_cleanup";
  recoveryId: string;
  authorityHash: string;
  runId: string;
  targetProjectId: string;
  targetOrigin: string;
  originalSessionStatus: "rejected_cleanup_required";
  originalSessionAcceptanceEffect: "none_rejection_preserved";
  productionSessionLockIdentityHash: string;
  externalMutationIntentHash: string;
  originalLock: {
    bytesSha256: string;
    device: string;
    inode: string;
    mode: 384;
    expiredAt: string;
  };
  evidence: Os01RejectedSessionRecoveryAuthority["artifacts"];
  cleanSourceCommit: string;
  cleanSourceTreeObjectId: string;
  cleanVersionId: string;
  cleanDeploymentId: string;
  environmentRevisionAfter: number;
  providerStateRoot: string;
  providerSecretReads: 0;
  providerRequests: 0;
  quotaReservations: 0;
  recoveredAt: string;
  recoveryReceiptHash: string;
};

export type Os01RejectedSessionRecoveryFaultInjection = Readonly<{
  afterConflictGuardAcquired?: () => void;
  afterEvidenceRevalidation?: () => void;
  afterReceiptStaged?: () => void;
  afterLockOwnershipCheck?: () => void;
  afterLockDetach?: () => void;
  beforeReceiptPublication?: () => void;
  afterReceiptPublication?: () => void;
  afterGuardOwnershipCheck?: () => void;
  afterGuardDetach?: () => void;
}>;

export type Os01RejectedSessionRecoveryInput = {
  lockPath: string;
  recoveryReceiptPath: string;
  rejectionReceiptPath: string;
  phaseLedgerPath: string;
  externalMutationIntentPath: string;
  manualCleanupPath: string;
  manualHttpPath: string;
  authority: Os01RejectedSessionRecoveryAuthority;
  recoveredAt?: string;
  faultInjection?: Os01RejectedSessionRecoveryFaultInjection;
};

function compareCodePoints(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0)!);
  const rightPoints = [...right].map((value) => value.codePointAt(0)!);
  const shared = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < shared; index += 1) {
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
  throw new Error("OS-01R evidence contains an unsupported value");
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as JsonRecord;
}

function exactKeys(value: unknown, expected: readonly string[], label: string): JsonRecord {
  const result = record(value, label);
  if (stableJson(Object.keys(result).sort(compareCodePoints)) !== stableJson([...expected].sort(compareCodePoints))) {
    throw new Error(`${label} contains unexpected fields`);
  }
  return result;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

function hex(value: unknown, label: string): string {
  const result = text(value, label);
  if (!SHA256.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} is invalid`);
  return result;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${label} is invalid`);
  return Number(value);
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function canonicalPath(pathInput: string, label: string): string {
  const path = resolve(pathInput);
  if (realpathSync(dirname(path)) !== dirname(path)) throw new Error(`${label} parent is not canonical`);
  return path;
}

function fsyncParent(path: string): void {
  const descriptor = openSync(dirname(path), "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

class ImmutableFileSnapshot {
  readonly path: string;
  readonly bytes: Buffer;
  readonly device: bigint;
  readonly inode: bigint;
  readonly mode: number;
  #descriptor: number;

  private constructor(path: string, bytes: Buffer, descriptor: number, device: bigint, inode: bigint, mode: number) {
    this.path = path;
    this.bytes = bytes;
    this.#descriptor = descriptor;
    this.device = device;
    this.inode = inode;
    this.mode = mode;
  }

  static open(pathInput: string, label: string): ImmutableFileSnapshot {
    const path = canonicalPath(pathInput, label);
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    const descriptor = openSync(path, constants.O_RDONLY | noFollow);
    try {
      const descriptorMetadata = fstatSync(descriptor, { bigint: true });
      const pathMetadata = lstatSync(path, { bigint: true });
      if (
        !descriptorMetadata.isFile() || !pathMetadata.isFile() || pathMetadata.isSymbolicLink() ||
        descriptorMetadata.dev !== pathMetadata.dev || descriptorMetadata.ino !== pathMetadata.ino ||
        (descriptorMetadata.mode & 0o777n) !== 0o600n || (pathMetadata.mode & 0o777n) !== 0o600n ||
        descriptorMetadata.size < 1n || descriptorMetadata.size > BigInt(MAX_EVIDENCE_BYTES) ||
        realpathSync(path) !== path
      ) throw new Error(`${label} metadata is invalid`);
      const bytes = Buffer.alloc(Number(descriptorMetadata.size));
      let offset = 0;
      while (offset < bytes.byteLength) {
        const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
        if (count < 1) throw new Error(`${label} read did not advance`);
        offset += count;
      }
      const snapshot = new ImmutableFileSnapshot(
        path,
        bytes,
        descriptor,
        descriptorMetadata.dev,
        descriptorMetadata.ino,
        Number(descriptorMetadata.mode & 0o777n)
      );
      snapshot.assertUnchanged(label);
      return snapshot;
    } catch (error: unknown) {
      closeSync(descriptor);
      throw error;
    }
  }

  assertUnchanged(label: string): void {
    if (this.#descriptor < 0) throw new Error(`${label} descriptor is unavailable`);
    const descriptorMetadata = fstatSync(this.#descriptor, { bigint: true });
    const pathMetadata = lstatSync(this.path, { bigint: true });
    if (
      !descriptorMetadata.isFile() || !pathMetadata.isFile() || pathMetadata.isSymbolicLink() ||
      descriptorMetadata.dev !== this.device || descriptorMetadata.ino !== this.inode ||
      pathMetadata.dev !== this.device || pathMetadata.ino !== this.inode ||
      Number(descriptorMetadata.mode & 0o777n) !== this.mode || Number(pathMetadata.mode & 0o777n) !== this.mode ||
      descriptorMetadata.size !== BigInt(this.bytes.byteLength) || realpathSync(this.path) !== this.path
    ) throw new Error(`${label} changed after inspection`);
    const current = Buffer.alloc(this.bytes.byteLength);
    try {
      let offset = 0;
      while (offset < current.byteLength) {
        const count = readSync(this.#descriptor, current, offset, current.byteLength - offset, offset);
        if (count < 1) throw new Error(`${label} changed after inspection`);
        offset += count;
      }
      if (sha256(current) !== sha256(this.bytes)) throw new Error(`${label} changed after inspection`);
    } finally {
      current.fill(0);
    }
  }

  close(): void {
    if (this.#descriptor >= 0) closeSync(this.#descriptor);
    this.#descriptor = -1;
    this.bytes.fill(0);
  }
}

function validateAuthority(authority: Os01RejectedSessionRecoveryAuthority): void {
  exactKeys(authority, [
    "access", "artifacts", "authorityCommit", "authorityHash", "cleanDeploymentId", "cleanVersion",
    "environment", "expectedFailurePhase", "expectedLastCommandHash", "httpBodySha256",
    "implementationCommit", "lock", "productionSessionLockIdentityHash", "providerStateRoot", "runId",
    "seedCommitment", "source", "sourceAnchor", "status", "targetOrigin", "targetProjectId", "version"
  ], "OS-01R recovery authority");
  if (
    authority.version !== "os01-rejected-session-recovery-authority.2026.1" ||
    authority.status !== "authorized_exact_rejected_session_recovery" ||
    authority.targetProjectId.length === 0 || !authority.targetOrigin.startsWith("https://") ||
    !UUID_V4.test(authority.runId) || !COMMIT.test(authority.authorityCommit) ||
    !COMMIT.test(authority.implementationCommit) || authority.expectedFailurePhase.length === 0 ||
    (authority.expectedLastCommandHash !== null && !SHA256.test(authority.expectedLastCommandHash)) ||
    authority.lock.mode !== 0o600 || authority.lock.device.length === 0 || authority.lock.inode.length === 0 ||
    !/^\d+$/u.test(authority.lock.device) || !/^\d+$/u.test(authority.lock.inode)
  ) throw new Error("OS-01R recovery authority identity is invalid");
  for (const value of [
    authority.seedCommitment, authority.sourceAnchor, authority.productionSessionLockIdentityHash,
    authority.lock.bytesSha256, ...Object.values(authority.artifacts),
    authority.source.temporaryTreeObjectId, authority.source.cleanTreeObjectId,
    authority.environment.stagedAllMetadataRoot, authority.environment.cleanAllMetadataRoot,
    authority.access.principalRoot, ...Object.values(authority.httpBodySha256), authority.providerStateRoot
  ]) if (!SHA256.test(String(value))) throw new Error("OS-01R recovery authority contains an invalid digest");
  if (
    !COMMIT.test(authority.source.temporaryCommit) || !COMMIT.test(authority.source.cleanCommit) ||
    !Number.isSafeInteger(authority.environment.beforeRevision) ||
    authority.environment.stagedRevision !== authority.environment.beforeRevision + 1 ||
    authority.environment.afterRevision !== authority.environment.beforeRevision + 2 ||
    !Number.isSafeInteger(authority.access.revision) || authority.access.revision < 1 ||
    authority.cleanVersion.versionId.length === 0 || !Number.isSafeInteger(authority.cleanVersion.versionNumber) ||
    authority.cleanVersion.versionNumber < 1 || authority.cleanDeploymentId.length === 0
  ) throw new Error("OS-01R recovery authority boundary is invalid");
  const unsigned = { ...authority } as JsonRecord;
  delete unsigned.authorityHash;
  if (authority.authorityHash !== sha256(stableJson(unsigned))) {
    throw new Error("OS-01R recovery authority hash is invalid");
  }
}

export function os01RejectedSessionRecoveryAuthorityHash(
  authority: Omit<Os01RejectedSessionRecoveryAuthority, "authorityHash">
): string {
  return sha256(stableJson(authority));
}

function validateLock(snapshot: ImmutableFileSnapshot, authority: Os01RejectedSessionRecoveryAuthority): string {
  if (
    snapshot.mode !== authority.lock.mode || snapshot.device.toString() !== authority.lock.device ||
    snapshot.inode.toString() !== authority.lock.inode || sha256(snapshot.bytes) !== authority.lock.bytesSha256
  ) throw new Error("OS-01R production-session lock does not match the authorized inode and bytes");
  const lock = exactKeys(parseJson(snapshot.bytes, "OS-01R production-session lock"), [
    "expiresAt", "lockIdentityHash", "ownerTokenSha256", "runId", "seedCommitment", "startedAt",
    "targetProjectId", "version"
  ], "OS-01R production-session lock");
  if (
    lock.version !== "os01-production-session-lock.2026.1" || lock.targetProjectId !== authority.targetProjectId ||
    lock.runId !== authority.runId || lock.seedCommitment !== authority.seedCommitment ||
    lock.lockIdentityHash !== authority.productionSessionLockIdentityHash
  ) throw new Error("OS-01R production-session lock identity is invalid");
  const startedAt = timestamp(lock.startedAt, "OS-01R lock start");
  const expiresAt = timestamp(lock.expiresAt, "OS-01R lock expiry");
  hex(lock.ownerTokenSha256, "OS-01R lock owner-token hash");
  const base = {
    version: lock.version,
    targetProjectId: lock.targetProjectId,
    runId: lock.runId,
    seedCommitment: lock.seedCommitment,
    startedAt,
    expiresAt,
    ownerTokenSha256: lock.ownerTokenSha256
  };
  if (
    Date.parse(expiresAt) <= Date.parse(startedAt) ||
    sha256(stableJson(base)) !== authority.productionSessionLockIdentityHash ||
    Buffer.from(`${stableJson(lock)}\n`, "utf8").compare(snapshot.bytes) !== 0
  ) throw new Error("OS-01R production-session lock bytes are not canonical");
  return expiresAt;
}

function validatePhaseLedger(
  bytes: Uint8Array,
  authority: Os01RejectedSessionRecoveryAuthority
): { lastEntryHash: string; terminalObservedAt: string } {
  const source = Buffer.from(bytes).toString("utf8");
  if (!source.endsWith("\n")) throw new Error("OS-01R phase ledger is not newline terminated");
  const lines = source.slice(0, -1).split("\n");
  if (lines.length !== 5) throw new Error("OS-01R phase ledger must have exactly five entries");
  let previous = "0".repeat(64);
  let priorTime = -Infinity;
  let lastEntryHash = previous;
  let terminalObservedAt = "";
  for (const [index, line] of lines.entries()) {
    const entry = exactKeys(parseJson(Buffer.from(line, "utf8"), `OS-01R phase ledger entry ${index}`), [
      "entryHash", "observedAt", "phase", "previousEntryHash", "runId", "sequence", "version"
    ], `OS-01R phase ledger entry ${index}`);
    const observedAt = timestamp(entry.observedAt, `OS-01R phase ledger entry ${index} time`);
    const unsigned = {
      version: entry.version,
      runId: entry.runId,
      sequence: entry.sequence,
      phase: entry.phase,
      observedAt,
      previousEntryHash: entry.previousEntryHash
    };
    if (
      entry.version !== "os01-session-phase-ledger-entry.2026.1" || entry.runId !== authority.runId ||
      entry.sequence !== index || entry.phase !== EXPECTED_PHASES[index] || entry.previousEntryHash !== previous ||
      entry.entryHash !== sha256(stableJson(unsigned)) || line !== stableJson(entry) ||
      Date.parse(observedAt) < priorTime
    ) throw new Error(`OS-01R phase ledger entry ${index} is invalid`);
    priorTime = Date.parse(observedAt);
    previous = hex(entry.entryHash, `OS-01R phase ledger entry ${index} hash`);
    lastEntryHash = previous;
    terminalObservedAt = observedAt;
  }
  return { lastEntryHash, terminalObservedAt };
}

function validateIntent(bytes: Uint8Array, authority: Os01RejectedSessionRecoveryAuthority): JsonRecord {
  const intent = exactKeys(parseJson(bytes, "OS-01R external-mutation intent"), [
    "accessBefore", "authorityCommit", "deploymentCommit", "environmentBefore", "implementationCommit",
    "intentHash", "localArchiveBytes", "localArchiveFileCount", "localArchiveFileListRoot",
    "localArchiveSha256", "localPackageContentRoot", "mutationSequence", "observedAt",
    "productionSessionLockIdentityHash", "runId", "seedCommitment", "sourceAnchor", "sourceHeadAfter",
    "sourceHeadBefore", "sourcePushExpectedOld", "status", "targetOrigin", "targetProjectId",
    "temporaryControlAuthSha256", "temporaryControlBuildAttestation",
    "temporaryControlEnvironmentRevisionBefore", "temporaryControlEnvironmentRevisionStaged",
    "temporaryControlExpiresAt", "temporaryControls", "temporaryControlsSingleUpdate", "version"
  ], "OS-01R external-mutation intent");
  const { intentHash, ...unsigned } = intent;
  if (
    intent.version !== "os01-external-mutation-intent.2026.1" ||
    intent.status !== "armed_cleanup_required_before_external_mutation" || intent.runId !== authority.runId ||
    intent.seedCommitment !== authority.seedCommitment || intent.targetProjectId !== authority.targetProjectId ||
    intent.targetOrigin !== authority.targetOrigin || intent.sourceAnchor !== authority.sourceAnchor ||
    intent.authorityCommit !== authority.authorityCommit || intent.implementationCommit !== authority.implementationCommit ||
    intent.deploymentCommit !== authority.source.temporaryCommit ||
    intent.productionSessionLockIdentityHash !== authority.productionSessionLockIdentityHash ||
    intent.sourceHeadBefore !== authority.source.cleanCommit || intent.sourcePushExpectedOld !== authority.source.cleanCommit ||
    intent.sourceHeadAfter !== authority.source.temporaryCommit ||
    intent.temporaryControlEnvironmentRevisionBefore !== authority.environment.beforeRevision ||
    intent.temporaryControlEnvironmentRevisionStaged !== authority.environment.stagedRevision ||
    intent.temporaryControlEnvironmentRevisionStaged !== Number(intent.temporaryControlEnvironmentRevisionBefore) + 1 ||
    intent.temporaryControlsSingleUpdate !== true ||
    stableJson(intent.temporaryControls) !== stableJson(TEMPORARY_CONTROLS) ||
    intentHash !== sha256(stableJson(unsigned))
  ) throw new Error("OS-01R external-mutation intent is invalid");
  timestamp(intent.observedAt, "OS-01R external-mutation intent observation");
  timestamp(intent.temporaryControlExpiresAt, "OS-01R temporary-control expiry");
  for (const value of [
    intent.localArchiveSha256, intent.localArchiveFileListRoot, intent.localPackageContentRoot,
    intent.temporaryControlAuthSha256, intent.temporaryControlBuildAttestation
  ]) hex(value, "OS-01R external-mutation intent digest");
  integer(intent.localArchiveBytes, "OS-01R local archive bytes", 1);
  integer(intent.localArchiveFileCount, "OS-01R local archive file count", 1);
  return intent;
}

function validateRejection(
  bytes: Uint8Array,
  ledgerSha256: string,
  ledger: { lastEntryHash: string; terminalObservedAt: string },
  intent: JsonRecord,
  authority: Os01RejectedSessionRecoveryAuthority
): { rejectedAt: string; intentHash: string } {
  const receipt = exactKeys(parseJson(bytes, "OS-01R rejection receipt"), [
    "authorityCommit", "cleanupVerified", "controlsStaged", "externalMutationArmed",
    "externalMutationIntentHash", "failurePhase", "implementationCommit", "lastCommandHash", "phaseLedger",
    "productionSessionLockDisposition", "productionSessionLockIdentityHash", "productionSessionLockRelease",
    "providerRequests", "providerSecretReads", "quotaReservations", "receiptHash", "rejectedAt", "runId",
    "seedCommitment", "sourceAnchor", "status", "version"
  ], "OS-01R rejection receipt");
  const { receiptHash, ...unsigned } = receipt;
  const phaseLedger = exactKeys(receipt.phaseLedger, [
    "entryCount", "lastEntryHash", "ledgerSha256", "runId", "terminalPhase", "version"
  ], "OS-01R rejection phase-ledger summary");
  if (
    receipt.version !== "os01-private-seed-session-rejection.2026.1" ||
    receipt.status !== "rejected_cleanup_required" || receipt.runId !== authority.runId ||
    receipt.seedCommitment !== authority.seedCommitment || receipt.sourceAnchor !== authority.sourceAnchor ||
    receipt.authorityCommit !== authority.authorityCommit || receipt.implementationCommit !== authority.implementationCommit ||
    receipt.failurePhase !== authority.expectedFailurePhase || receipt.lastCommandHash !== authority.expectedLastCommandHash ||
    receipt.controlsStaged !== true || receipt.externalMutationArmed !== true || receipt.cleanupVerified !== false ||
    receipt.externalMutationIntentHash !== intent.intentHash ||
    receipt.productionSessionLockIdentityHash !== authority.productionSessionLockIdentityHash ||
    receipt.productionSessionLockDisposition !== "retained_for_verified_cleanup" ||
    receipt.productionSessionLockRelease !== null || receipt.providerSecretReads !== 0 || receipt.providerRequests !== 0 ||
    receipt.quotaReservations !== 0 || receiptHash !== sha256(stableJson(unsigned)) ||
    phaseLedger.version !== "os01-session-phase-ledger.2026.1" || phaseLedger.runId !== authority.runId ||
    phaseLedger.entryCount !== 5 || phaseLedger.terminalPhase !== "session_rejected_cleanup_required" ||
    phaseLedger.ledgerSha256 !== ledgerSha256 || phaseLedger.lastEntryHash !== ledger.lastEntryHash
  ) throw new Error("OS-01R rejection receipt is invalid");
  const rejectedAt = timestamp(receipt.rejectedAt, "OS-01R rejection time");
  if (Date.parse(rejectedAt) < Date.parse(ledger.terminalObservedAt)) {
    throw new Error("OS-01R rejection receipt predates its terminal ledger entry");
  }
  return { rejectedAt, intentHash: String(intent.intentHash) };
}

function validateAccess(value: unknown, label: string): AccessProjection {
  exactKeys(value, [
    "accessMode", "allowedAccountUserCount", "allowedUserCount", "currentUserRole", "editorCount",
    "externalVisitorCount", "groupCount", "nonOwnerUserCount", "observedAt", "origin", "ownerRoleCount",
    "principalRoot", "projectId", "revision", "tenantGroupCount", "version", "workspaceGroupCount"
  ], label);
  const result = value as AccessProjection;
  validatePublicProductionAccess(result);
  timestamp(result.observedAt, `${label} observation`);
  hex(result.principalRoot, `${label} principal root`);
  return result;
}

function validateEnvironment(value: unknown, label: string): EnvironmentProjection {
  exactKeys(value, [
    "allMetadataRoot", "captureGatePresent", "controlsAllSecret", "controlsPresent", "entryCount", "observedAt",
    "projectId", "revision", "unrelatedEntryCount", "unrelatedMetadataRoot", "unrelatedValuePreservationBasis",
    "updatedAt", "valueObservation", "version"
  ], label);
  return value as EnvironmentProjection;
}

function validateVersion(value: unknown, label: string): VersionProjection {
  exactKeys(value, [
    "archiveContentHash", "archiveFileCount", "archiveFormat", "archiveSizeBytes", "observedAt", "projectId",
    "sourceCommit", "version", "versionId", "versionNumber"
  ], label);
  const result = value as VersionProjection;
  if (
    result.version !== os01ControlPlaneContract.version || !COMMIT.test(result.sourceCommit) ||
    !/^sha256:[a-f0-9]{64}$/u.test(result.archiveContentHash) ||
    integer(result.archiveFileCount, `${label} file count`, 1) !== result.archiveFileCount ||
    integer(result.archiveSizeBytes, `${label} byte count`, 1) !== result.archiveSizeBytes
  ) throw new Error(`${label} is invalid`);
  timestamp(result.observedAt, `${label} observation`);
  return result;
}

function validateDeployment(value: unknown, label: string): DeploymentProjection {
  exactKeys(value, [
    "deploymentId", "environmentRevision", "observedAt", "origin", "projectId", "status", "type", "updatedAt",
    "version", "versionId"
  ], label);
  const result = value as DeploymentProjection;
  if (
    result.version !== os01ControlPlaneContract.version || result.status !== "succeeded" || result.type !== "publish"
  ) throw new Error(`${label} is invalid`);
  timestamp(result.observedAt, `${label} observation`);
  timestamp(result.updatedAt, `${label} update`);
  return result;
}

function observationsEqualExceptTime(left: JsonRecord, right: JsonRecord): boolean {
  const leftStable = { ...left };
  const rightStable = { ...right };
  delete leftStable.observedAt;
  delete leftStable.updatedAt;
  delete rightStable.observedAt;
  delete rightStable.updatedAt;
  return stableJson(leftStable) === stableJson(rightStable);
}

function validateManualHttp(
  bytes: Uint8Array,
  authority: Os01RejectedSessionRecoveryAuthority,
  notBeforeMs: number,
  notAfterMs: number
): void {
  const value = parseJson(bytes, "OS-01R manual HTTP evidence");
  if (!Array.isArray(value) || value.length !== 3) throw new Error("OS-01R manual HTTP evidence is incomplete");
  const expected = [
    { name: "sunday", method: "GET", url: `${authority.targetOrigin}/sunday`, status: 200,
      digest: authority.httpBodySha256.sunday },
    { name: "census_get", method: "GET", url: `${authority.targetOrigin}/_ops/engine-os/os01-census-v1`, status: 404,
      digest: authority.httpBodySha256.censusGet },
    { name: "census_post", method: "POST", url: `${authority.targetOrigin}/_ops/engine-os/os01-census-v1`, status: 405,
      digest: authority.httpBodySha256.censusPost }
  ] as const;
  for (const [index, item] of value.entries()) {
    const observation = exactKeys(item, [
      "bodyBase64", "bodySha256", "method", "name", "observedAt", "status", "url"
    ], `OS-01R manual HTTP observation ${index}`);
    const contract = expected[index]!;
    const bodyBase64 = text(observation.bodyBase64, `OS-01R ${contract.name} body`);
    const body = Buffer.from(bodyBase64, "base64");
    try {
      const observedAt = timestamp(observation.observedAt, `OS-01R ${contract.name} observation`);
      if (
        body.byteLength === 0 || body.toString("base64") !== bodyBase64 || observation.name !== contract.name ||
        observation.method !== contract.method || observation.url !== contract.url || observation.status !== contract.status ||
        observation.bodySha256 !== sha256(body) || observation.bodySha256 !== contract.digest ||
        Date.parse(observedAt) < notBeforeMs || Date.parse(observedAt) > notAfterMs
      ) throw new Error(`OS-01R ${contract.name} HTTP evidence is invalid`);
    } finally {
      body.fill(0);
    }
  }
}

function validateManualCleanup(
  bytes: Uint8Array,
  authority: Os01RejectedSessionRecoveryAuthority,
  intent: JsonRecord,
  rejectedAt: string,
  manualHttpBytesSha256: string,
  recoveredAt: string
): { observedAt: string; receiptHash: string } {
  const evidence = exactKeys(parseJson(bytes, "OS-01R manual-cleanup evidence"), [
    "access", "bindings", "cleanDeployment", "cleanVersion", "environment", "externalMutationIntentHash",
    "manualHttpBytesSha256", "observedAt", "productionSessionLockIdentityHash", "providerActivity",
    "providerState", "receiptHash", "runId", "sourceRestoration", "status", "targetOrigin", "targetProjectId",
    "version"
  ], "OS-01R manual-cleanup evidence");
  const { receiptHash, ...unsigned } = evidence;
  const observedAt = timestamp(evidence.observedAt, "OS-01R manual-cleanup observation");
  const intentObservedAt = timestamp(intent.observedAt, "OS-01R mutation-intent observation");
  if (
    evidence.version !== "os01-rejected-session-manual-cleanup.2026.1" ||
    evidence.status !== "verified_manual_cleanup_provider_zero" || evidence.runId !== authority.runId ||
    evidence.targetProjectId !== authority.targetProjectId || evidence.targetOrigin !== authority.targetOrigin ||
    evidence.productionSessionLockIdentityHash !== authority.productionSessionLockIdentityHash ||
    evidence.externalMutationIntentHash !== intent.intentHash ||
    evidence.manualHttpBytesSha256 !== manualHttpBytesSha256 || receiptHash !== sha256(stableJson(unsigned)) ||
    Date.parse(observedAt) < Date.parse(rejectedAt) || Date.parse(observedAt) > Date.parse(recoveredAt)
  ) throw new Error("OS-01R manual-cleanup envelope is invalid");

  const source = exactKeys(evidence.sourceRestoration, [
    "branch", "compareAndSwapApplied", "expectedOldHead", "observedAt", "postRestoreHead",
    "postRestoreTreeObjectId", "preRestoreHead", "preRestoreTreeObjectId", "projectionComplete",
    "remoteReadbackHead", "remoteReadbackObservedAt", "remoteReadbackTreeObjectId", "restoredHead"
  ], "OS-01R source restoration");
  const sourceObservedAt = timestamp(source.observedAt, "OS-01R source restoration observation");
  const sourceReadbackAt = timestamp(source.remoteReadbackObservedAt, "OS-01R source readback observation");
  if (
    source.branch !== "main" || source.compareAndSwapApplied !== true || source.projectionComplete !== true ||
    source.preRestoreHead !== authority.source.temporaryCommit ||
    source.preRestoreTreeObjectId !== authority.source.temporaryTreeObjectId ||
    source.expectedOldHead !== authority.source.temporaryCommit || source.restoredHead !== authority.source.cleanCommit ||
    source.postRestoreHead !== authority.source.cleanCommit ||
    source.postRestoreTreeObjectId !== authority.source.cleanTreeObjectId ||
    source.remoteReadbackHead !== authority.source.cleanCommit ||
    source.remoteReadbackTreeObjectId !== authority.source.cleanTreeObjectId ||
    Date.parse(sourceObservedAt) < Date.parse(intentObservedAt) || Date.parse(sourceObservedAt) > Date.parse(observedAt) ||
    Date.parse(sourceReadbackAt) < Date.parse(sourceObservedAt) || Date.parse(sourceReadbackAt) > Date.parse(observedAt)
  ) throw new Error("OS-01R source restoration is invalid");

  const environment = exactKeys(evidence.environment, ["after", "before", "staged"], "OS-01R environment lifecycle");
  const before = validateEnvironment(environment.before, "OS-01R environment before");
  const staged = validateEnvironment(environment.staged, "OS-01R environment staged");
  const after = validateEnvironment(environment.after, "OS-01R environment after");
  validateEnvironmentLifecycle(before, staged, after);
  if (
    before.projectId !== authority.targetProjectId || before.revision !== authority.environment.beforeRevision ||
    staged.revision !== authority.environment.stagedRevision || after.revision !== authority.environment.afterRevision ||
    staged.allMetadataRoot !== authority.environment.stagedAllMetadataRoot ||
    before.allMetadataRoot !== authority.environment.cleanAllMetadataRoot ||
    after.allMetadataRoot !== authority.environment.cleanAllMetadataRoot ||
    stableJson(before) !== stableJson(intent.environmentBefore) ||
    after.controlsPresent.length !== 0 || after.captureGatePresent ||
    Date.parse(after.observedAt) < Date.parse(intentObservedAt) || Date.parse(after.observedAt) > Date.parse(observedAt)
  ) throw new Error("OS-01R environment cleanup is invalid");

  const access = exactKeys(evidence.access, ["after", "before"], "OS-01R access lifecycle");
  const accessBefore = validateAccess(access.before, "OS-01R access before");
  const accessAfter = validateAccess(access.after, "OS-01R access after");
  if (
    stableJson(accessBefore) !== stableJson(intent.accessBefore) || accessAfter.projectId !== authority.targetProjectId ||
    accessAfter.origin !== authority.targetOrigin || accessAfter.revision !== authority.access.revision ||
    accessAfter.principalRoot !== authority.access.principalRoot ||
    !observationsEqualExceptTime(accessBefore as unknown as JsonRecord, accessAfter as unknown as JsonRecord) ||
    Date.parse(accessAfter.observedAt) < Date.parse(intentObservedAt) || Date.parse(accessAfter.observedAt) > Date.parse(observedAt)
  ) throw new Error("OS-01R access cleanup is invalid");

  const cleanVersion = validateVersion(evidence.cleanVersion, "OS-01R clean version");
  const cleanDeployment = validateDeployment(evidence.cleanDeployment, "OS-01R clean deployment");
  if (
    cleanVersion.projectId !== authority.targetProjectId || cleanVersion.versionId !== authority.cleanVersion.versionId ||
    cleanVersion.versionNumber !== authority.cleanVersion.versionNumber ||
    cleanVersion.sourceCommit !== authority.source.cleanCommit || cleanDeployment.projectId !== authority.targetProjectId ||
    cleanDeployment.origin !== authority.targetOrigin || cleanDeployment.versionId !== authority.cleanVersion.versionId ||
    cleanDeployment.deploymentId !== authority.cleanDeploymentId ||
    cleanDeployment.environmentRevision !== authority.environment.afterRevision
  ) throw new Error("OS-01R clean deployment is invalid");

  const bindings = exactKeys(evidence.bindings, [
    "d1Bindings", "observedAt", "projectId", "projectionComplete", "r2Bindings"
  ], "OS-01R bindings");
  if (
    bindings.projectId !== authority.targetProjectId || bindings.projectionComplete !== true ||
    stableJson(bindings.d1Bindings) !== stableJson(["DB"]) ||
    stableJson(bindings.r2Bindings) !== stableJson(["EVIDENCE"])
  ) throw new Error("OS-01R clean bindings are invalid");
  timestamp(bindings.observedAt, "OS-01R binding observation");

  const providerState = exactKeys(evidence.providerState, [
    "lastCost", "observedAt", "outstandingReservations", "projectionComplete", "remaining", "source",
    "stateRoot", "used"
  ], "OS-01R provider state");
  const committedProviderState = {
    source: "production_d1_read_only_quota_metadata",
    projectionComplete: true,
    used: 38,
    remaining: 462,
    lastCost: 0,
    outstandingReservations: 0
  };
  if (
    providerState.source !== committedProviderState.source || providerState.projectionComplete !== true ||
    providerState.used !== 38 || providerState.remaining !== 462 || providerState.lastCost !== 0 ||
    providerState.outstandingReservations !== 0 || providerState.stateRoot !== authority.providerStateRoot ||
    providerState.stateRoot !== sha256(stableJson(committedProviderState))
  ) throw new Error("OS-01R provider state is invalid");
  timestamp(providerState.observedAt, "OS-01R provider-state observation");
  const activity = exactKeys(evidence.providerActivity, [
    "providerRequests", "providerSecretReads", "quotaReservations"
  ], "OS-01R provider activity");
  if (activity.providerSecretReads !== 0 || activity.providerRequests !== 0 || activity.quotaReservations !== 0) {
    throw new Error("OS-01R provider activity is nonzero");
  }
  return { observedAt, receiptHash: String(receiptHash) };
}

function conflictGuardPath(lockPath: string): string {
  return resolve(dirname(lockPath), `.${basename(lockPath)}.conflict-guard`);
}

type OwnedEntry = { path: string; device: bigint; inode: bigint };

function writeBytes(descriptor: number, bytes: Uint8Array): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
    if (count < 1) throw new Error("OS-01R evidence write did not advance");
    offset += count;
  }
  fsyncSync(descriptor);
}

function createOwnedFile(path: string, bytes: Uint8Array): OwnedEntry {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow, 0o600);
  try {
    writeBytes(descriptor, bytes);
    const metadata = fstatSync(descriptor, { bigint: true });
    if (!metadata.isFile() || (metadata.mode & 0o777n) !== 0o600n) {
      throw new Error("OS-01R owned file metadata is invalid");
    }
    fsyncParent(path);
    return { path, device: metadata.dev, inode: metadata.ino };
  } finally {
    closeSync(descriptor);
  }
}

function detachOwnedEntry(input: {
  entry: OwnedEntry;
  afterOwnershipCheck?: () => void;
  afterDetach?: () => void;
  mismatchMessage: string;
  blockerPath?: string;
}): void {
  const detached = resolve(dirname(input.entry.path), `.${basename(input.entry.path)}.${randomUUID()}.detached`);
  const before = lstatSync(input.entry.path, { bigint: true });
  if (before.dev !== input.entry.device || before.ino !== input.entry.inode) throw new Error(input.mismatchMessage);
  input.afterOwnershipCheck?.();
  renameSync(input.entry.path, detached);
  input.afterDetach?.();
  fsyncParent(input.entry.path);
  const metadata = lstatSync(detached, { bigint: true });
  if (metadata.dev !== input.entry.device || metadata.ino !== input.entry.inode) {
    if (input.blockerPath && !pathExists(input.blockerPath)) {
      const blockerBytes = Buffer.from(`${stableJson({
        version: "os01-rejected-session-recovery-conflict.2026.1",
        status: "replacement_preserved_fail_closed",
        detachedEntry: basename(detached)
      })}\n`, "utf8");
      try {
        createOwnedFile(input.blockerPath, blockerBytes);
      } finally {
        blockerBytes.fill(0);
      }
    }
    throw new Error(`${input.mismatchMessage}; replacement preserved at ${detached}`);
  }
  unlinkSync(detached);
  fsyncParent(detached);
}

function stageReceipt(path: string, bytes: Uint8Array): OwnedEntry {
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.partial`);
  return createOwnedFile(temporary, bytes);
}

function publishStagedReceipt(staged: OwnedEntry, finalPath: string): void {
  linkSync(staged.path, finalPath);
  const finalMetadata = lstatSync(finalPath, { bigint: true });
  if (finalMetadata.dev !== staged.device || finalMetadata.ino !== staged.inode) {
    throw new Error("OS-01R recovery receipt publication ownership changed");
  }
  fsyncParent(finalPath);
  detachOwnedEntry({
    entry: staged,
    mismatchMessage: "OS-01R staged recovery receipt changed during cleanup"
  });
}

/**
 * Recovers only one already-rejected, expired, externally-armed OS-01 lock.
 * This does not accept, resume, or rewrite the rejected session. A pathname
 * conflict guard blocks every successor from validation through receipt
 * publication and is removed last. Any mismatch leaves the lane fail-closed.
 */
export function recoverRejectedOs01ProductionSession(
  input: Os01RejectedSessionRecoveryInput
): Os01RejectedSessionRecoveryReceipt {
  validateAuthority(input.authority);
  const recoveredAt = timestamp(input.recoveredAt ?? new Date().toISOString(), "OS-01R recovery time");
  const lockPath = canonicalPath(input.lockPath, "OS-01R lock");
  const receiptPath = canonicalPath(input.recoveryReceiptPath, "OS-01R recovery receipt");
  if (pathExists(receiptPath)) throw new Error("OS-01R recovery receipt already exists");
  const snapshots = {
    lock: ImmutableFileSnapshot.open(lockPath, "OS-01R production-session lock"),
    rejection: ImmutableFileSnapshot.open(input.rejectionReceiptPath, "OS-01R rejection receipt"),
    ledger: ImmutableFileSnapshot.open(input.phaseLedgerPath, "OS-01R phase ledger"),
    intent: ImmutableFileSnapshot.open(input.externalMutationIntentPath, "OS-01R external-mutation intent"),
    cleanup: ImmutableFileSnapshot.open(input.manualCleanupPath, "OS-01R manual-cleanup evidence"),
    http: ImmutableFileSnapshot.open(input.manualHttpPath, "OS-01R manual HTTP evidence")
  };
  let guard: OwnedEntry | null = null;
  let stagedReceipt: OwnedEntry | null = null;
  try {
    const hashes = {
      rejectionReceiptBytesSha256: sha256(snapshots.rejection.bytes),
      phaseLedgerBytesSha256: sha256(snapshots.ledger.bytes),
      externalMutationIntentBytesSha256: sha256(snapshots.intent.bytes),
      manualCleanupBytesSha256: sha256(snapshots.cleanup.bytes),
      manualHttpBytesSha256: sha256(snapshots.http.bytes)
    };
    if (stableJson(hashes) !== stableJson(input.authority.artifacts)) {
      throw new Error("OS-01R evidence byte hashes do not match the recovery authority");
    }
    const expiresAt = validateLock(snapshots.lock, input.authority);
    if (Date.parse(recoveredAt) <= Date.parse(expiresAt)) {
      throw new Error("OS-01R recovery is prohibited until strictly after lock expiry");
    }
    const ledger = validatePhaseLedger(snapshots.ledger.bytes, input.authority);
    const intent = validateIntent(snapshots.intent.bytes, input.authority);
    const rejection = validateRejection(
      snapshots.rejection.bytes,
      hashes.phaseLedgerBytesSha256,
      ledger,
      intent,
      input.authority
    );
    if (Date.parse(recoveredAt) < Date.parse(rejection.rejectedAt)) {
      throw new Error("OS-01R recovery predates the rejected session");
    }
    const manualCleanup = validateManualCleanup(
      snapshots.cleanup.bytes,
      input.authority,
      intent,
      rejection.rejectedAt,
      hashes.manualHttpBytesSha256,
      recoveredAt
    );
    validateManualHttp(
      snapshots.http.bytes,
      input.authority,
      Date.parse(String(intent.observedAt)),
      Date.parse(manualCleanup.observedAt)
    );

    const recoveryId = sha256(stableJson({
      authorityHash: input.authority.authorityHash,
      lockIdentityHash: input.authority.productionSessionLockIdentityHash,
      rejectionReceiptBytesSha256: hashes.rejectionReceiptBytesSha256,
      manualCleanupReceiptHash: manualCleanup.receiptHash
    }));
    const unsignedReceipt = {
      version: "os01-rejected-session-recovery.2026.1" as const,
      status: "expired_rejected_session_lock_recovered_after_verified_manual_cleanup" as const,
      recoveryId,
      authorityHash: input.authority.authorityHash,
      runId: input.authority.runId,
      targetProjectId: input.authority.targetProjectId,
      targetOrigin: input.authority.targetOrigin,
      originalSessionStatus: "rejected_cleanup_required" as const,
      originalSessionAcceptanceEffect: "none_rejection_preserved" as const,
      productionSessionLockIdentityHash: input.authority.productionSessionLockIdentityHash,
      externalMutationIntentHash: rejection.intentHash,
      originalLock: {
        bytesSha256: input.authority.lock.bytesSha256,
        device: input.authority.lock.device,
        inode: input.authority.lock.inode,
        mode: 0o600 as const,
        expiredAt: expiresAt
      },
      evidence: { ...input.authority.artifacts },
      cleanSourceCommit: input.authority.source.cleanCommit,
      cleanSourceTreeObjectId: input.authority.source.cleanTreeObjectId,
      cleanVersionId: input.authority.cleanVersion.versionId,
      cleanDeploymentId: input.authority.cleanDeploymentId,
      environmentRevisionAfter: input.authority.environment.afterRevision,
      providerStateRoot: input.authority.providerStateRoot,
      providerSecretReads: 0 as const,
      providerRequests: 0 as const,
      quotaReservations: 0 as const,
      recoveredAt
    };
    const receipt: Os01RejectedSessionRecoveryReceipt = {
      ...unsignedReceipt,
      recoveryReceiptHash: sha256(stableJson(unsignedReceipt))
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    const guardBytes = Buffer.from(`${stableJson({
      version: "os01-rejected-session-recovery-conflict-guard.2026.1",
      recoveryId,
      productionSessionLockIdentityHash: input.authority.productionSessionLockIdentityHash,
      recoveryReceiptHash: receipt.recoveryReceiptHash
    })}\n`, "utf8");
    try {
      guard = createOwnedFile(conflictGuardPath(lockPath), guardBytes);
      input.faultInjection?.afterConflictGuardAcquired?.();
      for (const [label, snapshot] of Object.entries(snapshots)) snapshot.assertUnchanged(`OS-01R ${label}`);
      input.faultInjection?.afterEvidenceRevalidation?.();
      for (const [label, snapshot] of Object.entries(snapshots)) snapshot.assertUnchanged(`OS-01R ${label}`);
      stagedReceipt = stageReceipt(receiptPath, receiptBytes);
      input.faultInjection?.afterReceiptStaged?.();

      snapshots.lock.assertUnchanged("OS-01R production-session lock");
      detachOwnedEntry({
        entry: { path: lockPath, device: snapshots.lock.device, inode: snapshots.lock.inode },
        afterOwnershipCheck: input.faultInjection?.afterLockOwnershipCheck,
        afterDetach: input.faultInjection?.afterLockDetach,
        mismatchMessage: "OS-01R production-session lock ownership changed during recovery"
      });
      input.faultInjection?.beforeReceiptPublication?.();
      publishStagedReceipt(stagedReceipt, receiptPath);
      stagedReceipt = null;
      input.faultInjection?.afterReceiptPublication?.();
      if (pathExists(lockPath)) {
        throw new Error("OS-01R public lock path was occupied before recovery commit");
      }
      detachOwnedEntry({
        entry: guard,
        afterOwnershipCheck: input.faultInjection?.afterGuardOwnershipCheck,
        afterDetach: input.faultInjection?.afterGuardDetach,
        mismatchMessage: "OS-01R conflict guard ownership changed during recovery",
        blockerPath: guard.path
      });
      guard = null;
      return receipt;
    } finally {
      guardBytes.fill(0);
      receiptBytes.fill(0);
    }
  } finally {
    // Deliberately do not remove a surviving guard, staged receipt, detached
    // replacement, or published receipt. Each is fail-closed recovery evidence.
    void guard;
    void stagedReceipt;
    for (const snapshot of Object.values(snapshots)) snapshot.close();
  }
}
