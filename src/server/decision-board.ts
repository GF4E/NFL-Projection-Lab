import { structuralConfig } from "@/domain/config";
import {
  crossedKeyNumbers,
  fairAmericanFromProbability,
  isClassicWongPoint,
  marginVersusConsensusResidual,
  matchupSignals,
  normalizeNflverseTeam,
  rankTeaserPairs,
  summarizeGameAvailability,
  type BaselineProjection,
  type DecisionBoardPayload,
  type GameAvailabilityContext,
  type GameQuarterbackContext,
  type GameWeatherContext,
  type LineMovementSeries,
  type MoneylineProjection,
  type TeamBaseline,
  type TeaserCandidate
} from "@/domain/decision-board";
import type { TotalProjection } from "@/domain/decision-board";
import { fairSpreadPointForProbability, translateFairProbability } from "@/domain/margin";
import { bootstrapEdgeInterval, type WeightedTrainingRow } from "@/domain/bootstrap";
import { fitOpponentAdjustedRatings } from "@/domain/opponent-adjustment";
import { expectedValueWithPush, powerDevig, shrinkProbability } from "@/domain/odds";
import { applyChampionMarketResidual, predictProbability, type FittedLogisticModel } from "@/domain/model-fit";
import { enrichWithPowerDevig, type LiveLine } from "@/domain/line-board";
import { matchupEvidenceProvenance } from "@/domain/evidence-provenance";
import { fitWeatherTotalAdjustment } from "@/domain/weather-model";
import { loopAStateMatchesRevision, loopAStateRevision, updateTeamStates } from "@/domain/model-lifecycle";
import { weeklySlate } from "./weekly-slate";
import { ensureOfficialInjuryStore, getOfficialInjuryImportState } from "./official-injuries/store";
import { ensureKickoffWeatherStore, listKickoffWeather } from "./weather/store";
import {
  ensureModelLifecycleStore,
  getLatestModelRunAuthorization,
  getModelArtifact,
  getModelLifecycleState,
  getTeamStrengthStates
} from "./model-lifecycle/store";
import {
  buildLifecycleForecastRow,
  buildLifecycleTeamContexts,
  type LifecycleTeamContext
} from "./model-lifecycle/training";
import { ensurePregameContextStore, getPregameContextStates } from "./pregame-context/store";
import { getD1 } from "../../db";
import { stableHash } from "@/domain/hash";
import { ensureQbOverrideStore, latestQbModelOverrides } from "./qb-overrides/store";
import { canonicalSpreadMarket, translateCanonicalSpreadForecast } from "@/domain/spread-contracts";
import { frozenMarginArtifact } from "@/domain/frozen-margin";
import type { DiscreteMarginArtifact } from "@/domain/types";
import { championConfigurationStatus, currentModelConfigurationHash } from "@/domain/model-version";

interface FeatureRow {
  game_id: string;
  season: number;
  week: number;
  game_date: string;
  team: string;
  opponent: string;
  plays: number;
  epa_per_play: number;
  success_rate: number;
  explosive_rate: number;
  turnover_rate: number;
  seconds_per_play: number | null;
  pass_rate_over_expectation: number | null;
}

interface SnapshotRow {
  game_id: string;
  book: LiveLine["book"];
  market: LiveLine["market"];
  side: string;
  point: number | null;
  american_price: number;
  captured_at: string;
  fetched_at: string;
}

interface GameRow {
  game_id: string;
  season: number;
  week: number;
  game_date: string;
  away_team: string;
  home_team: string;
  result: number;
  spread_line: number;
  total: number | null;
  total_line: number | null;
  roof: string | null;
  temperature: number | null;
  wind: number | null;
  away_moneyline: number | null;
  home_moneyline: number | null;
  away_qb_name: string | null;
  home_qb_name: string | null;
}

interface LineRow {
  id: string;
  game_id: string;
  book: LiveLine["book"];
  market: LiveLine["market"];
  side: string;
  point: number | null;
  american_price: number;
  captured_at: string;
  source_event_id: string;
  source_hash: string;
}

interface InjuryAggregateRow {
  game_id: string;
  team: string;
  reported_players: number;
  out_count: number;
  doubtful_count: number;
  questionable_count: number;
  qb_listed: number;
  qb_out_or_doubtful: number;
  source_timestamp: string | null;
}

interface InactiveAggregateRow {
  game_id: string;
  team: string;
  inactive_count: number;
  qb_inactive: number;
  source_timestamp: string | null;
}

interface QbReportRow {
  game_id: string;
  team: string;
  player: string;
  game_status: string | null;
  source_timestamp: string;
}

interface QbInactiveRow {
  game_id: string;
  team: string;
  player: string;
  source_timestamp: string;
}

type Aggregate = {
  team: string;
  season: number;
  games: number;
  plays: number;
  epa: number;
  success: number;
  explosive: number;
  turnovers: number;
  pace: number;
  pacePlays: number;
  proe: number;
  proePlays: number;
};

type DefenseAggregate = {
  team: string;
  plays: number;
  epaAllowed: number;
  successAllowed: number;
  explosiveAllowed: number;
};

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundHalf(value: number): number {
  return Math.max(-14, Math.min(14, Math.round(value * 2) / 2));
}

function roundTotalHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function historicalEdgeInterval(rows: readonly WeightedTrainingRow[], scale = 1): [number, number] | null {
  if (rows.length < 32) return null;
  const bootstrap = bootstrapEdgeInterval(
    [...rows],
    structuralConfig.model.bootstrapMembers,
    structuralConfig.model.bootstrapSeedStart
  );
  return [bootstrap.interval[0] * scale, bootstrap.interval[1] * scale];
}

function weightedLeagueScoring(games: readonly GameRow[], latestSeason: number): number | null {
  let weight = 0;
  let total = 0;
  for (const game of games) {
    if (game.total === null || !Number.isFinite(game.total)) continue;
    const recency = 0.5 ** ((latestSeason - game.season) / structuralConfig.model.decayHalfLifeSeasons);
    weight += recency;
    total += game.total * recency;
  }
  return weight ? total / weight : null;
}

