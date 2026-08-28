import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  ftruncateSync,
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

type JsonRecord = Record<string, unknown>;

export const OS01_PRODUCTION_SESSION_LOCK_PATH =
  "/private/tmp/nfl-projection-lab-os01-production-session.lock";

export type Os01ProductionSessionLockIdentity = {
  targetProjectId: string;
  runId: string;
  seedCommitment: string;
  startedAt: string;
  expiresAt: string;
};

export type Os01ProductionSessionLockEvidence = Os01ProductionSessionLockIdentity & {
  version: "os01-production-session-lock.2026.1";
  ownerTokenSha256: string;
  lockIdentityHash: string;
};

export type Os01ProductionSessionLockRelease = {
  version: "os01-production-session-lock-release.2026.1";
  lockIdentityHash: string;
  releasedAt: string;
  releaseReason: "verified_cleanup" | "rejected_before_external_mutation";
};

/** Deterministic synchronization points used only by local race tests. */
export type Os01ProductionSessionLockFaultInjection = Readonly<{
  afterAcquisitionConflictGuardCheck?: () => void;
  afterAcquisitionPathOpen?: () => void;
  afterAcceptanceOwnershipCheck?: () => void;
  afterAcceptanceMarkerLink?: () => void;
  afterAcceptanceMarkerVerification?: () => void;
  afterReleaseOwnershipCheck?: () => void;
  afterReleasePathDetach?: () => void;
}>;

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
  throw new Error("OS-01 session-lock evidence contains an unsupported value");
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireIdentity(input: Os01ProductionSessionLockIdentity): void {
  if (
    input.targetProjectId.length === 0 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.runId) ||
    !/^[a-f0-9]{64}$/u.test(input.seedCommitment) ||
    !Number.isFinite(Date.parse(input.startedAt)) ||
    !Number.isFinite(Date.parse(input.expiresAt)) ||
    Date.parse(input.expiresAt) <= Date.parse(input.startedAt)
  ) throw new Error("OS-01 production-session lock identity is invalid");
}

function canonicalLockPath(pathInput: string): string {
  const requested = resolve(pathInput);
  const parent = realpathSync(dirname(requested));
  if (dirname(requested) !== parent) throw new Error("OS-01 production-session lock parent is not canonical");
  return requested;
}

function fsyncParent(path: string): void {
  const descriptor = openSync(dirname(path), "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

function conflictGuardPath(path: string): string {
  return resolve(dirname(path), `.${basename(path)}.conflict-guard`);
}

function writeDescriptorBytes(descriptor: number, bytes: Buffer): void {
  ftruncateSync(descriptor, 0);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
    if (written < 1) throw new Error("OS-01 production-session lock write did not advance");
    offset += written;
  }
  fsyncSync(descriptor);
}

function installFailClosedBlocker(path: string, detachedPath: string): void {
  let descriptor = -1;
  try {
    descriptor = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600
    );
    writeDescriptorBytes(
      descriptor,
      Buffer.from(`${stableJson({
        version: "os01-production-session-lock-conflict.2026.1",
        status: "replacement_preserved_fail_closed",
        detachedEntry: basename(detachedPath)
      })}\n`, "utf8")
    );
    closeSync(descriptor);
    descriptor = -1;
    fsyncParent(path);
  } catch (error: unknown) {
    if (descriptor >= 0) closeSync(descriptor);
    throw error;
  }
}

type OwnedPathIdentity = {
  path: string;
  device: bigint;
  inode: bigint;
};

function createConflictGuard(path: string, lockIdentityHash: string): OwnedPathIdentity {
  const guardPath = conflictGuardPath(path);
  let descriptor = -1;
  try {
    descriptor = openSync(
      guardPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600
    );
    writeDescriptorBytes(
      descriptor,
      Buffer.from(`${stableJson({
        version: "os01-production-session-lock-conflict-guard.2026.1",
        lockIdentityHash
      })}\n`, "utf8")
    );
    const metadata = fstatSync(descriptor, { bigint: true });
    if (!metadata.isFile() || (metadata.mode & 0o077n) !== 0n) {
      throw new Error("OS-01 production-session conflict guard is invalid");
    }
    fsyncParent(guardPath);
    closeSync(descriptor);
    descriptor = -1;
    return { path: guardPath, device: metadata.dev, inode: metadata.ino };
  } catch (error: unknown) {
    if (descriptor >= 0) closeSync(descriptor);
    throw error;
  }
}

