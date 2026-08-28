import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { publishEvidenceBytesExclusive } from "../scripts/os01-atomic-evidence";
import {
  Os01ProductionSessionLock,
  type Os01ProductionSessionLockFaultInjection
} from "../scripts/os01-production-session-lock";
import { validateOs01SessionAcceptance } from "../scripts/os01-session-acceptance";

const temporaryRoots: string[] = [];

function temporaryLockPath(label: string): string {
  const directory = realpathSync(mkdtempSync(resolve(tmpdir(), `os01-session-lock-${label}-`)));
  temporaryRoots.push(directory);
  return resolve(directory, "production.lock");
}

function detachedReplacementPath(path: string): string {
  const prefix = `.${basename(path)}.`;
  const matches = readdirSync(dirname(path))
    .filter((name) => name.startsWith(prefix) && name.endsWith(".detached"));
  if (matches.length !== 1) throw new Error(`expected one detached replacement, found ${matches.length}`);
  return resolve(dirname(path), matches[0]!);
}

function conflictGuardFor(path: string): string {
  return resolve(dirname(path), `.${basename(path)}.conflict-guard`);
}

function identity(input: { runId?: string; startedAt?: string; expiresAt?: string } = {}) {
  return {
    targetProjectId: "appgprj_os01_lock_test",
    runId: input.runId ?? "11111111-1111-4111-8111-111111111111",
    seedCommitment: "a".repeat(64),
    startedAt: input.startedAt ?? "2026-08-28T12:00:00.000Z",
    expiresAt: input.expiresAt ?? "2026-08-28T13:00:00.000Z"
  };
}

