import { PageHeader } from "@/components/page-header";

export default function DigestPage() {
  return <div className="page">
    <PageHeader eyebrow="WEEKLY DIGEST · OWNER PREVIEW" title="Is the edge behaving like an edge?">
      Calibration, CLV, drift, source health and the champion decision in one weekly review.
    </PageHeader>
    <div className="digest-grid">
      <section className="panel digest-score"><span className="section-label">FORECAST QUALITY</span><h2>Model vs. market</h2><div className="score-pair"><div><span>Log loss</span><b>0.671</b><small>Market 0.676</small></div><div><span>Brier</span><b>0.238</b><small>Market 0.241</small></div></div><div className="meter"><i style={{width:"67%"}} /><span>Lower is better</span></div></section>
      <section className="panel digest-score"><span className="section-label">DECISION QUALITY</span><h2>CLV vs. displayed edge</h2><div className="score-pair"><div><span>Realized CLV</span><b>+2.7¢</b><small>Approval edge +3.4¢</small></div><div><span>Beat close</span><b>64%</b><small>52 graded</small></div></div><div className="meter gold"><i style={{width:"79%"}} /><span>−0.7¢ realization gap</span></div></section>
      <section className="panel digest-score"><span className="section-label">CALIBRATION · TRAILING 40</span><h2>Slope stays in range</h2><div className="score-pair"><div><span>Slope</span><b>0.94</b><small>Alert outside 0.7–1.3</small></div><div><span>Sample</span><b>40</b><small>Small-sample caution</small></div></div><div className="range-track"><i style={{left:"54%"}} /><span>0.7</span><span>1.3</span></div></section>
      <section className="panel digest-score"><span className="section-label">FEATURE SHIFT</span><h2>Inputs remain familiar</h2><div className="score-pair"><div><span>Maximum PSI</span><b>0.08</b><small>Alert above 0.20</small></div><div><span>Scoring</span><b>45.1</b><small>3Y mean 44.6</small></div></div><div className="meter"><i style={{width:"40%"}} /><span>Inside historical 95% interval</span></div></section>
    </div>
    <section className="panel health-panel"><div className="panel-head"><div><span className="section-label">SYSTEM HEALTH</span><h2>Tuesday run ledger</h2></div><span className="status-pill green">All current</span></div>{[["Data refresh","06:02","nflverse through Jan 04 · official injuries current"],["Loop A","06:33","32 team states updated through Week 18"],["Loop B","07:18","Challenger promoted · all five hashes logged"],["Odds credits","Today","287 / 500 · no throttling active"]].map(([name,time,note]) => <div className="health-row" key={name}><i /><b>{name}</b><span>{note}</span><small>{time}</small></div>)}</section>
  </div>;
}
