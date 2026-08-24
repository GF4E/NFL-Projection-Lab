# Technology Stack

**Project:** NFL Projection Lab
**Researched:** 2026-08-24

## Recommended stack

### Core application

| Technology | Version/source | Purpose | Why |
|---|---|---|---|
| TypeScript | 5.9 | Domain logic and contracts | One typed language from ingestion through UI |
| Next.js/React | 16 / 19 | Public analytics interface | Existing working surface; server/client boundaries are established |
| Cloudflare Worker + D1 | Current Sites runtime | Scheduled jobs and state | Idempotent edge automation with a read-only public API |
| Vitest | 4 | Model and acceptance tests | Fast deterministic validation of mathematical contracts |

### Data and reference models

| Source | Purpose | Recommended use |
|---|---|---|
| nflverse/nflreadpy-compatible files | PBP, schedules, rosters, weekly player/team stats | Canonical public backbone |
| nflfastR/fastrmodels | EP, WP, CP, xYAC, xPass | Reproduce as frozen benchmark; port only tested MIT components |
| nfl4th | Fourth-down outcomes and decisions | Validation oracle before local implementation |
| Open-Meteo | Kickoff-hour weather | Existing outdoor/open-roof runtime source |
| The Odds API | Timestamped book contracts | Existing market layer; preserve quota and exact-contract semantics |

### Modeling

| Component | Recommended method | Reason |
|---|---|---|
| Team strength | Bayesian/state-space or validated Elo approximation | Dynamic strengths with mean reversion and state variance |
| Player effects | Regularized multilevel effects | Partial pooling for sparse players and roles |
| Drives | Count model with pace/game context | Converts team styles into possession opportunity |
| Drive result | Multinomial/discrete hazard model | Preserves TD/FG/safety/no-score structure |
| Scores | Seeded Monte Carlo from drive outcomes | Produces coherent team-score, total, margin, and win distributions |
| Market probabilities | Existing power de-vig + discrete translation + shrinkage | Keeps contract pricing mathematically consistent |
| Calibration | Frozen offseason mapping | Prevents midseason overfitting |

## Alternatives considered

| Category | Recommended | Alternative | Why not primary |
|---|---|---|---|
| Game prediction | Possession/score simulation | One gradient-boosted win classifier | Cannot guarantee consistent score, total, margin, and ML outputs |
| Player value | Multilevel effects | Raw EPA leaderboard | Confounds role, teammate, defense, and opportunity |
| Team state | Dynamic state-space | Static season average | Slow to reflect injuries and role changes |
| Sharp signal | Licensed anchor/real splits | Reverse line movement alone | Movement does not reveal bettor identity |
| Validation | Rolling origin + proper scores | Random split + accuracy | Random splits leak time; accuracy ignores calibration |

## Adoption policy

External Python or R packages remain reference implementations unless a
license permits use and a TypeScript port is justified. Cross-language
production dependencies are added only when reproduction is cheaper and safer
than a tested port.

## Sources

- https://github.com/nflverse/nflfastR
- https://github.com/nflverse/fastrmodels
- https://github.com/nflverse/nfl4th
- https://www.glicko.net/research/nfl.pdf
- https://arxiv.org/abs/1802.00998
- https://open-meteo.com/en/docs
- https://the-odds-api.com/liveapi/guides/v4/
