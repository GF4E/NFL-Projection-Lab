"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  ["/sunday", "Sunday", "LIVE"],
  ["/team", "Team card", "02"],
  ["/records", "Records", ""],
  ["/model", "Model room", ""],
  ["/digest", "Weekly digest", "01"],
  ["/settings", "Settings", ""]
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return <nav aria-label="Primary navigation">
    {nav.map(([href, label, badge], index) => (
      <Link href={href} className={pathname.startsWith(href) ? "nav-link active" : "nav-link"} key={href}>
        <span className="nav-index">0{index + 1}</span>
        <span>{label}</span>
        {badge && <small>{badge}</small>}
      </Link>
    ))}
  </nav>;
}
