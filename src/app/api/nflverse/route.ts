import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { listNflverseImportStates } from "@/server/nflverse/store";
import { runBackgroundMaintenance } from "@/server/background-maintenance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ states: await listNflverseImportStates(getD1()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read nflverse import status" },
      { status: 503 }
    );
  }
}

export async function POST() {
  try {
    const db = getD1();
    return NextResponse.json({
      maintenance: await runBackgroundMaintenance({ db, apiKey: process.env.ODDS_API_KEY }),
      states: await listNflverseImportStates(db)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Automatic nflverse refresh aborted" },
      { status: 503 }
    );
  }
}
