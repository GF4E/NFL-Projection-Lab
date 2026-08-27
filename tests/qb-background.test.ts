import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { structuralConfig } from "@/domain/config";
import { createQbModelOverride, latestQbModelOverrides } from "@/server/qb-overrides/store";
import { schemaAuthorityHistory } from "@/server/schema-authority";
import { sizeKelly } from "@/domain/sizing";

class MemoryStatement {
  private values: unknown[] = [];
  constructor(private sql: string, private rows: Array<Record<string, unknown>>) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async run() {
    if (this.sql.includes("INSERT OR IGNORE INTO qb_model_overrides")) {
      const [id, gameId, team, value, sourceUrl, rationale, authorId, createdAt, auditHash] = this.values;
      if (!this.rows.some((row) => row.audit_hash === auditHash)) this.rows.push({
        id, game_id: gameId, team, value, source_url: sourceUrl, rationale, author_id: authorId,
        created_at: createdAt, audit_hash: auditHash
      });
    }
    return { meta: { changes: 1 } };
  }
  async all<T>() {
    if (this.sql.includes("FROM engine_schema_versions ORDER BY version")) {
      return {
        results: schemaAuthorityHistory.map(([version, migration_hash]) => ({ version, migration_hash })) as T[]
      };
    }
    if (!this.sql.includes("ROW_NUMBER() OVER")) return { results: [] as T[] };
    const allowed = new Set(this.values);
    const latest = new Map<string, Record<string, unknown>>();
    for (const row of this.rows.filter((item) => allowed.has(item.game_id))) {
      const key = `${row.game_id}:${row.team}`;
      const previous = latest.get(key);
      if (!previous || String(previous.created_at) < String(row.created_at)) latest.set(key, row);
    }
    return { results: [...latest.values()] as T[] };
  }
}

function memoryDb() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    prepare(sql: string) { return new MemoryStatement(sql, rows); },
    async batch(statements: MemoryStatement[]) { for (const statement of statements) await statement.run(); return []; }
  } as unknown as D1Database;
}

describe("background QB handling", () => {
  it("freezes the rejected offseason tier adjustment instead of hardcoding points", () => {
    const artifact = JSON.parse(readFileSync("config/qb-tier-validation.json", "utf8"));
    expect(artifact.sourceSeasons).toEqual([2010, 2025]);
    expect(artifact.holdoutSeasons).toEqual([2023, 2024, 2025]);
    expect(artifact.decision).toBe("withhold");
    expect(artifact.learnedPointPriors).toEqual([]);
    expect(artifact.holdoutSelectedMae).toBeGreaterThan(artifact.holdoutBaselineMae);
    expect(structuralConfig.qbTiers.status).toBe("validated_withheld_no_holdout_improvement");
    expect(structuralConfig.qbTiers.learnedPointPriors).toEqual([]);
  });

  it("stores immutable, audited owner overrides and returns only the latest revision", async () => {
    const db = memoryDb();
    await createQbModelOverride({
      db, gameId: "ne-sea", team: "SEA", value: -1.5,
      sourceUrl: "https://www.nfl.com/inactives", rationale: "Confirmed starter inactive",
      authorId: "gabe", createdAt: "2026-09-13T17:00:00Z"
    });
    const latest = await createQbModelOverride({
      db, gameId: "ne-sea", team: "SEA", value: -1,
      sourceUrl: "https://www.seahawks.com/news", rationale: "Backup quality updated with named starter",
      authorId: "gabe", createdAt: "2026-09-13T17:30:00Z"
    });
    const stored = await latestQbModelOverrides(db, ["ne-sea"]);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ value: -1, auditHash: latest.auditHash });
    expect(stored[0].auditHash).toHaveLength(64);
  });

  it("keeps QB override controls owner-only and out of the main card", () => {
    const route = readFileSync("src/app/api/qb-override/route.ts", "utf8");
    const card = readFileSync("src/components/week-one-board.tsx", "utf8");
    expect(route).toContain('member.actor !== "gabe"');
    expect(route).toContain("Only the owner may set a QB override");
    expect(card).not.toContain("qb-override");
  });

  it("widens a risky-QB interval without inventing a directional point edge", () => {
    const base: [number, number] = [0.01, 0.04];
    const widened: [number, number] = [base[0] - 0.01, base[1] + 0.01];
    const sizing = sizeKelly(0.56, -110, widened, {
      referenceBankrollUnits: 100, kellyFraction: 0.25, increment: 0.5, minimum: 0.5, maximum: 2
    });
    expect(widened).toEqual([0, 0.05]);
    expect(sizing.greyed).toBe(true);
  });
});
