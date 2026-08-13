// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeekOneBoard } from "@/components/week-one-board";
import type { DecisionBoardPayload, PlayerPropBoard } from "@/domain/decision-board";
import type { LiveLine } from "@/domain/line-board";
import type { WeeklyMatchup, WeeklySlate } from "@/domain/weekly-slate";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean; unoptimized?: boolean }) =>
    React.createElement("img", Object.fromEntries(
      Object.entries(props).filter(([key]) => key !== "priority" && key !== "unoptimized")
    ))
}));

const games: WeeklyMatchup[] = [
  {
    id: "ne-sea", sourceGameId: "2026_01_NE_SEA", season: 2026, week: 1,
    kickoffAt: "2026-09-10T00:20:00.000Z", day: "Wednesday", away: "NE",
    awayName: "New England Patriots", home: "SEA", homeName: "Seattle Seahawks",
    venue: "Lumen Field", network: "NBC", consensusHomePoint: -2.5,
    totalLine: 44.5, awayRest: 7, homeRest: 7
  },
  {
    id: "sf-lar", sourceGameId: "2026_01_SF_LA", season: 2026, week: 1,
    kickoffAt: "2026-09-11T00:35:00.000Z", day: "Thursday", away: "SF",
    awayName: "San Francisco 49ers", home: "LAR", homeName: "Los Angeles Rams",
    venue: "Melbourne Cricket Ground", network: "Netflix", consensusHomePoint: -1.5,
    totalLine: 47.5, awayRest: 7, homeRest: 7
  }
];

const slate: WeeklySlate = {
  season: 2026,
  week: 1,
  generatedAt: "2026-08-13T20:00:00.000Z",
  games
};

function board(): DecisionBoardPayload {
  return {
    generatedAt: "2026-08-13T20:00:00.000Z", season: 2026, week: 1,
    basisSeason: 2025, artifactHash: "artifact", configHash: "config", dataHash: "data",
    championHash: "champion", ensembleHash: "ensemble", championStatus: "compatible",
    teaserPairs: [], marketCoverage: [], method: "test",
    games: games.map((game) => ({
      gameId: game.id, awayTeam: game.away, homeTeam: game.home, away: null, home: null,
      projections: [], totals: [], moneylines: [], teasers: [], signals: [], movements: [],
      evidence: {
        status: "current", provider: "nflverse", throughSeason: 2025, throughWeek: 18,
        throughDate: "2026-01-04", expectedThroughSeason: 2025, expectedThroughWeek: 18,
        featureGames: 544
      },
      availability: {
        status: "pending", reportedPlayers: 0, inactivesConfirmed: false, inactivePlayers: 0,
        out: 0, doubtful: 0, questionable: 0, qbListed: 0, qbOutOrDoubtful: 0,
        qbInactive: 0, capturedAt: null
      },
      weather: {
        status: "pending", roof: "unconfirmed", windMph: null, temperatureF: null,
        precipitationProbability: null, capturedAt: null, totalAdjustmentPoints: 0,
        trainingGames: null
      },
      quarterbacks: {
        configStatus: "withheld", forecastHandling: "market_only",
        away: { team: game.away, referenceStarter: null, referenceSource: "unavailable", availability: "unconfirmed", backupTier: null, learnedPointPrior: null, ownerOverridePoints: null, appliedTeamMarginPoints: 0, sourceTimestamp: null, auditHash: `${game.id}:away` },
        home: { team: game.home, referenceStarter: null, referenceSource: "unavailable", availability: "unconfirmed", backupTier: null, learnedPointPrior: null, ownerOverridePoints: null, appliedTeamMarginPoints: 0, sourceTimestamp: null, auditHash: `${game.id}:home` }
      }
    }))
  };
}

function propBoard(gameId: string): PlayerPropBoard {
  return {
    gameId, status: "unavailable", generatedAt: "2026-08-13T20:00:00.000Z",
    eventId: null, candidates: [], quota: null, message: "No qualified props yet."
  };
}

