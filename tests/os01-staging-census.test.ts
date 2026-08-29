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
const LEGACY_STAGING_CENSUS_ID = "471001d7f8ad783dbabc1c03c4e7a022799466a20afba70e1eaf087a4761ec29";

type FixtureCatalogRow = { type: string; name: string; tbl_name: string; sql: string | null };

const baseCatalog: FixtureCatalogRow[] = [
  { type: "index", name: "idx_sample", tbl_name: "sample", sql: "CREATE INDEX idx_sample ON sample(id)" },
  { type: "index", name: "sqlite_autoindex_sample_1", tbl_name: "sample", sql: null },
  { type: "table", name: "d1_migrations", tbl_name: "d1_migrations", sql: "CREATE TABLE d1_migrations(id INTEGER)" },
  { type: "table", name: "sample", tbl_name: "sample", sql: "CREATE TABLE sample(id INTEGER)" },
  { type: "trigger", name: "trg_sample", tbl_name: "sample", sql: "CREATE TRIGGER trg_sample AFTER INSERT ON sample BEGIN SELECT 1; END" },
  { type: "view", name: "sample_view", tbl_name: "sample_view", sql: "CREATE VIEW sample_view AS SELECT id FROM sample" }
];

function tableCatalog(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: "table",
    name: `table_${String(index).padStart(3, "0")}`,
    tbl_name: `table_${String(index).padStart(3, "0")}`,
    sql: `CREATE TABLE table_${String(index).padStart(3, "0")}(id INTEGER)`
  }));
}

type FixtureOptions = {
  catalogBefore?: FixtureCatalogRow[];
  catalogAfter?: FixtureCatalogRow[];
  failWhen?: "catalog";
  failCatalogRead?: number;
};

