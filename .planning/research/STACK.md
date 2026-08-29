# Data and research stack

**Research date:** 2026-08-24  
**Decision rule:** A source is useful only if its fields, timestamps, coverage, license, and failure behavior support point-in-time replay.

## Recommended source stack

| Data domain | Primary source | Update/coverage reality | Uses | Principal risks | Recommendation |
|---|---|---|---|---|---|
| Play-by-play, schedules, finals, rosters | nflverse versioned Parquet via `nflreadpy` or direct releases | Play-by-play updates nightly after game days; schedules update about every five minutes; rosters daily | EPA, success, explosive rate, pace, PROE, possessions, scores, rest, team state, settlement | Revisions, schema drift, source-specific licenses, postgame fields accidentally leaking | Core source. Store raw hash, download time, source version, event as-of time, and schema version. |
| Historical injuries | nflverse through 2024 | Documented injury source has no data after 2024 | Historical availability features and backtest coverage | The historical feature becomes unavailable live after 2024; silent continuation would invalidate replay | Use through 2024 only and add a source-regime indicator. Do not impute a fake 2025/26 equivalent. |
| Current injuries and inactives | Official NFL/team injury reports and pregame inactive lists | Injury reports during game week; inactives and roof designation at kickoff minus 90 minutes | QB/role scenarios, inactive confirmation, late forecast refresh | HTML/source changes, incomplete team pages, identity matching, last-minute corrections | Primary live authority. Import atomically; preserve last good on any incomplete report. |
| Depth and role evidence | Official rosters/transactions plus nflverse depth and snap data | nflverse depth chart source changed after 2024; current data are timestamped rather than week-based; participation can lag until after season | Role probability, starter state, unit continuity, usage priors | A postgame depth snapshot can contaminate a pregame replay; participation is not fully live | Store event-time intervals and source confidence. Treat unofficial charts as hints, never authority. |
| Weekly player aggregates | nflverse NGS and PFR-derived weekly datasets | NGS player weekly stats update nightly; PFR advanced data daily | QB/receiver/rusher efficiency, separation, time to throw, RYOE, pressure proxies | Derived-stat definition changes and attribution limits; not raw tracking | Shadow-test position groups and version field dictionaries. |
| Raw player tracking | NFL Next Gen Stats / licensed tracking vendors | Raw tracking is available to clubs and selected research competitions, not as a complete public live feed | Separation, coverage, line interaction, route and pass-rush matchups | Licensing, cost, redistribution, non-longitudinal public subsets | Do not make this a dependency. Use only if a legal longitudinal license is obtained and independently validated. |
| Current mainline odds | The Odds API, US region | Current quotes include provider timestamps and quota headers; cost is per region and market | Exact contracts, power de-vig, market baseline, EV, snapshots, CLV | Provider/book latency, incomplete games, quota, bookmaker availability changes | Core source. Continue per-game atomic validation and prospective archiving. |
| Historical odds | The Odds API historical endpoint or another licensed archive | Paid; available from June 2020, generally 10-minute snapshots initially and 5-minute later | Historical forecast-time market baselines, open/close movement, CLV replay | Cost, sparse timestamps, book coverage, survivorship, licensing | Do not assume it is required. First build a 2026 prospective archive; buy only after a coverage/cost audit. |
| Reference/sharper market | Licensed Pinnacle/Circa/exchange feed if available | The Odds API lists Pinnacle in EU; public-site data may be delayed; Circa often requires another vendor | Price discovery, market-residual baseline, “sharp” evidence | Delay can reverse causality; vendor/book coverage and rights can change | Optional research source. Validate timestamp latency against live publication before calling it sharp. |
| Public betting splits | Vendor-specific ticket and money samples | Methods, clientele, and sample sizes are often opaque | Sentiment diagnostic | Selection bias, no stable population, weak comparability across books and weeks | Never use as an unlabeled probability feature. Require method, sample, and timestamp; keep diagnostic until prospective lift. |
| Kickoff-hour weather | Open-Meteo forecast API | Hourly forecasts; query for stadium kickoff time | Wind, temperature, precipitation for outdoor/open-roof states | Poll-time versus valid-time confusion; forecast revisions; coordinates/roof errors | Core situational input with roof gating. Store issue time, valid time, model/run, and raw response hash. |
| Historical forecast weather | Open-Meteo Historical Forecast and Single Runs APIs | Historical forecast archive begins around 2021/22; exact model-run availability varies | Leakage-safe weather backtesting by forecast horizon | Using observed weather instead of the issued forecast materially overstates information | Use forecasts as issued, not realized observations, for model training and replay. |
| Stadium/roof/time zone | nflverse stadium metadata plus official game operations source | Mostly stable but venue and roof designation can change | Coordinates, weather gating, travel, surface, kickoff time | Neutral-site games, temporary venues, roof status at 90 minutes | Version venue records per game and prefer official roof designation at minus 90. |
| Rules/era configuration | Official NFL operations publications | Rule changes by season | OT, kickoff, scoring, schedule, era intercepts | Narrative assumptions can become hardcoded folklore | Keep versioned config with source URLs and validation tests. |
| Human observations | Explicit, timestamped research note | User-entered before forecast lock | Scenario hypothesis, rationale, later review | Hindsight, confirmation bias, accidental model contamination | Store separately from training. Compare model-only and human-adjusted forecasts prospectively. |

