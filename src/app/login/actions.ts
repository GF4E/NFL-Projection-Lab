"use server";

import { redirect } from "next/navigation";
import { createUserClient } from "@/server/supabase/server";
import { configuredTeamActor } from "@/server/team-auth";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/login?error=Email%20is%20required");
  if (!configuredTeamActor(email)) redirect("/login?error=This%20email%20is%20not%20on%20the%20shared%20team");
  const supabase = await createUserClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` }
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/login?sent=1");
}
