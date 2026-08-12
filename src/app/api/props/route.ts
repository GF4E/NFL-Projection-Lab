import { NextResponse } from "next/server";
import { getPlayerPropBoard, refreshPlayerPropBoard } from "@/server/player-props";

export const dynamic = "force-dynamic";

function gameId(request: Request): string | null {
  return new URL(request.url).searchParams.get("gameId");
}

export async function GET(request: Request) {
  const id = gameId(request);
  if (!id) return NextResponse.json({ error: "gameId is required" }, { status: 400 });
  try {
    return NextResponse.json(await getPlayerPropBoard(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load props" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const id = gameId(request);
  if (!id) return NextResponse.json({ error: "gameId is required" }, { status: 400 });
  try {
    return NextResponse.json(await refreshPlayerPropBoard({ gameId: id, apiKey: process.env.ODDS_API_KEY }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to refresh props" }, { status: 503 });
  }
}
