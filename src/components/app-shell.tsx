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
          <span className="signal"><i /> Live champion</span>
          <div className="member-stack"><b>G</b><span>Owner-only preview</span></div>
          <p>1 unit = $25</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">2026 REGULAR SEASON</span><strong>Week 01 · rehearsal data</strong></div>
          <div className="top-status"><span>Odds 42s ago</span><span>Model v26.08.11</span><button aria-label="Open alerts">1</button></div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
