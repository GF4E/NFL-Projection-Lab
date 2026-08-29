import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  handleOs01StagingCensus
} from "../qualification/os01-staging-census/entry";
import {
  canonicalJson,
  DEFAULT_STAGING_CENSUS_OPTIONS,
  STAGING_CENSUS_CONTROLLER_AUTHORITY_CONTRACT,
  STAGING_CENSUS_CONTROLLER_ID,
  STAGING_CENSUS_EXACT_BODY,
  STAGING_CENSUS_EXACT_BODY_SHA256,
  STAGING_CENSUS_ID,
  STAGING_CENSUS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-census/contract";
import { buildOs01StagingCensus } from "../scripts/build_os01_staging_census";

const created: string[] = [];
afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true });
});

const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

const baseCatalog = [
  { type: "index", name: "idx_sample", tbl_name: "sample", sql: "CREATE INDEX idx_sample ON sample(id)" },
  { type: "table", name: "d1_migrations", tbl_name: "d1_migrations", sql: "CREATE TABLE d1_migrations(id INTEGER)" },
  { type: "table", name: "sample", tbl_name: "sample", sql: "CREATE TABLE sample(id INTEGER)" },
  { type: "view", name: "sample_view", tbl_name: "sample_view", sql: "CREATE VIEW sample_view AS SELECT id FROM sample" }
];

type FixtureOptions = {
  catalogBefore?: typeof baseCatalog;
  catalogAfter?: typeof baseCatalog;
  counts?: number[];
  foreignKeys?: Record<string, unknown>[];
  failWhen?: "catalog" | "foreign_key" | "count";
};

function fixture(options: FixtureOptions = {}) {
  const catalogBefore = options.catalogBefore ?? baseCatalog;
  const catalogAfter = options.catalogAfter ?? catalogBefore;
  const counts = options.counts ?? [0, 0];
  let calls = 0;
  let catalogReads = 0;
  let countReads = 0;
  const db = {
    prepare(sql: string) {
      calls += 1;
      return {
        async all() {
          if (sql.includes("FROM sqlite_schema")) {
            if (options.failWhen === "catalog") throw new Error("sensitive catalog detail");
            return { success: true, results: catalogReads++ === 0 ? catalogBefore : catalogAfter };
          }
          if (sql.includes("foreign_key_list")) {
            if (options.failWhen === "foreign_key") throw new Error("sensitive foreign-key detail");
            return { success: true, results: options.foreignKeys ?? [] };
          }
          if (sql.includes("COUNT(*)")) {
            if (options.failWhen === "count") throw new Error("sensitive count detail");
            return { success: true, results: [{ exact_count: counts[countReads++] ?? counts.at(-1) ?? 0 }] };
          }
          throw new Error("unexpected SQL");
        }
      };
    }
  };
  return { db, catalogBefore, calls: () => calls };
}

function options(value: ReturnType<typeof fixture>) {
  return {
    expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
    expectedCatalogHash: hash(value.catalogBefore),
    expectedCatalogRows: value.catalogBefore.length,
    expectedUserTableCount: 1
  };
}

function request(input: {
  body?: string;
  method?: string;
  origin?: string;
  query?: string;
  contentType?: string;
} = {}) {
  const method = input.method ?? "POST";
  return new Request(`${input.origin ?? STAGING_CENSUS_SEMANTIC_CONTRACT.origin}${STAGING_CENSUS_SEMANTIC_CONTRACT.route}${input.query ?? ""}`, {
    method,
    headers: { "Content-Type": input.contentType ?? "application/json" },
    body: method === "POST" ? input.body ?? STAGING_CENSUS_EXACT_BODY : undefined
  });
}

function files(root: string, current = root): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(current)) {
    const path = join(current, entry);
    if (statSync(path).isDirectory()) result.push(...files(root, path));
    else result.push(path.slice(root.length + 1));
  }
  return result.sort(compare);
}

