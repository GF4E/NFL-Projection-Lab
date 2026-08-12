import { structuralConfig } from "@/domain/config";
import {
  crossedKeyNumbers,
  fairAmericanFromProbability,
  isClassicWongPoint,
  marginVersusConsensusResidual,
  nflverseExpectedMarginToHomePoint,
  normalizeNflverseTeam,
  rankTeaserPairs,
  type BaselineProjection,
  type DecisionBoardPayload,
  type LineMovementSeries,
  type MatchupSignal,
  type TeamBaseline,
  type TeaserCandidate
} from "@/domain/decision-board";
import type { TotalProjection } from "@/domain/decision-board";
import { buildDiscreteMarginArtifact, translateFairProbability } from "@/domain/margin";
import { bootstrapEdgeInterval, type WeightedTrainingRow } from "@/domain/bootstrap";
import { shrinkProbability } from "@/domain/odds";
import { americanToDecimal } from "@/domain/odds";
import { enrichWithPowerDevig, type LiveLine } from "@/domain/line-board";
import type { HistoricalMarginRow } from "@/domain/types";
import { weeklySlate } from "./weekly-slate";
import { getD1 } from "../../db";

interface FeatureRow {
  season: number;
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
  edgeNoiseInterval: [number, number] | null
): TotalProjection[] {
  const projectedTotal = projectTotal(away, home, leagueScoring);
  if (projectedTotal === null) return [];
  return (["betmgm", "fanduel"] as const).flatMap<TotalProjection>((book) => {
    const over = gameLines.find((line) => line.book === book && line.market === "total" && line.side.toLowerCase() === "over" && line.point !== null);
    const under = gameLines.find((line) => line.book === book && line.market === "total" && line.side.toLowerCase() === "under" && line.point !== null);
    const marketPoint = over?.point ?? under?.point;
    if (marketPoint === null || marketPoint === undefined) return [];
    const pointEdge = projectedTotal - marketPoint;
    const lean: TotalProjection["lean"] = Math.abs(pointEdge) < 1.5 ? "Pass" : pointEdge > 0 ? "Over" : "Under";
    const selected = lean === "Over" ? over : lean === "Under" ? under : null;
    const modelProbability = lean === "Pass" ? null : Math.max(0.05, Math.min(0.95, 0.5 + Math.abs(pointEdge) * 0.025));
    const fairProbability = selected?.fairProbability ?? null;
    const shrunkProbability = modelProbability === null || fairProbability === null
      ? null
      : shrinkProbability(modelProbability, fairProbability, structuralConfig.model.shrinkageWeight);
    const expectedValue = selected && shrunkProbability !== null
      ? shrunkProbability * americanToDecimal(selected.americanPrice) - 1
      : null;
    const center = shrunkProbability === null || fairProbability === null ? null : shrunkProbability - fairProbability;
    const edgeInterval = edgeNoiseInterval === null || center === null
      ? null
      : [center + edgeNoiseInterval[0], center + edgeNoiseInterval[1]] as [number, number];
    return [{ gameId, book, marketPoint, projectedTotal, lean, pointEdge, fairProbability, shrunkProbability, expectedValue, edgeInterval }];
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
    return {
      team: item.team,
      season: item.season,
      games: item.games,
      epaPerPlay: item.epa / Math.max(1, item.plays),
      successRate: item.success / Math.max(1, item.plays),
      explosiveRate: item.explosive / Math.max(1, item.plays),
      defenseEpaAllowed: (defense?.epaAllowed ?? 0) / Math.max(1, defense?.plays ?? 0),
      defenseSuccessAllowed: (defense?.successAllowed ?? 0) / Math.max(1, defense?.plays ?? 0),
      defenseExplosiveAllowed: (defense?.explosiveAllowed ?? 0) / Math.max(1, defense?.plays ?? 0),
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

function matchupMetricSignal(input: {
  id: "efficiency" | "success" | "explosive";
  label: string;
  away: TeamBaseline;
  home: TeamBaseline;
  awayOffenseRank: number;
  homeOffenseRank: number;
  awayDefenseRank: number;
  homeDefenseRank: number;
}): MatchupSignal | null {
  const awayScore = 33 - input.awayOffenseRank + input.homeDefenseRank;
  const homeScore = 33 - input.homeOffenseRank + input.awayDefenseRank;
  const difference = homeScore - awayScore;
  if (Math.abs(difference) < 7) return null;
  const team = difference > 0 ? input.home : input.away;
  const opponent = difference > 0 ? input.away : input.home;
  const offenseRank = difference > 0 ? input.homeOffenseRank : input.awayOffenseRank;
  const opponentDefenseRank = difference > 0 ? input.awayDefenseRank : input.homeDefenseRank;
  return {
    id: input.id,
    label: input.label,
    lean: team.team,
    detail: `${team.team} O #${offenseRank} vs ${opponent.team} D #${opponentDefenseRank}`,
    strength: Math.abs(difference)
  };
}

function matchupSignals(away: TeamBaseline | null, home: TeamBaseline | null): MatchupSignal[] {
  if (!away || !home) return [];
  const candidates: Array<MatchupSignal | null> = [
    matchupMetricSignal({
      id: "efficiency", label: "EPA EDGE", away, home,
      awayOffenseRank: away.ranks.epa, homeOffenseRank: home.ranks.epa,
      awayDefenseRank: away.ranks.defenseEpa, homeDefenseRank: home.ranks.defenseEpa
    }),
    matchupMetricSignal({
      id: "success", label: "DOWN-TO-DOWN", away, home,
      awayOffenseRank: away.ranks.success, homeOffenseRank: home.ranks.success,
      awayDefenseRank: away.ranks.defenseSuccess, homeDefenseRank: home.ranks.defenseSuccess
    }),
    matchupMetricSignal({
      id: "explosive", label: "EXPLOSIVE", away, home,
      awayOffenseRank: away.ranks.explosive, homeOffenseRank: home.ranks.explosive,
      awayDefenseRank: away.ranks.defenseExplosive, homeDefenseRank: home.ranks.defenseExplosive
    })
  ];
  const turnoverDifference = away.regressedTurnoverRate - home.regressedTurnoverRate;
  if (Math.abs(turnoverDifference) >= 0.003) {
    const lean = turnoverDifference > 0 ? home : away;
    candidates.push({
      id: "turnovers",
      label: "BALL SECURITY",
      lean: lean.team,
      detail: `${(lean.regressedTurnoverRate * 100).toFixed(1)}% regressed turnover rate`,
      strength: Math.abs(turnoverDifference) * 1_000
    });
  }
  if (away.ranks.pace !== null && home.ranks.pace !== null) {
    if (away.ranks.pace <= 12 && home.ranks.pace <= 12) {
      candidates.push({ id: "pace", label: "PACE", lean: "OVER", detail: `tempo #${away.ranks.pace} / #${home.ranks.pace}`, strength: 9 });
    } else if (away.ranks.pace >= 21 && home.ranks.pace >= 21) {
      candidates.push({ id: "pace", label: "PACE", lean: "UNDER", detail: `tempo #${away.ranks.pace} / #${home.ranks.pace}`, strength: 9 });
    }
  }
  return candidates.filter((signal): signal is MatchupSignal => signal !== null)
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 3);
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

function strengthStates(games: GameRow[], latestSeason: number): Map<string, number> {
  const states = new Map<string, number>();
  for (const game of [...games].sort((left, right) => left.game_date.localeCompare(right.game_date) || left.week - right.week)) {
    const timeWeight = 0.5 ** ((latestSeason - game.season) / structuralConfig.model.decayHalfLifeSeasons);
    const residual = marginVersusConsensusResidual(game.result, game.spread_line);
    const move = structuralConfig.model.strengthK * timeWeight * residual / 2;
    const homeTeam = normalizeNflverseTeam(game.home_team);
    const awayTeam = normalizeNflverseTeam(game.away_team);
    states.set(homeTeam, (states.get(homeTeam) ?? 0) + move);
    states.set(awayTeam, (states.get(awayTeam) ?? 0) - move);
  }
  return states;
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
  const activeGameIds = slate.games.map((game) => game.id);
  const activePlaceholders = activeGameIds.map(() => "?").join(", ");
  const [lineResult, gameResult, featureResult, movementHistory] = await Promise.all([
    db.prepare(`SELECT * FROM live_lines WHERE game_id IN (${activePlaceholders}) ORDER BY game_id, book, market, side`).bind(...activeGameIds).all<LineRow>(),
    db.prepare(`SELECT game_id, season, week, game_date, away_team, home_team, result, spread_line, total, total_line
      FROM nfl_games WHERE season BETWEEN 2010 AND ? AND result IS NOT NULL AND spread_line IS NOT NULL
        AND (season < ? OR week < ?)
      ORDER BY game_date, game_id`).bind(slate.season, slate.season, slate.week).all<GameRow>(),
    db.prepare(`SELECT season, team, opponent, plays, epa_per_play, success_rate, explosive_rate,
        turnover_rate, seconds_per_play, pass_rate_over_expectation FROM (
          SELECT season, week, team, opponent, plays, epa_per_play, success_rate, explosive_rate,
            turnover_rate, seconds_per_play, pass_rate_over_expectation,
            ROW_NUMBER() OVER (PARTITION BY team ORDER BY season DESC, week DESC, game_date DESC) AS recency_rank
          FROM nfl_team_game_features
          WHERE season_type = 'REG' AND (season < ? OR (season = ? AND week < ?))
        ) WHERE recency_rank <= 17
        ORDER BY season DESC, week DESC`).bind(slate.season, slate.season, slate.week).all<FeatureRow>(),
    loadMovementHistory(db, activeGameIds)
  ]);
  const featureRows = featureResult.results;
  const latestTrainingSeason = Math.max(structuralConfig.model.trainingStartSeason, ...gameResult.results.map((row) => row.season));
  const leagueScoring = weightedLeagueScoring(gameResult.results.filter((row) => row.season >= slate.season - 3), slate.season);
  const basisSeason = featureRows.length ? Math.max(...featureRows.map((row) => row.season)) : null;
  const strengths = basisSeason === null ? new Map<string, number>() : strengthStates(gameResult.results.filter((row) => row.season >= slate.season - 3), slate.season);
  const profiles = teamProfiles(featureRows, strengths);
  const historicalRows: HistoricalMarginRow[] = gameResult.results.filter((row) => row.season <= 2025).flatMap((row) => [
    { gameId: `${row.game_id}:home`, season: row.season, consensusSpread: nflverseExpectedMarginToHomePoint(row.spread_line), actualMargin: row.result },
    { gameId: `${row.game_id}:away`, season: row.season, consensusSpread: row.spread_line, actualMargin: -row.result }
  ]);
  const artifact = historicalRows.length ? buildDiscreteMarginArtifact(historicalRows, {
    latestCompletedSeason: 2025,
    halfLifeSeasons: structuralConfig.model.decayHalfLifeSeasons,
    boundarySeason: structuralConfig.model.keyMarginBoundarySeason,
    keyMargins: structuralConfig.model.keyMargins,
    generatedAt: new Date().toISOString()
  }) : null;
  const lines = enrichWithPowerDevig(lineResult.results.map(rawLine));
  const sideEdgeNoise = historicalEdgeInterval(gameResult.results.map((row) => ({
    edge: Math.max(-0.25, Math.min(0.25, marginVersusConsensusResidual(row.result, row.spread_line) * 0.025)),
    weight: 0.5 ** ((latestTrainingSeason - row.season) / structuralConfig.model.decayHalfLifeSeasons)
  })));
  const totalEdgeNoise = historicalEdgeInterval(gameResult.results.flatMap((row) => row.total === null || row.total_line === null ? [] : [{
    edge: Math.max(-0.25, Math.min(0.25, (row.total - row.total_line) * 0.025)),
    weight: 0.5 ** ((latestTrainingSeason - row.season) / structuralConfig.model.decayHalfLifeSeasons)
  }]));
  const games = slate.games.map((game) => {
    const gameLines = lines.filter((line) => line.gameId === game.id);
    const homeSpreads = gameLines.filter((line) => line.market === "spread" && line.side === game.home && line.point !== null);
    const scheduleHomePoint = game.consensusHomePoint;
    const consensusHomePoint = homeSpreads.length
      ? homeSpreads.reduce((sum, line) => sum + (line.point ?? 0), 0) / homeSpreads.length
      : scheduleHomePoint;
    const strengthDelta = (strengths.get(game.home) ?? 0) - (strengths.get(game.away) ?? 0);
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
    const projections: BaselineProjection[] = artifact && consensusHomePoint !== null ? projectionAnchors.map((anchor) => {
      const projectedHomePoint = roundHalf(anchor.point - strengthDelta);
      const translated = translateFairProbability(artifact, consensusHomePoint, projectedHomePoint, anchor.point, 0.5);
      const modelProbability = translated.probability;
      const shrunkHomeProbability = modelProbability === null ? null : shrinkProbability(modelProbability, anchor.fairProbability, structuralConfig.model.shrinkageWeight);
      const edgeCenter = shrunkHomeProbability === null ? null : shrunkHomeProbability - anchor.fairProbability;
      return {
        gameId: game.id,
        book: anchor.book,
        homeTeam: game.home,
        marketHomePoint: anchor.point,
        projectedHomePoint,
        homeCoverProbability: modelProbability,
        shrunkHomeProbability,
        edgeInterval: edgeCenter === null || sideEdgeNoise === null
          ? null
          : [edgeCenter + sideEdgeNoise[0], edgeCenter + sideEdgeNoise[1]],
        marketHomeProbability: anchor.fairProbability,
        marketSource: anchor.marketSource,
        translationWarning: translated.warning
      };
    }) : [];
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
        fairAmerican: translated.probability === null ? null : fairAmericanFromProbability(translated.probability),
        classification,
        crossedKeys,
        warning: translated.warning
      };
    }) : [];
    const away = profiles.get(game.away) ?? null;
    const home = profiles.get(game.home) ?? null;
    return {
      gameId: game.id,
      away,
      home,
      projections,
      totals: totalProjections(game.id, gameLines, away, home, leagueScoring, totalEdgeNoise),
      teasers,
      signals: matchupSignals(away, home),
      movements: lineMovements(game.id, movementHistory, gameLines)
    };
  });
  const teaserPairs = rankTeaserPairs(games.flatMap((game) => game.teasers));
  return {
    generatedAt: new Date().toISOString(),
    season: slate.season,
    week: slate.week,
    basisSeason,
    artifactHash: artifact?.artifactHash ?? null,
    games,
    teaserPairs,
    method: "Leakage-safe rolling 17-game offense and defense evidence with decay-weighted margin-versus-close strength, shrunk 25% toward the model and 75% toward the power-de-vigged market."
  };
}
