# Failure modes and safeguards

**Research date:** 2026-08-24  
**Purpose:** Prevent sophisticated-looking analytics from producing false confidence.

## 1. Point-in-time leakage

### Failure

A historical row contains a revised roster, postgame depth chart, closing line, realized weather, injury status, or season aggregate that was unavailable at forecast time.

### Why it survives ordinary testing

The fields look historically correct and improve accuracy. Random train/test splits do not reveal that the information arrived later.

### Safeguard

- Require event time, source publication time, capture time, and maximum upstream timestamp.
- Use rolling-origin/prequential splits only.
- Assert `max(input.available_at) <= forecast.generated_at` for every row.
- Replay at each actual forecast horizon rather than one generic pregame row.

## 2. Using the closing market as a training input to forecast earlier prices

### Failure

A model evaluated at opener or Tuesday uses a weekly “closing spread” feature or a consensus constructed from later quotes.

### Safeguard

Build one immutable market snapshot per forecast horizon. Closing lines are outcomes/diagnostics, never earlier inputs.

## 3. Comparing different points without translation

### Failure

Prices at `-2.5` and `-3` are compared as if only the cents differ, or a consensus averages unlike contracts.

### Safeguard

Translate fair probabilities through the empirical discrete margin artifact before comparing EV or equivalent cents. Withhold when translation support is invalid.

## 4. Observed-weather leakage

### Failure

A backtest trains on actual kickoff wind while the live model only had a forecast issued hours earlier.

### Safeguard

Archive and replay the forecast as issued for the matching horizon. Store observed weather only for error diagnosis.

## 5. Silent source-regime changes

### Failure

The engine treats post-2024 injury or depth fields as comparable to earlier nflverse fields even though the source ended or changed.

### Safeguard

Version source regimes, audit coverage by season/field, include regime/missingness indicators where defensible, and never synthesize continuity without validation.

## 6. Market worship and market dismissal

### Failure A

Treat the de-vigged line as truth and build a site that only restates it.

### Failure B

Treat the model as independent wisdom while ignoring that market prices aggregate information the public dataset lacks.

### Safeguard

Score market-only, football-only, and shrunk forecasts on identical rows. Let proper scoring and calibration determine how much independent information exists.

## 7. Feature accumulation

### Failure

EPA, DVOA-like metrics, Elo, point differential, success rate, drive success, quarterback EPA, and market spread all encode overlapping team strength. A flexible model appears powerful in-sample because it counts the same signal repeatedly.

### Safeguard

Use nested baselines, regularization, grouped ablations, correlation diagnostics, and season-stability checks. Player layers must explain deviations from a regressed team state.

## 8. Narrative features without incremental evidence

### Failure

Coaching, weather, revenge, travel, public money, officiating, and matchup stories enter because they are plausible.

### Safeguard

Preregister the expected direction, target, baseline, and metric. Preserve negative results. FiveThirtyEight's published methodology explicitly reports coach and weather experiments that did not add enough predictive value to retain—negative evidence is useful.

## 9. Player-value attribution error

### Failure

A receiver, lineman, defender, or coach receives credit for teammate, scheme, game-state, or opponent effects. Injury adjustments then double count the team rating.

### Safeguard

Use hierarchical partial pooling, role/participation uncertainty, position-group ablations, and a team baseline. Start with QB and unit-level effects, where the state transition is clearer.

## 10. Scenario theater

### Failure

The system invents many plausible branches, assigns subjective weights, and presents a wide simulation as rigor.

### Safeguard

Only source-backed material states may create branches. Freeze inclusion, materiality, weighting, and resolution rules. Score scenario probabilities prospectively. An unsupported material state produces `indeterminate`, not a guessed weight.

## 11. Narrow intervals mistaken for confidence

### Failure

An ensemble agrees because its members share the same misspecification, so the displayed interval becomes narrow and wrong.

### Safeguard

Measure sequential empirical coverage, not member agreement. Compare bootstrap, model-family, scenario, and calibration uncertainty; report width and under-coverage by regime.

## 12. Optimization on a tiny pick sample

### Failure

Five to ten selected opportunities per week drive feature selection, Kelly parameters, or model weights.

### Safeguard

Evaluate every forecasted game/market. Keep selections and human outcomes out of training. Make structural changes offseason-only and require broad rolling-origin evidence.

## 13. ROI and CLV selection bias

### Failure

Only displayed or selected edges are scored, missing quotes disappear, or paper entries use a favorable closing reference after the fact.

### Safeguard

- Score all forecasts on probability metrics.
- Freeze selection rules and quote identities.
- Use the exact named-book close for executed contracts and the predefined paper rule.
- Report coverage and missing closing quotes.
- Treat CLV as evidence of price information, not a substitute for calibration.

## 14. Multiple testing and winner's curse

### Failure

Hundreds of transformations, windows, interactions, and subgroups are tried; the best one is reported as if it were the only test.

### Safeguard

Register experiment families and trial counts, use nested/rolling validation, demand stability across seasons, and run promoted candidates in prospective shadow. A small apparent lift must survive uncertainty and multiplicity.