function response(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/weekly-slate")) return response(slate);
    if (url.startsWith("/api/lines")) return response({ lines: [], configured: true });
    if (url.startsWith("/api/plays")) return response({ plays: [], actor: "gabe" });
    if (url.startsWith("/api/decision-board")) return response(board());
    if (url.startsWith("/api/props")) return response(propBoard(new URL(url, "https://test.local").searchParams.get("gameId")!));
    throw new Error(`Unexpected request ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("compact weekly decision board", () => {
  it("replaces every colored letter badge with the matching transparent team-logo image", async () => {
    const { container } = render(<WeekOneBoard />);
    await screen.findByRole("heading", { name: "Week 1" });
    const logos = [...container.querySelectorAll<HTMLImageElement>("img.team-logo")];
    expect(logos).toHaveLength(games.length * 2);
    expect(logos.map((logo) => logo.getAttribute("src"))).toEqual([
      "/team-logos/ne.png", "/team-logos/sea.png", "/team-logos/sf.png", "/team-logos/lar.png"
    ]);
    expect(container.querySelector(".team-dot, .team-badge, .team-avatar")).toBeNull();
  });

  it("keeps one analysis window open and closes it by outside click or Escape", async () => {
    render(<WeekOneBoard />);
    const analyze = await screen.findAllByRole("button", { name: /ANALYZE/ });

    fireEvent.click(analyze[0]);
    await screen.findByText("NE @ SEA");
    expect(screen.getAllByText("DECISION WINDOW")).toHaveLength(1);

    fireEvent.click(analyze[1]);
    await screen.findByText("SF @ LAR");
    expect(screen.queryByText("NE @ SEA")).toBeNull();
    expect(screen.getAllByText("DECISION WINDOW")).toHaveLength(1);

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByText("DECISION WINDOW")).toBeNull());

    fireEvent.click(analyze[0]);
    await screen.findByText("NE @ SEA");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("DECISION WINDOW")).toBeNull());
  });

  it("keeps interactions inside the decision window from dismissing it", async () => {
    render(<WeekOneBoard />);
    const analyze = (await screen.findAllByRole("button", { name: /ANALYZE/ }))[0];
    fireEvent.click(analyze);
    const windowTitle = await screen.findByText("NE @ SEA");
    const decisionWindow = windowTitle.closest(".quick-picks");
    expect(decisionWindow).not.toBeNull();
    fireEvent.pointerDown(within(decisionWindow as HTMLElement).getByText("No viable path at this line."));
    await act(async () => {});
    expect(screen.getByText("NE @ SEA")).toBeTruthy();
  });

  it("co-locates only material contract evidence with an exact-price model bet", async () => {
    const capturedAt = "2026-08-13T20:00:00.000Z";
    const lines: LiveLine[] = [
      { id: "mgm-ne", gameId: "ne-sea", book: "betmgm", market: "spread", side: "NE", point: 3.5, americanPrice: -110, capturedAt, sourceEventId: "event", sourceHash: "ne", fairProbability: 0.5, marketVigPercent: 4.55 },
      { id: "mgm-sea", gameId: "ne-sea", book: "betmgm", market: "spread", side: "SEA", point: -3.5, americanPrice: -110, capturedAt, sourceEventId: "event", sourceHash: "sea", fairProbability: 0.5, marketVigPercent: 4.55 }
    ];
    const intelligence = board();
    intelligence.games[0].projections = [{
      gameId: "ne-sea", book: "betmgm", homeTeam: "SEA", marketHomePoint: -3.5,
      projectedHomePoint: -5.5, homeCoverProbability: 0.7, shrunkHomeProbability: 0.6,
      pushProbability: 0.02, edgeInterval: [0.04, 0.14], marketHomeProbability: 0.5,
      marketSource: "book", translationWarning: "none"
    }];
    intelligence.games[0].signals = [
      { id: "efficiency", label: "ADJ EPA", lean: "SEA", detail: "SEA O #4 vs NE D #24", strength: 20 },
      { id: "success", label: "DOWN-TO-DOWN", lean: "SEA", detail: "SEA O #6 vs NE D #22", strength: 16 },
      { id: "rest", label: "REST", lean: "NE", detail: "8 days vs 7 days", strength: 7 }
    ];
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/weekly-slate")) return response(slate);
      if (url.startsWith("/api/lines")) return response({ lines, configured: true });
      if (url.startsWith("/api/plays")) return response({ plays: [], actor: "gabe" });
      if (url.startsWith("/api/decision-board")) return response(intelligence);
      if (url.startsWith("/api/props")) return response(propBoard("ne-sea"));
      throw new Error(`Unexpected request ${url}`);
    });

    const { container } = render(<WeekOneBoard />);
    fireEvent.click(await screen.findByRole("button", { name: /1 PICKS/ }));
    await waitFor(() => expect(container.querySelectorAll(".contract-signal")).toHaveLength(2));
    const evidence = [...container.querySelectorAll(".contract-signal")].map((node) => node.textContent);
    expect(evidence.join(" ")).toContain("SEA O #4 vs NE D #24");
    expect(evidence.join(" ")).toContain("SEA O #6 vs NE D #22");
    expect(evidence.join(" ")).not.toContain("8 days vs 7 days");
  });
});
