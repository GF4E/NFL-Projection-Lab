import { edgeThresholdCrossed } from "@/domain/automation";
import { structuralConfig } from "@/domain/config";
import type { DecisionBoardPayload } from "@/domain/decision-board";
import type { LineBookKey, LiveLine } from "@/domain/line-board";
import { rankMainlineRecommendations } from "@/domain/mainline-recommendations";
import type { PickedBy } from "@/domain/play-card";
import type { WeeklyMatchup } from "@/domain/weekly-slate";
import { PREFERRED_TEAM_CODES } from "@/domain/team-preferences";
import { queueAndDispatchPush } from "./store";

const recipients: readonly PickedBy[] = ["analyst_a", "analyst_b"];
const books: readonly LineBookKey[] = ["betmgm", "fanduel"];
const preferredTeams = new Set<string>(PREFERRED_TEAM_CODES);

export interface EdgeObservation {
  key: string;
  gameId: string;
  book: LineBookKey;
  market: LiveLine["market"];
  side: string;
  point: number | null;
  americanPrice: number;
  probabilityEdge: number;
  capturedAt: string;
}

interface EdgeStateRow {
  observation_key: string;
  probability_edge: number;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS edge_notification_state (
    observation_key text PRIMARY KEY NOT NULL,
    game_id text NOT NULL,
    book text NOT NULL,
    market text NOT NULL,
    side text NOT NULL,
    point real,
    american_price integer NOT NULL,
    probability_edge real NOT NULL,
    snapshot_key text NOT NULL,
    captured_at text NOT NULL,
    updated_at text NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_edge_notification_game ON edge_notification_state (game_id, market, book)"
] as const;

async function ensureEdgeNotificationStore(db: D1Database): Promise<void> {
  await db.batch(schema.map((statement) => db.prepare(statement)));
}

export function collectMainlineEdgeObservations(input: {
  board: DecisionBoardPayload;
  lines: readonly LiveLine[];
  matchups: readonly WeeklyMatchup[];
}): EdgeObservation[] {
  const matchups = new Map(input.matchups.map((game) => [game.id, game]));
  const observations: EdgeObservation[] = [];
  for (const game of input.board.games) {
    const matchup = matchups.get(game.gameId);
    if (!matchup) continue;
    for (const book of books) {
      const recommendations = rankMainlineRecommendations({
        gameId: game.gameId,
        awayTeam: matchup.away,
        homeTeam: matchup.home,
        book,
        lines: input.lines,
        spread: game.projections.find((projection) => projection.book === book) ?? null,
        total: game.totals.find((projection) => projection.book === book) ?? null,
        moneyline: game.moneylines.find((projection) => projection.book === book) ?? null,
        preferredTeams
      });
      for (const recommendation of recommendations) {
        if (!Number.isFinite(recommendation.probabilityEdge)) continue;
        observations.push({
          key: `${game.gameId}:${book}:${recommendation.market}:${recommendation.line.side.toLowerCase()}`,
          gameId: game.gameId,
          book,
          market: recommendation.market,
          side: recommendation.line.side,
          point: recommendation.line.point,
          americanPrice: recommendation.line.americanPrice,
          probabilityEdge: recommendation.probabilityEdge,
          capturedAt: recommendation.line.capturedAt
        });
      }
    }
  }
  return observations;
}

function contractLabel(observation: EdgeObservation): string {
  const point = observation.point === null ? "" : ` ${observation.point > 0 ? "+" : ""}${observation.point}`;
  const price = `${observation.americanPrice > 0 ? "+" : ""}${observation.americanPrice}`;
  const book = observation.book === "betmgm" ? "BetMGM" : "FanDuel";
  return `${observation.side}${point} ${price} at ${book}`;
}

export async function publishEdgeThresholdNotifications(input: {
  db: D1Database;
  board: DecisionBoardPayload;
  lines: readonly LiveLine[];
  matchups: readonly WeeklyMatchup[];
  snapshotKey: string;
  now?: string;
  fetcher?: typeof fetch;
}): Promise<{ observed: number; crossed: number; deliveries: number }> {
  await ensureEdgeNotificationStore(input.db);
  const observations = collectMainlineEdgeObservations(input);
  if (!observations.length) return { observed: 0, crossed: 0, deliveries: 0 };
  const placeholders = observations.map(() => "?").join(", ");
  const previousRows = await input.db.prepare(`SELECT observation_key, probability_edge
    FROM edge_notification_state WHERE observation_key IN (${placeholders})`)
    .bind(...observations.map((observation) => observation.key)).all<EdgeStateRow>();
  const previous = new Map(previousRows.results.map((row) => [row.observation_key, row.probability_edge]));
  const now = input.now ?? new Date().toISOString();
  const crossed = observations.filter((observation) => {
    const prior = previous.get(observation.key);
    return prior !== undefined && edgeThresholdCrossed(
      prior,
      observation.probabilityEdge,
      structuralConfig.monitoring.pushEdgeThreshold
    );
  });
  await input.db.batch(observations.map((observation) => input.db.prepare(`INSERT INTO edge_notification_state
      (observation_key, game_id, book, market, side, point, american_price, probability_edge,
       snapshot_key, captured_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(observation_key) DO UPDATE SET point = excluded.point,
        american_price = excluded.american_price, probability_edge = excluded.probability_edge,
        snapshot_key = excluded.snapshot_key, captured_at = excluded.captured_at,
        updated_at = excluded.updated_at`)
    .bind(observation.key, observation.gameId, observation.book, observation.market, observation.side,
      observation.point, observation.americanPrice, observation.probabilityEdge,
      input.snapshotKey, observation.capturedAt, now)));
  let deliveries = 0;
  for (const observation of crossed) {
    for (const recipientId of recipients) {
      await queueAndDispatchPush({
        db: input.db,
        type: "edge_threshold",
        recipientId,
        idempotencyKey: `edge_threshold:${input.snapshotKey}:${observation.key}:${recipientId}`,
        title: "Edge threshold",
        body: `${contractLabel(observation)} crossed to ${(observation.probabilityEdge * 100).toFixed(1)}pp.`,
        now,
        fetcher: input.fetcher
      });
      deliveries += 1;
    }
  }
  return { observed: observations.length, crossed: crossed.length, deliveries };
}
