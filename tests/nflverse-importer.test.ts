import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nflSeasonForDate, shouldRetryUncompressedPbp } from "@/server/nflverse/automation";
import { parseCsvStream, textStream } from "@/server/nflverse/csv";
import { aggregatePbpCsv, parseScheduleCsv } from "@/server/nflverse/transform";
import { gradeStoredLeg } from "@/domain/settlement";

const scheduleHeader = [
  "game_id", "season", "game_type", "week", "gameday", "weekday", "gametime",
  "away_team", "away_score", "home_team", "home_score", "location", "result", "total",
  "overtime", "away_rest", "home_rest", "away_moneyline", "home_moneyline", "spread_line",
  "away_spread_odds", "home_spread_odds", "total_line", "under_odds", "over_odds", "div_game",
  "roof", "surface", "temp", "wind", "away_qb_id", "home_qb_id", "away_qb_name",
  "home_qb_name", "away_coach", "home_coach", "referee", "stadium_id", "stadium"
];

const pbpHeader = [
  "game_id", "home_team", "away_team", "season", "season_type", "week", "posteam", "posteam_type",
  "defteam", "game_date", "epa", "success", "yards_gained", "qb_dropback", "qb_kneel",
  "qb_spike", "rush_attempt", "pass_attempt", "interception", "fumble_lost", "play", "xpass",
  "pass_oe", "fixed_drive", "drive_time_of_possession"
];

function csvRow(header: readonly string[], values: Record<string, string | number>): string {
  return header.map((column) => {
    const raw = String(values[column] ?? "");
    return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
  }).join(",");
}

