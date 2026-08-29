import { stableHash } from "@/domain/hash";
import { assertD1SchemaAuthority } from "@/server/schema-authority";

export interface StoredQbOverride {
  id: string;
  gameId: string;
  team: string;
  value: number;
  sourceUrl: string;
  rationale: string;
  authorId: string;
  createdAt: string;
  auditHash: string;
}

interface OverrideRow {
  id: string;
  game_id: string;
  team: string;
  value: number;
  source_url: string;
  rationale: string;
  author_id: string;
  created_at: string;
  audit_hash: string;
}


function mapOverride(row: OverrideRow): StoredQbOverride {
  return {
    id: row.id,
    gameId: row.game_id,
    team: row.team,
    value: row.value,
    sourceUrl: row.source_url,
    rationale: row.rationale,
    authorId: row.author_id,
    createdAt: row.created_at,
    auditHash: row.audit_hash
  };
}

export async function ensureQbOverrideStore(db: D1Database): Promise<void> {
  await assertD1SchemaAuthority(db);
}

export async function createQbModelOverride(input: {
  db: D1Database;
  gameId: string;
  team: string;
  value: number;
  sourceUrl: string;
  rationale: string;
  authorId: string;
  createdAt?: string;
}): Promise<StoredQbOverride> {
  await ensureQbOverrideStore(input.db);
  if (!Number.isFinite(input.value) || Math.abs(input.value) > 14) throw new Error("QB override must be between -14 and 14 team-margin points");
  if (!input.sourceUrl.startsWith("https://")) throw new Error("QB override source must be HTTPS");
  if (!input.rationale.trim() || !input.authorId.trim()) throw new Error("QB override requires rationale and author");
  const createdAt = input.createdAt ?? new Date().toISOString();
  const auditHash = stableHash({
    gameId: input.gameId,
    team: input.team,
    value: input.value,
    sourceUrl: input.sourceUrl,
    rationale: input.rationale,
    authorId: input.authorId,
    createdAt
  });
  const override: StoredQbOverride = {
    id: `qb:${auditHash}`,
    gameId: input.gameId,
    team: input.team,
    value: input.value,
    sourceUrl: input.sourceUrl,
    rationale: input.rationale,
    authorId: input.authorId,
    createdAt,
    auditHash
  };
  await input.db.prepare(`INSERT OR IGNORE INTO qb_model_overrides
    (id, game_id, team, value, source_url, rationale, author_id, created_at, audit_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      override.id, override.gameId, override.team, override.value, override.sourceUrl,
      override.rationale, override.authorId, override.createdAt, override.auditHash
    ).run();
  return override;
}

export async function latestQbModelOverrides(
  db: D1Database,
  gameIds: readonly string[]
): Promise<StoredQbOverride[]> {
  if (!gameIds.length) return [];
  const placeholders = gameIds.map(() => "?").join(", ");
  const result = await db.prepare(`SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY game_id, team ORDER BY created_at DESC, id DESC) AS revision_rank
      FROM qb_model_overrides WHERE game_id IN (${placeholders})
    ) WHERE revision_rank = 1 ORDER BY game_id, team`).bind(...gameIds).all<OverrideRow>();
  return result.results.map(mapOverride);
}
