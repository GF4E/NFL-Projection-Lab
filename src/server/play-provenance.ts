import { buildDecisionBoard } from "./decision-board";
import { getPlayerPropBoard } from "./player-props";
import { stableHash } from "@/domain/hash";
import { americanToDecimal, expectedValueWithPush, impliedToAmerican } from "@/domain/odds";
import { authoritativeContractExpectedValue, authoritativeEquivalentEdgeCents, priceIndependentParlayDecision } from "@/domain/forecast-value";
import { priceTwoTeamTeaserDecision } from "@/domain/decision-board";
import { sizeKelly } from "@/domain/sizing";
import { structuralConfig } from "@/domain/config";
import { playerPropBoardIsActionable } from "@/domain/player-prop-status";
import { isBetAgainstPreferredTeam } from "@/domain/team-preferences";
import type {
  PlayForecastLegSnapshot,
  PlayForecastSnapshot,
  StoredPlayLeg,
  WeeklyPlay
} from "@/domain/play-card";
import { higherEvPaperAlternative } from "@/domain/play-card";
import type { PropCandidate, PropMarketKey } from "@/domain/decision-board";

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
  market: PropMarketKey;
  player: string;
  side: string;
  point: number;
  american_price: number;
  captured_at: string;
  source_hash: string;
}

function propSnapshot(candidate: PropCandidate, quote: PropQuoteRow): PlayForecastLegSnapshot {
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
    marketProbability: candidate.executionFairProbability,
    modelProbability: candidate.modelProbability,
    betProbability: candidate.betProbability,
    pushProbability: 0,
    uncertaintyInterval: probabilityInterval(candidate.executionFairProbability, candidate.edgeInterval),
    uncertaintyMembers: null,
    pushProbabilityMembers: null,
    expectedValue: candidate.expectedValue,
    preferenceConflict: false
  };
}

function combinedAmericanPrice(legs: readonly PlayForecastLegSnapshot[]): number {
  const decimal = legs.reduce((product, leg) => product * americanToDecimal(leg.americanPrice), 1);
  return Math.round(impliedToAmerican(1 / decimal));
}

