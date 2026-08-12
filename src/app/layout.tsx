import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/600.css";
import "@fontsource/roboto/700.css";
import "@fontsource/roboto/800.css";
import "@fontsource/roboto/900.css";
import "./globals.css";
import { headers } from "next/headers";

export async function generateMetadata() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "nfl-projection-lab-2026.psoiawesome.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = "NFL Projection Lab · Weekly Play Sheet";
  const description = "A private weekly model-versus-market board with visible vig drag and a shared two-person card";
  return {
    title,
    description,
    icons: { icon: "/og.png" },
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1731, height: 909, alt: "NFL Projection Lab weekly model-versus-market board" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] }
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
