import "@fontsource/barlow-condensed/400.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "./globals.css";

export async function generateMetadata() {
  const title = "NFL Projection Lab · Weekly Play Sheet";
  const description = "A private two-read NFL research, card-building and bet-tracking workspace";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description }
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
