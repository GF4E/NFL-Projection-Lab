# E-UNC pre-implementation gap sweep

## REVIEW REQUESTED — Tier 2 decisions (work may continue)

1. Queue interpretation: E1 is closed; E2 is the current queued item. Place E-UNC immediately after E2, before E3; do not run two registered methods this week. Alternative: treat completed E1 as current and jump E2. Preserve Week 9 scheduled recalibration separately from queue order.
2. Candidate (a): jointly resample observed home/away residual pairs (500 members, fixed game/version seed); this preserves dependence without a fitted copula or normality assumption. Alternative: a fitted Gaussian correlation model. Marginal point centers remain fixed; no bias correction hidden in uncertainty work.
3. Candidate (b), if admitted: linear log absolute-residual scale on the fixed features, fitted only to earlier OOF rows; unpenalized least squares, no feature expansion or tuning grid. Relative scales normalized on the training fold and calibrated with that candidate's earlier standardized residuals. Alternative: log squared residuals. Exact coefficients/missingness policy must be locked before comparative results; missing-feature amendment is Tier 3 below.
4. Variance decomposition: use a training-only game-cluster ridge sandwich diagnostic conditional on chosen features/hyperparameters if implemented; report model discrepancy separately as inseparable from residual game variation. Alternative: repeated full-pipeline bootstrap, more expensive and includes selection uncertainty. Never call all empirical residual variance irreducible, or claim a precise split from a single OOF residual series. Current audit reports the split as unidentifiable, not zero.
5. Interval-score aggregation: require no worsening separately for team points, margin and total at both levels, rather than allow an average to hide a worse target. This is a conservative reading of the new E-UNC interval-score requirement, subject to review. Existing coverage-gate scope remains margin/total at both levels; team coverage is reported and is not an additional gate. The primary-objective amendment remains B01 below.

## Tier 1 — decided

- Predictive intervals are central 50/80 inverse-empirical-CDF intervals (existing engine practice); never divide predictive standard deviation by sqrt(n).
- Empirical CRPS = E|X-y| - E|X-X'|/2; Winkler uses alpha=1-level and 2/alpha miss penalties; coverage includes endpoints. Sources: Gneiting/Raftery 2007; existing distribution.quantile.
- Home-minus-away margin; home-plus-away total; compute both from the same paired members. Rho estimated from paired training residuals, never searched. Full 2016–2025 rho is retrospective audit only, never used in earlier folds.
- Winner semantics stay P(home win)+half P(tie), with a separate tie probability, matching incumbent source. Brier target is 1/0/0.5 for home win/loss/tie. Report semantics; do not silently switch to P(win) excluding ties.
- Ten-bin reliability: fixed [0,.1), ... [.9,1], final bin closed; empty bins show n=0. Midpoint PIT for discrete distributions, consistently labeled (uniformity for randomized PIT differs).
- Quantile dots: inverse CDF at .05,.15,...,.95, representing ten equal probability strata; coincident discrete values stack. Ten displayed atoms approximate a distribution; do not claim every score location has exactly 10% true mass.
- Stable row sorting and game/version hashes; a game is the minimum pairing unit. Reuse chronological week/season blocks for uncertainty, not independent team-row resampling.
- Chronology and kickoff+4h eligibility stand for every candidate. 2013–2015 calibration-only replay is already authorized; no 2016 outcome may initialize its own calibration.
- New E-UNC forecast-wind scale hypothesis supersedes v2 5.4's constant-wind-spread constraint for this experiment only; no reanalysis may enter shipping coefficients.
- Forecast-derived UI changes preserve all frozen projections, intervals, grades, and distributions. No dotplot interpolation from interval endpoints.
- Audit diagnostics are not candidate comparisons. No historical candidate results are viewed before final preregistration. Reused historical years remain development evidence.

## Tier 3 — batched user decisions before dependent fitting

B01: Governing primary objective is team MAE; fixed-center uncertainty-only candidates cannot improve that by 1%. Recommend an explicit E-UNC-only mean team-points CRPS gate, while retaining point forecasts and coverage/interval-score requirements. Do not silently change the gate.

B02: Full fixed-feature pregame histories are not qualified for 2016–2025: QB confirmation, coaching-change timing, exact forecast wind; Week 1 QB1 IDs do not establish weekly confirmation or midseason change time. Recommend explicitly inactive/unknown unsupported fields on the full paired population, with coverage reported. Removing required features, restricting games, or substituting reanalysis without authorization changes the registered candidate/population.

No Tier 3 question is needed for standard scoring arithmetic. These two issues were raised together before implementing any candidate fit.

Sources: https://clauswilke.com/dataviz/visualizing-uncertainty.html ; https://sites.stat.washington.edu/raftery/Research/PDF/Gneiting2007jasa.pdf ; work/projection-governance-v2/GOVERNANCE.md ; DECISION-LATENCY.md.

## Binding user resolution, before fitting
B01/B02 resolved: mean team-points CRPS is E-UNC-only primary, at least 1% improvement. Both teams, margin and total point forecasts must match control on every game within 1e-12; otherwise OUT_OF_SCOPE and not scored. Candidate b is PARTIAL TEST: week, games played by each team, and roof. QB confirmation, coaching-change timing and forecast wind inactive. Margin/total CRPS, Brier and reliability are evidence, not gates. User directs hash then fit now, resolving timing; E2 remains next original queue item.

SECONDARY: b plus forecast wind, 2021–2025, fixed model/no tuning, never primary. Official Open-Meteo documentation says archive starts around 2022. Local file has 736 rows 2022–2025 marked STITCHED_FORECAST_NOT_T60_ISSUANCE, not timestamp-qualified pregame forecasts. Report 2021 no archive, coverage by season and this shortfall; never relabel, infer or substitute reanalysis. If no qualified rows exist, secondary is blocked without blocking primary.

## Exact numerical implementation, before results
- Reuse calendar-corrected E1 linear OOF point forecasts, 2013–2015 calibration only and 2016–2025 scored. Control uses deployed pooled integer team residuals and directly paired integer margin/total residuals from expanding prior seasons.
- a: 500 paired empirical residual members, deterministic SHA256 game/version seed, added to unchanged unrounded point centers. Empirical paired sampling preserves dependence, never independent convolution.
- b: pooled standardized team residual empirical distribution and directly paired standardized margin/total residual distributions, multiplied by one positive game scale. Features: intercept, week, home games completed, away games completed, dome/closed=1 versus open/outdoors=0. Fit log(max(mean absolute team error,1e-6)) by unpenalized least squares, no tuning. c: same scale with paired 500-member standardized residuals.
- Fit scales only on earlier OOF seasons; standardize each earlier game's residuals with the scale model existing before that game's own season. Initial 2013 scale=1; outer 2016+ always has earlier calibration. Refit once per season; no tuning search.
- Sorted game IDs, 500 fixed members; control retains exact full empirical sample. No random smoothing or score truncation. Quantiles inverse empirical CDF. Integer residual rounding only for incumbent control.
- Coverage gate inherits margin/total at 50/80, pooled within 3 points. Winkler must not worsen for any of team, margin or total at either level. All metrics reported by week/season.
- Bootstrap 2,000 four-week-block resamples within seasons, paired games, seed 20260916. Among passing candidates whose paired CRPS difference interval includes zero, prefer a, then b, then c. No passing candidate means retain control. Review still required before promotion.
- Conditional variance diagnostic: saved ridge fit, training-only game-cluster sandwich covariance. Sum estimated parameter variance and training residual variance, report by held-out season and ratio. Residual is conditional noise plus model discrepancy, not an identified physical irreducible floor. Synthetic fixture verifies both components.
