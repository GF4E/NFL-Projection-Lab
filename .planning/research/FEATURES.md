# Hypothesis and feature research map

**Research date:** 2026-08-24  
**Core rule:** No feature enters the champion because it sounds football-smart. It enters only when its point-in-time data are reliable and it adds stable out-of-sample information beyond the frozen baseline.

## What the engine should predict

The primary output is one joint discrete distribution over home and away final scores, including overtime. From it, derive:

- expected and median team scores;
- score and margin intervals;
- win/loss/tie probability;
- spread cover/push/loss at any posted point;
- total over/push/under at any posted total;
- scenario-specific versions of the same outcomes;
- exact-contract value after power de-vigging and discrete point translation.

Direct spread, total, and moneyline heads remain challengers and coherence diagnostics. They are not allowed to publish contradictory production probabilities without an explicit reconciliation policy.

## Baselines every challenger must face

| Baseline | Purpose | Failure signal |
|---|---|---|
| Unconditional season/era score distribution | Detect whether the pipeline can beat no-information forecasts | A candidate cannot improve proper score metrics. |
| SRS/opponent-adjusted point differential | Low-complexity football baseline | Complexity adds no stable lift over transparent team strength. |
| QB-adjusted Elo/state model | Dynamic team + quarterback baseline | Player or tactical features mostly repackage current form. |
| Power-de-vigged market | Strong forecast benchmark | The football model is less calibrated or less sharp on identical rows. |
| Market-anchored discrete score distribution | Minimum coherent production candidate | More complex score machinery cannot improve joint or derived-market metrics. |

## Candidate feature families

### Tier A — establish as reproducible foundation

| Family | Candidate signals | Intended destination | Required controls |
|---|---|---|---|
| Team efficiency state | opponent-adjusted EPA/play, success, explosive rate, early-down pass rate, PROE, pace, drive success | attack/defense means, possession count, score dispersion | prior-season shrinkage, opponent adjustment, garbage-time ablation, decay selection offseason only |
| Turnover and finishing luck | interception opportunity context where available, fumble recovery regression, red-zone/third-down residuals | regress unsustainable scoring and margin | never treat all turnovers as equal skill; compare raw and regressed versions |
| Dynamic strength | margin versus closing-consensus residual, Elo/state-space mean and variance | latent team strength and uncertainty | market baseline must be forecast-time; no own-pick outcome; offseason variance widening |
| Quarterback state | starter probability, adjusted EPA/dropback, sack/turnover tendency, backup tier, recent volume | score mean, tail, scenario branches | role probability, opponent and teammate adjustment, partial pooling, no hardcoded point priors |
| Schedule and rest | days rest, bye, travel distance/time zones, short week, international/neutral site | mean/variance adjustments | interactions preregistered; do not data-mine arbitrary schedule trends |
| Market state | consensus point, de-vigged probability, cross-book dispersion, opener/current/close horizon | benchmark, shrinkage, market residual | translate different points before comparison; exact quote timestamps; no closing-line leakage |
| Weather/roof | archived forecast wind, temperature, precipitation; official roof state | total/pace/kicking scenario | forecast-as-issued, outdoor/open-roof only, horizon-specific validation |
| Rules/era | season scoring and home-field effects, OT/kickoff indicators | intercepts and tail mechanics | versioned config, full training window with decay, structural changes offseason only |

### Tier B — shadow experiments with plausible incremental value

| Family | Hypothesis | Why it could add information | Main confound | Promotion evidence |
|---|---|---|---|---|
| Offensive-line unit | Continuity and recent pressure/run-blocking state change efficiency and variance | Unit interaction is not fully represented in QB or team averages | QB time-to-throw, opponent pass rush, score state, missing assignments | Stable lift in games with unit changes; no degradation by season or position group |
| Receiver/rusher roles | Target/carry shares and player efficiency improve score tails when availability changes | Usage concentration changes conversion and explosiveness | QB, scheme, opponent, game state, small samples | Partial-pooling model beats team+QB baseline in personnel-change rows |
| Defensive personnel | Coverage/pass-rush/run-defense role changes alter matchup outcomes | Injuries can create discontinuities hidden in team rolling averages | Sparse participation, scheme, opponent quality, attribution | Position-group ablation with point-in-time role confidence |
| Play-caller tendencies | PROE, pace, fourth-down aggressiveness, timeout and endgame behavior affect possession/score distributions | Coaches shape decisions under similar states | Personnel and game state drive observed choices; coaches change roles | Shrinkage-heavy effects improve joint log score/CRPS in future seasons |
| NGS aggregate interactions | Separation, time to throw, aggressiveness, RYOE and pressure proxies expose mechanism | Adds player/process detail beyond results | Metric definition drift, sparse seasons, no raw matchup assignments | Predeclared interactions improve held-out distribution and remain calibrated |
| Special teams | Kicker range/reliability, return field position, punt value affect 3-point mass and tails | NFL scoring lattice is sensitive to field goals and field position | Weather, stadium, attempts are selected decisions | Incremental push/key-score calibration and score-distribution lift |
| Market dynamics | Dispersion, velocity, and which book moves first predict later consensus | Information arrival may be visible before full convergence | provider latency and stale quotes masquerade as discovery | Predict next timestamped reference quote after latency normalization |
| Model-market residual | Football features explain residual error around current fair market probability | Focuses scarce modeling power on disagreements | Target leakage and market dominance | Residual challenger improves identical-row log loss/calibration, not just selected edges |
| Adaptive interval correction | Sequential coverage repair improves honesty under regime drift | Bootstrap may under-cover during shocks | NFL samples are small and dependent | Better horizon/season coverage without unacceptable width or instability |

