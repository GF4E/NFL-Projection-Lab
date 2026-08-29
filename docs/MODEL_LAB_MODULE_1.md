# Model Laboratory Module 1

## Status

This experiment is preregistered research. It cannot alter the production forecast. A passing result makes the simplest qualifying candidate eligible for a prospective 2026 shadow season.

The frozen machine-readable contract is [`config/model-lab-module-one.config.json`](../config/model-lab-module-one.config.json).

Version `module1.2026-08-24.4` is the final pre-scorecard audit revision. No real candidate score had been computed when revisions 2 through 4 replaced the first contract. The revisions make numeric constants explicit, close leakage and calibration checks, add source-completeness tests, normalize legacy roster team codes, define neutral-site handling, align dispersion inputs with their hashes, fix nested candidate selection, and prevent the naive baseline's lagged scoring fields from entering C1-C3.

## Question

Can a market-free model produce a better calibrated joint home and away score distribution than a partially pooled points-for and points-allowed baseline?

The harder question is whether the result survives a strict point-in-time reconstruction. A favorable score from a row containing future plays, retrospective starters, current rosters, sportsbook information, or full-sample transformations is invalid.

## Target and origin

The target is the official final home and away score, including overtime. Primary evaluation uses regular-season games.

The standard origin is Tuesday at 7:30 a.m. Pacific for every game in NFL Week W. Every feature must end at Week W-1. An earlier game in Week W cannot update a later game in the same week.

The timeline is:

- 2010-2012: warm-up and prequential residual-library construction
- 2013-2024: development scorecard
- 2025: frozen retrospective confirmation
- 2026: first prospective shadow season

The 2025 period is not described as untouched. Its outcomes already existed when this protocol was written.

## Data boundary

The data builder uses positive allowlists. It never imports a wide schedule or play-by-play frame and then tries to remove suspicious fields.

Allowed target-game information is identity, season, week, kickoff, home team, away team, and neutral-site designation. Training outcomes use scores only after a game is complete. Historical features are rebuilt from immutable raw season files. Primary rates use scrimmage-play counts with explicit denominators. Penalties and non-scrimmage records cannot enter a scrimmage-play denominator. Quarterback scrambles count once as dropbacks and do not also enter designed-rush opportunity. A neutral site uses a midpoint home indicator and receives no naive home-field add-on.

Spread, total, moneyline, price, book, consensus, line movement, sentiment, closing value, selections, approvals, units, and rationale are forbidden.

The source schedule happens to contain market columns. The Module 1 projection drops them at the read boundary. Changing or deleting those columns must leave the data hash, fit hash, and forecast hash unchanged.

Published EPA, success, expected-pass, and pass-rate-over-expectation values come from upstream learned transformations. They are not primary Module 1 predictors. Published EPA and pass-rate-over-expectation enter one declared sensitivity run so their incremental result cannot be confused with the raw-count baseline.

### Roster decision

The active D1 pipeline has no immutable weekly roster table. Schedule starter fields describe who played and are not safe pregame starter forecasts.

The offline lab snapshots nflverse's weekly roster history by content hash. Module 1 uses only a coarse Jaccard continuity measure between the two latest team-week identity sets ending at Week W-1. Duplicate status rows collapse by player identity for this set calculation, while the raw rows remain retained. The feature does not resolve active status, predict a starter, use target-week records, or claim snap-weighted continuity. A later player module must build a timestamped participation and availability contract before player effects can enter.

## Missing data

An expected completed game missing either team play-by-play aggregate aborts the affected origin. The engine does not impute a partial import.

A completed-game import also aborts if raw score progression never reaches the official final for either team, the clock never reaches the final 60 seconds, a team has fewer than 20 valid scrimmage plays, or a team has fewer than four drives. These conservative source-integrity floors were frozen before the first real scorecard. They detect a partial file that still happens to contain both teams.

A weekly-roster import aborts if a completed scheduled team-week is absent or contains fewer than 40 distinct player identities. The download layer also verifies the response byte count against `Content-Length` whenever the source supplies that header. Cached objects must retain their recorded byte count and SHA-256 hash.

Historically unavailable source families use the training-fold league prior plus an explicit source-level missing marker. Low exposure is handled with partial pooling. It is not called missing.

Week 1 carries prior-season information forward. It never treats an empty current season as zero team strength.

