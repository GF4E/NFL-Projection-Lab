EXPERIMENT E-UNC: UNCERTAINTY ESTIMATION. Registered under the governing protocol as the next experiment after the current queue item, with hashed preregistration before any comparative result, nested chronological evaluation 2016 to 2025, candidate-specific calibration, identical eligible games, and paired uncertainty keeping both teams of a game together. Run the Tier 1 and Tier 2 gap sweep first and publish it; batch Tier 3 items in one message. Write work/e-unc/PLAN.md mapping each numbered requirement to its file before implementing. Before the DONE report, ask whether each requirement is met exactly as written; if not, fix and ask again.

## 1. Audit first, before any model change
1.1 State in the report, with the code path, exactly what the current 50% and 80% intervals are built from. Confirm whether they are predictive intervals for a single game or confidence intervals on a fitted mean. Wilke, Fundamentals of Data Visualization, chapter 16, figure 16.4: the standard deviation describes spread among observations, the standard error describes precision of an estimate, and they are not interchangeable. We predict one game, so the interval must be predictive.
1.2 Decompose the predictive variance into parameter uncertainty and irreducible game variance, report each by season, and report their ratio. If parameter uncertainty is a small fraction, say so; that is the expected result and it tells us intervals will not narrow much as the season goes on.
1.3 State how the margin interval and the winner probability are currently computed. If either is derived by combining the two team intervals as independent, that is a defect: within a game the two teams' errors are correlated through pace, script and weather. Measure that correlation on 2016 to 2025 out-of-fold residuals and report it.

## 2. Registered candidates, three, against the incumbent control
(a) Joint margin: margin and total distributions drawn from the joint ensemble with the measured within-game residual correlation, replacing any independent combination. Winner probability from that joint margin distribution only.
(b) Heteroscedastic intervals: model the predictive spread as a function of features known at forecast time only, fit on out-of-fold absolute residuals or log variance. Candidate feature set, fixed now and not expanded after results: week number, whether the starting quarterback is confirmed, forecast wind, dome or open roof, weeks since a head coach or QB1 change, and games played by each team this season. Wilke figure 16.6: less information, wider interval.
(c) (a) plus (b).
Prefer the simpler candidate on ties.

## 3. Scoring, sharpness subject to calibration
Coverage alone is not a gate; any interval can reach nominal coverage by widening. Score every candidate on:
3.1 CRPS for team points, margin and total. Gneiting and Raftery 2007.
3.2 Winkler interval score at 50 and 80, which penalizes width and misses together.
3.3 Coverage at 50 and 80 with counts, by season and by week.
3.4 Mean interval width by season, reported beside coverage so a candidate cannot buy coverage with width unnoticed.
3.5 PIT histogram per target, and a spread-skill plot of predicted spread against realized absolute error.
3.6 Brier score and a ten-bin reliability diagram for the winner probability.
Release gate, unchanged in form: at least 1% out-of-fold improvement in the primary objective with coverage within 3 points of nominal at both levels, plus no worsening of the interval score at either level.

## 4. Display consequences, binding on BOARD v7
4.1 Every interval on the site is labeled with what it is and its level. Wilke: whenever uncertainty is drawn, the quantity and confidence level must be stated. The week header carries one line: "bars show 50% and 80% predictive intervals for a single game".
4.2 Graded error bars, not one band: thin line for 80%, heavier shorter bar for 50%, no caps. Grading exists to prevent the deterministic reading that a score cannot fall outside the band.
4.3 Interval widths render per game, never a constant. If candidate (b) is rejected and widths stay constant, the page says so in the legend rather than implying per-game precision it does not have.
4.4 The winner probability is stated as a number and never implied by whether the two lanes overlap. Add a legend line: "overlap between the two bars does not determine the winner probability". Belia et al. 2005 and Wilke chapter 16: overlap rules of thumb are unreliable.
4.5 Expanded row gains a quantile dotplot for each team, ten dots, each dot one tenth of the predictive distribution. Kay et al. 2016; Wilke section 16.1: discrete outcome framing is read more accurately by non-specialists than a band or a density, and ten dots read better than fifty.
4.6 Expected number roman, observed number italic, same size; the difference sits above the segment joining them.

## 5. Tests
The margin distribution is not the independent combination of the two team distributions, verified on a fixture with known correlation.
Winner probability is computed from the joint margin distribution and from nothing else.
A predictive interval on a synthetic case with known parameter and residual variance recovers both components within tolerance.
Interval width varies across games whenever candidate (b) is active, and the legend states constancy whenever it is not.
Coverage, interval score, CRPS and Brier reproduce hand-calculated fixtures.
No interval renders anywhere on the site without its level and quantity labeled.
The quantile dotplot's ten dots partition the predictive distribution into equal probability masses.

## 6. Report
COMMIT lines, plan path, the gap sweep, the section 1 audit answers with code paths, the measured within-game correlation, the full scoring tables by season with width beside coverage, the gate table, and one line naming the requirement you were least sure of and what you changed because of it.