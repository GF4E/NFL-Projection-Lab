import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalJson,
  OS01_STAGING_FOREIGN_KEY_CANDIDATES,
  OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES,
  OS01_STAGING_FOREIGN_KEYS_CONTROLLER_AUTHORITY_CONTRACT,
  OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID,
  OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT,
  OS01_STAGING_FOREIGN_KEYS_EXACT_BODY,
  OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
  OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-foreign-keys/contract";
import { handleOs01StagingForeignKeys } from "../qualification/os01-staging-foreign-keys/entry";
import {
  createOs01StagingForeignKeysControlPlaneObservation,
  os01StagingForeignKeysControllerTestOnly,
  type ControlPlaneObservationInput,
  type PreregisteredArtifactIdentity,
  type ResponseValidationIdentity
} from "../scripts/os01_staging_foreign_keys_controller";

type BatchResult = { success: true; results: Array<Record<string, unknown>> };
type Prepared = { sql: string };

const created: string[] = [];
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
});

function privateDirectory(): string {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "os01-staging-fk-controller-")));
  created.push(root);
  expect(statSync(root).mode & 0o777).toBe(0o700);
  return root;
}

function artifactPaths(root: string): Record<keyof typeof OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES, string> {
  return Object.fromEntries(Object.entries(OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES)
    .map(([key, name]) => [key, resolve(root, name)])) as Record<
      keyof typeof OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES,
      string
    >;
}

function observationInput(phase: "pre" | "post"): ControlPlaneObservationInput {
  return {
    phase,
    sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    versionId: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.projectId + "~appgver_" + "2".repeat(32),
    versionNumber: 21,
    deploymentId: "appgdep_" + "3".repeat(32),
    deploymentStatus: "succeeded",
    deploymentUrl: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin,
    workerSha256: "c".repeat(64),
    manifestSha256: "d".repeat(64),
    archiveSha256: "e".repeat(64),
    archiveFileListRoot: "1".repeat(64),
    archiveContentRoot: "2".repeat(64),
    archiveFileCount: 4,
    archiveBytes: 8_192,
    uploadMethodIdentity: "sites_save_site_version_exact_local_archive",
    remoteBuildRequested: false,
    accessRevision: 1,
    ownerIdentityHash: "f".repeat(64),
    environmentRevision: 0,
    environmentKeyNames: [],
    recordedAt: phase === "pre" ? "2026-08-29T08:00:00.000Z" : "2026-08-29T08:01:00.000Z"
  };
}

function preregisteredIdentity(): PreregisteredArtifactIdentity {
  const input = observationInput("pre");
  return {
    sourceCommit: input.sourceCommit,
    sourceTree: input.sourceTree,
    workerSha256: input.workerSha256,
    manifestSha256: input.manifestSha256,
    archiveSha256: input.archiveSha256,
    archiveFileListRoot: input.archiveFileListRoot,
    archiveContentRoot: input.archiveContentRoot,
    archiveFileCount: input.archiveFileCount,
    archiveBytes: input.archiveBytes,
    uploadMethodIdentity: input.uploadMethodIdentity,
    remoteBuildRequested: false
  };
}

const responseValidation: ResponseValidationIdentity = {
  catalogHash: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogHash,
  catalogRows: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogRows,
  candidateRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
  normalizedForeignKeyRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot,
  foreignKeyConstraintCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyConstraintCount,
  foreignKeyColumnRowCount: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedForeignKeyColumnRowCount
};

function hostedResponse(): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(
    ".planning/engine-os/execution/os-01/generation10-hosted-authority-v1/response.json"
  ), "utf8")) as Record<string, unknown>;
}

function replayForeignKeys(): Map<string, Array<Record<string, unknown>>> {
  const objects = hostedResponse().objects as Array<{
    type: "table" | "view" | "index" | "trigger";
    name: string;
    tblName: string;
    createSql: string;
  }>;
  const order = { table: 0, view: 1, index: 2, trigger: 3 } as const;
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE");
    for (const object of [...objects].sort((left, right) =>
      order[left.type] - order[right.type] || left.name.localeCompare(right.name) ||
      left.tblName.localeCompare(right.tblName))) database.exec(object.createSql);
    database.exec("COMMIT");
    return new Map(OS01_STAGING_FOREIGN_KEY_CANDIDATES.map((candidate) => [
      candidate.sourceTable,
      database.prepare(`PRAGMA foreign_key_list("${candidate.sourceTable}")`).all() as Array<Record<string, unknown>>
    ]));
  } finally {
    database.close();
  }
}

function workerDatabase(): {
  prepare(sql: string): Prepared;
  batch(values: Prepared[]): Promise<BatchResult[]>;
} {
  const catalog = hostedResponse().catalog as Array<Record<string, unknown>>;
  const foreignKeys = replayForeignKeys();
  return {
    prepare(sql: string) { return { sql }; },
    async batch(values: Prepared[]) {
      return values.map((value) => {
        const match = /^PRAGMA foreign_key_list\("([A-Za-z0-9_]+)"\)$/u.exec(value.sql);
        return {
          success: true,
          results: structuredClone(match ? foreignKeys.get(match[1]!) ?? [] : catalog)
        };
      });
    }
  };
}

async function acceptedResponse(request?: Request): Promise<Response> {
  const exactRequest = request ?? new Request(
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin +
      OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: OS01_STAGING_FOREIGN_KEYS_EXACT_BODY
    }
  );
  return handleOs01StagingForeignKeys(exactRequest, workerDatabase() as never);
}

