# Domain Pitfalls

**Domain:** NFL prediction and market analytics
**Researched:** 2026-08-24

## Critical pitfalls

### Temporal leakage

**What goes wrong:** Corrected stats, final injuries, closing prices, or later
games enter an earlier forecast.
**Consequence:** Backtests overstate accuracy and edge.
**Prevention:** Immutable as-of snapshots and row-level forecast cutoffs.
**Detection:** Assert every input timestamp is no later than its forecast.

### Selection on reported profitability

**What goes wrong:** A project or feature is adopted because its README reports
ROI or win rate.
**Consequence:** Survivorship bias and irreproducible performance.
**Prevention:** Reproduce on local rolling-origin rows with proper scores.
**Detection:** No source revision, no baseline, or no calibration output.

### Contradictory forecasts

**What goes wrong:** Score, spread, total, and win models are trained
independently.
**Consequence:** User-facing numbers describe different games.
**Prevention:** Derive markets from one joint score distribution.
**Detection:** Reconciliation tests fail.

### Public-versus-sharp overclaim

**What goes wrong:** Reverse line movement is labeled sharp money.
**Consequence:** Narrative masquerades as measured data.
**Prevention:** Require bet count/handle or a licensed sharp anchor.
**Detection:** A sharp label lacks source, sample, and timestamp.

### Double-counted player effects

**What goes wrong:** QB/player adjustments are added to team EPA that already
contains the same performance.
**Consequence:** Injuries create exaggerated line moves.
**Prevention:** Residualize player effects or replace, rather than stack, the
affected team-state component.
**Detection:** Player removal shifts exceed historical starter/backup residuals.

## Moderate pitfalls

- **NFL scoring geometry:** Generic continuous residuals miss pushes and key
  margins. Preserve discrete drive results and empirical closing residuals.
- **Small weekly samples:** Do not infer calibration or drift from a handful of
  displayed opportunities.
- **Participation gaps:** nflverse participation after 2023 is not an in-season
  source. Mark missing data rather than backfilling from the future.
- **Weather timing:** Poll-time weather is not kickoff weather.
- **Book comparison:** Prices at different points are not directly comparable.
- **Unlicensed repositories:** Public visibility is not permission to copy.
- **Stale public UI:** Never let a visitor trigger paid-provider refreshes.

## Phase-specific warnings

| Phase | Pitfall | Mitigation |
|---|---|---|
| Score simulator | Too many parameters for 17-game seasons | Hierarchical pooling and strong baselines |
| Player effects | Sparse roles and lineup confounding | Regularization, availability-only priors first |
| Clock model | Treating clock as average pace | Situation-dependent runoff, timeouts, score state |
| Public/handle | Vendor percentages lack stable history | Store immutable snapshots with sample size |
| Props | Normal residuals and player-name matching | Market-specific distributions and canonical IDs |
| Promotion | Challenger passes by chance | Same rows, multiple proper scores, offseason structure gate |

## Sources

- https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html
- https://github.com/nflverse/nfl4th
- https://github.com/nflverse/nflfastR
- https://arxiv.org/abs/1802.00998
- https://www.actionnetwork.com/general/faq
