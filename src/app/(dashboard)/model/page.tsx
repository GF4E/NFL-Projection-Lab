import { PageHeader } from "@/components/page-header";

const features = ["EPA / play", "Success rate", "Explosive rate", "Regressed turnovers", "Pace", "Pass rate over expectation"];

export default function ModelPage() {
  return <div className="page">
    <PageHeader eyebrow="MODEL ROOM" title="Self-updating. Structurally frozen.">
      Weekly football state can move; the rules of the engine cannot drift mid-season.
    </PageHeader>
    <div className="loop-grid">
      <section className="loop-card"><div className="loop-number">A</div><span className="status-pill green">Automatic</span><h2>Weekly state</h2><p>Completed Week 18 changed team features and strength means. No coefficient gate needed.</p><div className="loop-stat"><span>Last run</span><b>Tue · 06:30 PT</b></div><div className="feature-tags">{features.map((feature) => <span key={feature}>{feature}</span>)}</div></section>
      <section className="loop-card featured"><div className="loop-number">B</div><span className="status-pill green">Promoted</span><h2>Tuesday challenger</h2><p>Same trailing three-season walk-forward rows. Every model and data artifact logged.</p><div className="gate-comparison"><div><span>Champion log loss</span><b>0.6721</b></div><strong>→</strong><div><span>Challenger</span><b>0.6714</b></div></div><div className="gate-checks"><span>≤ +0.002 <b>Pass</b></span><span>Slope 0.94 <b>Pass</b></span></div></section>
      <section className="loop-card"><div className="loop-number">C</div><span className="status-pill ink">Manual only</span><h2>Offseason structure</h2><p>Half-life, K, shrinkage, features, calibration, QB tiers, alerts and margin tables.</p><div className="loop-stat"><span>Configuration</span><b>Frozen · 2026.1</b></div><div className="hash-stack"><code>config 98f2…a7e</code><code>margin 18ac…d31</code><code>schema a102…1bf</code></div></section>
    </div>
    <section className="panel engine-panel"><div className="panel-head"><div><span className="section-label">DISCRETE PRICING ENGINE</span><h2>Margins keep their shape</h2></div><span className="status-pill green">2010–2025</span></div><div className="engine-flow"><div><span>01</span><b>Empirical residuals</b><small>Decay weighted</small></div><i>→</i><div><span>02</span><b>Half-point lookup</b><small>Cover / push / loss</small></div><i>→</i><div><span>03</span><b>Power de-vig</b><small>All three markets</small></div><i>→</i><div><span>04</span><b>Market blend</b><small>w = 0.25 frozen</small></div><i>→</i><div><span>05</span><b>Book EV + Kelly</b><small>0.5u floor · 2u cap</small></div></div><p className="engine-note">No normal CDF. No fixed key-number percentages. No different-point price comparison before translation.</p></section>
  </div>;
}
