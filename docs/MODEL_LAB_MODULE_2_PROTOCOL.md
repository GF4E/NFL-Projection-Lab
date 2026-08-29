# Model Laboratory Module 2 Protocol

## Frozen question

Can football-only information available at one Tuesday 7:30 a.m. Pacific origin improve the joint distribution of home and away regulation offensive-series counts over simpler possession baselines?

The harder question is whether possession count is a stable, reconstructable component of team scoring. A successful count forecast would not prove that a possession decomposition improves score forecasts. That downstream question requires a separate frozen integration test after prospective shadow storage.

Module 1 remains `reject_all`. Its C0 points model is retained only as a research benchmark. No Module 1 prediction, residual, coefficient, target error, favorable slice, or recorded selection enters Module 2.

Versions 2 through 7 froze the target reconstruction, chronology, feature arithmetic, candidate equations, residual boundary, probability scoring, paired inference, controls, selection order, and append-only replay manifest. The v7 replay terminated `protocol_invalid` before aggregation or selection. It exposed two execution defects that do not depend on any target value or model comparison: P2 validated intentional 2010 null indicators before excluding prehistory, and the runner omitted the already-frozen Tuesday date cutoff for postponed prior-week games. Version `module2.2026-08-25.8` fixes only those paths and adds boundary tests. Every model, feature, threshold, loss, seed string, resample rule, ablation, and promotion gate remains unchanged. No v7 scorecard, paired comparison, or gate result was produced or consulted. The invalid v7 artifacts remain preserved. The machine-readable v8 contract is [`config/model-lab-module-two.config.json`](../config/model-lab-module-two.config.json).

## Target ontology

The primary target is the pair

```text
Y_g = (N_home,reg,g, N_away,reg,g).
```

`N_team,reg,g` counts offensive series, not every moment of ball control. A series is one unique `(game_id, corrected fixed_drive segment, posteam)` key that contains at least one qualifying live offensive event in quarters 1 through 4. The correction activates only when qualifying rows inside one `fixed_drive` contain two possession teams. Those rows are ordered by `play_id` and split when raw `drive` or possession team changes. Raw `drive` is only a repair hint because it is missing from administrative rows and has its own errors. An auxiliary start-play identifier cannot split an otherwise single-offense series. nflverse recommends `fixed_drive` over the provider drive counter, but its own change record documents rare corrections. The split rule makes those cases explicit and auditable.

The pre-replay audit matched 4,175 completed regular-season schedules to 4,175 games and 737,117 play-by-play rows from 2010 through 2025. It found zero missing `fixed_drive` values and six multi-offense envelopes: `2015_01_IND_BUF/6`, `2016_15_CLE_BUF/4`, `2018_01_TEN_MIA/13`, `2018_09_CHI_BUF/21`, `2019_02_TB_CAR/2`, and `2023_12_PIT_CIN/8`. These are fixed real-data fixtures. A source refresh that changes them must produce a target-diff report rather than silently changing history.

Qualifying event types are pass, run, quarterback kneel, quarterback spike, punt, and field-goal attempt. A live aborted snap also qualifies when it has a possession team and is not a no-play, kick, try, or conversion. Extra-point and two-point tries never qualify.

The treatments are frozen:

| Event | Primary target treatment |
|---|---|
| Kickoff or touchback | Does not create an offensive series by itself. The receiving offense counts only if a qualifying event follows. |
| Punt | Qualifying offensive event and a series-ending event. A return does not create an offensive series for the return team. |
| Field-goal attempt or block | Qualifying event, including a first-play attempt. |
| Offensive turnover | Counts the series for the offense that controlled the qualifying play. |
| Defensive or special-teams score | Does not create a series for the scoring team. |
| Safety | Counts the offense's series when it occurs on a qualifying event. |
| Onside kick | The kick does not count. The recovering team's later offense counts only after a qualifying event. |
| Kneel-only terminal series | Counts in the primary target and receives an audit flag. An exclusion sensitivity cannot select a model. |
| Penalty-only or no-play record | Cannot create a series. A live play retaining a qualifying source type still counts. |
| Aborted live play | Counts unless nullified or recorded as a try or special-teams event. |
| Halftime or regulation expiration | Counts when at least one qualifying regulation event exists. |
| Overtime | Reconstructed and stored separately. It never enters the regulation target. |

