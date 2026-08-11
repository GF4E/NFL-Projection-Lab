import { PageHeader } from "@/components/page-header";
import { recordRows } from "@/lib/demo-data";

const summaries = [
  { label: "Full record", record: "41–36–3", units: "+6.84u", dollars: "+$171", roi: "+8.6%", clv: "+2.7¢", beat: "64%", drawdown: "−4.1u" },
  { label: "Executed-only", record: "24–21–2", units: "+3.12u", dollars: "+$78", roi: "+6.5%", clv: "+2.2¢", beat: "61%", drawdown: "−3.0u" }
] as const;

export default function RecordsPage() {
  return <div className="page">
    <PageHeader eyebrow="CLV-FIRST REPORTING" title="Two records. Never one blended number.">
      Paper and cash-confirmed decisions stay visible side-by-side, with their proper closing books.
    </PageHeader>
    <div className="record-summaries">{summaries.map((summary, index) => <section className={index === 0 ? "record-card full" : "record-card"} key={summary.label}><span>{summary.label}</span><div className="record-title"><strong>{summary.record}</strong><em>Win rate secondary</em></div><div className="record-metrics"><p><small>Profit</small><b>{summary.units}</b><em>{summary.dollars}</em></p><p><small>ROI</small><b>{summary.roi}</b></p><p><small>Avg CLV</small><b>{summary.clv}</b></p><p><small>Beat close</small><b>{summary.beat}</b></p><p><small>Max drawdown</small><b>{summary.drawdown}</b></p></div></section>)}</div>
    <section className="panel table-panel"><div className="panel-head"><div><span className="section-label">RECENTLY GRADED</span><h2>Book-specific closes</h2></div><button className="ghost-button">Export CSV</button></div><div className="data-table"><div className="table-head"><span>Date</span><span>Pick</span><span>Mode</span><span>Result</span><span>Units</span><span>Translated CLV</span><span>Reference</span></div>{recordRows.map((row) => <div className="table-row" key={row.date + row.pick}><span>{row.date}</span><strong>{row.pick}</strong><span>{row.status}</span><span>{row.result}</span><b className={row.units.startsWith("+") ? "positive" : row.units.startsWith("−") ? "negative" : ""}>{row.units}</b><span>{row.clv}</span><span>{row.book}</span></div>)}</div></section>
  </div>;
}
