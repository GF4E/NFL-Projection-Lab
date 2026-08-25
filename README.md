# NFL Projection Lab

A public NFL analytics site for comparing live market prices with leakage-safe model probabilities, uncertainty, and matchup evidence. There are no user accounts, shared picks, personal records, or wagering actions.

## Public experience

- The current 2026 weekly slate, grouped by kickoff day and shown in Pacific time.
- BetMGM and FanDuel spreads, totals, and moneylines with capture age and market vig.
- Model-implied spreads and totals, shrunk bet probabilities, expected value, 80% uncertainty intervals, and quarter-Kelly reference sizing.
- A neutral edge board with no favorite-team preferences or user-specific filtering.
- Expandable game analysis showing only material, timestamped evidence: opponent-adjusted efficiency, availability, weather, market movement, and market sentiment.
- A temporary value lab for analyzing straight, parlay, and teaser pricing. Selections stay in the browser session and are never saved.
- A public methodology page explaining the model and its safeguards.

## Statistical engine

- Discrete, decay-weighted NFL margin tables with data-derived mass at 3, 6, 7, 10, and 14. Quotes at different posted points are translated before price or EV comparison.
- Power-method de-vigging for moneylines, spreads, and totals.
- A frozen 25% model / 75% market probability blend.
- Quarter-Kelly reference sizing on a 100-unit bankroll, rounded down to 0.5 units and capped at 2 units.
- Season-varying home-field and scoring effects, weekly team-state updates, a gated champion/challenger refit, and deterministic model/data/config hashes.
- A 100-member fixed-seed season-week block bootstrap that preserves time-decay weights; displayed suggestions are muted when the 80% edge interval spans zero.
- BetMGM/FanDuel comparison, translated price deltas, line movement, edge decay, current injury/QB state, and kickoff-hour weather.
- A data-fit joint home/away score distribution that reconciles team-score projections with moneyline, spread, total, tie, and push probabilities.
- Prospective all-game scoring, scenario dossiers, and a registered market/count/possession model bakeoff. Human adjustments remain separate from model training.

## Automatic data

- nflverse schedules, finals, rosters, and play-by-play aggregates.
- The Odds API for BetMGM and FanDuel market snapshots.
- Official NFL/team sources for current injury reports and inactives.
- Open-Meteo for outdoor or open-roof kickoff-hour weather.

The Cloudflare Worker runs the refresh and model lifecycle on its schedule. Public HTTP access cannot choose provider requests, trigger model refits, modify forecasts, or create records. A weekly-board navigation may claim only one deterministic scheduled recovery lease; repeated visits cannot spend twice. A failed import preserves the last validated data. A partial odds board publishes only complete two-book games and marks each incomplete game stale.

## Local preview

Use Node 22+ and pnpm:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/sunday`.

## Environment

Copy `.env.example` to `.env.local` for local provider-backed work. nflverse itself does not require an API key.

The primary runtime value is `ODDS_API_KEY`. Scheduled administrative jobs use `CRON_SECRET`; those write paths are never exposed through the public interface.

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
