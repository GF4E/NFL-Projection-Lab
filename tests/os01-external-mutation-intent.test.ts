import { describe, expect, it } from "vitest";

import {
  os01ControlPlaneContract,
  type AccessProjection,
  type EnvironmentProjection
} from "../scripts/os01-control-plane-evidence";
import { constructExternalMutationIntent } from "../scripts/run_os01_private_seed_session";

const projectId = "appgprj_os01_intent_test";
const origin = "https://intent.example.test";
const cleanCommit = "e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd";
const deploymentCommit = "7".repeat(40);

function fixtures() {
  const now = Date.now();
  const observedAt = new Date(now).toISOString();
  const startedAt = new Date(now - 1_000).toISOString();
  const expiresAt = new Date(now + 60_000).toISOString();
  const environmentBefore: EnvironmentProjection = {
    version: os01ControlPlaneContract.version,
    observedAt,
    projectId,
    revision: 25,
    updatedAt: null,
    controlsPresent: [],
    controlsAllSecret: true,
    captureGatePresent: false,
    entryCount: 1,
    unrelatedEntryCount: 1,
    unrelatedMetadataRoot: "1".repeat(64),
    allMetadataRoot: "2".repeat(64),
    valueObservation: os01ControlPlaneContract.environmentValueObservation,
    unrelatedValuePreservationBasis: os01ControlPlaneContract.unrelatedValuePreservationBasis
  };
  const accessBefore: AccessProjection = {
    version: os01ControlPlaneContract.version,
    observedAt,
    projectId,
    origin,
    currentUserRole: "owner",
    accessMode: "public",
    revision: 4,
    principalRoot: "3".repeat(64),
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
  const sourceAnchor = "4".repeat(64);
  const censusAuthSha256 = "5".repeat(64);
  const command = {
    command: "arm_external_mutation",
    observedAt,
    environmentBefore,
    accessBefore,
    sourceHeadBefore: cleanCommit,
    sourcePushExpectedOld: cleanCommit,
    sourceHeadAfter: deploymentCommit,
    temporaryControlExpiresAt: expiresAt,
    temporaryControlAuthSha256: censusAuthSha256,
    temporaryControlBuildAttestation: sourceAnchor,
    mutationSequence: [
      "source_compare_and_swap",
      "environment_controls_single_update",
      "sites_save_exact_local_archive",
      "temporary_publish"
    ]
  };
  const boundary = {
    target: { projectId, origin },
    runId: "66666666-6666-4666-8666-666666666666",
    seedCommitment: "6".repeat(64),
    sourceAnchor,
    authorityCommit: "a".repeat(40),
    implementationCommit: "b".repeat(40),
    deploymentCommit,
    coordinatorStartedAt: startedAt,
    coordinatorExpiresAt: expiresAt,
    censusAuthSha256,
    productionSessionLockIdentityHash: "8".repeat(64),
    localArchive: {
      archiveSha256: "9".repeat(64),
      archiveBytes: 1234,
      contentRoot: "a".repeat(64),
      fileListRoot: "b".repeat(64),
      fileCount: 12
    },
    localPackageContentRoot: "a".repeat(64)
  };
  return { command, boundary };
}

describe("OS-01 external-mutation arm command", () => {
  it("constructs one immutable intent bound to prestate, control values, order, expiry, and session ownership", () => {
    const { command, boundary } = fixtures();
    const first = constructExternalMutationIntent({ command, ...boundary });
    const second = constructExternalMutationIntent({ command, ...boundary });

    expect(first.intentHash).toBe(second.intentHash);
    expect(first.intent).toMatchObject({
      status: "armed_cleanup_required_before_external_mutation",
      productionSessionLockIdentityHash: boundary.productionSessionLockIdentityHash,
      localArchiveSha256: boundary.localArchive.archiveSha256,
      localArchiveBytes: boundary.localArchive.archiveBytes,
      localArchiveFileListRoot: boundary.localArchive.fileListRoot,
      localArchiveFileCount: boundary.localArchive.fileCount,
      localPackageContentRoot: boundary.localPackageContentRoot,
      environmentBefore: command.environmentBefore,
      accessBefore: command.accessBefore,
      sourceHeadBefore: cleanCommit,
      sourcePushExpectedOld: cleanCommit,
      sourceHeadAfter: deploymentCommit,
      temporaryControlsSingleUpdate: true,
      temporaryControlExpiresAt: boundary.coordinatorExpiresAt,
      temporaryControlAuthSha256: boundary.censusAuthSha256,
      temporaryControlBuildAttestation: boundary.sourceAnchor,
      temporaryControlEnvironmentRevisionBefore: command.environmentBefore.revision,
      temporaryControlEnvironmentRevisionStaged: command.environmentBefore.revision + 1,
      mutationSequence: command.mutationSequence
    });
  });

  it.each([
    ["expiry", (command: Record<string, unknown>) => ({ ...command, temporaryControlExpiresAt: "2099-01-01T00:00:00.000Z" })],
    ["auth", (command: Record<string, unknown>) => ({ ...command, temporaryControlAuthSha256: "9".repeat(64) })],
    ["build", (command: Record<string, unknown>) => ({ ...command, temporaryControlBuildAttestation: "9".repeat(64) })],
    ["source", (command: Record<string, unknown>) => ({ ...command, sourcePushExpectedOld: "9".repeat(40) })],
    ["order", (command: Record<string, unknown>) => ({
      ...command,
      mutationSequence: [...command.mutationSequence as string[]].reverse()
    })]
  ])("rejects a mismatched %s boundary before authorization", (_label, mutate) => {
    const { command, boundary } = fixtures();
    expect(() => constructExternalMutationIntent({
      command: mutate(command),
      ...boundary
    })).toThrow(/does not match the frozen session boundary/u);
  });
});
