import { calculateTranslatedClv } from "@/domain/clv";
import { decimalToAmerican } from "@/domain/line-board";
import { americanToDecimal, quoteCostCents } from "@/domain/odds";
import type { StoredPlayLeg } from "@/domain/play-card";
import type { DiscreteMarginArtifact, OddsSnapshot } from "@/domain/types";

export interface ClosingSnapshotRow {
  snapshot_key: string;
  line_id: string;
  game_id: string;
  book: "betmgm" | "fanduel";
  market: "spread" | "total" | "moneyline";
  side: string;
  point: number | null;
  american_price: number;
  captured_at: string;
  source_hash: string;
  fetched_at: string;
}

export interface PlayClosingValue {
  cents: number | null;
  points: number | null;
  referenceBook: "BetMGM" | "FanDuel" | null;
  syntheticClosingAmerican: number | null;
  detail: Array<{ gameId: string; book: string; cents: number | null; points: number | null }>;
}

type Book = ClosingSnapshotRow["book"];
type ClosingCandidate = {
  book: Book;
  syntheticAmerican: number | null;
  cents: number | null;
  points: number | null;
  detail: PlayClosingValue["detail"];
};

function displayBook(book: Book): PlayClosingValue["referenceBook"] {
  return book === "betmgm" ? "BetMGM" : "FanDuel";
}

function normalizedBook(book: string): Book | null {
  const value = book.toLowerCase().replaceAll(/[^a-z]/g, "");
  if (value === "betmgm") return "betmgm";
  if (value === "fanduel") return "fanduel";
  return null;
}

function asSnapshot(row: ClosingSnapshotRow): OddsSnapshot {
  return {
    id: `${row.snapshot_key}:${row.line_id}`,
    gameId: row.game_id,
    book: row.book,
    market: row.market,
    side: row.side,
    point: row.point,
    americanPrice: row.american_price,
    capturedAt: row.captured_at,
    sourceHash: row.source_hash,
    quota: { used: 0, remaining: 0, lastCost: 0 }
  };
}

function closingGroup(input: {
  rows: readonly ClosingSnapshotRow[];
  gameId: string;
  book: Book;
  market: ClosingSnapshotRow["market"];
  kickoffAt: string;
}): ClosingSnapshotRow[] {
  // A close is the last complete pre-kickoff two-way market, never a partial or post-kickoff row.
  const kickoff = Date.parse(input.kickoffAt);
  const groups = new Map<string, ClosingSnapshotRow[]>();
  for (const row of input.rows) {
    if (row.game_id !== input.gameId || row.book !== input.book || row.market !== input.market ||
      Date.parse(row.fetched_at) > kickoff || Date.parse(row.captured_at) > kickoff) continue;
    const current = groups.get(row.snapshot_key) ?? [];
    current.push(row);
    groups.set(row.snapshot_key, current);
  }
  return [...groups.values()]
    .filter((group) => new Set(group.map((row) => row.side.toLowerCase())).size >= 2)
    .sort((left, right) => right[0].fetched_at.localeCompare(left[0].fetched_at))[0] ?? [];
}

function selectedRow(group: readonly ClosingSnapshotRow[], leg: StoredPlayLeg): ClosingSnapshotRow | null {
  return group.find((row) => row.side.toLowerCase() === leg.side.toLowerCase()) ?? null;
}

function consensusSelectedPoint(input: {
  rows: readonly ClosingSnapshotRow[];
  leg: StoredPlayLeg;
  kickoffAt: string;
}): number | null {
  const market = input.leg.market === "teaser" ? "spread" : input.leg.market;
  if (market === "prop") return null;
  const points = (["betmgm", "fanduel"] as const).flatMap((book) => {
    const row = selectedRow(closingGroup({ rows: input.rows, gameId: input.leg.gameId, book, market, kickoffAt: input.kickoffAt }), input.leg);
    return row?.point === null || row?.point === undefined ? [] : [row.point];
  });
  return points.length ? points.reduce((sum, point) => sum + point, 0) / points.length : null;
}