export function bestPaperContractError(input: {
  play: Pick<WeeklyPlay, "playType" | "americanOdds" | "contract" | "executionStatus">;
  legs: readonly PlayForecastLegSnapshot[];
  board: Awaited<ReturnType<typeof buildDecisionBoard>>;
  lineRows: readonly QuoteRow[];
  propRows: readonly PropQuoteRow[];
  propBoards: ReadonlyMap<string, Awaited<ReturnType<typeof getPlayerPropBoard>>>;
}): string | null {
  if (input.play.executionStatus !== "paper") return null;
  const contract = input.play.contract ?? [];
  const currentExpectedValue = authoritativeContractExpectedValue({
    playType: input.play.playType,
    americanOdds: input.play.americanOdds,
    legs: input.legs
  });
  if (currentExpectedValue === null) return null;
  const propById = new Map(input.propRows.map((quote) => [quote.id, quote]));
  const equivalentAtBook = (leg: StoredPlayLeg, book: "betmgm" | "fanduel"): PlayForecastLegSnapshot | null => {
    if (leg.market !== "prop") {
      const quote = input.lineRows.find((row) =>
        row.game_id === leg.gameId && row.book === book && row.market === leg.market &&
        row.side.trim().toLowerCase() === leg.side.trim().toLowerCase()
      );
      if (!quote) return null;
      return mainlineSnapshot({
        leg: { ...leg, sourceQuoteId: quote.id, point: quote.point, americanPrice: quote.american_price },
        quote,
        board: input.board
      });
    }
    const selectedQuote = leg.sourceQuoteId ? propById.get(leg.sourceQuoteId) : null;
    const propBoard = input.propBoards.get(leg.gameId);
    if (!selectedQuote || !playerPropBoardIsActionable(propBoard)) return null;
    const candidate = propBoard?.candidates.find((item) => {
      const quote = propById.get(item.sourceQuoteId);
      return item.executionBook === book && quote?.market === selectedQuote.market &&
        quote.player === selectedQuote.player && quote.side === selectedQuote.side && quote.point === selectedQuote.point;
    });
    const quote = candidate ? propById.get(candidate.sourceQuoteId) : null;
    return candidate && quote ? propSnapshot(candidate, quote) : null;
  };
  if (input.play.playType === "teaser") {
    const alternatives = (["betmgm", "fanduel"] as const).flatMap((book) => {
      const teaserLegs = contract.map((leg) => input.board.games
        .find((game) => game.gameId === leg.gameId)?.teasers
        .find((candidate) => candidate.book === book && candidate.team === leg.side && candidate.teasedPoint === leg.point));
      if (!teaserLegs.every((leg): leg is NonNullable<typeof leg> =>
        leg !== undefined && leg.fairProbability !== null && leg.pushProbability !== null &&
        leg.probabilityMembers?.length === structuralConfig.model.bootstrapMembers &&
        leg.pushProbabilityMembers?.length === structuralConfig.model.bootstrapMembers
      )) return [];
      const sourceQuoteIds = teaserLegs.map((leg) => input.lineRows.find((quote) =>
        quote.game_id === leg.gameId && quote.book === book && quote.market === "spread" && quote.side === leg.team
      )?.id ?? "");
      if (sourceQuoteIds.some((id) => !id)) return [];
      const decision = priceTwoTeamTeaserDecision(teaserLegs.map((leg) => ({
        conditionalWinProbability: leg.fairProbability!, pushProbability: leg.pushProbability!,
        probabilityMembers: leg.probabilityMembers!, pushProbabilityMembers: leg.pushProbabilityMembers!
      })), input.play.americanOdds);
      return decision ? [{ book, expectedValue: decision.expectedValue, sourceQuoteIds }] : [];
    });
    const best = higherEvPaperAlternative(currentExpectedValue, input.legs.map((leg) => leg.sourceQuoteId), alternatives);
    return best
      ? `Paper entries use the higher-EV available ${best.book === "betmgm" ? "BetMGM" : "FanDuel"} teaser contract. Refresh the slip and approve the new revision.`
      : null;
  }
  if (input.play.playType === "single") {
    const alternatives = (["betmgm", "fanduel"] as const).flatMap((book) => {
      const leg = equivalentAtBook(contract[0], book);
      return leg?.expectedValue === null || leg?.expectedValue === undefined ? [] : [{ book, leg, expectedValue: leg.expectedValue }];
    });
    const selected = higherEvPaperAlternative(currentExpectedValue, input.legs.map((leg) => leg.sourceQuoteId), alternatives.map((item) => ({
      book: item.book, expectedValue: item.expectedValue, sourceQuoteIds: [item.leg.sourceQuoteId]
    })));
    const best = selected ? alternatives.find((item) => item.book === selected.book && item.leg.sourceQuoteId === selected.sourceQuoteIds[0]) : null;
    if (best) {
      return `Paper entries use the higher-EV available ${best.book === "betmgm" ? "BetMGM" : "FanDuel"} contract. Refresh the slip and approve the new revision.`;
    }
    return null;
  }
  const alternatives = (["betmgm", "fanduel"] as const).flatMap((book) => {
    const legs = contract.map((leg) => equivalentAtBook(leg, book));
    if (!legs.every((leg): leg is PlayForecastLegSnapshot => leg !== null)) return [];
    const americanOdds = combinedAmericanPrice(legs);
    const expectedValue = authoritativeContractExpectedValue({ playType: "parlay", americanOdds, legs });
    return expectedValue === null ? [] : [{ book, legs, expectedValue }];
  });
  const best = higherEvPaperAlternative(currentExpectedValue, input.legs.map((leg) => leg.sourceQuoteId), alternatives.map((item) => ({
    book: item.book, expectedValue: item.expectedValue, sourceQuoteIds: item.legs.map((leg) => leg.sourceQuoteId)
  })));
  return best
    ? `Paper entries use the higher-EV available ${best.book === "betmgm" ? "BetMGM" : "FanDuel"} parlay contract. Refresh the slip and approve the new revision.`
    : null;
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
  const preferenceConflict = (leg.market === "spread" || leg.market === "moneyline" || leg.market === "teaser") &&
    isBetAgainstPreferredTeam({
      awayTeam: game?.awayTeam ?? game?.away?.team,
      homeTeam: game?.homeTeam ?? game?.home?.team,
      selectionTeam: leg.side
    });
  let marketProbability: number | null = null;
  let modelProbability: number | null = null;
  let betProbability: number | null = null;
  let pushProbability: number | null = null;
  let edgeInterval: [number, number] | null = null;
  let directUncertaintyInterval: [number, number] | null = null;
  let directUncertaintyMembers: number[] | null = null;
  let directPushProbabilityMembers: number[] | null = null;
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
    directUncertaintyInterval = candidate?.probabilityInterval ?? null;
    directUncertaintyMembers = candidate?.probabilityMembers ?? null;
    directPushProbabilityMembers = candidate?.pushProbabilityMembers ?? null;
  }
  if (leg.market !== "teaser" && expectedValue === null && betProbability !== null && pushProbability !== null) {
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
    uncertaintyInterval: directUncertaintyInterval ?? probabilityInterval(marketProbability, edgeInterval),
    uncertaintyMembers: directUncertaintyMembers,
    pushProbabilityMembers: directPushProbabilityMembers,
    expectedValue,
    preferenceConflict
  };
}

