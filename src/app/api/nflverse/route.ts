import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { runNflverseAutomation } from "@/server/nflverse/automation";
import { listNflverseImportStates } from "@/server/nflverse/store";

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
    const result = await runNflverseAutomation({ db: getD1(), allowPlayByPlay: true });
    return NextResponse.json({ result, states: await listNflverseImportStates(getD1()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Automatic nflverse refresh aborted" },
      { status: 503 }
    );
  }
}
