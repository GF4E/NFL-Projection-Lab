import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  projectPublicProductionAccess,
  validatePublicProductionAccess
} from "../scripts/os01-control-plane-evidence";
import {
  computeSourceAnchor,
  constructDeploymentProof,
  deriveProductionQualificationContext,
  ProductionQualificationCoordinator,
  productionQualificationSeedCommitment,
  qualificationBuildContext,
  qualificationContextCommitment,
  type DeploymentProofConstructionInput,
  type LocalBuildEvidence,
  type TrustedTarget
} from "../scripts/run_os01_production_census";

const attestation = JSON.parse(
  readFileSync(resolve("config/os01-census-attestation.v1.json"), "utf8")
) as {
  buildIdentity: {
    qualificationBuild: {
      version: string;
      patchSha256: string;
      vinextVersion: string;
      installedToolchainClosureRoot: string;
      installedToolchainPackageCount: number;
      nodeVersion: string;
      nodeExecutableSha256: string;
      pnpmVersion: string;
      pnpmExecutableSha256: string;
      lockfileSha256: string;
      workspaceSha256: string;
    };
  };
};

const observedAt = "2026-08-27T20:00:00.000Z";
const nowMs = Date.parse(observedAt);
const projectId = "appgprj_private_seed_test";
const origin = "https://private-seed.example.test";
const liveBaseCommit = "1".repeat(40);
const implementationCommit = "2".repeat(40);
const deploymentCommit = "3".repeat(40);
const deploymentVersion = "version-private-seed-test";
const sessionRunId = "12345678-1234-4abc-8def-1234567890ab";
const sessionSeedCommitment = "a".repeat(64);

const productionTarget: TrustedTarget = {
  name: "production-test",
  projectId,
  origin,
  accessMode: "production",
  d1Binding: "DB",
  r2Binding: "EVIDENCE",
  loopbackFixture: false
};

const stagingTarget: TrustedTarget = {
  name: "staging-test",
  projectId: "appgprj_owner_only_test",
  origin: "https://owner-only.example.test",
  accessMode: "owner_only",
  d1Binding: "DB",
  r2Binding: null,
  loopbackFixture: false
};

function publicAccessRaw(input: {
  accessMode?: string;
  currentUserRole?: string;
  users?: Array<{ account_user_id: string; is_external: boolean; role: string }>;
  editors?: Array<{ account_user_id: string; is_external: boolean; role: string }>;
  groups?: Array<{ id: string; role: string; size: number }>;
  externalVisitorCount?: number;
} = {}): Record<string, unknown> {
  const users = input.users ?? [{ account_user_id: "owner-id", is_external: false, role: "owner" }];
  return {
    id: projectId,
    current_live_url: origin,
    current_user_role: input.currentUserRole ?? "owner",
    access_policy: {
      project_id: projectId,
      revision: 4,
      access_mode: input.accessMode ?? "public",
      allowed_account_user_ids: users.map((user) => user.account_user_id),
      allowed_workspace_group_ids: [],
      allowed_tenant_group_ids: [],
      allowed_users: users,
      allowed_editors: input.editors ?? [],
      allowed_groups: input.groups ?? [],
      external_visitor_count: input.externalVisitorCount ?? 0
    }
  };
}

function qualificationBuild(
  role: "implementation" | "deployment",
  contextCommitment: string,
  transcriptHash: string
): LocalBuildEvidence["qualificationBuild"] {
  return {
    version: attestation.buildIdentity.qualificationBuild.version,
    role,
    mode: "public_production_private_seed",
    runId: sessionRunId,
    seedCommitment: sessionSeedCommitment,
    contextCommitment,
    transcriptHash,
    toolchainRoot: "b".repeat(64),
    installedToolchainClosureRoot: attestation.buildIdentity.qualificationBuild.installedToolchainClosureRoot,
    installedToolchainPackageCount: attestation.buildIdentity.qualificationBuild.installedToolchainPackageCount,
    nodeVersion: attestation.buildIdentity.qualificationBuild.nodeVersion,
    nodeExecutableSha256: attestation.buildIdentity.qualificationBuild.nodeExecutableSha256,
    pnpmVersion: attestation.buildIdentity.qualificationBuild.pnpmVersion,
    pnpmExecutableSha256: attestation.buildIdentity.qualificationBuild.pnpmExecutableSha256,
    lockfileSha256: attestation.buildIdentity.qualificationBuild.lockfileSha256,
    workspaceSha256: attestation.buildIdentity.qualificationBuild.workspaceSha256,
    vinextVersion: attestation.buildIdentity.qualificationBuild.vinextVersion,
    patchSha256: attestation.buildIdentity.qualificationBuild.patchSha256,
    targetProjectId: projectId,
    targetAccessMode: "production"
  };
}

