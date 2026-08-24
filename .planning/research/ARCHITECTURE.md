# Architecture Patterns

**Domain:** NFL probabilistic forecasting
**Researched:** 2026-08-24

## Recommended architecture

```
immutable source snapshots
        |
        v
feature/state builder ----> provenance and leakage ledger
        |
        v
team + player latent states
        |
        v
possession / drive / clock simulator
        |
        v
joint home-away score samples
        |
        +--> team scores / margin / total / win probability
        |
        v
market de-vig / point translation / shrinkage
        |
        v
book-specific EV + uncertainty + public analytics
```

## Component boundaries

| Component | Responsibility | Communicates with |
|---|---|---|
| Snapshot ledger | Immutable inputs and forecast cutoffs | All builders |
| Feature builder | Rolling, opponent-adjusted team/player inputs | State model |
| State model | Latent team/unit/player strengths and variance | Simulator |
| Game simulator | Drives, field position, scoring, clock, fourth down | Forecast artifact |
| Forecast artifact | Joint samples and derived probabilities | Market layer, monitoring |
| Market layer | De-vig, translation, shrinkage, EV, CLV | Public API |
| Lifecycle gate | Champion/challenger evaluation and hashes | State/model registry |
| Public API/UI | Read-only display of validated artifacts | No write path |

## Patterns to follow

### One latent game, many markets

Generate all market probabilities from the same score samples. This prevents a
home win probability that conflicts with the projected margin or total.

### Forecast-time snapshots

Every feature carries an available-at timestamp. Training reconstructs what
was knowable at each forecast time, not merely the final corrected record.

### Baseline-first adoption

An external method enters as a benchmark. A local candidate must reproduce its
published behavior before claiming an improvement.

### Advisory market metadata

Public/handle and market-pressure fields remain separate from football
features. Their provenance and timestamp are visible, and missing values do
not become zeroes.

## Anti-patterns

### Independent endpoint models

Separate score, spread, total, and moneyline models can disagree. Use one joint
distribution and retain separate models only as diagnostics.

### Mutable historical joins

Joining a final roster, injury status, or closing line into an earlier
forecast leaks future information. Use as-of joins with explicit cutoffs.

### Silent fallback

Using a partial current import as though it were complete corrupts forecasts.
Serve the last good artifact with a stale badge.

## Scalability

The hobby site does not need per-request simulation. Scheduled jobs persist
seeded forecast samples or sufficient summaries. Public requests read
materialized artifacts, preserving provider quota and predictable latency.

## Sources

- https://www.glicko.net/research/nfl.pdf
- https://github.com/nflverse/nflfastR
- https://github.com/nflverse/nfl4th
- https://arxiv.org/abs/1802.00998
