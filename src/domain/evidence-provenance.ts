import { structuralConfig } from "./config";
import type { MatchupEvidenceProvenance } from "./decision-board";

export interface EvidenceFeatureRow {
  season: number;
  week: number;
  gameDate: string;
  team: string;
}

export interface EvidenceCompletedGame {
  season: number;
  week: number;
}

export function expectedEvidenceThrough(input: {
  forecastSeason: number;
  forecastWeek: number;
  completedGames: readonly EvidenceCompletedGame[];
}): { season: number; week: number } {
  const eligible = input.completedGames.filter((game) =>
    game.season < input.forecastSeason || (game.season === input.forecastSeason && game.week < input.forecastWeek)
  );
  return eligible.reduce((latest, game) =>
    game.season > latest.season || (game.season === latest.season && game.week > latest.week)
      ? { season: game.season, week: game.week }
      : latest,
    { season: structuralConfig.model.trainingStartSeason, week: 0 }
  );
}

export function matchupEvidenceProvenance(input: {
  rows: readonly EvidenceFeatureRow[];
  forecastSeason: number;
  forecastWeek: number;
  completedGames: readonly EvidenceCompletedGame[];
}): MatchupEvidenceProvenance {
  const expected = expectedEvidenceThrough(input);
  const latest = input.rows.reduce<{ season: number; week: number; date: string } | null>((current, row) =>
    !current || row.season > current.season || (row.season === current.season && row.week > current.week)
      ? { season: row.season, week: row.week, date: row.gameDate }
      : current,
    null
  );
  const teams = new Map<string, number>();
  for (const row of input.rows) teams.set(row.team, (teams.get(row.team) ?? 0) + 1);
  const enoughCoverage = teams.size === 32 && [...teams.values()].every((games) => games >= structuralConfig.matchupEvidence.minimumTrainingGames);
  const caughtUp = latest !== null && (latest.season > expected.season || (latest.season === expected.season && latest.week >= expected.week));
  return {
    status: !latest ? "unavailable" : caughtUp && enoughCoverage ? "current" : "stale",
    provider: "nflverse",
    throughSeason: latest?.season ?? null,
    throughWeek: latest?.week ?? null,
    throughDate: latest?.date ?? null,
    expectedThroughSeason: expected.season,
    expectedThroughWeek: expected.week,
    featureGames: input.rows.length
  };
}
