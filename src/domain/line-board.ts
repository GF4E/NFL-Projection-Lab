import { americanToDecimal, americanToImplied, impliedToAmerican, powerDevig } from "./odds";

export type LineBookKey = "betmgm" | "fanduel";
export type LineMarketKey = "spread" | "total" | "moneyline";

export type LiveLine = {
  id: string;
  gameId: string;
  book: LineBookKey;
  market: LineMarketKey;
  side: string;
  point: number | null;
  americanPrice: number;
  capturedAt: string;
  sourceEventId: string;
  sourceHash: string;
  fairProbability: number | null;
  marketVigPercent: number | null;
};

export type SlipLeg = Pick<LiveLine, "id" | "gameId" | "book" | "market" | "side" | "point" | "americanPrice" | "fairProbability"> & {
  matchup: string;
  selection: string;
};

export type ValueLeg = Pick<SlipLeg, "gameId" | "americanPrice" | "fairProbability"> & {
  pushProbability?: number;
};

export type SlipSelectionMode = "straight" | "parlay" | "teaser";
export type SlipSelectionIdentity = {
  id: string;
  book: LineBookKey;
  kind: "mainline" | "prop" | "teaser";
  thesisKey: string;
};

export function updateSlipSelections<T extends SlipSelectionIdentity>(
  current: readonly T[],
  leg: T,
  mode: SlipSelectionMode
): { legs: T[]; switchedBook: boolean } {
  if (current.some((item) => item.id === leg.id)) {
    return { legs: current.filter((item) => item.id !== leg.id), switchedBook: false };
  }
  const withoutSameThesis = current.filter((item) => item.thesisKey !== leg.thesisKey);
  if (mode === "straight") return { legs: [...withoutSameThesis, leg], switchedBook: false };
  const sameBook = withoutSameThesis.filter((item) => item.book === leg.book);
  const eligible = mode === "teaser" ? sameBook.filter((item) => item.kind === "teaser").slice(-1) : sameBook;
  return { legs: [...eligible, leg], switchedBook: sameBook.length !== withoutSameThesis.length };
}

export function bestCoveredExecutionBook(
  lines: readonly LiveLine[],
  preferred: LineBookKey = "betmgm"
): LineBookKey {
  const coverage = new Map<LineBookKey, Set<string>>([
    ["betmgm", new Set()],
    ["fanduel", new Set()]
  ]);
  const groups = new Map<string, LiveLine[]>();
  for (const line of lines) {
    const key = `${line.book}:${line.gameId}:${line.market}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    if (!first || new Set(group.map((line) => line.side.toLowerCase())).size !== 2) continue;
    if (group.some((line) => line.fairProbability === null)) continue;
    coverage.get(first.book)!.add(`${first.gameId}:${first.market}`);
  }
  const alternative: LineBookKey = preferred === "betmgm" ? "fanduel" : "betmgm";
  return coverage.get(alternative)!.size > coverage.get(preferred)!.size ? alternative : preferred;
}

export function enrichWithPowerDevig(lines: readonly Omit<LiveLine, "fairProbability" | "marketVigPercent">[]): LiveLine[] {
  const groups = new Map<string, typeof lines>();
  for (const line of lines) {
    const key = `${line.gameId}:${line.book}:${line.market}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return lines.map((line) => {
    const pair = groups.get(`${line.gameId}:${line.book}:${line.market}`) ?? [];
    if (pair.length !== 2) return { ...line, fairProbability: null, marketVigPercent: null };
    const devig = powerDevig(pair[0].americanPrice, pair[1].americanPrice);
    const index = pair.findIndex((candidate) => candidate.id === line.id);
    const vig = (americanToImplied(pair[0].americanPrice) + americanToImplied(pair[1].americanPrice) - 1) * 100;
    return { ...line, fairProbability: devig.probabilities[index], marketVigPercent: vig };
  });
}

export function decimalToAmerican(decimal: number): number {
  if (!(decimal > 1)) throw new Error("Decimal odds must be greater than one");
  return Math.round(impliedToAmerican(1 / decimal));
}

export type SlipValue = {
  offeredDecimal: number;
  offeredAmerican: number;
  fairDecimal: number;
  fairAmerican: number;
  vigDragPercent: number;
  incrementalDragPercent: number;
  lossPerUnitDollars: number;
  hasSameGameCorrelation: boolean;
};

function cumulativeDrag(legs: readonly ValueLeg[]): number | null {
  if (!legs.length || legs.some((leg) => leg.fairProbability === null)) return null;
  const expectedReturn = legs.reduce((product, leg) => {
    const push = leg.pushProbability ?? 0;
    const decisiveWin = (leg.fairProbability ?? 0) * (1 - push);
    return product * (push + decisiveWin * americanToDecimal(leg.americanPrice));
  }, 1);
  return Math.max(0, 1 - expectedReturn);
}

export function analyzeSlipValue(legs: readonly ValueLeg[], unitDollars = 25): SlipValue | null {
  const hasSameGameCorrelation = new Set(legs.map((leg) => leg.gameId)).size !== legs.length;
  if (!legs.length || hasSameGameCorrelation || legs.some((leg) => leg.fairProbability === null)) return null;
  const offeredDecimal = legs.reduce((product, leg) => product * americanToDecimal(leg.americanPrice), 1);
  const fairWinProbability = legs.reduce((product, leg) => product * (leg.fairProbability ?? 0), 1);
  const fairDecimal = 1 / fairWinProbability;
  const vigDrag = cumulativeDrag(legs) ?? 0;
  const priorDrag = cumulativeDrag(legs.slice(0, -1)) ?? 0;
  return {
    offeredDecimal,
    offeredAmerican: decimalToAmerican(offeredDecimal),
    fairDecimal,
    fairAmerican: decimalToAmerican(fairDecimal),
    vigDragPercent: vigDrag * 100,
    incrementalDragPercent: Math.max(0, vigDrag - priorDrag) * 100,
    lossPerUnitDollars: vigDrag * unitDollars,
    hasSameGameCorrelation
  };
}

export function isPricedSlipApprovable(input: {
  mode: "straight" | "parlay" | "teaser";
  legCount: number;
  straightEligibleLegCount?: number;
  singleBook: boolean;
  standardValue: SlipValue | null;
  teaserExpectedValuePercent: number | null;
}): boolean {
  if (input.legCount < 1) return false;
  // Straights save as separate records, but every record must independently
  // clear the same uncertainty and Kelly floor enforced by the server.
  if (input.mode === "straight") return input.straightEligibleLegCount === input.legCount;
  if (!input.singleBook) return false;
  if (input.mode === "parlay") return input.legCount >= 2 && input.standardValue !== null;
  return input.legCount === 2 && input.teaserExpectedValuePercent !== null && input.teaserExpectedValuePercent >= 0;
}
