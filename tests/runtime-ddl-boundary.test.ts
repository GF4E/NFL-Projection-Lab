import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const productionRoots = [resolve(root, "src"), resolve(root, "worker")];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const formerRuntimeSchemaOwners = [
  "src/server/confidence-engine/store.ts",
  "src/server/live-line-store.ts",
  "src/server/market-sentiment/store.ts",
  "src/server/model-lifecycle/store.ts",
  "src/server/nflverse/store.ts",
  "src/server/odds-automation.ts",
  "src/server/official-injuries/store.ts",
  "src/server/play-store.ts",
  "src/server/player-props.ts",
  "src/server/pregame-context/store.ts",
  "src/server/push/edge-notifications.ts",
  "src/server/push/store.ts",
  "src/server/qb-overrides/store.ts",
  "src/server/weather/store.ts",
  "src/server/weekly-digest.ts"
] as const;
const forbiddenSql = /\b(?:create\s+(?:(?:unique|virtual)\s+)*(?:table|index|trigger|view)|alter\s+table|drop\s+(?:table|index|trigger|view)|truncate\b|pragma\b|vacuum\b|reindex\b|attach\b|detach\b)/giu;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(path)) ? [path] : [];
  });
}

describe("migration-only runtime boundary", () => {
  it("contains no schema DDL in production source", () => {
    const findings = productionRoots.flatMap(sourceFiles).flatMap((path) => {
      const matches = [...readFileSync(path, "utf8").matchAll(forbiddenSql)];
      return matches.map((match) => `${relative(root, path)}:${match.index}:${match[0]}`);
    });
    expect(findings).toEqual([]);
  });

  it("does not import migration SQL into the production graph", () => {
    const findings = productionRoots.flatMap(sourceFiles).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /(?:drizzle\/|\.sql(?:\?raw)?["'])/u.test(source) ? [relative(root, path)] : [];
    });
    expect(findings).toEqual([]);
  });

  it("turns every former runtime schema owner into an exact-history assertion", () => {
    const missing = formerRuntimeSchemaOwners.filter((path) => {
      const source = readFileSync(resolve(root, path), "utf8");
      return !source.includes("assertD1SchemaAuthority") ||
        !/ensure[A-Za-z]*Store\([^)]*\)[^{]*\{[^}]*await assertD1SchemaAuthority\(/su.test(source);
    });
    expect(missing).toEqual([]);
  });
});
