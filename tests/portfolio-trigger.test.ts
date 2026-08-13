import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { portfolioTriggerSql } from "@/domain/portfolio-trigger";

type Leg = { gameId: string; market: "spread" | "moneyline" | "total" | "prop" | "teaser" };

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE plays (
    id text PRIMARY KEY NOT NULL,
    contract_json text NOT NULL,
    season integer NOT NULL,
    week integer NOT NULL,
    status text NOT NULL,
    stake_cents integer NOT NULL
  )`);
  db.exec(portfolioTriggerSql());
  return db;
}

function add(db: DatabaseSync, id: string, status: string, units: number, contract: Leg[], week = 1): void {
  db.prepare("INSERT INTO plays (id, contract_json, season, week, status, stake_cents) VALUES (?, ?, 2026, ?, ?, ?)")
    .run(id, JSON.stringify(contract), week, status, units * 2_500);
}

describe("atomic shared-card portfolio guard", () => {
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
});