function projectTotal(away: TeamBaseline | null, home: TeamBaseline | null, leagueScoring: number | null): number | null {
  if (!away || !home || leagueScoring === null) return null;
  const paceRank = ((away.ranks.pace ?? 16.5) + (home.ranks.pace ?? 16.5)) / 2;
  const paceAdjustment = Math.max(-2.5, Math.min(2.5, (16.5 - paceRank) * 0.18));
  const offenseEpa = (away.epaPerPlay + home.epaPerPlay) / 2;
  const defenseEpa = (away.defenseEpaAllowed + home.defenseEpaAllowed) / 2;
  const epaAdjustment = Math.max(-4, Math.min(4, (offenseEpa + defenseEpa) * 11));
  const explosiveRank = (away.ranks.explosive + home.ranks.explosive + away.ranks.defenseExplosive + home.ranks.defenseExplosive) / 4;
  const explosiveAdjustment = Math.max(-1.5, Math.min(1.5, (16.5 - explosiveRank) * 0.1));
  const turnoverAdjustment = Math.max(-1, Math.min(1, (0.024 - (away.regressedTurnoverRate + home.regressedTurnoverRate) / 2) * 50));
  return roundTotalHalf(leagueScoring + paceAdjustment + epaAdjustment + explosiveAdjustment + turnoverAdjustment);
}

function totalProjections(
  gameId: string,
  gameLines: readonly LiveLine[],
  away: TeamBaseline | null,
  home: TeamBaseline | null,
  leagueScoring: number | null,
  edgeNoiseInterval: [number, number] | null,
  weatherAdjustmentPoints = 0,
  championModel: FittedLogisticModel | null = null,
  forecastContext: {
    season: number;
    week: number;
    expectedHomeMargin: number;
    totalLine: number | null;
    awayRest: number | null;
    homeRest: number | null;
    teamContext: LifecycleTeamContext | null;
  } | null = null
): TotalProjection[] {
  const baselineTotal = projectTotal(away, home, leagueScoring);
  if (baselineTotal === null) return [];
  const projectedTotal = roundTotalHalf(baselineTotal + weatherAdjustmentPoints);
  return (["betmgm", "fanduel"] as const).flatMap<TotalProjection>((book) => {
    const over = gameLines.find((line) => line.book === book && line.market === "total" && line.side.toLowerCase() === "over" && line.point !== null);
    const under = gameLines.find((line) => line.book === book && line.market === "total" && line.side.toLowerCase() === "under" && line.point !== null);
    const marketPoint = over?.point ?? under?.point;
    if (marketPoint === null || marketPoint === undefined) return [];
    const pointEdge = projectedTotal - marketPoint;
    const lean: TotalProjection["lean"] = Math.abs(pointEdge) < 1.5 ? "Pass" : pointEdge > 0 ? "Over" : "Under";
    const selected = lean === "Over" ? over : lean === "Under" ? under : null;
    const stateProbability = lean === "Pass" ? null : Math.max(0.05, Math.min(0.95, 0.5 + Math.abs(pointEdge) * 0.025));
    const fairProbability = selected?.fairProbability ?? null;
    const overMarketProbability = over?.fairProbability ?? null;
    const championOverProbability = championModel && forecastContext && overMarketProbability !== null
      ? predictProbability(championModel, buildLifecycleForecastRow({
          ...forecastContext,
          market: "total",
          marketProbability: overMarketProbability,
          totalLine: marketPoint,
          isHomeSide: false
        }))
      : null;
    const championSelectionProbability = championOverProbability === null || lean === "Pass"
      ? null
      : lean === "Over" ? championOverProbability : 1 - championOverProbability;
    const modelProbability = stateProbability === null || fairProbability === null || championSelectionProbability === null
      ? stateProbability
      : applyChampionMarketResidual(stateProbability, championSelectionProbability, fairProbability);
    const shrunkProbability = modelProbability === null || fairProbability === null
      ? null
      : shrinkProbability(modelProbability, fairProbability, structuralConfig.model.shrinkageWeight);
    // Half-point totals cannot push. Integer-total EV is withheld until a
    // validated total-score mass model is available.
    const pushProbability = Number.isInteger(marketPoint) ? null : 0;
    const expectedValue = selected && shrunkProbability !== null && pushProbability !== null
      ? expectedValueWithPush(shrunkProbability, pushProbability, selected.americanPrice)
      : null;
    const center = shrunkProbability === null || fairProbability === null ? null : shrunkProbability - fairProbability;
    const edgeInterval = edgeNoiseInterval === null || center === null || pushProbability === null
      ? null
      : [center + edgeNoiseInterval[0], center + edgeNoiseInterval[1]] as [number, number];
    return [{ gameId, book, marketPoint, projectedTotal, lean, pointEdge, fairProbability, shrunkProbability, pushProbability, expectedValue, edgeInterval }];
  });
}

function moneylineProjections(input: {
  gameId: string;
  homeTeam: string;
  gameLines: readonly LiveLine[];
  artifact: DiscreteMarginArtifact | null;
  consensusHomePoint: number | null;
  stateProjectedHomePoint: number | null;
  edgeNoiseInterval: [number, number] | null;
  championModel: FittedLogisticModel | null;
  forecastContext: {
    season: number;
    week: number;
    expectedHomeMargin: number;
    totalLine: number | null;
    awayRest: number | null;
    homeRest: number | null;
    teamContext: LifecycleTeamContext | null;
  };
}): MoneylineProjection[] {
  const bookPairs = (["betmgm", "fanduel"] as const).flatMap((book) => {
    const home = input.gameLines.find((line) => line.book === book && line.market === "moneyline" && line.side === input.homeTeam);
    const away = input.gameLines.find((line) => line.book === book && line.market === "moneyline" && line.side !== input.homeTeam);
    return home?.fairProbability !== null && home?.fairProbability !== undefined && away?.fairProbability !== null && away?.fairProbability !== undefined
      ? [{ book, home, away }]
      : [];
  });
  if (!bookPairs.length || !input.artifact || input.consensusHomePoint === null || input.stateProjectedHomePoint === null) return [];
  const consensusHomeProbability = bookPairs.reduce((sum, pair) => sum + pair.home.fairProbability!, 0) / bookPairs.length;
  const stateAtMoneyline = translateFairProbability(
    input.artifact,
    input.consensusHomePoint,
    input.stateProjectedHomePoint,
    0,
    0.5
  );
  if (stateAtMoneyline.probability === null || stateAtMoneyline.pushProbability === null) return [];
  const tieProbability = Math.max(0, Math.min(0.25, stateAtMoneyline.pushProbability));
  const stateConditionalHomeProbability = Math.max(0.01, Math.min(0.99, stateAtMoneyline.probability));
  const championHomeProbability = input.championModel
    ? predictProbability(input.championModel, buildLifecycleForecastRow({
        ...input.forecastContext,
        market: "moneyline",
        marketProbability: consensusHomeProbability,
        isHomeSide: true
      }))
    : null;
  const modelHomeProbability = championHomeProbability === null
    ? stateConditionalHomeProbability
    : applyChampionMarketResidual(stateConditionalHomeProbability, championHomeProbability, consensusHomeProbability);
  const shrunkHomeProbability = shrinkProbability(
    modelHomeProbability,
    consensusHomeProbability,
    structuralConfig.model.shrinkageWeight
  );
  return bookPairs.map(({ book, home, away }) => {
    const edgeCenter = shrunkHomeProbability - home.fairProbability!;
    return {
      gameId: input.gameId,
      book,
      homeTeam: input.homeTeam,
      marketHomeProbability: home.fairProbability!,
      consensusHomeProbability,
      modelHomeProbability,
      shrunkHomeProbability,
      tieProbability,
      homeExpectedValue: expectedValueWithPush(shrunkHomeProbability, tieProbability, home.americanPrice),
      awayExpectedValue: expectedValueWithPush(1 - shrunkHomeProbability, tieProbability, away.americanPrice),
      edgeInterval: input.edgeNoiseInterval === null
        ? null
        : [edgeCenter + input.edgeNoiseInterval[0], edgeCenter + input.edgeNoiseInterval[1]]
    };
  });
}

