import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  canonicalJson,
  codePointCompare,
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
  type PreregisteredArtifactIdentity,
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
    archiveFileListRoot: "1".repeat(64),
    archiveContentRoot: "2".repeat(64),
    archiveFileCount: 2,
    archiveBytes: 4_905,
    uploadMethodIdentity: "sites_save_site_version_exact_local_archive",
    remoteBuildRequested: false,
    accessRevision: 1,
    ownerIdentityHash: "f".repeat(64),
    environmentRevision: 0,
    environmentKeyNames: [],
    recordedAt: phase === "pre" ? "2026-08-29T08:00:00.000Z" : "2026-08-29T08:01:00.000Z"
  };
}

function preregisteredArtifactIdentity(
  input: ControlPlaneObservationInput = observationInput("pre")
): PreregisteredArtifactIdentity {
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
    remoteBuildRequested: input.remoteBuildRequested
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
    preregisteredArtifactIdentity(),
    () => new Date("2026-08-29T07:59:59.000Z")
  );
  writeJson(artifacts.preObservation, observation("pre"));
  return { root, artifacts };
}

type ReceiptCatalogRow = { type: string; name: string; tbl_name: string; sql: string | null };

function receiptCatalog(userTableCount: number, catalogRows: number): ReceiptCatalogRow[] {
  const tables = Array.from({ length: userTableCount }, (_, index) => {
    const name = "table_" + String(index).padStart(2, "0");
    return { type: "table", name, tbl_name: name, sql: "CREATE TABLE " + name + "(id INTEGER)" };
  });
  const additional = catalogRows - userTableCount;
  if (additional < 0) throw new Error("catalog rows cannot be smaller than the user table count");
  const internal = additional > 0
    ? [{ type: "table", name: "d1_migrations", tbl_name: "d1_migrations", sql: "CREATE TABLE d1_migrations(id INTEGER)" }]
    : [];
  const indexes = Array.from({ length: Math.max(0, additional - internal.length) }, (_, index) => ({
    type: "index",
    name: "idx_" + String(index).padStart(3, "0"),
    tbl_name: tables[0]?.name ?? "missing_table",
    sql: "CREATE INDEX idx_" + String(index).padStart(3, "0") + " ON " +
      (tables[0]?.name ?? "missing_table") + "(id)"
  }));
  return [...indexes, ...internal, ...tables].sort((left, right) =>
    left.type < right.type ? -1 : left.type > right.type ? 1 :
      left.name < right.name ? -1 : left.name > right.name ? 1 :
        left.tbl_name < right.tbl_name ? -1 : left.tbl_name > right.tbl_name ? 1 : 0);
}

