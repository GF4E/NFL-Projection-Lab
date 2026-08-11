import { PageHeader } from "@/components/page-header";

export default function TeamPage() {
  return <div className="page team-room-page">
    <PageHeader eyebrow="TEAM ROOM" title="Two reads. One card.">
      The point is not to out-predict each other. The statistical read finds a mispriced contract; the football read tests whether the assumptions make sense on the field.
    </PageHeader>
    <section className="handoff-flow">
      <article><span>01</span><b>Market read</b><p>Gabe posts the contract, translated price, model edge, uncertainty and statistical case.</p><small>NUMBERS</small></article><i>→</i>
      <article><span>02</span><b>Football read</b><p>Jarrett adds personnel form, usage, coaching, chemistry and a clear football veto if needed.</p><small>CONTEXT</small></article><i>→</i>
      <article><span>03</span><b>Card decision</b><p>The play enters the $400–$600 sheet only when the price and the matchup survive both reads.</p><small>ONE TEAM</small></article>
    </section>
    <div className="team-room-grid">
      <section className="handoff-card panel-lite"><div className="section-heading"><div><span className="kicker">CURRENT HANDOFF</span><h2>Green Bay +2.5</h2></div><span className="step-chip">AWAITING FIELD READ</span></div><div className="handoff-price"><div><span>Best quote</span><strong>BetMGM · −110</strong></div><div><span>Model edge</span><strong className="positive">+2.5 pp</strong></div><div><span>Suggested stake</span><strong>$50 · 2u</strong></div></div><div className="dual-notes"><article><span className="role-mark data">G</span><div><b>Statistical case</b><p>Early-down EPA, pressure allowed and half-point translation all favor Green Bay at +2.5. The interval is positive but not wide enough for a best-bet label.</p></div></article><article className="empty-note"><span className="role-mark field">J</span><div><b>Football check</b><p>Check the offensive-line rotation, new receiver roles and whether the matchup creates a protection problem the model is missing.</p></div></article></div></section>
      <aside className="access-note panel-lite"><span className="kicker">COLLABORATION STATUS</span><h2>Jarrett&apos;s seat is designed, but access is not active.</h2><p>The hosting workspace currently blocks outside visitor invitations. The product is ready for his football notes as soon as that workspace setting changes.</p><div><b>Until then</b><span>Gabe can build, research and track the rehearsal card without implying Jarrett approved anything.</span></div></aside>
    </div>
  </div>;
}