## Executable fold specification

For forecast origin `o = (S, W)`, the eligible training set is

```text
T_o = {r : season_r < S or (season_r = S and week_r < W)}.
```

The model fit rejects any row outside that set. Every game in Week W is predicted from the same `T_o`. Model fits, state transitions, residual libraries, and dispersions cannot update between games in that week. A prior-week game dated on the origin's local calendar date is excluded because a date-only source cannot prove that it was final by 7:30 a.m. Pacific. Outcomes enter the next origin only after the complete weekly block. The first 2010 origin has no prior inputs. It is retained as historical outcome data but marked `warmup_unforecastable`; it produces no forecast, score, or residual-library update.

### Observation weights

For training row r at origin season S, the common observation weight is

```text
w_r = 2^(-(S - season_r) / 2.5) * m_season_r,
```

where `m_2020 = 0.5` and every other configured multiplier defaults to 1. The `no_time_decay` ablation replaces the exponential term with 1 but retains the configured season multiplier. No outcome from the target week enters a weight, transform, coefficient, state, or residual estimate.

### Fold-only imputation and scaling

For every selected numeric predictor k, and for the league scoring offset, missing values are replaced by the weighted mean learned only from finite values in `T_o`:

```text
a_k,o = sum_r(w_r * x_rk * I[x_rk finite])
        / sum_r(w_r * I[x_rk finite]).
```

The same `a_k,o` fills missing values in the training rows and target rows for that origin. A feature with no finite prior value, any infinite value, or any nonfinite value after imputation fails the fit. Declared missingness indicators remain separate predictors. Imputation values, counts, weighting rules, and their hash are stored with the fit.

Each imputed numeric feature is then standardized inside the same fold:

```text
c_k,o = sum_r(w_r * x_rk) / sum_r(w_r)
v_k,o = sum_r(w_r * (x_rk - c_k,o)^2) / sum_r(w_r)
s_k,o = sqrt(max(v_k,o, 1e-12))
z_rk  = (x_rk - c_k,o) / s_k,o.
```

If `s_k,o < 1e-6`, it is set to 1. All candidates require at least 128 prior team-score rows. The home indicator is 1 for a designated home-team row, 0 for an away-team row, and 0.5 for both teams at a neutral site. It is added once by the design matrix and is not duplicated among standardized predictors.

## Candidates

### C0: naive points

For team i against opponent j, the expected score is

`mu_i = 0.5 * (PF_i + PA_j) + signed_home_adjustment`.

`PF_i` and `PA_j` use the latest 17 eligible team games. Each numerator and denominator receives the frozen season decay and 2020 multiplier. Four league-average games are added as a prior. The league home effect is the weighted prior home scoring mean minus the weighted prior away scoring mean. Half is added to the designated home mean and half subtracted from the away mean. A neutral-site game receives neither adjustment. Relocated team aliases are frozen in configuration before the run.

The two lagged scoring rates and their history-game counts are C0 construction fields only. They are mechanically excluded from C1, C2, C3, all removal ablations, and the upstream EPA/PROE sensitivity run.

### C1: regularized offense-defense

Weighted ridge regression fits scoring-team, opponent, home, corrected raw-count play-by-play, and prior-week roster-continuity effects. Every rate, imputation value, scale, and coefficient is fit inside the current origin.

For team-score row r, let `y_r` be final points and `l_r` the fold-available league team-score mean. The design row is

```text
d_r = [1, home_r, z_r, offense-team one-hot_r, opponent-team one-hot_r].
```

The fitted response is `y_r - l_r`. With diagonal penalty matrix Lambda, the executable estimator is

```text
beta_hat = argmin_beta sum_r w_r * ((y_r - l_r) - d_r beta)^2
                       + beta' Lambda beta

         = (D' W D + Lambda)^(-1) D' W (y - l).
```

The intercept and home coefficient are unpenalized. Every standardized numeric coefficient and every team offense or opponent-defense coefficient receives `lambda = 16`. A least-squares solution is used if the penalized normal equation is numerically singular. An unseen team has zero for both absent one-hot effects. The pregame mean is

```text
mu_r = clip(l_r + d_r beta_hat, 1, 55).
```

Primary C1 excludes the four lagged scoring fields reserved for C0 and excludes EPA and pass-rate-over-expectation. The latter enter only the named sensitivity run. Ridge regularization identifies the otherwise redundant full team indicators, so individual team coefficients are shrinkage parameters rather than unconstrained standalone ratings.

