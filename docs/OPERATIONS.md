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

## Interim scheduler status

OS-15A installs two deterministic, provider-free scheduler entrypoints: a one-minute dispatcher (`* * * * *`) and an independent odd-minute watchdog (`1-59/2 * * * *`). Both return before database access unless `ENGINE_OS_CAPTURE_ENABLED=true`. That key is absent in production, no activation row exists, and the scheduler tables are empty. Public page or API requests never claim jobs, perform recovery, fetch a provider, or cause writes.

The scheduler qualification covers only forecast-or-withholding coordination over the five OS-02A origins. The legacy source automations below are retained code awaiting OS-03A/OS-15 integration and are not active production instructions.

## Legacy nflverse automation — disabled

- Live schedules: checked every five minutes; unchanged ETags produce no data writes.
- Schedule history: loaded on first run and revalidated after Tuesday 06:00 Pacific once the prior refresh is at least six days old.
- Current-season play-by-play: checked once per Pacific calendar day after 01:00; a later trigger catches up if the overnight trigger was missed.
- Historical play-by-play: missing seasons from the 2010 training boundary are filled newest-first, one season per trigger after 01:00.
- Storage: play rows are streamed from the compressed nflverse CSV and reduced to team-game feature rows before D1 publication. Older concatenated-gzip releases automatically retry the equivalent uncompressed nflverse CSV when the edge decompressor rejects trailing members.

The importer stages validated rows before publication. A schema, row-count, HTTP, decompression, or parsing failure marks the dataset stale, creates an idempotent data alert, releases the import lease, and leaves the prior production rows untouched.

## Legacy pregame context automation — disabled

The retained legacy design begins the official pregame check 95 minutes before each distinct kickoff. It reads the NFL inactives landing page, discovers the current week’s official NFL inactive article through the league’s monthly article index, and accepts a game only when both teams have complete lists. Fixed and outdoor roofs come from the versioned venue configuration; retractable venues require an explicit `open` or `closed` field from the official game center. Missing, partial, or ambiguous responses create an in-app alert and preserve the last good inactives, roof, weather, and forecast. OS-03A and the later full OS-15 DAG must qualify this lane before activation.

The site adds no pregame settings page. A confirmed list only replaces the existing compact availability line on the open game card, including an explicit inactive-QB cue when applicable.

## Failure contract

1. Start or reuse the deterministic pipeline key.
2. Validate HTTP status, completeness, schema, row counts, and source freshness before publishing anything.
3. On any failure, abort the transaction, mark the run failed, create one idempotent in-app alert, mark dependent forecasts stale, and continue serving the last good forecast.
4. Never update an approved revision. Never promote a challenger outside the atomic gate transaction.

For live odds, one game is the atomic validation boundary. A game publishes only when both execution books provide both sides of spread, total, and moneyline. Complete games may publish from a partial provider slate; incomplete games retain their last validated snapshot, carry an explicit stale state, and are excluded from the new snapshot key.

Stale game prices remain visible for context but are excluded from the weekly opportunity queue, EV recommendations, and suggested units until that game receives a complete current snapshot.

The scheduled Worker is the intended control plane. Recovery is scheduler-only: navigation and other public reads cannot claim a lease or trigger provider work. The independent watchdog records missed ticks under the frozen OS-15A bounds; it cannot replay a missed origin as prospective.

## Credit throttle

At a response-header usage of 400:

1. Remove ordinary Tuesday–Saturday snapshots.
2. If required, remove −120-minute snapshots.
3. Keep −60-minute snapshots only while the projected period remains at or below 450.
4. Always preserve Sunday/Monday openers and −15-minute closes.

## Offseason-only controls

Only the owner starts Loop C. The run may select decay half-life, state K, shrinkage weight, feature membership, regularization, calibration, bootstrap design, QB tiers, notification threshold, and era indicators. It regenerates the discrete margin artifacts, writes a new versioned config, and freezes it before Week 1.