function rank(values: Array<{ team: string; value: number | null }>, higherIsBetter: boolean): Map<string, number | null> {
  const eligible = values.filter((item): item is { team: string; value: number } => item.value !== null && Number.isFinite(item.value));
  eligible.sort((left, right) => higherIsBetter ? right.value - left.value : left.value - right.value);
  const result = new Map<string, number | null>(values.map((item) => [item.team, null]));
  eligible.forEach((item, index) => result.set(item.team, index + 1));
  return result;
}

function teamProfiles(rows: FeatureRow[], strengths: Map<string, number>): Map<string, TeamBaseline> {
  const adjustment = (metric: "epa_per_play" | "success_rate" | "explosive_rate") => fitOpponentAdjustedRatings(
    rows.map((row) => ({
      offense: normalizeNflverseTeam(row.team),
      defense: normalizeNflverseTeam(row.opponent),
      value: row[metric],
      weight: row.plays
    })),
    structuralConfig.matchupEvidence.ridgePenalty
  );
  const adjustedEpa = adjustment("epa_per_play");
  const adjustedSuccess = adjustment("success_rate");
  const adjustedExplosive = adjustment("explosive_rate");
  const leagueTurnoverRate = rows.reduce((sum, row) => sum + row.turnover_rate * row.plays, 0) /
    Math.max(1, rows.reduce((sum, row) => sum + row.plays, 0));
  const aggregates = new Map<string, Aggregate>();
  const defenses = new Map<string, DefenseAggregate>();
  for (const row of rows) {
    const team = normalizeNflverseTeam(row.team);
    const current = aggregates.get(team) ?? {
      team, season: row.season, games: 0, plays: 0, epa: 0, success: 0,
      explosive: 0, turnovers: 0, pace: 0, pacePlays: 0, proe: 0, proePlays: 0
    };
    current.season = Math.max(current.season, row.season);
    current.games += 1;
    current.plays += row.plays;
    current.epa += row.epa_per_play * row.plays;
    current.success += row.success_rate * row.plays;
    current.explosive += row.explosive_rate * row.plays;
    current.turnovers += row.turnover_rate * row.plays;
    if (row.seconds_per_play !== null) {
      current.pace += row.seconds_per_play * row.plays;
      current.pacePlays += row.plays;
    }
    if (row.pass_rate_over_expectation !== null) {
      current.proe += row.pass_rate_over_expectation * row.plays;
      current.proePlays += row.plays;
    }
    aggregates.set(team, current);
    const opponent = normalizeNflverseTeam(row.opponent);
    const defense = defenses.get(opponent) ?? { team: opponent, plays: 0, epaAllowed: 0, successAllowed: 0, explosiveAllowed: 0 };
    defense.plays += row.plays;
    defense.epaAllowed += row.epa_per_play * row.plays;
    defense.successAllowed += row.success_rate * row.plays;
    defense.explosiveAllowed += row.explosive_rate * row.plays;
    defenses.set(opponent, defense);
  }
  const base = [...aggregates.values()].map((item) => {
    const defense = defenses.get(item.team);
    const epaRating = adjustedEpa?.ratings.get(item.team);
    const successRating = adjustedSuccess?.ratings.get(item.team);
    const explosiveRating = adjustedExplosive?.ratings.get(item.team);
    return {
      team: item.team,
      season: item.season,
      games: item.games,
      epaPerPlay: epaRating?.offense ?? item.epa / Math.max(1, item.plays),
      successRate: successRating?.offense ?? item.success / Math.max(1, item.plays),
      explosiveRate: explosiveRating?.offense ?? item.explosive / Math.max(1, item.plays),
      defenseEpaAllowed: epaRating?.defenseAllowed ?? (defense?.epaAllowed ?? 0) / Math.max(1, defense?.plays ?? 0),
      defenseSuccessAllowed: successRating?.defenseAllowed ?? (defense?.successAllowed ?? 0) / Math.max(1, defense?.plays ?? 0),
      defenseExplosiveAllowed: explosiveRating?.defenseAllowed ?? (defense?.explosiveAllowed ?? 0) / Math.max(1, defense?.plays ?? 0),
      regressedTurnoverRate: (item.turnovers + leagueTurnoverRate * 200) / Math.max(1, item.plays + 200),
      secondsPerPlay: item.pacePlays ? item.pace / item.pacePlays : null,
      proe: item.proePlays ? item.proe / item.proePlays : null,
      strength: strengths.get(item.team) ?? 0
    };
  });
  const ranks = {
    epa: rank(base.map((item) => ({ team: item.team, value: item.epaPerPlay })), true),
    success: rank(base.map((item) => ({ team: item.team, value: item.successRate })), true),
    explosive: rank(base.map((item) => ({ team: item.team, value: item.explosiveRate })), true),
    defenseEpa: rank(base.map((item) => ({ team: item.team, value: item.defenseEpaAllowed })), false),
    defenseSuccess: rank(base.map((item) => ({ team: item.team, value: item.defenseSuccessAllowed })), false),
    defenseExplosive: rank(base.map((item) => ({ team: item.team, value: item.defenseExplosiveAllowed })), false),
    turnovers: rank(base.map((item) => ({ team: item.team, value: item.regressedTurnoverRate })), false),
    pace: rank(base.map((item) => ({ team: item.team, value: item.secondsPerPlay })), false),
    proe: rank(base.map((item) => ({ team: item.team, value: item.proe })), true),
    strength: rank(base.map((item) => ({ team: item.team, value: item.strength })), true)
  };
  return new Map(base.map((item) => [item.team, {
    ...item,
    epaPerPlay: round(item.epaPerPlay),
    successRate: round(item.successRate),
    explosiveRate: round(item.explosiveRate),
    defenseEpaAllowed: round(item.defenseEpaAllowed),
    defenseSuccessAllowed: round(item.defenseSuccessAllowed),
    defenseExplosiveAllowed: round(item.defenseExplosiveAllowed),
    regressedTurnoverRate: round(item.regressedTurnoverRate),
    secondsPerPlay: item.secondsPerPlay === null ? null : round(item.secondsPerPlay, 1),
    proe: item.proe === null ? null : round(item.proe),
    strength: round(item.strength, 2),
    ranks: {
      epa: ranks.epa.get(item.team)!, success: ranks.success.get(item.team)!, explosive: ranks.explosive.get(item.team)!,
      defenseEpa: ranks.defenseEpa.get(item.team)!, defenseSuccess: ranks.defenseSuccess.get(item.team)!, defenseExplosive: ranks.defenseExplosive.get(item.team)!,
      turnovers: ranks.turnovers.get(item.team)!, pace: ranks.pace.get(item.team) ?? null, proe: ranks.proe.get(item.team) ?? null, strength: ranks.strength.get(item.team)!
    }
  }]));
}

