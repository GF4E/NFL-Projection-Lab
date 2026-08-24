# Novelty charter: from prediction page to decision dossier

## The correction

The first engine decisions are necessary but not distinctive. Public NFL projects already provide expected-points and win-probability models, season simulation, leakage-safe rolling features, Elo/EPA models, injuries, weather, market inputs, calibration, explanations, backtests, and CLV. Adding more familiar features to another weekly prediction grid would be “used gum,” not a new decision engine.

Representative primary sources:

- [nflfastR expected-points and win-probability calculators](https://github.com/nflverse/nflfastR/blob/master/R/ep_wp_calculators.R) emit scoring-event and win probabilities from detailed game state.
- [nflseedR simulation](https://github.com/nflverse/nflseedR/blob/master/vignettes/articles/nflsim.Rmd) already supplies a framework for probabilistic games, standings, playoffs, and futures.
- [nfelo's WEPA methodology](https://www.nfeloapp.com/analysis/weighted-EPA-methodology-and-performance/) uses backward-looking-only validation and tests feature stability across eras.
- [Blitzcast](https://github.com/carterptull/blitzcast/blob/main/README.md) combines leakage-safe Elo, EPA, injuries, weather, market information, calibration, walk-forward comparison, and model-grounded explanations.
- [NFL Bet Engine](https://github.com/ShamgarBN/nfl-bet-engine/blob/main/CLAUDE.md) documents score models, simulation, direct market heads, ensemble calibration, CLV, and a broad public-data feature library.

These are learning references, not code sources. Before incorporating an implementation, verify its license, data rights, as-of semantics, and results independently.

## Differentiation hypothesis

The unit of value is not a pick or even a projection. It is a compact **decision dossier** that lets a knowledgeable person see why the model and market disagree, how fragile that disagreement is, and what information would change it.

For one game and one exact contract, the dossier should answer:

1. **What does each side imply?** Show the model and power-de-vigged market outcome distributions, not only their means.
2. **Why do they differ?** Attribute only material, validated differences in score points and probability—not generic feature rankings.
3. **What is unresolved?** Carry probable QB, lineup, roof, and weather states as weighted scenarios rather than forcing one assumed future.
4. **How fragile is the edge?** Recompute the contract under plausible scenarios and show how often the sign or Kelly floor changes.
5. **What would change the view?** State concrete thresholds such as a line move, confirmed inactive, wind band, or role change that removes the disagreement.
6. **How trustworthy is this result?** Show source age, missingness, sample support, applicable calibration regime, and model-version provenance.
7. **Where does judgment enter?** Keep human football observations explicit and separate; let a person test a scenario without converting their opinion into a hidden training label.

## What does not count as novelty

- a larger undifferentiated feature list;
- an LLM-written recap of feature importance;
- a more complex simulator without held-out lift;
- public-versus-sharp labels without auditable samples and timestamps;
- retrospective ROI claims without frozen pregame forecasts;
- a single confidence number that hides scenario or data uncertainty.

## Research gates

The differentiation hypothesis remains provisional until:

- a broader landscape review finds no equivalent complete workflow among the selected reputable references;
- every displayed causal-sounding contribution is backed by an ablation or clearly labeled as association;
- scenario probabilities and forecast intervals are prospectively calibrated;
- two users can identify the major disagreement, uncertainty, and falsifier from the compact dossier without reading methodology prose; and
- the dossier improves decision understanding without altering or contaminating model training.

The live board stays compact. This depth belongs in its single expansion surface and in background artifacts, not in permanent explanatory clutter.
