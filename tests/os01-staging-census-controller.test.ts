import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalJson,
  STAGING_CENSUS_EXACT_BODY,
  STAGING_CENSUS_EXACT_BODY_SHA256,
  STAGING_CENSUS_ID,
  STAGING_CENSUS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-census/contract";
import { runOs01StagingCensusController } from "../scripts/os01_staging_census_controller";

const created: string[] = [];
afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function privateDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "os01-staging-census-controller-"));
  created.push(directory);
  expect(statSync(directory).mode & 0o777).toBe(0o700);
  return directory;
}

function paths(directory: string, suffix = "") {
  return {
    intentPath: resolve(directory, `intent${suffix}.json`),
    responsePath: resolve(directory, `response${suffix}.json`),
    resultPath: resolve(directory, `result${suffix}.json`)
  };
}

function validReceipt(): Record<string, unknown> {
  const tables = Array.from({ length: 50 }, (_, index) => ({
    name: `table_${String(index).padStart(2, "0")}`,
    createSql: `CREATE TABLE table_${String(index).padStart(2, "0")}(id INTEGER)`,
    createSqlHash: sha256(`CREATE TABLE table_${String(index).padStart(2, "0")}(id INTEGER)`),
    rowCount: 0,
    foreignKeys: []
  }));
  const body = {
    version: STAGING_CENSUS_SEMANTIC_CONTRACT.responseVersion,
    status: "read_only_schema_census_captured",
    censusId: STAGING_CENSUS_ID,
    catalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
    catalogHash: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
    userObjectCount: 50,
    userTableCount: 50,
    userViewCount: 0,
    tableSetHash: sha256(canonicalJson(tables.map((table) => table.name))),
    viewSetHash: sha256(canonicalJson([])),
    ddlRoot: sha256(canonicalJson(tables.map((table) => ({
      name: table.name,
      createSql: table.createSql
    })))),
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

function acceptedResponse(): Response {
  return Response.json(validReceipt(), { status: 200 });
}

describe("OS-01 staging census controller", () => {
  it("reserves one append-only intent before one byte-exact transport call", async () => {
    const directory = privateDirectory();
    const artifacts = paths(directory);
    const token = "ephemeral-sites-token-for-test";
    let calls = 0;
    const result = await runOs01StagingCensusController({
      ...artifacts,
      authorizationToken: token,
      now: () => new Date("2026-08-29T08:00:00.000Z"),
      transport: async (request) => {
        calls += 1;
        expect(request.url).toBe(`${STAGING_CENSUS_SEMANTIC_CONTRACT.origin}${STAGING_CENSUS_SEMANTIC_CONTRACT.route}`);
        expect(request.method).toBe("POST");
        expect(request.redirect).toBe("error");
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(request.headers.get("authorization")).toBe(`Bearer ${token}`);
        expect(await request.text()).toBe(STAGING_CENSUS_EXACT_BODY);
        return acceptedResponse();
      }
    });
    expect(calls).toBe(1);
    expect(result.status).toBe("accepted_read_only_census");
    expect(result.requestBodySha256).toBe(STAGING_CENSUS_EXACT_BODY_SHA256);
    for (const path of Object.values(artifacts)) {
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(path).nlink).toBe(1);
      expect(readFileSync(path, "utf8")).not.toContain(token);
    }
    expect(JSON.parse(readFileSync(artifacts.intentPath, "utf8"))).toMatchObject({
      status: "reserved_before_transport_no_retry",
      retryAllowedAfterReservation: false,
      credentialKind: "ephemeral_sites_siwe_not_persisted"
    });
  });

  it("allows only one of two concurrent controllers to dispatch", async () => {
    const directory = privateDirectory();
    const first = paths(directory, "-first");
    const second = { ...paths(directory, "-second"), intentPath: first.intentPath };
    let calls = 0;
    const transport = async () => {
      calls += 1;
      await Promise.resolve();
      return acceptedResponse();
    };
    const results = await Promise.allSettled([
      runOs01StagingCensusController({ ...first, authorizationToken: "token-one", transport }),
      runOs01StagingCensusController({ ...second, authorizationToken: "token-two", transport })
    ]);
    expect(calls).toBe(1);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("consumes the intent after transport uncertainty and prohibits a retry", async () => {
    const directory = privateDirectory();
    const artifacts = paths(directory);
    const first = await runOs01StagingCensusController({
      ...artifacts,
      authorizationToken: "token-one",
      transport: async () => {
        throw new Error("uncertain transport");
      }
    });
    expect(first.status).toBe("terminal_transport_uncertain");
    expect(first.retryAllowed).toBe(false);
    let retryCalls = 0;
    await expect(runOs01StagingCensusController({
      intentPath: artifacts.intentPath,
      responsePath: resolve(directory, "retry-response.json"),
      resultPath: resolve(directory, "retry-result.json"),
      authorizationToken: "token-two",
      transport: async () => {
        retryCalls += 1;
        return acceptedResponse();
      }
    })).rejects.toThrow();
    expect(retryCalls).toBe(0);
  });

  it("makes an invalid response terminal and preserves its exact bytes", async () => {
    const directory = privateDirectory();
    const artifacts = paths(directory);
    const responseBytes = JSON.stringify({ error: "not-a-census" });
    const result = await runOs01StagingCensusController({
      ...artifacts,
      authorizationToken: "token",
      transport: async () => new Response(responseBytes, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    });
    expect(result.status).toBe("terminal_invalid_response");
    expect(result.retryAllowed).toBe(false);
    expect(readFileSync(artifacts.responsePath, "utf8")).toBe(responseBytes);
    expect(result.responseBytesSha256).toBe(sha256(responseBytes));
  });
});