### Tier C — research-only until the data or evidence changes

| Idea | Why it is tempting | Why it stays out |
|---|---|---|
| Public ticket/money splits | Feels like crowd-versus-sharp information | Population and sampling are opaque; current price already responds to flow. |
| Referee crews | Plausible penalty and pace effects | Assignment, team, and selection effects are difficult to separate; stability is weak. |
| “Motivation,” revenge, primetime, must-win | Easy narrative explanations | Post hoc categories and multiple testing create false patterns. |
| Media/social sentiment | Potentially fast news signal | Mostly duplicates public news and encourages language leakage. |
| Expert picks | Human synthesis might contain information | No stable probability, timestamp, selection rule, or independence; copying creates consensus without measurement. |
| Raw tracking matchups | Rich route/coverage/line interactions | No complete public live longitudinal source and major licensing burden. |
| End-to-end deep model | Can learn nonlinear interactions | Small seasonal sample, unstable regimes, difficult calibration and debugging. |
| Reinforcement learning from pick results | Appears “self-improving” | Weekly decisions are tiny, selected, noisy samples and guarantee overfitting. |

## Experiment contract for every new signal

Before inspecting results, record:

1. **Hypothesis:** what forecast error the signal should reduce and why.
2. **Availability:** exact source, coverage, event time, capture time, and missing-data behavior.
3. **Target:** score distribution, possession count, scoring rate, scenario probability, or market residual.
4. **Baseline:** the smallest current model the feature must improve.
5. **Rows:** seasons, forecast horizons, markets, exclusions, and push handling.
6. **Transformation:** lag, decay, shrinkage, opponent adjustment, and interactions.
7. **Primary metric:** frozen proper score; no switching after results.
8. **Calibration and coverage gates:** slope/intercept and interval behavior.
9. **Stability tests:** season, era, forecast horizon, favorite band, and missingness regime.
10. **Uncertainty:** block/bootstrap confidence interval over weeks or seasons.
11. **Multiple-testing family:** record how many related signals were tried.
12. **Promotion rule:** minimum improvement, non-inferiority tolerances, runtime/failure constraints.
13. **Falsifier:** the result that rejects the idea.
14. **Disposition:** promote, retain in shadow, reject, or defer; negative results stay recorded.

## Evaluation by output type

| Output | Primary measurement | Required diagnostics |
|---|---|---|
| Joint score distribution | joint log score and/or CRPS/energy score selected before bake-off | PIT/rank histogram, team-score MAE, score covariance, key-score and tail fit |
| Moneyline/spread/total probability | pooled non-push log loss under the accepted promotion rule | per-market log loss/Brier, calibration slope/intercept, reliability and resolution, pushes |
| 80% score/edge interval | empirical sequential coverage | mean width, coverage by horizon/regime, misses during QB/weather shocks |
| Scenario weights | branch-state log loss/Brier where the state resolves | missing/ambiguous outcomes, calibration by source confidence |
| Market value evidence | book-specific CLV cents/points and percent beating close | displayed EV versus CLV, quote age, translation warnings, coverage |
| Human adjustment | proper score of frozen human-adjusted distribution versus frozen model-only distribution | rationale categories, direction/magnitude, hindsight-safe review; never train on the adjustment |

## What “increased confidence” means

Confidence is not a larger edge number or a narrower interval. It is the conjunction of:

- **Calibration:** events assigned 60% occur about 60% in comparable cases.
- **Sharpness:** probabilities are meaningfully separated from 50% while remaining calibrated.
- **Coverage:** stated score and edge intervals attain their prospective coverage.
- **Support:** the forecast has enough effective sample and regime similarity.
- **Stability:** credible scenarios, nearby specifications, and new snapshots do not arbitrarily reverse it.
- **Freshness:** required roster, injury, weather, and market inputs are current and complete.
- **Reproducibility:** the exact distribution can be regenerated from logged hashes.
- **Market evidence:** repeated, book-specific positive CLV supports that displayed disagreement contained information.

The UI may summarize these dimensions, but the engine should never compress them into an unexplained universal “confidence score.”

## Recommended first research queue

1. Freeze and reproduce the market, SRS, and QB-Elo baselines.
2. Create one point-in-time row set for all forecast horizons.
3. Run the accepted score-model bake-off with shared metrics and probability reconciliation tests.
4. Prospectively archive exact odds, official states, and weather forecasts before adding features.
5. Add scenario branches for QB/inactives/roof/weather and evaluate calibration, not just usefulness anecdotes.
6. Shadow-test player/unit features one family at a time.
7. Test market dispersion/velocity only after quote-latency auditing.
8. Keep public splits, referees, sentiment, and narrative trends outside the champion unless they survive a preregistered incremental test.

