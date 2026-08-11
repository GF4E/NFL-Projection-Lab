import type {
  Forecast,
  HistoricalMarginRow,
  ModelMetrics,
  OddsSnapshot,
  SettledPick,
  TeamPickRevision
} from "@/domain/types";
import { buildDiscreteMarginArtifact } from "@/domain/margin";

export const history: HistoricalMarginRow[] = Array.from({ length: 16 }, (_, seasonOffset) => {
  const season = 2010 + seasonOffset;
  const margins = [-14, -10, -7, -6, -3, 0, 3, 6, 7, 10, 14, 17];
  return [-3, 0, 3].flatMap((spread, spreadIndex) =>
    margins.map((margin, marginIndex) => ({
      gameId: `${season}-${spreadIndex}-${marginIndex}`,
      season,
      consensusSpread: spread,
      actualMargin: margin + (seasonOffset % 3 === 0 ? 1 : 0)
    }))
  );
}).flat();

export const artifact = buildDiscreteMarginArtifact(history, {
  latestCompletedSeason: 2025,
  halfLifeSeasons: 2.5,
  boundarySeason: 2015,
  keyMargins: [3, 6, 7, 10, 14],
  generatedAt: "2026-02-01T12:00:00.000Z"
});

export function quote(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    id: "snap-1",
    gameId: "game-1",
    book: "betmgm",
    market: "spread",
    side: "Buffalo -2.5",
    point: -2.5,
    americanPrice: -110,
    capturedAt: "2026-09-13T19:00:00.000Z",
    sourceHash: "source",
    quota: { used: 100, remaining: 400, lastCost: 3 },
    ...overrides
  };
}

export function pick(overrides: Partial<TeamPickRevision> = {}): TeamPickRevision {
  return {
    id: "pick-1:r1",
    pickId: "pick-1",
    revision: 1,
    gameId: "game-1",
    kickoffAt: "2026-09-13T20:00:00.000Z",
    market: "spread",
    selection: "Buffalo -2.5",
    units: 1,
    executionStatus: "paper",
    book: "betmgm",
    frozenPoint: -2.5,
    frozenPrice: -110,
    consensusSnapshotId: "snap-1",
    rationale: "The shrunk edge and bootstrap interval support the contract.",
    authorId: "gabe",
    approvals: [],
    modelHash: "model",
    dataHash: "data",
    uncertaintyInterval: [0.01, 0.05],
    status: "draft",
    createdAt: "2026-09-13T12:00:00.000Z",
    approvedAt: null,
    cashPlacementConfirmed: false,
    ...overrides
  };
}

export const metrics: ModelMetrics = {
  pooledLogLoss: 0.67,
  calibrationSlope: 1,
  byMarket: {
    spread: { logLoss: 0.67, observations: 100 },
    total: { logLoss: 0.68, observations: 100 },
    moneyline: { logLoss: 0.66, observations: 100 }
  }
};

export function forecast(overrides: Partial<Forecast> = {}): Forecast {
  return {
    id: "forecast-1",
    gameId: "game-1",
    market: "spread",
    selection: "Buffalo -2.5",
    championHash: "champion",
    configHash: "config",
    dataHash: "data",
    modelProbability: 0.58,
    consensusProbability: 0.52,
    shrunkProbability: 0.535,
    uncertaintyInterval: [0.01, 0.06],
    edge: 0.015,
    suggestedUnits: 0.5,
    unitsGreyed: false,
    inputsThroughWeek: 1,
    targetWeek: 2,
    generatedAt: "2026-09-15T14:30:00.000Z",
    oddsCapturedAt: "2026-09-15T14:29:00.000Z",
    injuryCapturedAt: "2026-09-15T13:00:00.000Z",
    weatherForecastIssuedAt: "2026-09-15T12:00:00.000Z",
    weatherValidAt: "2026-09-20T20:00:00.000Z",
    qbInput: { starter: "Starter", available: true, backupTier: null, learnedPointPrior: null, override: null },
    freshness: "current",
    ...overrides
  };
}

export function settled(
  executionStatus: "executed" | "paper",
  profitUnits: number,
  clvCents: number
): SettledPick {
  return {
    pick: pick({ executionStatus, status: "settled" }),
    result: profitUnits > 0 ? "win" : profitUnits < 0 ? "loss" : "push",
    profitUnits,
    entryPoint: -2.5,
    closingPoint: -3,
    entryPrice: -110,
    syntheticClosingPrice: -115,
    clvPoints: 0.5,
    clvCents
  };
}
