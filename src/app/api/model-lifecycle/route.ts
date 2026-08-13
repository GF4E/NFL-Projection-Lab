import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { runModelLifecycleAutomation } from "@/server/model-lifecycle/automation";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json({ lifecycle: await runModelLifecycleAutomation({ db: getD1() }) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Model lifecycle aborted" },
      { status: 503 }
    );
  }
}
