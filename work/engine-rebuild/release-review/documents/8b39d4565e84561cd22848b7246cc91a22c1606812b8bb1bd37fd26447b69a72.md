REVIEW REQUESTED — Tier 2: the authorized early-history convention starts state initialization in 2011 and retained ridge training in 2012. Starting farther back is the alternative; these warmup choices do not extend the authoritative 2016–2025 control's training population.

REVIEW REQUESTED — Tier 2: extend the legacy adaptive donor with its existing cold-start rule. The 2013–2015 warmup folds have fewer than three earlier OOF seasons, so their donor forecasts are the raw football baseline. The alternative is qualifying additional earlier selection history. This prepares the first calibration pool; it does not qualify the later adaptive donor or final E-CAL comparison.

# Calibration-only forecast histories prepared

PREPARATION ONLY; no candidate accuracy comparison, probability fit, experiment gate, promotion or production change. The registered authoritative control remains the hash-pinned HFA series 66a3a60c… with registry date 2026-09-20T02:53:35.244810+00:00. Its file was verified before and after this run. This warmup is a separate historical reconstruction, not an alternative control.

The shipping residual table reproduces exactly from the v3 adaptive OOF rows, whose logical content hash is c7f3d226d91af3b8eb15483267c4751ac6fcde334c11f7a130179398dbc946f5. That identifies the legacy donor independently of filenames. It differs from the issuing HFA ridge method. The prepared history keeps those donor forecasts separate, sharing paired outcomes and corrected pregame baseline inputs.

| Calibration-only season | Games | Initial ridge training games | HFA fits including initial |
| --- | ---: | ---: | ---: |
| 2013 | 256 | 256 | 17 |
| 2014 | 256 | 512 | 17 |
| 2015 | 256 | 768 | 17 |

The HFA method retains [calibration, elo], decay none and penalty 10. Pregame rows come from the already-verified common cutoff builder. Refitting and point scoring call the shared production/replay functions. The frozen hourly-catch-up policy runs against assumed historical availability, with a ten-minute fit-availability allowance; no forecast uses its own label or an unavailable fit. There were no waiting dispatches in this three-season reconstruction. No uncertainty distribution was attached.

## Verification

The independent checker reconstructs every fit's training membership and recomputes all 51 ridge fits with augmented least squares, rather than the engine's normal-equation solver. It verifies all 768 paired forecasts and 64,422 team training memberships. Largest fit-parameter difference: 1.28e-13; largest point-prediction difference: 2.84e-14, both below the declared 1e-10 arithmetic check tolerance. Gate point-invariance tolerance remains the separate 1e-12 value; no gate was run here.

Complete reversal of feature and schedule input lists leaves every saved fit and forecast identical. Replacing all 2015 labels leaves 2013–2014 fits and forecasts unchanged. Increasing eligible 2012 labels changes all 256 2013 HFA forecasts, verifying that the negative leakage check is not passing because the model ignores labels. These perturbations hold pregame features fixed; they complement the earlier source-to-feature checks and do not prove historical provider availability. Legacy donor points are checked exactly against their baseline features; actual scores match the pinned schedule.

Reproduction: `prepare_early_forecasts.py`, followed by `verify_early_forecasts.py`, using pinned Python with OPENBLAS_NUM_THREADS=1 and OMP_NUM_THREADS=1. Generation took 5.06 seconds and 205,701,120 peak RSS bytes; independent arithmetic plus three reruns took 15.25 seconds. No paid API calls, new dependencies or host writes.

Artifact SHA256: `4222f29cde17fc765fe4370404205589d8df0b9205cfd00b6b00d5dc97c51129`. The compressed artifact includes full forecasts, fits, training game IDs, source/plan/code hashes and explicit assumptions. Details are in early-forecasts-verification.json and early-forecasts-independent-check.json; logs are retained. The generation receipt intentionally stays labeled as awaiting independent verification; the separate PASS receipt supplies that verification without rewriting the original receipt.

## Remaining work

Resolve the disclosed warmup choices in the review packet. Qualify the complete later residual-donor series and the historical calibration adapter, verify the corrected control's authority and publication prerequisites, then preregister and evaluate E-CAL under its CRPS/coverage/interval-score gate. Do not splice these extra training years into the authoritative control's point fits. Existing capacity, unattended public access, real reviews and observed-live-cycle requirements remain open. No empirical accuracy improvement is claimed, and the full goal remains ACTIVE.

Host/deploy: unchanged. Spending: zero. Least certain: the cold-start warmup's compatibility with the eventual complete historical calibration replay; it is explicitly review-requested rather than silently treated as settled.

Confidence: near-total in the reconstructed fit and prediction arithmetic, meaning independent recomputation on verified rows. Lower to high on a mismatch in that recomputation. Confidence in experiment readiness remains medium: verified source evidence exists, but the disclosed warmup conventions and control migration could reasonably differ; lower to low if either prevents a compatible historical replay.
