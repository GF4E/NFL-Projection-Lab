# Operations runbook

All scheduled timestamps are evaluated in `America/Los_Angeles`; use an aware scheduler rather than fixed UTC offsets because the season crosses daylight-saving time.

| Job | Pacific trigger | Endpoint name |
|---|---:|---|
| Data refresh | Tuesday 06:00 | `data-refresh` |
| Loop A | Tuesday 06:30 | `loop-a` |
| Loop B | Tuesday 07:00 | `loop-b` |
| Forecast refresh | Tuesday 07:30 and after valid snapshots | `forecast-refresh` |
| Odds opener | Sunday 18:00, Monday 09:00 | `odds-snapshot` |
| Ordinary odds | Daily Tuesday–Saturday | `odds-snapshot` |
| Kickoff odds | −120, −60, −15 for each distinct window | `odds-snapshot` |
| Inactives / roof | −90 for each window | `inactives-roof` |
| Settlement | After completed slate | `settlement` |
| Credit meter | Daily | `credit-meter` |
| Digest | After settlement | `weekly-digest` |

## Failure contract

1. Start or reuse the deterministic pipeline key.
2. Validate HTTP status, completeness, schema, row counts, and source freshness before publishing anything.
3. On any failure, abort the transaction, mark the run failed, create one idempotent in-app alert, mark dependent forecasts stale, and continue serving the last good forecast.
4. Never update an approved revision. Never promote a challenger outside the atomic gate transaction.

## Credit throttle

At a response-header usage of 400:

1. Remove ordinary Tuesday–Saturday snapshots.
2. If required, remove −120-minute snapshots.
3. Keep −60-minute snapshots only while the projected period remains at or below 450.
4. Always preserve Sunday/Monday openers and −15-minute closes.

## Offseason-only controls

Only the owner starts Loop C. The run may select decay half-life, state K, shrinkage weight, feature membership, regularization, calibration, bootstrap design, QB tiers, notification threshold, and era indicators. It regenerates the discrete margin artifacts, writes a new versioned config, and freezes it before Week 1.
