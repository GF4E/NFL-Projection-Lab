import { NextResponse } from "next/server";
import { z } from "zod";
import { createQbModelOverride, latestQbModelOverrides } from "@/server/qb-overrides/store";
import { isTeamAuthenticationError, requestTeamMember } from "@/server/team-auth";
import { getD1 } from "../../../../db";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  gameId: z.string().trim().min(3).max(40),
  team: z.string().trim().min(2).max(3).transform((value) => value.toUpperCase()),
  value: z.number().min(-14).max(14),
  sourceUrl: z.string().url().startsWith("https://"),
  rationale: z.string().trim().min(8).max(500)
});

export async function GET(request: Request) {
  try {
    await requestTeamMember(request);
    const gameId = new URL(request.url).searchParams.get("gameId")?.trim();
    if (!gameId) return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    return NextResponse.json({ overrides: await latestQbModelOverrides(getD1(), [gameId]) });
  } catch (error) {
    if (isTeamAuthenticationError(error)) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read QB overrides" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const member = await requestTeamMember(request);
    if (member.actor !== "analyst_a") return NextResponse.json({ error: "Only the owner may set a QB override" }, { status: 403 });
    const input = inputSchema.parse(await request.json());
    return NextResponse.json({
      override: await createQbModelOverride({ db: getD1(), ...input, authorId: member.userId })
    }, { status: 201 });
  } catch (error) {
    if (isTeamAuthenticationError(error)) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid QB override" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create QB override" }, { status: 503 });
  }
}
