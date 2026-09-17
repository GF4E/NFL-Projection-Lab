# Secondary wind result — INSUFFICIENT, not gated

**INSUFFICIENT, not negative.** One training season and one test season cannot overturn the 2,639-game bucket study. The small observed worsening is descriptive, not a rejection of the wind hypothesis. Return to the queue when 2021–2023 forecast history is qualified.

Requested 2021–2025; qualified 2024 training (272 games), 2025 test (272 games). No documented GFS wind history for 2021–2023; these years are explicitly unscored. This is not a complete five-year result. Primary experiment and gate remain unchanged.

Team CRPS relative improvement: -0.1231%. No tuning or promotion.

|Candidate|Target|N|MAE|CRPS|50 hit/n|50 width|50 Winkler|80 hit/n|80 width|80 Winkler|
|---|---|---:|---:|---:|---|---:|---:|---|---:|---:|
|b_matched|team|544|7.569894|5.348687|251/544|11.6114|24.0874|414/544|22.6412|33.4074|
|b_matched|margin|272|10.253417|7.230858|130/272|15.2284|32.4803|212/272|31.2278|45.6057|
|b_matched|total|272|10.923523|7.761783|109/272|14.4667|35.4560|201/272|30.7133|47.7813|

b_matched Brier: 0.220253

|b_plus_wind|team|544|7.569894|5.355274|251/544|11.6199|24.1084|413/544|22.6580|33.5605|
|b_plus_wind|margin|272|10.253417|7.239996|129/272|15.2397|32.5135|212/272|31.2508|45.9169|
|b_plus_wind|total|272|10.923523|7.772312|112/272|14.4774|35.4630|196/272|30.7360|47.9560|

b_plus_wind Brier: 0.220570


secondary.json contains all weekly scores, 50/80 counts, widths, CRPS, Winkler, midpoint PIT, spread-skill bins and ten-bin reliability. Six versus five fitted coefficients; identical training/test games and point forecasts. Fixed 24-hour-lead wind from Previous Runs, not reanalysis or stitched day-zero values.
