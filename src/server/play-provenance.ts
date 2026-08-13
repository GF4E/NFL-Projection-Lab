import { buildDecisionBoard } from "./decision-board";
import { getPlayerPropBoard } from "./player-props";
import { stableHash } from "@/domain/hash";
import { expectedValueWithPush } from "@/domain/odds";
import { authoritativeContractExpectedValue } from "@/domain/forecast-value";
import type {
  PlayForecastLegSnapshot,
  PlayForecastSnapshot,
  StoredPlayLeg,
  WeeklyPlay
} from "@/domain/play-card";

interface QuoteRow {
  id: string;
  game_id: string;
  book: "betmgm" | "fanduel";
  market: "spread" | "total" | "moneyline";
  side: string;
  point: number | null;
  american_price: number;
  captured_at: string;
  source_hash: string;
}

interface PropQuoteRow {
  id: string;
  game_id: string;
  book: "betmgm" | "fanduel";
  side: string;
  point: number;
  american_price: number;
  captured_at: string;
  source_hash: string;
}

function clamp(value: number): number {
  return Math.max(0.001, Math.min(0.999, value));
}

function probabilityInterval(
  marketProbability: number | null,
  edgeInterval: [number, number] | null
): [number, number] | null {
  return marketProbability === null || edgeInterval === null
    ? null
    : [clamp(marketProbability + edgeInterval[0]), clamp(marketProbability + edgeInterval[1])];
}

function mainlineSnapshot(input: {
  leg: StoredPlayLeg;
  quote: QuoteRow;
  board: Awaited<ReturnType<typeof buildDecisionBoard>>;
}): PlayForecastLegSnapshot {
  const { leg, quote, board } = input;
  const game = board.games.find((candidate) => candidate.gameId === leg.gameId);
  let marketProbability: number | null = null;
  let modelProbability: number | null = null;
  let betProbability: number | null = null;
  let pushProbability: number | null = null;
  let edgeInterval: [number, number] | null = null;
  let expectedValue: number | null = null;
  if (leg.market === "spread") {
    const projection = game?.projections.find((candidate) => candidate.book === quote.book);
    if (projection) {
      const home = leg.side === projection.homeTeam;
      marketProbability = home ? projection.marketHomeProbability : 1 - projection.marketHomeProbability;
      modelProbability = projection.homeCoverProbability === null ? null : home ? projection.homeCoverProbability : 1 - projection.homeCoverProbability;
      betProbability = projection.shrunkHomeProbability === null ? null : home ? projection.shrunkHomeProbability : 1 - projection.shrunkHomeProbability;
      pushProbability = projection.pushProbability;
      edgeInterval = projection.edgeInterval === null ? null : home
        ? projection.edgeInterval
        : [-projection.edgeInterval[1], -projection.edgeInterval[0]];
    }
  } else if (leg.market === "total") {
    const projection = game?.totals.find((candidate) => candidate.book === quote.book);
    if (projection && projection.lean.toLowerCase() === leg.side.toLowerCase()) {
      marketProbability = projection.fairProbability;
      betProbability = projection.shrunkProbability;
      pushProbability = projection.pushProbability;
      edgeInterval = projection.edgeInterval;
      expectedValue = projection.expectedValue;
    }
  } else if (leg.market === "moneyline") {
    const projection = game?.moneylines.find((candidate) => candidate.book === quote.book);
    if (projection) {
      const home = leg.side === projection.homeTeam;
      marketProbability = home ? projection.marketHomeProbability : 1 - projection.marketHomeProbability;
      modelProbability = projection.modelHomeProbability === null ? null : home ? projection.modelHomeProbability : 1 - projection.modelHomeProbability;
      betProbability = projection.shrunkHomeProbability === null ? null : home ? projection.shrunkHomeProbability : 1 - projection.shrunkHomeProbability;
      pushProbability = projection.tieProbability;
      edgeInterval = projection.edgeInterval === null ? null : home
        ? projection.edgeInterval
        : [-projection.edgeInterval[1], -projection.edgeInterval[0]];
      expectedValue = home ? projection.homeExpectedValue : projection.awayExpectedValue;
    }
  } else if (leg.market === "teaser") {
    const candidate = game?.teasers.find((item) => item.book === quote.book && item.team === leg.side && item.teasedPoint === leg.point);
    betProbability = candidate?.fairProbability ?? null;
    pushProbability = candidate?.pushProbability ?? null;
  }
  if (expectedValue === null && betProbability !== null && pushProbability !== null) {
    expectedValue = expectedValueWithPush(betProbability, pushProbability, quote.american_price);
  }
  return {
    sourceQuoteId: quote.id,
    gameId: quote.game_id,
    market: leg.market,
    side: leg.side,
    point: leg.point,
    americanPrice: leg.americanPrice,
    book: quote.book,
    capturedAt: quote.captured_at,
    sourceHash: quote.source_hash,
    marketProbability,
    modelProbability,
    betProbability,
    pushProbability,
    uncertaintyInterval: probabilityInterval(marketProbability, edgeInterval),
    expectedValue
  };
}

