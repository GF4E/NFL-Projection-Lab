import { NextResponse } from "next/server";
import { z } from "zod";
import { getPlay, updatePlayResult } from "@/server/play-store";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["card", "placed", "settled", "passed"]),
  result: z.enum(["pending", "win", "loss", "push", "void"]).default("pending"),
  closingClvCents: z.number().min(-100).max(100).nullable().default(null)
});

function profitFor(stakeCents: number, americanOdds: number, result: "pending" | "win" | "loss" | "push" | "void") {
  if (result === "loss") return -stakeCents;
  if (result !== "win") return 0;
  return Math.round(stakeCents * (americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds)));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = updateSchema.parse(await request.json());
    const existing = await getPlay(id);
    if (!existing) return NextResponse.json({ error: "Play not found" }, { status: 404 });
    const play = await updatePlayResult(id, {
      status: input.status,
      result: input.result,
      profitCents: profitFor(existing.stakeCents, existing.americanOdds, input.result),
      closingClvCents: input.closingClvCents,
      updatedAt: new Date().toISOString()
    });
    return NextResponse.json({ play });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid update" }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update play" }, { status: 503 });
  }
}
