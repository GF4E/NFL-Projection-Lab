# Prospective T65 forecast integration

All numerical and execution claims cite the [experiment record](experiment.json). [Venue manifest](venues-manifest.json), [scheduler state](launchctl.txt), [tests](tests-complete.log).

The existing T65 runner now requests the pinned GFS forecast run at each known outdoor venue, stores wind mph, precipitation mm and temperature Celsius for the UTC kickoff hour, and freezes forecast data and hashes in T60-weather.json. T60 pricing rows also carry weather fields, run initialization, API availability/issuance, request and receipt timestamps. Missing or late forecasts cannot trigger the paper rule; ordinary board output is retained. A qualifying exact-consensus Under at the best four-book price is recorded once in the dedicated paper log; the default scorecard includes it.

The [metadata documentation](https://open-meteo.com/en/docs/model-updates) distinguishes initialization from availability. We respect its replication delay and explicitly request that run via the [single-runs API](https://open-meteo.com/en/docs/single-runs-api). These are forecasts fetched prospectively; the preview below is not a T60 artifact. No backfill or historical reconstruction occurs.

| Matchup | Venue | Roof | Current kickoff wind | In band? | Request UTC |
|---|---|---|---:|---|---|
| New England Patriots at Seattle Seahawks | Lumen Field | outdoors | 5.5 mph | False | 2026-09-08T19:54:16.678010+00:00 |
| San Francisco 49ers at Los Angeles Rams | Melbourne Cricket Ground | outdoors | 2.0 mph | False | 2026-09-08T19:54:17.329466+00:00 |

The Seattle opener is Wednesday September9 US / Thursday September10 Rome; Rams–49ers is Thursday September10 US / Friday September11 Rome and Melbourne. Both are outdoor. MCG is not SoFi: the erroneous source dome label is preserved alongside a documented outdoor correction from venue-operator evidence. Coordinates are attributed to the pinned stadium reference; roof/venue IDs are nflverse-derived. Unknown retractable roof status is not presumed outdoor.

Tests: 73 passed, 0 failed. Existing launchd job is loaded with a15-second interval and last exit0; actual future T65 executions remain pending. Odds API credits spent:0. No gate changed.

Verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```
Replay/verify the named immutable integration record offline:
```sh
/opt/anaconda3/bin/python3.12 -B scripts/verify_live_weather.py
```
