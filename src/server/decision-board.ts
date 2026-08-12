import { structuralConfig } from "@/domain/config";
import {
  crossedKeyNumbers,
  fairAmericanFromProbability,
  isClassicWongPoint,
  marginVersusConsensusResidual,
  nflverseExpectedMarginToHomePoint,
  normalizeNflverseTeam,
  type BaselineProjection,
  type DecisionBoardPayload,
  type TeamBaseline,
  type TeaserCandidate
} from "@/domain/decision-board";
import { buildDiscreteMarginArtifact, translateFairProbability } from "@/domain/margin";
import { shrinkProbability } from "@/domain/odds";
import { enrichWithPowerDevig, type LiveLine } from "@/domain/line-board";
import type { HistoricalMarginRow } from "@/domain/types";
import { weekOneMatchups } from "@/lib/week-one-data";
import { getD1 } from "../../db";

interface FeatureRow {
  season: number;
  team: string;
  plays: number;
  epa_per_play: number;
  success_rate: number;
  explosive_rate: number;
  turnover_rate: number;
  seconds_per_play: number | null;
  pass_rate_over_expectation: number | null;
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
}

interface CurrentScheduleRow {
  game_id: string;
  away_team: string;
  home_team: string;
  spread_line: number | null;
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

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundHalf(value: number): number {
  return Math.max(-14, Math.min(14, Math.round(value * 2) / 2));
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
  for (const row of rows) {
    const team = normalizeNflverseTeam(row.team);
    const current = aggregates.get(team) ?? {
      team, season: row.season, games: 0, plays: 0, epa: 0, success: 0,
      explosive: 0, turnovers: 0, pace: 0, pacePlays: 0, proe: 0, proePlays: 0
    };
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
  }
  const base = [...aggregates.values()].map((item) => ({
    team: item.team,
    season: item.season,
    games: item.games,
    epaPerPlay: item.epa / Math.max(1, item.plays),
    successRate: item.success / Math.max(1, item.plays),
    explosiveRate: item.explosive / Math.max(1, item.plays),
    regressedTurnoverRate: (item.turnovers + leagueTurnoverRate * 200) / Math.max(1, item.plays + 200),
    secondsPerPlay: item.pacePlays ? item.pace / item.pacePlays : null,
    proe: item.proePlays ? item.proe / item.proePlays : null,
    strength: strengths.get(item.team) ?? 0
  }));
  const ranks = {
    epa: rank(base.map((item) => ({ team: item.team, value: item.epaPerPlay })), true),
    success: rank(base.map((item) => ({ team: item.team, value: item.successRate })), true),
    explosive: rank(base.map((item) => ({ team: item.team, value: item.explosiveRate })), true),
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
    regressedTurnoverRate: round(item.regressedTurnoverRate),
    secondsPerPlay: item.secondsPerPlay === null ? null : round(item.secondsPerPlay, 1),
    proe: item.proe === null ? null : round(item.proe),
    strength: round(item.strength, 2),
    ranks: {
      epa: ranks.epa.get(item.team)!, success: ranks.success.get(item.team)!, explosive: ranks.explosive.get(item.team)!,
      turnovers: ranks.turnovers.get(item.team)!, pace: ranks.pace.get(item.team) ?? null, proe: ranks.proe.get(item.team) ?? null, strength: ranks.strength.get(item.team)!
    }
  }]));
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

export async function buildDecisionBoard(db: D1Database = getD1()): Promise<DecisionBoardPayload> {
  const [seasonResult, lineResult, gameResult, currentScheduleResult] = await Promise.all([
    db.prepare("SELECT MAX(season) AS season FROM nfl_team_game_features WHERE season <= 2025").first<{ season: number | null }>(),
    db.prepare("SELECT * FROM live_lines ORDER BY game_id, book, market, side").all<LineRow>(),
    db.prepare(`SELECT game_id, season, week, game_date, away_team, home_team, result, spread_line
      FROM nfl_games WHERE season BETWEEN 2010 AND 2025 AND result IS NOT NULL AND spread_line IS NOT NULL
      ORDER BY game_date, game_id`).all<GameRow>(),
    db.prepare(`SELECT game_id, away_team, home_team, spread_line FROM nfl_games
      WHERE season = 2026 AND season_type = 'REG' AND week = 1`).all<CurrentScheduleRow>()
  ]);
  const basisSeason = seasonResult?.season ?? null;
  const featureRows = basisSeason === null
    ? []
    : (await db.prepare(`SELECT season, team, plays, epa_per_play, success_rate, explosive_rate,
        turnover_rate, seconds_per_play, pass_rate_over_expectation
        FROM nfl_team_game_features WHERE season = ? AND season_type = 'REG'`).bind(basisSeason).all<FeatureRow>()).results;
  const strengths = basisSeason === null ? new Map<string, number>() : strengthStates(gameResult.results.filter((row) => row.season >= basisSeason - 2), basisSeason);
  const profiles = teamProfiles(featureRows, strengths);
  const historicalRows: HistoricalMarginRow[] = gameResult.results.flatMap((row) => [
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
  const games = weekOneMatchups.map((game) => {
    const gameLines = lines.filter((line) => line.gameId === game.id);
    const homeSpreads = gameLines.filter((line) => line.market === "spread" && line.side === game.home && line.point !== null);
    const schedule = currentScheduleResult.results.find((row) => normalizeNflverseTeam(row.away_team) === game.away && normalizeNflverseTeam(row.home_team) === game.home);
    const scheduleHomePoint = schedule?.spread_line === null || schedule?.spread_line === undefined
      ? null
      : nflverseExpectedMarginToHomePoint(schedule.spread_line);
    const consensusHomePoint = homeSpreads.length
      ? homeSpreads.reduce((sum, line) => sum + (line.point ?? 0), 0) / homeSpreads.length
      : scheduleHomePoint;
    const strengthDelta = (strengths.get(game.home) ?? 0) - (strengths.get(game.away) ?? 0);
    type ProjectionAnchor = { book: "betmgm" | "caesars"; point: number; fairProbability: number; marketSource: BaselineProjection["marketSource"] };
    const projectionAnchors = (["betmgm", "caesars"] as const).flatMap<ProjectionAnchor>((book) => {
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
      return {
        gameId: game.id,
        book: anchor.book,
        homeTeam: game.home,
        marketHomePoint: anchor.point,
        projectedHomePoint,
        homeCoverProbability: modelProbability,
        shrunkHomeProbability: modelProbability === null ? null : shrinkProbability(modelProbability, anchor.fairProbability, structuralConfig.model.shrinkageWeight),
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
        originalPoint: line.point!,
        teasedPoint,
        fairProbability: translated.probability,
        fairAmerican: translated.probability === null ? null : fairAmericanFromProbability(translated.probability),
        classification,
        crossedKeys,
        warning: translated.warning
      };
    }) : [];
    return { gameId: game.id, away: profiles.get(game.away) ?? null, home: profiles.get(game.home) ?? null, projections, teasers };
  });
  return {
    generatedAt: new Date().toISOString(),
    basisSeason,
    artifactHash: artifact?.artifactHash ?? null,
    games,
    method: "Leakage-safe 2025 team efficiency and decay-weighted margin-versus-close strength, shrunk 25% toward a data-derived baseline and 75% toward the power-de-vigged market. This is the preseason baseline, not a promoted in-season champion."
  };
}
