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

## Built-in nflverse automation

The deployed Worker has an idempotent `*/5 * * * *` trigger and the app sends the same refresh request when the private workspace opens.

- Live schedules: checked every five minutes; unchanged ETags produce no data writes.
- Schedule history: loaded on first run and revalidated after Tuesday 06:00 Pacific once the prior refresh is at least six days old.
- Current-season play-by-play: checked once per Pacific calendar day after 01:00; a later trigger catches up if the overnight trigger was missed.
- Historical play-by-play: missing seasons from the 2010 training boundary are filled newest-first, one season per trigger after 01:00.
- Storage: play rows are streamed from the compressed nflverse CSV and reduced to team-game feature rows before D1 publication. Older concatenated-gzip releases automatically retry the equivalent uncompressed nflverse CSV when the edge decompressor rejects trailing members.

The importer stages validated rows before publication. A schema, row-count, HTTP, decompression, or parsing failure marks the dataset stale, creates an idempotent data alert, releases the import lease, and leaves the prior production rows untouched.

## Built-in pregame context automation

The same five-minute Worker trigger begins the official pregame check 95 minutes before each distinct kickoff. It reads the NFL inactives landing page, discovers the current week’s official NFL inactive article through the league’s monthly article index, and accepts a game only when both teams have complete lists. Fixed and outdoor roofs come from the versioned venue configuration; retractable venues require an explicit `open` or `closed` field from the official game center. Missing, partial, or ambiguous responses create an in-app alert and preserve the last good inactives, roof, weather, and forecast.

The site adds no pregame settings page. A confirmed list only replaces the existing compact availability line on the open game card, including an explicit inactive-QB cue when applicable.

## Failure contract

1. Start or reuse the deterministic pipeline key.
2. Validate HTTP status, completeness, schema, row counts, and source freshness before publishing anything.
3. On any failure, abort the transaction, mark the run failed, create one idempotent in-app alert, mark dependent forecasts stale, and continue serving the last good forecast.
4. Never update an approved revision. Never promote a challenger outside the atomic gate transaction.

For live odds, one game is the atomic validation boundary. A game publishes only when both execution books provide both sides of spread, total, and moneyline. Complete games may publish from a partial provider slate; incomplete games retain their last validated snapshot, carry an explicit stale state, and are excluded from the new snapshot key.

Stale game prices remain visible for context but are excluded from the weekly opportunity queue, EV recommendations, and suggested units until that game receives a complete current snapshot.

The scheduled Worker remains the primary control plane. Because a newly deployed Sites cron may not fire immediately, a navigation to the weekly board may claim the deterministic scheduled recovery lease in the background. The caller cannot choose a snapshot time, market, or book, and repeated visits cannot create duplicate provider requests.

## Credit throttle

At a response-header usage of 400:

1. Remove ordinary Tuesday–Saturday snapshots.
2. If required, remove −120-minute snapshots.
3. Keep −60-minute snapshots only while the projected period remains at or below 450.
4. Always preserve Sunday/Monday openers and −15-minute closes.

## Offseason-only controls

Only the owner starts Loop C. The run may select decay half-life, state K, shrinkage weight, feature membership, regularization, calibration, bootstrap design, QB tiers, notification threshold, and era indicators. It regenerates the discrete margin artifacts, writes a new versioned config, and freezes it before Week 1.
