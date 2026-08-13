import { NextResponse } from "next/server";
import { z } from "zod";
import { getPlay, updatePlayResult } from "@/server/play-store";
import { isTeamAuthenticationError, requestTeamMember } from "@/server/team-auth";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.literal("placed"),
  result: z.literal("pending").default("pending")
});

function profitFor(stakeCents: number, americanOdds: number, result: "pending" | "win" | "loss" | "push" | "void") {
  if (result === "loss") return -stakeCents;
  if (result !== "win") return 0;
  return Math.round(stakeCents * (americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds)));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requestTeamMember(request);
    const { id } = await params;
    const input = updateSchema.parse(await request.json());
    const existing = await getPlay(id);
    if (!existing) return NextResponse.json({ error: "Play not found" }, { status: 404 });
    const play = await updatePlayResult(id, {
      status: input.status,
      result: input.result,
      profitCents: profitFor(existing.stakeCents, existing.americanOdds, input.result),
      closingClvCents: existing.closingClvCents,
      closingClvPoints: existing.closingClvPoints,
      clvReferenceBook: existing.clvReferenceBook,
      updatedAt: new Date().toISOString()
    });
    return NextResponse.json({ play });
  } catch (error) {
    if (isTeamAuthenticationError(error)) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid update" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update play" }, { status: 503 });
  }
}
