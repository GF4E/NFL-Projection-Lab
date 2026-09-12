/** Published display DTO only. No pricing, selection, or grading in the site. */
export type Verdict = {
  state: "PLAY" | "TEASE" | "HARD PASS" | null;
  availability: string; reason?: string; side?: string; line?: number;
  book?: string; price?: number; fair_probability?: number; EV?: number;
  edge_source: string | null; grade: "W" | "L" | "PUSH" | null;
  teaser_notice?: string | null; original_line?: number; teaser_price_basis?: string;
  teaser_pricing?: {as_of: string; source_page: string; scope: string};
  grade_basis?: string; leg?: string; teased_line?: number;
  key_numbers_crossed?: number[]; best_book?: string; teaser_price?: number;
  analytics?: {win?: number; loss?: number; push?: number; loo_center?: number; price_edge_cents?: number; quote_updated_at?: string};
  partner_status?: "NEEDS_PARTNER";
};
export type LockedGame = {
  prediction?: Week1Prediction;
  game_id: string; season: number; week: number; home_team: string; away_team: string;
  home_abbr: string; away_abbr: string; kickoff_at: string; expires_at: string;
  status: string; lock_status: string; version: string; freeze_time: string | null;
  verdicts: { spreads: Verdict; totals: Verdict };
  final_score?: { home: number; away: number }; margin?: number; total?: number;
  grade_status?: string;
  cutoff_at?: string; note_deadline?: string; captured_at?: string;
  analysis?: {sentences:string[]};
  our_note?: {game_id:string;author:'Gabe'|'Jarrett';text:string;market:'spreads'|'totals'|'';side:string;updated_at:string} | null;
  human_lean_grade?: string;
  quote_pairs?: {market:'spread'|'total';side:string;point:number;americanPrice:number;book:string;capturedAt:string;marketVigPercent:number}[];
  consensus?: Partial<Record<"spreads" | "totals", {line: number; coverage: number}>>;
  best_captured?: Partial<Record<"spreads" | "totals", {book: string; price: number; side: string; line: number}>>;
  executed_picks?: {side: string; line_at_approval: string; book_price: string; executed_book: string; outcome: string}[];
};
export type LockedBoard = {
  schema: "locked-board-v1"; version: string; published_at: string;
  content_sha256: string; default_week: number; games: LockedGame[];
  week_records?: Record<string, Record<"model" | "price" | "paper" | "jarrett", {wins: number; losses: number; pushes: number; mean_clv_cents: number | null; clv_n: number}> & {human_lean?: {wins:number;losses:number;pushes:number;mean_clv_cents:number|null;clv_n:number}}>;
  clv_reference?: string;
  publication_status?: "CURRENT" | "STALE";
};

export type Week1Prediction = {
  projection: {status: string; reason?: string; version: string; generated_at?: string; winner?: string;
    win_probability?: number; tie_probability?: number; coin_flip?: boolean; home_score?: number;
    away_score?: number; score_label?: string; expected_margin?: number; expected_total?: number};
  selections: Record<"spreads"|"totals", {status:string; reason?:string; side?:string; line?:number; book?:string;
    price?:number; win?:number; push?:number; fair_probability?:number; EV?:number; betting_status?:string;
    negative_EV?:boolean; grade?:string|null; explanation?:string; rationale?:{title:string; reasons:string[]; assessment:string}}>;
  stale:boolean; quote_at?:string; winner_grade?:string|null; frozen:boolean; explanation:string[];
};
