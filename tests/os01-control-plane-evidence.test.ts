import { describe, expect, it } from "vitest";

import {
  classifyLifecycle,
  os01ControlPlaneContract,
  projectDeployment,
  projectEnvironmentMetadata,
  projectLogicalDatabase,
  projectOwnerOnlyAccess,
  projectSavedVersion,
  validateControlPlaneEnvelope,
  validateEnvironmentLifecycle,
  validateTrustedUploaderAssertion,
  type AccessProjection,
  type DeploymentProjection,
  type EnvironmentProjection,
  type LifecycleEvent,
  type TrustedUploaderAssertion,
  type VersionProjection
} from "../scripts/os01-control-plane-evidence";

const projectId = "appgprj_test_owner_only";
const origin = "https://os01-owner-only.example.test";
const sourceCommit = "a".repeat(40);
const sourceAnchor = "b".repeat(64);
const now = Date.parse("2026-08-27T12:00:00.000Z");

function trap(target: Record<string, unknown>, key: string): void {
  Object.defineProperty(target, key, {
    enumerable: true,
    get() {
      throw new Error(`forbidden field read: ${key}`);
    }
  });
}

function accessRaw(): Record<string, unknown> {
  const owner: Record<string, unknown> = {
    account_user_id: "owner-account-id",
    is_external: false,
    role: "owner"
  };
  trap(owner, "email");
  trap(owner, "name");
  const site: Record<string, unknown> = {
    id: projectId,
    current_live_url: origin,
    current_user_role: "owner",
    access_policy: {
      project_id: projectId,
      revision: 2,
      access_mode: "custom",
      allowed_account_user_ids: ["owner-account-id"],
      allowed_workspace_group_ids: [],
      allowed_tenant_group_ids: [],
      allowed_users: [owner],
      allowed_editors: [],
      allowed_groups: [],
      external_visitor_count: 0
    }
  };
  trap(site, "siwc_bypass_bearer_token");
  trap(site, "source_repository_credential");
  return site;
}

function environmentRaw(revision: number, keys: Array<{ key: string; secret: boolean }>): Record<string, unknown> {
  const entries = keys.map(({ key, secret }) => {
    const entry: Record<string, unknown> = { key, is_secret: secret, type: "envvar" };
    trap(entry, "value");
    return entry;
  });
  return {
    project_id: projectId,
    revision,
    updated_at: revision === 0 ? null : `2026-08-27T12:0${revision}:00.000Z`,
    entries
  };
}

function versionRaw(): Record<string, unknown> {
  return {
    id: "version-1",
    project_id: projectId,
    version_number: 1,
    source: { commit_sha: sourceCommit },
    archive_storage: {
      archive_format: "tar",
      content_hash: `sha256:${"c".repeat(64)}`,
      file_count: 81,
      size_bytes: 4_000_000
    }
  };
}

function deploymentRaw(input: { id?: string; versionId?: string; environmentRevision?: number } = {}): Record<string, unknown> {
  return {
    id: input.id ?? "deployment-1",
    project_id: projectId,
    version_id: input.versionId ?? "version-1",
    status: "succeeded",
    type: "publish",
    env_set_revision: input.environmentRevision ?? 1,
    url: origin,
    updated_at: "2026-08-27T12:05:00.000Z"
  };
}

function observedAt(seconds: number): string {
  return new Date(now - seconds * 1000).toISOString();
}

function environmentProjections(): {
  before: EnvironmentProjection;
  staged: EnvironmentProjection;
  after: EnvironmentProjection;
} {
  const unrelated = [{ key: "UNRELATED_SERVER_CONTROL", secret: true }];
  const before = projectEnvironmentMetadata(environmentRaw(0, unrelated), {
    observedAt: "2026-08-27T11:55:00.000Z", projectId, nowMs: now
  });
  const staged = projectEnvironmentMetadata(environmentRaw(1, [
    ...unrelated,
    ...os01ControlPlaneContract.temporaryControls.map((key) => ({ key, secret: true }))
  ]), { observedAt: "2026-08-27T11:56:00.000Z", projectId, nowMs: now });
  const after = projectEnvironmentMetadata(environmentRaw(2, unrelated), {
    observedAt: "2026-08-27T11:59:00.000Z", projectId, nowMs: now
  });
  return { before, staged, after };
}

function lifecycle(): LifecycleEvent[] {
  return os01ControlPlaneContract.phases.map((phase, index) => ({
    phase,
    observedAt: new Date(Date.parse("2026-08-27T11:50:00.000Z") + index * 30_000).toISOString()
  }));
}

