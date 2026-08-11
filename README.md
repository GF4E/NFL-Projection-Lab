# NFL Projection Lab v1.1

A private NFL research, weekly card-building, and bet-tracking workspace. The main workflow targets roughly $400–$600 of weekly rehearsal plays across singles, parlays, and teasers. The application records decisions and never places a wager.

## Product workflow

- **Weekly card:** one compact play sheet with the bet, book, price, model edge, estimated EV, stake, confidence, and both the statistical and football cases.
- **Simple intake:** a short form adds a single, parlay, or teaser to the persistent shared ledger; the detailed statistical context stays one click deeper.
- **Research desk:** primary-data observations, trends, sample sizes, source freshness, uncertainty, and explicit warnings against treating descriptive patterns as causal.
- **Team room:** Gabe owns the market/model read; Jarrett owns personnel, form, chemistry, and the football veto. The two roles are complementary, not competitive.
- **Bet tracker:** a separate ledger for placed and settled plays, with stake, result, dollar and unit profit, ROI, and CLV.

The example Week 1 card contains eight plays totaling $400, or 16 units. It is rehearsal data, not a live recommendation.

## Statistical engine

- Discrete, decay-weighted NFL margin tables with data-derived mass at 3, 6, 7, 10, and 14. Different posted points must be translated to a canonical point before price or EV comparison.
- Power-method de-vigging for moneylines, spreads, and totals; a frozen 25% model / 75% market blend; translated book EV; quarter-Kelly on a 100u reference bankroll; 0.5u floor and 2u cap.
- Weighted logistic champion/challenger models with season-varying home-field and scoring effects, fixed structural configuration, a Tuesday promotion gate, deterministic model/data/config hashes, and a 100-member fixed-seed refit bootstrap.
- Immutable team-card revisions, exact-contract approval hashes, quote rechecks, two-person approval, cash-placement confirmation, paper-book selection, kickoff locking, stale-draft expiry, and no automatic approval.
- BetMGM/FanDuel comparison, translated price delta, uncertainty display, movement/edge-decay views, snapshot ages, current injury/QB/weather inputs, and Sunday Mode.
- Separate Full and Executed-only records with book-specific translated CLV in cents and points.
- Provider adapters for The Odds API, nflverse, official current injury feeds, and Open-Meteo kickoff-hour forecasts.
- Private Supabase authentication, two-person team membership, row-level access controls, owner-only overrides/corrections/configuration/access, operational ledgers, and database-level approval/quote guards.
- Exactly two Web Push types: `awaiting_you` and `edge_threshold`.
- A 20-case acceptance suite covering the original engine plus the simplified weekly-card and tracker workflow.

The interface starts with rehearsal data so the workflow can be reviewed before credentials and the live 2026 feeds are enabled.

## Local preview

Use the bundled or a standard Node 22+ environment.

```bash
pnpm install
NEXT_PUBLIC_DEMO_MODE=true pnpm dev
```

Open `http://localhost:3000/sunday`.

## Persistent site storage

The deployed card and tracker use a private D1 database. The generated migration lives in `drizzle/`; runtime initialization is idempotent and seeds the eight-play rehearsal card only when the database is empty.

## Optional live-data setup

1. Create a Supabase project.
2. Run both SQL files in `supabase/migrations/` in filename order.
3. Sign in once as the owner and update the placeholders in `supabase/seed.sql` before running it. The seed creates only the owner membership and no teammate invitation.
4. Copy `.env.example` to `.env.local` and add Supabase, Odds API, cron, official-injury feed, and VAPID values. Keep `NEXT_PUBLIC_DEMO_MODE=false` in a deployed environment.
5. Configure an America/Los_Angeles-aware scheduler against the authenticated `/api/jobs/[job]` endpoint. Every request must carry `Authorization: Bearer $CRON_SECRET` and a deterministic `x-scheduled-for` timestamp.
6. Run `pnpm verify` before deployment.

No unauthenticated application API is exposed. Provider jobs use the service role only after the cron bearer check; teammates use Supabase user sessions and RLS.

## Frozen 2026 settings

- `1u = $25`
- Books: BetMGM and FanDuel
- Shrinkage weight: `w = 0.25`
- Bootstrap: 100 fixed-seed coefficient refits; 10th/90th edge percentiles
- Suggested size: quarter-Kelly, 100u reference, floor down to 0.5u, cap 2u
- Limits: one side and one total per game, 3u per game, 2u per play; weekly target 16u and ceiling 24u ($400–$600)
- Edge push threshold: absolute 3.0 percentage points
- Credit alert / ceiling: 400 / 450

Structural settings live in `config/structural.config.json`; era definitions and provenance live in `config/era.config.json`. Neither is a code constant. Changes are offseason-only.

## Data and failure behavior

- Historical training begins in 2010 and excludes no season. Time decay and season effects handle era drift.
- Key-margin estimation starts in 2015.
- nflverse injuries are rejected after 2024 until the feed is demonstrably restored. Current reports and 90-minute inactives come from an official NFL/team source.
- Open-Meteo values must be valid for kickoff hour and are withheld for closed/fixed roofs.
- A partial, stale, missing, or schema-invalid import aborts, creates an in-app alert, marks dependents stale, and preserves the last good values.
- Finals come from nflverse, never The Odds API scores endpoint.

The actual published 2026 nflverse schedule was reduced to distinct kickoff windows in `config/2026-credit-simulation.json`. November is the busiest projected billing period at 408 credits, firing the alert while remaining under the 450 ceiling.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
NEXT_PUBLIC_DEMO_MODE=true pnpm build
```

The acceptance test names correspond to the 17 engine tests plus three simplified-workflow tests in `tests/acceptance.test.ts`.
