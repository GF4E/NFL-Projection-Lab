# Harvest three: weather totals

All numerical study results cite the [experiment record](run-2/experiment.json); source coverage cites the [weather manifest](weather-manifest.json). [Protocol](protocol.json) was written before weather comparisons. [Coefficients CSV](run-2/coefficients.csv), [paired losses](run-2/paired-losses.csv).

NEGATIVE: weather total CRPS 7.393832765 versus market 7.391504359, paired_n=2639. Total CRPS worsens and margin is unchanged, so the existing promotion gate fails on both conditions. The empirical market location remains live. Wind, precipitation and dome coefficients are negative in all ten expanding training windows, meeting the requested sign-consistency trigger; those overlapping windows are not independent replications. Sign stability did not translate into improved held-out CRPS.

## Inputs and implementation

Independent implementation in engine/weather.py. The inspected MIT sports-quant files cover roof grouping and PFR roof extraction; the requested Open-Meteo wind, precipitation and temperature layer is our implementation, not a claimed port of an upstream weather estimator. Pinned source files and MIT license are in sources/. No nfelo code was copied. Stadium coordinates are reference data from [greerreNFL/Stadiums](https://github.com/greerreNFL/Stadiums/tree/69efd546218337d947cb40c097fc3bb7caa88d76/data/stadiums.csv); every NFLverse stadium ID joined without imputation.

[Open-Meteo historical documentation](https://open-meteo.com/en/docs/historical-weather-api) specifies ERA5 reanalysis. We request one continuous time range per outdoor venue, cache response bytes by SHA-256, and pin request parameters. Minute-limit responses were respected with serial retries; successful captures are reused. No Odds API calls. Requests use mph, mm precipitation, Celsius and UTC. The hourly timestamp containing kickoff is selected by flooring Eastern schedule kickoff times after timezone conversion. Precipitation is the preceding-hour accumulation at that timestamp. Reanalysis uses subsequent observations: **RECONSTRUCTED_ERA5_KICKOFF_WEATHER_NOT_AS_ISSUED_T60**. It is not a pregame forecast archive.

The table has 2895 games including training-only 2015, 2074 outdoor/open-roof measurements. Evaluation uses 2016–2025 regular seasons only. Closed roofs and domes retain blank weather measurements, with zero outdoor exposure in the regression and dome=1. Open roofs use outdoor weather; indoor games are excluded from wind/precipitation buckets. Temperature is cached but not added to the specified regression.

## Buckets

Residual = actual total minus market total. Under records exclude pushes from hit-rate denominators. Intervals are pointwise whole-week cluster bootstrap intervals within each season; they do not establish a prospective betting edge or include price profitability.

| Feature | Bucket | n | Mean residual | Under W–L–P | Under rate (95% interval) |
|---|---|---:|---:|---|---|
| wind | <10 | 1431 | +0.486 | 705–712–14 | 49.8% (47.1–52.3%) |
| wind | 10–<15 | 333 | -1.904 | 197–133–3 | 59.7% (54.4–64.7%) |
| wind | 15–20 | 101 | -0.297 | 52–49–0 | 51.5% (42.3–60.6%) |
| wind | >20 | 13 | -6.538 | 8–5–0 | 61.5% (36.4–88.9%) |
| precip | dry | 1554 | +0.267 | 774–766–14 | 50.3% (47.9–52.6%) |
| precip | wet | 324 | -1.444 | 188–133–3 | 58.6% (52.8–63.8%) |
| dome | outdoor | 1878 | -0.028 | 962–899–17 | 51.7% (49.5–53.9%) |
| dome | indoor | 761 | +1.415 | 374–383–4 | 49.4% (46.0–52.7%) |

## Rolling-origin coefficients

Each evaluation season uses 2015 through the prior season only. OLS actual_total = intercept + b market_total + wind_mph coefficient + precip_mm coefficient + dome coefficient. Pointwise intervals use week-cluster CR1 covariance and t critical values. Full regression location is scored with the unchanged prior-season market residual shape; no shape refit during location comparison. The conditional decision to score uses the entire coefficient trajectory and is exploratory.

| Season | Intercept (95%) | Market (95%) | Wind (95%) | Precip (95%) | Dome (95%) |
|---|---|---|---|---|---|
| 2016 | 16.434 [-8.834, 41.702] | 0.733 [0.155, 1.311] | -0.487 [-0.989, 0.014] | -4.633 [-8.161, -1.105] | -3.534 [-10.013, 2.945] |
| 2017 | 1.885 [-13.688, 17.459] | 1.033 [0.686, 1.381] | -0.405 [-0.685, -0.125] | -3.329 [-6.783, 0.125] | -2.994 [-6.980, 0.993] |
| 2018 | 11.298 [-1.246, 23.842] | 0.833 [0.559, 1.107] | -0.515 [-0.788, -0.243] | -1.853 [-4.886, 1.181] | -3.874 [-7.467, -0.281] |
| 2019 | 5.351 [-5.616, 16.319] | 0.959 [0.725, 1.193] | -0.461 [-0.711, -0.211] | -2.355 [-4.737, 0.026] | -3.557 [-6.600, -0.514] |
| 2020 | 6.058 [-3.471, 15.587] | 0.925 [0.723, 1.127] | -0.336 [-0.568, -0.104] | -2.487 [-4.374, -0.601] | -2.199 [-5.038, 0.641] |
| 2021 | 3.041 [-4.788, 10.870] | 0.988 [0.821, 1.155] | -0.301 [-0.499, -0.102] | -2.258 [-4.018, -0.498] | -1.228 [-3.705, 1.249] |
| 2022 | 4.366 [-2.844, 11.577] | 0.955 [0.803, 1.107] | -0.313 [-0.497, -0.129] | -1.268 [-2.948, 0.412] | -0.972 [-3.194, 1.249] |
| 2023 | 4.551 [-1.815, 10.917] | 0.945 [0.810, 1.080] | -0.291 [-0.461, -0.121] | -1.419 [-2.927, 0.089] | -0.685 [-2.691, 1.321] |
| 2024 | 6.091 [0.218, 11.964] | 0.919 [0.794, 1.045] | -0.338 [-0.498, -0.178] | -1.572 [-2.950, -0.195] | -1.012 [-2.869, 0.844] |
| 2025 | 5.984 [0.386, 11.583] | 0.919 [0.799, 1.039] | -0.303 [-0.452, -0.154] | -1.484 [-2.838, -0.129] | -0.874 [-2.610, 0.862] |

| Evaluation | paired_n | Weather CRPS | Market CRPS |
|---|---:|---:|---:|
| ALL | 2639 | 7.393833 | 7.391504 |
| 2016 | 256 | 7.080231 | 7.032623 |
| 2017 | 256 | 7.995953 | 7.997448 |
| 2018 | 256 | 7.535351 | 7.525006 |
| 2019 | 256 | 7.593847 | 7.553424 |
| 2020 | 256 | 7.253159 | 7.223282 |
| 2021 | 272 | 7.529006 | 7.488747 |
| 2022 | 271 | 7.381229 | 7.411895 |
| 2023 | 272 | 7.166669 | 7.288943 |
| 2024 | 272 | 7.068796 | 7.003618 |
| 2025 | 272 | 7.362826 | 7.412149 |

## Reproduction

Verify all source hashes, coverage, chronology and immutable replay:
```sh
/opt/anaconda3/bin/python3.12 -B scripts/verify_weather.py
```
Replay the named immutable experiment offline:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.harvest --harvest weather-v1 --output work/harvest-weather-v1/run-2
```
Behavioral tests:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```

run-1 is preserved as an intermediate record; run-2 adds explicit total-gate reporting without changing numerical results. No frozen experiment, live distribution, pricing filter, or provider schedule was changed.