### C2: dynamic state-space

A forward filter maintains offense and defense score states around a fold-fitted lagged-feature baseline. States update only after the whole weekly slate completes. Variance widens between seasons and the prior mean is retained. Retrospective smoothing is forbidden.

This first challenger is an approximate filtered-state model. It does not retain the shared posterior covariance between offense and defense states, and current state variance is not used as a standalone confidence score. Its predictive distribution still comes from candidate-specific prequential paired residuals. A passing score would justify prospective shadow testing of this recipe, not a claim that its latent-state uncertainty is fully specified.

C2 first fits the C1 weighted ridge equation with `lambda = 16` but without scoring-team or opponent-team one-hot columns. Call its fitted mean `b_r`. The observation variance is

```text
R = max(16, mean_r((y_r - b_r)^2)).
```

This residual mean is unweighted after the weighted base fit. Each team has an offense state `(O_i, P^O_i)` and a defense state `(D_i, P^D_i)`. New states begin at

```text
O_i = D_i = 0
P^O_i = P^D_i = max(1, 0.25 * R).
```

At a season boundary, state means are multiplied by 0.75 and each variance receives

```text
Q_offseason = max(0.01, 0.10 * R).
```

The `no_prior_season_carryover` ablation resets each mean to zero instead. Before each weekly block, every existing state variance receives

```text
Q_week = max(0.01, 0.01 * R).
```

For team i against opponent j, using only the states entering that weekly block,

```text
mu_ij = clip(b_ij + O_i + D_j, 1, 55)
e_ij  = y_ij - mu_ij
V_ij  = R + P^O_i + P^D_j
K^O   = P^O_i / V_ij
K^D   = P^D_j / V_ij.
```

All mean and variance changes are queued until every game in that week has been evaluated. The queued updates are

```text
O_i <- O_i + K^O * e_ij
D_j <- D_j + K^D * e_ij
P   <- max(0.01, (1 - K) * P).
```

Only forward-filtered states can forecast. There is no backward smoother. The update treats offense and defense marginal variances separately and drops their shared measurement covariance. The stored state variance affects later gains but does not directly widen the score distribution. Those are deliberate limitations to test rather than evidence of calibrated state uncertainty.

### C3: independent negative-binomial count

A regularized log-link model predicts each team's mean score from scoring-team, opponent, lagged play-by-play, and home effects. Home and away counts are conditionally independent. Fold-only residuals estimate dispersion.

C3 uses the same design row as C1 and the league scoring mean as a log offset:

```text
log(mu_r) = log(l_r) + d_r beta.
```

All coefficients start at zero except the intercept, initialized as

```text
initial_mean = clip(weighted_mean(y), 0.25, 70)
beta_0 = log(initial_mean / exp(weighted_mean(log(l)))).
```

It fits a penalized Poisson mean equation by iteratively reweighted least squares. At iteration t,

```text
eta_r = clip(log(l_r) + d_r beta_t, log(0.25), log(70))
mu_r  = exp(eta_r)
u_r   = eta_r + (y_r - mu_r) / mu_r - log(l_r)
W*_r  = w_r * mu_r

beta_(t+1) = (D' W* D + Lambda)^(-1) D' W* u.
```

The intercept and home coefficient are unpenalized. All other coefficients receive `lambda = 2`. Fitting stops when `max(abs(beta_(t+1) - beta_t)) < 1e-7`, with a maximum of 75 iterations. A nonconverged origin is a failed forecast. The returned mean is `clip(exp(log(l_r) + d_r beta), 1, 55)`.

Home and away dispersion are estimated separately from that candidate's prior prequential forecasts. For side s and prior records q,

```text
A_s     = sum_q((y_qs - mu_qs)^2 - mu_qs)
kappa_s = clip(sum_q(mu_qs^2) / A_s, 0.1, 1,000,000).
```

If fewer than 128 prior records exist, or `A_s <= 0`, `kappa_s` is 1,000,000, the configured near-Poisson limit. Given mean mu and dispersion kappa, the marginal probability is

```text
P(Y = y) = Gamma(y + kappa) / (Gamma(kappa) * y!)
           * (kappa / (kappa + mu))^kappa
           * (mu / (kappa + mu))^y.
```

