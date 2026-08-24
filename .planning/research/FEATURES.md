# Feature Landscape

**Domain:** NFL game-distribution and market analytics
**Researched:** 2026-08-24

## Table stakes

| Feature | Why expected | Complexity | Notes |
|---|---|---|---|
| Team score, margin, total, win distribution | Core forecast object | High | Must be internally coherent |
| Dynamic team offense/defense/special teams | NFL strength changes weekly | High | Widen uncertainty after offseason |
| QB and player availability | Largest identifiable personnel shifts | High | Partial pooling and explicit source time |
| Pace, pass rate, EPA, success, explosiveness | Stable team-style evidence | Medium | Opponent adjust and regress |
| Weather/roof at kickoff | Material for wind-sensitive plays | Medium | Forecast-valid time, not poll time |
| Exact book point/price comparison | EV is contract-specific | Medium | Translate different points first |
| Proper calibration and intervals | Confidence needs statistical meaning | High | Report coverage, not cosmetic labels |
| Stale/leakage safeguards | Bad timing invalidates every model | High | Fail closed |

## Differentiators

| Feature | Value proposition | Complexity | Notes |
|---|---|---|---|
| Discrete NFL score simulator | Respects football scoring and key margins | High | Drive outcomes and correlation |
| Clock/game-management layer | Captures late-game totals and margin shape | High | Validate against nfl4th/nflfastR |
| Player-to-team effect propagation | Converts availability into score distributions | High | Avoid double-counting QB/team EPA |
| Source-adoption registry | Makes learning auditable | Low | License, hypothesis, test, decision |
| Market-pressure classification | Separates observed moves from narratives | Medium | Never call it sharp without data |
| Champion/challenger artifacts | Reproducible, reversible progress | Medium | Existing lifecycle foundation |

## Anti-features

| Anti-feature | Why avoid | Use instead |
|---|---|---|
| Training on user picks or recent ROI | Fits a tiny, selected sample | Decision review outside model training |
| Automatic in-season feature selection | Structural overfit | Offseason experiments only |
| Unlicensed code copying | Legal and reproducibility risk | Cite methodology or reimplement from first principles |
| Win-rate leaderboards as primary proof | Ignores price and calibration | Log loss, Brier, calibration, CLV |
| Normal score/margin shortcut | Misses pushes and key-number mass | Discrete empirical/simulation distribution |
| Sharp label from a line move | Unverifiable bettor identity | Market pressure, dispersion, licensed splits |
| Parlays assuming independence | Inflated EV | Joint simulation/correlation model |

## Feature dependencies

```
Data snapshots
  -> dynamic team/player states
  -> possession and drive-result models
  -> joint score simulations
  -> spread/total/moneyline probabilities
  -> market translation and EV
  -> calibrated confidence and monitoring
```

Public/handle splits and sharp anchors are parallel advisory inputs to the
market layer; they do not alter the historical team-state target without a
separate validated experiment.

## Next release recommendation

Prioritize:

1. Frozen forecast-benchmark harness.
2. Joint team-score simulation artifact.
3. Fourth-down/clock validation module.

Defer public-versus-sharp labels until the source supplies timestamped bet
count, handle, sample size, and licensing.

## Sources

- https://nflreadr.nflverse.com/reference/index.html
- https://github.com/nflverse/fastrmodels
- https://github.com/nflverse/nfl4th
- https://arxiv.org/abs/1802.00998
- https://www.actionnetwork.com/general/faq
