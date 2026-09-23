# E-CAL-LINEAGE retained numerical evidence

HISTORICAL DEVELOPMENT — reused seasons; no independent confirmation or release approval.

REVIEW REQUESTED — maximum three explicit execution attempts; alternative: retries until the experiment deadline. This is an operational limit, not a statistical gate.

Control at admission: work/control.json; SHA-256 3fde812153a0a65da0a274bceec14591d261fd4486d3a67582c6a8b7f137c948; generated 2026-09-21T16:00:00Z; authoritative deployed lineage required by admission.

Registration: 51589b21fa9b11839dbef091b0acd541aebdf866727323503efcebf5eaace463; deadline 2026-09-29T13:00:00Z. Reports never refit.

## Retained attempts

| Attempt | Started | Disposition | Reason |
| --- | --- | --- | --- |
| 1 | 2026-09-23T17:38:09.290093+00:00 | COMPUTED_NOT_RELEASED | Numerical evidence only; release eligibility not assessed |

## Numerical gate evidence

NUMERICAL_CRITERIA_NOT_MET: COVERAGE_GATE, TEAM_CRPS_GATE

Relative team CRPS improvement: 0; required 0.01. Method activation: false; release eligibility: NOT_ASSESSED.

| Arm | Target | N | MAE | RMSE | Signed error | CRPS | Projected SD | Actual SD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| candidate | team | 6 | 3.2083333 | 3.4985116 | -0.29166667 | 2.3385417 | 0.375 | 3.6247605 |
| candidate | margin | 3 | 5.4166667 | 6.1424072 | -2.25 | 4.9583333 | 0 | 5.7154761 |
| candidate | total | 3 | 2.9166667 | 3.3509949 | -0.58333333 | 1.75 | 0 | 3.2998316 |
| control | team | 6 | 3.2083333 | 3.4985116 | -0.29166667 | 2.3385417 | 0.375 | 3.6247605 |
| control | margin | 3 | 5.4166667 | 6.1424072 | -2.25 | 4.9583333 | 0 | 5.7154761 |
| control | total | 3 | 2.9166667 | 3.3509949 | -0.58333333 | 1.75 | 0 | 3.2998316 |

## All coverage and interval-score checks

Candidate coverage must be within 0.03 of nominal at every target/level; interval score must not worsen at any target/level.

| Target | Nominal % | Control hits | Candidate hits | Control coverage | Candidate coverage | Control width | Candidate width | Control interval score | Candidate interval score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| team | 50 | 3/6 | 3/6 | 0.5 | 0.5 | 5.6666667 | 5.6666667 | 10.333333 | 10.333333 |
| team | 80 | 5/6 | 5/6 | 0.83333333 | 0.83333333 | 8 | 8 | 13 | 13 |
| margin | 50 | 2/3 | 2/3 | 0.66666667 | 0.66666667 | 7 | 7 | 16.333333 | 16.333333 |
| margin | 80 | 2/3 | 2/3 | 0.66666667 | 0.66666667 | 9.3333333 | 9.3333333 | 32.666667 | 32.666667 |
| total | 50 | 3/3 | 3/3 | 1 | 1 | 7 | 7 | 7 | 7 |
| total | 80 | 3/3 | 3/3 | 1 | 1 | 7 | 7 | 7 | 7 |

## By season

| Period | Arm | Games | Team MAE | Team CRPS | Margin MAE | Total MAE | Team bias | Projected SD | Actual SD | Winner Brier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2016 | candidate | 2 | 3.625 | 2.4375 | 5.75 | 3.5 | -0.875 | 0.375 | 4.0850337 | 0.25 |
| 2016 | control | 2 | 3.625 | 2.4375 | 5.75 | 3.5 | -0.875 | 0.375 | 4.0850337 | 0.25 |
| 2017 | candidate | 1 | 2.375 | 2.140625 | 4.75 | 1.75 | 0.875 | 0.375 | 2 | 0.5625 |
| 2017 | control | 1 | 2.375 | 2.140625 | 4.75 | 1.75 | 0.875 | 0.375 | 2 | 0.5625 |

## By NFL week

