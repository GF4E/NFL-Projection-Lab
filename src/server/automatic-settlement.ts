import { stableHash } from "@/domain/hash";
import { structuralConfig } from "@/domain/config";
import { nflverseExpectedMarginToHomePoint } from "@/domain/decision-board";
import { buildDiscreteMarginArtifact } from "@/domain/margin";
import type { StoredPlayLeg } from "@/domain/play-card";
import type { HistoricalMarginRow } from "@/domain/types";
import { gradeStoredPlay, type CompletedGame } from "@/domain/settlement";
import { boardGameId, easternScheduleTimeToIso, normalizeScheduleTeam } from "@/domain/weekly-slate";
import { calculateStoredPlayClosingValue, type ClosingSnapshotRow } from "./closing-value";
import { ensureLiveLineStore } from "./live-line-store";
import { ensurePlayStore } from "./play-store";

interface CompletedGameRow {
  game_id: string;
  away_team: string;
  home_team: string;
  away_score: number;
  home_score: number;
  source_row_hash: string;
  game_date: string;
  game_time: string | null;
}

interface OpenPlayRow {
  id: string;
  play_type: "single" | "parlay" | "teaser";
  american_odds: number;
  stake_cents: number;
  contract_json: string;
  book: string;
  execution_status: "paper" | "executed";
}

interface HistoricalGameRow {
  game_id: string;
  season: number;
  result: number;
  spread_line: number;
}

function parseContract(raw: string): StoredPlayLeg[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as StoredPlayLeg[] : [];
  } catch {
    return [];
  }
}

