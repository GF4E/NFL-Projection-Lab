import { NextResponse } from "next/server";
import { getPlayerPropBoard } from "@/server/player-props";
import { readOnlyD1 } from "@/server/read-only-d1";
import { getD1 } from "../../../../db";

export const dynamic = "force-dynamic";

function gameId(request: Request): string | null {
  return new URL(request.url).searchParams.get("gameId");
}

export async function GET(request: Request) {
  const id = gameId(request);
  if (!id) return NextResponse.json({ error: "gameId is required" }, { status: 400 });
  try {
    return NextResponse.json(await getPlayerPropBoard(id, readOnlyD1(getD1())));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load props" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  void request;
  return NextResponse.json({ error: "Public access is read-only; props refresh automatically." }, { status: 405, headers: { allow: "GET" } });
}