export async function capturePlayForecastSnapshot(
  db: D1Database,
  play: Pick<WeeklyPlay, "week" | "playType" | "americanOdds" | "contract" | "estimatedEvPercent" | "modelEdgePp">
): Promise<PlayForecastSnapshot> {
  const contract = play.contract ?? [];
  const board = await buildDecisionBoard(db, { week: play.week });
  const gameIds = [...new Set(contract.map((leg) => leg.gameId))];
  const placeholders = gameIds.map(() => "?").join(", ");
  const lineResult = gameIds.length
    ? await db.prepare(`SELECT id, game_id, book, market, side, point, american_price, captured_at, source_hash
        FROM live_lines WHERE game_id IN (${placeholders}) ORDER BY game_id, book, market, side`).bind(...gameIds).all<QuoteRow>()
    : { results: [] as QuoteRow[] };
  const quoteById = new Map(lineResult.results.map((quote) => [quote.id, quote]));
  const propLegs = contract.filter((leg) => leg.market === "prop");
  const propResult = propLegs.length
    ? await db.prepare(`SELECT id, game_id, book, side, point, american_price, captured_at, source_hash
        FROM player_prop_quotes WHERE id IN (${propLegs.map(() => "?").join(", ")})`)
      .bind(...propLegs.map((leg) => leg.sourceQuoteId)).all<PropQuoteRow>()
    : { results: [] as PropQuoteRow[] };
  const propById = new Map(propResult.results.map((quote) => [quote.id, quote]));
  const propBoards = new Map<string, Awaited<ReturnType<typeof getPlayerPropBoard>>>();
  for (const gameId of [...new Set(propLegs.map((leg) => leg.gameId))]) {
    propBoards.set(gameId, await getPlayerPropBoard(gameId, db));
  }
  const legs: PlayForecastLegSnapshot[] = contract.map((leg) => {
    if (leg.market !== "prop") {
      const quote = quoteById.get(leg.sourceQuoteId!);
      if (!quote) throw new Error("Approval provenance could not resolve the exact live quote");
      return mainlineSnapshot({ leg, quote, board });
    }
    const quote = propById.get(leg.sourceQuoteId!);
    if (!quote) throw new Error("Approval provenance could not resolve the exact player-prop quote");
    const candidate = propBoards.get(leg.gameId)?.candidates.find((item) => item.sourceQuoteId === quote.id);
    return {
      sourceQuoteId: quote.id,
      gameId: quote.game_id,
      market: "prop",
      side: quote.side,
      point: quote.point,
      americanPrice: quote.american_price,
      book: quote.book,
      capturedAt: quote.captured_at,
      sourceHash: quote.source_hash,
      marketProbability: candidate?.executionFairProbability ?? null,
      modelProbability: candidate?.modelProbability ?? null,
      betProbability: candidate?.betProbability ?? null,
      pushProbability: 0,
      uncertaintyInterval: candidate?.edgeInterval
        ? probabilityInterval(candidate.executionFairProbability, candidate.edgeInterval)
        : null,
      expectedValue: candidate?.expectedValue ?? null
    };
  });
  const consensusSnapshotId = stableHash({
    boardGeneratedAt: board.generatedAt,
    championHash: board.championHash,
    ensembleHash: board.ensembleHash,
    configHash: board.configHash,
    dataHash: board.dataHash,
    artifactHash: board.artifactHash,
    liveLines: lineResult.results,
    playerProps: propResult.results
  });
  const authoritativeExpectedValuePercent = authoritativeContractExpectedValue({
    playType: play.playType,
    americanOdds: play.americanOdds,
    legs
  });
  return {
    generatedAt: new Date().toISOString(),
    boardGeneratedAt: board.generatedAt,
    championHash: board.championHash,
    ensembleHash: board.ensembleHash,
    configHash: board.configHash,
    dataHash: board.dataHash,
    artifactHash: board.artifactHash,
    consensusSnapshotId,
    displayedExpectedValuePercent: (authoritativeExpectedValuePercent ?? play.estimatedEvPercent / 100) * 100,
    authoritativeExpectedValuePercent: authoritativeExpectedValuePercent === null
      ? null
      : authoritativeExpectedValuePercent * 100,
    displayedEdgePp: play.modelEdgePp,
    legs
  };
}
