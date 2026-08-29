# Continuous learning architecture

**Research date:** 2026-08-24  
**Objective:** Increase the reliability and usefulness of probability forecasts without allowing short-term results, human selections, or silent data changes to tune the model.

## The distinction that governs the system

The engine is **self-updating**, not autonomously self-improving.

- State updates use newly completed games and current forecast-time information under frozen rules.
- Coefficients may change only through the logged champion/challenger gate.
- Features, hyperparameters, scenario rules, calibration method, and structural artifacts change only through an offseason research decision.
- Human decisions and pick results are evaluated separately and never become automatic training labels.

This prevents a small, selected weekly sample from converting randomness into apparent learning.

## Six linked loops

```text
Sources
  -> 1. Data observability
  -> 2. Point-in-time state and features
  -> 3. Forecast + scenario generation
  -> 4. Outcome and closing-market capture
  -> 5. Prequential evaluation and diagnosis
  -> 6. Preregistered research + promotion
       -> champion/config registry -> back to forecast generation

Human judgment runs beside loops 3-5:
model-only forecast -> explicit human scenario/adjustment -> separate scorecard
```

### Loop 1 — data observability

**Purpose:** Prove that the input is complete, current, and replayable before it changes a forecast.

1. Fetch to a new immutable snapshot key.
2. Validate schema, row counts, game/book/side completeness, time bounds, and source freshness.
3. Normalize identities without overwriting the raw artifact.
4. Publish the snapshot atomically only if every required contract passes.
5. Otherwise preserve the last good snapshot, mark dependents stale, and alert in-app.

Required measurements:

- source latency and capture lag;
- coverage by game, team, player, book, and field;
- schema drift and missingness;
- duplicate/correction rate;
- provider quota and failure rate;
- last-good age.

### Loop 2 — point-in-time state and features

**Purpose:** Convert valid observations into leakage-safe rows.

For a forecast generated at time `t`:

- completed-game features may use only games finished before the declared week boundary;
- odds, official status, and weather may use only accepted snapshots captured at or before `t`;
- each derived row stores its maximum upstream timestamp and hashes;
- current-season team states update automatically under frozen decay and state equations;
- missing live roles or states become explicit missingness/scenario uncertainty, not post hoc backfill.

Hard invariant:

```text
max(input.available_at) <= forecast.generated_at
```

The system should enforce this invariant in data code and test it on every historical replay.

### Loop 3 — forecast and scenario generation

**Purpose:** Emit an internally coherent, reproducible decision dossier at defined horizons.

At opener, scheduled daily refreshes, and kickoff minus 120/90/60/15 minutes:

1. Resolve the logged live champion and frozen structural config.
2. Create supported branches for unresolved material states such as QB, inactive, and roof/weather.
3. Produce a normalized joint score distribution for every branch.
4. Derive team scores, moneyline, spread, total, ties, and pushes from the same outcomes.
5. Aggregate branches with frozen scenario weights while preserving branch outputs.
6. Compare to power-de-vigged exact contracts after discrete point translation.
7. Produce uncertainty intervals from the fixed-seed ensemble/bootstrap.
8. Classify robust, fragile, or indeterminate and name the concrete condition that changes the view.
9. Freeze all inputs, distributions, hashes, quote timestamps, and display values.

No forecast is emitted from an unlogged model, partial market, unsupported scenario, or structurally changed configuration.

### Loop 4 — outcome and closing-market capture

**Purpose:** Record what happened without rewriting what was predicted.

After kickoff and settlement:

- freeze the last complete named-book quote strictly before kickoff;
- store consensus and per-book closing contracts separately;
- capture official inactives/roof state that resolved each scenario;
- settle final scores from nflverse finals;
- store realized weather for diagnosis, while retaining the forecast-as-issued input;
- apply corrections as new immutable revisions;
- compute translated price CLV and directional point CLV against the proper book.

Every forecast is evaluated, including games with no displayed opportunity. Scoring only selected edges creates selection bias.

### Loop 5 — prequential evaluation and diagnosis

**Purpose:** Ask whether forecasts remain honest, informative, and operationally trustworthy as new games arrive.

Evaluate each frozen forecast after its outcome becomes known. Report cumulative and rolling results for champion, challengers, simple football baselines, and the de-vigged market on identical rows.

#### Probability/distribution scorecard

