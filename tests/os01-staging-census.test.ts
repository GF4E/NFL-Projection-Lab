import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { handleOs01StagingCensus } from "../qualification/os01-staging-census/entry";
import { buildOs01StagingCensus } from "../scripts/build_os01_staging_census";

const created: string[] = [];
afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true });
});

const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) :
  value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)])) : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

function fixture() {
  const catalog = [
    { type: "index", name: "idx_sample", tbl_name: "sample", sql: "CREATE INDEX idx_sample ON sample(id)" },
    { type: "table", name: "d1_migrations", tbl_name: "d1_migrations", sql: "CREATE TABLE d1_migrations(id INTEGER)" },
    { type: "table", name: "sample", tbl_name: "sample", sql: "CREATE TABLE sample(id INTEGER)" }
  ];
  let calls = 0;
  const db = {
    prepare(sql: string) {
      calls += 1;
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
  return { db, catalog, calls: () => calls };
}

const validBody = {
  version: "engine-os.os01-staging-census-request.v1",
  censusId: "e1f160c7b5c53d59896bccd269caaebd95113190670fabe325ac336ce3b7d4c6"
};

function request(body: unknown, method = "POST") {
  return new Request("https://staging.invalid/__engine-os/os01-staging-census/v1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined
  });
}

describe("OS-01 staging DDL census", () => {
  it("captures DDL, foreign keys, and counts without a mutation API", async () => {
    const value = fixture();
    const response = await handleOs01StagingCensus(request(validBody), value.db as never, {
      expectedCatalogHash: hash(value.catalog),
      expectedCatalogRows: value.catalog.length
    });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.status).toBe("read_only_schema_census_captured");
    expect(body.userTableCount).toBe(1);
    expect(body.databaseMutationAttempted).toBe(false);
    expect(body.providerDispatches).toBe(0);
    expect(value.calls()).toBe(3);
  });

  it("stops after one read when the exact catalog identity differs", async () => {
    const value = fixture();
    const response = await handleOs01StagingCensus(request(validBody), value.db as never, {
      expectedCatalogHash: "0".repeat(64),
      expectedCatalogRows: value.catalog.length
    });
    expect(response.status).toBe(409);
    expect(value.calls()).toBe(1);
  });

  it("rejects every request shape except the exact POST body before D1", async () => {
    const value = fixture();
    expect((await handleOs01StagingCensus(request(validBody, "GET"), value.db as never)).status).toBe(405);
    expect((await handleOs01StagingCensus(request({ ...validBody, extra: true }), value.db as never)).status)
      .toBe(400);
    expect(value.calls()).toBe(0);
  });

  it("builds a DB-only no-migration archive payload", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "os01-staging-census-test-"));
    created.push(root);
    const result = await buildOs01StagingCensus({
      projectId: "appgprj_6a92435d1d788191b4d6bcaff0a1525d",
      outDir: resolve(root, "dist")
    });
    const worker = readFileSync(resolve(root, "dist/server/index.js"), "utf8");
    const hosting = JSON.parse(readFileSync(resolve(root, "dist/.openai/hosting.json"), "utf8"));
    expect(result.entrySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(hosting).toEqual({ project_id: "appgprj_6a92435d1d788191b4d6bcaff0a1525d", d1: "DB", r2: null });
    expect(worker).not.toMatch(/ODDS_API_KEY|ENGINE_OS_CAPTURE_ENABLED|the-odds-api\.com/u);
  });
});
