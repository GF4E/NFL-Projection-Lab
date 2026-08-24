import { NextRequest, NextResponse } from "next/server";
import { runJob, type JobName } from "@/server/jobs/runner";

const JOBS = new Set<JobName>([
  "data-refresh",
  "loop-a",
  "loop-b",
  "forecast-refresh",
  "odds-snapshot",
  "inactives-roof",
  "settlement",
  "credit-meter",
  "weekly-digest"
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ job: string }> }
) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  if (!expected || provided !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { job } = await context.params;
  if (!JOBS.has(job as JobName)) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }
  const scheduledFor = request.headers.get("x-scheduled-for") ?? new Date().toISOString();
  try {
    return NextResponse.json(await runJob(job as JobName, scheduledFor));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job aborted" },
      { status: 500 }
    );
  }
}
