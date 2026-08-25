import { NextResponse } from "next/server";
import { listLiveLines, listSnapshotGameIds } from "@/server/live-line-store";
import { getMainlineRecoveryStatus } from "@/server/odds-automation";
import { weeklySlate } from "@/server/weekly-slate";
import { readOnlyD1 } from "@/server/read-only-d1";
import { getD1 } from "../../../../db";

export const dynamic = "force-dynamic";

function requestedWeek(request: Request): number | undefined {
  const value = Number(new URL(request.url).searchParams.get("week"));
  return Number.isInteger(value) && value >= 1 && value <= 18 ? value : undefined;
}

export async function GET(request: Request) {
  try {
    const db = readOnlyD1(getD1());
    const slate = await weeklySlate({ db, week: requestedWeek(request) });
    const gameIds = slate.games.map((game) => game.id);
    const lines = await listLiveLines(db, gameIds);
    const recovery = await getMainlineRecoveryStatus({ db, lineCount: lines.length });
    const currentGameIds = recovery.runStatus === "succeeded" && recovery.expectedSnapshotKey
      ? await listSnapshotGameIds(recovery.expectedSnapshotKey, db)
      : [];
    const currentGames = new Set(currentGameIds);
    const staleGameIds = recovery.stale
      ? gameIds
      : gameIds.filter((gameId) => !currentGames.has(gameId));
    return NextResponse.json({
      lines,
      season: slate.season,
      week: slate.week,
      configured: false,
      comparisonBooks: ["betmgm", "fanduel"],
      stale: staleGameIds.length > 0,
      partial: currentGameIds.length > 0 && staleGameIds.length > 0,
      currentGameIds,
      staleGameIds
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load cached lines" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  void request;
  return NextResponse.json({ error: "Public access is read-only; lines refresh automatically." }, { status: 405, headers: { allow: "GET" } });
}
