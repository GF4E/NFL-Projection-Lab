# ADR-0003: Commodity score models compete behind one outcome contract

**Status:** Accepted as a design hypothesis; implementation and validation are pending  
**Date:** 2026-08-24  
**Deciders:** Owner

## Context

Joint score distributions, count models, simulation, EPA, Elo, market anchoring, and proper forecast scoring are established sports-analytics techniques. Choosing a sophisticated family in advance would recreate common work while confusing complexity with value. The product objective is a meaningful result that enhances human judgment, not novelty through model vocabulary.

## Decision

Build one leakage-safe comparison harness and normalized score-outcome interface. Compare three initial candidates on identical data and forecast timestamps:

1. a simple market-anchored discrete-score baseline;
2. a correlated negative-binomial score model; and
3. a possession-level simulation.

No family receives a complexity preference. Promotion follows ADR-0002. The engine's differentiation effort moves to the decision dossier described in the [Novelty Charter](../NOVELTY_CHARTER.md): scenario-aware disagreement, fragility, counterfactuals, and falsifiers.

## Options considered

| Option | Strength | Principal risk |
|---|---|---|
| Market-anchored discrete baseline | Difficult to beat, inexpensive, coherent | May mostly repeat information already in the price |
| Correlated negative-binomial model | Compact score distribution with overdispersion and dependence | NFL scoring mechanics may violate the fitted count assumptions |
| Possession-level simulation | Natural home for pace, field position, scoring rules, and clock states | Large complexity surface and easy narrative overfitting |
| Choose one family now | Fastest initial implementation | No evidence that the chosen complexity improves held-out decisions |

## Trade-off analysis

The controlled bake-off costs more initially than selecting one model, but it makes simplification possible: a complex simulator is rejected if it cannot earn measurable value. A shared output contract also lets the human decision layer evolve independently of whichever family is champion.

## Consequences

- Dataset, feature as-of rules, outcome grid, market translation, and metric code are shared.
- Every candidate must emit a normalized joint score distribution plus provenance and uncertainty.
- Runtime and failure rate are reported alongside statistical quality.
- Possession mechanics enter only through validated additions, not because they sound football-specific.
- Model-family work is treated as foundation; it is not marketed as the project's novelty.

## Action items

1. [ ] Freeze the shared training/evaluation rows and score-outcome interface.
2. [ ] Implement the market-anchored baseline first.
3. [ ] Add the two challengers without changing evaluation rows or gates.
4. [ ] Run rolling-origin comparisons, calibration checks, and mechanics ablations.
5. [ ] Feed the winning distribution into the decision-dossier research prototype.
