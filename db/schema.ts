import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const plays = sqliteTable("plays", {
  id: text("id").primaryKey(),
  season: integer("season").notNull().default(2026),
  week: integer("week").notNull(),
  playType: text("play_type", { enum: ["single", "parlay", "teaser"] }).notNull(),
  title: text("title").notNull(),
  legs: text("legs").notNull().default(""),
  book: text("book").notNull(),
  americanOdds: integer("american_odds").notNull(),
  stakeCents: integer("stake_cents").notNull(),
  modelEdgePp: real("model_edge_pp").notNull(),
  estimatedEvPercent: real("estimated_ev_percent").notNull(),
  confidence: text("confidence", { enum: ["watch", "lean", "play", "best"] }).notNull(),
  statsCase: text("stats_case").notNull(),
  footballCase: text("football_case").notNull().default("Awaiting football read"),
  status: text("status", { enum: ["research", "card", "placed", "settled", "passed"] }).notNull().default("card"),
  result: text("result", { enum: ["pending", "win", "loss", "push", "void"] }).notNull().default("pending"),
  profitCents: integer("profit_cents").notNull().default(0),
  closingClvCents: real("closing_clv_cents"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [
  index("idx_plays_season_week_status").on(table.season, table.week, table.status),
  index("idx_plays_created_at").on(table.createdAt),
  check("plays_play_type_check", sql`${table.playType} in ('single', 'parlay', 'teaser')`),
  check("plays_confidence_check", sql`${table.confidence} in ('watch', 'lean', 'play', 'best')`),
  check("plays_status_check", sql`${table.status} in ('research', 'card', 'placed', 'settled', 'passed')`),
  check("plays_result_check", sql`${table.result} in ('pending', 'win', 'loss', 'push', 'void')`),
  check("plays_stake_check", sql`${table.stakeCents} >= 1250`)
]);

export type PlayRow = typeof plays.$inferSelect;
export type NewPlayRow = typeof plays.$inferInsert;
