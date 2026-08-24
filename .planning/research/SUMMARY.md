# Research summary: building confidence without fooling ourselves

**Research date:** 2026-08-24  
**Overall confidence:** HIGH on the evaluation/data architecture; MEDIUM on which score-model family or advanced feature will win; LOW on claims that public/sharp splits, coaching, tracking, or player-matchup detail add mainline edge before prospective tests.

## Executive conclusion

The project is not missing a secret algorithm. It is missing the long, disciplined measurement system that determines whether any algorithm deserves confidence.

Public and proprietary systems already use Elo, EPA, opponent adjustment, preseason priors, quarterback value, player metrics, count models, simulation, weather, injuries, calibration, and market prices. We should learn from them, but copying their feature lists would recreate familiar work. The defensible goal is:

> Produce a coherent, timestamped game-outcome distribution; compare it honestly with the exact market; carry unresolved football states through the forecast; and show a human why the disagreement exists, how fragile it is, and what fact or price would change it.

Confidence increases only when forecasts become better calibrated, appropriately sharper, prospectively covered, more stable across supported scenarios, more reproducible, and repeatedly informative relative to named-book closing prices. It does not increase merely because the model is more complex, the interval is narrower, or recent picks won.

## What we should copy as principles

1. **Market as benchmark and shrinkage anchor.** Current de-vigged price is the minimum opponent every model faces.
2. **Dynamic strength plus explicit QB state.** FiveThirtyEight's QB-adjusted Elo is a clean historical example.
3. **Opponent/context adjustment and early priors.** DVOA/DAVE, FPI, SRS, and WEPA all reinforce some version of this.
4. **Learn predictive weights from future performance.** nfelo's WEPA methodology is a particularly useful validation pattern.
5. **Football-state primitives.** nflfastR's EP/WP work and nfl4th provide tested representations for possessions, field position, clock, and decisions.
6. **Hierarchical player effects and uncertainty.** nflWAR shows a credible public framework, while also exposing participation and attribution limits.
7. **Proper probability evaluation.** Log score, Brier score, calibration, CRPS/rank diagnostics, and coverage are more meaningful than record or point error alone.
8. **Negative results.** FiveThirtyEight reports that tested coach/weather effects did not add enough predictive value; Blitzcast reports trailing Vegas. Those are models of honest research behavior.

## What we should not copy blindly

- opaque ratings whose live inputs and historical rows cannot be reproduced;
- self-reported betting performance without frozen prospective forecasts;
- huge feature sets that double count team strength;
- public-versus-sharp labels without an auditable source population and timestamp;
- observed historical weather used as if it were the earlier forecast;
- proprietary player/tracking data embedded in a public repository;
- explanations that convert feature importance into causal claims;
- self-tuning from five to ten selected weekly opportunities.

## Highest-value data work

The order matters more than the number of sources:

1. **Start the prospective market archive now.** Store every complete BetMGM/FanDuel contract and closing snapshot. Historical model-versus-market evaluation is otherwise impossible to reconstruct honestly.
2. **Make all source times explicit.** Every raw and derived row needs publication/capture/valid time, source regime, schema, and hashes.
3. **Normalize official current availability.** nflverse injuries end after 2024; official NFL/team reports and inactive lists are the 2026 authority.
4. **Archive weather forecasts as issued.** Backtesting on observed weather leaks the forecast error.
5. **Build role uncertainty before elaborate player value.** Public live participation is incomplete; current roles must be probabilistic and timestamped.
6. **Audit a reference-market feed before calling it sharp.** Provider latency can masquerade as price leadership.

See [STACK.md](STACK.md) for the source and coverage matrix.

## Recommended model program

### Phase 1 — make the benchmark hard to fool

- Reproduce unconditional, SRS, QB-Elo, power-de-vigged market, and market-anchored discrete-score baselines.
- Create one hashed point-in-time evaluation set for all model families.
- Implement joint score/distribution metrics, probability reconciliation, calibration, and sequential coverage.
- Run the accepted three-way bake-off: market-anchored discrete baseline, correlated negative-binomial model, and possession simulation.

### Phase 2 — make unresolved football states explicit

- Create source-backed QB, inactive, roof, and weather branches.
- Freeze scenario inclusion, materiality, and weighting rules.
- Evaluate scenario-state probability, branch calibration, edge survival, and robust/fragile/indeterminate classifications prospectively.
- State the exact condition or price that changes the view.

### Phase 3 — earn player and tactical complexity

- Add one shadow family at a time: offensive-line unit, receiver/rusher roles, defensive personnel, special teams, coaching/clock, then NGS aggregates.
- Require incremental lift over team + QB + market baselines, especially in personnel-change games.
- Retain negative results and prohibit simultaneous feature shopping.

### Phase 4 — test information flow

- After quote-latency auditing, test cross-book dispersion, velocity, and reference-market leadership.
- Test model-market residual prediction on forecast-time prices.
- Keep public ticket/money data diagnostic until it improves a current-price-controlled prospective baseline.

## The continuous feedback loop