describe("OS-01 staging DDL census", () => {
  it("pins the default 377-row catalog, hash, 50-table count, and staging origin", () => {
    expect(DEFAULT_STAGING_CENSUS_OPTIONS).toEqual({
      expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
      expectedCatalogHash: "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
      expectedCatalogRows: 377,
      expectedUserTableCount: 50
    });
    expect(hash(STAGING_CENSUS_SEMANTIC_CONTRACT)).toBe(STAGING_CENSUS_ID);
    expect(hash(STAGING_CENSUS_CONTROLLER_AUTHORITY_CONTRACT)).toBe(STAGING_CENSUS_CONTROLLER_ID);
    const firstPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt1-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const firstPredecessorHash = firstPredecessor.receiptHash;
    delete firstPredecessor.receiptHash;
    expect(hash(firstPredecessor)).toBe(firstPredecessorHash);
    const secondPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt2-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const secondPredecessorHash = secondPredecessor.receiptHash;
    delete secondPredecessor.receiptHash;
    expect(hash(secondPredecessor)).toBe(secondPredecessorHash);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v2",
      semanticQualificationId: STAGING_CENSUS_ID,
      generation: 2,
      predecessorReceiptHash: firstPredecessorHash,
      predecessorStatus: "rejected_invalid_pre_observation_persistence_before_dispatch"
    })).toBe(secondPredecessor.controllerAuthorityId);
    const thirdPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt3-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const thirdPredecessorHash = thirdPredecessor.receiptHash;
    delete thirdPredecessor.receiptHash;
    expect(hash(thirdPredecessor)).toBe(thirdPredecessorHash);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v3",
      semanticQualificationId: STAGING_CENSUS_ID,
      generation: 3,
      predecessorReceiptHash: secondPredecessorHash,
      predecessorStatus: "rejected_invalid_site_authorization_header_before_worker"
    })).toBe(thirdPredecessor.controllerAuthorityId);
    const fourthPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt4-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const fourthPredecessorHash = fourthPredecessor.receiptHash;
    delete fourthPredecessor.receiptHash;
    expect(hash(fourthPredecessor)).toBe(fourthPredecessorHash);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v4",
      semanticQualificationId: STAGING_CENSUS_ID,
      generation: 4,
      predecessorReceiptHash: thirdPredecessorHash,
      predecessorStatus: "rejected_invalid_site_authorization_value_before_worker"
    })).toBe(fourthPredecessor.controllerAuthorityId);
    const fifthPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt5-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const fifthPredecessorHash = fifthPredecessor.receiptHash;
    delete fifthPredecessor.receiptHash;
    expect(hash(fifthPredecessor)).toBe(fifthPredecessorHash);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v5",
      semanticQualificationId: STAGING_CENSUS_ID,
      generation: 5,
      predecessorReceiptHash: fourthPredecessorHash,
      predecessorStatus: "rejected_user_table_catalog_invariant_after_worker_read"
    })).toBe(fifthPredecessor.controllerAuthorityId);
    const sixthPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt6-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const sixthPredecessorHash = sixthPredecessor.receiptHash;
    delete sixthPredecessor.receiptHash;
    expect(hash(sixthPredecessor)).toBe(sixthPredecessorHash);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v6",
      semanticQualificationId: STAGING_CENSUS_ID,
      generation: 6,
      predecessorReceiptHash: fifthPredecessorHash,
      predecessorStatus: "rejected_user_table_count_mismatch_after_worker_read"
    })).toBe(sixthPredecessor.controllerAuthorityId);
    expect(STAGING_CENSUS_CONTROLLER_AUTHORITY_CONTRACT.predecessorReceiptHash)
      .toBe(sixthPredecessorHash);
    expect(createHash("sha256").update(STAGING_CENSUS_EXACT_BODY).digest("hex"))
      .toBe(STAGING_CENSUS_EXACT_BODY_SHA256);
  });

  it("always terminates with an aggregate-only matching-count diagnostic", async () => {
    const value = fixture();
    const response = await handleOs01StagingCensus(request(), value.db as never, options(value));
    expect(response.status).toBe(500);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "closed_user_table_count_match",
      expectedUserTableCount: 1,
      rawTableRowCount: 2,
      excludedInternalTableRowCount: 1,
      observedUserTableCount: 1,
      databaseMutationAttempted: false
    });
    expect(Object.keys(body).sort(compare)).toEqual([
      "censusId", "claimBoundary", "databaseMutationAttempted", "excludedInternalTableRowCount",
      "expectedUserTableCount", "observedUserTableCount", "rawTableRowCount", "receiptHash",
      "status", "version"
    ].sort(compare));
    expect(JSON.stringify(body)).not.toContain("sample_table");
    expect(JSON.stringify(body)).not.toContain("CREATE TABLE");
    expect(value.calls()).toBe(1);
  });

  it("canonicalizes catalog result order independently of the mock result order", async () => {
    const value = fixture({
      catalogBefore: [...baseCatalog].reverse(),
      catalogAfter: [...baseCatalog].reverse()
    });
    const ordered = [...baseCatalog].sort((left, right) => compare(left.type, right.type) ||
      compare(left.name, right.name) || compare(left.tbl_name, right.tbl_name));
    const response = await handleOs01StagingCensus(request(), value.db as never, {
      expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
      expectedCatalogHash: hash(ordered),
      expectedCatalogRows: ordered.length,
      expectedUserTableCount: 1
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ status: "closed_user_table_count_match" });
  });

  it("stops after one read when the exact catalog identity differs", async () => {
    const value = fixture();
    const response = await handleOs01StagingCensus(request(), value.db as never, {
      ...options(value),
      expectedCatalogHash: "0".repeat(64)
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ failureCategory: "catalog_identity_mismatch" });
    expect(value.calls()).toBe(1);
  });

  it("rejects non-exact origin, query, content type, method, and body bytes before D1", async () => {
    const value = fixture();
    const invalid = [
      request({ method: "GET" }),
      request({ origin: "https://not-the-staging-project.invalid" }),
      request({ query: "?again=true" }),
      request({ query: "#fragment" }),
      request({ contentType: "application/json; charset=utf-8" }),
      request({ body: `{ "version": "engine-os.os01-staging-census-request.v2", "censusId": "${STAGING_CENSUS_ID}" }` }),
      request({ body: `{"censusId":"${STAGING_CENSUS_ID}","version":"engine-os.os01-staging-census-request.v2"}` })
    ];
    for (const candidate of invalid) {
      expect((await handleOs01StagingCensus(candidate, value.db as never, options(value))).status)
        .not.toBe(200);
    }
    expect(value.calls()).toBe(0);
  });

  it("returns only the exact count diagnostic for 49, 50, or 51 user tables", async () => {
    for (const count of [49, 50, 51]) {
      const catalog = Array.from({ length: count }, (_, index) => ({
        type: "table",
        name: `table_${String(index).padStart(2, "0")}`,
        tbl_name: `table_${String(index).padStart(2, "0")}`,
        sql: `CREATE TABLE table_${String(index).padStart(2, "0")}(id INTEGER)`
      }));
      const value = fixture({ catalogBefore: catalog, catalogAfter: catalog });
      const response = await handleOs01StagingCensus(request(), value.db as never, {
        expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
        expectedCatalogHash: hash(catalog),
        expectedCatalogRows: catalog.length,
        expectedUserTableCount: 50
      });
      expect(response.status).toBe(500);
      const body = await response.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        version: "engine-os.os01-staging-census-table-count-diagnostic.v1",
        status: count === 50 ? "closed_user_table_count_match" : "closed_user_table_count_mismatch",
        expectedUserTableCount: 50,
        rawTableRowCount: count,
        excludedInternalTableRowCount: 0,
        observedUserTableCount: count,
        databaseMutationAttempted: false
      });
      expect(Object.keys(body).sort(compare)).toEqual([
        "censusId", "claimBoundary", "databaseMutationAttempted", "excludedInternalTableRowCount",
        "expectedUserTableCount", "observedUserTableCount", "rawTableRowCount", "receiptHash",
        "status", "version"
      ].sort(compare));
      expect(JSON.stringify(body)).not.toContain("table_00");
      expect(JSON.stringify(body)).not.toContain("CREATE TABLE");
      expect(value.calls()).toBe(1);
    }
  });

  it("does not inspect or disclose identifier and SQL details after counting", async () => {
    const cases = [
      {
        catalog: [{ type: "table", name: "bad-name", tbl_name: "bad-name", sql: "CREATE TABLE secret_name(id INTEGER)" }],
      },
      {
        catalog: [{ type: "table", name: "safe_name", tbl_name: "other_name", sql: "CREATE TABLE secret_name(id INTEGER)" }],
      },
      {
        catalog: [{ type: "table", name: "safe_name", tbl_name: "safe_name", sql: null }],
      }
    ] as const;
    for (const item of cases) {
      const value = fixture({
        catalogBefore: item.catalog as unknown as typeof baseCatalog,
        catalogAfter: item.catalog as unknown as typeof baseCatalog
      });
      const response = await handleOs01StagingCensus(request(), value.db as never, {
        expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
        expectedCatalogHash: hash(item.catalog),
        expectedCatalogRows: 1,
        expectedUserTableCount: 1
      });
      const body = await response.json() as Record<string, unknown>;
      expect(response.status).toBe(500);
      expect(body.status).toBe("closed_user_table_count_match");
      expect(Object.keys(body).sort(compare)).toEqual([
        "censusId", "claimBoundary", "databaseMutationAttempted", "excludedInternalTableRowCount",
        "expectedUserTableCount", "observedUserTableCount", "rawTableRowCount", "receiptHash",
        "status", "version"
      ].sort(compare));
      const receiptHash = body.receiptHash;
      delete body.receiptHash;
      expect(hash(body)).toBe(receiptHash);
      expect(JSON.stringify(body)).not.toContain("bad-name");
      expect(JSON.stringify(body)).not.toContain("other_name");
      expect(JSON.stringify(body)).not.toContain("secret_name");
    }
  });

  it("is deterministic but leaves durable one-shot enforcement to the controller", async () => {
    const value = fixture();
    const first = await handleOs01StagingCensus(request(), value.db as never, options(value));
    const second = await handleOs01StagingCensus(request(), value.db as never, options(value));
    expect(first.status).toBe(500);
    expect(second.status).toBe(500);
    expect(await first.text()).toBe(await second.text());
    expect(value.calls()).toBe(2);
  });

  it("fails closed above the versioned raw-table bound without returning catalog detail", async () => {
    const catalog = Array.from({ length: 1_001 }, (_, index) => ({
      type: "table",
      name: `table_${String(index).padStart(4, "0")}`,
      tbl_name: `table_${String(index).padStart(4, "0")}`,
      sql: `CREATE TABLE table_${String(index).padStart(4, "0")}(id INTEGER)`
    }));
    const value = fixture({ catalogBefore: catalog, catalogAfter: catalog });
    const response = await handleOs01StagingCensus(request(), value.db as never, {
      expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
      expectedCatalogHash: hash(catalog),
      expectedCatalogRows: catalog.length,
      expectedUserTableCount: 50
    });
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(500);
    expect(body.failureCategory).toBe("catalog_shape_invalid");
    expect(JSON.stringify(body)).not.toContain("table_1000");
    expect(body).not.toHaveProperty("detail");
    expect(Object.keys(body).sort(compare)).toEqual([
      "censusId", "claimBoundary", "databaseMutationAttempted", "failureCategory",
      "receiptHash", "status", "version"
    ].sort(compare));
  });

  it("builds a DB-only archive and declares controller-enforced invocation scope", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "os01-staging-census-test-"));
    created.push(root);
    const outDir = resolve(root, "dist");
    const result = await buildOs01StagingCensus({
      projectId: "appgprj_6a92435d1d788191b4d6bcaff0a1525d",
      outDir
    });
    const worker = readFileSync(resolve(outDir, "dist/server/index.js"), "utf8");
    const hosting = JSON.parse(readFileSync(resolve(outDir, ".openai/hosting.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(
      resolve(outDir, ".openai/os01-staging-census-package.v2.json"),
      "utf8"
    )) as Record<string, unknown>;
    expect(result.entrySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(hosting).toEqual({ project_id: "appgprj_6a92435d1d788191b4d6bcaff0a1525d", d1: "DB", r2: null });
    expect(files(outDir)).toEqual([
      ".openai/hosting.json",
      ".openai/os01-staging-census-package.v2.json",
      ".openai/os01-staging-census-package.v2.sha256",
      "dist/server/index.js"
    ]);
    expect(manifest).not.toHaveProperty("maximumRequests");
    expect(manifest.invocationControl).toMatchObject({
      mode: "controller_enforced_single_invocation",
      requestBudget: 1,
      runtimeDurableFence: false
    });
    expect(manifest).toMatchObject({
      entryPath: "dist/server/index.js",
      expectedCatalogRows: 377,
      expectedUserTableCount: 50,
      viewEvidence: "none_count_only",
      consistencyClaim: "single_validated_catalog_read_only_no_census_snapshot_claim"
    });
    expect(manifest.invocationControl).toMatchObject({
      onlyPersistableWorkerResponseStatuses: [
        "closed_user_table_count_match",
        "closed_user_table_count_mismatch"
      ],
      finalAcceptanceStatus: null,
      dispatchCompletionWritten: false,
      finalizationAllowed: false
    });
    const failureContract = manifest.failureContract as Record<string, unknown>;
    expect(failureContract).toMatchObject({
      version: "engine-os.os01-staging-census-failure.v1",
      exactAggregateOnlySchema: true,
      schemaNamesOrSqlAllowed: false,
      terminalAndNonFinalizable: true
    });
    expect(failureContract.controllerPersistableCategories).toEqual([]);
    expect(manifest.countDiagnosticContract).toMatchObject({
      version: "engine-os.os01-staging-census-table-count-diagnostic.v1",
      expectedUserTableCount: 50,
      statuses: ["closed_user_table_count_match", "closed_user_table_count_mismatch"],
      maximumRawTableRows: 1_000,
      aggregateCountsOnly: true,
      identifiersOrSqlAllowed: false,
      terminalAndNonFinalizable: true,
      fullCensusResponseAccepted: false
    });
    expect(worker).not.toMatch(/ODDS_API_KEY|ENGINE_OS_CAPTURE_ENABLED|the-odds-api\.com/u);
  });
});