describe("automatic nflverse importer", () => {
  it("parses quoted CSV correctly even when every byte is a separate chunk", async () => {
    const rows: string[][] = [];
    for await (const row of parseCsvStream(textStream('a,b\n"one, two","quote ""inside"""\n', 1))) rows.push(row);
    expect(rows).toEqual([["a", "b"], ["one, two", 'quote "inside"']]);
  });

  it("validates and normalizes the complete schedule history", async () => {
    const rows = [scheduleHeader.join(",")];
    for (let index = 0; index < 4_000; index += 1) {
      const current = index < 272;
      rows.push(csvRow(scheduleHeader, {
        game_id: `${current ? 2026 : 2025}_${String(index).padStart(4, "0")}_NE_SEA`,
        season: current ? 2026 : 2025,
        game_type: "REG",
        week: (index % 18) + 1,
        gameday: current ? "2026-09-09" : "2025-09-07",
        weekday: "Sunday",
        gametime: "13:05",
        away_team: "NE",
        home_team: "SEA",
        spread_line: -2.5,
        total_line: 44.5,
        overtime: 0,
        div_game: 0,
        stadium: index === 0 ? "Lumen, Field" : "Lumen Field"
      }));
    }
    const games = await parseScheduleCsv(rows.join("\n"), { trainingStartSeason: 2010, currentSeason: 2026 });
    expect(games).toHaveLength(4_000);
    expect(games.filter((game) => game.season === 2026)).toHaveLength(272);
    expect(games[0]).toMatchObject({ spreadLine: -2.5, totalLine: 44.5, stadium: "Lumen, Field" });
    expect(games[0].sourceRowHash).toHaveLength(64);
  });

  it("streams play-by-play into leakage-addressable team-game features", async () => {
    const rows = [
      pbpHeader.join(","),
      csvRow(pbpHeader, { game_id: "2026_01_NE_SEA", home_team: "SEA", away_team: "NE", season: 2026, season_type: "REG", week: 1, posteam: "SEA", posteam_type: "home", defteam: "NE", game_date: "2026-09-09", epa: 0.5, success: 1, yards_gained: 25, qb_dropback: 1, pass_attempt: 1, interception: 0, fumble_lost: 0, play: 1, xpass: 0.6, pass_oe: 40, fixed_drive: 1, drive_time_of_possession: "2:00" }),
      csvRow(pbpHeader, { game_id: "2026_01_NE_SEA", home_team: "SEA", away_team: "NE", season: 2026, season_type: "REG", week: 1, posteam: "SEA", posteam_type: "home", defteam: "NE", game_date: "2026-09-09", epa: -0.1, success: 0, yards_gained: 12, rush_attempt: 1, interception: 0, fumble_lost: 0, play: 1, xpass: 0.4, pass_oe: -40, fixed_drive: 1, drive_time_of_possession: "2:00" }),
      csvRow(pbpHeader, { game_id: "2026_01_NE_SEA", home_team: "SEA", away_team: "NE", season: 2026, season_type: "REG", week: 1, posteam: "NE", posteam_type: "away", defteam: "SEA", game_date: "2026-09-09", epa: 0.2, success: 1, yards_gained: 5, qb_dropback: 1, pass_attempt: 1, interception: 1, fumble_lost: 0, play: 1, xpass: 0.5, pass_oe: 50, fixed_drive: 2, drive_time_of_possession: "1:30" }),
      csvRow(pbpHeader, { game_id: "2026_01_NE_SEA", home_team: "SEA", away_team: "NE", season: 2026, season_type: "REG", week: 1, posteam: "NE", posteam_type: "away", defteam: "SEA", game_date: "2026-09-09", epa: -0.4, success: 0, yards_gained: 2, rush_attempt: 1, interception: 0, fumble_lost: 0, play: 1, xpass: 0.5, pass_oe: -50, fixed_drive: 2, drive_time_of_possession: "1:30" })
    ];
    const features = await aggregatePbpCsv(textStream(rows.join("\n"), 7), { season: 2026, currentSeason: 2026 });
    const seattle = features.find((row) => row.team === "SEA");
    const newEngland = features.find((row) => row.team === "NE");
    expect(features).toHaveLength(2);
    expect(seattle).toMatchObject({ plays: 2, successRate: 0.5, explosiveRate: 1, passRate: 0.5, secondsPerPlay: 60 });
    expect(seattle?.epaPerPlay).toBeCloseTo(0.2);
    expect(seattle?.passRateOverExpectation).toBeCloseTo(0);
    expect(newEngland).toMatchObject({ turnovers: 1, turnoverRate: 0.5 });
  });

  it("uses the NFL season year across the January boundary", () => {
    expect(nflSeasonForDate(new Date("2026-01-15T20:00:00Z"))).toBe(2025);
    expect(nflSeasonForDate(new Date("2026-08-11T20:00:00Z"))).toBe(2026);
  });

  it("falls back to the plain CSV for multi-member gzip archives rejected by the edge runtime", () => {
    expect(shouldRetryUncompressedPbp(new Error("Trailing bytes after end of compressed data"))).toBe(true);
    expect(shouldRetryUncompressedPbp(new Error("nflverse schema is missing: epa"))).toBe(false);
  });

  it("wires the five-minute schedule and Roboto into the deployed app", () => {
    expect(readFileSync("vite.config.ts", "utf8")).toContain('"*/5 * * * *"');
    expect(readFileSync("worker/index.ts", "utf8")).toContain("async scheduled");
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain("@fontsource/roboto/900.css");
    expect(readFileSync("src/app/globals.css", "utf8")).toContain('--display: "Roboto"');
  });

  it("automatically grades supported team-card contracts from nflverse finals", () => {
    const final = {
      gameId: "atl-pit",
      awayTeam: "ATL",
      homeTeam: "PIT",
      awayScore: 24,
      homeScore: 20,
      sourceHash: "official-final"
    };
    const leg = (market: "spread" | "total" | "moneyline" | "prop" | "teaser", side: string, point: number | null) => ({
      gameId: final.gameId,
      market,
      side,
      point,
      americanPrice: -110,
      selection: `${side} ${point ?? "ML"}`
    });

    expect(gradeStoredLeg(leg("spread", "ATL", 3.5), final)).toBe("win");
    expect(gradeStoredLeg(leg("spread", "PIT", -3.5), final)).toBe("loss");
    expect(gradeStoredLeg(leg("total", "Over", 41.5), final)).toBe("win");
    expect(gradeStoredLeg(leg("total", "Under", 44), final)).toBe("push");
    expect(gradeStoredLeg(leg("moneyline", "ATL", null), final)).toBe("win");
    expect(gradeStoredLeg(leg("teaser", "ATL", 7.5), final)).toBe("win");
    expect(gradeStoredLeg(leg("prop", "Player Over", 55.5), final)).toBeNull();

    const worker = readFileSync("worker/index.ts", "utf8");
    const settlement = readFileSync("src/server/automatic-settlement.ts", "utf8");
    expect(worker).toContain("settleCompletedTeamPlays(env.DB, scheduledAt)");
    expect(worker).toContain("runKickoffWeatherAutomation");
    expect(settlement).toContain("play_settlement_audit");
    expect(settlement).not.toContain("closing_clv_cents =");
  });
});
