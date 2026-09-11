# Weekly component harvest

Research queue, not live model selection. Metadata checked September 8, 2026; commits and API metadata are pinned in [sources](work/harvest-elo-v1/sources/pins.json).

| Repository | License observed | Last push (UTC) | One component |
|---|---|---|---|
| [fivethirtyeight/nfl-elo-game](https://github.com/fivethirtyeight/nfl-elo-game/tree/fbec1afa38ece5befe24fb21be8ddba8eb160fe6) | MIT | 2023-05-02T15:15:09Z | Football baseline: port MIT base Elo and add published pregame QB VALUE adjustment. Full QB estimator/inputs remain unavailable; do not call the base-only diagnostic QB Elo. |
| [greerreNFL/nfelo](https://github.com/greerreNFL/nfelo/tree/3425a6a9c304639f9e7c110cf4a0a79b92ad5b89) | No license detected | 2026-09-08T16:40:54Z | Independently implement market-regression and QB-adjustment ideas from published methodology in a later harvest. Never copy implementation code. Load the pinned historic_projected_spreads.csv as reference data only. |
| [ShamgarBN/nfl-bet-engine](https://github.com/ShamgarBN/nfl-bet-engine/tree/9aa4326c96d6aa5d771b7b68be8226d9f96a7023) | MIT | 2026-06-23T17:12:38Z | Reimplement the walk-forward backtest structure; do not import its models or UI. |
| [thadhutch/sports-quant](https://github.com/thadhutch/sports-quant/tree/5cba2c0a7f499129e3a9c98597cb85397c3fa862) | MIT | 2026-03-19T22:29:59Z | Reimplement weather features for totals using the existing automated weather stack; no other features. |


## Current executable result: harvest v2

The [v2 comparison](work/harvest-elo-v2/README.md) supersedes the missing-input outcome below for the newly authorized ANY/A proxy and league-mean totals companion. Run `python -m engine.harvest --harvest elo-anya-v2 --output work/harvest-elo-v2/run-2` with the pinned interpreter. Both candidates have nonzero paired counts; neither passes the updated numerical gate. Full 538 VALUE remains distinct from this reconstructed ANY/A proxy.

## Weekly loop

The existing Tuesday 09:00 local heartbeat now follows this six-week queue in order, starting with Week 2. Each success criterion below is its promotion gate, as authorized in the September 11 review. Track progress in [the queue](work/harvest-methods-review-2026-09-11/queue.json); complete the next pending item before advancing, and stop the weekly automation after Week 7 is complete.

| Week | Harvest | Success criterion (promotion gate) |
|---|---|---|
| 2 | Opponent-adjusted EPA, success rate, CPOE ratings, ridge, rolling-origin 2016 to 2025 | Standalone margin residual sigma below 13.0, and a positive stable c in the residual regression |
| 3 | Injury report features paired with the EPA ratings | Residual regression coefficient stable in 8 of 10 seasons |
| 4 | QB upgrade: EPA per dropback and CPOE replacing ANY/A | Improves harvest one margin CRPS by more than 0.5% |
| 5 | Situational retest: home dogs, rest, travel, Week 1 and 18 | Any bucket clears break-even after Bonferroni |
| 6 | Threshold retest on the EPA residual model | Over-3-point bucket clears 52.4% with interval above 50% |
| 7 | Bayesian state-space ratings | Beats ridge ratings on CRPS in rolling-origin |

Anything that fails its criterion is logged negative and not revisited this season. Missing inputs or unresolved gate definitions are BLOCKED, not a negative result or a pass. Register inputs, targets, cutoff, comparison population, and operational definitions before viewing results; do not invent or weaken a promotion criterion. Preserve chronology, source hashes, evidence labels, and every prior experiment. No Odds API credits, unlicensed code copying, or automatic upstream code execution.

These gates govern the new queue only; historical decisions and E3 remain unchanged. Research qualification does not modify the frozen T75 live package: its Week 4 review and new-version requirements still apply. The appended review is user-supplied material preserved verbatim, not a fresh verification of its source claims. See the [schedule and preservation record](work/harvest-methods-review-2026-09-11/experiment.json).

## Historical harvest one (preserved)

[Final experiment](work/harvest-elo-v1/run-3/experiment.json) · [paired losses](work/harvest-elo-v1/run-3/paired-losses.csv) · [pre-comparison protocol](work/harvest-elo-v1/protocol.json).

`engine/elo.py` ports the MIT base update, reversion, home advantage and margin-of-victory multiplier. The published `3.3 × (starter VALUE − team VALUE)` adjustment is implemented separately. The source repository does **not** include the complete QB VALUE estimator or a totals predictor. The official historical QB download no longer supplied usable CSV during this run. No zero-filled QB series or invented totals forecast is substituted. Full QB-adjusted 2016–2025 evaluation is therefore **incomplete**.

The base-only margin diagnostic is available for all requested seasons; it uses prior-week results and a prior-season empirical shape wrapper. Elo-point-to-margin conversion is a declared local adapter, not a native 538 margin distribution. The nfelo reference starts in 2021 and lacks totals. All duplicate reference game IDs are excluded; prior-season residual calibration further limits paired coverage. These comparisons are labeled `DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST`. Historical closing/reconstructed lines cannot stand in for as-issued T60 evidence.

Neither the live distribution artifact nor frozen experiments are modified. Evaluating the live 2015–2025 fitted PMF on those same seasons would leak future labels; the replay rebuilds its shape from strictly prior seasons instead. Whole-week Elo predictions precede that week's score updates; season-level residual fits are frozen throughout each evaluation season. Regular season is the evaluation population, with Week 1 and Week 18 tags; postseason games update ratings only for subsequent weeks/seasons.

## Commands

Verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```

Replay the named immutable harvest:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.harvest --harvest 538-qb-elo --output work/harvest-elo-v1/run-3
```

Supply qualified QB inputs in a new run:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.harvest --harvest 538-qb-elo --qb-input pregame-qb.csv --output work/harvest/NEW_RUN
```
QB CSV fields: `game_id,home_qb_adjustment,away_qb_adjustment,available_at,training_season,training_week`. Adjustments are Elo points, not raw VALUE. Include prior-season forecasts to calibrate the distribution; metadata must precede the forecast cutoff, and training must exclude the target week. Supplying adjustments alone does not reproduce the unpublished full QB rating estimator.

Grade and compare any named component with a pinned prediction CSV:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.harvest --harvest COMPONENT_NAME --predictions predictions.csv --output work/harvest/NEW_RUN
```
Prediction CSV fields: `game_id,margin_location,total_location,available_at,training_season,training_week`. Locations use home-minus-away margin and game total. Include 2015 warm-up predictions and all evaluation years; missing targets stay missing. Files are hashed; imported-model training metadata is a declaration, not independently verified as-issued evidence. Without `--predictions`, only the implemented `538-qb-elo` and diagnostic `538-base-elo` names are accepted. Every component gets prior-season empirical residual wrappers and paired grading against the market and available nfelo series; no dynamic repository code is loaded.

Published methodology for later independent nfelo work: [market regression](https://www.nfeloapp.com/analysis/using-market-regression-to-improve-prediction-accuracy-in-the-nfl/) and [model overview](https://www.nfeloapp.com/about/). The 538 adjustment is described in its [published methodology](https://fivethirtyeight.com/methodology/how-our-nfl-predictions-work/), whose direct URL now redirects; source availability is explicitly limited. No nfelo implementation source was downloaded or copied.

## Harvest two: disagreement study

[Bucket and seasonal regression report](work/harvest-disagreement-v1/REPORT.md). The conditional blend was not triggered under the stability definition fixed before this study. No promotion gate or live location was changed. Replay with `python -m engine.disagreement --output work/harvest-disagreement-v1/run-2` using the pinned interpreter.

### Harvest two outcome: NEGATIVE

No blend was triggered under its frozen stability rule; this is a negative harvest outcome, not proof of zero incremental Elo information. Numerical results: [experiment](work/harvest-disagreement-v1/run-2/experiment.json). ATS excludes pushes and exact agreements; intervals are pointwise week-cluster bootstrap intervals. nfelo remains `DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST`.

| Series | Absolute disagreement | Games | W–L–P | No side | Mean directional residual (points) | ATS rate (95% interval) |
|---|---|---:|---|---:|---:|---|
| ANYA | <1 | 657 | 311–328–18 | 0 | +0.014 | 48.7% (44.6–52.7%) |
| ANYA | 1–<2 | 583 | 280–287–16 | 0 | -0.226 | 49.4% (45.4–53.3%) |
| ANYA | 2–<3 | 486 | 224–250–12 | 0 | -0.502 | 47.3% (42.6–51.9%) |
| ANYA | 3–4 | 348 | 163–177–8 | 0 | -0.412 | 47.9% (42.5–53.5%) |
| ANYA | >4 | 565 | 289–265–11 | 0 | +0.936 | 52.2% (47.8–56.3%) |
| nfelo | <1 | 537 | 110–115–7 | 305 | +0.334 | 48.9% (42.5–55.2%) |
| nfelo | 1–<2 | 238 | 113–123–2 | 0 | -0.412 | 47.9% (41.8–53.9%) |
| nfelo | 2–<3 | 95 | 42–52–1 | 0 | -0.958 | 44.7% (35.6–54.2%) |
| nfelo | 3–4 | 58 | 33–24–1 | 0 | +1.276 | 57.9% (44.0–69.1%) |
| nfelo | >4 | 18 | 6–10–2 | 0 | -2.333 | 37.5% (16.7–55.6%) |


## Harvest three: weather totals — NEGATIVE

[Experiment and wind, precipitation, dome tables](work/harvest-weather-v1/REPORT.md). The requested sign-consistency trigger fired, but the location adjustment worsened total CRPS; margin remained unchanged. No promotion. Reanalysis remains retrospective evidence. Run `python -m engine.harvest --harvest weather-v1 --output work/harvest-weather-v1/run-2` offline.

[Harvest-three follow-up](work/harvest-weather-followup-v1/REPORT.md): seasonal counts and four-bucket multiplicity correction, with a stitched-forecast sensitivity diagnostic. Historical T60 issuance remains unverified. [Paper rule](RULES.md) registered separately; no live promotion.

# Methods and data review (2026-09-11)

Scope: what statistical methods and data the literature and practitioner writing say matter for NFL spread and total forecasting, graded by evidence tier, with what each would cost us and where it sits in the harvest queue. Medium posts are blog tier: ideas to test, never results to trust.

Evidence tiers: A peer-reviewed or working paper with out-of-sample test. B student capstone or thesis. C practitioner blog (Medium, textbooks, vendor pages). D self-reported model performance with no reproducible record.

## 1. The ceiling, restated with sources

| Source | Finding | Tier | Implication |
|---|---|---|---|
| Our harvest one, 2016 to 2025, 2,639 games | Market residual sigma 12.6 margin, CRPS 7.095 | own | Baseline to beat |
| Quinnipiac capstone (Conrad 2024), 1,560 games 2018 to 2023 | Sportsbook RMSE 12.87 spread, 13.22 total | B | Confirms our sigma. Their models beat it only in K-fold, no holdout season |
| Szalkowski and Nelson 2012, 2,560 games 2002 to 2011 | No significant difference between opening and closing line accuracy; home dogs 53.5% ATS; line difference normally distributed | A (working paper) | Line movement is a weak feature; the home-dog edge is a 2002 to 2011 finding and must be retested |
| Systematic review, arXiv 2410.21484 (2024) | Recurring failure in ML sports betting is leakage and in-sample evaluation | A | Our chronology framework is the correct defense |
| Generalized Elo to distributions, arXiv 1802.00527 | Extends Elo to full margin and total distributions, NFL 2009 to 2017 | A | Low priority; empirical distribution already covers this |

## 2. Statistical methods, ranked by expected value to our record

| Rank | Method | What it is | Evidence | Cost | Status |
|---|---|---|---|---|---|
| 1 | Opponent-adjusted efficiency ratings | Ridge on team offensive and defensive EPA per play, success rate, CPOE, schedule-adjusted, rolling window, garbage-time filter | A for EPA as margin predictor; C for the 2.7 points per 0.10 EPA differential rule of thumb | Free, nflverse pbp | Not built. Next harvest |
| 2 | Market residual model | Regress margin minus line and total minus line on a small feature set; picks come from conditional disagreement | A | Free; reuses harvest two code | Framework exists; only Elo tested |
| 3 | QB adjustment, improved | EPA per dropback and CPOE replacing ANY/A, rolling 8 to 16 games, backup-QB reversion | A (538 methodology, CPOE stability) | Free | ANY/A proxy built |
| 4 | Injury and availability features | Weekly injury report counts by position group, starters out, from nflverse injuries | C (Gentile 2025: noisy, inconsistently reported) | Free, weekly | Not built. Pair with rank 1 |
| 5 | Bayesian state-space team strength | Ratings evolve weekly with process noise; Glickman and Stern 1998 lineage | A | Moderate; two harvests | Backlog until rank 1 is measured |
| 6 | Gradient boosting with forward selection | Quinnipiac's best in-sample method | B, in-sample only | High overfit risk on 4,000 games | Test only under rolling-origin with the rank 1 feature set |
| 7 | Threshold betting | Bet only when model differs from line by X | B, tested by us on Elo | Free | Negative for Elo. Retest with rank 1 |
| 8 | Situational buckets | Home dogs, Week 1 and Week 18, rest and travel | A for historical facts, unknown currency | Free | Home dogs, rest, travel untested; wind done |
| 9 | Open-to-cutoff line movement | Feature from historical opening lines | A: no significant predictive difference | Credits | Backlog |
| 10 | Generalized Elo distributions | Elo-derived margin and total distributions | A | Free | Backlog |
| 11 | Neural networks | Quinnipiac and Medium posts | B and C, in-sample | Low value at 4,000 games | Do not build |

## 3. Data sources

| Source | Provides | Cost | Chronology risk | Status |
|---|---|---|---|---|
| nflverse pbp (nfl_data_py) | EPA, success rate, CPOE, WP since 1999 | Free | EPA model retrained periodically; pin hashes; declare garbage-time filter | In use for QB proxy |
| nflverse schedules | Scores, closing spread and total, roof, surface | Free | Closes, not T-75 | In use |
| nflverse injuries | Weekly official reports with status | Free | Weekly, not gameday | Not used |
| nflverse depth charts, rosters | Starters, QB1 | Free | Weekly | Partial |
| nflverse Next Gen Stats | Target share, air yards, separation | Free | Weekly | Props only, later |
| Open-Meteo | Hourly forecast and archive | Free | Archive from 2022 | In use |
| The Odds API | Live and historical lines, five books | Credits | Single point of failure | In use |
| Pre-game player projections (fantasydata, per Quinnipiac) | Player-level expected production | Paid | History availability unknown | Candidate, not this season |
| DVOA (FTN) | Opponent-adjusted efficiency | Paid | Limited history | Not needed; EPA ratings cover it |
| Gameday inactives | Official 90-minute list | Paid feeds only | | Unavailable; market at T-80 prices it |

## 4. What the Medium and practitioner sources add, and what to discount

Add: the three-driver framing (team efficiency, player availability, market expectation; Gentile 2025), of which we have one and three; time cuts and roll-forward validation (nxtbets 2026, DataField ch. 15), identical to our chronology rules; garbage-time and drift warnings on public EPA (sportshighlight 2026); key numbers and teasers as the NFL-specific inefficiency (DataField), matching our results.

Discount: any Medium model reporting accuracy without a dated holdout season and a closing-line comparison, which is every one found; "tied Vegas" claims, since tying the line on RMSE is the expected result; tout pages (SportsLine, Covers) reporting last-100-game records, tier D.

## 5. Learning from the Quinnipiac capstone

1. Feature selection before fitting (forward selection, lasso) beat using every feature. Apply to the rank 1 harvest.
2. Threshold betting shrank sample size faster than it raised accuracy; RMSE rose with threshold. Any threshold rule needs a minimum bet count and per-season stability, which our gate already requires.
3. They never tested a held-out season. "Profitable" meant in-sample K-fold accuracy above 52.4%. We do not repeat it.
4. Their paid player-projection feature is the only input we lack with a plausible mechanism. Candidate for 2027 if the free stack plateaus.

## 6. Harvest queue, next six

| Week | Harvest | Success criterion (promotion gate) |
|---|---|---|
| 2 | Opponent-adjusted EPA, success rate, CPOE ratings, ridge, rolling-origin 2016 to 2025 | Standalone margin residual sigma below 13.0, and a positive stable c in the residual regression |
| 3 | Injury report features paired with the EPA ratings | Residual regression coefficient stable in 8 of 10 seasons |
| 4 | QB upgrade: EPA per dropback and CPOE replacing ANY/A | Improves harvest one margin CRPS by more than 0.5% |
| 5 | Situational retest: home dogs, rest, travel, Week 1 and 18 | Any bucket clears break-even after Bonferroni |
| 6 | Threshold retest on the EPA residual model | Over-3-point bucket clears 52.4% with interval above 50% |
| 7 | Bayesian state-space ratings | Beats ridge ratings on CRPS in rolling-origin |

Anything that fails its criterion is logged negative and not revisited this season.