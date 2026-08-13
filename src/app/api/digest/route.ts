import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { latestWeeklyDigest } from "@/server/weekly-digest";
import { isTeamAuthenticationError, requestTeamMember } from "@/server/team-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requestTeamMember(request);
    return NextResponse.json({ digest: await latestWeeklyDigest(getD1()) });
  } catch (error) {
    if (isTeamAuthenticationError(error)) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load the weekly digest" },
      { status: 503 }
    );
  }
}
