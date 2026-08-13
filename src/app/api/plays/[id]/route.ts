import { NextResponse } from "next/server";
import { z } from "zod";
import { cashPlacementEligibilityError } from "@/domain/play-card";
import { confirmCashPlacement, getPlay } from "@/server/play-store";
import { isTeamAuthenticationError, requestTeamMember } from "@/server/team-auth";
import { seasonSchedule } from "@/server/weekly-slate";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.literal("placed"),
  result: z.literal("pending").default("pending")
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requestTeamMember(request);
    const { id } = await params;
    updateSchema.parse(await request.json());
    const existing = await getPlay(id);
    if (!existing) return NextResponse.json({ error: "Play not found" }, { status: 404 });
    if (existing.status === "placed" && existing.executionStatus === "executed" && existing.cashPlacementConfirmed) {
      return NextResponse.json({ play: existing });
    }
    const now = new Date().toISOString();
    const schedule = await seasonSchedule({ season: existing.season });
    const kickoffByGame = new Map(schedule.map((game) => [game.id, game.kickoffAt]));
    const eligibilityError = cashPlacementEligibilityError(existing, now, kickoffByGame);
    if (eligibilityError) return NextResponse.json({ error: eligibilityError }, { status: 409 });
    // Preserve the immutable approved contract; this transition records only the external fact of placement.
    const play = await confirmCashPlacement(id, now);
    return NextResponse.json({ play });
  } catch (error) {
    if (isTeamAuthenticationError(error)) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid update" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update play" }, { status: 503 });
  }
}
