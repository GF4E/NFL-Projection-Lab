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