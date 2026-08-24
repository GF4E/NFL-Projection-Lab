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
          <span className="signal"><i /> Public analytics</span>
          <p>Live markets · model probabilities · uncertainty</p>
        </div>
      </aside>
      <div className="workspace">
        <main>{children}</main>
      </div>
    </div>
  );
}