## Required raw-data contract

Every imported observation needs enough metadata to answer “could the model have known this at forecast time?”

```text
source_name
source_record_id
source_url_or_release
source_published_at
captured_at
valid_from / valid_to
game_id / player_id / team_id
schema_version
raw_snapshot_hash
import_run_id
freshness_state
license_tag
```

Derived rows additionally require:

```text
feature_as_of
maximum_source_time
transformation_version
upstream_snapshot_hashes
missingness_flags
imputation_policy
```

If an input lacks a defensible `valid_from`, `captured_at`, or source lineage, it may be displayed as research context but may not enter a replayable forecast.

## Storage layers

1. **Raw immutable snapshots** — provider payloads or source-file manifests, never overwritten.
2. **Normalized event tables** — stable IDs, event time, capture time, and source regime.
3. **Point-in-time features** — one row per game and forecast horizon, with maximum source timestamp enforced.
4. **Forecast artifacts** — model/config/data hashes, full distribution, scenarios, intervals, and exact market contracts.
5. **Outcome and closing artifacts** — finals, last valid pre-kickoff quotes, realized availability/roof/weather, and correction lineage.
6. **Evaluation mart** — immutable champion/challenger/market rows with frozen eligibility rules.

## Data-source gaps that matter most

### 1. Historical forecast-time odds

The current free feed cannot reconstruct past openers, intermediate snapshots, or exact pre-kickoff closes. Without that archive, the model cannot honestly measure historical model-versus-market lift or book-specific CLV at each forecast horizon. Starting the prospective archive now is higher value than adding another football feature.

### 2. Live participation and role certainty

Public participation data can arrive after the season rather than during it. The engine therefore needs a probabilistic role layer built from official rosters, transactions, current practice/injury reports, recent snap shares, and explicit uncertainty. A current role must never be backfilled into an old forecast.

### 3. Reliable player interaction data

Public aggregates can support QB and usage effects but not complete assignment-level line, route, and coverage matchups. Those ideas belong in a licensed-data research branch, not the current production contract.

### 4. Auditable sharp/public evidence

Two consumer sportsbooks do not establish “public versus sharp.” A reference feed must be tested for latency and completeness, while public ticket/money samples require source methodology. Until then, the correct label is cross-book movement or sentiment—not sharp action.

### 5. Forecast-as-issued weather history

Using observed kickoff weather in a historical model gives it information the real forecast did not possess. Archived forecast runs are required to measure whether weather improves a forecast made 120, 90, 60, or 15 minutes before kickoff.

## Acquisition order

### Use now

1. Continue nflverse schedules, PBP, finals, rosters, snaps, and weekly aggregates.
2. Replace deprecated `nfl_data_py` dependencies with `nflreadpy` or direct versioned Parquet where applicable.
3. Continue atomic BetMGM/FanDuel snapshots and archive every accepted quote.
4. Normalize official 2026 injuries/inactives and roof state.
5. Archive Open-Meteo forecasts with issue and valid times.

### Add after coverage audit

1. A latency-tested reference market.
2. Paid historical odds only if the book/market/timestamp matrix supports the planned replay.
3. Licensed charting or tracking only for a preregistered player/unit experiment.

### Do not acquire merely because it is available

- opaque ticket/money split feeds;
- scraped “expert picks” as training labels;
- social sentiment;
- unverifiable historical injury compilations;
- observed historical weather substituted for forecasts;
- data whose public redistribution terms conflict with the repository.

## Primary sources

- [nflverse data update schedule and availability](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
- [`nfl_data_py` deprecation notice](https://github.com/nflverse/nfl_data_py)
- [nflverse data releases](https://github.com/nflverse/nflverse-data)
- [nflverse depth-chart dictionary](https://nflreadr.nflverse.com/articles/dictionary_depth_charts.html)
- [The Odds API v4 guide and quota headers](https://the-odds-api.com/liveapi/guides/v4/)
- [The Odds API historical data](https://the-odds-api.com/historical-odds-data/)
- [The Odds API bookmaker availability](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html)
- [NFL pregame preparation and 90-minute procedures](https://operations.nfl.com/game-operations-logistics/preparation-safety/game-and-stadium-prep)
- [Open-Meteo forecast API](https://open-meteo.com/en/docs)
- [Open-Meteo historical forecast API](https://open-meteo.com/en/docs/historical-forecast-api)
- [Open-Meteo single-model runs](https://open-meteo.com/en/docs/single-runs-api)
- [NFL Next Gen Stats technology and access](https://operations.nfl.com/gameday/technology/nfl-next-gen-stats)

