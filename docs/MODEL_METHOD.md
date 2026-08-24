# Model method and promotion doctrine

## Forecast targets

For every scheduled game, the engine should eventually publish one coherent
joint forecast containing:

- Home and away score distributions.
- Margin, total, and win probabilities.
- Calibrated uncertainty and interval coverage.
- Market-relative probabilities and book-specific expected value.
- Material player availability, usage, matchup, weather, rest, travel, and
  game-management inputs.

Score, margin, total, and moneyline outputs must come from the same simulated
or probabilistic game distribution. Independently trained numbers that cannot
reconcile are diagnostics, not production forecasts.

## Model layers

1. **Data contract:** leakage-safe snapshots of schedule, play-by-play, player,
   availability, weather, and market data.
2. **Team state:** dynamic offense, defense, special-teams, and quarterback
   strength with offseason variance widening.
3. **Possession model:** expected drives, pace, field position, conversion,
   explosive plays, turnovers, fourth-down choices, and clock effects.
4. **Scoring model:** discrete drive outcomes and correlated team scores,
   preserving NFL scoring shapes and key margins.
5. **Market layer:** power de-vigging, discrete point translation, market
   shrinkage, line movement, book dispersion, and book-specific EV.
6. **Uncertainty layer:** seed-fixed bootstrap or posterior simulation, proper
   scoring rules, calibration, and interval coverage.

## Evaluation hierarchy

Primary model metrics are out-of-sample log loss, Brier score, calibration
slope/intercept, score and margin error, and interval coverage. CLV evaluates
market-relative decision quality. Win rate and ROI are descriptive and must
not drive in-season training.

Every experiment uses rolling-origin splits. The market baseline, current
champion, and challenger receive identical rows and forecast cutoffs.

## Promotion

Weekly state refreshes may update team and player states. Coefficient changes
require the existing promotion gate. Feature membership, hyperparameters,
calibration mapping, score-distribution structure, and research-source
adoptions are offseason-only.

## Public-versus-sharp language

Bet count and handle percentages may be shown only when supplied by a
documented, licensed source. Without those fields, the engine may report:

- Open-to-current movement.
- Cross-book dispersion.
- Timing and persistence of moves.
- Movement against a documented public percentage.
- Difference from a separately licensed sharp-market anchor.

Line movement alone is `market pressure`, not proof of sharp action.