async function runTerminalChild(
  path: string,
  mode: "armed_signal" | "unarmed_eof" | "armed_expiry"
): Promise<{ status: number | null; output: Array<Record<string, unknown>> }> {
  const fixture = resolve("tests/fixtures/os01-session-lock-child.ts");
  const child = spawn(process.execPath, ["--import", "tsx", fixture, path, mode], {
    cwd: resolve("."),
    env: { PATH: "/usr/bin:/bin", NODE_ENV: "test" },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  while (!stdout.includes('"event":"ready"')) {
    if (child.exitCode !== null) throw new Error(`lock child exited before ready: ${stderr}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
  if (mode === "armed_signal") child.kill("SIGTERM");
  if (mode === "unarmed_eof") child.stdin.end();
  const [status] = await once(child, "exit") as [number | null, NodeJS.Signals | null];
  if (stderr.length > 0) throw new Error(`lock child wrote stderr: ${stderr}`);
  return {
    status,
    output: stdout.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
  };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const directory = temporaryRoots.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("OS-01 target-global production-session lock", () => {
  it("exclusively owns one target across qualification directories", () => {
    const path = temporaryLockPath("contention");
    const first = Os01ProductionSessionLock.acquire(identity(), path);

    expect(lstatSync(path).mode & 0o777).toBe(0o600);
    expect(() => Os01ProductionSessionLock.acquire(identity({
      runId: "22222222-2222-4222-8222-222222222222"
    }), path)).toThrow(/locked/u);

    const disposition = first.terminalDisposition();
    expect(disposition).toMatchObject({
      cleanupRequired: false,
      lockDisposition: "released_before_external_mutation"
    });
    expect(existsSync(path)).toBe(false);
  });

  it("never reclaims an expired lock automatically", () => {
    const path = temporaryLockPath("expired");
    const expired = Os01ProductionSessionLock.acquire(identity({
      startedAt: "2000-01-01T00:00:00.000Z",
      expiresAt: "2000-01-01T01:00:00.000Z"
    }), path);

    expect(() => Os01ProductionSessionLock.acquire(identity({
      runId: "33333333-3333-4333-8333-333333333333"
    }), path)).toThrow(/stale or expired locks require explicit verified recovery/u);
    expired.terminalDisposition();
  });

  it.each(["signal", "eof", "expiry"])(
    "retains the globally fenced lock on an armed %s terminal path",
    () => {
      const path = temporaryLockPath("armed-terminal");
      const lock = Os01ProductionSessionLock.acquire(identity(), path);
      const intentHash = "b".repeat(64);
      lock.armExternalMutation(intentHash);

      expect(lock.terminalDisposition()).toEqual({
        cleanupRequired: true,
        lockDisposition: "retained_for_verified_cleanup",
        release: null
      });
      lock.close();
      expect(existsSync(path)).toBe(true);
    }
  );

  it("executes an armed signal terminal path and retains the global lock", async () => {
    const path = temporaryLockPath("signal-process");
    const result = await runTerminalChild(path, "armed_signal");
    expect(result.status).toBe(75);
    expect(result.output.at(-1)).toMatchObject({
      event: "terminated",
      cause: "signal",
      cleanupRequired: true,
      lockDisposition: "retained_for_verified_cleanup"
    });
    expect(existsSync(path)).toBe(true);
  });

  it("executes an unarmed EOF terminal path and releases the global lock", async () => {
    const path = temporaryLockPath("eof-process");
    const result = await runTerminalChild(path, "unarmed_eof");
    expect(result.status).toBe(0);
    expect(result.output.at(-1)).toMatchObject({
      event: "terminated",
      cause: "eof",
      cleanupRequired: false,
      lockDisposition: "released_before_external_mutation"
    });
    expect(existsSync(path)).toBe(false);
  });

  it("executes an armed expiry terminal path and retains the global lock", async () => {
    const path = temporaryLockPath("expiry-process");
    const result = await runTerminalChild(path, "armed_expiry");
    expect(result.status).toBe(75);
    expect(result.output.at(-1)).toMatchObject({
      event: "terminated",
      cause: "expiry",
      cleanupRequired: true,
      lockDisposition: "retained_for_verified_cleanup"
    });
    expect(existsSync(path)).toBe(true);
  });

  it("releases only for the exact armed intent after verified cleanup", () => {
    const path = temporaryLockPath("cleanup");
    const lock = Os01ProductionSessionLock.acquire(identity(), path);
    const intentHash = "c".repeat(64);
    lock.armExternalMutation(intentHash);

    expect(() => lock.releaseAfterVerifiedCleanup("d".repeat(64), "2026-08-28T12:30:00.000Z"))
      .toThrow(/does not own/u);
    expect(existsSync(path)).toBe(true);

    expect(lock.releaseAfterVerifiedCleanup(intentHash, "2026-08-28T12:30:00.000Z"))
      .toEqual(expect.objectContaining({
        version: "os01-production-session-lock-release.2026.1",
        releaseReason: "verified_cleanup"
      }));
    expect(existsSync(path)).toBe(false);
    expect(lock.terminalDisposition()).toMatchObject({
      cleanupRequired: false,
      lockDisposition: "released_after_verified_cleanup"
    });
  });

  it("detects lock replacement and refuses to delete a changed lock", () => {
    const path = temporaryLockPath("tamper");
    const lock = Os01ProductionSessionLock.acquire(identity(), path);
    const original = readFileSync(path);
    writeFileSync(path, Buffer.from(`${String(original).trim()}tamper\n`, "utf8"), { mode: 0o600 });
    original.fill(0);

    expect(() => lock.assertOwned()).toThrow(/ownership changed/u);
    lock.close();
    expect(existsSync(path)).toBe(true);
  });

  it("rejects same-byte unlink and recreation because ownership is inode-bound", () => {
    const path = temporaryLockPath("same-byte-recreate");
    const lock = Os01ProductionSessionLock.acquire(identity(), path);
    const original = readFileSync(path);
    rmSync(path);
    writeFileSync(path, original, { mode: 0o600 });
    original.fill(0);

    expect(() => lock.assertOwned()).toThrow(/metadata is invalid/u);
    lock.close();
    expect(existsSync(path)).toBe(true);
  });

  it("will not release a recreated same-byte path after external mutation is armed", () => {
    const path = temporaryLockPath("armed-same-byte-recreate");
    const lock = Os01ProductionSessionLock.acquire(identity(), path);
    const intentHash = "a".repeat(64);
    lock.armExternalMutation(intentHash);
    const original = readFileSync(path);
    rmSync(path);
    writeFileSync(path, original, { mode: 0o600 });
    original.fill(0);

    expect(() => lock.releaseAfterVerifiedCleanup(intentHash, "2026-08-28T12:30:00.000Z"))
      .toThrow(/metadata is invalid/u);
    lock.close();
    expect(existsSync(path)).toBe(true);
  });

  it("publishes acceptance as the owned lock inode and releases only the global pathname", () => {
    const path = temporaryLockPath("acceptance-publication");
    const acceptancePath = resolve(dirname(path), "session-acceptance.json");
    const acceptanceBytes = Buffer.from(
      '{"status":"clean_public_production_census_session_accepted"}\n',
      "utf8"
    );
    const lock = Os01ProductionSessionLock.acquire(identity(), path);
    const intentHash = "e".repeat(64);
    lock.armExternalMutation(intentHash);

    expect(lock.publishAcceptanceMarkerExclusive(acceptancePath, acceptanceBytes)).toBe(acceptancePath);
    expect(lstatSync(acceptancePath, { bigint: true }).ino)
      .toBe(lstatSync(path, { bigint: true }).ino);
    expect(readFileSync(acceptancePath)).toEqual(acceptanceBytes);
    expect(() => lock.assertOwned()).not.toThrow();
    expect(lock.terminalDisposition()).toEqual({
      cleanupRequired: true,
      lockDisposition: "retained_for_verified_cleanup",
      release: null
    });
    expect(() => Os01ProductionSessionLock.acquire(identity({
      runId: "44444444-4444-4444-8444-444444444444"
    }), path)).toThrow(/locked/u);

    lock.releaseAfterVerifiedCleanup(intentHash, "2026-08-28T12:30:00.000Z");
    expect(existsSync(path)).toBe(false);
    expect(existsSync(conflictGuardFor(path))).toBe(false);
    expect(readFileSync(acceptancePath)).toEqual(acceptanceBytes);
    const successor = Os01ProductionSessionLock.acquire(identity({
      runId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    }), path);
    expect(successor.terminalDisposition()).toMatchObject({
      cleanupRequired: false,
      lockDisposition: "released_before_external_mutation"
    });
    acceptanceBytes.fill(0);
  });

  it("does not publish acceptance when the global pathname is replaced after the ownership check", () => {
    const path = temporaryLockPath("acceptance-publication-race");
    const acceptancePath = resolve(dirname(path), "session-acceptance.json");
    const acceptanceBytes = Buffer.from(
      '{"status":"clean_public_production_census_session_accepted"}\n',
      "utf8"
    );
    let replacementInode: bigint | null = null;
    const lock = Os01ProductionSessionLock.acquire(identity(), path, {
      afterAcceptanceOwnershipCheck: () => {
        rmSync(path);
        writeFileSync(path, acceptanceBytes, { mode: 0o600 });
        replacementInode = lstatSync(path, { bigint: true }).ino;
      }
    });

    expect(() => lock.publishAcceptanceMarkerExclusive(
      acceptancePath,
      acceptanceBytes
    )).toThrow(/ownership changed during acceptance publication/u);
    expect(existsSync(acceptancePath)).toBe(false);
    expect(readFileSync(path)).toEqual(acceptanceBytes);
    expect(lstatSync(path, { bigint: true }).ino).toBe(replacementInode);

    lock.close();
    acceptanceBytes.fill(0);
  });

  it.each([
    ["after link and before inode verification", "afterAcceptanceMarkerLink"],
    ["after inode verification and before parent fsync", "afterAcceptanceMarkerVerification"]
  ] as const)(
    "rolls back acceptance and remains fenced on a fault %s",
    (_label, synchronizationPoint) => {
      const path = temporaryLockPath("acceptance-post-link-fault");
      const directory = dirname(path);
      const acceptancePath = resolve(directory, "session-acceptance.json");
      const failurePath = resolve(directory, "session-acceptance-failure.json");
      const acceptanceBytes = Buffer.from(
        '{"status":"clean_public_production_census_session_accepted"}\n',
        "utf8"
      );
      const faultInjection: Os01ProductionSessionLockFaultInjection = {
        [synchronizationPoint]: () => {
          throw new Error(`injected fault at ${synchronizationPoint}`);
        }
      };
      const lock = Os01ProductionSessionLock.acquire(identity(), path, faultInjection);
      const intentHash = "f".repeat(64);
      lock.armExternalMutation(intentHash);
      const originalBytes = readFileSync(path);
      const originalInode = lstatSync(path, { bigint: true }).ino;

      expect(() => lock.publishAcceptanceMarkerExclusive(acceptancePath, acceptanceBytes))
        .toThrow(new RegExp(`injected fault at ${synchronizationPoint}`, "u"));
      expect(existsSync(acceptancePath)).toBe(false);
      expect(readFileSync(path)).toEqual(originalBytes);
      expect(lstatSync(path, { bigint: true }).ino).toBe(originalInode);
      expect(() => lock.assertOwned()).not.toThrow();

      publishEvidenceBytesExclusive(
        failurePath,
        Buffer.from('{"status":"unaccepted_acceptance_commit_failed_lock_retained"}\n', "utf8")
      );
      expect(() => validateOs01SessionAcceptance({
        sessionReceiptBytes: acceptanceBytes,
        censusReceiptBytes: acceptanceBytes,
        externalMutationIntentBytes: acceptanceBytes,
        acceptanceBytes,
        phaseLedgerBytes: acceptanceBytes,
        trustedBoundary: {
          version: "os01-session-acceptance-trust.2026.1",
          runId: "11111111-1111-4111-8111-111111111111",
          seedCommitment: "0".repeat(64),
          targetProjectId: "unused",
          targetOrigin: "https://unused.invalid",
          authorityCommit: "0".repeat(40),
          implementationCommit: "0".repeat(40),
          deploymentCommit: "0".repeat(40),
          sourceAnchor: "0".repeat(64),
          deploymentProofHash: "0".repeat(64),
          externalMutationIntentHash: "0".repeat(64),
          externalMutationIntentBytesSha256: "0".repeat(64),
          archiveSha256: "0".repeat(64),
          archiveBytes: 1,
          archiveFileListRoot: "0".repeat(64),
          archiveContentRoot: "0".repeat(64),
          archiveFileCount: 1,
          localPackageContentRoot: "0".repeat(64),
          productionSessionLockIdentityHash: "0".repeat(64)
        },
        trustedFinalization: {
          version: "os01-session-finalization-trust.2026.1",
          acceptanceTrustRoot: "0".repeat(64),
          runId: "11111111-1111-4111-8111-111111111111",
          seedCommitment: "0".repeat(64),
          targetProjectId: "unused",
          sourceAnchor: "0".repeat(64),
          productionSessionLockIdentityHash: "0".repeat(64),
          censusReceiptBytesSha256: "0".repeat(64),
          censusReceiptHash: "0".repeat(64),
          sessionReceiptBytesSha256: "0".repeat(64),
          sessionReceiptHash: "0".repeat(64),
          phaseLedgerBytesSha256: "0".repeat(64),
          phaseLedgerEntryCount: 7,
          phaseLedgerLastEntryHash: "0".repeat(64),
          censusStartedAt: "2026-08-28T12:00:00.000Z",
          censusCompletedAt: "2026-08-28T12:00:00.000Z",
          completedAt: "2026-08-28T12:00:00.000Z"
        },
        rejectionReceiptPresent: false,
        acceptanceFailureReceiptPresent: existsSync(failurePath)
      })).toThrow(/rejection or acceptance-failure/u);

      expect(lock.terminalDisposition()).toEqual({
        cleanupRequired: true,
        lockDisposition: "retained_for_verified_cleanup",
        release: null
      });
      expect(existsSync(path)).toBe(true);
      expect(() => Os01ProductionSessionLock.acquire(identity({
        runId: "55555555-5555-4555-8555-555555555555"
      }), path)).toThrow(/locked/u);
      lock.close();
      originalBytes.fill(0);
      acceptanceBytes.fill(0);
    }
  );

  it.each([
    ["after link and before inode verification", "afterAcceptanceMarkerLink"],
    ["after inode verification and before parent fsync", "afterAcceptanceMarkerVerification"]
  ] as const)(
    "rejects a non-throwing pathname replacement %s",
    (_label, synchronizationPoint) => {
      const path = temporaryLockPath("acceptance-post-link-replacement");
      const acceptancePath = resolve(dirname(path), "session-acceptance.json");
      const acceptanceBytes = Buffer.from(
        '{"status":"clean_public_production_census_session_accepted"}\n',
        "utf8"
      );
      let replacementInode: bigint | null = null;
      const faultInjection: Os01ProductionSessionLockFaultInjection = {
        [synchronizationPoint]: () => {
          rmSync(path);
          writeFileSync(path, acceptanceBytes, { mode: 0o600 });
          replacementInode = lstatSync(path, { bigint: true }).ino;
        }
      };
      const lock = Os01ProductionSessionLock.acquire(identity(), path, faultInjection);
      lock.armExternalMutation("1".repeat(64));

      expect(() => lock.publishAcceptanceMarkerExclusive(acceptancePath, acceptanceBytes))
        .toThrow(/metadata is invalid/u);
      expect(existsSync(acceptancePath)).toBe(false);
      expect(readFileSync(path)).toEqual(acceptanceBytes);
      expect(lstatSync(path, { bigint: true }).ino).toBe(replacementInode);
      expect(() => Os01ProductionSessionLock.acquire(identity({
        runId: "66666666-6666-4666-8666-666666666666"
      }), path)).toThrow(/locked/u);

      lock.close();
      acceptanceBytes.fill(0);
    }
  );

  it("rejects a pre-link symlink alias even when it resolves to the owned inode", () => {
    const path = temporaryLockPath("acceptance-symlink-alias");
    const directory = dirname(path);
    const aliasPath = resolve(directory, "owned-lock-alias");
    const acceptancePath = resolve(directory, "session-acceptance.json");
    const acceptanceBytes = Buffer.from(
      '{"status":"clean_public_production_census_session_accepted"}\n',
      "utf8"
    );
    const lock = Os01ProductionSessionLock.acquire(identity(), path, {
      afterAcceptanceOwnershipCheck: () => {
        rmSync(path);
        symlinkSync(aliasPath, path);
      }
    });
    lock.armExternalMutation("2".repeat(64));
    linkSync(path, aliasPath);

    expect(() => lock.publishAcceptanceMarkerExclusive(acceptancePath, acceptanceBytes)).toThrow();
    expect(lstatSync(path).isSymbolicLink()).toBe(true);
    if (existsSync(acceptancePath)) {
      expect(readFileSync(acceptancePath)).not.toEqual(acceptanceBytes);
    }
    expect(() => Os01ProductionSessionLock.acquire(identity({
      runId: "77777777-7777-4777-8777-777777777777"
    }), path)).toThrow(/locked/u);

    lock.close();
    acceptanceBytes.fill(0);
  });

  it.each(["regular", "symlink"] as const)(
    "rejects a same-byte %s marker replacement after initial marker verification",
    (replacementType) => {
      const path = temporaryLockPath(`acceptance-marker-${replacementType}-replacement`);
      const directory = dirname(path);
      const aliasPath = resolve(directory, "owned-lock-alias");
      const acceptancePath = resolve(directory, "session-acceptance.json");
      const acceptanceBytes = Buffer.from(
        '{"status":"clean_public_production_census_session_accepted"}\n',
        "utf8"
      );
      const lock = Os01ProductionSessionLock.acquire(identity(), path, {
        afterAcceptanceMarkerVerification: () => {
          rmSync(acceptancePath);
          if (replacementType === "regular") {
            writeFileSync(acceptancePath, acceptanceBytes, { mode: 0o600 });
          } else {
            symlinkSync(aliasPath, acceptancePath);
          }
        }
      });
      lock.armExternalMutation("4".repeat(64));
      const originalBytes = readFileSync(path);
      const originalInode = lstatSync(path, { bigint: true }).ino;
      if (replacementType === "symlink") linkSync(path, aliasPath);

      expect(() => lock.publishAcceptanceMarkerExclusive(acceptancePath, acceptanceBytes))
        .toThrow(/marker ownership changed before publication commit/u);
      expect(existsSync(acceptancePath)).toBe(false);
      expect(readFileSync(path)).toEqual(originalBytes);
      expect(lstatSync(path, { bigint: true }).ino).toBe(originalInode);
      expect(() => lock.assertOwned()).not.toThrow();
      expect(lock.terminalDisposition()).toEqual({
        cleanupRequired: true,
        lockDisposition: "retained_for_verified_cleanup",
        release: null
      });

      lock.close();
      originalBytes.fill(0);
      acceptanceBytes.fill(0);
    }
  );

  it("does not unlink a replacement installed after the release ownership check", () => {
    const path = temporaryLockPath("release-race");
    const acceptancePath = resolve(dirname(path), "session-acceptance.json");
    const intentHash = "3".repeat(64);
    const gapOccupantBytes = Buffer.from("competing gap occupant\n", "utf8");
    let replacementBytes = Buffer.alloc(0);
    let replacementInode: bigint | null = null;
    let gapOccupantInode: bigint | null = null;
    let guardedAcquireRejected = false;
    let injected = false;
    const lock = Os01ProductionSessionLock.acquire(identity(), path, {
      afterReleaseOwnershipCheck: () => {
        if (injected) return;
        injected = true;
        replacementBytes = readFileSync(path);
        rmSync(path);
        writeFileSync(path, replacementBytes, { mode: 0o600 });
        replacementInode = lstatSync(path, { bigint: true }).ino;
      },
      afterReleasePathDetach: () => {
        try {
          Os01ProductionSessionLock.acquire(identity({
            runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
          }), path);
        } catch (error: unknown) {
          guardedAcquireRejected = /conflict guard/u.test(String(error));
        }
        writeFileSync(path, gapOccupantBytes, { flag: "wx", mode: 0o600 });
        gapOccupantInode = lstatSync(path, { bigint: true }).ino;
      }
    });
    lock.armExternalMutation(intentHash);
    lock.publishAcceptanceMarkerExclusive(
      acceptancePath,
      Buffer.from('{"status":"clean_public_production_census_session_accepted"}\n', "utf8")
    );
    replacementBytes = readFileSync(path);

    expect(() => lock.releaseAfterVerifiedCleanup(intentHash, "2026-08-28T12:30:00.000Z"))
      .toThrow(/ownership changed during release/u);
    const detachedPath = detachedReplacementPath(path);
    expect(readFileSync(detachedPath)).toEqual(replacementBytes);
    expect(lstatSync(detachedPath, { bigint: true }).ino).toBe(replacementInode);
    expect(readFileSync(acceptancePath)).toEqual(replacementBytes);
    expect(guardedAcquireRejected).toBe(true);
    expect(readFileSync(path)).toEqual(gapOccupantBytes);
    expect(lstatSync(path, { bigint: true }).ino).toBe(gapOccupantInode);
    expect(existsSync(conflictGuardFor(path))).toBe(true);
    expect(lstatSync(path).isFile()).toBe(true);
    rmSync(path);
    expect(() => Os01ProductionSessionLock.acquire(identity({
      runId: "88888888-8888-4888-8888-888888888888"
    }), path)).toThrow(/locked/u);

    lock.close();
    replacementBytes.fill(0);
    gapOccupantBytes.fill(0);
  });

  it("rejects an acquisition that passed its guard precheck before release established the guard", () => {
    const path = temporaryLockPath("acquire-release-guard-race");
    const first = Os01ProductionSessionLock.acquire(identity(), path, {
      afterReleasePathDetach: () => {
        throw new Error("injected release pause after public-path detach");
      }
    });
    const originalBytes = readFileSync(path);
    const originalInode = lstatSync(path, { bigint: true }).ino;
    let releasePaused = false;

    expect(() => Os01ProductionSessionLock.acquire(identity({
      runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }), path, {
      afterAcquisitionConflictGuardCheck: () => {
        expect(() => first.terminalDisposition())
          .toThrow(/injected release pause after public-path detach/u);
        releasePaused = true;
      }
    })).toThrow(/became locked by a conflict guard/u);

    expect(releasePaused).toBe(true);
    expect(existsSync(conflictGuardFor(path))).toBe(true);
    const detachedPath = detachedReplacementPath(path);
    expect(readFileSync(detachedPath)).toEqual(originalBytes);
    expect(lstatSync(detachedPath, { bigint: true }).ino).toBe(originalInode);
    expect(existsSync(path)).toBe(true);
    rmSync(path);
    expect(() => Os01ProductionSessionLock.acquire(identity({
      runId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    }), path)).toThrow(/locked by a conflict guard/u);

    first.close();
    originalBytes.fill(0);
  });

  it("retains a public replacement after a post-open acquisition failure", () => {
    const path = temporaryLockPath("acquire-post-open-replacement");
    const replacementBytes = Buffer.from("post-open replacement\n", "utf8");
    let replacementInode: bigint | null = null;

    expect(() => Os01ProductionSessionLock.acquire(identity(), path, {
      afterAcquisitionPathOpen: () => {
        rmSync(path);
        writeFileSync(path, replacementBytes, { mode: 0o600 });
        replacementInode = lstatSync(path, { bigint: true }).ino;
      }
    })).toThrow(/inode is invalid/u);

    expect(readFileSync(path)).toEqual(replacementBytes);
    expect(lstatSync(path, { bigint: true }).ino).toBe(replacementInode);
    expect(() => Os01ProductionSessionLock.acquire(identity({
      runId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    }), path)).toThrow(/locked/u);
    replacementBytes.fill(0);
  });

  it.each(["symlink", "directory"] as const)(
    "preserves a detached %s replacement and leaves the public lane blocked",
    (replacementType) => {
      const path = temporaryLockPath(`release-${replacementType}-race`);
      let replacementInode: bigint | null = null;
      const lock = Os01ProductionSessionLock.acquire(identity(), path, {
        afterReleaseOwnershipCheck: () => {
          rmSync(path);
          if (replacementType === "symlink") {
            symlinkSync("preserved-replacement-target", path);
          } else {
            mkdirSync(path, { mode: 0o700 });
            writeFileSync(resolve(path, "sentinel"), "preserved\n", { mode: 0o600 });
          }
          replacementInode = lstatSync(path, { bigint: true }).ino;
        }
      });

      expect(() => lock.terminalDisposition()).toThrow(/ownership changed during release/u);
      const detachedPath = detachedReplacementPath(path);
      expect(lstatSync(detachedPath, { bigint: true }).ino).toBe(replacementInode);
      if (replacementType === "symlink") {
        expect(lstatSync(detachedPath).isSymbolicLink()).toBe(true);
        expect(readlinkSync(detachedPath)).toBe("preserved-replacement-target");
      } else {
        expect(lstatSync(detachedPath).isDirectory()).toBe(true);
        expect(readFileSync(resolve(detachedPath, "sentinel"), "utf8")).toBe("preserved\n");
      }
      expect(lstatSync(path).isFile()).toBe(true);
      expect(() => Os01ProductionSessionLock.acquire(identity({
        runId: "99999999-9999-4999-8999-999999999999"
      }), path)).toThrow(/locked/u);

      lock.close();
    }
  );
});
