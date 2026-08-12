import { NextResponse } from "next/server";
import { listLiveLines } from "@/server/live-line-store";
import { refreshCompleteSlateMainlines } from "@/server/odds-automation";
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
    return NextResponse.json({
      lines: await listLiveLines(undefined, slate.games.map((game) => game.id)),
      season: slate.season,
      week: slate.week,
      configured: configured(),
      caesarsRequiresPaidPlan: true
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load cached lines" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Live lines need an ODDS_API_KEY in the site's private environment." }, { status: 503 });
    }
    const slate = await weeklySlate({ week: requestedWeek(request) });
    const cached = await listLiveLines(undefined, slate.games.map((game) => game.id));
    const newest = Math.max(0, ...cached.map((line) => new Date(line.capturedAt).getTime()));
    if (Date.now() - newest < 60_000) {
      return NextResponse.json({ lines: cached, configured: true, caesarsRequiresPaidPlan: true, cached: true });
    }
    const fetchedAt = new Date().toISOString();
    const result = await refreshCompleteSlateMainlines({
      apiKey,
      matchups: slate.games,
      snapshotKey: `the-odds-api:manual:${fetchedAt.slice(0, 16)}`,
      fetchedAt
    });
    return NextResponse.json({
      lines: result.lines,
      season: slate.season,
      week: slate.week,
      configured: true,
      caesarsRequiresPaidPlan: true,
      quota: result.quota
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to refresh live lines" }, { status: 503 });
  }
}