function fixture(options: FixtureOptions = {}) {
  const catalogBefore = options.catalogBefore ?? baseCatalog;
  const catalogAfter = options.catalogAfter ?? catalogBefore;
  const statements: string[] = [];
  let calls = 0;
  let catalogReads = 0;
  const db = {
    prepare(sql: string) {
      calls += 1;
      statements.push(sql);
      return { sql };
    },
    async batch(prepared: Array<{ sql: string }>) {
      if (options.failWhen === "catalog") throw new Error("sensitive catalog detail");
      return prepared.map(({ sql }) => {
        if (!sql.includes("FROM sqlite_schema")) throw new Error("unexpected SQL");
        const read = catalogReads++;
        if (options.failCatalogRead === read) return { success: false, results: [] };
        return { success: true, results: read === 0 ? catalogBefore : catalogAfter };
      });
    }
  };
  return { db, catalogBefore, calls: () => calls, statements: () => [...statements] };
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

describe("OS-01 staging DDL and row census", () => {
  it("pins semantic v5, the 94-table gate, and the bridged generation-10 authority", () => {
    expect(DEFAULT_STAGING_CENSUS_OPTIONS).toEqual({
      expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
      expectedCatalogHash: "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
      expectedCatalogRows: 377,
      expectedUserTableCount: 94
    });
    expect(STAGING_CENSUS_SEMANTIC_CONTRACT.version)
      .toBe("engine-os.os01-staging-census-contract.v5");
    expect(STAGING_CENSUS_ID)
      .toBe("525370dfc8d64ef549f8c76186c2846fe97ac5beca48d3671cda25a0a0fa5f74");
    expect(STAGING_CENSUS_CONTROLLER_ID)
      .toBe("120d38a090ace807c2c220de24424a8adbf3ffe891d02867dedf0b730c1a244f");
    expect(STAGING_CENSUS_EXACT_BODY_SHA256)
      .toBe("e946e6493cf8d6e53c8013ca51d27ddc47c9168809eee9684558227eea89f00c");
    expect(hash(STAGING_CENSUS_SEMANTIC_CONTRACT)).toBe(STAGING_CENSUS_ID);
    expect(hash(STAGING_CENSUS_CONTROLLER_AUTHORITY_CONTRACT)).toBe(STAGING_CENSUS_CONTROLLER_ID);
    const firstPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt1-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const firstPredecessorHash = firstPredecessor.receiptHash;
    delete firstPredecessor.receiptHash;
    expect(hash(firstPredecessor)).toBe(firstPredecessorHash);
    expect(firstPredecessor.qualificationId).toBe(LEGACY_STAGING_CENSUS_ID);
    const secondPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt2-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const secondPredecessorHash = secondPredecessor.receiptHash;
    delete secondPredecessor.receiptHash;
    expect(hash(secondPredecessor)).toBe(secondPredecessorHash);
    expect(secondPredecessor.qualificationId).toBe(LEGACY_STAGING_CENSUS_ID);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v2",
      semanticQualificationId: LEGACY_STAGING_CENSUS_ID,
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
    expect(thirdPredecessor.qualificationId).toBe(LEGACY_STAGING_CENSUS_ID);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v3",
      semanticQualificationId: LEGACY_STAGING_CENSUS_ID,
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
    expect(fourthPredecessor.qualificationId).toBe(LEGACY_STAGING_CENSUS_ID);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v4",
      semanticQualificationId: LEGACY_STAGING_CENSUS_ID,
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
    expect(fifthPredecessor.qualificationId).toBe(LEGACY_STAGING_CENSUS_ID);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v5",
      semanticQualificationId: LEGACY_STAGING_CENSUS_ID,
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
    expect(sixthPredecessor.qualificationId).toBe(LEGACY_STAGING_CENSUS_ID);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v6",
      semanticQualificationId: LEGACY_STAGING_CENSUS_ID,
      generation: 6,
      predecessorReceiptHash: fifthPredecessorHash,
      predecessorStatus: "rejected_user_table_count_mismatch_after_worker_read"
    })).toBe(sixthPredecessor.controllerAuthorityId);
    const seventhPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt7-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const seventhPredecessorHash = seventhPredecessor.receiptHash;
    delete seventhPredecessor.receiptHash;
    expect(hash(seventhPredecessor)).toBe(seventhPredecessorHash);
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v7",
      semanticQualificationId: LEGACY_STAGING_CENSUS_ID,
      generation: 7,
      predecessorReceiptHash: sixthPredecessorHash,
      predecessorStatus: "rejected_pre_observation_timestamp_precedes_authority_before_dispatch"
    })).toBe(seventhPredecessor.controllerAuthorityId);
    expect(seventhPredecessor.qualificationId).toBe(LEGACY_STAGING_CENSUS_ID);
    const eighthPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v2-hosted-attempt8-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const eighthPredecessorHash = eighthPredecessor.receiptHash;
    delete eighthPredecessor.receiptHash;
    expect(hash(eighthPredecessor)).toBe(eighthPredecessorHash);
    expect(eighthPredecessor.qualificationId)
      .toBe("63542b54dcbb72ffb5d317004779d685cb3b32f42ce519e75beed621c894d7e1");
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v8",
      semanticQualificationId: eighthPredecessor.qualificationId,
      generation: 8,
      predecessorReceiptHash: seventhPredecessorHash,
      predecessorStatus: "rejected_expected_user_table_count_mismatch_after_count_diagnostic"
    })).toBe(eighthPredecessor.controllerAuthorityId);
    const ninthPredecessor = JSON.parse(readFileSync(resolve(
      ".planning/engine-os/execution/os-01/staging-census-v3-hosted-attempt9-rejection-receipt.v1.json"
    ), "utf8")) as Record<string, unknown>;
    const ninthPredecessorHash = ninthPredecessor.receiptHash;
    delete ninthPredecessor.receiptHash;
    expect(hash(ninthPredecessor)).toBe(ninthPredecessorHash);
    expect(ninthPredecessor.qualificationId)
      .toBe("8acabdd225af3530825d5ddd65b78fdf0735b638fb38f587fcad40efd378f06d");
    expect(hash({
      version: "engine-os.os01-staging-census-controller-authority-contract.v9",
      semanticQualificationId: ninthPredecessor.qualificationId,
      generation: 9,
      predecessorReceiptHash: eighthPredecessorHash,
      predecessorStatus: "rejected_hosted_foreign_key_read_failed"
    })).toBe(ninthPredecessor.controllerAuthorityId);
    expect(STAGING_CENSUS_CONTROLLER_AUTHORITY_CONTRACT).toEqual({
      version: "engine-os.os01-staging-census-controller-authority-contract.v10",
      semanticQualificationId: STAGING_CENSUS_ID,
      generation: 10,
      predecessorReceiptHash: ninthPredecessorHash,
      predecessorStatus: "rejected_hosted_row_count_read_failed"
    });
    expect(createHash("sha256").update(STAGING_CENSUS_EXACT_BODY).digest("hex"))
      .toBe(STAGING_CENSUS_EXACT_BODY_SHA256);
  });

  it("captures the complete self-hashed bounded DDL catalog only at the exact expected count", async () => {
    const value = fixture();
    const response = await handleOs01StagingCensus(request(), value.db as never, options(value));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.status).toBe("read_only_ddl_catalog_census_captured");
    expect(body.censusId).toBe(STAGING_CENSUS_ID);
    expect(body.userTableCount).toBe(1);
    expect(body.userObjectCount).toBe(5);
    expect(body.replayableObjectCount).toBe(4);
    expect(body.objectTypeCounts).toEqual({ table: 1, index: 2, trigger: 1, view: 1 });
    expect(body.derivedAutoIndexCount).toBe(1);
    expect(body.excludedInternalObjectCount).toBe(1);
    expect(body.firstCatalogHash).toBe(body.catalogHash);
    expect(body.secondCatalogHash).toBe(body.catalogHash);
    expect(body.catalog).toHaveLength(6);
    expect(body.objects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "index", name: "idx_sample", tblName: "sample" }),
      expect.objectContaining({ type: "table", name: "sample", tblName: "sample" }),
      expect.objectContaining({ type: "trigger", name: "trg_sample", tblName: "sample" }),
      expect.objectContaining({ type: "view", name: "sample_view", tblName: "sample_view" })
    ]));
    expect(JSON.stringify(body)).toContain("CREATE VIEW");
    expect((body.objects as Array<Record<string, unknown>>)[0]).not.toHaveProperty("foreignKeys");
    expect(body).not.toHaveProperty("foreignKeyRoot");
    expect(body.foreignKeyEvidenceWithheld).toBe(true);
    expect(body.foreignKeyEvidence).toBe(STAGING_CENSUS_SEMANTIC_CONTRACT.foreignKeyEvidence);
    expect(body.foreignKeyClaimsAccepted).toBe(false);
    expect(body.rowCountEvidenceWithheld).toBe(true);
    expect(body.rowCountEvidence).toBe(STAGING_CENSUS_SEMANTIC_CONTRACT.rowCountEvidence);
    expect(body.rowCountClaimsAccepted).toBe(false);
    expect((body.objects as Array<Record<string, unknown>>)[0]).not.toHaveProperty("rowCount");
    expect(body).not.toHaveProperty("rowCountRoot");
    expect(body.d1QueryCount).toBe(2);
    expect(body.batchCatalogPairMatch).toBe(true);
    expect(body).not.toHaveProperty("prePostRowCountsMatch");
    expect(body.snapshotClaim).toBe(STAGING_CENSUS_SEMANTIC_CONTRACT.consistencyClaim);
    expect(body.databaseMutationAttempted).toBe(false);
    expect(body.providerDispatches).toBe(0);
    const receiptHash = body.receiptHash;
    delete body.receiptHash;
    expect(hash(body)).toBe(receiptHash);
    expect(value.calls()).toBe(2);
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
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "read_only_ddl_catalog_census_captured" });
  });

  it("rejects after the fixed two-statement batch when the exact catalog identity differs", async () => {
    const value = fixture();
    const response = await handleOs01StagingCensus(request(), value.db as never, {
      ...options(value),
      expectedCatalogHash: "0".repeat(64)
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ failureCategory: "catalog_identity_mismatch" });
    expect(value.calls()).toBe(2);
  });

  it("rejects non-exact origin, query, content type, method, and body bytes before D1", async () => {
    const value = fixture();
    const invalid = [
      request({ method: "GET" }),
      request({ origin: "https://not-the-staging-project.invalid" }),
      request({ query: "?again=true" }),
      request({ query: "#fragment" }),
      request({ contentType: "application/json; charset=utf-8" }),
      request({ body: `{ "version": "engine-os.os01-staging-census-request.v4", "censusId": "${STAGING_CENSUS_ID}" }` }),
      request({ body: `{"censusId":"${STAGING_CENSUS_ID}","version":"engine-os.os01-staging-census-request.v4"}` })
    ];
    for (const candidate of invalid) {
      expect((await handleOs01StagingCensus(candidate, value.db as never, options(value))).status)
        .not.toBe(200);
    }
    expect(value.calls()).toBe(0);
  });

  it("returns only the exact mismatch diagnostic for 93 or 95 user tables", async () => {
    for (const count of [93, 95]) {
      const catalog = tableCatalog(count);
      const value = fixture({ catalogBefore: catalog, catalogAfter: catalog });
      const response = await handleOs01StagingCensus(request(), value.db as never, {
        expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
        expectedCatalogHash: hash(catalog),
        expectedCatalogRows: catalog.length,
        expectedUserTableCount: 94
      });
      expect(response.status).toBe(500);
      const body = await response.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        version: "engine-os.os01-staging-census-table-count-diagnostic.v1",
        status: "closed_user_table_count_mismatch",
        expectedUserTableCount: 94,
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
      const receiptHash = body.receiptHash;
      delete body.receiptHash;
      expect(hash(body)).toBe(receiptHash);
      expect(JSON.stringify(body)).not.toContain("table_000");
      expect(JSON.stringify(body)).not.toContain("CREATE TABLE");
      expect(value.calls()).toBe(2);
    }
  });

  it("runs the bounded DDL catalog for the 94-table gate without row-count or FK SQL", async () => {
    const catalog = tableCatalog(94);
    const value = fixture({ catalogBefore: catalog, catalogAfter: catalog });
    const response = await handleOs01StagingCensus(request(), value.db as never, {
      expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
      expectedCatalogHash: hash(catalog),
      expectedCatalogRows: catalog.length,
      expectedUserTableCount: 94
    });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "read_only_ddl_catalog_census_captured",
      censusId: STAGING_CENSUS_ID,
      catalogRows: 94,
      userTableCount: 94,
      batchCatalogPairMatch: true,
      foreignKeyEvidenceWithheld: true,
      rowCountEvidenceWithheld: true
    });
    expect(body.objects).toHaveLength(94);
    expect(body.catalog).toHaveLength(94);
    expect(JSON.stringify(body)).not.toContain("CREATE VIEW");
    const receiptHash = body.receiptHash;
    delete body.receiptHash;
    expect(hash(body)).toBe(receiptHash);
    expect(value.calls()).toBe(2);
    const statements = value.statements();
    expect(statements).toHaveLength(2);
    expect(statements.filter((sql) => sql.includes("foreign_key_list"))).toHaveLength(0);
    expect(statements.filter((sql) => sql.includes("COUNT(*)"))).toHaveLength(0);
    expect(statements.every((sql) => sql.includes("FROM sqlite_schema"))).toBe(true);
  });

  it("classifies identifier and SQL failures without returning their details", async () => {
    const cases = [
      {
        catalog: [{ type: "table", name: "bad-name", tbl_name: "bad-name", sql: "CREATE TABLE secret_name(id INTEGER)" }],
        category: "user_object_identifier_shape_invalid"
      },
      {
        catalog: [{ type: "table", name: "safe_name", tbl_name: "other_name", sql: "CREATE TABLE secret_name(id INTEGER)" }],
        category: "user_object_name_binding_invalid"
      },
      {
        catalog: [{ type: "table", name: "safe_name", tbl_name: "safe_name", sql: null }],
        category: "user_object_create_sql_missing"
      },
      {
        catalog: [{ type: "table", name: "sqlite_future", tbl_name: "sqlite_future", sql: "CREATE TABLE sqlite_future(id INTEGER)" }],
        category: "unknown_internal_object"
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
      expect(body).toMatchObject({
        status: "read_only_census_failed",
        failureCategory: item.category,
        databaseMutationAttempted: false
      });
      expect(Object.keys(body).sort(compare)).toEqual([
        "censusId", "claimBoundary", "databaseMutationAttempted", "failureCategory",
        "receiptHash", "status", "version"
      ].sort(compare));
      const receiptHash = body.receiptHash;
      delete body.receiptHash;
      expect(hash(body)).toBe(receiptHash);
      expect(JSON.stringify(body)).not.toContain("bad-name");
      expect(JSON.stringify(body)).not.toContain("other_name");
      expect(JSON.stringify(body)).not.toContain("secret_name");
    }
  });

  it("fails closed on malformed or misbound derived autoindexes", async () => {
    const table = { type: "table", name: "sample", tbl_name: "sample", sql: "CREATE TABLE sample(id INTEGER)" };
    const cases: Array<{ row: FixtureCatalogRow; category: string }> = [
      {
        row: { type: "index", name: "sqlite_autoindex_sample", tbl_name: "sample", sql: null },
        category: "derived_autoindex_shape_invalid"
      },
      {
        row: { type: "index", name: "sqlite_autoindex_sample_1", tbl_name: "sample", sql: "CREATE INDEX bad ON sample(id)" },
        category: "derived_autoindex_shape_invalid"
      },
      {
        row: { type: "index", name: "sqlite_autoindex_missing_1", tbl_name: "missing", sql: null },
        category: "user_object_name_binding_invalid"
      }
    ];
    for (const item of cases) {
      const catalog = [item.row, table].sort((left, right) => compare(left.type, right.type) ||
        compare(left.name, right.name) || compare(left.tbl_name, right.tbl_name));
      const value = fixture({ catalogBefore: catalog, catalogAfter: catalog });
      const response = await handleOs01StagingCensus(request(), value.db as never, {
        expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
        expectedCatalogHash: hash(catalog),
        expectedCatalogRows: catalog.length,
        expectedUserTableCount: 1
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ failureCategory: item.category });
      expect(value.calls()).toBe(2);
    }
  });

  it("fails closed when catalog identity changes during the two-read census", async () => {
    const changedCatalog = [
      ...baseCatalog,
      { type: "view", name: "late_view", tbl_name: "late_view", sql: "CREATE VIEW late_view AS SELECT 1" }
    ];
    const malformedCatalog = [{
      type: "table",
      name: "sensitive_malformed_table",
      tbl_name: "sensitive_malformed_table",
      sql: 7
    }] as unknown as typeof baseCatalog;
    const cases = [
      {
        value: fixture({ catalogAfter: changedCatalog }),
        category: "catalog_changed",
        calls: 2
      },
      {
        value: fixture({ failCatalogRead: 1 }),
        category: "catalog_read_failed",
        calls: 2
      },
      {
        value: fixture({ failWhen: "catalog" }),
        category: "catalog_read_failed",
        calls: 2
      },
      {
        value: fixture({ catalogBefore: malformedCatalog, catalogAfter: malformedCatalog }),
        category: "catalog_shape_invalid",
        calls: 2
      }
    ] as const;
    for (const item of cases) {
      const response = await handleOs01StagingCensus(request(), item.value.db as never, options(item.value));
      const body = await response.json() as Record<string, unknown>;
      expect(response.status).toBe(500);
      expect(body.failureCategory).toBe(item.category);
      expect(body).not.toHaveProperty("detail");
      expect(Object.keys(body).sort(compare)).toEqual([
        "censusId", "claimBoundary", "databaseMutationAttempted", "failureCategory",
        "receiptHash", "status", "version"
      ].sort(compare));
      const receiptHash = body.receiptHash;
      delete body.receiptHash;
      expect(hash(body)).toBe(receiptHash);
      expect(JSON.stringify(body)).not.toContain("late_view");
      expect(JSON.stringify(body)).not.toContain("sensitive_malformed_table");
      expect(item.value.calls()).toBe(item.calls);
    }
  });

  it("is deterministic but leaves durable one-shot enforcement to the controller", async () => {
    const value = fixture();
    const first = await handleOs01StagingCensus(request(), value.db as never, options(value));
    const second = await handleOs01StagingCensus(request(), value.db as never, options(value));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.text()).toBe(await second.text());
    expect(value.calls()).toBe(4);
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
      expectedUserTableCount: 94
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
    const secondRoot = mkdtempSync(resolve(tmpdir(), "os01-staging-census-test-"));
    created.push(root, secondRoot);
    const outDir = resolve(root, "dist");
    const secondOutDir = resolve(secondRoot, "dist");
    const result = await buildOs01StagingCensus({
      projectId: "appgprj_6a92435d1d788191b4d6bcaff0a1525d",
      outDir
    });
    const secondResult = await buildOs01StagingCensus({
      projectId: "appgprj_6a92435d1d788191b4d6bcaff0a1525d",
      outDir: secondOutDir
    });
    const workerPath = resolve(outDir, "dist/server/index.js");
    const workerBytes = readFileSync(workerPath);
    const worker = new TextDecoder().decode(workerBytes);
    const hosting = JSON.parse(readFileSync(resolve(outDir, ".openai/hosting.json"), "utf8"));
    const manifestPath = resolve(outDir, ".openai/os01-staging-ddl-only-census-package.v1.json");
    const manifestBytes = readFileSync(manifestPath);
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown>;
    expect(result.entrySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(createHash("sha256").update(workerBytes).digest("hex")).toBe(result.entrySha256);
    expect(createHash("sha256").update(manifestBytes).digest("hex")).toBe(result.manifestSha256);
    expect(result).toEqual(secondResult);
    expect(readFileSync(workerPath))
      .toEqual(readFileSync(resolve(secondOutDir, "dist/server/index.js")));
    expect(readFileSync(manifestPath))
      .toEqual(readFileSync(resolve(secondOutDir, ".openai/os01-staging-ddl-only-census-package.v1.json")));
    expect(readFileSync(resolve(outDir, ".openai/os01-staging-ddl-only-census-package.v1.sha256"), "utf8"))
      .toBe(`${result.manifestSha256}  os01-staging-ddl-only-census-package.v1.json\n`);
    expect(readFileSync(resolve(outDir, ".openai/os01-staging-ddl-only-census-package.v1.sha256")))
      .toEqual(readFileSync(resolve(secondOutDir, ".openai/os01-staging-ddl-only-census-package.v1.sha256")));
    expect(hosting).toEqual({ project_id: "appgprj_6a92435d1d788191b4d6bcaff0a1525d", d1: "DB", r2: null });
    expect(files(outDir)).toEqual([
      ".openai/hosting.json",
      ".openai/os01-staging-ddl-only-census-package.v1.json",
      ".openai/os01-staging-ddl-only-census-package.v1.sha256",
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
      expectedUserTableCount: 94,
      qualificationId: STAGING_CENSUS_ID,
      semanticContract: STAGING_CENSUS_SEMANTIC_CONTRACT,
      viewEvidence: "exact_create_sql_and_hash",
      consistencyClaim: "single_d1_batch_sequential_transactional_catalog_pair",
      wholeCatalogEvidence: "exact_canonical_sqlite_schema_projection_plus_independent_batch_pair_hashes",
      replayableObjectEvidence: "exact_non_internal_sql_bearing_sqlite_schema_projection_and_hashes",
      derivedAutoIndexEvidence: "five_field_null_sql_sqlite_autoindex_and_user_table_binding"
    });
    expect(manifest.invocationControl).toMatchObject({
      onlyPersistableWorkerResponseStatuses: [
        "read_only_ddl_catalog_census_captured",
        "closed_user_table_count_mismatch"
      ],
      controllerAuthorityId: STAGING_CENSUS_CONTROLLER_ID,
      finalAcceptanceStatus: "accepted_bounded_read_only_ddl_catalog_census_after_control_plane_postcheck",
      dispatchCompletionWrittenForBoundedDdlCatalogCensus: true,
      finalizationAllowedForBoundedDdlCatalogCensus: true,
      countDiagnosticFinalizationAllowed: false
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
      expectedUserTableCount: 94,
      statuses: ["closed_user_table_count_mismatch"],
      maximumRawTableRows: 1_000,
      aggregateCountsOnly: true,
      identifiersOrSqlAllowed: false,
      terminalAndNonFinalizable: true,
      matchingCountProducesBoundedDdlCatalogCensus: true
    });
    expect(manifest.foreignKeyEvidence).toBe(
      "withheld_pending_independent_offline_ddl_replay_and_generation_11"
    );
    expect(manifest.rowCountEvidence).toBe("withheld_pending_deterministic_sharded_capture");
    expect(manifest.boundedDdlCatalogCensusContract).toEqual({
      version: STAGING_CENSUS_SEMANTIC_CONTRACT.responseVersion,
      status: "read_only_ddl_catalog_census_captured",
      expectedUserTableCount: 94,
      maximumD1QueriesPerInvocation: 2,
      queryPlan: [
        "catalog_batch_statement_1",
        "catalog_batch_statement_2"
      ],
      exactCanonicalCatalogProjectionRequired: true,
      independentlyHashedCatalogPairRequired: true,
      singleTransactionalBatchRequired: true,
      replayableObjectsRequired: ["table", "index", "trigger", "view"],
      identifiersAndCreateSqlAllowed: true,
      viewSqlAllowed: true,
      derivedAutoIndexesSeparated: true,
      excludedInternalObjectsSeparated: true,
      wholeCatalogAndPerTypeRootsRequired: true,
      exhaustivePartitionEquation:
        "catalogRows=replayableObjectCount+derivedAutoIndexCount+excludedInternalObjectCount",
      foreignKeyEvidenceWithheld: true,
      foreignKeyFieldsAllowed: false,
      rowCountEvidenceWithheld: true,
      rowCountFieldsAllowed: false,
      batchCatalogPairRequired: true,
      controllerValidationRequired: true,
      controlPlanePostcheckRequired: true,
      claimBoundary: "bounded_ddl_catalog_evidence_not_full_schema_or_os01_acceptance"
    });
    expect((manifest.request as Record<string, unknown>).exactBodySha256)
      .toBe(STAGING_CENSUS_EXACT_BODY_SHA256);
    expect(worker).toContain("read_only_ddl_catalog_census_captured");
    for (const prohibited of [
      "pragma_foreign_key_list",
      "foreignKeyRoot",
      "foreignKeys",
      '"foreign_key_read_failed"',
      "read_only_schema_census_captured",
      "COUNT(*)",
      "rowCountRoot",
      '"rowCount"',
      '"row_count_read_failed"',
      "prePostRowCountsMatch",
      "read_only_ddl_row_census_captured"
    ]) expect(worker).not.toContain(prohibited);
    expect(worker).toContain("closed_user_table_count_mismatch");
    expect(worker).not.toMatch(/ODDS_API_KEY|ENGINE_OS_CAPTURE_ENABLED|the-odds-api\.com/u);
  });
});
