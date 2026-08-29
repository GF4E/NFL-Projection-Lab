# Model landscape and comparison

**Research date:** 2026-08-24  
**Scope:** Pregame NFL team-score distributions, mainline probability forecasts, and decision support  
**Confidence convention:** HIGH = documented method and reproducible or independently established; MEDIUM = credible method but incomplete reproduction, proprietary inputs, or indirect evidence; LOW = interesting claim without independent validation.

## Bottom line

No public project examined here provides the whole proposed product: a leakage-safe joint score distribution, exact-contract market translation, explicit unresolved-state scenarios, edge fragility, provenance, and a compact statement of what would change the forecast. The individual ingredients are not novel. The opportunity is the disciplined integration and prospective evaluation of those ingredients.

The strongest reusable lessons are:

1. Treat the de-vigged market as the minimum benchmark, not as an opponent to be dismissed.
2. Maintain a dynamic, regressed team state and a separate quarterback/player availability state.
3. Learn play weights and features from future predictive value, not football intuition alone.
4. Use preseason priors heavily early and let current-season evidence take over gradually.
5. Forecast a distribution and score it with proper rules; do not optimize point accuracy or a small pick record.
6. Archive every forecast-time input prospectively. Most public backtests cannot reconstruct what was actually knowable then.
7. Keep explanations downstream of the model. A plausible narrative is not evidence of incremental lift.

## Established models and what they teach us

| Model or family | Underlying engine | What is genuinely useful | Important limitation | Confidence | Recommendation |
|---|---|---|---|---|---|
| De-vigged bookmaker market | Multi-participant price aggregation; convert two-way prices to fair probabilities | Hard-to-beat baseline, current injuries/news incorporated quickly, natural shrinkage anchor | Not ground truth; books differ in latency, clientele, hold, and point; historical snapshots are often unavailable | HIGH | Mandatory baseline and input. Score it on identical forecast rows. |
| Pro-Football-Reference SRS | Iterative opponent-adjusted average point differential | Transparent, interpretable points scale, excellent low-complexity strength benchmark | Equal game/point weighting and weak treatment of changing rosters, garbage time, and recency | HIGH | Implement as a diagnostic baseline. A complex model that cannot beat it has not earned complexity. |
| FiveThirtyEight QB-adjusted Elo | Dynamic team Elo plus a separate QB adjustment, offseason regression, home field, and season simulation | Clean state-update design, explicit quarterback importance, sensible regression and simulation | Discontinued; QB value specification and some inputs are not a current live service | HIGH for method, MEDIUM for current replication | Reproduce historically as a benchmark, not a dependency. |
| FTN DVOA / DAVE | Situation- and opponent-adjusted play value, luck corrections, early-season blend with preseason projections | Opponent/context normalization, early-season priors, explicit handling of fumble and interception luck | Proprietary formula/history; some inputs and archives are paid or restricted | MEDIUM | Learn the design principles; do not copy or publish restricted data. |
| nfelo WEPA | Play-by-play EPA with empirically learned predictive weights and backward-looking-only validation | Excellent pattern for testing whether play types deserve different weight; stresses era stability | A team-efficiency model, not a full score/market engine; weights still need independent reproduction | HIGH | Use its validation philosophy for feature weighting and garbage-time claims. |
| nflfastR EP/WP models | Play-level scoring-event and win-probability models using down, distance, field position, time, score, timeouts, and related state | Reproducible football-state representations, calibration work, useful possession and clock primitives | Primarily in-game; it does not by itself solve pregame team strength or value | HIGH | Use primitives and tests inside a possession challenger; do not confuse in-game fit with pregame lift. |
| nflseedR / simulation systems | User-supplied game probabilities propagated through schedules and playoff rules | Clean separation between a game-outcome model and downstream simulation | Season simulation quality cannot exceed its game probabilities | HIGH | Reuse the interface idea: one normalized game distribution feeds all downstream questions. |
| ESPN FPI | Large, multi-component predictive system with preseason priors, unit and QB strength, opponent adjustment, and simulation | Confirms the value of priors, unit decomposition, QB state, and simulation | Opaque, old public methodology, not reproducible from public documentation | MEDIUM | Use as an architectural comparator only. Never claim to replicate FPI. |
| nflWAR / hierarchical player models | EP and WP plus multilevel player effects and bootstrap uncertainty | Partial pooling, position-aware uncertainty, and a principled path from player participation to team value | Public participation is incomplete and player effects remain entangled with teammates and scheme | HIGH for the published framework, MEDIUM for live implementation | Begin with QB and unit-level deviations; shadow-test other player layers. |
| PFF WAR and player grades | Proprietary charting, participation, and player-value models | Rich assignment-level context can expose value hidden by box scores | Licensed, subjective charting; redistribution and reproducibility constraints | MEDIUM | Optional paid research input later; not a public-project foundation. |
| SumerSports coaching/tracking models | Market-aware win probability, coaching decisions, player value, and licensed tracking/deep learning | Coaching behavior and tracking-based interaction features are promising | Raw tracking is not generally public; direct marginal value for pregame mainlines is not independently established | MEDIUM to LOW for our use | Treat as research inspiration; require licensed longitudinal data and an ablation. |
| Exact-score count/state-space models | Correlated or overdispersed count distributions; Bayesian/state-space team attack and defense | Natural uncertainty and coherent derivation of spreads, totals, moneylines, ties, and pushes | NFL scores are not generic Poisson counts because scoring occurs in 2/3/6/7/8-point clusters and late-game strategy changes the tails | HIGH for family, MEDIUM for any chosen specification | Include correlated negative-binomial/state-space candidate in the controlled bake-off. |
| Possession simulation | Simulate drives, field position, scoring choice, pace, clock, overtime, and terminal states | Best home for NFL-specific mechanics and counterfactuals | Easy to overbuild; every extra mechanism can add variance without predictive lift | HIGH as a candidate, LOW until validated | Build only after the simple discrete baseline; promote mechanics individually by ablation. |
| NFL Bet Engine (open hobby project) | Score models, simulation, direct market heads, calibration, broad feature library, CLV tracking | Valuable architecture and feature inventory; explicitly leakage-aware | Performance is self-reported and not independently audited; strongest disagreements can be overconfident | LOW to MEDIUM | Use as a comparison checklist, not as evidence that a feature works. |
| Blitzcast (open hobby project) | XGBoost with Elo/EPA/rest/injury/weather/market features, Platt calibration, SHAP, walk-forward tests | Honest negative control: its published model trails Vegas on Brier score; explanation does not manufacture edge | Small project, results and maintenance are not independently audited | LOW to MEDIUM | Preserve as a benchmark and a warning against feature accumulation. |

