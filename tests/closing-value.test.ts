import { describe, expect, it } from "vitest";
import { calculateStoredPlayClosingValue, type ClosingSnapshotRow } from "@/server/closing-value";
import { artifact } from "./fixtures";

function marketRows(book: "betmgm" | "fanduel", prices: [number, number], points: [number, number] = [-3, 3]): ClosingSnapshotRow[] {
  const snapshot = `${book}:close`;
  return [
    { snapshot_key: snapshot, line_id: `${book}:sea`, game_id: "ne-sea", book, market: "spread", side: "SEA", point: points[0], american_price: prices[0], captured_at: "2026-09-13T19:50:00Z", source_hash: "hash", fetched_at: "2026-09-13T19:50:01Z" },
    { snapshot_key: snapshot, line_id: `${book}:ne`, game_id: "ne-sea", book, market: "spread", side: "NE", point: points[1], american_price: prices[1], captured_at: "2026-09-13T19:50:00Z", source_hash: "hash", fetched_at: "2026-09-13T19:50:01Z" }
  ];
}

const kickoff = new Map([["ne-sea", "2026-09-13T20:05:00Z"]]);
const contract = [{ gameId: "ne-sea", market: "spread" as const, side: "SEA", point: -3, americanPrice: -110, selection: "SEA -3" }];

describe("book-specific closing line value", () => {
  it("uses the executed book's last complete pre-kickoff market", () => {
    const value = calculateStoredPlayClosingValue({
      play: { playType: "single", book: "BetMGM", americanOdds: -110, executionStatus: "executed", contract },
      rows: [...marketRows("betmgm", [-120, 100]), ...marketRows("fanduel", [-105, -115])],
      kickoffByGame: kickoff,
      artifact
    });
    expect(value.referenceBook).toBe("BetMGM");
    expect(value.cents).toBeGreaterThan(0);
    expect(value.points).toBe(0);
  });

  it("uses the better of the two book closes for paper entries", () => {
    const value = calculateStoredPlayClosingValue({
      play: { playType: "single", book: "BetMGM", americanOdds: -110, executionStatus: "paper", contract },
      rows: [...marketRows("betmgm", [-130, 110]), ...marketRows("fanduel", [-105, -115])],
      kickoffByGame: kickoff,
      artifact
    });
    expect(value.referenceBook).toBe("FanDuel");
    expect(value.cents).toBeLessThan(0);
  });

  it("translates a different spread point and separately reports directional point CLV", () => {
    const value = calculateStoredPlayClosingValue({
      play: { playType: "single", book: "BetMGM", americanOdds: -110, executionStatus: "executed", contract: [{ ...contract[0], point: -2.5, selection: "SEA -2.5" }] },
      rows: marketRows("betmgm", [-110, -110]),
      kickoffByGame: kickoff,
      artifact
    });
    expect(value.points).toBe(0.5);
    expect(value.cents).not.toBeNull();
  });

  it("withholds cents when a total moves points without a total-residual artifact", () => {
    const rows: ClosingSnapshotRow[] = [
      { snapshot_key: "mgm:total", line_id: "over", game_id: "ne-sea", book: "betmgm", market: "total", side: "Over", point: 45, american_price: -110, captured_at: "2026-09-13T19:50:00Z", source_hash: "hash", fetched_at: "2026-09-13T19:50:01Z" },
      { snapshot_key: "mgm:total", line_id: "under", game_id: "ne-sea", book: "betmgm", market: "total", side: "Under", point: 45, american_price: -110, captured_at: "2026-09-13T19:50:00Z", source_hash: "hash", fetched_at: "2026-09-13T19:50:01Z" }
    ];
    const value = calculateStoredPlayClosingValue({
      play: { playType: "single", book: "BetMGM", americanOdds: -110, executionStatus: "executed", contract: [{ gameId: "ne-sea", market: "total", side: "Over", point: 44, americanPrice: -110, selection: "Over 44" }] },
      rows,
      kickoffByGame: kickoff,
      artifact
    });
    expect(value.points).toBe(1);
    expect(value.cents).toBeNull();
  });
});
