import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  os01SessionFinalizationTrustRoot,
  os01SessionAcceptanceTrustRoot,
  validateOs01SessionAcceptance,
  type Os01SessionAcceptanceTrust,
  type Os01SessionFinalizationTrust
} from "../scripts/os01-session-acceptance";

type JsonRecord = Record<string, unknown>;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function bytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function hashed(value: JsonRecord, field: string): JsonRecord {
  const unsigned = structuredClone(value);
  delete unsigned[field];
  return { ...unsigned, [field]: hash(unsigned) };
}

type Evidence = {
  receipt: JsonRecord;
  censusReceipt: JsonRecord;
  externalMutationIntent: JsonRecord;
  acceptance: JsonRecord;
  phaseLedgerBytes: Buffer;
  trustedBoundary: Os01SessionAcceptanceTrust;
  trustedFinalization: Os01SessionFinalizationTrust;
};

function evidence(): Evidence {
  const runId = "11111111-1111-4111-8111-111111111111";
  const seedCommitment = "a".repeat(64);
  const sourceAnchor = "b".repeat(64);
  const projectId = "appgprj_6a7ba1bc638c819197788ab281abfbc3";
  const origin = "https://nfl-projection-lab-2026.psoiawesome.chatgpt.site";
  const implementationCommit = "2977c9e8cb6ead16b37ec926e35c93d5fb89c04f";
  const authorityCommit = "2".repeat(40);
  const deploymentCommit = "1".repeat(40);
  const deploymentTreeObjectId = "3".repeat(40);
  const liveBaseTreeObjectId = "4".repeat(40);
  const deploymentVersion = `${projectId}~appgver_${"2".repeat(32)}`;
  const cleanSourceCommit = "e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd";
  const cleanVersionId = `${projectId}~appgver_1e68c8989b1c8191ba0dc533519c65b3`;
  const startedAt = "2026-08-28T12:00:00.000Z";
  const censusStartedAt = "2026-08-28T12:20:00.000Z";
  const censusCompletedAt = "2026-08-28T12:25:00.000Z";
  const completedAt = "2026-08-28T12:30:00.000Z";
  const expiresAt = "2026-08-28T13:00:00.000Z";
  const phases = [
    "session_lock_acquired", "source_anchor_ready", "deployment_archive_ready", "external_mutation_armed",
    "proof_and_census_complete", "cleanup_verified", "session_complete"
  ];
  const phaseTimes = [
    startedAt, "2026-08-28T12:01:00.000Z", "2026-08-28T12:05:00.000Z",
    "2026-08-28T12:10:00.000Z", censusCompletedAt, completedAt, completedAt
  ];
  let previousEntryHash = "0".repeat(64);
  const phaseLines = phases.map((phase, sequence) => {
    const unsigned = {
      version: "os01-session-phase-ledger-entry.2026.1",
      runId,
      sequence,
      phase,
      observedAt: phaseTimes[sequence],
      previousEntryHash
    };
    const entry = { ...unsigned, entryHash: hash(unsigned) };
    previousEntryHash = entry.entryHash;
    return JSON.stringify(stable(entry));
  });
  const cleanupPhaseBytes = Buffer.from(`${phaseLines.slice(0, 6).join("\n")}\n`, "utf8");
  const phaseLedgerBytes = Buffer.from(`${phaseLines.join("\n")}\n`, "utf8");
  const cleanupLastEntry = JSON.parse(phaseLines[5]!) as JsonRecord;

  const lockUnsigned = {
    version: "os01-production-session-lock.2026.1",
    targetProjectId: projectId,
    runId,
    seedCommitment,
    startedAt,
    expiresAt,
    ownerTokenSha256: "3".repeat(64)
  };
  const lock = { ...lockUnsigned, lockIdentityHash: hash(lockUnsigned) };
  const controlVersion = "os01-sites-control-plane.2026.3";
  const beforeEnvironment = {
    version: controlVersion,
    observedAt: "2026-08-28T12:09:00.000Z",
    projectId,
    revision: 25,
    updatedAt: "2026-08-28T11:00:00.000Z",
    controlsPresent: [],
    controlsAllSecret: true,
    captureGatePresent: false,
    entryCount: 1,
    unrelatedEntryCount: 1,
    unrelatedMetadataRoot: "4".repeat(64),
    allMetadataRoot: "5".repeat(64),
    valueObservation: "prohibited",
    unrelatedValuePreservationBasis: "sites_update_only_listed_keys_change"
  };
  const stagedEnvironment = {
    ...beforeEnvironment,
    observedAt: "2026-08-28T12:11:00.000Z",
    revision: 26,
    updatedAt: "2026-08-28T12:11:00.000Z",
    controlsPresent: [
      "OS01_CENSUS_AUTH_SHA256", "OS01_CENSUS_BUILD_ATTESTATION", "OS01_CENSUS_EXPIRES_AT"
    ],
    entryCount: 4,
    allMetadataRoot: "6".repeat(64)
  };
  const afterEnvironment = {
    ...beforeEnvironment,
    observedAt: "2026-08-28T12:27:00.000Z",
    revision: 27,
    updatedAt: "2026-08-28T12:27:00.000Z"
  };
  const accessBefore = {
    version: controlVersion,
    observedAt: "2026-08-28T12:09:00.000Z",
    projectId,
    origin,
    currentUserRole: "owner",
    accessMode: "public",
    revision: 3,
    principalRoot: "7".repeat(64),
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
  const accessAfter = { ...accessBefore, observedAt: "2026-08-28T12:28:00.000Z" };
  const qualificationBuild = {
    version: "os01-vinext-qualification-build.2026.2",
    role: "deployment",
    mode: "public_production_private_seed",
    runId,
    seedCommitment,
    contextCommitment: "8".repeat(64),
    transcriptHash: "9".repeat(64),
    toolchainRoot: "a".repeat(64),
    installedToolchainClosureRoot: "139a4448086f6e955de8ff32cfe26fa11464b89cd9597e2bc8c7b367e79eb6fc",
    installedToolchainPackageCount: 580,
    nodeVersion: "v24.19.0",
    nodeExecutableSha256: "27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1",
    pnpmVersion: "11.16.0",
    pnpmExecutableSha256: "65cb7439d9b023b95d0e19d843adf14e0654426ef85ad4ecd33d58849315f669",
    lockfileSha256: "daf4dac4be7acca701141ec59050ab7d309ea9573109f567bcf01100c03965e2",
    workspaceSha256: "f309c3c526eb2f4b6da28ddcebb819d9781683da959e0f63d249bd467abf2447",
    vinextVersion: "1.0.0-beta.2",
    patchSha256: "2ad276eb7bcc894f98c12e28c9614a790ab9771b697071971b441c7d5ef58ba8",
    targetProjectId: projectId,
    targetAccessMode: "production"
  };
  const archive = {
    archiveSha256: "1".repeat(64),
    archiveBytes: 100,
    fileListRoot: "2".repeat(64),
    contentRoot: "3".repeat(64),
    fileCount: 20
  };
  const qualificationArchiveBoundary = {
    version: "os01-qualification-archive-boundary.2026.6",
    archiveSha256: archive.archiveSha256,
    qualificationMode: qualificationBuild.mode,
    runId,
    seedCommitment,
    contextCommitment: qualificationBuild.contextCommitment,
    fileCount: archive.fileCount,
    nonServerFileCount: 18,
    rawContextLeakCount: 0,
    nonServerDerivedCredentialLeakCount: 0,
    scanRoot: "d".repeat(64)
  };
  const authorityEvidence = {
    authorityCommit,
    authorityTreeObjectId: "5".repeat(40),
    authorityArchiveSha256: "6".repeat(64),
    authorityArchiveBytes: 100,
    authorityTreeRoot: "7".repeat(64)
  };
  const authorityBridgeCodeRelation = {
    version: "os01-census-authority-bridge-code-relation.2026.3",
    authorityCommit,
    implementationCommit,
    files: [],
    relationRoot: "8".repeat(64)
  };
  const proofBuild = {
    activeBuildFilesScanned: 1,
    activeBuildGraphHash: "0".repeat(64),
    activeSourceFilesScanned: 1,
    buildInputRoot: "1".repeat(64),
    builtWorkerHash: "2".repeat(64),
    compiledAnchorCarrierRoot: "3".repeat(64),
    distFileCount: 1,
    distFileListRoot: "4".repeat(64),
    distRoot: "5".repeat(64),
    entryStaticClosureRoot: "6".repeat(64),
    entryStaticFileCount: 1,
    localArchiveBytes: archive.archiveBytes,
    localArchiveContentRoot: archive.contentRoot,
    localArchiveFileCount: archive.fileCount,
    localArchiveFileListRoot: archive.fileListRoot,
    localArchiveFormat: "tar.gz",
    localArchiveSha256: archive.archiveSha256,
    packageContentRoot: archive.contentRoot,
    packageFileCount: archive.fileCount,
    packageFileListRoot: archive.fileListRoot,
    qualificationArchiveBoundary,
    qualificationBuild,
    sitesArchiveContentHash: `sha256:${"9".repeat(64)}`
  };
  const externalMutationIntentUnsigned: JsonRecord = {
    version: "os01-external-mutation-intent.2026.1",
    status: "armed_cleanup_required_before_external_mutation",
    runId,
    seedCommitment,
    targetProjectId: projectId,
    targetOrigin: origin,
    sourceAnchor,
    authorityCommit,
    implementationCommit,
    deploymentCommit,
    productionSessionLockIdentityHash: lock.lockIdentityHash,
    localArchiveSha256: archive.archiveSha256,
    localArchiveBytes: archive.archiveBytes,
    localArchiveFileListRoot: archive.fileListRoot,
    localArchiveFileCount: archive.fileCount,
    localPackageContentRoot: proofBuild.packageContentRoot,
    environmentBefore: beforeEnvironment,
    accessBefore,
    sourceHeadBefore: cleanSourceCommit,
    sourcePushExpectedOld: cleanSourceCommit,
    sourceHeadAfter: deploymentCommit,
    temporaryControls: [
      "OS01_CENSUS_AUTH_SHA256", "OS01_CENSUS_BUILD_ATTESTATION", "OS01_CENSUS_EXPIRES_AT"
    ],
    temporaryControlsSingleUpdate: true,
    temporaryControlExpiresAt: expiresAt,
    temporaryControlAuthSha256: "e".repeat(64),
    temporaryControlBuildAttestation: sourceAnchor,
    temporaryControlEnvironmentRevisionBefore: beforeEnvironment.revision,
    temporaryControlEnvironmentRevisionStaged: stagedEnvironment.revision,
    mutationSequence: [
      "source_compare_and_swap", "environment_controls_single_update",
      "sites_save_exact_local_archive", "temporary_publish"
    ],
    observedAt: "2026-08-28T12:10:00.000Z"
  };
  const externalMutationIntent = hashed(externalMutationIntentUnsigned, "intentHash");
  const uploader = {
    version: "os01-trusted-uploader-assertion.2026.3",
    observedAt: "2026-08-28T12:14:00.000Z",
    sourceCommit: deploymentCommit,
    versionId: deploymentVersion,
    localArchiveSha256: archive.archiveSha256,
    localArchiveBytes: archive.archiveBytes,
    localArchiveFileListRoot: archive.fileListRoot,
    localArchiveFileCount: archive.fileCount,
    localPackageContentRoot: proofBuild.packageContentRoot,
    sitesArchiveContentHash: `sha256:${"9".repeat(64)}`,
    uploadMethod: "sites_save_site_version_exact_local_archive",
    remoteBuildRequested: false,
    sourceBranch: "main",
    sourceHeadBefore: cleanSourceCommit,
    sourcePushExpectedOld: cleanSourceCommit,
    sourceHeadAfter: deploymentCommit,
    sourceCompareAndSwapApplied: true,
    mutationIntentHash: externalMutationIntent.intentHash,
    temporaryControlExpiresAt: expiresAt,
    temporaryControlAuthSha256: externalMutationIntent.temporaryControlAuthSha256,
    temporaryControlBuildAttestation: sourceAnchor,
    temporaryControlEnvironmentRevisionBefore: beforeEnvironment.revision,
    temporaryControlEnvironmentRevisionStaged: stagedEnvironment.revision,
    temporaryControlsSingleUpdate: true,
    externalMutationSequence: externalMutationIntent.mutationSequence,
    trustBoundary: "trusted_sites_connector_plus_trusted_controller_plus_exclusive_qualification_host",
    canonicalizationClaim: "sites_archive_hash_is_opaque_and_not_a_local_tar_hash",
    archivePathBinding: "connector_path_read_is_trusted_not_kernel_attested"
  };
  const commonPassRoot = "4".repeat(64);
  const deploymentProof: JsonRecord = {
    version: "os01-census-deployment-proof.2026.3",
    status: "ready_for_census",
    implementationCommit,
    deploymentCommit,
    projectId,
    sourceAnchor,
    implementationToDeploymentDiff: ["worker/os01-census-source-anchor.ts"],
    observedAt: "2026-08-28T12:15:00.000Z",
    build: proofBuild,
    sitesVersion: {
      versionId: deploymentVersion,
      versionNumber: 166,
      sourceCommit: deploymentCommit,
      archiveContentHash: `sha256:${"9".repeat(64)}`,
      archiveFormat: "tar",
      archiveFileCount: archive.fileCount,
      archiveSizeBytes: archive.archiveBytes
    },
    uploader,
    deployment: {
      deploymentId: "temporary-deployment",
      status: "succeeded",
      versionId: deploymentVersion,
      environmentRevision: 26,
      accessPolicyRevision: 3,
      origin
    },
    sourceIdentity: {
      authorityBridgeCodeRelation,
      authorityEvidence,
      buildInputRoot: proofBuild.buildInputRoot,
      deploymentArchiveBytes: archive.archiveBytes,
      deploymentArchiveSha256: archive.archiveSha256,
      implementationCommit,
      deploymentCommit,
      deploymentTreeObjectId,
      fullTreeIdentityVersion: "os01-census-full-tree.2026.1",
      implementationArchiveBytes: 100,
      implementationArchiveSha256: "a".repeat(64),
      implementationBuild: {},
      implementationToDeploymentNameStatus: [
        { status: "M", path: "worker/os01-census-source-anchor.ts" }
      ],
      implementationTreeObjectId: "b".repeat(40),
      liveBaseCommit: cleanSourceCommit,
      liveBaseToImplementationNameStatus: [],
      liveBaseTreeObjectId,
      sourceAnchor,
      sourceTreeAnchor: "c".repeat(64),
      successorCommitCount: 1
    }
  };
  const censusUnsigned: JsonRecord = {
    version: "os01-production-census-receipt.2026.1",
    status: "accepted_two_identical_read_only_passes",
    startedAt: censusStartedAt,
    completedAt: censusCompletedAt,
    sourceCommit: deploymentCommit,
    deploymentVersion,
    target: { name: "production", projectId, origin, accessMode: "production", loopbackFixture: false },
    reservationHash: "5".repeat(64),
    buildAttestation: sourceAnchor,
    attestationContractHash: "6".repeat(64),
    trustedTargetContractHash: "7".repeat(64),
    deploymentProofHash: createHash("sha256").update(bytes(deploymentProof)).digest("hex"),
    deploymentProof,
    contractVersion: "os01-production-census.2026.1",
    contractHash: "9".repeat(64),
    prestateClassHash: "a".repeat(64),
    operatorSourceHash: "b".repeat(64),
    deployedOperatorSourceHash: "b".repeat(64),
    migrationByteHashes: [{ tag: "0000", sha256: "c".repeat(64) }],
    classification: { accepted: true },
    firstPass: { passNumber: 1, passRoot: commonPassRoot },
    secondPass: { passNumber: 2, passRoot: commonPassRoot },
    commonPassRoot,
    providerSecretReads: 0,
    providerRequests: 0,
    quotaReservations: 0
  };
  const censusReceipt = hashed(censusUnsigned, "receiptHash");
  const providerCommitted = {
    source: "production_d1_read_only_quota_metadata",
    projectionComplete: true,
    used: 38,
    remaining: 462,
    lastCost: 0,
    outstandingReservations: 0
  };
  const receiptUnsigned: JsonRecord = {
    version: "os01-private-seed-session-receipt.2026.4",
    status: "verified_cleanup_pending_acceptance_marker",
    runId,
    seedCommitment,
    sourceAnchor,
    authorityCommit,
    implementationCommit,
    deploymentCommit,
    temporaryDeploymentVersionId: deploymentVersion,
    qualificationBuild,
    archive,
    qualificationArchiveBoundary,
    censusStatus: "accepted_two_identical_read_only_passes",
    censusReceiptHash: censusReceipt.receiptHash,
    uploaderAssertionRoot: hash(uploader),
    externalMutationIntentHash: externalMutationIntent.intentHash,
    externalMutationIntentRoot: externalMutationIntent.intentHash,
    productionSessionLock: lock,
    productionSessionLockIdentityHash: lock.lockIdentityHash,
    productionSessionLockDisposition: "retained_until_acceptance_publication",
    phaseLedgerAtCleanup: {
      version: "os01-session-phase-ledger.2026.1",
      runId,
      entryCount: 6,
      terminalPhase: null,
      ledgerSha256: createHash("sha256").update(cleanupPhaseBytes).digest("hex"),
      lastEntryHash: cleanupLastEntry.entryHash
    },
    environment: { before: beforeEnvironment, staged: stagedEnvironment, after: afterEnvironment },
    access: { before: accessBefore, after: accessAfter },
    cleanVersion: {
      version: controlVersion,
      observedAt: "2026-08-28T12:28:00.000Z",
      projectId,
      versionId: cleanVersionId,
      versionNumber: 165,
      sourceCommit: cleanSourceCommit,
      archiveFormat: "tar.gz",
      archiveContentHash: `sha256:${"1".repeat(64)}`,
      archiveFileCount: 50,
      archiveSizeBytes: 1000
    },
    cleanDeployment: {
      version: controlVersion,
      observedAt: "2026-08-28T12:29:00.000Z",
      projectId,
      deploymentId: "deployment-clean",
      versionId: cleanVersionId,
      status: "succeeded",
      type: "publish",
      environmentRevision: 27,
      origin,
      updatedAt: "2026-08-28T12:28:30.000Z"
    },
    sourceRestoration: {
      observedAt: "2026-08-28T12:27:00.000Z",
      branch: "main",
      preRestoreHead: deploymentCommit,
      preRestoreTreeObjectId: deploymentTreeObjectId,
      expectedOldHead: deploymentCommit,
      restoredHead: cleanSourceCommit,
      postRestoreHead: cleanSourceCommit,
      postRestoreTreeObjectId: liveBaseTreeObjectId,
      compareAndSwapApplied: true,
      projectionComplete: true
    },
    cleanHttp: [
      { name: "sunday", method: "GET", url: `${origin}/sunday`, status: 200,
        observedAt: "2026-08-28T12:29:00.000Z", bodySha256: "5".repeat(64), bodyBytes: 100 },
      { name: "census_get", method: "GET", url: `${origin}/_ops/engine-os/os01-census-v1`, status: 404,
        observedAt: "2026-08-28T12:29:10.000Z", bodySha256: "6".repeat(64), bodyBytes: 0 },
      { name: "census_post", method: "POST", url: `${origin}/_ops/engine-os/os01-census-v1`, status: 405,
        observedAt: "2026-08-28T12:29:20.000Z", bodySha256: "7".repeat(64), bodyBytes: 0 }
    ],
    bindings: {
      observedAt: "2026-08-28T12:29:00.000Z", projectId, projectionComplete: true,
      d1Bindings: ["DB"], r2Bindings: ["EVIDENCE"]
    },
    providerState: {
      observedAt: "2026-08-28T12:29:00.000Z", ...providerCommitted, stateRoot: hash(providerCommitted)
    },
    providerSecretReads: 0,
    providerRequests: 0,
    quotaReservations: 0,
    completedAt
  };
  const receipt = hashed(receiptUnsigned, "receiptHash");
  const trustedBoundary: Os01SessionAcceptanceTrust = {
    version: "os01-session-acceptance-trust.2026.1",
    runId,
    seedCommitment,
    targetProjectId: projectId,
    targetOrigin: origin,
    authorityCommit,
    implementationCommit,
    deploymentCommit,
    sourceAnchor,
    deploymentProofHash: censusUnsigned.deploymentProofHash as string,
    externalMutationIntentHash: externalMutationIntent.intentHash as string,
    externalMutationIntentBytesSha256: createHash("sha256")
      .update(bytes(externalMutationIntent))
      .digest("hex"),
    archiveSha256: archive.archiveSha256,
    archiveBytes: archive.archiveBytes,
    archiveFileListRoot: archive.fileListRoot,
    archiveContentRoot: archive.contentRoot,
    archiveFileCount: archive.fileCount,
    localPackageContentRoot: proofBuild.packageContentRoot,
    productionSessionLockIdentityHash: lock.lockIdentityHash
  };
  const trustedFinalization: Os01SessionFinalizationTrust = {
    version: "os01-session-finalization-trust.2026.1",
    acceptanceTrustRoot: os01SessionAcceptanceTrustRoot(trustedBoundary),
    runId,
    seedCommitment,
    targetProjectId: projectId,
    sourceAnchor,
    productionSessionLockIdentityHash: lock.lockIdentityHash,
    censusReceiptBytesSha256: createHash("sha256").update(bytes(censusReceipt)).digest("hex"),
    censusReceiptHash: censusReceipt.receiptHash as string,
    sessionReceiptBytesSha256: createHash("sha256").update(bytes(receipt)).digest("hex"),
    sessionReceiptHash: receipt.receiptHash as string,
    phaseLedgerBytesSha256: createHash("sha256").update(phaseLedgerBytes).digest("hex"),
    phaseLedgerEntryCount: 7,
    phaseLedgerLastEntryHash: previousEntryHash,
    censusStartedAt,
    censusCompletedAt,
    completedAt
  };
  const acceptanceUnsigned: JsonRecord = {
    version: "os01-private-seed-session-acceptance.2026.4",
    status: "clean_public_production_census_session_accepted",
    runId,
    seedCommitment,
    sourceAnchor,
    sessionReceiptHash: receipt.receiptHash,
    trustBoundaryRoot: os01SessionAcceptanceTrustRoot(trustedBoundary),
    finalizationTrustRoot: os01SessionFinalizationTrustRoot(trustedFinalization, trustedBoundary),
    productionSessionLockIdentityHash: lock.lockIdentityHash,
    phaseLedger: {
      version: "os01-session-phase-ledger.2026.1",
      runId,
      entryCount: 7,
      terminalPhase: "session_complete",
      ledgerSha256: createHash("sha256").update(phaseLedgerBytes).digest("hex"),
      lastEntryHash: previousEntryHash
    },
    acceptedAt: completedAt
  };
  const acceptance = hashed(acceptanceUnsigned, "acceptanceHash");
  return {
    receipt, censusReceipt, externalMutationIntent, acceptance, phaseLedgerBytes,
    trustedBoundary, trustedFinalization
  };
}

function validate(value: Evidence, neighbors = { rejection: false, failure: false }): void {
  validateOs01SessionAcceptance({
    sessionReceiptBytes: bytes(value.receipt),
    censusReceiptBytes: bytes(value.censusReceipt),
    externalMutationIntentBytes: bytes(value.externalMutationIntent),
    acceptanceBytes: bytes(value.acceptance),
    phaseLedgerBytes: value.phaseLedgerBytes,
    trustedBoundary: value.trustedBoundary,
    trustedFinalization: value.trustedFinalization,
    rejectionReceiptPresent: neighbors.rejection,
    acceptanceFailureReceiptPresent: neighbors.failure
  });
}

function bindReceipt(value: Evidence, receiptUnsigned: JsonRecord): Evidence {
  const receipt = hashed(receiptUnsigned, "receiptHash");
  const acceptanceUnsigned = structuredClone(value.acceptance);
  delete acceptanceUnsigned.acceptanceHash;
  acceptanceUnsigned.sessionReceiptHash = receipt.receiptHash;
  return { ...value, receipt, acceptance: hashed(acceptanceUnsigned, "acceptanceHash") };
}

function bindCensus(value: Evidence, censusUnsigned: JsonRecord): Evidence {
  const censusReceipt = hashed(censusUnsigned, "receiptHash");
  const receiptUnsigned = structuredClone(value.receipt);
  delete receiptUnsigned.receiptHash;
  receiptUnsigned.censusReceiptHash = censusReceipt.receiptHash;
  return bindReceipt({ ...value, censusReceipt }, receiptUnsigned);
}

function refreshFinalizationTrust(value: Evidence): Evidence {
  const ledgerLines: string[] = new TextDecoder().decode(value.phaseLedgerBytes).trimEnd().split("\n");
  const lastLedgerEntry = JSON.parse(ledgerLines.at(-1)!) as JsonRecord;
  const trustedFinalization: Os01SessionFinalizationTrust = {
    ...value.trustedFinalization,
    acceptanceTrustRoot: os01SessionAcceptanceTrustRoot(value.trustedBoundary),
    censusReceiptBytesSha256: createHash("sha256").update(bytes(value.censusReceipt)).digest("hex"),
    censusReceiptHash: value.censusReceipt.receiptHash as string,
    sessionReceiptBytesSha256: createHash("sha256").update(bytes(value.receipt)).digest("hex"),
    sessionReceiptHash: value.receipt.receiptHash as string,
    phaseLedgerBytesSha256: createHash("sha256").update(value.phaseLedgerBytes).digest("hex"),
    phaseLedgerEntryCount: ledgerLines.length,
    phaseLedgerLastEntryHash: lastLedgerEntry.entryHash as string,
    censusStartedAt: value.censusReceipt.startedAt as string,
    censusCompletedAt: value.censusReceipt.completedAt as string,
    completedAt: value.receipt.completedAt as string
  };
  const acceptanceUnsigned = structuredClone(value.acceptance);
  delete acceptanceUnsigned.acceptanceHash;
  acceptanceUnsigned.finalizationTrustRoot = os01SessionFinalizationTrustRoot(
    trustedFinalization,
    value.trustedBoundary
  );
  return {
    ...value,
    acceptance: hashed(acceptanceUnsigned, "acceptanceHash"),
    trustedFinalization
  };
}

function rewriteTerminalLedger(
  value: Evidence,
  mutate: (entries: JsonRecord[]) => void
): Evidence {
  const entries: JsonRecord[] = new TextDecoder().decode(value.phaseLedgerBytes).trimEnd().split("\n")
    .map((line: string) => JSON.parse(line) as JsonRecord);
  mutate(entries);
  let previousEntryHash = "0".repeat(64);
  const lines = entries.map((entry, sequence) => {
    const unsigned = structuredClone(entry);
    delete unsigned.entryHash;
    unsigned.sequence = sequence;
    unsigned.previousEntryHash = previousEntryHash;
    const rebuilt = { ...unsigned, entryHash: hash(unsigned) };
    previousEntryHash = rebuilt.entryHash;
    return JSON.stringify(stable(rebuilt));
  });
  const phaseLedgerBytes = Buffer.from(`${lines.join("\n")}\n`, "utf8");
  const cleanupBytes = Buffer.from(`${lines.slice(0, 6).join("\n")}\n`, "utf8");
  const cleanupLast = JSON.parse(lines[5]!) as JsonRecord;
  const receiptUnsigned = structuredClone(value.receipt);
  delete receiptUnsigned.receiptHash;
  receiptUnsigned.phaseLedgerAtCleanup = {
    version: "os01-session-phase-ledger.2026.1",
    runId: value.trustedBoundary.runId,
    entryCount: 6,
    terminalPhase: null,
    ledgerSha256: createHash("sha256").update(cleanupBytes).digest("hex"),
    lastEntryHash: cleanupLast.entryHash
  };
  const receipt = hashed(receiptUnsigned, "receiptHash");
  const acceptanceUnsigned = structuredClone(value.acceptance);
  delete acceptanceUnsigned.acceptanceHash;
  acceptanceUnsigned.sessionReceiptHash = receipt.receiptHash;
  acceptanceUnsigned.phaseLedger = {
    version: "os01-session-phase-ledger.2026.1",
    runId: value.trustedBoundary.runId,
    entryCount: 7,
    terminalPhase: "session_complete",
    ledgerSha256: createHash("sha256").update(phaseLedgerBytes).digest("hex"),
    lastEntryHash: previousEntryHash
  };
  return {
    ...value,
    receipt,
    acceptance: hashed(acceptanceUnsigned, "acceptanceHash"),
    phaseLedgerBytes
  };
}

describe("OS-01 live-trust terminal acceptance", () => {
  it("accepts a complete cleanup receipt, bound census, exact cleanup prefix, and terminal marker", () => {
    const value = evidence();
    expect(() => validate(value)).not.toThrow();
  });

  it("rejects every missing top-level cleanup field even after hashes are recomputed", () => {
    const value = evidence();
    for (const field of Object.keys(value.receipt)) {
      if (field === "receiptHash") continue;
      const unsigned = structuredClone(value.receipt);
      delete unsigned.receiptHash;
      delete unsigned[field];
      expect(() => validate(refreshFinalizationTrust(bindReceipt(value, unsigned))), field)
        .toThrow(/unexpected fields|finalization completion is invalid/u);
    }
  });

  it("rejects missing or substituted census evidence and any terminal-failure neighbor", () => {
    const value = evidence();
    expect(() => validateOs01SessionAcceptance({
      sessionReceiptBytes: bytes(value.receipt),
      censusReceiptBytes: Buffer.alloc(0),
      externalMutationIntentBytes: bytes(value.externalMutationIntent),
      acceptanceBytes: bytes(value.acceptance),
      phaseLedgerBytes: value.phaseLedgerBytes,
      trustedBoundary: value.trustedBoundary,
      trustedFinalization: value.trustedFinalization,
      rejectionReceiptPresent: false,
      acceptanceFailureReceiptPresent: false
    })).toThrow(/terminal evidence bytes|not valid JSON/u);
    const other = evidence();
    const alteredCensus = structuredClone(other.censusReceipt);
    alteredCensus.startedAt = "2026-08-28T12:20:01.000Z";
    const substituted = hashed(alteredCensus, "receiptHash");
    expect(() => validate({ ...value, censusReceipt: substituted }))
      .toThrow(/terminal evidence bytes|does not match/u);
    expect(() => validate(value, { rejection: true, failure: false })).toThrow(/rejection or acceptance-failure/u);
    expect(() => validate(value, { rejection: false, failure: true })).toThrow(/rejection or acceptance-failure/u);
  });

  it("rejects blocked census status, incomplete cleanup evidence, provider activity, and lock expiry", () => {
    const value = evidence();
    for (const mutate of [
      (receipt: JsonRecord) => { receipt.censusStatus = "blocked_before_content_scan"; },
      (receipt: JsonRecord) => { receipt.providerRequests = 1; },
      (receipt: JsonRecord) => {
        (receipt.productionSessionLock as JsonRecord).expiresAt = "2026-08-28T12:29:59.000Z";
        const lock = receipt.productionSessionLock as JsonRecord;
        delete lock.lockIdentityHash;
        lock.lockIdentityHash = hash(lock);
        receipt.productionSessionLockIdentityHash = lock.lockIdentityHash;
      },
      (receipt: JsonRecord) => {
        (receipt.sourceRestoration as JsonRecord).compareAndSwapApplied = false;
      }
    ]) {
      const unsigned = structuredClone(value.receipt);
      delete unsigned.receiptHash;
      mutate(unsigned);
      const changed = bindReceipt(value, unsigned);
      if ((unsigned.productionSessionLock as JsonRecord).lockIdentityHash !==
        (value.receipt.productionSessionLock as JsonRecord).lockIdentityHash) {
        const marker = structuredClone(changed.acceptance);
        delete marker.acceptanceHash;
        marker.productionSessionLockIdentityHash = unsigned.productionSessionLockIdentityHash;
        changed.acceptance = hashed(marker, "acceptanceHash");
      }
      expect(() => validate(refreshFinalizationTrust(changed))).toThrow();
    }
  });

  it("binds cleanup restoration to the exact deployment-proof trees and proof bytes", () => {
    const value = evidence();
    const alteredRestoration = structuredClone(value.receipt);
    delete alteredRestoration.receiptHash;
    (alteredRestoration.sourceRestoration as JsonRecord).preRestoreTreeObjectId = "5".repeat(40);
    expect(() => validate(refreshFinalizationTrust(bindReceipt(value, alteredRestoration))))
      .toThrow(/source restoration/u);

    const alteredProofBytes = structuredClone(value.censusReceipt);
    delete alteredProofBytes.receiptHash;
    const proof = alteredProofBytes.deploymentProof as JsonRecord;
    const sourceIdentity = proof.sourceIdentity as JsonRecord;
    sourceIdentity.deploymentTreeObjectId = "5".repeat(40);
    expect(() => validate(refreshFinalizationTrust(bindCensus(value, alteredProofBytes))))
      .toThrow(/proof hash/u);

    alteredProofBytes.deploymentProofHash = createHash("sha256")
      .update(bytes(alteredProofBytes.deploymentProof))
      .digest("hex");
    expect(() => validate(refreshFinalizationTrust(bindCensus(value, alteredProofBytes))))
      .toThrow(/live trust boundary/u);
  });

  it("cross-binds authority, uploader, archive, and closed proof identities", () => {
    const value = evidence();
    for (const mutate of [
      (receipt: JsonRecord) => { receipt.authorityCommit = "5".repeat(40); },
      (receipt: JsonRecord) => { receipt.uploaderAssertionRoot = "5".repeat(64); },
      (receipt: JsonRecord) => {
        (receipt.archive as JsonRecord).contentRoot = "5".repeat(64);
      }
    ]) {
      const receiptUnsigned = structuredClone(value.receipt);
      delete receiptUnsigned.receiptHash;
      mutate(receiptUnsigned);
      expect(() => validate(refreshFinalizationTrust(bindReceipt(value, receiptUnsigned))))
        .toThrow(/not bound|live acceptance trust boundary/u);
    }

    for (const location of ["proof", "sourceIdentity"] as const) {
      const censusUnsigned = structuredClone(value.censusReceipt);
      delete censusUnsigned.receiptHash;
      const proof = censusUnsigned.deploymentProof as JsonRecord;
      const target = location === "proof" ? proof : proof.sourceIdentity as JsonRecord;
      target.unexpected = true;
      censusUnsigned.deploymentProofHash = createHash("sha256")
        .update(bytes(proof))
        .digest("hex");
      expect(() => validate(refreshFinalizationTrust(bindCensus(value, censusUnsigned))))
        .toThrow(/unexpected fields|live trust boundary/u);
    }
  });

  it("rejects coordinated proof and receipt rewrites while the live trust boundary stays fixed", () => {
    const value = evidence();
    const censusUnsigned = structuredClone(value.censusReceipt);
    delete censusUnsigned.receiptHash;
    const proof = censusUnsigned.deploymentProof as JsonRecord;
    const sourceIdentity = proof.sourceIdentity as JsonRecord;
    sourceIdentity.deploymentTreeObjectId = "5".repeat(40);
    censusUnsigned.deploymentProofHash = createHash("sha256").update(bytes(proof)).digest("hex");
    const rewritten = bindCensus(value, censusUnsigned);
    const receiptUnsigned = structuredClone(rewritten.receipt);
    delete receiptUnsigned.receiptHash;
    (receiptUnsigned.sourceRestoration as JsonRecord).preRestoreTreeObjectId = "5".repeat(40);
    expect(() => validate(bindReceipt(rewritten, receiptUnsigned)))
      .toThrow(/finalization trust boundary|live trust boundary/u);
  });

  it("rejects coordinated intent, uploader, proof, census, receipt, and marker rewrites", () => {
    const value = evidence();
    const intentUnsigned = structuredClone(value.externalMutationIntent);
    delete intentUnsigned.intentHash;
    intentUnsigned.temporaryControlAuthSha256 = "d".repeat(64);
    const externalMutationIntent = hashed(intentUnsigned, "intentHash");

    const censusUnsigned = structuredClone(value.censusReceipt);
    delete censusUnsigned.receiptHash;
    const proof = censusUnsigned.deploymentProof as JsonRecord;
    const uploader = proof.uploader as JsonRecord;
    uploader.mutationIntentHash = externalMutationIntent.intentHash;
    uploader.temporaryControlAuthSha256 = externalMutationIntent.temporaryControlAuthSha256;
    censusUnsigned.deploymentProofHash = createHash("sha256").update(bytes(proof)).digest("hex");
    const censusReceipt = hashed(censusUnsigned, "receiptHash");

    const receiptUnsigned = structuredClone(value.receipt);
    delete receiptUnsigned.receiptHash;
    receiptUnsigned.censusReceiptHash = censusReceipt.receiptHash;
    receiptUnsigned.uploaderAssertionRoot = hash(uploader);
    receiptUnsigned.externalMutationIntentHash = externalMutationIntent.intentHash;
    receiptUnsigned.externalMutationIntentRoot = externalMutationIntent.intentHash;
    const rewritten = bindReceipt({ ...value, censusReceipt, externalMutationIntent }, receiptUnsigned);
    expect(() => validate(rewritten))
      .toThrow(/finalization trust boundary|live acceptance trust boundary/u);
  });

  it("rejects noncanonical intent bytes and a substituted acceptance trust fingerprint", () => {
    const value = evidence();
    expect(() => validateOs01SessionAcceptance({
      sessionReceiptBytes: bytes(value.receipt),
      censusReceiptBytes: bytes(value.censusReceipt),
      externalMutationIntentBytes: Buffer.from(JSON.stringify(value.externalMutationIntent), "utf8"),
      acceptanceBytes: bytes(value.acceptance),
      phaseLedgerBytes: value.phaseLedgerBytes,
      trustedBoundary: value.trustedBoundary,
      trustedFinalization: value.trustedFinalization,
      rejectionReceiptPresent: false,
      acceptanceFailureReceiptPresent: false
    })).toThrow(/terminal evidence bytes|not canonical/u);

    const reorderedIntent = Object.fromEntries(Object.entries(value.externalMutationIntent).reverse());
    expect(() => validateOs01SessionAcceptance({
      sessionReceiptBytes: bytes(value.receipt),
      censusReceiptBytes: bytes(value.censusReceipt),
      externalMutationIntentBytes: bytes(reorderedIntent),
      acceptanceBytes: bytes(value.acceptance),
      phaseLedgerBytes: value.phaseLedgerBytes,
      trustedBoundary: value.trustedBoundary,
      trustedFinalization: value.trustedFinalization,
      rejectionReceiptPresent: false,
      acceptanceFailureReceiptPresent: false
    })).toThrow(/live trust boundary/u);

    const acceptanceUnsigned = structuredClone(value.acceptance);
    delete acceptanceUnsigned.acceptanceHash;
    acceptanceUnsigned.trustBoundaryRoot = "0".repeat(64);
    expect(() => validate({ ...value, acceptance: hashed(acceptanceUnsigned, "acceptanceHash") }))
      .toThrow(/identity does not match/u);
  });

  it("rejects an incomplete or altered caller-supplied live trust boundary", () => {
    const value = evidence();
    const missing = structuredClone(value.trustedBoundary) as unknown as JsonRecord;
    delete missing.targetOrigin;
    expect(() => validate({
      ...value,
      trustedBoundary: missing as unknown as Os01SessionAcceptanceTrust
    })).toThrow(/unexpected fields/u);

    const altered = structuredClone(value.trustedBoundary);
    altered.targetOrigin = "https://substitute.invalid";
    const markerUnsigned = structuredClone(value.acceptance);
    delete markerUnsigned.acceptanceHash;
    markerUnsigned.trustBoundaryRoot = os01SessionAcceptanceTrustRoot(altered);
    expect(() => validate({
      ...value,
      acceptance: hashed(markerUnsigned, "acceptanceHash"),
      trustedBoundary: altered
    })).toThrow(/finalization trust|production target/u);
  });

  it("rejects a forged cleanup-ledger prefix and a noncanonical or altered terminal ledger", () => {
    const value = evidence();
    const unsigned = structuredClone(value.receipt);
    delete unsigned.receiptHash;
    (unsigned.phaseLedgerAtCleanup as JsonRecord).ledgerSha256 = "0".repeat(64);
    expect(() => validate(refreshFinalizationTrust(bindReceipt(value, unsigned))))
      .toThrow(/six-entry prefix/u);

    const changedLedger = Buffer.from(value.phaseLedgerBytes);
    changedLedger[0] = 0x5b;
    expect(() => validate({ ...value, phaseLedgerBytes: changedLedger }))
      .toThrow(/terminal evidence bytes|not valid JSON|invalid|does not match/u);

    expect(() => validateOs01SessionAcceptance({
      sessionReceiptBytes: Buffer.from(JSON.stringify(value.receipt), "utf8"),
      censusReceiptBytes: bytes(value.censusReceipt),
      externalMutationIntentBytes: bytes(value.externalMutationIntent),
      acceptanceBytes: bytes(value.acceptance),
      phaseLedgerBytes: value.phaseLedgerBytes,
      trustedBoundary: value.trustedBoundary,
      trustedFinalization: value.trustedFinalization,
      rejectionReceiptPresent: false,
      acceptanceFailureReceiptPresent: false
    })).toThrow(/terminal evidence bytes|not canonical/u);
  });

  it("rejects coordinated census-semantic rewrites while the original finalization trust stays fixed", () => {
    const value = evidence();
    const mutations: Array<(receipt: JsonRecord) => void> = [
      (receipt) => { receipt.contractHash = "d".repeat(64); },
      (receipt) => {
        ((receipt.migrationByteHashes as JsonRecord[])[0]!).sha256 = "d".repeat(64);
      },
      (receipt) => { receipt.classification = { accepted: true, substituted: true }; },
      (receipt) => {
        receipt.commonPassRoot = "d".repeat(64);
        (receipt.firstPass as JsonRecord).passRoot = "d".repeat(64);
        (receipt.secondPass as JsonRecord).passRoot = "d".repeat(64);
      }
    ];
    for (const mutate of mutations) {
      const censusUnsigned = structuredClone(value.censusReceipt);
      delete censusUnsigned.receiptHash;
      mutate(censusUnsigned);
      expect(() => validate(bindCensus(value, censusUnsigned)))
        .toThrow(/terminal evidence bytes do not match the live finalization trust boundary/u);
    }
  });

  it("enforces terminal chronology even when a substitute finalization trust is supplied", () => {
    const value = evidence();
    const censusUnsigned = structuredClone(value.censusReceipt);
    delete censusUnsigned.receiptHash;
    censusUnsigned.completedAt = "2026-08-28T12:26:00.000Z";
    const censusAfterPhase = refreshFinalizationTrust(bindCensus(value, censusUnsigned));
    expect(() => validate(censusAfterPhase)).toThrow(/cleanup phase-ledger summary/u);

    for (const mutate of [
      (receipt: JsonRecord) => {
        ((receipt.cleanHttp as JsonRecord[])[0]!).observedAt = "2099-01-01T00:00:00.000Z";
      },
      (receipt: JsonRecord) => {
        (receipt.providerState as JsonRecord).observedAt = "2000-01-01T00:00:00.000Z";
      },
      (receipt: JsonRecord) => {
        (receipt.sourceRestoration as JsonRecord).observedAt = "2026-08-28T12:24:59.000Z";
      }
    ]) {
      const receiptUnsigned = structuredClone(value.receipt);
      delete receiptUnsigned.receiptHash;
      mutate(receiptUnsigned);
      const changed = refreshFinalizationTrust(bindReceipt(value, receiptUnsigned));
      expect(() => validate(changed)).toThrow(/outside the accepted lifecycle/u);
    }
  });

  it("rejects a full census, cleanup, ledger, and marker forgery under the original finalization trust", () => {
    const value = evidence();
    const censusUnsigned = structuredClone(value.censusReceipt);
    delete censusUnsigned.receiptHash;
    censusUnsigned.contractHash = "d".repeat(64);
    censusUnsigned.migrationByteHashes = [{ tag: "forged", sha256: "d".repeat(64) }];
    censusUnsigned.classification = { accepted: true, forged: true };
    censusUnsigned.commonPassRoot = "d".repeat(64);
    (censusUnsigned.firstPass as JsonRecord).passRoot = "d".repeat(64);
    (censusUnsigned.secondPass as JsonRecord).passRoot = "d".repeat(64);
    let rewritten = bindCensus(value, censusUnsigned);
    rewritten = rewriteTerminalLedger(rewritten, (entries) => {
      entries[0]!.observedAt = "2026-08-28T12:00:30.000Z";
      entries[1]!.observedAt = "2026-08-28T12:01:30.000Z";
    });
    expect(() => validate(rewritten))
      .toThrow(/terminal evidence bytes do not match the live finalization trust boundary/u);
  });

  it("rejects a substituted finalization trust fingerprint when the retained trust stays fixed", () => {
    const value = evidence();
    const substituted = {
      ...value.trustedFinalization,
      sessionReceiptBytesSha256: "f".repeat(64)
    };
    const markerUnsigned = structuredClone(value.acceptance);
    delete markerUnsigned.acceptanceHash;
    markerUnsigned.finalizationTrustRoot = os01SessionFinalizationTrustRoot(
      substituted,
      value.trustedBoundary
    );
    expect(() => validate({
      ...value,
      acceptance: hashed(markerUnsigned, "acceptanceHash")
    })).toThrow(/identity does not match/u);
  });
});
