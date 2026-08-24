import { NextResponse } from "next/server";
import { buildDecisionBoard } from "@/server/decision-board";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const rawWeek = new URL(request.url).searchParams.get("week");
    const week = rawWeek === null ? undefined : Number(rawWeek);
    if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18)) {
      return NextResponse.json({ error: "week must be an integer from 1 through 18" }, { status: 400 });
    }
    return NextResponse.json(await buildDecisionBoard(undefined, { week }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build decision board" }, { status: 503 });
  }
}