## 15. Correlated evaluation rows

### Failure

Moneyline, spread, and total observations from the same game are treated as independent when calculating uncertainty, or repeated snapshots of one game inflate sample size.

### Safeguard

Keep the accepted pooled mean for promotion but estimate uncertainty with week/game/season blocks. Report unique games and per-market rows. Do not count horizons as independent replications.

## 16. Probability calibration assessed on too little data

### Failure

A trailing 40-pick calibration slope is treated as precise.

### Safeguard

Show wide uncertainty and a small-sample warning; monitor all forecasts, not only picks; use longer rolling windows and hierarchical calibration diagnostics. A noisy diagnostic can alert but should not retune the model.

## 17. Price-feed latency mistaken for “sharp” movement

### Failure

One bookmaker appears to lead another because the data provider refreshes it earlier.

### Safeguard

Measure provider timestamps, capture timestamps, typical book delay, and completeness. Test whether apparent leaders predict the next independent reference quote after latency normalization.

## 18. Opaque public betting samples

### Failure

Ticket or money percentages are treated as representative of the full market or as evidence of informed bettors.

### Safeguard

Require vendor methodology, book/population, sample size, and capture time. Label as sentiment. Do not let it affect production probabilities until it improves a price-controlled prospective baseline.

## 19. NFL score-distribution misspecification

### Failure

A generic normal, Poisson, or negative-binomial distribution smooths away masses at football scores/margins, dependence, late-game strategy, ties, and overtime.

### Safeguard

Use discrete outcome support, data-derived key-score/margin mass, explicit pushes/ties/OT, PIT/rank diagnostics, score covariance, and a possession simulator as a challenger. Complexity promotes only with held-out lift.

## 20. Rule and era drift

### Failure

The engine treats 2010 scoring, home field, kickoffs, extra points, overtime, schedule length, and 2026 conditions as one stationary process.

### Safeguard

Use time decay, season-varying scoring/home-field effects, versioned era configuration, offseason artifact refresh, and regime-stratified diagnostics. Retain old information rather than hand-picking favorable seasons.

## 21. Data/licensing contamination in a public repository

### Failure

Paid, restricted, scraped, or share-alike data are committed or redistributed without respecting terms.

### Safeguard

Maintain a source/license inventory, keep raw licensed data deployment-only, publish transformation code and permitted artifacts, and run a release scan. Verify terms before adopting another project's code or dataset.

## 22. Explanations that overclaim causality

### Failure

SHAP/feature importance or an LLM turns correlation into “the model likes this because…”

### Safeguard

Use material counterfactual differences and label them as model associations unless a causal design exists. Every sentence must trace to a timestamped source, a branch comparison, or a validated ablation.

## 23. Operational success hiding data failure

### Failure

The page returns `200 OK` while serving stale or mixed snapshots, a partial injury import, or an unlogged model.

### Safeguard

Freshness and provenance are part of the forecast contract. Partial imports abort. Last-good output is visibly stale. Model/data/config hashes must resolve before publication.

## 24. “Self-improvement” without governance

### Failure

A weekly retrainer changes features, thresholds, calibration, scenario weights, or hyperparameters based on recent results.

### Safeguard

Keep the three existing cadences: automatic state refresh, gated coefficient refit under frozen structure, and manual offseason structural review. Never tune from the site's selections.

## Pre-release red-team questions

Before trusting any new forecast version, ask:

1. Could any input have arrived after the forecast timestamp?
2. Can the exact market quote and point be reconstructed?
3. Did any missing row disappear instead of becoming an explicit failure?
4. Was the market baseline scored on exactly the same games and horizons?
5. How many related hypotheses were tried?
6. Does the lift survive a different season, era, and forecast horizon?
7. Is calibration improved, or only classification/point accuracy?
8. Does the 80% interval actually cover about 80% prospectively?
9. Is the result still present after controlling for current market price?
10. Can the result be reproduced from the logged hashes?
11. Is any explanation stronger than its evidence?
12. Would the release still be acceptable if the next four weeks are unlucky?

## Supporting sources

- [Proper scoring rules and honest probability forecasts](https://doi.org/10.1198/016214506000001437)
- [Probabilistic forecasting: calibration and sharpness](https://www.annualreviews.org/content/journals/10.1146/annurev-statistics-062713-085831)
- [Forecast evaluation best practices](https://link.springer.com/article/10.1007/s10618-022-00894-5)
- [Time-series cross-validation](https://otexts.com/fpp3/tscv.html)
- [Calibration versus accuracy in sports betting](https://arxiv.org/abs/2303.06021)
- [Time-series conformal prediction](https://pubmed.ncbi.nlm.nih.gov/37819805/)
- [Adaptive conformal inference under shift](https://www.jmlr.org/papers/v25/22-1218.html)
- [Archived FiveThirtyEight NFL methodology and negative coach/weather tests](https://web.archive.org/web/20230212180718/https://fivethirtyeight.com/methodology/how-our-nfl-predictions-work/)
- [nflverse data source/update limitations](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