function projections(): {
  access: AccessProjection;
  environments: ReturnType<typeof environmentProjections>;
  version: VersionProjection;
  deployment: DeploymentProjection;
  cleanupDeployment: DeploymentProjection;
  uploader: TrustedUploaderAssertion;
} {
  const access = projectOwnerOnlyAccess(accessRaw(), {
    observedAt: observedAt(60), projectId, origin, nowMs: now
  });
  const environments = environmentProjections();
  const version = projectSavedVersion(versionRaw(), {
    observedAt: observedAt(50), projectId, sourceCommit, nowMs: now
  });
  const deployment = projectDeployment(deploymentRaw(), {
    observedAt: observedAt(40), projectId, versionId: version.versionId, origin, nowMs: now
  });
  const cleanupDeployment = projectDeployment(
    deploymentRaw({ id: "cleanup-deployment", versionId: "tombstone-version", environmentRevision: 2 }),
    { observedAt: observedAt(10), projectId, versionId: "tombstone-version", origin, nowMs: now }
  );
  const uploader: TrustedUploaderAssertion = {
    version: os01ControlPlaneContract.version,
    observedAt: observedAt(55),
    sourceCommit,
    versionId: version.versionId,
    localArchiveSha256: "d".repeat(64),
    localPackageContentRoot: "e".repeat(64),
    sitesArchiveContentHash: version.archiveContentHash,
    trustBoundary: os01ControlPlaneContract.trustBoundary,
    canonicalizationClaim: os01ControlPlaneContract.archiveCanonicalization
  };
  return { access, environments, version, deployment, cleanupDeployment, uploader };
}

