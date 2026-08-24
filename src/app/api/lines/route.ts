import { NextResponse } from "next/server";
import { listLiveLines } from "@/server/live-line-store";
import { getMainlineRecoveryStatus } from "@/server/odds-automation";
import { weeklySlate } from "@/server/weekly-slate";

export const dynamic = "force-dynamic";

function configured(): boolean { return Boolean(process.env.ODDS_API_KEY); }

function requestedWeek(request: Request): number | undefined {
  const value = Number(new URL(request.url).searchParams.get("week"));
  return Number.isInteger(value) && value >= 1 && value <= 18 ? value : undefined;
}

export async function GET(request: Request) {
  try {
    const slate = await weeklySlate({ week: requestedWeek(request) });
    const lines = await listLiveLines(undefined, slate.games.map((game) => game.id));
    const recovery = await getMainlineRecoveryStatus({ lineCount: lines.length });
    return NextResponse.json({
      lines,
      season: slate.season,
      week: slate.week,
      configured: configured(),
      comparisonBooks: ["betmgm", "fanduel"],
      stale: recovery.stale
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load cached lines" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  void request;
  return NextResponse.json({ error: "Public access is read-only; lines refresh automatically." }, { status: 405, headers: { allow: "GET" } });
}
