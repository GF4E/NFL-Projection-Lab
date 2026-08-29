import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  canonicalJson,
  STAGING_CENSUS_ARTIFACT_NAMES,
  STAGING_CENSUS_CONTROLLER_ID,
  STAGING_CENSUS_CONTROLLER_ROOT,
  STAGING_CENSUS_EXACT_BODY,
  STAGING_CENSUS_EXACT_BODY_SHA256,
  STAGING_CENSUS_ID,
  STAGING_CENSUS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-census/contract";
import { handleOs01StagingCensus } from "../qualification/os01-staging-census/entry";
import {
  createOs01StagingCensusControlPlaneObservation,
  os01StagingCensusControllerTestOnly,
  runOs01StagingCensusController,
  type ControlPlaneObservationInput,
  type ResponseValidationIdentity
} from "../scripts/os01_staging_census_controller";

const created: string[] = [];
afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true });
});

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function privateDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "os01-staging-census-controller-"));
  const canonical = realpathSync(directory);
  created.push(canonical);
  expect(statSync(canonical).mode & 0o777).toBe(0o700);
  return canonical;
}

function paths(directory: string) {
  return Object.fromEntries(Object.entries(STAGING_CENSUS_ARTIFACT_NAMES)
    .map(([key, name]) => [key, resolve(directory, name)])) as Record<
      keyof typeof STAGING_CENSUS_ARTIFACT_NAMES,
      string
    >;
}

function observationInput(phase: "pre" | "post"): ControlPlaneObservationInput {
  return {
    phase,
    sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    versionId: STAGING_CENSUS_SEMANTIC_CONTRACT.projectId + "~appgver_" + "2".repeat(32),
    versionNumber: 11,
    deploymentId: "appgdep_" + "3".repeat(32),
    deploymentStatus: "succeeded",
    deploymentUrl: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
    workerSha256: "c".repeat(64),
    manifestSha256: "d".repeat(64),
    archiveSha256: "e".repeat(64),
    accessRevision: 1,
    ownerIdentityHash: "f".repeat(64),
    environmentRevision: 0,
    environmentKeyNames: [],
    recordedAt: phase === "pre" ? "2026-08-29T08:00:00.000Z" : "2026-08-29T08:01:00.000Z"
  };
}

function observation(phase: "pre" | "post") {
  return createOs01StagingCensusControlPlaneObservation(observationInput(phase));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
}

function replaceHashedJson(path: string, hashKey: string, mutate: (value: Record<string, unknown>) => void): void {
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  delete value[hashKey];
  mutate(value);
  value[hashKey] = sha256(canonicalJson(value));
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "w", mode: 0o600 });
}

function prepareRoot(): { root: string; artifacts: ReturnType<typeof paths> } {
  const root = privateDirectory();
  const artifacts = paths(root);
  os01StagingCensusControllerTestOnly.initialize(
    root,
    () => new Date("2026-08-29T07:59:59.000Z")
  );
  writeJson(artifacts.preObservation, observation("pre"));
  return { root, artifacts };
}

function validReceipt(identity: ResponseValidationIdentity): Record<string, unknown> {
  const tables = Array.from({ length: identity.userTableCount }, (_, index) => {
    const name = "table_" + String(index).padStart(2, "0");
    const createSql = "CREATE TABLE " + name + "(id INTEGER)";
    return { name, createSql, createSqlHash: sha256(createSql), rowCount: 0, foreignKeys: [] };
  });
  const body = {
    version: STAGING_CENSUS_SEMANTIC_CONTRACT.responseVersion,
    status: "read_only_schema_census_captured",
    censusId: STAGING_CENSUS_ID,
    catalogRows: identity.catalogRows,
    catalogHash: identity.catalogHash,
    userObjectCount: identity.userTableCount,
    userTableCount: identity.userTableCount,
    userViewCount: 0,
    tableSetHash: sha256(canonicalJson(tables.map((table) => table.name))),
    viewSetHash: sha256(canonicalJson([])),
    ddlRoot: sha256(canonicalJson(tables.map((table) => ({ name: table.name, createSql: table.createSql })))),
    foreignKeyRoot: sha256(canonicalJson(tables.map((table) => ({
      name: table.name,
      foreignKeys: table.foreignKeys
    })))),
    rowCountRoot: sha256(canonicalJson(tables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount
    })))),
    tables,
    viewNames: [],
    prePostCatalogMatch: true,
    prePostRowCountsMatch: true,
    snapshotClaim: STAGING_CENSUS_SEMANTIC_CONTRACT.consistencyClaim,
    requestBudgetClaim: "controller_enforced_single_invocation_not_runtime_durable",
    databaseMutationAttempted: false,
    providerBindings: 0,
    providerSecretReads: 0,
    providerDispatches: 0,
    quotaReservations: 0,
    captureActivations: 0,
    productionReads: 0,
    productionMutations: 0,
    claimBoundary: "isolated_staging_read_only_census_only"
  };
  return { ...body, receiptHash: sha256(canonicalJson(body)) };
}

