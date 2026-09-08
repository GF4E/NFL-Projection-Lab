# Weekly component harvest

Research queue, not live model selection. Metadata checked September 8, 2026; commits and API metadata are pinned in [sources](work/harvest-elo-v1/sources/pins.json).

| Repository | License observed | Last push (UTC) | One component |
|---|---|---|---|
| [fivethirtyeight/nfl-elo-game](https://github.com/fivethirtyeight/nfl-elo-game/tree/fbec1afa38ece5befe24fb21be8ddba8eb160fe6) | MIT | 2023-05-02T15:15:09Z | Football baseline: port MIT base Elo and add published pregame QB VALUE adjustment. Full QB estimator/inputs remain unavailable; do not call the base-only diagnostic QB Elo. |
| [greerreNFL/nfelo](https://github.com/greerreNFL/nfelo/tree/3425a6a9c304639f9e7c110cf4a0a79b92ad5b89) | No license detected | 2026-09-08T16:40:54Z | Independently implement market-regression and QB-adjustment ideas from published methodology in a later harvest. Never copy implementation code. Load the pinned historic_projected_spreads.csv as reference data only. |
| [ShamgarBN/nfl-bet-engine](https://github.com/ShamgarBN/nfl-bet-engine/tree/9aa4326c96d6aa5d771b7b68be8226d9f96a7023) | MIT | 2026-06-23T17:12:38Z | Reimplement the walk-forward backtest structure; do not import its models or UI. |
| [thadhutch/sports-quant](https://github.com/thadhutch/sports-quant/tree/5cba2c0a7f499129e3a9c98597cb85397c3fa862) | MIT | 2026-03-19T22:29:59Z | Reimplement weather features for totals using the existing automated weather stack; no other features. |


## Current executable result: harvest v2

The [v2 comparison](work/harvest-elo-v2/README.md) supersedes the missing-input outcome below for the newly authorized ANY/A proxy and league-mean totals companion. Run `python -m engine.harvest --harvest elo-anya-v2 --output work/harvest-elo-v2/run-2` with the pinned interpreter. Both candidates have nonzero paired counts; neither passes the updated numerical gate. Full 538 VALUE remains distinct from this reconstructed ANY/A proxy.

## Weekly loop

Every Tuesday, review upstream metadata and published methodology, hash/pin changed inputs, select one named component, register its input/target/cutoff contract before viewing comparative results, then run the offline harvest. Preserve every prior run and record missing inputs and rejected comparisons. No Odds API calls, unlicensed code copying, automatic upstream code execution, or live location changes. A task-thread weekly heartbeat runs this review; see the scheduling record.

The live location stays the empirical market distribution. Under the latest user-authorized rule, a candidate needs **better margin CRPS and total CRPS no worse** on paired games, plus comparable evidence, before it can qualify. A missing target, incomplete coverage, or different cutoff cannot pass. No five-percent claim is registered here and E3 remains untouched.

## Historical harvest one (preserved)

[Final experiment](work/harvest-elo-v1/run-3/experiment.json) · [paired losses](work/harvest-elo-v1/run-3/paired-losses.csv) · [pre-comparison protocol](work/harvest-elo-v1/protocol.json).

`engine/elo.py` ports the MIT base update, reversion, home advantage and margin-of-victory multiplier. The published `3.3 × (starter VALUE − team VALUE)` adjustment is implemented separately. The source repository does **not** include the complete QB VALUE estimator or a totals predictor. The official historical QB download no longer supplied usable CSV during this run. No zero-filled QB series or invented totals forecast is substituted. Full QB-adjusted 2016–2025 evaluation is therefore **incomplete**.

The base-only margin diagnostic is available for all requested seasons; it uses prior-week results and a prior-season empirical shape wrapper. Elo-point-to-margin conversion is a declared local adapter, not a native 538 margin distribution. The nfelo reference starts in 2021 and lacks totals. All duplicate reference game IDs are excluded; prior-season residual calibration further limits paired coverage. These comparisons are labeled `DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST`. Historical closing/reconstructed lines cannot stand in for as-issued T60 evidence.

Neither the live distribution artifact nor frozen experiments are modified. Evaluating the live 2015–2025 fitted PMF on those same seasons would leak future labels; the replay rebuilds its shape from strictly prior seasons instead. Whole-week Elo predictions precede that week's score updates; season-level residual fits are frozen throughout each evaluation season. Regular season is the evaluation population, with Week 1 and Week 18 tags; postseason games update ratings only for subsequent weeks/seasons.

## Commands

Verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```

Replay the named immutable harvest:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.harvest --harvest 538-qb-elo --output work/harvest-elo-v1/run-3
```

Supply qualified QB inputs in a new run:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.harvest --harvest 538-qb-elo --qb-input pregame-qb.csv --output work/harvest/NEW_RUN
```
QB CSV fields: `game_id,home_qb_adjustment,away_qb_adjustment,available_at,training_season,training_week`. Adjustments are Elo points, not raw VALUE. Include prior-season forecasts to calibrate the distribution; metadata must precede the forecast cutoff, and training must exclude the target week. Supplying adjustments alone does not reproduce the unpublished full QB rating estimator.

Grade and compare any named component with a pinned prediction CSV:
```sh
/opt/anaconda3/bin/python3.12 -B -m engine.harvest --harvest COMPONENT_NAME --predictions predictions.csv --output work/harvest/NEW_RUN
```
Prediction CSV fields: `game_id,margin_location,total_location,available_at,training_season,training_week`. Locations use home-minus-away margin and game total. Include 2015 warm-up predictions and all evaluation years; missing targets stay missing. Files are hashed; imported-model training metadata is a declaration, not independently verified as-issued evidence. Without `--predictions`, only the implemented `538-qb-elo` and diagnostic `538-base-elo` names are accepted. Every component gets prior-season empirical residual wrappers and paired grading against the market and available nfelo series; no dynamic repository code is loaded.

Published methodology for later independent nfelo work: [market regression](https://www.nfeloapp.com/analysis/using-market-regression-to-improve-prediction-accuracy-in-the-nfl/) and [model overview](https://www.nfeloapp.com/about/). The 538 adjustment is described in its [published methodology](https://fivethirtyeight.com/methodology/how-our-nfl-predictions-work/), whose direct URL now redirects; source availability is explicitly limited. No nfelo implementation source was downloaded or copied.

## Harvest two: disagreement study

[Bucket and seasonal regression report](work/harvest-disagreement-v1/REPORT.md). The conditional blend was not triggered under the stability definition fixed before this study. No promotion gate or live location was changed. Replay with `python -m engine.disagreement --output work/harvest-disagreement-v1/run-2` using the pinned interpreter.

### Harvest two outcome: NEGATIVE

No blend was triggered under its frozen stability rule; this is a negative harvest outcome, not proof of zero incremental Elo information. Numerical results: [experiment](work/harvest-disagreement-v1/run-2/experiment.json). ATS excludes pushes and exact agreements; intervals are pointwise week-cluster bootstrap intervals. nfelo remains `DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST`.

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


## Harvest three: weather totals — NEGATIVE

[Experiment and wind, precipitation, dome tables](work/harvest-weather-v1/REPORT.md). The requested sign-consistency trigger fired, but the location adjustment worsened total CRPS; margin remained unchanged. No promotion. Reanalysis remains retrospective evidence. Run `python -m engine.harvest --harvest weather-v1 --output work/harvest-weather-v1/run-2` offline.
