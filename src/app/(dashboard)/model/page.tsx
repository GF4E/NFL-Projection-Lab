import { PageHeader } from "@/components/page-header";
import { ResearchExplorer } from "@/components/research-explorer";

const researchSteps = [
  { number: "01", title: "Start with the contract", copy: "Record the exact book, point and price. Different points are translated before either book or the model is compared." },
  { number: "02", title: "Build the market baseline", copy: "Remove the hold with the power method, then use the resulting fair probability as the anchor for the model blend." },
  { number: "03", title: "Check stable team evidence", copy: "Favor opponent-adjusted EPA, success rate, pace and explosiveness over last season's record or turnover margin." },
  { number: "04", title: "Add the football read", copy: "Review quarterbacks, line play, coverage matchups, role changes, coaching, travel, weather and final inactives." },
  { number: "05", title: "Name uncertainty", copy: "A wider interval is information. If the edge interval spans zero, the numerical suggestion remains visible but is greyed." },
  { number: "06", title: "Choose one primary reason", copy: "The card stores a single main thesis so the decision can be reviewed honestly after the game without rewriting the story." }
] as const;

const referenceMethods = [
  { label: "MARKET / QUANT", title: "Price, efficiency and closing value", copy: "Use model-versus-market probability, opponent-adjusted rates, regression and whether the current number is likely to beat the close.", href: "https://www.pff.com/news/bet-why-betting-early-critical-beating-nfl-markets", source: "PFF · betting early and CLV" },
  { label: "FOOTBALL / SITUATIONAL", title: "Personnel, scheme and schedule", copy: "Use injuries, line play, coaching matchups, rest, travel and recent role changes to test what a statistical baseline may miss.", href: "https://www.foxsports.com/stories/nfl/packers-raiders-headline-colins-blazin-5-for-week-15", source: "FOX Sports · Blazin' 5 example" }
] as const;

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const query = await searchParams;
  return <div className="page research-page">
    <PageHeader eyebrow="RESEARCH DESK" title="Two reads. One shared decision.">
      Gabe&apos;s model-and-market read and Jarrett&apos;s players-and-chemistry read meet here before a matchup becomes a pick.
    </PageHeader>
    <ResearchExplorer initialGameId={query.game} />
    <div className="research-layout">
      <section className="signal-board panel-lite">
        <div className="section-heading"><div><span className="kicker">DECISION METHOD</span><h2>From matchup to card</h2></div><span className="step-chip">REPEATABLE · REVIEWABLE</span></div>
        <div className="research-method">{researchSteps.map((step) => <article key={step.number}><b>{step.number}</b><div><h3>{step.title}</h3><p>{step.copy}</p></div></article>)}</div>
      </section>
      <aside className="research-guardrails panel-lite">
        <span className="kicker">REFERENCE STYLES</span><h2>Use both lenses without confusing them.</h2>
        <div className="source-list">{referenceMethods.map((method) => <a href={method.href} target="_blank" rel="noreferrer" key={method.label}><span>{method.label}</span><b>{method.title}</b><p>{method.copy}</p><small>{method.source} ↗</small></a>)}</div>
        <div className="research-warning"><b>Live-evidence rule</b><p>No matchup conclusion appears here until its source, sample and timestamp are available. Research prompts are questions, not recommendations.</p></div>
      </aside>
    </div>
  </div>;
}