| Period | Arm | Games | Team MAE | Team CRPS | Margin MAE | Total MAE | Team bias | Projected SD | Actual SD | Winner Brier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2016-w1 | candidate | 1 | 2.625 | 1.1875 | 2.25 | 5.25 | -2.625 | 0.375 | 1.5 | 0.25 |
| 2016-w1 | control | 1 | 2.625 | 1.1875 | 2.25 | 5.25 | -2.625 | 0.375 | 1.5 | 0.25 |
| 2016-w10 | candidate | 1 | 4.625 | 3.6875 | 9.25 | 1.75 | 0.875 | 0.375 | 5 | 0.25 |
| 2016-w10 | control | 1 | 4.625 | 3.6875 | 9.25 | 1.75 | 0.875 | 0.375 | 5 | 0.25 |
| 2017-w1 | candidate | 1 | 2.375 | 2.140625 | 4.75 | 1.75 | 0.875 | 0.375 | 2 | 0.5625 |
| 2017-w1 | control | 1 | 2.375 | 2.140625 | 4.75 | 1.75 | 0.875 | 0.375 | 2 | 0.5625 |

## Paired uncertainty

Positive differences mean control minus candidate team CRPS. Both teams stay together. These intervals are descriptive, never extra gates.

```json
{
  "difference": 0.0,
  "estimand": "mean_game_paired_team_CRPS_control_minus_candidate",
  "interpretation": "Descriptive historical development uncertainty; no additional release gate.",
  "leave_one_season_out": {
    "2016": 0.0,
    "2017": 0.0
  },
  "paired_games": {
    "lower95": 0.0,
    "upper95": 0.0
  },
  "settings": {
    "block_weeks": 3,
    "estimand": "mean_game_paired_team_CRPS_control_minus_candidate",
    "interval": 0.95,
    "replicates": 10000,
    "seed": 9132026,
    "sensitivities": [
      "within_season_moving_blocks",
      "whole_seasons",
      "leave_one_season_out"
    ]
  },
  "three_week_blocks": {
    "lower95": 0.0,
    "method": "paired within-season moving blocks, length 3 weeks",
    "one_sided95_lower": 0.0,
    "replicates": 10000,
    "upper95": 0.0
  },
  "whole_seasons": {
    "limited_season_count": true,
    "lower95": 0.0,
    "seasons": 2,
    "upper95": 0.0
  }
}
```

## PIT and winner reliability

candidate

| Target | Ten equal-width PIT bin counts |
| --- | --- |
| team | 1, 1, 2, 0, 0, 0, 0, 0, 2, 0 |
| margin | 0, 1, 0, 0, 0, 0, 0, 1, 0, 1 |
| total | 0, 0, 2, 0, 0, 0, 0, 1, 0, 0 |

| Bin | Games | Mean forecast | Observed home outcome |
| --- | --- | --- | --- |
| 0 | 0 | not recorded | not recorded |
| 1 | 0 | not recorded | not recorded |
| 2 | 0 | not recorded | not recorded |
| 3 | 0 | not recorded | not recorded |
| 4 | 0 | not recorded | not recorded |
| 5 | 2 | 0.5 | 1 |
| 6 | 0 | not recorded | not recorded |
| 7 | 1 | 0.75 | 0 |
| 8 | 0 | not recorded | not recorded |
| 9 | 0 | not recorded | not recorded |

control

| Target | Ten equal-width PIT bin counts |
| --- | --- |
| team | 1, 1, 2, 0, 0, 0, 0, 0, 2, 0 |
| margin | 0, 1, 0, 0, 0, 0, 0, 1, 0, 1 |
| total | 0, 0, 2, 0, 0, 0, 0, 1, 0, 0 |

| Bin | Games | Mean forecast | Observed home outcome |
| --- | --- | --- | --- |
| 0 | 0 | not recorded | not recorded |
| 1 | 0 | not recorded | not recorded |
| 2 | 0 | not recorded | not recorded |
| 3 | 0 | not recorded | not recorded |
| 4 | 0 | not recorded | not recorded |
| 5 | 2 | 0.5 | 1 |
| 6 | 0 | not recorded | not recorded |
| 7 | 1 | 0.75 | 0 |
| 8 | 0 | not recorded | not recorded |
| 9 | 0 | not recorded | not recorded |

## Forecast meaning and score support

Point labels remain LEGACY_RIDGE_CENTER. Distribution means are not relabeled as those points. Negative team/total support is retained and disclosed, not clipped. Winner probabilities refer to strict wins plus half the tie mass.