function prepareRoot(): { root: string; paths: ReturnType<typeof artifactPaths> } {
  const root = privateDirectory();
  os01StagingForeignKeysControllerTestOnly.initialize(
    root,
    preregisteredIdentity(),
    () => new Date("2026-08-29T07:59:59.000Z")
  );
  os01StagingForeignKeysControllerTestOnly.writeObservation(root, observationInput("pre"));
  return { root, paths: artifactPaths(root) };
}

describe("OS-01 Generation 11 staging foreign-key controller", () => {
  it("binds one canonical authority and rejects environment drift", () => {
    expect(sha256(canonicalJson(OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT)))
      .toBe(OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID);
    expect(sha256(canonicalJson(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_AUTHORITY_CONTRACT)))
      .toBe(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID);
    expect(OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT).toBe(
      "/private/tmp/engine-os-os01-staging-foreign-keys-" + OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID
    );
    expect(() => createOs01StagingForeignKeysControlPlaneObservation({
      ...observationInput("pre"), environmentKeyNames: ["ENGINE_OS_CAPTURE_ENABLED"]
    })).toThrow("environment key list must be empty");
    expect(() => os01StagingForeignKeysControllerTestOnly.parseObservationInput(
      JSON.stringify({ ...observationInput("pre"), unexpected: true }), "pre"
    )).toThrow("closed schema");
  });

  it("persists one valid attempt, never stores the token, and finalizes only after an identical postcheck", async () => {
    const { root, paths } = prepareRoot();
    const token = "ephemeral-siwc-token-value";
    const result = await os01StagingForeignKeysControllerTestOnly.run({
      root,
      authorizationToken: token,
      responseValidation,
      now: () => new Date("2026-08-29T08:00:10.000Z"),
      transport: async (request) => {
        expect(request.headers.get("OAI-Sites-Authorization")).toBe("Bearer " + token);
        return acceptedResponse(request);
      }
    });
    expect(result).toMatchObject({
      status: "pending_control_plane_postcheck",
      qualificationEligible: false,
      retryAllowed: false,
      controllerDatabaseMutationAttempted: false,
      oddsProviderPathInvoked: false,
      quotaPathInvoked: false
    });
    const persisted = Object.values(paths).filter((path) => path !== root)
      .filter((path) => {
        try { return statSync(path).isFile(); } catch { return false; }
      }).map((path) => readFileSync(path, "utf8")).join("\n");
    for (const reflected of [token, token.toLowerCase(), Buffer.from(token).toString("base64"),
      encodeURIComponent(token)]) expect(persisted).not.toContain(reflected);
    expect(() => os01StagingForeignKeysControllerTestOnly.run({
      root,
      authorizationToken: token,
      responseValidation,
      transport: acceptedResponse
    })).rejects.toThrow("already been consumed");
    os01StagingForeignKeysControllerTestOnly.writeObservation(root, observationInput("post"));
    const receipt = os01StagingForeignKeysControllerTestOnly.finalize(
      root, () => new Date("2026-08-29T08:01:10.000Z"), responseValidation
    );
    expect(receipt).toMatchObject({
      status: "test_only_postcheck_verified",
      hostedForeignKeyEvidenceAccepted: false,
      foreignKeyClaimsAccepted: false,
      rowCountClaimsAccepted: false,
      generation12RowCountEligible: false,
      retryAllowed: false
    });
  });

  it("rejects a self-consistently rehashed predecessor substitution", async () => {
    const { root } = prepareRoot();
    const valid = await (await acceptedResponse()).json() as Record<string, unknown>;
    const predecessor = structuredClone(valid.predecessor) as Record<string, unknown>;
    predecessor.hostedFinalReceiptHash = "0".repeat(64);
    valid.predecessor = predecessor;
    delete valid.receiptHash;
    valid.receiptHash = sha256(canonicalJson(valid));
    const result = await os01StagingForeignKeysControllerTestOnly.run({
      root,
      authorizationToken: "ephemeral-token",
      responseValidation,
      now: () => new Date("2026-08-29T08:00:10.000Z"),
      transport: async () => new Response(JSON.stringify(valid), {
        status: 200, headers: { "content-type": "application/json" }
      })
    });
    expect(result.status).toBe("terminal_invalid_response");
    expect(result.retryAllowed).toBe(false);
  });

  it("fails terminally on credential reflection or uncertain transport", async () => {
    const first = prepareRoot();
    const token = "ephemeral-reflection-token";
    const reflection = await os01StagingForeignKeysControllerTestOnly.run({
      root: first.root,
      authorizationToken: token,
      responseValidation,
      now: () => new Date("2026-08-29T08:00:10.000Z"),
      transport: async () => new Response("{}", { status: 200, headers: { "x-reflected": token } })
    });
    expect(reflection.status).toBe("terminal_credential_reflection");
    expect(statSync(first.paths.response).size).toBe(0);

    const second = prepareRoot();
    const uncertain = await os01StagingForeignKeysControllerTestOnly.run({
      root: second.root,
      authorizationToken: "ephemeral-token",
      responseValidation,
      now: () => new Date("2026-08-29T08:00:10.000Z"),
      transport: async () => { throw new Error("fixture transport failure"); }
    });
    expect(uncertain.status).toBe("terminal_transport_uncertain");
    expect(uncertain.retryAllowed).toBe(false);
  });
});