function sampleMovement(points: LineMovementSeries["snapshots"]): LineMovementSeries["snapshots"] {
  if (points.length <= 12) return points;
  const sampled = points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 10) === 0);
  return sampled.slice(0, 12);
}

function lineMovements(gameId: string, history: readonly SnapshotRow[], lines: readonly LiveLine[]): LineMovementSeries[] {
  return lines.filter((line) => line.gameId === gameId && line.market === "spread" && line.point !== null).map((line) => {
    const snapshots = history
      .filter((row) => row.game_id === gameId && row.book === line.book && row.market === "spread" && row.side === line.side && row.point !== null)
      .map((row) => ({ point: row.point!, americanPrice: row.american_price, capturedAt: row.captured_at }));
    snapshots.push({ point: line.point!, americanPrice: line.americanPrice, capturedAt: line.capturedAt });
    const unique = [...new Map(snapshots.map((point) => [`${point.capturedAt}:${point.point}:${point.americanPrice}`, point])).values()]
      .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
    return { book: line.book, market: "spread" as const, side: line.side, snapshots: sampleMovement(unique) };
  });
}

async function loadMovementHistory(db: D1Database, gameIds: readonly string[]): Promise<SnapshotRow[]> {
  try {
    const placeholders = gameIds.map(() => "?").join(", ");
    const result = await db.prepare(`SELECT game_id, book, market, side, point, american_price, captured_at, fetched_at
      FROM live_line_snapshots WHERE market = 'spread' AND game_id IN (${placeholders})
      ORDER BY game_id, book, side, fetched_at`).bind(...gameIds).all<SnapshotRow>();
    return result.results;
  } catch {
    return [];
  }
}

function strengthStates(games: GameRow[]): Map<string, number> {
  const states = updateTeamStates([], games.map((game) => ({
    gameId: game.game_id,
    season: game.season,
    week: game.week,
    homeTeam: normalizeNflverseTeam(game.home_team),
    awayTeam: normalizeNflverseTeam(game.away_team),
    actualHomeMargin: game.result,
    consensusHomeExpectedMargin: game.spread_line,
    completedAt: game.game_date
  })), structuralConfig.model.strengthK);
  return new Map(states.map((state) => [state.team, state.mean]));
}

function rawLine(row: LineRow): Omit<LiveLine, "fairProbability" | "marketVigPercent"> {
  return {
    id: row.id, gameId: row.game_id, book: row.book, market: row.market, side: row.side, point: row.point,
    americanPrice: row.american_price, capturedAt: row.captured_at, sourceEventId: row.source_event_id, sourceHash: row.source_hash
  };
}

