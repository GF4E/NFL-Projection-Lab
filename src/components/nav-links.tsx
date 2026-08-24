"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { WeeklySlate } from "@/domain/weekly-slate";

export function NavLinks() {
  const pathname = usePathname();
  const [week, setWeek] = useState(1);
  useEffect(() => {
    fetch("/api/weekly-slate")
      .then((response) => response.ok ? response.json() as Promise<WeeklySlate> : null)
      .then((slate) => { if (slate) setWeek(slate.week); })
      .catch(() => undefined);
  }, []);
  const nav = [
    ["/sunday", "Live slate", `W${week}`],
    ["/methodology", "Methodology", ""]
  ] as const;
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
