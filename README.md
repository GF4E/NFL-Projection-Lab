# NFL Projection Lab

A public, read-only NFL analytics prototype. There are no active user accounts or wagering actions.

## Current qualification state

The deployed interface and many analytics components predate the Prediction Engine OS audit. They are retained as a demo and research evidence, not as a validated production forecast. Legacy teammate labels and storage types also remain, so OS-18B's personal-state-free public-release gate has not passed. Live acquisition is intentionally disabled, no Odds API credential is installed, lines may be stale or absent, and no prospective 2026 forecast stream has started. Module 1 and Module 2 remain `reject_all`; Module 2B and every downstream drive, quarterback, and player experiment are blocked by the terminal-invalid R1-v1 target audit. See [the execution state](.planning/engine-os/STATE.md) for the authoritative status.

## Public experience

- The current 2026 weekly slate, grouped by kickoff day and shown in Pacific time.
- Cached BetMGM and FanDuel spreads, totals, and moneylines when qualified snapshots exist; otherwise the interface must show stale or unavailable.
- Legacy model-implied fields and research displays that are not yet prospectively qualified.
- A neutral edge board with no favorite-team preferences or user-specific filtering.
- Expandable game analysis showing only material, timestamped evidence: opponent-adjusted efficiency, availability, weather, market movement, and market sentiment.
- A temporary value lab for analyzing straight, parlay, and teaser pricing. Selections stay in the browser session and are never saved.
- A public methodology page explaining the model and its safeguards.

## Retained statistical research

- Discrete, decay-weighted NFL margin tables with data-derived mass at 3, 6, 7, 10, and 14. Quotes at different posted points are translated before price or EV comparison.
- Power-method de-vigging for moneylines, spreads, and totals.
- A frozen 25% model / 75% market probability blend.
- Quarter-Kelly reference sizing on a 100-unit bankroll, rounded down to 0.5 units and capped at 2 units.
- Season-varying home-field and scoring effects, weekly team-state updates, a gated champion/challenger refit, and deterministic model/data/config hashes.
- A 100-member fixed-seed season-week block bootstrap that preserves time-decay weights; displayed suggestions are muted when the 80% edge interval spans zero.
- BetMGM/FanDuel comparison, translated price deltas, line movement, edge decay, current injury/QB state, and kickoff-hour weather.
- A data-fit joint home/away score distribution that reconciles team-score projections with moneyline, spread, total, tie, and push probabilities.
- Contracts and prototypes for prospective all-game scoring, scenario dossiers, and registered model bakeoffs. Human adjustments remain separate from model training.

These components describe preserved work and intended contracts. Their presence in source or the interface does not make a candidate accepted, calibrated prospectively, or eligible to populate a production prediction endpoint.

## Data connectors

- nflverse schedules, finals, rosters, and play-by-play aggregates.
- The Odds API for BetMGM and FanDuel market snapshots.
- Official NFL/team sources for current injury reports and inactives.
- Open-Meteo for outdoor or open-roof kickoff-hour weather.

The connectors are present, but the scheduled acquisition switch defaults off while evidence, origin, quota, and package-activation gates remain open. The active Worker does not run coefficient refits. Public HTTP rejects every mutating method before framework routing and exposes only explicit read APIs. When acquisition is eventually qualified, a failed import must preserve the last validated data and partial boards must remain stale rather than silently publish.

## Local preview

Use Node 22+ and pnpm:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/sunday`.

## Environment

Copy `.env.example` to `.env.local` for local, non-production development. nflverse itself does not require an API key.

Do not install `ODDS_API_KEY` yet. The previously exposed credential must first be revoked by the account owner; its replacement stays outside source and chat until OS-19A proves atomic quota reservation and the actual-schedule budget. Even after secret installation, `ENGINE_OS_CAPTURE_ENABLED` must remain false until every activation gate passes. Cloudflare cron invokes the scheduled Worker handler directly, but it exits without acquisition unless that switch is exactly `true`.

## Frozen 2026 settings

- Books: BetMGM and FanDuel
- Shrinkage weight: `w = 0.25`
- Strength-state update: `K = 0.005`, maintained in shadow and withheld from production pending stable validation
- Bootstrap: 100 fixed-seed season-week block coefficient refits; 10th/90th edge percentiles
- Sizing display: quarter-Kelly, 100-unit reference, 0.5-unit floor, 2-unit cap
- Credit alert / ceiling: 400 / 450

October, November, and December each reach the enforced 450-credit ceiling in the frozen reservation simulation, so lower-priority snapshots are withheld before essential windows.

Structural settings live in `config/structural.config.json`; era definitions and provenance live in `config/era.config.json`. Structural changes are offseason-only.

The ten-part research and build sequence lives in [`docs/ENGINE_QA.md`](docs/ENGINE_QA.md), backed by the machine-validated decision framework in `config/engine-framework.config.json` and answer ledger in `config/engine-decisions.json`. The [`Novelty Charter`](docs/NOVELTY_CHARTER.md) separates commodity forecast machinery from the scenario-aware decision dossier the project will test as its distinctive contribution, including explicit robust, fragile, and indeterminate states. Architecture records document each accepted boundary and its validation burden.

The [`confidence-engine contract`](docs/CONFIDENCE_ENGINE.md) documents immutable point-in-time rows, the three-candidate score-model bakeoff, prospective evaluation, research lanes, the 52-question answer registry, and model-versus-human scorekeeping.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

This project is for education and analysis. Model estimates are uncertain and are not instructions to wager.
