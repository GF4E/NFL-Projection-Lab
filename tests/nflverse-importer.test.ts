import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextMissingHistoricalSeason, nflSeasonForDate, shouldRetryUncompressedPbp } from "@/server/nflverse/automation";
import { parseCsvStream, textStream } from "@/server/nflverse/csv";
import { aggregatePbpCsv, parsePlayerStatsCsv, parseScheduleCsv, parseSnapCountsCsv } from "@/server/nflverse/transform";
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

const playerStatsHeader = [
  "player_id", "player_name", "player_display_name", "position", "season", "week", "season_type",
  "game_id", "team", "opponent_team", "attempts", "passing_yards", "carries", "rushing_yards",
  "receptions", "targets", "receiving_yards"
];

const snapCountsHeader = [
  "game_id", "season", "game_type", "week", "player", "position", "team", "opponent",
  "offense_snaps", "defense_snaps", "st_snaps"
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

  it("streams weekly player production for leakage-safe prop evidence", async () => {
    const rows = [
      playerStatsHeader.join(","),
      csvRow(playerStatsHeader, { player_id: "qb1", player_name: "S.Darnold", player_display_name: "Sam Darnold", position: "QB", season: 2026, week: 1, season_type: "REG", game_id: "2026_01_NE_SEA", team: "SEA", opponent_team: "NE", attempts: 31, passing_yards: 268, carries: 3, rushing_yards: 12 }),
      csvRow(playerStatsHeader, { player_id: "wr1", player_name: "J.Smith-Njigba", player_display_name: "Jaxon Smith-Njigba", position: "WR", season: 2026, week: 1, season_type: "REG", game_id: "2026_01_NE_SEA", team: "SEA", opponent_team: "NE", receptions: 7, targets: 10, receiving_yards: 96 })
    ];
    const stats = await parsePlayerStatsCsv(textStream(rows.join("\n"), 9), { season: 2026, currentSeason: 2026 });
    expect(stats).toHaveLength(2);
    expect(stats[0]).toMatchObject({ playerDisplayName: "Sam Darnold", attempts: 31, passingYards: 268 });
    expect(stats[1]).toMatchObject({ playerDisplayName: "Jaxon Smith-Njigba", targets: 10, receivingYards: 96 });
  });

  it("streams snap participation so zero-production props distinguish a participant from a DNP", async () => {
    const rows = [
      snapCountsHeader.join(","),
      csvRow(snapCountsHeader, { game_id: "2026_01_NE_SEA", season: 2026, game_type: "REG", week: 1, player: "Sam Darnold", position: "QB", team: "SEA", opponent: "NE", offense_snaps: 62 }),
      csvRow(snapCountsHeader, { game_id: "2026_01_NE_SEA", season: 2026, game_type: "REG", week: 1, player: "John Rhattigan", position: "LB", team: "SEA", opponent: "NE", st_snaps: 18 }),
      ...Array.from({ length: 18 }, (_, index) => csvRow(snapCountsHeader, {
        game_id: "2026_01_NE_SEA", season: 2026, game_type: "REG", week: 1,
        player: `Player ${index}`, position: "OL", team: "SEA", opponent: "NE", offense_snaps: 10
      }))
    ];
    const counts = await parseSnapCountsCsv(textStream(rows.join("\n"), 8), { season: 2026, currentSeason: 2026 });
    expect(counts).toHaveLength(20);
    expect(counts[0]).toMatchObject({ player: "Sam Darnold", offenseSnaps: 62, specialTeamsSnaps: 0 });
    expect(counts[1]).toMatchObject({ player: "John Rhattigan", offenseSnaps: 0, specialTeamsSnaps: 18 });
  });

  it("uses the NFL season year across the January boundary", () => {
    expect(nflSeasonForDate(new Date("2026-01-15T20:00:00Z"))).toBe(2025);
    expect(nflSeasonForDate(new Date("2026-08-11T20:00:00Z"))).toBe(2026);
  });

  it("falls back to the plain CSV for multi-member gzip archives rejected by the edge runtime", () => {
    expect(shouldRetryUncompressedPbp(new Error("Trailing bytes after end of compressed data"))).toBe(true);
    expect(shouldRetryUncompressedPbp(new Error("nflverse schema is missing: epa"))).toBe(false);
  });

  it("backfills the newest missing player participation season first", () => {
    expect(nextMissingHistoricalSeason(2026, "snap_counts", new Set())).toBe(2025);
    expect(nextMissingHistoricalSeason(2026, "snap_counts", new Set(["snap_counts:2025"]))).toBe(2024);
    expect(nextMissingHistoricalSeason(2026, "snap_counts", new Set(["snap_counts:2025", "snap_counts:2024"]))).toBeNull();
    expect(nextMissingHistoricalSeason(
      2026,
      "player_stats",
      new Set(["player_stats:2025", "player_stats:2024"]),
      6
    )).toBe(2023);
  });

  it("keeps Roboto while quarantining the legacy importer behind the dormant OS scheduler", () => {
    const viteConfig = readFileSync("vite.config.ts", "utf8");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(viteConfig).toContain('"* * * * *"');
    expect(viteConfig).toContain('"1-59/2 * * * *"');
    expect(viteConfig).not.toContain('"*/5 * * * *"');
    expect(worker).toContain("async scheduled");
    expect(worker).toContain("runInterimSchedulerInvocation");
    expect(worker).toContain('readCaptureGate(env) !== "true"');
    expect(worker).not.toContain("runBackgroundMaintenance");
    expect(readFileSync("src/components/nflverse-refresh-beacon.tsx", "utf8")).toContain('method: "GET"');
    expect(readFileSync("src/components/nflverse-refresh-beacon.tsx", "utf8")).not.toContain('method: "POST"');
    expect(readFileSync("src/server/background-maintenance.ts", "utf8")).toContain("allowCatchup: true");
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain("@fontsource/roboto/900.css");
    expect(readFileSync("src/app/globals.css", "utf8")).toContain('--display: "Roboto"');
    expect(readFileSync("src/server/nflverse/automation.ts", "utf8")).not.toContain("refreshPlayerStatsSeason");
    expect(readFileSync("src/server/nflverse/automation.ts", "utf8")).not.toContain("refreshSnapCountsSeason");
    expect(readFileSync("src/server/nflverse/automation.ts", "utf8")).toContain("publication remains disabled");
    expect(readFileSync("src/server/providers/nflverse.ts", "utf8")).toContain("stats_player_week_");
    expect(readFileSync("src/server/providers/nflverse.ts", "utf8")).toContain("snap_counts_");
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
    const propLeg = { ...leg("prop", "Over", 55.5), sourceQuoteId: "prop-1", selection: "DK Metcalf Over 55.5" };
    expect(gradeStoredLeg(propLeg, final, new Map([["prop-1", {
      sourceQuoteId: "prop-1", gameId: final.gameId, player: "DK Metcalf", market: "player_reception_yds",
      value: 72, sourceHash: "stats-and-snaps", voided: false
    }]]))).toBe("win");
    expect(gradeStoredLeg(propLeg, final, new Map([["prop-1", {
      sourceQuoteId: "prop-1", gameId: final.gameId, player: "DK Metcalf", market: "player_reception_yds",
      value: null, sourceHash: "snaps", voided: true
    }]]))).toBe("void");

    const worker = readFileSync("worker/index.ts", "utf8");
    const maintenance = readFileSync("src/server/background-maintenance.ts", "utf8");
    const settlement = readFileSync("src/server/automatic-settlement.ts", "utf8");
    expect(worker).toContain("runInterimSchedulerInvocation");
    expect(worker).not.toContain("runBackgroundMaintenance");
    expect(maintenance).not.toContain("settleCompletedTeamPlays");
    expect(maintenance).toContain("runKickoffWeatherAutomation");
    expect(settlement).toContain("play_settlement_audit");
    expect(settlement).toContain("calculateStoredPlayClosingValue");
    expect(settlement).toContain("play_clv_audit");
    expect(settlement).toContain("nflverse_finals_player_stats_snap_counts");
  });
});
