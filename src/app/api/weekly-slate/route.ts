import { NextResponse } from "next/server";
import { weeklySlate } from "@/server/weekly-slate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const rawWeek = new URL(request.url).searchParams.get("week");
    const week = rawWeek === null ? undefined : Number(rawWeek);
    if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 18)) {
      return NextResponse.json({ error: "week must be an integer from 1 through 18" }, { status: 400 });
    }
    return NextResponse.json(await weeklySlate({ week }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load weekly schedule" }, { status: 503 });
  }
}