export async function buildDecisionBoard(
  db: D1Database = getD1(),
  options: { season?: number; week?: number; now?: Date } = {}
): Promise<DecisionBoardPayload> {
  const slate = await weeklySlate({ db, season: options.season, week: options.week, now: options.now });
  await Promise.all([
    ensureOfficialInjuryStore(db),
    ensureKickoffWeatherStore(db),
    ensureModelLifecycleStore(db),
    ensurePregameContextStore(db),
    ensureQbOverrideStore(db)
  ]);
  const activeGameIds = slate.games.map((game) => game.id);
  const activePlaceholders = activeGameIds.map(() => "?").join(", ");
  const injuryDataset = `official-injuries:${slate.season}:reg${slate.week}`;
  const [lineResult, gameResult, featureResult, movementHistory, injuryResult, injuryState, inactiveResult, qbReportResult, qbInactiveResult, pregameStates, weatherRows, persistedStates, lifecycle, latestRunAuthorization, qbOverrides] = await Promise.all([
    db.prepare(`SELECT * FROM live_lines WHERE game_id IN (${activePlaceholders}) ORDER BY game_id, book, market, side`).bind(...activeGameIds).all<LineRow>(),
    db.prepare(`SELECT game_id, season, week, game_date, away_team, home_team, result, spread_line, total, total_line,
        roof, temperature, wind, away_moneyline, home_moneyline, away_qb_name, home_qb_name
      FROM nfl_games WHERE season BETWEEN 2010 AND ? AND season_type = 'REG'
        AND result IS NOT NULL AND spread_line IS NOT NULL
        AND (season < ? OR week < ?)
      ORDER BY game_date, game_id`).bind(slate.season, slate.season, slate.week).all<GameRow>(),
    db.prepare(`SELECT game_id, season, week, game_date, team, opponent, plays, epa_per_play, success_rate, explosive_rate,
        turnover_rate, seconds_per_play, pass_rate_over_expectation FROM (
          SELECT game_id, season, week, game_date, team, opponent, plays, epa_per_play, success_rate, explosive_rate,
            turnover_rate, seconds_per_play, pass_rate_over_expectation,
            ROW_NUMBER() OVER (PARTITION BY team ORDER BY season DESC, week DESC, game_date DESC) AS recency_rank
          FROM nfl_team_game_features
          WHERE season_type = 'REG' AND (season < ? OR (season = ? AND week < ?))
        ) WHERE recency_rank <= ?
        ORDER BY season DESC, week DESC`).bind(
          slate.season,
          slate.season,
          slate.week,
          structuralConfig.matchupEvidence.windowGames
        ).all<FeatureRow>(),
    loadMovementHistory(db, activeGameIds),
    db.prepare(`SELECT game_id,
        COUNT(*) AS reported_players,
        SUM(CASE WHEN LOWER(COALESCE(game_status, '')) = 'out' THEN 1 ELSE 0 END) AS out_count,
        SUM(CASE WHEN LOWER(COALESCE(game_status, '')) = 'doubtful' THEN 1 ELSE 0 END) AS doubtful_count,
        SUM(CASE WHEN LOWER(COALESCE(game_status, '')) = 'questionable' THEN 1 ELSE 0 END) AS questionable_count,
        SUM(CASE WHEN UPPER(COALESCE(position, '')) = 'QB' THEN 1 ELSE 0 END) AS qb_listed,
        SUM(CASE WHEN UPPER(COALESCE(position, '')) = 'QB'
          AND LOWER(COALESCE(game_status, '')) IN ('out', 'doubtful') THEN 1 ELSE 0 END) AS qb_out_or_doubtful,
        MAX(source_timestamp) AS source_timestamp
      FROM official_injury_reports
      WHERE season = ? AND week = ? AND game_id IN (${activePlaceholders})
      GROUP BY game_id, team`).bind(slate.season, slate.week, ...activeGameIds).all<InjuryAggregateRow>(),
    getOfficialInjuryImportState(db, injuryDataset),
    db.prepare(`SELECT game_id, team, COUNT(*) AS inactive_count,
        SUM(CASE WHEN UPPER(COALESCE(position, '')) = 'QB' THEN 1 ELSE 0 END) AS qb_inactive,
        MAX(source_timestamp) AS source_timestamp
      FROM official_inactives WHERE game_id IN (${activePlaceholders}) GROUP BY game_id, team`)
      .bind(...activeGameIds).all<InactiveAggregateRow>(),
    db.prepare(`SELECT game_id, team, player, game_status, source_timestamp
      FROM official_injury_reports
      WHERE season = ? AND week = ? AND UPPER(COALESCE(position, '')) = 'QB'
        AND game_id IN (${activePlaceholders})`).bind(slate.season, slate.week, ...activeGameIds).all<QbReportRow>(),
    db.prepare(`SELECT game_id, team, player, source_timestamp
      FROM official_inactives
      WHERE UPPER(COALESCE(position, '')) = 'QB' AND game_id IN (${activePlaceholders})`)
      .bind(...activeGameIds).all<QbInactiveRow>(),
    getPregameContextStates(db, activeGameIds),
    listKickoffWeather(db, activeGameIds),
    getTeamStrengthStates(db, slate.season),
    getModelLifecycleState(db, slate.season),
    getLatestModelRunAuthorization(db),
    latestQbModelOverrides(db, activeGameIds)
  ]);
  const configuredChampionHash = lifecycle?.championHash ?? null;
  const featureRows = featureResult.results;
  const evidence = matchupEvidenceProvenance({
    rows: featureRows.map((row) => ({
      season: row.season,
      week: row.week,
      gameDate: row.game_date,
      team: normalizeNflverseTeam(row.team)
    })),
    forecastSeason: slate.season,
    forecastWeek: slate.week,
    completedGames: gameResult.results
  });
  const latestTrainingSeason = Math.max(structuralConfig.model.trainingStartSeason, ...gameResult.results.map((row) => row.season));
  const leagueScoring = weightedLeagueScoring(gameResult.results.filter((row) => row.season >= slate.season - 3), slate.season);
  const basisSeason = featureRows.length ? Math.max(...featureRows.map((row) => row.season)) : null;
  const loopARevision = loopAStateRevision(structuralConfig.version, structuralConfig.model.strengthK);
  const persistedStrengths = loopAStateMatchesRevision(lifecycle?.loopAHash, loopARevision) &&
    persistedStates.length && persistedStates.every((state) => state.throughWeek >= slate.week - 1)
    ? new Map(persistedStates.map((state) => [state.team, state.mean]))
    : null;
  const strengths = persistedStrengths ?? (basisSeason === null ? new Map<string, number>() : strengthStates(gameResult.results));
  const profiles = teamProfiles(featureRows, strengths);
  const lifecycleContexts = buildLifecycleTeamContexts(
    slate.games.map((game) => ({
      game_id: game.id,
      season: game.season,
      week: game.week,
      game_date: game.kickoffAt.slice(0, 10),
      away_team: game.away,
      home_team: game.home
    })),
    featureRows
  );
  const configHash = currentModelConfigurationHash();
  const championVersion = configuredChampionHash ? await getModelArtifact(db, configuredChampionHash) : null;
  const retainedByCurrentGate = Boolean(
    configuredChampionHash &&
    latestRunAuthorization?.gateDecision === "retain" &&
    latestRunAuthorization.championHash === configuredChampionHash &&
    latestRunAuthorization.configHash === configHash
  );
  const championStatus = championConfigurationStatus(
    configuredChampionHash,
    championVersion?.metadata.configHash ?? null,
    configHash,
    retainedByCurrentGate
  );
  const championHash = championStatus === "compatible" ? configuredChampionHash : null;
  const championModel = championStatus === "compatible" ? championVersion?.artifact.model ?? null : null;
  const artifact = frozenMarginArtifact;
  const lines = enrichWithPowerDevig(lineResult.results.map(rawLine));
  const sideEdgeNoise = historicalEdgeInterval(gameResult.results.map((row) => ({
    edge: Math.max(-0.25, Math.min(0.25, marginVersusConsensusResidual(row.result, row.spread_line) * 0.025)),
    weight: 0.5 ** ((latestTrainingSeason - row.season) / structuralConfig.model.decayHalfLifeSeasons)
  })));
  const totalEdgeNoise = historicalEdgeInterval(gameResult.results.flatMap((row) => row.total === null || row.total_line === null ? [] : [{
    edge: Math.max(-0.25, Math.min(0.25, (row.total - row.total_line) * 0.025)),
    weight: 0.5 ** ((latestTrainingSeason - row.season) / structuralConfig.model.decayHalfLifeSeasons)
  }]));
  const moneylineEdgeNoise = historicalEdgeInterval(gameResult.results.flatMap((row) => {
    if (row.result === 0 || row.home_moneyline === null || row.away_moneyline === null) return [];
    try {
      const marketHomeProbability = powerDevig(row.home_moneyline, row.away_moneyline).probabilities[0];
      return [{
        edge: (row.result > 0 ? 1 : 0) - marketHomeProbability,
        weight: 0.5 ** ((latestTrainingSeason - row.season) / structuralConfig.model.decayHalfLifeSeasons)
      }];
    } catch {
      return [];
    }
  }));
  const injuryByTeam = new Map(injuryResult.results.map((row) => [`${row.game_id}:${normalizeNflverseTeam(row.team)}`, row]));
  const inactiveByTeam = new Map(inactiveResult.results.map((row) => [`${row.game_id}:${normalizeNflverseTeam(row.team)}`, row]));
  const pregameByGame = new Map(pregameStates.map((state) => [state.gameId, state]));
  const weatherByGame = new Map(weatherRows.map((row) => [row.gameId, row]));
  const qbOverrideByTeam = new Map(qbOverrides.map((override) => [`${override.gameId}:${override.team}`, override]));
  const normalizePlayer = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const latestStarterByTeam = new Map<string, { name: string; gameDate: string }>();
  for (const row of gameResult.results) {
    if (row.away_qb_name && (!latestStarterByTeam.has(normalizeNflverseTeam(row.away_team)) || latestStarterByTeam.get(normalizeNflverseTeam(row.away_team))!.gameDate < row.game_date)) {
      latestStarterByTeam.set(normalizeNflverseTeam(row.away_team), { name: row.away_qb_name, gameDate: row.game_date });
    }
    if (row.home_qb_name && (!latestStarterByTeam.has(normalizeNflverseTeam(row.home_team)) || latestStarterByTeam.get(normalizeNflverseTeam(row.home_team))!.gameDate < row.game_date)) {
      latestStarterByTeam.set(normalizeNflverseTeam(row.home_team), { name: row.home_qb_name, gameDate: row.game_date });
    }
  }
  const games = slate.games.map((game) => {
    const teamContext = lifecycleContexts.get(game.id) ?? null;
    const gameLines = lines.filter((line) => line.gameId === game.id);
    const homeSpreads = gameLines.filter((line) => line.market === "spread" && line.side === game.home && line.point !== null);
    const scheduleHomePoint = game.consensusHomePoint;
    const canonicalSpread = artifact ? canonicalSpreadMarket(
      artifact,
      homeSpreads.flatMap((line) => line.point !== null && line.fairProbability !== null
        ? [{ book: line.book, point: line.point, fairProbability: line.fairProbability }]
        : []),
      scheduleHomePoint
    ) : null;
    const consensusHomePoint = canonicalSpread?.point ?? scheduleHomePoint;
    const totalPoints = gameLines
      .filter((line) => line.market === "total" && line.point !== null)
      .map((line) => line.point!);
    const consensusTotalLine = totalPoints.length
      ? totalPoints.reduce((sum, point) => sum + point, 0) / totalPoints.length
      : game.totalLine;
    const homeInjuries = injuryByTeam.get(`${game.id}:${game.home}`);
    const awayInjuries = injuryByTeam.get(`${game.id}:${game.away}`);
    const homeInactives = inactiveByTeam.get(`${game.id}:${game.home}`);
    const awayInactives = inactiveByTeam.get(`${game.id}:${game.away}`);
    const pregame = pregameByGame.get(game.id);
    const quarterbackFor = (team: string): GameQuarterbackContext["home"] => {
      const reference = latestStarterByTeam.get(team) ?? null;
      const override = qbOverrideByTeam.get(`${game.id}:${team}`) ?? null;
      const teamInjuries = team === game.home ? homeInjuries : awayInjuries;
      const teamInactives = team === game.home ? homeInactives : awayInactives;
      const referenceKey = reference ? normalizePlayer(reference.name) : null;
      const reports = qbReportResult.results.filter((row) => row.game_id === game.id && normalizeNflverseTeam(row.team) === team);
      const inactiveRows = qbInactiveResult.results.filter((row) => row.game_id === game.id && normalizeNflverseTeam(row.team) === team);
      const starterInactive = Boolean(referenceKey && inactiveRows.some((row) => normalizePlayer(row.player) === referenceKey));
      const starterAtRisk = Boolean(referenceKey && reports.some((row) =>
        normalizePlayer(row.player) === referenceKey && ["out", "doubtful"].includes(row.game_status?.toLowerCase() ?? "")
      ));
      const teamAvailability = starterInactive ? "inactive" as const
        : starterAtRisk ? "at_risk" as const
          : reference && injuryState?.freshness === "current" ? "available" as const : "unconfirmed" as const;
      const sourceTimestamp = [
        ...reports.map((row) => row.source_timestamp),
        ...inactiveRows.map((row) => row.source_timestamp)
      ].sort().at(-1) ?? teamInjuries?.source_timestamp ?? teamInactives?.source_timestamp ?? null;
      return {
        team,
        referenceStarter: reference?.name ?? null,
        referenceSource: reference ? "latest_completed_start" : "unavailable",
        availability: teamAvailability,
        backupTier: null,
        learnedPointPrior: null,
        ownerOverridePoints: override?.value ?? null,
        appliedTeamMarginPoints: override?.value ?? 0,
        sourceTimestamp: override?.createdAt ?? sourceTimestamp,
        auditHash: stableHash({
          gameId: game.id,
          team,
          reference,
          availability: teamAvailability,
          configStatus: structuralConfig.qbTiers.status,
          overrideHash: override?.auditHash ?? null
        })
      };
    };
    const homeQuarterback = quarterbackFor(game.home);
    const awayQuarterback = quarterbackFor(game.away);
    const qbUncertaintyWidening = [homeQuarterback, awayQuarterback]
      .filter((quarterback) => quarterback.availability === "at_risk" || quarterback.availability === "inactive")
      .length * 0.01;
    const quarterbackMarginDelta = homeQuarterback.appliedTeamMarginPoints - awayQuarterback.appliedTeamMarginPoints;
    const quarterbacks: GameQuarterbackContext = {
      home: homeQuarterback,
      away: awayQuarterback,
      configStatus: structuralConfig.qbTiers.status,
      forecastHandling: homeQuarterback.ownerOverridePoints !== null || awayQuarterback.ownerOverridePoints !== null
        ? "owner_override"
        : structuralConfig.qbTiers.learnedPointPriors.length ? "validated_prior" : "market_only"
    };
    const strengthDelta = (strengths.get(game.home) ?? 0) - (strengths.get(game.away) ?? 0) + quarterbackMarginDelta;
    const stateProjectedHomePoint = consensusHomePoint === null ? null : roundHalf(consensusHomePoint - strengthDelta);
    type ProjectionAnchor = { book: "betmgm" | "fanduel"; point: number; fairProbability: number; marketSource: BaselineProjection["marketSource"] };
    const projectionAnchors = (["betmgm", "fanduel"] as const).flatMap<ProjectionAnchor>((book) => {
      const line = homeSpreads.find((candidate) => candidate.book === book);
      if (line?.point !== null && line?.fairProbability !== null && line?.fairProbability !== undefined) {
        return [{ book, point: line.point, fairProbability: line.fairProbability, marketSource: "book" as const }];
      }
      return scheduleHomePoint === null
        ? []
        : [{ book, point: scheduleHomePoint, fairProbability: 0.5, marketSource: "nflverse_consensus" as const }];
    });
    const canonicalMarketProbability = canonicalSpread?.fairProbability ?? null;
    const canonicalSpreadWarning = canonicalSpread?.warning ?? "unsupported" as const;
    const canonicalState = artifact && consensusHomePoint !== null && canonicalMarketProbability !== null
      ? translateFairProbability(artifact, consensusHomePoint, stateProjectedHomePoint!, consensusHomePoint, 0.5)
      : null;
    const championProbability = championModel && canonicalState?.probability !== null && canonicalState?.probability !== undefined && canonicalMarketProbability !== null
      ? predictProbability(championModel, buildLifecycleForecastRow({
          season: game.season,
          week: game.week,
          market: "spread",
          marketProbability: canonicalMarketProbability,
          expectedHomeMargin: -consensusHomePoint!,
          totalLine: consensusTotalLine,
          awayRest: game.awayRest,
          homeRest: game.homeRest,
          isHomeSide: true,
          teamContext
        }))
      : null;
    const canonicalModelProbability = canonicalState?.probability === null || canonicalState?.probability === undefined || canonicalMarketProbability === null
      ? canonicalState?.probability ?? null
      : championProbability === null
        ? canonicalState.probability
        : applyChampionMarketResidual(canonicalState.probability, championProbability, canonicalMarketProbability);
    const canonicalShrunkProbability = canonicalModelProbability === null || canonicalMarketProbability === null
      ? null
      : shrinkProbability(canonicalModelProbability, canonicalMarketProbability, structuralConfig.model.shrinkageWeight);
    const canonicalEdgeCenter = canonicalShrunkProbability === null || canonicalMarketProbability === null
      ? null
      : canonicalShrunkProbability - canonicalMarketProbability;
    const canonicalEdgeInterval: [number, number] | null = canonicalEdgeCenter === null || sideEdgeNoise === null
      ? null
      : [canonicalEdgeCenter + sideEdgeNoise[0] - qbUncertaintyWidening, canonicalEdgeCenter + sideEdgeNoise[1] + qbUncertaintyWidening];
    const inferredFairPoint = artifact && consensusHomePoint !== null && canonicalModelProbability !== null
      ? fairSpreadPointForProbability(artifact, consensusHomePoint, consensusHomePoint, canonicalModelProbability)
      : { point: null, warning: "unsupported" as const };
    const projectedHomePoint = inferredFairPoint.point ?? stateProjectedHomePoint;
    const projections: BaselineProjection[] = artifact && consensusHomePoint !== null && canonicalMarketProbability !== null && canonicalModelProbability !== null && canonicalShrunkProbability !== null && canonicalEdgeInterval
      ? projectionAnchors.map((anchor) => {
          const translated = translateCanonicalSpreadForecast({
            artifact,
            consensusPoint: consensusHomePoint,
            canonicalPoint: consensusHomePoint,
            canonicalMarketProbability,
            canonicalModelProbability,
            canonicalShrunkProbability,
            canonicalEdgeInterval,
            quote: { book: anchor.book, point: anchor.point, fairProbability: anchor.fairProbability }
          });
          const warnings = [canonicalSpreadWarning, translated.warning, inferredFairPoint.warning];
          return {
            gameId: game.id,
            book: anchor.book,
            homeTeam: game.home,
            marketHomePoint: anchor.point,
            projectedHomePoint: projectedHomePoint!,
            homeCoverProbability: translated.modelProbability,
            shrunkHomeProbability: translated.shrunkProbability,
            pushProbability: translated.pushProbability,
            edgeInterval: translated.edgeInterval,
            marketHomeProbability: anchor.fairProbability,
            marketSource: anchor.marketSource,
            translationWarning: warnings.includes("unsupported") ? "unsupported"
              : warnings.includes("extrapolated") ? "extrapolated"
                : warnings.includes("interpolated") ? "interpolated" : "none"
          };
        })
      : [];
    const teasers: TeaserCandidate[] = artifact ? gameLines.filter((line) => line.market === "spread" && line.point !== null && line.fairProbability !== null).map((line) => {
      const sideLines = gameLines.filter((candidate) => candidate.market === "spread" && candidate.side === line.side && candidate.point !== null);
      const consensusPoint = sideLines.reduce((sum, candidate) => sum + (candidate.point ?? 0), 0) / Math.max(1, sideLines.length);
      const teasedPoint = (line.point ?? 0) + 6;
      const translated = translateFairProbability(artifact, consensusPoint, line.point!, teasedPoint, line.fairProbability!);
      const crossedKeys = crossedKeyNumbers(line.point!, teasedPoint, structuralConfig.model.keyMargins);
      const crossesZero = line.point! < 0 && teasedPoint > 0;
      const classification: TeaserCandidate["classification"] = isClassicWongPoint(line.point!)
        ? "classic_wong"
        : !crossesZero && crossedKeys.length >= 2 ? "key_number" : "ordinary";
      return {
        gameId: game.id,
        book: line.book,
        team: line.side,
        opponent: line.side === game.home ? game.away : game.home,
        originalPoint: line.point!,
        teasedPoint,
        fairProbability: translated.probability,
        pushProbability: translated.pushProbability,
        fairAmerican: translated.probability === null || translated.pushProbability === null
          ? null
          : fairAmericanFromProbability(translated.probability),
        classification,
        crossedKeys,
        warning: translated.warning
      };
    }) : [];
    const away = profiles.get(game.away) ?? null;
    const home = profiles.get(game.home) ?? null;
    const injuries = injuryResult.results.filter((row) => row.game_id === game.id);
    const inactives = inactiveResult.results.filter((row) => row.game_id === game.id);
    const availability: GameAvailabilityContext = summarizeGameAvailability({
      freshness: injuryState?.freshness ?? null,
      lastSuccessAt: injuryState?.lastSuccessAt ?? null,
      counts: injuries.length ? {
        reportedPlayers: injuries.reduce((sum, row) => sum + row.reported_players, 0),
        out: injuries.reduce((sum, row) => sum + row.out_count, 0),
        doubtful: injuries.reduce((sum, row) => sum + row.doubtful_count, 0),
        questionable: injuries.reduce((sum, row) => sum + row.questionable_count, 0),
        qbListed: injuries.reduce((sum, row) => sum + row.qb_listed, 0),
        qbOutOrDoubtful: injuries.reduce((sum, row) => sum + row.qb_out_or_doubtful, 0),
        sourceTimestamp: injuries.map((row) => row.source_timestamp).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
      } : null,
      pregame: pregame ? {
        freshness: pregame.freshness,
        lastSuccessAt: pregame.lastSuccessAt,
        inactivesConfirmed: pregame.inactivesConfirmed,
        inactivePlayers: inactives.length ? inactives.reduce((sum, row) => sum + row.inactive_count, 0) : pregame.inactiveCount,
        qbInactive: inactives.reduce((sum, row) => sum + row.qb_inactive, 0),
        sourceTimestamp: inactives.map((row) => row.source_timestamp).filter((value): value is string => Boolean(value)).sort().at(-1) ?? pregame.lastSuccessAt
      } : null
    });
    const storedWeather = weatherByGame.get(game.id);
    const weatherFit = storedWeather &&
      (storedWeather.freshness === "current" || storedWeather.freshness === "stale") &&
      (storedWeather.roof === "outdoor" || storedWeather.roof === "open") &&
      storedWeather.windMph !== null && storedWeather.temperatureF !== null
      ? fitWeatherTotalAdjustment(
          gameResult.results.map((row) => ({
            season: row.season,
            total: row.total,
            totalLine: row.total_line,
            roof: row.roof,
            windMph: row.wind,
            temperatureF: row.temperature
          })),
          { windMph: storedWeather.windMph, temperatureF: storedWeather.temperatureF },
          latestTrainingSeason,
          structuralConfig.model.decayHalfLifeSeasons
        )
      : null;
    const weather: GameWeatherContext = storedWeather ? {
      status: storedWeather.freshness === "unavailable" ? "pending"
        : storedWeather.freshness === "unconfirmed" ? "unconfirmed"
          : storedWeather.freshness,
      roof: storedWeather.roof,
      windMph: storedWeather.windMph,
      temperatureF: storedWeather.temperatureF,
      precipitationProbability: storedWeather.precipitationProbability,
      capturedAt: storedWeather.forecastIssuedAt,
      totalAdjustmentPoints: weatherFit?.points ?? 0,
      trainingGames: weatherFit?.trainingGames ?? null
    } : {
      status: "pending",
      roof: "unconfirmed",
      windMph: null,
      temperatureF: null,
      precipitationProbability: null,
      capturedAt: null,
      totalAdjustmentPoints: 0,
      trainingGames: null
    };
    return {
      gameId: game.id,
      away,
      home,
      projections,
      totals: totalProjections(
        game.id,
        gameLines,
        away,
        home,
        leagueScoring,
        totalEdgeNoise,
        weather.totalAdjustmentPoints,
        championModel,
        {
          season: game.season,
          week: game.week,
          expectedHomeMargin: consensusHomePoint === null ? 0 : -consensusHomePoint,
          totalLine: consensusTotalLine,
          awayRest: game.awayRest,
          homeRest: game.homeRest,
          teamContext
        }
      ),
      moneylines: moneylineProjections({
        gameId: game.id,
        homeTeam: game.home,
        gameLines,
        artifact,
        consensusHomePoint,
        stateProjectedHomePoint,
        edgeNoiseInterval: moneylineEdgeNoise,
        championModel,
        forecastContext: {
          season: game.season,
          week: game.week,
          expectedHomeMargin: consensusHomePoint === null ? 0 : -consensusHomePoint,
          totalLine: consensusTotalLine,
          awayRest: game.awayRest,
          homeRest: game.homeRest,
          teamContext
        }
      }),
      teasers,
      signals: evidence.status === "current"
        ? matchupSignals(away, home, { awayRest: game.awayRest, homeRest: game.homeRest })
        : [],
      evidence,
      movements: lineMovements(game.id, movementHistory, gameLines),
      availability,
      weather,
      quarterbacks
    };
  });
  const teaserPairs = rankTeaserPairs(games.flatMap((game) => game.teasers), {
    offeredAmerican: structuralConfig.teasers.screeningAmerican,
    minimumExpectedValue: structuralConfig.teasers.minimumExpectedValue,
    exceptionalEvThreshold: structuralConfig.teasers.preferredOpponentExceptionalEv
  });
  const marketCoverage = (["betmgm", "fanduel"] as const).flatMap((book) =>
    (["spread", "total", "moneyline"] as const).map((market) => {
      const completeGames = slate.games.filter((game) => {
        const pair = lines.filter((line) => line.gameId === game.id && line.book === book && line.market === market);
        return pair.length === 2 && pair.every((line) => line.fairProbability !== null);
      }).length;
      return {
        book,
        market,
        completeGames,
        totalGames: slate.games.length,
        status: completeGames === slate.games.length ? "complete" as const
          : completeGames > 0 ? "partial" as const : "unavailable" as const
      };
    })
  );
  return {
    generatedAt: new Date().toISOString(),
    season: slate.season,
    week: slate.week,
    basisSeason,
    artifactHash: artifact?.artifactHash ?? null,
    configHash,
    championHash,
    championStatus,
    games,
    teaserPairs,
    marketCoverage,
    method: `Leakage-safe rolling ${structuralConfig.matchupEvidence.windowGames}-game play-weighted ridge opponent adjustment for EPA, success and explosiveness (frozen penalty ${structuralConfig.matchupEvidence.ridgePenalty}); frozen-K cumulative margin-versus-close strength; ${championStatus === "compatible" ? "logged gated champion calibration" : "coefficient residual withheld pending a config-compatible logged champion"}; QB risk widens uncertainty while the rejected residual tier adjustment stays withheld unless an audited owner override exists; then 25% model and 75% power-de-vigged market shrinkage.`
  };
}