function legClosingValue(input: {
  rows: readonly ClosingSnapshotRow[];
  leg: StoredPlayLeg;
  book: Book;
  kickoffAt: string;
  artifact: DiscreteMarginArtifact | null;
}): { syntheticAmerican: number | null; cents: number | null; points: number | null } | null {
  if (input.leg.market === "prop") return null;
  const market = input.leg.market === "teaser" ? "spread" : input.leg.market;
  const group = closingGroup({ rows: input.rows, gameId: input.leg.gameId, book: input.book, market, kickoffAt: input.kickoffAt });
  const selected = selectedRow(group, input.leg);
  const opponent = group.find((row) => row.line_id !== selected?.line_id && row.side.toLowerCase() !== input.leg.side.toLowerCase());
  if (!selected || !opponent) return null;
  if (market === "moneyline" || input.leg.point === selected.point) {
    return {
      syntheticAmerican: selected.american_price,
      cents: quoteCostCents(selected.american_price) - quoteCostCents(input.leg.americanPrice),
      points: market === "moneyline" ? null : 0
    };
  }
  if (input.leg.point === null || selected.point === null) return null;
  const pointClv = market === "total"
    ? input.leg.side.toLowerCase() === "over"
      ? selected.point - input.leg.point
      : input.leg.point - selected.point
    : input.leg.point - selected.point;
  if (market === "total" || !input.artifact) {
    return { syntheticAmerican: null, cents: null, points: pointClv };
  }
  const consensusPoint = consensusSelectedPoint({ rows: input.rows, leg: input.leg, kickoffAt: input.kickoffAt });
  if (consensusPoint === null) return { syntheticAmerican: null, cents: null, points: pointClv };
  const clv = calculateTranslatedClv({
    entryPrice: input.leg.americanPrice,
    entryPoint: input.leg.point,
    closingQuote: asSnapshot(selected),
    closingOpponentQuote: asSnapshot(opponent),
    consensusSpread: consensusPoint,
    artifact: input.artifact
  });
  return { syntheticAmerican: clv.syntheticClosingAmerican, cents: clv.priceClvCents, points: clv.pointClv };
}

export function calculateStoredPlayClosingValue(input: {
  play: {
    playType: "single" | "parlay" | "teaser";
    book: string;
    americanOdds: number;
    executionStatus: "paper" | "executed";
    contract: readonly StoredPlayLeg[];
  };
  rows: readonly ClosingSnapshotRow[];
  kickoffByGame: ReadonlyMap<string, string>;
  artifact: DiscreteMarginArtifact | null;
}): PlayClosingValue {
  const executedBook = normalizedBook(input.play.book);
  const books: Book[] = input.play.executionStatus === "executed"
    ? executedBook ? [executedBook] : []
    : ["betmgm", "fanduel"];
  const candidates: ClosingCandidate[] = [];
  for (const book of books) {
    const legValues = input.play.contract.map((leg) => {
      const kickoffAt = input.kickoffByGame.get(leg.gameId);
      return kickoffAt ? legClosingValue({ rows: input.rows, leg, book, kickoffAt, artifact: input.artifact }) : null;
    });
    if (!legValues.length || legValues.some((value) => value === null)) continue;
    const values = legValues as Array<NonNullable<typeof legValues[number]>>;
    const points = values.flatMap((value) => value.points === null ? [] : [value.points]);
    const detail = values.map((value, index) => ({
      gameId: input.play.contract[index].gameId,
      book: displayBook(book)!,
      cents: value.cents,
      points: value.points
    }));
    if (input.play.playType === "teaser") {
      candidates.push({ book, syntheticAmerican: null, cents: null, points: points.length ? points.reduce((sum, value) => sum + value, 0) / points.length : null, detail });
      continue;
    }
    if (values.some((value) => value.syntheticAmerican === null)) {
      candidates.push({ book, syntheticAmerican: null, cents: null, points: points.length ? points.reduce((sum, value) => sum + value, 0) / points.length : null, detail });
      continue;
    }
    const syntheticAmerican = input.play.playType === "single"
      ? values[0].syntheticAmerican!
      : decimalToAmerican(values.reduce((product, value) => product * americanToDecimal(value.syntheticAmerican!), 1));
    candidates.push({
      book,
      syntheticAmerican,
      cents: quoteCostCents(syntheticAmerican) - quoteCostCents(input.play.americanOdds),
      points: points.length ? points.reduce((sum, value) => sum + value, 0) / points.length : null,
      detail
    });
  }
  if (!candidates.length) return { cents: null, points: null, referenceBook: null, syntheticClosingAmerican: null, detail: [] };
  const chosen = [...candidates].sort((left, right) => {
    if (left.syntheticAmerican !== null && right.syntheticAmerican !== null) {
      return quoteCostCents(left.syntheticAmerican) - quoteCostCents(right.syntheticAmerican);
    }
    return (right.points ?? Number.NEGATIVE_INFINITY) - (left.points ?? Number.NEGATIVE_INFINITY);
  })[0];
  return {
    cents: chosen.cents,
    points: chosen.points,
    referenceBook: displayBook(chosen.book),
    syntheticClosingAmerican: chosen.syntheticAmerican,
    detail: chosen.detail
  };
}