/**
 * Atomically moves a public pathname out of the way before inspecting it.
 * Only a detached entry verified as the expected inode is unlinked. If the
 * public pathname named a replacement of any filesystem type, the exact entry
 * is retained under the unpredictable detached name and a public blocker keeps
 * every new qualification session fail-closed for explicit operator recovery.
 */
function detachVerifiedPath(input: {
  path: string;
  expectedDevice: bigint;
  expectedInode: bigint;
  afterOwnershipCheck?: () => void;
  afterPathDetach?: () => void;
  mismatchMessage: string;
}): void {
  const detachedPath = resolve(
    dirname(input.path),
    `.${basename(input.path)}.${randomUUID()}.detached`
  );
  input.afterOwnershipCheck?.();
  renameSync(input.path, detachedPath);
  input.afterPathDetach?.();
  fsyncParent(input.path);
  const detachedMetadata = lstatSync(detachedPath, { bigint: true });
  if (
    detachedMetadata.dev !== input.expectedDevice ||
    detachedMetadata.ino !== input.expectedInode
  ) {
    try {
      installFailClosedBlocker(input.path, detachedPath);
    } catch (error: unknown) {
      throw new Error(
        `${input.mismatchMessage}; replacement preserved at detached path (${errorCode(error) || "blocker failed"})`
      );
    }
    throw new Error(`${input.mismatchMessage}; replacement preserved at ${detachedPath}`);
  }
  unlinkSync(detachedPath);
  fsyncParent(detachedPath);
}

/**
 * Process-held ownership of the one public-production qualification lane.
 *
 * An expired lock is deliberately not reclaimed. Once external mutation is
 * armed, every terminal path retains the lock until this same owner proves
 * cleanup and releases it. Recovery after a crashed armed process is therefore
 * an explicit, independently verified operator action rather than a timeout.
 */
export class Os01ProductionSessionLock {
  readonly path: string;
  readonly evidence: Os01ProductionSessionLockEvidence;
  #expectedBytes: Buffer;
  #ownerToken: Buffer;
  #descriptor: number;
  readonly #device: bigint;
  readonly #inode: bigint;
  readonly #faultInjection: Os01ProductionSessionLockFaultInjection;
  #externalMutationIntentHash: string | null = null;
  #acceptanceMarkerPublished = false;
  #released = false;

  private constructor(input: {
    path: string;
    evidence: Os01ProductionSessionLockEvidence;
    bytes: Buffer;
    ownerToken: Buffer;
    descriptor: number;
    device: bigint;
    inode: bigint;
    faultInjection: Os01ProductionSessionLockFaultInjection;
  }) {
    this.path = input.path;
    this.evidence = input.evidence;
    this.#expectedBytes = input.bytes;
    this.#ownerToken = input.ownerToken;
    this.#descriptor = input.descriptor;
    this.#device = input.device;
    this.#inode = input.inode;
    this.#faultInjection = input.faultInjection;
  }

