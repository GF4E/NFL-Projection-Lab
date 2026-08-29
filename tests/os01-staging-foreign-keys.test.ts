import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  OS01_STAGING_FOREIGN_KEY_CANDIDATES,
  OS01_STAGING_FOREIGN_KEYS_EXACT_BODY,
  OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256,
  OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
  OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-foreign-keys/contract";
import {
  handleOs01StagingForeignKeys,
  os01StagingForeignKeysTestOnly
} from "../qualification/os01-staging-foreign-keys/entry";

type BatchResult = { success: true; results: Array<Record<string, unknown>> };
type Prepared = { sql: string };

const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

function hostedResponse(): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(
    ".planning/engine-os/execution/os-01/generation10-hosted-authority-v1/response.json"
  ), "utf8")) as Record<string, unknown>;
}

function replayResults(): Map<string, Array<Record<string, unknown>>> {
  const response = hostedResponse();
  const objects = response.objects as Array<{ type: string; name: string; tblName: string; createSql: string }>;
  const priority: Record<string, number> = { table: 0, view: 1, index: 2, trigger: 3 };
  const ordered = [...objects].sort((left, right) =>
    (priority[left.type] ?? 99) - (priority[right.type] ?? 99) ||
    left.name.localeCompare(right.name) || left.tblName.localeCompare(right.tblName));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE");
    for (const object of ordered) database.exec(object.createSql);
    database.exec("COMMIT");
    return new Map(OS01_STAGING_FOREIGN_KEY_CANDIDATES.map((candidate) => [
      candidate.sourceTable,
      database.prepare(`PRAGMA foreign_key_list("${candidate.sourceTable}")`).all() as Array<Record<string, unknown>>
    ]));
  } finally {
    database.close();
  }
}

function mockDatabase(mutate?: (
  sql: string,
  ordinal: number,
  result: BatchResult
) => BatchResult): { db: { prepare(sql: string): Prepared; batch(values: Prepared[]): Promise<BatchResult[]> }; calls: string[][] } {
  const catalog = hostedResponse().catalog as Array<Record<string, unknown>>;
  const foreignKeys = replayResults();
  const calls: string[][] = [];
  return {
    calls,
    db: {
      prepare(sql: string) { return { sql }; },
      async batch(values: Prepared[]) {
        calls.push(values.map((value) => value.sql));
        return values.map((value, ordinal) => {
          const match = /^PRAGMA foreign_key_list\("([A-Za-z0-9_]+)"\)$/u.exec(value.sql);
          const result: BatchResult = {
            success: true,
            results: match ? structuredClone(foreignKeys.get(match[1]!) ?? []) : structuredClone(catalog)
          };
          return mutate ? mutate(value.sql, ordinal, result) : result;
        });
      }
    }
  };
}