const defaultValidation: ResponseValidationIdentity = {
  catalogHash: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
  catalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
  userTableCount: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount
};

function acceptedResponse(identity = defaultValidation): Response {
  return Response.json(validReceipt(identity), { status: 200 });
}

describe("OS-01 staging census controller", () => {
  it("has one canonical qualification root and exposes no public path override", () => {
    expect(STAGING_CENSUS_CONTROLLER_ROOT).toBe(
      "/private/tmp/engine-os-os01-staging-census-" + STAGING_CENSUS_CONTROLLER_ID
    );
    type PublicInput = Parameters<typeof runOs01StagingCensusController>[0];
    expectTypeOf<PublicInput>().toEqualTypeOf<{
      authorizationToken: string;
    }>();
    expect(() => createOs01StagingCensusControlPlaneObservation({
      ...observationInput("pre"),
      environmentKeyNames: ["ENGINE_OS_CAPTURE_ENABLED"]
    })).toThrow();
  });

  it("parses and durably writes each observation once in controller order", async () => {
    const root = privateDirectory();
    const artifacts = paths(root);
    os01StagingCensusControllerTestOnly.initialize(
      root,
      () => new Date("2026-08-29T07:59:59.000Z")
    );
    const preInput = os01StagingCensusControllerTestOnly.parseObservationInput(
      JSON.stringify(observationInput("pre")) + "\n",
      "pre"
    );
    const preResult = os01StagingCensusControllerTestOnly.writeObservation(root, preInput);
    expect(preResult).toMatchObject({ phase: "pre", observationHash: expect.any(String) });
    expect(JSON.parse(readFileSync(artifacts.preObservation, "utf8"))).toMatchObject({
      controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID
    });
    expect(statSync(artifacts.preObservation).mode & 0o777).toBe(0o600);
    expect(statSync(artifacts.preObservation).nlink).toBe(1);
    expect(() => os01StagingCensusControllerTestOnly.writeObservation(root, preInput)).toThrow();
    expect(() => os01StagingCensusControllerTestOnly.parseObservationInput(
      JSON.stringify({ ...observationInput("pre"), phase: "post" }),
      "pre"
    )).toThrow();
    for (const invalid of [
      { ...observationInput("pre"), versionId: "" },
      { ...observationInput("pre"), deploymentId: "" },
      { ...observationInput("pre"), versionId: "appgprj_" + "4".repeat(32) + "~appgver_" + "2".repeat(32) }
    ]) {
      const invalidRoot = privateDirectory();
      os01StagingCensusControllerTestOnly.initialize(
        invalidRoot,
        () => new Date("2026-08-29T07:59:59.000Z")
      );
      expect(() => os01StagingCensusControllerTestOnly.writeObservation(invalidRoot, invalid))
        .toThrow("semantic validation");
    }

    await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "ephemeral-sites-token-for-test",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => acceptedResponse()
    });
    const postInput = os01StagingCensusControllerTestOnly.parseObservationInput(
      JSON.stringify(observationInput("post")) + "\n",
      "post"
    );
    const postResult = os01StagingCensusControllerTestOnly.writeObservation(root, postInput);
    expect(postResult).toMatchObject({ phase: "post", observationHash: expect.any(String) });
    expect(statSync(artifacts.postObservation).mode & 0o777).toBe(0o600);
    expect(() => os01StagingCensusControllerTestOnly.writeObservation(root, postInput)).toThrow();
  });

  it("routes newline-terminated observation JSON through the actual CLI action core", async () => {
    let written: ControlPlaneObservationInput | null = null;
    const result = await os01StagingCensusControllerTestOnly.executeCli({
      action: "write-pre-observation",
      stdin: JSON.stringify(observationInput("pre")) + "\n",
      operations: {
        initialize: () => { throw new Error("unexpected init"); },
        writeObservation: (input) => {
          written = input;
          return { phase: input.phase, observationHash: "9".repeat(64), bytesSha256: "8".repeat(64) };
        },
        run: async () => { throw new Error("unexpected run"); },
        finalize: () => { throw new Error("unexpected finalize"); }
      }
    });
    expect(written).toEqual(observationInput("pre"));
    expect(result).toEqual({ stdout: "pre:" + "9".repeat(64) + "\n", exitCode: 0 });
    await expect(os01StagingCensusControllerTestOnly.executeCli({
      action: "write-post-observation",
      stdin: JSON.stringify(observationInput("pre")),
      operations: {
        initialize: () => { throw new Error("unexpected init"); },
        writeObservation: () => { throw new Error("must not write"); },
        run: async () => { throw new Error("unexpected run"); },
        finalize: () => { throw new Error("unexpected finalize"); }
      }
    })).rejects.toThrow("closed schema");
  });

  it("rejects blank hosted deployment identities on the full controller path before transport", async () => {
    for (const invalid of [
      { ...observationInput("pre"), versionId: "" },
      { ...observationInput("pre"), deploymentId: "" },
      { ...observationInput("pre"), versionId: "appgprj_" + "4".repeat(32) + "~appgver_" + "2".repeat(32) }
    ]) {
      const root = privateDirectory();
      const artifacts = paths(root);
      os01StagingCensusControllerTestOnly.initialize(
        root,
        () => new Date("2026-08-29T07:59:59.000Z")
      );
      writeJson(artifacts.preObservation, createOs01StagingCensusControlPlaneObservation(invalid));
      let calls = 0;
      await expect(os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: "ephemeral-sites-token-for-test",
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        responseValidation: defaultValidation,
        transport: async () => {
          calls += 1;
          return acceptedResponse();
        }
      })).rejects.toThrow("pre-observation is invalid");
      expect(calls).toBe(0);
      expect(existsSync(artifacts.intent)).toBe(false);
    }
  });

  it("reserves intent, response, and result before one exact transport call and remains pending", async () => {
    const { root, artifacts } = prepareRoot();
    const token = "ephemeral-sites-token-for-test";
    let calls = 0;
    const result = await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: token,
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async (request) => {
        calls += 1;
        expect(request.url).toBe(STAGING_CENSUS_SEMANTIC_CONTRACT.origin + STAGING_CENSUS_SEMANTIC_CONTRACT.route);
        expect(request.method).toBe("POST");
        expect(request.redirect).toBe("error");
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(request.headers.get("authorization")).toBeNull();
        expect(request.headers.get("oai-sites-authorization")).toBe(token);
        expect(await request.text()).toBe(STAGING_CENSUS_EXACT_BODY);
        return acceptedResponse();
      }
    });
    expect(calls).toBe(1);
    expect(result.status).toBe("pending_control_plane_postcheck");
    expect(result.qualificationEligible).toBe(false);
    expect(result.requestBodySha256).toBe(STAGING_CENSUS_EXACT_BODY_SHA256);
    for (const path of [artifacts.intent, artifacts.response, artifacts.attemptResult]) {
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(path).nlink).toBe(1);
      expect(readFileSync(path, "utf8")).not.toContain(token);
    }
    expect(JSON.parse(readFileSync(artifacts.intent, "utf8"))).toMatchObject({
      status: "reserved_before_transport_no_retry",
      retryAllowedAfterReservation: false,
      credentialKind: "ephemeral_sites_siwc_not_persisted"
    });
    expect(statSync(artifacts.dispatchCompletion).size).toBeGreaterThan(0);
    writeJson(artifacts.postObservation, observation("post"));
    expect(os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z")
    )).toMatchObject({
      status: "test_only_postcheck_verified",
      identitiesMatch: true,
      workerReadOnlyReceiptVerified: true
    });
  });

  it("allows only one concurrent dispatch for one authority root", async () => {
    const { root } = prepareRoot();
    let calls = 0;
    const transport = async () => {
      calls += 1;
      await Promise.resolve();
      return acceptedResponse();
    };
    const results = await Promise.allSettled([
      os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: "token-one",
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        transport,
        responseValidation: defaultValidation
      }),
      os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: "token-two",
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        transport,
        responseValidation: defaultValidation
      })
    ]);
    expect(calls).toBe(1);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("terminally consumes an attempted finalization before post-observation evidence exists", async () => {
    const { root, artifacts } = prepareRoot();
    await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => acceptedResponse()
    });
    expect(() => os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:00:02.000Z")
    )).toThrow();
    expect(statSync(artifacts.finalizationIntent).size).toBeGreaterThan(0);
    writeJson(artifacts.postObservation, observation("post"));
    expect(() => os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z")
    )).toThrow("finalization authority already consumed");
  });

  it("consumes the intent after transport uncertainty and prohibits a retry", async () => {
    const { root } = prepareRoot();
    const first = await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token-one",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => {
        throw new Error("uncertain transport");
      }
    });
    expect(first.status).toBe("terminal_transport_uncertain");
    expect(first.retryAllowed).toBe(false);
    let retryCalls = 0;
    await expect(os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token-two",
      now: () => new Date("2026-08-29T08:00:02.000Z"),
      responseValidation: defaultValidation,
      transport: async () => {
        retryCalls += 1;
        return acceptedResponse();
      }
    })).rejects.toThrow();
    expect(retryCalls).toBe(0);
  });

  it("does not dispatch when a reserved output path already exists", async () => {
    const { root, artifacts } = prepareRoot();
    writeFileSync(artifacts.response, "", { flag: "wx", mode: 0o600 });
    let calls = 0;
    await expect(os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => {
        calls += 1;
        return acceptedResponse();
      }
    })).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it("preserves durable authority and never dispatches after a blank intent crash artifact", async () => {
    const { root, artifacts } = prepareRoot();
    writeFileSync(artifacts.intent, "", { flag: "wx", mode: 0o600 });
    let calls = 0;
    await expect(os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => {
        calls += 1;
        return acceptedResponse();
      }
    })).rejects.toThrow();
    expect(calls).toBe(0);
    expect(JSON.parse(readFileSync(artifacts.authority, "utf8"))).toMatchObject({
      status: "initialized_no_dispatch",
      retryAfterAnyIntentOrOutputArtifact: false
    });
  });

  it("prohibits dispatch when a post-observation already exists", async () => {
    const { root, artifacts } = prepareRoot();
    writeJson(artifacts.postObservation, observation("post"));
    let calls = 0;
    await expect(os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => {
        calls += 1;
        return acceptedResponse();
      }
    })).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it("writes a terminal fence when postcheck authority appears during dispatch", async () => {
    const { root, artifacts } = prepareRoot();
    await expect(os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => {
        writeJson(artifacts.postObservation, observation("post"));
        return acceptedResponse();
      }
    })).rejects.toThrow();
    expect(JSON.parse(readFileSync(artifacts.terminalFence, "utf8"))).toMatchObject({
      status: "terminal_artifact_authority_violation",
      controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
      retryAllowed: false
    });
    expect(statSync(artifacts.dispatchCompletion).size).toBe(0);
    expect(() => os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z")
    )).toThrow("terminally fenced");
  });

  it("never persists a response that reflects the ephemeral credential", async () => {
    const { root, artifacts } = prepareRoot();
    const token = "credential-must-not-be-written";
    const result = await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: token,
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => new Response(JSON.stringify({ reflected: token }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    });
    expect(result.status).toBe("terminal_credential_reflection");
    expect(statSync(artifacts.response).size).toBe(0);
    expect(readFileSync(artifacts.attemptResult, "utf8")).not.toContain(token);
  });

  it("does not persist a schema-invalid response even when the credential is encoded", async () => {
    const { root, artifacts } = prepareRoot();
    const token = "credential-must-not-be-encoded";
    const result = await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: token,
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => Response.json({ encoded: Buffer.from(token).toString("base64") })
    });
    expect(result.status).toBe("terminal_invalid_response");
    expect(statSync(artifacts.response).size).toBe(0);
  });

  it("rejects a self-hashed but cross-record-inconsistent intent", async () => {
    const { root, artifacts } = prepareRoot();
    await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => acceptedResponse()
    });
    replaceHashedJson(artifacts.intent, "intentHash", (intent) => {
      intent.attemptId = "11111111-1111-4111-8111-111111111111";
    });
    writeJson(artifacts.postObservation, observation("post"));
    expect(os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z")
    )).toMatchObject({
      status: "test_only_postcheck_rejected",
      crossRecordBindingsVerified: false
    });
  });

  it("rejects a self-hashed authority replacement after dispatch", async () => {
    const { root, artifacts } = prepareRoot();
    await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => acceptedResponse()
    });
    replaceHashedJson(artifacts.authority, "authorityHash", (authority) => {
      authority.initializedAt = "2026-08-29T07:59:58.000Z";
    });
    writeJson(artifacts.postObservation, observation("post"));
    expect(os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z")
    )).toMatchObject({
      status: "test_only_postcheck_rejected",
      authorityVerified: false,
      crossRecordBindingsVerified: false
    });
  });

  it("rejects reversed control-plane observation time", async () => {
    const { root, artifacts } = prepareRoot();
    await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => acceptedResponse()
    });
    writeJson(artifacts.postObservation, createOs01StagingCensusControlPlaneObservation({
      ...observationInput("post"),
      recordedAt: "2026-08-29T07:59:58.000Z"
    }));
    expect(os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z")
    )).toMatchObject({
      status: "test_only_postcheck_rejected",
      temporalOrderValid: false
    });
  });

  it("rejects an exact-schema violation even when its self-hash is recomputed", async () => {
    const { root, artifacts } = prepareRoot();
    await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => acceptedResponse()
    });
    replaceHashedJson(artifacts.attemptResult, "resultHash", (result) => {
      result.unexpected = true;
    });
    writeJson(artifacts.postObservation, observation("post"));
    expect(() => os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z")
    )).toThrow("staging census finalization evidence is invalid");
  });

  it("passes an actual worker response through controller validation and postcheck finalization", async () => {
    const { root, artifacts } = prepareRoot();
    const tables = Array.from({ length: 50 }, (_, index) => {
      const name = "table_" + String(index).padStart(2, "0");
      return { type: "table", name, tbl_name: name, sql: "CREATE TABLE " + name + "(id INTEGER)" };
    });
    const indexes = Array.from({ length: 326 }, (_, index) => ({
      type: "index",
      name: "idx_" + String(index).padStart(3, "0"),
      tbl_name: "table_00",
      sql: "CREATE INDEX idx_" + String(index).padStart(3, "0") + " ON table_00(id)"
    }));
    const catalog = [
      ...indexes,
      { type: "table", name: "d1_migrations", tbl_name: "d1_migrations", sql: "CREATE TABLE d1_migrations(id INTEGER)" },
      ...tables
    ].sort((left, right) => left.type < right.type ? -1 : left.type > right.type ? 1 :
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    expect(catalog).toHaveLength(377);
    const catalogHash = sha256(canonicalJson(catalog));
    const db = {
      prepare(sql: string) {
        return {
          async all() {
            if (sql.includes("FROM sqlite_schema")) return { success: true, results: catalog };
            if (sql.includes("foreign_key_list")) return { success: true, results: [] };
            if (sql.includes("COUNT(*)")) return { success: true, results: [{ exact_count: 0 }] };
            throw new Error("unexpected SQL");
          }
        };
      }
    };
    const validation = { catalogHash, catalogRows: 377, userTableCount: 50 };
    const result = await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "integration-token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: validation,
      transport: async (request) => handleOs01StagingCensus(request, db as never, {
        expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
        expectedCatalogHash: catalogHash,
        expectedCatalogRows: 377,
        expectedUserTableCount: 50
      })
    });
    expect(result.status).toBe("pending_control_plane_postcheck");
    expect(result.responseBytesSha256).toBe(sha256(readFileSync(artifacts.response)));
    writeJson(artifacts.postObservation, observation("post"));
    const finalReceipt = os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z"),
      validation
    );
    expect(finalReceipt).toMatchObject({
      status: "test_only_postcheck_verified",
      identitiesMatch: true,
      temporalOrderValid: true,
      crossRecordBindingsVerified: true,
      workerReadOnlyReceiptVerified: true
    });
  });
});
