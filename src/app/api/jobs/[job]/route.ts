import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "This legacy Supabase job endpoint is retired; Cloudflare scheduled maintenance is authoritative." },
    { status: 410 }
  );
}
