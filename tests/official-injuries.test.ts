import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOfficialNflInjuryHtml } from "@/server/official-injuries/parser";

function unit(input: {
  away: string;
  home: string;
  awayName: string;
  homeName: string;
  awayRows?: string;
  homeRows?: string;
}): string {
  const table = (team: string, body = "") => `<div class="nfl-t-stats__title"><div class="d3-o-section-sub-title"><span>${team}</span></div></div>
    <div class="d3-o-table--horizontal-scroll"><table><tbody>${body}</tbody></table></div>`;
  return `<section class="nfl-o-injury-report__unit">
    <span class="nfl-c-matchup-strip__team-abbreviation"> ${input.away} </span>
    <span class="nfl-c-matchup-strip__team-abbreviation"> ${input.home} </span>
    ${table(input.awayName, input.awayRows)}${table(input.homeName, input.homeRows)}
  </section>`;
}

const playerRow = `<tr><td><a href="/players/ja-tavion-sanders/"> Ja&#x27;Tavion Sanders </a></td>
  <td>TE</td><td>Shoulder</td><td>Limited Participation in Practice</td><td>Questionable</td></tr>`;

describe("official NFL injury importer", () => {
  it("normalizes complete official HTML and preserves teams with no reported injuries", () => {
    const html = `<h1>Injuries - WEEK 1</h1>${unit({
      away: "NE", home: "SEA", awayName: "Patriots", homeName: "Seahawks", awayRows: playerRow
    })}${unit({
      away: "SF", home: "LA", awayName: "49ers", homeName: "Rams"
    })}`;
    const parsed = parseOfficialNflInjuryHtml({
      html,
      season: 2026,
      week: 1,
      schedule: [
        { gameId: "ne-sea", awayTeam: "NE", homeTeam: "SEA" },
        { gameId: "sf-lar", awayTeam: "SF", homeTeam: "LAR" }
      ]
    });
    expect(parsed.coveredTeams).toEqual(["LAR", "NE", "SEA", "SF"]);
    expect(parsed.gameIds).toEqual(["ne-sea", "sf-lar"]);
    expect(parsed.injuries).toHaveLength(1);
    expect(parsed.injuries[0]).toMatchObject({
      gameId: "ne-sea",
      team: "NE",
      player: "Ja'Tavion Sanders",
      position: "TE",
      injuries: "Shoulder",
      practiceStatus: "Limited Participation in Practice",
      gameStatus: "Questionable"
    });
    expect(parsed.rawSnapshotHash).toHaveLength(64);
  });

  it("rejects a partial page before it can replace the last good snapshot", () => {
    const html = `<h1>Injuries - WEEK 1</h1>${unit({
      away: "NE", home: "SEA", awayName: "Patriots", homeName: "Seahawks"
    })}`;
    expect(() => parseOfficialNflInjuryHtml({
      html,
      season: 2026,
      week: 1,
      schedule: [
        { gameId: "ne-sea", awayTeam: "NE", homeTeam: "SEA" },
        { gameId: "sf-lar", awayTeam: "SF", homeTeam: "LAR" }
      ]
    })).toThrow("Partial official injury imports are prohibited");
  });

  it("recognizes the official preseason placeholder as not yet published", () => {
    expect(() => parseOfficialNflInjuryHtml({
      html: "<title>Official NFL Injury Report for Players - Week 1 of the 2026 Season | NFL.com</title>",
      season: 2026,
      week: 1,
      schedule: [{ gameId: "ne-sea", awayTeam: "NE", homeTeam: "SEA" }]
    })).toThrow("Official NFL injury reports are not published for Week 1");
  });

  it("keeps the feed off the site and quarantined from the interim scheduler", () => {
    const worker = readFileSync("worker/index.ts", "utf8");
    const maintenance = readFileSync("src/server/background-maintenance.ts", "utf8");
    const navigation = readFileSync("src/components/nav-links.tsx", "utf8");
    expect(worker).toContain("runInterimSchedulerInvocation");
    expect(worker).toContain('readCaptureGate(env) !== "true"');
    expect(worker).not.toContain("runBackgroundMaintenance");
    expect(maintenance).toContain("runOfficialInjuryAutomation");
    expect(worker).toContain('/api/game-context');
    expect(navigation).not.toContain('"Research"');
    expect(navigation).not.toContain('"Model"');
  });
});
