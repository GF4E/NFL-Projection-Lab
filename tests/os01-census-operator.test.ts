import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

import {
  handleOs01CensusRequest,
  os01CensusContract
} from "../worker/os01-census-operator";

type SqlValue = string | number | bigint | Uint8Array | null;

const token = "a".repeat(64);
const authSha256 = createHash("sha256").update(token).digest("hex");
const buildAttestation = "b".repeat(64);
const control = {
  authSha256,
  buildAttestation,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
};
const runtimeIdentity = { sourceAnchor: buildAttestation, ready: true };

function sqliteD1(sqlite: DatabaseSync): D1Database {
  let bookmarkSequence = 0;

  function session() {
    let bookmark: string | null = null;
    function prepare(sql: string) {
      let parameters: SqlValue[] = [];
      return {
        bind(...values: unknown[]) {
          parameters = values as SqlValue[];
          return this;
        },
        async all<T>() {
          const rows = sqlite.prepare(sql).all(...parameters) as T[];
          bookmark = `bookmark-${++bookmarkSequence}`;
          return {
            success: true as const,
            results: rows,
            meta: {
              duration: 0,
              size_after: 0,
              rows_read: rows.length,
              rows_written: 0,
              last_row_id: 0,
              changed_db: false,
              changes: 0
            }
          };
        },
        async first<T>() {
          const row = sqlite.prepare(sql).get(...parameters) as T | undefined;
          bookmark = `bookmark-${++bookmarkSequence}`;
          return row ?? null;
        },
        async run() {
          throw new Error("run must not be called");
        },
        async raw() {
          throw new Error("raw must not be called");
        }
      };
    }
    return {
      prepare,
      async batch() {
        throw new Error("batch must not be called");
      },
      getBookmark() {
        return bookmark;
      }
    } as unknown as D1DatabaseSession;
  }

  return {
    prepare() {
      throw new Error("database.prepare must not be called outside a session");
    },
    async batch() {
      throw new Error("batch must not be called");
    },
    async exec() {
      throw new Error("exec must not be called");
    },
    withSession() {
      return session();
    },
    async dump() {
      throw new Error("dump must not be called");
    }
  } as unknown as D1Database;
}

function database(): { sqlite: DatabaseSync; d1: D1Database } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE sample (
      id INTEGER NOT NULL,
      nullable TEXT,
      real_value REAL,
      text_value TEXT,
      blob_value BLOB
    );
    CREATE INDEX sample_id_index ON sample (id);
    CREATE TRIGGER sample_no_update BEFORE UPDATE ON sample BEGIN SELECT RAISE(ABORT, 'append-only'); END;
    CREATE VIEW sample_view AS SELECT id FROM sample;
    CREATE TABLE engine_schema_versions (version TEXT PRIMARY KEY, migration_hash TEXT NOT NULL, applied_at TEXT NOT NULL);
    CREATE TABLE odds_quota_state (provider TEXT PRIMARY KEY, used INTEGER NOT NULL, remaining INTEGER NOT NULL, last_cost INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE odds_quota_reservations (request_key TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE odds_quota_reservation_events (event_id TEXT PRIMARY KEY);
    INSERT INTO sample VALUES
      (1, NULL, 1.25, 'DO_NOT_EXPOSE_SENTINEL', X'00FF'),
      (1, NULL, 1.25, 'DO_NOT_EXPOSE_SENTINEL', X'00FF'),
      (2, 'present', -0.0, 'snowman ☃', X'');
    INSERT INTO engine_schema_versions VALUES ('0016_engine_os_interim_scheduler', 'sha256:test', '2026-08-01T00:00:00Z');
    INSERT INTO odds_quota_state VALUES ('the-odds-api', 38, 462, 0, '2026-08-01T00:00:00Z');
  `);
  for (let index = 0; index < 55; index += 1) sqlite.exec(`CREATE TABLE extra_${index} (id INTEGER)`);
  return { sqlite, d1: sqliteD1(sqlite) };
}

async function invoke(
  d1: D1Database,
  body: Record<string, unknown>,
  authorization = `Bearer ${token}`,
  bindings = control
): Promise<{ response: Response; json: Record<string, unknown> }> {
  const response = await handleOs01CensusRequest(
    new Request(`https://example.test${os01CensusContract.route}`, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(body)
    }),
    bindings,
    () => d1,
    runtimeIdentity
  );
  return { response, json: await response.json() as Record<string, unknown> };
}