| Arm | Target | Mean distribution-minus-point | Largest absolute offset | Mean negative-score mass |
| --- | --- | --- | --- | --- |
| control | home_points | 0.95833333 | 1 | 0 |
| control | away_points | 1.7083333 | 1.75 | 0 |
| control | margin | -0.083333333 | 2.25 | not applicable |
| control | total | 1.75 | 1.75 | 0 |
| candidate | home_points | 0.95833333 | 1 | 0 |
| candidate | away_points | 1.7083333 | 1.75 | 0 |
| candidate | margin | -0.083333333 | 2.25 | not applicable |
| candidate | total | 1.75 | 1.75 | 0 |

## Calibration executions

| Hash | Target season | Cadence | Donor relation | Donor games | Fitted at |
| --- | --- | --- | --- | --- | --- |
| 2ea89e3ccec8e71311b84dbb311e72466b887f00228e69b0a36945e1cdc1ac3f | 2017 | OFFSEASON | DECLARED_LEGACY_DONOR | 4 | 2017-08-30T14:00:00+00:00 |
| 33b80daadfb8086278672f89df0cf4a7b2de6cf57b68c3e1c9fbf249025f067b | 2016 | WEEK9 | OWN_LINEAGE | 2 | 2016-11-01T14:00:00+00:00 |
| 5a6ac4d432938e72a50e7933fc5a61e0b57cac8abeee3a88ef1f4ae157626cf1 | 2016 | OFFSEASON | OWN_LINEAGE | 2 | 2016-08-30T14:00:00+00:00 |
| 691b352d2fca53e55d4c23f5bf33414ca2af6dd536e1873818fff07b66cd2e06 | 2017 | OFFSEASON | OWN_LINEAGE | 4 | 2017-08-30T14:00:00+00:00 |
| 808885908797095f636cf41d0e7381031324003f982b253f6ad3160c2da0a448 | 2017 | WEEK9 | OWN_LINEAGE | 4 | 2017-11-01T14:00:00+00:00 |
| 960a135609a1694f811c3a2b730836da90dc54607fe495d5eeafd7a90059d54e | 2017 | WEEK9 | DECLARED_LEGACY_DONOR | 4 | 2017-11-01T14:00:00+00:00 |
| 9917463cf9e6b49a8ffd26349cbf209e014cc9356ff9a2f5d70b79f29322ea54 | 2016 | OFFSEASON | DECLARED_LEGACY_DONOR | 2 | 2016-08-30T14:00:00+00:00 |
| cc5a03f8bab4fedaaedb18c747190cbe3f1c43b6fdd8217dd09427be1b03cbc1 | 2016 | WEEK9 | DECLARED_LEGACY_DONOR | 2 | 2016-11-01T14:00:00+00:00 |

Point forecasts are unchanged under the numerical tolerance; team MAE is reported for both arms above. Individual forecasts, intervals, PIT, means, negative mass and score records remain in the hash-bound numerical result.

## Unresolved release evidence

- Not an untouched test; historical provider availability remains assumed.

- Separate empirical marginals and legacy point centers; no coherent mean migration claimed.

- Current as-issued comparison, review packet, resource qualification and release evidence are still required.

- No completed Claude or Dr. M review, signed decision or prospective confirmation is supplied by this execution.

<details><summary>DIAGNOSTIC ONLY — CLOSE — No retained, lineage-matched reference diagnostic snapshot supplied</summary>By season: no eligible games. Source: nflverse spread_line / total_line. Counts exclude actual pushes and exact forecast-on-line cases. Never a target, gate, ranking, selection criterion or justification for a model change.</details>
<details><summary>DIAGNOSTIC ONLY — OPEN — No retained, lineage-matched reference diagnostic snapshot supplied; totals INSUFFICIENT (34.3% historical coverage)</summary>By season: no eligible games. Source: nfelo historic_projected_spreads.csv home_line_open; totals source nfelo_games.csv total_line_open, unblended. Counts exclude actual pushes and exact forecast-on-line cases. Never a target, gate, ranking, selection criterion or justification for a model change.</details>

Confidence: medium in experiment readiness: retained evidence is reproducible, but authoritative historical availability, installed resource qualification and independent reviews remain consequential. Lower to low on an independent recomputation disagreement. A numerical result alone is not a release decision.
