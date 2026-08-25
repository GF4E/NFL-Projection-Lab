# Model Laboratory Module 1 result

## Decision

`reject_all`

No challenger qualifies for a prospective shadow season. Production was not changed. No market baseline was loaded or scored.

The rejection is a statistical result, not a protocol failure. The development and confirmation manifests are complete, the leakage audit passed, and no evaluated-period model origin failed.

## Data used

- nflverse schedules, play-by-play, and weekly roster snapshots for the 2010 through 2025 regular seasons
- 33 immutable source objects with recorded URLs, byte counts, capture times, and SHA-256 hashes
- 4,175 games and 8,350 team-game rows
- 32 point-in-time feature fields before the C0-only and sensitivity-only exclusions
- 2010 through 2012 for warm-up and prequential residual construction
- 3,135 development games from 2013 through 2024
- 272 retrospective confirmation games from 2025

The target is the paired final home and away score including overtime. The intended forecast origin is Tuesday at 7:30 a.m. Pacific. Week W uses only completed games through Week W-1. All games in a week share one information set.

Spreads, totals, moneylines, prices, line movement, recorded selections, approvals, and units are excluded at the positive read boundary and rejected again at the runner boundary.

## Candidate equations

The executable derivations and assumptions are recorded in [MODEL_LAB_MODULE_1.md](./MODEL_LAB_MODULE_1.md). In compact form:

- C0 predicts each team from the partially pooled average of its recent points scored and its opponent's recent points allowed, plus a signed league home adjustment.
- C1 fits a decay-weighted ridge score regression with fold-only imputation and scaling, team offense and defense indicators, corrected play-by-play rates, home status, and prior-week roster continuity.
- C2 fits the C1-style lagged-feature baseline without team indicators, then applies forward-filtered team offense and defense score states that update only after a complete week.
- C3 fits a decay-weighted penalized Poisson log-link mean with a league scoring offset, then estimates home and away negative-binomial dispersion from prior prequential residuals.

C0, C1, and C2 receive candidate-specific paired empirical residual distributions. C3 uses conditionally independent count marginals. Lower energy score is better.

## Rolling-origin scorecard

| Candidate | Development energy | Gain versus C0 | Simultaneous 90% interval | Seasons improved | 2025 energy | Decision |
|---|---:|---:|---:|---:|---:|---|
| C0 naive points | 8.4781 | reference | reference | reference | 8.4140 | retain as research baseline |
| C1 ridge offense-defense | 8.4616 | 0.19% | [-0.0894, 0.1224] points | 7 of 12 | 8.3589 | reject |
| C3 independent negative-binomial | 8.5357 | -0.68% | [-0.1635, 0.0482] points | 4 of 12 | 8.4049 | reject |
| C2 dynamic state-space | 8.7093 | -2.73% | [-0.3371, -0.1253] points | 0 of 12 | 8.5392 | reject |

C1 is the only close challenger. Its mean development improvement is 0.0165 energy points, below the preregistered 1% threshold. Its paired simultaneous interval includes material harm and benefit. It also misses the eight-season stability requirement.

C3 reduces development joint log score from 8.2127 to 7.4759, but it worsens the primary paired-score energy metric and three of four marginal or derived CRPS diagnostics beyond the frozen tolerance. The smoother count likelihood is useful evidence about distribution design. It is not evidence that the C3 team-score forecast is better overall.

The empirical residual distributions hit the configured `1e-12` joint-cell floor in 3.79% of C0 games, 4.14% of C1 games, and 4.70% of C2 games across 2013 through 2025. C3 never hits that floor because its count marginals have full support. This explains part of C3's joint-log advantage while leaving its energy-score loss intact.

C2 is worse than C0 in every development season. Its interval excludes zero on the harmful side.

## Calibration

| Candidate | Home mean slope | Away mean slope | Home-win slope | Home 80% coverage | Away 80% coverage |
|---|---:|---:|---:|---:|---:|
| C0 | 1.317 | 1.206 | 1.486 | 81.7% | 82.1% |
| C1 | 0.845 | 0.747 | 0.871 | 81.6% | 82.0% |
| C3 | 0.717 | 0.708 | 0.875 | 80.0% | 79.8% |
| C2 | 0.553 | 0.529 | 0.634 | 81.7% | 82.1% |

