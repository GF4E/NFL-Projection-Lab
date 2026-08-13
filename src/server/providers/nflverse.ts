import { createHash } from "node:crypto";

export const NFLVERSE_URLS = {
  schedules: "https://github.com/nflverse/nfldata/raw/master/data/games.csv",
  rosters: (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`,
  pbp: (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.parquet`,
  pbpCsv: (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`,
  pbpCsvPlain: (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv`,
  playerStatsCsv: (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
  snapCountsCsv: (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`,
  historicalInjuries: (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`
} as const;

export interface RawDatasetSnapshot {
  url: string;
  bytes: Uint8Array;
  sha256: string;
  fetchedAt: string;
}

export async function fetchNflverseDataset(
  url: string,
  fetcher: typeof fetch = fetch
): Promise<RawDatasetSnapshot> {
  const response = await fetcher(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`nflverse import failed for ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`nflverse import returned an empty dataset: ${url}`);
  return {
    url,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    fetchedAt: new Date().toISOString()
  };
}

export function assertLatestCompletedSlate(input: {
  maximumGameDate: string;
  expectedLastCompletedDate: string;
  rowCount: number;
  minimumRows: number;
  schemaColumns: string[];
  requiredColumns: string[];
}): void {
  if (input.maximumGameDate !== input.expectedLastCompletedDate) {
    throw new Error("nflverse freshness check failed: maximum game date is not the last completed slate");
  }
  if (input.rowCount < input.minimumRows) throw new Error("nflverse row-count validation failed");
  const missing = input.requiredColumns.filter((column) => !input.schemaColumns.includes(column));
  if (missing.length) throw new Error(`nflverse schema is missing: ${missing.join(", ")}`);
}