Overtime occurrence and home and away overtime series counts are secondary labels. No candidate predicts them in this module. Changing overtime rows must leave every regulation target and forecast byte-identical.

Probability scoring uses exact count support 0 through 24 plus a 25-or-more tail bucket. Rounding precedes support clipping. Uncensored counts remain in the forecast ledger for MAE and RMSE. Zero through 63 are valid reconstructed counts. The observed 2010 through 2025 range of 4 through 22 is an audit expectation, not an exclusion. A later value outside 4 through 22 produces a target-diff warning. A negative value or a value of 64 or more aborts as a source-integrity failure.

The synthetic suite contains one named assertion for every treatment in the table. It separately tests kickoff and touchback, punt, blocked field goal, offensive turnover, defensive or return score, safety, onside kick alone and followed by offense, kneel-only series, penalty-only and live-penalty records, live and nullified aborted plays, halftime and regulation expiration, overtime separation, and a two-offense corrected drive. The expected counts and offense identities are part of the machine-readable contract. A missing fixture or changed expectation makes the protocol invalid before model scoring.

## Source and missing-data policy

The experiment reads the content-addressed nflverse schedule and play-by-play objects already retained by Module 1. It opens that cache read-only and creates Module 2 hashes and manifests separately. The data frame boundary is a positive allowlist. Sportsbook, selection, Module 1, EPA, success, win-probability, and points-per-drive fields are never materialized.

`score_differential` may be read only to select historical situation-neutral plays. Its value is not aggregated into a candidate feature. Final scores and scoring outcomes are absent from the model matrix.

An expected game or team missing from play-by-play aborts the origin. A schema mismatch or partial source aborts the run. Low team exposure receives the frozen league prior. A derived rate with no denominator receives the training-fold league value and a missing indicator. No expected evaluation row may be dropped or assigned an artificial loss. Failure by a base candidate, ablation, or negative control to produce a PMF for any expected development or 2025 game makes the run `protocol_invalid`.

Unexpected source missingness is computed before fills or feature derivation, separately for each source object, season, field, and frozen eligibility stratum. Missing means null, NaN, a blank required string, a nonfinite required number, or a frozen out-of-domain value. Rates are never pooled across fields or seasons. The general rule aborts when `missing_count / eligible_count > 0.01`. Schedule identity and context, play-by-play identity, timing and teams, qualifying possession and fixed-drive keys, and the raw-drive key inside repaired envelopes have stricter zero-tolerance rules. The neutral-interval stratum is defined before consulting its clocks or score: current rows in consecutive scrimmage pairs inside one corrected regulation series with the current quarter in 1 through 3. Its four audited inputs are current and following game seconds, current half seconds, and current score differential. The run stores each numerator, denominator, rate, threshold, pass state, example identifiers, and a ledger hash.

Nullable binary flags whose documented null means false, optional audit labels, provider drive duration missingness or repair withholding, derived zero-denominator indicators, and the intentionally absent 2010 origin are structural missingness rather than partial-source evidence. They are reported but excluded from the 1 percent gate. Every model input in every 2011 through 2025 forecastable origin must still be finite. Every source object remains content-addressed, so any changed source ledger forces a new source revision and target-difference review before scoring.

All historical forecasts are labeled retrospective reconstructions. Season and week labels establish chronology, but they do not recreate original file publication times.

## Forecast origin and rolling folds

Every game in Week W receives one forecast at Tuesday 7:30 a.m. Pacific. Eligible rows are

```text
T_o = {r : season_r < S or (season_r = S and week_r < W)}.
```

No earlier Week W game can update another Week W forecast. A prior game dated on the origin's local calendar date is excluded because a date-only source cannot prove completion by 7:30 a.m.

The periods are:

- 2010: prehistory target and training rows only. No older-season prior exists, so no 2010 forecast is fabricated.
- 2011 through 2012: forecast and residual warmup
- 2013 through 2024: development
- 2025: retrospective confirmation, not untouched validation
- 2026: prospective shadow storage only if a candidate passes every frozen gate

No random split is permitted. Every imputation value, prior, decay weight, scale, coefficient, residual pair, calibration calculation, and covariance estimate is fit inside its origin.

