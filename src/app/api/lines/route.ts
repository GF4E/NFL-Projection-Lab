import { NextResponse } from "next/server";
import { listLiveLines } from "@/server/live-line-store";
import { getMainlineRecoveryStatus, runScheduledOddsAutomation } from "@/server/odds-automation";
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
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Live lines need an ODDS_API_KEY in the site's private environment." }, { status: 503 });
    }
    const slate = await weeklySlate({ week: requestedWeek(request) });
    const cached = await listLiveLines(undefined, slate.games.map((game) => game.id));
    const before = await getMainlineRecoveryStatus({ lineCount: cached.length });
    if (!before.stale) {
      return NextResponse.json({ lines: cached, configured: true, comparisonBooks: ["betmgm", "fanduel"], cached: true, stale: false });
    }
    const automation = await runScheduledOddsAutomation({
      apiKey,
      allowCatchup: true
    });
    const lines = await listLiveLines(undefined, slate.games.map((game) => game.id));
    const after = await getMainlineRecoveryStatus({ lineCount: lines.length });
    if (after.stale) {
      const failure = automation.results.find((result) => result.status === "failed" || result.status === "skipped");
      return NextResponse.json({
        lines,
        configured: true,
        comparisonBooks: ["betmgm", "fanduel"],
        stale: true,
        error: failure?.message ?? "The scheduled line refresh did not complete; last good prices were preserved."
      }, { status: 503 });
    }
    return NextResponse.json({
      lines,
      season: slate.season,
      week: slate.week,
      configured: true,
      comparisonBooks: ["betmgm", "fanduel"],
      stale: false
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to refresh live lines" }, { status: 503 });
  }
}
