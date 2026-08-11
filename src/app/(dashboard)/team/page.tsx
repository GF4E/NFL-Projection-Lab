import { PageHeader } from "@/components/page-header";
import { Sparkline } from "@/components/sparkline";

export default function TeamPage() {
  return <div className="page">
    <PageHeader eyebrow="SHARED TEAM CARD" title="One call, made together">
      Owner-only review is active. The second approval seat stays locked until you release it.
    </PageHeader>
    <div className="two-column">
      <section className="panel candidate-editor">
        <div className="panel-head"><div><span className="section-label">CANDIDATE · REVISION 4</span><h2>Buffalo −2.5</h2></div><span className="status-pill amber">Owner review</span></div>
        <div className="contract-grid">
          <label>Market<strong>Spread</strong></label><label>Selection<strong>Buffalo −2.5</strong></label>
          <label>Units<strong>1.0u · $25</strong></label><label>Execution<strong>Paper</strong></label>
          <label>Book<strong>BetMGM</strong></label><label>Frozen quote<strong>−2.5 · −110</strong></label>
        </div>
        <div className="rationale"><span>Joint rationale</span><p>Buffalo&apos;s pressure advantage remains after the market blend. The bootstrap interval is fully positive; BetMGM owns the higher point-adjusted EV.</p></div>
        <div className="freeze-list"><span>Consensus <b>snap_01HZX</b></span><span>Model <b>v26.08.11</b></span><span>Data <b>3b8d…2e1</b></span><span>Interval <b>+0.8 to +5.9%</b></span></div>
        <div className="audit-line"><i /><div><b>Gabe approved revision 4</b><span>12:41:08 PT · hash 52ef…91c</span></div></div>
        <div className="audit-line pending"><i /><div><b>Teammate seat locked</b><span>No invitation, account, access grant, or push delivery exists</span></div></div>
        <button className="wide-action">Copy owner-review contract</button>
      </section>
      <aside className="panel revision-panel">
        <div className="panel-head"><div><span className="section-label">REVISION HISTORY</span><h2>Nothing overwritten</h2></div></div>
        {[4,3,2,1].map((revision, index) => <div className={index === 0 ? "revision current" : "revision"} key={revision}><b>R{revision}</b><div><strong>{index === 0 ? "BUF −2.5 · −110" : index === 1 ? "BUF −3 · +102" : "BUF −2.5 · −108"}</strong><span>{index === 0 ? "Current · Gabe approved" : "Superseded · approvals reset"}</span></div><small>{index === 0 ? "42s" : `${index + 1}h`}</small></div>)}
        <div className="mini-chart"><span>Quote history</span><Sparkline values={[18,17,19,16,15,13,14,12]} /></div>
        <p className="guardrail">After the site is approved and a teammate is invited, any point or price move before second approval creates a new revision and resets both approvals.</p>
      </aside>
    </div>
  </div>;
}