P0 and P1 may use every prior target row, including 2010, once they have the required history. P2 may train only on prior rows that already have finite stored prequential P0 and P1 means and finite origin features. This excludes the fixed 2010 prehistory rows from P2 regression before any result is known. It is not a forecast failure. Every candidate, ablation, and control must score every 2013 through 2025 game. Any later omission makes the protocol invalid.

The runner applies both halves of the frozen availability rule before every fit: the row must be from an earlier labeled NFL week and its game date must be before the shared Tuesday origin. A postponed game carrying an earlier week label is unavailable until it has been played. For P2 design construction only, missing-indicator fields on fixed 2010 prehistory rows are replaced by zero in an ephemeral copy so validation can run. Their prequential P0 and P1 fields remain nonfinite, the shared eligibility mask excludes them, and the unmodified rows remain available to the P0 and P1 subfits.

## Allowed feature modules

Only five lagged football modules and home context are allowed:

1. Regulation offensive-series counts and opponent series faced.
2. Situation-neutral seconds per scrimmage play. Neutral rows are in quarters 1 through 3, outside the final two minutes of a half, and within eight points before the play.
3. Scrimmage plays per regulation series.
4. Regulation series duration.
5. Incompletion or out-of-bounds clock-stop rate.
6. Home versus neutral-site context.

Team profiles use the latest 17 eligible team-games in `(season, week, game_date, game_id)` order. Selection occurs before weighting. Every historical weight is calculated in float64 as `2^(-(origin_season-row_season)/2.5)` and then multiplied by 0.5 for 2020 or 1 otherwise. Every same-season row therefore has weight 1. No within-season fractional decay or pre-aggregation rounding is allowed.

The raw numerators and denominators are fixed:

- Possession rate is regulation offensive series divided by games. The opponent value is opponent regulation series faced divided by games.
- A scrimmage event is a qualifying live event other than a punt or field goal. Neutral pace sums the nonnegative difference in `game_seconds_remaining` from the current scrimmage event to the next scrimmage event in the same corrected series. The current event must be in quarters 1 through 3, have at least 121 half-seconds remaining, and have absolute pre-play score differential at most 8. The denominator is the number of valid intervals.
- Play volume is scrimmage events divided by regulation series.
- Duration uses `drive_time_of_possession` only when an unrepaired series has exactly one finite, nonnegative parsed value. A corrected multi-offense segment has missing duration because the unsplit provider duration may not be reused. The denominator is the number of series with a valid duration.
- Clock-stop rate counts scrimmage events with `incomplete_pass=1` or `out_of_bounds=1` and divides by scrimmage events.

For each ratio, the league prior uses all origin-eligible team-game rows. A team or opponent ratio is `(weighted numerator + a L)/(weighted denominator + a)`, where `a` is 4 games, 250 plays, or 32 series according to the denominator. A missing indicator equals one only when the selected team or opponent history has zero weighted denominator before the prior is added. The value then equals the fold league prior. A nonfinite league prior aborts the origin. Each missing indicator travels with its feature and is removed with that feature in an ablation.

Points, scoring outcomes, drive results, target-game plays, target-week player data, Module 1 output, EPA, success rate, market data, public betting, and recorded selections are forbidden predictors. The points-per-drive sensitivity is disabled.

## Candidates and equations

### P0, league and season naive

At origin `(S, W)`, P0 first estimates historical home and away means from eligible nonneutral games before season S with the frozen season weights. Call them `H_prior` and `A_prior`. Current-season nonneutral games through W-1 receive their configured season multiplier and no target-week row. Neutral schedule labels never estimate the location split. With prior strength 64 games,

```text
mu_home = (sum_current(w N_home) + 64 H_prior) / (sum_current(w) + 64)
mu_away = (sum_current(w N_away) + 64 A_prior) / (sum_current(w) + 64).
```

If no current-season game exists, P0 equals the two historical prior means. For a neutral-site target, both means equal `(mu_home + mu_away) / 2`. The no-time-decay ablation replaces historical exponential decay with 1 but retains the configured 2020 multiplier.

P0 is the primary benchmark. It has no team identity or team profile.

### P1, partially pooled team and opponent rates

For offense i against opponent j,

