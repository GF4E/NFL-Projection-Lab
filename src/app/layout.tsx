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
  const requestHost = requestHeaders.get("host") ?? "";
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const origin = configuredOrigin ?? (requestHost.startsWith("localhost")
    ? `http://${requestHost}`
    : "https://example.invalid");
  const image = `${origin}/og.png`;
  const title = "NFL Projection Lab · Public NFL Analytics";
  const description = "Live NFL markets, model probabilities, uncertainty intervals, matchup evidence, and transparent price analysis.";
  return {
    title,
    description,
    icons: { icon: "/og.png" },
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1735, height: 907, alt: "NFL Projection Lab public analytics board" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] }
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="icon" href="/og.png" type="image/png" /></head><body>{children}</body></html>;
}