describe("OS-01 Sites control-plane evidence", () => {
  it("projects owner-only access without touching identities, tokens, names, or emails", () => {
    expect(projectOwnerOnlyAccess(accessRaw(), {
      observedAt: observedAt(1), projectId, origin, nowMs: now
    })).toMatchObject({
      currentUserRole: "owner",
      accessMode: "custom",
      allowedUserCount: 1,
      editorCount: 0,
      groupCount: 0,
      externalVisitorCount: 0
    });
  });

  it("projects environment metadata without touching value getters", () => {
    const raw = environmentRaw(1, os01ControlPlaneContract.temporaryControls
      .map((key) => ({ key, secret: true })));
    const projection = projectEnvironmentMetadata(raw, {
      observedAt: observedAt(1), projectId, nowMs: now
    });
    expect(projection.controlsPresent).toEqual([...os01ControlPlaneContract.temporaryControls].sort());
    expect(projection.controlsAllSecret).toBe(true);
    expect(projection.captureGatePresent).toBe(false);
  });

  it("rejects extra viewers, editors, groups, external visitors, and non-owner callers", () => {
    for (const mutate of [
      (raw: Record<string, unknown>) => { raw.current_user_role = "editor"; },
      (raw: Record<string, unknown>) => {
        const policy = raw.access_policy as Record<string, unknown>;
        policy.allowed_account_user_ids = ["owner-account-id", "viewer-id"];
      },
      (raw: Record<string, unknown>) => {
        const policy = raw.access_policy as Record<string, unknown>;
        policy.allowed_editors = [{ account_user_id: "editor-id", role: "editor" }];
      },
      (raw: Record<string, unknown>) => {
        const policy = raw.access_policy as Record<string, unknown>;
        policy.allowed_groups = [{ id: "group-id", role: "viewer", size: 2 }];
      },
      (raw: Record<string, unknown>) => {
        const policy = raw.access_policy as Record<string, unknown>;
        policy.external_visitor_count = 1;
      }
    ]) {
      const raw = accessRaw();
      mutate(raw);
      expect(() => projectOwnerOnlyAccess(raw, {
        observedAt: observedAt(1), projectId, origin, nowMs: now
      })).toThrow(/owner-only/u);
    }
  });

  it("requires exact secret controls, capture absence, monotonic revisions, and unchanged unrelated metadata", () => {
    const valid = environmentProjections();
    expect(() => validateEnvironmentLifecycle(valid.before, valid.staged, valid.after)).not.toThrow();
    expect(() => validateEnvironmentLifecycle(valid.before, {
      ...valid.staged, controlsPresent: valid.staged.controlsPresent.slice(1)
    }, valid.after)).toThrow(/environment lifecycle/u);
    expect(() => validateEnvironmentLifecycle(valid.before, {
      ...valid.staged, controlsAllSecret: false
    }, valid.after)).toThrow(/environment lifecycle/u);
    expect(() => validateEnvironmentLifecycle(valid.before, {
      ...valid.staged, captureGatePresent: true
    }, valid.after)).toThrow(/environment lifecycle/u);
    expect(() => validateEnvironmentLifecycle(valid.before, {
      ...valid.staged, unrelatedMetadataRoot: "0".repeat(64)
    }, valid.after)).toThrow(/environment lifecycle/u);
    expect(() => validateEnvironmentLifecycle(valid.before, valid.staged, {
      ...valid.after, revision: valid.staged.revision
    })).toThrow(/environment lifecycle/u);
  });

  it("binds saved versions and deployments to source, project, origin, version, and environment revision", () => {
    const value = projections();
    expect(value.version.sourceCommit).toBe(sourceCommit);
    expect(value.deployment.environmentRevision).toBe(value.environments.staged.revision);
    expect(() => projectSavedVersion(versionRaw(), {
      observedAt: observedAt(1), projectId, sourceCommit: "f".repeat(40), nowMs: now
    })).toThrow(/source mismatch/u);
    expect(() => projectDeployment(deploymentRaw({ versionId: "wrong-version" }), {
      observedAt: observedAt(1), projectId, versionId: "version-1", origin, nowMs: now
    })).toThrow(/version mismatch/u);
  });

  it("rejects stale and future control-plane observations", () => {
    expect(() => projectOwnerOnlyAccess(accessRaw(), {
      observedAt: observedAt(601), projectId, origin, nowMs: now
    })).toThrow(/stale/u);
    expect(() => projectOwnerOnlyAccess(accessRaw(), {
      observedAt: new Date(now + 121_000).toISOString(), projectId, origin, nowMs: now
    })).toThrow(/future/u);
  });

  it("requires one complete logical DB binding without trusting a truncated table projection", () => {
    const raw = {
      project_id: projectId,
      bindings: ["DB"],
      selected_binding_name: "DB",
      tables: ["untrusted_table_name"],
      model_projection: {
        truncated: false,
        omitted_project_id: false,
        omitted_selected_binding: false,
        omitted_bindings: 0,
        omitted_tables: 5
      }
    };
    expect(projectLogicalDatabase(raw, {
      observedAt: observedAt(1), projectId, nowMs: now
    })).toMatchObject({ selectedBinding: "DB", bindingCount: 1, projectionComplete: true });
    expect(() => projectLogicalDatabase({ ...raw, bindings: ["DB", "OTHER"] }, {
      observedAt: observedAt(1), projectId, nowMs: now
    })).toThrow(/exactly DB/u);
    expect(() => projectLogicalDatabase({
      ...raw,
      model_projection: { ...raw.model_projection, omitted_bindings: 1 }
    }, { observedAt: observedAt(1), projectId, nowMs: now })).toThrow(/exactly DB/u);
  });

  it("keeps local package identity separate from opaque Sites canonicalization", () => {
    const value = projections();
    expect(() => validateTrustedUploaderAssertion(value.uploader, value.version)).not.toThrow();
    expect(() => validateTrustedUploaderAssertion({
      ...value.uploader,
      canonicalizationClaim: "local_hash_equals_sites_hash"
    }, value.version)).toThrow(/uploader assertion/u);
    expect(() => validateTrustedUploaderAssertion({
      ...value.uploader,
      sitesArchiveContentHash: `sha256:${value.uploader.localArchiveSha256}`
    }, value.version)).toThrow(/uploader assertion/u);
  });

  it("classifies every incomplete post-control crash as cleanup-required", () => {
    const complete = lifecycle();
    expect(classifyLifecycle(complete)).toBe("accepted");
    expect(classifyLifecycle(complete.slice(0, 2))).toBe("incomplete");
    for (let length = 3; length < complete.length; length += 1) {
      expect(classifyLifecycle(complete.slice(0, length))).toBe("rejected_cleanup_required");
    }
    expect(() => classifyLifecycle([
      complete[0]!, complete[2]!
    ])).toThrow(/out of order/u);
    expect(() => classifyLifecycle([
      complete[0]!, { ...complete[1]!, observedAt: "2026-08-27T11:49:00.000Z" }
    ])).toThrow(/moved backward/u);
  });

  it("accepts only a closed owner-only bridge, census, and tombstone cleanup envelope", () => {
    const value = projections();
    const database = projectLogicalDatabase({
      project_id: projectId,
      bindings: ["DB"],
      selected_binding_name: "DB",
      tables: [],
      model_projection: {
        truncated: false,
        omitted_project_id: false,
        omitted_selected_binding: false,
        omitted_bindings: 0,
        omitted_tables: 0
      }
    }, { observedAt: observedAt(30), projectId, nowMs: now });
    const envelope = {
      accessBefore: value.access,
      accessAfter: value.access,
      environmentBefore: value.environments.before,
      environmentStaged: value.environments.staged,
      environmentAfter: value.environments.after,
      version: value.version,
      deployment: value.deployment,
      database,
      uploader: value.uploader,
      lifecycle: lifecycle(),
      operator: {
        status: "accepted_two_identical_read_only_passes",
        buildAttestation: sourceAnchor,
        expectedBuildAttestation: sourceAnchor,
        passRootsIdentical: true,
        providerSecretReads: 0,
        providerRequests: 0,
        quotaReservations: 0,
        rowsWritten: 0
      },
      cleanup: {
        deployment: value.cleanupDeployment,
        censusRouteStatus: 410,
        healthStatus: 410,
        d1BindingCount: 0,
        r2BindingCount: 0
      }
    };
    expect(() => validateControlPlaneEnvelope(envelope)).not.toThrow();
    expect(() => validateControlPlaneEnvelope({
      ...envelope,
      deployment: { ...envelope.deployment, environmentRevision: 99 }
    })).toThrow(/does not close/u);
    expect(() => validateControlPlaneEnvelope({
      ...envelope,
      cleanup: { ...envelope.cleanup, censusRouteStatus: 404 }
    })).toThrow(/does not close/u);
    expect(() => validateControlPlaneEnvelope({
      ...envelope,
      cleanup: { ...envelope.cleanup, d1BindingCount: 1 }
    })).toThrow(/does not close/u);
  });
});