```text
Off_i = (sum(w N_i) + 4 L) / (sum(w games_i) + 4)
Def_j = (sum(w N_opponents_vs_j) + 4 L) / (sum(w games_j) + 4)
mu_i  = 0.5 (Off_i + Def_j) + signed_home_adjustment.
```

Only the latest 17 eligible games for each team contribute to `Off_i` and `Def_j`. `L` uses every eligible team-game row. The signed adjustment is `H = (weighted nonneutral home mean - weighted nonneutral away mean) / 2`. The home prediction adds H and the away prediction subtracts H. Neutral games receive zero adjustment. Predictions are clipped to 4 through 20 possessions. P1 removal tests are offense rate only, which predicts `Off_i` plus signed H, opponent-allowed rate only, which predicts `Def_j` plus signed H, no home context, which sets H to zero, and no time decay, which sets exponential weights to one but retains the 2020 multiplier.

### P2, regularized joint-count challenger

P2 predicts both count means from one ordered game design. After the intercept, the first columns are P1 home mean and P1 away mean. Next, in order, are situation-neutral pace, play volume, duration, and clock-stop groups. For each base profile feature in config order, four columns enter: the home-away average, home minus away, the average of the corresponding two missing indicators, and home missing minus away missing. The neutral-site indicator is last. Possession-rate profiles enter only through the two P1 means.

For outcome matrix `Y = [N_home, N_away]`, offset matrix `M0` from P0, design `X`, diagonal training weights `W`, and penalty `lambda = 32`,

```text
B_hat = (X' W X + lambda I)^(-1) X' W (Y - M0)
M_hat = clip(M0 + X B_hat, 4, 20).
```

The response for every historical training row is its count pair minus the P0 means that were forecast at that row's own prior Tuesday origin. Recomputing those offsets from a later fold is forbidden. Each nonintercept design column is imputed by its weighted training-fold mean, centered by that mean, and divided by its weighted population standard deviation. A scale below `1e-6` becomes 1. The target frame reuses that artifact. The intercept is unpenalized and every other coefficient receives ridge penalty 32. The solve uses the linear system directly rather than a matrix inverse. P2 is a joint count model because its output is a paired discrete distribution. It does not claim independent counts merely because it estimates two conditional means.

P2's no-possession ablation removes the two P1 design columns but retains the league P0 offset. Its no-home-context ablation removes only the explicit neutral-site design column. P0 and P1 keep their baseline location adjustments in that P2 ablation. Its no-time-decay ablation uses no-decay prequential P0 and P1 columns, no-decay profiles, no-decay fit weights, and no-decay residual weights while retaining the 2020 multiplier.

The complexity order is P0, P1, P2. P1 must beat P0. P2 must beat both P0 and P1, whether or not P1 passes its own gate. This removes a data-dependent choice of the easier comparator. Selection is P2 if P2 passes every gate, otherwise P1 if P1 passes every gate, otherwise `reject_all`. An unstable P2-minus-P1 gain already fails P2 and therefore defaults to P1 when P1 passes.

## Joint probability construction

All three candidates use the same prespecified distribution mechanism so that candidate comparisons do not reward one model for a different smoothing recipe.

Each candidate maintains its own prior pregame forecast ledger. After an entire weekly block is graded, the paired residuals become eligible for later origins:

```text
r_q,c = (N_home,q - mu_home,q,c, N_away,q - mu_away,q,c).
```

The library requires 128 prior games and has a 384-game cap. It walks backward over complete prior week blocks and adds a block only if the total remains at or below 384, then restores `(season, week, game_id)` order. It never cuts an oldest boundary week. No in-sample residual enters it. Each retained residual receives the same integer-season decay and 2020 multiplier as model rows. The home and away local offsets `{-1, 0, 1}` have weights `{0.15, 0.70, 0.15}` and combine by tensor product. For current means `mu_c`, mass is placed at

```text
round(mu_home,c + r_home,q + delta_home),
round(mu_away,c + r_away,q + delta_away).
```

Rounding is half away from zero. Values below zero map to zero, 0 through 24 remain exact, and 25 or more map to tail cell 25. Weighted kernel mass is aggregated first. Each of 676 cells then receives 0.0001, the `1e-12` floor is applied, and the matrix is normalized once. Paired residuals preserve observed dependence. The small local offsets smooth the grid.