A slope of 1 is the calibration target. C1, C3, and especially C2 vary their predicted means too much relative to realized score differences. C0 varies its predicted means too little, but its full predictive variance is closer to observed score variance.

A post-run law-of-total-variance diagnostic, which was not used for selection, gives the following development-period totals:

| Candidate | Predicted home variance | Observed home variance | Predicted away variance | Observed away variance |
|---|---:|---:|---:|---:|
| C0 | 100.6 | 103.6 | 93.3 | 95.5 |
| C1 | 107.1 | 103.6 | 102.0 | 95.5 |
| C3 | 112.5 | 103.6 | 104.9 | 95.5 |
| C2 | 129.6 | 103.6 | 124.5 | 95.5 |

This supports the over-response diagnosis. It does not alter the frozen gate result.

## Ablations and falsification

- C1 has no removal ablation with a stable improvement. Removing time decay makes energy worse by 0.0487 points with a simultaneous interval of [-0.0913, -0.0061] under the report's full-minus-variant sign convention. Raw efficiency and team identity have favorable point estimates, but neither is stable.
- Adding upstream EPA and pass-rate-over-expectation to C1 improves the point estimate by 0.0130 energy points, but the interval [-0.0296, 0.0556] spans harm and benefit. It cannot be promoted from this result.
- C2 is directly falsified. Removing its dynamic team states improves energy by 0.2275 points with a simultaneous interval of [0.1406, 0.3145], and improves all 12 development seasons.
- C3 has no stable improving removal ablation. It still loses to C0 on the primary metric.
- No deterministic-noise or shuffled-identity negative control stably improves its corresponding full model.

## Failure cases and assumptions

- All 148 fit failures occur during the 2010 warm-up period before the 128-row minimum is available. There are no development or confirmation fit failures.
- Historical source availability is inferred from season and week labels. The current raw hashes do not prove what was published at each original Tuesday timestamp.
- The 2025 confirmation is retrospective because its outcomes existed before this contract was written.
- Quarterback availability, player roles, special teams, possessions, drive outcomes, clock state, and overtime mechanics are not explicit Module 1 predictors.
- Roster continuity is a prior-week identity-set comparison. It is not starter or snap-weighted availability.
- The residual-kernel and count-distribution choices are partly entangled with their mean-model families. Module 1 does not identify the best mean and best residual distribution independently.
- A descriptive post-run split finds C1 worse than C0 in Weeks 1 through 4 and better later. This split was not preregistered and cannot justify a conditional promotion or an in-place repair.

## Exact next decision

Freeze C0 as the market-free research baseline and freeze the rejection of C1, C2, and C3 under version `module1.2026-08-24.4`.

The next module should be a preregistered possession-count engine. It should predict each team's pregame possession opportunity independently of points per possession, compare naive pace and opponent baselines with a regularized challenger, and pass the same chronological, paired-uncertainty, calibration, ablation, and leakage gates before its output can enter a team-score model.

Do not tune Module 1 from favorable subgroups. Do not compare it with a market baseline yet. Do not change production.

## Reproducibility

- Configuration hash: `f7be0d1535cb39af91aa7ddc8887ca87307a57f03c3e37dd56781cf826b7eaae`
- Data hash: `51346cde4a86a60f660f32d99e1f9a6fd9097ef5905a8a36e8fab7cae545813d`
- Feature schema hash: `5f8dfc6009d8d9f51ac9b9c826abc77315e6b9a3fe95ac5b36507c40663c56cc`
- Code hash: `980c8257c43f69b06f95b4a2087919268919e69d392e68430f756335de047501`
- Scorecard: `artifacts/model-lab/module-one/scorecard.json`
- Retrospective forecast ledger: `artifacts/model-lab/module-one/forecasts.jsonl.gz`
- Artifact digest manifest: `artifacts/model-lab/module-one/artifact-manifest.json`
