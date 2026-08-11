import Link from "next/link";
import { FieldMark } from "./icons";
import { NavLinks } from "./nav-links";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-frame">
      <aside className="rail">
        <Link className="brand" href="/sunday" aria-label="NFL Projection Lab home">
          <FieldMark className="brand-mark" />
          <span><strong>PROJECTION</strong><em>LAB / 26</em></span>
        </Link>
        <NavLinks />
        <div className="rail-foot">
          <span className="signal"><i /> Research current</span>
          <div className="member-stack"><b>G</b><b>J</b><span>Jarrett access pending</span></div>
          <p>1u = $25 · weekly $400–$600</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">2026 PROJECTION LAB</span><strong>Week 01 · rehearsal board</strong></div>
          <div className="top-status"><span>Target $400–$600</span><span>8 plays · $400</span><button aria-label="Open notes">2</button></div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
