# Model Laboratory Module 2 Result

## Decision

**`reject_all`**

Neither challenger passed the frozen promotion gate. No possession-count model is eligible for prospective shadow storage. P0 remains a research benchmark only. Nothing in this experiment changed Module 1, the interface, production forecasts, or deployment. No market input or Module 1 output entered the experiment. No confidence value was produced.

This is a valid rejection of the tested candidates, not proof that team and opponent possession signal is absent. P1 improved several marginal scores but failed the primary joint probability test, stability tests, confirmation test, and interval-calibration gate. P2 was worse than both simpler comparators on the primary loss.

## Protocol history

The v7 replay stopped as `protocol_invalid` before any aggregate scorecard or gate decision. It exposed two target-independent execution defects. P2 checked intentional 2010 prehistory null indicators before excluding prehistory, and the runner omitted the frozen game-date cutoff for postponed earlier-week games. The invalid v7 output remains preserved with manifest SHA-256 `194864b038235c1ad933a58dca6c0bb03ed5bc9b8fadfc94534c46d2a269cf3b`.

Protocol v8 changed only those two execution paths and added boundary tests. It did not change a target, feature, candidate, coefficient, loss, seed, ablation, uncertainty rule, or gate. Two independent pre-replay reviews found no scientific-contract drift. The v8 replay then completed under manifest SHA-256 `eecd6bfd47f648159770356ddac7357911ea879971fc3c41e4fe3df720efab9c`.

## Data and target

The source was the content-addressed nflverse schedule and play-by-play cache for 2010 through 2025. nflfastR's [field descriptions](https://nflfastr.com/articles/field_descriptions.html) define the source fields, and its [change record](https://nflfastr.com/news/index.html) documents drive-field corrections that support explicit reconstruction checks.

The replay verified all 17 cached source objects before use. It matched 4,175 completed regular-season games across 737,117 play-by-play rows and reconstructed 93,533 regulation offensive series. It stored 641 overtime series separately. The final primary-target range was 6 through 18 possessions per team. The source reconstruction found 2,915 kneel-only regulation series, six corrected multi-offense fixed-drive envelopes, and 205 missing series durations. Twelve of those durations were deliberately withheld from repaired segments rather than reusing an unsplit provider duration.

The primary target for game `g` was

```text
Y_g = (N_home,reg,g, N_away,reg,g)
```

An offensive series required at least one qualifying live pass, run, kneel, spike, punt, field-goal attempt, or qualifying aborted snap. Kickoffs, returns, tries, penalty-only records, and no-plays could not create a series by themselves. A punt or field-goal attempt counted for the offense that took the snap. Defensive and special-teams scores did not create a series for the scoring team. Kneel-only terminal series counted and carried an audit flag. Overtime occurrence and home and away overtime series were separate labels and never entered the regulation target.

The fixed synthetic suite tested every specified edge case, including touchbacks, blocked field goals, turnovers, safeties, onside kicks, penalty-only records, aborted plays, halftime endings, regulation endings, overtime separation, and multi-offense drive repair. Every test passed.

## Forecast chronology and missing-data policy

Each game in Week W received one retrospective forecast from Tuesday at 7:30 a.m. Pacific. Training rows had to come from an earlier season or earlier labeled week and have a game date before that Tuesday origin. Games within the same week could not update one another. The replay used 260 weekly origins.

The periods were:

- 2010 as prehistory only
- 2011 and 2012 as forecast and residual warmup
- 2013 through 2024 as development, with 3,135 games
- 2025 as retrospective confirmation, with 272 games

Every transform was fit inside its origin. A rate with no denominator received that fold's league prior and a paired missing indicator. An absent game, partial source, schema failure, unexpected missingness above its frozen threshold, nonfinite model input, or missing scored row would have made the protocol invalid. The historical forecasts remain labeled `reconstructed_not_original_publication_time` because current content-addressed files do not recreate their original release timestamps.

## Allowed inputs

The five lagged football groups were regulation series rates, situation-neutral seconds per scrimmage play, scrimmage plays per series, series duration, and incompletion or out-of-bounds clock-stop rate. Home or neutral-site context was also allowed. Team profiles selected the latest 17 eligible team games before weighting. The time weight was

```text
w_r = 2^(-(origin_season - row_season) / 2.5)
```

The 2020 multiplier was 0.5. Points, drive outcomes, scoring results, EPA, success rate, markets, public betting, recorded selections, and Module 1 outputs were absent from candidate matrices.

## Candidates and equations

P0 was a league and season home-away baseline with a 64-game historical prior. For a nonneutral target:

