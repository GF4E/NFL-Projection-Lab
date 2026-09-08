# Harvest two: disagreement study

[Experiment record](run-2/experiment.json) · [bucket CSV](run-2/buckets.csv) · [regression CSV](run-2/regression.csv) · [protocol fixed before results](protocol.json).

All numerical results here cite the linked experiment. No data-provider calls or live-model changes occurred.

All rolling c estimates are positive, but only four pointwise intervals exclude zero. The predeclared operational rule required ten positive estimates and at least eight positive lower bounds; it was not met. No blend was fitted, so the promotion gate was not evaluated. This is not a finding that c is zero. Training windows overlap and these are not ten independent replications.

## Bucket results

Both spreads are home winning-margin locations. Positive disagreement selects home; negative selects away. ATS rates exclude pushes. Exact zero disagreement has no side and is excluded from ATS and directional-mean denominators. Intervals resample whole season-week clusters within season, with 5,000 replicates; they are pointwise, not simultaneous.

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

The ANY/A population is the same saved 2,639 games; nfelo uses exactly the 946 games in its saved comparison and retains `DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST`. The nfelo under-one-point bucket includes 305 exact agreements, which are not bets. None of these ATS intervals excludes 50%; no bucket is established as profitable or as an actionable edge.

## Rolling-origin coefficient

Regression: actual margin = a + b × market margin + c × ANY/A Elo margin. Each coefficient below is fitted before the displayed evaluation season, using 2015 through the preceding season. The 2015 warm-up locations were reconstructed with the unchanged upstream Elo defaults and existing lagged ANY/A table. Confidence intervals use season-week clustered CR1 covariance and a t critical value with cluster-count minus one degrees of freedom. Solving the equivalent market-plus-disagreement design improves numerical conditioning without changing c.

| Evaluation season | Training through | c | 95% interval |
|---|---|---:|---|
| 2016 | 2015 | 0.4617 | [-0.0761, 0.9994] |
| 2017 | 2016 | 0.4698 | [0.1487, 0.7909] |
| 2018 | 2017 | 0.2629 | [-0.0234, 0.5492] |
| 2019 | 2018 | 0.2342 | [-0.0316, 0.4999] |
| 2020 | 2019 | 0.2152 | [-0.0194, 0.4498] |
| 2021 | 2020 | 0.2497 | [0.0458, 0.4536] |
| 2022 | 2021 | 0.1997 | [0.0058, 0.3936] |
| 2023 | 2022 | 0.1640 | [-0.0154, 0.3435] |
| 2024 | 2023 | 0.1422 | [-0.0322, 0.3166] |
| 2025 | 2024 | 0.1697 | [0.0031, 0.3364] |

No live promotion: the stability trigger did not authorize the conditional blend experiment. The proposed blend grid and prior-season selection procedure remain unexecuted in the protocol. Existing margin-improves/total-does-not-worsen promotion requirements remain unchanged. Retrospectively identified QB starters and non-T60 reference lines still limit evidence qualification.

Verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```

Replay this named immutable study, without provider calls:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.disagreement --output work/harvest-disagreement-v1/run-2
```
