import { stableHash } from "@/domain/hash";
import { normalizePropPlayerName, type PropMarketKey } from "@/domain/decision-board";
import { frozenMarginArtifact } from "@/domain/frozen-margin";
import type { StoredPlayLeg } from "@/domain/play-card";
import { gradeStoredPlay, type CompletedGame, type CompletedPlayerProp } from "@/domain/settlement";
import { boardGameId, easternScheduleTimeToIso, normalizeScheduleTeam } from "@/domain/weekly-slate";
import { calculateStoredPlayClosingValue, type ClosingSnapshotRow, type PropClosingSnapshotRow } from "./closing-value";
import { ensureLiveLineStore } from "./live-line-store";
import { ensureNflverseStore, getNflverseImportState } from "./nflverse/store";
import { ensurePlayerPropStore } from "./player-props";
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

interface PlayerStatRow {
  game_id: string;
  player_display_name: string;
  passing_yards: number;
  rushing_yards: number;
  receiving_yards: number;
  source_hash: string;
}

interface PlayerSnapRow {
  game_id: string;
  player: string;
  offense_snaps: number;
  defense_snaps: number;
  special_teams_snaps: number;
  source_hash: string;
}

function propValue(row: PlayerStatRow | undefined, market: PropMarketKey): number {
  if (!row) return 0;
  if (market === "player_pass_yds") return row.passing_yards;
  if (market === "player_rush_yds") return row.rushing_yards;
  return row.receiving_yards;
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
  await ensureNflverseStore(db);
  await ensurePlayerPropStore(db);
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
  const [finalRows, snapshotRows] = await Promise.all([
    db.prepare(`SELECT game_id, away_team, home_team, away_score, home_score, source_row_hash, game_date, game_time
      FROM nfl_games WHERE season = 2026 AND season_type = 'REG' AND away_score IS NOT NULL AND home_score IS NOT NULL`)
      .all<CompletedGameRow>(),
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
  const sourceGameByBoard = new Map(finalRows.results.map((row) => [
    boardGameId(normalizeScheduleTeam(row.away_team), normalizeScheduleTeam(row.home_team)),
    row.game_id
  ] as const));
  const kickoffByGame = new Map(finalRows.results.map((row) => {
    const gameId = boardGameId(normalizeScheduleTeam(row.away_team), normalizeScheduleTeam(row.home_team));
    return [gameId, easternScheduleTimeToIso(row.game_date, row.game_time ?? "13:00")] as const;
  }));
  const artifact = frozenMarginArtifact;
  const sourceGameIds = [...new Set(sourceGameByBoard.values())];
  const sourceGamePlaceholders = sourceGameIds.map(() => "?").join(", ");
  const [propSnapshotResult, currentPropResult, playerStatResult, snapResult, snapState] = await Promise.all([
    db.prepare(`SELECT snapshot_key, line_id, game_id, event_id, book, market, player, side, point,
        american_price, captured_at, source_hash, fetched_at FROM player_prop_quote_snapshots
      WHERE game_id IN (${placeholders}) ORDER BY fetched_at`).bind(...gameIds).all<PropClosingSnapshotRow>(),
    db.prepare(`SELECT id AS line_id, game_id, event_id, book, market, player, side, point,
        american_price, captured_at, source_hash FROM player_prop_quotes
      WHERE game_id IN (${placeholders})`).bind(...gameIds).all<Omit<PropClosingSnapshotRow, "snapshot_key" | "fetched_at">>(),
    sourceGameIds.length
      ? db.prepare(`SELECT game_id, player_display_name, passing_yards, rushing_yards, receiving_yards, source_hash
          FROM nfl_player_week_stats WHERE game_id IN (${sourceGamePlaceholders})`).bind(...sourceGameIds).all<PlayerStatRow>()
      : Promise.resolve({ results: [] as PlayerStatRow[] }),
    sourceGameIds.length
      ? db.prepare(`SELECT game_id, player, offense_snaps, defense_snaps, special_teams_snaps, source_hash
          FROM nfl_player_snap_counts WHERE game_id IN (${sourceGamePlaceholders})`).bind(...sourceGameIds).all<PlayerSnapRow>()
      : Promise.resolve({ results: [] as PlayerSnapRow[] }),
    getNflverseImportState(db, "snap_counts:2026")
  ]);
  const propRows: PropClosingSnapshotRow[] = [
    ...propSnapshotResult.results,
    ...currentPropResult.results.map((row) => ({
      ...row,
      snapshot_key: `current:${row.source_hash}`,
      fetched_at: row.captured_at
    }))
  ];
  const propIdentity = new Map(propRows.map((row) => [row.line_id, row]));
  const statsByGamePlayer = new Map<string, PlayerStatRow>(playerStatResult.results.map((row) => [
    `${row.game_id}:${normalizePropPlayerName(row.player_display_name)}`,
    row
  ] as const));
  const snapsByGamePlayer = new Map<string, PlayerSnapRow>(snapResult.results.map((row) => [
    `${row.game_id}:${normalizePropPlayerName(row.player)}`,
    row
  ] as const));
  const snapGames = new Set(snapResult.results.map((row) => row.game_id));
  const propOutcomes = new Map<string, CompletedPlayerProp>();
  if (snapState?.freshness === "current") {
    for (const contract of contracts.values()) {
      for (const leg of contract) {
        if (leg.market !== "prop" || !leg.sourceQuoteId) continue;
        const identity = propIdentity.get(leg.sourceQuoteId);
        const sourceGameId = sourceGameByBoard.get(leg.gameId);
        if (!identity || !sourceGameId || !snapGames.has(sourceGameId)) continue;
        const playerKey = `${sourceGameId}:${normalizePropPlayerName(identity.player)}`;
        const snap = snapsByGamePlayer.get(playerKey);
        const played = snap ? snap.offense_snaps + snap.defense_snaps + snap.special_teams_snaps > 0 : false;
        const stat = statsByGamePlayer.get(playerKey);
        propOutcomes.set(leg.sourceQuoteId, {
          sourceQuoteId: leg.sourceQuoteId,
          gameId: leg.gameId,
          player: identity.player,
          market: identity.market,
          value: played ? propValue(stat, identity.market) : null,
          sourceHash: stableHash({ snap: snap?.source_hash ?? null, stat: stat?.source_hash ?? null }),
          voided: !played
        });
      }
    }
  }
  let settled = 0;
  let deferred = 0;
  for (const play of playRows.results) {
    const contract = contracts.get(play.id) ?? [];
    const grade = gradeStoredPlay({
      playType: play.play_type,
      americanOdds: play.american_odds,
      stakeCents: play.stake_cents,
      contract
    }, games, propOutcomes);
    if (!grade) {
      deferred += 1;
      continue;
    }
    const finalHash = stableHash(contract.map((leg) => {
      const game = games.get(leg.gameId);
      const prop = leg.sourceQuoteId ? propOutcomes.get(leg.sourceQuoteId) : null;
      return game
        ? { gameId: game.gameId, awayScore: game.awayScore, homeScore: game.homeScore, sourceHash: game.sourceHash, prop }
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
      propRows,
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
        VALUES (?, ?, ?, ?, ?)`).bind(
          play.id,
          finalHash,
          grade.result,
          settledAt,
          contract.some((leg) => leg.market === "prop") ? "nflverse_finals_player_stats_snap_counts" : "nflverse_finals"
        ),
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
