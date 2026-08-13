import { stableHash } from "@/domain/hash";
import type { StoredPlayLeg } from "@/domain/play-card";
import { gradeStoredPlay, type CompletedGame } from "@/domain/settlement";
import { boardGameId, normalizeScheduleTeam } from "@/domain/weekly-slate";
import { ensurePlayStore } from "./play-store";

interface CompletedGameRow {
  game_id: string;
  away_team: string;
  home_team: string;
  away_score: number;
  home_score: number;
  source_row_hash: string;
}

interface OpenPlayRow {
  id: string;
  play_type: "single" | "parlay" | "teaser";
  american_odds: number;
  stake_cents: number;
  contract_json: string;
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
  await db.prepare(`CREATE TABLE IF NOT EXISTS play_settlement_audit (
    play_id text NOT NULL, final_hash text NOT NULL, result text NOT NULL,
    settled_at text NOT NULL, source text NOT NULL,
    PRIMARY KEY (play_id, final_hash)
  )`).run();
  const [finalRows, playRows] = await Promise.all([
    db.prepare(`SELECT game_id, away_team, home_team, away_score, home_score, source_row_hash
      FROM nfl_games WHERE season = 2026 AND season_type = 'REG' AND away_score IS NOT NULL AND home_score IS NOT NULL`)
      .all<CompletedGameRow>(),
    db.prepare(`SELECT id, play_type, american_odds, stake_cents, contract_json
      FROM plays WHERE season = 2026 AND status IN ('card', 'placed') AND result = 'pending'`)
      .all<OpenPlayRow>()
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
  let settled = 0;
  let deferred = 0;
  for (const play of playRows.results) {
    const contract = parseContract(play.contract_json);
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
    await db.batch([
      db.prepare(`UPDATE plays SET status = 'settled', result = ?, profit_cents = ?, updated_at = ?
        WHERE id = ? AND result = 'pending'`).bind(grade.result, grade.profitCents, settledAt, play.id),
      db.prepare(`INSERT OR IGNORE INTO play_settlement_audit (play_id, final_hash, result, settled_at, source)
        VALUES (?, ?, ?, ?, 'nflverse_finals')`).bind(play.id, finalHash, grade.result, settledAt)
    ]);
    settled += 1;
  }
  return { settled, deferred };
}
