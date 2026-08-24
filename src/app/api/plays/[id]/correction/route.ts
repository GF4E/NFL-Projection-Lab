import { NextResponse } from "next/server";
import { z } from "zod";
import { getD1 } from "../../../../../../db";
import { correctStoredPlaySettlement } from "@/server/settlement-corrections";
import { isTeamAuthenticationError, requestTeamMember } from "@/server/team-auth";

export const dynamic = "force-dynamic";

const correctionSchema = z.object({
  result: z.enum(["win", "loss", "push", "void"]),
  reason: z.string().trim().min(8).max(500)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requestTeamMember(request);
    if (member.actor !== "analyst_a") return NextResponse.json({ error: "Only the owner may correct a settled play" }, { status: 403 });
    const { id } = await params;
    const input = correctionSchema.parse(await request.json());
    return NextResponse.json({
      correction: await correctStoredPlaySettlement({
        db: getD1(),
        playId: id,
        result: input.result,
        reason: input.reason,
        actorId: member.userId
      })
    });
  } catch (error) {
    if (isTeamAuthenticationError(error)) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid correction" }, { status: 400 });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Settlement correction failed" },
      { status: 409 }
    );
  }
}
