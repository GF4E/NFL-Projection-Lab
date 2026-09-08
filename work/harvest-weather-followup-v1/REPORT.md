# Harvest three follow-up

All numerical results cite the [experiment record](run-1/experiment.json). [Protocol](protocol.json), [forecast manifest](forecast-manifest.json), [paper rule](../../RULES.md).

## Observed-wind bucket by season

Outdoor/open roofs; 10 <= wind mph < 15. Under rates exclude pushes.

| Season | Games | Under W–L–P | Under rate |
|---|---:|---|---:|
| 2016 | 35 | 17–18–0 | 48.6% |
| 2017 | 33 | 19–14–0 | 57.6% |
| 2018 | 30 | 18–11–1 | 62.1% |
| 2019 | 38 | 26–12–0 | 68.4% |
| 2020 | 31 | 13–18–0 | 41.9% |
| 2021 | 42 | 22–19–1 | 53.7% |
| 2022 | 34 | 26–8–0 | 76.5% |
| 2023 | 34 | 25–8–1 | 75.8% |
| 2024 | 30 | 14–16–0 | 46.7% |
| 2025 | 26 | 17–9–0 | 65.4% |

**7 of 10 seasons exceed 52.4%.** The pooled under rate is 59.7%.

## Four-bucket multiplicity correction

Bonferroni uses alpha=.05/4 and a two-sided 98.75% marginal interval for each of the four fixed wind buckets. The selected bucket interval is **[53.0303%, 66.1721%]**. We resample whole weeks within seasons with 100,000 replicates for tail precision; this follows the original dependence structure but is an approximate bootstrap family-wise interval, not an exact finite-sample guarantee. It corrects only the four specified wind buckets, not precipitation/dome exploration or prior harvest selection. It is not a CLV or profitability gate.

## Forecast chronology

Open-Meteo documents the [historical forecast archive](https://open-meteo.com/en/docs/historical-forecast-api) as a stitched series. It does not preserve the individual issuance structure needed to identify the latest forecast publicly available before a particular T60 cutoff. The [single-run documentation](https://open-meteo.com/en/docs/single-runs-api) starts ECMWF coverage in March 2024 with hindcasts; other models start in April 2026. Run initialization is distinct from public availability. Therefore **the requested 2022–2025 T60-issued rate cannot be established: paired_n=0, rate unavailable.** A numeric zero rate would be misleading. No run initialization time, stitched value or retrospectively computed hindcast was relabeled as an as-issued forecast.

A separate sensitivity diagnostic uses pinned GFS Global stitched forecasts at kickoff hour, on all outdoor games in the requested seasons, not merely games selected by observed wind. The units, venue coordinates and half-open bucket match the prior analysis. These are forecast-model outputs, but remain **STITCHED_FORECAST_NOT_T60_ISSUANCE**. Historical market totals likewise do not attest T60 cutoff.

| Season | Forecast bucket n | Under W–L–P | Under rate |
|---|---:|---|---:|
| ALL | 182 | 110–70–2 | 61.1% |
| 2022 | 60 | 42–18–0 | 70.0% |
| 2023 | 36 | 23–13–0 | 63.9% |
| 2024 | 47 | 20–25–2 | 44.4% |
| 2025 | 39 | 25–14–0 | 64.1% |

No forecast-hour observations were missing in the diagnostic table. The observed-wind 2022–2025 bucket has 124 games and an under rate of 66.7%. These buckets select different games: their rates are not a paired forecast superiority test. The stitched diagnostic is directionally consistent with the pooled observed result, but cannot establish that the edge holds with T60-issued forecasts.

## Paper registration and limits

RULES.md registers WIND-UNDER-10-15-V1 for 2026 regular-season Weeks 1–4, under at the best four-book price at the exact qualifying consensus total, one joint paper entry per game. No live money before 30 paper picks and positive verified mean CLV. The rule log is initialized empty; no historical picks are backfilled. The existing scorecard can grade the dedicated log separately and alongside combined/live/paper reports. Missing results and CLV remain pending/missing. A qualified weather-capture dispatcher is not installed by this registration; no future collection or Monday grading is claimed as completed. The odds schedule, live filters and model promotion gate remain unchanged. Credits spent: 0.

Verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```
Replay the named immutable experiment offline:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.weather_followup --output work/harvest-weather-followup-v1/run-1
```
