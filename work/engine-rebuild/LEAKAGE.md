# Source-to-forecast leakage checks

Six new integration tests pass; 98 related tests pass after the final changes. The previous turn made progress by repairing the live closeout reader. This increment addresses a distinct statistical-validation boundary. No production code, fit, setting, gate, active pointer, provider request or locked forecast changed.

## What ran

The synthetic sources contain 48 completed games with paired team statistics over 2014–2025. The real cutoff feature builder reconstructs football features and Elo. The common production/replay preparation, weight-only ridge refit and point scorer consume these rows. The test does not replace those numerical functions with mocks. The initial 2014 source history is warmup.

At each of ten outer-season boundaries, 2016–2025, current/future final scores and raw efficiency/pace statistics are changed separately and together: 30 source perturbations. The entire earlier fit, including training identity, means, scales, coefficients and intercept, stays identical. So do the target's prepared features, projected points, margin/total and contribution tables. Reversing the complete source-row/game order also preserves the full output. Changing an eligible past score and efficiency observation changes the fit and forecast, proving the fixture is connected to its sources.

The existing v3 chronological Study helper is exercised on source-built features with its existing settings. For each outer boundary, target/future source changes preserve earlier predictions, that season's selected setting, its first forecast's point values and calibration built from its own earlier out-of-fold residuals. The resulting distribution summary is identical. The first fold has no earlier residual history and stays explicitly missing; the test does not create a fictitious calibration. Changed future rows do alter later evaluation records, as expected.

A separate recorded-availability test captures a revision after issuance, advances the next cutoff and observes the new final/statistics revision in that later state. Re-preparing from the original state and reading/retrying its recorded forecast retains the original bytes and identity. A label inserted in the scoring input and a calibration table supplied through the unqualified historical path both fail closed.

## Scope and remaining evidence

These are synthetic integration tests and integrity assertions, not 2,639-game results, a new model candidate, an accuracy comparison or a promotion gate. The historical Study helper is not the live weekly refit policy; its successful test does not activate it. Its helper-level residual test does not supply the still-missing qualified own-lineage historical calibration adapter or warmup forecasts. The common path keeps its existing fixed method and penalty; no search is added to production.

Historical provider-vintage coverage, full real-data pipeline qualification, feature selection across a registered challenger, own-lineage calibration, prospective confirmation and actual reviewer decisions remain open. Requirement 10c remains PARTIAL. Durable capacity and unattended publication access remain separate operational dependencies. No claim of better future accuracy follows from this result.

Reproduce with OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p test_projection_full_pipeline_leakage.py. The final related-suite log and exact test SHA are retained in leakage-verification.json. Earlier successful, narrower runs are preserved as development evidence, not counted as additional independent replications.

Least certain: whether unrecorded historical source availability supports the assumptions used in retrospective evaluation; synthetic invariance cannot answer that question.

Confidence: high in the tested software-boundary claim, meaning it survives ten season-boundary scenarios, independent perturbation types, a positive control and recorded-revision checks. Lower to medium if an independent source mutation changes a forecast that should precede it. Confidence in complete historical leakage qualification remains medium and future predictive improvement remains unproved.