  static acquire(
    identity: Os01ProductionSessionLockIdentity,
    pathInput = OS01_PRODUCTION_SESSION_LOCK_PATH,
    faultInjection: Os01ProductionSessionLockFaultInjection = {}
  ): Os01ProductionSessionLock {
    requireIdentity(identity);
    const path = canonicalLockPath(pathInput);
    const guardPath = conflictGuardPath(path);
    const ownerToken = randomBytes(32);
    let descriptor = -1;
    try {
      if (pathEntryExists(guardPath)) {
        throw new Error("OS-01 public-production qualification is locked by a conflict guard for verified recovery");
      }
      faultInjection.afterAcquisitionConflictGuardCheck?.();
      const base = {
        version: "os01-production-session-lock.2026.1" as const,
        ...identity,
        ownerTokenSha256: sha256(ownerToken)
      };
      const evidence: Os01ProductionSessionLockEvidence = {
        ...base,
        lockIdentityHash: sha256(stableJson(base))
      };
      const bytes = Buffer.from(`${stableJson(evidence)}\n`, "utf8");
      try {
        descriptor = openSync(
          path,
          constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
          0o600
        );
      } catch (error: unknown) {
        const code = errorCode(error);
        if (code !== "EEXIST" && code !== "ELOOP") throw error;
        throw new Error(
          "OS-01 public-production qualification is locked; stale or expired locks require explicit verified recovery"
        );
      }
      faultInjection.afterAcquisitionPathOpen?.();
      if (pathEntryExists(guardPath)) {
        fsyncSync(descriptor);
        fsyncParent(path);
        throw new Error("OS-01 public-production qualification became locked by a conflict guard during acquisition");
      }
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
        if (written < 1) throw new Error("OS-01 production-session lock write did not advance");
        offset += written;
      }
      fsyncSync(descriptor);
      const descriptorMetadata = fstatSync(descriptor, { bigint: true });
      const pathMetadata = lstatSync(path, { bigint: true });
      if (
        !descriptorMetadata.isFile() || !pathMetadata.isFile() || pathMetadata.isSymbolicLink() ||
        (descriptorMetadata.mode & 0o077n) !== 0n || (pathMetadata.mode & 0o077n) !== 0n ||
        descriptorMetadata.dev !== pathMetadata.dev || descriptorMetadata.ino !== pathMetadata.ino ||
        realpathSync(path) !== path
      ) throw new Error("OS-01 production-session lock inode is invalid");
      fsyncParent(path);
      return new Os01ProductionSessionLock({
        path,
        evidence,
        bytes,
        ownerToken,
        descriptor,
        device: descriptorMetadata.dev,
        inode: descriptorMetadata.ino,
        faultInjection
      });
    } catch (error: unknown) {
      if (descriptor >= 0) {
        // Any post-open failure leaves the public entry fail-closed. Removing
        // it here would recreate the same pathname race that release guards.
        closeSync(descriptor);
      }
      ownerToken.fill(0);
      throw error;
    }
  }

  get externalMutationArmed(): boolean {
    return this.#externalMutationIntentHash !== null;
  }

  get released(): boolean {
    return this.#released;
  }

  assertOwned(): void {
    if (this.#released) throw new Error("OS-01 production-session lock was already released");
    if (sha256(this.#ownerToken) !== this.evidence.ownerTokenSha256) {
      throw new Error("OS-01 production-session owner token is unavailable");
    }
    if (this.#descriptor < 0) throw new Error("OS-01 production-session descriptor is unavailable");
    const descriptorMetadata = fstatSync(this.#descriptor, { bigint: true });
    const pathMetadata = lstatSync(this.path, { bigint: true });
    if (
      !descriptorMetadata.isFile() || !pathMetadata.isFile() || pathMetadata.isSymbolicLink() ||
      (descriptorMetadata.mode & 0o077n) !== 0n || (pathMetadata.mode & 0o077n) !== 0n ||
      descriptorMetadata.dev !== this.#device || descriptorMetadata.ino !== this.#inode ||
      pathMetadata.dev !== this.#device || pathMetadata.ino !== this.#inode
    ) {
      throw new Error("OS-01 production-session lock metadata is invalid");
    }
    if (realpathSync(this.path) !== this.path) {
      throw new Error("OS-01 production-session lock path is not canonical");
    }
    if (descriptorMetadata.size !== BigInt(this.#expectedBytes.byteLength)) {
      throw new Error("OS-01 production-session lock ownership changed");
    }
    const current = Buffer.alloc(this.#expectedBytes.byteLength);
    try {
      let offset = 0;
      while (offset < current.byteLength) {
        const read = readSync(this.#descriptor, current, offset, current.byteLength - offset, offset);
        if (read < 1) throw new Error("OS-01 production-session lock ownership changed");
        offset += read;
      }
      if (
        current.byteLength !== this.#expectedBytes.byteLength ||
        sha256(current) !== sha256(this.#expectedBytes)
      ) throw new Error("OS-01 production-session lock ownership changed");
    } finally {
      current.fill(0);
    }
  }

  armExternalMutation(intentHash: string): void {
    if (!/^[a-f0-9]{64}$/u.test(intentHash)) {
      throw new Error("OS-01 external-mutation intent hash is invalid");
    }
    if (this.#externalMutationIntentHash !== null) {
      throw new Error("OS-01 external mutation is already armed");
    }
    this.assertOwned();
    this.#externalMutationIntentHash = intentHash;
  }

  assertExternalMutationIntent(intentHash: string): void {
    this.assertOwned();
    if (this.#externalMutationIntentHash !== intentHash) {
      throw new Error("OS-01 external-mutation intent does not own this session");
    }
  }

  /**
   * Publishes terminal acceptance by hard-linking the pathname-global lock
   * inode itself. The acceptance bytes are installed through the held
   * descriptor first, so a pathname replacement can never produce a valid
   * acceptance marker: the atomic link either captures this owned inode or is
   * detected and removed as a non-owner link.
   */
  publishAcceptanceMarkerExclusive(pathInput: string, bytesInput: Uint8Array): string {
    if (bytesInput.byteLength === 0) {
      throw new Error("OS-01 acceptance marker bytes are empty");
    }
    if (this.#acceptanceMarkerPublished) {
      throw new Error("OS-01 acceptance marker was already published");
    }
    const path = canonicalLockPath(pathInput);
    const parentMetadata = lstatSync(dirname(path), { bigint: true });
    if (!parentMetadata.isDirectory() || parentMetadata.dev !== this.#device) {
      throw new Error("OS-01 acceptance marker must share the production-lock filesystem");
    }
    this.assertOwned();
    const previousBytes = this.#expectedBytes;
    const bytes = Buffer.from(bytesInput);
    let rewriteStarted = false;
    let markerLinked = false;
    try {
      rewriteStarted = true;
      writeDescriptorBytes(this.#descriptor, bytes);
      this.#expectedBytes = bytes;
      this.assertOwned();
      this.#faultInjection.afterAcceptanceOwnershipCheck?.();

      linkSync(this.path, path);
      markerLinked = true;
      this.#faultInjection.afterAcceptanceMarkerLink?.();
      const markerMetadata = lstatSync(path, { bigint: true });
      if (
        markerMetadata.dev !== this.#device ||
        markerMetadata.ino !== this.#inode
      ) {
        detachVerifiedPath({
          path,
          expectedDevice: markerMetadata.dev,
          expectedInode: markerMetadata.ino,
          mismatchMessage: "OS-01 acceptance marker changed during failed publication cleanup"
        });
        markerLinked = false;
        throw new Error("OS-01 production-session lock ownership changed during acceptance publication");
      }
      this.assertOwned();
      this.#faultInjection.afterAcceptanceMarkerVerification?.();
      const committedMarkerMetadata = lstatSync(path, { bigint: true });
      if (
        committedMarkerMetadata.dev !== this.#device ||
        committedMarkerMetadata.ino !== this.#inode
      ) {
        detachVerifiedPath({
          path,
          expectedDevice: committedMarkerMetadata.dev,
          expectedInode: committedMarkerMetadata.ino,
          mismatchMessage: "OS-01 acceptance marker changed during final publication verification"
        });
        markerLinked = false;
        throw new Error("OS-01 acceptance marker ownership changed before publication commit");
      }
      this.assertOwned();
      fsyncParent(path);
      this.#acceptanceMarkerPublished = true;
      previousBytes.fill(0);
      return path;
    } catch (error: unknown) {
      let rollbackError: unknown = null;
      if (markerLinked) {
        try {
          detachVerifiedPath({
            path,
            expectedDevice: this.#device,
            expectedInode: this.#inode,
            mismatchMessage: "OS-01 acceptance marker changed during publication rollback"
          });
        } catch (caught: unknown) {
          rollbackError = caught;
        }
      }
      if (rewriteStarted) {
        try {
          writeDescriptorBytes(this.#descriptor, previousBytes);
          if (this.#expectedBytes !== previousBytes) this.#expectedBytes.fill(0);
          this.#expectedBytes = previousBytes;
        } catch (caught: unknown) {
          rollbackError ??= caught;
        }
      }
      if (rollbackError !== null) {
        throw new Error(
          `OS-01 acceptance publication rollback failed (${errorCode(rollbackError) || "rollback error"})`
        );
      }
      throw error;
    }
  }

  terminalDisposition(): {
    cleanupRequired: boolean;
    lockDisposition:
      | "retained_for_verified_cleanup"
      | "released_before_external_mutation"
      | "released_after_verified_cleanup";
    release: Os01ProductionSessionLockRelease | null;
  } {
    if (this.#released) {
      return {
        cleanupRequired: false,
        lockDisposition: "released_after_verified_cleanup",
        release: null
      };
    }
    if (this.#externalMutationIntentHash !== null) {
      this.assertOwned();
      return {
        cleanupRequired: true,
        lockDisposition: "retained_for_verified_cleanup",
        release: null
      };
    }
    return {
      cleanupRequired: false,
      lockDisposition: "released_before_external_mutation",
      release: this.#release("rejected_before_external_mutation")
    };
  }

  releaseAfterVerifiedCleanup(intentHash: string, releasedAt: string): Os01ProductionSessionLockRelease {
    if (!Number.isFinite(Date.parse(releasedAt))) {
      throw new Error("OS-01 production-session lock release time is invalid");
    }
    this.assertExternalMutationIntent(intentHash);
    return this.#release("verified_cleanup", releasedAt);
  }

  /** Zeroizes process-held ownership without ever auto-reclaiming an armed lock. */
  close(): void {
    if (!this.#released && this.#externalMutationIntentHash === null) {
      try {
        this.#release("rejected_before_external_mutation");
      } catch {
        // A changed lock is not ours to remove. Leave it fail-closed.
      }
    }
    if (this.#descriptor >= 0) {
      closeSync(this.#descriptor);
      this.#descriptor = -1;
    }
    this.#ownerToken.fill(0);
    this.#expectedBytes.fill(0);
  }

  #release(
    releaseReason: Os01ProductionSessionLockRelease["releaseReason"],
    releasedAt = new Date().toISOString()
  ): Os01ProductionSessionLockRelease {
    this.assertOwned();
    const conflictGuard = createConflictGuard(this.path, this.evidence.lockIdentityHash);
    try {
      detachVerifiedPath({
        path: this.path,
        expectedDevice: this.#device,
        expectedInode: this.#inode,
        afterOwnershipCheck: this.#faultInjection.afterReleaseOwnershipCheck,
        afterPathDetach: this.#faultInjection.afterReleasePathDetach,
        mismatchMessage: "OS-01 production-session lock ownership changed during release"
      });
      detachVerifiedPath({
        path: conflictGuard.path,
        expectedDevice: conflictGuard.device,
        expectedInode: conflictGuard.inode,
        mismatchMessage: "OS-01 production-session conflict guard changed during release"
      });
    } catch (error: unknown) {
      // A failed release deliberately retains its conflict guard for recovery.
      throw error;
    }
    this.#released = true;
    closeSync(this.#descriptor);
    this.#descriptor = -1;
    this.#ownerToken.fill(0);
    this.#expectedBytes.fill(0);
    return {
      version: "os01-production-session-lock-release.2026.1",
      lockIdentityHash: this.evidence.lockIdentityHash,
      releasedAt,
      releaseReason
    };
  }
}
