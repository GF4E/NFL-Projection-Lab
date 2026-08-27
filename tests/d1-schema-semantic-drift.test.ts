import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import {
  buildPhysicalManifest,
  compareManifest
} from "../scripts/verify_d1_schema_authority";

function manifest(sql: string) {
  const db = new DatabaseSync(":memory:");
  db.exec(sql);
  const result = buildPhysicalManifest(db, "fixture-migration-set");
  db.close();
  return result;
}

const canonical = `
  CREATE TABLE sample (
    id text PRIMARY KEY NOT NULL,
    x integer NOT NULL DEFAULT 1 CHECK (x > 0),
    y text NOT NULL
  );
  CREATE INDEX sample_xy ON sample (x ASC, y DESC);
  CREATE TABLE audit (value integer NOT NULL);
  CREATE TRIGGER sample_audit AFTER INSERT ON sample
  BEGIN INSERT INTO audit(value) VALUES (NEW.x); END;
`;

describe("semantic D1 schema drift", () => {
  it("treats whitespace and equivalent identifier quoting as insignificant", () => {
    const equivalent = `
      CREATE TABLE \"sample\"(\"id\" TEXT PRIMARY KEY NOT NULL,\"x\" INTEGER NOT NULL
        DEFAULT 1 CHECK(\"x\">0),\"y\" TEXT NOT NULL);
      CREATE INDEX \"sample_xy\" ON \"sample\"(\"x\" ASC,\"y\" DESC);
      CREATE TABLE \"audit\"(\"value\" INTEGER NOT NULL);
      CREATE TRIGGER \"sample_audit\" AFTER INSERT ON \"sample\" BEGIN
        INSERT INTO \"audit\"(\"value\") VALUES(NEW.\"x\"); END;
    `;
    expect(compareManifest(manifest(canonical), manifest(equivalent))).toEqual([]);
  });

  it.each([
    ["default", canonical.replace("DEFAULT 1", "DEFAULT 2"), "semantic drift in table:sample"],
    ["check", canonical.replace("x > 0", "x >= 0"), "semantic drift in table:sample"],
    ["index key order", canonical.replace("(x ASC, y DESC)", "(y ASC, x DESC)"), "semantic drift in index:sample_xy"],
    ["trigger body", canonical.replace("VALUES (NEW.x)", "VALUES (NEW.x + 1)"), "semantic drift in trigger:sample_audit"],
    ["extra object", `${canonical}\nCREATE TABLE unexpected(id integer);`, "unexpected object table:unexpected"]
  ])("detects %s drift", (_name, changed, expectedError) => {
    expect(compareManifest(manifest(canonical), manifest(changed))
      .some((error) => error.startsWith(expectedError))).toBe(true);
  });

  it("detects foreign-key action drift", () => {
    const base = `CREATE TABLE parent(id text PRIMARY KEY);
      CREATE TABLE child(id text PRIMARY KEY, parent_id text,
        FOREIGN KEY(parent_id) REFERENCES parent(id) ON UPDATE CASCADE ON DELETE RESTRICT);`;
    const changed = base.replace("ON DELETE RESTRICT", "ON DELETE CASCADE");
    expect(compareManifest(manifest(base), manifest(changed))
      .some((error) => error.startsWith("semantic drift in table:child at semantics.foreignKeys")))
      .toBe(true);
  });

  it("detects partial-index predicate drift", () => {
    const base = "CREATE TABLE item(x integer); CREATE INDEX item_positive ON item(x) WHERE x > 0;";
    const changed = base.replace("x > 0", "x >= 0");
    expect(compareManifest(manifest(base), manifest(changed))
      .some((error) => error.startsWith("semantic drift in index:item_positive"))).toBe(true);
  });

  it("detects generated-column drift", () => {
    const base = "CREATE TABLE generated(x integer, y integer GENERATED ALWAYS AS (x + 1) STORED);";
    const changed = base.replace("x + 1", "x + 2");
    expect(compareManifest(manifest(base), manifest(changed))
      .some((error) => error.startsWith("semantic drift in table:generated"))).toBe(true);
  });

  it("detects STRICT and WITHOUT ROWID drift", () => {
    const ordinary = manifest("CREATE TABLE mode(id text PRIMARY KEY, value text);");
    const strict = manifest("CREATE TABLE mode(id text PRIMARY KEY, value text) STRICT;");
    const withoutRowid = manifest("CREATE TABLE mode(id text PRIMARY KEY, value text) WITHOUT ROWID;");
    expect(compareManifest(ordinary, strict)
      .some((error) => error.startsWith("semantic drift in table:mode"))).toBe(true);
    expect(compareManifest(ordinary, withoutRowid)
      .some((error) => error.startsWith("semantic drift in table:mode"))).toBe(true);
  });
});
