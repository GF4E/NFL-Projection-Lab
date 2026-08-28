import { createHash } from "node:crypto";

import {
  os01ControlPlaneContract,
  type TrustedUploaderAssertion,
  type VersionProjection,
  validateTrustedUploaderAssertion
} from "./os01-control-plane-evidence";

type JsonRecord = Record<string, unknown>;

export type Os01SessionAcceptanceEvidence = {
  version: "os01-private-seed-session-acceptance.2026.4";
  status: "clean_public_production_census_session_accepted";
  runId: string;
  seedCommitment: string;
  sourceAnchor: string;
  sessionReceiptHash: string;
  trustBoundaryRoot: string;
  finalizationTrustRoot: string;
  productionSessionLockIdentityHash: string;
  phaseLedger: {
    version: "os01-session-phase-ledger.2026.1";
    runId: string;
    entryCount: number;
    terminalPhase: "session_complete";
    ledgerSha256: string;
    lastEntryHash: string;
  };
  acceptedAt: string;
  acceptanceHash: string;
};

export type Os01SessionAcceptanceTrust = {
  version: "os01-session-acceptance-trust.2026.1";
  runId: string;
  seedCommitment: string;
  targetProjectId: string;
  targetOrigin: string;
  authorityCommit: string;
  implementationCommit: string;
  deploymentCommit: string;
  sourceAnchor: string;
  deploymentProofHash: string;
  externalMutationIntentHash: string;
  externalMutationIntentBytesSha256: string;
  archiveSha256: string;
  archiveBytes: number;
  archiveFileListRoot: string;
  archiveContentRoot: string;
  archiveFileCount: number;
  localPackageContentRoot: string;
  productionSessionLockIdentityHash: string;
};

/**
 * A second, terminal trust anchor frozen by the live controller only after the
 * census, verified cleanup, and terminal phase entry exist in memory. It must
 * be retained independently of the persisted evidence bundle and must never be
 * reconstructed from the receipt, ledger, or marker being validated.
 */
export type Os01SessionFinalizationTrust = {
  version: "os01-session-finalization-trust.2026.1";
  acceptanceTrustRoot: string;
  runId: string;
  seedCommitment: string;
  targetProjectId: string;
  sourceAnchor: string;
  productionSessionLockIdentityHash: string;
  censusReceiptBytesSha256: string;
  censusReceiptHash: string;
  sessionReceiptBytesSha256: string;
  sessionReceiptHash: string;
  phaseLedgerBytesSha256: string;
  phaseLedgerEntryCount: number;
  phaseLedgerLastEntryHash: string;
  censusStartedAt: string;
  censusCompletedAt: string;
  completedAt: string;
};

const CONTROL_PLANE_VERSION = "os01-sites-control-plane.2026.3";
const ENVIRONMENT_VALUE_OBSERVATION = "prohibited";
const UNRELATED_VALUE_PRESERVATION_BASIS = "sites_update_only_listed_keys_change";
const BUILD_VERSION = "os01-vinext-qualification-build.2026.2";
const ARCHIVE_BOUNDARY_VERSION = "os01-qualification-archive-boundary.2026.6";
const TOOLCHAIN_CLOSURE_ROOT = "139a4448086f6e955de8ff32cfe26fa11464b89cd9597e2bc8c7b367e79eb6fc";
const TOOLCHAIN_PACKAGE_COUNT = 580;
const NODE_VERSION = "v24.19.0";
const NODE_EXECUTABLE_SHA256 = "27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1";
const PNPM_VERSION = "11.16.0";
const PNPM_EXECUTABLE_SHA256 = "65cb7439d9b023b95d0e19d843adf14e0654426ef85ad4ecd33d58849315f669";
const LOCKFILE_SHA256 = "daf4dac4be7acca701141ec59050ab7d309ea9573109f567bcf01100c03965e2";
const WORKSPACE_SHA256 = "f309c3c526eb2f4b6da28ddcebb819d9781683da959e0f63d249bd467abf2447";
const VINEXT_VERSION = "1.0.0-beta.2";
const PATCH_SHA256 = "2ad276eb7bcc894f98c12e28c9614a790ab9771b697071971b441c7d5ef58ba8";
const CLEAN_SOURCE_COMMIT = "e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd";
const CLEAN_VERSION_ID =
  "appgprj_6a7ba1bc638c819197788ab281abfbc3~appgver_1e68c8989b1c8191ba0dc533519c65b3";
const CENSUS_ROUTE = "/_ops/engine-os/os01-census-v1";
const TEMPORARY_CONTROLS = [
  "OS01_CENSUS_AUTH_SHA256",
  "OS01_CENSUS_BUILD_ATTESTATION",
  "OS01_CENSUS_EXPIRES_AT"
] as const;
const EXTERNAL_MUTATION_SEQUENCE = [
  "source_compare_and_swap",
  "environment_controls_single_update",
  "sites_save_exact_local_archive",
  "temporary_publish"
] as const;

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
  throw new Error("OS-01 session-acceptance evidence contains an unsupported value");
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseObject(bytes: Uint8Array, label: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareCodePoints);
  const wanted = [...expected].sort(compareCodePoints);
  if (stableJson(actual) !== stableJson(wanted)) throw new Error(`${label} contains unexpected fields`);
}

function object(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${label} is invalid`);
  return Number(value);
}

function hex(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function commit(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{40}$/u.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function uuid(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(result)) {
    throw new Error(`${label} is invalid`);
  }
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} is invalid`);
  return result;
}