export async function settleCompletedTeamPlays(db: D1Database, now = new Date()): Promise<{ settled: number; deferred: number }> {
  await ensurePlayStore(db);
  await ensureLiveLineStore(db);
  await db.prepare(`CREATE TABLE IF NOT EXISTS play_settlement_audit (
    play_id text NOT NULL, final_hash text NOT NULL, result text NOT NULL,
    settled_at text NOT NULL, source text NOT NULL,
    PRIMARY KEY (play_id, final_hash)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS play_clv_audit (
    play_id text PRIMARY KEY NOT NULL, reference_book text, clv_cents real, clv_points real,
    synthetic_closing_american real, detail_json text NOT NULL, calculated_at text NOT NULL,
    source text NOT NULL
  )`).run();
  const playRows = await db.prepare(`SELECT id, play_type, american_odds, stake_cents, contract_json, book, execution_status
    FROM plays WHERE season = 2026 AND status IN ('card', 'placed') AND result = 'pending'`)
    .all<OpenPlayRow>();
  if (!playRows.results.length) return { settled: 0, deferred: 0 };
  const contracts = new Map(playRows.results.map((play) => [play.id, parseContract(play.contract_json)]));
  const gameIds = [...new Set([...contracts.values()].flatMap((contract) => contract.map((leg) => leg.gameId)))];
  if (!gameIds.length) return { settled: 0, deferred: playRows.results.length };
  const placeholders = gameIds.map(() => "?").join(", ");
  const [finalRows, historicalRows, snapshotRows] = await Promise.all([
    db.prepare(`SELECT game_id, away_team, home_team, away_score, home_score, source_row_hash, game_date, game_time
      FROM nfl_games WHERE season = 2026 AND season_type = 'REG' AND away_score IS NOT NULL AND home_score IS NOT NULL`)
      .all<CompletedGameRow>(),
    db.prepare(`SELECT game_id, season, result, spread_line FROM nfl_games
      WHERE season BETWEEN ? AND 2025 AND season_type = 'REG' AND result IS NOT NULL AND spread_line IS NOT NULL`)
      .bind(structuralConfig.model.trainingStartSeason).all<HistoricalGameRow>(),
    db.prepare(`SELECT snapshot_key, line_id, game_id, book, market, side, point, american_price,
        captured_at, source_hash, fetched_at FROM live_line_snapshots
      WHERE game_id IN (${placeholders}) ORDER BY fetched_at`).bind(...gameIds).all<ClosingSnapshotRow>()
  ]);
  const games = new Map(finalRows.results.map((row) => {
    const awayTeam = normalizeScheduleTeam(row.away_team);
    const homeTeam = normalizeScheduleTeam(row.home_team);
    const game: CompletedGame = {
      gameId: boardGameId(awayTeam, homeTeam),
      awayTeam,
      homeTeam,
      awayScore: row.away_score,
      homeScore: row.home_score,
      sourceHash: row.source_row_hash
    };
    return [game.gameId, game] as const;
  }));
  const kickoffByGame = new Map(finalRows.results.map((row) => {
    const gameId = boardGameId(normalizeScheduleTeam(row.away_team), normalizeScheduleTeam(row.home_team));
    return [gameId, easternScheduleTimeToIso(row.game_date, row.game_time ?? "13:00")] as const;
  }));
  const marginRows: HistoricalMarginRow[] = historicalRows.results.flatMap((row) => [
    { gameId: `${row.game_id}:home`, season: row.season, consensusSpread: nflverseExpectedMarginToHomePoint(row.spread_line), actualMargin: row.result },
    { gameId: `${row.game_id}:away`, season: row.season, consensusSpread: row.spread_line, actualMargin: -row.result }
  ]);
  const artifact = marginRows.length ? buildDiscreteMarginArtifact(marginRows, {
    latestCompletedSeason: 2025,
    halfLifeSeasons: structuralConfig.model.decayHalfLifeSeasons,
    boundarySeason: structuralConfig.model.keyMarginBoundarySeason,
    keyMargins: structuralConfig.model.keyMargins,
    generatedAt: "2026-02-01T00:00:00.000Z"
  }) : null;
  let settled = 0;
  let deferred = 0;
  for (const play of playRows.results) {
    const contract = contracts.get(play.id) ?? [];
    const grade = gradeStoredPlay({
      playType: play.play_type,
      americanOdds: play.american_odds,
      stakeCents: play.stake_cents,
      contract
    }, games);
    if (!grade) {
      deferred += 1;
      continue;
    }
    const finalHash = stableHash(contract.map((leg) => {
      const game = games.get(leg.gameId);
      return game
        ? { gameId: game.gameId, awayScore: game.awayScore, homeScore: game.homeScore, sourceHash: game.sourceHash }
        : { gameId: leg.gameId };
    }));
    const settledAt = now.toISOString();
    const clv = calculateStoredPlayClosingValue({
      play: {
        playType: play.play_type,
        book: play.book,
        americanOdds: play.american_odds,
        executionStatus: play.execution_status,
        contract
      },
      rows: snapshotRows.results,
      kickoffByGame,
      artifact
    });
    await db.batch([
      db.prepare(`UPDATE plays SET status = 'settled', result = ?, profit_cents = ?, closing_clv_cents = ?,
        closing_clv_points = ?, clv_reference_book = ?, updated_at = ?
        WHERE id = ? AND result = 'pending'`).bind(
          grade.result, grade.profitCents, clv.cents, clv.points, clv.referenceBook, settledAt, play.id
        ),
      db.prepare(`INSERT OR IGNORE INTO play_settlement_audit (play_id, final_hash, result, settled_at, source)
        VALUES (?, ?, ?, ?, 'nflverse_finals')`).bind(play.id, finalHash, grade.result, settledAt),
      db.prepare(`INSERT OR REPLACE INTO play_clv_audit
        (play_id, reference_book, clv_cents, clv_points, synthetic_closing_american, detail_json, calculated_at, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'last_pre_kickoff_snapshot')`).bind(
          play.id, clv.referenceBook, clv.cents, clv.points, clv.syntheticClosingAmerican,
          JSON.stringify(clv.detail), settledAt
        )
    ]);
    settled += 1;
  }
  return { settled, deferred };
}