## Pressure-tested foundations

These deserve production-quality implementation because the methodology is established and testable:

- point-in-time rolling-origin evaluation;
- market, SRS, and QB-adjusted Elo baselines;
- power-method de-vigging and exact-contract comparison;
- time-decayed, opponent-adjusted play efficiency;
- preseason priors and partial pooling;
- one coherent outcome distribution with explicit ties and pushes;
- log score, Brier score, calibration slope/intercept, CRPS, PIT/rank diagnostics, and interval coverage;
- immutable forecast-time data and closing-price archives;
- last-good behavior on partial or stale inputs.

These foundations are not claims that the current implementation already passes all gates. They are the minimum credible experiment harness.

## Promising ideas that are not pressure-tested enough for promotion

| Hypothesis | Why it may matter | Why evidence is weak | First honest experiment |
|---|---|---|---|
| Scenario mixture for QB, lineup, roof, and weather uncertainty | Averages can conceal sign-changing branches | Scenario weights are rarely calibrated prospectively | Freeze supported branches and weights; score branch calibration, edge survival, and interval coverage for a full season. |
| Model-market residual learning | Lets football information explain only what the market has not already priced | Can leak the target through closing prices or simply learn book artifacts | Predict outcome residuals from a forecast-time market baseline using only as-of features; compare to market-only and raw-outcome models. |
| Cross-book dispersion and line velocity | May reveal information arrival and price discovery | Two soft US books are not a clean sharp/public decomposition; latency can create false signals | Archive timestamped quotes from several books/reference markets and test whether dispersion predicts the next complete reference quote. |
| Player WOWY / hierarchical effects | Injuries and role changes are often the largest team-state discontinuities | Samples are sparse; teammates, coaching, and game state confound effects | Start with partial pooling by position and role certainty; demand lift over team+QB baselines in personnel-change games. |
| Offensive-line unit continuity | Blocking is interactive and line changes can shift both efficiency and variance | Public assignment/participation data are incomplete in season | Use starts/snaps/continuity and pressure proxies; shadow-test only when roster identity is timestamp-complete. |
| Coaching and clock-state fingerprints | Fourth-down choice, pace, timeout use, and pass/run tendencies shape score tails | Coach effects change with personnel and are highly contextual; 538 found insufficient lift for its coach features | Estimate shrinkage-heavy coach/play-caller random effects and ablate them on future score-distribution metrics. |
| Forecast-ensemble weather scenarios | Wind and precipitation can change play choice and kicking tails | Observed weather in a backtest leaks forecast error; threshold effects are unstable | Train on archived forecasts as issued at the same horizon and test wind bands by roof state and total range. |
| Conformal or adaptive interval correction | Could restore empirical coverage under drift without refitting the core model | Exchangeability fails in time series; NFL sample sizes are small | Compare block/bootstrap intervals with time-series conformal methods on sequential held-out seasons and regime shifts. |
| Exact football score lattice | 3/7-point masses and late strategy should improve distribution realism | Better fit may not improve decision probabilities or calibration | Compare lattice-aware score likelihood, CRPS, push probability, and market log loss against generic count models. |
| Public-money divergence | May identify informed flow or bookmaker response | Vendor samples and labels are opaque; published findings vary by season | Keep diagnostic only; require source sample/method/timestamp and prospective incremental value after current price. |

