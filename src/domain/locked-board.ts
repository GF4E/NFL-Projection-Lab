/** Published display DTO only. No pricing, selection, or grading in the site. */
export type Verdict = {
  state: "PLAY" | "TEASE" | "HARD PASS" | null;
  availability: string; reason?: string; side?: string; line?: number;
  book?: string; price?: number; fair_probability?: number; EV?: number;
  edge_source: string | null; grade: "W" | "L" | "PUSH" | null;
  grade_basis?: string; leg?: string; teased_line?: number;
  key_numbers_crossed?: number[]; best_book?: string; teaser_price?: number;
  partner_status?: "NEEDS_PARTNER";
};
export type LockedGame = {
  game_id: string; season: number; week: number; home_team: string; away_team: string;
  home_abbr: string; away_abbr: string; kickoff_at: string; expires_at: string;
  status: string; lock_status: string; version: string; freeze_time: string | null;
  verdicts: { spreads: Verdict; totals: Verdict };
  final_score?: { home: number; away: number }; margin?: number; total?: number;
  grade_status?: string;
};
export type LockedBoard = {
  schema: "locked-board-v1"; version: string; published_at: string;
  content_sha256: string; default_week: number; games: LockedGame[];
  publication_status?: "CURRENT" | "STALE";
};
