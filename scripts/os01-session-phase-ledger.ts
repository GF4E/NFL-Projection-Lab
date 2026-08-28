import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeSync
} from "node:fs";
import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

export type Os01SessionPhase =
  | "session_lock_acquired"
  | "source_anchor_ready"
  | "deployment_archive_ready"
  | "external_mutation_armed"
  | "proof_and_census_complete"
  | "cleanup_verified"
  | "session_complete"
  | "session_rejected_before_external_mutation"
  | "session_rejected_cleanup_required"
  | "session_rejected_after_verified_cleanup";

const SUCCESS_PHASES: readonly Os01SessionPhase[] = [
  "session_lock_acquired",
  "source_anchor_ready",
  "deployment_archive_ready",
  "external_mutation_armed",
  "proof_and_census_complete",
  "cleanup_verified",
  "session_complete"
] as const;

const TERMINAL_FAILURE_PHASES = new Set<Os01SessionPhase>([
  "session_rejected_before_external_mutation",
  "session_rejected_cleanup_required",
  "session_rejected_after_verified_cleanup"
]);

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
  throw new Error("OS-01 phase-ledger evidence contains an unsupported value");
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fsyncParent(path: string): void {
  const descriptor = openSync(dirname(path), "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export class Os01SessionPhaseLedger {
  readonly path: string;
  readonly runId: string;
  #descriptor: number;
  readonly #device: bigint;
  readonly #inode: bigint;
  #expectedBytes = Buffer.alloc(0);
  #entries: Array<Record<string, unknown>> = [];
  #terminal = false;

  private constructor(path: string, runId: string, descriptor: number, device: bigint, inode: bigint) {
    this.path = path;
    this.runId = runId;
    this.#descriptor = descriptor;
    this.#device = device;
    this.#inode = inode;
  }

  static create(pathInput: string, runId: string): Os01SessionPhaseLedger {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(runId)) {
      throw new Error("OS-01 phase-ledger run identity is invalid");
    }
    const path = resolve(pathInput);
    const parent = realpathSync(dirname(path));
    if (dirname(path) !== parent) throw new Error("OS-01 phase-ledger parent is not canonical");
    let descriptor = -1;
    try {
      const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
      descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | noFollow, 0o600);
      fsyncSync(descriptor);
      const descriptorMetadata = fstatSync(descriptor, { bigint: true });
      const pathMetadata = lstatSync(path, { bigint: true });
      if (
        !descriptorMetadata.isFile() || !pathMetadata.isFile() || pathMetadata.isSymbolicLink() ||
        (descriptorMetadata.mode & 0o077n) !== 0n || (pathMetadata.mode & 0o077n) !== 0n ||
        descriptorMetadata.dev !== pathMetadata.dev || descriptorMetadata.ino !== pathMetadata.ino ||
        descriptorMetadata.size !== 0n || realpathSync(path) !== path
      ) throw new Error("OS-01 phase-ledger inode is invalid");
      fsyncParent(path);
      return new Os01SessionPhaseLedger(
        path,
        runId,
        descriptor,
        descriptorMetadata.dev,
        descriptorMetadata.ino
      );
    } catch (error: unknown) {
      if (descriptor >= 0) {
        try {
          const descriptorMetadata = fstatSync(descriptor, { bigint: true });
          const pathMetadata = lstatSync(path, { bigint: true });
          if (
            descriptorMetadata.dev === pathMetadata.dev &&
            descriptorMetadata.ino === pathMetadata.ino &&
            descriptorMetadata.size === 0n
          ) {
            unlinkSync(path);
            fsyncParent(path);
          }
        } catch {
          // Never remove a pathname unless it still identifies the empty descriptor-owned inode.
        }
        closeSync(descriptor);
      }
      throw error;
    }
  }

  advance(phase: Os01SessionPhase, observedAt = new Date().toISOString()): void {
    if (this.#terminal) throw new Error("OS-01 phase ledger is terminal");
    if (!Number.isFinite(Date.parse(observedAt))) throw new Error("OS-01 phase-ledger timestamp is invalid");
    this.assertIntegrity();
    const sequence = this.#entries.length;
    const priorObservedAt = sequence === 0 ? null : String(this.#entries.at(-1)!.observedAt);
    if (priorObservedAt !== null && Date.parse(observedAt) < Date.parse(priorObservedAt)) {
      throw new Error("OS-01 session phase timestamp regressed");
    }
    const expectedSuccessPhase = SUCCESS_PHASES[sequence];
    if (!TERMINAL_FAILURE_PHASES.has(phase) && phase !== expectedSuccessPhase) {
      throw new Error("OS-01 session phase transition is non-monotonic");
    }
    const previousEntryHash = sequence === 0
      ? "0".repeat(64)
      : String(this.#entries.at(-1)!.entryHash);
    const unsigned = {
      version: "os01-session-phase-ledger-entry.2026.1",
      runId: this.runId,
      sequence,
      phase,
      observedAt,
      previousEntryHash
    };
    const entry = { ...unsigned, entryHash: sha256(stableJson(unsigned)) };
    const line = Buffer.from(`${stableJson(entry)}\n`, "utf8");
    try {
      let offset = 0;
      while (offset < line.byteLength) {
        const written = writeSync(
          this.#descriptor,
          line,
          offset,
          line.byteLength - offset,
          this.#expectedBytes.byteLength + offset
        );
        if (written < 1) throw new Error("OS-01 phase-ledger write did not advance");
        offset += written;
      }
      fsyncSync(this.#descriptor);
      const expected = Buffer.concat([this.#expectedBytes, line]);
      this.#assertOwnedBytes(expected);
      this.#expectedBytes.fill(0);
      this.#expectedBytes = expected;
      this.#entries.push(entry);
    } finally {
      line.fill(0);
    }
    if (TERMINAL_FAILURE_PHASES.has(phase) || phase === "session_complete") this.#terminal = true;
  }

  snapshot(): {
    version: "os01-session-phase-ledger.2026.1";
    runId: string;
    entryCount: number;
    terminalPhase: Os01SessionPhase | null;
    ledgerSha256: string;
    lastEntryHash: string;
  } {
    this.assertIntegrity();
    return {
      version: "os01-session-phase-ledger.2026.1",
      runId: this.runId,
      entryCount: this.#entries.length,
      terminalPhase: this.#terminal ? this.#entries.at(-1)!.phase as Os01SessionPhase : null,
      ledgerSha256: sha256(this.#expectedBytes),
      lastEntryHash: this.#entries.length === 0 ? "0".repeat(64) : String(this.#entries.at(-1)!.entryHash)
    };
  }

  assertIntegrity(): void {
    this.#assertOwnedBytes(this.#expectedBytes);
  }

  #assertOwnedBytes(expected: Buffer): void {
    if (this.#descriptor < 0) throw new Error("OS-01 phase-ledger descriptor is unavailable");
    let descriptorMetadata: ReturnType<typeof fstatSync>;
    let pathMetadata: ReturnType<typeof lstatSync>;
    try {
      descriptorMetadata = fstatSync(this.#descriptor, { bigint: true });
      pathMetadata = lstatSync(this.path, { bigint: true });
    } catch {
      throw new Error("OS-01 phase-ledger metadata is invalid");
    }
    if (
      !descriptorMetadata.isFile() || !pathMetadata.isFile() || pathMetadata.isSymbolicLink() ||
      (descriptorMetadata.mode & 0o077n) !== 0n || (pathMetadata.mode & 0o077n) !== 0n ||
      descriptorMetadata.dev !== this.#device || descriptorMetadata.ino !== this.#inode ||
      pathMetadata.dev !== this.#device || pathMetadata.ino !== this.#inode ||
      realpathSync(this.path) !== this.path
    ) throw new Error("OS-01 phase-ledger metadata is invalid");
    if (descriptorMetadata.size !== BigInt(expected.byteLength)) {
      throw new Error("OS-01 phase ledger changed outside its owner");
    }
    const actual = Buffer.alloc(expected.byteLength);
    try {
      let offset = 0;
      while (offset < actual.byteLength) {
        const read = readSync(this.#descriptor, actual, offset, actual.byteLength - offset, offset);
        if (read < 1) throw new Error("OS-01 phase ledger changed outside its owner");
        offset += read;
      }
      if (sha256(actual) !== sha256(expected)) throw new Error("OS-01 phase ledger changed outside its owner");
    } finally {
      actual.fill(0);
    }
  }

  close(): void {
    if (this.#descriptor < 0) return;
    closeSync(this.#descriptor);
    this.#descriptor = -1;
    this.#expectedBytes.fill(0);
  }
}
