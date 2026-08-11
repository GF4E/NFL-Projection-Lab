import { NextResponse } from "next/server";
import { z } from "zod";
import { estimatedEvFromEdge, type WeeklyPlay } from "@/domain/play-card";
import { addPlay, listPlays } from "@/server/play-store";

export const dynamic = "force-dynamic";

const createPlaySchema = z.object({
  playType: z.enum(["single", "parlay", "teaser"]),
  title: z.string().trim().min(3).max(120),
  legs: z.string().trim().min(3).max(180),
  book: z.enum(["BetMGM", "FanDuel"]),
  americanOdds: z.number().int().refine((value) => value <= -100 || value >= 100, "Use valid American odds"),
  stakeDollars: z.number().min(12.5).max(200),
  modelEdgePp: z.number().min(-10).max(20),
  confidence: z.enum(["watch", "lean", "play", "best"]),
  statsCase: z.string().trim().min(8).max(500),
  footballCase: z.string().trim().min(3).max(500),
  status: z.enum(["research", "card"]).default("card")
});

function requestAuthor(request: Request): string {
  return request.headers.get("oai-authenticated-user-email") ?? "owner-preview";
}

export async function GET(request: Request) {
  try {
    const week = Number(new URL(request.url).searchParams.get("week") ?? "1");
    return NextResponse.json({ plays: await listPlays(Number.isFinite(week) ? week : 1) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load plays" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const input = createPlaySchema.parse(await request.json());
    const now = new Date().toISOString();
    const play: WeeklyPlay = {
      id: crypto.randomUUID(),
      season: 2026,
      week: 1,
      playType: input.playType,
      title: input.title,
      legs: input.legs,
      book: input.book,
      americanOdds: input.americanOdds,
      stakeCents: Math.round(input.stakeDollars * 100),
      modelEdgePp: input.modelEdgePp,
      estimatedEvPercent: estimatedEvFromEdge(input.americanOdds, input.modelEdgePp),
      confidence: input.confidence,
      statsCase: input.statsCase,
      footballCase: input.footballCase,
      status: input.status,
      result: "pending",
      profitCents: 0,
      closingClvCents: null,
      createdBy: requestAuthor(request),
      createdAt: now,
      updatedAt: now
    };
    return NextResponse.json({ play: await addPlay(play) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid play" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add play" }, { status: 503 });
  }
}
