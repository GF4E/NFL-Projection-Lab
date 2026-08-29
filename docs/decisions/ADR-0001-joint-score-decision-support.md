# ADR-0001: Joint score distribution as the decision-support contract

**Status:** Accepted as a design hypothesis; empirical promotion is pending  
**Date:** 2026-08-24  
**Deciders:** Owner

## Context

The Projection Lab is a decision-making engine. Its result must be meaningful enough to facilitate and enhance human judgment while remaining honest about uncertainty, data quality, and the market's information. Separate score, spread, total, and moneyline predictions can contradict one another. A single recommended pick can also hide the range of outcomes and the reasons a person might disagree.

This decision sets the product and modeling contract. It does not claim that a particular score-model family has already proved superior.

## Decision

The primary model will represent a joint discrete distribution of home and away scores. Team-score estimates, win/tie probabilities, spread cover/push/loss probabilities, and total over/push/under probabilities will all be derived from those same normalized possible outcomes.

The decision surface will present the model as an advisor. It will expose:

- the central score forecast and the uncertainty around it;
- probabilities derived from the coherent outcome distribution;
- disagreement with current power-de-vigged market prices;
- data freshness and material inputs that changed the result; and
- uncertainty or missing evidence that should temper confidence.

It will not present an unexplained pick, disguise a point estimate as certainty, or treat a human choice as a training label.

## Options considered

### Option A: One joint score distribution (selected)

| Dimension | Assessment |
|---|---|
| Coherence | High: every mainline market reconciles to the same game outcomes |
| Interpretability | High when scores, uncertainty, and market comparison are shown together |
| Complexity | Medium to high; discrete scoring, dependence, overtime, and calibration must be tested |
| Validation burden | High, but falsifiable with score and market probability metrics |

**Pros:** coherent probabilities; handles pushes and ties explicitly; supports human what-if reasoning; gives player, weather, pace, and clock effects a common destination.  
**Cons:** a weak distributional assumption can be consistently wrong across several markets; more difficult to fit and validate than separate binary models.

### Option B: Independent model for each market

| Dimension | Assessment |
|---|---|
| Coherence | Low: spread, total, moneyline, and scores may conflict |
| Interpretability | Medium |
| Complexity | Medium; each market is simpler but creates several pipelines |
| Validation burden | Medium per model, high across the system |

**Pros:** each model can specialize; a failure may remain isolated to one market.  
**Cons:** contradictory outputs weaken human trust and make score-level explanations difficult.

### Option C: Market-only probability surface

| Dimension | Assessment |
|---|---|
| Coherence | High with the selected market snapshot |
| Interpretability | Low as an independent football forecast |
| Complexity | Low |
| Validation burden | Low |

**Pros:** strong baseline; reflects broad information quickly.  
**Cons:** cannot establish an independent football view or explain why the engine differs; mostly restates the price.

## Trade-off analysis

Option A best matches the human-judgment objective because it makes the engine's football view inspectable and forces its outputs to agree. The market remains a required baseline and a shrinkage input, not an opponent to defeat narratively. Option A earns production status only if it matches or improves on Options B and C in rolling-origin validation while remaining calibrated.

## Consequences

- Every downstream market-pricing feature must consume the same versioned outcome distribution.
- Score accuracy alone cannot promote a model; probability quality and calibration remain primary.
- The interface must reserve space for uncertainty, market comparison, freshness, and material evidence.
- Player, weather, roster, pace, scoring, and clock features must demonstrate incremental out-of-sample value to this distribution.
- Independent market models remain benchmark challengers and diagnostic checks.

## Validation and action items

1. [ ] Freeze the first leakage-safe rolling-origin evaluation set and power-de-vigged market baseline.
2. [ ] Implement a simple market-anchored discrete score baseline.
3. [ ] Compare correlated count and possession-level challengers on identical rows.
4. [ ] Score joint likelihood, team-score error, pooled and per-market log loss, Brier score, and calibration.
5. [ ] Verify probability reconciliation for wins, ties, pushes, covers, and totals before any promotion.
