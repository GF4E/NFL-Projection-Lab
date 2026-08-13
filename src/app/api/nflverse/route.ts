import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { runNflverseAutomation } from "@/server/nflverse/automation";
import { listNflverseImportStates } from "@/server/nflverse/store";
import { settleCompletedTeamPlays } from "@/server/automatic-settlement";
import { runModelLifecycleAutomation } from "@/server/model-lifecycle/automation";

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
    const result = await runNflverseAutomation({ db, allowPlayByPlay: true }).catch((error) => {
      throw new Error(`nflverse importer: ${error instanceof Error ? error.message : "unknown failure"}`);
    });
    const lifecycle = await runModelLifecycleAutomation({ db }).catch((error) => {
      throw new Error(`model lifecycle: ${error instanceof Error ? error.message : "unknown failure"}`);
    });
    const settlement = await settleCompletedTeamPlays(db).catch((error) => {
      throw new Error(`automatic settlement: ${error instanceof Error ? error.message : "unknown failure"}`);
    });
    return NextResponse.json({ result, lifecycle, settlement, states: await listNflverseImportStates(db) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Automatic nflverse refresh aborted" },
      { status: 503 }
    );
  }
}
