import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import teamConfig from "../config/team.config.json";
import { approvalActorForEmail } from "@/domain/play-card";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/setup"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const explicitDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const localDemo = process.env.NODE_ENV === "development" && (!url || !anonKey);
  const path = request.nextUrl.pathname;
  if (explicitDemo || localDemo || path.startsWith("/_next") || path === "/favicon.ico") {
    return NextResponse.next();
  }
  if (path.startsWith("/api/jobs/")) return NextResponse.next();
  if (!url || !anonKey) {
    if (path === "/setup") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = PUBLIC_PATHS.some((publicPath) => path.startsWith(publicPath));
  if (!user && !isPublic) return NextResponse.redirect(new URL("/login", request.url));
  const actor = approvalActorForEmail(user?.email, teamConfig.members.gabe.email, teamConfig.members.jarrett.email);
  if (user && !actor) {
    await supabase.auth.signOut();
    const redirect = NextResponse.redirect(new URL("/login?error=This%20email%20is%20not%20on%20the%20shared%20team", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  if (user && path === "/login") return NextResponse.redirect(new URL("/sunday", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