function assertTimestampRange(
  value: unknown,
  label: string,
  notBefore: string,
  notAfter: string
): string {
  const observedAt = timestamp(value, label);
  if (Date.parse(observedAt) < Date.parse(notBefore) || Date.parse(observedAt) > Date.parse(notAfter)) {
    throw new Error(`${label} is outside the accepted lifecycle`);
  }
  return observedAt;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function canonicalHash(value: JsonRecord, hashField: string): string {
  const unsigned = { ...value };
  delete unsigned[hashField];
  return sha256(stableJson(unsigned));
}

function requirePrettyJson(bytes: Uint8Array, parsed: JsonRecord, label: string): void {
  const expected = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  if (!Buffer.from(bytes).equals(expected)) throw new Error(`${label} bytes are not canonical`);
}

function validateTrustBoundary(value: Os01SessionAcceptanceTrust): Os01SessionAcceptanceTrust {
  const trust = object(value, "OS-01 live acceptance trust boundary") as Os01SessionAcceptanceTrust;
  exactKeys(trust as unknown as JsonRecord, [
    "archiveBytes", "archiveContentRoot", "archiveFileCount", "archiveFileListRoot", "archiveSha256",
    "authorityCommit", "deploymentCommit", "deploymentProofHash", "externalMutationIntentBytesSha256",
    "externalMutationIntentHash", "implementationCommit", "localPackageContentRoot",
    "productionSessionLockIdentityHash", "runId", "seedCommitment", "sourceAnchor", "targetOrigin",
    "targetProjectId", "version"
  ], "OS-01 live acceptance trust boundary");
  if (trust.version !== "os01-session-acceptance-trust.2026.1") {
    throw new Error("OS-01 live acceptance trust boundary version is invalid");
  }
  uuid(trust.runId, "OS-01 trusted run identity");
  hex(trust.seedCommitment, "OS-01 trusted seed commitment");
  text(trust.targetProjectId, "OS-01 trusted target project");
  if (!text(trust.targetOrigin, "OS-01 trusted target origin").startsWith("https://")) {
    throw new Error("OS-01 trusted target origin is invalid");
  }
  commit(trust.authorityCommit, "OS-01 trusted authority commit");
  commit(trust.implementationCommit, "OS-01 trusted implementation commit");
  commit(trust.deploymentCommit, "OS-01 trusted deployment commit");
  hex(trust.sourceAnchor, "OS-01 trusted source anchor");
  hex(trust.deploymentProofHash, "OS-01 trusted deployment-proof hash");
  hex(trust.externalMutationIntentHash, "OS-01 trusted external-mutation intent hash");
  hex(trust.externalMutationIntentBytesSha256, "OS-01 trusted external-mutation intent byte hash");
  hex(trust.archiveSha256, "OS-01 trusted archive hash");
  integer(trust.archiveBytes, "OS-01 trusted archive bytes", 1);
  hex(trust.archiveFileListRoot, "OS-01 trusted archive file-list root");
  hex(trust.archiveContentRoot, "OS-01 trusted archive content root");
  integer(trust.archiveFileCount, "OS-01 trusted archive file count", 1);
  hex(trust.localPackageContentRoot, "OS-01 trusted package content root");
  if (trust.localPackageContentRoot !== trust.archiveContentRoot) {
    throw new Error("OS-01 trusted package and archive content roots differ");
  }
  hex(trust.productionSessionLockIdentityHash, "OS-01 trusted production-session lock identity");
  return trust;
}

export function os01SessionAcceptanceTrustRoot(value: Os01SessionAcceptanceTrust): string {
  return sha256(stableJson(validateTrustBoundary(value)));
}

function validateFinalizationTrust(
  value: Os01SessionFinalizationTrust,
  acceptanceTrust: Os01SessionAcceptanceTrust
): Os01SessionFinalizationTrust {
  const trust = object(value, "OS-01 live finalization trust boundary") as Os01SessionFinalizationTrust;
  exactKeys(trust as unknown as JsonRecord, [
    "acceptanceTrustRoot", "censusCompletedAt", "censusReceiptBytesSha256", "censusReceiptHash",
    "censusStartedAt", "completedAt", "phaseLedgerBytesSha256", "phaseLedgerEntryCount",
    "phaseLedgerLastEntryHash", "productionSessionLockIdentityHash", "runId", "seedCommitment",
    "sessionReceiptBytesSha256", "sessionReceiptHash", "sourceAnchor", "targetProjectId", "version"
  ], "OS-01 live finalization trust boundary");
  if (trust.version !== "os01-session-finalization-trust.2026.1") {
    throw new Error("OS-01 live finalization trust boundary version is invalid");
  }
  hex(trust.acceptanceTrustRoot, "OS-01 finalization acceptance-trust root");
  uuid(trust.runId, "OS-01 finalization run identity");
  hex(trust.seedCommitment, "OS-01 finalization seed commitment");
  text(trust.targetProjectId, "OS-01 finalization target project");
  hex(trust.sourceAnchor, "OS-01 finalization source anchor");
  hex(trust.productionSessionLockIdentityHash, "OS-01 finalization lock identity");
  hex(trust.censusReceiptBytesSha256, "OS-01 finalization census-receipt byte hash");
  hex(trust.censusReceiptHash, "OS-01 finalization census-receipt hash");
  hex(trust.sessionReceiptBytesSha256, "OS-01 finalization session-receipt byte hash");
  hex(trust.sessionReceiptHash, "OS-01 finalization session-receipt hash");
  hex(trust.phaseLedgerBytesSha256, "OS-01 finalization phase-ledger byte hash");
  if (integer(trust.phaseLedgerEntryCount, "OS-01 finalization phase-ledger entry count", 1) !== 7) {
    throw new Error("OS-01 finalization phase-ledger entry count is invalid");
  }
  hex(trust.phaseLedgerLastEntryHash, "OS-01 finalization phase-ledger last-entry hash");
  const censusStartedAt = timestamp(trust.censusStartedAt, "OS-01 finalization census start");
  const censusCompletedAt = timestamp(trust.censusCompletedAt, "OS-01 finalization census completion");
  const completedAt = timestamp(trust.completedAt, "OS-01 finalization completion");
  if (
    trust.acceptanceTrustRoot !== os01SessionAcceptanceTrustRoot(acceptanceTrust) ||
    trust.runId !== acceptanceTrust.runId || trust.seedCommitment !== acceptanceTrust.seedCommitment ||
    trust.targetProjectId !== acceptanceTrust.targetProjectId || trust.sourceAnchor !== acceptanceTrust.sourceAnchor ||
    trust.productionSessionLockIdentityHash !== acceptanceTrust.productionSessionLockIdentityHash
  ) throw new Error("OS-01 finalization trust is not bound to the pre-census trust boundary");
  if (
    Date.parse(censusStartedAt) > Date.parse(censusCompletedAt) ||
    Date.parse(censusCompletedAt) > Date.parse(completedAt)
  ) throw new Error("OS-01 finalization chronology is invalid");
  return trust;
}

export function os01SessionFinalizationTrustRoot(
  value: Os01SessionFinalizationTrust,
  acceptanceTrust: Os01SessionAcceptanceTrust
): string {
  return sha256(stableJson(validateFinalizationTrust(value, validateTrustBoundary(acceptanceTrust))));
}

function validateExternalMutationIntent(
  bytes: Uint8Array,
  expected: {
    trust: Os01SessionAcceptanceTrust;
    environmentBefore: JsonRecord;
    accessBefore: JsonRecord;
    lockStartedAt: string;
    lockExpiresAt: string;
    receiptHash: string;
    receiptRoot: string;
  }
): JsonRecord {
  const intent = parseObject(bytes, "OS-01 external-mutation intent");
  exactKeys(intent, [
    "accessBefore", "authorityCommit", "deploymentCommit", "environmentBefore", "implementationCommit",
    "intentHash", "localArchiveBytes", "localArchiveFileCount", "localArchiveFileListRoot",
    "localArchiveSha256", "localPackageContentRoot", "mutationSequence", "observedAt",
    "productionSessionLockIdentityHash", "runId", "seedCommitment", "sourceAnchor", "sourceHeadAfter",
    "sourceHeadBefore", "sourcePushExpectedOld", "status", "targetOrigin", "targetProjectId",
    "temporaryControlAuthSha256", "temporaryControlBuildAttestation",
    "temporaryControlEnvironmentRevisionBefore", "temporaryControlEnvironmentRevisionStaged",
    "temporaryControlExpiresAt", "temporaryControls", "temporaryControlsSingleUpdate", "version"
  ], "OS-01 external-mutation intent");
  requirePrettyJson(bytes, intent, "OS-01 external-mutation intent");
  const intentHash = hex(intent.intentHash, "OS-01 external-mutation intent hash");
  if (
    sha256(bytes) !== expected.trust.externalMutationIntentBytesSha256 ||
    canonicalHash(intent, "intentHash") !== intentHash ||
    intentHash !== expected.trust.externalMutationIntentHash ||
    intentHash !== expected.receiptHash ||
    intentHash !== expected.receiptRoot
  ) throw new Error("OS-01 external-mutation intent does not match the live trust boundary");
  if (
    intent.version !== "os01-external-mutation-intent.2026.1" ||
    intent.status !== "armed_cleanup_required_before_external_mutation" ||
    intent.runId !== expected.trust.runId ||
    intent.seedCommitment !== expected.trust.seedCommitment ||
    intent.targetProjectId !== expected.trust.targetProjectId ||
    intent.targetOrigin !== expected.trust.targetOrigin ||
    intent.sourceAnchor !== expected.trust.sourceAnchor ||
    intent.authorityCommit !== expected.trust.authorityCommit ||
    intent.implementationCommit !== expected.trust.implementationCommit ||
    intent.deploymentCommit !== expected.trust.deploymentCommit ||
    intent.productionSessionLockIdentityHash !== expected.trust.productionSessionLockIdentityHash ||
    intent.localArchiveSha256 !== expected.trust.archiveSha256 ||
    intent.localArchiveBytes !== expected.trust.archiveBytes ||
    intent.localArchiveFileListRoot !== expected.trust.archiveFileListRoot ||
    intent.localArchiveFileCount !== expected.trust.archiveFileCount ||
    intent.localPackageContentRoot !== expected.trust.localPackageContentRoot ||
    stableJson(intent.environmentBefore) !== stableJson(expected.environmentBefore) ||
    stableJson(intent.accessBefore) !== stableJson(expected.accessBefore) ||
    intent.sourceHeadBefore !== CLEAN_SOURCE_COMMIT ||
    intent.sourcePushExpectedOld !== CLEAN_SOURCE_COMMIT ||
    intent.sourceHeadAfter !== expected.trust.deploymentCommit ||
    stableJson(intent.temporaryControls) !== stableJson(TEMPORARY_CONTROLS) ||
    intent.temporaryControlsSingleUpdate !== true ||
    intent.temporaryControlExpiresAt !== expected.lockExpiresAt ||
    intent.temporaryControlBuildAttestation !== expected.trust.sourceAnchor ||
    intent.temporaryControlEnvironmentRevisionBefore !== expected.environmentBefore.revision ||
    intent.temporaryControlEnvironmentRevisionStaged !== Number(expected.environmentBefore.revision) + 1 ||
    stableJson(intent.mutationSequence) !== stableJson(EXTERNAL_MUTATION_SEQUENCE)
  ) throw new Error("OS-01 external-mutation intent identity is invalid");
  hex(intent.temporaryControlAuthSha256, "OS-01 external-mutation temporary-control auth hash");
  const observedAt = timestamp(intent.observedAt, "OS-01 external-mutation intent observation time");
  if (
    Date.parse(observedAt) < Date.parse(expected.lockStartedAt) ||
    Date.parse(observedAt) >= Date.parse(expected.lockExpiresAt)
  ) throw new Error("OS-01 external-mutation intent is outside the production-session lock interval");
  return intent;
}

function validateHashSummary(value: unknown, label: string, expectedTerminal: string | null): JsonRecord {
  const summary = object(value, label);
  exactKeys(summary, [
    "entryCount", "lastEntryHash", "ledgerSha256", "runId", "terminalPhase", "version"
  ], label);
  if (summary.version !== "os01-session-phase-ledger.2026.1" || summary.terminalPhase !== expectedTerminal) {
    throw new Error(`${label} identity is invalid`);
  }
  uuid(summary.runId, `${label} run id`);
  integer(summary.entryCount, `${label} entry count`);
  hex(summary.ledgerSha256, `${label} ledger hash`);
  hex(summary.lastEntryHash, `${label} last-entry hash`);
  return summary;
}

function validateQualificationBuild(value: unknown, receipt: JsonRecord, projectId: string): JsonRecord {
  const build = object(value, "OS-01 qualification build");
  exactKeys(build, [
    "contextCommitment", "installedToolchainClosureRoot", "installedToolchainPackageCount",
    "lockfileSha256", "mode", "nodeExecutableSha256", "nodeVersion", "patchSha256",
    "pnpmExecutableSha256", "pnpmVersion", "role", "runId", "seedCommitment",
    "targetAccessMode", "targetProjectId", "toolchainRoot", "transcriptHash", "version",
    "vinextVersion", "workspaceSha256"
  ], "OS-01 qualification build");
  if (
    build.version !== BUILD_VERSION || build.role !== "deployment" ||
    build.mode !== "public_production_private_seed" || build.runId !== receipt.runId ||
    build.seedCommitment !== receipt.seedCommitment || build.targetProjectId !== projectId ||
    build.targetAccessMode !== "production" || build.installedToolchainClosureRoot !== TOOLCHAIN_CLOSURE_ROOT ||
    integer(build.installedToolchainPackageCount, "OS-01 installed toolchain package count", 1) !==
      TOOLCHAIN_PACKAGE_COUNT || build.nodeVersion !== NODE_VERSION ||
    build.nodeExecutableSha256 !== NODE_EXECUTABLE_SHA256 || build.pnpmVersion !== PNPM_VERSION ||
    build.pnpmExecutableSha256 !== PNPM_EXECUTABLE_SHA256 || build.lockfileSha256 !== LOCKFILE_SHA256 ||
    build.workspaceSha256 !== WORKSPACE_SHA256 || build.vinextVersion !== VINEXT_VERSION ||
    build.patchSha256 !== PATCH_SHA256
  ) throw new Error("OS-01 qualification build is not the frozen production build");
  for (const field of [
    "contextCommitment", "transcriptHash", "toolchainRoot", "nodeExecutableSha256",
    "pnpmExecutableSha256", "lockfileSha256", "workspaceSha256", "patchSha256"
  ]) hex(build[field], `OS-01 qualification build ${field}`);
  text(build.nodeVersion, "OS-01 qualification build Node version");
  text(build.pnpmVersion, "OS-01 qualification build pnpm version");
  text(build.vinextVersion, "OS-01 qualification build Vinext version");
  return build;
}

function validateArchiveEvidence(value: unknown): JsonRecord {
  const archive = object(value, "OS-01 archive evidence");
  exactKeys(archive, ["archiveBytes", "archiveSha256", "contentRoot", "fileCount", "fileListRoot"],
    "OS-01 archive evidence");
  hex(archive.archiveSha256, "OS-01 archive hash");
  hex(archive.contentRoot, "OS-01 archive content root");
  hex(archive.fileListRoot, "OS-01 archive file-list root");
  integer(archive.archiveBytes, "OS-01 archive bytes", 1);
  integer(archive.fileCount, "OS-01 archive file count", 1);
  return archive;
}

function validateArchiveBoundary(value: unknown, build: JsonRecord, archive: JsonRecord): void {
  const boundary = object(value, "OS-01 qualification archive boundary");
  exactKeys(boundary, [
    "archiveSha256", "contextCommitment", "fileCount", "nonServerDerivedCredentialLeakCount",
    "nonServerFileCount", "qualificationMode", "rawContextLeakCount", "runId", "scanRoot",
    "seedCommitment", "version"
  ], "OS-01 qualification archive boundary");
  if (
    boundary.version !== ARCHIVE_BOUNDARY_VERSION || boundary.archiveSha256 !== archive.archiveSha256 ||
    boundary.qualificationMode !== build.mode || boundary.runId !== build.runId ||
    boundary.seedCommitment !== build.seedCommitment || boundary.contextCommitment !== build.contextCommitment ||
    boundary.fileCount !== archive.fileCount ||
    integer(boundary.rawContextLeakCount, "OS-01 raw-context leak count") !== 0 ||
    integer(boundary.nonServerDerivedCredentialLeakCount, "OS-01 derived-credential leak count") !== 0 ||
    integer(boundary.nonServerFileCount, "OS-01 non-server file count", 1) > Number(boundary.fileCount)
  ) throw new Error("OS-01 qualification archive boundary is invalid");
  hex(boundary.scanRoot, "OS-01 qualification archive scan root");
}

function validateEnvironmentProjection(value: unknown, label: string): JsonRecord {
  const projection = object(value, label);
  exactKeys(projection, [
    "allMetadataRoot", "captureGatePresent", "controlsAllSecret", "controlsPresent", "entryCount",
    "observedAt", "projectId", "revision", "unrelatedEntryCount", "unrelatedMetadataRoot",
    "unrelatedValuePreservationBasis", "updatedAt", "valueObservation", "version"
  ], label);
  if (
    projection.version !== CONTROL_PLANE_VERSION ||
    projection.valueObservation !== ENVIRONMENT_VALUE_OBSERVATION ||
    projection.unrelatedValuePreservationBasis !== UNRELATED_VALUE_PRESERVATION_BASIS
  ) throw new Error(`${label} version or value-observation boundary is invalid`);
  timestamp(projection.observedAt, `${label} observedAt`);
  nullableTimestamp(projection.updatedAt, `${label} updatedAt`);
  text(projection.projectId, `${label} project`);
  integer(projection.revision, `${label} revision`);
  integer(projection.entryCount, `${label} entry count`);
  integer(projection.unrelatedEntryCount, `${label} unrelated entry count`);
  if (typeof projection.controlsAllSecret !== "boolean" || typeof projection.captureGatePresent !== "boolean") {
    throw new Error(`${label} flags are invalid`);
  }
  hex(projection.unrelatedMetadataRoot, `${label} unrelated root`);
  hex(projection.allMetadataRoot, `${label} metadata root`);
  for (const item of array(projection.controlsPresent, `${label} controls`)) text(item, `${label} control`);
  return projection;
}

function validateEnvironmentLifecycle(value: unknown, projectId: string): void {
  const lifecycle = object(value, "OS-01 environment lifecycle");
  exactKeys(lifecycle, ["after", "before", "staged"], "OS-01 environment lifecycle");
  const before = validateEnvironmentProjection(lifecycle.before, "OS-01 environment before");
  const staged = validateEnvironmentProjection(lifecycle.staged, "OS-01 environment staged");
  const after = validateEnvironmentProjection(lifecycle.after, "OS-01 environment after");
  const expectedControls = [...TEMPORARY_CONTROLS].sort(compareCodePoints);
  if (
    before.projectId !== projectId || staged.projectId !== projectId || after.projectId !== projectId ||
    stableJson(before.controlsPresent) !== "[]" || stableJson(after.controlsPresent) !== "[]" ||
    stableJson([...array(staged.controlsPresent, "OS-01 staged controls")].sort()) !== stableJson(expectedControls) ||
    before.captureGatePresent !== false || staged.captureGatePresent !== false || after.captureGatePresent !== false ||
    before.controlsAllSecret !== true || staged.controlsAllSecret !== true || after.controlsAllSecret !== true ||
    staged.revision !== Number(before.revision) + 1 || after.revision !== Number(staged.revision) + 1 ||
    staged.entryCount !== Number(before.entryCount) + TEMPORARY_CONTROLS.length ||
    after.entryCount !== before.entryCount || before.allMetadataRoot !== after.allMetadataRoot ||
    before.unrelatedEntryCount !== staged.unrelatedEntryCount || staged.unrelatedEntryCount !== after.unrelatedEntryCount ||
    before.unrelatedMetadataRoot !== staged.unrelatedMetadataRoot || staged.unrelatedMetadataRoot !== after.unrelatedMetadataRoot ||
    Date.parse(String(before.observedAt)) > Date.parse(String(staged.observedAt)) ||
    Date.parse(String(staged.observedAt)) > Date.parse(String(after.observedAt))
  ) throw new Error("OS-01 environment lifecycle is invalid");
}

function validateAccessProjection(value: unknown, label: string): JsonRecord {
  const access = object(value, label);
  exactKeys(access, [
    "accessMode", "allowedAccountUserCount", "allowedUserCount", "currentUserRole", "editorCount",
    "externalVisitorCount", "groupCount", "nonOwnerUserCount", "observedAt", "origin",
    "ownerRoleCount", "principalRoot", "projectId", "revision", "tenantGroupCount", "version",
    "workspaceGroupCount"
  ], label);
  if (
    access.version !== CONTROL_PLANE_VERSION || access.currentUserRole !== "owner" || access.accessMode !== "public" ||
    integer(access.allowedAccountUserCount, `${label} account users`) !== 1 ||
    integer(access.allowedUserCount, `${label} users`) !== 1 || integer(access.ownerRoleCount, `${label} owners`) !== 1 ||
    integer(access.nonOwnerUserCount, `${label} non-owners`) !== 0 || integer(access.editorCount, `${label} editors`) !== 0 ||
    integer(access.groupCount, `${label} groups`) !== 0 ||
    integer(access.workspaceGroupCount, `${label} workspace groups`) !== 0 ||
    integer(access.tenantGroupCount, `${label} tenant groups`) !== 0 ||
    integer(access.externalVisitorCount, `${label} external visitors`) !== 0
  ) throw new Error(`${label} is not the frozen public one-owner projection`);
  timestamp(access.observedAt, `${label} observedAt`);
  text(access.projectId, `${label} project`);
  const origin = text(access.origin, `${label} origin`);
  if (!origin.startsWith("https://")) throw new Error(`${label} origin is invalid`);
  integer(access.revision, `${label} revision`, 1);
  hex(access.principalRoot, `${label} principal root`);
  return access;
}

function validateAccessLifecycle(value: unknown): { projectId: string; origin: string } {
  const lifecycle = object(value, "OS-01 access lifecycle");
  exactKeys(lifecycle, ["after", "before"], "OS-01 access lifecycle");
  const before = validateAccessProjection(lifecycle.before, "OS-01 access before");
  const after = validateAccessProjection(lifecycle.after, "OS-01 access after");
  if (
    before.projectId !== after.projectId || before.origin !== after.origin ||
    before.revision !== after.revision || before.principalRoot !== after.principalRoot
  ) throw new Error("OS-01 access lifecycle did not restore exactly");
  return { projectId: String(before.projectId), origin: String(before.origin) };
}

function validateCleanVersion(value: unknown, projectId: string): void {
  const version = object(value, "OS-01 clean version");
  exactKeys(version, [
    "archiveContentHash", "archiveFileCount", "archiveFormat", "archiveSizeBytes", "observedAt",
    "projectId", "sourceCommit", "version", "versionId", "versionNumber"
  ], "OS-01 clean version");
  if (
    version.version !== CONTROL_PLANE_VERSION || version.projectId !== projectId || version.versionId !== CLEAN_VERSION_ID ||
    version.sourceCommit !== CLEAN_SOURCE_COMMIT ||
    !/^sha256:[a-f0-9]{64}$/u.test(text(version.archiveContentHash, "OS-01 clean archive hash"))
  ) throw new Error("OS-01 clean version is not the frozen public version");
  timestamp(version.observedAt, "OS-01 clean version observedAt");
  integer(version.versionNumber, "OS-01 clean version number", 1);
  integer(version.archiveFileCount, "OS-01 clean archive file count", 1);
  integer(version.archiveSizeBytes, "OS-01 clean archive bytes", 1);
  text(version.archiveFormat, "OS-01 clean archive format");
}

function validateCleanDeployment(value: unknown, projectId: string, origin: string, environmentRevision: number): void {
  const deployment = object(value, "OS-01 clean deployment");
  exactKeys(deployment, [
    "deploymentId", "environmentRevision", "observedAt", "origin", "projectId", "status", "type",
    "updatedAt", "version", "versionId"
  ], "OS-01 clean deployment");
  if (
    deployment.version !== CONTROL_PLANE_VERSION || deployment.projectId !== projectId || deployment.origin !== origin ||
    deployment.versionId !== CLEAN_VERSION_ID || deployment.status !== "succeeded" || deployment.type !== "publish" ||
    deployment.environmentRevision !== environmentRevision
  ) throw new Error("OS-01 clean deployment is invalid");
  text(deployment.deploymentId, "OS-01 clean deployment id");
  timestamp(deployment.observedAt, "OS-01 clean deployment observedAt");
  timestamp(deployment.updatedAt, "OS-01 clean deployment updatedAt");
}

function validateSourceRestoration(
  value: unknown,
  deploymentCommit: string,
  deploymentTreeObjectId: string,
  liveBaseTreeObjectId: string
): void {
  const source = object(value, "OS-01 source restoration");
  exactKeys(source, [
    "branch", "compareAndSwapApplied", "expectedOldHead", "observedAt", "postRestoreHead",
    "postRestoreTreeObjectId", "preRestoreHead", "preRestoreTreeObjectId", "projectionComplete", "restoredHead"
  ], "OS-01 source restoration");
  if (
    source.branch !== "main" || source.preRestoreHead !== deploymentCommit || source.expectedOldHead !== deploymentCommit ||
    source.restoredHead !== CLEAN_SOURCE_COMMIT || source.postRestoreHead !== CLEAN_SOURCE_COMMIT ||
    source.preRestoreTreeObjectId !== deploymentTreeObjectId ||
    source.postRestoreTreeObjectId !== liveBaseTreeObjectId ||
    source.compareAndSwapApplied !== true || source.projectionComplete !== true
  ) throw new Error("OS-01 source restoration is invalid");
  timestamp(source.observedAt, "OS-01 source restoration observedAt");
  commit(source.preRestoreTreeObjectId, "OS-01 pre-restore tree");
  commit(source.postRestoreTreeObjectId, "OS-01 post-restore tree");
}

function validateCleanHttp(value: unknown, origin: string): void {
  const observations = array(value, "OS-01 clean HTTP observations");
  if (observations.length !== 3) throw new Error("OS-01 clean HTTP observations are incomplete");
  const expected = new Map([
    ["sunday", { method: "GET", url: `${origin}/sunday`, status: 200 }],
    ["census_get", { method: "GET", url: `${origin}${CENSUS_ROUTE}`, status: 404 }],
    ["census_post", { method: "POST", url: `${origin}${CENSUS_ROUTE}`, status: 405 }]
  ]);
  const seen = new Set<string>();
  for (const [index, item] of observations.entries()) {
    const observation = object(item, `OS-01 clean HTTP observation ${index}`);
    exactKeys(observation, ["bodyBytes", "bodySha256", "method", "name", "observedAt", "status", "url"],
      `OS-01 clean HTTP observation ${index}`);
    const name = text(observation.name, `OS-01 clean HTTP observation ${index} name`);
    const contract = expected.get(name);
    if (!contract || seen.has(name) || observation.method !== contract.method ||
      observation.url !== contract.url || observation.status !== contract.status) {
      throw new Error("OS-01 clean HTTP observation identity is invalid");
    }
    seen.add(name);
    timestamp(observation.observedAt, `OS-01 ${name} observedAt`);
    hex(observation.bodySha256, `OS-01 ${name} body hash`);
    integer(observation.bodyBytes, `OS-01 ${name} body bytes`);
  }
}

function validateBindings(value: unknown, projectId: string): void {
  const bindings = object(value, "OS-01 clean bindings");
  exactKeys(bindings, ["d1Bindings", "observedAt", "projectId", "projectionComplete", "r2Bindings"],
    "OS-01 clean bindings");
  if (
    bindings.projectId !== projectId || bindings.projectionComplete !== true ||
    stableJson(bindings.d1Bindings) !== stableJson(["DB"]) || stableJson(bindings.r2Bindings) !== stableJson(["EVIDENCE"])
  ) throw new Error("OS-01 clean bindings are invalid");
  timestamp(bindings.observedAt, "OS-01 binding observedAt");
}

function validateProviderState(value: unknown): void {
  const state = object(value, "OS-01 provider-state observation");
  exactKeys(state, [
    "lastCost", "observedAt", "outstandingReservations", "projectionComplete", "remaining",
    "source", "stateRoot", "used"
  ], "OS-01 provider-state observation");
  const committed = {
    source: "production_d1_read_only_quota_metadata",
    projectionComplete: true,
    used: 38,
    remaining: 462,
    lastCost: 0,
    outstandingReservations: 0
  };
  if (
    state.source !== committed.source || state.projectionComplete !== true || state.used !== 38 ||
    state.remaining !== 462 || state.lastCost !== 0 || state.outstandingReservations !== 0 ||
    state.stateRoot !== sha256(stableJson(committed))
  ) throw new Error("OS-01 provider-state observation is invalid");
  timestamp(state.observedAt, "OS-01 provider-state observedAt");
}

function validateCensusReceipt(
  bytes: Uint8Array,
  expected: {
    receiptHash: string;
    authorityCommit: string;
    implementationCommit: string;
    deploymentCommit: string;
    deploymentVersion: string;
    projectId: string;
    origin: string;
    sourceAnchor: string;
    cleanupAt: string;
    uploaderAssertionRoot: string;
    qualificationBuild: JsonRecord;
    archive: JsonRecord;
    archiveBoundary: JsonRecord;
    deploymentProofHash: string;
    externalMutationIntent: JsonRecord;
    localPackageContentRoot: string;
  }
): {
  startedAt: string;
  completedAt: string;
  proofObservedAt: string;
  uploaderObservedAt: string;
  deploymentTreeObjectId: string;
  liveBaseTreeObjectId: string;
} {
  const receipt = parseObject(bytes, "OS-01 census receipt");
  exactKeys(receipt, [
    "attestationContractHash", "buildAttestation", "classification", "commonPassRoot", "completedAt",
    "contractHash", "contractVersion", "deployedOperatorSourceHash", "deploymentProof", "deploymentProofHash",
    "deploymentVersion", "firstPass", "migrationByteHashes", "operatorSourceHash", "prestateClassHash",
    "providerRequests", "providerSecretReads", "quotaReservations", "receiptHash", "reservationHash", "secondPass",
    "sourceCommit", "startedAt", "status", "target", "trustedTargetContractHash", "version"
  ], "OS-01 census receipt");
  requirePrettyJson(bytes, receipt, "OS-01 census receipt");
  const receiptHash = hex(receipt.receiptHash, "OS-01 census receipt hash");
  if (canonicalHash(receipt, "receiptHash") !== receiptHash || receiptHash !== expected.receiptHash) {
    throw new Error("OS-01 census receipt hash does not match the cleanup receipt");
  }
  if (
    receipt.version !== "os01-production-census-receipt.2026.1" ||
    receipt.status !== "accepted_two_identical_read_only_passes" || receipt.sourceCommit !== expected.deploymentCommit ||
    receipt.deploymentVersion !== expected.deploymentVersion || receipt.buildAttestation !== expected.sourceAnchor ||
    receipt.providerSecretReads !== 0 || receipt.providerRequests !== 0 || receipt.quotaReservations !== 0
  ) throw new Error("OS-01 census receipt is not an accepted provider-zero census");
  for (const field of [
    "attestationContractHash", "contractHash", "deploymentProofHash", "operatorSourceHash",
    "deployedOperatorSourceHash", "prestateClassHash", "reservationHash", "trustedTargetContractHash"
  ]) hex(receipt[field], `OS-01 census ${field}`);
  if (receipt.operatorSourceHash !== receipt.deployedOperatorSourceHash) {
    throw new Error("OS-01 census operator source hashes differ");
  }
  text(receipt.contractVersion, "OS-01 census contract version");
  object(receipt.classification, "OS-01 census classification");
  const deploymentProof = object(receipt.deploymentProof, "OS-01 census deployment proof");
  exactKeys(deploymentProof, [
    "build", "deployment", "deploymentCommit", "implementationCommit",
    "implementationToDeploymentDiff", "observedAt", "projectId", "sitesVersion",
    "sourceAnchor", "sourceIdentity", "status", "uploader", "version"
  ], "OS-01 census deployment proof");
  const deploymentProofHash = hex(receipt.deploymentProofHash, "OS-01 census deployment proof hash");
  const reconstructedProofBytes = Buffer.from(`${JSON.stringify(deploymentProof, null, 2)}\n`, "utf8");
  if (
    sha256(reconstructedProofBytes) !== deploymentProofHash ||
    deploymentProofHash !== expected.deploymentProofHash
  ) {
    throw new Error("OS-01 census deployment proof hash does not match the live trust boundary");
  }
  const sourceIdentity = object(
    deploymentProof.sourceIdentity,
    "OS-01 census deployment source identity"
  );
  exactKeys(sourceIdentity, [
    "authorityBridgeCodeRelation", "authorityEvidence", "buildInputRoot",
    "deploymentArchiveBytes", "deploymentArchiveSha256", "deploymentCommit",
    "deploymentTreeObjectId", "fullTreeIdentityVersion", "implementationArchiveBytes",
    "implementationArchiveSha256", "implementationBuild", "implementationCommit",
    "implementationToDeploymentNameStatus", "implementationTreeObjectId", "liveBaseCommit",
    "liveBaseToImplementationNameStatus", "liveBaseTreeObjectId", "sourceAnchor",
    "sourceTreeAnchor", "successorCommitCount"
  ], "OS-01 census deployment source identity");
  const authorityEvidence = object(
    sourceIdentity.authorityEvidence,
    "OS-01 census authority evidence"
  );
  exactKeys(authorityEvidence, [
    "authorityArchiveBytes", "authorityArchiveSha256", "authorityCommit",
    "authorityTreeObjectId", "authorityTreeRoot"
  ], "OS-01 census authority evidence");
  const codeRelation = object(
    sourceIdentity.authorityBridgeCodeRelation,
    "OS-01 census authority bridge-code relation"
  );
  exactKeys(codeRelation, [
    "authorityCommit", "files", "implementationCommit", "relationRoot", "version"
  ], "OS-01 census authority bridge-code relation");
  if (
    deploymentProof.version !== "os01-census-deployment-proof.2026.3" ||
    deploymentProof.status !== "ready_for_census" ||
    deploymentProof.implementationCommit !== expected.implementationCommit ||
    deploymentProof.deploymentCommit !== expected.deploymentCommit ||
    deploymentProof.projectId !== expected.projectId ||
    deploymentProof.sourceAnchor !== expected.sourceAnchor ||
    sourceIdentity.implementationCommit !== expected.implementationCommit ||
    sourceIdentity.deploymentCommit !== expected.deploymentCommit ||
    sourceIdentity.liveBaseCommit !== CLEAN_SOURCE_COMMIT ||
    sourceIdentity.sourceAnchor !== expected.sourceAnchor ||
    authorityEvidence.authorityCommit !== expected.authorityCommit ||
    codeRelation.authorityCommit !== expected.authorityCommit ||
    codeRelation.implementationCommit !== expected.implementationCommit
  ) {
    throw new Error("OS-01 census deployment proof is not bound to the cleanup receipt");
  }
  const proofBuild = object(deploymentProof.build, "OS-01 census deployment build proof");
  exactKeys(proofBuild, [
    "activeBuildFilesScanned", "activeBuildGraphHash", "activeSourceFilesScanned",
    "buildInputRoot", "builtWorkerHash", "compiledAnchorCarrierRoot", "distFileCount",
    "distFileListRoot", "distRoot", "entryStaticClosureRoot", "entryStaticFileCount",
    "localArchiveBytes", "localArchiveContentRoot", "localArchiveFileCount",
    "localArchiveFileListRoot", "localArchiveFormat", "localArchiveSha256",
    "packageContentRoot", "packageFileCount", "packageFileListRoot", "qualificationArchiveBoundary",
    "qualificationBuild", "sitesArchiveContentHash"
  ], "OS-01 census deployment build proof");
  if (
    proofBuild.localArchiveSha256 !== expected.archive.archiveSha256 ||
    proofBuild.localArchiveBytes !== expected.archive.archiveBytes ||
    proofBuild.localArchiveFileListRoot !== expected.archive.fileListRoot ||
    proofBuild.localArchiveContentRoot !== expected.archive.contentRoot ||
    proofBuild.localArchiveFileCount !== expected.archive.fileCount ||
    proofBuild.localArchiveFormat !== "tar.gz" ||
    proofBuild.packageFileListRoot !== expected.archive.fileListRoot ||
    proofBuild.packageFileCount !== expected.archive.fileCount ||
    stableJson(proofBuild.qualificationBuild) !== stableJson(expected.qualificationBuild) ||
    stableJson(proofBuild.qualificationArchiveBoundary) !== stableJson(expected.archiveBoundary) ||
    proofBuild.packageContentRoot !== expected.localPackageContentRoot
  ) throw new Error("OS-01 census deployment build is not bound to the cleanup receipt");
  if (sha256(stableJson(deploymentProof.uploader)) !== expected.uploaderAssertionRoot) {
    throw new Error("OS-01 census uploader assertion is not bound to the cleanup receipt");
  }
  const proofSitesVersion = object(deploymentProof.sitesVersion, "OS-01 census Sites version");
  exactKeys(proofSitesVersion, [
    "archiveContentHash", "archiveFileCount", "archiveFormat", "archiveSizeBytes",
    "sourceCommit", "versionId", "versionNumber"
  ], "OS-01 census Sites version");
  const proofDeployment = object(deploymentProof.deployment, "OS-01 census deployment projection");
  exactKeys(proofDeployment, [
    "accessPolicyRevision", "deploymentId", "environmentRevision", "origin", "status", "versionId"
  ], "OS-01 census deployment projection");
  if (
    proofSitesVersion.versionId !== expected.deploymentVersion ||
    proofSitesVersion.sourceCommit !== expected.deploymentCommit ||
    proofSitesVersion.archiveFormat !== "tar" ||
    proofDeployment.versionId !== expected.deploymentVersion ||
    proofDeployment.origin !== expected.origin ||
    proofDeployment.status !== "succeeded" ||
    proofDeployment.environmentRevision !== expected.externalMutationIntent.temporaryControlEnvironmentRevisionStaged ||
    proofDeployment.accessPolicyRevision !==
      object(expected.externalMutationIntent.accessBefore, "OS-01 mutation-intent access prestate").revision ||
    proofSitesVersion.archiveFileCount !== expected.archive.fileCount ||
    proofBuild.sitesArchiveContentHash !== proofSitesVersion.archiveContentHash
  ) throw new Error("OS-01 census hosted deployment is not bound to the cleanup receipt");
  const uploader = object(deploymentProof.uploader, "OS-01 census trusted uploader") as TrustedUploaderAssertion;
  const versionProjection: VersionProjection = {
    version: CONTROL_PLANE_VERSION,
    observedAt: timestamp(deploymentProof.observedAt, "OS-01 census deployment-proof observation"),
    projectId: expected.projectId,
    versionId: text(proofSitesVersion.versionId, "OS-01 census Sites version id"),
    versionNumber: integer(proofSitesVersion.versionNumber, "OS-01 census Sites version number", 1),
    sourceCommit: commit(proofSitesVersion.sourceCommit, "OS-01 census Sites source commit"),
    archiveFormat: text(proofSitesVersion.archiveFormat, "OS-01 census Sites archive format"),
    archiveContentHash: text(proofSitesVersion.archiveContentHash, "OS-01 census Sites archive hash"),
    archiveFileCount: integer(proofSitesVersion.archiveFileCount, "OS-01 census Sites file count", 1),
    archiveSizeBytes: integer(proofSitesVersion.archiveSizeBytes, "OS-01 census Sites archive bytes", 1)
  };
  validateTrustedUploaderAssertion(uploader, versionProjection, {
    archiveSha256: String(expected.archive.archiveSha256),
    archiveBytes: Number(expected.archive.archiveBytes),
    fileListRoot: String(expected.archive.fileListRoot),
    fileCount: Number(expected.archive.fileCount),
    packageContentRoot: expected.localPackageContentRoot
  });
  if (
    uploader.sourceHeadBefore !== CLEAN_SOURCE_COMMIT ||
    uploader.sourcePushExpectedOld !== CLEAN_SOURCE_COMMIT ||
    uploader.sourceHeadAfter !== expected.deploymentCommit ||
    uploader.mutationIntentHash !== expected.externalMutationIntent.intentHash ||
    uploader.temporaryControlExpiresAt !== expected.externalMutationIntent.temporaryControlExpiresAt ||
    uploader.temporaryControlAuthSha256 !== expected.externalMutationIntent.temporaryControlAuthSha256 ||
    uploader.temporaryControlBuildAttestation !== expected.sourceAnchor ||
    uploader.temporaryControlEnvironmentRevisionBefore !==
      expected.externalMutationIntent.temporaryControlEnvironmentRevisionBefore ||
    uploader.temporaryControlEnvironmentRevisionStaged !==
      expected.externalMutationIntent.temporaryControlEnvironmentRevisionStaged ||
    stableJson(uploader.externalMutationSequence) !== stableJson(EXTERNAL_MUTATION_SEQUENCE) ||
    uploader.trustBoundary !== os01ControlPlaneContract.trustBoundary ||
    uploader.canonicalizationClaim !== os01ControlPlaneContract.archiveCanonicalization ||
    uploader.archivePathBinding !== os01ControlPlaneContract.archivePathBinding
  ) throw new Error("OS-01 census trusted uploader is not bound to the live mutation intent");
  const deploymentTreeObjectId = commit(
    sourceIdentity.deploymentTreeObjectId,
    "OS-01 census deployment tree"
  );
  const liveBaseTreeObjectId = commit(
    sourceIdentity.liveBaseTreeObjectId,
    "OS-01 census live-base tree"
  );
  const migrationByteHashes = array(receipt.migrationByteHashes, "OS-01 census migration hashes");
  if (migrationByteHashes.length === 0) throw new Error("OS-01 census migration hashes are empty");
  for (const [index, value] of migrationByteHashes.entries()) {
    const migration = object(value, `OS-01 census migration hash ${index}`);
    exactKeys(migration, ["sha256", "tag"], `OS-01 census migration hash ${index}`);
    text(migration.tag, `OS-01 census migration tag ${index}`);
    hex(migration.sha256, `OS-01 census migration digest ${index}`);
  }
  const firstPass = object(receipt.firstPass, "OS-01 first census pass");
  const secondPass = object(receipt.secondPass, "OS-01 second census pass");
  const commonPassRoot = hex(receipt.commonPassRoot, "OS-01 common census pass root");
  if (
    hex(firstPass.passRoot, "OS-01 first census pass root") !== commonPassRoot ||
    hex(secondPass.passRoot, "OS-01 second census pass root") !== commonPassRoot ||
    firstPass.passNumber !== 1 || secondPass.passNumber !== 2
  ) throw new Error("OS-01 census passes are not two independently numbered identical-root passes");
  const target = object(receipt.target, "OS-01 census target");
  exactKeys(target, ["accessMode", "loopbackFixture", "name", "origin", "projectId"], "OS-01 census target");
  if (
    target.name !== "production" || target.projectId !== expected.projectId || target.origin !== expected.origin ||
    target.accessMode !== "production" || target.loopbackFixture !== false
  ) throw new Error("OS-01 census target is invalid");
  const startedAt = timestamp(receipt.startedAt, "OS-01 census start");
  const completedAt = timestamp(receipt.completedAt, "OS-01 census completion");
  if (Date.parse(startedAt) > Date.parse(completedAt) || Date.parse(completedAt) > Date.parse(expected.cleanupAt)) {
    throw new Error("OS-01 census lifecycle is invalid");
  }
  return {
    startedAt,
    completedAt,
    proofObservedAt: timestamp(deploymentProof.observedAt, "OS-01 census deployment-proof observation"),
    uploaderObservedAt: timestamp(uploader.observedAt, "OS-01 census uploader observation"),
    deploymentTreeObjectId,
    liveBaseTreeObjectId
  };
}

const SUCCESS_PHASES = [
  "session_lock_acquired", "source_anchor_ready", "deployment_archive_ready", "external_mutation_armed",
  "proof_and_census_complete", "cleanup_verified", "session_complete"
] as const;

function validatePhaseLedgerBytes(
  bytes: Uint8Array,
  summary: JsonRecord,
  cleanupSummary: JsonRecord,
  runId: string,
  completedAt: string,
  lockStartedAt: string,
  lockExpiresAt: string,
  externalMutationIntentObservedAt: string,
  censusCompletedAt: string
): { proofAndCensusCompletedAt: string } {
  const raw = Buffer.from(bytes);
  if (raw.byteLength === 0 || raw.at(-1) !== 0x0a || raw.includes(0x0d) || raw.includes(0x00)) {
    throw new Error("OS-01 phase-ledger bytes are not canonical JSONL");
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new Error("OS-01 phase-ledger bytes are not canonical UTF-8");
  }
  const lines = source.slice(0, -1).split("\n");
  if (lines.length !== SUCCESS_PHASES.length) throw new Error("OS-01 phase-ledger entry count is invalid");
  let previousEntryHash = "0".repeat(64);
  let previousTime = Number.NEGATIVE_INFINITY;
  const parsedLines: JsonRecord[] = [];
  for (const [sequence, line] of lines.entries()) {
    const entry = parseObject(Buffer.from(line, "utf8"), `OS-01 phase-ledger entry ${sequence}`);
    exactKeys(entry, ["entryHash", "observedAt", "phase", "previousEntryHash", "runId", "sequence", "version"],
      `OS-01 phase-ledger entry ${sequence}`);
    const observedAt = timestamp(entry.observedAt, `OS-01 phase-ledger entry ${sequence} time`);
    const observedMs = Date.parse(observedAt);
    if (
      entry.version !== "os01-session-phase-ledger-entry.2026.1" || entry.runId !== runId ||
      entry.sequence !== sequence || entry.phase !== SUCCESS_PHASES[sequence] ||
      entry.previousEntryHash !== previousEntryHash || observedMs < previousTime ||
      observedMs < Date.parse(lockStartedAt) || observedMs > Date.parse(lockExpiresAt) || stableJson(entry) !== line
    ) throw new Error(`OS-01 phase-ledger entry ${sequence} is invalid`);
    const entryHash = hex(entry.entryHash, `OS-01 phase-ledger entry ${sequence} hash`);
    if (canonicalHash(entry, "entryHash") !== entryHash) {
      throw new Error(`OS-01 phase-ledger entry ${sequence} hash does not verify`);
    }
    parsedLines.push(entry);
    previousEntryHash = entryHash;
    previousTime = observedMs;
  }
  if (
    sha256(raw) !== summary.ledgerSha256 || previousEntryHash !== summary.lastEntryHash ||
    lines.length !== summary.entryCount
  ) throw new Error("OS-01 final phase-ledger summary does not match its exact bytes");
  const cleanupPrefix = Buffer.from(`${lines.slice(0, 6).join("\n")}\n`, "utf8");
  if (
    cleanupSummary.entryCount !== 6 || cleanupSummary.runId !== runId ||
    cleanupSummary.ledgerSha256 !== sha256(cleanupPrefix) || cleanupSummary.lastEntryHash !== parsedLines[5]!.entryHash ||
    parsedLines[3]!.observedAt !== externalMutationIntentObservedAt ||
    Date.parse(String(parsedLines[4]!.observedAt)) < Date.parse(censusCompletedAt) ||
    parsedLines[5]!.observedAt !== completedAt || parsedLines[6]!.observedAt !== completedAt
  ) throw new Error("OS-01 cleanup phase-ledger summary does not match the exact six-entry prefix");
  return {
    proofAndCensusCompletedAt: timestamp(
      parsedLines[4]!.observedAt,
      "OS-01 proof-and-census-complete phase time"
    )
  };
}

/**
 * Verifies the complete OS-01 terminal evidence set against a caller-supplied,
 * independently retained live-controller trust boundary. The marker's
 * trustBoundaryRoot is only a fingerprint; it is not standalone authentication
 * and the trust input must never be reconstructed from the evidence bundle.
 */
export function validateOs01SessionAcceptance(input: {
  sessionReceiptBytes: Uint8Array;
  censusReceiptBytes: Uint8Array;
  externalMutationIntentBytes: Uint8Array;
  acceptanceBytes: Uint8Array;
  phaseLedgerBytes: Uint8Array;
  trustedBoundary: Os01SessionAcceptanceTrust;
  trustedFinalization: Os01SessionFinalizationTrust;
  rejectionReceiptPresent: boolean;
  acceptanceFailureReceiptPresent: boolean;
}): Os01SessionAcceptanceEvidence {
  if (input.rejectionReceiptPresent || input.acceptanceFailureReceiptPresent) {
    throw new Error("OS-01 session cannot be accepted beside a rejection or acceptance-failure receipt");
  }
  const trust = validateTrustBoundary(input.trustedBoundary);
  const trustBoundaryRoot = os01SessionAcceptanceTrustRoot(trust);
  const finalizationTrust = validateFinalizationTrust(input.trustedFinalization, trust);
  const finalizationTrustRoot = os01SessionFinalizationTrustRoot(finalizationTrust, trust);
  if (
    sha256(input.censusReceiptBytes) !== finalizationTrust.censusReceiptBytesSha256 ||
    sha256(input.sessionReceiptBytes) !== finalizationTrust.sessionReceiptBytesSha256 ||
    sha256(input.phaseLedgerBytes) !== finalizationTrust.phaseLedgerBytesSha256
  ) throw new Error("OS-01 terminal evidence bytes do not match the live finalization trust boundary");
  const receipt = parseObject(input.sessionReceiptBytes, "OS-01 cleanup receipt");
  exactKeys(receipt, [
    "access", "archive", "authorityCommit", "bindings", "censusReceiptHash", "censusStatus",
    "cleanDeployment", "cleanHttp", "cleanVersion", "completedAt", "deploymentCommit", "environment",
    "externalMutationIntentHash", "externalMutationIntentRoot", "implementationCommit", "phaseLedgerAtCleanup",
    "productionSessionLock", "productionSessionLockDisposition", "productionSessionLockIdentityHash",
    "providerRequests", "providerSecretReads", "providerState", "qualificationArchiveBoundary",
    "qualificationBuild", "quotaReservations", "receiptHash", "runId", "seedCommitment", "sourceAnchor",
    "sourceRestoration", "status", "temporaryDeploymentVersionId", "uploaderAssertionRoot", "version"
  ], "OS-01 cleanup receipt");
  requirePrettyJson(input.sessionReceiptBytes, receipt, "OS-01 cleanup receipt");
  if (
    receipt.version !== "os01-private-seed-session-receipt.2026.4" ||
    receipt.status !== "verified_cleanup_pending_acceptance_marker" ||
    receipt.censusStatus !== "accepted_two_identical_read_only_passes" ||
    receipt.productionSessionLockDisposition !== "retained_until_acceptance_publication" ||
    receipt.providerSecretReads !== 0 || receipt.providerRequests !== 0 || receipt.quotaReservations !== 0
  ) throw new Error("OS-01 cleanup receipt is not the complete non-accepting terminal candidate");
  const receiptHash = hex(receipt.receiptHash, "OS-01 cleanup receipt hash");
  if (canonicalHash(receipt, "receiptHash") !== receiptHash) throw new Error("OS-01 cleanup receipt hash does not verify");
  if (receiptHash !== finalizationTrust.sessionReceiptHash) {
    throw new Error("OS-01 cleanup receipt hash does not match the live finalization trust boundary");
  }
  const runId = uuid(receipt.runId, "OS-01 cleanup run identity");
  const seedCommitment = hex(receipt.seedCommitment, "OS-01 cleanup seed commitment");
  const sourceAnchor = hex(receipt.sourceAnchor, "OS-01 cleanup source anchor");
  const authorityCommit = commit(receipt.authorityCommit, "OS-01 authority commit");
  const implementationCommit = commit(receipt.implementationCommit, "OS-01 implementation commit");
  const deploymentCommit = commit(receipt.deploymentCommit, "OS-01 deployment commit");
  const deploymentVersion = text(receipt.temporaryDeploymentVersionId, "OS-01 temporary deployment version");
  const completedAt = timestamp(receipt.completedAt, "OS-01 cleanup completion");
  if (completedAt !== finalizationTrust.completedAt) {
    throw new Error("OS-01 cleanup completion does not match the live finalization trust boundary");
  }
  const boundCensusReceiptHash = hex(receipt.censusReceiptHash, "OS-01 bound census receipt hash");
  if (boundCensusReceiptHash !== finalizationTrust.censusReceiptHash) {
    throw new Error("OS-01 census receipt hash does not match the live finalization trust boundary");
  }
  const uploaderAssertionRoot = hex(receipt.uploaderAssertionRoot, "OS-01 uploader assertion root");
  const externalMutationIntentHash = hex(
    receipt.externalMutationIntentHash,
    "OS-01 external-mutation intent hash"
  );
  const externalMutationIntentRoot = hex(
    receipt.externalMutationIntentRoot,
    "OS-01 external-mutation intent root"
  );
  if (
    runId !== trust.runId || seedCommitment !== trust.seedCommitment || sourceAnchor !== trust.sourceAnchor ||
    authorityCommit !== trust.authorityCommit || implementationCommit !== trust.implementationCommit ||
    deploymentCommit !== trust.deploymentCommit ||
    receipt.productionSessionLockIdentityHash !== trust.productionSessionLockIdentityHash ||
    externalMutationIntentHash !== trust.externalMutationIntentHash ||
    externalMutationIntentRoot !== trust.externalMutationIntentHash
  ) throw new Error("OS-01 cleanup receipt does not match the live acceptance trust boundary");

  const { projectId, origin } = validateAccessLifecycle(receipt.access);
  if (projectId !== trust.targetProjectId || origin !== trust.targetOrigin) {
    throw new Error("OS-01 production target does not match the live acceptance trust boundary");
  }
  validateEnvironmentLifecycle(receipt.environment, projectId);
  const environment = object(receipt.environment, "OS-01 environment lifecycle");
  const environmentAfter = object(environment.after, "OS-01 environment after");
  const build = validateQualificationBuild(receipt.qualificationBuild, receipt, projectId);
  const archive = validateArchiveEvidence(receipt.archive);
  if (
    archive.archiveSha256 !== trust.archiveSha256 || archive.archiveBytes !== trust.archiveBytes ||
    archive.fileListRoot !== trust.archiveFileListRoot || archive.contentRoot !== trust.archiveContentRoot ||
    archive.fileCount !== trust.archiveFileCount
  ) throw new Error("OS-01 archive does not match the live acceptance trust boundary");
  const archiveBoundary = object(receipt.qualificationArchiveBoundary, "OS-01 qualification archive boundary");
  validateArchiveBoundary(archiveBoundary, build, archive);

  const lock = object(receipt.productionSessionLock, "OS-01 production-session lock");
  exactKeys(lock, [
    "expiresAt", "lockIdentityHash", "ownerTokenSha256", "runId", "seedCommitment", "startedAt",
    "targetProjectId", "version"
  ], "OS-01 production-session lock");
  if (
    lock.version !== "os01-production-session-lock.2026.1" || lock.targetProjectId !== projectId ||
    lock.runId !== runId || lock.seedCommitment !== seedCommitment ||
    canonicalHash(lock, "lockIdentityHash") !== lock.lockIdentityHash ||
    lock.lockIdentityHash !== receipt.productionSessionLockIdentityHash
  ) throw new Error("OS-01 production-session lock identity is invalid");
  hex(lock.ownerTokenSha256, "OS-01 lock owner-token hash");
  const lockStartedAt = timestamp(lock.startedAt, "OS-01 lock start");
  const lockExpiresAt = timestamp(lock.expiresAt, "OS-01 lock expiry");
  if (Date.parse(lockStartedAt) >= Date.parse(lockExpiresAt) ||
    Date.parse(completedAt) < Date.parse(lockStartedAt) || Date.parse(completedAt) > Date.parse(lockExpiresAt)) {
    throw new Error("OS-01 cleanup is outside the production-session lock interval");
  }

  const cleanupSummary = validateHashSummary(receipt.phaseLedgerAtCleanup, "OS-01 cleanup phase ledger", null);
  if (cleanupSummary.runId !== runId || cleanupSummary.entryCount !== 6) {
    throw new Error("OS-01 cleanup phase ledger is incomplete");
  }
  validateCleanVersion(receipt.cleanVersion, projectId);
  validateCleanDeployment(receipt.cleanDeployment, projectId, origin, Number(environmentAfter.revision));
  validateCleanHttp(receipt.cleanHttp, origin);
  validateBindings(receipt.bindings, projectId);
  validateProviderState(receipt.providerState);
  const receiptEnvironment = object(receipt.environment, "OS-01 environment lifecycle");
  const receiptAccess = object(receipt.access, "OS-01 access lifecycle");
  const externalMutationIntent = validateExternalMutationIntent(input.externalMutationIntentBytes, {
    trust,
    environmentBefore: object(receiptEnvironment.before, "OS-01 environment before"),
    accessBefore: object(receiptAccess.before, "OS-01 access before"),
    lockStartedAt,
    lockExpiresAt,
    receiptHash: externalMutationIntentHash,
    receiptRoot: externalMutationIntentRoot
  });
  if (
    externalMutationIntent.temporaryControlEnvironmentRevisionStaged !==
      object(receiptEnvironment.staged, "OS-01 environment staged").revision
  ) throw new Error("OS-01 external-mutation intent is not bound to the staged environment revision");
  const censusLifecycle = validateCensusReceipt(input.censusReceiptBytes, {
    receiptHash: String(receipt.censusReceiptHash), authorityCommit, implementationCommit, deploymentCommit,
    deploymentVersion, projectId, origin, sourceAnchor, cleanupAt: completedAt, uploaderAssertionRoot,
    qualificationBuild: build, archive, archiveBoundary,
    deploymentProofHash: trust.deploymentProofHash,
    externalMutationIntent,
    localPackageContentRoot: trust.localPackageContentRoot
  });
  if (
    censusLifecycle.startedAt !== finalizationTrust.censusStartedAt ||
    censusLifecycle.completedAt !== finalizationTrust.censusCompletedAt
  ) throw new Error("OS-01 census chronology does not match the live finalization trust boundary");
  validateSourceRestoration(
    receipt.sourceRestoration,
    deploymentCommit,
    censusLifecycle.deploymentTreeObjectId,
    censusLifecycle.liveBaseTreeObjectId
  );
  if (Date.parse(censusLifecycle.startedAt) < Date.parse(lockStartedAt) ||
    Date.parse(censusLifecycle.completedAt) > Date.parse(completedAt)) {
    throw new Error("OS-01 census is outside the accepted session lifecycle");
  }
  const intentObservedAt = timestamp(
    externalMutationIntent.observedAt,
    "OS-01 external-mutation intent observation time"
  );
  if (
    Date.parse(intentObservedAt) > Date.parse(censusLifecycle.proofObservedAt) ||
    Date.parse(censusLifecycle.proofObservedAt) > Date.parse(censusLifecycle.startedAt)
  ) throw new Error("OS-01 mutation intent, deployment proof, and census order is invalid");
  const environmentBeforeProjection = object(receiptEnvironment.before, "OS-01 environment before");
  const environmentStagedProjection = object(receiptEnvironment.staged, "OS-01 environment staged");
  const environmentAfterProjection = object(receiptEnvironment.after, "OS-01 environment after");
  const accessBeforeProjection = object(receiptAccess.before, "OS-01 access before");
  const accessAfterProjection = object(receiptAccess.after, "OS-01 access after");
  assertTimestampRange(
    environmentBeforeProjection.observedAt, "OS-01 environment prestate observation",
    lockStartedAt, intentObservedAt
  );
  assertTimestampRange(
    accessBeforeProjection.observedAt, "OS-01 access prestate observation",
    lockStartedAt, intentObservedAt
  );
  const stagedAt = assertTimestampRange(
    environmentStagedProjection.observedAt, "OS-01 staged environment observation",
    intentObservedAt, censusLifecycle.proofObservedAt
  );
  if (environmentStagedProjection.updatedAt !== null) {
    assertTimestampRange(
      environmentStagedProjection.updatedAt, "OS-01 staged environment update",
      intentObservedAt, censusLifecycle.proofObservedAt
    );
  }
  assertTimestampRange(
    censusLifecycle.uploaderObservedAt, "OS-01 trusted uploader observation",
    stagedAt, censusLifecycle.proofObservedAt
  );
  const cleanupObservationTimes: Array<[unknown, string]> = [
    [environmentAfterProjection.observedAt, "OS-01 restored environment observation"],
    [accessAfterProjection.observedAt, "OS-01 restored access observation"],
    [object(receipt.cleanVersion, "OS-01 clean version").observedAt, "OS-01 clean version observation"],
    [object(receipt.cleanDeployment, "OS-01 clean deployment").observedAt, "OS-01 clean deployment observation"],
    [object(receipt.cleanDeployment, "OS-01 clean deployment").updatedAt, "OS-01 clean deployment update"],
    [object(receipt.sourceRestoration, "OS-01 source restoration").observedAt, "OS-01 source restoration observation"],
    [object(receipt.bindings, "OS-01 clean bindings").observedAt, "OS-01 binding observation"],
    [object(receipt.providerState, "OS-01 provider state").observedAt, "OS-01 provider-state observation"]
  ];
  if (environmentAfterProjection.updatedAt !== null) {
    cleanupObservationTimes.push([
      environmentAfterProjection.updatedAt,
      "OS-01 restored environment update"
    ]);
  }
  for (const [index, item] of array(receipt.cleanHttp, "OS-01 clean HTTP observations").entries()) {
    cleanupObservationTimes.push([
      object(item, `OS-01 clean HTTP observation ${index}`).observedAt,
      `OS-01 clean HTTP observation ${index} time`
    ]);
  }
  const acceptance = parseObject(input.acceptanceBytes, "OS-01 acceptance marker");
  exactKeys(acceptance, [
    "acceptanceHash", "acceptedAt", "finalizationTrustRoot", "phaseLedger",
    "productionSessionLockIdentityHash", "runId", "seedCommitment", "sessionReceiptHash", "sourceAnchor",
    "status", "trustBoundaryRoot", "version"
  ], "OS-01 acceptance marker");
  requirePrettyJson(input.acceptanceBytes, acceptance, "OS-01 acceptance marker");
  if (
    acceptance.version !== "os01-private-seed-session-acceptance.2026.4" ||
    acceptance.status !== "clean_public_production_census_session_accepted"
  ) throw new Error("OS-01 acceptance marker identity is invalid");
  const acceptanceHash = hex(acceptance.acceptanceHash, "OS-01 acceptance hash");
  if (canonicalHash(acceptance, "acceptanceHash") !== acceptanceHash) {
    throw new Error("OS-01 acceptance marker hash does not verify");
  }
  if (hex(acceptance.sessionReceiptHash, "OS-01 bound receipt hash") !== receiptHash) {
    throw new Error("OS-01 acceptance marker does not bind the cleanup receipt");
  }
  if (
    acceptance.runId !== runId || acceptance.seedCommitment !== seedCommitment ||
    acceptance.sourceAnchor !== sourceAnchor ||
    acceptance.trustBoundaryRoot !== trustBoundaryRoot ||
    acceptance.finalizationTrustRoot !== finalizationTrustRoot ||
    acceptance.productionSessionLockIdentityHash !== receipt.productionSessionLockIdentityHash ||
    timestamp(acceptance.acceptedAt, "OS-01 acceptance time") !== completedAt
  ) throw new Error("OS-01 acceptance marker identity does not match its cleanup receipt");
  const ledger = validateHashSummary(acceptance.phaseLedger, "OS-01 final phase ledger", "session_complete");
  if (ledger.runId !== runId || ledger.entryCount !== 7) {
    throw new Error("OS-01 final phase ledger is not terminal for the accepted run");
  }
  if (
    ledger.ledgerSha256 !== finalizationTrust.phaseLedgerBytesSha256 ||
    ledger.entryCount !== finalizationTrust.phaseLedgerEntryCount ||
    ledger.lastEntryHash !== finalizationTrust.phaseLedgerLastEntryHash
  ) throw new Error("OS-01 final phase ledger does not match the live finalization trust boundary");
  const phaseLedgerLifecycle = validatePhaseLedgerBytes(
    input.phaseLedgerBytes,
    ledger,
    cleanupSummary,
    runId,
    completedAt,
    lockStartedAt,
    lockExpiresAt,
    intentObservedAt,
    censusLifecycle.completedAt
  );
  for (const [value, label] of cleanupObservationTimes) {
    assertTimestampRange(
      value,
      label,
      phaseLedgerLifecycle.proofAndCensusCompletedAt,
      completedAt
    );
  }
  return acceptance as Os01SessionAcceptanceEvidence;
}