function validReceipt(
  identity: ResponseValidationIdentity,
  catalog: ReceiptCatalogRow[] = receiptCatalog(identity.userTableCount, identity.catalogRows)
): Record<string, unknown> {
  const internalNames = new Set(STAGING_CENSUS_SEMANTIC_CONTRACT.internalTableNames);
  const userRows = catalog.filter((row) => !(row.type === "table" && row.name === row.tbl_name &&
    internalNames.has(row.name)));
  const objects = userRows.filter((row) => row.sql !== null).map((row) => ({
    type: row.type,
    name: row.name,
    tblName: row.tbl_name,
    createSql: row.sql,
    createSqlHash: sha256(row.sql as string)
  })).sort((left, right) => codePointCompare(left.type, right.type) ||
    codePointCompare(left.name, right.name) || codePointCompare(left.tblName, right.tblName));
  const derivedAutoIndexes = userRows.filter((row) => row.type === "index" && row.sql === null)
    .map((row) => ({
      type: "index",
      name: row.name,
      tblName: row.tbl_name,
      createSql: null,
      createSqlHash: sha256("")
    })).sort((left, right) => codePointCompare(left.name, right.name) ||
      codePointCompare(left.tblName, right.tblName));
  const internalObjects = catalog.filter((row) => row.type === "table" && row.name === row.tbl_name &&
    internalNames.has(row.name)).map((row) => ({
    type: row.type,
    name: row.name,
    tblName: row.tbl_name,
    createSql: row.sql,
    createSqlHash: typeof row.sql === "string" ? sha256(row.sql) : null
  })).sort((left, right) => codePointCompare(left.type, right.type) ||
    codePointCompare(left.name, right.name) || codePointCompare(left.tblName, right.tblName));
  const physicalObjects = [...objects, ...derivedAutoIndexes].sort((left, right) =>
    codePointCompare(left.type, right.type) || codePointCompare(left.name, right.name) ||
    codePointCompare(left.tblName, right.tblName));
  const objectTypeCounts = Object.fromEntries(STAGING_CENSUS_SEMANTIC_CONTRACT.replayableObjectTypes
    .map((type) => [type, physicalObjects.filter((object) => object.type === type).length]));
  const perTypeRoots = Object.fromEntries(STAGING_CENSUS_SEMANTIC_CONTRACT.replayableObjectTypes
    .map((type) => [type, sha256(canonicalJson(physicalObjects.filter((object) => object.type === type)))]));
  const body = {
    version: STAGING_CENSUS_SEMANTIC_CONTRACT.responseVersion,
    status: STAGING_CENSUS_SEMANTIC_CONTRACT.responseStatus,
    censusId: STAGING_CENSUS_ID,
    catalogRows: identity.catalogRows,
    catalogHash: identity.catalogHash,
    firstCatalogHash: identity.catalogHash,
    secondCatalogHash: identity.catalogHash,
    catalog,
    userObjectCount: userRows.length,
    userTableCount: identity.userTableCount,
    replayableObjectCount: objects.length,
    objectTypeCounts,
    objectSetHash: sha256(canonicalJson(physicalObjects.map((object) => ({
      type: object.type,
      name: object.name,
      tblName: object.tblName
    })))),
    replayableDdlRoot: sha256(canonicalJson(objects)),
    perTypeRoots,
    objects,
    derivedAutoIndexCount: derivedAutoIndexes.length,
    derivedAutoIndexSetHash: sha256(canonicalJson(derivedAutoIndexes)),
    derivedAutoIndexes,
    excludedInternalObjectCount: internalObjects.length,
    excludedInternalObjectSetHash: sha256(canonicalJson(internalObjects)),
    excludedInternalObjects: internalObjects,
    batchCatalogPairMatch: true,
    snapshotClaim: STAGING_CENSUS_SEMANTIC_CONTRACT.consistencyClaim,
    d1QueryCount: STAGING_CENSUS_SEMANTIC_CONTRACT.maximumD1QueriesPerInvocation,
    foreignKeyEvidence: STAGING_CENSUS_SEMANTIC_CONTRACT.foreignKeyEvidence,
    foreignKeyEvidenceWithheld: true,
    foreignKeyClaimsAccepted: false,
    rowCountEvidence: STAGING_CENSUS_SEMANTIC_CONTRACT.rowCountEvidence,
    rowCountEvidenceWithheld: true,
    rowCountClaimsAccepted: false,
    requestBudgetClaim: "controller_enforced_single_invocation_not_runtime_durable",
    databaseMutationAttempted: false,
    providerBindings: 0,
    providerSecretReads: 0,
    providerDispatches: 0,
    quotaReservations: 0,
    captureActivations: 0,
    productionReads: 0,
    productionMutations: 0,
    claimBoundary: "isolated_staging_read_only_ddl_catalog_census_only_no_row_count_or_foreign_key_claim"
  };
  return { ...body, receiptHash: sha256(canonicalJson(body)) };
}

const DEFAULT_CATALOG = receiptCatalog(
  STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount,
  STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows
);
const defaultValidation: ResponseValidationIdentity = {
  catalogHash: sha256(canonicalJson(DEFAULT_CATALOG)),
  catalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
  userTableCount: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount
};

function acceptedResponse(identity = defaultValidation): Response {
  return Response.json(validReceipt(identity), { status: 200 });
}

