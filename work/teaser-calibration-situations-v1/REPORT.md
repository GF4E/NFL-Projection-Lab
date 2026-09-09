# Teasers, calibration and situations

All numerical results cite the [experiment record](run-2/experiment.json). Definitions were fixed in the [protocol](protocol.json) before results. Zero provider calls or credits; frozen artifacts and live locations unchanged.

## Teaser reproduction

Regular seasons2015–2025; six-point Wong legs at inclusive -8.5 to -7.5 and +1.5 to +2.5. Integer starting lines can push. Every two/three-leg combination of distinct qualifying games in the same season-week is included; no cherry-picked tickets. These overlapping tickets are not independent. Intervals resample whole weeks within seasons. Ticket settlement is a declared hypothetical policy: any losing leg loses the ticket; otherwise any push voids the entire ticket. These price tiers are scenarios, not verified current book contracts.

| Season | n | W–L–P | Per-leg rate | 95% interval |
|---|---:|---|---:|---|
| ALL | 701 | 529–170–2 | 75.7% | 72.1%–79.2% |
| 2015 | 58 | 45–13–0 | 77.6% | 69.2%–85.5% |
| 2016 | 64 | 53–10–1 | 84.1% | 74.4%–92.5% |
| 2017 | 64 | 47–16–1 | 74.6% | 61.5%–85.7% |
| 2018 | 59 | 42–17–0 | 71.2% | 54.9%–84.8% |
| 2019 | 37 | 27–10–0 | 73.0% | 59.0%–85.4% |
| 2020 | 58 | 47–11–0 | 81.0% | 69.1%–91.4% |
| 2021 | 61 | 51–10–0 | 83.6% | 70.0%–95.1% |
| 2022 | 61 | 42–19–0 | 68.9% | 54.4%–81.7% |
| 2023 | 75 | 56–19–0 | 74.7% | 62.5%–85.5% |
| 2024 | 69 | 51–18–0 | 73.9% | 64.9%–83.1% |
| 2025 | 95 | 68–27–0 | 71.6% | 60.4%–81.7% |

| Legs | Price | Ticket W–L–void | Rate | Ticket break-even | Per-leg break-even* | Adjusted lower | Clears? |
|---|---:|---|---:|---:|---:|---:|---|
| 2 | -110 | 767–509–11 | 60.11% | 52.38% | 72.37% | 53.28% | True |
| 2 | -120 | 767–509–11 | 60.11% | 54.55% | 73.85% | 53.28% | False |
| 2 | -130 | 767–509–11 | 60.11% | 56.52% | 75.18% | 53.28% | False |
| 3 | -110 | 745–798–27 | 48.28% | 52.38% | 80.61% | 39.13% | False |
| 3 | -120 | 745–798–27 | 48.28% | 54.55% | 81.71% | 39.13% | False |
| 3 | -130 | 745–798–27 | 48.28% | 56.52% | 82.68% | 39.13% | False |

*Per-leg roots assume identical independent legs without pushes; use full ticket probabilities when push mass exists. Pricing engine/teaser.py explicitly labels cross-game independence and rejects same-game tickets. It returns per-leg probabilities, fair ticket probability/price, book-price edge and expected profit. Historical model-price fields use the full frozen empirical PMF and are labeled fitted descriptive; they are not out-of-sample forecast scores. Actual ticket hit rates are reconstructed from scores and schedule lines. Only two-leg -110 clears the one-sided Bonferroni-adjusted historical test over six size/price combinations. This does not establish executable-book CLV or authorize live betting.

## Calibration

Main table is rolling-origin: shape fitted2015 through the prior season, no target-season labels.2015 is warmup with no qualified prior-era shape. Intervals are equal-tail inclusive integer intervals; * flags absolute deviation greater than3 percentage points from nominal. Discrete coverage can conservatively exceed nominal. Residual SD is raw actual minus market, sample ddof1. The full frozen-PMF in-sample descriptive coverage is separately retained in calibration.csv; it must not be mistaken for out-of-sample validation.

| Season | Margin50/80/95 | Total50/80/95 | Margin SD | Total SD |
|---|---|---|---:|---:|
| 2015 | —/—/— | —/—/— | 12.89 | 13.35 |
| 2016 | 64.1*/82.4/96.1 | 50.0/85.2*/96.5 | 11.80 | 12.45 |
| 2017 | 50.0/82.4/93.8 | 50.4/78.1/93.8 | 13.14 | 14.17 |
| 2018 | 56.2*/81.2/94.5 | 53.9*/81.2/95.3 | 13.17 | 13.49 |
| 2019 | 48.4/79.7/96.1 | 53.1*/82.0/97.7 | 13.02 | 13.45 |
| 2020 | 52.3/85.2*/94.9 | 52.3/83.2*/96.9 | 12.76 | 12.79 |
| 2021 | 48.2/77.9/93.0 | 50.0/84.6*/94.9 | 13.69 | 13.30 |
| 2022 | 59.0*/86.7*/98.2* | 56.8*/81.2/95.9 | 11.45 | 13.25 |
| 2023 | 54.4*/78.7/95.2 | 55.9*/84.2*/96.3 | 13.05 | 13.14 |
| 2024 | 57.7*/80.9/96.3 | 59.9*/85.3*/96.0 | 12.62 | 12.49 |
| 2025 | 51.8/82.7/97.8 | 51.1/82.7/95.6 | 12.28 | 13.16 |

## Situational buckets

Cold means outdoor observed kickoff temperature under35°F,2016–2025. Thursday uses Eastern schedule weekday,2015–2025. Bye requires no scheduled game in the previous week and prior participation in that season; full schedules, including canceled/uncompleted rows, determine whether a game was scheduled. Under counts each game once. Cold/Thursday ATS bets the home side; bye ATS bets the sole off-bye team and excludes games where both teams are off bye. Positive ATS residual favors that selected side; total residual is actual minus market. Six fixed bucket/target tests, two-sided Bonferroni intervals. Pushes excluded from rate denominators.

| Bucket | Target | n | W–L–P | Rate | Adjusted95% interval | Mean residual | Clears -110? |
|---|---|---:|---|---:|---|---:|---|
| Thursday | ATS | 197 | 96–93–8 | 50.8% | 41.8%–60.1% | -0.053 | False |
| Thursday | Under | 197 | 98–98–1 | 50.0% | 41.2%–58.8% | +0.789 | False |
| off_bye | ATS | 294 | 142–144–8 | 49.7% | 42.5%–57.1% | -0.241 | False |
| off_bye | Under | 323 | 163–156–4 | 51.1% | 44.2%–58.0% | +0.163 | False |
| temperature_under_35F | ATS | 147 | 77–66–4 | 53.8% | 44.9%–62.9% | +0.721 | False |
| temperature_under_35F | Under | 147 | 80–66–1 | 54.8% | 45.7%–63.6% | -1.082 | False |

No situational bucket clears adjusted break-even; no new paper rule is registered. Cold-weather evidence is retrospective and would additionally need prospective forecast qualification. Existing wind rule and its30-pick/positive-CLV gate remain unchanged.

Verification:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```
Offline replay of the immutable named experiment:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.teaser_study --output work/teaser-calibration-situations-v1/run-2
```
run-1 is preserved; run-2 adds explicit per-ticket fair-price fields and conventional total-residual signs without changing hit-rate findings.
