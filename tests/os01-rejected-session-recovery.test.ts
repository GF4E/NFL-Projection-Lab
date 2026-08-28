import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { os01ControlPlaneContract } from "../scripts/os01-control-plane-evidence";
import { Os01ProductionSessionLock } from "../scripts/os01-production-session-lock";
import {
  os01RejectedSessionRecoveryAuthorityHash,
  recoverRejectedOs01ProductionSession,
  type Os01RejectedSessionManualCleanupEvidence,
  type Os01RejectedSessionRecoveryAuthority,
  type Os01RejectedSessionRecoveryInput
} from "../scripts/os01-rejected-session-recovery";

type JsonRecord = Record<string, unknown>;

const temporaryRoots: string[] = [];

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
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashed<T extends JsonRecord>(value: T, field: string): T & Record<string, string> {
  return { ...value, [field]: sha256(stableJson(value)) };
}

function pretty(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writePrivate(path: string, bytes: Uint8Array): void {
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
}

const runId = "33267b07-8f4e-4f6b-b3ba-08e85e1ce090";
const targetProjectId = "appgprj_os01_recovery_test";
const targetOrigin = "https://nfl-projection-lab-test.invalid";
const seedCommitment = "1".repeat(64);
const sourceAnchor = "2".repeat(64);
const authorityCommit = "3".repeat(40);
const implementationCommit = "4".repeat(40);
const temporaryCommit = "5".repeat(40);
const cleanCommit = "6".repeat(40);
const temporaryTree = "7".repeat(64);
const cleanTree = "8".repeat(64);
const principalRoot = "9".repeat(64);
const cleanMetadataRoot = "a".repeat(64);
const stagedMetadataRoot = "b".repeat(64);
const unrelatedMetadataRoot = "c".repeat(64);
const cleanVersionId = "appgprj_test~appgver_clean";
const cleanDeploymentId = "appgdep_clean";
const lastCommandHash = "d".repeat(64);

type Fixture = {
  root: string;
  paths: Omit<Os01RejectedSessionRecoveryInput, "authority" | "faultInjection">;
  authority: Os01RejectedSessionRecoveryAuthority;
  intent: JsonRecord;
  cleanup: Os01RejectedSessionManualCleanupEvidence;
  refreshAuthority: () => void;
};

function access(observedAt: string) {
  return {
    version: os01ControlPlaneContract.version,
    observedAt,
    projectId: targetProjectId,
    origin: targetOrigin,
    currentUserRole: "owner",
    accessMode: "public",
    revision: 4,
    principalRoot,
    allowedAccountUserCount: 1,
    allowedUserCount: 1,
    ownerRoleCount: 1,
    nonOwnerUserCount: 0,
    editorCount: 0,
    groupCount: 0,
    workspaceGroupCount: 0,
    tenantGroupCount: 0,
    externalVisitorCount: 0
  };
}

function environment(
  observedAt: string,
  revision: number,
  controlsPresent: string[],
  allMetadataRoot: string,
  entryCount: number,
  updatedAt: string | null
) {
  return {
    version: os01ControlPlaneContract.version,
    observedAt,
    projectId: targetProjectId,
    revision,
    updatedAt,
    controlsPresent,
    controlsAllSecret: true,
    captureGatePresent: false,
    entryCount,
    unrelatedEntryCount: 1,
    unrelatedMetadataRoot,
    allMetadataRoot,
    valueObservation: os01ControlPlaneContract.environmentValueObservation,
    unrelatedValuePreservationBasis: os01ControlPlaneContract.unrelatedValuePreservationBasis
  };
}

function makeFixture(label: string): Fixture {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), `os01-recovery-${label}-`)));
  temporaryRoots.push(root);
  const paths = {
    lockPath: resolve(root, "production.lock"),
    recoveryReceiptPath: resolve(root, "recovery-receipt.json"),
    rejectionReceiptPath: resolve(root, "session-rejection-receipt.json"),
    phaseLedgerPath: resolve(root, "session-phase-ledger.jsonl"),
    externalMutationIntentPath: resolve(root, "external-mutation-intent.json"),
    manualCleanupPath: resolve(root, "manual-cleanup.json"),
    manualHttpPath: resolve(root, "manual-clean-http.json")
  };

  const lockBase = {
    version: "os01-production-session-lock.2026.1",
    targetProjectId,
    runId,
    seedCommitment,
    startedAt: "2026-08-28T12:00:00.000Z",
    expiresAt: "2026-08-28T13:00:00.000Z",
    ownerTokenSha256: "e".repeat(64)
  };
  const lock = { ...lockBase, lockIdentityHash: sha256(stableJson(lockBase)) };
  writePrivate(paths.lockPath, Buffer.from(`${stableJson(lock)}\n`, "utf8"));

  const beforeEnvironment = environment(
    "2026-08-28T12:04:00.000Z", 25, [], cleanMetadataRoot, 1, null
  );
  const stagedEnvironment = environment(
    "2026-08-28T12:12:00.000Z",
    26,
    [...os01ControlPlaneContract.temporaryControls].sort(compareCodePoints),
    stagedMetadataRoot,
    4,
    "2026-08-28T12:11:30.000Z"
  );
  const afterEnvironment = environment(
    "2026-08-28T13:51:00.000Z", 27, [], cleanMetadataRoot, 1, "2026-08-28T12:45:30.000Z"
  );
  const beforeAccess = access("2026-08-28T12:04:30.000Z");
  const afterAccess = access("2026-08-28T13:52:00.000Z");
  const intentUnsigned = {
    version: "os01-external-mutation-intent.2026.1",
    status: "armed_cleanup_required_before_external_mutation",
    runId,
    seedCommitment,
    targetProjectId,
    targetOrigin,
    sourceAnchor,
    authorityCommit,
    implementationCommit,
    deploymentCommit: temporaryCommit,
    productionSessionLockIdentityHash: lock.lockIdentityHash,
    localArchiveSha256: "f".repeat(64),
    localArchiveBytes: 1000,
    localArchiveFileListRoot: "0".repeat(64),
    localArchiveFileCount: 10,
    localPackageContentRoot: "1".repeat(64),
    environmentBefore: beforeEnvironment,
    accessBefore: beforeAccess,
    sourceHeadBefore: cleanCommit,
    sourcePushExpectedOld: cleanCommit,
    sourceHeadAfter: temporaryCommit,
    temporaryControls: [...os01ControlPlaneContract.temporaryControls].sort(compareCodePoints),
    temporaryControlsSingleUpdate: true,
    temporaryControlExpiresAt: lock.expiresAt,
    temporaryControlAuthSha256: "2".repeat(64),
    temporaryControlBuildAttestation: sourceAnchor,
    temporaryControlEnvironmentRevisionBefore: 25,
    temporaryControlEnvironmentRevisionStaged: 26,
    mutationSequence: [
      "source_compare_and_swap",
      "environment_controls_single_update",
      "sites_save_exact_local_archive",
      "temporary_publish"
    ],
    observedAt: "2026-08-28T12:10:00.000Z"
  };
  const intent = hashed(intentUnsigned, "intentHash");
  writePrivate(paths.externalMutationIntentPath, pretty(intent));

  let previous = "0".repeat(64);
  const phases = [
    ["session_lock_acquired", "2026-08-28T12:00:00.000Z"],
    ["source_anchor_ready", "2026-08-28T12:03:00.000Z"],
    ["deployment_archive_ready", "2026-08-28T12:08:00.000Z"],
    ["external_mutation_armed", "2026-08-28T12:10:00.000Z"],
    ["session_rejected_cleanup_required", "2026-08-28T12:30:00.000Z"]
  ] as const;
  const entries = phases.map(([phase, observedAt], sequence) => {
    const unsigned = {
      version: "os01-session-phase-ledger-entry.2026.1",
      runId,
      sequence,
      phase,
      observedAt,
      previousEntryHash: previous
    };
    const entry = { ...unsigned, entryHash: sha256(stableJson(unsigned)) };
    previous = entry.entryHash;
    return entry;
  });
  const ledgerBytes = Buffer.from(`${entries.map(stableJson).join("\n")}\n`, "utf8");
  writePrivate(paths.phaseLedgerPath, ledgerBytes);
  const rejectionUnsigned = {
    version: "os01-private-seed-session-rejection.2026.1",
    status: "rejected_cleanup_required",
    runId,
    seedCommitment,
    sourceAnchor,
    authorityCommit,
    implementationCommit,
    failurePhase: "proof_and_census",
    lastCommandHash,
    controlsStaged: true,
    externalMutationArmed: true,
    externalMutationIntentHash: intent.intentHash,
    cleanupVerified: false,
    productionSessionLockIdentityHash: lock.lockIdentityHash,
    productionSessionLockDisposition: "retained_for_verified_cleanup",
    productionSessionLockRelease: null,
    phaseLedger: {
      version: "os01-session-phase-ledger.2026.1",
      runId,
      entryCount: 5,
      terminalPhase: "session_rejected_cleanup_required",
      ledgerSha256: sha256(ledgerBytes),
      lastEntryHash: previous
    },
    providerSecretReads: 0,
    providerRequests: 0,
    quotaReservations: 0,
    rejectedAt: "2026-08-28T12:31:00.000Z"
  };
  writePrivate(paths.rejectionReceiptPath, pretty(hashed(rejectionUnsigned, "receiptHash")));

  const httpBodies = [Buffer.from("clean sunday page\n"), Buffer.from("not found\n"), Buffer.from("not allowed\n")];
  const http = [
    { name: "sunday", method: "GET", url: `${targetOrigin}/sunday`, status: 200 },
    { name: "census_get", method: "GET", url: `${targetOrigin}/_ops/engine-os/os01-census-v1`, status: 404 },
    { name: "census_post", method: "POST", url: `${targetOrigin}/_ops/engine-os/os01-census-v1`, status: 405 }
  ].map((value, index) => ({
    ...value,
    observedAt: `2026-08-28T13:5${index + 5}:00.000Z`,
    bodyBase64: httpBodies[index]!.toString("base64"),
    bodySha256: sha256(httpBodies[index]!)
  }));
  const httpBytes = pretty(http);
  writePrivate(paths.manualHttpPath, httpBytes);

  const committedProviderState = {
    source: "production_d1_read_only_quota_metadata",
    projectionComplete: true,
    used: 38,
    remaining: 462,
    lastCost: 0,
    outstandingReservations: 0
  } as const;
  const cleanupUnsigned = {
    version: "os01-rejected-session-manual-cleanup.2026.1",
    status: "verified_manual_cleanup_provider_zero",
    runId,
    targetProjectId,
    targetOrigin,
    productionSessionLockIdentityHash: lock.lockIdentityHash,
    externalMutationIntentHash: intent.intentHash,
    sourceRestoration: {
      branch: "main",
      preRestoreHead: temporaryCommit,
      preRestoreTreeObjectId: temporaryTree,
      expectedOldHead: temporaryCommit,
      restoredHead: cleanCommit,
      postRestoreHead: cleanCommit,
      postRestoreTreeObjectId: cleanTree,
      remoteReadbackHead: cleanCommit,
      remoteReadbackTreeObjectId: cleanTree,
      compareAndSwapApplied: true,
      projectionComplete: true,
      observedAt: "2026-08-28T12:40:00.000Z",
      remoteReadbackObservedAt: "2026-08-28T13:50:00.000Z"
    },
    environment: { before: beforeEnvironment, staged: stagedEnvironment, after: afterEnvironment },
    access: { before: beforeAccess, after: afterAccess },
    cleanVersion: {
      version: os01ControlPlaneContract.version,
      observedAt: "2026-08-28T13:53:00.000Z",
      projectId: targetProjectId,
      versionId: cleanVersionId,
      versionNumber: 165,
      sourceCommit: cleanCommit,
      archiveFormat: "tar",
      archiveContentHash: `sha256:${"3".repeat(64)}`,
      archiveFileCount: 385,
      archiveSizeBytes: 9_605_120
    },
    cleanDeployment: {
      version: os01ControlPlaneContract.version,
      observedAt: "2026-08-28T13:54:00.000Z",
      projectId: targetProjectId,
      deploymentId: cleanDeploymentId,
      versionId: cleanVersionId,
      status: "succeeded",
      type: "publish",
      environmentRevision: 27,
      origin: targetOrigin,
      updatedAt: "2026-08-28T12:48:30.000Z"
    },
    bindings: {
      projectId: targetProjectId,
      d1Bindings: ["DB"],
      r2Bindings: ["EVIDENCE"],
      projectionComplete: true,
      observedAt: "2026-08-28T13:58:00.000Z"
    },
    providerState: {
      ...committedProviderState,
      stateRoot: sha256(stableJson(committedProviderState)),
      observedAt: "2026-08-28T13:58:30.000Z"
    },
    providerActivity: { providerSecretReads: 0, providerRequests: 0, quotaReservations: 0 },
    manualHttpBytesSha256: sha256(httpBytes),
    observedAt: "2026-08-28T13:59:00.000Z"
  } as const;
  const cleanup = hashed(cleanupUnsigned as unknown as JsonRecord, "receiptHash") as unknown as
    Os01RejectedSessionManualCleanupEvidence;
  writePrivate(paths.manualCleanupPath, pretty(cleanup));

  const authorityWithoutHash: Omit<Os01RejectedSessionRecoveryAuthority, "authorityHash"> = {
    version: "os01-rejected-session-recovery-authority.2026.1",
    status: "authorized_exact_rejected_session_recovery",
    targetProjectId,
    targetOrigin,
    runId,
    seedCommitment,
    sourceAnchor,
    authorityCommit,
    implementationCommit,
    expectedFailurePhase: "proof_and_census",
    expectedLastCommandHash: lastCommandHash,
    productionSessionLockIdentityHash: lock.lockIdentityHash,
    lock: { bytesSha256: "", device: "", inode: "", mode: 0o600 },
    artifacts: {
      rejectionReceiptBytesSha256: "",
      phaseLedgerBytesSha256: "",
      externalMutationIntentBytesSha256: "",
      manualCleanupBytesSha256: "",
      manualHttpBytesSha256: ""
    },
    source: {
      temporaryCommit,
      temporaryTreeObjectId: temporaryTree,
      cleanCommit,
      cleanTreeObjectId: cleanTree
    },
    environment: {
      beforeRevision: 25,
      stagedRevision: 26,
      afterRevision: 27,
      stagedAllMetadataRoot: stagedMetadataRoot,
      cleanAllMetadataRoot: cleanMetadataRoot
    },
    access: { revision: 4, principalRoot },
    cleanVersion: { versionId: cleanVersionId, versionNumber: 165 },
    cleanDeploymentId,
    httpBodySha256: {
      sunday: sha256(httpBodies[0]!),
      censusGet: sha256(httpBodies[1]!),
      censusPost: sha256(httpBodies[2]!)
    },
    providerStateRoot: sha256(stableJson(committedProviderState))
  };
  const authority = { ...authorityWithoutHash, authorityHash: "" } as Os01RejectedSessionRecoveryAuthority;
  const refreshAuthority = (): void => {
    const lockMetadata = lstatSync(paths.lockPath, { bigint: true });
    authority.lock = {
      bytesSha256: sha256(readFileSync(paths.lockPath)),
      device: lockMetadata.dev.toString(),
      inode: lockMetadata.ino.toString(),
      mode: 0o600
    };
    authority.artifacts = {
      rejectionReceiptBytesSha256: sha256(readFileSync(paths.rejectionReceiptPath)),
      phaseLedgerBytesSha256: sha256(readFileSync(paths.phaseLedgerPath)),
      externalMutationIntentBytesSha256: sha256(readFileSync(paths.externalMutationIntentPath)),
      manualCleanupBytesSha256: sha256(readFileSync(paths.manualCleanupPath)),
      manualHttpBytesSha256: sha256(readFileSync(paths.manualHttpPath))
    };
    const unsigned = { ...authority } as Omit<Os01RejectedSessionRecoveryAuthority, "authorityHash"> & {
      authorityHash?: string;
    };
    delete unsigned.authorityHash;
    authority.authorityHash = os01RejectedSessionRecoveryAuthorityHash(unsigned);
  };
  refreshAuthority();
  for (const body of httpBodies) body.fill(0);
  ledgerBytes.fill(0);
  httpBytes.fill(0);
  return { root, paths, authority, intent, cleanup, refreshAuthority };
}

