import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { getConfidenceEngineHealth } from "@/server/confidence-engine/store";
import { readOnlyD1 } from "@/server/read-only-d1";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getConfidenceEngineHealth(readOnlyD1(getD1())));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to load confidence-engine health"
    }, { status: 503 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Public access is read-only; confidence artifacts are created by scheduled work." },
    { status: 405, headers: { allow: "GET" } }
  );
}
