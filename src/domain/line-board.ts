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

export type ValueLeg = Pick<SlipLeg, "gameId" | "americanPrice" | "fairProbability">;

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
  const offeredDecimal = legs.reduce((product, leg) => product * americanToDecimal(leg.americanPrice), 1);
  const fairWinProbability = legs.reduce((product, leg) => product * (leg.fairProbability ?? 0), 1);
  return Math.max(0, 1 - offeredDecimal * fairWinProbability);
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
