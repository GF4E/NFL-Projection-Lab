import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/server/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=Missing%20sign-in%20code", request.url));
  const supabase = await createUserClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url));
  return NextResponse.redirect(new URL("/sunday", request.url));
}