function closedFailureResponse(
  failureCategory: "user_table_count_mismatch" | "user_object_identifier_shape_invalid" |
    "user_object_name_binding_invalid" | "user_object_create_sql_missing" | "catalog_read_failed"
): Response {
  const body = {
    version: "engine-os.os01-staging-census-failure.v1",
    status: "read_only_census_failed",
    censusId: STAGING_CENSUS_ID,
    failureCategory,
    databaseMutationAttempted: false,
    claimBoundary: "terminal_read_only_diagnostic_not_census_receipt"
  } as const;
  return new Response(JSON.stringify({ ...body, receiptHash: sha256(canonicalJson(body)) }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
}

function countDiagnosticResponse(input: {
  status?: "closed_user_table_count_match" | "closed_user_table_count_mismatch";
  expected?: number;
  raw?: number;
  excluded?: number;
  observed?: number;
} = {}): Response {
  const body = {
    version: "engine-os.os01-staging-census-table-count-diagnostic.v1",
    status: input.status ?? "closed_user_table_count_mismatch",
    censusId: STAGING_CENSUS_ID,
    expectedUserTableCount: input.expected ?? 94,
    rawTableRowCount: input.raw ?? 95,
    excludedInternalTableRowCount: input.excluded ?? 0,
    observedUserTableCount: input.observed ?? 95,
    databaseMutationAttempted: false,
    claimBoundary: "terminal_read_only_count_diagnostic_not_census_receipt"
  } as const;
  return new Response(JSON.stringify({ ...body, receiptHash: sha256(canonicalJson(body)) }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
}

function successReceiptContaining(value: string): Record<string, unknown> {
  const receipt = validReceipt(defaultValidation);
  const objects = receipt.objects as Array<Record<string, unknown>>;
  objects[0]!.createSql = value;
  objects[0]!.createSqlHash = sha256(value);
  delete receipt.receiptHash;
  receipt.receiptHash = sha256(canonicalJson(receipt));
  return receipt;
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
      preregisteredArtifactIdentity(),
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
        preregisteredArtifactIdentity(),
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

  it("requires one closed artifact identity at init and binds it into authority", async () => {
    const expected = preregisteredArtifactIdentity();
    let initialized: PreregisteredArtifactIdentity | null = null;
    const result = await os01StagingCensusControllerTestOnly.executeCli({
      action: "init",
      stdin: JSON.stringify(expected) + "\n",
      operations: {
        initialize: (identity) => {
          initialized = identity;
          return "/private/tmp/preregistered-controller";
        },
        writeObservation: () => { throw new Error("unexpected observation"); },
        run: async () => { throw new Error("unexpected run"); },
        finalize: () => { throw new Error("unexpected finalize"); }
      }
    });
    expect(initialized).toEqual(expected);
    expect(result).toEqual({ stdout: "/private/tmp/preregistered-controller\n", exitCode: 0 });
    await expect(os01StagingCensusControllerTestOnly.executeCli({
      action: "init",
      stdin: JSON.stringify({ ...expected, extra: "not-closed" }),
      operations: {
        initialize: () => { throw new Error("must not initialize"); },
        writeObservation: () => { throw new Error("unexpected observation"); },
        run: async () => { throw new Error("unexpected run"); },
        finalize: () => { throw new Error("unexpected finalize"); }
      }
    })).rejects.toThrow("closed schema");
  });

  it("rejects every artifact-identity substitution before transport", async () => {
    const substitutions: Array<[keyof PreregisteredArtifactIdentity, unknown]> = [
      ["sourceCommit", "9".repeat(40)],
      ["sourceTree", "8".repeat(40)],
      ["workerSha256", "7".repeat(64)],
      ["manifestSha256", "6".repeat(64)],
      ["archiveSha256", "5".repeat(64)],
      ["archiveFileListRoot", "4".repeat(64)],
      ["archiveContentRoot", "3".repeat(64)],
      ["archiveFileCount", 3],
      ["archiveBytes", 4_906],
      ["uploadMethodIdentity", "different_upload_method"],
      ["remoteBuildRequested", true]
    ];
    for (const [field, replacement] of substitutions) {
      const root = privateDirectory();
      const artifacts = paths(root);
      os01StagingCensusControllerTestOnly.initialize(
        root,
        preregisteredArtifactIdentity(),
        () => new Date("2026-08-29T07:59:59.000Z")
      );
      const substituted = {
        ...observationInput("pre"),
        [field]: replacement
      } as unknown as ControlPlaneObservationInput;
      expect(() => os01StagingCensusControllerTestOnly.writeObservation(root, substituted)).toThrow();
      expect(existsSync(artifacts.preObservation)).toBe(false);
      expect(existsSync(artifacts.intent)).toBe(false);
    }
  });

  it("rejects coordinated substituted observations against authority A", async () => {
    const root = privateDirectory();
    const artifacts = paths(root);
    os01StagingCensusControllerTestOnly.initialize(
      root,
      preregisteredArtifactIdentity(),
      () => new Date("2026-08-29T07:59:59.000Z")
    );
    const substituted = { ...observationInput("pre"), archiveSha256: "5".repeat(64) };
    writeJson(artifacts.preObservation, createOs01StagingCensusControlPlaneObservation(substituted));
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
    })).rejects.toThrow("not preregistered");
    expect(calls).toBe(0);
    expect(existsSync(artifacts.intent)).toBe(false);
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

  it("preserves credential bytes through the CLI except for one line delimiter", async () => {
    for (const stdin of [" token\n", "token \n", "token\t\n", "to\u0000ken\n", "to\rken\n", "to\nken\n"]) {
      const { root, artifacts } = prepareRoot();
      let calls = 0;
      await expect(os01StagingCensusControllerTestOnly.executeCli({
        action: "run",
        stdin,
        operations: {
          initialize: () => { throw new Error("unexpected init"); },
          writeObservation: () => { throw new Error("unexpected observation"); },
          run: ({ authorizationToken }) => os01StagingCensusControllerTestOnly.run({
            root,
            authorizationToken,
            now: () => new Date("2026-08-29T08:00:01.000Z"),
            responseValidation: defaultValidation,
            transport: async () => {
              calls += 1;
              return acceptedResponse();
            }
          }),
          finalize: () => { throw new Error("unexpected finalize"); }
        }
      })).rejects.toThrow("one ephemeral Sites authorization token is required");
      expect(calls).toBe(0);
      expect(existsSync(artifacts.intent)).toBe(false);
    }

    const { root } = prepareRoot();
    let receivedToken = "";
    const valid = await os01StagingCensusControllerTestOnly.executeCli({
      action: "run",
      stdin: "exact-token\n",
      operations: {
        initialize: () => { throw new Error("unexpected init"); },
        writeObservation: () => { throw new Error("unexpected observation"); },
        run: ({ authorizationToken }) => {
          receivedToken = authorizationToken;
          return os01StagingCensusControllerTestOnly.run({
            root,
            authorizationToken,
            now: () => new Date("2026-08-29T08:00:01.000Z"),
            responseValidation: defaultValidation,
            transport: async () => acceptedResponse()
          });
        },
        finalize: () => { throw new Error("unexpected finalize"); }
      }
    });
    expect(receivedToken).toBe("exact-token");
    expect(valid).toEqual({ stdout: "pending_control_plane_postcheck\n", exitCode: 0 });
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
        preregisteredArtifactIdentity(invalid),
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

  it("accepts one exact full-census response pending the control-plane postcheck", async () => {
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
        expect(request.headers.get("oai-sites-authorization")).toBe("Bearer " + token);
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
    expect(statSync(artifacts.response).size).toBeGreaterThan(0);
    expect(statSync(artifacts.dispatchCompletion).size).toBeGreaterThan(0);
    writeJson(artifacts.postObservation, observation("post"));
    const finalReceipt = os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z"),
      defaultValidation
    );
    expect(finalReceipt).toMatchObject({
      status: "test_only_postcheck_verified",
      workerReadOnlyReceiptVerified: true,
      artifactIdentityBindingVerified: true,
      crossRecordBindingsVerified: true
    });
    const expectedIdentityHash = sha256(canonicalJson(preregisteredArtifactIdentity()));
    for (const path of [
      artifacts.authority,
      artifacts.intent,
      artifacts.attemptResult,
      artifacts.dispatchCompletion,
      artifacts.finalizationIntent,
      artifacts.finalReceipt
    ]) {
      expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
        preregisteredArtifactIdentityHash: expectedIdentityHash
      });
    }
  });

  it("rejects a post-dispatch artifact substitution against the preregistered identity", async () => {
    const { root, artifacts } = prepareRoot();
    await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "ephemeral-sites-token-for-test",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => acceptedResponse()
    });
    expect(() => os01StagingCensusControllerTestOnly.writeObservation(root, {
      ...observationInput("post"),
      archiveContentRoot: "3".repeat(64)
    })).toThrow("preregistered artifact identity");
    expect(existsSync(artifacts.postObservation)).toBe(false);
  });

  it("treats credential reflection in any response header representation as terminal", async () => {
    const token = "reflection-token/7";
    const cases: Array<{ token: string; headerName: string; headerValue: string }> = [
      { token: "reflection-token", headerName: "x-reflection-token-proof", headerValue: "present" },
      { token: "MixedCaseToken", headerName: "x-mixedcasetoken-proof", headerValue: "present" },
      ...[
        token,
        "Bearer " + token,
        Buffer.from(token, "utf8").toString("base64"),
        encodeURIComponent(token)
      ].map((headerValue) => ({ token, headerName: "x-reflected-credential", headerValue }))
    ];
    for (const item of cases) {
      const { root, artifacts } = prepareRoot();
      const result = await os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: item.token,
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        responseValidation: defaultValidation,
        transport: async () => new Response(JSON.stringify(validReceipt(defaultValidation)), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            [item.headerName]: item.headerValue
          }
        })
      });
      expect(result.status).toBe("terminal_credential_reflection");
      expect(result.responseBytesSha256).toBeNull();
      expect(statSync(artifacts.response).size).toBe(0);
      expect(statSync(artifacts.dispatchCompletion).size).toBe(0);
      expect(readFileSync(artifacts.attemptResult, "utf8")).not.toContain(item.token);
    }
  });

  it("rejects a count diagnostic delivered with HTTP 200 and a full census delivered with HTTP 500", async () => {
    for (const response of [
      new Response(await countDiagnosticResponse().text(), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }),
      new Response(JSON.stringify(validReceipt(defaultValidation)), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    ]) {
      const { root, artifacts } = prepareRoot();
      const result = await os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: "crossed-status-token",
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        responseValidation: defaultValidation,
        transport: async () => response
      });
      expect(result.status).toBe("terminal_invalid_response");
      expect(statSync(artifacts.response).size).toBe(0);
      expect(statSync(artifacts.dispatchCompletion).size).toBe(0);
    }
  });

  it("rejects noncanonical, extended, self-hash-invalid, root-invalid, and FK-bearing responses", async () => {
    const rehashed = (mutate: (value: Record<string, unknown>) => void): string => {
      const value = structuredClone(validReceipt(defaultValidation));
      delete value.receiptHash;
      mutate(value);
      value.receiptHash = sha256(canonicalJson(value));
      return JSON.stringify(value);
    };
    const extended = structuredClone(validReceipt(defaultValidation));
    extended.unexpected = true;
    const badHash = structuredClone(validReceipt(defaultValidation));
    badHash.receiptHash = "0".repeat(64);
    const bodies = [
      JSON.stringify(extended),
      JSON.stringify(badHash),
      rehashed((value) => {
        const objects = value.objects as Array<Record<string, unknown>>;
        objects[0]!.createSqlHash = "0".repeat(64);
      }),
      rehashed((value) => { value.replayableDdlRoot = "0".repeat(64); }),
      rehashed((value) => { value.objectSetHash = "0".repeat(64); }),
      rehashed((value) => {
        (value.perTypeRoots as Record<string, unknown>).index = "0".repeat(64);
      }),
      rehashed((value) => { value.firstCatalogHash = "0".repeat(64); }),
      rehashed((value) => { value.secondCatalogHash = "0".repeat(64); }),
      rehashed((value) => {
        const catalog = value.catalog as Array<Record<string, unknown>>;
        catalog[0]!.sql = "CREATE INDEX changed ON table_00(id)";
      }),
      rehashed((value) => { value.d1QueryCount = 1; }),
      rehashed((value) => { value.d1QueryCount = 3; }),
      rehashed((value) => { value.foreignKeyEvidence = "not_withheld"; }),
      rehashed((value) => { value.foreignKeyEvidenceWithheld = false; }),
      rehashed((value) => { value.foreignKeyClaimsAccepted = true; }),
      rehashed((value) => { value.rowCountEvidence = "not_withheld"; }),
      rehashed((value) => { value.rowCountEvidenceWithheld = false; }),
      rehashed((value) => { value.rowCountClaimsAccepted = true; }),
      rehashed((value) => { value.version = "engine-os.os01-staging-ddl-row-census-receipt.v1"; }),
      rehashed((value) => { value.status = "read_only_ddl_row_census_captured"; }),
      rehashed((value) => { delete value.foreignKeyEvidence; }),
      rehashed((value) => { delete value.foreignKeyEvidenceWithheld; }),
      rehashed((value) => { delete value.foreignKeyClaimsAccepted; }),
      rehashed((value) => { delete value.rowCountEvidence; }),
      rehashed((value) => { delete value.rowCountEvidenceWithheld; }),
      rehashed((value) => { delete value.rowCountClaimsAccepted; }),
      rehashed((value) => { value.userObjectCount = 378; }),
      rehashed((value) => {
        const objects = value.objects as Array<Record<string, unknown>>;
        objects.pop();
        value.replayableObjectCount = objects.length;
        value.userObjectCount = objects.length;
        value.replayableDdlRoot = sha256(canonicalJson(objects));
        const physical = objects;
        value.objectSetHash = sha256(canonicalJson(physical.map((object) => ({
          type: object.type, name: object.name, tblName: object.tblName
        }))));
      }),
      rehashed((value) => {
        const objects = value.objects as Array<Record<string, unknown>>;
        objects[0]!.foreignKeys = [];
      }),
      rehashed((value) => { value.foreignKeyRoot = sha256(canonicalJson([])); }),
      rehashed((value) => {
        const objects = value.objects as Array<Record<string, unknown>>;
        objects[0]!.rowCount = 0;
      }),
      rehashed((value) => { value.rowCountRoot = sha256(canonicalJson([])); }),
      rehashed((value) => { value.prePostRowCountsMatch = true; }),
      rehashed((value) => { value.tables = []; }),
      rehashed((value) => { value.viewNames = []; }),
      JSON.stringify(validReceipt(defaultValidation)) + "\n"
    ];
    for (const body of bodies) {
      const { root, artifacts } = prepareRoot();
      const result = await os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: "invalid-census-token",
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        responseValidation: defaultValidation,
        transport: async () => new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      });
      expect(result.status).toBe("terminal_invalid_response");
      expect(statSync(artifacts.response).size).toBe(0);
      expect(statSync(artifacts.dispatchCompletion).size).toBe(0);
    }
  });

  it("rejects fully self-consistent autoindexes whose names are misbound to their table", async () => {
    for (const autoIndexName of ["sqlite_autoindex_wrong_1", "sqlite_autoindex_sample_wrong_1"]) {
      const catalog: ReceiptCatalogRow[] = [
        { type: "index", name: autoIndexName, tbl_name: "sample", sql: null },
        {
          type: "table",
          name: "sample",
          tbl_name: "sample",
          sql: "CREATE TABLE sample(id INTEGER PRIMARY KEY)"
        }
      ];
      const identity = {
        catalogHash: sha256(canonicalJson(catalog)),
        catalogRows: catalog.length,
        userTableCount: 1
      };
      const { root, artifacts } = prepareRoot();
      const result = await os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: "misbound-autoindex-token",
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        responseValidation: identity,
        transport: async () => Response.json(validReceipt(identity, catalog), { status: 200 })
      });
      expect(result.status).toBe("terminal_invalid_response");
      expect(statSync(artifacts.response).size).toBe(0);
      expect(statSync(artifacts.dispatchCompletion).size).toBe(0);
    }
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
    expect(result.status).toBe("terminal_credential_reflection");
    expect(statSync(artifacts.response).size).toBe(0);
  });

  it("detects credentials after JSON quote, backslash, and Unicode escape decoding", async () => {
    const cases = [
      { token: "credential\"quoted", encode: (value: unknown) => JSON.stringify(value) },
      { token: "credential\\backslash", encode: (value: unknown) => JSON.stringify(value) },
      {
        token: "credential-unicode",
        encode: (value: unknown) => JSON.stringify(value)
          .replaceAll("credential-unicode", "\\u0063redential-unicode")
      }
    ];
    for (const item of cases) {
      const { root, artifacts } = prepareRoot();
      const responseBytes = item.encode(successReceiptContaining(item.token));
      expect(responseBytes.includes(item.token)).toBe(false);
      const result = await os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: item.token,
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        responseValidation: defaultValidation,
        transport: async () => new Response(responseBytes, {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      });
      expect(result.status).toBe("terminal_credential_reflection");
      expect(statSync(artifacts.response).size).toBe(0);
    }
  });

  it("persists only a self-hashed count diagnostic and consumes the authority", async () => {
    const { root, artifacts } = prepareRoot();
    const result = await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "diagnostic-token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => countDiagnosticResponse({ raw: 96, excluded: 1, observed: 95 })
    });
    expect(result.status).toBe("terminal_worker_failure");
    expect(result.retryAllowed).toBe(false);
    expect(JSON.parse(readFileSync(artifacts.response, "utf8"))).toMatchObject({
      status: "closed_user_table_count_mismatch",
      rawTableRowCount: 96,
      excludedInternalTableRowCount: 1,
      observedUserTableCount: 95,
      databaseMutationAttempted: false
    });
    expect(statSync(artifacts.dispatchCompletion).size).toBe(0);
    let calls = 0;
    await expect(os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "retry-token",
      now: () => new Date("2026-08-29T08:00:02.000Z"),
      responseValidation: defaultValidation,
      transport: async () => {
        calls += 1;
        return acceptedResponse();
      }
    })).rejects.toThrow();
    expect(calls).toBe(0);
    expect(() => os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z")
    )).toThrow();
  });

  it("accepts the exact zero and maximum raw-table boundaries", async () => {
    for (const diagnostic of [
      { raw: 0, excluded: 0, observed: 0 },
      { raw: 1_000, excluded: 905, observed: 95 }
    ]) {
      const { root, artifacts } = prepareRoot();
      const result = await os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: "diagnostic-token",
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        responseValidation: defaultValidation,
        transport: async () => countDiagnosticResponse(diagnostic)
      });
      expect(result.status).toBe("terminal_worker_failure");
      expect(JSON.parse(readFileSync(artifacts.response, "utf8"))).toMatchObject({
        rawTableRowCount: diagnostic.raw,
        excludedInternalTableRowCount: diagnostic.excluded,
        observedUserTableCount: diagnostic.observed
      });
      expect(statSync(artifacts.dispatchCompletion).size).toBe(0);
    }
  });

  it("does not persist a closed worker failure outside generation 6 count-only scope", async () => {
    const { root, artifacts } = prepareRoot();
    const result = await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "diagnostic-token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => closedFailureResponse("catalog_read_failed")
    });
    expect(result.status).toBe("terminal_invalid_response");
    expect(statSync(artifacts.response).size).toBe(0);
    expect(statSync(artifacts.dispatchCompletion).size).toBe(0);
  });

  it("leaves altered, extended, and noncanonical worker failure bodies unpersisted", async () => {
    const validFailure = await countDiagnosticResponse().json() as
      Record<string, unknown>;
    const rehashed = (mutate: (value: Record<string, unknown>) => void) => {
      const value = { ...validFailure };
      delete value.receiptHash;
      mutate(value);
      return { ...value, receiptHash: sha256(canonicalJson(value)) };
    };
    const bodies = [
      { ...validFailure, extra: true },
      { ...validFailure, receiptHash: "0".repeat(64) },
      rehashed((value) => {
        value.rawTableRowCount = 1_001;
        value.excludedInternalTableRowCount = 906;
        value.observedUserTableCount = 95;
      }),
      rehashed((value) => {
        value.rawTableRowCount = -1;
        value.excludedInternalTableRowCount = 0;
        value.observedUserTableCount = -1;
      }),
      rehashed((value) => {
        value.rawTableRowCount = 1;
        value.excludedInternalTableRowCount = 2;
        value.observedUserTableCount = 0;
      }),
      rehashed((value) => {
        value.rawTableRowCount = 1;
        value.excludedInternalTableRowCount = 0;
        value.observedUserTableCount = 2;
      }),
      rehashed((value) => {
        value.rawTableRowCount = 95;
        value.excludedInternalTableRowCount = 1;
        value.observedUserTableCount = 93;
      }),
      rehashed((value) => {
        value.rawTableRowCount = 94;
        value.excludedInternalTableRowCount = 0;
        value.observedUserTableCount = 94;
      }),
      rehashed((value) => {
        value.status = "closed_user_table_count_match";
      }),
      rehashed((value) => {
        value.expectedUserTableCount = 93;
      }),
      rehashed((value) => {
        value.rawTableRowCount = 95;
        value.excludedInternalTableRowCount = 1;
        value.observedUserTableCount = 95;
      }),
      JSON.stringify(validFailure) + "\n"
    ];
    for (const body of bodies) {
      const { root, artifacts } = prepareRoot();
      const responseBody = typeof body === "string" ? body : JSON.stringify(body);
      const result = await os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken: "diagnostic-token",
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        responseValidation: defaultValidation,
        transport: async () => new Response(responseBody, {
          status: 500,
          headers: { "Content-Type": "application/json" }
        })
      });
      expect(result.status).toBe("terminal_invalid_response");
      expect(statSync(artifacts.response).size).toBe(0);
    }
  });

  it("rejects whitespace and control-bearing credentials before reserving intent", async () => {
    for (const authorizationToken of [" token", "token ", "to\tken", "to\u0000ken"]) {
      const { root, artifacts } = prepareRoot();
      let calls = 0;
      await expect(os01StagingCensusControllerTestOnly.run({
        root,
        authorizationToken,
        now: () => new Date("2026-08-29T08:00:01.000Z"),
        responseValidation: defaultValidation,
        transport: async () => {
          calls += 1;
          return acceptedResponse();
        }
      })).rejects.toThrow("one ephemeral Sites authorization token is required");
      expect(calls).toBe(0);
      expect(existsSync(artifacts.intent)).toBe(false);
    }
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

  it("rejects a consistently rehashed lifecycle artifact-identity substitution", async () => {
    const { root, artifacts } = prepareRoot();
    await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: defaultValidation,
      transport: async () => acceptedResponse()
    });
    replaceHashedJson(artifacts.intent, "intentHash", (intent) => {
      intent.preregisteredArtifactIdentityHash = "0".repeat(64);
    });
    replaceHashedJson(artifacts.dispatchCompletion, "completionHash", (completion) => {
      completion.intentBytesSha256 = sha256(readFileSync(artifacts.intent));
    });
    writeJson(artifacts.postObservation, observation("post"));
    expect(os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z")
    )).toMatchObject({
      status: "test_only_postcheck_rejected",
      artifactIdentityBindingVerified: false,
      crossRecordBindingsVerified: true
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
      authorityVerified: false
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

  it("integrates the actual worker over 94 user tables and finalizes only after postcheck", async () => {
    const { root, artifacts } = prepareRoot();
    const tables = Array.from({ length: 94 }, (_, index) => {
      const name = "table_" + String(index).padStart(2, "0");
      return { type: "table", name, tbl_name: name, sql: "CREATE TABLE " + name + "(id INTEGER)" };
    });
    const indexes = Array.from({ length: 282 }, (_, index) => ({
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
    let queryCount = 0;
    const db = {
      prepare(sql: string) {
        queryCount += 1;
        return { sql };
      },
      async batch(statements: Array<{ sql: string }>) {
        return statements.map(({ sql }) => {
          if (!sql.includes("FROM sqlite_schema")) throw new Error("unexpected SQL");
          return { success: true, results: catalog };
        });
      }
    };
    const validation = { catalogHash, catalogRows: 377, userTableCount: 94 };
    const result = await os01StagingCensusControllerTestOnly.run({
      root,
      authorizationToken: "integration-token",
      now: () => new Date("2026-08-29T08:00:01.000Z"),
      responseValidation: validation,
      transport: async (request) => handleOs01StagingCensus(request, db as never, {
        expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
        expectedCatalogHash: catalogHash,
        expectedCatalogRows: 377,
        expectedUserTableCount: 94
      })
    });
    expect(result.status).toBe("pending_control_plane_postcheck");
    expect(result.responseBytesSha256).toBe(sha256(readFileSync(artifacts.response)));
    const receipt = JSON.parse(readFileSync(artifacts.response, "utf8")) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      status: "read_only_ddl_catalog_census_captured",
      catalogRows: 377,
      userTableCount: 94,
      userObjectCount: 376,
      replayableObjectCount: 376,
      batchCatalogPairMatch: true
    });
    expect(receipt.objects).toHaveLength(376);
    expect((receipt.objectTypeCounts as Record<string, unknown>).index).toBe(282);
    expect(queryCount).toBe(2);
    expect(statSync(artifacts.dispatchCompletion).size).toBeGreaterThan(0);
    writeJson(artifacts.postObservation, observation("post"));
    expect(os01StagingCensusControllerTestOnly.finalize(
      root,
      () => new Date("2026-08-29T08:02:00.000Z"),
      validation
    )).toMatchObject({
      status: "test_only_postcheck_verified",
      workerReadOnlyReceiptVerified: true,
      boundedDdlCatalogReceiptVerified: true,
      foreignKeyEvidenceWithheld: true,
      foreignKeyClaimsAccepted: false,
      offlineDdlReplayEligible: false,
      crossRecordBindingsVerified: true
    });
  });
});