function localBuild(
  role: "implementation" | "deployment",
  contextCommitment: string,
  transcriptHash: string
): LocalBuildEvidence {
  return {
    builtWorkerHash: "c".repeat(64),
    distRoot: "d".repeat(64),
    archiveFileListRoot: "e".repeat(64),
    fileCount: 3,
    activeBuildGraphHash: "f".repeat(64),
    activeSourceFilesScanned: 1,
    activeBuildFilesScanned: 1,
    compiledAnchorCarrierRoot: "0".repeat(64),
    entryStaticClosureRoot: "1".repeat(64),
    entryStaticFileCount: 1,
    qualificationBuild: qualificationBuild(role, contextCommitment, transcriptHash)
  };
}

function publicProductionProofInput(): DeploymentProofConstructionInput {
  const implementationBuild = localBuild("implementation", "2".repeat(64), "3".repeat(64));
  const deploymentBuild = localBuild("deployment", "4".repeat(64), "5".repeat(64));
  const authorityEvidence = {
    authorityCommit: "4".repeat(40),
    authorityTreeObjectId: "5".repeat(40),
    authorityArchiveSha256: "6".repeat(64),
    authorityArchiveBytes: 1,
    authorityTreeRoot: "7".repeat(64)
  };
  const authorityBridgeCodeRelation = {
    version: "os01-census-authority-bridge-code-relation.test",
    authorityCommit: authorityEvidence.authorityCommit,
    implementationCommit,
    files: [{ path: "worker/os01-census-operator.ts", bytes: 1, sha256: "8".repeat(64) }],
    relationRoot: "9".repeat(64)
  };
  const gitEvidence = {
    liveBaseCommit,
    liveBaseTreeObjectId: "a".repeat(40),
    liveBaseToImplementationNameStatus: [{ status: "M", path: "worker/index.ts" }],
    implementationCommit,
    deploymentCommit,
    implementationTreeObjectId: "b".repeat(40),
    deploymentTreeObjectId: "c".repeat(40),
    implementationArchiveSha256: "d".repeat(64),
    implementationArchiveBytes: 1,
    deploymentArchiveSha256: "e".repeat(64),
    deploymentArchiveBytes: 1,
    implementationToDeploymentNameStatus: [
      { status: "M", path: "worker/os01-census-source-anchor.ts" }
    ],
    implementationToDeploymentDiff: ["worker/os01-census-source-anchor.ts"],
    successorCommitCount: 1,
    sourceTreeAnchor: "f".repeat(64),
    buildInputRoot: "0".repeat(64)
  };
  const sourceAnchor = computeSourceAnchor(
    gitEvidence,
    implementationBuild,
    authorityEvidence,
    authorityBridgeCodeRelation
  );
  const packageManifest = {
    contentRoot: "1".repeat(64),
    fileListRoot: "2".repeat(64),
    fileCount: 3
  };
  const localArchive = {
    archiveSha256: "3".repeat(64),
    archiveBytes: 100,
    contentRoot: packageManifest.contentRoot,
    fileListRoot: packageManifest.fileListRoot,
    fileCount: packageManifest.fileCount
  };
  return {
    target: productionTarget,
    observedAt,
    sourceAnchorEvidence: {
      authorityEvidence,
      authorityBridgeCodeRelation,
      bridgeImplementation: {
        liveBaseCommit: gitEvidence.liveBaseCommit,
        liveBaseTreeObjectId: gitEvidence.liveBaseTreeObjectId,
        liveBaseToImplementationNameStatus: gitEvidence.liveBaseToImplementationNameStatus,
        implementationCommit,
        implementationTreeObjectId: gitEvidence.implementationTreeObjectId,
        implementationArchiveSha256: gitEvidence.implementationArchiveSha256,
        implementationArchiveBytes: gitEvidence.implementationArchiveBytes,
        sourceTreeAnchor: gitEvidence.sourceTreeAnchor
      },
      implementationBuild,
      sourceAnchor
    },
    gitEvidence,
    deploymentBuild,
    packageManifest,
    localArchive,
    qualificationArchiveBoundary: {
      version: "os01-qualification-archive-boundary.2026.6",
      archiveSha256: localArchive.archiveSha256,
      qualificationMode: deploymentBuild.qualificationBuild.mode,
      runId: deploymentBuild.qualificationBuild.runId,
      seedCommitment: deploymentBuild.qualificationBuild.seedCommitment,
      contextCommitment: deploymentBuild.qualificationBuild.contextCommitment,
      fileCount: localArchive.fileCount,
      nonServerFileCount: 1,
      rawContextLeakCount: 0,
      nonServerDerivedCredentialLeakCount: 0,
      scanRoot: "5".repeat(64)
    },
    sitesVersion: {
      version: "os01-sites-control-plane.2026.3",
      observedAt,
      projectId,
      versionId: deploymentVersion,
      versionNumber: 2,
      sourceCommit: deploymentCommit,
      archiveFormat: "tar",
      archiveContentHash: `sha256:${"4".repeat(64)}`,
      archiveFileCount: packageManifest.fileCount,
      archiveSizeBytes: 101
    },
    deployment: {
      version: "os01-sites-control-plane.2026.3",
      observedAt,
      projectId,
      deploymentId: "deployment-private-seed-test",
      versionId: deploymentVersion,
      status: "succeeded",
      type: "publish",
      environmentRevision: 25,
      origin,
      updatedAt: observedAt
    },
    access: projectPublicProductionAccess(publicAccessRaw(), {
      observedAt,
      projectId,
      origin,
      nowMs
    }),
    uploader: {
      version: "os01-trusted-uploader-assertion.2026.3",
      observedAt,
      sourceCommit: deploymentCommit,
      versionId: deploymentVersion,
      localArchiveSha256: localArchive.archiveSha256,
      localArchiveBytes: localArchive.archiveBytes,
      localArchiveFileListRoot: localArchive.fileListRoot,
      localArchiveFileCount: localArchive.fileCount,
      localPackageContentRoot: packageManifest.contentRoot,
      sitesArchiveContentHash: `sha256:${"4".repeat(64)}`,
      uploadMethod: "sites_save_site_version_exact_local_archive" as const,
      remoteBuildRequested: false as const,
      sourceBranch: "main" as const,
      sourceHeadBefore: gitEvidence.liveBaseCommit,
      sourcePushExpectedOld: gitEvidence.liveBaseCommit,
      sourceHeadAfter: deploymentCommit,
      sourceCompareAndSwapApplied: true as const,
      mutationIntentHash: "9".repeat(64),
      temporaryControlExpiresAt: "2026-08-27T20:05:00.000Z",
      temporaryControlAuthSha256: "a".repeat(64),
      temporaryControlBuildAttestation: "b".repeat(64),
      temporaryControlEnvironmentRevisionBefore: 24,
      temporaryControlEnvironmentRevisionStaged: 25,
      temporaryControlsSingleUpdate: true as const,
      externalMutationSequence: [
        "source_compare_and_swap",
        "environment_controls_single_update",
        "sites_save_exact_local_archive",
        "temporary_publish"
      ] as [
        "source_compare_and_swap",
        "environment_controls_single_update",
        "sites_save_exact_local_archive",
        "temporary_publish"
      ],
      trustBoundary: "trusted_sites_connector_plus_trusted_controller_plus_exclusive_qualification_host",
      canonicalizationClaim: "sites_archive_hash_is_opaque_and_not_a_local_tar_hash",
      archivePathBinding: "connector_path_read_is_trusted_not_kernel_attested"
    }
  };
}

