import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { listNflverseImportStates } from "@/server/nflverse/store";
import { readOnlyD1 } from "@/server/read-only-d1";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ states: await listNflverseImportStates(readOnlyD1(getD1())) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read nflverse import status" },
      { status: 503 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: "Public access is read-only; data refreshes automatically." }, { status: 405, headers: { allow: "GET" } });
}