A nonselecting diagnostic factorizes each fitted joint PMF into its two marginals. That comparison tests whether the observed home-away dependence matters. It cannot become a candidate after results are known.

## Losses and calibration

The primary loss is joint negative log score:

```text
L_log = -log P(N_home, N_away).
```

Required secondary results are multivariate energy score, marginal and derived CRPS, count MAE and RMSE, 50, 80, and 95 percent interval coverage and width, joint 80 percent highest-density coverage and set size, randomized discrete PIT for each side, total, and difference, predicted and observed covariance, mean calibration intercept and slope, runtime, failures, and numerical bound hits.

Energy score uses 2,048 deterministic paired draws shared across candidates. CRPS is computed from exact marginal or derived count CDFs. Every point error uses the PMF marginal expectation, not the structural location before residual correction. Marginal intervals are central equal-tailed intervals. Quantiles are the first support value whose CDF reaches the bound, and coverage includes both endpoints. Home, away, total, and difference are never pooled for coverage. The joint 80 percent set includes every cell tied at the probability threshold that first reaches 0.80.

Randomized PIT is `F(y-) + u P(y)`. The fixed uniform uses only seed, game ID, and target label, so the same game-target uniform is shared by all candidates. Decile counts and empirical CDF values at 0.1 through 0.9 are diagnostics. Mean calibration is ordinary least squares of observed count on an intercept and PMF expectation, separately by side. PIT and mean calibration have no separate pass threshold. The coverage gate is the frozen calibration threshold. Unconditional predicted covariance is the mean within-game PMF covariance plus the population covariance of PMF means. Observed covariance is the population covariance of the count pairs.

## Paired uncertainty

Primary inference uses 10,000 fixed-seed hierarchical paired bootstrap replicates. The canonical manifest is ordered by season, week, and game ID. Each replicate draws 12 development-season labels with replacement. For each sampled occurrence with `n` observed weeks, it draws `ceil(n/L)` start positions uniformly from zero through `n-L`, appends the corresponding contiguous positions from that season's sorted week list, truncates to exactly `n` weeks, and appends every selected game's row in game-ID order. Repeated season, week, and game occurrences remain repeated. One immutable index ledger is built for each development block length 1, 3, and 6. The same development three-week ledger is used for primary comparisons, both ablation families, and negative controls. Development coverage and covariance use its first 5,000 members. The 2025 confirmation coverage and covariance report uses a separate 5,000-member three-week ledger shared across candidates.

The generator is NumPy `Generator(PCG64(seed64))`. For period and block length `L`, `seed64` is the big-endian integer represented by the first eight bytes of SHA-256 over the literal UTF-8 string `module2.v7|bootstrap|base=20260824|period=<period>|L=<L>`. Period is `development` or `confirmation_2025`. Integer draws are zero-inclusive and upper-bound-exclusive. Each ledger stores its canonical seed string, integer seed, ordered-manifest hash, and exact little-endian int64 byte hash. No candidate, comparison, or family name enters a seed.

Improvement is simpler loss minus candidate loss, so positive is better. The primary simultaneous family is P1 minus P0, P2 minus P0, and P2 minus P1. Its 90 percent interval is the observed delta plus or minus the 0.90 quantile of the maximum absolute centered bootstrap deviation over all three comparisons. P1 ablations form a separate four-comparison simultaneous family. P2 ablations form a separate seven-comparison family. The two P2 negative controls form a separate family. No result is moved between families. All quantiles use Hyndman-Fan type 7, NumPy `method="linear"`, on finite float64 draws without prior rounding. With ordered draws `x`, `h=(B-1)q`, `j=floor(h)`, and `gamma=h-j`, the quantile is `(1-gamma)x[j] + gamma x[min(j+1,B-1)]`. Scientific array hashes include dtype, shape, and exact little-endian bytes.

Block lengths one and six are sensitivity checks. Every required primary comparison must have a simultaneous lower bound above zero at lengths one, three, and six. Season-level deltas are game-weighted means. A leave-one-season-out delta is the game-weighted paired mean after excluding exactly one development season. Coverage and covariance use 5,000 replicates from the same three-week clustered construction and 95 percent percentile intervals.

## Pre-replay freeze and failure path

