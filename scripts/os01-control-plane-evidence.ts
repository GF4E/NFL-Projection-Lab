import { createHash } from "node:crypto";

type JsonScalar = boolean | number | string | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export const os01ControlPlaneContract = {
  version: "os01-sites-control-plane.2026.1",
  temporaryControls: [
    "OS01_CENSUS_AUTH_SHA256",
    "OS01_CENSUS_BUILD_ATTESTATION",
    "OS01_CENSUS_EXPIRES_AT"
  ] as const,
  captureGate: "ENGINE_OS_CAPTURE_ENABLED",
  phases: [
    "preregistered",
    "access_verified",
    "controls_staged",
    "bridge_deployed",
    "pre_census_verified",
    "census_complete",
    "post_census_verified",
    "controls_removed",
    "clean_successor_deployed",
    "cleanup_verified"
  ] as const,
  observationMaximumAgeSeconds: 600,
  observationMaximumFutureSkewSeconds: 120,
  trustBoundary: "trusted_sites_connector_plus_trusted_controller",
  archiveCanonicalization: "sites_archive_hash_is_opaque_and_not_a_local_tar_hash"
} as const;

type Phase = typeof os01ControlPlaneContract.phases[number];

function stable(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)])) as { [key: string]: JsonValue };
  }
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) {
    return value as JsonScalar;
  }
  throw new Error("control-plane evidence contains an unsupported value");
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
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

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} is invalid`);
  return result;
}

function hex(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function sitesHash(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^sha256:[a-f0-9]{64}$/u.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function assertFresh(observedAt: string, nowMs: number): void {
  const age = nowMs - Date.parse(observedAt);
  if (age > os01ControlPlaneContract.observationMaximumAgeSeconds * 1000) {
    throw new Error("control-plane observation is stale");
  }
  if (age < -os01ControlPlaneContract.observationMaximumFutureSkewSeconds * 1000) {
    throw new Error("control-plane observation is too far in the future");
  }
}

export type AccessProjection = {
  version: string;
  observedAt: string;
  projectId: string;
  origin: string;
  currentUserRole: string;
  accessMode: string;
  revision: number;
  principalRoot: string;
  allowedAccountUserCount: number;
  allowedUserCount: number;
  ownerRoleCount: number;
  nonOwnerUserCount: number;
  editorCount: number;
  groupCount: number;
  workspaceGroupCount: number;
  tenantGroupCount: number;
  externalVisitorCount: number;
};

/**
 * Projects only structural access evidence. It deliberately never reads user
 * names, email addresses, source credentials, or SIWC tokens.
 */
export function projectOwnerOnlyAccess(
  raw: unknown,
  input: { observedAt: string; projectId: string; origin: string; nowMs?: number }
): AccessProjection {
  const site = record(raw, "Sites project");
  const policy = record(site.access_policy, "Sites access policy");
  const observedAt = timestamp(input.observedAt, "access observation time");
  assertFresh(observedAt, input.nowMs ?? Date.now());
  if (text(site.id, "Sites project id") !== input.projectId) throw new Error("access project mismatch");
  if (text(site.current_live_url, "Sites live origin") !== input.origin) throw new Error("access origin mismatch");
  if (text(policy.project_id, "access-policy project id") !== input.projectId) {
    throw new Error("access-policy project mismatch");
  }

  const accountIds = array(policy.allowed_account_user_ids, "allowed account users")
    .map((value) => text(value, "allowed account user id")).sort();
  const workspaceGroupIds = array(policy.allowed_workspace_group_ids, "workspace groups")
    .map((value) => text(value, "workspace group id")).sort();
  const tenantGroupIds = array(policy.allowed_tenant_group_ids, "tenant groups")
    .map((value) => text(value, "tenant group id")).sort();
  const users = array(policy.allowed_users, "allowed users").map((value) => {
    const user = record(value, "allowed user");
    return {
      accountUserId: text(user.account_user_id, "allowed user id"),
      external: user.is_external === true,
      role: typeof user.role === "string" ? user.role : null
    };
  }).sort((left, right) => left.accountUserId.localeCompare(right.accountUserId));
  const editors = array(policy.allowed_editors ?? [], "allowed editors").map((value) => {
    const editor = record(value, "allowed editor");
    return {
      accountUserId: text(editor.account_user_id, "allowed editor id"),
      external: editor.is_external === true,
      role: typeof editor.role === "string" ? editor.role : null
    };
  }).sort((left, right) => left.accountUserId.localeCompare(right.accountUserId));
  const groups = array(policy.allowed_groups, "allowed groups").map((value) => {
    const group = record(value, "allowed group");
    return {
      id: text(group.id, "allowed group id"),
      role: typeof group.role === "string" ? group.role : null,
      size: integer(group.size, "allowed group size")
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  const currentUserRole = text(site.current_user_role, "current Sites role");
  const accessMode = text(policy.access_mode, "access mode");
  const externalVisitorCount = integer(policy.external_visitor_count ?? 0, "external visitor count");
  const ownerRoleCount = users.filter((user) => user.role === "owner").length;
  const nonOwnerUserCount = users.length - ownerRoleCount;
  const principalRoot = sha256(stableJson({ accountIds, users, editors, groups, workspaceGroupIds, tenantGroupIds }));

  const projection: AccessProjection = {
    version: os01ControlPlaneContract.version,
    observedAt,
    projectId: input.projectId,
    origin: input.origin,
    currentUserRole,
    accessMode,
    revision: integer(policy.revision, "access revision", 1),
    principalRoot,
    allowedAccountUserCount: accountIds.length,
    allowedUserCount: users.length,
    ownerRoleCount,
    nonOwnerUserCount,
    editorCount: editors.length,
    groupCount: groups.length,
    workspaceGroupCount: workspaceGroupIds.length,
    tenantGroupCount: tenantGroupIds.length,
    externalVisitorCount
  };
  validateOwnerOnlyAccess(projection);
  return projection;
}

export function validateOwnerOnlyAccess(projection: AccessProjection): void {
  if (
    projection.currentUserRole !== "owner" || projection.accessMode !== "custom" ||
    projection.allowedAccountUserCount !== 1 || projection.allowedUserCount !== 1 ||
    projection.ownerRoleCount !== 1 || projection.nonOwnerUserCount !== 0 ||
    projection.editorCount !== 0 || projection.groupCount !== 0 ||
    projection.workspaceGroupCount !== 0 || projection.tenantGroupCount !== 0 ||
    projection.externalVisitorCount !== 0
  ) throw new Error("Sites target is not structurally owner-only");
}

export type EnvironmentProjection = {
  version: string;
  observedAt: string;
  projectId: string;
  revision: number;
  updatedAt: string | null;
  controlsPresent: string[];
  controlsAllSecret: boolean;
  captureGatePresent: boolean;
  entryCount: number;
  unrelatedEntryCount: number;
  unrelatedMetadataRoot: string;
  allMetadataRoot: string;
};

/** Project key/type/secrecy metadata only; `entry.value` is never read. */
export function projectEnvironmentMetadata(
  raw: unknown,
  input: { observedAt: string; projectId: string; nowMs?: number }
): EnvironmentProjection {
  const environment = record(raw, "Sites environment");
  const observedAt = timestamp(input.observedAt, "environment observation time");
  assertFresh(observedAt, input.nowMs ?? Date.now());
  if (text(environment.project_id, "environment project id") !== input.projectId) {
    throw new Error("environment project mismatch");
  }
  const entries = array(environment.entries, "environment entries").map((value) => {
    const entry = record(value, "environment entry");
    return {
      key: text(entry.key, "environment key"),
      isSecret: entry.is_secret === true,
      type: entry.type === undefined ? "envvar" : text(entry.type, "environment entry type")
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
  if (new Set(entries.map((entry) => entry.key)).size !== entries.length) {
    throw new Error("environment contains duplicate keys");
  }
  const temporary = new Set<string>(os01ControlPlaneContract.temporaryControls);
  const controls = entries.filter((entry) => temporary.has(entry.key));
  const unrelated = entries.filter((entry) => !temporary.has(entry.key) && entry.key !== os01ControlPlaneContract.captureGate);
  return {
    version: os01ControlPlaneContract.version,
    observedAt,
    projectId: input.projectId,
    revision: integer(environment.revision, "environment revision"),
    updatedAt: environment.updated_at === null ? null : timestamp(environment.updated_at, "environment updated time"),
    controlsPresent: controls.map((entry) => entry.key),
    controlsAllSecret: controls.every((entry) => entry.isSecret && entry.type === "envvar"),
    captureGatePresent: entries.some((entry) => entry.key === os01ControlPlaneContract.captureGate),
    entryCount: entries.length,
    unrelatedEntryCount: unrelated.length,
    unrelatedMetadataRoot: sha256(stableJson(unrelated)),
    allMetadataRoot: sha256(stableJson(entries))
  };
}

export type VersionProjection = {
  version: string;
  observedAt: string;
  projectId: string;
  versionId: string;
  versionNumber: number;
  sourceCommit: string;
  archiveFormat: string;
  archiveContentHash: string;
  archiveFileCount: number;
  archiveSizeBytes: number;
};

export function projectSavedVersion(
  raw: unknown,
  input: { observedAt: string; projectId: string; sourceCommit: string; nowMs?: number }
): VersionProjection {
  const version = record(raw, "Sites version");
  const source = record(version.source, "Sites version source");
  const archive = record(version.archive_storage, "Sites version archive");
  const observedAt = timestamp(input.observedAt, "version observation time");
  assertFresh(observedAt, input.nowMs ?? Date.now());
  if (text(version.project_id, "version project id") !== input.projectId) throw new Error("version project mismatch");
  if (text(source.commit_sha, "version source commit") !== input.sourceCommit) throw new Error("version source mismatch");
  return {
    version: os01ControlPlaneContract.version,
    observedAt,
    projectId: input.projectId,
    versionId: text(version.id, "Sites version id"),
    versionNumber: integer(version.version_number, "Sites version number", 1),
    sourceCommit: input.sourceCommit,
    archiveFormat: text(archive.archive_format, "Sites archive format"),
    archiveContentHash: sitesHash(archive.content_hash, "Sites archive hash"),
    archiveFileCount: integer(archive.file_count, "Sites archive file count", 1),
    archiveSizeBytes: integer(archive.size_bytes, "Sites archive size", 1)
  };
}

export type DeploymentProjection = {
  version: string;
  observedAt: string;
  projectId: string;
  deploymentId: string;
  versionId: string;
  status: string;
  type: string;
  environmentRevision: number;
  origin: string;
  updatedAt: string;
};

export function projectDeployment(
  raw: unknown,
  input: { observedAt: string; projectId: string; versionId: string; origin: string; nowMs?: number }
): DeploymentProjection {
  const deployment = record(raw, "Sites deployment");
  const observedAt = timestamp(input.observedAt, "deployment observation time");
  assertFresh(observedAt, input.nowMs ?? Date.now());
  if (text(deployment.project_id, "deployment project id") !== input.projectId) throw new Error("deployment project mismatch");
  if (text(deployment.version_id, "deployment version id") !== input.versionId) throw new Error("deployment version mismatch");
  if (text(deployment.url, "deployment origin") !== input.origin) throw new Error("deployment origin mismatch");
  const result: DeploymentProjection = {
    version: os01ControlPlaneContract.version,
    observedAt,
    projectId: input.projectId,
    deploymentId: text(deployment.id, "deployment id"),
    versionId: input.versionId,
    status: text(deployment.status, "deployment status"),
    type: text(deployment.type, "deployment type"),
    environmentRevision: integer(deployment.env_set_revision, "deployment environment revision"),
    origin: input.origin,
    updatedAt: timestamp(deployment.updated_at, "deployment update time")
  };
  if (result.status !== "succeeded" || result.type !== "publish") throw new Error("deployment is not a successful publish");
  return result;
}

export type DatabaseProjection = {
  version: string;
  observedAt: string;
  projectId: string;
  selectedBinding: string;
  bindingCount: number;
  projectionComplete: boolean;
};

export function projectLogicalDatabase(
  raw: unknown,
  input: { observedAt: string; projectId: string; nowMs?: number }
): DatabaseProjection {
  const overview = record(raw, "Sites database overview");
  const projection = record(overview.model_projection, "Sites database projection");
  const observedAt = timestamp(input.observedAt, "database observation time");
  assertFresh(observedAt, input.nowMs ?? Date.now());
  if (text(overview.project_id, "database project id") !== input.projectId) throw new Error("database project mismatch");
  const bindings = array(overview.bindings, "database bindings").map((value) => text(value, "database binding"));
  const selectedBinding = text(overview.selected_binding_name, "selected database binding");
  const projectionComplete = projection.truncated === false &&
    integer(projection.omitted_bindings, "omitted database bindings") === 0 &&
    projection.omitted_project_id === false && projection.omitted_selected_binding === false;
  if (!projectionComplete || bindings.length !== 1 || bindings[0] !== "DB" || selectedBinding !== "DB") {
    throw new Error("logical D1 binding is not exactly DB");
  }
  return {
    version: os01ControlPlaneContract.version,
    observedAt,
    projectId: input.projectId,
    selectedBinding,
    bindingCount: bindings.length,
    projectionComplete
  };
}

export type LifecycleEvent = { phase: Phase; observedAt: string };

export function classifyLifecycle(events: LifecycleEvent[]): "accepted" | "incomplete" | "rejected_cleanup_required" {
  if (events.length === 0) return "incomplete";
  if (events.length > os01ControlPlaneContract.phases.length) throw new Error("control-plane lifecycle has extra phases");
  let prior = -Infinity;
  for (const [index, event] of events.entries()) {
    if (event.phase !== os01ControlPlaneContract.phases[index]) throw new Error("control-plane lifecycle is out of order");
    const current = Date.parse(timestamp(event.observedAt, `lifecycle phase ${index} time`));
    if (current < prior) throw new Error("control-plane lifecycle time moved backward");
    prior = current;
  }
  if (events.length === os01ControlPlaneContract.phases.length) return "accepted";
  return events.some((event) => event.phase === "controls_staged") ? "rejected_cleanup_required" : "incomplete";
}

export type TrustedUploaderAssertion = {
  version: string;
  observedAt: string;
  sourceCommit: string;
  versionId: string;
  localArchiveSha256: string;
  localPackageContentRoot: string;
  sitesArchiveContentHash: string;
  trustBoundary: string;
  canonicalizationClaim: string;
};

export function validateTrustedUploaderAssertion(
  assertion: TrustedUploaderAssertion,
  version: VersionProjection
): void {
  timestamp(assertion.observedAt, "uploader observation time");
  if (
    assertion.version !== os01ControlPlaneContract.version ||
    assertion.sourceCommit !== version.sourceCommit || assertion.versionId !== version.versionId ||
    hex(assertion.localArchiveSha256, "local archive hash") !== assertion.localArchiveSha256 ||
    hex(assertion.localPackageContentRoot, "local package root") !== assertion.localPackageContentRoot ||
    sitesHash(assertion.sitesArchiveContentHash, "Sites archive hash") !== version.archiveContentHash ||
    assertion.trustBoundary !== os01ControlPlaneContract.trustBoundary ||
    assertion.canonicalizationClaim !== os01ControlPlaneContract.archiveCanonicalization
  ) throw new Error("trusted uploader assertion is invalid");
}

export function validateEnvironmentLifecycle(
  before: EnvironmentProjection,
  staged: EnvironmentProjection,
  after: EnvironmentProjection
): void {
  const exactControls = [...os01ControlPlaneContract.temporaryControls].sort();
  if (
    before.projectId !== staged.projectId || staged.projectId !== after.projectId ||
    before.captureGatePresent || staged.captureGatePresent || after.captureGatePresent ||
    before.controlsPresent.length !== 0 ||
    stableJson([...staged.controlsPresent].sort()) !== stableJson(exactControls) ||
    !staged.controlsAllSecret || after.controlsPresent.length !== 0 ||
    staged.revision <= before.revision || after.revision <= staged.revision ||
    before.unrelatedMetadataRoot !== staged.unrelatedMetadataRoot ||
    staged.unrelatedMetadataRoot !== after.unrelatedMetadataRoot ||
    before.unrelatedEntryCount !== staged.unrelatedEntryCount ||
    staged.unrelatedEntryCount !== after.unrelatedEntryCount ||
    !(Date.parse(before.observedAt) <= Date.parse(staged.observedAt) &&
      Date.parse(staged.observedAt) <= Date.parse(after.observedAt))
  ) throw new Error("environment lifecycle is invalid");
}

export function validateControlPlaneEnvelope(input: {
  accessBefore: AccessProjection;
  accessAfter: AccessProjection;
  environmentBefore: EnvironmentProjection;
  environmentStaged: EnvironmentProjection;
  environmentAfter: EnvironmentProjection;
  version: VersionProjection;
  deployment: DeploymentProjection;
  database: DatabaseProjection;
  uploader: TrustedUploaderAssertion;
  lifecycle: LifecycleEvent[];
  operator: {
    status: string;
    buildAttestation: string;
    expectedBuildAttestation: string;
    passRootsIdentical: boolean;
    providerSecretReads: number;
    providerRequests: number;
    quotaReservations: number;
    rowsWritten: number;
  };
  cleanup: {
    deployment: DeploymentProjection;
    censusRouteStatus: number;
    healthStatus: number;
    d1BindingCount: number;
    r2BindingCount: number;
  };
}): void {
  validateOwnerOnlyAccess(input.accessBefore);
  validateOwnerOnlyAccess(input.accessAfter);
  validateEnvironmentLifecycle(input.environmentBefore, input.environmentStaged, input.environmentAfter);
  validateTrustedUploaderAssertion(input.uploader, input.version);
  if (classifyLifecycle(input.lifecycle) !== "accepted") throw new Error("control-plane lifecycle is incomplete");
  if (
    input.accessBefore.projectId !== input.version.projectId ||
    input.accessBefore.projectId !== input.deployment.projectId ||
    input.accessBefore.projectId !== input.database.projectId ||
    input.accessBefore.revision !== input.accessAfter.revision ||
    input.accessBefore.principalRoot !== input.accessAfter.principalRoot ||
    input.deployment.versionId !== input.version.versionId ||
    input.deployment.environmentRevision !== input.environmentStaged.revision ||
    input.cleanup.deployment.environmentRevision !== input.environmentAfter.revision ||
    input.operator.status !== "accepted_two_identical_read_only_passes" ||
    input.operator.buildAttestation !== input.operator.expectedBuildAttestation ||
    !input.operator.passRootsIdentical || input.operator.providerSecretReads !== 0 ||
    input.operator.providerRequests !== 0 || input.operator.quotaReservations !== 0 ||
    input.operator.rowsWritten !== 0 || input.cleanup.censusRouteStatus !== 410 ||
    input.cleanup.healthStatus !== 410 || input.cleanup.d1BindingCount !== 0 ||
    input.cleanup.r2BindingCount !== 0
  ) throw new Error("control-plane envelope does not close the qualification boundary");
}
