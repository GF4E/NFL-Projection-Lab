import { NextResponse } from "next/server";
import { listLiveLines, replaceLiveLines } from "@/server/live-line-store";
import { fetchWeekOneLiveOdds } from "@/server/week-one-live-odds";

export const dynamic = "force-dynamic";

function configured(): boolean { return Boolean(process.env.ODDS_API_KEY); }

export async function GET() {
  try {
    return NextResponse.json({
      lines: await listLiveLines(),
      configured: configured(),
      caesarsRequiresPaidPlan: true
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load cached lines" }, { status: 503 });
  }
}

export async function POST() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Live lines need an ODDS_API_KEY in the site's private environment." }, { status: 503 });
    }
    const cached = await listLiveLines();
    const newest = Math.max(0, ...cached.map((line) => new Date(line.capturedAt).getTime()));
    if (Date.now() - newest < 60_000) {
      return NextResponse.json({ lines: cached, configured: true, caesarsRequiresPaidPlan: true, cached: true });
    }
    const result = await fetchWeekOneLiveOdds(apiKey);
    if (result.used > 450) throw new Error("Odds credit ceiling exceeded; cached lines were preserved");
    const lines = await replaceLiveLines(result.lines);
    return NextResponse.json({
      lines,
      configured: true,
      caesarsRequiresPaidPlan: true,
      quota: { used: result.used, remaining: result.remaining, lastCost: result.lastCost }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to refresh live lines" }, { status: 503 });
  }
}