The joint distribution is the outer product of the home and away marginals. C3 therefore cannot represent residual score covariance after conditioning on its predictors. That independence is a falsifiable model assumption, not a confidence claim.

The complexity order is C0, C1, C3, C2. A more complex candidate must beat C0 and the best simpler qualifying candidate.

Candidates are processed in that order. Each challenger must first pass every frozen gate against C0. The first passing challenger becomes the current simpler reference. A later, more complex candidate joins the qualifying set only when its paired energy-score improvement over the current best qualifying simpler model has a simultaneous 90 percent interval strictly above zero. After such a pass, the qualifying model with the lowest mean development energy score becomes the reference for the next rung. The final shadow candidate is that best qualifying reference. Thus complexity advances only after a stable out-of-sample gain; absent that evidence, the simpler model remains selected. No selection changes production.

## Distribution contract

C0, C1, and C2 use only prior prequential residual pairs to turn expected scores into a joint distribution. A fixed discrete kernel adds limited local support. In-sample residuals cannot enter the library.

For candidate c, prior game q contributes the paired residual

```text
r_q,c = (y_q,home - mu_q,home,c, y_q,away - mu_q,away,c).
```

The library is candidate-specific, receives results only after the full weekly origin completes, requires at least 128 games, and retains at most the latest 512. A retained residual from season s receives weight

```text
a_q = 2^(-(S - s) / 2.5).
```

For each forecast mean and each retained residual, the engine adds independent local offsets `delta_home` and `delta_away` from `{-2, -1, 0, 1, 2}` with weights `{0.05, 0.20, 0.50, 0.20, 0.05}`. It places mass at

```text
round(mu_home + r_q,home + delta_home),
round(mu_away + r_q,away + delta_away),
```

with each score clipped to the 0-through-71 support. The paired empirical residual preserves observed home-away dependence; only the small local offsets factor independently. Every joint cell is floored at `1e-12`, then the matrix is normalized.

C3 uses independent negative-binomial marginals. No hardcoded NFL key-score percentage enters Module 1.

All distributions use support from 0 through 70 plus a 71-or-more tail bucket, one numerical probability floor, and fixed per-game energy-score seeds shared across candidates. C3 assigns probability above 70 to the 71-or-more bucket before flooring and normalization. The residual-kernel models clip generated scores to that bucket.

## Evaluation

Primary loss is the multivariate energy score of the paired home and away result. Mandatory diagnostics include joint negative log score, marginal and derived CRPS, score and margin error, win probability loss, coverage, width, PIT, runtime, failures, and missingness.

Uncertainty uses a fixed-seed hierarchical block bootstrap. It resamples seasons and contiguous three-week blocks, preserving games exposed to the same weekly shock. The three challenger comparisons use a simultaneous interval rather than three isolated favorable intervals.

Every candidate is evaluated on the same games. Dropping a hard game rejects the candidate.

## Falsification

The run is invalid if any market field reaches a model matrix, any feature postdates its origin, an expected completed-game import is partial, or changing odds or pick data changes a hash or forecast.

A full candidate is rejected if a frozen leave-one-group-out ablation improves energy score with a simultaneous interval above zero. It is not repaired in place. A revised feature set requires a new protocol version.

A candidate cannot reach shadow status unless it passes every gate in the frozen configuration. A retrospective pass does not authorize production use.

## Required artifacts

The runner writes:

- source URLs, capture times, byte hashes, and row counts
- configuration, feature-schema, code, data, origin, model, and forecast hashes
- every historical pregame forecast and candidate distribution summary
- overall, season, development, and confirmation scorecards
- paired simultaneous intervals and leave-one-season-out results
- calibration, missingness, leakage, invariance, negative-control, and ablation results
- one result: `reject_all`, `shadow_eligible`, or `protocol_invalid`

Production remains unchanged throughout Module 1.

## Running the isolated laboratory

Create and activate a Python environment, then install the laboratory-only dependencies:

```text
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-model-lab.txt
```

Run the fast boundary and primitive checks:

```text
pnpm model-lab:module1:self-test
```

Run the complete frozen replay:

```text
pnpm model-lab:module1
```

The source cache is content-addressed and ignored by Git. The scorecard, compressed retrospective ledger, and digest manifest are written under `artifacts/model-lab/module-one/`.
