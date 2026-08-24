# Research Summary: NFL Projection Lab

**Domain:** Public, leakage-safe NFL probabilistic forecasting and market analytics
**Researched:** 2026-08-24
**Overall confidence:** High for data/model foundations; medium for public-money data

## Executive summary

The strongest ecosystem is not a single competing application. It is a set of
reproducible components: nflverse for data contracts, nflfastR/fastrmodels for
expected-points and win-probability baselines, nfl4th for game-management
decisions, the Glickman–Stern state-space model for dynamic team strength, and
the nflWAR paper for multilevel player effects. FiveThirtyEight supplies a
simple frozen Elo and forecast-scoring baseline.

Projects with similar feature lists are useful for operational patterns, but
their README metrics are not evidence. NFL Algorithm is MIT-licensed and worth
auditing for pipeline gates and player-prop organization. BetIQ is useful for
CLV and review workflow, but its training-on-personal-picks design conflicts
with this project's prohibition on outcome-driven self-tuning.

The recommended next model is a coherent possession-and-score simulator, not a
larger black-box classifier. Dynamic team/player states feed drive count,
field position, conversion, explosive play, turnover, fourth-down, weather,
and clock components. Simulated home and away scores then produce internally
consistent margin, total, and moneyline probabilities.

Public-versus-sharp analysis is the main data constraint. Line movement and
book dispersion do not identify who placed a wager. Bet-count and handle labels
require a documented source such as Action Network's contributing sportsbooks,
while a sharp-market anchor requires licensed Pinnacle or exchange data. Until
then, the interface should say market pressure, not sharp money.

## Key findings

**Stack:** Keep the current TypeScript/Cloudflare/nflverse stack; add model
components only behind reproducible artifacts and rolling-origin tests.

**Architecture:** One joint score distribution should feed all game markets,
with the market comparison layer downstream and never fed back into team-pick
training.

**Critical pitfall:** Feature-list imitation and self-reported ROI create false
confidence. Only identical-row out-of-sample scoring and ablation justify an
adoption.

## Implications for roadmap

1. **Public boundary and provenance**
   - Remove production bindings, credentials, personal config, and trademarked
     assets from GitHub.
   - Add license, notice, security policy, and source registry.
2. **Forecast benchmark harness**
   - Score market, Elo, champion, and candidate models on the same rolling rows.
   - Add score-distribution and interval-coverage metrics.
3. **Coherent game distribution**
   - Model possessions and discrete drive outcomes.
   - Derive team score, margin, total, and moneyline from the same simulations.
4. **Player and game-management states**
   - Add hierarchical player availability/usage effects.
   - Validate fourth-down and clock modules against nfl4th/nflfastR.
5. **Market microstructure**
   - Add book dispersion and persistent line-pressure features.
   - Add public/handle or sharp-anchor labels only after licensed data exists.

**Phase ordering rationale:** Provenance and benchmarks precede new features;
the score distribution precedes player/clock refinements; market labels come
last because their data licensing and semantics are the least certain.

## Confidence assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | High | Existing stack already runs the required lifecycle and public read-only interface |
| Features | High | nflverse and peer-reviewed work support the core feature families |
| Architecture | High | Joint score generation prevents contradictory market forecasts |
| Public/sharp data | Medium | Real percentages exist, but open/licensed API access is not established |
| Comparable hobby projects | Low/medium | Useful code ideas; reported performance remains unverified |

## Gaps to address

- No freely documented API for durable NFL bet-count and handle history was
  verified.
- Player participation from nflverse is incomplete in-season after 2023; the
  engine needs a licensed or official current source.
- Tracking-level all-22 features remain unavailable as a complete free source.

## Primary sources

- https://github.com/nflverse
- https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html
- https://github.com/nflverse/nflfastR
- https://github.com/nflverse/fastrmodels
- https://github.com/nflverse/nfl4th
- https://www.glicko.net/research/nfl.pdf
- https://arxiv.org/abs/1802.00998
- https://github.com/fivethirtyeight/nfl-elo-game
- https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
- https://www.actionnetwork.com/general/faq
