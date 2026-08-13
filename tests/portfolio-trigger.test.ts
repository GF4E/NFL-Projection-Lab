import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { contractGuardTriggerSql, portfolioTriggerSql } from "@/domain/portfolio-trigger";

type Leg = { gameId: string; market: "spread" | "moneyline" | "total" | "prop" | "teaser" };

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE plays (
    id text PRIMARY KEY NOT NULL,
    contract_json text NOT NULL,
    forecast_json text,
    season integer NOT NULL,
    week integer NOT NULL,
    game_id text NOT NULL,
    play_type text NOT NULL,
    market text NOT NULL,
    status text NOT NULL,
    stake_cents integer NOT NULL
  )`);
  db.exec(contractGuardTriggerSql());
  db.exec(portfolioTriggerSql());
  return db;
}

function add(
  db: DatabaseSync,
  id: string,
  status: string,
  units: number,
  contract: Leg[],
  week = 1,
  playType: "single" | "parlay" | "teaser" = "single"
): void {
  const storedContract = contract.map((item, index) => ({ ...item, sourceQuoteId: `${id}:quote:${index}` }));
  const market = playType === "single" ? contract[0]?.market ?? "spread" : playType;
  const gameId = playType === "single" ? contract[0]?.gameId ?? "missing" : `multi:${id}`;
  const forecast = {
    configHash: "config",
    dataHash: "data",
    consensusSnapshotId: "consensus",
    authoritativeProbabilityInterval: [0.53, 0.6],
    suggestedUnits: 1,
    authoritativeExpectedValuePercent: playType === "teaser" ? 2 : null,
    legs: storedContract
  };
  db.prepare(`INSERT INTO plays
    (id, contract_json, forecast_json, season, week, game_id, play_type, market, status, stake_cents)
    VALUES (?, ?, ?, 2026, ?, ?, ?, ?, ?, ?)`)
    .run(id, JSON.stringify(storedContract), JSON.stringify(forecast), week, gameId, playType, market, status, units * 2_500);
}

describe("atomic shared-card portfolio guard", () => {
  it("blocks an approval without complete frozen forecast provenance", () => {
    const db = database();
    add(db, "missing-provenance", "research", 1, [{ gameId: "g1", market: "spread" }]);
    db.prepare("UPDATE plays SET forecast_json = NULL WHERE id = 'missing-provenance'").run();
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'missing-provenance'").run())
      .toThrow(/forecast and consensus snapshot/i);
    db.close();
  });

  it("permits one side plus one total and blocks a second side or total", () => {
    const db = database();
    add(db, "side", "card", 1, [{ gameId: "g1", market: "spread" }]);
    add(db, "total", "research", 1, [{ gameId: "g1", market: "total" }]);
    db.prepare("UPDATE plays SET status = 'card' WHERE id = 'total'").run();
    add(db, "second-side", "research", 0.5, [{ gameId: "g1", market: "moneyline" }]);
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'second-side'").run()).toThrow(/one side/i);
    add(db, "second-total", "research", 0.5, [{ gameId: "g1", market: "total" }]);
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'second-total'").run()).toThrow(/one total/i);
    db.close();
  });

  it("blocks more than 3u on any represented game", () => {
    const db = database();
    add(db, "prop-one", "card", 2, [{ gameId: "g1", market: "prop" }]);
    add(db, "prop-two", "research", 1.5, [{ gameId: "g1", market: "prop" }]);
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'prop-two'").run()).toThrow(/3u/);
    db.close();
  });

  it("serializes approvals against the 10u weekly ceiling", () => {
    const db = database();
    for (let index = 0; index < 5; index += 1) {
      add(db, `official-${index}`, "card", 2, [{ gameId: `g${index}`, market: "prop" }]);
    }
    add(db, "over-cap", "research", 0.5, [{ gameId: "g9", market: "prop" }]);
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'over-cap'").run()).toThrow(/10u/);
    db.close();
  });

  it("keeps settled picks inside the official weekly exposure ceiling", () => {
    const db = database();
    for (let index = 0; index < 5; index += 1) {
      add(db, `settled-${index}`, "settled", 2, [{ gameId: `g${index}`, market: "prop" }]);
    }
    add(db, "late-over-cap", "research", 0.5, [{ gameId: "g9", market: "prop" }]);
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'late-over-cap'").run()).toThrow(/10u/);
    db.close();
  });

  it("atomically blocks same-game parlays and malformed teasers", () => {
    const db = database();
    add(db, "same-game", "research", 1, [
      { gameId: "g1", market: "spread" },
      { gameId: "g1", market: "prop" }
    ], 1, "parlay");
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'same-game'").run()).toThrow(/independent-game/i);
    add(db, "bad-teaser", "research", 1, [
      { gameId: "g2", market: "teaser" },
      { gameId: "g3", market: "spread" }
    ], 1, "teaser");
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'bad-teaser'").run()).toThrow(/two-game teaser/i);
    db.close();
  });

  it("blocks below-floor singles and teasers even when browser EV is positive", () => {
    const db = database();
    add(db, "below-floor", "research", 0.5, [{ gameId: "g1", market: "spread" }]);
    const stored = db.prepare("SELECT forecast_json FROM plays WHERE id = 'below-floor'").get() as { forecast_json: string };
    const forecast = JSON.parse(stored.forecast_json) as Record<string, unknown>;
    db.prepare("UPDATE plays SET forecast_json = ? WHERE id = 'below-floor'")
      .run(JSON.stringify({ ...forecast, suggestedUnits: 0 }));
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'below-floor'").run())
      .toThrow(/Kelly inclusion/i);

    add(db, "teaser-floor", "research", 0.5, [
      { gameId: "g2", market: "teaser" },
      { gameId: "g3", market: "teaser" }
    ], 1, "teaser");
    const teaserStored = db.prepare("SELECT forecast_json FROM plays WHERE id = 'teaser-floor'").get() as { forecast_json: string };
    const teaserForecast = JSON.parse(teaserStored.forecast_json) as Record<string, unknown>;
    db.prepare("UPDATE plays SET forecast_json = ? WHERE id = 'teaser-floor'")
      .run(JSON.stringify({ ...teaserForecast, authoritativeExpectedValuePercent: 5, suggestedUnits: 0 }));
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'teaser-floor'").run())
      .toThrow(/Kelly inclusion/i);
    db.close();
  });

  it("atomically enforces preferred-team exception thresholds", () => {
    const db = database();
    add(db, "preferred-side", "research", 0.5, [{ gameId: "g1", market: "spread" }]);
    const sideRow = db.prepare("SELECT forecast_json FROM plays WHERE id = 'preferred-side'").get() as { forecast_json: string };
    const sideForecast = JSON.parse(sideRow.forecast_json) as { legs: Array<Record<string, unknown>> };
    sideForecast.legs[0] = {
      ...sideForecast.legs[0], preferenceConflict: true, marketProbability: 0.5, betProbability: 0.529
    };
    db.prepare("UPDATE plays SET forecast_json = ? WHERE id = 'preferred-side'").run(JSON.stringify(sideForecast));
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'preferred-side'").run())
      .toThrow(/exceptional edge/i);

    add(db, "preferred-teaser", "research", 0.5, [
      { gameId: "g2", market: "teaser" },
      { gameId: "g3", market: "teaser" }
    ], 1, "teaser");
    const teaserRow = db.prepare("SELECT forecast_json FROM plays WHERE id = 'preferred-teaser'").get() as { forecast_json: string };
    const teaserForecast = JSON.parse(teaserRow.forecast_json) as { legs: Array<Record<string, unknown>>; authoritativeExpectedValuePercent: number };
    teaserForecast.legs[0] = { ...teaserForecast.legs[0], preferenceConflict: true };
    teaserForecast.authoritativeExpectedValuePercent = 4.99;
    db.prepare("UPDATE plays SET forecast_json = ? WHERE id = 'preferred-teaser'").run(JSON.stringify(teaserForecast));
    expect(() => db.prepare("UPDATE plays SET status = 'card' WHERE id = 'preferred-teaser'").run())
      .toThrow(/exceptional EV/i);
    db.close();
  });
});