describe("OS-01 private-seeded production qualification", () => {
  it("matches the frozen seed, context, and context-commitment vectors", () => {
    const seed = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
    const transcriptHash = "ab".repeat(32);
    const context = deriveProductionQualificationContext(seed, transcriptHash);

    expect(productionQualificationSeedCommitment(seed)).toBe(
      "1e31788faad38fb5906dec239c49ca1394aa340827494c3d26996449e29b89bd"
    );
    expect(Buffer.from(context).toString("hex")).toBe(
      "91e90caae606ec22bcb04fcc8cacc8d9cdbfa8e416990dab49b459fea213031c"
    );
    expect(qualificationContextCommitment(context)).toBe(
      "a3f7e8a689acdacf53e556184ce6baec059ef9717877b8ba1ea1a8dba15fad70"
    );
  });

  it("keeps C0 and C1 role transcripts separate while replicas in one session agree", () => {
    const coordinator = ProductionQualificationCoordinator.start({
      now: new Date(observedAt),
      lifetimeMs: 60_000
    });
    try {
      const c0Transcript = "10".repeat(32);
      const c1Transcript = "20".repeat(32);
      const firstReplica = coordinator.deriveContext(c0Transcript, nowMs);
      const secondReplica = coordinator.deriveContext(c0Transcript, nowMs);
      const deploymentContext = coordinator.deriveContext(c1Transcript, nowMs);

      expect(secondReplica).toEqual(firstReplica);
      expect(qualificationContextCommitment(secondReplica)).toBe(
        qualificationContextCommitment(firstReplica)
      );
      expect(deploymentContext).not.toEqual(firstReplica);
      expect(qualificationContextCommitment(deploymentContext)).not.toBe(
        qualificationContextCommitment(firstReplica)
      );
    } finally {
      coordinator.close();
    }
  });

  it("rejects derivation after expiry or coordinator closure", () => {
    const expired = ProductionQualificationCoordinator.start({
      now: new Date(observedAt),
      lifetimeMs: 1_000
    });
    expect(() => expired.deriveContext("30".repeat(32), nowMs + 1_000)).toThrow(/expired/u);
    expired.close();

    const closed = ProductionQualificationCoordinator.start({
      now: new Date(observedAt),
      lifetimeMs: 60_000
    });
    closed.close();
    expect(() => closed.deriveContext("40".repeat(32), nowMs)).toThrow(/closed/u);
  });

  it("scans control-plane evidence for raw and encoded session material", () => {
    const coordinator = ProductionQualificationCoordinator.start({
      now: new Date(observedAt),
      lifetimeMs: 60_000
    });
    try {
      const context = coordinator.deriveContext("50".repeat(32), nowMs);
      expect(() => coordinator.assertEvidenceBytesSafe(Buffer.from("safe-evidence"), "safe", nowMs)).not.toThrow();
      expect(() => coordinator.assertEvidenceBytesSafe(Buffer.from(context), "raw", nowMs)).toThrow(/qualification material/u);
      expect(() => coordinator.assertEvidenceBytesSafe(
        Buffer.from(Buffer.from(context).toString("hex"), "ascii"),
        "hex",
        nowMs
      )).toThrow(/qualification material/u);
      expect(() => coordinator.assertEvidenceBytesSafe(
        Buffer.from(Buffer.from(context).toString("base64"), "ascii"),
        "base64",
        nowMs
      )).toThrow(/qualification material/u);
      expect(() => coordinator.assertEvidenceBytesSafe(
        Buffer.from(Buffer.from(context).toString("hex").toUpperCase(), "ascii"),
        "uppercase hex",
        nowMs
      )).toThrow(/qualification material/u);
      expect(() => coordinator.assertEvidenceBytesSafe(
        Buffer.from(Buffer.from(context).toString("base64url"), "ascii"),
        "base64url",
        nowMs
      )).toThrow(/qualification material/u);
      const censusBearer = Buffer.from("abcdef0123456789".repeat(4), "ascii");
      coordinator.registerSensitiveMaterial(censusBearer, nowMs);
      expect(() => coordinator.assertEvidenceBytesSafe(censusBearer, "bearer", nowMs))
        .toThrow(/qualification material/u);
      expect(() => coordinator.assertEvidenceBytesSafe(
        Buffer.from(censusBearer.toString("ascii").toUpperCase(), "ascii"),
        "uppercase bearer",
        nowMs
      )).toThrow(/qualification material/u);
      expect(() => coordinator.assertEvidenceBytesSafe(
        Buffer.from(censusBearer.toString("base64url"), "ascii"),
        "base64url bearer",
        nowMs
      )).toThrow(/qualification material/u);
      censusBearer.fill(0);
      context.fill(0);
    } finally {
      coordinator.close();
    }
  });

  it("allows only bounded rejection-evidence scanning after expiry", () => {
    const coordinator = ProductionQualificationCoordinator.start({
      now: new Date(observedAt),
      lifetimeMs: 1_000
    });
    try {
      expect(() => coordinator.assertActive(nowMs + 1_000)).toThrow(/expired/u);
      expect(() => coordinator.assertEvidenceBytesSafe(
        Buffer.from("bounded-rejection"),
        "rejection",
        nowMs + 1_000,
        { allowExpired: true }
      )).not.toThrow();
    } finally {
      coordinator.close();
    }
  });

  it("rejects production without a coordinator and staging with one", () => {
    const common = {
      repositoryRoot: ".",
      pnpmExecutablePath: process.execPath,
      expectedCommit: "0".repeat(40),
      expectedSourceAnchor: "0".repeat(64),
      expectedReady: false,
      role: "implementation" as const
    };
    expect(() => qualificationBuildContext({
      ...common,
      target: productionTarget
    })).toThrow(/entropy mode do not match/u);

    const coordinator = ProductionQualificationCoordinator.start({
      now: new Date(observedAt),
      lifetimeMs: 60_000
    });
    try {
      expect(() => qualificationBuildContext({
        ...common,
        target: stagingTarget,
        productionCoordinator: coordinator
      })).toThrow(/entropy mode do not match/u);
    } finally {
      coordinator.close();
    }
  });

  it("projects and validates only the frozen public-production access shape", () => {
    const projection = projectPublicProductionAccess(publicAccessRaw(), {
      observedAt,
      projectId,
      origin,
      nowMs
    });
    expect(projection).toMatchObject({
      currentUserRole: "owner",
      accessMode: "public",
      allowedAccountUserCount: 1,
      allowedUserCount: 1,
      ownerRoleCount: 1,
      editorCount: 0,
      groupCount: 0,
      externalVisitorCount: 0
    });
    expect(() => validatePublicProductionAccess(projection)).not.toThrow();

    for (const invalid of [
      { ...projection, accessMode: "custom" },
      { ...projection, currentUserRole: "editor" },
      { ...projection, nonOwnerUserCount: 1 },
      { ...projection, editorCount: 1 },
      { ...projection, groupCount: 1 },
      { ...projection, externalVisitorCount: 1 }
    ]) {
      expect(() => validatePublicProductionAccess(invalid)).toThrow(
        /not structurally public with one owner/u
      );
    }
    expect(() => projectPublicProductionAccess(publicAccessRaw({ accessMode: "custom" }), {
      observedAt,
      projectId,
      origin,
      nowMs
    })).toThrow(/not structurally public with one owner/u);
  });

  it("constructs one-session proof and rejects mixed sessions, seeds, or contexts", () => {
    const input = publicProductionProofInput();
    expect(constructDeploymentProof(input)).toMatchObject({
      projectId,
      implementationCommit,
      deploymentCommit
    });

    const withDeploymentQualification = (
      mutate: (value: LocalBuildEvidence["qualificationBuild"]) => LocalBuildEvidence["qualificationBuild"]
    ): DeploymentProofConstructionInput => {
      const qualificationBuild = mutate(input.deploymentBuild.qualificationBuild);
      return {
        ...input,
        deploymentBuild: { ...input.deploymentBuild, qualificationBuild },
        qualificationArchiveBoundary: {
          ...input.qualificationArchiveBoundary,
          qualificationMode: qualificationBuild.mode,
          runId: qualificationBuild.runId,
          seedCommitment: qualificationBuild.seedCommitment,
          contextCommitment: qualificationBuild.contextCommitment
        }
      };
    };

    expect(() => constructDeploymentProof(withDeploymentQualification((value) => ({
      ...value,
      runId: "abcdefab-cdef-4abc-8def-abcdefabcdef"
    })))).toThrow(/do not share one qualification session/u);
    expect(() => constructDeploymentProof(withDeploymentQualification((value) => ({
      ...value,
      seedCommitment: "6".repeat(64)
    })))).toThrow(/do not share one qualification session/u);
    expect(() => constructDeploymentProof(withDeploymentQualification((value) => ({
      ...value,
      contextCommitment: input.sourceAnchorEvidence.implementationBuild.qualificationBuild.contextCommitment
    })))).toThrow(/contexts are not domain-separated/u);
    expect(() => constructDeploymentProof(withDeploymentQualification((value) => ({
      ...value,
      contextCommitment: "not-a-commitment"
    })))).toThrow(/context commitment is not a sha256 hex value/u);
    expect(() => constructDeploymentProof({
      ...input,
      uploader: { ...input.uploader, remoteBuildRequested: true as false }
    })).toThrow(/uploader assertion/u);
    expect(() => constructDeploymentProof({
      ...input,
      uploader: { ...input.uploader, sourcePushExpectedOld: "9".repeat(40) }
    })).toThrow(/uploader assertion/u);
  });
});