```text
mu_home = (sum_current(w N_home) + 64 H_prior) / (sum_current(w) + 64)
mu_away = (sum_current(w N_away) + 64 A_prior) / (sum_current(w) + 64)
```

P1 partially pooled each team's latest-17 offensive possession rate with its opponent's possession rate allowed:

```text
Off_i = (sum(w N_i) + 4 L) / (sum(w games_i) + 4)
Def_j = (sum(w N_opponents_vs_j) + 4 L) / (sum(w games_j) + 4)
mu_i = 0.5 (Off_i + Def_j) + signed_home_adjustment
```

P2 was a two-output ridge regression around the prequential P0 offset. It included P1 means and fold-scaled average and difference features for pace, play volume, duration, clock stops, missingness, and neutral context:

```text
B_hat = solve(X' W X + lambda I, X' W (Y - M0))
M_hat = clip(M0 + X B_hat, 4, 20)
lambda = 32
```

Each candidate converted its two means to one paired count distribution with its own leakage-safe residual library. The library retained complete prior weekly blocks, required 128 games, capped history at 384 games, and preserved empirical home-away dependence. A fixed local offset kernel with weights 0.15, 0.70, and 0.15 smoothed each side. Probability support was 0 through 24 plus a 25-or-more tail cell.

## Rolling-origin scorecard

Lower is better for every loss in this table.

| Candidate | Joint NLL | Energy | Home CRPS | Away CRPS | Total CRPS | Difference CRPS | Home MAE | Away MAE | Home RMSE | Away RMSE | 2025 joint NLL |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| P0 league-season naive | 3.309853 | 1.368089 | 0.906611 | 0.910725 | 1.754489 | 0.525403 | 1.307814 | 1.308667 | 1.634607 | 1.650043 | 3.172120 |
| P1 partially pooled rates | 3.307650 | 1.342889 | 0.888261 | 0.891426 | 1.713510 | 0.531489 | 1.279839 | 1.276558 | 1.600472 | 1.616043 | 3.179771 |
| P2 regularized joint count | 3.315857 | 1.356303 | 0.896402 | 0.901176 | 1.731316 | 0.533967 | 1.288860 | 1.287217 | 1.615613 | 1.633473 | 3.192666 |

P1 reduced development joint NLL by 0.002203 nat, or 0.0666 percent, against P0. The frozen gate required at least 0.01 nat and 1 percent. P1 improved only 6 of 12 seasons, had a negative leave-one-season-out estimate when 2016 was excluded, and lost 0.007650 nat to P0 in 2025 confirmation. P1 also worsened difference CRPS by 0.006086.

P2 increased joint NLL by 0.006004 nat against P0 and by 0.008207 nat against P1. It improved only 6 of 12 seasons against P0 and 3 of 12 against P1. Its 2025 deficits were 0.020546 nat against P0 and 0.012895 nat against P1.

Mean runtime per scored development game was 0.00170 seconds for P0, 0.02285 for P1, and 0.02442 for P2. Each base candidate had a zero forecast-failure rate and zero numerical-bound-hit rate.

## Calibration and joint dependence

| Candidate | Home 80% coverage | Away 80% coverage | Home slope | Away slope | Predicted covariance | Observed covariance | Covariance absolute error |
|---|---:|---:|---:|---:|---:|---:|---:|
| P0 | 0.9088 | 0.9062 | 0.9424 | 0.9610 | 2.3459 | 2.3415 | 0.0044 |
| P1 | 0.9091 | 0.9033 | 0.9937 | 1.0059 | 2.3473 | 2.3415 | 0.0058 |
| P2 | 0.9033 | 0.9030 | 0.7772 | 0.7707 | 2.4835 | 2.3415 | 0.1420 |

All candidates overcovered their nominal 80 percent marginal intervals. P1's clustered home interval was 0.8968 to 0.9232 and its away interval was 0.8900 to 0.9153. P2's intervals were 0.8893 to 0.9185 and 0.8890 to 0.9185. None contained the required 0.80, and all point estimates were above the frozen 0.72 to 0.88 gate.

P1's development mean-calibration slopes were close to one, so its failed probability calibration should not be read as a mean-calibration failure. P2's slopes near 0.77 and its covariance error show excess variation in its fitted means and dependence.

The paired joint PMF beat the nonselecting factorized diagnostic by 0.5191 NLL for P0, 0.4847 for P1, and 0.4965 for P2. Home and away counts should not be treated as independent. This validates the need for a joint distribution layer, not a challenger mean model.

## Paired uncertainty

The primary uncertainty analysis used 10,000 hierarchical paired bootstrap members with development season resampling and week blocks of 1, 3, and 6. All three candidate comparisons shared each block ledger. The reported intervals are 90 percent simultaneous family intervals. Positive improvement favors the more complex candidate.