export async function capturePlayForecastSnapshot(
  db: D1Database,
  play: Pick<WeeklyPlay, "week" | "playType" | "americanOdds" | "contract" | "estimatedEvPercent" | "modelEdgePp" | "executionStatus">
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
    ? await db.prepare(`SELECT id, game_id, book, market, player, side, point, american_price, captured_at, source_hash
        FROM player_prop_quotes WHERE game_id IN (${placeholders})`)
      .bind(...gameIds).all<PropQuoteRow>()
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
    const propBoard = propBoards.get(leg.gameId);
    const candidate = playerPropBoardIsActionable(propBoard)
      ? propBoard?.candidates.find((item) => item.sourceQuoteId === quote.id)
      : undefined;
    return candidate ? propSnapshot(candidate, quote) : {
      sourceQuoteId: quote.id, gameId: quote.game_id, market: "prop", side: quote.side, point: quote.point,
      americanPrice: quote.american_price, book: quote.book, capturedAt: quote.captured_at, sourceHash: quote.source_hash,
      marketProbability: null, modelProbability: null, betProbability: null, pushProbability: 0,
      uncertaintyInterval: null, uncertaintyMembers: null, pushProbabilityMembers: null, expectedValue: null,
      preferenceConflict: false
    };
  });
  const paperError = bestPaperContractError({
    play, legs, board, lineRows: lineResult.results, propRows: propResult.results, propBoards
  });
  if (paperError) throw new Error(paperError);
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
  const authoritativeEdgeCents = authoritativeEquivalentEdgeCents({
    playType: play.playType,
    americanOdds: play.americanOdds,
    legs
  });
  const sizingConfig = {
    referenceBankrollUnits: structuralConfig.sizing.referenceBankrollUnits,
    kellyFraction: structuralConfig.sizing.kellyFraction,
    increment: structuralConfig.sizing.roundDownUnits,
    minimum: structuralConfig.sizing.minimumUnits,
    maximum: structuralConfig.sizing.maximumUnits
  };
  const single = play.playType === "single" && legs.length === 1 ? legs[0] : null;
  const singleEdgeInterval: [number, number] | null = single?.marketProbability !== null && single?.marketProbability !== undefined && single.uncertaintyInterval
    ? [
        single.uncertaintyInterval[0] - single.marketProbability,
        single.uncertaintyInterval[1] - single.marketProbability
      ]
    : null;
  const singleSizing = single?.betProbability !== null && single?.betProbability !== undefined && singleEdgeInterval
    ? sizeKelly(single.betProbability, play.americanOdds, singleEdgeInterval, sizingConfig)
    : null;
  const teaserDecision = play.playType === "teaser" && legs.length === 2 && legs.every((leg) =>
    leg.betProbability !== null && leg.pushProbability !== null &&
    leg.uncertaintyInterval !== null && leg.uncertaintyMembers?.length === structuralConfig.model.bootstrapMembers &&
    leg.pushProbabilityMembers?.length === structuralConfig.model.bootstrapMembers
  ) ? priceTwoTeamTeaserDecision(legs.map((leg) => ({
      conditionalWinProbability: leg.betProbability!,
      pushProbability: leg.pushProbability!,
      probabilityMembers: leg.uncertaintyMembers!,
      pushProbabilityMembers: leg.pushProbabilityMembers!
    })), play.americanOdds) : null;
  const parlayDecision = play.playType === "parlay"
    ? priceIndependentParlayDecision(legs, play.americanOdds)
    : null;
  const contractSizing = singleSizing ?? teaserDecision?.sizing ?? parlayDecision?.sizing ?? null;
  const authoritativeProbabilityInterval = single?.uncertaintyInterval ?? (
    teaserDecision ? [
      teaserDecision.edgeInterval[0] + 1 / (play.americanOdds > 0 ? 1 + play.americanOdds / 100 : 1 + 100 / Math.abs(play.americanOdds)),
      teaserDecision.edgeInterval[1] + 1 / (play.americanOdds > 0 ? 1 + play.americanOdds / 100 : 1 + 100 / Math.abs(play.americanOdds))
    ] as [number, number] : parlayDecision?.probabilityInterval ?? null
  );
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
    authoritativeProbabilityInterval,
    authoritativeEdgeCents,
    uncertaintyConfiguration: {
      members: structuralConfig.model.bootstrapMembers,
      seedStart: structuralConfig.model.bootstrapSeedStart,
      intervalPercentiles: structuralConfig.model.intervalPercentiles as [number, number]
    },
    suggestedUnits: contractSizing?.included ? contractSizing.suggestedUnits : 0,
    unitsGreyed: contractSizing?.greyed ?? false,
    displayedEdgePp: play.modelEdgePp,
    legs
  };
}
