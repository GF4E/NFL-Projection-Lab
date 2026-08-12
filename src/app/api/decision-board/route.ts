import { NextResponse } from "next/server";
import { buildDecisionBoard } from "@/server/decision-board";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await buildDecisionBoard());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build decision board" }, { status: 503 });
  }
}