1. **Observe data:** validate complete immutable snapshots or preserve last good.
2. **Update state:** recompute leakage-safe rolling team/player states under frozen rules.
3. **Forecast:** freeze model-only and scenario branch distributions at declared horizons.
4. **Observe resolution:** capture exact named-book close, final, inactives, roof, and realized weather without modifying the forecast.
5. **Score everything:** evaluate every game and market, not only displayed opportunities.
6. **Diagnose:** examine calibration, distribution fit, coverage, scenario stability, market-relative performance, data failures, and regime shift.
7. **Register a hypothesis:** turn a pattern into a preregistered experiment rather than a new feature.
8. **Shadow and gate:** compare challenger, champion, and market on identical hashed rows; promote/reject/defer immutably.
9. **Keep judgment separate:** score explicit human adjustments beside the model and use recurring insights only to generate future hypotheses.

See [ARCHITECTURE.md](ARCHITECTURE.md) for artifact contracts and loop details.

## The questions that create learning

The highest-leverage questions are not “which team do we like?” They are:

- What exactly was knowable at this forecast timestamp?
- What is the simplest baseline this idea must beat?
- Does it improve the full distribution and calibration, or only the average score?
- Does it add information after controlling for the current market?
- Is the apparent lift stable across seasons, horizons, and rule eras?
- Did we try many related versions and report only the winner?
- Does the stated 80% interval actually cover about 80% sequentially?
- Which unresolved state changes the sign or sizing threshold?
- Is that scenario probability itself calibrated?
- Is a model-market disagreement information or merely stale/latency-misaligned quotes?
- Can the result be reproduced from exact data, code, config, feature, and model hashes?
- What result would make us reject the idea?
- Did a human adjustment improve a frozen probability forecast, or only produce a satisfying story afterward?

The complete answer-gated bank is in [QUESTIONS.md](QUESTIONS.md).

## Decisions we can make now

These are high-confidence research defaults and do not need more preference polling:

- use the market, SRS, and QB-Elo as mandatory baselines;
- score all games with proper probability/distribution metrics;
- store prospective point-in-time odds, official states, and weather forecasts;
- use source-backed scenarios rather than forced single assumptions;
- keep picks and human choices out of training;
- promote complexity only through preregistered rolling-origin and prospective tests;
- keep low-evidence features in shadow or quarantine;
- expose multiple confidence dimensions rather than one mystical score.

## Decisions that still require empirical answers

- Which score-distribution candidate wins the accepted bake-off?
- Which joint distribution score will be the frozen primary score alongside the accepted pooled market log loss?
- How should scenario probabilities be estimated and calibrated with small samples?
- Does any player group beyond QB add stable forecast value with available live role data?
- Does a reference market add value after provider-latency correction?
- Do weather, coaching, clock, special-teams, or market-dynamics features add stable marginal lift?
- Does the compact dossier measurably improve human understanding and probability judgment?

## Research artifact map

- [COMPARISON.md](COMPARISON.md) — model landscape, lessons, and evidence confidence.
- [STACK.md](STACK.md) — data sources, update reality, rights, gaps, and acquisition order.
- [FEATURES.md](FEATURES.md) — baseline, production, shadow, and quarantined hypothesis families.
- [ARCHITECTURE.md](ARCHITECTURE.md) — continuous feedback loops and immutable contracts.
- [PITFALLS.md](PITFALLS.md) — leakage, overfitting, calibration, licensing, and operational failure modes.
- [QUESTIONS.md](QUESTIONS.md) — 52 questions with explicit answer gates.

## Selected primary sources

### Models and football analytics

- [Archived FiveThirtyEight NFL methodology](https://web.archive.org/web/20230212180718/https://fivethirtyeight.com/methodology/how-our-nfl-predictions-work/)
- [FTN DVOA explainer](https://ftnfantasy.com/nfl/dvoa-explainer)
- [nfelo WEPA methodology](https://www.nfeloapp.com/analysis/weighted-EPA-methodology-and-performance/)
- [nflfastR EP/WP models](https://github.com/nflverse/open-source-football/blob/master/_posts/2020-09-28-nflfastr-ep-wp-and-cp-models/nflfastr-ep-wp-and-cp-models.Rmd)
- [nflWAR paper](https://arxiv.org/abs/1802.00998)
- [Exact NFL score forecasting](https://www.sciencedirect.com/science/article/abs/pii/S0169207012001070)
- [Sports Reference SRS details](https://www.sports-reference.com/blog/2015/03/srs-calculation-details/)

### Forecast evaluation

- [Strictly proper scoring rules](https://doi.org/10.1198/016214506000001437)
- [Probabilistic forecasting: calibration and sharpness](https://www.annualreviews.org/content/journals/10.1146/annurev-statistics-062713-085831)
- [Forecast evaluation best practices](https://link.springer.com/article/10.1007/s10618-022-00894-5)
- [Time-series cross-validation](https://otexts.com/fpp3/tscv.html)

### Data and operations

- [nflverse availability and update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
- [The Odds API v4 guide](https://the-odds-api.com/liveapi/guides/v4/)
- [The Odds API historical data](https://the-odds-api.com/historical-odds-data/)
- [NFL pregame preparation procedures](https://operations.nfl.com/game-operations-logistics/preparation-safety/game-and-stadium-prep)
- [Open-Meteo historical forecast API](https://open-meteo.com/en/docs/historical-forecast-api)
