import { PageHeader } from "@/components/page-header";

const methods = [
  ["01", "Market baseline", "Two-way prices are power-de-vigged. Quotes at different spread points are translated before comparison."],
  ["02", "Model blend", "The model probability is shrunk toward the market baseline, with the blend frozen before the season."],
  ["03", "NFL margins", "Spread prices use a decay-weighted discrete margin table so key numbers are learned from outcomes, not hardcoded."],
  ["04", "Uncertainty", "A fixed-seed bootstrap produces an 80% edge interval. Suggestions are visually muted when that interval crosses zero."],
  ["05", "Sizing", "Quarter-Kelly uses only the shrunk probability, rounds down to 0.5 units, and caps the displayed suggestion at 2 units."],
  ["06", "Leakage control", "A forecast uses completed games only through the prior week plus information available at its generation timestamp."]
] as const;

export default function MethodologyPage() {
  return <div className="page methodology-page">
    <PageHeader eyebrow="TRANSPARENT MODEL" title="How the board reads a price">
      A public explanation of the inputs, transformations, uncertainty, and safeguards behind every number on the live slate.
    </PageHeader>
    <section className="method-grid" aria-label="Projection methodology">
      {methods.map(([number, title, copy]) => <article key={number}>
        <span>{number}</span><div><h2>{title}</h2><p>{copy}</p></div>
      </article>)}
    </section>
    <section className="method-note">
      <span>INTERPRETATION</span>
      <h2>Numbers are evidence, not certainty.</h2>
      <p>The board withholds unsupported comparisons, marks stale inputs, and shows only matchup evidence that materially informs a modeled edge. It is an educational analytics tool and does not place wagers.</p>
    </section>
  </div>;
}
