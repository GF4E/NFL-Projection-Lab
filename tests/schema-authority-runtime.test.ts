import { describe, expect, it, vi } from "vitest";
import {
  assertD1SchemaAuthority,
  schemaAuthorityHistory,
  terminalSchemaAuthority
} from "@/server/schema-authority";

type SchemaVersionRow = { version: string; migration_hash: string };

function exactRows(): SchemaVersionRow[] {
  return schemaAuthorityHistory.map(([version, migration_hash]) => ({ version, migration_hash }));
}

function databaseReturning(rows: SchemaVersionRow[]) {
  const all = vi.fn(async () => ({ results: rows }));
  const prepare = vi.fn(() => ({ all }));
  return {
    db: { prepare } as unknown as D1Database,
    prepare,
    all
  };
}

describe("OS-01 terminal schema-authority guard", () => {
  it("accepts the exact terminal version and migration hash and caches the read", async () => {
    const fixture = databaseReturning(exactRows());
    await assertD1SchemaAuthority(fixture.db);
    await assertD1SchemaAuthority(fixture.db);
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.all).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the terminal receipt is absent", async () => {
    const fixture = databaseReturning(exactRows().slice(0, -1));
    await expect(assertD1SchemaAuthority(fixture.db)).rejects.toThrow("D1 schema authority is unavailable");
  });

  it("fails closed on a same-version hash mismatch", async () => {
    const rows = exactRows();
    rows[rows.length - 1] = {
      version: terminalSchemaAuthority.version,
      migration_hash: "sha256:" + "0".repeat(64)
    };
    const fixture = databaseReturning(rows);
    await expect(assertD1SchemaAuthority(fixture.db)).rejects.toThrow(terminalSchemaAuthority.version);
  });

  it("fails closed when an unknown newer receipt coexists with the valid terminal receipt", async () => {
    const fixture = databaseReturning([
      ...exactRows(),
      { version: "0021_unknown", migration_hash: "sha256:" + "1".repeat(64) }
    ]);
    await expect(assertD1SchemaAuthority(fixture.db)).rejects.toThrow("exact history");
  });

  it("fails closed when any accepted predecessor receipt is absent or changed", async () => {
    const missing = databaseReturning(exactRows().filter((row) => row.version !== "0017_engine_os_source_capture"));
    await expect(assertD1SchemaAuthority(missing.db)).rejects.toThrow("exact history");
    const changedRows = exactRows();
    changedRows[0] = { ...changedRows[0]!, migration_hash: "sha256:" + "2".repeat(64) };
    const changed = databaseReturning(changedRows);
    await expect(assertD1SchemaAuthority(changed.db)).rejects.toThrow("exact history");
  });

  it("caches a failed verification so a drifted isolate cannot self-heal", async () => {
    const fixture = databaseReturning([]);
    const first = assertD1SchemaAuthority(fixture.db);
    const second = assertD1SchemaAuthority(fixture.db);
    expect(second).toBe(first);
    await expect(first).rejects.toThrow("D1 schema authority is unavailable");
    await expect(second).rejects.toThrow("D1 schema authority is unavailable");
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
  });
});
