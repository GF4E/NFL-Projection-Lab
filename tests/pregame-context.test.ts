import { describe, expect, it } from "vitest";
import {
  discoverOfficialInactiveArticles,
  officialGameCenterUrl,
  parseOfficialGameInactives,
  parseOfficialRoofDesignation
} from "@/server/pregame-context/parser";
import { isPregameContextDue } from "@/server/pregame-context/automation";
import { effectiveKickoffRoof } from "@/server/weather/automation";

const officialArticleHtml = `<main>
  <div class="story-part-rich-text-editor-wrapper">
    <h3><span>PATRIOTS</span></h3>
    <ul><li>QB Drake Backup</li><li><span>WR Example Receiver</span></li></ul>
    <p><br /></p>
    <h3>SEAHAWKS</h3>
    <ul><li>CB Example Corner</li><li>OL Example Tackle</li></ul>
  </div>
</main>`;

describe("official kickoff-minus-90 context", () => {
  it("normalizes complete two-team NFL article lists and extracts positions", () => {
    const parsed = parseOfficialGameInactives({
      html: officialArticleHtml,
      gameId: "ne-sea",
      awayTeam: "NE",
      homeTeam: "SEA"
    });
    expect(parsed?.teams).toEqual(["NE", "SEA"]);
    expect(parsed?.players).toHaveLength(4);
    expect(parsed?.players[0]).toMatchObject({ team: "NE", position: "QB", player: "Drake Backup" });
    expect(parsed?.rawSnapshotHash).toHaveLength(64);
  });

  it("withholds partial inactive lists instead of publishing one team", () => {
    expect(parseOfficialGameInactives({
      html: `<h3>PATRIOTS</h3><ul><li>QB Drake Backup</li></ul>`,
      gameId: "ne-sea",
      awayTeam: "NE",
      homeTeam: "SEA"
    })).toBeNull();
  });

  it("discovers current-week official NFL articles from the versioned monthly index", () => {
    const links = discoverOfficialInactiveArticles({
      html: `<a href="/news/older-week-2-inactives">Old</a>
        <a href="/news/nfl-week-3-inactives-players-ruled-out">Current</a>
        <a href="/news/week-3-preview">Not an inactive article</a>`,
      season: 2026,
      week: 3
    });
    expect(links[0]).toBe("https://www.nfl.com/news/nfl-week-3-inactives-players-ruled-out");
    expect(links).not.toContain("https://www.nfl.com/news/week-3-preview");
  });

  it("requires an explicit roof field for retractable venues", () => {
    expect(parseOfficialRoofDesignation("<dt>ROOF</dt><dd>OPEN</dd>")).toBe("open");
    expect(parseOfficialRoofDesignation('<script>{"roofStatus":"closed"}</script>')).toBe("closed");
    expect(parseOfficialRoofDesignation("<dt>STADIUM</dt><dd>STATE FARM STADIUM</dd>")).toBeNull();
    expect(effectiveKickoffRoof("unconfirmed", null)).toBe("unconfirmed");
    expect(effectiveKickoffRoof("unconfirmed", { freshness: "current", inactivesConfirmed: true, roof: "open" })).toBe("open");
    expect(effectiveKickoffRoof("unconfirmed", { freshness: "stale", inactivesConfirmed: true, roof: "open" })).toBe("unconfirmed");
    expect(effectiveKickoffRoof("fixed", null)).toBe("fixed");
  });

  it("runs on the five-minute cron only inside the kickoff-minus-95 window and stops after success", () => {
    const now = new Date("2026-09-09T23:46:00Z");
    expect(isPregameContextDue({
      kickoffAt: "2026-09-10T00:20:00Z",
      now,
      inactivesConfirmed: false,
      lastCheckedAt: null
    })).toBe(true);
    expect(isPregameContextDue({
      kickoffAt: "2026-09-10T00:20:00Z",
      now,
      inactivesConfirmed: true,
      lastCheckedAt: null
    })).toBe(false);
    expect(isPregameContextDue({
      kickoffAt: "2026-09-10T02:00:00Z",
      now,
      inactivesConfirmed: false,
      lastCheckedAt: null
    })).toBe(false);
  });

  it("forms official game-center URLs from normalized team slugs", () => {
    expect(officialGameCenterUrl({ awayTeam: "NE", homeTeam: "SEA", season: 2026, week: 1 }))
      .toBe("https://www.nfl.com/games/patriots-at-seahawks-2026-reg-1");
  });
});
