import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { runNflverseAutomation } from "@/server/nflverse/automation";
import { listNflverseImportStates } from "@/server/nflverse/store";
import { settleCompletedTeamPlays } from "@/server/automatic-settlement";

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
    const result = await runNflverseAutomation({ db, allowPlayByPlay: true });
    const settlement = await settleCompletedTeamPlays(db);
    return NextResponse.json({ result, settlement, states: await listNflverseImportStates(db) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Automatic nflverse refresh aborted" },
      { status: 503 }
    );
  }
}
