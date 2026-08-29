import type { NormalizedInjury, QuarterbackOverride } from "./types";
import { stableHash } from "./hash";

export interface RawOfficialInjury {
  player: string;
  team: string;
  gameId: string;
  practiceStatus?: string | null;
  gameStatus?: string | null;
  inactive?: boolean | null;
}

export function normalizeOfficialInjuries(
  rows: RawOfficialInjury[],
  sourceUrl: string,
  sourceTimestamp: string,
  expectedTeams: string[]
): NormalizedInjury[] {
  if (!sourceUrl.startsWith("https://")) throw new Error("Official injury source must be HTTPS");
  const presentTeams = new Set(rows.map((row) => row.team));
  if (expectedTeams.some((team) => !presentTeams.has(team))) {
    throw new Error("Partial injury imports are prohibited; preserve the last good forecast");
  }
  const rawSnapshotHash = stableHash({ rows, sourceUrl, sourceTimestamp });
  return rows.map((row) => ({
    player: row.player,
    team: row.team,
    gameId: row.gameId,
    practiceStatus: row.practiceStatus ?? null,
    gameStatus: row.gameStatus ?? null,
    inactive: row.inactive ?? null,
    sourceUrl,
    sourceTimestamp,
    rawSnapshotHash
  }));
}

export function validateHistoricalInjurySeason(season: number): void {
  if (season > 2024) {
    throw new Error("nflverse injuries may only be used through 2024 until its feed is demonstrably restored");
  }
}

export function validateInactivesTiming(kickoffAt: string, capturedAt: string): boolean {
  const minutesBefore =
    (new Date(kickoffAt).getTime() - new Date(capturedAt).getTime()) / 60_000;
  return minutesBefore <= 90 && minutesBefore >= 0;
}

export function createQuarterbackOverride(
  input: QuarterbackOverride,
  actorRole: "owner" | "teammate"
): QuarterbackOverride {
  if (actorRole !== "owner") throw new Error("Only the owner may set a quarterback override");
  if (!Number.isFinite(input.value) || !input.sourceUrl || !input.rationale || !input.authorId) {
    throw new Error("QB override requires value, source, rationale, author, and timestamp");
  }
  return input;
}