function recoveryInput(fixture: Fixture): Os01RejectedSessionRecoveryInput {
  return {
    ...fixture.paths,
    authority: fixture.authority
  };
}

function rewriteHashedJson(path: string, field: string, mutate: (value: JsonRecord) => void): void {
  const value = JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
  delete value[field];
  mutate(value);
  const next = hashed(value, field);
  rmSync(path);
  writePrivate(path, pretty(next));
}

function guardPath(lockPath: string): string {
  return resolve(dirname(lockPath), `.${basename(lockPath)}.conflict-guard`);
}

function detachedPaths(root: string): string[] {
  return readdirSync(root).filter((name) => name.endsWith(".detached"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-28T14:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("OS-01R rejected-session lock recovery", () => {
  it("recovers one exact expired rejected lock, preserves rejection, and opens the successor lane", () => {
    const fixture = makeFixture("success");
    const rejectionBefore = readFileSync(fixture.paths.rejectionReceiptPath);
    const receipt = recoverRejectedOs01ProductionSession(recoveryInput(fixture));

    expect(receipt).toMatchObject({
      status: "expired_rejected_session_lock_recovered_after_verified_manual_cleanup",
      originalSessionStatus: "rejected_cleanup_required",
      originalSessionAcceptanceEffect: "none_rejection_preserved",
      providerSecretReads: 0,
      providerRequests: 0,
      quotaReservations: 0
    });
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
    expect(lstatSync(fixture.paths.recoveryReceiptPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(fixture.paths.rejectionReceiptPath)).toEqual(rejectionBefore);
    const published = JSON.parse(readFileSync(fixture.paths.recoveryReceiptPath, "utf8")) as JsonRecord;
    const { recoveryReceiptHash, ...unsigned } = published;
    expect(recoveryReceiptHash).toBe(sha256(stableJson(unsigned)));

    const successor = Os01ProductionSessionLock.acquire({
      targetProjectId,
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      seedCommitment: "f".repeat(64),
      startedAt: "2026-08-28T14:01:00.000Z",
      expiresAt: "2026-08-28T15:01:00.000Z"
    }, fixture.paths.lockPath);
    expect(successor.terminalDisposition().lockDisposition).toBe("released_before_external_mutation");
    rejectionBefore.fill(0);
  });

  it("refuses recovery at or before expiry without creating a guard", () => {
    const fixture = makeFixture("expiry");
    vi.setSystemTime(new Date("2026-08-28T13:00:00.000Z"));
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/strictly after lock expiry/u);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
  });

  it("rejects a caller-supplied future recovery time instead of using it", () => {
    const fixture = makeFixture("caller-clock");
    const input = {
      ...recoveryInput(fixture),
      recoveredAt: "2099-01-01T00:00:00.000Z"
    } as unknown as Os01RejectedSessionRecoveryInput;
    expect(() => recoverRejectedOs01ProductionSession(input)).toThrow(/unexpected fields/u);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
  });

  it("accepts an observation exactly at the frozen 600-second freshness boundary", () => {
    const fixture = makeFixture("freshness-boundary");
    const cleanup = JSON.parse(readFileSync(fixture.paths.manualCleanupPath, "utf8")) as JsonRecord;
    expect(((cleanup.sourceRestoration as JsonRecord).remoteReadbackObservedAt))
      .toBe("2026-08-28T13:50:00.000Z");
    expect(recoverRejectedOs01ProductionSession(recoveryInput(fixture)).status).toContain("recovered");
  });

  it.each([
    ["source remote readback", (value: JsonRecord, at: string) => {
      (value.sourceRestoration as JsonRecord).remoteReadbackObservedAt = at;
    }],
    ["environment after", (value: JsonRecord, at: string) => {
      ((value.environment as JsonRecord).after as JsonRecord).observedAt = at;
    }],
    ["access after", (value: JsonRecord, at: string) => {
      ((value.access as JsonRecord).after as JsonRecord).observedAt = at;
    }],
    ["clean version", (value: JsonRecord, at: string) => {
      (value.cleanVersion as JsonRecord).observedAt = at;
    }],
    ["clean deployment", (value: JsonRecord, at: string) => {
      (value.cleanDeployment as JsonRecord).observedAt = at;
    }],
    ["bindings", (value: JsonRecord, at: string) => {
      (value.bindings as JsonRecord).observedAt = at;
    }],
    ["provider state", (value: JsonRecord, at: string) => {
      (value.providerState as JsonRecord).observedAt = at;
    }],
    ["manual-cleanup envelope", (value: JsonRecord, at: string) => {
      value.observedAt = at;
    }]
  ] as const)("rejects a non-post-expiry %s observation", (label, mutate) => {
    const fixture = makeFixture(`pre-expiry-${label.replaceAll(" ", "-")}`);
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", (value) => {
      mutate(value, "2026-08-28T13:00:00.000Z");
    });
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture))).toThrow();
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
  });

  it.each([0, 1, 2])("rejects pre-expiry HTTP observation %i", (index) => {
    const fixture = makeFixture(`pre-expiry-http-${index}`);
    const http = JSON.parse(readFileSync(fixture.paths.manualHttpPath, "utf8")) as JsonRecord[];
    http[index]!.observedAt = "2026-08-28T13:00:00.000Z";
    rmSync(fixture.paths.manualHttpPath);
    writePrivate(fixture.paths.manualHttpPath, pretty(http));
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", (value) => {
      value.manualHttpBytesSha256 = sha256(readFileSync(fixture.paths.manualHttpPath));
    });
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture))).toThrow(/HTTP evidence/u);
  });

  it.each([
    ["source remote readback", (value: JsonRecord) => {
      (value.sourceRestoration as JsonRecord).remoteReadbackObservedAt = "2026-08-28T13:49:59.999Z";
    }],
    ["environment after", (value: JsonRecord) => {
      ((value.environment as JsonRecord).after as JsonRecord).observedAt = "2026-08-28T13:49:59.999Z";
    }],
    ["access after", (value: JsonRecord) => {
      ((value.access as JsonRecord).after as JsonRecord).observedAt = "2026-08-28T13:49:59.999Z";
    }],
    ["clean version", (value: JsonRecord) => {
      (value.cleanVersion as JsonRecord).observedAt = "2026-08-28T13:49:59.999Z";
    }],
    ["clean deployment", (value: JsonRecord) => {
      (value.cleanDeployment as JsonRecord).observedAt = "2026-08-28T13:49:59.999Z";
    }],
    ["bindings", (value: JsonRecord) => {
      (value.bindings as JsonRecord).observedAt = "2026-08-28T13:49:59.999Z";
    }],
    ["provider state", (value: JsonRecord) => {
      (value.providerState as JsonRecord).observedAt = "2026-08-28T13:49:59.999Z";
    }],
    ["manual-cleanup envelope", (value: JsonRecord) => {
      value.observedAt = "2026-08-28T13:49:59.999Z";
    }]
  ] as const)("rejects a %s observation one millisecond beyond the freshness window", (label, mutate) => {
    const fixture = makeFixture(`stale-${label.replaceAll(" ", "-")}`);
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", mutate);
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture))).toThrow(/stale|invalid/u);
  });

  it("rejects a future post-clean observation using only wall-clock time", () => {
    const fixture = makeFixture("future-observation");
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", (value) => {
      value.observedAt = "2026-08-28T14:00:00.001Z";
    });
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture))).toThrow(/future/u);
  });

  it.each([
    ["source CAS before rejection", (value: JsonRecord) => {
      (value.sourceRestoration as JsonRecord).observedAt = "2026-08-28T12:31:00.000Z";
    }, /source restoration/u],
    ["source readback before CAS", (value: JsonRecord) => {
      (value.sourceRestoration as JsonRecord).observedAt = "2026-08-28T13:51:00.000Z";
    }, /source restoration/u],
    ["environment update before rejection", (value: JsonRecord) => {
      ((value.environment as JsonRecord).after as JsonRecord).updatedAt = "2026-08-28T12:31:00.000Z";
    }, /environment cleanup/u],
    ["environment readback before update", (value: JsonRecord) => {
      ((value.environment as JsonRecord).after as JsonRecord).updatedAt = "2026-08-28T13:52:00.000Z";
    }, /environment cleanup/u],
    ["deployment update before rejection", (value: JsonRecord) => {
      (value.cleanDeployment as JsonRecord).updatedAt = "2026-08-28T12:31:00.000Z";
    }, /clean deployment/u],
    ["deployment readback before update", (value: JsonRecord) => {
      (value.cleanDeployment as JsonRecord).updatedAt = "2026-08-28T13:55:00.000Z";
    }, /clean deployment/u],
    ["deployment update before source restoration", (value: JsonRecord) => {
      (value.sourceRestoration as JsonRecord).observedAt = "2026-08-28T12:49:00.000Z";
    }, /clean deployment/u],
    ["deployment update before environment restoration", (value: JsonRecord) => {
      ((value.environment as JsonRecord).after as JsonRecord).updatedAt = "2026-08-28T12:49:00.000Z";
    }, /clean deployment/u]
  ] as const)("rejects inverted cleanup chronology: %s", (label, mutate, expected) => {
    const fixture = makeFixture(`ordering-${label.replaceAll(" ", "-")}`);
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", mutate);
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture))).toThrow(expected);
  });

  it("requires every HTTP observation to follow the clean deployment readback", () => {
    const fixture = makeFixture("http-before-deployment");
    const http = JSON.parse(readFileSync(fixture.paths.manualHttpPath, "utf8")) as JsonRecord[];
    http[0]!.observedAt = "2026-08-28T13:53:59.999Z";
    rmSync(fixture.paths.manualHttpPath);
    writePrivate(fixture.paths.manualHttpPath, pretty(http));
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", (value) => {
      value.manualHttpBytesSha256 = sha256(readFileSync(fixture.paths.manualHttpPath));
    });
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/sunday HTTP evidence is invalid/u);
  });

  it.each([
    ["clean deployment before source readback", (value: JsonRecord) => {
      (value.sourceRestoration as JsonRecord).remoteReadbackObservedAt = "2026-08-28T13:55:00.000Z";
    }, /clean deployment/u],
    ["clean deployment before environment readback", (value: JsonRecord) => {
      ((value.environment as JsonRecord).after as JsonRecord).observedAt = "2026-08-28T13:55:00.000Z";
    }, /clean deployment/u],
    ["bindings before clean deployment", (value: JsonRecord) => {
      (value.bindings as JsonRecord).observedAt = "2026-08-28T13:53:59.999Z";
    }, /post-deployment cleanup interval/u],
    ["provider state before clean deployment", (value: JsonRecord) => {
      (value.providerState as JsonRecord).observedAt = "2026-08-28T13:53:59.999Z";
    }, /post-deployment cleanup interval/u]
  ] as const)("rejects prerequisite inversion: %s", (label, mutate, expected) => {
    const fixture = makeFixture(`prerequisite-${label.replaceAll(" ", "-")}`);
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", mutate);
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture))).toThrow(expected);
  });

  it("rejects a forged authority before touching the lock", () => {
    const fixture = makeFixture("authority");
    fixture.authority.authorityHash = "0".repeat(64);
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/authority hash/u);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
  });

  it("binds recovery to the independently authorized lock inode", () => {
    const fixture = makeFixture("lock-inode");
    const bytes = readFileSync(fixture.paths.lockPath);
    rmSync(fixture.paths.lockPath);
    writePrivate(fixture.paths.lockPath, bytes);
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/authorized inode and bytes/u);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
    bytes.fill(0);
  });

  it("rejects noncanonical lock serialization even when its exact new bytes and inode are authorized", () => {
    const fixture = makeFixture("lock-canonical");
    const lock = JSON.parse(readFileSync(fixture.paths.lockPath, "utf8")) as JsonRecord;
    rmSync(fixture.paths.lockPath);
    writePrivate(fixture.paths.lockPath, pretty(lock));
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/bytes are not canonical/u);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
  });

  it("rejects a lock whose private mode changed after authority capture", () => {
    const fixture = makeFixture("lock-mode");
    chmodSync(fixture.paths.lockPath, 0o644);
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/metadata is invalid/u);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
  });

  it.each([
    ["rejection", "rejectionReceiptPath"],
    ["ledger", "phaseLedgerPath"],
    ["intent", "externalMutationIntentPath"],
    ["cleanup", "manualCleanupPath"],
    ["HTTP", "manualHttpPath"]
  ] as const)("rejects changed exact %s bytes", (_label, pathKey) => {
    const fixture = makeFixture(`changed-${pathKey}`);
    writeFileSync(fixture.paths[pathKey], Buffer.from(" \n", "utf8"), { flag: "a" });
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/byte hashes/u);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
  });

  it("rejects a semantically rewritten cleanup-required receipt even when re-authorized by byte hash", () => {
    const fixture = makeFixture("rejection-semantic");
    rewriteHashedJson(fixture.paths.rejectionReceiptPath, "receiptHash", (value) => {
      value.status = "rejected_after_verified_cleanup";
    });
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/rejection receipt is invalid/u);
  });

  it("rejects a ledger with any phase count other than the exact five-entry terminal chain", () => {
    const fixture = makeFixture("ledger-six");
    writeFileSync(fixture.paths.phaseLedgerPath, readFileSync(fixture.paths.phaseLedgerPath), { flag: "a" });
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/exactly five/u);
  });

  it("rejects intent drift even when all mutable receipt hashes are recomputed", () => {
    const fixture = makeFixture("intent-drift");
    let nextIntentHash = "";
    rewriteHashedJson(fixture.paths.externalMutationIntentPath, "intentHash", (value) => {
      value.sourceHeadAfter = "f".repeat(40);
      nextIntentHash = sha256(stableJson(value));
    });
    rewriteHashedJson(fixture.paths.rejectionReceiptPath, "receiptHash", (value) => {
      value.externalMutationIntentHash = nextIntentHash;
    });
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", (value) => {
      value.externalMutationIntentHash = nextIntentHash;
    });
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/external-mutation intent is invalid/u);
  });

  it.each([
    ["source readback", (value: JsonRecord) => {
      (value.sourceRestoration as JsonRecord).remoteReadbackHead = temporaryCommit;
    }, /source restoration/u],
    ["environment cleanup", (value: JsonRecord) => {
      ((value.environment as JsonRecord).after as JsonRecord).captureGatePresent = true;
    }, /environment/u],
    ["access", (value: JsonRecord) => {
      ((value.access as JsonRecord).after as JsonRecord).principalRoot = "0".repeat(64);
    }, /access cleanup/u],
    ["clean deployment", (value: JsonRecord) => {
      (value.cleanDeployment as JsonRecord).environmentRevision = 26;
    }, /clean deployment/u],
    ["bindings", (value: JsonRecord) => {
      (value.bindings as JsonRecord).r2Bindings = [];
    }, /bindings/u],
    ["provider state", (value: JsonRecord) => {
      (value.providerState as JsonRecord).remaining = 461;
    }, /provider state/u],
    ["provider activity", (value: JsonRecord) => {
      (value.providerActivity as JsonRecord).providerRequests = 1;
    }, /provider activity/u]
  ] as const)("rejects incomplete or unsafe manual cleanup: %s", (_label, mutate, message) => {
    const fixture = makeFixture(`cleanup-${_label.replaceAll(" ", "-")}`);
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", mutate);
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture))).toThrow(message);
  });

  it("validates exact HTTP method, status, body, and caller-authorized body hash", () => {
    const fixture = makeFixture("http-status");
    const http = JSON.parse(readFileSync(fixture.paths.manualHttpPath, "utf8")) as JsonRecord[];
    http[1]!.status = 200;
    rmSync(fixture.paths.manualHttpPath);
    writePrivate(fixture.paths.manualHttpPath, pretty(http));
    rewriteHashedJson(fixture.paths.manualCleanupPath, "receiptHash", (value) => {
      value.manualHttpBytesSha256 = sha256(readFileSync(fixture.paths.manualHttpPath));
    });
    fixture.refreshAuthority();
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/census_get HTTP evidence/u);
  });

  it("rejects non-private evidence metadata", () => {
    const fixture = makeFixture("mode");
    chmodSync(fixture.paths.manualHttpPath, 0o644);
    expect(() => recoverRejectedOs01ProductionSession(recoveryInput(fixture)))
      .toThrow(/metadata is invalid/u);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(false);
  });

  it("holds the conflict guard across revalidation and rejects a competing recovery", () => {
    const fixture = makeFixture("contention");
    let competingRejected = false;
    const receipt = recoverRejectedOs01ProductionSession({
      ...recoveryInput(fixture),
      faultInjection: {
        afterConflictGuardAcquired: () => {
          try {
            recoverRejectedOs01ProductionSession(recoveryInput(fixture));
          } catch (error: unknown) {
            competingRejected = /EEXIST|already exists/u.test(String(error));
          }
        }
      }
    });
    expect(competingRejected).toBe(true);
    expect(receipt.status).toContain("recovered");
  });

  it("detects evidence mutation after guard acquisition and leaves the lane fail-closed", () => {
    const fixture = makeFixture("evidence-race");
    expect(() => recoverRejectedOs01ProductionSession({
      ...recoveryInput(fixture),
      faultInjection: {
        afterConflictGuardAcquired: () => {
          writeFileSync(fixture.paths.manualCleanupPath, Buffer.from("x", "utf8"), { flag: "a" });
        }
      }
    })).toThrow(/changed after inspection/u);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(true);
    expect(existsSync(fixture.paths.recoveryReceiptPath)).toBe(false);
  });

  it("rechecks freshness after guard acquisition and refuses detach when evidence ages past 600 seconds", () => {
    const fixture = makeFixture("guard-freshness-race");
    expect(() => recoverRejectedOs01ProductionSession({
      ...recoveryInput(fixture),
      faultInjection: {
        afterConflictGuardAcquired: () => {
          vi.setSystemTime(new Date("2026-08-28T14:10:00.001Z"));
        }
      }
    })).toThrow(/stale/u);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
    expect(existsSync(fixture.paths.recoveryReceiptPath)).toBe(false);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(true);
  });

  it("runs the lock-ownership hook before final freshness validation and before unlink", () => {
    const fixture = makeFixture("detach-freshness-race");
    expect(() => recoverRejectedOs01ProductionSession({
      ...recoveryInput(fixture),
      faultInjection: {
        afterLockOwnershipCheck: () => {
          vi.setSystemTime(new Date("2026-08-28T14:10:00.001Z"));
        }
      }
    })).toThrow(/stale/u);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
    expect(existsSync(fixture.paths.recoveryReceiptPath)).toBe(false);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(true);
  });

  it("inode-fences lock detachment and preserves a racing replacement under the guard", () => {
    const fixture = makeFixture("lock-race");
    const replacement = Buffer.from("racing replacement\n", "utf8");
    expect(() => recoverRejectedOs01ProductionSession({
      ...recoveryInput(fixture),
      faultInjection: {
        afterLockOwnershipCheck: () => {
          rmSync(fixture.paths.lockPath);
          writePrivate(fixture.paths.lockPath, replacement);
        }
      }
    })).toThrow(/ownership changed during recovery/u);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(true);
    const detached = detachedPaths(fixture.root);
    expect(detached).toHaveLength(1);
    expect(readFileSync(resolve(fixture.root, detached[0]!))).toEqual(replacement);
    expect(existsSync(fixture.paths.recoveryReceiptPath)).toBe(false);
    replacement.fill(0);
  });

  it("does not publish over a competing recovery receipt and keeps the guard", () => {
    const fixture = makeFixture("receipt-race");
    const competitor = Buffer.from("competing receipt\n", "utf8");
    expect(() => recoverRejectedOs01ProductionSession({
      ...recoveryInput(fixture),
      faultInjection: {
        beforeReceiptPublication: () => writePrivate(fixture.paths.recoveryReceiptPath, competitor)
      }
    })).toThrow(/EEXIST/u);
    expect(readFileSync(fixture.paths.recoveryReceiptPath)).toEqual(competitor);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(true);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    competitor.fill(0);
  });

  it("detects a lock-path occupant after detach and leaves the published receipt fenced by the guard", () => {
    const fixture = makeFixture("post-detach-occupant");
    const occupant = Buffer.from("unexpected occupant\n", "utf8");
    expect(() => recoverRejectedOs01ProductionSession({
      ...recoveryInput(fixture),
      faultInjection: {
        afterLockDetach: () => writePrivate(fixture.paths.lockPath, occupant)
      }
    })).toThrow(/occupied before recovery commit/u);
    expect(readFileSync(fixture.paths.lockPath)).toEqual(occupant);
    expect(existsSync(fixture.paths.recoveryReceiptPath)).toBe(true);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(true);
    occupant.fill(0);
  });

  it("inode-fences guard removal and reinstalls a blocker after a guard replacement race", () => {
    const fixture = makeFixture("guard-race");
    const replacement = Buffer.from("replacement guard\n", "utf8");
    expect(() => recoverRejectedOs01ProductionSession({
      ...recoveryInput(fixture),
      faultInjection: {
        afterGuardOwnershipCheck: () => {
          rmSync(guardPath(fixture.paths.lockPath));
          writePrivate(guardPath(fixture.paths.lockPath), replacement);
        }
      }
    })).toThrow(/guard ownership changed/u);
    expect(existsSync(fixture.paths.recoveryReceiptPath)).toBe(true);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(existsSync(guardPath(fixture.paths.lockPath))).toBe(true);
    expect(detachedPaths(fixture.root)).toHaveLength(1);
    replacement.fill(0);
  });
});
