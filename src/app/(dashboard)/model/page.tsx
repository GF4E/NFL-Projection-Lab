import { PageHeader } from "@/components/page-header";
import { researchSignals } from "@/lib/play-data";

const marketReads = [
  { label: "Sides", value: "2.4 pp", note: "Median top-5 edge", direction: "up" },
  { label: "Totals", value: "1.7 pp", note: "Wind creating dispersion", direction: "flat" },
  { label: "Moneylines", value: "0.8 pp", note: "Mostly efficient", direction: "down" },
  { label: "Teasers", value: "2.6 pp", note: "Two key-number crosses", direction: "up" }
] as const;

export default function ResearchPage() {
  return <div className="page research-page">
    <PageHeader eyebrow="RESEARCH DESK" title="Evidence first. Story second. Price always.">
      Primary data, market movement and matchup context are kept separate so a useful football observation cannot quietly become a fake statistical certainty.
    </PageHeader>
    <section className="research-lead">
      <div className="research-thesis"><span className="kicker">WEEKLY MARKET THESIS</span><h2>Week 1 uncertainty is wide. Pay for numbers, not confidence.</h2><p>Returning production and offensive-line continuity carry more signal than last season&apos;s raw record. The card favors translated spread value, lower-variance singles and teasers that cross both 3 and 7.</p><div className="thesis-foot"><span>Updated Tue 7:32 PT</span><span>Training cutoff: 2025 season</span><span>Odds snapshot: rehearsal</span></div></div>
      <div className="market-grid">{marketReads.map((item) => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong><p>{item.note}</p><i className={item.direction} /></article>)}</div>
    </section>
    <div className="research-layout">
      <section className="signal-board panel-lite">
        <div className="section-heading"><div><span className="kicker">PRIMARY RESEARCH &amp; TRENDS</span><h2>Signals worth discussing</h2></div><span className="step-chip">SOURCE + SAMPLE</span></div>
        <div className="signal-list">{researchSignals.map((signal) => <article key={signal.title}>
          <div className={`evidence-grade grade-${signal.grade.toLowerCase()}`}><small>GRADE</small><strong>{signal.grade}</strong></div>
          <div className="signal-copy"><span>{signal.matchup}</span><h3>{signal.title}</h3><p>{signal.finding}</p><div><small>{signal.sample}</small><small>{signal.source}</small></div></div>
        </article>)}</div>
      </section>
      <aside className="research-guardrails panel-lite">
        <span className="kicker">HOW TO READ THIS</span><h2>A trend is not a reason by itself.</h2>
        <ol><li><b>Start with price.</b><span>A true matchup insight can already be fully reflected in the line.</span></li><li><b>Prefer stable rates.</b><span>EPA and success rate travel better than turnover margin or one-score record.</span></li><li><b>Name the sample.</b><span>Small samples and multiple comparisons get an explicit warning.</span></li><li><b>Invite the football veto.</b><span>Personnel, role and chemistry context can expose a missing variable.</span></li></ol>
        <div className="research-warning"><b>Current caution</b><p>These are rehearsal examples, not live 2026 recommendations. Forecast uncertainty is intentionally visible.</p></div>
      </aside>
    </div>
  </div>;
}
