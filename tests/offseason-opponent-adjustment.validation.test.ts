import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { fitOpponentAdjustedRatings, predictOpponentAdjustedMetric } from "@/domain/opponent-adjustment";
import { aggregatePbpCsv, type TeamGameFeature } from "@/server/nflverse/transform";

const enabled = process.env.NFL_VALIDATE_OPPONENT_ADJUSTMENT === "1";
const candidates = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const;

async function seasonRows(season: number): Promise<TeamGameFeature[]> {
  const source = Readable.toWeb(createReadStream(`/tmp/nfl-pbp-${season}.csv.gz`)) as ReadableStream<Uint8Array>;
  return aggregatePbpCsv(source.pipeThrough(
    new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>
  ), { season, currentSeason: 2026 });
}

function recentHistory(rows: readonly TeamGameFeature[], season: number, week: number): TeamGameFeature[] {
  const eligible = rows.filter((row) => row.season < season || (row.season === season && row.week < week));
  const byTeam = new Map<string, TeamGameFeature[]>();
  for (const row of eligible) byTeam.set(row.team, [...(byTeam.get(row.team) ?? []), row]);
  return [...byTeam.values()].flatMap((teamRows) => teamRows
    .sort((left, right) => right.season - left.season || right.week - left.week || right.gameDate.localeCompare(left.gameDate))
    .slice(0, 17));
}

describe.runIf(enabled)("offseason opponent-adjustment validation", () => {
  it("selects the frozen ridge penalty on 2023-2025 rolling-origin rows", async () => {
    const rows = (await Promise.all([2022, 2023, 2024, 2025].map(seasonRows))).flat();
    const errors = new Map(candidates.map((penalty) => [penalty, { squared: 0, weight: 0 }]));
    const raw = { squared: 0, weight: 0 };
    for (const season of [2023, 2024, 2025]) {
      for (let week = 1; week <= 18; week += 1) {
        const target = rows.filter((row) => row.season === season && row.week === week);
        if (!target.length) continue;
        const history = recentHistory(rows, season, week);
        for (const penalty of candidates) {
          for (const metric of ["epaPerPlay", "successRate", "explosiveRate"] as const) {
            const historyWeight = history.reduce((sum, row) => sum + row.plays, 0);
            const leagueMean = history.reduce((sum, row) => sum + row[metric] * row.plays, 0) / historyWeight;
            const rawAverage = (team: string, side: "team" | "opponent") => {
              const selected = history.filter((row) => row[side] === team);
              const weight = selected.reduce((sum, row) => sum + row.plays, 0);
              return weight ? selected.reduce((sum, row) => sum + row[metric] * row.plays, 0) / weight : null;
            };
            const fit = fitOpponentAdjustedRatings(history.map((row) => ({
              offense: row.team,
              defense: row.opponent,
              value: row[metric],
              weight: row.plays
            })), penalty);
            if (!fit) continue;
            const targetMean = target.reduce((sum, row) => sum + row[metric] * row.plays, 0) /
              target.reduce((sum, row) => sum + row.plays, 0);
            const variance = target.reduce((sum, row) => sum + row.plays * (row[metric] - targetMean) ** 2, 0) /
              target.reduce((sum, row) => sum + row.plays, 0);
            for (const row of target) {
              const prediction = predictOpponentAdjustedMetric(fit, row.team, row.opponent);
              if (prediction === null) continue;
              const result = errors.get(penalty)!;
              result.squared += row.plays * (row[metric] - prediction) ** 2 / Math.max(1e-8, variance);
              result.weight += row.plays;
              if (penalty === candidates[0]) {
                const offense = rawAverage(row.team, "team");
                const defense = rawAverage(row.opponent, "opponent");
                if (offense !== null && defense !== null) {
                  const rawPrediction = offense + defense - leagueMean;
                  raw.squared += row.plays * (row[metric] - rawPrediction) ** 2 / Math.max(1e-8, variance);
                  raw.weight += row.plays;
                }
              }
            }
          }
        }
      }
    }
    const ranked = [...errors].map(([penalty, result]) => ({
      penalty,
      standardizedRmse: Math.sqrt(result.squared / result.weight),
      weight: result.weight
    })).sort((left, right) => left.standardizedRmse - right.standardizedRmse);
    const rawStandardizedRmse = Math.sqrt(raw.squared / raw.weight);
    console.log(JSON.stringify({ ranked, rawStandardizedRmse, rawWeight: raw.weight }, null, 2));
    expect(ranked[0].weight).toBeGreaterThan(100_000);
    expect(ranked[0].standardizedRmse).toBeLessThan(rawStandardizedRmse);
    expect(candidates).toContain(ranked[0].penalty);
  }, 120_000);
});