- pooled and per-market log loss;
- Brier score and decomposition into reliability/resolution where practical;
- joint score log score and selected multivariate distribution score;
- calibration intercept and slope;
- reliability curves with sample counts;
- PIT/rank histograms and key-score/push mass;
- 80% interval coverage and width;
- score covariance, tail, tie, and overtime diagnostics.

#### Decision-support scorecard

- robust/fragile/indeterminate frequency;
- sign and sizing-floor survival from opener to close;
- scenario-state probability calibration;
- threshold accuracy: did the stated line/status/weather change actually change the result?;
- realized book-specific CLV versus displayed edge;
- percentage beating the named-book close;
- model-versus-market disagreement calibration.

#### Operational scorecard

- data freshness and incomplete-source rates;
- number of forecasts served from last good;
- quote and source latency;
- reproducibility failures;
- job failure and recovery rate;
- quota consumption.

Stratify the scorecard by market, forecast horizon, season phase, favorite/total band, team, QB uncertainty, weather/roof, data-freshness state, and model-disagreement size. Treat small strata as descriptive, not promotion evidence.

### Loop 6 — preregistered research and promotion

**Purpose:** Turn surprises into testable hypotheses without letting the answer choose the test.

1. A diagnostic or football observation creates a hypothesis in the registry.
2. Before fitting, freeze source coverage, rows, baseline, transformation, primary metric, uncertainty method, and falsifier.
3. Fit only on the allowed past and evaluate with rolling-origin/prequential splits.
4. Run feature-family ablations and stability tests across seasons/eras.
5. Produce a shadow challenger with complete hashes and failure tests.
6. Apply the existing log-loss and calibration gate on identical rows.
7. Record promote/reject/defer, including negative results.
8. Structural promotion occurs only during offseason review; Tuesday in-season promotion is limited to coefficients under the frozen structure.

No metric is replaced after the result is known, and no rejected hypothesis disappears from the registry.

## Champion, challenger, and artifact contracts

### Model registry entry

```text
model_version
status: champion | challenger | rejected
code_hash
data_snapshot_hash
config_hash
feature_schema_hash
training_as_of
evaluation_rows_hash
metric_contract_version
calibration_artifact_hash
ensemble_seed_manifest
created_at / promoted_at
gate_decision
```

### Forecast artifact

```text
game_id / forecast_horizon / generated_at
model + data + config hashes
input maximum timestamps and freshness
scenario definitions, sources, weights, branch hashes
joint score probabilities or compressed deterministic artifact reference
derived team-score / ML / spread / total probabilities
market snapshot and exact contracts
book evaluations and translation warnings
uncertainty intervals
robust | fragile | indeterminate status
what-would-change-the-view thresholds
```

### Evaluation row

```text
forecast_id
frozen predicted distribution/probability
frozen market baseline
observed outcome and settlement rule
closing quote reference
eligibility and push flags
metric-contract version
correction lineage
```

## Human-judgment feedback without contamination

The product should support a separate human track:

1. Freeze the model-only distribution.
2. Let a person select an existing supported scenario or enter a bounded explicit adjustment with source, rationale, and timestamp.
3. Freeze the human-adjusted distribution before the game.
4. Score model-only and human-adjusted forecasts with the same proper rules.
5. Review categories where judgment helped, hurt, or merely followed the market.
6. Turn repeated patterns into research hypotheses; never feed the adjustments or their selected outcomes directly into model fitting.

This preserves the project's purpose: enhance judgment while measuring whether judgment adds information.

## Release and rollback gates

A champion or data change cannot reach the public forecast path unless:

- all inputs are point-in-time and license-compatible;
- probability reconciliation, leakage, stale-data, and deterministic replay tests pass;
- challenger metrics are computed on the same hashed rows as champion and market;
- the calibration gate passes;
- interval coverage and operational failure behavior are acceptable;
- the model and all artifacts are registered;
- a last-good champion and data snapshot remain available for rollback.

## First implementation sequence

1. Build the immutable point-in-time forecast/evaluation row contract.
2. Start the prospective odds, official-state, and weather-as-issued archives.
3. Reproduce SRS, QB-Elo, and market baselines.
4. Implement the shared distribution scoring and calibration harness.
5. Run the three-model score-distribution bake-off already accepted by ADR-0003.
6. Implement scenario branches and dossier status only after branch/state scoring exists.
7. Add player/unit and market-dynamics hypotheses one at a time in shadow.
8. Publish only forecast-time values and compact material conclusions; keep the research machinery in background artifacts.

