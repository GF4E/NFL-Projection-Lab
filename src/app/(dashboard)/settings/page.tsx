import { PageHeader } from "@/components/page-header";
import { PushPermission } from "@/components/push-permission";

export default function SettingsPage() {
  return <div className="page">
    <PageHeader eyebrow="PRIVATE WORKSPACE" title="Team and guardrails">
      Shared approvals for two people; owner-only control where a manual change could move a forecast.
    </PageHeader>
    <div className="two-column settings-grid">
      <section className="panel"><div className="panel-head"><div><span className="section-label">MEMBERS</span><h2>Owner-only release</h2></div></div><div className="member-row"><b>G</b><div><strong>Gabe</strong><span>Owner · active</span></div><small>QB overrides · corrections · config · access</small></div><div className="member-row"><b>2</b><div><strong>Teammate seat</strong><span>Locked · nobody invited</span></div><small>Requires explicit owner release</small></div></section>
      <section className="panel"><div className="panel-head"><div><span className="section-label">WEB PUSH</span><h2>Exactly two events</h2></div></div><div className="allowed-alert"><b>01</b><span><strong>Awaiting You</strong><small>Once per immutable revision</small></span></div><div className="allowed-alert"><b>02</b><span><strong>Edge Threshold</strong><small>Crosses above |3.0 percentage points|</small></span></div><PushPermission /><p className="guardrail">Pipeline, gate, credit and drift notices remain inside the app and weekly digest.</p></section>
      <section className="panel settings-wide"><div className="panel-head"><div><span className="section-label">LIVE SOURCES</span><h2>Provider contracts</h2></div></div><div className="source-grid"><div><i className="source-ok"/><b>nflverse</b><span>PBP, schedules, finals, rosters</span><small>Historical injuries through 2024 only</small></div><div><i className="source-ok"/><b>The Odds API</b><span>BetMGM + Caesars · US</span><small>Caesars requires a paid provider plan</small></div><div><i className="source-ok"/><b>Official NFL / teams</b><span>2026 injuries + inactives</span><small>All-or-nothing import</small></div><div><i className="source-ok"/><b>Open-Meteo</b><span>Kickoff-hour conditions</span><small>Outdoor / confirmed open roof</small></div></div></section>
    </div>
  </div>;
}