## Ideas to reject or quarantine until stronger evidence exists

- self-tuning from the site's picks or weekly results;
- trend mining such as revenge, primetime records, or coach head-to-head without preregistration;
- social sentiment as a probability input;
- referee features before a stable, causal, cross-season effect is demonstrated;
- arbitrary “sharp” labels inferred from ticket percentages;
- using realized game-day weather where only a forecast was available;
- LLM-generated causal explanations treated as model evidence;
- adding raw tracking matchup features without a legal, longitudinal, forecast-time dataset;
- optimizing parlays without a calibrated joint distribution across games and markets.

## Primary sources

- [Sports Reference SRS calculation details](https://www.sports-reference.com/blog/2015/03/srs-calculation-details/)
- [Archived FiveThirtyEight NFL prediction methodology](https://web.archive.org/web/20230212180718/https://fivethirtyeight.com/methodology/how-our-nfl-predictions-work/)
- [FiveThirtyEight NFL Elo/QB data dictionary](https://github.com/fivethirtyeight/data/blob/master/nfl-elo/README.md)
- [FTN DVOA explainer](https://ftnfantasy.com/nfl/dvoa-explainer)
- [nfelo WEPA methodology](https://www.nfeloapp.com/analysis/weighted-EPA-methodology-and-performance/)
- [nflfastR model explainer](https://github.com/nflverse/open-source-football/blob/master/_posts/2020-09-28-nflfastr-ep-wp-and-cp-models/nflfastr-ep-wp-and-cp-models.Rmd)
- [nflfastR EP/WP calculators](https://github.com/nflverse/nflfastR/blob/master/R/ep_wp_calculators.R)
- [nflseedR simulation framework](https://github.com/nflverse/nflseedR/blob/master/vignettes/articles/nflsim.Rmd)
- [ESPN FPI methodology](https://www.espn.com/nfl/story/_/id/13539941/how-espn-nfl-football-power-index-was-developed-implemented)
- [nflWAR paper](https://arxiv.org/abs/1802.00998)
- [PFF WAR paper](https://www.sloansportsconference.com/research-papers/pff-war-modeling-player-value-in-american-football)
- [SumerSports player and team value](https://sumersports.com/the-zone/sumersports-metrics-player-and-team-value/)
- [Exact NFL score forecasting](https://www.sciencedirect.com/science/article/abs/pii/S0169207012001070)
- [Bayesian/state-space NFL score model](https://math.bu.edu/people/mg/research/nfl.pdf)
- [NFL Bet Engine documentation](https://github.com/ShamgarBN/nfl-bet-engine/blob/main/CLAUDE.md)
- [Blitzcast documentation](https://github.com/carterptull/blitzcast/blob/main/README.md)
