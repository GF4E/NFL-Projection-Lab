# Confidence engine

The confidence engine is a background measurement system. Its purpose is to determine whether a model, feature family, scenario assumption, or explicit human adjustment adds prospective information. It does not create a single unexplained confidence score.

## Forecast contract

Every archived forecast binds:

- one game and forecast horizon;
- one generation timestamp and maximum information timestamp;
- source, schema, license, data, configuration, feature-row, and model hashes;
- a normalized joint home/away score distribution;
- derived moneyline, spread, total, tie, and push probabilities;
- current named-book market baselines;
- supported and unresolved scenario branches;
- an explicit `robust`, `fragile`, or `indeterminate` decision state.

The public decision board receives only score summaries and diagnostics. The probability grid is stored by scheduled background work so it does not inflate browser payloads.

## Baselines and challengers

The engine implements reproducible SRS, quarterback-adjusted Elo, and power-de-vigged market baselines. Three score-distribution candidates share one evaluation contract:

1. market-anchored discrete count distribution;
2. correlated negative-binomial team-score distribution;
3. fixed-seed possession simulation.

Count dispersion and home/away score dependence are fit from decay-weighted historical market residuals. Candidate selection is not automatic. A candidate is rejected if it omits a game or changes a point, total, outcome, or forecast horizon relative to the market baseline.

## Evaluation

Every eligible game forecast—not only displayed opportunities—is scored after the final. Stored diagnostics include:

- joint score log score;
- margin and total discrete CRPS;
- pooled market log loss and Brier decomposition;
- calibration intercept and slope;
- 80% home-score, away-score, margin, and total coverage;
- margin and total probability-integral-transform values;
- score, margin, and total absolute error;
- scenario-state multiclass Brier score when the state resolves.

Closing-value and selected-opportunity reports remain separate from this all-game probability scorecard.

## Research governance

Ideas enter one of three lanes:

- `foundation`: established inputs and controls used by the baseline;
- `shadow`: plausible incremental signals evaluated prospectively;
- `quarantined`: narrative, opaque, licensed, or high-confounding ideas that cannot enter production directly.

Every experiment is preregistered with its source coverage, baseline, transformation, rows, primary metric, calibration and interval gates, multiplicity family, and falsifier. Structural promotion is offseason-only. Quarantined ideas must first pass a shadow experiment. Negative and deferred results remain in the ledger.

The 52-question catalog in `config/research-questions.config.json` converts the research program into answer gates. Answers cannot waive point-in-time validity, proper scoring, calibration, uncertainty, licensing, or immutable provenance.

## Human judgment

A model forecast is frozen before a human adjustment can exist. The adjustment has its own source, timestamp, rationale, scenario weights, and hash. It is always marked `trainingEligible: false`. Model-only and human-adjusted distributions are evaluated prospectively with identical rules; a recurring insight becomes a research hypothesis, never a direct training label.

## Failure behavior

Scheduled work archives only fresh, complete forecasts from registered baseline or champion models. Stale quotes preserve the last good artifact and create an in-app system alert. Missing or partial sources cannot silently modify a point-in-time row. Public HTTP routes are read-only and cannot publish models, forecasts, experiments, or adjustments.