The replay has two separate commands. The prepare command runs source, schema, target-definition, and synthetic checks in a clean Module 2 output directory without fitting a candidate or constructing a candidate PMF. It writes one immutable pre-replay manifest. The scored command refuses to proceed without that manifest and never rewrites it.

The manifest records the literal protocol version, byte hashes for config, protocol, runner, data, and model code, the dependency and runtime fingerprint, the frozen source-object URL/hash/byte ledger, data, feature-schema, and target-schema hashes, the exact randomization and quantile contract, and the ordered candidate/spec list. Preparation refuses any directory containing a forecast, metric, scorecard, uncertainty, audit, result, or artifact-hash output. Before target join or candidate fit, the scored command recomputes and verifies the file and source hashes. After building the source products, it verifies the data and schema hashes. An independently anchored test asserts the exact manifest digest.

Any pre-score source, schema, self-test, hash, common-manifest, or candidate-origin failure produces a terminal `protocol_invalid` audit. It preserves the failure and draws no conclusion about candidate quality. Its only next decision is to repair the implementation or data definition and run a newly frozen protocol. `reject_all` is reserved for a valid replay in which no challenger passes.

Wall-clock timestamps, measured runtime, and gzip header time are operational metadata, not inputs to forecast or scientific hashes. Canonical scientific payloads exclude them. Gzip outputs use timestamp zero. A repeatability run uses another output directory, names the original manifest digest, and compares deterministic scientific hashes.

## Falsification and gates

Each challenger must clear every gate:

- Development joint-log improvement over every required simpler comparator of at least 1 percent and 0.01 nat.
- Simultaneous 90 percent lower bound above zero at block lengths one, three, and six.
- Improvement in at least 8 of 12 development seasons.
- Positive every leave-one-development-season-out estimate.
- Positive 2025 retrospective point estimate against every required simpler comparator.
- Energy and each CRPS regression no greater than 0.5 percent against every required simpler comparator.
- Home and away MAE regression no greater than 0.05 possessions against every required simpler comparator.
- Home and away 80 percent coverage each between 0.72 and 0.88, with each clustered interval containing 0.80.
- Home and away mean 80 percent width each no more than 10 percent wider than every required simpler comparator.
- Covariance absolute error no more than 0.10 worse than every required simpler comparator.
- Forecast failure rate exactly zero with no favorable row deletion or loss substitution.
- Complete common manifest and passing leakage, invariance, source, and synthetic tests.

P1 removal ablations are offense rate only, opponent-allowed rate only, no home context, and no time decay. P2 removals cover possession rate, neutral pace, play volume, duration, clock stop, home context, and time decay. If any removal improves its full candidate with its family's simultaneous lower bound above zero, the full candidate is falsified. It is not repaired after the result.

Negative controls inject future and same-week rows, mutate earlier same-week games, mutate overtime, bijectively renumber fixed drives, add kick-only and penalty-only records, mutate unused schedule scores, add deterministic noise, shuffle team identity within season-week, truncate a source, and repeat fixed-seed distributions. One deterministic noise replicate and one shuffle replicate are fixed before scoring. Noise uses home and away standard-normal values from a SHA-256-derived PCG64 seed and enters P2 as average and difference. Shuffle permutes complete home and away profile vectors across games within season-week while teams, targets, and P0 and P1 means remain fixed. Seed tuples are `[20260824, game_id_string, side_string]` for noise and `[20260824, season_integer, week_integer, frame_role_string]` for shuffle. Each tuple is encoded as canonical UTF-8 JSON with sorted keys and comma-colon separators. The first 16 SHA-256 hex digits become an integer modulo `2^63-1` for NumPy `default_rng` PCG64. No undeclared namespace enters either tuple. If either control stably improves P2 under their simultaneous family, P2 is falsified. Structural controls must fail or remain invariant exactly as preregistered.

The only terminal results are `reject_all`, `shadow_eligible`, or `protocol_invalid`. A retrospective pass grants 2026 shadow eligibility. It cannot change production, create confidence, trigger a market comparison, or begin the drive-outcome module.

## Exact next decision

Run the frozen target reconstruction and edge-case suite. If the definition survives, run P0, P1, and P2 once on the common chronological manifest. If no candidate clears every gate, retain no possession model and decide whether to redesign the possession target or stop this decomposition before Module 3.
