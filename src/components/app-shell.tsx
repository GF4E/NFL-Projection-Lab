import Link from "next/link";
import { FieldMark } from "./icons";
import { NavLinks } from "./nav-links";
import { NflverseRefreshBeacon } from "./nflverse-refresh-beacon";
import { PushPermission } from "./push-permission";

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
          <PushPermission />
        </div>
      </aside>
      <div className="workspace">
        <main>{children}</main>
      </div>
    </div>
  );
}