function request(input: Partial<{ method: string; body: string; url: string; contentType: string }> = {}): Request {
  return new Request(input.url ?? OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin +
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route, {
    method: input.method ?? "POST",
    headers: { "content-type": input.contentType ?? "application/json" },
    body: input.method === "GET" ? undefined : input.body ?? OS01_STAGING_FOREIGN_KEYS_EXACT_BODY
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("OS-01 Generation 11 isolated foreign-key worker", () => {
  it("binds the frozen replay, candidate set, and exact 30-statement plan", async () => {
    expect(OS01_STAGING_FOREIGN_KEY_CANDIDATES).toHaveLength(28);
    expect(sha256(canonicalJson(OS01_STAGING_FOREIGN_KEY_CANDIDATES)))
      .toBe(OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot);
    expect(os01StagingForeignKeysTestOnly.statements()).toHaveLength(30);
    expect(sha256(canonicalJson(os01StagingForeignKeysTestOnly.statements())))
      .toBe(OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementArrayRoot);
    const plan = await Promise.all(os01StagingForeignKeysTestOnly.statements().map(async (sql, ordinal, all) => ({
      ordinal,
      kind: ordinal === 0 || ordinal === all.length - 1 ? "catalog" : "foreign_key_list",
      sourceTable: ordinal === 0 || ordinal === all.length - 1
        ? null
        : OS01_STAGING_FOREIGN_KEY_CANDIDATES[ordinal - 1]?.sourceTable ?? null,
      sqlSha256: sha256(sql)
    })));
    expect(sha256(canonicalJson(plan))).toBe(OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementPlanRoot);
    expect(sha256(OS01_STAGING_FOREIGN_KEYS_EXACT_BODY)).toBe(OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256);
    expect(OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.predecessor).toEqual({
      hostedControllerAuthorityId: "379588dc6e7ed0e7445e2fe78788b3f7143a4947ad524c066191cdd336a002aa",
      hostedResponseBytesSha256: "3fdcac828cad28ab70e274565856141a50ac5382964e04bb0047ace2854fb032",
      hostedResponseReceiptHash: "c62008d294736799865622c360ac7e581636f7f6472f5dc4efe75ee6a8b7f3a6",
      hostedFinalReceiptBytesSha256: "9253a4802a777f5a1b26fbbe1987382cf2db398f4f7d3c1c619588db15e4ec80",
      hostedFinalReceiptHash: "72e7232ae1f3abae8810976bebf2330ce5da13060a37fb0d8d16559e75618bc8",
      offlineReplaySourceCommit: "ee179832f2093037f8db6c3ff384305494f6dd77",
      offlineReplaySourceTree: "697fe233a9a120869055bbb7286e6aa3c1891cdb",
      offlineReplayReceiptBytesSha256: "338502edae051d087b324135682f0558a3efb704d0cab4f95b27dff32f1cab76",
      offlineReplayReceiptHash: "50021d5310782e4d9f0cbece4882bfa950fe189e2e123255e50ae388221bc3e4"
    });
  });

  it("captures all normalized foreign keys in one read-only batch", async () => {
    const value = mockDatabase();
    const response = await handleOs01StagingForeignKeys(request(), value.db as never);
    const body = await responseBody(response);
    expect(response.status).toBe(200);
    expect(value.calls).toHaveLength(1);
    expect(value.calls[0]).toEqual(os01StagingForeignKeysTestOnly.statements());
    expect(body).toMatchObject({
      version: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.responseVersion,
      status: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.responseStatus,
      qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
      catalogRows: 377,
      catalogHash: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedCatalogHash,
      candidateCount: 28,
      foreignKeyConstraintCount: 51,
      foreignKeyColumnRowCount: 54,
      normalizedForeignKeyRoot: "bad8738dceb23141a6781540308bbd7d287ce8d7f5119913b7f3986e7e724622",
      foreignKeyClaimsAccepted: true,
      rowCountEvidenceWithheld: true,
      databaseMutationAttempted: false,
      providerSecretReads: 0,
      providerDispatches: 0,
      quotaReservations: 0,
      captureActivations: 0,
      productionReads: 0,
      productionMutations: 0
    });
    const unhashed = { ...body };
    delete unhashed.receiptHash;
    expect(body.receiptHash).toBe(sha256(canonicalJson(unhashed)));
  });

  it("is deterministic for duplicate local invocations", async () => {
    const first = await responseBody(await handleOs01StagingForeignKeys(request(), mockDatabase().db as never));
    const second = await responseBody(await handleOs01StagingForeignKeys(request(), mockDatabase().db as never));
    expect(second).toEqual(first);
  });

  it("rejects request drift before touching D1", async () => {
    for (const candidate of [
      request({ method: "GET" }),
      request({ body: "{}" }),
      request({ url: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin + "/wrong" }),
      request({ url: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.origin +
        OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.route + "?x=1" }),
      request({ contentType: "application/json; charset=utf-8" })
    ]) {
      const value = mockDatabase();
      const response = await handleOs01StagingForeignKeys(candidate, value.db as never);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(value.calls).toHaveLength(0);
    }
  });

  it("fails closed when either catalog identity differs", async () => {
    const first = mockDatabase((_sql, ordinal, result) => {
      if (ordinal === 0) result.results = result.results.slice(1);
      return result;
    });
    expect((await handleOs01StagingForeignKeys(request(), first.db as never)).status).toBe(500);
    const second = mockDatabase((_sql, ordinal, result) => {
      if (ordinal === 29) result.results = result.results.slice(1);
      return result;
    });
    const body = await responseBody(await handleOs01StagingForeignKeys(request(), second.db as never));
    expect(body.failureCategory).toBe("catalog_changed");
  });

  it("fails closed on candidate SQL drift at the whole-catalog identity boundary", async () => {
    const value = mockDatabase((_sql, ordinal, result) => {
      if (ordinal === 0 || ordinal === 29) {
        const row = result.results.find((item) => item.name === "canonical_games");
        if (row) row.sql = String(row.sql) + " ";
      }
      return result;
    });
    const body = await responseBody(await handleOs01StagingForeignKeys(request(), value.db as never));
    expect(body.failureCategory).toBe("catalog_identity_mismatch");
  });

  it("fails closed on extra row keys, negative ordinals, action drift, and group gaps", async () => {
    const mutations: Array<(row: Record<string, unknown>) => void> = [
      (row) => { row.extra = true; },
      (row) => { row.seq = -1; },
      (row) => { row.on_delete = "INVALID"; },
      (row) => { row.seq = 2; }
    ];
    for (const mutate of mutations) {
      let changed = false;
      const value = mockDatabase((_sql, ordinal, result) => {
        if (!changed && ordinal > 0 && ordinal < 29 && result.results[0]) {
          mutate(result.results[0]);
          changed = true;
        }
        return result;
      });
      const response = await handleOs01StagingForeignKeys(request(), value.db as never);
      expect(response.status).toBe(500);
    }
  });

  it("normalizes away raw FK id renumbering while preserving duplicate semantic constraints", () => {
    const base = [
      { id: 7, seq: 1, table: "parent", from: "b", to: "b", on_update: "CASCADE", on_delete: "RESTRICT", match: "NONE" },
      { id: 7, seq: 0, table: "parent", from: "a", to: "a", on_update: "CASCADE", on_delete: "RESTRICT", match: "NONE" },
      { id: 12, seq: 0, table: "parent", from: "c", to: "c", on_update: "NO ACTION", on_delete: "NO ACTION", match: "NONE" }
    ];
    const renumbered = base.map((row) => ({ ...row, id: row.id === 7 ? 2 : 99 })).reverse();
    const first = os01StagingForeignKeysTestOnly.normalizeForeignKeyRows("child", {
      success: true, results: base
    });
    const second = os01StagingForeignKeysTestOnly.normalizeForeignKeyRows("child", {
      success: true, results: renumbered
    });
    expect(canonicalJson(first.normalizedConstraints)).toBe(canonicalJson(second.normalizedConstraints));
    const duplicate = os01StagingForeignKeysTestOnly.normalizeForeignKeyRows("child", {
      success: true,
      results: [base[1], { ...base[1], id: 44 }]
    });
    expect(duplicate.normalizedConstraints).toHaveLength(2);
    expect(canonicalJson(duplicate.normalizedConstraints[0]))
      .toBe(canonicalJson(duplicate.normalizedConstraints[1]));
  });

  it("distinguishes count drift from same-count normalized-root drift", async () => {
    let removed = false;
    const count = mockDatabase((_sql, ordinal, result) => {
      if (!removed && ordinal > 0 && ordinal < 29 && result.results.length > 0) {
        result.results.pop();
        removed = true;
      }
      return result;
    });
    expect((await responseBody(await handleOs01StagingForeignKeys(request(), count.db as never))).failureCategory)
      .toBe("foreign_key_count_mismatch");

    let changed = false;
    const root = mockDatabase((_sql, ordinal, result) => {
      if (!changed && ordinal > 0 && ordinal < 29 && result.results[0]) {
        result.results[0].from = String(result.results[0].from) + "_drift";
        changed = true;
      }
      return result;
    });
    expect((await responseBody(await handleOs01StagingForeignKeys(request(), root.db as never))).failureCategory)
      .toBe("foreign_key_root_mismatch");
  });

  it("maps D1 failures to the closed failure vocabulary", async () => {
    const db = {
      prepare(sql: string) { return { sql }; },
      async batch() { throw new Error("fixture failure"); }
    };
    const response = await handleOs01StagingForeignKeys(request(), db as never);
    const body = await responseBody(response);
    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      version: "engine-os.os01-staging-foreign-keys-failure.v1",
      status: "read_only_foreign_key_capture_failed",
      failureCategory: "batch_read_failed",
      databaseMutationAttempted: false
    });
  });
});
