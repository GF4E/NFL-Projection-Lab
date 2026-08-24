import { describe, expect, it } from "vitest";
import {
  interpretMarketSentiment,
  selectMaterialMarketSentiment,
  type MarketSentimentSnapshot
} from "@/domain/market-sentiment";
import { parseActionNetworkSentiment } from "@/server/market-sentiment/parser";

function actionHtml(): string {
  const game = {
    id: 9001,
    start_time: "2026-09-13T20:25:00.000Z",
    away_team_id: 1,
    home_team_id: 2,
    type: "reg",
    season: 2026,
    week: 1,
    num_bets: 8840,
    teams: [{ id: 1, abbr: "NE" }, { id: 2, abbr: "SEA" }],
    markets: {
      "42": { event: {
        spread: [
          { team_id: 1, side: "away", bet_info: { tickets: { percent: 45 }, money: { percent: 34 } } },
          { team_id: 2, side: "home", bet_info: { tickets: { percent: 55 }, money: { percent: 66 } } }
        ],
        total: [
          { side: "over", bet_info: { tickets: { percent: 64 }, money: { percent: 61 } } },
          { side: "under", bet_info: { tickets: { percent: 36 }, money: { percent: 39 } } }
        ],
        moneyline: [
          { team_id: 1, side: "away", bet_info: { tickets: { percent: 40 }, money: { percent: 42 } } },
          { team_id: 2, side: "home", bet_info: { tickets: { percent: 60 }, money: { percent: 58 } } }
        ]
      } }
    }
  };
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { scoreboardResponse: { games: [game] } } }
  })}</script></html>`;
}

describe("public ticket and money sentiment", () => {
  it("parses complete two-way markets without relying on a fixed sportsbook id", () => {
    const feed = parseActionNetworkSentiment(actionHtml(), "2026-09-13T18:00:00.000Z");
    expect(feed).toMatchObject({ season: 2026, seasonType: "reg", week: 1 });
    expect(feed.rows).toHaveLength(6);
    expect(feed.rows.find((row) => row.market === "spread" && row.side === "SEA")).toMatchObject({
      ticketsPercent: 55, moneyPercent: 66, sampleBets: 8840, awayTeam: "NE", homeTeam: "SEA"
    });
  });

  it("qualifies sharp pressure as a possible signal and gates small samples", () => {
    const base: MarketSentimentSnapshot = {
      gameId: "ne-sea", providerGameId: "9001", market: "spread", side: "SEA",
      ticketsPercent: 55, moneyPercent: 66, sampleBets: 8840,
      capturedAt: "2026-09-13T18:00:00.000Z", sourceUrl: "https://example.test", sourceHash: "hash"
    };
    expect(interpretMarketSentiment(base)).toMatchObject({
      adequateSample: true, material: true, moneyTicketGap: 11,
      classification: "possible_sharp_pressure"
    });
    expect(interpretMarketSentiment({ ...base, sampleBets: 200 })).toMatchObject({
      adequateSample: false, material: false, classification: "insufficient_sample"
    });
  });

  it("keeps one concise material read per market", () => {
    const feed = parseActionNetworkSentiment(actionHtml(), "2026-09-13T18:00:00.000Z");
    const rows = feed.rows.map((row) => ({
      gameId: "ne-sea", providerGameId: row.providerGameId, market: row.market, side: row.side,
      ticketsPercent: row.ticketsPercent, moneyPercent: row.moneyPercent, sampleBets: row.sampleBets,
      capturedAt: feed.capturedAt, sourceUrl: "https://example.test", sourceHash: feed.sourceHash
    }));
    expect(selectMaterialMarketSentiment(rows).map((row) => `${row.market}:${row.side}`)).toEqual([
      "spread:SEA", "total:Over", "moneyline:SEA"
    ]);
  });
});
