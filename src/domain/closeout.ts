export type CloseoutMeta = {
  key: string; season: number; week: number; published_at: string;
  receipt_sha256: string; receipt_source_commit: string; source_commit: string;
  artifacts: Record<string, string>;
};
export type CloseoutScorecard = {
  season: number; week: number; schedule_games: number; as_issued_games: number;
  unqualified_games: string[]; scorecard: Record<string, number | null>;
  best_five: string[]; worst_five: string[];
  games: {game_id: string; away: string; home: string; final?: {away_points: number; home_points: number};
    projection?: {away_points: number; home_points: number}}[];
  reference_lines?: {series?: Record<string, {audit: {references: Record<string, Record<string, {
    weeks?: Record<string, {correct: number; games: number; rate: number | null; interval95: [number, number] | null; coverage: number}>;
  }>>}}>};
};