function continuation(json: Record<string, unknown>): string {
  expect(json.continuation).toEqual(expect.any(String));
  return String(json.continuation);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function protectedPayload(json: Record<string, unknown>): Record<string, unknown> {
  const protectedFields = { ...json };
  delete protectedFields.continuation;
  delete protectedFields.payloadHash;
  delete protectedFields.payloadMac;
  return protectedFields;
}

function payloadHash(value: Record<string, unknown>): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function payloadMac(value: Record<string, unknown>): string {
  const material = createHash("sha256")
    .update(`${os01CensusContract.version}\u0000payload-mac\u0000${token}`)
    .digest();
  return createHmac("sha256", material).update(stableJson(value)).digest("hex");
}

function expectValidEnvelope(json: Record<string, unknown>): void {
  const protectedFields = protectedPayload(json);
  expect(json.payloadHash).toBe(payloadHash(protectedFields));
  expect(json.payloadMac).toBe(payloadMac(protectedFields));
}

function expectRehashedMutationFailsMac(
  original: Record<string, unknown>,
  mutate: (value: Record<string, unknown>) => void
): void {
  const changed = structuredClone(protectedPayload(original));
  mutate(changed);
  const recomputedHash = payloadHash(changed);
  expect(recomputedHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(recomputedHash).not.toBe(original.payloadHash);
  expect(payloadMac(changed)).not.toBe(original.payloadMac);
}

describe("OS-01 production census operator", () => {
  it("authenticates and expires before database access", async () => {
    const resolver = vi.fn(() => {
      throw new Error("database must not be touched");
    });
    for (const [authorization, bindings] of [
      [undefined, control],
      ["Bearer " + "b".repeat(64), control],
      [`Bearer ${token}`, { ...control, buildAttestation: "f".repeat(64) }],
      [`Bearer ${token}`, { ...control, expiresAt: "2000-01-01T00:00:00.000Z" }],
      [`Bearer ${token}`, { ...control, expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() }]
    ] as const) {
      const headers = authorization ? { authorization } : undefined;
      const response = await handleOs01CensusRequest(
        new Request(`https://example.test${os01CensusContract.route}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ operation: "begin", passNonce: "f".repeat(32) })
        }),
        bindings,
        resolver,
        runtimeIdentity
      );
      expect(response.status).toBe(404);
    }
    expect(resolver).not.toHaveBeenCalled();
  });

  it("keeps the compiled placeholder build fail-closed", async () => {
    const resolver = vi.fn(() => {
      throw new Error("database must not be touched");
    });
    const response = await handleOs01CensusRequest(
      new Request(`https://example.test${os01CensusContract.route}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ operation: "begin", passNonce: "a".repeat(32) })
      }),
      control,
      resolver
    );
    expect(response.status).toBe(404);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("enumerates the complete catalog beyond a 50-object projection", async () => {
    const { d1 } = database();
    const { response, json } = await invoke(d1, {
      operation: "begin",
      passNonce: "1".repeat(32)
    });
    expect(response.status).toBe(200);
    expect(json.buildAttestation).toBe(buildAttestation);
    expect(json.payloadMac).toMatch(/^[a-f0-9]{64}$/u);
    const payload = json.payload as { catalog: Array<{ name: string }> };
    expect(payload.catalog.length).toBeGreaterThan(50);
    expect(payload.catalog.some((entry) => entry.name === "sample")).toBe(true);
    expect(payload.catalog.some((entry) => entry.name === "sample_view")).toBe(true);
    expect(JSON.stringify(json)).not.toContain("CREATE TABLE");
    expect(json.queryStats).toMatchObject({ rowsWritten: 0, changes: 0, changedDb: false });
  });

  it("hashes schema and every SQLite cell type without returning row values", async () => {
    const { d1 } = database();
    const begin = await invoke(d1, { operation: "begin", passNonce: "2".repeat(32) });
    const schema = await invoke(d1, {
      operation: "schema_object",
      continuation: continuation(begin.json),
      type: "table",
      name: "sample"
    });
    expect(schema.response.status).toBe(200);
    expect((schema.json.payload as { semanticHash: string }).semanticHash).toMatch(/^[a-f0-9]{64}$/u);

    const start = await invoke(d1, {
      operation: "table_start",
      continuation: continuation(schema.json),
      table: "sample"
    });
    const startPayload = start.json.payload as { columnsHash: string; rowCount: number };
    expect(startPayload.rowCount).toBe(3);
    const page = await invoke(d1, {
      operation: "table_page",
      continuation: continuation(start.json),
      table: "sample",
      columnsHash: startPayload.columnsHash,
      offset: 0,
      limit: 128
    });
    expect(page.response.status).toBe(200);
    expect(page.json.payload).toMatchObject({ rowCount: 3, done: true });
    const pagePayload = page.json.payload as { pageHash: string; rowHashes: string[] };
    expect(pagePayload.pageHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(pagePayload.rowHashes).toHaveLength(3);
    expect(pagePayload.rowHashes.every((value) => /^[a-f0-9]{64}$/u.test(value))).toBe(true);
    const serialized = JSON.stringify(page.json);
    expect(serialized).not.toContain("DO_NOT_EXPOSE_SENTINEL");
    expect(serialized).not.toContain("snowman");
    expect(serialized).not.toContain("00FF");

    const finish = await invoke(d1, {
      operation: "table_finish",
      continuation: continuation(page.json),
      table: "sample",
      columnsHash: startPayload.columnsHash
    });
    expect(finish.json.payload).toMatchObject({ rowCount: 3, columnsHash: startPayload.columnsHash });
  });

  it("binds request, continuation, sequence, table, offset, and page evidence into the HMAC", async () => {
    const { d1 } = database();
    const begin = await invoke(d1, { operation: "begin", passNonce: "a".repeat(32) });
    expectValidEnvelope(begin.json);
    const start = await invoke(d1, {
      operation: "table_start",
      continuation: continuation(begin.json),
      table: "sample"
    });
    const columnsHash = String((start.json.payload as Record<string, unknown>).columnsHash);
    const pageRequest = {
      operation: "table_page",
      continuation: continuation(start.json),
      table: "sample",
      columnsHash,
      offset: 0,
      limit: 2
    };
    const page = await invoke(d1, pageRequest);
    expectValidEnvelope(page.json);
    expect(page.json.requestHash).toBe(createHash("sha256").update(stableJson(pageRequest)).digest("hex"));

    expectRehashedMutationFailsMac(page.json, (value) => {
      value.requestHash = "0".repeat(64);
    });
    expectRehashedMutationFailsMac(page.json, (value) => {
      value.continuationHash = "0".repeat(64);
    });
    expectRehashedMutationFailsMac(page.json, (value) => {
      value.sequence = Number(value.sequence) + 1;
    });
    expectRehashedMutationFailsMac(page.json, (value) => {
      (value.payload as Record<string, unknown>).table = "other_table";
    });
    expectRehashedMutationFailsMac(page.json, (value) => {
      (value.payload as Record<string, unknown>).offset = 1;
    });
    expectRehashedMutationFailsMac(page.json, (value) => {
      (value.payload as Record<string, unknown>).pageHash = "0".repeat(64);
    });

    const changedContinuation = structuredClone(page.json);
    changedContinuation.continuation = `${String(page.json.continuation)}x`;
    const changedProtected = protectedPayload(changedContinuation);
    changedProtected.continuationHash = createHash("sha256")
      .update(String(changedContinuation.continuation))
      .digest("hex");
    changedContinuation.payloadHash = payloadHash(changedProtected);
    expect(payloadMac(changedProtected)).not.toBe(page.json.payloadMac);
  });

  it("rejects coercible or out-of-range page coordinates", async () => {
    const { d1 } = database();
    const begin = await invoke(d1, { operation: "begin", passNonce: "b".repeat(32) });
    const start = await invoke(d1, {
      operation: "table_start",
      continuation: continuation(begin.json),
      table: "sample"
    });
    const columnsHash = String((start.json.payload as Record<string, unknown>).columnsHash);
    const base = {
      operation: "table_page",
      continuation: continuation(start.json),
      table: "sample",
      columnsHash
    };
    for (const offset of [-1, 0.5, "0", Number.MAX_SAFE_INTEGER + 1]) {
      const result = await invoke(d1, { ...base, offset });
      expect(result.response.status).toBe(400);
      expect(result.json).toEqual({ error: "invalid_offset" });
    }
    for (const limit of [0, 129, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
      const result = await invoke(d1, { ...base, offset: 0, limit });
      expect(result.response.status).toBe(400);
      expect(result.json).toEqual({ error: "invalid_limit" });
    }
  });

  it("fails closed when one canonical row or aggregate page exceeds its byte boundary", async () => {
    const { sqlite, d1 } = database();
    sqlite.exec("CREATE TABLE oversized_rows (id INTEGER NOT NULL, payload BLOB NOT NULL)");
    sqlite.prepare("INSERT INTO oversized_rows VALUES (?, ?)")
      .run(1, new Uint8Array(900_001));
    let begin = await invoke(d1, { operation: "begin", passNonce: "c".repeat(32) });
    let start = await invoke(d1, {
      operation: "table_start",
      continuation: continuation(begin.json),
      table: "oversized_rows"
    });
    let result = await invoke(d1, {
      operation: "table_page",
      continuation: continuation(start.json),
      table: "oversized_rows",
      columnsHash: String((start.json.payload as Record<string, unknown>).columnsHash),
      offset: 0,
      limit: 1
    });
    expect(result.response.status).toBe(413);
    expect(result.json).toEqual({ error: "canonical_row_too_large" });

    sqlite.exec("DELETE FROM oversized_rows");
    const insert = sqlite.prepare("INSERT INTO oversized_rows VALUES (?, ?)");
    insert.run(1, new Uint8Array(500_000));
    insert.run(2, new Uint8Array(500_000));
    begin = await invoke(d1, { operation: "begin", passNonce: "d".repeat(32) });
    start = await invoke(d1, {
      operation: "table_start",
      continuation: continuation(begin.json),
      table: "oversized_rows"
    });
    result = await invoke(d1, {
      operation: "table_page",
      continuation: continuation(start.json),
      table: "oversized_rows",
      columnsHash: String((start.json.payload as Record<string, unknown>).columnsHash),
      offset: 0,
      limit: 2
    });
    expect(result.response.status).toBe(413);
    expect(result.json).toEqual({ error: "canonical_page_too_large" });
  });

  it("bounds success responses even when the read-only catalog is unexpectedly huge", async () => {
    const hugeCatalog = Array.from({ length: 20_000 }, (_, index) => ({
      type: "table",
      name: `table_${index.toString().padStart(5, "0")}_${"x".repeat(100)}`,
      tbl_name: `table_${index.toString().padStart(5, "0")}_${"x".repeat(100)}`,
      sql: null
    }));
    const session = {
      prepare(sql: string) {
        return {
          async all() {
            const results = sql.includes("pragma_schema_version")
              ? [{ schema_version: 1 }]
              : hugeCatalog;
            return {
              success: true,
              results,
              meta: {
                duration: 0,
                size_after: 0,
                rows_read: results.length,
                rows_written: 0,
                last_row_id: 0,
                changed_db: false,
                changes: 0
              }
            };
          }
        };
      },
      getBookmark() { return "bookmark-huge"; }
    } as unknown as D1DatabaseSession;
    const d1 = { withSession: () => session } as unknown as D1Database;
    const result = await invoke(d1, { operation: "begin", passNonce: "e".repeat(32) });
    expect(result.response.status).toBe(413);
    expect(result.json).toEqual({ error: "response_too_large" });
  });

  it("reports SQLite autoindexes with their owning table, null SQL, and the empty-SQL hash", async () => {
    const { d1 } = database();
    const begin = await invoke(d1, { operation: "begin", passNonce: "f".repeat(32) });
    const catalog = (begin.json.payload as {
      catalog: Array<{ type: string; name: string; tableName: string; sqlIsNull: boolean; sqlHash: string }>;
    }).catalog;
    const expectedEmptyHash = createHash("sha256").update("").digest("hex");
    const autoindexes = catalog.filter((entry) => entry.name.startsWith("sqlite_autoindex_"));
    expect(autoindexes.length).toBeGreaterThan(0);
    expect(autoindexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "index",
        tableName: "engine_schema_versions",
        sqlIsNull: true,
        sqlHash: expectedEmptyHash
      })
    ]));
    expect(autoindexes.every((entry) => entry.type === "index" && entry.sqlIsNull &&
      entry.sqlHash === expectedEmptyHash && entry.tableName.length > 0)).toBe(true);
  });

  it("returns only bounded administrative foundation evidence", async () => {
    const { d1 } = database();
    const begin = await invoke(d1, { operation: "begin", passNonce: "3".repeat(32) });
    const foundation = await invoke(d1, {
      operation: "foundation",
      continuation: continuation(begin.json)
    });
    expect(foundation.response.status).toBe(200);
    expect(foundation.json.payload).toMatchObject({
      outstandingReservations: 0,
      reservationEvents: 0,
      foreignKeyViolationCount: 0,
      quickCheck: [{ quick_check: "ok" }]
    });
    expect(foundation.json.payload).toMatchObject({
      quota: [{ provider: "the-odds-api", used: 38, remaining: 462, last_cost: 0 }]
    });
  });

  it("rejects cursor tampering, identifier injection, and unsupported hidden tables", async () => {
    const { sqlite, d1 } = database();
    const begin = await invoke(d1, { operation: "begin", passNonce: "4".repeat(32) });
    const original = continuation(begin.json);
    const mutationIndex = 20;
    const tampered = `${original.slice(0, mutationIndex)}${original[mutationIndex] === "A" ? "B" : "A"}${original.slice(mutationIndex + 1)}`;
    expect((await invoke(d1, {
      operation: "table_start",
      continuation: tampered,
      table: "sample"
    })).response.status).toBe(400);
    expect((await invoke(d1, {
      operation: "table_start",
      continuation: original,
      table: 'sample"; DROP TABLE sample;--'
    })).response.status).toBe(409);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM sample").get()).toMatchObject({ count: 3 });
  });

  it("hashes generated columns but rejects virtual-table implementation columns", async () => {
    const { sqlite, d1 } = database();
    sqlite.exec(`
      CREATE TABLE generated_sample (
        source INTEGER NOT NULL,
        doubled INTEGER GENERATED ALWAYS AS (source * 2) STORED
      );
      INSERT INTO generated_sample (source) VALUES (4);
      CREATE VIRTUAL TABLE virtual_sample USING fts5(content);
    `);
    const begin = await invoke(d1, { operation: "begin", passNonce: "9".repeat(32) });
    const generated = await invoke(d1, {
      operation: "table_start",
      continuation: continuation(begin.json),
      table: "generated_sample"
    });
    expect(generated.response.status).toBe(200);
    expect((generated.json.payload as { columns: Array<{ hidden: number }> }).columns)
      .toEqual(expect.arrayContaining([expect.objectContaining({ hidden: 3 })]));
    const virtual = await invoke(d1, {
      operation: "table_start",
      continuation: continuation(generated.json),
      table: "virtual_sample"
    });
    expect(virtual.response.status).toBe(409);
    expect(virtual.json).toEqual({ error: "unsupported_table_shape" });
    sqlite.close();
  });

  it("contains no write, provider, scheduler, R2, network, or whole-environment capability", () => {
    const source = readFileSync("worker/os01-census-operator.ts", "utf8");
    expect(source).not.toMatch(/ODDS_API_KEY|the-odds-api\.com|odds-quota|scheduler|R2Bucket|source-capture|fetch\s*\(/iu);
    expect(source).not.toMatch(/(?:session|statement|database|reader|d1)\.(?:run|batch|exec|dump)\s*\(/u);
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|VACUUM|REINDEX|ATTACH|DETACH)\b/iu);
    expect(source).not.toMatch(/\.\.\.\s*env\b/u);
    expect(source).not.toContain("console.");
    expect(source).toContain('normalized.startsWith("SELECT ")');
  });
});