| Comparison | Mean NLL improvement | L1 interval | L3 interval | L6 interval | Improved seasons | 2025 improvement |
|---|---:|---:|---:|---:|---:|---:|
| P1 minus P0 | 0.002203 | [-0.011622, 0.016027] | [-0.011748, 0.016153] | [-0.012422, 0.016827] | 6 of 12 | -0.007650 |
| P2 minus P0 | -0.006004 | [-0.019829, 0.007820] | [-0.019955, 0.007946] | [-0.020629, 0.008620] | 6 of 12 | -0.020546 |
| P2 minus P1 | -0.008207 | [-0.022032, 0.005618] | [-0.022157, 0.005743] | [-0.022831, 0.006417] | 3 of 12 | -0.012895 |

P1's bootstrap probability of improving on P0 fell from 0.6302 at one-week blocks to 0.5636 at six-week blocks. P2's probabilities stayed below 0.21 against P0 and below 0.11 against P1. No simultaneous lower bound was positive.

## Ablations and falsification

P1's offense-only and opponent-allowed-only removals were each worse than full P1 by about 0.134 to 0.135 nat, with simultaneous intervals wholly below zero. This supports pooling both sides of the matchup inside P1. Removing home context or time decay did not produce a stable improvement.

No P2 removal stably beat full P2. Removing the clock-stop group improved mean joint NLL by 0.004887 nat in 9 of 12 seasons, but its simultaneous interval was -0.002784 to 0.012558. The result is exploratory evidence against that feature group, not a post-run license to repair P2. Removing pace, play volume, duration, possession-rate inputs, home context, or time decay also had intervals spanning zero.

The deterministic-noise control lost 0.003616 nat to P2, with interval -0.012176 to 0.004945. The shuffled-team control lost 0.001906 nat, with interval -0.010466 to 0.006655. Neither control stably improved. Same-week mutations, future-week rows, overtime mutations, fixed-drive renumbering, kick-only records, penalty-only records, unused schedule scores, and truncated sources all failed or remained invariant in the preregistered direction.

## Failure cases

There were no execution failures, missing common-manifest games, or silent loss substitutions. The main predictive failures were tail games:

- `2022_15_IND_MIN` ended with regulation possession counts 17 and 15. Candidate means were about 10.7 to 10.9, and each joint NLL was 15.019.
- `2017_06_DET_NO` ended 16 and 17. Candidate means were about 10.5 to 11.3, and each NLL was 14.910.
- `2023_01_LV_DEN` ended 6 and 7. Candidate means were about 10.7 to 10.9, and each NLL was 14.797.

The equal extreme losses show that the shared support floor and smoothing recipe dominated these tails. The experiment cannot use this observation to change the frozen replay. A later distribution study must preregister its tail treatment.

## Adversarial statistical audit

**Claim under attack:** lagged football pace and possession profiles improve a calibrated joint pregame possession distribution beyond a league-season baseline.

The claim did not survive. P1 showed small marginal and point-forecast gains, but its primary NLL gain was too small, uncertain, season-unstable, and reversed in confirmation. P2 lost on primary NLL, confirmation, difference CRPS, and covariance fidelity.

One post-run mechanism deserves a new test. The fixed offset kernel has per-side variance

```text
0.15(-1)^2 + 0.70(0)^2 + 0.15(1)^2 = 0.30
```

Because the home and away kernel offsets are independent, it adds 0.60 variance to both total and difference. For P0 development forecasts, predicted variance exceeded observed variance by 0.6782 for total possessions and 0.6605 for possession difference. Those two excesses are close to the kernel's mechanical 0.60 addition. This offers a direct explanation for near-90-percent coverage of nominal 80 percent intervals. It was diagnosed after the replay, so it is a hypothesis for a new frozen experiment, not a confirmed adjustment.

Bias self-audit:

- Selection bias was controlled by one common 3,407-game scored manifest for all 16 specifications.
- Look-ahead bias checks passed for same-week isolation, whole-week residual updates, Tuesday origins, and postponed games.
- Researcher freedom was limited by the append-only manifest, exact seeds, frozen feature order, and frozen gates.
- Confirmation is retrospective reconstruction, not an archived live forecast. It cannot substitute for prospective evidence.
- Only 12 development-season clusters inform the season-level stability claim, which limits precision even though one-, three-, and six-week block results agree.
- No independent manual sample has yet reconciled reconstructed targets against official gamebooks.
- The kernel explanation is post-run and must not be used to relabel P1 as passing.
- P1's favorable marginal metrics are reported beside its failed primary and stability tests.

