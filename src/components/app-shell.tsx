import Link from "next/link";
import { FieldMark } from "./icons";
import { NavLinks } from "./nav-links";
import { NflverseRefreshBeacon } from "./nflverse-refresh-beacon";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-frame">
      <NflverseRefreshBeacon />
      <aside className="rail">
        <Link className="brand" href="/sunday" aria-label="NFL Projection Lab home">
          <FieldMark className="brand-mark" />
          <span><strong>PROJECTION</strong><em>LAB / 26</em></span>
        </Link>
        <NavLinks />
        <div className="rail-foot">
          <span className="signal"><i /> Shared card live</span>
          <div className="member-stack"><b>G</b><b>J</b><span>Gabe + Jarrett</span></div>
          <p>Gabe · Seahawks / Jarrett · Auburn</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">2026 PROJECTION LAB</span><strong>Week 01 · shared board</strong></div>
          <div className="top-status"><span>16 matchups</span><span>1u = $25</span><button aria-label="Two teammates">2</button></div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