Kill decision: kill P2's current feature stack. Reject P1 for promotion. Retain P0 only as a benchmark. Retain the finding that joint dependence matters as a design constraint.

## Leakage and integrity audit

- Protocol validity was true, with zero run failures and zero evaluation failures.
- All 16 specifications scored the same 3,407 evaluation games with zero missing, extra, or duplicate rows.
- The forecast ledger contains 62,704 rows. The metric ledger contains 70,429 rows.
- Market fields and Module 1 outputs were never materialized.
- Overtime did not enter the primary target. Forecast grades retained regulation counts, overtime occurrence, and both overtime counts as separate fields.
- Same-week residual isolation and the whole-week residual boundary passed.
- P0 and P1 baseline-builder alignment had maximum absolute error `7.105427357601002e-15` over 520 checks.
- Every artifact SHA-256 in the artifact manifest matches its current file.
- All 17 source objects match their frozen hashes and byte counts.

One reproducibility-hardening issue remains. The persisted metric JSONL converts in-memory DataFrame NaN values and numeric dtypes to JSON nulls and native numbers. Its file SHA-256 verifies, but its in-memory scientific hash cannot be reconstructed bit-for-bit from the persisted rows alone. Five other scientific component hashes recompute exactly. This does not change any score or decision, but a future runner should hash the canonical serialized metric rows or store a typed binary ledger.

## Artifact hashes

Scientific identity:

- Config: `ceb9cd5287fb2d2ecf4cbf0961d28e5b41f7b583282ff655cfe8d1a778686a3b`
- Protocol: `0332e69d604c727a0644d1521ba8b0494bd1f5fe9870388dcd28bf15255487b3`
- Code aggregate: `6ea88ae5a609ef4dac85aa28e4f39785b86c2a32d456c34bf220ae17ed23efd6`
- Source: `fd1f84f78153b9ea3967399a03a5c2c46b974d2a984944f88a4add76a9883149`
- Data: `4c7aecce5c767074f52e6e53cd619c42783350c54422ca9dc75d1106942eeacd`
- Feature schema: `570a62861dee2ccf2d27c3cb56850a4a39191e938ad295a31fe647267527833a`
- Target schema: `f97545c8f2fc2af131815bbd6b0a9b6fbb418e3b65bdf4eb9e31788ee72e5ed3`
- Freeze manifest: `eecd6bfd47f648159770356ddac7357911ea879971fc3c41e4fe3df720efab9c`

Persisted artifacts:

- Result report: `e1dafda157c115bb00adec32baae2bcbfd0d11539f1c297a7068e4ee39e0e52d`
- Audit: `517c23e499d73b6cf0cf1ca2d8cc4874c4e973c9bfd15f1f9107f9bf5a69ba54`
- Metric ledger: `55772218d88fe97ba1e6aa6b7a7602f116acaa8317508be6370ae38d13673f13`
- Paired uncertainty: `ded1acceb55b907ca144687e119be4f141f40c46b30c9f58aea5eef32ba4bff4`
- Retrospective forecasts: `66789eb97c70b813bc4574fd52aeaa5e3dc28717ea1658a4216782895dc6ee4c`
- Rolling-origin scorecard: `649881159109b344571add933c48725ed7731f3e102d60dca8d846e0f1b80846`
- Machine result: `58bc028eaf0d24c441829ae6de8abca57c06064bc4bbbdf7bcdeca730a7db2e3`
- Scientific-hash manifest: `30603524d0e11ef073cc92024210ad58baa03d67826902f8da3aba1412964bcd`

## Exact next modeling decision

Do not begin the drive-outcome module. Do not shadow P1 or P2. Freeze this `reject_all` result and retain P0 only as a research benchmark.

If possession work continues, the next experiment should be one preregistered Module 2B kernel falsification. Leave the target, Tuesday origin, data boundary, P0 and P1 equations, residual ledger, decay, support, pseudocount, losses, and leakage rules fixed. Exclude P2 and every new feature. Compare only the v8 tensor kernel with weights 0.15, 0.70, and 0.15 against a delta kernel with weights 0, 1, and 0. Change no other component.

The retrospective replay would be exploratory. Before the first prospective game, freeze the full-season paired inference and stop rules. The delta kernel must reduce the absolute possession-difference variance gap by at least 0.30 and move both marginal 80 percent coverages into 0.72 through 0.88, with clustered intervals containing 0.80. P1 with the delta kernel must then beat P0 with the delta kernel by at least 0.01 nat and 1 percent, with its paired lower bound above zero, no material energy or CRPS regression, and zero failures. If the mechanism test fails, kill this residual-kernel branch. If calibration improves but P1 still fails, retain P0 only and stop P1 development. A pass grants continued shadow evaluation only.
